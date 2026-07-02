/**
 * track-lifecycle.test.ts — Guard tests for Epic 1.5 track-lifecycle-integrity.
 *
 * Converted from tiger-repro.test.ts: tests now assert CORRECT behavior.
 * Every scenario in openspec/changes/02-track-lifecycle-integrity/specs/track-lifecycle/spec.md
 * is covered. TIGER 1 and TIGER 2 bugs are proven fixed.
 *
 * Test naming follows spec scenario labels:
 *   [track-lifecycle/<Scenario name>]
 *
 * D6: TIGER 2 assertions target useAutomationStore.lanes[newTrackId] (canonical),
 * NOT Track.automationLanes (vestigial).
 */
import { describe, it, expect, beforeEach } from 'vitest'

;(globalThis as any).window = {
  entropic: {
    onEngineStatus: () => {},
    sendCommand: async () => ({ ok: true }),
    selectFile: async () => null,
    selectSavePath: async () => null,
    onExportProgress: () => {},
  },
}

import { useTimelineStore } from '../../renderer/stores/timeline'
import { useAutomationStore } from '../../renderer/stores/automation'
import { useOperatorStore } from '../../renderer/stores/operators'
import { useMIDIStore } from '../../renderer/stores/midi'
import { useProjectStore } from '../../renderer/stores/project'
import { useUndoStore } from '../../renderer/stores/undo'
import { useInstrumentsStore } from '../../renderer/stores/instruments'
import type { EffectInstance, AutomationLane } from '../../shared/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fx(id: string): EffectInstance {
  return {
    id,
    effectId: 'fx.pixelsort',
    isEnabled: true,
    isFrozen: false,
    parameters: { threshold: 0.5 },
    modulations: {},
    mix: 1,
    mask: null,
  }
}

function lane(id: string, paramPath: string): AutomationLane {
  return { id, paramPath, color: '#4ade80', isVisible: true, points: [], mode: 'smooth' }
}

function resetAll() {
  useUndoStore.getState().clear()
  useProjectStore.getState().resetProject()
  useTimelineStore.getState().reset()
  useOperatorStore.setState({ operators: [] })
  useAutomationStore.setState({ lanes: {} })
  useMIDIStore.setState({ ccMappings: [] })
  useInstrumentsStore.setState({ instruments: {}, racks: {}, frameBanks: {}, granulators: {} })
}

// ---------------------------------------------------------------------------
// TIGER 1 scenarios: removeTrack cleans cross-store state
// ---------------------------------------------------------------------------

