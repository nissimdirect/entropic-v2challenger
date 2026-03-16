import Waveform from '../transport/Waveform'
import VolumeControl from '../transport/VolumeControl'
import Tooltip from '../common/Tooltip'
import { shortcutRegistry } from '../../utils/shortcuts'
import { useAutomationStore } from '../../stores/automation'
import { useEngineStore } from '../../stores/engine'
import { getTransportSpeedLevel, getTransportDirection } from '../../utils/transport-speed'
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
  if (fps <= 0) return '00:00:00.00'
  const totalSeconds = frame / fps
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const sStr = seconds.toFixed(2).padStart(5, '0')
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${sStr}`
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

  const autoMode = useAutomationStore((s) => s.mode)
  const armedTrackId = useAutomationStore((s) => s.armedTrackId)
  const engineStatus = useEngineStore((s) => s.status)
  const isRecording = autoMode !== 'read' && armedTrackId !== null

  const handleToggleRecord = () => {
    const autoStore = useAutomationStore.getState()
    if (isRecording) {
      // Stop recording — switch to read mode
      autoStore.setMode('read')
      autoStore.armTrack(null)
    } else {
      // Start recording — use touch mode by default
      autoStore.setMode('touch')
    }
  }

  const handleToggleOverdub = () => {
    const autoStore = useAutomationStore.getState()
    const current = autoStore.mode
    // Toggle between 'touch' (overdub) and 'latch' (replace)
    if (current === 'touch') {
      autoStore.setMode('latch')
    } else {
      autoStore.setMode('touch')
    }
  }

  const speedLevel = getTransportSpeedLevel()
  const direction = getTransportDirection()

  return (
    <div className="preview-controls">
      <div className="preview-controls__transport">
        {/* Connection indicator */}
        <Tooltip text={`Engine: ${engineStatus}`} position="bottom">
          <span
            className="preview-controls__connection-dot"
            data-testid="connection-dot"
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: engineStatus === 'connected' ? '#4ade80' : engineStatus === 'restarting' ? '#f59e0b' : '#ef4444',
              boxShadow: engineStatus === 'connected' ? '0 0 6px #4ade80' : 'none',
              flexShrink: 0,
            }}
          />
        </Tooltip>

        {/* Play/Pause */}
        <Tooltip text={isPlaying ? 'Pause' : 'Play'} shortcut={shortcutRegistry.getEffectiveKey('play_pause')} position="bottom">
          <button className="preview-controls__play-btn" onClick={onPlayPause}>
            {isPlaying ? '||' : '>'}
          </button>
        </Tooltip>

        {/* Record */}
        <Tooltip text={isRecording ? 'Stop Recording' : 'Record Automation'} position="bottom">
          <button
            className={`preview-controls__record-btn${isRecording ? ' preview-controls__record-btn--active' : ''}`}
            data-testid="record-btn"
            onClick={handleToggleRecord}
          >
            ●
          </button>
        </Tooltip>

        {/* Overdub toggle */}
        <Tooltip text={autoMode === 'touch' ? 'Overdub: ON (merge)' : 'Overdub: OFF (replace)'} position="bottom">
          <button
            className={`preview-controls__ovr-btn${autoMode === 'touch' ? ' preview-controls__ovr-btn--active' : ''}`}
            data-testid="ovr-btn"
            onClick={handleToggleOverdub}
          >
            OVR
          </button>
        </Tooltip>

        {/* Scrub */}
        <input
          type="range"
          className="preview-controls__scrub"
          min={0}
          max={Math.max(0, totalFrames - 1)}
          value={currentFrame}
          onChange={handleSeek}
          disabled={totalFrames === 0}
        />

        {/* Timecode */}
        <span className="preview-controls__timecode" data-testid="timecode">
          {formatTimecode(currentFrame, fps)}
        </span>

        {/* Speed indicator (only when J/K/L active and not 1x) */}
        {speedLevel > 1 && (
          <span className="preview-controls__speed-badge" data-testid="speed-badge">
            {direction === 'reverse' ? '◀' : '▶'}{speedLevel}x
          </span>
        )}

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
