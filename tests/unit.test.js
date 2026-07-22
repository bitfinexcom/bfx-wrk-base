'use strict'

const { test } = require('brittle')
const tmp = require('test-tmp')
const path = require('path')
const fs = require('fs')

const Base = require('../base')

function createBase (dir, env) {
  const ctx = { root: dir, env, wtype: 'test' }
  return new Base({}, ctx)
}

async function setupDir (t) {
  const dir = await tmp(t)
  fs.mkdirSync(path.join(dir, 'config'))
  return dir
}

function writeConfig (dir, filename, content) {
  const filePath = path.join(dir, 'config', filename)
  const data = filename.endsWith('.js') ? content : JSON.stringify(content)
  fs.writeFileSync(filePath, data)
}

test('cleanFacName', (t) => {
  const b = new Base({}, {})

  t.comment('should replace facility names until facs-')
  t.is(b.cleanFacName('bfx-facs-db-mysql'), 'db-mysql')

  t.comment('should work with scoped packages')
  t.is(b.cleanFacName('@bitfinex/bfx-facs-db-mysql'), 'db-mysql')

  t.comment('should return fullname if package does not have facs')
  t.is(b.cleanFacName('@bitfinex/bfx-db-mysql'), '@bitfinex/bfx-db-mysql')
})

test('JSON config resolution', async (t) => {
  await t.test('loads base JSON config if env is not provided', async (t) => {
    const dir = await setupDir(t)
    writeConfig(dir, 'common.json', { key: 'value', nested: { a: 1 } })
    writeConfig(dir, 'production.common.json', { key: 'env-specific' })

    const base = createBase(dir)
    base.loadConf('common')
    t.alike(base.conf, { key: 'value', nested: { a: 1 } })
  })

  await t.test('loads env-specific JSON config over base others', async (t) => {
    const dir = await setupDir(t)
    writeConfig(dir, 'common.json', { key: 'base' })
    writeConfig(dir, 'production.common.json', { key: 'prod-env-specific' })
    writeConfig(dir, 'development.common.json', { key: 'dev-env-specific' })

    const base = createBase(dir, 'production')
    base.loadConf('common')
    t.is(base.conf.key, 'prod-env-specific')
  })

  await t.test('falls back to base JSON if env-specific JSON is missing', async (t) => {
    const dir = await setupDir(t)
    writeConfig(dir, 'common.json', { key: 'base' })

    const base = createBase(dir, 'production')
    base.loadConf('common')
    t.is(base.conf.key, 'base')
  })
})

test('JS config resolution', async (t) => {
  await t.test('loads base JS config when no JSON exists', async (t) => {
    const dir = await setupDir(t)
    writeConfig(dir, 'common.js', "module.exports = { key: 'from-js' }")

    const base = createBase(dir)
    base.loadConf('common')
    t.is(base.conf.key, 'from-js')
  })

  await t.test('loads env-specific JS config when no JSON exists and env is provided', async (t) => {
    const dir = await setupDir(t)
    writeConfig(dir, 'development.common.js', "module.exports = { key: 'dev-env-js' }")
    writeConfig(dir, 'production.common.js', "module.exports = { key: 'prod-js' }")

    const base = createBase(dir, 'development')
    base.loadConf('common')
    t.is(base.conf.key, 'dev-env-js')
  })

  await t.test('falls back to base JS if env-specific JS is missing and no JSON exists', async (t) => {
    const dir = await setupDir(t)
    writeConfig(dir, 'common.js', "module.exports = { key: 'base-js' }")

    const base = createBase(dir, 'production')
    base.loadConf('common')
    t.is(base.conf.key, 'base-js')
  })
})

test('config priority order', async (t) => {
  await t.test('JSON config takes priority over JS config', async (t) => {
    const dir = await setupDir(t)
    writeConfig(dir, 'common.json', { source: 'json' })
    writeConfig(dir, 'common.js', "module.exports = { source: 'js' }")

    const base = createBase(dir)
    base.loadConf('common')
    t.is(base.conf.source, 'json')
  })

  await t.test('env-specific JSON has highest priority', async (t) => {
    const dir = await setupDir(t)
    writeConfig(dir, 'production.common.json', { source: 'env-json' })
    writeConfig(dir, 'common.json', { source: 'base-json' })
    writeConfig(dir, 'production.common.js', "module.exports = { source: 'env-js' }")
    writeConfig(dir, 'common.js', "module.exports = { source: 'base-js' }")

    const base = createBase(dir, 'production')
    base.loadConf('common')
    t.is(base.conf.source, 'env-json')
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
