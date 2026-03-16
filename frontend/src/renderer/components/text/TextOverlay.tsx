/**
 * TextOverlay — draggable text bounding box on the preview canvas.
 * Rendered as an absolute-positioned div over the canvas.
 * Double-click to enter inline editing mode (contentEditable).
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import type { TextClipConfig } from '../../../shared/types'

interface TextOverlayProps {
  config: TextClipConfig
  canvasWidth: number
  canvasHeight: number
  onUpdatePosition: (position: [number, number]) => void
  onUpdateText: (text: string) => void
}

export default function TextOverlay({
  config,
  canvasWidth,
  canvasHeight,
  onUpdatePosition,
  onUpdateText,
}: TextOverlayProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null)
  const editRef = useRef<HTMLDivElement>(null)
  const hasCommittedRef = useRef(false)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isEditing) return
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(true)
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        posX: config.position[0],
        posY: config.position[1],
      }
    },
    [isEditing, config.position],
  )

  useEffect(() => {
    if (!isDragging) return

    function handleMouseMove(e: MouseEvent) {
      if (!dragStartRef.current) return
      const dx = e.clientX - dragStartRef.current.x
      const dy = e.clientY - dragStartRef.current.y
      const newX = Math.max(0, Math.min(canvasWidth, dragStartRef.current.posX + dx))
      const newY = Math.max(0, Math.min(canvasHeight, dragStartRef.current.posY + dy))
      onUpdatePosition([Math.round(newX), Math.round(newY)])
    }

    function handleMouseUp() {
      setIsDragging(false)
      dragStartRef.current = null
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, canvasWidth, canvasHeight, onUpdatePosition])

  const commitText = useCallback(() => {
    if (hasCommittedRef.current) return
    hasCommittedRef.current = true
    setIsEditing(false)
    if (editRef.current) {
      const newText = editRef.current.textContent ?? ''
      if (newText !== config.text) {
        onUpdateText(newText)
      }
    }
  }, [config.text, onUpdateText])

  const handleDoubleClick = useCallback(() => {
    setIsEditing(true)
    hasCommittedRef.current = false
    requestAnimationFrame(() => {
      if (editRef.current) {
        editRef.current.focus()
        const range = document.createRange()
        range.selectNodeContents(editRef.current)
        const sel = window.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(range)
      }
    })
  }, [])

  const handleBlur = useCallback(() => {
    commitText()
  }, [commitText])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault()
        commitText()
      }
    },
    [commitText],
  )

  // Position as percentage of canvas for responsive placement
  const left = canvasWidth > 0 ? (config.position[0] / canvasWidth) * 100 : 50
  const top = canvasHeight > 0 ? (config.position[1] / canvasHeight) * 100 : 50

  return (
    <div
      className={`text-overlay${isDragging ? ' text-overlay--dragging' : ''}${isEditing ? ' text-overlay--editing' : ''}`}
      style={{
        left: `${left}%`,
        top: `${top}%`,
        transform: config.alignment === 'center' ? 'translateX(-50%)' : config.alignment === 'right' ? 'translateX(-100%)' : 'none',
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
    >
      <div className="text-overlay__box">
        {isEditing ? (
          <div
            ref={editRef}
            className="text-overlay__edit"
            contentEditable
            suppressContentEditableWarning
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            style={{
              fontSize: `${Math.max(12, config.fontSize * 0.5)}px`,
              color: config.color,
              textAlign: config.alignment,
            }}
          >
            {config.text}
          </div>
        ) : (
          <div
            className="text-overlay__preview"
            style={{
              fontSize: `${Math.max(10, config.fontSize * 0.3)}px`,
              color: config.color,
              textAlign: config.alignment,
              opacity: config.opacity,
            }}
          >
            {config.text || 'Double-click to edit'}
          </div>
        )}
      </div>
    </div>
  )
}
