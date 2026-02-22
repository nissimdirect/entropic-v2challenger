interface PreviewControlsProps {
  currentFrame: number
  totalFrames: number
  isPlaying: boolean
  onSeek: (frame: number) => void
  onPlayPause: () => void
}

export default function PreviewControls({
  currentFrame,
  totalFrames,
  isPlaying,
  onSeek,
  onPlayPause,
}: PreviewControlsProps) {
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSeek(parseInt(e.target.value, 10))
  }

  return (
    <div className="preview-controls">
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
        {currentFrame} / {totalFrames}
      </span>
    </div>
  )
}
