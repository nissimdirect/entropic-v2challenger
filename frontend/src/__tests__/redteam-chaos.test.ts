/**
 * RED TEAM / CHAOS TESTS — Adversarial usage patterns that could corrupt state.
 *
 * Tests cover:
 * 1. Rapid undo/redo cycling (state corruption)
 * 2. Delete while iterating (concurrent mutation)
 * 3. Max capacity stress
 * 4. Invalid state transitions (NaN, Infinity, out-of-range)
 * 5. Double-action conflicts (race-like sequences)
 * 6. Empty state operations (no-ops that must not crash)
 */
import { describe, it, expect, beforeEach } from 'vitest'

// Mock window.entropic before store imports
;(globalThis as any).window = {
  entropic: {
    onEngineStatus: () => {},
    sendCommand: async () => ({ ok: true }),
    selectFile: async () => null,
    selectSavePath: async () => null,
    onExportProgress: () => {},
  },
}

import { useTimelineStore } from '../renderer/stores/timeline'
import { useProjectStore } from '../renderer/stores/project'
import { useUndoStore } from '../renderer/stores/undo'
import { useToastStore } from '../renderer/stores/toast'
import { useAutomationStore } from '../renderer/stores/automation'
import type { Clip, EffectInstance } from '../shared/types'
import { LIMITS } from '../shared/limits'

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: overrides.id ?? `clip-${Math.random().toString(36).slice(2, 8)}`,
    assetId: overrides.assetId ?? 'asset-1',
    trackId: overrides.trackId ?? '',
    position: overrides.position ?? 0,
    duration: overrides.duration ?? 5,
    inPoint: overrides.inPoint ?? 0,
    outPoint: overrides.outPoint ?? 5,
    speed: overrides.speed ?? 1,
  }
}

function makeEffect(id: string, effectId = 'fx.invert'): EffectInstance {
  return {
    id,
    effectId,
    isEnabled: true,
    isFrozen: false,
    parameters: { amount: 0.5 },
    modulations: {},
    mix: 1.0,
    mask: null,
  }
}

function resetAll() {
  useTimelineStore.getState().reset()
  useProjectStore.getState().resetProject()
  useUndoStore.getState().clear()
  useToastStore.getState().clearAll()
  useAutomationStore.getState().resetAutomation()
}

// ─── 1. Rapid undo/redo cycling ─────────────────────────────────────────────

describe('RED TEAM: Rapid undo/redo cycling', () => {
  beforeEach(resetAll)

  it('add 10 effects, undo 10x, redo 10x, undo 5x — chain state is consistent', () => {
    const effects = Array.from({ length: 10 }, (_, i) => makeEffect(`fx-${i}`))
    for (const fx of effects) {
      useProjectStore.getState().addEffect(fx)
    }
    expect(useProjectStore.getState().effectChain).toHaveLength(10)
    expect(useUndoStore.getState().past).toHaveLength(10)

    // Undo all 10
    for (let i = 0; i < 10; i++) {
      useUndoStore.getState().undo()
    }
    expect(useProjectStore.getState().effectChain).toHaveLength(0)
    expect(useUndoStore.getState().past).toHaveLength(0)
    expect(useUndoStore.getState().future).toHaveLength(10)

    // Redo all 10
    for (let i = 0; i < 10; i++) {
      useUndoStore.getState().redo()
    }
    expect(useProjectStore.getState().effectChain).toHaveLength(10)
    expect(useUndoStore.getState().past).toHaveLength(10)
    expect(useUndoStore.getState().future).toHaveLength(0)

    // Undo 5 — should have 5 effects remaining
    for (let i = 0; i < 5; i++) {
      useUndoStore.getState().undo()
    }
    expect(useProjectStore.getState().effectChain).toHaveLength(5)
    expect(useUndoStore.getState().past).toHaveLength(5)
    expect(useUndoStore.getState().future).toHaveLength(5)

    // Verify the first 5 effects are the ones remaining
    const remainingIds = useProjectStore.getState().effectChain.map((e) => e.id)
    expect(remainingIds).toEqual(['fx-0', 'fx-1', 'fx-2', 'fx-3', 'fx-4'])
  })

  it('add effect, modify param, delete, undo all 3 — chain returns to original', () => {
    const fx = makeEffect('fx-abc')
    useProjectStore.getState().addEffect(fx)
    const originalChain = [...useProjectStore.getState().effectChain]

    // Modify parameter
    useProjectStore.getState().updateParam('fx-abc', 'amount', 0.9)
    expect(useProjectStore.getState().effectChain[0].parameters.amount).toBe(0.9)

    // Delete
    useProjectStore.getState().removeEffect('fx-abc')
    expect(useProjectStore.getState().effectChain).toHaveLength(0)

    // Undo delete
    useUndoStore.getState().undo()
    expect(useProjectStore.getState().effectChain).toHaveLength(1)

    // Undo param change
    useUndoStore.getState().undo()
    expect(useProjectStore.getState().effectChain[0].parameters.amount).toBe(0.5)

    // Undo add
    useUndoStore.getState().undo()
    expect(useProjectStore.getState().effectChain).toHaveLength(0)
  })

  it('undo past beginning (empty history) — no-op, no crash', () => {
    expect(useUndoStore.getState().past).toHaveLength(0)

    // Should not throw
    expect(() => useUndoStore.getState().undo()).not.toThrow()
    expect(() => useUndoStore.getState().undo()).not.toThrow()
    expect(() => useUndoStore.getState().undo()).not.toThrow()

    // State unchanged
    expect(useUndoStore.getState().past).toHaveLength(0)
    expect(useUndoStore.getState().future).toHaveLength(0)
  })

  it('redo past end (empty future) — no-op, no crash', () => {
    expect(useUndoStore.getState().future).toHaveLength(0)

    expect(() => useUndoStore.getState().redo()).not.toThrow()
    expect(() => useUndoStore.getState().redo()).not.toThrow()

    expect(useUndoStore.getState().past).toHaveLength(0)
    expect(useUndoStore.getState().future).toHaveLength(0)
  })
})

