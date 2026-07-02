/**
 * Epic 4 — Per-Track Export Chain Sourcing tests.
 * Maps directly to spec scenarios in
 * openspec/changes/05-export-pertrack/specs/export/spec.md.
 *
 * AC coverage:
 *   AC-1: Export applies the active track's chain (not the global/stale effectChain)
 *   AC-2: Export with no active video track aborts — "Add a video track before exporting"
 *   AC-3: Multi-track project: export chain == active track's chain (not the other track's)
 *
 * Design note: the export handler in App.tsx reads getActiveEffectChain() at call time.
 * We test the chain-sourcing primitive directly (getActiveEffectChain, getActiveTrackId)
 * plus serializeEffectChain to assert the exact payload that would be sent to export_start.
 * This is the pure-function test the spec calls for (D3).
 */
import { describe, it, expect, beforeEach } from 'vitest'

// Mock window.entropic before any store imports
;(globalThis as any).window = {
  entropic: {
    sendCommand: async () => ({ ok: true }),
    onEngineStatus: () => {},
    selectFile: async () => null,
    selectSavePath: async () => '/out.mp4',
    onExportProgress: () => () => {},
  },
}

import { useTimelineStore } from '../renderer/stores/timeline'
import { useProjectStore, getActiveTrackId, getActiveEffectChain } from '../renderer/stores/project'
import { serializeEffectChain } from '../shared/ipc-serialize'
import type { EffectInstance } from '../shared/types'

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeEffect(id: string, effectId = 'fx.color_invert'): EffectInstance {
  return {
    id,
    effectId,
    isEnabled: true,
    isFrozen: false,
    parameters: { amount: 1.0 },
    modulations: {},
    mix: 1.0,
    mask: null,
  }
}

function resetAll() {
  useTimelineStore.getState().reset()
  useProjectStore.setState({
    effectChain: [],
    deviceGroups: {},
    selectedEffectId: null,
    assets: {},
    currentFrame: 0,
    totalFrames: 0,
    isIngesting: false,
    ingestError: null,
    projectPath: null,
    projectName: 'Test',
  })
}

/**
 * Pure helper that mirrors the export handler's chain-sourcing logic:
 *   const activeExportChain = getActiveEffectChain()
 *   chain: serializeEffectChain(activeExportChain)
 * Returns null when getActiveTrackId() is null (guard fires → abort).
 */
function resolveExportChainPayload() {
  if (getActiveTrackId() === null) return null
  return serializeEffectChain(getActiveEffectChain())
}

// ─── AC-1: Export applies the active track's chain ────────────────────────────

describe("AC-1: Export applies the active track's chain (not the global effectChain)", () => {
  beforeEach(resetAll)

  it('[export-applies-active-chain] active track chain is used; global effectChain (empty) is NOT', () => {
    // GIVEN V1 is active with chain [color_invert]
    const v1 = useTimelineStore.getState().addTrack('V1', '#ff0000')!
    useTimelineStore.setState({ selectedTrackId: v1 })
    const fx = makeEffect('eff-1', 'fx.color_invert')
    useTimelineStore.getState().updateTrackEffectChain(v1, () => [fx])

    // AND the global effectChain is empty (as it is after Epic 1)
    expect(useProjectStore.getState().effectChain).toHaveLength(0)

    // WHEN the export handler resolves its chain payload
    const payload = resolveExportChainPayload()

    // THEN the payload is NOT null (no abort)
    expect(payload).not.toBeNull()

    // AND the payload contains the active track's effect (color_invert), not the empty global
    expect(payload).toHaveLength(1)
    expect(payload![0].effect_id).toBe('fx.color_invert')
  })

  it('[export-applies-active-chain] serialized payload matches serializeEffectChain of active track chain', () => {
    // GIVEN V1 is active with chain [A, B]
    const v1 = useTimelineStore.getState().addTrack('V1', '#ff0000')!
    useTimelineStore.setState({ selectedTrackId: v1 })
    const A = makeEffect('eff-A', 'fx.color_invert')
    const B = makeEffect('eff-B', 'fx.brightness_exposure')
    useTimelineStore.getState().updateTrackEffectChain(v1, () => [A, B])

    // WHEN the export handler resolves its chain payload
    const payload = resolveExportChainPayload()

    // THEN the payload equals serializeEffectChain(V1's chain)
    const v1Chain = useTimelineStore.getState().tracks.find((t) => t.id === v1)!.effectChain
    const expected = serializeEffectChain(v1Chain)
    expect(payload).toEqual(expected)
  })
})

