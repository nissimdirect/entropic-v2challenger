import { useCallback } from 'react'

interface ZoomScrollProps {
  zoom: number
  onZoomChange: (zoom: number) => void
}

export default function ZoomScroll({ zoom, onZoomChange }: ZoomScrollProps) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onZoomChange(parseFloat(e.target.value))
    },
    [onZoomChange],
  )

  return (
    <>
      <span className="zoom-scroll__label">Zoom</span>
      <input
        type="range"
        className="zoom-scroll__slider"
        min={0.5}
        max={500}
        step={0.5}
        value={zoom}
        onChange={handleChange}
      />
      <span className="zoom-scroll__value">{zoom < 1 ? zoom.toFixed(1) : Math.round(zoom)}px/s</span>
    </>
  )
}
