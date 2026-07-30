/**
 * F4b PR3 — App.tsx close-requested / unsaved-changes gate extraction.
 *
 * Moves the `onCloseRequested` listener + dirty check + dialog state OUT of
 * App.tsx verbatim. Byte-identical behavior — see the UC5.3 characterization
 * test (src/__tests__/characterization/close-unsaved-gate.test.tsx), which
 * this PR leaves unmodified as the proof, including its pinned oddity: the
 * Save & Quit handler does NOT check saveProject()'s return value (App.tsx
 * still owns that JSX — see the onSaveAndContinue handler on the
 * UnsavedChangesDialog instance bound to `showCloseDialog`), so cancelling
 * the save dialog during Save & Quit still confirms the close.
 *
 * Only the STATE + listener move here; the `<UnsavedChangesDialog>` JSX
 * composition stays in App.tsx (this hook returns the state pair App.tsx
 * already used to wire it) — the sibling `pendingNav` gate (Cmd+O/Cmd+N) is
 * a SEPARATE gate and is NOT part of this extraction.
 */
import { useState, useEffect } from 'react'
import { useUndoStore } from '../stores/undo'

export function useCloseGate() {
  const [showCloseDialog, setShowCloseDialog] = useState(false)
  useEffect(() => {
    if (!window.entropic?.onCloseRequested) return
    const cleanup = window.entropic.onCloseRequested(() => {
      const dirty = useUndoStore.getState().isDirty
      if (!dirty) {
        window.entropic.confirmClose()
        return
      }
      setShowCloseDialog(true)
    })
    return cleanup
  }, [])

  return { showCloseDialog, setShowCloseDialog }
}
