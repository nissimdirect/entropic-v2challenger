/**
 * Creatrix 5-tab browser types (PLAN.md §3.5 / §3.6).
 *
 * Drag payload carries (kind, id) + a session-bound nonce so the drop validator
 * rejects external drags by construction (qa-redteam H1). `id` is namespaced
 * `builtin:` / `user:` (qa-redteam H2 — no shadow collisions).
 */

export type TabKey = 'fx' | 'op' | 'composite' | 'tool' | 'instruments'

export const TAB_ORDER: TabKey[] = ['fx', 'op', 'composite', 'tool', 'instruments']

export const TAB_LABELS: Record<TabKey, string> = {
  fx: 'fx',
  op: 'op',
  composite: 'composite',
  tool: 'tool',
  instruments: 'instruments',
}

export interface BrowserEntry {
  /** namespaced id, e.g. `builtin:fx.pixelsort`, `builtin:instr.sampler` */
  id: string
  label: string
  kind: TabKey
  /** disabled entries render greyed with a tooltip (e.g. needs a base clip). */
  disabled?: boolean
  disabledReason?: string
}

export const NONCE_MIME = 'application/x-creatrix-nonce'
export const PAYLOAD_MIME = 'application/x-creatrix-entry'

export interface DragPayload {
  kind: TabKey
  id: string
}

const ID_RE = /^(builtin|user):[a-zA-Z0-9._-]+$/

/** Validate a dropped payload: kind enum + namespaced id (qa-redteam H2). */
export function isValidPayload(p: unknown): p is DragPayload {
  if (!p || typeof p !== 'object') return false
  const { kind, id } = p as Record<string, unknown>
  return (
    typeof kind === 'string' &&
    (TAB_ORDER as string[]).includes(kind) &&
    typeof id === 'string' &&
    ID_RE.test(id)
  )
}
