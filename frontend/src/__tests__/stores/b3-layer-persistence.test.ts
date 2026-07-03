/**
 * B3 / L3 — LAYER panel persistence ROUND-TRIP (the F2 class, merge gate).
 *
 * The LAYER inspector panel edits four per-layer surfaces via existing store
 * actions:
 *   - blend / opacity → the track's TERMINAL CompositeEffect params (updateParam)
 *   - fill            → the representative clip's `opacity` (setClipOpacity)
 *   - matte           → the representative clip's `maskStack` (addMatteNode)
 *   - transform       → the representative clip's `transform` (setClipTransform)
 *
 * The PRD's #1 risk is the F2 "persistence-drop" class: a panel-edited field that
 * fails to survive save→reload because it is not in the save whitelist. This test
 * drives each field through the SAME store actions the panel calls, then does a
 * real serializeProject() → hydrateStores() round-trip and asserts every value
 * survives byte-for-byte. This is the L3 merge gate.
 */
import { describe, it, expect, beforeEach } from 'vitest'

// Mock window.entropic before store imports (matches project-persistence.test.ts).
const mockEntropic = {
  onEngineStatus: () => {},
  sendCommand: async () => ({ ok: true }),
  selectFile: async () => null,
  selectSavePath: async () => null,
  onExportProgress: () => () => {},
  getPathForFile: () => '/test/video.mp4',
}
;(globalThis as unknown as { window: unknown }).window = { entropic: mockEntropic }

import { useTimelineStore } from '../../renderer/stores/timeline'
import { useProjectStore } from '../../renderer/stores/project'
import { useUndoStore } from '../../renderer/stores/undo'
import { useAutomationStore } from '../../renderer/stores/automation'
import { serializeProject, hydrateStores } from '../../renderer/project-persistence'
import {
  getTrackCompositing,
  getTerminalComposite,
  makeCompositeEffect,
  normalizeTransform,
  type MatteNode,
} from '../../shared/types'

function reset() {
  useProjectStore.getState().resetProject()
  useTimelineStore.getState().reset()
  useUndoStore.getState().clear()
  useAutomationStore.getState().resetAutomation()
}

/** Build a valid video clip. */
function makeClip(id: string, trackId: string) {
  return {
    id,
    assetId: 'asset-1',
    trackId,
    position: 0,
    duration: 10,
    inPoint: 0,
    outPoint: 10,
    speed: 1.0,
  }
}

/** A valid rect matte node (mirrors mk7-matte-ops fixture). */
function makeMatte(id: string, patch: Partial<MatteNode> = {}): MatteNode {
  return {
    id,
    kind: 'rect',
    params: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 },
    op: 'add',
    invert: false,
    feather: 0,
    growShrink: 0,
    enabled: true,
    ...patch,
  }
}

/** Round-trip the current store state through serialize → hydrate. */
function roundTrip() {
  const json = serializeProject()
  const data = JSON.parse(json)
  reset()
  hydrateStores(data)
}

