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
import { useInstrumentsStore } from './instruments'
import { useProjectStore } from './project'
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

/** Injectable bake. Resolves with a clip id (and the baked file PATH the render
 * loop plays back) on success; REJECTS on bake error. Tests inject a controlled
 * promise to drive success/failure/timing. */
export type BakeFn = (snapshot: BakeSnapshot) => Promise<{ clipId: string; path?: string }>

/**
 * B10.1b — REAL default bake. Calls the backend `bake_performance_track` IPC
 * (which renders the track's voices to a clip via ExportManager — NO parallel
 * renderer) and returns the baked clip id + on-disk path.
 *
 * The snapshot carries this track's PRE-freeze events; we scope a minimal
 * performance payload (this track's instrument + rack + events + their assets)
 * so ONLY this track bakes. The output is written under the app userData dir so
 * the render loop can play it back as a video layer (Ableton freeze → the track
 * plays the baked clip). REJECTS on a non-ok IPC response so the FSM takes its
 * failure branch (voices NOT released). Overridable via `setBakeFn` (tests).
 */
const defaultBake: BakeFn = async (snapshot) => {
  const entropic =
    typeof window !== 'undefined' ? (window as Window).entropic : undefined
  if (!entropic?.sendCommand) {
    // No IPC bridge (e.g. a bare test env that didn't inject one) — fail the
    // bake so the FSM does NOT release voices (safer than a phantom freeze).
    throw new Error('bake_performance_track unavailable: no IPC bridge')
  }
  const { trackId, events } = snapshot
  const payload = buildBakePayload(trackId, events)
  const range = bakeFrameRange(events)

  // Resolve a per-track output clip under userData/perf-bakes/. getAppPath +
  // mkdirp are best-effort; if absent, fall back to a flat name the backend
  // validator still accepts under the runtime dir.
  let outputPath = `perf-bake-${sanitize(trackId)}.mp4`
  try {
    if (entropic.getAppPath) {
      const base = await entropic.getAppPath('userData')
      if (base) {
        const dir = `${base}/perf-bakes`
        if (entropic.mkdirp) await entropic.mkdirp(dir)
        outputPath = `${dir}/perf-bake-${sanitize(trackId)}-${Date.now()}.mp4`
      }
    }
  } catch {
    // keep the fallback name
  }

  const res = (await entropic.sendCommand({
    cmd: 'bake_performance_track',
    track_id: trackId,
    performance: payload,
    output_path: outputPath,
    resolution: [1920, 1080],
    start_frame: range.start,
    end_frame: range.end,
    fps: 30,
  })) as { ok?: boolean; clipId?: string; path?: string; error?: string }

  if (!res?.ok) {
    throw new Error(res?.error || 'bake_performance_track failed')
  }
  return { clipId: res.clipId || `perf-bake:${trackId}`, path: res.path || outputPath }
}

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
  /** Baked clip on-disk PATH per FROZEN track — the render loop plays THIS file
   * for the track (Ableton-style frozen playback) instead of live voices. */
  frozenClipPaths: Record<string, string>
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
   * B10.1b — UNFREEZE a FROZEN track (Ableton-style). Discards the baked clip
   * (clears `frozenClips`/`frozenClipPaths`), transitions FSM → IDLE, and lets
   * the render loop return to LIVE voices (`buildRackLayers` / `buildVoiceLayers`).
   * The track's live events were released on freeze; the user re-triggers to
   * rebuild voices. No-op unless the track is FROZEN. Returns the resolved state.
   */
  unfreezePerformanceTrack: (trackId: string) => PerfFreezeState

  /** True iff the track is currently FROZEN (render loop should play the bake). */
  isFrozen: (trackId: string) => boolean

  /** The baked clip path for a FROZEN track (undefined when not frozen). */
  getFrozenClipPath: (trackId: string) => string | undefined

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
  frozenClipPaths: {},
  _cancelled: {},
  _bake: defaultBake,

  setBakeFn: (fn) => set({ _bake: fn }),

  getState: (trackId) => get().fsm[trackId] ?? 'idle',

  isFreezing: (trackId) => (get().fsm[trackId] ?? 'idle') === 'freezing',

  isFrozen: (trackId) => (get().fsm[trackId] ?? 'idle') === 'frozen',

  getFrozenClipPath: (trackId) => get().frozenClipPaths[trackId],

  unfreezePerformanceTrack: (trackId) => {
    if ((get().fsm[trackId] ?? 'idle') !== 'frozen') return get().getState(trackId)
    // Discard the bake + return to live voices (FSM → IDLE = absent key). The
    // user re-triggers to rebuild voices (they were released on freeze).
    set({
      fsm: clearKey(get().fsm, trackId),
      frozenClips: clearKey(get().frozenClips, trackId),
      frozenClipPaths: clearKey(get().frozenClipPaths, trackId),
    })
    return 'idle'
  },

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
    let clipPath: string | null = null
    try {
      const res = await get()._bake(snapshot)
      clipId = res.clipId
      clipPath = res.path ?? null
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
        // Store the baked clip PATH so the render loop plays it back for this
        // track (Ableton frozen playback). Absent path → no entry → the render
        // loop simply renders nothing live for the released track (still FROZEN).
        frozenClipPaths: clipPath
          ? { ...get().frozenClipPaths, [trackId]: clipPath }
          : get().frozenClipPaths,
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
    set({
      fsm: {},
      queue: {},
      snapshots: {},
      frozenClips: {},
      frozenClipPaths: {},
      _cancelled: {},
      _bake: defaultBake,
    }),
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

/** Filesystem-safe slug for a trackId used in the bake clip filename. */
function sanitize(id: string): string {
  return id.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 64) || 'track'
}

