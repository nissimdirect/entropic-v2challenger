/**
 * B10.1 — Performance-track Freeze ↔ voice state machine (the "4-voice forcing
 * function"). Freezing a performance track BAKES its current rendered voice
 * output to a clip and RELEASES its voices (frees the 4 voice slots).
 *
 * This store is DECOUPLED from the effect-chain freeze (`freeze.ts`) — that store
 * keeps owning `freezePrefix`/`unfreezePrefix`/`flattenPrefix` for the effect
 * chain. THIS store owns ONLY the performance-track voice FSM:
 *
 *   IDLE ──user freeze──▶ FREEZING (async bake) ──ok──▶ FROZEN (voices released)
 *                             │  trigger mid-freeze → QUEUE by frameIndex
 *                             ├──bake error──▶ IDLE: drain vs PRE-freeze (no release)
 *                             └──user cancel──▶ IDLE: drain vs PRE-freeze (no release)
 *
 * THREE HARD REQUIREMENTS (the attack-ramp/isActive bug class — each has a test):
 *
 *  1. DRAIN BY frameIndex, NOT promise-resolution time. A trigger queued during
 *     FREEZING applies at its captured `frameIndex` (sorted ascending, tie-broken
 *     by `eventIndex`), so replay is byte-identical regardless of when the bake
 *     promise resolves or the order triggers were enqueued.
 *
 *  2. EXPLICIT FREEZE-FAILURE BRANCH. `freeze.ts`'s `finally` sets idle even on
 *     error; here the FSM distinguishes success (drain vs FROZEN, voices released)
 *     from failure/cancel (drain vs PRE-freeze, voices NOT released). The drain
 *     TARGET is decided by the resolved outcome, never by the finally block alone.
 *
 *  3. DOUBLE-BAKE GUARD. The bake SNAPSHOT is captured synchronously BEFORE the
 *     first await, so a trigger that arrives mid-freeze (and is therefore queued)
 *     is neither baked into the freeze NOR lost — it drains afterward.
 *
 * The bake itself is INJECTABLE (default: a real flatten-style IPC call, or a
 * resolved stub). The backend voice-timeline bake (rendering the performance
 * track's voices to a clip) is a FOLLOW-UP — the existing `flatten` cmd bakes an
 * effect-chain freeze cache, NOT a voice timeline, so this slice ships the FSM
 * proven against an injectable bake and defers the heavy backend render.
 */
import { create } from 'zustand'
import type { TriggerEvent } from '../components/instruments/voiceFSM'
import { usePerformanceStore } from './performance'
import { useToastStore } from './toast'

/**
 * Hard cap on the per-track trigger queue during FREEZING (defense-in-depth,
 * independent of the upstream MIDI rate-limit). A slow async bake opens a
 * FREEZING window; a stuck controller / flood-trigger could otherwise balloon
 * `queue[trackId]` unboundedly (memory + a huge drain) — the spec's explicit
 * "stuck controller can't balloon the capture buffer" risk (B10 MIDI note).
 * 4096 is generous: a real bake queues far fewer. Past the cap, NEW triggers are
 * DROPPED (the queue is hard-bounded, so the drain stays bounded → no OOM).
 */
export const MAX_FREEZE_QUEUE = 4096

export type PerfFreezeState = 'idle' | 'freezing' | 'frozen'

/** A queued trigger captured during FREEZING. `frameIndex` is the deterministic
 * drain key (NOT promise/enqueue time). The full event is preserved verbatim. */
export interface QueuedTrigger {
  /** The deterministic frame at which this trigger applies on drain. */
  frameIndex: number
  /** The verbatim TriggerEvent to apply to the performance store on drain. */
  event: TriggerEvent
}

/** The snapshot the bake operates on. Captured synchronously BEFORE the first
 * await so queued-but-unapplied voices are EXCLUDED (double-bake guard). */
export interface BakeSnapshot {
  trackId: string
  /** The track's voice events at freeze-start — what gets baked. */
  events: TriggerEvent[]
}