// ─── 2. Delete while iterating (concurrent mutation) ────────────────────────

describe('RED TEAM: Delete while iterating', () => {
  beforeEach(resetAll)

  it('select 3 clips, delete them all, undo — all 3 return', () => {
    const ts = useTimelineStore.getState()
    const trackId = ts.addTrack('Track 1', '#f00')!

    const clips = [
      makeClip({ id: 'c1', trackId, position: 0 }),
      makeClip({ id: 'c2', trackId, position: 5 }),
      makeClip({ id: 'c3', trackId, position: 10 }),
    ]
    for (const c of clips) ts.addClip(trackId, c)
    // Clear undo from addClip calls
    useUndoStore.getState().clear()

    // Select all 3
    useTimelineStore.getState().selectAllClips()
    expect(useTimelineStore.getState().selectedClipIds).toHaveLength(3)

    // Delete
    useTimelineStore.getState().deleteSelectedClips()
    expect(useTimelineStore.getState().tracks[0].clips).toHaveLength(0)

    // Undo
    useUndoStore.getState().undo()
    const restored = useTimelineStore.getState().tracks[0].clips
    expect(restored).toHaveLength(3)
    const restoredIds = restored.map((c) => c.id).sort()
    expect(restoredIds).toEqual(['c1', 'c2', 'c3'])
  })

  it('delete the only track — timeline is empty, undo restores it', () => {
    const ts = useTimelineStore.getState()
    const trackId = ts.addTrack('Only Track', '#0f0')!
    ts.addClip(trackId, makeClip({ id: 'lonely-clip', trackId }))
    useUndoStore.getState().clear()

    useTimelineStore.getState().removeTrack(trackId)
    expect(useTimelineStore.getState().tracks).toHaveLength(0)

    useUndoStore.getState().undo()
    expect(useTimelineStore.getState().tracks).toHaveLength(1)
    expect(useTimelineStore.getState().tracks[0].id).toBe(trackId)
    expect(useTimelineStore.getState().tracks[0].clips).toHaveLength(1)
  })

  it('delete effect while it has automation lanes — cascade cleanup + undo', () => {
    // Add an effect
    const fx = makeEffect('fx-auto')
    useProjectStore.getState().addEffect(fx)

    // Add automation lane targeting this effect
    const autoStore = useAutomationStore.getState()
    autoStore.addLane('track-1', 'fx-auto', 'amount', '#ff0')
    const lanesBeforeDelete = useAutomationStore.getState().getLanesForEffect('fx-auto')
    expect(lanesBeforeDelete.length).toBeGreaterThan(0)

    useUndoStore.getState().clear()

    // Delete the effect — should cascade-clean automation lanes
    useProjectStore.getState().removeEffect('fx-auto')
    expect(useProjectStore.getState().effectChain).toHaveLength(0)
    const lanesAfterDelete = useAutomationStore.getState().getLanesForEffect('fx-auto')
    expect(lanesAfterDelete).toHaveLength(0)

    // Undo — effect AND automation lane should be restored
    useUndoStore.getState().undo()
    expect(useProjectStore.getState().effectChain).toHaveLength(1)
    const lanesAfterUndo = useAutomationStore.getState().getLanesForEffect('fx-auto')
    expect(lanesAfterUndo.length).toBeGreaterThan(0)
  })
})

