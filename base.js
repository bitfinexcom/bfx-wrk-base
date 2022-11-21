'use strict'

const fs = require('fs')
const { join } = require('path')
const _ = require('lodash')
const async = require('async')
const EventEmitter = require('events')

const extractObjectKeys = (obj, keys = []) => {
  for (const key in obj) {
    keys.push(key)
    if (_.isObject(obj[key]) && !_.isArray(obj[key])) {
      extractObjectKeys(obj[key], keys)
    }
  }
  return keys
}

const printOutput = (title, content) => {
  console.log(`
    ###############################################
    # ${title}
    ###############################################
    #
    # ${content}
    #
    ###############################################
  `)
}

class Base extends EventEmitter {
  constructor (conf, ctx) {
    super()

    this.conf = conf
    this.ctx = ctx
    this.wtype = ctx.wtype
    this.prefix = this.wtype
  }

  init () {
    if (this.conf) {
      if (this.conf.skipCertCheck) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0
      }
    }

    this.status = {}

    this.conf.init = {
      facilities: []
    }

    this.mem = {}

    this.loadStatus()

    this.setInitFacs([
      ['fac', 'bfx-facs-interval', '0', '0', {}, -10]
    ])
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

  loadConf (c, group = null, validation = null) {
    const fprefix = this.ctx.env
    const dirname = join(this.ctx.root, 'config')

    let confPath = join(dirname, `${c}.json`)
    const envConfPath = join(dirname, `${fprefix}.${c}.json`)
    if (fprefix && fs.existsSync(envConfPath)) {
      confPath = envConfPath
    }

    const exampleConfigPath = `${confPath}.example`
    const config = this.getConf(this.ctx.env, group, confPath)

    if (fs.existsSync(exampleConfigPath)) {
      const exampleConfig = this.getConf(this.ctx.env, group, exampleConfigPath)
      const groupedExampleCfg = _.get(exampleConfig, group, exampleConfig)
      const srcCfgKeys = extractObjectKeys(groupedExampleCfg)

      const groupedCfg = _.get(config, group, config)
      const destCfgKeys = extractObjectKeys(groupedCfg)

      const missingKeys = _.difference(srcCfgKeys, destCfgKeys)

      if (missingKeys.length) {
        printOutput('CONFIG MISSING KEY/VALUE FROM CONFIG.EXAMPLE', `[${missingKeys}] missing in ${confPath}`)
        process.exit(1)
      }

      if (validation) {
        for (const key in validation) {
          const check = validation[key]
          if (check.required) {
            const val = _.get(groupedCfg, key)
            if (_.isNil(val) || (_.isString(val) && _.isEmpty(val))) {
              printOutput('CONFIG MISSING MANDATORY VALUE', `['${key}'] missing value`)
              process.exit(1)
            }
          }

          if (check.sameAsExample) {
            const cfgValue = _.get(groupedCfg, key)
            const exampleCfgValue = _.get(groupedExampleCfg, key)

            if (!_.isEqual(cfgValue, exampleCfgValue)) {
              printOutput('CONFIG VALUE MISMATCH', `config['${key}']:[${cfgValue}] !== exampleConfig['${key}']:[${exampleCfgValue}]`)
              process.exit(1)
            }
          }
        }
      }
    }

    _.merge(this.conf, config)

    // e.g. util, coin or ext (i.e. derived from bfx-util-js)
    this.group = group
  }

  cleanFacName (name) {
    return name.replace('bfx-facs-', '')
  }

  facility (type, name, ns, opts) {
    let [Fmod, path] = [null, null]

    if (name.indexOf('bfx-facs-') === 0) {
      path = name
      name = this.cleanFacName(name)
    } else {
      const rdir = 'facilities'
      path = `${this.ctx.root}/${rdir}/${name}.js`
    }

    try {
      Fmod = require(path)
    } catch (e) {
      console.log(e)
    }

    if (!Fmod) {
      return null
    }

    const fac = (new Fmod(this, _.extend({ ns: ns }, opts), _.pick(this.ctx, ['env'])))
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
      opts = opts()
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
      if (err) return cb(err)

      process.nextTick(() => {
        this.emit('started')
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
