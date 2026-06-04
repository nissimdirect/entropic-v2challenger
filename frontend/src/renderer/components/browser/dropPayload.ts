/**
 * Pure drop-payload extraction + validation (PR-A).
 *
 * A drop is accepted only when the session nonce matches (rejects drags that
 * originated outside this app/session — qa-redteam H1) AND the payload is a
 * valid namespaced entry (H2). Kept pure so the security path is unit-tested
 * without the React drag plumbing.
 */
import { NONCE_MIME, PAYLOAD_MIME, isValidPayload, type DragPayload } from './types'

interface DataLike {
  getData(type: string): string
}

export function readDropPayload(dt: DataLike, expectedNonce: string): DragPayload | null {
  if (!expectedNonce || dt.getData(NONCE_MIME) !== expectedNonce) return null
  try {
    const parsed = JSON.parse(dt.getData(PAYLOAD_MIME))
    return isValidPayload(parsed) ? parsed : null
  } catch {
    return null
  }
}