describe('B3 LAYER panel — persistence round-trip (F2 guard)', () => {
  beforeEach(reset)

  it('composite blend + opacity survive save→reload', () => {
    const trackId = useTimelineStore.getState().addTrack('V1', '#4ade80')!
    // Panel path: ensure a terminal composite, then updateParam.
    useProjectStore.getState().addEffect(trackId, makeCompositeEffect('cmp-1'))
    const composite = getTerminalComposite(
      useTimelineStore.getState().tracks.find((t) => t.id === trackId)!.effectChain,
    )!
    useProjectStore.getState().updateParam(trackId, composite.id, 'mode', 'screen')
    useProjectStore.getState().updateParam(trackId, composite.id, 'opacity', 0.42)

    roundTrip()

    const track = useTimelineStore.getState().tracks.find((t) => t.name === 'V1')!
    const c = getTrackCompositing(track.effectChain)
    expect(c.mode).toBe('screen')
    expect(c.opacity).toBeCloseTo(0.42, 5)
  })

  it('clip fill (opacity) survives save→reload', () => {
    const trackId = useTimelineStore.getState().addTrack('V1', '#4ade80')!
    useTimelineStore.getState().addClip(trackId, makeClip('clip-1', trackId))
    useTimelineStore.getState().setClipOpacity('clip-1', 0.33)

    roundTrip()

    const clip = useTimelineStore.getState().tracks
      .flatMap((t) => t.clips)
      .find((c) => c.id === 'clip-1')!
    expect(clip.opacity).toBeCloseTo(0.33, 5)
  })

  it('clip transform (rotate + scale) survives save→reload', () => {
    const trackId = useTimelineStore.getState().addTrack('V1', '#4ade80')!
    useTimelineStore.getState().addClip(trackId, makeClip('clip-1', trackId))
    const base = normalizeTransform(undefined)
    useTimelineStore.getState().setClipTransform('clip-1', {
      ...base,
      rotation: -12,
      scaleX: 1.04,
      scaleY: 1.04,
    })

    roundTrip()

    const clip = useTimelineStore.getState().tracks
      .flatMap((t) => t.clips)
      .find((c) => c.id === 'clip-1')!
    expect(clip.transform?.rotation).toBeCloseTo(-12, 5)
    expect(clip.transform?.scaleX).toBeCloseTo(1.04, 5)
    expect(clip.transform?.scaleY).toBeCloseTo(1.04, 5)
  })

  it('clip matte (blending options) survives save→reload', () => {
    const trackId = useTimelineStore.getState().addTrack('V1', '#4ade80')!
    useTimelineStore.getState().addClip(trackId, makeClip('clip-1', trackId))
    useTimelineStore.getState().addMatteNode('clip-1', makeMatte('matte-1', { feather: 8, invert: true }))

    roundTrip()

    const clip = useTimelineStore.getState().tracks
      .flatMap((t) => t.clips)
      .find((c) => c.id === 'clip-1')!
    expect(clip.maskStack).toBeTruthy()
    expect(clip.maskStack!).toHaveLength(1)
    expect(clip.maskStack![0].feather).toBe(8)
    expect(clip.maskStack![0].invert).toBe(true)
  })

  it('ALL panel fields together survive one round-trip (integration)', () => {
    const trackId = useTimelineStore.getState().addTrack('V1', '#4ade80')!
    useTimelineStore.getState().addClip(trackId, makeClip('clip-1', trackId))
    // blend + opacity
    useProjectStore.getState().addEffect(trackId, makeCompositeEffect('cmp-1'))
    const composite = getTerminalComposite(
      useTimelineStore.getState().tracks.find((t) => t.id === trackId)!.effectChain,
    )!
    useProjectStore.getState().updateParam(trackId, composite.id, 'mode', 'multiply')
    useProjectStore.getState().updateParam(trackId, composite.id, 'opacity', 0.72)
    // fill + transform + matte
    useTimelineStore.getState().setClipOpacity('clip-1', 0.9)
    const base = normalizeTransform(undefined)
    useTimelineStore.getState().setClipTransform('clip-1', { ...base, rotation: 45, scaleX: 2, scaleY: 2 })
    useTimelineStore.getState().addMatteNode('clip-1', makeMatte('matte-1', { feather: 8, invert: true }))

    roundTrip()

    const track = useTimelineStore.getState().tracks.find((t) => t.name === 'V1')!
    const c = getTrackCompositing(track.effectChain)
    const clip = track.clips.find((cl) => cl.id === 'clip-1')!
    expect(c.mode).toBe('multiply')
    expect(c.opacity).toBeCloseTo(0.72, 5)
    expect(clip.opacity).toBeCloseTo(0.9, 5)
    expect(clip.transform?.rotation).toBeCloseTo(45, 5)
    expect(clip.transform?.scaleX).toBeCloseTo(2, 5)
    expect(clip.maskStack![0].feather).toBe(8)
    expect(clip.maskStack![0].invert).toBe(true)
  })
})
