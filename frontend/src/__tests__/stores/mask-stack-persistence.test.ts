/**
 * MK.1 — Mask stack persistence tests.
 *
 * Covers the three named frontend tests from the packet contract:
 *   1. "mask stack survives save and load round trip"
 *      (integration: set stack → serialize → deserialize → deep-equal)
 *   2. "malformed matte node dropped with toast on load"
 *      (negative: node with bad id/kind → dropped, toast fired)
 *   3. "legacy project without maskStack loads clean"
 *      (negative: project saved before MK.1 → loads without error, maskStack absent)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Set up window.entropic mock before store imports (same pattern as project-persistence.test.ts)
const mockEntropic = {
  onEngineStatus: vi.fn(),
  sendCommand: vi.fn().mockResolvedValue({ ok: true }),
  selectFile: vi.fn().mockResolvedValue(null),
  selectSavePath: vi.fn().mockResolvedValue(null),
  onExportProgress: vi.fn().mockReturnValue(vi.fn()),
  getPathForFile: vi.fn().mockReturnValue('/test/video.mp4'),
  showSaveDialog: vi.fn().mockResolvedValue('/test/project.glitch'),
  showOpenDialog: vi.fn().mockResolvedValue('/test/project.glitch'),
  readFile: vi.fn().mockResolvedValue('{}'),
  writeFile: vi.fn().mockResolvedValue(undefined),
  deleteFile: vi.fn().mockResolvedValue(undefined),
  fileExists: vi.fn().mockResolvedValue(true),
  getAppPath: vi.fn().mockResolvedValue('/test/userData'),
}

;(globalThis as any).window = { entropic: mockEntropic }

import { useProjectStore } from '../../renderer/stores/project'
import { useTimelineStore } from '../../renderer/stores/timeline'
import { useUndoStore } from '../../renderer/stores/undo'
import { useToastStore } from '../../renderer/stores/toast'
import {
  serializeProject,
  hydrateStores,
  validateProject,
} from '../../renderer/project-persistence'
import type { MatteNode } from '../../shared/types'

// --------------------------------------------------------------------------- #
//  Helpers
// --------------------------------------------------------------------------- #

function resetStores() {
  useProjectStore.getState().resetProject()
  useTimelineStore.getState().reset()
  useUndoStore.getState().clear()
  useToastStore.setState({ toasts: [] })
  mockEntropic.showSaveDialog.mockReset().mockResolvedValue('/test/project.glitch')
  mockEntropic.readFile.mockReset().mockResolvedValue('{}')
  mockEntropic.writeFile.mockReset().mockResolvedValue(undefined)
  mockEntropic.deleteFile.mockReset().mockResolvedValue(undefined)
  mockEntropic.getAppPath.mockReset().mockResolvedValue('/test/userData')
}

/** Minimal valid project with one video track + one clip. */
function makeProjectWithClip(clipOverrides: Record<string, unknown> = {}) {
  return {
    version: '3.0.0',
    id: 'proj-mk1-test',
    created: 1700000000000,
    modified: 1700000000000,
    author: '',
    settings: {
      resolution: [1920, 1080],
      frameRate: 30,
      audioSampleRate: 44100,
      masterVolume: 1.0,
      seed: 42,
    },
    assets: {},
    timeline: {
      duration: 30,
      tracks: [
        {
          id: 'track-01',
          type: 'video',
          name: 'V1',
          color: '#4ade80',
          isMuted: false,
          isSoloed: false,
          clips: [
            {
              id: 'clip-01',
              assetId: 'asset-01',
              trackId: 'track-01',
              position: 0,
              duration: 10,
              inPoint: 0,
              outPoint: 10,
              speed: 1,
              ...clipOverrides,
            },
          ],
          effectChain: [],
          automationLanes: [],
        },
      ],
      markers: [],
      loopRegion: null,
    },
  }
}

/** A valid MatteNode for test assertions. */
const VALID_RECT_NODE: MatteNode = {
  id: 'mk1-rect-01',
  kind: 'rect',
  params: { x: 0.1, y: 0.2, w: 0.6, h: 0.4 },
  op: 'add',
  invert: false,
  feather: 5,
  growShrink: 0,
  enabled: true,
}

