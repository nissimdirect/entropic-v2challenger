import { useCallback } from 'react'
import type { ClipTransform } from '../../../shared/types'

interface TransformPanelProps {
  transform: ClipTransform
  onChange: (transform: ClipTransform) => void
  canvasWidth: number
  canvasHeight: number
  sourceWidth: number
  sourceHeight: number
}

export default function TransformPanel({
  transform,
  onChange,
  canvasWidth,
  canvasHeight,
  sourceWidth,
  sourceHeight,
}: TransformPanelProps) {
  const handleChange = useCallback(
    (field: keyof ClipTransform, value: number) => {
      onChange({ ...transform, [field]: value })
    },
    [transform, onChange],
  )

  const handleFitToCanvas = useCallback(() => {
    if (sourceWidth <= 0 || sourceHeight <= 0) return
    const fitScale = Math.min(canvasWidth / sourceWidth, canvasHeight / sourceHeight)
    onChange({ x: 0, y: 0, scale: Math.round(fitScale * 100) / 100, rotation: 0 })
  }, [canvasWidth, canvasHeight, sourceWidth, sourceHeight, onChange])

  const handleReset = useCallback(() => {
    onChange({ x: 0, y: 0, scale: 1, rotation: 0 })
  }, [onChange])

  return (
    <div className="transform-panel">
      <div className="transform-panel__header">
        <span className="transform-panel__title">Transform</span>
        <div className="transform-panel__actions">
          <button className="transform-panel__btn" onClick={handleFitToCanvas} title="Fit to canvas">
            Fit
          </button>
          <button className="transform-panel__btn" onClick={handleReset} title="Reset transform">
            Reset
          </button>
        </div>
      </div>
      <div className="transform-panel__fields">
        <label className="transform-panel__field">
          <span className="transform-panel__label">X</span>
          <input
            className="transform-panel__input"
            type="number"
            value={transform.x}
            onChange={(e) => handleChange('x', Number(e.target.value))}
          />
        </label>
        <label className="transform-panel__field">
          <span className="transform-panel__label">Y</span>
          <input
            className="transform-panel__input"
            type="number"
            value={transform.y}
            onChange={(e) => handleChange('y', Number(e.target.value))}
          />
        </label>
        <label className="transform-panel__field">
          <span className="transform-panel__label">Scale</span>
          <input
            className="transform-panel__input"
            type="number"
            step={0.01}
            min={0.01}
            max={4}
            value={transform.scale}
            onChange={(e) => handleChange('scale', Number(e.target.value))}
          />
        </label>
        <label className="transform-panel__field">
          <span className="transform-panel__label">Rot</span>
          <input
            className="transform-panel__input"
            type="number"
            step={1}
            min={-360}
            max={360}
            value={transform.rotation}
            onChange={(e) => handleChange('rotation', Number(e.target.value))}
          />
        </label>
      </div>
    </div>
  )
}
