/**
 * UC5.2 — App.tsx menu-action dispatch CHARACTERIZATION (F4 decomposition gate).
 *
 * Pins the onMenuAction subscription wiring: main-process menu clicks arrive
 * as strings on window.entropic.onMenuAction(cb) and are dispatched by the
 * switch in App.tsx (~line 2309). Each test fires a registered action string
 * through the captured callback and asserts the handler's observable effect
 * (bridge-method call or store mutation).
 *
 * Full switch enumeration at time of writing (pinned for the decomposition):
 *   import-media, add-text-track, new-project, open-project, save, save-as,
 *   export, export-current-frame, toggle-sidebar, toggle-focus,
 *   toggle-quantize, select-all-clips, deselect-all, invert-selection,
 *   select-by-track, split-at-playhead, clip-speed, clip-reverse,
 *   clip-toggle-enabled, add-video-track, delete-selected-track,
 *   move-track-up, move-track-down, toggle-automation, zoom-in, zoom-out,
 *   zoom-fit, show-history, show-shortcuts, show-feedback, about,
 *   support-bundle, add-effect:{effectId} (default branch).
 *
 * CHARACTERIZED ODDITY (pinned, not fixed): 'undo' and 'redo' are NOT menu
 * actions in this app. The Edit menu uses Electron-native role:'undo' /
 * role:'redo' (src/main/menu.ts), which never reach onMenuAction, and the
 * App.tsx switch has no matching cases — firing 'undo'/'redo' through the
 * menu-action channel falls into the default branch and does NOTHING.
 * (Keyboard undo/redo is wired separately via shortcutRegistry in App.tsx.)
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup, waitFor, screen, act } from '@testing-library/react'
import App from '../../renderer/App'
import { setupMockEntropic, teardownMockEntropic, type EntropicBridge } from '../helpers/mock-entropic'
import { useProjectStore } from '../../renderer/stores/project'
import { useTimelineStore } from '../../renderer/stores/timeline'
import { useUndoStore } from '../../renderer/stores/undo'
import { useLayoutStore } from '../../renderer/stores/layout'

function resetStores() {
  useProjectStore.getState().resetProject()
  useTimelineStore.getState().reset()
  useUndoStore.getState().clear()
}

type MenuFire = (action: string) => void

/**
 * Mounts the REAL <App /> and captures the LATEST onMenuAction callback
 * (the subscription re-registers when its deps change, so we always keep
 * the most recent one — exactly what the preload bridge does).
 */
async function renderAppCapturingMenu(overrides?: Partial<EntropicBridge>): Promise<{ mock: EntropicBridge; fire: MenuFire }> {
  let menuCb: ((action: string) => void) | null = null
  const mock = setupMockEntropic({
    onMenuAction: vi.fn((cb: (action: string) => void) => {
      menuCb = cb
      return () => {
        if (menuCb === cb) menuCb = null
      }
    }),
    checkTelemetryConsent: vi.fn().mockResolvedValue(true),
    readRecentProjects: vi.fn().mockResolvedValue([]),
    // Cancel-everything defaults: dialogs resolve null so fired actions have
    // no cascading side effects beyond the call we assert.
    showOpenDialog: vi.fn().mockResolvedValue(null),
    showSaveDialog: vi.fn().mockResolvedValue(null),
    ...overrides,
  })

  const { container } = render(<App />)
  await waitFor(() => {
    expect(container.querySelector('.app')).toBeTruthy()
  })
  await waitFor(() => {
    expect(menuCb).not.toBeNull()
  })

  const fire: MenuFire = (action) => {
    act(() => {
      menuCb!(action)
    })
  }
  return { mock, fire }
}

