/**
 * UC5.3 — App.tsx close-requested / unsaved-changes gate CHARACTERIZATION
 * (F4 decomposition gate).
 *
 * Pins the CURRENT close-gate wiring: main process fires
 * window.entropic.onCloseRequested(cb); the App.tsx handler checks
 * useUndoStore.isDirty —
 *   clean → window.entropic.confirmClose() immediately (no dialog);
 *   dirty → UnsavedChangesDialog ("Save & Quit" variant) and NO confirmClose
 *           until the user picks Discard or Save & Quit; Cancel keeps the app
 *           open and a later close-request re-opens the dialog.
 *
 * CHARACTERIZED ODDITY (pinned, not fixed): the Save & Quit handler does NOT
 * check saveProject()'s return value (App.tsx ~4464: `await saveProject();
 * setShowCloseDialog(false); window.entropic.confirmClose()`), so CANCELLING
 * the save dialog still confirms the close — unsaved work is lost. The
 * sibling pendingNav gate DOES check (`if (!saved) return`). Pinned as-is.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup, waitFor, screen, fireEvent, act } from '@testing-library/react'
import App from '../../renderer/App'
import { setupMockEntropic, teardownMockEntropic, type EntropicBridge } from '../helpers/mock-entropic'
import { useProjectStore } from '../../renderer/stores/project'
import { useTimelineStore } from '../../renderer/stores/timeline'
import { useUndoStore } from '../../renderer/stores/undo'

function resetStores() {
  useProjectStore.getState().resetProject()
  useTimelineStore.getState().reset()
  useUndoStore.getState().clear()
}

async function renderAppCapturingClose(overrides?: Partial<EntropicBridge>): Promise<{ mock: EntropicBridge; requestClose: () => void }> {
  let closeCb: (() => void) | null = null
  const mock = setupMockEntropic({
    onMenuAction: () => () => {},
    onCloseRequested: vi.fn((cb: () => void) => {
      closeCb = cb
      return () => {
        if (closeCb === cb) closeCb = null
      }
    }),
    checkTelemetryConsent: vi.fn().mockResolvedValue(true),
    readRecentProjects: vi.fn().mockResolvedValue([]),
    ...overrides,
  })

  const { container } = render(<App />)
  await waitFor(() => {
    expect(container.querySelector('.app')).toBeTruthy()
  })
  await waitFor(() => {
    expect(closeCb).not.toBeNull()
  })

  return {
    mock,
    requestClose: () => {
      act(() => {
        closeCb!()
      })
    },
  }
}

describe('UC5.3 — close-requested unsaved gate (characterization)', () => {
  beforeEach(() => {
    resetStores()
  })

  afterEach(() => {
    cleanup()
    teardownMockEntropic()
    vi.restoreAllMocks()
    resetStores()
  })

  it('CLEAN state: close-requested confirms the close straight through — no dialog', async () => {
    const { mock, requestClose } = await renderAppCapturingClose()
    expect(useUndoStore.getState().isDirty).toBe(false)

    requestClose()

    expect(mock.confirmClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Unsaved Changes')).toBeNull()
  })

  it('DIRTY state: close-requested shows the UnsavedChangesDialog and does NOT confirm the close', async () => {
    const { mock, requestClose } = await renderAppCapturingClose()
    act(() => {
      useUndoStore.setState({ isDirty: true })
    })

    requestClose()

    await waitFor(() => {
      expect(screen.getByText('Unsaved Changes')).toBeTruthy()
    })
    // The quit-gate variant of the dialog (Save & Quit button).
    expect(screen.getByText('You have unsaved changes. What would you like to do?')).toBeTruthy()
    expect(screen.getByText('Save & Quit')).toBeTruthy()
    expect(mock.confirmClose).not.toHaveBeenCalled()
  })

  it('Cancel dismisses the dialog without confirming; a second close-request re-opens it', async () => {
    const { mock, requestClose } = await renderAppCapturingClose()
    act(() => {
      useUndoStore.setState({ isDirty: true })
    })

    requestClose()
    await waitFor(() => {
      expect(screen.getByText('Unsaved Changes')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('Cancel'))
    await waitFor(() => {
      expect(screen.queryByText('Unsaved Changes')).toBeNull()
    })
    expect(mock.confirmClose).not.toHaveBeenCalled()

    // The gate is re-armed — closing again re-prompts.
    requestClose()
    await waitFor(() => {
      expect(screen.getByText('Unsaved Changes')).toBeTruthy()
    })
    expect(mock.confirmClose).not.toHaveBeenCalled()
  })

  it('Discard Changes confirms the close (fires confirmClose) without saving', async () => {
    const { mock, requestClose } = await renderAppCapturingClose()
    act(() => {
      useUndoStore.setState({ isDirty: true })
    })

    requestClose()
    await waitFor(() => {
      expect(screen.getByText('Unsaved Changes')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('Discard Changes'))

    await waitFor(() => {
      expect(mock.confirmClose).toHaveBeenCalledTimes(1)
    })
    expect(mock.writeFile).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.queryByText('Unsaved Changes')).toBeNull()
    })
  })

  it('Save & Quit saves the project (save dialog + write) and then confirms the close', async () => {
    const { mock, requestClose } = await renderAppCapturingClose({
      showSaveDialog: vi.fn().mockResolvedValue('/test/char-close-save.glitch'),
    })
    act(() => {
      useUndoStore.setState({ isDirty: true })
    })

    requestClose()
    await waitFor(() => {
      expect(screen.getByText('Save & Quit')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('Save & Quit'))

    await waitFor(() => {
      expect(mock.confirmClose).toHaveBeenCalledTimes(1)
    })
    expect(mock.showSaveDialog).toHaveBeenCalledTimes(1)
    expect(mock.writeFile).toHaveBeenCalledWith(
      '/test/char-close-save.glitch',
      expect.any(String),
    )
  })

  it('PINNED ODDITY: cancelling the save dialog during Save & Quit STILL confirms the close (return value unchecked)', async () => {
    const { mock, requestClose } = await renderAppCapturingClose({
      showSaveDialog: vi.fn().mockResolvedValue(null), // user cancels the save
    })
    act(() => {
      useUndoStore.setState({ isDirty: true })
    })

    requestClose()
    await waitFor(() => {
      expect(screen.getByText('Save & Quit')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('Save & Quit'))

    // Current behavior: nothing was written, yet the close is confirmed.
    // If the decomposition ever fixes this, THIS assertion is the one to
    // flip — do not delete the test.
    await waitFor(() => {
      expect(mock.confirmClose).toHaveBeenCalledTimes(1)
    })
    expect(mock.writeFile).not.toHaveBeenCalled()
  })
})
