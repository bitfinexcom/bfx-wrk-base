'use strict'

/* eslint-env mocha */

const assert = require('assert')
const WrkBase = require('../base')
const sinon = require('sinon')

describe('loadConf', () => {
  beforeEach(() => {
    sinon.stub(process, 'exit')
  })

  afterEach(() => {
    process.exit.restore()
  })

  it('should exit when config keys do not match example config keys', () => {
    const workerBase = new WrkBase({}, { root: __dirname })
    workerBase.loadConf('missing-keys.coin', 'coin')
    assert.ok(process.exit.calledOnceWithExactly(1))
  })

  it('should exit when config keys do not match example nested config keys', () => {
    const workerBase = new WrkBase({}, { root: __dirname })
    workerBase.loadConf('missing-nested-keys.coin', 'coin')
    assert.ok(process.exit.called)
    assert.ok(process.exit.calledWith(1))
  })

  it('should exit if required value is missing', () => {
    const workerBase = new WrkBase({}, { root: __dirname })
    workerBase.loadConf('missing-values.coin', 'coin', { 'symbol': { required: true } })
    assert.equal(process.exit.called, true)
    assert.equal(process.exit.calledWith(1), true)
  })

  it('should exit if cfg value not equal example value', () => {
    const workerBase = new WrkBase({}, { root: __dirname })
    workerBase.loadConf('value-mismatch.coin', 'coin', { 'sweepKeep': { sameAsExample: true } })
    assert.equal(process.exit.called, true)
    assert.equal(process.exit.calledWith(1), true)
  })

  it('should exit if nested cfg value not equal nested example value', () => {
    const workerBase = new WrkBase({}, { root: __dirname })
    workerBase.loadConf('nested-value-mismatch.coin', 'coin', { 'root.lvl2.lvl3.value': { sameAsExample: true } })
    assert.equal(process.exit.called, true)
    assert.equal(process.exit.calledWith(1), true)
  })

  it('should not exit when config keys match example config keys', () => {
    const workerBase = new WrkBase({}, { root: __dirname })
    workerBase.loadConf('valid.coin', 'coin', { 'root.lvl2.lvl3.value': { sameAsExample: true, required: true } })
    assert.equal(process.exit.called, false)
    assert.equal(process.exit.calledWith(1), false)
  })
})
