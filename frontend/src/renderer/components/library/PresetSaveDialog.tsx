import { useState } from 'react'
import type { Preset, EffectInstance, MacroMapping, ModulationRoute } from '../../../shared/types'
import { randomUUID } from '../../utils'

interface PresetSaveDialogProps {
  isOpen: boolean
  mode: 'single_effect' | 'effect_chain'
  effectId?: string
  parameters?: Record<string, number | string | boolean>
  modulations?: Record<string, ModulationRoute[]>
  chain?: EffectInstance[]
  onSave: (preset: Preset) => void
  onClose: () => void
}

export default function PresetSaveDialog({
  isOpen,
  mode,
  effectId,
  parameters,
  modulations,
  chain,
  onSave,
  onClose,
}: PresetSaveDialogProps) {
  const [name, setName] = useState('')
  const [tags, setTags] = useState('')
  const [macros, setMacros] = useState<MacroMapping[]>([])

  if (!isOpen) return null

  const handleSave = () => {
    if (!name.trim()) return

    const tagList = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)

    const preset: Preset = {
      id: `preset-${randomUUID()}`,
      name: name.trim(),
      type: mode,
      created: Date.now(),
      tags: tagList,
      isFavorite: false,
    }

    if (mode === 'single_effect' && effectId) {
      preset.effectData = {
        effectId,
        parameters: parameters ?? {},
        modulations: modulations ?? {},
      }
    } else if (mode === 'effect_chain' && chain) {
      preset.chainData = {
        effects: chain,
        macros,
      }
    }

    onSave(preset)
    setName('')
    setTags('')
    setMacros([])
    onClose()
  }

  const addMacro = () => {
    if (!chain || chain.length === 0) return
    setMacros([
      ...macros,
      {
        label: `Macro ${macros.length + 1}`,
        effectIndex: 0,
        paramKey: '',
        min: 0,
        max: 1,
      },
    ])
  }

  const updateMacro = (index: number, field: keyof MacroMapping, value: string | number) => {
    const updated = [...macros]
    updated[index] = { ...updated[index], [field]: value }
    setMacros(updated)
  }

  const removeMacro = (index: number) => {
    setMacros(macros.filter((_, i) => i !== index))
  }

  return (
    <div className="preset-save__overlay">
      <div className="preset-save">
        <div className="preset-save__header">
          <span>Save {mode === 'single_effect' ? 'Effect' : 'Chain'} Preset</span>
          <button className="preset-save__close" onClick={onClose}>
            x
          </button>
        </div>
        <div className="preset-save__body">
          <div className="preset-save__field">
            <label className="preset-save__label">Name</label>
            <input
              className="preset-save__input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Preset"
              maxLength={100}
              autoFocus
            />
          </div>
          <div className="preset-save__field">
            <label className="preset-save__label">Tags (comma-separated)</label>
            <input
              className="preset-save__input"
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="glitch, color, subtle"
            />
          </div>

          {mode === 'effect_chain' && chain && (
            <div className="preset-save__macros">
              <div className="preset-save__macro-header">
                <span>Macros</span>
                <button className="preset-save__add-macro" onClick={addMacro}>
                  + Add
                </button>
              </div>
              {macros.map((macro, i) => (
                <div key={i} className="preset-save__macro-row">
                  <input
                    className="preset-save__macro-label"
                    value={macro.label}
                    onChange={(e) => updateMacro(i, 'label', e.target.value)}
                    placeholder="Label"
                  />
                  <select
                    className="preset-save__macro-select"
                    value={macro.effectIndex}
                    onChange={(e) => updateMacro(i, 'effectIndex', parseInt(e.target.value))}
                  >
                    {chain.map((eff, ei) => (
                      <option key={eff.id} value={ei}>
                        Effect {ei}: {eff.effectId}
                      </option>
                    ))}
                  </select>
                  <input
                    className="preset-save__macro-param"
                    value={macro.paramKey}
                    onChange={(e) => updateMacro(i, 'paramKey', e.target.value)}
                    placeholder="param key"
                  />
                  <button
                    className="preset-save__macro-remove"
                    onClick={() => removeMacro(i)}
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="preset-save__footer">
          <button className="preset-save__btn--cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            className="preset-save__btn--save"
            onClick={handleSave}
            disabled={!name.trim()}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
