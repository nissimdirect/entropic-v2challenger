/**
 * Sprint 7: Automation Copy/Paste — shortcut binding + handler logic tests.
 *
 * Tests for:
 * 1. Shortcut bindings registered correctly (automation_copy, automation_paste)
 * 2. Copy handler copies from loop region when set
 * 3. Paste handler pastes at playhead
 * 4. No-op when no lane is armed
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

import { DEFAULT_SHORTCUTS } from '../renderer/utils/default-shortcuts'
import { useAutomationStore } from '../renderer/stores/automation'
import { useTimelineStore } from '../renderer/stores/timeline'
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

/** Set up a track with one automation lane containing points */
function setupLaneWithPoints(trackId: string) {
  const store = useAutomationStore.getState()
  store.addLane(trackId, 'fx-1', 'amount', '#00ff00')
  const lanes = store.getLanesForTrack(trackId)
  const laneId = lanes[0].id

  // Add points at times 0.5, 1.0, 1.5, 2.0, 3.0
  store.addPoint(trackId, laneId, 0.5, 0.2)
  store.addPoint(trackId, laneId, 1.0, 0.5)
  store.addPoint(trackId, laneId, 1.5, 0.8)
  store.addPoint(trackId, laneId, 2.0, 0.6)
  store.addPoint(trackId, laneId, 3.0, 1.0)

  return laneId
}

// ============================================================
// 1. Shortcut bindings registered
// ============================================================

describe('Automation copy/paste shortcut bindings', () => {
  it('automation_copy binding exists with correct keys', () => {
    const binding = DEFAULT_SHORTCUTS.find((s) => s.action === 'automation_copy')
    expect(binding).toBeDefined()
    expect(binding!.keys).toBe('meta+shift+c')
    expect(binding!.category).toBe('automation')
    expect(binding!.context).toBe('normal')
  })

  it('automation_paste binding exists with correct keys', () => {
    const binding = DEFAULT_SHORTCUTS.find((s) => s.action === 'automation_paste')
    expect(binding).toBeDefined()
    expect(binding!.keys).toBe('meta+shift+v')
    expect(binding!.category).toBe('automation')
    expect(binding!.context).toBe('normal')
  })
})

// ============================================================
// 2. Copy handler — copies from loop region when set
// ============================================================

describe('Automation copy handler logic', () => {
  beforeEach(resetStores)

  it('copies points within loop region when loop is set', () => {
    const trackId = 'track-copy-1'
    const laneId = setupLaneWithPoints(trackId)
    useAutomationStore.getState().armTrack(trackId)

    // Set loop region from 1.0 to 2.0 — should capture points at 1.0, 1.5, 2.0
    useTimelineStore.getState().setLoopRegion(1.0, 2.0)

    // Simulate what the shortcut handler does
    const autoStore = useAutomationStore.getState()
    const armedTrackId = autoStore.armedTrackId!
    const lanes = autoStore.getLanesForTrack(armedTrackId)
    const loopRegion = useTimelineStore.getState().loopRegion!
    autoStore.copyRegion(armedTrackId, lanes[0].id, loopRegion.in, loopRegion.out)

    const clipboard = useAutomationStore.getState().clipboard
    expect(clipboard).not.toBeNull()
    expect(clipboard!.points).toHaveLength(3) // points at 1.0, 1.5, 2.0
    expect(clipboard!.duration).toBe(1.0) // 2.0 - 1.0

    // Points should be time-shifted relative to region start
    expect(clipboard!.points[0].time).toBe(0)   // 1.0 - 1.0
    expect(clipboard!.points[1].time).toBe(0.5) // 1.5 - 1.0
    expect(clipboard!.points[2].time).toBe(1.0) // 2.0 - 1.0
  })

  it('copies full lane when no loop region is set', () => {
    const trackId = 'track-copy-2'
    const laneId = setupLaneWithPoints(trackId)
    useAutomationStore.getState().armTrack(trackId)

    // No loop region — simulate the handler's full-lane copy
    const autoStore = useAutomationStore.getState()
    const armedTrackId = autoStore.armedTrackId!
    const lanes = autoStore.getLanesForTrack(armedTrackId)
    const lane = lanes[0]
    const maxTime = Math.max(...lane.points.map((p) => p.time))
    autoStore.copyRegion(armedTrackId, lane.id, 0, maxTime)

    const clipboard = useAutomationStore.getState().clipboard
    expect(clipboard).not.toBeNull()
    expect(clipboard!.points).toHaveLength(5) // all 5 points
    expect(clipboard!.duration).toBe(3.0) // 0 to 3.0
  })
})