describe('[track-lifecycle/Delete prunes dependents]', () => {
  beforeEach(resetAll)

  it('removeTrack removes automation lanes[trackId] from automation store', () => {
    const tid = useTimelineStore.getState().addTrack('V1', '#4ade80')!
    expect(tid).toBeTruthy()

    // Add a lane directly to the store (canonical path)
    useAutomationStore.setState({
      lanes: {
        [tid]: [lane('lane-1', 'fx-A.threshold')],
      },
    })
    expect(useAutomationStore.getState().lanes[tid]?.length).toBe(1)

    useTimelineStore.getState().removeTrack(tid)

    // GUARD (was BUG): lanes[tid] must be cleaned up
    expect(useAutomationStore.getState().lanes[tid]).toBeUndefined()
    expect(useTimelineStore.getState().tracks.find((t) => t.id === tid)).toBeUndefined()
  })

  it('removeTrack removes operator mappings targeting the track\'s effects', () => {
    const tid = useTimelineStore.getState().addTrack('V1', '#4ade80')!
    // Inject a track with an effect directly into store state
    useTimelineStore.setState({
      tracks: useTimelineStore.getState().tracks.map((t) =>
        t.id === tid ? { ...t, effectChain: [fx('fx-E')] } : t,
      ),
    })

    useOperatorStore.setState({
      operators: [
        {
          id: 'op-1',
          type: 'lfo',
          label: 'LFO',
          isEnabled: true,
          parameters: {},
          processing: [],
          mappings: [
            { targetEffectId: 'fx-E', targetParamKey: 'threshold', depth: 1, min: 0, max: 1, curve: 'linear' },
            { targetEffectId: 'fx-other', targetParamKey: 'mix', depth: 1, min: 0, max: 1, curve: 'linear' },
          ],
        },
      ],
    })

    useTimelineStore.getState().removeTrack(tid)

    const ops = useOperatorStore.getState().operators
    // Mapping to fx-E (on deleted track) must be gone
    expect(ops[0].mappings.find((m) => m.targetEffectId === 'fx-E')).toBeUndefined()
    // Mapping to fx-other (unrelated) must survive
    expect(ops[0].mappings.find((m) => m.targetEffectId === 'fx-other')).toBeDefined()
  })

  it('removeTrack removes CC mappings targeting the track\'s effects', () => {
    const tid = useTimelineStore.getState().addTrack('V1', '#4ade80')!
    useTimelineStore.setState({
      tracks: useTimelineStore.getState().tracks.map((t) =>
        t.id === tid ? { ...t, effectChain: [fx('fx-E')] } : t,
      ),
    })

    useMIDIStore.setState({
      ccMappings: [
        { cc: 7, effectId: 'fx-E', paramKey: 'threshold' },
        { cc: 8, effectId: 'fx-other', paramKey: 'mix' },
      ],
    })

    useTimelineStore.getState().removeTrack(tid)

    const mappings = useMIDIStore.getState().ccMappings
    expect(mappings.find((m) => m.effectId === 'fx-E')).toBeUndefined()
    expect(mappings.find((m) => m.effectId === 'fx-other')).toBeDefined()
  })

  it('removeTrack deletes a device group that falls below 2 members after prune', () => {
    const tid = useTimelineStore.getState().addTrack('V1', '#4ade80')!
    useTimelineStore.setState({
      tracks: useTimelineStore.getState().tracks.map((t) =>
        t.id === tid ? { ...t, effectChain: [fx('fx-E')] } : t,
      ),
    })

    // 2-member group containing fx-E: pruning drops it to 1 → delete
    useProjectStore.setState({
      deviceGroups: {
        'grp-1': { name: 'Group 1', effectIds: ['fx-E', 'fx-other'], mix: 1, isEnabled: true },
      },
    })

    useTimelineStore.getState().removeTrack(tid)

    // Group fell below 2 members → deleted
    expect(useProjectStore.getState().deviceGroups['grp-1']).toBeUndefined()
  })

  it('[track-lifecycle/Delete prunes dependents] full scenario: lane + operator + CC + device group all pruned', () => {
    const tid = useTimelineStore.getState().addTrack('V1', '#4ade80')!
    useTimelineStore.setState({
      tracks: useTimelineStore.getState().tracks.map((t) =>
        t.id === tid ? { ...t, effectChain: [fx('fx-E')] } : t,
      ),
    })
    useAutomationStore.setState({
      lanes: { [tid]: [lane('lane-1', 'fx-E.threshold')] },
    })
    useOperatorStore.setState({
      operators: [{
        id: 'op-1', type: 'lfo', label: 'LFO', isEnabled: true, parameters: {}, processing: [],
        mappings: [{ targetEffectId: 'fx-E', targetParamKey: 'threshold', depth: 1, min: 0, max: 1, curve: 'linear' }],
      }],
    })
    useMIDIStore.setState({ ccMappings: [{ cc: 7, effectId: 'fx-E', paramKey: 'threshold' }] })
    useProjectStore.setState({
      deviceGroups: { 'grp-1': { name: 'G', effectIds: ['fx-E', 'fx-x'], mix: 1, isEnabled: true } },
    })

    useTimelineStore.getState().removeTrack(tid)

    expect(useAutomationStore.getState().lanes[tid]).toBeUndefined()
    expect(useOperatorStore.getState().operators[0].mappings).toHaveLength(0)
    expect(useMIDIStore.getState().ccMappings).toHaveLength(0)
    expect(useProjectStore.getState().deviceGroups['grp-1']).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// TIGER 1 undo scenario
// ---------------------------------------------------------------------------

describe('[track-lifecycle/Delete cleanup is one undo step]', () => {
  beforeEach(resetAll)

  it('undo after removeTrack restores track AND all cross-store dependents in one step', () => {
    const tid = useTimelineStore.getState().addTrack('V1', '#4ade80')!
    useTimelineStore.setState({
      tracks: useTimelineStore.getState().tracks.map((t) =>
        t.id === tid ? { ...t, effectChain: [fx('fx-E')] } : t,
      ),
    })
    useAutomationStore.setState({
      lanes: { [tid]: [lane('lane-1', 'fx-E.threshold')] },
    })
    useOperatorStore.setState({
      operators: [{
        id: 'op-1', type: 'lfo', label: 'LFO', isEnabled: true, parameters: {}, processing: [],
        mappings: [{ targetEffectId: 'fx-E', targetParamKey: 'threshold', depth: 1, min: 0, max: 1, curve: 'linear' }],
      }],
    })
    useMIDIStore.setState({ ccMappings: [{ cc: 7, effectId: 'fx-E', paramKey: 'threshold' }] })
    useProjectStore.setState({
      deviceGroups: { 'grp-1': { name: 'G', effectIds: ['fx-E', 'fx-x'], mix: 1, isEnabled: true } },
    })

    // Clear undo stack from setup (addTrack + setState calls are not undoable,
    // but addTrack push one entry)
    useUndoStore.getState().clear()

    useTimelineStore.getState().removeTrack(tid)

    // Verify everything was cleaned up
    expect(useTimelineStore.getState().tracks.find((t) => t.id === tid)).toBeUndefined()
    expect(useAutomationStore.getState().lanes[tid]).toBeUndefined()
    expect(useOperatorStore.getState().operators[0].mappings).toHaveLength(0)
    expect(useMIDIStore.getState().ccMappings).toHaveLength(0)
    expect(useProjectStore.getState().deviceGroups['grp-1']).toBeUndefined()

    // ONE undo step restores everything
    useUndoStore.getState().undo()

    expect(useTimelineStore.getState().tracks.find((t) => t.id === tid)).toBeDefined()
    expect(useAutomationStore.getState().lanes[tid]).toHaveLength(1)
    expect(useAutomationStore.getState().lanes[tid]![0].paramPath).toBe('fx-E.threshold')
    expect(useOperatorStore.getState().operators[0].mappings).toHaveLength(1)
    expect(useOperatorStore.getState().operators[0].mappings[0].targetEffectId).toBe('fx-E')
    expect(useMIDIStore.getState().ccMappings).toHaveLength(1)
    expect(useMIDIStore.getState().ccMappings[0].effectId).toBe('fx-E')
    expect(useProjectStore.getState().deviceGroups['grp-1']).toBeDefined()
    expect(useProjectStore.getState().deviceGroups['grp-1'].effectIds).toContain('fx-E')
  })
})

// ---------------------------------------------------------------------------
// Empty-chain track scenario (no-op safe)
// ---------------------------------------------------------------------------

describe('[track-lifecycle/Deleting an empty-chain track is a safe no-op for cleanup]', () => {
  beforeEach(resetAll)

  it('removeTrack on a track with empty effectChain and no lanes throws no error', () => {
    const tid = useTimelineStore.getState().addTrack('V2', '#ff0000')!
    // Track has empty effectChain (default) and no lanes
    expect(useTimelineStore.getState().tracks.find((t) => t.id === tid)!.effectChain).toHaveLength(0)
    expect(useAutomationStore.getState().lanes[tid]).toBeUndefined()

    // Set up another track's dependents — must remain untouched
    const otherId = useTimelineStore.getState().addTrack('V3', '#00ff00')!
    useAutomationStore.setState({
      lanes: { [otherId]: [lane('lane-other', 'fx-other.threshold')] },
    })

    expect(() => useTimelineStore.getState().removeTrack(tid)).not.toThrow()

    // Deleted
    expect(useTimelineStore.getState().tracks.find((t) => t.id === tid)).toBeUndefined()
    // Other track's lanes untouched
    expect(useAutomationStore.getState().lanes[otherId]).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// TIGER 2 scenarios: duplicateTrack carries automation, re-keyed
// ---------------------------------------------------------------------------

describe('[track-lifecycle/Duplicate carries re-keyed automation]', () => {
  beforeEach(resetAll)

  it('duplicateTrack writes lanes[newTrackId] to automation store with re-keyed paramPaths', () => {
    const srcId = useTimelineStore.getState().addTrack('V1', '#4ade80')!
    // Inject a source track with effect fx-X
    useTimelineStore.setState({
      tracks: useTimelineStore.getState().tracks.map((t) =>
        t.id === srcId ? { ...t, effectChain: [fx('fx-X')] } : t,
      ),
    })

    // Set canonical store lanes for the source
    useAutomationStore.setState({
      lanes: { [srcId]: [lane('lane-src', 'fx-X.threshold')] },
    })

    useTimelineStore.getState().duplicateTrack(srcId)

    const copy = useTimelineStore.getState().tracks.find((t) => t.name === 'V1 (Copy)')
    expect(copy).toBeDefined()
    const newTrackId = copy!.id
    const newEffectId = copy!.effectChain[0].id

    // New effect id must be different from source
    expect(newEffectId).not.toBe('fx-X')

    // D6 canonical assertion: useAutomationStore.lanes[newTrackId] must exist
    const newLanes = useAutomationStore.getState().lanes[newTrackId]
    expect(newLanes).toBeDefined()
    expect(newLanes).toHaveLength(1)

    // paramPath references the COPY's new effect id (not the source 'fx-X')
    expect(newLanes![0].paramPath).toBe(`${newEffectId}.threshold`)
    expect(newLanes![0].paramPath.startsWith('fx-X.')).toBe(false)

    // Lane id is fresh
    expect(newLanes![0].id).not.toBe('lane-src')
  })

  it('source track\'s store lanes are unchanged after duplicate', () => {
    const srcId = useTimelineStore.getState().addTrack('V1', '#4ade80')!
    useTimelineStore.setState({
      tracks: useTimelineStore.getState().tracks.map((t) =>
        t.id === srcId ? { ...t, effectChain: [fx('fx-X')] } : t,
      ),
    })
    useAutomationStore.setState({
      lanes: { [srcId]: [lane('lane-src', 'fx-X.threshold')] },
    })

    useTimelineStore.getState().duplicateTrack(srcId)

    // Source lanes remain intact
    const srcLanes = useAutomationStore.getState().lanes[srcId]
    expect(srcLanes).toHaveLength(1)
    expect(srcLanes![0].paramPath).toBe('fx-X.threshold')
  })
})

// ---------------------------------------------------------------------------
// TIGER 2 no-dangling-references scenario
// ---------------------------------------------------------------------------

describe('[track-lifecycle/Duplicate creates no dangling references]', () => {
  beforeEach(resetAll)

  it('every paramPath in duplicate\'s lanes references an effect id that exists on the duplicate', () => {
    const srcId = useTimelineStore.getState().addTrack('V1', '#4ade80')!
    useTimelineStore.setState({
      tracks: useTimelineStore.getState().tracks.map((t) =>
        t.id === srcId
          ? { ...t, effectChain: [fx('fx-X'), fx('fx-Y')] }
          : t,
      ),
    })
    useAutomationStore.setState({
      lanes: {
        [srcId]: [
          lane('lane-1', 'fx-X.threshold'),
          lane('lane-2', 'fx-Y.mix'),
        ],
      },
    })

    useTimelineStore.getState().duplicateTrack(srcId)

    const copy = useTimelineStore.getState().tracks.find((t) => t.name === 'V1 (Copy)')!
    const copyEffectIds = new Set(copy.effectChain.map((e) => e.id))
    const newLanes = useAutomationStore.getState().lanes[copy.id] ?? []

    // Every lane's paramPath prefix must be a real effect id on the copy
    for (const l of newLanes) {
      const prefix = l.paramPath.split('.')[0]
      expect(copyEffectIds.has(prefix)).toBe(true)
    }

    // No operator/CC mapping references the copy's new effect ids (D5: deliberately unmapped)
    const allMappingTargets = useOperatorStore
      .getState()
      .operators.flatMap((op) => op.mappings.map((m) => m.targetEffectId))
    for (const eid of copyEffectIds) {
      expect(allMappingTargets.includes(eid)).toBe(false)
    }
    const ccTargets = useMIDIStore.getState().ccMappings.map((m) => m.effectId)
    for (const eid of copyEffectIds) {
      expect(ccTargets.includes(eid)).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// Duplicate with no automation (no-crash scenario)
// ---------------------------------------------------------------------------

describe('[track-lifecycle/Duplicating a track with no automation does not crash]', () => {
  beforeEach(resetAll)

  it('duplicateTrack on a track with effects but zero store lanes creates duplicate with no lanes', () => {
    const srcId = useTimelineStore.getState().addTrack('V3', '#4ade80')!
    useTimelineStore.setState({
      tracks: useTimelineStore.getState().tracks.map((t) =>
        t.id === srcId ? { ...t, effectChain: [fx('fx-Z')] } : t,
      ),
    })
    // No lanes for srcId

    expect(() => useTimelineStore.getState().duplicateTrack(srcId)).not.toThrow()

    const copy = useTimelineStore.getState().tracks.find((t) => t.name === 'V3 (Copy)')
    expect(copy).toBeDefined()

    // No lanes created for the duplicate
    const newLanes = useAutomationStore.getState().lanes[copy!.id]
    expect(newLanes).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Undo for duplicateTrack removes new store lanes
// ---------------------------------------------------------------------------

describe('[track-lifecycle/duplicateTrack undo removes new store lanes]', () => {
  beforeEach(resetAll)

  it('undo after duplicateTrack removes lanes[newTrackId] from automation store', () => {
    const srcId = useTimelineStore.getState().addTrack('V1', '#4ade80')!
    useTimelineStore.setState({
      tracks: useTimelineStore.getState().tracks.map((t) =>
        t.id === srcId ? { ...t, effectChain: [fx('fx-X')] } : t,
      ),
    })
    useAutomationStore.setState({
      lanes: { [srcId]: [lane('lane-src', 'fx-X.threshold')] },
    })

    useUndoStore.getState().clear()
    useTimelineStore.getState().duplicateTrack(srcId)

    const copy = useTimelineStore.getState().tracks.find((t) => t.name === 'V1 (Copy)')!
    const newTrackId = copy.id
    expect(useAutomationStore.getState().lanes[newTrackId]).toBeDefined()

    useUndoStore.getState().undo()

    // Track removed
    expect(useTimelineStore.getState().tracks.find((t) => t.id === newTrackId)).toBeUndefined()
    // Lanes removed from store
    expect(useAutomationStore.getState().lanes[newTrackId]).toBeUndefined()
    // Source lanes unaffected
    expect(useAutomationStore.getState().lanes[srcId]).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// D6 consistency: vestigial Track.automationLanes is re-keyed too
// ---------------------------------------------------------------------------

describe('[track-lifecycle/Track.automationLanes re-keyed on duplicate (vestigial consistency)]', () => {
  beforeEach(resetAll)

  it('cloned Track.automationLanes paramPaths reference the copy\'s new effect ids', () => {
    // NOTE: Track.automationLanes is vestigial — the canonical state is useAutomationStore.
    // This test documents that the field is re-keyed for consistency (D6 consistency assertion).
    const base = useTimelineStore.getState().tracks
    const srcTrack = {
      id: 'src', type: 'video' as const, name: 'V1', color: '#4ade80',
      isMuted: false, isSoloed: false, opacity: 1, blendMode: 'normal' as const,
      clips: [],
      effectChain: [fx('fx-X')],
      automationLanes: [lane('lane-1', 'fx-X.threshold')],
    }
    useTimelineStore.setState({ tracks: [...base, srcTrack] })

    useTimelineStore.getState().duplicateTrack('src')

    const copy = useTimelineStore.getState().tracks.find((t) => t.name === 'V1 (Copy)')!
    expect(copy).toBeDefined()

    const newEffectId = copy.effectChain[0].id
    expect(newEffectId).not.toBe('fx-X')

    // The vestigial Track.automationLanes is re-keyed
    expect(copy.automationLanes[0].paramPath).toBe(`${newEffectId}.threshold`)
    expect(copy.automationLanes[0].paramPath.startsWith('fx-X.')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Multi-effect track with full cross-store state (comprehensive prune scenario)
// ---------------------------------------------------------------------------

describe('[track-lifecycle/multi-effect track delete with full prune]', () => {
  beforeEach(resetAll)

  it('removeTrack on a multi-effect track prunes all effect refs across all stores', () => {
    const tid = useTimelineStore.getState().addTrack('V1', '#4ade80')!
    useTimelineStore.setState({
      tracks: useTimelineStore.getState().tracks.map((t) =>
        t.id === tid ? { ...t, effectChain: [fx('fx-A'), fx('fx-B')] } : t,
      ),
    })

    useAutomationStore.setState({
      lanes: {
        [tid]: [
          lane('l1', 'fx-A.threshold'),
          lane('l2', 'fx-B.mix'),
          lane('l3', 'master.volume'), // not effect-prefixed — still pruned via dropTrackLanes
        ],
      },
    })
    useOperatorStore.setState({
      operators: [{
        id: 'op-1', type: 'lfo', label: 'LFO', isEnabled: true, parameters: {}, processing: [],
        mappings: [
          { targetEffectId: 'fx-A', targetParamKey: 'threshold', depth: 1, min: 0, max: 1, curve: 'linear' },
          { targetEffectId: 'fx-B', targetParamKey: 'mix', depth: 1, min: 0, max: 1, curve: 'linear' },
          { targetEffectId: 'fx-keep', targetParamKey: 'x', depth: 1, min: 0, max: 1, curve: 'linear' },
        ],
      }],
    })
    useMIDIStore.setState({
      ccMappings: [
        { cc: 1, effectId: 'fx-A', paramKey: 'threshold' },
        { cc: 2, effectId: 'fx-B', paramKey: 'mix' },
        { cc: 3, effectId: 'fx-keep', paramKey: 'x' },
      ],
    })
    useProjectStore.setState({
      deviceGroups: {
        'grp-1': { name: 'G', effectIds: ['fx-A', 'fx-B'], mix: 1, isEnabled: true }, // 2-member → delete
        'grp-2': { name: 'H', effectIds: ['fx-A', 'fx-keep', 'fx-extra'], mix: 1, isEnabled: true }, // 3-member → survives pruned
      },
    })

    useTimelineStore.getState().removeTrack(tid)

    // All three lanes deleted (via dropTrackLanes bucket)
    expect(useAutomationStore.getState().lanes[tid]).toBeUndefined()

    // Operator mappings to fx-A and fx-B gone; fx-keep survives
    const ops = useOperatorStore.getState().operators
    expect(ops[0].mappings).toHaveLength(1)
    expect(ops[0].mappings[0].targetEffectId).toBe('fx-keep')

    // CC mappings to fx-A and fx-B gone; fx-keep survives
    const cc = useMIDIStore.getState().ccMappings
    expect(cc).toHaveLength(1)
    expect(cc[0].effectId).toBe('fx-keep')

    // grp-1 had only fx-A + fx-B (both gone) → deleted
    expect(useProjectStore.getState().deviceGroups['grp-1']).toBeUndefined()

    // grp-2 had fx-A removed → 2 remaining (fx-keep + fx-extra) → survives
    const grp2 = useProjectStore.getState().deviceGroups['grp-2']
    expect(grp2).toBeDefined()
    expect(grp2.effectIds).not.toContain('fx-A')
    expect(grp2.effectIds).toContain('fx-keep')
    expect(grp2.effectIds).toContain('fx-extra')
  })
})

// ---------------------------------------------------------------------------
// audit #10 — removeGranulator + removeFrameBank called on track delete (leak fix)
// ---------------------------------------------------------------------------

describe('[track-lifecycle/removeGranulator clears the track\'s granulator from the store]', () => {
  beforeEach(resetAll)

  it('removeGranulator clears the track\'s granulator from the store', () => {
    const tid = useTimelineStore.getState().addTrack('V-gran', '#4ade80')!
    useInstrumentsStore.getState().addGranulator(tid)
    expect(useInstrumentsStore.getState().granulators[tid]).toBeDefined()

    useInstrumentsStore.getState().removeGranulator(tid)
    expect(useInstrumentsStore.getState().granulators[tid]).toBeUndefined()
  })

  it('deleting a track with a granulator removes its instrument state (regression — audit #10)', () => {
    const tid = useTimelineStore.getState().addTrack('V-gran', '#ef4444')!
    useInstrumentsStore.getState().addGranulator(tid)
    expect(useInstrumentsStore.getState().granulators[tid]).toBeDefined()

    useTimelineStore.getState().removeTrack(tid)

    // GUARD (was leak): granulator entry must be removed when the track is deleted.
    expect(useInstrumentsStore.getState().granulators[tid]).toBeUndefined()
    expect(useTimelineStore.getState().tracks.find((t) => t.id === tid)).toBeUndefined()
  })

  it('deleting a track with a frameBank removes its frameBank state (regression — audit #10)', () => {
    const tid = useTimelineStore.getState().addTrack('V-fb', '#3b82f6')!
    useInstrumentsStore.getState().addFrameBank(tid, [])
    expect(useInstrumentsStore.getState().frameBanks[tid]).toBeDefined()

    useTimelineStore.getState().removeTrack(tid)

    // GUARD (was leak): frameBank entry must be removed when the track is deleted.
    expect(useInstrumentsStore.getState().frameBanks[tid]).toBeUndefined()
  })

  it('deleting a track with no instruments is a safe no-op (removeGranulator/removeFrameBank no-op)', () => {
    const tid = useTimelineStore.getState().addTrack('V-empty', '#a855f7')!
    expect(() => useTimelineStore.getState().removeTrack(tid)).not.toThrow()
    expect(useTimelineStore.getState().tracks.find((t) => t.id === tid)).toBeUndefined()
  })

  it('deleting a track does not remove granulator for a different track', () => {
    const tid1 = useTimelineStore.getState().addTrack('V1', '#4ade80')!
    const tid2 = useTimelineStore.getState().addTrack('V2', '#ef4444')!
    useInstrumentsStore.getState().addGranulator(tid2)

    useTimelineStore.getState().removeTrack(tid1)

    // tid2's granulator must survive
    expect(useInstrumentsStore.getState().granulators[tid2]).toBeDefined()
  })
})
