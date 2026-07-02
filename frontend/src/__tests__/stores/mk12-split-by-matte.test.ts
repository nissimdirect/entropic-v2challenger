/**
 * MK.12 — Split by matte (subject/background twin tracks).
 *
 * Named tests (TEST PLAN, packets/masking.md MK.12):
 *   - test_split_by_matte_creates_twin_with_inverted_ref  (store)
 *   - test_split_is_one_undo_entry
 * Plus the negative guards (no ai_matte node → no-op toast; caps refused).
 *
 * The render math (ai_matte per-frame lookup + independent chains) is proven
 * by the backend suite (tests/test_masking/test_ai_matte.py, incl. the
 * integration test) — this suite asserts the STORE COMPOSITION: twin track
 * placement, complementary matte refs (subject deleteOutside copy vs original
 * deleteInside — the inverted consumption of the same matte), one-undo
 * atomicity, and deep-equal restoration.
 */
import { describe, it, expect, beforeEach } from 'vitest'

// Mock window.entropic before store import (same shape as mk9-region-to-track.test.ts).
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
import { useUndoStore } from '../../renderer/stores/undo'
import { useToastStore } from '../../renderer/stores/toast'
import type { Clip, MatteNode, Track } from '../../shared/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetStores() {
  useTimelineStore.getState().reset()
  useUndoStore.getState().clear()
  useToastStore.setState({ toasts: [] })
}

function makeAiMatteNode(overrides: Partial<MatteNode> = {}): MatteNode {
  return {
    id: `ai-${Math.random().toString(36).slice(2, 8)}`,
    kind: 'ai_matte',
    params: { matte_path: '/tmp/mattes/abc.mp4', start_frame: 0 },
    op: 'add',
    invert: false,
    feather: 0,
    growShrink: 0,
    enabled: true,
    ...overrides,
  }
}

/** One video track + one named clip carrying an ai_matte node. */
function setupClipWithAiMatte(): { trackId: string; clipId: string; nodeId: string } {
  const tl = useTimelineStore.getState()
  const trackId = tl.addTrack('V1', '#4ade80') as string
  const clipId = `clip-${Math.random().toString(36).slice(2, 8)}`
  const clip: Clip = {
    id: clipId,
    assetId: 'asset-1',
    trackId,
    position: 0,
    duration: 10,
    inPoint: 0,
    outPoint: 10,
    speed: 1,
    name: 'Factory',
  }
  tl.addClip(trackId, clip)
  const node = makeAiMatteNode()
  tl.addMatteNode(clipId, node)
  // Clear setup entries — the one-undo tests count ONLY the split's entries.
  useUndoStore.getState().clear()
  return { trackId, clipId, nodeId: node.id }
}

function getClip(clipId: string): Clip | undefined {
  for (const track of useTimelineStore.getState().tracks) {
    const clip = track.clips.find((c) => c.id === clipId)
    if (clip) return clip
  }
  return undefined
}

// ---------------------------------------------------------------------------
// test_split_by_matte_creates_twin_with_inverted_ref
// ---------------------------------------------------------------------------

