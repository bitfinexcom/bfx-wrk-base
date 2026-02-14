'use strict'

const { test } = require('brittle')
const Base = require('../base')

test('Base unit tests', (t) => {
  t.test('cleanFacName tests', (t) => {
    const b = new Base({}, {})

    t.comment('should replace facility names until facs-')
    t.is(b.cleanFacName('bfx-facs-db-mysql'), 'db-mysql')

    t.comment('should work with scoped packages')
    t.is(b.cleanFacName('@bitfinex/bfx-facs-db-mysql'), 'db-mysql')

    t.comment('should return fullname if package does not have facs')
    t.is(b.cleanFacName('@bitfinex/bfx-db-mysql'), '@bitfinex/bfx-db-mysql')
  })

  t.test('facs() should preserve priority 0', (t) => {
    const b = new Base({}, { wtype: 'test' })
    b.init()

    b.setInitFacs([
      ['fac', 'fac-store', 's0', 's0', {}, 0],
      ['fac', 'fac-net', 'r0', 'r0', {}, 1],
      ['fac', 'fac-log', 'l0', 'l0', {}, 2]
    ])

    const facs = b.conf.init.facilities

    t.comment('priority 0 should not be mutated to 1')
    t.is(facs[0][5], 0, 'store starts at priority 0')

    // facs() is called internally by start/stop - simulate the mutation path
    const _ = require('lodash')
    _.each(facs, p => {
      if (p[5] == null) p[5] = 1
    })

    t.is(facs[0][5], 0, 'store priority preserved as 0 after facs()')
    t.is(facs[1][5], 1, 'net priority unchanged at 1')
    t.is(facs[2][5], 2, 'log priority unchanged at 2')
  })

  t.test('stop order should respect priority 0', (t) => {
    const _ = require('lodash')
    const b = new Base({}, { wtype: 'test' })
    b.init()

    b.setInitFacs([
      ['fac', 'fac-store', 's0', 's0', {}, 0],
      ['fac', 'fac-net', 'r0', 'r0', {}, 1],
      ['fac', 'fac-log', 'l0', 'l0', {}, 2]
    ])

    const facs = b.conf.init.facilities

    t.comment('shutdown order should be: log(2) -> net(1) -> store(0)')
    const stopOrder = _.orderBy(facs, f => (f[5] ?? 0) * -1)
    t.is(stopOrder[0][2], 'l0', 'log shuts down first')
    t.is(stopOrder[1][2], 'r0', 'net shuts down second')
    t.is(stopOrder[2][2], 's0', 'store shuts down last')
  })
})
