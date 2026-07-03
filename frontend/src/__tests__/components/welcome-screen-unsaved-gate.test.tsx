/**
 * #30 P0 (adjudicated-confirmed) — WelcomeScreen's New Project / Open Project /
 * Open Recent entry points used to call handleNewProject()/loadProject()
 * DIRECTLY, bypassing App.tsx's pendingNav -> UnsavedChangesDialog dirty-gate
 * (the same gate the File menu and Cmd+O/Cmd+N already use). A dirty project
 * with no assets (WelcomeScreen renders whenever `!hasAssets`) could be
 * silently discarded with zero warning — real data loss.
 *
 * Fix: WelcomeScreen's three callbacks now check `useUndoStore.isDirty` first
 * and route through the SAME UnsavedChangesDialog (pendingNav gets an
 * optional `recentPath` so "Open Recent" reopens the intended file instead of
 * popping the native file picker).
 *
 * These tests render the REAL <App /> tree (mock IPC boundary only — no
 * Electron/Playwright) and drive the real WelcomeScreen buttons.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, waitFor, screen, fireEvent } from '@testing-library/react'
import App from '../../renderer/App'
import { setupMockEntropic, teardownMockEntropic } from '../helpers/mock-entropic'
import { useUndoStore } from '../../renderer/stores/undo'
import { useTimelineStore } from '../../renderer/stores/timeline'
import { useProjectStore } from '../../renderer/stores/project'

const RECENT_PROJECT = { path: '/test/recent-project.glitch', name: 'recent-project', lastModified: Date.now() }

function resetStores() {
  useProjectStore.getState().resetProject()
  useTimelineStore.getState().reset()
  useUndoStore.getState().clear()
}

function makeValidProject() {
  return {
    version: '3.0.0',
    id: 'recent-id',
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
    timeline: { duration: 0, tracks: [], markers: [], loopRegion: null },
  }
}

async function renderAppAtWelcome() {
  const mock = setupMockEntropic({
    onMenuAction: () => () => {},
    readRecentProjects: vi.fn().mockResolvedValue([RECENT_PROJECT]),
    showOpenDialog: vi.fn().mockResolvedValue('/test/picked.glitch'),
    readFile: vi.fn().mockResolvedValue(JSON.stringify(makeValidProject())),
    // Pre-answered so TelemetryConsentDialog (also role="dialog") never
    // mounts and collides with the UnsavedChangesDialog queries below.
    checkTelemetryConsent: vi.fn().mockResolvedValue(true),
  })

  render(<App />)

  // WelcomeScreen only renders once hasAssets is known false + recent
  // projects have loaded (async useEffect).
  await waitFor(() => {
    expect(screen.getByText('New Project')).toBeTruthy()
  })
  await waitFor(() => {
    expect(screen.getByText(RECENT_PROJECT.name)).toBeTruthy()
  })

  return mock
}

describe('WelcomeScreen — unsaved-changes gate (#30)', () => {
  beforeEach(() => {
    resetStores()
  })

  afterEach(() => {
    cleanup()
    teardownMockEntropic()
    vi.restoreAllMocks()
    resetStores()
  })

  it('New Project defers behind the dialog when dirty — no immediate reset', async () => {
    await renderAppAtWelcome()
    useTimelineStore.getState().addTrack('Dirty Track', '#fff')
    useUndoStore.setState({ isDirty: true })
    const tracksBefore = useTimelineStore.getState().tracks.length

    fireEvent.click(screen.getByText('New Project'))

    // Dialog appears; the destructive reset must NOT have run yet.
    await waitFor(() => {
      expect(screen.getByText('Unsaved Changes')).toBeTruthy()
    })
    expect(screen.getByText(/Starting a new project will discard them/)).toBeTruthy()
    expect(useTimelineStore.getState().tracks).toHaveLength(tracksBefore)

    // Confirming Discard now runs the deferred new-project reset.
    fireEvent.click(screen.getByText('Discard Changes'))
    await waitFor(() => {
      expect(useTimelineStore.getState().tracks.some((t) => t.name === 'Dirty Track')).toBe(false)
    })
  })

  it('Open Project defers behind the dialog when dirty — no immediate file picker', async () => {
    const mock = await renderAppAtWelcome()
    useUndoStore.setState({ isDirty: true })

    fireEvent.click(screen.getByText('Open Project'))

    await waitFor(() => {
      expect(screen.getByText('Unsaved Changes')).toBeTruthy()
    })
    expect(screen.getByText(/Opening another project will discard them/)).toBeTruthy()
    expect(mock.showOpenDialog).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('Discard Changes'))
    await waitFor(() => {
      expect(mock.showOpenDialog).toHaveBeenCalledTimes(1)
    })
  })

  it('Open Recent defers behind the dialog when dirty, then reopens the SAME recent path (not the file picker)', async () => {
    await renderAppAtWelcome()
    const mock = window.entropic
    useUndoStore.setState({ isDirty: true })

    fireEvent.click(screen.getByText(RECENT_PROJECT.name))

    await waitFor(() => {
      expect(screen.getByText('Unsaved Changes')).toBeTruthy()
    })
    expect(mock.readFile).not.toHaveBeenCalled()
    expect(mock.showOpenDialog).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('Discard Changes'))

    await waitFor(() => {
      expect(mock.readFile).toHaveBeenCalledWith(RECENT_PROJECT.path)
    })
    // The native file picker must NOT open — the recent path was carried
    // through pendingNav, not dropped in favor of loadProject(undefined, ...).
    expect(mock.showOpenDialog).not.toHaveBeenCalled()
  })

  it('New Project proceeds immediately when the project is clean (no dialog)', async () => {
    await renderAppAtWelcome()
    // isDirty left false (default post-reset state) — addTrack itself would
    // mark the project dirty, so the clean-path assertion checks straight
    // off the freshly reset store instead of manufacturing a track first.
    expect(useUndoStore.getState().isDirty).toBe(false)

    fireEvent.click(screen.getByText('New Project'))

    // newProject() runs synchronously and bootstraps exactly one Master
    // track (M.1) — no Discard click needed, proving the action fired
    // immediately rather than deferring behind the dialog.
    await waitFor(() => {
      expect(useTimelineStore.getState().tracks).toHaveLength(1)
    })
    expect(screen.queryByText('Unsaved Changes')).toBeNull()
  })

  it('Open Project proceeds immediately when the project is clean (no dialog)', async () => {
    await renderAppAtWelcome()
    const mock = window.entropic
    expect(useUndoStore.getState().isDirty).toBe(false)

    fireEvent.click(screen.getByText('Open Project'))

    await waitFor(() => {
      expect(mock.showOpenDialog).toHaveBeenCalledTimes(1)
    })
    expect(screen.queryByText('Unsaved Changes')).toBeNull()
  })

  it('Open Recent proceeds immediately when the project is clean (no dialog)', async () => {
    await renderAppAtWelcome()
    const mock = window.entropic
    expect(useUndoStore.getState().isDirty).toBe(false)

    fireEvent.click(screen.getByText(RECENT_PROJECT.name))

    await waitFor(() => {
      expect(mock.readFile).toHaveBeenCalledWith(RECENT_PROJECT.path)
    })
    expect(screen.queryByText('Unsaved Changes')).toBeNull()
    expect(mock.showOpenDialog).not.toHaveBeenCalled()
  })
})
