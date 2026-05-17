/**
 * useTrackDragReorder — pointer-event lifecycle that lets the user drag any
 * track header to reorder it within the timeline. Mounted by both TrackHeader
 * (video / text) and AudioTrackHeader so reorder works across track types.
 *
 * Live drag: as the cursor crosses each adjacent track's bounding rect the
 * source track reorders in place via `useTimelineStore.reorderTrack`, so the
 * UI rearranges in real time (DAW convention). The full sequence of moves
 * is wrapped in an undo transaction so Cmd+Z reverses the entire drag, not
 * each intermediate step.
 *
 * Plays well with existing single-click selection, double-click rename, and
 * right-click context menu: a 4 px movement threshold must be crossed before
 * the gesture is treated as a drag. Below the threshold the pointerup is a
 * no-op and the header's own onClick handler still fires.
 *
 * Target detection walks every `.track-header[data-track-idx]` in document
 * order — matches the lane-detection pattern used by Clip.tsx so the same
 * mental model applies across drag interactions in this codebase.
 */
import { useCallback, useRef } from 'react'
import { useTimelineStore } from '../stores/timeline'
import { useTrackDragStore } from '../stores/trackDrag'
import { useUndoStore } from '../stores/undo'

const REORDER_DRAG_THRESHOLD_PX = 4

interface UseTrackDragReorderArgs {
  trackId: string
  /** Disable drag while the header is in rename mode so input clicks stay local. */
  isRenaming?: boolean
}

interface UseTrackDragReorderResult {
  ownIdx: number
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerUp: () => void
  onPointerCancel: () => void
}

export function useTrackDragReorder({
  trackId,
  isRenaming,
}: UseTrackDragReorderArgs): UseTrackDragReorderResult {
  const ownIdx = useTimelineStore((s) => s.tracks.findIndex((t) => t.id === trackId))
  const dragStateRef = useRef<{ startY: number; armed: boolean } | null>(null)

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      const target = e.target as HTMLElement
      if (target.closest('button, input, select, textarea, [contenteditable]')) {
        return
      }
      if (isRenaming) return

      const tracks = useTimelineStore.getState().tracks
      const fromIdx = tracks.findIndex((t) => t.id === trackId)
      if (fromIdx < 0) return

      dragStateRef.current = { startY: e.clientY, armed: false }
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    },
    [trackId, isRenaming],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const state = dragStateRef.current
      if (!state) return

      // Look up the source track's CURRENT index — it shifts as live reorders
      // fire during the drag, so we can't rely on a stored fromIdx.
      const tracks = useTimelineStore.getState().tracks
      const currentIdx = tracks.findIndex((t) => t.id === trackId)
      if (currentIdx < 0) return

      if (!state.armed) {
        if (Math.abs(e.clientY - state.startY) < REORDER_DRAG_THRESHOLD_PX) return
        state.armed = true
        // Open an undo transaction once the gesture is actually a drag. Every
        // reorder fired below buffers into this transaction so Cmd+Z reverses
        // the whole move in one keypress.
        useUndoStore.getState().beginTransaction('Reorder tracks')
        useTrackDragStore.getState().setDrag(currentIdx, null)
      }

      const headers = document.querySelectorAll<HTMLElement>('.track-header[data-track-idx]')
      let targetIdx = currentIdx
      for (const header of headers) {
        const rect = header.getBoundingClientRect()
        if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
          const parsed = parseInt(header.dataset.trackIdx ?? '', 10)
          if (Number.isFinite(parsed)) targetIdx = parsed
        }
      }

      if (targetIdx !== currentIdx) {
        useTimelineStore.getState().reorderTrack(currentIdx, targetIdx)
        // Source track has moved — re-publish for the --dragging highlight.
        useTrackDragStore.getState().setDrag(targetIdx, null)
      }
    },
    [trackId],
  )

  const onPointerUp = useCallback(() => {
    const state = dragStateRef.current
    dragStateRef.current = null

    if (state && state.armed) {
      useUndoStore.getState().commitTransaction()
    }

    useTrackDragStore.getState().clearDrag()
  }, [])

  const onPointerCancel = useCallback(() => {
    const state = dragStateRef.current
    dragStateRef.current = null

    if (state && state.armed) {
      // Abort rewinds every buffered reorder, restoring the original order.
      useUndoStore.getState().abortTransaction()
    }

    useTrackDragStore.getState().clearDrag()
  }, [])

  return {
    ownIdx,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  }
}
