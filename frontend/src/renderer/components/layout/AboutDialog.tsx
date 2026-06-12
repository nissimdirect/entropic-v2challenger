import { useRef } from 'react'
import '../../styles/about.css'
import { useModalBehavior } from '../../hooks/useModalBehavior'

interface AboutDialogProps {
  isOpen: boolean
  onClose: () => void
}

export default function AboutDialog({ isOpen, onClose }: AboutDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useModalBehavior(dialogRef, onClose)

  if (!isOpen) return null

  return (
    <div className="about-dialog__overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className="about-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div id="about-dialog-title" className="about-dialog__logo">CREATRIX</div>
        <div className="about-dialog__version">v3.0.0</div>
        <div className="about-dialog__credits">Built by PopChaos Labs</div>
        <button className="about-dialog__close" onClick={onClose}>x</button>
      </div>
    </div>
  )
}