// ─── 3. Max capacity stress ─────────────────────────────────────────────────

describe('RED TEAM: Max capacity stress', () => {
  beforeEach(resetAll)

  it('add MAX_EFFECTS_PER_CHAIN effects — toast warning on overflow', () => {
    const max = LIMITS.MAX_EFFECTS_PER_CHAIN // 10

    // Fill to max
    for (let i = 0; i < max; i++) {
      useProjectStore.getState().addEffect(makeEffect(`fx-${i}`))
    }
    expect(useProjectStore.getState().effectChain).toHaveLength(max)

    // Clear toasts to detect the warning
    useToastStore.getState().clearAll()

    // Try to add one more — should be rejected with toast
    useProjectStore.getState().addEffect(makeEffect('fx-overflow'))
    expect(useProjectStore.getState().effectChain).toHaveLength(max)

    const toasts = useToastStore.getState().toasts
    expect(toasts.length).toBeGreaterThan(0)
    const warningToast = toasts.find((t) => t.level === 'warning' && t.message.includes('limit'))
    expect(warningToast).toBeDefined()
  })

  it('add 500+ undo entries — oldest are dropped (MAX_UNDO_ENTRIES)', () => {
    // The MAX is 500. Push 510 undo entries.
    for (let i = 0; i < 510; i++) {
      const fx = makeEffect(`fx-stress-${i}`)
      useProjectStore.getState().addEffect(fx)
    }

    // Should be capped — only 10 in chain (MAX_EFFECTS blocks after 10)
    // But undo entries: first 10 go through, rest are rejected (no undo entry for rejected adds)
    // Let's use a different approach: add/remove tracks which have no cap issue up to 64
    resetAll()

    // Use timeline tracks — MAX_TRACKS is 64 so we need another approach
    // Use updateParam which always succeeds and creates undo entries
    const fx = makeEffect('fx-stress')
    useProjectStore.getState().addEffect(fx)

    // Generate 510 undo entries by updating param
    for (let i = 0; i < 510; i++) {
      useProjectStore.getState().updateParam('fx-stress', 'amount', i / 510)
    }

    // past should be capped at 500 (updateParam entries only, +1 for addEffect)
    const pastLen = useUndoStore.getState().past.length
    expect(pastLen).toBeLessThanOrEqual(500)
    expect(pastLen).toBe(500)
  })

  it('create 20 tracks — all render', () => {
    for (let i = 0; i < 20; i++) {
      useTimelineStore.getState().addTrack(`Track ${i}`, `#${i.toString(16).padStart(3, '0')}`)
    }
    expect(useTimelineStore.getState().tracks).toHaveLength(20)

    // Each track should have unique id and correct name
    const ids = new Set(useTimelineStore.getState().tracks.map((t) => t.id))
    expect(ids.size).toBe(20)
  })
})

// ─── 4. Invalid state transitions ──────────────────────────────────────────

