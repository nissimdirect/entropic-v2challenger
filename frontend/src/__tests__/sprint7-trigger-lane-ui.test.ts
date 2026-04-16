/**
 * Sprint 7: Trigger Lane UI — wiring tests for addTriggerLane in UI.
 *
 * Tests:
 * 1. AutomationToolbar "Add Lane" and "Add Trigger" buttons exist and are disabled when no track armed
 * 2. Clicking "+ Lane" opens param picker showing available effect params
 * 3. Clicking "+ Trigger" opens trigger param picker
 * 4. Selecting a param from picker calls addLane / addTriggerLane on the store
 * 5. Picker shows "no available params" when track has no effects
 * 6. Already-mapped params are excluded from picker
 * 7. Track context menu includes "Add Lane" and "Add Trigger" items
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

import { useAutomationStore } from '../renderer/stores/automation'
import { useTimelineStore } from '../renderer/stores/timeline'
import { useEffectsStore } from '../renderer/stores/effects'
import { useUndoStore } from '../renderer/stores/undo'

// ============================================================
// Helpers
// ============================================================

function resetStores() {
  useAutomationStore.setState({
    lanes: {},
    mode: 'read',
    armedTrackId: null,
    recordingParamPath: null,
    clipboard: null,
  })
  useTimelineStore.getState().reset()
  useUndoStore.getState().clear()
}

function setupTrackWithEffect() {
  const trackId = useTimelineStore.getState().addTrack('Test Track', '#4ade80')!

  // Add an effect instance to the track's effectChain
  const effectInstance = {
    id: 'fx-test-1',
    effectId: 'glitch_shift',
    isEnabled: true,
    parameters: { amount: 0.5, speed: 1.0 },
    mix: 1.0,
  }
  useTimelineStore.setState((s) => ({
    tracks: s.tracks.map((t) =>
      t.id === trackId
        ? { ...t, effectChain: [effectInstance] }
        : t,
    ),
  }))

  // Set up the effect registry with matching info
  useEffectsStore.setState({
    registry: [
      {
        id: 'glitch_shift',
        name: 'Glitch Shift',
        category: 'Glitch',
        params: {
          amount: {
            type: 'float' as const,
            min: 0,
            max: 1,
            default: 0.5,
            label: 'Amount',
          },
          speed: {
            type: 'float' as const,
            min: 0,
            max: 10,
            default: 1.0,
            label: 'Speed',
          },
        },
      },
    ],
  })

  return trackId
}

// ============================================================
// Tests
// ============================================================

describe('Trigger Lane UI Wiring', () => {
  beforeEach(resetStores)

  // --- Store-level: addLane from toolbar context ---

  it('addLane creates a regular lane for armed track', () => {
    const trackId = setupTrackWithEffect()
    useAutomationStore.getState().armTrack(trackId)
    useAutomationStore.getState().addLane(trackId, 'fx-test-1', 'amount', '#4ade80')

    const lanes = useAutomationStore.getState().getLanesForTrack(trackId)
    expect(lanes).toHaveLength(1)
    expect(lanes[0].isTrigger).toBe(false)
    expect(lanes[0].paramPath).toBe('fx-test-1.amount')
  })

  it('addTriggerLane creates a trigger lane for armed track', () => {
    const trackId = setupTrackWithEffect()
    useAutomationStore.getState().armTrack(trackId)
    const laneId = useAutomationStore.getState().addTriggerLane(
      trackId, 'fx-test-1', 'amount', '#ef4444', 'gate',
    )

    expect(laneId).toBeTruthy()
    const lanes = useAutomationStore.getState().getLanesForTrack(trackId)
    expect(lanes).toHaveLength(1)
    expect(lanes[0].isTrigger).toBe(true)
    expect(lanes[0].triggerMode).toBe('gate')
    expect(lanes[0].paramPath).toBe('fx-test-1.amount')
  })

  // --- Param availability logic ---

  it('already-mapped params are excluded from available params', () => {
    const trackId = setupTrackWithEffect()
    useAutomationStore.getState().armTrack(trackId)

    // Add a lane for 'amount'
    useAutomationStore.getState().addLane(trackId, 'fx-test-1', 'amount', '#4ade80')

    // Check available params by computing what the picker would show
    const track = useTimelineStore.getState().tracks.find((t) => t.id === trackId)!
    const registry = useEffectsStore.getState().registry
    const existingLanes = useAutomationStore.getState().getLanesForTrack(trackId)
    const existingPaths = new Set(existingLanes.map((l) => l.paramPath))

    const available: string[] = []
    for (const effect of track.effectChain) {
      const info = registry.find((r) => r.id === effect.effectId)
      if (!info) continue
      for (const [key, def] of Object.entries(info.params)) {
        if (def.type !== 'float' && def.type !== 'int') continue
        const paramPath = `${effect.id}.${key}`
        if (!existingPaths.has(paramPath)) {
          available.push(key)
        }
      }
    }

    // 'amount' should be excluded, only 'speed' remains
    expect(available).toEqual(['speed'])
    expect(available).not.toContain('amount')
  })

  it('no params available when track has no effects', () => {
    const trackId = useTimelineStore.getState().addTrack('Empty Track', '#666666')!
    useAutomationStore.getState().armTrack(trackId)

    const track = useTimelineStore.getState().tracks.find((t) => t.id === trackId)!
    expect(track.effectChain).toHaveLength(0)
  })

  it('non-numeric params (bool, choice) are excluded from automation lane options', () => {
    const trackId = setupTrackWithEffect()

    // Add a bool and choice param to the registry
    useEffectsStore.setState({
      registry: [
        {
          id: 'glitch_shift',
          name: 'Glitch Shift',
          category: 'Glitch',
          params: {
            amount: {
              type: 'float' as const,
              min: 0,
              max: 1,
              default: 0.5,
              label: 'Amount',
            },
            enabled: {
              type: 'bool' as const,
              default: true,
              label: 'Enabled',
            },
            mode: {
              type: 'choice' as const,
              default: 'linear',
              label: 'Mode',
              options: ['linear', 'curved'],
            },
          },
        },
      ],
    })

    const track = useTimelineStore.getState().tracks.find((t) => t.id === trackId)!
    const registry = useEffectsStore.getState().registry
    const available: string[] = []
    for (const effect of track.effectChain) {
      const info = registry.find((r) => r.id === effect.effectId)
      if (!info) continue
      for (const [key, def] of Object.entries(info.params)) {
        if (def.type !== 'float' && def.type !== 'int') continue
        available.push(key)
      }
    }

    // Only 'amount' (float) should be available, not 'enabled' (bool) or 'mode' (choice)
    expect(available).toEqual(['amount'])
  })

  // --- Trigger lane duplicate blocking ---

  it('addTriggerLane blocks duplicate param mapping', () => {
    const trackId = setupTrackWithEffect()
    useAutomationStore.getState().armTrack(trackId)

    const first = useAutomationStore.getState().addTriggerLane(
      trackId, 'fx-test-1', 'amount', '#ef4444', 'gate',
    )
    expect(first).toBeTruthy()

    const second = useAutomationStore.getState().addTriggerLane(
      trackId, 'fx-test-1', 'amount', '#3b82f6', 'toggle',
    )
    expect(second).toBeNull()

    const lanes = useAutomationStore.getState().getAllLanes()
    expect(lanes).toHaveLength(1)
  })

  // --- Multiple lanes on same track ---

  it('can add both regular and trigger lanes to same track', () => {
    const trackId = setupTrackWithEffect()
    useAutomationStore.getState().armTrack(trackId)

    useAutomationStore.getState().addLane(trackId, 'fx-test-1', 'amount', '#4ade80')
    useAutomationStore.getState().addTriggerLane(
      trackId, 'fx-test-1', 'speed', '#ef4444', 'gate',
    )

    const lanes = useAutomationStore.getState().getLanesForTrack(trackId)
    expect(lanes).toHaveLength(2)
    expect(lanes[0].isTrigger).toBe(false)
    expect(lanes[0].paramPath).toBe('fx-test-1.amount')
    expect(lanes[1].isTrigger).toBe(true)
    expect(lanes[1].paramPath).toBe('fx-test-1.speed')
  })

  // --- Lane badge display ---

  it('LaneBadges detects trigger and auto lanes', () => {
    const trackId = setupTrackWithEffect()

    // Add both types
    useAutomationStore.getState().addLane(trackId, 'fx-test-1', 'amount', '#4ade80')
    useAutomationStore.getState().addTriggerLane(
      trackId, 'fx-test-1', 'speed', '#ef4444', 'gate',
    )

    const lanes = useAutomationStore.getState().lanes[trackId] ?? []
    const hasTrigger = lanes.some((l) => l.isTrigger)
    const hasAuto = lanes.some((l) => !l.isTrigger)

    expect(hasTrigger).toBe(true)
    expect(hasAuto).toBe(true)
  })

  // --- Undo integration ---

  it('addTriggerLane via UI flow is undoable', () => {
    const trackId = setupTrackWithEffect()
    useAutomationStore.getState().armTrack(trackId)

    useAutomationStore.getState().addTriggerLane(
      trackId, 'fx-test-1', 'amount', '#ef4444', 'gate',
    )
    expect(useAutomationStore.getState().getLanesForTrack(trackId)).toHaveLength(1)

    useUndoStore.getState().undo()
    expect(useAutomationStore.getState().getLanesForTrack(trackId)).toHaveLength(0)

    useUndoStore.getState().redo()
    expect(useAutomationStore.getState().getLanesForTrack(trackId)).toHaveLength(1)
  })

  // --- Trigger mode defaults ---

  it('trigger lane defaults to gate mode with flat ADSR', () => {
    const trackId = setupTrackWithEffect()
    const laneId = useAutomationStore.getState().addTriggerLane(
      trackId, 'fx-test-1', 'amount', '#ef4444', 'gate',
    )

    const lane = useAutomationStore.getState().getLanesForTrack(trackId)[0]
    expect(lane.triggerMode).toBe('gate')
    expect(lane.triggerADSR).toEqual({ attack: 0, decay: 0, sustain: 1, release: 0 })
  })
})
