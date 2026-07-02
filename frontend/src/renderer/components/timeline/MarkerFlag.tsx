import { useCallback } from 'react'
import type { Marker } from '../../../shared/types'

interface MarkerFlagProps {
  marker: Marker
  zoom: number
  scrollX: number
  onSeek: (time: number) => void
  onDelete: (id: string) => void
}

export default function MarkerFlag({ marker, zoom, scrollX, onSeek, onDelete }: MarkerFlagProps) {
  const left = marker.time * zoom - scrollX

  // Don't render if off-screen
  if (left < -10) return null

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

  return (
    <div
      className="marker-flag"
      style={{ left: `${left}px` }}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      title={marker.label}
    >
      <div className="marker-flag__head" style={{ borderBottomColor: marker.color }} />
      <div className="marker-flag__line" style={{ backgroundColor: marker.color }} />
    </div>
  )
}