const VALID_ELLIPSE_NODE: MatteNode = {
  id: 'mk1-ellipse-02',
  kind: 'ellipse',
  params: { cx: 0.5, cy: 0.5, rx: 0.3, ry: 0.2 },
  op: 'subtract',
  invert: true,
  feather: 0,
  growShrink: -5,
  enabled: true,
}

// --------------------------------------------------------------------------- #
//  Test 1: mask stack survives save and load round trip
// --------------------------------------------------------------------------- #

describe('mask stack survives save and load round trip', () => {
  beforeEach(resetStores)

  it('persists a stack of two nodes through serialize → deserialize', () => {
    // Build project JSON with a maskStack on the clip
    const projectData = makeProjectWithClip({
      maskStack: [VALID_RECT_NODE, VALID_ELLIPSE_NODE],
    })

    // Validate structure passes (project file is valid)
    expect(validateProject(projectData)).toBe(true)

    // Hydrate into stores
    hydrateStores(projectData as any)

    // Read back from store
    const tl = useTimelineStore.getState()
    const tracks = tl.tracks
    expect(tracks).toHaveLength(1)
    const clip = tracks[0].clips[0]
    expect(clip).toBeDefined()
    expect(clip.maskStack).toBeDefined()
    expect(clip.maskStack).toHaveLength(2)

    // Deep-equal the first node
    const node0 = clip.maskStack![0]
    expect(node0.id).toBe(VALID_RECT_NODE.id)
    expect(node0.kind).toBe(VALID_RECT_NODE.kind)
    expect(node0.op).toBe(VALID_RECT_NODE.op)
    expect(node0.invert).toBe(VALID_RECT_NODE.invert)
    expect(node0.feather).toBe(VALID_RECT_NODE.feather)
    expect(node0.growShrink).toBe(VALID_RECT_NODE.growShrink)
    expect(node0.enabled).toBe(VALID_RECT_NODE.enabled)
    expect(node0.params).toEqual(VALID_RECT_NODE.params)

    // Deep-equal the second node
    const node1 = clip.maskStack![1]
    expect(node1.id).toBe(VALID_ELLIPSE_NODE.id)
    expect(node1.kind).toBe(VALID_ELLIPSE_NODE.kind)
    expect(node1.op).toBe(VALID_ELLIPSE_NODE.op)
    expect(node1.invert).toBe(VALID_ELLIPSE_NODE.invert)
    expect(node1.feather).toBe(VALID_ELLIPSE_NODE.feather)
    expect(node1.growShrink).toBe(VALID_ELLIPSE_NODE.growShrink)
  })

  it('feather is clamped from 200 to 100 on load', () => {
    const oversizedNode = { ...VALID_RECT_NODE, id: 'clamp-test', feather: 200 }
    const projectData = makeProjectWithClip({ maskStack: [oversizedNode] })
    hydrateStores(projectData as any)

    const clip = useTimelineStore.getState().tracks[0].clips[0]
    expect(clip.maskStack![0].feather).toBe(100)
  })

  it('growShrink is clamped from -100 to -50 on load', () => {
    const oversizedNode = { ...VALID_RECT_NODE, id: 'clamp-gs', growShrink: -100 }
    const projectData = makeProjectWithClip({ maskStack: [oversizedNode] })
    hydrateStores(projectData as any)

    const clip = useTimelineStore.getState().tracks[0].clips[0]
    expect(clip.maskStack![0].growShrink).toBe(-50)
  })

  it('NaN feather is clamped to 0 on load', () => {
    const nanNode = { ...VALID_RECT_NODE, id: 'nan-feat', feather: NaN }
    const projectData = makeProjectWithClip({ maskStack: [nanNode] })
    hydrateStores(projectData as any)

    const clip = useTimelineStore.getState().tracks[0].clips[0]
    expect(Number.isFinite(clip.maskStack![0].feather)).toBe(true)
    expect(clip.maskStack![0].feather).toBe(0)
  })
})

