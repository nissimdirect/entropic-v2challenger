import { useCallback, useEffect, useRef, useState } from 'react'
import type { Marker } from '../../../shared/types'

interface MarkerFlagProps {
  marker: Marker
  zoom: number
  scrollX: number
  onSeek: (time: number) => void
  onDelete: (id: string) => void
  /** T4: commit a new label. Sanitization/clamp lives in the store (renameMarker). */
  onRename: (id: string, label: string) => void
}

export default function MarkerFlag({ marker, zoom, scrollX, onSeek, onDelete, onRename }: MarkerFlagProps) {
  // All hooks run unconditionally, BEFORE any early return (rules of hooks).
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(marker.label)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Auto-focus + select when the editor opens. Deferred to the next frame so
  // focus lands after the same-commit mount settles (mirrors track rename).
  useEffect(() => {
    if (!isEditing) return
    const raf = requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      el.select()
    })
    return () => cancelAnimationFrame(raf)
  }, [isEditing])

  const handleClick = useCallback(() => {
    onSeek(marker.time)
  }, [marker.time, onSeek])

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      // Simple context action: delete on right-click
      onDelete(marker.id)
    },
    [marker.id, onDelete],
  )

  const startEdit = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      setEditText(marker.label)
      setIsEditing(true)
    },
    [marker.label],
  )

  const commitEdit = useCallback(() => {
    setIsEditing(false)
    // Always forward to the store; it sanitizes, clamps, and falls back to the
    // default label for empty/whitespace input. A no-op change is ignored there.
    onRename(marker.id, editText)
  }, [marker.id, editText, onRename])

  const cancelEdit = useCallback(() => {
    setIsEditing(false)
    setEditText(marker.label)
  }, [marker.label])

  const left = marker.time * zoom - scrollX

  // Don't render if off-screen
  if (left < -10) return null

  return (
    <div
      className="marker-flag"
      style={{ left: `${left}px` }}
      onClick={isEditing ? undefined : handleClick}
      onContextMenu={isEditing ? undefined : handleContextMenu}
      onDoubleClick={isEditing ? undefined : startEdit}
      title={marker.label}
    >
      <div className="marker-flag__head" style={{ borderBottomColor: marker.color }} />
      <div className="marker-flag__line" style={{ backgroundColor: marker.color }} />
      {isEditing && (
        <input
          ref={inputRef}
          className="marker-flag__rename-input"
          type="text"
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitEdit()
            else if (e.key === 'Escape') cancelEdit()
            e.stopPropagation()
          }}
          onBlur={commitEdit}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.stopPropagation()}
        />
      )}
    </div>
  )
}
