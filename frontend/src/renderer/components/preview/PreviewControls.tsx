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

function formatTimecode(frame: number, fps: number): string {
  if (fps <= 0) return '0:00'
  const totalSeconds = frame / fps
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`
}

export default function PreviewControls({
  currentFrame,
  totalFrames,
  fps,
  isPlaying,
  onSeek,
  onPlayPause,
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
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSeek(parseInt(e.target.value, 10))
  }

  return (
    <div className="preview-controls">
      <div className="preview-controls__transport">
        <button className="preview-controls__play-btn" onClick={onPlayPause}>
          {isPlaying ? '||' : '>'}
        </button>
        <input
          type="range"
          className="preview-controls__scrub"
          min={0}
          max={Math.max(0, totalFrames - 1)}
          value={currentFrame}
          onChange={handleSeek}
          disabled={totalFrames === 0}
        />
        <span className="preview-controls__counter">
          {formatTimecode(currentFrame, fps)} / {formatTimecode(totalFrames, fps)}
        </span>
        {hasAudio && onVolumeChange && onToggleMute && (
          <VolumeControl
            volume={volume}
            isMuted={isMuted}
            onVolumeChange={onVolumeChange}
            onToggleMute={onToggleMute}
          />
        )}
      </div>
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
