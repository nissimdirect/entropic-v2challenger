/**
 * B10.1b — Ableton-style performance-track FREEZE: real bake + frozen playback +
 * unfreeze. These gates prove the B10.1 FSM is now USER-FUNCTIONAL:
 *
 *  Gate FREEZE_BAKE_PLAY (anti-dead-flag): freezing a track with recorded voice
 *    events CALLS the bake (the injected/real BakeFn), stores the returned
 *    on-disk path into frozenClipPaths, and isFrozen flips true.
 *    The RENDER-PATH SELECTOR (what App.tsx's render loop branches on) is exactly
 *    `isFrozen(trackId)` + `getFrozenClipPath(trackId)` — asserted here so a
 *    regression that stops wiring the path is caught. FAIL-BEFORE: the old stub
 *    bake never set a real path → the render loop had nothing to play (still live
 *    voices). PASS-AFTER: a path is present, so the render loop plays the bake.
 *
 *  Gate UNFREEZE_RESTORES: unfreeze a FROZEN track → frozenClipPaths cleared,
 *    FSM IDLE, isFrozen false → the render loop returns to live buildRackLayers /
 *    buildVoiceLayers (the selector no longer routes to a frozen clip).
 *
 *  Gate BAKE_IPC: the default (shipped) bake actually issues the
 *    `bake_performance_track` IPC command via window.entropic.sendCommand
 *    (not a no-op stub) — proven by spying on sendCommand.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock window.entropic BEFORE store imports (mirrors the FSM test).
const mockSendCommand = vi.fn()
const mockGetAppPath = vi.fn(async () => '')
const mockMkdirp = vi.fn(async () => {})
;(globalThis as any).window = {
  entropic: {
    sendCommand: mockSendCommand,
    getAppPath: mockGetAppPath,
    mkdirp: mockMkdirp,
    onEngineStatus: () => {},
    selectFile: async () => null,
    selectSavePath: async () => '/out.mp4',
    onExportProgress: () => () => {},
  },
}

import { usePerformanceFreezeStore } from '../renderer/stores/performanceFreeze'
import { usePerformanceStore } from '../renderer/stores/performance'
import { useInstrumentsStore } from '../renderer/stores/instruments'
import { useProjectStore } from '../renderer/stores/project'
import type { TriggerEvent } from '../renderer/components/instruments/voiceFSM'

const TRACK = 'perf-track-1'

function mkEvent(frameIndex: number, eventIndex: number): TriggerEvent {
  return {
    frameIndex,
    eventIndex,
    note: 60,
    velocity: 127,
    kind: 'trigger',
    instrumentId: TRACK,
  }
}

function resetAll() {
  usePerformanceFreezeStore.getState().reset()
  usePerformanceStore.getState().panicAll()
  mockSendCommand.mockReset()
  mockGetAppPath.mockReset()
  mockGetAppPath.mockResolvedValue('')
  mockMkdirp.mockReset()
  // Seed an instrument + asset + recorded events on the track so the bake has
  // real voices to scope.
  useInstrumentsStore.setState({
    instruments: {
      [TRACK]: {
        id: TRACK,
        clipId: 'clipA',
        startFrame: 0,
        speed: 1,
        opacity: 1,
        blendMode: 'normal',
      } as any,
    },
    racks: {},
    frameBanks: {},
  })
  useProjectStore.setState({
    assets: {
      clipA: {
        id: 'clipA',
        path: '/home/user/clipA.mp4',
        meta: { width: 1920, height: 1080, duration: 3, fps: 30 },
      } as any,
    },
  })
  usePerformanceStore.setState({ trackEvents: { [TRACK]: [mkEvent(0, 1), mkEvent(40, 2)] } })
}

// ─── Gate FREEZE_BAKE_PLAY ────────────────────────────────────────────────────

describe('Gate FREEZE_BAKE_PLAY: freeze → bake called → frozen clip set → render plays bake', () => {
  beforeEach(resetAll)

  it('[anti-dead-flag] bake is CALLED with the track snapshot and the result wires frozenClipPaths', async () => {
    const bake = vi.fn(async (snap: { trackId: string; events: TriggerEvent[] }) => {
      // The snapshot carries the PRE-freeze events for THIS track.
      expect(snap.trackId).toBe(TRACK)
      expect(snap.events).toHaveLength(2)
      return { clipId: 'baked-clip-1', path: '/runtime/perf-bakes/baked-1.mp4' }
    })
    usePerformanceFreezeStore.getState().setBakeFn(bake)

    const state = await usePerformanceFreezeStore.getState().freezePerformanceTrack(TRACK)

    expect(bake).toHaveBeenCalledTimes(1)
    expect(state).toBe('frozen')
    // The render-path selector inputs are set:
    expect(usePerformanceFreezeStore.getState().isFrozen(TRACK)).toBe(true)
    expect(usePerformanceFreezeStore.getState().getFrozenClipPath(TRACK)).toBe(
      '/runtime/perf-bakes/baked-1.mp4',
    )
  })

  it('[render-branch] the render loop selects the FROZEN clip (not live voices) when isFrozen', async () => {
    usePerformanceFreezeStore
      .getState()
      .setBakeFn(async () => ({ clipId: 'c', path: '/runtime/bake.mp4' }))
    await usePerformanceFreezeStore.getState().freezePerformanceTrack(TRACK)

    // Mirror App.tsx's render-loop branch: a FROZEN track renders its baked clip
    // path INSTEAD of live voices. This is the exact predicate the loop uses.
    const fz = usePerformanceFreezeStore.getState()
    const rendersFrozenClip = fz.isFrozen(TRACK) && !!fz.getFrozenClipPath(TRACK)
    expect(rendersFrozenClip).toBe(true)
    expect(fz.getFrozenClipPath(TRACK)).toBe('/runtime/bake.mp4')
  })

  it('[fail-before] a bake that returns NO path → render loop has nothing to play (frozen but no clip path)', async () => {
    // Models the OLD stub bake (clipId only, no real rendered file). isFrozen is
    // true but the render loop must NOT route to a clip (no path).
    usePerformanceFreezeStore.getState().setBakeFn(async () => ({ clipId: 'stub' }))
    await usePerformanceFreezeStore.getState().freezePerformanceTrack(TRACK)
    const fz = usePerformanceFreezeStore.getState()
    expect(fz.isFrozen(TRACK)).toBe(true)
    expect(fz.getFrozenClipPath(TRACK)).toBeUndefined()
  })
})

// ─── Gate BAKE_IPC (shipped default bake hits the real IPC command) ───────────

describe('Gate BAKE_IPC: the default bake issues bake_performance_track via sendCommand', () => {
  beforeEach(resetAll)

  it('[wired] freezing with the DEFAULT bake calls window.entropic.sendCommand with cmd=bake_performance_track', async () => {
    mockSendCommand.mockResolvedValueOnce({
      ok: true,
      clipId: 'be-clip',
      path: '/runtime/be.mp4',
    })
    // No setBakeFn → uses the shipped defaultBake (after reset()).
    const state = await usePerformanceFreezeStore.getState().freezePerformanceTrack(TRACK)

    expect(mockSendCommand).toHaveBeenCalledTimes(1)
    const arg = mockSendCommand.mock.calls[0][0]
    expect(arg.cmd).toBe('bake_performance_track')
    expect(arg.track_id).toBe(TRACK)
    // The scoped payload carries this track's instrument + its events + asset.
    expect(arg.performance.events.length).toBe(2)
    expect(Object.keys(arg.performance.instruments)).toContain(TRACK)
    expect(arg.performance.assets.clipA.path).toBe('/home/user/clipA.mp4')
    expect(state).toBe('frozen')
    expect(usePerformanceFreezeStore.getState().getFrozenClipPath(TRACK)).toBe(
      '/runtime/be.mp4',
    )
  })

  it('[failure-branch] a non-ok IPC response → bake REJECTS → FSM stays IDLE, voices NOT released', async () => {
    mockSendCommand.mockResolvedValueOnce({ ok: false, error: 'bad' })
    const state = await usePerformanceFreezeStore.getState().freezePerformanceTrack(TRACK)
    expect(state).toBe('idle')
    expect(usePerformanceFreezeStore.getState().isFrozen(TRACK)).toBe(false)
    // Live voices NOT released — the track's events remain in the perf store.
    expect(usePerformanceStore.getState().trackEvents[TRACK]).toHaveLength(2)
  })
})

// ─── Gate UNFREEZE_RESTORES ───────────────────────────────────────────────────

describe('Gate UNFREEZE_RESTORES: unfreeze → live voices, clip discarded', () => {
  beforeEach(resetAll)

  it('[unfreeze] FROZEN → unfreeze clears frozenClipPaths, FSM IDLE, render returns to live voices', async () => {
    usePerformanceFreezeStore
      .getState()
      .setBakeFn(async () => ({ clipId: 'c', path: '/runtime/bake.mp4' }))
    await usePerformanceFreezeStore.getState().freezePerformanceTrack(TRACK)
    expect(usePerformanceFreezeStore.getState().isFrozen(TRACK)).toBe(true)

    const next = usePerformanceFreezeStore.getState().unfreezePerformanceTrack(TRACK)
    expect(next).toBe('idle')
    const fz = usePerformanceFreezeStore.getState()
    expect(fz.isFrozen(TRACK)).toBe(false)
    expect(fz.getFrozenClipPath(TRACK)).toBeUndefined()
    // The render-loop predicate now routes to LIVE voices (not a frozen clip).
    const rendersFrozenClip = fz.isFrozen(TRACK) && !!fz.getFrozenClipPath(TRACK)
    expect(rendersFrozenClip).toBe(false)
  })

  it('[unfreeze-guard] unfreeze on a NON-frozen (idle) track is a no-op', () => {
    const next = usePerformanceFreezeStore.getState().unfreezePerformanceTrack(TRACK)
    expect(next).toBe('idle')
    expect(usePerformanceFreezeStore.getState().isFrozen(TRACK)).toBe(false)
  })
})
