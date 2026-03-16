import { describe, it, expect } from 'vitest'
import { clampFinite, guardPositive } from '../../shared/numeric'

describe('clampFinite', () => {
  it('clamps within range', () => {
    expect(clampFinite(5, 0, 10, 0)).toBe(5)
  })

  it('clamps below min', () => {
    expect(clampFinite(-1, 0, 10, 5)).toBe(0)
  })

  it('clamps above max', () => {
    expect(clampFinite(15, 0, 10, 5)).toBe(10)
  })

  it('returns fallback for NaN', () => {
    expect(clampFinite(NaN, 0, 10, 5)).toBe(5)
  })

  it('returns fallback for Infinity', () => {
    expect(clampFinite(Infinity, 0, 10, 5)).toBe(5)
  })

  it('returns fallback for -Infinity', () => {
    expect(clampFinite(-Infinity, 0, 10, 5)).toBe(5)
  })

  it('handles value at lower boundary', () => {
    expect(clampFinite(0, 0, 10, 5)).toBe(0)
  })

  it('handles value at upper boundary', () => {
    expect(clampFinite(10, 0, 10, 5)).toBe(10)
  })
})

describe('guardPositive', () => {
  it('returns valid positive value', () => {
    expect(guardPositive(5, 'fps')).toBe(5)
  })

  it('throws for zero', () => {
    expect(() => guardPositive(0, 'fps')).toThrow(RangeError)
  })

  it('throws for negative', () => {
    expect(() => guardPositive(-1, 'rate')).toThrow(RangeError)
  })

  it('throws for NaN', () => {
    expect(() => guardPositive(NaN, 'fps')).toThrow(RangeError)
  })

  it('throws for Infinity', () => {
    expect(() => guardPositive(Infinity, 'fps')).toThrow(RangeError)
  })

  it('includes name in error message', () => {
    expect(() => guardPositive(0, 'myParam')).toThrow('myParam')
  })
})