// --------------------------------------------------------------------------- #
//  Test 2: malformed matte node dropped with toast on load  (negative)
// --------------------------------------------------------------------------- #

describe('malformed matte node dropped with toast on load', () => {
  beforeEach(resetStores)

  it('drops a node with an invalid id and fires a toast', () => {
    const badNode = { ...VALID_RECT_NODE, id: 'bad id with spaces!!' }
    const projectData = makeProjectWithClip({ maskStack: [badNode] })
    hydrateStores(projectData as any)

    const clip = useTimelineStore.getState().tracks[0].clips[0]
    // The bad node must be dropped — maskStack is empty or absent
    const stack = clip.maskStack ?? []
    expect(stack).toHaveLength(0)

    // A toast must have fired
    const toasts = useToastStore.getState().toasts
    const maskToast = toasts.find((t) => t.source === 'mask-stack-load')
    expect(maskToast).toBeDefined()
    expect(maskToast?.level).toBe('warning')
  })

  it('drops a node with an unknown kind and fires a toast', () => {
    const badNode = { ...VALID_RECT_NODE, id: 'unknown-kind-01', kind: 'trapezoid' }
    const projectData = makeProjectWithClip({ maskStack: [badNode] })
    hydrateStores(projectData as any)

    const clip = useTimelineStore.getState().tracks[0].clips[0]
    expect((clip.maskStack ?? [])).toHaveLength(0)

    const toasts = useToastStore.getState().toasts
    expect(toasts.some((t) => t.source === 'mask-stack-load')).toBe(true)
  })

  it('drops bad nodes but keeps valid ones in a mixed stack', () => {
    const goodNode = { ...VALID_RECT_NODE }
    const badNode = { ...VALID_ELLIPSE_NODE, id: '!!bad!!' }  // bad id
    const projectData = makeProjectWithClip({ maskStack: [goodNode, badNode] })
    hydrateStores(projectData as any)

    const clip = useTimelineStore.getState().tracks[0].clips[0]
    const stack = clip.maskStack ?? []
    // Only the good node survives
    expect(stack).toHaveLength(1)
    expect(stack[0].id).toBe(VALID_RECT_NODE.id)
  })

  it('clamps NaN params in the params dict to 0 instead of dropping the node', () => {
    // A node with NaN in params should survive — NaN is clamped, not a rejection
    const nanParamNode = {
      ...VALID_RECT_NODE,
      id: 'nan-params-01',
      params: { x: NaN, y: 0.1, w: 0.5, h: 0.4 },
    }
    const projectData = makeProjectWithClip({ maskStack: [nanParamNode] })
    hydrateStores(projectData as any)

    const clip = useTimelineStore.getState().tracks[0].clips[0]
    const stack = clip.maskStack ?? []
    expect(stack).toHaveLength(1)
    expect(stack[0].params.x).toBe(0)  // NaN clamped to 0
    expect(stack[0].params.y).toBe(0.1)  // finite preserved
  })
})

// --------------------------------------------------------------------------- #
//  Test 3: legacy project without maskStack loads clean  (negative)
// --------------------------------------------------------------------------- #

describe('legacy project without maskStack loads clean', () => {
  beforeEach(resetStores)

  it('loads a project where clips have no maskStack without error', () => {
    const projectData = makeProjectWithClip()  // no maskStack key
    expect(validateProject(projectData)).toBe(true)

    // Must not throw
    expect(() => hydrateStores(projectData as any)).not.toThrow()

    const clip = useTimelineStore.getState().tracks[0].clips[0]
    expect(clip).toBeDefined()
    // maskStack must be absent or empty — not an error
    expect(clip.maskStack == null || clip.maskStack.length === 0).toBe(true)
  })

  it('does not emit a mask-stack-load toast for a clean legacy project', () => {
    const projectData = makeProjectWithClip()
    hydrateStores(projectData as any)

    const toasts = useToastStore.getState().toasts
    const maskToasts = toasts.filter((t) => t.source === 'mask-stack-load')
    expect(maskToasts).toHaveLength(0)
  })

  it('loads a project where maskStack is explicitly null without error', () => {
    const projectData = makeProjectWithClip({ maskStack: null })
    expect(() => hydrateStores(projectData as any)).not.toThrow()
    const clip = useTimelineStore.getState().tracks[0].clips[0]
    const stack = clip.maskStack ?? []
    expect(stack).toHaveLength(0)
  })

  it('loads a project where maskStack is an empty array cleanly', () => {
    const projectData = makeProjectWithClip({ maskStack: [] })
    expect(() => hydrateStores(projectData as any)).not.toThrow()
    const clip = useTimelineStore.getState().tracks[0].clips[0]
    const stack = clip.maskStack ?? []
    expect(stack).toHaveLength(0)
  })
})

