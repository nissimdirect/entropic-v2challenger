/**
 * useTrackDragReorder — pointer-event lifecycle that lets the user drag any
 * track header to reorder it within the timeline. Mounted by both TrackHeader
 * (video / text) and AudioTrackHeader so reorder works across track types.
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
import { useCallback, useRef, useState } from 'react'
import { useTimelineStore } from '../stores/timeline'

const REORDER_DRAG_THRESHOLD_PX = 4

interface UseTrackDragReorderArgs {
  trackId: string
  /** Disable drag while the header is in rename mode so input clicks stay local. */
  isRenaming?: boolean
}

interface UseTrackDragReorderResult {
  ownIdx: number
  isDragging: boolean
  dropTargetIdx: number | null
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

  const [isDragging, setIsDragging] = useState(false)
  const [dropTargetIdx, setDropTargetIdx] = useState<number | null>(null)
  const dragStateRef = useRef<{ startY: number; fromIdx: number; armed: boolean } | null>(null)

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

      dragStateRef.current = { startY: e.clientY, fromIdx, armed: false }
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    },
    [trackId, isRenaming],
  )

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current
    if (!state) return

    if (!state.armed) {
      if (Math.abs(e.clientY - state.startY) < REORDER_DRAG_THRESHOLD_PX) return
      state.armed = true
      setIsDragging(true)
    }

    const headers = document.querySelectorAll<HTMLElement>('.track-header[data-track-idx]')
    let targetIdx = state.fromIdx
    for (const header of headers) {
      const rect = header.getBoundingClientRect()
      if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
        const parsed = parseInt(header.dataset.trackIdx ?? '', 10)
        if (Number.isFinite(parsed)) targetIdx = parsed
      }
    }
    setDropTargetIdx(targetIdx === state.fromIdx ? null : targetIdx)
  }, [])

  const onPointerUp = useCallback(() => {
    const state = dragStateRef.current
    dragStateRef.current = null

    if (state && state.armed && dropTargetIdx !== null && dropTargetIdx !== state.fromIdx) {
      useTimelineStore.getState().reorderTrack(state.fromIdx, dropTargetIdx)
    }

    setIsDragging(false)
    setDropTargetIdx(null)
  }, [dropTargetIdx])

  const onPointerCancel = useCallback(() => {
    dragStateRef.current = null
    setIsDragging(false)
    setDropTargetIdx(null)
  }, [])

  return {
    ownIdx,
    isDragging,
    dropTargetIdx,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  }
}
