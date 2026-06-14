/**
 * P6.8 (I1) — Inspector probe IPC + shared snapshot poller.
 *
 * The backend probe registry (P6.7) records a bounded history (≤ 32 readings,
 * `MAX_HISTORY_PER_PROBE`) per registered probe. The frontend:
 *   - registers/unregisters bindings (`probe_register` / `probe_unregister`)
 *   - mounts/unmounts the registry (`probe_mount` / `probe_unmount`) tied to the
 *     inspector track's presence in the timeline, so polling only runs while the
 *     track is visible
 *   - polls `probe_snapshot` at ~10 Hz from ONE shared loop and fans the result
 *     out to all subscribed scopes (so 16 scopes = 1 poll, not 16).
 *
 * Quantified budget (packet step 4): one snapshot reply carries ≤ 16 probes ×
 * ≤ 32 readings; each scope keeps its own ring buffer of the last 32 numbers
 * (16 × 32 × 8 B Float64 ≈ 4 KiB total). Polling is 10 Hz.
 */

/** One probe's serialized snapshot (camelCase per IPC convention). */
export interface ProbeSnapshotEntry {
  id: string
  kind: string
  label: string
  trackId: string | null
  effectId: string | null
  paramPath: string | null
  history: { value: number; timestampS: number }[]
  latestValue: number | null
  latestTimestampS: number | null
}

export interface ProbeSnapshot {
  ok: boolean
  mounted: boolean
  capturedAtS: number | null
  probes: Record<string, ProbeSnapshotEntry>
}

const POLL_INTERVAL_MS = 100 // 10 Hz

type Subscriber = (snap: ProbeSnapshot) => void

const subscribers = new Set<Subscriber>()
let pollTimer: ReturnType<typeof setInterval> | null = null
let inFlight = false

function bridge(): Window['entropic'] | null {
  return typeof window !== 'undefined' && window.entropic ? window.entropic : null
}

/** Fire-and-forget command; resolves with the reply or a synthetic failure. */
async function send(cmd: Record<string, unknown>): Promise<Record<string, unknown>> {
  const w = bridge()
  if (!w?.sendCommand) return { ok: false, error: 'no bridge' }
  try {
    return await w.sendCommand(cmd)
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

let probeSeq = 0
function nextId(): string {
  probeSeq += 1
  return `probe-ipc-${probeSeq}`
}

export function registerProbe(binding: {
  probeId: string
  kind: string
  label: string
  trackId?: string
  effectId: string
  paramPath: string
}): Promise<Record<string, unknown>> {
  return send({
    cmd: 'probe_register',
    id: nextId(),
    probe_id: binding.probeId,
    kind: binding.kind,
    label: binding.label,
    track_id: binding.trackId,
    effect_id: binding.effectId,
    param_path: binding.paramPath,
  })
}

export function unregisterProbe(probeId: string): Promise<Record<string, unknown>> {
  return send({ cmd: 'probe_unregister', id: nextId(), probe_id: probeId })
}

export function mountProbes(): Promise<Record<string, unknown>> {
  return send({ cmd: 'probe_mount', id: nextId() })
}

export function unmountProbes(): Promise<Record<string, unknown>> {
  return send({ cmd: 'probe_unmount', id: nextId() })
}

async function pollOnce(): Promise<void> {
  if (inFlight) return // skip overlapping polls (slow backend / busy socket)
  inFlight = true
  try {
    const raw = await send({ cmd: 'probe_snapshot', id: nextId() })
    // Trust boundary: a malformed/failed reply yields an empty snapshot rather
    // than throwing — scopes render an empty buffer, never crash.
    const probes =
      raw && typeof raw === 'object' && raw.probes && typeof raw.probes === 'object'
        ? (raw.probes as Record<string, ProbeSnapshotEntry>)
        : {}
    const snap: ProbeSnapshot = {
      ok: raw?.ok === true,
      mounted: raw?.mounted === true,
      capturedAtS: typeof raw?.capturedAtS === 'number' ? (raw.capturedAtS as number) : null,
      probes,
    }
    for (const sub of subscribers) {
      try {
        sub(snap)
      } catch {
        // a thrown subscriber must not stop the others
      }
    }
  } finally {
    inFlight = false
  }
}

function startPolling(): void {
  if (pollTimer !== null) return
  pollTimer = setInterval(() => void pollOnce(), POLL_INTERVAL_MS)
}

function stopPolling(): void {
  if (pollTimer === null) return
  clearInterval(pollTimer)
  pollTimer = null
}

/**
 * Subscribe a scope to the shared snapshot stream. The first subscriber starts
 * the poll loop; the last unsubscribe stops it. Returns an unsubscribe fn.
 */
export function subscribeSnapshots(fn: Subscriber): () => void {
  subscribers.add(fn)
  if (subscribers.size === 1) startPolling()
  return () => {
    subscribers.delete(fn)
    if (subscribers.size === 0) stopPolling()
  }
}

/** Test-only: reset module poller state between vitest cases. */
export function __resetProbeIpcForTest(): void {
  stopPolling()
  subscribers.clear()
  inFlight = false
  probeSeq = 0
}