// --------------------------------------------------------------------------- #
//  F2 sibling sweep: polygon vertices (array-shaped params) survive reload
// --------------------------------------------------------------------------- #
//
// validateMatteNode's params sanitizer only kept `number` and `string` values
// — every array value (polygon `vertices`, stored as number[] or number[][]
// per the MatteNode.params type) was silently dropped. A polygon matte
// therefore survived save -> reload as an EMPTY node (params.vertices gone),
// which renders nothing. Same silent-loss bug class as the sampler headline
// bug, just on a different type.

describe('polygon matte vertices survive save and load round trip (F2)', () => {
  beforeEach(resetStores)

  const POLYGON_NODE: MatteNode = {
    id: 'mk1-polygon-01',
    kind: 'polygon',
    params: { vertices: [[0.1, 0.1], [0.9, 0.1], [0.5, 0.9]] },
    op: 'add',
    invert: false,
    feather: 2,
    growShrink: 0,
    enabled: true,
  }

  it('a polygon node (number[][] vertices) round-trips through serialize -> deserialize', () => {
    const projectData = makeProjectWithClip({ maskStack: [POLYGON_NODE] })
    hydrateStores(projectData as any)

    const clip = useTimelineStore.getState().tracks[0].clips[0]
    const stack = clip.maskStack ?? []
    expect(stack).toHaveLength(1)
    expect(stack[0].params.vertices).toEqual([[0.1, 0.1], [0.9, 0.1], [0.5, 0.9]])
  })

  it('a flat number[] vertices array also round-trips (both encodings accepted)', () => {
    const flatNode: MatteNode = { ...POLYGON_NODE, id: 'flat-01', params: { vertices: [0.1, 0.1, 0.9, 0.1, 0.5, 0.9] } }
    const projectData = makeProjectWithClip({ maskStack: [flatNode] })
    hydrateStores(projectData as any)

    const clip = useTimelineStore.getState().tracks[0].clips[0]
    const stack = clip.maskStack ?? []
    expect(stack).toHaveLength(1)
    expect(stack[0].params.vertices).toEqual([0.1, 0.1, 0.9, 0.1, 0.5, 0.9])
  })

  it('NaN inside vertex pairs is clamped to 0, never dropped or crashes', () => {
    const nanNode: MatteNode = { ...POLYGON_NODE, id: 'nan-verts', params: { vertices: [[NaN, 0.2], [0.9, Infinity]] } }
    const projectData = makeProjectWithClip({ maskStack: [nanNode] })
    expect(() => hydrateStores(projectData as any)).not.toThrow()

    const clip = useTimelineStore.getState().tracks[0].clips[0]
    const stack = clip.maskStack ?? []
    expect(stack).toHaveLength(1)
    expect(stack[0].params.vertices).toEqual([[0, 0.2], [0.9, 0]])
  })

  it('a full save -> JSON.parse -> reload round trip preserves vertices end to end', () => {
    const projectData = makeProjectWithClip({ maskStack: [POLYGON_NODE] })
    // Round-trip through actual JSON serialization (not just object identity).
    const json = JSON.stringify(projectData)
    const reparsed = JSON.parse(json)
    expect(validateProject(reparsed)).toBe(true)
    hydrateStores(reparsed)

    const clip = useTimelineStore.getState().tracks[0].clips[0]
    expect(clip.maskStack![0].params.vertices).toEqual([[0.1, 0.1], [0.9, 0.1], [0.5, 0.9]])
  })
})
