interface AboutDialogProps {
  isOpen: boolean
  onClose: () => void
}

export default function AboutDialog({ isOpen, onClose }: AboutDialogProps) {
  if (!isOpen) return null

  return (
    <div className="about-dialog__overlay" onClick={onClose}>
      <div className="about-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="about-dialog__logo">ENTROPIC</div>
        <div className="about-dialog__version">v2.0.0</div>
        <div className="about-dialog__credits">Built by PopChaos Labs</div>
        <button className="about-dialog__close" onClick={onClose}>x</button>
      </div>
    </div>
  )
}
