/**
 * F-0514-5 — Escape in perform mode clears clip selection BEFORE panic.
 *
 * The keydown handler lives inline in App.tsx; the regression here was an
 * ordering bug (perform-mode Escape short-circuited to panicAll() and never
 * reached clear-selection). The structural test pins that ordering in the
 * source; the store test pins the behavior the branch invokes.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const mockEntropic = {
  onEngineStatus: vi.fn(),
  sendCommand: vi.fn().mockResolvedValue({ ok: true }),
  onExportProgress: vi.fn().mockReturnValue(vi.fn()),
}
;(globalThis as unknown as { window: unknown }).window = { entropic: mockEntropic }

import { useTimelineStore } from '../renderer/stores/timeline'

describe('F-0514-5: Escape in perform mode', () => {
  beforeEach(() => {
    useTimelineStore.getState().reset()
  })

  it('Escape in perform mode clears clip selection before panic (source ordering pinned)', () => {
    const src = readFileSync(resolve(__dirname, '../renderer/App.tsx'), 'utf-8')
    // The perform-mode Escape branch must consult selectedClipIds and
    // clearSelection() BEFORE any panicAll() call in that branch.
    const escapeBlock = src.slice(src.indexOf("if (e.code === 'Escape')"))
    const clearIdx = escapeBlock.indexOf('clearSelection()')
    const panicIdx = escapeBlock.indexOf('panicAll()')
    expect(clearIdx).toBeGreaterThan(-1)
    expect(panicIdx).toBeGreaterThan(-1)
    expect(clearIdx).toBeLessThan(panicIdx)
    // and the selection check guards it
    expect(escapeBlock.slice(0, clearIdx)).toContain('selectedClipIds.length > 0')
  })

  it('clearSelection empties the selection (the behavior the branch invokes)', () => {
    const tls = useTimelineStore.getState()
    const trackId = tls.addTrack('V1', '#fff', 'video')!
    tls.addClip(trackId, {
      id: 'clip-esc-1', trackId, assetId: 'a1',
      position: 0, duration: 2, inPoint: 0, outPoint: 2, speed: 1,
    } as Parameters<typeof tls.addClip>[1])
    useTimelineStore.getState().selectClip('clip-esc-1')
    expect(useTimelineStore.getState().selectedClipIds.length).toBeGreaterThan(0)
    useTimelineStore.getState().clearSelection()
    expect(useTimelineStore.getState().selectedClipIds).toHaveLength(0)
  })
})
