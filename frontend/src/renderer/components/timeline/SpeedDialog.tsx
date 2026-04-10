import { useState, useRef, useEffect } from 'react'

interface SpeedDialogProps {
  currentSpeed: number
  clipDuration: number
  onConfirm: (speed: number) => void
  onClose: () => void
  position: { x: number; y: number }
}

/**
 * Inline popover dialog for setting clip speed/duration.
 * Shows both speed multiplier and resulting duration.
 * Anchored near the context menu position.
 */
export default function SpeedDialog({
  currentSpeed,
  clipDuration,
  onConfirm,
  onClose,
  position,
}: SpeedDialogProps) {
  const [speedText, setSpeedText] = useState(String(currentSpeed))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.select()
  }, [])

  const parsedSpeed = Number(speedText)
  const isValid = Number.isFinite(parsedSpeed) && parsedSpeed >= 0.1 && parsedSpeed <= 10
  const resultDuration = isValid ? clipDuration / parsedSpeed : clipDuration

  const handleConfirm = () => {
    if (!isValid) return
    onConfirm(Math.max(0.1, Math.min(10, parsedSpeed)))
  }

  return (
    <div className="speed-dialog__overlay" onClick={onClose}>
      <div
        className="speed-dialog"
        style={{ left: `${position.x}px`, top: `${position.y}px` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="speed-dialog__header">Speed / Duration</div>
        <div className="speed-dialog__body">
          <div className="speed-dialog__field">
            <label>Speed</label>
            <input
              ref={inputRef}
              className="speed-dialog__input"
              type="text"
              inputMode="decimal"
              value={speedText}
              onChange={(e) => setSpeedText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirm()
                else if (e.key === 'Escape') onClose()
                e.stopPropagation()
              }}
            />
            <span className="speed-dialog__unit">x</span>
          </div>
          <div className="speed-dialog__info">
            Duration: {resultDuration.toFixed(2)}s
          </div>
        </div>
        <div className="speed-dialog__footer">
          <button className="speed-dialog__cancel" onClick={onClose}>Cancel</button>
          <button className="speed-dialog__apply" onClick={handleConfirm} disabled={!isValid}>Apply</button>
        </div>
      </div>
    </div>
  )
}
