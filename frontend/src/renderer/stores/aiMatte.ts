/**
 * MK.12 — AI subject matte (local RVM) generation flow.
 *
 * `generateAiMatte(clipId)` drives the offline bake job over the export-style
 * job IPC (`mask_ai_generate` → poll `mask_ai_status` → `mask_ai_cancel`):
 *
 *   1. Resolve the clip's asset path from the project store.
 *   2. Send `mask_ai_generate`. A cache hit returns `cached: true` and the
 *      matte node is added immediately (no bake, no toast churn).
 *   3. Otherwise poll `mask_ai_status` once per second, updating ONE
 *      progress toast (level 'state' = manual-dismiss; source-keyed so the
 *      toast store's 2 s dedupe window keeps it a single row) that carries a
 *      Cancel action wired to `mask_ai_cancel`.
 *   4. On complete: append an `ai_matte` MatteNode (matte_path from the job)
 *      to the clip's maskStack via the store's undoable addMatteNode.
 *
 * Failure modes surface as error toasts with the backend's actionable message
 * (e.g. the `masking-ai` extra install hint, the 2 GiB headroom refusal) —
 * source field set per repo toast conventions (rate-limited).
 */

import { useTimelineStore } from './timeline'
import { useProjectStore } from './project'
import { useToastStore } from './toast'
import { randomUUID } from '../utils'
import type { MatteNode } from '../../shared/types'

const TOAST_SOURCE = 'mk12-ai-matte'
const POLL_MS = 1000

function sendCommand(cmd: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (typeof window !== 'undefined' && window.entropic) {
    return window.entropic.sendCommand(cmd)
  }
  return Promise.resolve({ ok: false, error: 'No bridge' })
}

let pollTimer: ReturnType<typeof setInterval> | null = null

function stopPoll(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

export function cancelAiMatte(): void {
  void sendCommand({ cmd: 'mask_ai_cancel', id: randomUUID() })
  stopPoll()
  const toast = useToastStore.getState()
  toast.dismissBySource(TOAST_SOURCE)
  toast.addToast({
    level: 'info',
    message: 'AI matte generation cancelled',
    source: TOAST_SOURCE,
  })
}

function addAiMatteNode(clipId: string, mattePath: string): void {
  const node: MatteNode = {
    id: randomUUID(),
    kind: 'ai_matte',
    params: { matte_path: mattePath, start_frame: 0 },
    op: 'add',
    invert: false,
    feather: 0,
    growShrink: 0,
    enabled: true,
  }
  useTimelineStore.getState().addMatteNode(clipId, node)
}

/**
 * Kick off (or cache-hit) an AI matte bake for `clipId`'s source asset.
 * Safe to call from the clip context menu; all failure modes toast.
 */
export async function generateAiMatte(clipId: string): Promise<void> {
  const toast = useToastStore.getState()

  // Resolve the clip → asset path (the bake input).
  let assetId: string | undefined
  for (const track of useTimelineStore.getState().tracks) {
    const clip = track.clips.find((c) => c.id === clipId)
    if (clip) { assetId = clip.assetId; break }
  }
  const asset = assetId ? useProjectStore.getState().assets[assetId] : undefined
  if (!asset?.path) {
    toast.addToast({
      level: 'warning',
      message: 'Generate AI matte: clip media not found',
      source: TOAST_SOURCE,
    })
    return
  }

  const res = await sendCommand({
    cmd: 'mask_ai_generate',
    id: randomUUID(),
    input_path: asset.path,
  })

  if (!res.ok) {
    // Backend errors are actionable by design (extra install hint / headroom).
    toast.addToast({
      level: 'error',
      message: String(res.error ?? 'AI matte generation failed'),
      source: TOAST_SOURCE,
    })
    return
  }

  if (res.cached) {
    addAiMatteNode(clipId, String(res.matte_path))
    toast.addToast({
      level: 'info',
      message: 'AI matte ready (cached) — added to the clip’s matte stack',
      source: TOAST_SOURCE,
    })
    return
  }

  // Bake running: one state-level (manual-dismiss) progress toast + Cancel.
  toast.addToast({
    level: 'state',
    message: 'Generating AI matte (local)… 0%',
    source: TOAST_SOURCE,
    action: { label: 'Cancel', fn: cancelAiMatte },
  })

  stopPoll()
  pollTimer = setInterval(async () => {
    const status = await sendCommand({ cmd: 'mask_ai_status', id: randomUUID() })
    if (!status.ok) return
    const state = String(status.status ?? '')
    const t = useToastStore.getState()

    if (state === 'running') {
      const pct = Math.round(((status.progress as number) ?? 0) * 100)
      // Replace the single source-keyed progress row (state = manual-dismiss,
      // so we dismiss + re-add to update the text).
      t.dismissBySource(TOAST_SOURCE)
      t.addToast({
        level: 'state',
        message: `Generating AI matte (local)… ${pct}%`,
        source: TOAST_SOURCE,
        action: { label: 'Cancel', fn: cancelAiMatte },
      })
      return
    }

    stopPoll()
    t.dismissBySource(TOAST_SOURCE)

    if (state === 'complete') {
      addAiMatteNode(clipId, String(status.matte_path))
      t.addToast({
        level: 'info',
        message: 'AI matte ready — added to the clip’s matte stack',
        source: TOAST_SOURCE,
      })
    } else if (state === 'error') {
      t.addToast({
        level: 'error',
        message: String(status.error ?? 'AI matte generation failed'),
        source: TOAST_SOURCE,
      })
    }
    // 'cancelled' → cancelAiMatte already toasted; 'idle' → nothing to say.
  }, POLL_MS)
}
