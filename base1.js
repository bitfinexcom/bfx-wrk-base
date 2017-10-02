'use strict'

const Base0 = require('./base0')

class Base1 extends Base0 {
  addFac (type, name, ns, label, opts, cb) {
    opts.dirConf = `${opts.root}/config/facs`
    super.addFac(type, name, ns, label, opts, cb)
  }
}

module.exports = Base1
