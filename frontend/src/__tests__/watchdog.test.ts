import { describe, it, expect } from 'vitest'
import { MissCounter } from '../main/utils'

describe('MissCounter', () => {
  it('does not trigger before reaching max misses', () => {
    const counter = new MissCounter(3)
    expect(counter.miss()).toBe(false) // 1
    expect(counter.miss()).toBe(false) // 2
  })

  it('triggers restart at exactly max misses', () => {
    const counter = new MissCounter(3)
    counter.miss() // 1
    counter.miss() // 2
    expect(counter.miss()).toBe(true) // 3 → trigger
  })

  it('resets count on hit', () => {
    const counter = new MissCounter(3)
    counter.miss() // 1
    counter.miss() // 2
    counter.hit() // reset
    expect(counter.miss()).toBe(false) // back to 1
    expect(counter.miss()).toBe(false) // 2
    expect(counter.miss()).toBe(true) // 3 → trigger
  })

  it('tracks current miss count', () => {
    const counter = new MissCounter(3)
    expect(counter.current).toBe(0)
    counter.miss()
    expect(counter.current).toBe(1)
    counter.miss()
    expect(counter.current).toBe(2)
    counter.hit()
    expect(counter.current).toBe(0)
  })

  it('reset explicitly clears count', () => {
    const counter = new MissCounter(3)
    counter.miss()
    counter.miss()
    counter.reset()
    expect(counter.current).toBe(0)
    expect(counter.miss()).toBe(false)
  })
})