/** Injectable bake. Resolves with a clip id/path on success; REJECTS on bake
 * error. Tests inject a controlled promise to drive success/failure/timing. */
export type BakeFn = (snapshot: BakeSnapshot) => Promise<{ clipId: string }>

/** Default bake: a stub that resolves immediately. The backend voice-timeline
 * render is a documented follow-up (see file header). Swapped by App wiring or
 * tests via `setBakeFn`. */
const defaultBake: BakeFn = async (snapshot) =>
  Promise.resolve({ clipId: `perf-bake:${snapshot.trackId}` })

/** Sort queued triggers DETERMINISTICALLY by frameIndex, tie-broken by the
 * monotonic eventIndex. NEVER by enqueue order or promise-resolution time. */
function drainOrder(queue: QueuedTrigger[]): QueuedTrigger[] {
  return [...queue].sort((a, b) => {
    if (a.frameIndex !== b.frameIndex) return a.frameIndex - b.frameIndex
    return a.event.eventIndex - b.event.eventIndex
  })
}

interface PerformanceFreezeState {
  /** FSM state per performance track. Absent key === 'idle'. */
  fsm: Record<string, PerfFreezeState>
  /** Queued triggers per track, populated while that track is FREEZING. */
  queue: Record<string, QueuedTrigger[]>
  /** The bake snapshot captured at freeze-start, per in-flight track. */
  snapshots: Record<string, BakeSnapshot>
  /** Baked clip id per FROZEN track (for unfreeze / inspection). */
  frozenClips: Record<string, string>
  /** Cancellation flags set by `cancelFreeze` — read after the bake resolves. */
  _cancelled: Record<string, boolean>

  /** The bake function (injectable). */
  _bake: BakeFn

  /** Inject a bake function (App wiring / tests). */
  setBakeFn: (fn: BakeFn) => void

  /** Read the FSM state for a track (idle if absent). */
  getState: (trackId: string) => PerfFreezeState

  /** True iff the track is currently FREEZING (triggers must be enqueued). */
  isFreezing: (trackId: string) => boolean

  /**
   * Freeze a performance track. Captures the bake snapshot synchronously
   * (double-bake guard), transitions to FREEZING, awaits the injected bake,
   * then on success → FROZEN + release the track's voices + drain queue vs
   * FROZEN; on error/cancel → IDLE + voices NOT released + drain queue vs
   * PRE-freeze. Returns the resolved FSM state.
   */
  freezePerformanceTrack: (trackId: string) => Promise<PerfFreezeState>

  /** User cancel — flags the in-flight freeze so it resolves to the failure
   * branch (drain vs PRE-freeze, voices NOT released). No-op if not freezing. */
  cancelFreeze: (trackId: string) => void

  /**
   * Enqueue a trigger that arrived during FREEZING. Captures the frameIndex
   * (the deterministic drain key) and the verbatim event.
   *
   * Return value (the caller — routeRackTrigger / RackDevice — uses this to
   * decide whether to ALSO apply the trigger live):
   *   - `true`  → HANDLED by the freeze path. The caller must NOT apply live.
   *               This covers BOTH the enqueued case AND the capped/dropped case
   *               (a dropped trigger is still "handled" — intentionally lost, not
   *               leaked into the live store mid-bake, which would corrupt the
   *               bake snapshot's intent). The queue is bounded at
   *               MAX_FREEZE_QUEUE; past the cap the trigger is dropped and a
   *               ONE-TIME warning toast fires (2s-dedup by `source`).
   *   - `false` → NOT handled (track was NOT FREEZING). The caller applies live.
   */
  enqueueTrigger: (trackId: string, event: TriggerEvent) => boolean

  /** Clear all FSM state (does not touch the performance store). */
  reset: () => void
}

/** Monotonic event index for queued events built at the FSM boundary. Shares no
 * state with performance.ts's counter — queued events get their own ascending
 * indices, sufficient for deterministic tie-breaking within the drain. */
let _queuedEventIndex = 1_000_000

