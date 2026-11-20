import { describe, expect, it } from 'vitest'
import { AdaptiveNoiseGate } from './adaptive-noise-gate'

function sampleFor(gate: AdaptiveNoiseGate, level: number, duration: number) {
  let active = false
  for (let elapsed = 0; elapsed < duration; elapsed += 50) active = gate.sample(level)
  return active
}

describe('adaptive microphone amplitude gate', () => {
  it('learns steady ambient noise above the previous fixed threshold', () => {
    const gate = new AdaptiveNoiseGate()
    expect(sampleFor(gate, 0.012, 5000)).toBe(false)
    expect(sampleFor(gate, 0.025, 2000)).toBe(false)
    expect(sampleFor(gate, 0.06, 150)).toBe(true)
  })

  it('accepts immediate speech without a calibration interval or learning speech as ambient', () => {
    const gate = new AdaptiveNoiseGate()
    expect(sampleFor(gate, 0.03, 100)).toBe(false)
    expect(gate.sample(0.03)).toBe(true)
    expect(sampleFor(gate, 0.03, 10000)).toBe(true)
    expect(sampleFor(gate, 0.025, 1000)).toBe(true)
  })

  it('accepts quieter speech after quiet ambient levels settle', () => {
    const gate = new AdaptiveNoiseGate()
    sampleFor(gate, 0.001, 2000)
    expect(sampleFor(gate, 0.009, 150)).toBe(true)
  })

  it('rejects short impulses and requires sustained quiet to release', () => {
    const gate = new AdaptiveNoiseGate()
    sampleFor(gate, 0.001, 2000)
    for (let click = 0; click < 20; click++) {
      expect(gate.sample(0.2)).toBe(false)
      expect(sampleFor(gate, 0.001, 200)).toBe(false)
    }
    expect(sampleFor(gate, 0.03, 150)).toBe(true)
    expect(sampleFor(gate, 0.001, 200)).toBe(true)
    expect(gate.sample(0.001)).toBe(false)
  })

  it('does not treat one delayed sample as sustained activity', () => {
    const gate = new AdaptiveNoiseGate()
    expect(gate.sample(0.1, 10000)).toBe(false)
    expect(gate.sample(0.1, 50)).toBe(true)
  })

  it('learns ambient noise after immediate speech without an initial quiet calibration', () => {
    const gate = new AdaptiveNoiseGate()
    expect(sampleFor(gate, 0.03, 1000)).toBe(true)
    expect(sampleFor(gate, 0.012, 2000)).toBe(false)
    expect(sampleFor(gate, 0.06, 150)).toBe(true)
  })

  it('does not let a loud spike make ongoing speech count as ambient noise', () => {
    const gate = new AdaptiveNoiseGate()
    expect(sampleFor(gate, 0.03, 1000)).toBe(true)
    gate.sample(0.2)
    expect(sampleFor(gate, 0.025, 5000)).toBe(true)
  })
})
