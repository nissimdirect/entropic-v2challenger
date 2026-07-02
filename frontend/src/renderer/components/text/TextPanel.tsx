/**
 * TextPanel — sidebar panel for editing text clip properties.
 * Shown when a text clip is selected.
 */
import { useCallback, useState, useRef, useEffect } from 'react'
import type { TextClipConfig, TextAnimation } from '../../../shared/types'
import { useFonts } from '../../hooks/useFonts'

const ANIMATIONS: { value: TextAnimation; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'fade_in', label: 'Fade In' },
  { value: 'fade_out', label: 'Fade Out' },
  { value: 'scale_up', label: 'Scale Up' },
  { value: 'slide_left', label: 'Slide Left' },
  { value: 'slide_up', label: 'Slide Up' },
  { value: 'typewriter', label: 'Typewriter' },
  { value: 'bounce', label: 'Bounce' },
]

const ALIGNMENTS: { value: 'left' | 'center' | 'right'; label: string }[] = [
  { value: 'left', label: 'L' },
  { value: 'center', label: 'C' },
  { value: 'right', label: 'R' },
]

interface TextPanelProps {
  config: TextClipConfig
  onUpdate: (changes: Partial<TextClipConfig>) => void
}

export default function TextPanel({ config, onUpdate }: TextPanelProps) {
  const { fonts } = useFonts()

  // Debounced text input — flush to store after 300ms or on blur (prevents undo-per-keystroke)
  const [localText, setLocalText] = useState(config.text)
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync local text when external config changes (e.g. undo, load project)
  useEffect(() => {
    setLocalText(config.text)
  }, [config.text])

  const flushText = useCallback((value: string) => {
    if (value !== config.text) {
      onUpdate({ text: value })
    }
  }, [config.text, onUpdate])

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value
      setLocalText(value)
      if (flushTimer.current) clearTimeout(flushTimer.current)
      flushTimer.current = setTimeout(() => flushText(value), 300)
    },
    [flushText],
  )

  const handleTextBlur = useCallback(() => {
    if (flushTimer.current) {
      clearTimeout(flushTimer.current)
      flushTimer.current = null
    }
    flushText(localText)
  }, [flushText, localText])

  return (
    <div className="text-panel">
      <div className="text-panel__header">Text Properties</div>

      {/* Text content */}
      <div className="text-panel__section">
        <label className="text-panel__label">Content</label>
        <textarea
          className="text-panel__textarea"
          value={localText}
          onChange={handleTextChange}
          onBlur={handleTextBlur}
          rows={3}
          placeholder="Enter text..."
        />
      </div>

      {/* Font family */}
      <div className="text-panel__section">
        <label className="text-panel__label">Font</label>
        <select
          className="text-panel__select"
          value={config.fontFamily}
          onChange={(e) => onUpdate({ fontFamily: e.target.value })}
        >
          {fonts.map((f) => (
            <option key={f.name} value={f.name}>
              {f.name}
            </option>
          ))}
        </select>
      </div>

      {/* Font size + Color row */}
      <div className="text-panel__row">
        <div className="text-panel__field">
          <label className="text-panel__label">Size</label>
          <input
            className="text-panel__number"
            type="number"
            min={8}
            max={400}
            value={config.fontSize}
            onChange={(e) => onUpdate({ fontSize: Math.max(8, Math.min(400, Number(e.target.value))) })}
          />
        </div>
        <div className="text-panel__field">
          <label className="text-panel__label">Color</label>
          <input
            className="text-panel__color"
            type="color"
            value={config.color}
            onChange={(e) => onUpdate({ color: e.target.value })}
          />
        </div>
      </div>

      {/* Alignment */}
      <div className="text-panel__section">
        <label className="text-panel__label">Alignment</label>
        <div className="text-panel__alignment">
          {ALIGNMENTS.map((a) => (
            <button
              key={a.value}
              className={`text-panel__align-btn${config.alignment === a.value ? ' text-panel__align-btn--active' : ''}`}
              onClick={() => onUpdate({ alignment: a.value })}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* Opacity */}
      <div className="text-panel__section">
        <label className="text-panel__label">
          Opacity <span className="text-panel__value">{Math.round(config.opacity * 100)}%</span>
        </label>
        <input
          className="text-panel__slider"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={config.opacity}
          onChange={(e) => onUpdate({ opacity: Number(e.target.value) })}
        />
      </div>

      <div className="text-panel__divider" />

      {/* Stroke */}
      <div className="text-panel__row">
        <div className="text-panel__field">
          <label className="text-panel__label">Stroke</label>
          <input
            className="text-panel__number"
            type="number"
            min={0}
            max={20}
            value={config.strokeWidth}
            onChange={(e) => onUpdate({ strokeWidth: Math.max(0, Math.min(20, Number(e.target.value))) })}
          />
        </div>
        <div className="text-panel__field">
          <label className="text-panel__label">Stroke Color</label>
          <input
            className="text-panel__color"
            type="color"
            value={config.strokeColor}
            onChange={(e) => onUpdate({ strokeColor: e.target.value })}
          />
        </div>
      </div>

      {/* Shadow */}
      <div className="text-panel__row">
        <div className="text-panel__field">
          <label className="text-panel__label">Shadow X</label>
          <input
            className="text-panel__number"
            type="number"
            min={-50}
            max={50}
            value={config.shadowOffset[0]}
            onChange={(e) => onUpdate({ shadowOffset: [Number(e.target.value), config.shadowOffset[1]] })}
          />
        </div>
        <div className="text-panel__field">
          <label className="text-panel__label">Shadow Y</label>
          <input
            className="text-panel__number"
            type="number"
            min={-50}
            max={50}
            value={config.shadowOffset[1]}
            onChange={(e) => onUpdate({ shadowOffset: [config.shadowOffset[0], Number(e.target.value)] })}
          />
        </div>
      </div>

      <div className="text-panel__divider" />

      {/* Animation */}
      <div className="text-panel__section">
        <label className="text-panel__label">Animation</label>
        <select
          className="text-panel__select"
          value={config.animation}
          onChange={(e) => onUpdate({ animation: e.target.value as TextAnimation })}
        >
          {ANIMATIONS.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
      </div>

      {/* Animation duration */}
      {config.animation !== 'none' && (
        <div className="text-panel__section">
          <label className="text-panel__label">
            Duration <span className="text-panel__value">{config.animationDuration.toFixed(1)}s</span>
          </label>
          <input
            className="text-panel__slider"
            type="range"
            min={0.1}
            max={5}
            step={0.1}
            value={config.animationDuration}
            onChange={(e) => onUpdate({ animationDuration: Number(e.target.value) })}
          />
        </div>
      )}
    </div>
  )
}