describe('RED TEAM: Invalid state transitions', () => {
  beforeEach(resetAll)

  describe('setClipSpeed boundary values', () => {
    let trackId: string

    beforeEach(() => {
      const ts = useTimelineStore.getState()
      trackId = ts.addTrack('Track 1', '#f00')!
      ts.addClip(trackId, makeClip({ id: 'speed-clip', trackId, speed: 1 }))
      useUndoStore.getState().clear()
    })

    it('setClipSpeed(clipId, NaN) — should reject, not corrupt', () => {
      useTimelineStore.getState().setClipSpeed('speed-clip', NaN)
      const clip = useTimelineStore.getState().tracks[0].clips[0]
      // NaN must not leak into state — should reject (early return preserves original)
      expect(Number.isFinite(clip.speed)).toBe(true)
      expect(clip.speed).toBe(1) // original speed unchanged
    })

    it('setClipSpeed(clipId, Infinity) — should reject', () => {
      useTimelineStore.getState().setClipSpeed('speed-clip', Infinity)
      const clip = useTimelineStore.getState().tracks[0].clips[0]
      expect(Number.isFinite(clip.speed)).toBe(true)
      expect(clip.speed).toBe(1) // original speed unchanged
    })

    it('setClipSpeed(clipId, 0) — should clamp to 0.1', () => {
      useTimelineStore.getState().setClipSpeed('speed-clip', 0)
      const clip = useTimelineStore.getState().tracks[0].clips[0]
      expect(clip.speed).toBe(0.1)
    })

    it('setClipSpeed(clipId, -5) — should clamp to 0.1', () => {
      useTimelineStore.getState().setClipSpeed('speed-clip', -5)
      const clip = useTimelineStore.getState().tracks[0].clips[0]
      expect(clip.speed).toBe(0.1)
    })
  })

  describe('setTrackOpacity boundary values', () => {
    let trackId: string

    beforeEach(() => {
      trackId = useTimelineStore.getState().addTrack('Track 1', '#f00')!
      useUndoStore.getState().clear()
    })

    it('setTrackOpacity(trackId, -1) — should clamp to 0', () => {
      useTimelineStore.getState().setTrackOpacity(trackId, -1)
      const track = useTimelineStore.getState().tracks[0]
      expect(track.opacity).toBe(0)
    })

    it('setTrackOpacity(trackId, 2) — should clamp to 1', () => {
      useTimelineStore.getState().setTrackOpacity(trackId, 2)
      const track = useTimelineStore.getState().tracks[0]
      expect(track.opacity).toBe(1)
    })

    it('setTrackOpacity(trackId, NaN) — should reject, not corrupt', () => {
      const originalOpacity = useTimelineStore.getState().tracks[0].opacity
      useTimelineStore.getState().setTrackOpacity(trackId, NaN)
      const track = useTimelineStore.getState().tracks[0]
      // Should reject — must not be NaN, original value preserved
      expect(Number.isFinite(track.opacity)).toBe(true)
      expect(track.opacity).toBe(originalOpacity)
    })
  })

  describe('setBpm boundary values', () => {
    it('setBpm(NaN) — should reject', () => {
      const original = useProjectStore.getState().bpm
      useProjectStore.getState().setBpm(NaN)
      expect(useProjectStore.getState().bpm).toBe(original)
    })

    it('setBpm(0) — should clamp to 1', () => {
      useProjectStore.getState().setBpm(0)
      expect(useProjectStore.getState().bpm).toBe(1)
    })

    it('setBpm(Infinity) — should reject', () => {
      const original = useProjectStore.getState().bpm
      useProjectStore.getState().setBpm(Infinity)
      expect(useProjectStore.getState().bpm).toBe(original)
    })

    it('setBpm(-120) — should clamp to 1', () => {
      useProjectStore.getState().setBpm(-120)
      expect(useProjectStore.getState().bpm).toBe(1)
    })

    it('setBpm(999) — should clamp to 300', () => {
      useProjectStore.getState().setBpm(999)
      expect(useProjectStore.getState().bpm).toBe(300)
    })
  })

  describe('setMix boundary values', () => {
    beforeEach(() => {
      useProjectStore.getState().addEffect(makeEffect('fx-mix'))
      useUndoStore.getState().clear()
    })

    it('setMix(effectId, -0.5) — should clamp to 0', () => {
      useProjectStore.getState().setMix('fx-mix', -0.5)
      expect(useProjectStore.getState().effectChain[0].mix).toBe(0)
    })

    it('setMix(effectId, 1.5) — should clamp to 1', () => {
      useProjectStore.getState().setMix('fx-mix', 1.5)
      expect(useProjectStore.getState().effectChain[0].mix).toBe(1)
    })
  })
})

// ─── 5. Double-action conflicts ─────────────────────────────────────────────

