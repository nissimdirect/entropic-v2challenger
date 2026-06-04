/**
 * readDropPayload — the drop security path (nonce + payload validation).
 */
import { describe, it, expect } from 'vitest'
import { readDropPayload } from '../../../renderer/components/browser/dropPayload'
import { NONCE_MIME, PAYLOAD_MIME } from '../../../renderer/components/browser/types'

function dt(map: Record<string, string>) {
  return { getData: (t: string) => map[t] ?? '' }
}

const NONCE = 'session-abc'
const VALID = JSON.stringify({ kind: 'fx', id: 'builtin:fx.pixelsort' })

describe('readDropPayload', () => {
  it('returns the payload when nonce matches + payload valid', () => {
    const p = readDropPayload(dt({ [NONCE_MIME]: NONCE, [PAYLOAD_MIME]: VALID }), NONCE)
    expect(p).toEqual({ kind: 'fx', id: 'builtin:fx.pixelsort' })
  })

  it('rejects a mismatched nonce (external drag)', () => {
    expect(readDropPayload(dt({ [NONCE_MIME]: 'other', [PAYLOAD_MIME]: VALID }), NONCE)).toBeNull()
  })

  it('rejects a missing nonce', () => {
    expect(readDropPayload(dt({ [PAYLOAD_MIME]: VALID }), NONCE)).toBeNull()
  })

  it('rejects when expectedNonce is empty', () => {
    expect(readDropPayload(dt({ [NONCE_MIME]: '', [PAYLOAD_MIME]: VALID }), '')).toBeNull()
  })

  it('rejects malformed JSON', () => {
    expect(readDropPayload(dt({ [NONCE_MIME]: NONCE, [PAYLOAD_MIME]: '{not json' }), NONCE)).toBeNull()
  })

  it('rejects a structurally invalid payload (bad id namespace)', () => {
    const bad = JSON.stringify({ kind: 'fx', id: 'fx.pixelsort' })
    expect(readDropPayload(dt({ [NONCE_MIME]: NONCE, [PAYLOAD_MIME]: bad }), NONCE)).toBeNull()
  })

  it('rejects an unknown kind', () => {
    const bad = JSON.stringify({ kind: 'malware', id: 'builtin:x.y' })
    expect(readDropPayload(dt({ [NONCE_MIME]: NONCE, [PAYLOAD_MIME]: bad }), NONCE)).toBeNull()
  })
})
