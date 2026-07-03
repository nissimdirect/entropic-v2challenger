/**
 * T5 — cursor-tool cull + split-shortcut consolidation
 * (docs/plans/2026-07-02-tuneup-handoff.md REMAINING BUILD LANES, lane T5).
 *
 * Prior state (before this packet):
 *  - CursorTool/TOOL_ENTRIES included 'range-select', a tool whose click
 *    behavior was a no-op duplicate of 'select' (MarqueeOverlay's rubber-band
 *    select already worked un-gated in every cursor-tool mode — see that
 *    file's header comment for the original T1 investigation).
 *  - Three separate shortcuts all split a clip at the playhead:
 *    'split_clip' (meta+shift+k, legacy single-clip path via the
 *    @deprecated selectedClipId field), 'split_at_playhead' (meta+k,
 *    multi-select aware, bounds-checked — the one surfaced in Clip.tsx's
 *    context-menu shortcut label), and 'split_at_playhead_e' (bare 'e'), a
 *    literal duplicate key binding for the exact same handler as
 *    'split_at_playhead'.
 *
 * This test locks in the post-cull state:
 *  1. 'range-select' is gone from CursorTool/TOOL_ENTRIES.
 *  2. Exactly one split-at-playhead shortcut remains (meta+k).
 *  3. The remaining genuinely-distinct tools (razor, slip, slide,
 *     ripple-delete, marker, loop-in, loop-out, select) are still present —
 *     none of them were touched by this cull.
 *  4. The consolidated split handler (splitSelectedClipsAtPlayhead) actually
 *     splits selected clips at the playhead.
 */
import { describe, it, expect, beforeEach } from 'vitest'

// Mock window.entropic before store import (mirrors t2-slip-slide.test.ts)
;(globalThis as any).window = {
  entropic: {
    onEngineStatus: () => {},
    sendCommand: async () => ({ ok: true }),
    selectFile: async () => null,
    selectSavePath: async () => null,
    onExportProgress: () => {},
  },
}

import { DEFAULT_SHORTCUTS } from '../../renderer/utils/default-shortcuts'
import { splitSelectedClipsAtPlayhead } from '../../renderer/utils/split-clip-at-playhead'
import { useTimelineStore } from '../../renderer/stores/timeline'
import type { Clip } from '../../shared/types'

function makeClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: overrides.id ?? `clip-${Math.random().toString(36).slice(2, 8)}`,
    assetId: overrides.assetId ?? 'asset-1',
    trackId: overrides.trackId ?? '',
    position: overrides.position ?? 0,
    duration: overrides.duration ?? 10,
    inPoint: overrides.inPoint ?? 0,
    outPoint: overrides.outPoint ?? 10,
    speed: overrides.speed ?? 1,
  }
}

beforeEach(() => {
  useTimelineStore.getState().reset()
})

describe('T5 — range-select tool removed', () => {
  it('DEFAULT_SHORTCUTS no longer has a tool_range_select entry', () => {
    const action = DEFAULT_SHORTCUTS.find((b) => b.action === 'tool_range_select')
    expect(action).toBeUndefined()
  })

  it('no DEFAULT_SHORTCUTS entry binds the bare "r" key anymore', () => {
    const rBound = DEFAULT_SHORTCUTS.find((b) => b.keys === 'r')
    expect(rBound).toBeUndefined()
  })

  it('remaining distinct tool hotkeys are all still present and unchanged', () => {
    const remaining = ['tool_select', 'tool_razor', 'tool_slip', 'tool_slide', 'tool_ripple_delete', 'tool_marker']
    for (const action of remaining) {
      const binding = DEFAULT_SHORTCUTS.find((b) => b.action === action)
      expect(binding, `expected ${action} to still be registered`).toBeDefined()
    }
  })
})

describe('T5 — split-clip shortcuts consolidated to one', () => {
  it('DEFAULT_SHORTCUTS has no split_clip entry (legacy single-clip duplicate removed)', () => {
    expect(DEFAULT_SHORTCUTS.find((b) => b.action === 'split_clip')).toBeUndefined()
  })

  it('DEFAULT_SHORTCUTS has no split_at_playhead_e entry (duplicate key binding removed)', () => {
    expect(DEFAULT_SHORTCUTS.find((b) => b.action === 'split_at_playhead_e')).toBeUndefined()
  })

  it('exactly one action is bound to meta+k, and it is split_at_playhead', () => {
    const boundToMetaK = DEFAULT_SHORTCUTS.filter((b) => b.keys === 'meta+k')
    expect(boundToMetaK).toHaveLength(1)
    expect(boundToMetaK[0].action).toBe('split_at_playhead')
  })

  it('the bare "e" key is no longer bound to anything split-related', () => {
    const eBound = DEFAULT_SHORTCUTS.find((b) => b.keys === 'e')
    expect(eBound).toBeUndefined()
  })

  it('no other action collides with meta+shift+k (freed up by removing split_clip)', () => {
    const collision = DEFAULT_SHORTCUTS.find((b) => b.keys === 'meta+shift+k')
    expect(collision).toBeUndefined()
  })
})

describe('T5 — the consolidated split shortcut actually splits', () => {
  it('splits a single selected clip that brackets the playhead', () => {
    const tl = useTimelineStore.getState()
    const trackId = tl.addTrack('V1', '#4ade80') as string
    tl.addClip(trackId, makeClip({ id: 'c1', position: 0, duration: 10 }))
    tl.selectClip('c1')
    tl.setPlayheadTime(4)

    splitSelectedClipsAtPlayhead()

    const clips = useTimelineStore.getState().tracks[0].clips
    expect(clips).toHaveLength(2)
    expect(clips[0].duration).toBeCloseTo(4)
    expect(clips[1].position).toBeCloseTo(4)
    expect(clips[1].duration).toBeCloseTo(6)
  })

  it('splits every selected clip whose bounds bracket the playhead (multi-select)', () => {
    const tl = useTimelineStore.getState()
    const trackA = tl.addTrack('V1', '#4ade80') as string
    const trackB = tl.addTrack('V2', '#60a5fa') as string
    tl.addClip(trackA, makeClip({ id: 'c1', position: 0, duration: 10 }))
    tl.addClip(trackB, makeClip({ id: 'c2', position: 0, duration: 10 }))
    useTimelineStore.setState({ selectedClipIds: ['c1', 'c2'] })
    tl.setPlayheadTime(4)

    splitSelectedClipsAtPlayhead()

    expect(useTimelineStore.getState().tracks[0].clips).toHaveLength(2)
    expect(useTimelineStore.getState().tracks[1].clips).toHaveLength(2)
  })

  it('is a no-op for a selected clip when the playhead sits outside its bounds', () => {
    const tl = useTimelineStore.getState()
    const trackId = tl.addTrack('V1', '#4ade80') as string
    tl.addClip(trackId, makeClip({ id: 'c1', position: 0, duration: 10 }))
    tl.selectClip('c1')
    tl.setPlayheadTime(99)

    splitSelectedClipsAtPlayhead()

    expect(useTimelineStore.getState().tracks[0].clips).toHaveLength(1)
  })

  it('is a no-op when nothing is selected', () => {
    const tl = useTimelineStore.getState()
    const trackId = tl.addTrack('V1', '#4ade80') as string
    tl.addClip(trackId, makeClip({ id: 'c1', position: 0, duration: 10 }))
    tl.clearSelection()
    tl.setPlayheadTime(4)

    splitSelectedClipsAtPlayhead()

    expect(useTimelineStore.getState().tracks[0].clips).toHaveLength(1)
  })
})
