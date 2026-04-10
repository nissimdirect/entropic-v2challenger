import { useCallback, useState } from 'react'
import type { ClipTransform } from '../../../shared/types'
import { IDENTITY_TRANSFORM } from '../../../shared/types'

interface TransformPanelProps {
  transform: ClipTransform
  onChange: (transform: ClipTransform) => void
  canvasWidth: number
  canvasHeight: number
  sourceWidth: number
  sourceHeight: number
  aspectLocked?: boolean
  onAspectLockChange?: (locked: boolean) => void
}

export default function TransformPanel({
  transform,
  onChange,
  canvasWidth,
  canvasHeight,
  sourceWidth,
  sourceHeight,
  aspectLocked: externalLocked,
  onAspectLockChange,
}: TransformPanelProps) {
  const [internalLocked, setInternalLocked] = useState(true)
  const aspectLocked = externalLocked ?? internalLocked
  const setAspectLocked = onAspectLockChange ?? setInternalLocked

  const handleChange = useCallback(
    (field: keyof ClipTransform, value: number | boolean) => {
      const next = { ...transform, [field]: value }
      // When aspect locked, keep scaleX and scaleY in sync
      if (aspectLocked && field === 'scaleX') {
        next.scaleY = value as number
      } else if (aspectLocked && field === 'scaleY') {
        next.scaleX = value as number
      }
      onChange(next)
    },
    [transform, onChange, aspectLocked],
  )

  const handleFitToCanvas = useCallback(() => {
    if (sourceWidth <= 0 || sourceHeight <= 0) return
    const fitScale = Math.min(canvasWidth / sourceWidth, canvasHeight / sourceHeight)
    const rounded = Math.round(fitScale * 100) / 100
    onChange({ ...IDENTITY_TRANSFORM, scaleX: rounded, scaleY: rounded })
  }, [canvasWidth, canvasHeight, sourceWidth, sourceHeight, onChange])

  const handleFillCanvas = useCallback(() => {
    if (sourceWidth <= 0 || sourceHeight <= 0) return
    const fillScale = Math.max(canvasWidth / sourceWidth, canvasHeight / sourceHeight)
    const rounded = Math.round(fillScale * 100) / 100
    onChange({ ...IDENTITY_TRANSFORM, scaleX: rounded, scaleY: rounded })
  }, [canvasWidth, canvasHeight, sourceWidth, sourceHeight, onChange])

  const handleReset = useCallback(() => {
    onChange({ ...IDENTITY_TRANSFORM })
  }, [onChange])

  const resetField = useCallback(
    (field: keyof ClipTransform) => {
      const defaults = IDENTITY_TRANSFORM
      const next = { ...transform, [field]: defaults[field] }
      if (aspectLocked && (field === 'scaleX' || field === 'scaleY')) {
        next.scaleX = 1
        next.scaleY = 1
      }
      onChange(next)
    },
    [transform, onChange, aspectLocked],
  )

  return (
    <div className="transform-panel">
      <div className="transform-panel__header">
        <span className="transform-panel__title">Transform</span>
        <div className="transform-panel__actions">
          <button className="transform-panel__btn" onClick={handleFitToCanvas} title="Fit to canvas">
            Fit
          </button>
          <button className="transform-panel__btn" onClick={handleFillCanvas} title="Fill canvas">
            Fill
          </button>
          <button className="transform-panel__btn" onClick={handleReset} title="Reset transform">
            Reset
          </button>
        </div>
      </div>
      <div className="transform-panel__fields">
        {/* Position */}
        <label className="transform-panel__field">
          <span className="transform-panel__label" onDoubleClick={() => resetField('x')}>X</span>
          <input
            className="transform-panel__input"
            type="number"
            value={transform.x}
            onChange={(e) => handleChange('x', Number(e.target.value))}
          />
          <span className="transform-panel__unit">px</span>
        </label>
        <label className="transform-panel__field">
          <span className="transform-panel__label" onDoubleClick={() => resetField('y')}>Y</span>
          <input
            className="transform-panel__input"
            type="number"
            value={transform.y}
            onChange={(e) => handleChange('y', Number(e.target.value))}
          />
          <span className="transform-panel__unit">px</span>
        </label>

        {/* Scale with aspect lock */}
        <div className="transform-panel__scale-row">
          <label className="transform-panel__field">
            <span className="transform-panel__label" onDoubleClick={() => resetField('scaleX')}>W</span>
            <input
              className="transform-panel__input"
              type="number"
              step={1}
              min={1}
              max={10000}
              value={Math.round(transform.scaleX * 100)}
              onChange={(e) => handleChange('scaleX', Number(e.target.value) / 100)}
            />
            <span className="transform-panel__unit">%</span>
          </label>
          <button
            className={`transform-panel__lock ${aspectLocked ? 'transform-panel__lock--active' : ''}`}
            onClick={() => setAspectLocked(!aspectLocked)}
            title={aspectLocked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
          >
            {aspectLocked ? '🔗' : '⛓️‍💥'}
          </button>
          <label className="transform-panel__field">
            <span className="transform-panel__label" onDoubleClick={() => resetField('scaleY')}>H</span>
            <input
              className="transform-panel__input"
              type="number"
              step={1}
              min={1}
              max={10000}
              value={Math.round(transform.scaleY * 100)}
              onChange={(e) => handleChange('scaleY', Number(e.target.value) / 100)}
            />
            <span className="transform-panel__unit">%</span>
          </label>
        </div>

        {/* Rotation */}
        <label className="transform-panel__field">
          <span className="transform-panel__label" onDoubleClick={() => resetField('rotation')}>Rot</span>
          <input
            className="transform-panel__input"
            type="number"
            step={1}
            value={transform.rotation}
            onChange={(e) => handleChange('rotation', Number(e.target.value))}
          />
          <span className="transform-panel__unit">°</span>
        </label>

        {/* Flip */}
        <div className="transform-panel__flip-row">
          <button
            className={`transform-panel__btn ${transform.flipH ? 'transform-panel__btn--active' : ''}`}
            onClick={() => handleChange('flipH', !transform.flipH)}
            title="Flip horizontal"
          >
            Flip H
          </button>
          <button
            className={`transform-panel__btn ${transform.flipV ? 'transform-panel__btn--active' : ''}`}
            onClick={() => handleChange('flipV', !transform.flipV)}
            title="Flip vertical"
          >
            Flip V
          </button>
        </div>
      </div>
    </div>
  )
}