/** Inclusive frame range to bake from the snapshot's events. Empty events →
 * a single frame [0,0] (still produces a valid 1-frame clip). */
function bakeFrameRange(events: TriggerEvent[]): { start: number; end: number } {
  if (!events.length) return { start: 0, end: 0 }
  let max = 0
  for (const e of events) {
    const fi = Number.isFinite(e.frameIndex) ? e.frameIndex : 0
    if (fi > max) max = fi
  }
  // Bake a small tail past the last trigger so a release-tail voice still shows.
  return { start: 0, end: Math.max(0, Math.round(max) + 30) }
}

/**
 * Build the MINIMAL scoped performance payload for ONE track's bake. Reads the
 * track's Sampler instrument + asset from the stores and re-stamps the snapshot
 * events onto the instrument id (the backend buckets events by instrumentId).
 * Scoped to a single track so ONLY that track's voices bake. Mirrors the
 * per-track loop in App.tsx buildPerformancePayload (no rack/frameBank here —
 * the App-wired bake injects the richer payload via setBakeFn for those).
 */
export function buildBakePayload(
  trackId: string,
  events: TriggerEvent[],
): {
  events: unknown[]
  instruments: Record<string, unknown>
  assets: Record<string, unknown>
} {
  const instrState = useInstrumentsStore.getState()
  const projectAssets = useProjectStore.getState().assets
  const perfState = usePerformanceStore.getState()
  const rackAdsr = perfState.drumRack.pads[0]?.envelope ?? {
    attack: 0,
    decay: 0,
    sustain: 1,
    release: 0,
  }

  const inst = instrState.instruments[trackId]
  const outEvents: unknown[] = []
  const instruments: Record<string, unknown> = {}
  const assets: Record<string, unknown> = {}

  if (inst) {
    for (const e of events) {
      outEvents.push({
        frameIndex: e.frameIndex,
        eventIndex: e.eventIndex,
        note: e.note,
        velocity: e.velocity,
        kind: e.kind,
        instrumentId: inst.id,
        ...(e.chokeGroup != null ? { chokeGroup: e.chokeGroup } : {}),
      })
    }
    instruments[inst.id] = {
      clipId: inst.clipId,
      startFrame: inst.startFrame,
      speed: inst.speed,
      opacity: inst.opacity,
      blendMode: inst.blendMode,
      voiceCap: 4,
      adsr: rackAdsr,
      chain: [],
      ...(inst.endFrame !== undefined ? { endFrame: inst.endFrame } : {}),
      ...(inst.loop !== undefined ? { loop: inst.loop } : {}),
      ...(inst.scrub !== undefined ? { scrub: inst.scrub } : {}),
      ...(inst.glide !== undefined ? { glide: inst.glide } : {}),
      ...(inst.melodic !== undefined ? { melodic: inst.melodic } : {}),
    }
    const asset = projectAssets[inst.clipId]
    if (asset?.path) {
      const metaFps = asset.meta?.fps
      const fps = Number.isFinite(metaFps) && metaFps > 0 ? metaFps : 30
      const dur = Number.isFinite(asset.meta?.duration) ? asset.meta.duration : 0
      assets[inst.clipId] = {
        path: asset.path,
        frameCount: Math.max(1, Math.round(dur * fps)),
        fps,
      }
    }
  }

  return { events: outEvents, instruments, assets }
}

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
