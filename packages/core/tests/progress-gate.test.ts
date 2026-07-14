import assert from 'node:assert/strict'
import {it} from 'node:test'
import {createProgressGate} from '../src/progress-gate.ts'

it('emits immediately on first check', () => {
  const clock = 1000
  const gate = createProgressGate(150, () => clock)
  assert.equal(gate.shouldEmit(), true)
})

it('suppresses checks inside the interval and reopens after it', () => {
  let clock = 1000
  const gate = createProgressGate(150, () => clock)
  gate.shouldEmit()

  clock = 1100
  assert.equal(gate.shouldEmit(), false)

  clock = 1150
  assert.equal(gate.shouldEmit(), true)

  clock = 1200
  assert.equal(gate.shouldEmit(), false)
})

it('interval of zero lets every chunk through', () => {
  const clock = 1000
  const gate = createProgressGate(0, () => clock)
  assert.equal(gate.shouldEmit(), true)
  assert.equal(gate.shouldEmit(), true)
})
