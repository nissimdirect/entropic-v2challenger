interface FreezeOverlayProps {
  isFrozen: boolean
}

export default function FreezeOverlay({ isFrozen }: FreezeOverlayProps) {
  if (!isFrozen) return null
  return (
    <div className="freeze-overlay freeze-overlay--active">
      <span className="freeze-overlay__badge">&#10052;</span>
    </div>
  )
}
