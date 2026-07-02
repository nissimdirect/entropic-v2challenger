/**
 * Project load hardening tests — defends against weaponized .glitch files.
 *
 * Project files are user-supplied data. JSON.parse(readFile()) is an attacker-
 * controlled boundary. validateProjectStructure runs before validateProject
 * to reject hostile shapes before they touch the rest of the load path.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockEntropic = {
  showOpenDialog: vi.fn().mockResolvedValue('/test/project.glitch'),
  readFile: vi.fn().mockResolvedValue('{}'),
  deleteFile: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  fileExists: vi.fn().mockResolvedValue(true),
  getAppPath: vi.fn().mockResolvedValue('/test/userData'),
}
;(globalThis as any).window = { entropic: mockEntropic }

import { validateProjectStructure, loadProject, hydrateStores } from '../../renderer/project-persistence'
import { useToastStore } from '../../renderer/stores/toast'
import { useTimelineStore } from '../../renderer/stores/timeline'
import { useAutomationStore } from '../../renderer/stores/automation'
import { evaluateTransformOverrides } from '../../renderer/utils/transformLanes'

describe('validateProjectStructure', () => {
  it('accepts a normal v3.0.0 project shape', () => {
    const data = {
      version: '3.0.0',
      id: 'abc',
      timeline: { tracks: [], markers: [] },
      assets: {},
    }
    expect(validateProjectStructure(data).valid).toBe(true)
  })

  // P2.2a (slice 3c, Decision D1 clean break): pre-v3 projects are rejected
  // loudly with the contractual message — no migration, no silent partial load.
  it('rejects a v2 project with the unsupported-version message', () => {
    const data = { version: '2.0.0', id: 'abc', timeline: { tracks: [] }, assets: {} }
    const result = validateProjectStructure(data)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe("Unsupported project format (v2 / pre-3.0) — this version can't open it.")
  })

  // Red-team RT-2: "v2.0.0" (non-digit head) made parseInt return NaN and the
  // version gate was SKIPPED — a forged version string carried a pre-v3 shape
  // past the clean break. The head must be strictly numeric.
  it('rejects a forged non-digit version prefix instead of skipping the gate', () => {
    for (const forged of ['v2.0.0', 'x3.0.0', 'A2.0.0']) {
      const result = validateProjectStructure({ version: forged, id: 'abc', timeline: { tracks: [] }, assets: {} })
      expect(result.valid, `forged version ${forged} must be rejected`).toBe(false)
      expect(result.reason).toMatch(/Invalid project version format/)
    }
  })

  it('rejects nesting depth above 32', () => {
    let node: Record<string, unknown> = {}
    let cursor = node
    for (let i = 0; i < 35; i++) {
      const next = {}
      cursor.nest = next
      cursor = next as Record<string, unknown>
    }
    const result = validateProjectStructure(node)
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/nesting depth/i)
  })

  it('rejects __proto__ key (prototype pollution attempt)', () => {
    // Object literals special-case __proto__; JSON.parse preserves it as a
    // data property, which is the actual attack vector.
    const data = JSON.parse('{"version":"3.0.0","__proto__":{"polluted":true}}')
    const result = validateProjectStructure(data)
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/__proto__/)
  })

  it('rejects nested __proto__ key', () => {
    const data = JSON.parse(
      '{"version":"3.0.0","timeline":{"tracks":[{"__proto__":{"isAdmin":true}}]}}',
    )
    const result = validateProjectStructure(data)
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/__proto__/)
  })

  it('rejects constructor key', () => {
    const data = { version: '3.0.0', payload: { constructor: 'evil' } }
    const result = validateProjectStructure(data)
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/constructor/)
  })

  it('rejects prototype key', () => {
    const data = { version: '3.0.0', payload: { prototype: 'evil' } }
    const result = validateProjectStructure(data)
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/prototype/)
  })

  // RT-4 (2026-05-16 red-team): FORBIDDEN_KEY_PATTERN matches case-insensitively
  // so a .glitch with `__PROTO__` / `Constructor` / `PROTOTYPE` can't bypass.
  it.each([
    '__PROTO__',
    '__Proto__',
    'Constructor',
    'CONSTRUCTOR',
    'Prototype',
    'PROTOTYPE',
  ])('rejects forbidden key with mixed case: %s', (badKey) => {
    const data = JSON.parse(`{"version":"3.0.0","payload":{"${badKey}":"evil"}}`)
    const result = validateProjectStructure(data)
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(new RegExp(badKey))
  })

  it('does NOT reject keys that merely contain forbidden substrings (over-rejection guard)', () => {
    const data = {
      version: '3.0.0',
      payload: {
        my__proto__field: 'safe',
        constructor_helper: 'also safe',
        prototype_label: 'also safe',
      },
    }
    expect(validateProjectStructure(data).valid).toBe(true)
  })

  it('rejects arrays larger than 10000', () => {
    const huge = new Array(10_001).fill(0)
    const data = { version: '3.0.0', huge }
    const result = validateProjectStructure(data)
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/Array length/i)
  })

  it('accepts arrays at the 10000 boundary', () => {
    const data = { version: '3.0.0', boundary: new Array(10_000).fill(0) }
    expect(validateProjectStructure(data).valid).toBe(true)
  })

  it('rejects objects with more than 1024 keys per node', () => {
    const obj: Record<string, number> = {}
    for (let i = 0; i < 1025; i++) obj[`k${i}`] = i
    const data = { version: '3.0.0', payload: obj }
    const result = validateProjectStructure(data)
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/key count/i)
  })

  it('rejects version strings longer than 16 chars', () => {
    const data = { version: '2.0.0' + 'A'.repeat(20), id: 'abc' }
    const result = validateProjectStructure(data)
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/version field/i)
  })

  it('rejects projects with major version greater than current', () => {
    const data = { version: '99.0.0', id: 'abc' }
    const result = validateProjectStructure(data)
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/newer Creatrix version/i)
  })

  it('accepts projects with same major version', () => {
    const data = { version: '3.5.7', id: 'abc' }
    expect(validateProjectStructure(data).valid).toBe(true)
  })

  it('handles non-object input without crashing', () => {
    expect(validateProjectStructure(null).valid).toBe(true)
    expect(validateProjectStructure('string').valid).toBe(true)
    expect(validateProjectStructure(42).valid).toBe(true)
    expect(validateProjectStructure(undefined).valid).toBe(true)
  })

  it('rejects a non-numeric version major (was silently accepted pre-RT-2)', () => {
    // Red-team RT-2 changed this contract: a malformed version like
    // "abc.def.xyz" used to skip the version gate (the forged-"v2.0.0"
    // evasion). It now rejects loudly — still no crash.
    const data = { version: 'abc.def.xyz', id: 'x' }
    const result = validateProjectStructure(data)
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/Invalid project version format/)
  })

  it('handles version with leading zeros / numeric tail', () => {
    const data = { version: '03.1.0', id: 'x' }
    // parseInt('03', 10) === 3, equals current major → accepted
    expect(validateProjectStructure(data).valid).toBe(true)
  })

  it('walks deeply nested arrays as well as objects', () => {
    let node: unknown[] = []
    let cursor = node
    for (let i = 0; i < 35; i++) {
      const next: unknown[] = []
      cursor.push(next)
      cursor = next
    }
    const result = validateProjectStructure({ version: '3.0.0', deep: node })
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/nesting depth/i)
  })
})

describe('loadProject — hostile fixture rejection', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] })
    mockEntropic.readFile.mockReset()
  })

  it('rejects a depth-bomb file with a toast', async () => {
    let nest: Record<string, unknown> = {}
    let cursor = nest
    for (let i = 0; i < 35; i++) {
      const next = {}
      cursor.nest = next
      cursor = next as Record<string, unknown>
    }
    mockEntropic.readFile.mockResolvedValue(JSON.stringify({ version: '3.0.0', deep: nest }))
    const ok = await loadProject('/test/depth-bomb.glitch')
    expect(ok).toBe(false)
    const toasts = useToastStore.getState().toasts
    expect(toasts.length).toBeGreaterThan(0)
    expect(toasts[0].message).toMatch(/rejected/i)
  })

  it('rejects a __proto__ pollution attempt with a toast', async () => {
    // JSON.parse preserves __proto__ as a data property; our walker catches it.
    const evil = '{"version":"3.0.0","__proto__":{"isAdmin":true}}'
    mockEntropic.readFile.mockResolvedValue(evil)
    const ok = await loadProject('/test/proto-pollute.glitch')
    expect(ok).toBe(false)
    const toasts = useToastStore.getState().toasts
    expect(toasts[0].message).toMatch(/__proto__/)
  })

  it('rejects a future-version file with a toast naming the version', async () => {
    mockEntropic.readFile.mockResolvedValue(JSON.stringify({ version: '99.0.0' }))
    const ok = await loadProject('/test/future.glitch')
    expect(ok).toBe(false)
    const toasts = useToastStore.getState().toasts
    expect(toasts[0].message).toMatch(/v99/)
  })
})

// Red-team RT-1: hydrateStores writes chains via the raw store primitive,
// bypassing the transaction-commit validator — load-time placement guards
// must drop/normalize composites that violate R1/R2/R3 from hostile files.
describe('hydrateStores — load-time composite placement guard (RT-1)', () => {
  const compositeEntry = (id: string) => ({
    id, effectId: 'composite', isEnabled: true, isFrozen: false,
    parameters: { opacity: 0.5, mode: 'add' }, modulations: {}, mix: 1, mask: null,
  })
  const normalEffect = (id: string) => ({
    id, effectId: 'pixel_sort', isEnabled: true, isFrozen: false,
    parameters: {}, modulations: {}, mix: 1, mask: null,
  })

  function baseProject(tracks: unknown[]) {
    return {
      version: '3.0.0', id: 'p1', created: 1, modified: 1, author: '',
      settings: { resolution: [1920, 1080], frameRate: 30, audioSampleRate: 44100, masterVolume: 1, seed: 42 },
      assets: {}, timeline: { duration: 0, tracks, markers: [], loopRegion: null },
    } as Parameters<typeof hydrateStores>[0]
  }

  beforeEach(() => {
    useTimelineStore.getState().reset()
    useToastStore.setState({ toasts: [] })
  })

  it('drops a composite found on an audio track in the saved file, with a toast', () => {
    hydrateStores(baseProject([{
      id: 't-audio', type: 'audio', name: 'A1', color: '#fff', clips: [],
      effectChain: [compositeEntry('c1')],
    }]))
    const tracks = useTimelineStore.getState().tracks
    const audio = tracks.find((t) => t.type === 'audio')
    expect(audio?.effectChain ?? []).toHaveLength(0)
    expect(useToastStore.getState().toasts.some((t) => /audio track/i.test(t.message))).toBe(true)
  })

  it('keeps only the terminal composite when the saved file has duplicates', () => {
    hydrateStores(baseProject([{
      id: 't-video', type: 'video', name: 'V1', color: '#fff', clips: [],
      effectChain: [compositeEntry('c1'), normalEffect('e1'), compositeEntry('c2')],
    }]))
    const video = useTimelineStore.getState().tracks.find((t) => t.type === 'video')
    const composites = (video?.effectChain ?? []).filter((e) => e.effectId === 'composite')
    expect(composites).toHaveLength(1)
    expect(composites[0].id).toBe('c2')
    expect(video?.effectChain[video.effectChain.length - 1].effectId).toBe('composite')
  })

  it('moves a single mid-chain composite to the terminal position on load', () => {
    hydrateStores(baseProject([{
      id: 't-video', type: 'video', name: 'V1', color: '#fff', clips: [],
      effectChain: [compositeEntry('c1'), normalEffect('e1')],
    }]))
    const video = useTimelineStore.getState().tracks.find((t) => t.type === 'video')
    expect(video?.effectChain).toHaveLength(2)
    expect(video?.effectChain[1].effectId).toBe('composite')
  })
})

// PR #344 red-team fix (CONFIRMED tiger, PoC-proven): a tampered .glitch can
// set an effect node id to `clipTransform.<victimClipId>` (sanitizeEffectChain
// accepted any string id); an ordinary effect-param automation lane on that
// effect's `rotation` param then has paramPath `clipTransform.<victim>.rotation`,
// which parses as a TRANSFORM lane and hijacks the victim clip's transform every
// frame. Fix: reserve the namespace at load (strip the effect + poison the
// clipId) AND drop the paired hijack lane. Legit transform lanes still work.
describe('hydrateStores — clipTransform namespace hijack (PR #344 red-team)', () => {
  const clip = (id: string) => ({
    id, assetId: 'a1', trackId: 't-video', position: 0, duration: 5,
    inPoint: 0, outPoint: 5, speed: 1,
  })
  const rotationLane = (clipId: string) => ({
    id: `lane-${clipId}`,
    paramPath: `clipTransform.${clipId}.rotation`,
    color: '#ef4444',
    isVisible: true,
    mode: 'smooth',
    // normalized 1.0 → denormalizes to the rotation display max (360°) if evaluated.
    points: [{ time: 0, value: 1, curve: 0 }],
  })

  function projectWith(tracks: unknown[], automationLanes: Record<string, unknown[]>) {
    return {
      version: '3.0.0', id: 'p1', created: 1, modified: 1, author: '',
      settings: { resolution: [1920, 1080], frameRate: 30, audioSampleRate: 44100, masterVolume: 1, seed: 42 },
      assets: {}, timeline: { duration: 0, tracks, markers: [], loopRegion: null },
      automationLanes,
    } as unknown as Parameters<typeof hydrateStores>[0]
  }

  beforeEach(() => {
    useTimelineStore.getState().reset()
    useToastStore.setState({ toasts: [] })
    useAutomationStore.getState().resetAutomation()
  })

  it('PoC: forged effect id `clipTransform.victim` + paired lane → effect stripped AND no override for the victim clip', () => {
    hydrateStores(projectWith(
      [{
        id: 't-video', type: 'video', name: 'V1', color: '#fff',
        clips: [clip('victim')],
        // The weaponized node: an effect claiming the reserved namespace id.
        effectChain: [{
          id: 'clipTransform.victim', effectId: 'kaleidoscope', isEnabled: true,
          isFrozen: false, parameters: { rotation: 0.5 }, modulations: {}, mix: 1, mask: null,
        }],
      }],
      { 't-video': [rotationLane('victim')] },
    ))

    // 1. The forged effect node is stripped from the loaded chain.
    const video = useTimelineStore.getState().tracks.find((t) => t.type === 'video')
    expect(video?.effectChain ?? []).toHaveLength(0)

    // 2. The paired hijack lane is dropped → evaluateTransformOverrides yields
    //    NO override for the victim clip at any time.
    const lanes = useAutomationStore.getState().getAllLanes()
    const overrides = evaluateTransformOverrides(lanes, 0)
    expect(overrides.victim).toBeUndefined()

    // 3. The user is warned (the reserved-id + hijack-lane removals both emit a
    //    `project-load` warning; the toast store dedups by source, collapsing
    //    them into one whose message ends "removed on load").
    expect(
      useToastStore.getState().toasts.some(
        (t) => t.source === 'project-load' && /removed on load/i.test(t.message),
      ),
    ).toBe(true)
  })

  it('legit toolbar-created transform lane (real clip, no forged effect) still animates the clip', () => {
    hydrateStores(projectWith(
      [{
        id: 't-video', type: 'video', name: 'V1', color: '#fff',
        clips: [clip('realclip')],
        effectChain: [], // NO forged effect — a normal project
      }],
      { 't-video': [rotationLane('realclip')] },
    ))

    const lanes = useAutomationStore.getState().getAllLanes()
    // The legit lane survived load.
    expect(lanes.some((l) => l.paramPath === 'clipTransform.realclip.rotation')).toBe(true)
    // And it produces a live override.
    const overrides = evaluateTransformOverrides(lanes, 0)
    expect(overrides.realclip).toEqual({ rotation: 360 })
  })

  it('transform lane referencing a NONEXISTENT clip is dropped (dead-lane cleanup)', () => {
    hydrateStores(projectWith(
      [{ id: 't-video', type: 'video', name: 'V1', color: '#fff', clips: [clip('realclip')], effectChain: [] }],
      { 't-video': [rotationLane('ghost')] }, // 'ghost' clip does not exist
    ))
    const lanes = useAutomationStore.getState().getAllLanes()
    expect(lanes.some((l) => l.paramPath === 'clipTransform.ghost.rotation')).toBe(false)
  })
})