export const usePerformanceFreezeStore = create<PerformanceFreezeState>((set, get) => ({
  fsm: {},
  queue: {},
  snapshots: {},
  frozenClips: {},
  _cancelled: {},
  _bake: defaultBake,

  setBakeFn: (fn) => set({ _bake: fn }),

  getState: (trackId) => get().fsm[trackId] ?? 'idle',

  isFreezing: (trackId) => (get().fsm[trackId] ?? 'idle') === 'freezing',

  enqueueTrigger: (trackId, event) => {
    if ((get().fsm[trackId] ?? 'idle') !== 'freezing') return false
    const q = get().queue[trackId] ?? []
    // Defense-in-depth: hard-bound the queue. Past MAX_FREEZE_QUEUE, DROP the
    // new trigger (queue + drain stay bounded → no OOM) and fire a ONE-TIME
    // warning toast. The toast store dedups by `source` over 2s, so a flood
    // collapses to a single toast per freeze. Return `true` (HANDLED — dropped,
    // NOT applied live: the caller must not double-apply mid-bake).
    if (q.length >= MAX_FREEZE_QUEUE) {
      useToastStore.getState().addToast({
        level: 'warning',
        message: `Freeze queue full (${MAX_FREEZE_QUEUE}) — extra triggers dropped during bake.`,
        source: 'perf-freeze-queue',
      })
      return true
    }
    // Capture frameIndex from the EVENT (the deterministic frame), never
    // performance.now() / promise order. Stamp the queue entry with it.
    set({ queue: { ...get().queue, [trackId]: [...q, { frameIndex: event.frameIndex, event }] } })
    return true
  },

  cancelFreeze: (trackId) => {
    if ((get().fsm[trackId] ?? 'idle') !== 'freezing') return
    set({ _cancelled: { ...get()._cancelled, [trackId]: true } })
  },

  freezePerformanceTrack: async (trackId) => {
    if (!trackId) return get().getState(trackId)
    // Concurrency guard — one in-flight freeze per track.
    if ((get().fsm[trackId] ?? 'idle') !== 'idle') return get().getState(trackId)

    // ─── DOUBLE-BAKE GUARD (requirement 3) ──────────────────────────────────
    // Capture the bake snapshot SYNCHRONOUSLY, BEFORE any await. The PRE-freeze
    // voice events are frozen here; a trigger arriving after this line is
    // enqueued (FREEZING) and is therefore EXCLUDED from the snapshot — neither
    // baked into the freeze nor lost (it drains afterward).
    const preFreezeEvents = usePerformanceStore.getState().trackEvents[trackId] ?? []
    const snapshot: BakeSnapshot = {
      trackId,
      events: preFreezeEvents.map((e) => ({ ...e })),
    }

    set({
      fsm: { ...get().fsm, [trackId]: 'freezing' },
      queue: { ...get().queue, [trackId]: [] },
      snapshots: { ...get().snapshots, [trackId]: snapshot },
      _cancelled: { ...get()._cancelled, [trackId]: false },
    })

    let baked = false
    let clipId: string | null = null
    try {
      const res = await get()._bake(snapshot)
      clipId = res.clipId
      baked = true
    } catch {
      baked = false
    }

    // ─── EXPLICIT FAILURE BRANCH (requirement 2) ────────────────────────────
    // Success requires BOTH a resolved bake AND no cancel. The drain TARGET is
    // decided by `success`, never by a finally-block that flips to idle blindly.
    const cancelled = get()._cancelled[trackId] === true
    const success = baked && !cancelled

    // Drain the queue DETERMINISTICALLY by frameIndex (requirement 1).
    const queued = drainOrder(get().queue[trackId] ?? [])

    if (success) {
      // FROZEN: release the track's voices (free the 4 slots), then drain the
      // queued triggers against the FROZEN (post-release) state.
      releaseTrackVoices(trackId)
      applyDrain(trackId, queued)
      set({
        fsm: { ...get().fsm, [trackId]: 'frozen' },
        frozenClips: { ...get().frozenClips, [trackId]: clipId! },
        queue: clearKey(get().queue, trackId),
        snapshots: clearKey(get().snapshots, trackId),
        _cancelled: clearKey(get()._cancelled, trackId),
      })
      return 'frozen'
    }

    // FAILURE / CANCEL: voices are NOT released; drain against the PRE-freeze
    // state (which is exactly the live performance store, untouched here).
    applyDrain(trackId, queued)
    set({
      fsm: clearKey(get().fsm, trackId), // back to idle (absent === idle)
      queue: clearKey(get().queue, trackId),
      snapshots: clearKey(get().snapshots, trackId),
      _cancelled: clearKey(get()._cancelled, trackId),
    })
    return 'idle'
  },

  reset: () =>
    set({ fsm: {}, queue: {}, snapshots: {}, frozenClips: {}, _cancelled: {}, _bake: defaultBake }),
}))