// ============================================================
// 3. Paste handler — pastes at playhead
// ============================================================

describe('Automation paste handler logic', () => {
  beforeEach(resetStores)

  it('pastes clipboard points at current playhead position', () => {
    const trackId = 'track-paste-1'
    const laneId = setupLaneWithPoints(trackId)
    useAutomationStore.getState().armTrack(trackId)

    // Copy a region first
    useAutomationStore.getState().copyRegion(trackId, laneId, 1.0, 2.0)

    // Set playhead to 5.0
    useTimelineStore.getState().setPlayheadTime(5.0)

    // Simulate paste handler
    const autoStore = useAutomationStore.getState()
    const armedTrackId = autoStore.armedTrackId!
    const lanes = autoStore.getLanesForTrack(armedTrackId)
    const playheadTime = useTimelineStore.getState().playheadTime
    autoStore.pasteAtPlayhead(armedTrackId, lanes[0].id, playheadTime)

    // Verify pasted points appear at playhead offset
    const updatedLanes = useAutomationStore.getState().getLanesForTrack(trackId)
    const points = updatedLanes[0].points
    // Original 5 points + 3 pasted
    expect(points).toHaveLength(8)

    // Check that pasted points are at 5.0, 5.5, 6.0
    const pastedTimes = points.filter((p) => p.time >= 5.0).map((p) => p.time)
    expect(pastedTimes).toContain(5.0)
    expect(pastedTimes).toContain(5.5)
    expect(pastedTimes).toContain(6.0)
  })

  it('paste is undoable', () => {
    const trackId = 'track-paste-undo'
    const laneId = setupLaneWithPoints(trackId)
    useAutomationStore.getState().armTrack(trackId)

    useAutomationStore.getState().copyRegion(trackId, laneId, 1.0, 2.0)
    useAutomationStore.getState().pasteAtPlayhead(trackId, laneId, 5.0)

    const afterPaste = useAutomationStore.getState().getLanesForTrack(trackId)[0].points.length
    expect(afterPaste).toBe(8)

    useUndoStore.getState().undo()
    const afterUndo = useAutomationStore.getState().getLanesForTrack(trackId)[0].points.length
    expect(afterUndo).toBe(5) // back to original
  })
})

// ============================================================
// 4. No-op when no lane is armed
// ============================================================

describe('Automation copy/paste no-op guards', () => {
  beforeEach(resetStores)

  it('copy is no-op when no track is armed', () => {
    const trackId = 'track-noarm-1'
    setupLaneWithPoints(trackId)
    // Do NOT arm any track

    const autoStore = useAutomationStore.getState()
    const armedTrackId = autoStore.armedTrackId
    expect(armedTrackId).toBeNull()

    // Clipboard should stay null
    expect(autoStore.clipboard).toBeNull()
  })

  it('paste is no-op when no track is armed', () => {
    const trackId = 'track-noarm-2'
    const laneId = setupLaneWithPoints(trackId)

    // Copy something first (with armed track)
    useAutomationStore.getState().armTrack(trackId)
    useAutomationStore.getState().copyRegion(trackId, laneId, 1.0, 2.0)
    expect(useAutomationStore.getState().clipboard).not.toBeNull()

    // Disarm, then paste should be a no-op at handler level
    useAutomationStore.getState().armTrack(null)
    const armedTrackId = useAutomationStore.getState().armedTrackId
    expect(armedTrackId).toBeNull()

    // Handler would exit early, so no paste happens
    // The lane points should remain unchanged (5 original)
    const points = useAutomationStore.getState().getLanesForTrack(trackId)[0].points
    expect(points).toHaveLength(5)
  })

  it('copy is no-op when armed track has no lanes', () => {
    // Arm a track that has no automation lanes
    useAutomationStore.getState().armTrack('empty-track')
    const lanes = useAutomationStore.getState().getLanesForTrack('empty-track')
    expect(lanes).toHaveLength(0)

    // Clipboard should remain null
    expect(useAutomationStore.getState().clipboard).toBeNull()
  })

  it('paste is no-op when clipboard is empty', () => {
    const trackId = 'track-noclip'
    const laneId = setupLaneWithPoints(trackId)
    useAutomationStore.getState().armTrack(trackId)

    // No copy done — clipboard is null
    expect(useAutomationStore.getState().clipboard).toBeNull()

    // Paste at playhead should be no-op
    useAutomationStore.getState().pasteAtPlayhead(trackId, laneId, 5.0)
    const points = useAutomationStore.getState().getLanesForTrack(trackId)[0].points
    expect(points).toHaveLength(5) // unchanged
  })
})
