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
  getAppPath: vi.fn().mockResolvedValue('/test/userData'),
}
;(globalThis as any).window = { entropic: mockEntropic }

import { validateProjectStructure, loadProject } from '../../renderer/project-persistence'
import { useToastStore } from '../../renderer/stores/toast'

describe('validateProjectStructure', () => {
  it('accepts a normal v2.0.0 project shape', () => {
    const data = {
      version: '2.0.0',
      id: 'abc',
      timeline: { tracks: [], markers: [] },
      assets: {},
    }
    expect(validateProjectStructure(data).valid).toBe(true)
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
    const data = JSON.parse('{"version":"2.0.0","__proto__":{"polluted":true}}')
    const result = validateProjectStructure(data)
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/__proto__/)
  })

  it('rejects nested __proto__ key', () => {
    const data = JSON.parse(
      '{"version":"2.0.0","timeline":{"tracks":[{"__proto__":{"isAdmin":true}}]}}',
    )
    const result = validateProjectStructure(data)
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/__proto__/)
  })

  it('rejects constructor key', () => {
    const data = { version: '2.0.0', payload: { constructor: 'evil' } }
    const result = validateProjectStructure(data)
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/constructor/)
  })

  it('rejects prototype key', () => {
    const data = { version: '2.0.0', payload: { prototype: 'evil' } }
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
    const data = JSON.parse(`{"version":"2.0.0","payload":{"${badKey}":"evil"}}`)
    const result = validateProjectStructure(data)
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(new RegExp(badKey))
  })

  it('does NOT reject keys that merely contain forbidden substrings (over-rejection guard)', () => {
    const data = {
      version: '2.0.0',
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
    const data = { version: '2.0.0', huge }
    const result = validateProjectStructure(data)
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/Array length/i)
  })

  it('accepts arrays at the 10000 boundary', () => {
    const data = { version: '2.0.0', boundary: new Array(10_000).fill(0) }
    expect(validateProjectStructure(data).valid).toBe(true)
  })

  it('rejects objects with more than 1024 keys per node', () => {
    const obj: Record<string, number> = {}
    for (let i = 0; i < 1025; i++) obj[`k${i}`] = i
    const data = { version: '2.0.0', payload: obj }
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
    expect(result.reason).toMatch(/newer Entropic version/i)
  })

  it('accepts projects with same major version', () => {
    const data = { version: '2.5.7', id: 'abc' }
    expect(validateProjectStructure(data).valid).toBe(true)
  })

  it('handles non-object input without crashing', () => {
    expect(validateProjectStructure(null).valid).toBe(true)
    expect(validateProjectStructure('string').valid).toBe(true)
    expect(validateProjectStructure(42).valid).toBe(true)
    expect(validateProjectStructure(undefined).valid).toBe(true)
  })

  it('handles non-numeric version major silently', () => {
    // Defensive: a malformed version like "abc.def.xyz" should not crash
    const data = { version: 'abc.def.xyz', id: 'x' }
    expect(validateProjectStructure(data).valid).toBe(true)
  })

  it('handles version with leading zeros / numeric tail', () => {
    const data = { version: '02.1.0', id: 'x' }
    // parseInt('02', 10) === 2, equals current major → accepted
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
    const result = validateProjectStructure({ version: '2.0.0', deep: node })
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
    mockEntropic.readFile.mockResolvedValue(JSON.stringify({ version: '2.0.0', deep: nest }))
    const ok = await loadProject('/test/depth-bomb.glitch')
    expect(ok).toBe(false)
    const toasts = useToastStore.getState().toasts
    expect(toasts.length).toBeGreaterThan(0)
    expect(toasts[0].message).toMatch(/rejected/i)
  })

  it('rejects a __proto__ pollution attempt with a toast', async () => {
    // JSON.parse preserves __proto__ as a data property; our walker catches it.
    const evil = '{"version":"2.0.0","__proto__":{"isAdmin":true}}'
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
