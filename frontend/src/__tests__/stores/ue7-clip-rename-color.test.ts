/**
 * UE.7 — Clip rename + clip color
 *
 * Named tests (packet spec):
 *   1. clip rename persists
 *   2. clip color renders in timeline
 *   3. legacy project without clip name/color loads clean (NEGATIVE)
 *   4. rename input suppresses timeline shortcuts (structural assertion)
 *   5. empty rename falls back to asset name (NEGATIVE — store name cleared to undefined)
 *   6. 512-char rename clamps to MAX_CLIP_NAME_LENGTH (NEGATIVE)
 *   7. rename and recolor survive save and reload round trip (INTEGRATION)
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
import { useUndoStore } from '../../renderer/stores/undo'
import { LIMITS } from '../../shared/limits'
import type { Clip } from '../../shared/types'
import { serializeProject, hydrateStores } from '../../renderer/project-persistence'
import { useProjectStore } from '../../renderer/stores/project'
import { shortcutRegistry } from '../../renderer/utils/shortcuts'
import { DEFAULT_SHORTCUTS } from '../../renderer/utils/default-shortcuts'

// --- helpers ---

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
    name: overrides.name,
    color: overrides.color,
  }
}

function makeValidProject(trackOverrides?: Partial<Record<string, unknown>>, clipOverrides?: Record<string, unknown>[]) {
  return {
    version: '3.0.0',
    id: 'test-proj',
    created: Date.now(),
    modified: Date.now(),
    settings: { resolution: [1920, 1080] as [number, number], frameRate: 30, bpm: 120 },
    assets: [],
    timeline: {
      tracks: [
        {
          id: 'trk1',
          type: 'video',
          name: 'Track 1',
          color: '#ff0000',
          isMuted: false,
          isSoloed: false,
          opacity: 1.0,
          blendMode: 'normal',
          effectChain: [],
          automationLanes: [],
          clips: clipOverrides ?? [],
          ...trackOverrides,
        },
      ],
      markers: [],
      zoom: 50,
      duration: 10,
    },
  }
}

describe('UE.7 — Clip rename + clip color', () => {
  let trackId: string

  beforeEach(() => {
    useTimelineStore.getState().reset()
    useUndoStore.getState().clear()
    useProjectStore.getState().resetProject()
    const id = useTimelineStore.getState().addTrack('Track 1', '#ff0000')
    trackId = id!
  })

  // -----------------------------------------------------------------------
  // Test 1: clip rename persists
  // -----------------------------------------------------------------------
  it('clip rename persists', () => {
    const clip = makeClip({ id: 'c1' })
    useTimelineStore.getState().addClip(trackId, clip)

    useTimelineStore.getState().renameClip('c1', 'My Clip')

    const stored = useTimelineStore.getState().tracks[0].clips.find((c) => c.id === 'c1')!
    expect(stored.name).toBe('My Clip')
  })

  // -----------------------------------------------------------------------
  // Test 2: clip color renders in timeline (store assertion)
  // -----------------------------------------------------------------------
  it('clip color renders in timeline', () => {
    const clip = makeClip({ id: 'c2' })
    useTimelineStore.getState().addClip(trackId, clip)

    useTimelineStore.getState().setClipColor('c2', '#C07A6A')

    const stored = useTimelineStore.getState().tracks[0].clips.find((c) => c.id === 'c2')!
    expect(stored.color).toBe('#C07A6A')
  })

  // -----------------------------------------------------------------------
  // Test 3 (NEGATIVE): legacy project without clip name/color loads clean
  // -----------------------------------------------------------------------
  it('legacy project without clip name/color loads clean', () => {
    // Clip deliberately missing name/color — must load without crash
    const project = makeValidProject({}, [
      {
        id: 'leg-clip',
        assetId: 'a1',
        trackId: 'trk1',
        position: 0,
        duration: 5,
        inPoint: 0,
        outPoint: 5,
        speed: 1,
        // NO name / color fields
      },
    ])

    expect(() => hydrateStores(project as any)).not.toThrow()

    // M.1 (Master-Out Bus PRD): no Master track in this fixture -> hydrate
    // injects one (appended after — the legacy track stays index 0).
    const tracks = useTimelineStore.getState().tracks
    expect(tracks).toHaveLength(2)
    const clip = tracks[0].clips.find((c) => c.id === 'leg-clip')!
    expect(clip).toBeDefined()
    expect(clip.name).toBeUndefined()
    expect(clip.color).toBeUndefined()
  })

  // -----------------------------------------------------------------------
  // Test 4: rename input suppresses timeline shortcuts
  //   The shortcutRegistry skips actions when e.target.tagName === 'INPUT'
  //   (shortcuts.ts:163). We verify this gate fires correctly.
  //   Also verifies CLIP_COLOR_SWATCHES has exactly 8 hexes.
  // -----------------------------------------------------------------------
  it('rename input suppresses timeline shortcuts', async () => {
    shortcutRegistry.loadDefaults(DEFAULT_SHORTCUTS)
    shortcutRegistry.resetAllOverrides()

    let called = false
    shortcutRegistry.register('delete_selected', () => { called = true })

    // Create a real INPUT element in jsdom and fire a Backspace keydown from it
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    // Dispatch a real event from the INPUT — e.target will be the input element
    const ev = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true })
    // handleKeyEvent reads e.target; dispatching from input sets that correctly
    input.dispatchEvent(ev)
    const consumed = shortcutRegistry.handleKeyEvent(ev)

    expect(consumed).toBe(false)
    expect(called).toBe(false)

    document.body.removeChild(input)

    // Also verify CLIP_COLOR_SWATCHES exports exactly 8 items (one per swatch)
    const { CLIP_COLOR_SWATCHES } = await import('../../renderer/components/timeline/Clip')
    expect(CLIP_COLOR_SWATCHES).toHaveLength(8)
    // Verify all 8 DESIGN-SPEC §8 hexes are present
    const expectedHexes = [
      '#C07A6A', '#B99655', '#97A659', '#6FA98A',
      '#5FA8A8', '#6E93BE', '#9B86C9', '#B878A8',
    ]
    const actualHexes = [...CLIP_COLOR_SWATCHES].map((s) => s.hex)
    expect(actualHexes).toEqual(expectedHexes)
  })

  // -----------------------------------------------------------------------
  // Test 5 (NEGATIVE): empty rename falls back to asset name
  // -----------------------------------------------------------------------
  it('empty rename falls back to asset name', () => {
    const clip = makeClip({ id: 'c5', name: 'Old Name' })
    useTimelineStore.getState().addClip(trackId, clip)

    // Renaming with '' clears to undefined — display falls back to assetName
    useTimelineStore.getState().renameClip('c5', '')

    const stored = useTimelineStore.getState().tracks[0].clips.find((c) => c.id === 'c5')!
    expect(stored.name).toBeUndefined()
  })

  // -----------------------------------------------------------------------
  // Test 6 (NEGATIVE): 512-char rename clamps to MAX_CLIP_NAME_LENGTH
  // -----------------------------------------------------------------------
  it('512-char rename clamps to MAX_CLIP_NAME_LENGTH', () => {
    const clip = makeClip({ id: 'c6' })
    useTimelineStore.getState().addClip(trackId, clip)

    const longName = 'A'.repeat(512)
    useTimelineStore.getState().renameClip('c6', longName)

    const stored = useTimelineStore.getState().tracks[0].clips.find((c) => c.id === 'c6')!
    expect(stored.name).toBeDefined()
    expect(stored.name!.length).toBe(LIMITS.MAX_CLIP_NAME_LENGTH)  // exactly 100
  })

  // -----------------------------------------------------------------------
  // Test 7 (INTEGRATION): rename and recolor survive save and reload round trip
  // -----------------------------------------------------------------------
  it('rename and recolor survive save and reload round trip', () => {
    const clip = makeClip({ id: 'rt-clip' })
    useTimelineStore.getState().addClip(trackId, clip)

    // Apply rename + color
    useTimelineStore.getState().renameClip('rt-clip', 'Round Trip Clip')
    useTimelineStore.getState().setClipColor('rt-clip', '#9B86C9')  // lavender

    // Serialize
    const json = serializeProject()
    const data = JSON.parse(json)

    // Verify name+color appear in the serialised payload
    const serialisedClip = data.timeline.tracks[0].clips.find((c: any) => c.id === 'rt-clip')
    expect(serialisedClip).toBeDefined()
    expect(serialisedClip.name).toBe('Round Trip Clip')
    expect(serialisedClip.color).toBe('#9B86C9')

    // Reset stores and reload
    useTimelineStore.getState().reset()
    useUndoStore.getState().clear()

    hydrateStores(data)

    // Assert both fields survived the round trip
    const loadedTracks = useTimelineStore.getState().tracks
    const loadedClip = loadedTracks.flatMap((t) => t.clips).find((c) => c.id === 'rt-clip')!
    expect(loadedClip).toBeDefined()
    expect(loadedClip.name).toBe('Round Trip Clip')
    expect(loadedClip.color).toBe('#9B86C9')
  })
})
