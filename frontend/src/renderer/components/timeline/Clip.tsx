import { useCallback, useRef } from 'react'
import type { Clip as ClipType } from '../../../shared/types'
import { useTimelineStore } from '../../stores/timeline'

interface ClipProps {
  clip: ClipType
  zoom: number
  scrollX: number
  isSelected: boolean
  assetName: string
}

export default function ClipComponent({ clip, zoom, scrollX, isSelected, assetName }: ClipProps) {
  const isDragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartPos = useRef(0)

  const left = clip.position * zoom - scrollX
  const width = clip.duration * zoom

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Don't start drag from trim handles
      if ((e.target as HTMLElement).classList.contains('clip__trim-handle')) return

      e.preventDefault()
      e.stopPropagation()
      isDragging.current = true
      dragStartX.current = e.clientX
      dragStartPos.current = clip.position
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)

      const store = useTimelineStore.getState()
      if (e.metaKey || e.ctrlKey) {
        store.toggleClipSelection(clip.id)
      } else if (e.shiftKey && store.selectedClipIds.length > 0) {
        const lastSelected = store.selectedClipIds[store.selectedClipIds.length - 1]
        store.rangeSelectClips(lastSelected, clip.id)
      } else {
        store.selectClip(clip.id)
      }
    },
    [clip.id, clip.position],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return
      const dx = e.clientX - dragStartX.current
      const dt = dx / zoom
      const newPos = Math.max(0, dragStartPos.current + dt)
      useTimelineStore.getState().moveClip(clip.id, clip.trackId, newPos)
    },
    [clip.id, clip.trackId, zoom],
  )

  const handlePointerUp = useCallback(() => {
    isDragging.current = false
  }, [])

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      // Selection is handled in pointerDown — click is a no-op to prevent double-fire
    },
    [clip.id],
  )

  // Trim left handle
  const handleTrimLeftDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const startX = e.clientX
      const startIn = clip.inPoint
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)

      const onMove = (me: PointerEvent) => {
        const dx = me.clientX - startX
        const dt = dx / zoom
        const newIn = Math.max(0, startIn + dt)
        useTimelineStore.getState().trimClipIn(clip.id, newIn)
      }
      const onUp = () => {
        document.removeEventListener('pointermove', onMove)
        document.removeEventListener('pointerup', onUp)
      }
      document.addEventListener('pointermove', onMove)
      document.addEventListener('pointerup', onUp)
    },
    [clip.id, clip.inPoint, zoom],
  )

  // Trim right handle
  const handleTrimRightDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const startX = e.clientX
      const startOut = clip.outPoint
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)

      const onMove = (me: PointerEvent) => {
        const dx = me.clientX - startX
        const dt = dx / zoom
        useTimelineStore.getState().trimClipOut(clip.id, startOut + dt)
      }
      const onUp = () => {
        document.removeEventListener('pointermove', onMove)
        document.removeEventListener('pointerup', onUp)
      }
      document.addEventListener('pointermove', onMove)
      document.addEventListener('pointerup', onUp)
    },
    [clip.id, clip.outPoint, zoom],
  )

  // Don't render if off-screen
  if (left + width < 0) return null

  const isTextClip = !!clip.textConfig
  const displayName = isTextClip
    ? (clip.textConfig!.text.slice(0, 30) || 'Text')
    : assetName

  return (
    <div
      className={`clip${isSelected ? ' clip--selected' : ''}${isTextClip ? ' clip--text' : ''}`}
      style={{ left: `${left}px`, width: `${Math.max(4, width)}px` }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={handleClick}
    >
      <div
        className="clip__trim-handle clip__trim-handle--left"
        onPointerDown={handleTrimLeftDown}
      />
      <span className={`clip__name${isTextClip ? ' clip__name--text' : ''}`}>{displayName}</span>
      <div
        className="clip__trim-handle clip__trim-handle--right"
        onPointerDown={handleTrimRightDown}
      />
    </div>
  )
}