describe('test_split_by_matte_creates_twin_with_inverted_ref', () => {
  beforeEach(resetStores)

  it('creates a subject twin above carrying the matte copy, original becomes the inverted background', () => {
    const { trackId, clipId, nodeId } = setupClipWithAiMatte()
    const tracksBefore = useTimelineStore.getState().tracks.length

    useTimelineStore.getState().splitByMatte(clipId)

    const state = useTimelineStore.getState()
    expect(state.tracks.length).toBe(tracksBefore + 1)

    // Twin track directly ABOVE the source (lower index = topmost UI row).
    const srcIdx = state.tracks.findIndex((t) => t.id === trackId)
    const subjectTrack = state.tracks.find(
      (t) => t.id !== trackId && t.clips.length === 1,
    ) as Track
    expect(subjectTrack).toBeDefined()
    const subjIdx = state.tracks.findIndex((t) => t.id === subjectTrack.id)
    expect(subjIdx).toBe(srcIdx - 1)

    // Track names per the PRD: `<clip> · subject` / `<clip> · background`.
    expect(subjectTrack.name).toBe('Factory · subject')
    expect(state.tracks[srcIdx].name).toBe('Factory · background')

    // SUBJECT twin: same source, deep COPY of the ai_matte node, deleteOutside
    // (only the subject shows). New clip id; empty chain track.
    const subject = subjectTrack.clips[0]
    expect(subject.id).not.toBe(clipId)
    expect(subject.assetId).toBe('asset-1')
    expect(subject.maskMode).toBe('deleteOutside')
    expect(subject.maskStack).toHaveLength(1)
    expect(subject.maskStack![0].kind).toBe('ai_matte')
    expect(subject.maskStack![0].id).not.toBe(nodeId) // fresh id (no aliasing)
    expect(subject.maskStack![0].params).not.toBe(getClip(clipId)!.maskStack![0].params)
    expect(subject.maskStack![0].params.matte_path).toBe('/tmp/mattes/abc.mp4')
    expect(subjectTrack.effectChain ?? []).toHaveLength(0)

    // BACKGROUND twin (the original, in place): keeps its node (same id — device
    // mask_refs keep resolving) and gains the INVERTED consumption of the same
    // matte: deleteInside (subject-shaped hole) vs the twin's deleteOutside.
    const background = getClip(clipId)!
    expect(background.maskMode).toBe('deleteInside')
    expect(background.maskStack![0].id).toBe(nodeId)
    expect(background.maskStack![0].kind).toBe('ai_matte')
    // Complementary refs over ONE matte: twin shows m, original shows 1−m.
    expect(subject.maskMode).not.toBe(background.maskMode)
  })

  it('no-op + toast when the clip has no ai_matte node (negative)', () => {
    const tl = useTimelineStore.getState()
    const trackId = tl.addTrack('V1', '#4ade80') as string
    const clip: Clip = {
      id: 'clip-no-ai', assetId: 'a', trackId,
      position: 0, duration: 5, inPoint: 0, outPoint: 5, speed: 1,
    }
    tl.addClip(trackId, clip)
    useUndoStore.getState().clear()
    const tracksBefore = useTimelineStore.getState().tracks.length

    useTimelineStore.getState().splitByMatte('clip-no-ai')

    expect(useTimelineStore.getState().tracks.length).toBe(tracksBefore)
    expect(useUndoStore.getState().past.length).toBe(0)
    const toasts = useToastStore.getState().toasts
    expect(toasts.some((t) => t.source === 'mk12-split-by-matte')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// test_split_is_one_undo_entry
// ---------------------------------------------------------------------------

describe('test_split_is_one_undo_entry', () => {
  beforeEach(resetStores)

  it('split is ONE undo entry and undo restores the pre-state deep-equal', () => {
    const { clipId } = setupClipWithAiMatte()
    const tracksPre = structuredClone(useTimelineStore.getState().tracks)
    const undoDepthPre = useUndoStore.getState().past.length // 0 after setup clear

    useTimelineStore.getState().splitByMatte(clipId)

    // HistoryPanel row count for THIS gesture = exactly 1.
    expect(useUndoStore.getState().past.length).toBe(undoDepthPre + 1)

    useUndoStore.getState().undo()

    // Deep-equal restoration of the full pre-state (tracks incl. names,
    // maskModes, stacks) — and the popped stack.
    expect(useTimelineStore.getState().tracks).toEqual(tracksPre)
    expect(useUndoStore.getState().past.length).toBe(undoDepthPre)
  })

  it('redo re-applies the split deterministically (pre-generated ids)', () => {
    const { clipId } = setupClipWithAiMatte()
    useTimelineStore.getState().splitByMatte(clipId)
    const tracksAfterSplit = structuredClone(useTimelineStore.getState().tracks)

    useUndoStore.getState().undo()
    useUndoStore.getState().redo()

    expect(useTimelineStore.getState().tracks).toEqual(tracksAfterSplit)
  })
})
