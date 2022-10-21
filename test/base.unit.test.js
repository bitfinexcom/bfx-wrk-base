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

  it('should exit with code `1` when config does not match example config', () => {
    const workerBase = new WrkBase({}, { root: __dirname })

    workerBase.loadConf('incorrect.coin', 'coin')
    assert.ok(process.exit.called)
    assert.ok(process.exit.calledWith(1))
  })

  it('should not exit when config matches example config', () => {
    const workerBase = new WrkBase({}, { root: __dirname })

    workerBase.loadConf('correct.coin', 'coin')
    assert.equal(process.exit.called, false)
    assert.equal(process.exit.calledWith(1), false)
  })
})
