/**
 * P2.2b (slice 3c) NEGATIVE — opening a v2 legacy project surfaces the
 * unsupported-version error in the UI and the app stays interactive.
 *
 * Decision D1 clean break: pre-v3 `.glitch` files do not load. The committed
 * v2 fixture (backend/tests/test_project/fixtures/project-v2-legacy.glitch,
 * `version: "2.0.0"` with track-level opacity/blendMode) must, when fed through
 * `loadProject` with mocked IPC:
 *   - reach the TOAST store with the exact contractual message, never a crash;
 *   - NOT throw (loadProject resolves false → ErrorBoundary is never triggered);
 *   - leave the app interactive — a subsequent store action still works.
 *
 * This is the UI-load-path proof of the P2.2 legacy-rejection contract
 * (P2.2a proved it at the schema validator; P2.2c proves it at the render handler).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// The committed v2 fixture content, read from disk so the test pins the SAME
// bytes the backend schema suite rejects (never a regenerated/forked copy).
const V2_FIXTURE_PATH = join(
  __dirname,
  '../../../../backend/tests/test_project/fixtures/project-v2-legacy.glitch',
)
const v2FixtureJson = readFileSync(V2_FIXTURE_PATH, 'utf-8')

const V2_UNSUPPORTED_MESSAGE = "Unsupported project format (v2 / pre-3.0) — this version can't open it."

const mockEntropic = {
  onEngineStatus: () => {},
  sendCommand: vi.fn().mockResolvedValue({ ok: true }),
  selectFile: async () => null,
  selectSavePath: async () => null,
  onExportProgress: () => {},
  showOpenDialog: vi.fn().mockResolvedValue('/test/project-v2-legacy.glitch'),
  readFile: vi.fn().mockResolvedValue(v2FixtureJson),
  writeFile: vi.fn().mockResolvedValue(undefined),
  deleteFile: vi.fn().mockResolvedValue(undefined),
  fileExists: vi.fn().mockResolvedValue(true),
  getAppPath: vi.fn().mockResolvedValue('/test/userData'),
}
;(globalThis as any).window = { entropic: mockEntropic }

import { loadProject } from '../../renderer/project-persistence'
import { useToastStore } from '../../renderer/stores/toast'
import { useTimelineStore } from '../../renderer/stores/timeline'

describe('opening the v2 legacy fixture surfaces the unsupported-version error in the UI', () => {
  beforeEach(() => {
    useToastStore.getState().clearAll()
    useTimelineStore.getState().reset()
  })

  it('opening the v2 legacy fixture surfaces the unsupported-version error in the UI (toast/dialog) and the app remains interactive', async () => {
    // Sanity: the fixture really is a v2 project (guards against a silently
    // regenerated fixture passing the test for the wrong reason).
    expect(v2FixtureJson).toContain('"version": "2.0.0"')
    // Red-team HT-3: pin the fixture's track id so the partial-hydration
    // assertion below can never pass vacuously after a fixture regeneration.
    expect(v2FixtureJson).toContain('track-1')

    // Load the v2 fixture through the real UI load path. It must NOT throw —
    // a throw here would propagate to the React ErrorBoundary (white-screen).
    let loaded: boolean | undefined
    await expect(
      (async () => {
        loaded = await loadProject('/test/project-v2-legacy.glitch')
      })(),
    ).resolves.toBeUndefined()

    // loadProject reports failure (false), not a crash.
    expect(loaded).toBe(false)

    // The exact contractual message reached the toast store (error level).
    const toasts = useToastStore.getState().toasts
    const v2Toast = toasts.find((t) => t.message.includes(V2_UNSUPPORTED_MESSAGE))
    expect(v2Toast, 'a toast carrying the v2-unsupported message must be present').toBeDefined()
    expect(v2Toast!.level).toBe('error')
    expect(v2Toast!.message).toContain(V2_UNSUPPORTED_MESSAGE)

    // App remains interactive: a subsequent store action still works (the store
    // was never corrupted by a partial hydrate, and no exception poisoned it).
    const newTrackId = useTimelineStore.getState().addTrack('V1', '#4ade80')
    expect(newTrackId).toBeTruthy()
    expect(useTimelineStore.getState().tracks.some((t) => t.id === newTrackId)).toBe(true)
  })

  it('the v2 fixture never partially hydrates the timeline (no v2 track leaks in)', async () => {
    await loadProject('/test/project-v2-legacy.glitch')
    // The fixture declares a track "track-1"; rejection must happen BEFORE
    // hydrateStores, so no v2 track may appear in the store.
    expect(useTimelineStore.getState().tracks.some((t) => t.id === 'track-1')).toBe(false)
  })
})
