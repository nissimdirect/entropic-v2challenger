import React, { useRef, useEffect, useState } from 'react'

interface NumberInputProps {
  value: number
  min: number
  max: number
  step: number
  unit?: string
  onConfirm: (value: number) => void
  onCancel: () => void
}

/**
 * Inline number input that appears on double-click of a Knob.
 * Auto-selects text on mount. Enter confirms, Escape cancels.
 * Clicking outside also confirms.
 */
export default function NumberInput({ value, min, max, step, onConfirm, onCancel }: NumberInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(String(value))

  useEffect(() => {
    inputRef.current?.select()
  }, [])

  const confirm = () => {
    const parsed = parseFloat(text)
    if (isNaN(parsed)) {
      onCancel()
      return
    }
    const clamped = Math.max(min, Math.min(max, parsed))
    onConfirm(step >= 1 ? Math.round(clamped) : clamped)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      confirm()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  return (
    <input
      ref={inputRef}
      className="number-input"
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={confirm}
    />
  )
}
