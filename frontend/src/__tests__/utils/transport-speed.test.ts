/**
 * Transport speed state machine tests (Phase 12).
 * Tests J/K/L NLE-style transport speed escalation.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  transportForward,
  transportReverse,
  transportStop,
  resetTransportSpeed,
  getTransportSpeed,
  getTransportDirection,
  getTransportSpeedLevel,
} from '../../renderer/utils/transport-speed'

beforeEach(() => {
  resetTransportSpeed()
})

describe('transportForward (L key)', () => {
  it('starts at 1x forward', () => {
    expect(transportForward()).toBe(1)
    expect(getTransportDirection()).toBe('forward')
    expect(getTransportSpeedLevel()).toBe(1)
  })

  it('escalates: 1x → 2x → 4x → 8x', () => {
    transportForward() // 1x
    expect(transportForward()).toBe(2)
    expect(transportForward()).toBe(4)
    expect(transportForward()).toBe(8)
  })

  it('caps at 8x', () => {
    transportForward() // 1x
    transportForward() // 2x
    transportForward() // 4x
    transportForward() // 8x
    expect(transportForward()).toBe(8) // still 8x
  })

  it('resets to 1x when switching from reverse', () => {
    transportReverse() // -1x
    expect(transportForward()).toBe(1) // not -1x → 1x, not continuing reverse
  })
})

describe('transportReverse (J key)', () => {
  it('starts at -1x reverse', () => {
    expect(transportReverse()).toBe(-1)
    expect(getTransportDirection()).toBe('reverse')
  })

  it('escalates: -1x → -2x → -4x → -8x', () => {
    transportReverse()
    expect(transportReverse()).toBe(-2)
    expect(transportReverse()).toBe(-4)
    expect(transportReverse()).toBe(-8)
  })

  it('caps at -8x', () => {
    for (let i = 0; i < 10; i++) transportReverse()
    expect(getTransportSpeed()).toBe(-8)
  })

  it('resets to -1x when switching from forward', () => {
    transportForward() // 1x
    transportForward() // 2x
    expect(transportReverse()).toBe(-1) // resets
  })
})

describe('transportStop (K key)', () => {
  it('stops from forward', () => {
    transportForward()
    expect(transportStop()).toBe(0)
    expect(getTransportDirection()).toBe('stopped')
    expect(getTransportSpeedLevel()).toBe(0)
  })

  it('stops from reverse', () => {
    transportReverse()
    expect(transportStop()).toBe(0)
    expect(getTransportDirection()).toBe('stopped')
  })

  it('is idempotent when already stopped', () => {
    expect(transportStop()).toBe(0)
    expect(transportStop()).toBe(0)
  })
})

describe('direction changes', () => {
  it('forward → stop → reverse starts at -1x', () => {
    transportForward()
    transportForward() // 2x
    transportStop()
    expect(transportReverse()).toBe(-1)
  })

  it('forward → reverse directly resets speed', () => {
    transportForward()
    transportForward() // 2x
    transportForward() // 4x
    expect(transportReverse()).toBe(-1) // resets to -1x, not -4x
  })
})
