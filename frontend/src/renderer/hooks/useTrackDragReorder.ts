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
 * Why document-level listeners instead of setPointerCapture: React reorders
 * the track headers in the DOM as live swaps fire (insertBefore moves the
 * source element). In Electron this releases pointer capture, so subsequent
 * pointermove events route to whichever sibling is under the cursor — not
 * the source — and the drag silently dies after the first swap. Attaching
 * pointermove/up to `document` sidesteps capture entirely; the listeners
 * keep firing regardless of how the tree shuffles underneath.
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
import { useCallback, useEffect, useRef } from 'react'
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
}

interface ActiveDrag {
  pointerId: number
  startY: number
  armed: boolean
  moveHandler: (ev: PointerEvent) => void
  upHandler: (ev: PointerEvent) => void
  cancelHandler: (ev: PointerEvent) => void
}

export function useTrackDragReorder({
  trackId,
  isRenaming,
}: UseTrackDragReorderArgs): UseTrackDragReorderResult {
  const ownIdx = useTimelineStore((s) => s.tracks.findIndex((t) => t.id === trackId))
  const activeRef = useRef<ActiveDrag | null>(null)

  const detach = useCallback(() => {
    const drag = activeRef.current
    if (!drag) return
    // eslint-disable-next-line no-console
    console.warn('%c[track-drag] DETACH listeners removed', 'color:#ef4444;font-weight:bold')
    document.removeEventListener('pointermove', drag.moveHandler)
    document.removeEventListener('pointerup', drag.upHandler)
    document.removeEventListener('pointercancel', drag.cancelHandler)
    activeRef.current = null
  }, [])

  // Tear down document listeners if the component unmounts mid-drag — otherwise
  // they would leak past the lifecycle of the source track.
  useEffect(() => detach, [detach])

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      const target = e.target as HTMLElement
      if (target.closest('button, input, select, textarea, [contenteditable]')) {
        return
      }
      if (isRenaming) return
      // Already dragging this pointer — guard against a stray pointerdown.
      if (activeRef.current) return

      const tracks = useTimelineStore.getState().tracks
      const fromIdx = tracks.findIndex((t) => t.id === trackId)
      if (fromIdx < 0) return

      // Without preventDefault, Electron / Chromium may start a native drag
      // session (text selection or HTML5 drag-and-drop) on the next move and
      // tear down the pointer sequence — letter-perfect repro for the
      // "only one slot at a time" bug: the first swap fires from the very
      // first pointermove, then native drag kicks in and our document
      // listeners stop receiving pointermove events.
      e.preventDefault()
      e.stopPropagation()

      const pointerId = e.pointerId
      const startY = e.clientY

      let moveCount = 0
      let swapCount = 0
      const moveHandler = (ev: PointerEvent) => {
        const drag = activeRef.current
        if (!drag) {
          // eslint-disable-next-line no-console
          console.warn('%c[track-drag] move BAIL — activeRef was cleared', 'color:#ef4444')
          return
        }
        if (ev.pointerId !== drag.pointerId) {
          // eslint-disable-next-line no-console
          console.warn(`%c[track-drag] move BAIL — pointerId mismatch ${ev.pointerId} vs ${drag.pointerId}`, 'color:#ef4444')
          return
        }
        moveCount++

        // Source track's CURRENT index — it shifts as live reorders fire,
        // so we re-read it on every move instead of trusting a captured value.
        const currentIdx = useTimelineStore.getState().tracks.findIndex((t) => t.id === trackId)
        if (currentIdx < 0) return

        if (!drag.armed) {
          if (Math.abs(ev.clientY - drag.startY) < REORDER_DRAG_THRESHOLD_PX) return
          drag.armed = true
          // Open an undo transaction once the gesture is actually a drag. Every
          // reorder fired below buffers into this transaction so Cmd+Z reverses
          // the whole move in one keypress.
          useUndoStore.getState().beginTransaction('Reorder tracks')
          useTrackDragStore.getState().setDrag(currentIdx, null)
          // Suppress text selection across the document for the duration of
          // the drag. The cursor passes over track names / labels constantly
          // while reordering; without this Chromium starts a selection on the
          // first move and steals subsequent pointer events.
          document.body.classList.add('track-reorder-active')
          // eslint-disable-next-line no-console
          console.warn(`%c[track-drag] ARMED y=${ev.clientY} fromIdx=${currentIdx}`, 'color:#4ade80;font-weight:bold')
        }

        // Position-based target detection: anchor on the first header's bounding
        // rect + per-row height, then compute targetIdx = floor((y - top) / row).
        // Why: between fast pointermove events React hasn't committed the post-
        // swap render yet, so the divs' data-track-idx attributes lag behind
        // the store. Reading them yields stale targets that often equal the
        // already-updated currentIdx → false no-op → drag appears stuck after
        // the first swap. Anchoring on layout geometry instead of DOM attributes
        // is robust to that staleness because the visible row positions update
        // synchronously via React's reconciler.
        const totalTracks = useTimelineStore.getState().tracks.length
        const firstHeader = document.querySelector<HTMLElement>('.track-header[data-track-idx]')
        let targetIdx = currentIdx
        if (firstHeader && totalTracks > 0) {
          const firstRect = firstHeader.getBoundingClientRect()
          if (firstRect.height > 0) {
            const relY = ev.clientY - firstRect.top
            const raw = Math.floor(relY / firstRect.height)
            targetIdx = Math.max(0, Math.min(totalTracks - 1, raw))
          }
        }

        if (moveCount <= 6 || moveCount % 15 === 0 || targetIdx !== currentIdx) {
          // eslint-disable-next-line no-console
          console.warn(
            `%c[track-drag] move#${moveCount} y=${ev.clientY} cur=${currentIdx} tgt=${targetIdx} tracks=${totalTracks}`,
            'color:#888',
          )
        }

        if (targetIdx !== currentIdx) {
          useTimelineStore.getState().reorderTrack(currentIdx, targetIdx)
          // Source has moved — re-publish so the --dragging highlight follows.
          useTrackDragStore.getState().setDrag(targetIdx, null)
          swapCount++
          // eslint-disable-next-line no-console
          console.warn(
            `%c[track-drag] SWAP#${swapCount} ${currentIdx}→${targetIdx}`,
            'color:#f59e0b;font-weight:bold',
          )
        }
      }
      const getStats = () => ({ moves: moveCount, swaps: swapCount })
      ;(moveHandler as unknown as { _getStats: () => { moves: number; swaps: number } })._getStats = getStats

      const upHandler = (ev: PointerEvent) => {
        const drag = activeRef.current
        if (!drag || ev.pointerId !== drag.pointerId) {
          // eslint-disable-next-line no-console
          console.warn(
            `%c[track-drag] UP IGNORED — pointerId=${ev.pointerId} drag=${drag ? drag.pointerId : 'null'}`,
            'color:#ef4444',
          )
          return
        }
        const stats = (moveHandler as unknown as { _getStats: () => { moves: number; swaps: number } })._getStats()
        // eslint-disable-next-line no-console
        console.warn(
          `%c[track-drag] UP armed=${drag.armed} moves=${stats.moves} swaps=${stats.swaps}`,
          'color:#4ade80;font-weight:bold',
        )
        if (drag.armed) {
          useUndoStore.getState().commitTransaction()
        }
        useTrackDragStore.getState().clearDrag()
        document.body.classList.remove('track-reorder-active')
        detach()
      }

      const cancelHandler = (ev: PointerEvent) => {
        const drag = activeRef.current
        if (!drag || ev.pointerId !== drag.pointerId) return
        // eslint-disable-next-line no-console
        console.warn(
          `%c[track-drag] CANCEL fired — armed=${drag.armed} — drag aborted by browser`,
          'color:#ef4444;font-weight:bold',
        )
        if (drag.armed) {
          // Abort rewinds every buffered reorder, restoring the original order.
          useUndoStore.getState().abortTransaction()
        }
        useTrackDragStore.getState().clearDrag()
        document.body.classList.remove('track-reorder-active')
        detach()
      }

      activeRef.current = {
        pointerId,
        startY,
        armed: false,
        moveHandler,
        upHandler,
        cancelHandler,
      }

      document.addEventListener('pointermove', moveHandler)
      document.addEventListener('pointerup', upHandler)
      document.addEventListener('pointercancel', cancelHandler)
    },
    [trackId, isRenaming, detach],
  )

  return {
    ownIdx,
    onPointerDown,
  }
}
