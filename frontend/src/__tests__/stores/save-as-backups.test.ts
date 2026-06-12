/**
 * UE.4 — Save As + numbered project backups.
 *
 * Covers: Save As rebind semantics, rolling .bak.1..5 rotation (rotate BEFORE
 * overwrite), rotation-failure resilience, and the full save-as round trip.
 * The window-title assertion is structural: App.tsx derives document.title
 * from projectName (App.tsx ~:349), so the round-trip asserts projectName and
 * greps the App.tsx source for both the 'save-as' dispatch and the title rule.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Set up window.entropic mock before store imports (matches project-persistence.test.ts pattern)
const mockEntropic = {
  onEngineStatus: vi.fn(),
  sendCommand: vi.fn().mockResolvedValue({ ok: true }),
  selectFile: vi.fn().mockResolvedValue(null),
  selectSavePath: vi.fn().mockResolvedValue(null),
  onExportProgress: vi.fn().mockReturnValue(vi.fn()),
  getPathForFile: vi.fn().mockReturnValue('/test/video.mp4'),
  showSaveDialog: vi.fn().mockResolvedValue('/test/project.glitch'),
  showOpenDialog: vi.fn().mockResolvedValue('/test/project.glitch'),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  deleteFile: vi.fn(),
  getAppPath: vi.fn().mockResolvedValue('/test/userData'),
}

;(globalThis as any).window = { entropic: mockEntropic }

import { useProjectStore } from '../../renderer/stores/project'
import { useToastStore } from '../../renderer/stores/toast'
import {
  saveProject,
  saveProjectAs,
  loadProject,
  serializeProject,
  rotateBackups,
  MAX_BACKUPS,
} from '../../renderer/project-persistence'

// In-memory filesystem driving the readFile/writeFile/deleteFile mocks
let memfs: Map<string, string>

function wireMemFs() {
  mockEntropic.readFile.mockImplementation(async (p: string) => {
    if (!memfs.has(p)) throw new Error(`ENOENT: ${p}`)
    return memfs.get(p)!
  })
  mockEntropic.writeFile.mockImplementation(async (p: string, data: string) => {
    memfs.set(p, data)
  })
  mockEntropic.deleteFile.mockImplementation(async (p: string) => {
    memfs.delete(p)
  })
}

function bakFiles(base: string): string[] {
  return [...memfs.keys()].filter((k) => k.startsWith(`${base}.bak.`)).sort()
}

beforeEach(() => {
  memfs = new Map()
  wireMemFs()
  mockEntropic.showSaveDialog.mockReset().mockResolvedValue('/test/project.glitch')
  useProjectStore.getState().resetProject()
  useToastStore.setState({ toasts: [] })
})

describe('UE.4 Save As', () => {
  it('save as writes new path and rebinds project', async () => {
    // Bind to an original path first
    useProjectStore.getState().setProjectPath('/test/original.glitch')
    useProjectStore.getState().setProjectName('original')

    mockEntropic.showSaveDialog.mockResolvedValue('/test/renamed.glitch')
    const ok = await saveProjectAs()

    expect(ok).toBe(true)
    expect(memfs.has('/test/renamed.glitch')).toBe(true)
    expect(useProjectStore.getState().projectPath).toBe('/test/renamed.glitch')
    expect(useProjectStore.getState().projectName).toBe('renamed')

    // Subsequent Cmd+S targets the NEW path
    await saveProject()
    const writesToOriginal = mockEntropic.writeFile.mock.calls.filter(
      (c: unknown[]) => c[0] === '/test/original.glitch',
    )
    expect(writesToOriginal).toHaveLength(0)
    expect(memfs.has('/test/renamed.glitch')).toBe(true)
  })

  it('save as to unwritable path shows error toast and keeps old binding', async () => {
    useProjectStore.getState().setProjectPath('/test/original.glitch')
    useProjectStore.getState().setProjectName('original')

    mockEntropic.showSaveDialog.mockResolvedValue('/readonly/nope.glitch')
    mockEntropic.writeFile.mockImplementation(async (p: string) => {
      if (p === '/readonly/nope.glitch') throw new Error('EACCES: permission denied')
      // unreachable in this test, but keep memfs semantics
      memfs.set(p, '')
    })

    const ok = await saveProjectAs()

    expect(ok).toBe(false)
    // Failed Save As must NOT rebind — Cmd+S still targets the ORIGINAL file
    expect(useProjectStore.getState().projectPath).toBe('/test/original.glitch')
    expect(useProjectStore.getState().projectName).toBe('original')
    const errorToasts = useToastStore.getState().toasts.filter((t) => t.level === 'error')
    expect(errorToasts.length).toBeGreaterThanOrEqual(1)
  })

  it('save as round trip: menu event → dialog path → write → rebind → title updates → reload from new path', async () => {
    // Menu-event wiring is structural: App.tsx routes the 'save-as' menu action
    // to saveProjectAs(), and derives document.title from projectName.
    const appSrc = readFileSync(
      resolve(__dirname, '../../renderer/App.tsx'),
      'utf-8',
    )
    expect(appSrc).toMatch(/case 'save-as': saveProjectAs\(\); break/)
    expect(appSrc).toMatch(/document\.title = isDirty \? `\$\{projectName\}/)

    useProjectStore.getState().setProjectPath('/test/orig.glitch')
    useProjectStore.getState().setProjectName('orig')
    const before = serializeProject()

    mockEntropic.showSaveDialog.mockResolvedValue('/test/copied.glitch')
    const ok = await saveProjectAs()
    expect(ok).toBe(true)

    // Write payload landed at the dialog path and parses as a valid project
    const written = memfs.get('/test/copied.glitch')
    expect(written).toBeDefined()
    expect(JSON.parse(written!).settings).toBeDefined()

    // Rebind + name (drives the window title per App.tsx)
    expect(useProjectStore.getState().projectPath).toBe('/test/copied.glitch')
    expect(useProjectStore.getState().projectName).toBe('copied')

    // Reload from the new path → deep-equal project state.
    // serializeProject() mints id/created/modified per call (existing schema
    // behavior, project-persistence.ts:160) — exclude those serialization-time
    // fields; all content fields must round-trip exactly.
    const loaded = await loadProject('/test/copied.glitch')
    expect(loaded).toBe(true)
    const stripVolatile = (j: string) => {
      const o = JSON.parse(j)
      delete o.id
      delete o.created
      delete o.modified
      return o
    }
    expect(stripVolatile(serializeProject())).toEqual(stripVolatile(before))
  })
})

describe('UE.4 backup rotation', () => {
  it('backup rotation keeps exactly five backups', async () => {
    const path = '/test/project.glitch'
    useProjectStore.getState().setProjectPath(path)

    // 7 manual saves; each save rotates BEFORE overwriting
    for (let i = 1; i <= 7; i++) {
      useProjectStore.getState().setProjectName(`rev-${i}`)
      const ok = await saveProject()
      expect(ok).toBe(true)
    }

    const baks = bakFiles(path)
    expect(baks).toHaveLength(MAX_BACKUPS)
    expect(baks).toEqual([
      `${path}.bak.1`,
      `${path}.bak.2`,
      `${path}.bak.3`,
      `${path}.bak.4`,
      `${path}.bak.5`,
    ])
    // .bak.1 is the immediately-previous revision (rotation copies BEFORE overwrite)
    expect(JSON.parse(memfs.get(`${path}.bak.1`)!).id).toBeDefined()
  })

  it('rotation copies the current file BEFORE the new content overwrites it', async () => {
    const path = '/test/project.glitch'
    useProjectStore.getState().setProjectPath(path)
    memfs.set(path, '{"marker":"previous-good-copy"}')

    await rotateBackups(path)

    // .bak.1 holds the pre-overwrite content
    expect(memfs.get(`${path}.bak.1`)).toBe('{"marker":"previous-good-copy"}')
  })

  it('rotation failure does not block save', async () => {
    const path = '/test/project.glitch'
    useProjectStore.getState().setProjectPath(path)
    memfs.set(path, '{"marker":"existing"}')

    // Backup writes fail; the project write itself succeeds
    mockEntropic.writeFile.mockImplementation(async (p: string, data: string) => {
      if (p.includes('.bak.')) throw new Error('EACCES: backup dir unwritable')
      memfs.set(p, data)
    })

    const ok = await saveProject()

    expect(ok).toBe(true) // save NOT blocked
    expect(memfs.has(path)).toBe(true) // project file written
    const warnToasts = useToastStore
      .getState()
      .toasts.filter((t) => t.level === 'warning' && t.source === 'backup-rotation')
    expect(warnToasts).toHaveLength(1)
  })

  it('first save with no existing project file creates no backups', async () => {
    const path = '/test/fresh.glitch'
    useProjectStore.getState().setProjectPath(path)

    const ok = await saveProject()

    expect(ok).toBe(true)
    expect(bakFiles(path)).toHaveLength(0)
  })
})
