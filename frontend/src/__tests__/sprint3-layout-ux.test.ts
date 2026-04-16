/**
 * Sprint 3: Layout/UX Fixes — Behavioral verification tests.
 *
 * Tests the behavioral logic for all 4 Sprint 3 items:
 * 1. BUG-6: Effect list hidden below category tags (CSS — verified inline, not testable here)
 * 2. BUG-7: Preview persistence after New Project (store reset + state clearing)
 * 3. BUG-11: Track rename double-click (store action + state management)
 * 4. BUG-8: Export dialog positioning (CSS — verified inline, not testable here)
 *
 * CSS-only fixes (BUG-6, BUG-8) need visual UAT, not unit tests.
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
import { newProject } from '../renderer/project-persistence'
import type { Clip, EffectInstance } from '../shared/types'

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

// ─── BUG-7: Preview persistence after New Project ─────────────────────────────

describe('newProject resets all stores', () => {
  beforeEach(() => {
    useTimelineStore.getState().reset()
    useProjectStore.getState().resetProject()
    useUndoStore.getState().clear()
  })

  it('clears timeline tracks', () => {
    const tl = useTimelineStore.getState()
    tl.addTrack('Track 1', '#ff0000')
    expect(useTimelineStore.getState().tracks).toHaveLength(1)

    newProject()

    expect(useTimelineStore.getState().tracks).toHaveLength(0)
  })

  it('resets playhead to 0', () => {
    useTimelineStore.getState().setPlayheadTime(42.5)
    expect(useTimelineStore.getState().playheadTime).toBe(42.5)

    newProject()

    expect(useTimelineStore.getState().playheadTime).toBe(0)
  })

  it('clears effect chain', () => {
    useProjectStore.getState().addEffect(makeEffect('e1'))
    expect(useProjectStore.getState().effectChain).toHaveLength(1)

    newProject()

    expect(useProjectStore.getState().effectChain).toHaveLength(0)
  })

  it('clears selected effect', () => {
    useProjectStore.getState().addEffect(makeEffect('e2'))
    useProjectStore.getState().selectEffect('e2')
    expect(useProjectStore.getState().selectedEffectId).toBe('e2')

    newProject()

    expect(useProjectStore.getState().selectedEffectId).toBeNull()
  })

  it('resets project name to Untitled', () => {
    useProjectStore.getState().setProjectName('My Project')
    expect(useProjectStore.getState().projectName).toBe('My Project')

    newProject()

    expect(useProjectStore.getState().projectName).toBe('Untitled')
  })

  it('clears project path', () => {
    useProjectStore.getState().setProjectPath('/some/path.glitch')
    expect(useProjectStore.getState().projectPath).toBe('/some/path.glitch')

    newProject()

    expect(useProjectStore.getState().projectPath).toBeNull()
  })

  it('clears assets', () => {
    useProjectStore.getState().addAsset({
      id: 'a1',
      path: '/video.mp4',
      type: 'video',
      meta: { width: 1920, height: 1080, fps: 30, duration: 10, codec: 'h264', hasAudio: false },
    })
    expect(Object.keys(useProjectStore.getState().assets)).toHaveLength(1)

    newProject()

    expect(Object.keys(useProjectStore.getState().assets)).toHaveLength(0)
  })

  it('clears undo history', () => {
    // Create some undo history via a track add
    const tl = useTimelineStore.getState()
    tl.addTrack('Track 1', '#ff0000')

    newProject()

    const undo = useUndoStore.getState()
    expect(undo.past).toHaveLength(0)
    expect(undo.future).toHaveLength(0)
  })

  it('resets timeline selection', () => {
    const tl = useTimelineStore.getState()
    const trackId = tl.addTrack('Track 1', '#ff0000')!
    tl.selectTrack(trackId)
    tl.addClip(trackId, makeClip({ id: 'c1', trackId }))
    tl.selectClip('c1')

    newProject()

    expect(useTimelineStore.getState().selectedTrackId).toBeNull()
    expect(useTimelineStore.getState().selectedClipId).toBeNull()
  })

  it('resets canvas resolution to default', () => {
    useProjectStore.getState().setCanvasResolution(3840, 2160)
    expect(useProjectStore.getState().canvasResolution).toEqual([3840, 2160])

    newProject()

    expect(useProjectStore.getState().canvasResolution).toEqual([1920, 1080])
  })
})

// ─── BUG-11: Track rename via store ───────────────────────────────────────────

describe('track rename (renameTrack store action)', () => {
  beforeEach(() => {
    useTimelineStore.getState().reset()
    useUndoStore.getState().clear()
  })

  it('renames a track', () => {
    const tl = useTimelineStore.getState()
    const trackId = tl.addTrack('Track 1', '#ff0000')!

    tl.renameTrack(trackId, 'My Custom Name')

    expect(useTimelineStore.getState().tracks[0].name).toBe('My Custom Name')
  })

  it('is undoable', () => {
    const tl = useTimelineStore.getState()
    const trackId = tl.addTrack('Track 1', '#ff0000')!

    tl.renameTrack(trackId, 'Renamed')
    expect(useTimelineStore.getState().tracks[0].name).toBe('Renamed')

    useUndoStore.getState().undo()
    expect(useTimelineStore.getState().tracks[0].name).toBe('Track 1')
  })

  it('redo restores renamed name', () => {
    const tl = useTimelineStore.getState()
    const trackId = tl.addTrack('Track 1', '#ff0000')!

    tl.renameTrack(trackId, 'Renamed')
    useUndoStore.getState().undo()
    useUndoStore.getState().redo()

    expect(useTimelineStore.getState().tracks[0].name).toBe('Renamed')
  })

  it('no-ops for nonexistent track', () => {
    const tl = useTimelineStore.getState()
    tl.addTrack('Track 1', '#ff0000')

    // Should not throw
    tl.renameTrack('nonexistent-id', 'New Name')

    expect(useTimelineStore.getState().tracks[0].name).toBe('Track 1')
  })

  it('does not affect other tracks', () => {
    const tl = useTimelineStore.getState()
    const id1 = tl.addTrack('Track 1', '#ff0000')!
    const id2 = tl.addTrack('Track 2', '#00ff00')!

    tl.renameTrack(id1, 'Renamed Track')

    const tracks = useTimelineStore.getState().tracks
    expect(tracks.find((t) => t.id === id1)!.name).toBe('Renamed Track')
    expect(tracks.find((t) => t.id === id2)!.name).toBe('Track 2')
  })

  it('allows empty-looking names through store (UI should trim/validate)', () => {
    const tl = useTimelineStore.getState()
    const trackId = tl.addTrack('Track 1', '#ff0000')!

    // Store itself accepts any string; the component trims before calling
    tl.renameTrack(trackId, '   spaces   ')
    expect(useTimelineStore.getState().tracks[0].name).toBe('   spaces   ')
  })

  it('handles unicode names', () => {
    const tl = useTimelineStore.getState()
    const trackId = tl.addTrack('Track 1', '#ff0000')!

    tl.renameTrack(trackId, 'Piste vidéo 日本語')
    expect(useTimelineStore.getState().tracks[0].name).toBe('Piste vidéo 日本語')
  })
})

// ─── BUG-7: handleNewProject clears component-level state ─────────────────────
// NOTE: handleNewProject in App.tsx sets frameDataUrl to null, frameWidth/Height
// to 0, activeFps to 30, and clears activeAssetPath.
// However, it does NOT reset previewState to 'empty' — this is a BUG that still
// needs fixing (see TODO below). The PreviewCanvas component *does* handle
// frameDataUrl=null by clearing the canvas, and shows "No video loaded" when
// previewState === 'empty'. But if previewState is still 'ready' after New Project,
// the placeholder text won't show even though the canvas is cleared.

describe('handleNewProject state clearing (behavioral contract)', () => {
  // These tests verify the store-level behavior that handleNewProject depends on.
  // The component-level state (frameDataUrl, previewState) lives in App.tsx useState
  // and isn't directly testable without rendering, but the store resets are.

  beforeEach(() => {
    useTimelineStore.getState().reset()
    useProjectStore.getState().resetProject()
    useUndoStore.getState().clear()
  })

  it('resetProject clears ingest state', () => {
    useProjectStore.getState().setIngesting(true)
    useProjectStore.getState().setIngestError('some error')

    useProjectStore.getState().resetProject()

    expect(useProjectStore.getState().isIngesting).toBe(false)
    expect(useProjectStore.getState().ingestError).toBeNull()
  })

  it('resetProject resets frame counters', () => {
    useProjectStore.getState().setCurrentFrame(150)
    useProjectStore.getState().setTotalFrames(300)

    useProjectStore.getState().resetProject()

    expect(useProjectStore.getState().currentFrame).toBe(0)
    expect(useProjectStore.getState().totalFrames).toBe(0)
  })

  it('resetProject resets BPM to default', () => {
    useProjectStore.getState().setBpm(140)

    useProjectStore.getState().resetProject()

    expect(useProjectStore.getState().bpm).toBe(120)
  })

  it('timeline reset clears loop region', () => {
    useTimelineStore.getState().setLoopRegion(1, 5)
    expect(useTimelineStore.getState().loopRegion).not.toBeNull()

    useTimelineStore.getState().reset()

    expect(useTimelineStore.getState().loopRegion).toBeNull()
  })

  it('timeline reset clears markers', () => {
    // Markers come via INITIAL_STATE reset
    useTimelineStore.getState().reset()
    expect(useTimelineStore.getState().markers).toHaveLength(0)
  })

  it('timeline reset resets zoom to default', () => {
    useTimelineStore.getState().setZoom(200)

    useTimelineStore.getState().reset()

    expect(useTimelineStore.getState().zoom).toBe(50)
  })
})
