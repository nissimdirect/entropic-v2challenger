import { useState, useRef } from 'react'
import { useModalBehavior } from '../../hooks/useModalBehavior'

interface FeedbackDialogProps {
  isOpen: boolean
  onClose: () => void
}

export default function FeedbackDialog({ isOpen, onClose }: FeedbackDialogProps) {
  const [text, setText] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  useModalBehavior(dialogRef, onClose)

  if (!isOpen) return null

  const handleSend = async () => {
    if (!text.trim() || !window.entropic) return
    try {
      await window.entropic.submitFeedback(text.trim())
    } catch {
      // Best-effort — still show thanks
    }
    setSubmitted(true)
    setTimeout(() => {
      setSubmitted(false)
      setText('')
      onClose()
    }, 1500)
  }

  const handleClose = () => {
    setText('')
    setSubmitted(false)
    onClose()
  }

  if (submitted) {
    return (
      <div className="feedback-dialog__overlay">
        <div
          ref={dialogRef}
          className="feedback-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="feedback-dialog-title"
          onClick={(e) => e.stopPropagation()}
        >
          <p id="feedback-dialog-title" className="feedback-dialog__thanks">
            Thank you for your feedback!
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="feedback-dialog__overlay" onClick={handleClose}>
      <div
        ref={dialogRef}
        className="feedback-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="feedback-dialog__header">
          <span id="feedback-dialog-title">Report a Bug</span>
          <button className="feedback-dialog__close" onClick={handleClose}>
            &times;
          </button>
        </div>
        <div className="feedback-dialog__body">
          <textarea
            className="feedback-dialog__textarea"
            placeholder="What happened?"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 2000))}
            maxLength={2000}
          />
          <div className="feedback-dialog__char-count">
            {text.length}/2000
          </div>
        </div>
        <div className="feedback-dialog__footer">
          <button
            className="feedback-dialog__btn feedback-dialog__btn--cancel"
            onClick={handleClose}
          >
            Cancel
          </button>
          <button
            className="feedback-dialog__btn feedback-dialog__btn--send"
            onClick={handleSend}
            disabled={!text.trim()}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
