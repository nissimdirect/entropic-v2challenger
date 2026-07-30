import Slider from '../common/Slider'

interface ZoomScrollProps {
  zoom: number
  onZoomChange: (zoom: number) => void
}

export default function ZoomScroll({ zoom, onZoomChange }: ZoomScrollProps) {
  return (
    <>
      <span className="zoom-scroll__label">Zoom</span>
      <div className="zoom-scroll__slider">
        <Slider
          value={zoom}
          min={0.5}
          max={500}
          default={50}
          label="Zoom"
          type="float"
          showHeader={false}
          onChange={onZoomChange}
        />
      </div>
      <span className="zoom-scroll__value">{zoom < 1 ? zoom.toFixed(1) : Math.round(zoom)}px/s</span>
    </>
  )
}
