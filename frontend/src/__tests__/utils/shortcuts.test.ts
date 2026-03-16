/**
 * ShortcutRegistry and keyEventToString tests.
 * Verifies key normalization, binding management, overrides, conflict detection,
 * and text-input context skipping.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shortcutRegistry, keyEventToString } from '../../renderer/utils/shortcuts'
import { DEFAULT_SHORTCUTS } from '../../renderer/utils/default-shortcuts'

beforeEach(() => {
  shortcutRegistry.loadDefaults(DEFAULT_SHORTCUTS)
  shortcutRegistry.resetAllOverrides()
})

describe('keyEventToString', () => {
  it('converts meta+z', () => {
    const e = new KeyboardEvent('keydown', { key: 'z', metaKey: true })
    expect(keyEventToString(e)).toBe('meta+z')
  })

  it('converts space', () => {
    const e = new KeyboardEvent('keydown', { key: ' ' })
    expect(keyEventToString(e)).toBe('space')
  })

  it('converts shift+meta+z', () => {
    const e = new KeyboardEvent('keydown', { key: 'z', shiftKey: true, metaKey: true })
    expect(keyEventToString(e)).toBe('shift+meta+z')
  })
})

describe('ShortcutRegistry', () => {
  it('loadDefaults populates bindings', () => {
    expect(shortcutRegistry.getAllBindings().length).toBe(DEFAULT_SHORTCUTS.length)
  })

  it('register and unregister callback', () => {
    const callback = vi.fn()
    shortcutRegistry.register('undo', callback)

    const e = new KeyboardEvent('keydown', { key: 'z', metaKey: true })
    shortcutRegistry.handleKeyEvent(e)

    expect(callback).toHaveBeenCalledOnce()

    shortcutRegistry.unregister('undo')
    const e2 = new KeyboardEvent('keydown', { key: 'z', metaKey: true })
    shortcutRegistry.handleKeyEvent(e2)

    expect(callback).toHaveBeenCalledOnce() // still 1
  })

  it('getEffectiveKey returns default when no override', () => {
    expect(shortcutRegistry.getEffectiveKey('undo')).toBe('meta+z')
  })

  it('setOverride changes effective key', () => {
    shortcutRegistry.setOverride('undo', 'ctrl+z')
    expect(shortcutRegistry.getEffectiveKey('undo')).toBe('ctrl+z')
  })

  it('resetOverride restores default', () => {
    shortcutRegistry.setOverride('undo', 'ctrl+z')
    shortcutRegistry.resetOverride('undo')
    expect(shortcutRegistry.getEffectiveKey('undo')).toBe('meta+z')
  })

  it('resetAllOverrides clears all', () => {
    shortcutRegistry.setOverride('undo', 'ctrl+z')
    shortcutRegistry.setOverride('redo', 'ctrl+y')
    shortcutRegistry.resetAllOverrides()
    expect(shortcutRegistry.getEffectiveKey('undo')).toBe('meta+z')
    expect(shortcutRegistry.getEffectiveKey('redo')).toBe('shift+meta+z')
  })

  it('getConflicts detects key collision', () => {
    shortcutRegistry.setOverride('undo', 'meta+s')
    // 'meta+s' is now used by both 'undo' (override) and 'save' (default)
    // Excluding 'undo': 'save' still conflicts
    expect(shortcutRegistry.getConflicts('meta+s', 'undo')).toContain('save')
    // Excluding 'save': 'undo' still conflicts
    expect(shortcutRegistry.getConflicts('meta+s', 'save')).toContain('undo')
    // A key with no collisions returns empty
    expect(shortcutRegistry.getConflicts('ctrl+shift+x')).toEqual([])
  })

  it('handleKeyEvent skips text input context', () => {
    const callback = vi.fn()
    shortcutRegistry.register('undo', callback)

    const e = new KeyboardEvent('keydown', { key: 'z', metaKey: true })
    Object.defineProperty(e, 'target', {
      value: { tagName: 'INPUT', isContentEditable: false },
    })
    shortcutRegistry.handleKeyEvent(e)

    expect(callback).not.toHaveBeenCalled()
  })
})
