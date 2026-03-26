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

  // Play/pause and scrubbing handled by timeline — this bar shows audio controls only
  return (
    <div className="preview-controls">
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
