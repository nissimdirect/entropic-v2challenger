// Keyboard shortcut registry for Entropic v2
// Centralizes all shortcut bindings, user overrides, and dispatch.
// Perform mode pad triggers are handled separately (they use e.code).

export type ShortcutContext = 'normal' | 'perform' | 'text-input'

export interface ShortcutBinding {
  action: string           // e.g., 'undo', 'redo', 'save'
  keys: string             // e.g., 'meta+z', 'meta+shift+z', 'space'
  category: string         // 'transport' | 'timeline' | 'edit' | 'view' | 'project'
  label: string            // human-readable name
  context: ShortcutContext  // when this shortcut fires
}

const MODIFIER_ORDER = ['ctrl', 'alt', 'shift', 'meta'] as const

/**
 * Convert a KeyboardEvent into the normalized key string format.
 * Modifiers in order: ctrl+alt+shift+meta+<key>. Key is lowercase.
 * Examples: 'meta+z', 'meta+shift+z', 'space', 'a', 'meta+s', 'escape'
 */
export function keyEventToString(e: KeyboardEvent): string {
  const parts: string[] = []

  if (e.ctrlKey) parts.push('ctrl')
  if (e.altKey) parts.push('alt')
  if (e.shiftKey) parts.push('shift')
  if (e.metaKey) parts.push('meta')

  const key = e.key.toLowerCase()

  // Don't add bare modifier keys as the main key
  if (['control', 'alt', 'shift', 'meta'].includes(key)) {
    return parts.join('+')
  }

  // Normalize special key names
  let normalizedKey = key
  if (key === ' ') normalizedKey = 'space'
  if (key === '=') normalizedKey = '='
  if (key === '-') normalizedKey = '-'

  parts.push(normalizedKey)
  return parts.join('+')
}

/**
 * Normalize a key string to canonical form (modifiers sorted, key lowercase).
 */
function normalizeKeyString(keys: string): string {
  const parts = keys.toLowerCase().split('+')
  const key = parts.pop() ?? ''
  const mods = MODIFIER_ORDER.filter((m) => parts.includes(m))
  return [...mods, key].join('+')
}

class ShortcutRegistry {
  private bindings: Map<string, ShortcutBinding> = new Map()
  private handlers: Map<string, () => void> = new Map()
  private userOverrides: Map<string, string> = new Map()
  private currentContext: ShortcutContext = 'normal'

  // Reverse index: effective key string -> action name (rebuilt on changes)
  private keyToAction: Map<string, string> = new Map()

  /** Load default shortcut definitions. Replaces any previous defaults. */
  loadDefaults(defaults: ShortcutBinding[]): void {
    this.bindings.clear()
    for (const binding of defaults) {
      this.bindings.set(binding.action, {
        ...binding,
        keys: normalizeKeyString(binding.keys),
      })
    }
    this.rebuildKeyIndex()
  }

  /** Load user overrides from saved preferences. */
  loadUserOverrides(overrides: Record<string, string>): void {
    this.userOverrides.clear()
    for (const [action, keys] of Object.entries(overrides)) {
      this.userOverrides.set(action, normalizeKeyString(keys))
    }
    this.rebuildKeyIndex()
  }

  /** Bind a callback to an action name. */
  register(action: string, callback: () => void): void {
    this.handlers.set(action, callback)
  }

  /** Remove a callback for an action. */
  unregister(action: string): void {
    this.handlers.delete(action)
  }

  /** Switch the active shortcut context. */
  setContext(context: ShortcutContext): void {
    this.currentContext = context
  }

  /** Get the binding definition for an action. */
  getBinding(action: string): ShortcutBinding | undefined {
    return this.bindings.get(action)
  }

  /** Get the effective key string for an action (user override or default). */
  getEffectiveKey(action: string): string {
    return this.userOverrides.get(action) ?? this.bindings.get(action)?.keys ?? ''
  }

  /** Set a user override for an action's key binding. */
  setOverride(action: string, keys: string): void {
    this.userOverrides.set(action, normalizeKeyString(keys))
    this.rebuildKeyIndex()
  }

  /** Remove a user override, restoring the default binding. */
  resetOverride(action: string): void {
    this.userOverrides.delete(action)
    this.rebuildKeyIndex()
  }

  /** Clear all user overrides. */
  resetAllOverrides(): void {
    this.userOverrides.clear()
    this.rebuildKeyIndex()
  }

  /** Return action names that conflict with the given key string. */
  getConflicts(keys: string, excludeAction?: string): string[] {
    const normalized = normalizeKeyString(keys)
    const conflicts: string[] = []
    for (const [action] of this.bindings) {
      if (action === excludeAction) continue
      if (this.getEffectiveKey(action) === normalized) {
        conflicts.push(action)
      }
    }
    return conflicts
  }

  /** Return all bindings (with effective keys) for UI display. */
  getAllBindings(): ShortcutBinding[] {
    const result: ShortcutBinding[] = []
    for (const [, binding] of this.bindings) {
      result.push({
        ...binding,
        keys: this.getEffectiveKey(binding.action),
      })
    }
    return result
  }

  /**
   * Main keyboard event handler. Call from a single document.keydown listener.
   * Returns true if the shortcut was consumed.
   */
  handleKeyEvent(e: KeyboardEvent): boolean {
    // Skip when focused on text inputs (unless shortcut explicitly targets text-input)
    const target = e.target as HTMLElement | null
    const isTextInput =
      target?.tagName === 'INPUT' ||
      target?.tagName === 'TEXTAREA' ||
      target?.isContentEditable

    const keyStr = keyEventToString(e)
    if (!keyStr) return false

    const action = this.keyToAction.get(keyStr)
    if (!action) return false

    const binding = this.bindings.get(action)
    if (!binding) return false

    // Context checks
    if (isTextInput && binding.context !== 'text-input') return false
    if (binding.context !== this.currentContext && binding.context !== 'text-input') return false

    const handler = this.handlers.get(action)
    if (!handler) return false

    e.preventDefault()
    handler()
    return true
  }

  /** Rebuild the reverse key->action index after any binding change. */
  private rebuildKeyIndex(): void {
    this.keyToAction.clear()
    for (const [action] of this.bindings) {
      const key = this.getEffectiveKey(action)
      if (key) {
        this.keyToAction.set(key, action)
      }
    }
  }
}

export const shortcutRegistry = new ShortcutRegistry()
