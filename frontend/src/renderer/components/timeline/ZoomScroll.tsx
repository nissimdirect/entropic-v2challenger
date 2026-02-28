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
        min={10}
        max={200}
        step={1}
        value={zoom}
        onChange={handleChange}
      />
      <span className="zoom-scroll__value">{zoom}px/s</span>
    </>
  )
}
