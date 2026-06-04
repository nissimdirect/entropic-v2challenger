/**
 * isValidPayload — drop validator (qa-redteam H2: namespaced ids only).
 *
 * The validator gates every dropped payload at the trust boundary: kind must be
 * a known tab, id must be `builtin:` / `user:` namespaced with safe chars only.
 */
import { describe, it, expect } from 'vitest'
import { isValidPayload } from '../../../renderer/components/browser/types'

describe('isValidPayload', () => {
  it('accepts a builtin fx payload', () => {
    expect(isValidPayload({ kind: 'fx', id: 'builtin:fx.pixelsort' })).toBe(true)
  })

  it('accepts a user-namespaced id', () => {
    expect(isValidPayload({ kind: 'instruments', id: 'user:instr.mysampler' })).toBe(
      true,
    )
  })

  it('accepts every tab kind', () => {
    for (const kind of ['fx', 'op', 'composite', 'tool', 'instruments'] as const) {
      expect(isValidPayload({ kind, id: 'builtin:thing-1' })).toBe(true)
    }
  })

  it('rejects an unknown kind', () => {
    expect(isValidPayload({ kind: 'bogus', id: 'builtin:fx.pixelsort' })).toBe(false)
  })

  it('rejects a non-namespaced id', () => {
    expect(isValidPayload({ kind: 'fx', id: 'fx.pixelsort' })).toBe(false)
  })

  it('rejects ids with bad chars', () => {
    expect(isValidPayload({ kind: 'fx', id: 'builtin:fx/pixelsort' })).toBe(false)
    expect(isValidPayload({ kind: 'fx', id: 'builtin:fx pixelsort' })).toBe(false)
    expect(isValidPayload({ kind: 'fx', id: 'builtin:fx:pixelsort' })).toBe(false)
  })

  it('rejects an unknown namespace prefix', () => {
    expect(isValidPayload({ kind: 'fx', id: 'evil:fx.pixelsort' })).toBe(false)
  })

  it('rejects null', () => {
    expect(isValidPayload(null)).toBe(false)
  })

  it('rejects non-object primitives', () => {
    expect(isValidPayload('builtin:fx.pixelsort')).toBe(false)
    expect(isValidPayload(42)).toBe(false)
    expect(isValidPayload(undefined)).toBe(false)
  })

  it('rejects an object missing the id', () => {
    expect(isValidPayload({ kind: 'fx' })).toBe(false)
  })

  it('rejects an object with a non-string id', () => {
    expect(isValidPayload({ kind: 'fx', id: 123 })).toBe(false)
  })
})
