import { useState } from 'react'

interface FeedbackDialogProps {
  isOpen: boolean
  onClose: () => void
}

export default function FeedbackDialog({ isOpen, onClose }: FeedbackDialogProps) {
  const [text, setText] = useState('')
  const [submitted, setSubmitted] = useState(false)

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
        <div className="feedback-dialog" onClick={(e) => e.stopPropagation()}>
          <p className="feedback-dialog__thanks">Thank you for your feedback!</p>
        </div>
      </div>
    )
  }

  return (
    <div className="feedback-dialog__overlay" onClick={handleClose}>
      <div className="feedback-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="feedback-dialog__header">
          <span>Report a Bug</span>
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
