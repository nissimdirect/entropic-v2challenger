import Waveform from '../transport/Waveform'
import VolumeControl from '../transport/VolumeControl'
import type { WaveformPeaks } from '../transport/useWaveform'

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
  waveformPeaks?: WaveformPeaks | null
  audioDuration?: number
  audioCurrentTime?: number
  onAudioSeek?: (time: number) => void
}

export default function PreviewControls({
  hasAudio = false,
  volume = 1,
  isMuted = false,
  onVolumeChange,
  onToggleMute,
  waveformPeaks,
  audioDuration = 0,
  audioCurrentTime = 0,
  onAudioSeek,
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
      {hasAudio && waveformPeaks && onAudioSeek && (
        <Waveform
          peaks={waveformPeaks}
          currentTime={audioCurrentTime}
          duration={audioDuration}
          onSeek={onAudioSeek}
        />
      )}
    </div>
  )
}
