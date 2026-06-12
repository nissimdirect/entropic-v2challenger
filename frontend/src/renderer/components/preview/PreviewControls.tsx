/**
 * PreviewControls — preview panel transport bar.
 *
 * MK.4: houses audio volume control.
 * MK.5: adds lasso tool mode buttons (freehand + polygon). These complement the
 *        existing 'q' hotkey cycle (rect → ellipse) — the lasso buttons are
 *        distinct modes that only activate/deactivate on click.
 *
 * Tool mode toggle semantics (matches PS convention):
 *   - Clicking an inactive button → activates that mode
 *   - Clicking the active button → deactivates (returns to null / normal mode)
 */
import { useTimelineStore } from '../../stores/timeline'
import VolumeControl from '../transport/VolumeControl'

interface PreviewControlsProps {
  currentFrame: number
  totalFrames: number
  fps: number
  isPlaying: boolean
  onSeek: (frame: number) => void
  onPlayPause: () => void
  // Audio props (optional — hidden when no audio)
  hasAudio?: boolean
  volume?: number
  isMuted?: boolean
  onVolumeChange?: (v: number) => void
  onToggleMute?: () => void
}

export default function PreviewControls({
  hasAudio = false,
  volume = 1,
  isMuted = false,
  onVolumeChange,
  onToggleMute,
}: PreviewControlsProps) {

  const toolMode = useTimelineStore((s) => s.previewToolMode)
  const setPreviewToolMode = useTimelineStore((s) => s.setPreviewToolMode)

  const handleFreehand = () => {
    setPreviewToolMode(toolMode === 'lasso-freehand' ? null : 'lasso-freehand')
  }

  const handlePolygon = () => {
    setPreviewToolMode(toolMode === 'lasso-polygon' ? null : 'lasso-polygon')
  }

  // Play/pause and scrubbing handled by timeline — this bar shows audio controls + lasso tools
  return (
    <div className="preview-controls">
      {/* MK.5: Lasso tool mode buttons */}
      <div className="preview-controls__lasso-tools" title="Lasso tools (MK.5)">
        <button
          className={`preview-controls__lasso-btn${toolMode === 'lasso-freehand' ? ' preview-controls__lasso-btn--active' : ''}`}
          onClick={handleFreehand}
          title="Freehand lasso — draw a free path to create a polygon mask"
          aria-pressed={toolMode === 'lasso-freehand'}
          aria-label="Freehand lasso"
        >
          {/* Freehand icon: wavy line */}
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path
              d="M1 10 C3 4, 5 12, 7 7 S11 2, 13 5"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"
            />
          </svg>
        </button>
        <button
          className={`preview-controls__lasso-btn${toolMode === 'lasso-polygon' ? ' preview-controls__lasso-btn--active' : ''}`}
          onClick={handlePolygon}
          title="Polygon lasso — click vertices, double-click or Enter to close, Esc to cancel"
          aria-pressed={toolMode === 'lasso-polygon'}
          aria-label="Polygon lasso"
        >
          {/* Polygon icon: pentagon outline */}
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <polygon
              points="7,1 13,5.5 10.8,13 3.2,13 1,5.5"
              stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none"
            />
          </svg>
        </button>
      </div>

      {hasAudio && (
        <div className="preview-controls__transport">
          {onVolumeChange && onToggleMute && (
            <VolumeControl
              volume={volume}
              isMuted={isMuted}
              onVolumeChange={onVolumeChange}
              onToggleMute={onToggleMute}
            />
          )}
        </div>
      )}
    </div>
  )
}