describe('RED TEAM: Double-action conflicts', () => {
  beforeEach(resetAll)

  it('add effect + immediately delete it — clean state', () => {
    const fx = makeEffect('fx-ephemeral')
    useProjectStore.getState().addEffect(fx)
    expect(useProjectStore.getState().effectChain).toHaveLength(1)

    useProjectStore.getState().removeEffect('fx-ephemeral')
    expect(useProjectStore.getState().effectChain).toHaveLength(0)

    // Undo should restore the effect
    useUndoStore.getState().undo()
    expect(useProjectStore.getState().effectChain).toHaveLength(1)
    expect(useProjectStore.getState().effectChain[0].id).toBe('fx-ephemeral')
  })

  it('selectClip + deleteSelectedClips in same tick — no orphan references', () => {
    const ts = useTimelineStore.getState()
    const trackId = ts.addTrack('Track 1', '#f00')!
    ts.addClip(trackId, makeClip({ id: 'victim', trackId }))
    useUndoStore.getState().clear()

    // Select and immediately delete
    useTimelineStore.getState().selectClip('victim')
    expect(useTimelineStore.getState().selectedClipIds).toContain('victim')

    useTimelineStore.getState().deleteSelectedClips()

    // No clips, no selection, no orphan references
    expect(useTimelineStore.getState().tracks[0].clips).toHaveLength(0)
    expect(useTimelineStore.getState().selectedClipIds).toHaveLength(0)
    expect(useTimelineStore.getState().selectedClipId).toBeNull()
  })

  it('groupEffects + immediately ungroupEffects — chain returns to original', () => {
    const fx1 = makeEffect('fx-g1')
    const fx2 = makeEffect('fx-g2')
    useProjectStore.getState().addEffect(fx1)
    useProjectStore.getState().addEffect(fx2)
    useUndoStore.getState().clear()

    const groupsBefore = { ...useProjectStore.getState().deviceGroups }

    // Group
    const groupId = useProjectStore.getState().groupEffects(['fx-g1', 'fx-g2'], 'Test Group')
    expect(groupId).not.toBeNull()
    expect(Object.keys(useProjectStore.getState().deviceGroups)).toHaveLength(1)

    // Immediately ungroup
    useProjectStore.getState().ungroupEffects(groupId!)
    expect(Object.keys(useProjectStore.getState().deviceGroups)).toHaveLength(0)

    // Effects should still be in chain
    expect(useProjectStore.getState().effectChain).toHaveLength(2)
  })

  it('delete effect that is currently selected — selectedEffectId clears', () => {
    const fx = makeEffect('fx-selected')
    useProjectStore.getState().addEffect(fx)
    useProjectStore.getState().selectEffect('fx-selected')
    expect(useProjectStore.getState().selectedEffectId).toBe('fx-selected')

    useProjectStore.getState().removeEffect('fx-selected')
    expect(useProjectStore.getState().selectedEffectId).toBeNull()
  })

  it('undo after new action — future (redo stack) is cleared', () => {
    const fx1 = makeEffect('fx-a')
    const fx2 = makeEffect('fx-b')
    const fx3 = makeEffect('fx-c')

    useProjectStore.getState().addEffect(fx1)
    useProjectStore.getState().addEffect(fx2)
    useProjectStore.getState().addEffect(fx3)

    // Undo 2 — builds up future stack
    useUndoStore.getState().undo()
    useUndoStore.getState().undo()
    expect(useUndoStore.getState().future).toHaveLength(2)

    // New action — should clear future
    useProjectStore.getState().addEffect(makeEffect('fx-new'))
    expect(useUndoStore.getState().future).toHaveLength(0)
  })
})

// ─── 6. Empty state operations ──────────────────────────────────────────────

