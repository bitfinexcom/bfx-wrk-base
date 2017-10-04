'use strict'

const fs = require('fs')
const _ = require('lodash')
const async = require('async')

class Base {
  constructor (conf, ctx) {
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

    this.setInitFacs([
      ['fac', 'intervals', '0', '0', {}, -10]
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

  loadConf (c, n = null) {
    _.merge(
      this.conf,
      this.getConf(this.ctx.env, n, `${this.ctx.root}/config/${c}.json`)
    )
  }

  facility (type, name, ns, opts) {
    let Fmod = null
    let rdir = 'facilities'

    try {
      Fmod = require(`${this.ctx.root}/${rdir}/${name}.js`)
    } catch (e) {
      console.log(e)
    }

    if (!Fmod) {
      return null
    }

    return (new Fmod(this, _.extend({ ns: ns }, opts), _.pick(this.ctx, ['env'])))
  }

  nameFac (name) {
    return _.camelCase(_.uniq(_.snakeCase(name).split('_')))
  }

  addFac (type, name, ns, label, opts, prio = 0, cb) {
    const fns = `${this.nameFac(name)}_${label}`
    if (this[fns]) {
      return cb(new Error(`ERR_FACILITY_DUP`))
    }

    if (_.isFunction(opts)) {
      opts = opts()
    }

    opts.label = label
    opts.root = this.ctx.root

    const fac = this.facility(type, name, ns, opts)

    this[fns] = fac
    fac.start(cb)
  }

  delFac (name, label, cb) {
    const fns = `${this.nameFac(name)}_${label}`
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
    try {
      fs.writeFile(
        `${this.ctx.root}/status/${this.prefix}.json`,
        JSON.stringify(this.status), () => {}
      )
    } catch (e) {
      console.error(e)
    }
  }

  start (cb) {
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

    async.series(aseries, cb)
  }

  _start0 (cb) { cb() }
  _start (cb) { cb() }

  stop (cb) {
    const aseries = []

    aseries.push(next => {
      this._stop(next)
    })

    aseries.push(next => {
      let facs = this.conf.init.facilities
      facs = _.orderBy(facs, f => {
        return (f[5] || 0) * -1
      })

      this.facs('delFac', _.map(facs, f => {
        return [f[1], f[3]]
      }), next)
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