describe('UC5.2 — menu-action dispatch (characterization)', () => {
  beforeEach(() => {
    resetStores()
  })

  afterEach(() => {
    cleanup()
    teardownMockEntropic()
    vi.restoreAllMocks()
    resetStores()
  })

  it("'import-media' opens the Import Media file dialog via showOpenDialog", async () => {
    const { mock, fire } = await renderAppCapturingMenu()
    fire('import-media')
    await waitFor(() => {
      expect(mock.showOpenDialog).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Import Media' }),
      )
    })
  })

  it("'save' routes to saveProject → Save dialog for an unsaved project (cancel → no write)", async () => {
    const { mock, fire } = await renderAppCapturingMenu()
    fire('save')
    await waitFor(() => {
      expect(mock.showSaveDialog).toHaveBeenCalledTimes(1)
    })
    // Cancelled dialog → no file written.
    expect(mock.writeFile).not.toHaveBeenCalled()
  })

  it("'save-as' routes to saveProjectAs → Save dialog", async () => {
    const { mock, fire } = await renderAppCapturingMenu()
    fire('save-as')
    await waitFor(() => {
      expect(mock.showSaveDialog).toHaveBeenCalledTimes(1)
    })
  })

  it("'open-project' with a CLEAN project routes to loadProject → Open dialog (no unsaved-changes gate)", async () => {
    const { mock, fire } = await renderAppCapturingMenu()
    expect(useUndoStore.getState().isDirty).toBe(false)
    fire('open-project')
    await waitFor(() => {
      expect(mock.showOpenDialog).toHaveBeenCalledTimes(1)
    })
    expect(screen.queryByText('Unsaved Changes')).toBeNull()
  })

  it("'open-project' with a DIRTY project defers behind the UnsavedChangesDialog — no file dialog", async () => {
    const { mock, fire } = await renderAppCapturingMenu()
    act(() => {
      useUndoStore.setState({ isDirty: true })
    })
    fire('open-project')
    await waitFor(() => {
      expect(screen.getByText('Unsaved Changes')).toBeTruthy()
    })
    expect(screen.getByText(/Opening another project will discard them/)).toBeTruthy()
    expect(mock.showOpenDialog).not.toHaveBeenCalled()
  })

  it("'new-project' with a CLEAN project resets the timeline immediately (no dialog)", async () => {
    const { fire } = await renderAppCapturingMenu()
    act(() => {
      useTimelineStore.getState().addTrack('Doomed Track', '#fff')
      useUndoStore.setState({ isDirty: false })
    })
    expect(useTimelineStore.getState().tracks.some((t) => t.name === 'Doomed Track')).toBe(true)

    fire('new-project')

    await waitFor(() => {
      expect(useTimelineStore.getState().tracks.some((t) => t.name === 'Doomed Track')).toBe(false)
    })
    expect(screen.queryByText('Unsaved Changes')).toBeNull()
  })

  it("'new-project' with a DIRTY project defers behind the UnsavedChangesDialog", async () => {
    const { fire } = await renderAppCapturingMenu()
    act(() => {
      useTimelineStore.getState().addTrack('Precious Track', '#fff')
      useUndoStore.setState({ isDirty: true })
    })
    fire('new-project')
    await waitFor(() => {
      expect(screen.getByText('Unsaved Changes')).toBeTruthy()
    })
    expect(screen.getByText(/Starting a new project will discard them/)).toBeTruthy()
    // Destructive reset did NOT run.
    expect(useTimelineStore.getState().tracks.some((t) => t.name === 'Precious Track')).toBe(true)
  })

  it("'export' opens the Export dialog", async () => {
    const { fire } = await renderAppCapturingMenu()
    fire('export')
    await waitFor(() => {
      const title = document.querySelector('#export-dialog-title')
      expect(title).toBeTruthy()
      expect(title!.textContent).toBe('Export')
    })
  })

  it("'undo' and 'redo' fired as menu actions are NO-OPS — pinned oddity: Edit menu uses native Electron roles, the switch has no cases for them", async () => {
    const { fire } = await renderAppCapturingMenu()
    const undoSpy = vi.fn()
    const redoSpy = vi.fn()
    const original = {
      undo: useUndoStore.getState().undo,
      redo: useUndoStore.getState().redo,
    }
    useUndoStore.setState({ undo: undoSpy, redo: redoSpy })
    try {
      fire('undo')
      fire('redo')
      // Give any async handler a chance to run before concluding no-op.
      await new Promise((r) => setTimeout(r, 50))
      expect(undoSpy).not.toHaveBeenCalled()
      expect(redoSpy).not.toHaveBeenCalled()
    } finally {
      useUndoStore.setState(original)
    }
  })

  it("'toggle-sidebar' / 'toggle-focus' / 'toggle-quantize' invoke the layout store actions", async () => {
    const { fire } = await renderAppCapturingMenu()

    const sidebarBefore = useLayoutStore.getState().sidebarCollapsed
    fire('toggle-sidebar')
    expect(useLayoutStore.getState().sidebarCollapsed).toBe(!sidebarBefore)
    fire('toggle-sidebar') // restore

    // toggle-focus: if either panel is expanded, both collapse.
    fire('toggle-focus')
    const afterFocus = useLayoutStore.getState()
    expect(afterFocus.sidebarCollapsed).toBe(true)
    expect(afterFocus.timelineCollapsed).toBe(true)
    fire('toggle-focus') // both expand back

    const quantizeBefore = useLayoutStore.getState().quantizeEnabled
    fire('toggle-quantize')
    expect(useLayoutStore.getState().quantizeEnabled).toBe(!quantizeBefore)
  })

  it("'select-all-clips' and 'deselect-all' invoke the timeline selection actions", async () => {
    const { fire } = await renderAppCapturingMenu()
    let clipId = ''
    act(() => {
      const tl = useTimelineStore.getState()
      const trackId = tl.addTrack('V1', '#4ade80') as string
      clipId = 'char-clip-1'
      tl.addClip(trackId, {
        id: clipId,
        assetId: 'char-asset-1',
        trackId,
        position: 0,
        duration: 2,
        inPoint: 0,
        outPoint: 2,
        speed: 1,
      })
    })

    fire('select-all-clips')
    expect(useTimelineStore.getState().selectedClipIds).toContain(clipId)

    fire('deselect-all')
    expect(useTimelineStore.getState().selectedClipIds).toHaveLength(0)
  })

  it("'zoom-in' and 'zoom-out' scale the timeline zoom by 1.25x / 0.8x within [0.5, 500]", async () => {
    const { fire } = await renderAppCapturingMenu()
    const z0 = useTimelineStore.getState().zoom

    fire('zoom-in')
    expect(useTimelineStore.getState().zoom).toBeCloseTo(Math.min(500, z0 * 1.25), 5)

    const z1 = useTimelineStore.getState().zoom
    fire('zoom-out')
    expect(useTimelineStore.getState().zoom).toBeCloseTo(Math.max(0.5, z1 * 0.8), 5)
  })

  it("'add-video-track' appends a new track via the timeline store", async () => {
    const { fire } = await renderAppCapturingMenu()
    const before = useTimelineStore.getState().tracks.length
    fire('add-video-track')
    expect(useTimelineStore.getState().tracks.length).toBe(before + 1)
  })

  it('an UNKNOWN action string is a silent no-op (default branch requires the add-effect: prefix)', async () => {
    const { mock, fire } = await renderAppCapturingMenu()
    const tracksBefore = useTimelineStore.getState().tracks.length
    fire('definitely-not-a-real-action')
    await new Promise((r) => setTimeout(r, 50))
    expect(useTimelineStore.getState().tracks.length).toBe(tracksBefore)
    expect(mock.showOpenDialog).not.toHaveBeenCalled()
    expect(mock.showSaveDialog).not.toHaveBeenCalled()
  })
})