describe('RED TEAM: Empty state operations', () => {
  beforeEach(resetAll)

  it('deleteSelectedClips with empty selection — no-op', () => {
    const ts = useTimelineStore.getState()
    const trackId = ts.addTrack('Track 1', '#f00')!
    ts.addClip(trackId, makeClip({ id: 'safe-clip', trackId }))
    useUndoStore.getState().clear()

    // No selection
    useTimelineStore.getState().clearSelection()
    expect(useTimelineStore.getState().selectedClipIds).toHaveLength(0)

    // Attempt delete — should be no-op
    expect(() => useTimelineStore.getState().deleteSelectedClips()).not.toThrow()
    expect(useTimelineStore.getState().tracks[0].clips).toHaveLength(1)

    // No undo entry created
    expect(useUndoStore.getState().past).toHaveLength(0)
  })

  it('copyRegion on empty automation lane — no-op (does not crash)', () => {
    const autoStore = useAutomationStore.getState()
    autoStore.addLane('track-1', 'fx-1', 'amount', '#ff0')
    const lanes = useAutomationStore.getState().getLanesForTrack('track-1')
    const laneId = lanes[0].id

    // Lane has no points — copy should still work without crashing
    expect(() => autoStore.copyRegion('track-1', laneId, 0, 10)).not.toThrow()

    // Clipboard should either be null or have empty points
    const clipboard = useAutomationStore.getState().clipboard
    if (clipboard) {
      expect(clipboard.points).toHaveLength(0)
    }
  })

  it('pasteAtPlayhead with empty clipboard — no-op', () => {
    const autoStore = useAutomationStore.getState()
    autoStore.addLane('track-1', 'fx-1', 'amount', '#ff0')
    const lanes = useAutomationStore.getState().getLanesForTrack('track-1')
    const laneId = lanes[0].id

    // Clipboard is null by default
    expect(useAutomationStore.getState().clipboard).toBeNull()

    // Paste should not crash
    expect(() => autoStore.pasteAtPlayhead('track-1', laneId, 5)).not.toThrow()
  })

  it('duplicateClip on nonexistent clip — no-op', () => {
    const ts = useTimelineStore.getState()
    ts.addTrack('Track 1', '#f00')

    // No clip with this ID exists
    expect(() => ts.duplicateClip('nonexistent-clip-id')).not.toThrow()

    // No undo entry created
    const pastBefore = useUndoStore.getState().past.length
    useTimelineStore.getState().duplicateClip('still-nonexistent')
    expect(useUndoStore.getState().past.length).toBe(pastBefore)
  })

  it('undo when history is empty — no-op', () => {
    expect(useUndoStore.getState().past).toHaveLength(0)
    expect(() => useUndoStore.getState().undo()).not.toThrow()
    expect(useUndoStore.getState().past).toHaveLength(0)
  })

  it('redo when future is empty — no-op', () => {
    expect(useUndoStore.getState().future).toHaveLength(0)
    expect(() => useUndoStore.getState().redo()).not.toThrow()
    expect(useUndoStore.getState().future).toHaveLength(0)
  })

  it('removeEffect on nonexistent ID — no-op', () => {
    const chainBefore = useProjectStore.getState().effectChain.length
    expect(() => useProjectStore.getState().removeEffect('ghost-id')).not.toThrow()
    expect(useProjectStore.getState().effectChain.length).toBe(chainBefore)
  })

  it('removeTrack on nonexistent ID — no-op', () => {
    const tracksBefore = useTimelineStore.getState().tracks.length
    expect(() => useTimelineStore.getState().removeTrack('ghost-track')).not.toThrow()
    expect(useTimelineStore.getState().tracks.length).toBe(tracksBefore)
  })

  it('removeClip on nonexistent ID — no-op', () => {
    expect(() => useTimelineStore.getState().removeClip('ghost-clip')).not.toThrow()
  })

  it('updateParam on nonexistent effect — no-op', () => {
    expect(() => useProjectStore.getState().updateParam('ghost', 'amount', 1)).not.toThrow()
  })

  it('selectEffect(null) — clears selection without crash', () => {
    useProjectStore.getState().selectEffect(null)
    expect(useProjectStore.getState().selectedEffectId).toBeNull()
  })

  it('selectClip(null) — clears selection without crash', () => {
    useTimelineStore.getState().selectClip(null)
    expect(useTimelineStore.getState().selectedClipId).toBeNull()
    expect(useTimelineStore.getState().selectedClipIds).toHaveLength(0)
  })

  it('ungroupEffects on nonexistent group — no-op', () => {
    expect(() => useProjectStore.getState().ungroupEffects('ghost-group')).not.toThrow()
  })

  it('groupEffects with fewer than 2 IDs — rejected with toast', () => {
    useProjectStore.getState().addEffect(makeEffect('fx-solo'))
    useToastStore.getState().clearAll()

    const result = useProjectStore.getState().groupEffects(['fx-solo'])
    expect(result).toBeNull()

    const toasts = useToastStore.getState().toasts
    expect(toasts.some((t) => t.level === 'warning')).toBe(true)
  })
})
