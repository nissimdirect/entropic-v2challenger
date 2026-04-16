import { useState, useEffect, useCallback } from 'react'
import { shortcutRegistry, keyEventToString } from '../../utils/shortcuts'
import type { ShortcutBinding } from '../../utils/shortcuts'

const CATEGORIES = ['Transport', 'Edit', 'Timeline', 'View', 'Automation', 'Project'] as const

export default function ShortcutEditor() {
  const [bindings, setBindings] = useState<ShortcutBinding[]>([])
  const [capturingAction, setCapturingAction] = useState<string | null>(null)
  const [conflict, setConflict] = useState<string | null>(null)

  const refreshBindings = useCallback(() => {
    setBindings(shortcutRegistry.getAllBindings())
  }, [])

  useEffect(() => {
    refreshBindings()
  }, [refreshBindings])

  // Key capture listener
  useEffect(() => {
    if (!capturingAction) return

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      if (e.key === 'Escape') {
        setCapturingAction(null)
        setConflict(null)
        return
      }

      // Ignore bare modifier keys
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return

      const keyString = keyEventToString(e)
      const conflicting = shortcutRegistry.getConflicts(keyString, capturingAction)

      if (conflicting.length > 0) {
        setConflict(`Already bound to: ${conflicting.join(', ')}`)
        return
      }

      shortcutRegistry.setOverride(capturingAction, keyString)
      setCapturingAction(null)
      setConflict(null)
      refreshBindings()
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [capturingAction, refreshBindings])

  const handleReset = (action: string) => {
    shortcutRegistry.resetOverride(action)
    refreshBindings()
  }

  const handleResetAll = () => {
    shortcutRegistry.resetAllOverrides()
    refreshBindings()
  }

  const groupedByCategory = CATEGORIES.map((category) => ({
    category,
    items: bindings.filter((b) => b.category.toLowerCase() === category.toLowerCase()),
  })).filter((group) => group.items.length > 0)

  return (
    <div className="shortcut-editor">
      {conflict && (
        <div className="shortcut-editor__conflict">{conflict}</div>
      )}

      {groupedByCategory.map(({ category, items }) => (
        <div key={category}>
          <h3 className="shortcut-editor__category">{category}</h3>
          <table className="shortcut-editor__table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Default</th>
                <th>Current</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((binding) => {
                const isCapturing = capturingAction === binding.action
                const defaultBinding = shortcutRegistry.getBinding(binding.action)
                const defaultKey = defaultBinding?.keys ?? ''
                const currentKey = binding.keys
                const isOverridden = currentKey !== defaultKey
                return (
                  <tr key={binding.action} className="shortcut-editor__row">
                    <td className="shortcut-editor__action">{binding.label}</td>
                    <td className="shortcut-editor__default">{defaultKey}</td>
                    <td
                      className={`shortcut-editor__current${isCapturing ? ' shortcut-editor__current--capturing' : ''}`}
                      onClick={() => {
                        setCapturingAction(binding.action)
                        setConflict(null)
                      }}
                    >
                      {isCapturing ? 'Press key...' : currentKey}
                    </td>
                    <td className="shortcut-editor__reset">
                      {isOverridden && (
                        <button onClick={() => handleReset(binding.action)}>Reset</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}

      <button className="shortcut-editor__reset-all" onClick={handleResetAll}>
        Reset All
      </button>
    </div>
  )
}
