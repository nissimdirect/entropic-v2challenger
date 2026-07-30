import Icon from '../../assets/icon-kit'

interface VolumeControlProps {
  volume: number
  isMuted: boolean
  onVolumeChange: (v: number) => void
  onToggleMute: () => void
}

function speakerIconName(volume: number, isMuted: boolean): 'volume-x' | 'volume-1' | 'volume-2' {
  if (isMuted || volume === 0) return 'volume-x'
  if (volume < 0.5) return 'volume-1'
  return 'volume-2'
}

export default function VolumeControl({
  volume,
  isMuted,
  onVolumeChange,
  onToggleMute,
}: VolumeControlProps) {
  const clamped = Math.max(0, Math.min(1, volume))

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = parseFloat(e.target.value)
    onVolumeChange(Math.max(0, Math.min(1, raw)))
  }

  return (
    <div className="volume-control">
      <button
        className="volume-control__mute-btn"
        onClick={onToggleMute}
        aria-label={isMuted ? 'Unmute' : 'Mute'}
        title={isMuted ? 'Unmute' : 'Mute'}
      >
        <Icon name={speakerIconName(clamped, isMuted)} size={16} />
      </button>
      <input
        type="range"
        className="volume-control__slider"
        min={0}
        max={1}
        step={0.01}
        value={isMuted ? 0 : clamped}
        onChange={handleChange}
        aria-label="Volume"
      />
      <span className="volume-control__label">
        {Math.round((isMuted ? 0 : clamped) * 100)}%
      </span>
    </div>
  )
}