/**
 * Wiring helper for the live rack trigger path (RackDevice.onPadTrigger). If the
 * track is FREEZING, build the rack TriggerEvent (the SAME composite-key shape
 * `triggerRackPad` writes) and ENQUEUE it (capturing `frameIndex`) instead of
 * applying — so it neither bakes into the freeze nor is lost. Otherwise returns
 * false and the caller applies as today (calls `triggerRackPad`).
 *
 * Returns true iff the trigger was enqueued (caller should NOT also apply).
 */
export function routeRackTrigger(
  trackId: string,
  padId: string,
  frameIndex: number,
  branchPath: string,
  chokeGroup: number | null,
): boolean {
  const fz = usePerformanceFreezeStore.getState()
  if (!fz.isFreezing(trackId)) return false
  if (!trackId || !padId) return false
  if (!Number.isFinite(frameIndex) || frameIndex < 0) return false
  const frame = Math.round(frameIndex)
  const prefix = branchPath ? `${branchPath}_` : ''
  const key = `${trackId}:${prefix}${padId}`
  const hasGroup = chokeGroup != null && Number.isInteger(chokeGroup)
  const event: TriggerEvent = {
    frameIndex: frame,
    eventIndex: _queuedEventIndex++,
    note: 60,
    velocity: 127,
    kind: 'trigger',
    instrumentId: key,
    ...(hasGroup ? { chokeGroup: chokeGroup as number } : {}),
  }
  return fz.enqueueTrigger(trackId, event)
}

// ─── helpers (module-private) ──────────────────────────────────────────────

/** Immutably drop a key from a record. */
function clearKey<T>(rec: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _drop, ...rest } = rec
  return rest
}

/**
 * Release the performance track's voices — the "4-voice forcing function". Frees
 * the voice slots by clearing the track's live events + pad runtime states. This
 * is the FROZEN-state coupling: once baked, the live voices are gone.
 *
 * We clear the track's event stream(s) (the trackEvents keyed by trackId AND any
 * composite rack keys `${trackId}:...`) and reset padStates so evaluateVoices
 * yields zero live voices for this track.
 */
function releaseTrackVoices(trackId: string): void {
  const perf = usePerformanceStore.getState()
  const events = perf.trackEvents
  const next: Record<string, TriggerEvent[]> = {}
  for (const key of Object.keys(events)) {
    // Drop this track's plain stream and any composite rack stream it owns.
    if (key === trackId || key.startsWith(`${trackId}:`)) continue
    next[key] = events[key]
  }
  usePerformanceStore.setState({ trackEvents: next, padStates: {} })
}

/**
 * Apply drained triggers to the performance store, in the deterministic order
 * already computed. Each event is appended verbatim to its target stream
 * (instrumentId is the composite/plain key the render path reads), preserving
 * its captured frameIndex — so replay is byte-identical.
 */
function applyDrain(_trackId: string, queued: QueuedTrigger[]): void {
  if (queued.length === 0) return
  const perf = usePerformanceStore.getState()
  const events = { ...perf.trackEvents }
  for (const { event } of queued) {
    const key = event.instrumentId
    const existing = events[key] ?? []
    events[key] = [...existing, event]
  }
  usePerformanceStore.setState({ trackEvents: events })
}
