interface VolumeControlProps {
  volume: number
  isMuted: boolean
  onVolumeChange: (v: number) => void
  onToggleMute: () => void
}

function speakerIcon(volume: number, isMuted: boolean): string {
  if (isMuted || volume === 0) return '\uD83D\uDD07' // 🔇
  if (volume < 0.5) return '\uD83D\uDD09'            // 🔉
  return '\uD83D\uDD0A'                               // 🔊
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
        {speakerIcon(clamped, isMuted)}
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
