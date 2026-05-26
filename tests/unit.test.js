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
})

test('stop continues when lockProcessing does not clear', async (t) => {
  const dir = await setupDir(t)
  const base = createBase(dir)
  let stopCalled = false
  let warning = null

  base.init()
  base.lockProcessing = true
  base.stopLockProcessingInterval = 1
  base.stopLockProcessingTimeout = 5
  base.logger = {
    warn: msg => {
      warning = msg
    }
  }
  base._stop = cb => {
    stopCalled = true
    cb()
  }

  await new Promise((resolve, reject) => {
    base.stop(err => {
      if (err) return reject(err)
      resolve()
    })
  })

  t.is(stopCalled, true)
  t.is(base.active, 0)
  t.ok(warning.includes('lockProcessing remained set'))
})