// ─── AC-2: Export with no active track aborts ────────────────────────────────

describe('AC-2: Export with no active video track aborts cleanly', () => {
  beforeEach(resetAll)

  it('[export-no-active-track-aborts] resolveExportChainPayload returns null when no video track exists', () => {
    // GIVEN no video tracks (only audio tracks, or empty timeline)
    useTimelineStore.getState().addAudioTrack('Audio1')
    useTimelineStore.setState({ selectedTrackId: null })

    // WHEN the export handler checks the guard
    expect(getActiveTrackId()).toBeNull()
    const payload = resolveExportChainPayload()

    // THEN the payload is null → export aborts (mirrors: "Add a video track before exporting")
    expect(payload).toBeNull()
  })

  it('[export-no-active-track-aborts] empty timeline returns null payload', () => {
    // GIVEN no tracks at all
    expect(useTimelineStore.getState().tracks).toHaveLength(0)
    expect(getActiveTrackId()).toBeNull()

    const payload = resolveExportChainPayload()
    expect(payload).toBeNull()
  })
})

// ─── AC-3: Multi-track project exports the active track's chain ───────────────

describe("AC-3: Multi-track project exports the active track's source + chain", () => {
  beforeEach(resetAll)

  it('[multi-track-exports-active-chain] V1 active → export chain is V1s chain, not V2s', () => {
    // GIVEN V1 with chain [color_invert] and V2 with chain [brightness_exposure]
    const v1 = useTimelineStore.getState().addTrack('V1', '#ff0000')!
    const v2 = useTimelineStore.getState().addTrack('V2', '#00ff00')!
    useTimelineStore.getState().updateTrackEffectChain(v1, () => [makeEffect('fx1', 'fx.color_invert')])
    useTimelineStore.getState().updateTrackEffectChain(v2, () => [makeEffect('fx2', 'fx.brightness_exposure')])

    // WHEN V1 is the active track
    useTimelineStore.setState({ selectedTrackId: v1 })

    // THEN the export chain payload is V1's chain (color_invert)
    const payload = resolveExportChainPayload()
    expect(payload).not.toBeNull()
    expect(payload).toHaveLength(1)
    expect(payload![0].effect_id).toBe('fx.color_invert')
  })

  it('[multi-track-exports-active-chain] V2 active → export chain is V2s chain, not V1s', () => {
    // GIVEN V1 with chain [color_invert] and V2 with chain [brightness_exposure]
    const v1 = useTimelineStore.getState().addTrack('V1', '#ff0000')!
    const v2 = useTimelineStore.getState().addTrack('V2', '#00ff00')!
    useTimelineStore.getState().updateTrackEffectChain(v1, () => [makeEffect('fx1', 'fx.color_invert')])
    useTimelineStore.getState().updateTrackEffectChain(v2, () => [makeEffect('fx2', 'fx.brightness_exposure')])

    // WHEN V2 is the active track
    useTimelineStore.setState({ selectedTrackId: v2 })

    // THEN the export chain payload is V2's chain (brightness_exposure), not V1's
    const payload = resolveExportChainPayload()
    expect(payload).not.toBeNull()
    expect(payload).toHaveLength(1)
    expect(payload![0].effect_id).toBe('fx.brightness_exposure')
  })

  it('[multi-track-exports-active-chain] switching active track changes the export chain', () => {
    // GIVEN two tracks with distinct chains
    const v1 = useTimelineStore.getState().addTrack('V1', '#ff0000')!
    const v2 = useTimelineStore.getState().addTrack('V2', '#00ff00')!
    useTimelineStore.getState().updateTrackEffectChain(v1, () => [makeEffect('fx1', 'fx.color_invert')])
    useTimelineStore.getState().updateTrackEffectChain(v2, () => [makeEffect('fx2', 'fx.brightness_exposure')])

    // WHEN V1 is active, then switch to V2
    useTimelineStore.setState({ selectedTrackId: v1 })
    const payloadV1 = resolveExportChainPayload()

    useTimelineStore.setState({ selectedTrackId: v2 })
    const payloadV2 = resolveExportChainPayload()

    // THEN the payloads differ — each reflects its own track's chain
    expect(payloadV1![0].effect_id).toBe('fx.color_invert')
    expect(payloadV2![0].effect_id).toBe('fx.brightness_exposure')
    expect(payloadV1).not.toEqual(payloadV2)
  })
})
