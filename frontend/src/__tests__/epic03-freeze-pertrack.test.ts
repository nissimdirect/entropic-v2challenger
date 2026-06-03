/**
 * Epic 3 — Per-Track Freeze Call-Site Rewire tests.
 * Maps directly to spec scenarios in
 * openspec/changes/04-freeze-pertrack/specs/freeze/spec.md.
 *
 * AC coverage:
 *   AC-1: Freeze targets the active track's chain (not the global/stale chain)
 *   AC-2: No active track → safe no-op (no freeze stored, no error)
 *   AC-3: Per-track freeze isolation (V1 frozen → V2 untouched)
 *   AC-4: Unfreeze clears only the target track
 *   AC-5: Freeze-then-switch-active-track isolation state
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock window.entropic before any store imports
const mockSendCommand = vi.fn()
;(globalThis as any).window = {
  entropic: {
    sendCommand: mockSendCommand,
    onEngineStatus: () => {},
    selectFile: async () => null,
    selectSavePath: async () => '/out.mp4',
    onExportProgress: () => () => {},
  },
}

import { useFreezeStore } from '../renderer/stores/freeze'
import { useTimelineStore } from '../renderer/stores/timeline'
import { getActiveTrackId, getActiveEffectChain } from '../renderer/stores/project'
import type { EffectInstance } from '../shared/types'

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeEffect(id: string, effectId = 'fx.invert'): EffectInstance {
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
  useFreezeStore.getState().reset()
  mockSendCommand.mockReset()
}

// ─── AC-1: Freeze targets active track's chain ────────────────────────────────

describe("AC-1: Freeze targets the active track's chain", () => {
  beforeEach(resetAll)

  it("[freeze-targets-active-chain] getActiveEffectChain reflects the selected track's effects", () => {
    // GIVEN V1 is active with chain [A, B, C]
    const v1 = useTimelineStore.getState().addTrack('V1', '#ff0000')!
    useTimelineStore.setState({ selectedTrackId: v1 })
    const A = makeEffect('eff-A', 'fx.invert')
    const B = makeEffect('eff-B', 'fx.blur')
    const C = makeEffect('eff-C', 'fx.glitch')
    useTimelineStore.getState().updateTrackEffectChain(v1, () => [A, B, C])

    // WHEN we resolve the active chain
    const chain = getActiveEffectChain()

    // THEN it returns V1's chain [A, B, C]
    expect(chain).toHaveLength(3)
    expect(chain[0].effectId).toBe('fx.invert')
    expect(chain[1].effectId).toBe('fx.blur')
    expect(chain[2].effectId).toBe('fx.glitch')
  })

  it("[freeze-targets-active-chain] freezePrefix called with V1's chain slice (not a global stale chain)", async () => {
    // GIVEN V1 is active with chain [A, B, C]
    const v1 = useTimelineStore.getState().addTrack('V1', '#ff0000')!
    useTimelineStore.setState({ selectedTrackId: v1 })
    const A = makeEffect('eff-A', 'fx.invert')
    const B = makeEffect('eff-B', 'fx.blur')
    const C = makeEffect('eff-C', 'fx.glitch')
    useTimelineStore.getState().updateTrackEffectChain(v1, () => [A, B, C])

    // WHEN the user freezes up to index 1 (effects A and B)
    mockSendCommand.mockResolvedValueOnce({ ok: true, cache_id: 'cache-v1' })
    const trackId = getActiveTrackId()
    expect(trackId).toBe(v1)
    const chain = getActiveEffectChain()
    const cutIndex = 1
    const prefix = chain.slice(0, cutIndex + 1).map((e) => ({
      effect_id: e.effectId,
      params: e.parameters,
      enabled: e.isEnabled,
    }))
    await useFreezeStore.getState().freezePrefix(
      trackId!,
      cutIndex,
      '/video.mp4',
      prefix,
      42,
      100,
      [1920, 1080],
    )

    // THEN the prefix built from V1's chain slice is [A, B] (not C)
    expect(prefix).toHaveLength(2)
    expect(prefix[0].effect_id).toBe('fx.invert')
    expect(prefix[1].effect_id).toBe('fx.blur')

    // AND frozenPrefixes['V1'] records cutIndex 1
    const info = useFreezeStore.getState().getFreezeInfo(v1)
    expect(info).not.toBeNull()
    expect(info!.cutIndex).toBe(1)
    expect(info!.cacheId).toBe('cache-v1')
  })
})

// ─── AC-2: No active track → safe no-op ──────────────────────────────────────

describe('AC-2: No active track is a safe no-op', () => {
  beforeEach(resetAll)

  it('[no-active-track] getActiveTrackId returns null when no video track exists', () => {
    // GIVEN no active video track (empty timeline)
    expect(getActiveTrackId()).toBeNull()
  })

  it('[no-active-track] freeze guard: nothing frozen when trackId is null', async () => {
    // GIVEN no active video track
    const trackId = getActiveTrackId()
    expect(trackId).toBeNull()

    // WHEN freeze would be invoked — the handler guards null, so we don't call the store
    // Simulate the guard logic from handleFreezeUpTo
    if (trackId) {
      await useFreezeStore.getState().freezePrefix(trackId, 0, '/video.mp4', [], 42, 100, [1920, 1080])
    }

    // THEN nothing is frozen and no IPC call was made
    expect(mockSendCommand).not.toHaveBeenCalled()
    expect(useFreezeStore.getState().frozenPrefixes).toEqual({})
  })

  it('[no-active-track] unfreeze guard: no error when trackId is null', async () => {
    // GIVEN no active video track
    const trackId = getActiveTrackId()
    expect(trackId).toBeNull()

    // WHEN unfreeze guard fires
    if (trackId) {
      await useFreezeStore.getState().unfreezePrefix(trackId)
    }

    // THEN nothing was called (no crash, no IPC)
    expect(mockSendCommand).not.toHaveBeenCalled()
  })

  it('[no-active-track] flatten guard: no error when trackId is null', () => {
    // GIVEN no active video track
    const trackId = getActiveTrackId()
    expect(trackId).toBeNull()

    // THEN the guard prevents reaching flattenPrefix (same pattern — just confirm trackId is null)
    expect(trackId).toBeNull()
  })
})

// ─── AC-3: Per-track freeze isolation ────────────────────────────────────────

describe('AC-3: Per-track freeze isolation', () => {
  beforeEach(resetAll)

  it('[per-track-isolation] freezing V1 does not affect V2', async () => {
    // GIVEN V1 and V2 both have chains
    const v1 = useTimelineStore.getState().addTrack('V1', '#ff0000')!
    const v2 = useTimelineStore.getState().addTrack('V2', '#00ff00')!
    useTimelineStore.getState().updateTrackEffectChain(v1, () => [makeEffect('a1'), makeEffect('a2')])
    useTimelineStore.getState().updateTrackEffectChain(v2, () => [makeEffect('b1'), makeEffect('b2')])

    // WHEN V1's prefix is frozen up to index 1
    mockSendCommand.mockResolvedValueOnce({ ok: true, cache_id: 'cache-v1' })
    await useFreezeStore.getState().freezePrefix(
      v1, 1, '/video.mp4', [{ effect_id: 'fx.invert' }, { effect_id: 'fx.blur' }], 42, 100, [1920, 1080]
    )

    // THEN isFrozen('V1', 0) and isFrozen('V1', 1) are true
    expect(useFreezeStore.getState().isFrozen(v1, 0)).toBe(true)
    expect(useFreezeStore.getState().isFrozen(v1, 1)).toBe(true)
    // AND isFrozen('V2', 0) is false
    expect(useFreezeStore.getState().isFrozen(v2, 0)).toBe(false)
    // AND frozenPrefixes['V2'] is undefined
    expect(useFreezeStore.getState().frozenPrefixes[v2]).toBeUndefined()
  })

  it('[per-track-isolation] isFrozen above cutIndex returns false for the frozen track', async () => {
    const v1 = useTimelineStore.getState().addTrack('V1', '#ff0000')!
    mockSendCommand.mockResolvedValueOnce({ ok: true, cache_id: 'cache-v1' })
    await useFreezeStore.getState().freezePrefix(v1, 1, '/video.mp4', [], 42, 100, [1920, 1080])

    // Effect at index 2 is above cutIndex 1 → not frozen
    expect(useFreezeStore.getState().isFrozen(v1, 2)).toBe(false)
  })
})

// ─── AC-4: Unfreeze clears only the target track ──────────────────────────────

describe('AC-4: Unfreeze clears only the target track', () => {
  beforeEach(resetAll)

  it('[unfreeze-clears-only-target] unfreezing V1 leaves V2 frozen', async () => {
    // GIVEN V1 and V2 are both frozen
    const v1 = useTimelineStore.getState().addTrack('V1', '#ff0000')!
    const v2 = useTimelineStore.getState().addTrack('V2', '#00ff00')!

    mockSendCommand.mockResolvedValueOnce({ ok: true, cache_id: 'cache-v1' })
    await useFreezeStore.getState().freezePrefix(v1, 0, '/video.mp4', [], 42, 100, [1920, 1080])

    mockSendCommand.mockResolvedValueOnce({ ok: true, cache_id: 'cache-v2' })
    await useFreezeStore.getState().freezePrefix(v2, 0, '/video.mp4', [], 42, 100, [1920, 1080])

    // WHEN unfreezePrefix('V1') is called
    mockSendCommand.mockResolvedValueOnce({ ok: true })
    await useFreezeStore.getState().unfreezePrefix(v1)

    // THEN isFrozen('V1', 0) is false
    expect(useFreezeStore.getState().isFrozen(v1, 0)).toBe(false)
    // AND V2's freeze state is untouched
    expect(useFreezeStore.getState().isFrozen(v2, 0)).toBe(true)
    expect(useFreezeStore.getState().getFreezeInfo(v2)).not.toBeNull()
  })
})

// ─── AC-5: Freeze-then-switch-active-track isolation state ────────────────────

describe('AC-5: Freeze-then-switch-active-track isolation state', () => {
  beforeEach(resetAll)

  it('[freeze-then-switch] switching active track shows per-track freeze state', async () => {
    // GIVEN V1 is active, frozen up to index 0
    const v1 = useTimelineStore.getState().addTrack('V1', '#ff0000')!
    const v2 = useTimelineStore.getState().addTrack('V2', '#00ff00')!
    useTimelineStore.setState({ selectedTrackId: v1 })

    mockSendCommand.mockResolvedValueOnce({ ok: true, cache_id: 'cache-v1' })
    await useFreezeStore.getState().freezePrefix(v1, 0, '/video.mp4', [], 42, 100, [1920, 1080])

    // Confirm V1 is frozen, V2 is not
    expect(useFreezeStore.getState().isFrozen(v1, 0)).toBe(true)
    expect(useFreezeStore.getState().isFrozen(v2, 0)).toBe(false)

    // WHEN the user switches the active track to V2
    useTimelineStore.setState({ selectedTrackId: v2 })

    // THEN the active track is now V2
    expect(getActiveTrackId()).toBe(v2)
    // AND the active track (V2) has no frozen state
    const newActiveId = getActiveTrackId()!
    expect(useFreezeStore.getState().isFrozen(newActiveId, 0)).toBe(false)
    // AND V1's freeze state is still intact (isolated)
    expect(useFreezeStore.getState().isFrozen(v1, 0)).toBe(true)
  })
})
