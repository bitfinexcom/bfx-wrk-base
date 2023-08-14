'use strict'

const fs = require('fs')
const { join } = require('path')
const _ = require('lodash')
const async = require('async')
const EventEmitter = require('events')

class Base extends EventEmitter {
  constructor (conf, ctx) {
    super()

    this.conf = conf
    this.ctx = ctx
    this.wtype = ctx.wtype
    this.prefix = this.wtype
  }

  init () {
    this.status = {}

    this.conf.init = {
      facilities: []
    }

    this.mem = {}

    this.loadStatus()
  }

  getConf (env, type, path) {
    const conf = JSON.parse(fs.readFileSync(path, 'utf8'))
    if (!_.isObject(conf)) {
      return {}
    }

    let res = {}

    if (type) {
      _.set(res, type, conf[env] ? conf[env] : conf)
    } else {
      res = conf
    }

    return res
  }

  loadConf (c, group = null) {
    const fprefix = this.ctx.env
    const dirname = join(this.ctx.root, 'config')

    let confPath = join(dirname, `${c}.json`)
    const envConfPath = join(dirname, `${fprefix}.${c}.json`)
    if (fprefix && fs.existsSync(envConfPath)) {
      confPath = envConfPath
    }

    _.merge(this.conf, this.getConf(this.ctx.env, group, confPath))

    this.group = group
  }

  cleanFacName (name) {
    return name.replace(/[a-z-]*facs-/, '')
  }

  facility (type, name, ns, opts) {
    let [Fmod, path] = [null, null]

    path = name
    name = this.cleanFacName(name)

    try {
      Fmod = require(path)
    } catch (e) {
      console.log(e)
    }

    if (!Fmod) {
      return null
    }

    const fac = (new Fmod(this, _.extend({ ns }, opts), _.pick(this.ctx, ['env'])))
    fac.__name = name

    return fac
  }

  getFacNs (name, label) {
    return `${_.camelCase(name)}_${label}`
  }

  addFac (type, name, ns, label, opts, prio = 0, cb) {
    if (_.isFunction(ns)) {
      ns = ns(name, ns, label)
    }

    if (_.isFunction(opts)) {
      try {
        opts = opts()
      } catch (error) {
        const sep = '──────────────────────────────────────────────────────'
        const feedbackMsg = [
          `┌${sep}`,
          `│ Error starting facility ${name}`,
          `├${sep}`,
          '│ The following error happened calling opts().',
          `│ Error: ${error.message}.`,
          '│ Possible issues and ways to solve:',
          '│ - This facility depends on another facility and is not ready when calling opts().',
          `│   Review this facility priority (current = ${prio}) when calling setInitFacs() on the 5th argument.`,
          `└${sep}`
        ]
        console.error(['', ...feedbackMsg, ''].join('\n'))
        throw error
      }
    }

    opts.label = label
    opts.root = this.ctx.root

    const fac = this.facility(type, name, ns, opts)
    if (!fac) {
      return cb(new Error('ERR_FAC_LOAD'))
    }

    name = fac.__name
    const fns = this.getFacNs(name, label)
    if (this[fns]) {
      throw new Error(`Namespace conflict: fns ${fns}`)
    }

    this[fns] = fac
    fac.start(cb)
  }

  delFac (type, name, ns, label, opts, prio = 0, cb) {
    name = this.cleanFacName(name)
    const fns = this.getFacNs(name, label)
    const fac = this[fns]

    if (!fac) return cb()

    delete this[fns]
    fac.stop(cb)
  }

  facs (dir, list, cb) {
    const aseries = []

    _.each(list, p => {
      if (!p[5]) p[5] = 1

      aseries.push(next => {
        this[dir].apply(this, p.concat([next]))
      })
    })

    async.series(aseries, cb)
  }

  /**
   * @typedef {Array} Facilities
   * @property {String} 0 - type of facility
   * @property {String} 1 - name
   * @property {String} 2 - namespace
   * @property {String} 3 - label
   * @property {Object|Function} 4 - options that will vary depending on the facility. It can be a function that will have the worker as context (this)
   * @property {Number} 5 - priority
   * @param {Array<Facilities>} facs
   */
  setInitFacs (facs) {
    this.conf.init.facilities.push.apply(
      this.conf.init.facilities, facs
    )
  }

  loadStatus () {
    try {
      const status = JSON.parse(fs.readFileSync(
        `${this.ctx.root}/status/${this.prefix}.json`, 'UTF-8')
      )
      _.extend(this.status, _.isObject(status) ? status : {})
    } catch (e) {}
  }

  saveStatus () {
    const dir = `${this.ctx.root}/status`

    try {
      fs.writeFileSync(
        `${dir}/${this.prefix}.json`,
        JSON.stringify(this.status)
      )
    } catch (e) {
      if (e.code === 'ENOENT') {
        fs.mkdirSync(dir)
        console.log(`saveStatus(): no status directory found. created status directory ${dir}`)
        this.saveStatus()
        return
      }

      console.error(e)
    }
  }

  start (cb = () => {}) {
    const aseries = []

    aseries.push(next => {
      let facs = this.conf.init.facilities

      facs = _.orderBy(facs, f => {
        return f[5] || 0
      })

      this.facs('addFac', facs, (err) => {
        // crash early to avoid silent fails in facilities
        if (err) {
          console.trace()
          throw err
        }
        next()
      })
    })

    aseries.push(next => {
      this._start0(next)
    })

    aseries.push(next => {
      this.active = 1
      next()
    })

    aseries.push(next => {
      this._start(next)
    })

    async.series(aseries, (err) => {
      if (err) {
        console.trace()
        throw err
      }

      process.nextTick(() => {
        this.emit('started')
        cb()
      })
    })
  }

  _start0 (cb) { cb() }
  _start (cb) { cb() }

  stop (cb) {
    this.stopping = true

    const aseries = []

    aseries.push(next => {
      const itv = setInterval(() => {
        if (this.lockProcessing) {
          return
        }
        clearInterval(itv)
        next()
      }, 250)
    })

    aseries.push(next => {
      this._stop(next)
    })

    aseries.push(next => {
      let facs = this.conf.init.facilities
      facs = _.orderBy(facs, f => {
        return (f[5] || 0) * -1
      })

      this.facs('delFac', facs, next)
    })

    aseries.push(next => {
      this.active = 0
      next()
    })

    aseries.push(next => {
      this._stop9(next)
    })

    async.series(aseries, cb)
  }

  _stop (cb) { cb() }
  _stop9 (cb) { cb() }

  getPluginCtx () {
    return {}
  }
}

module.exports = Base
