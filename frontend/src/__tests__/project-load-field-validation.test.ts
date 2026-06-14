/**
 * P6.6 — project-load field-param validator tests (trust boundary).
 *
 * Covers (named in packet TEST PLAN):
 *   - malformed field dict dropped to default (negative)
 *   - out-of-range gain clamped on load (negative)
 *
 * The load path (project-persistence.ts) runs validateFieldRefOnLoad on each
 * param value; valid → clamped, malformed → null (param omitted → default).
 */
import { describe, it, expect } from 'vitest'
import {
  validateFieldRefOnLoad,
  isFieldRef,
  FIELD_GAIN_MIN,
  FIELD_GAIN_MAX,
} from '../shared/field-param'

describe('validateFieldRefOnLoad', () => {
  it('accepts a well-formed field dict unchanged', () => {
    const v = { __field__: { kind: 'image', source_id: 'a1', gain: 1.5, invert: true } }
    const out = validateFieldRefOnLoad(v)
    expect(out).not.toBeNull()
    expect(out!.__field__).toEqual({ kind: 'image', source_id: 'a1', gain: 1.5, invert: true })
  })

  it('malformed field dict dropped to default (negative): bad kind', () => {
    const v = { __field__: { kind: 'bogus', source_id: 'a1', gain: 1, invert: false } }
    expect(validateFieldRefOnLoad(v)).toBeNull()
  })

  it('malformed field dict dropped to default (negative): empty source_id', () => {
    const v = { __field__: { kind: 'image', source_id: '', gain: 1, invert: false } }
    expect(validateFieldRefOnLoad(v)).toBeNull()
  })

  it('malformed field dict dropped to default (negative): missing source_id', () => {
    const v = { __field__: { kind: 'image', gain: 1, invert: false } }
    expect(validateFieldRefOnLoad(v)).toBeNull()
  })

  it('malformed field dict dropped to default (negative): not a field dict', () => {
    expect(validateFieldRefOnLoad(5)).toBeNull()
    expect(validateFieldRefOnLoad('x')).toBeNull()
    expect(validateFieldRefOnLoad({ foo: 1 })).toBeNull()
    expect(validateFieldRefOnLoad(null)).toBeNull()
  })

  it('out-of-range gain clamped on load (negative): above max', () => {
    const v = { __field__: { kind: 'image', source_id: 'a1', gain: 99, invert: false } }
    const out = validateFieldRefOnLoad(v)
    expect(out!.__field__.gain).toBe(FIELD_GAIN_MAX)
  })

  it('out-of-range gain clamped on load (negative): below min', () => {
    const v = { __field__: { kind: 'image', source_id: 'a1', gain: -99, invert: false } }
    const out = validateFieldRefOnLoad(v)
    expect(out!.__field__.gain).toBe(FIELD_GAIN_MIN)
  })

  it('NaN / Infinity gain clamped to finite default on load (negative)', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      const v = { __field__: { kind: 'video', source_id: 'a1', gain: bad, invert: false } }
      const out = validateFieldRefOnLoad(v)
      expect(out).not.toBeNull()
      expect(Number.isFinite(out!.__field__.gain)).toBe(true)
      expect(out!.__field__.gain).toBeGreaterThanOrEqual(FIELD_GAIN_MIN)
      expect(out!.__field__.gain).toBeLessThanOrEqual(FIELD_GAIN_MAX)
    }
  })

  it('over-long source_id dropped (negative)', () => {
    const v = { __field__: { kind: 'image', source_id: 'x'.repeat(300), gain: 1, invert: false } }
    expect(validateFieldRefOnLoad(v)).toBeNull()
  })

  it('isFieldRef distinguishes field dicts from scalars and plain objects', () => {
    expect(isFieldRef({ __field__: { kind: 'image', source_id: 'a', gain: 1, invert: false } })).toBe(true)
    expect(isFieldRef(5)).toBe(false)
    expect(isFieldRef('s')).toBe(false)
    expect(isFieldRef(true)).toBe(false)
    expect(isFieldRef({ x: 1 })).toBe(false)
    expect(isFieldRef(null)).toBe(false)
  })
})
