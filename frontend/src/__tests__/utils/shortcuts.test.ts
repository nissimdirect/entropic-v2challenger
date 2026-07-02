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

// F-0516-8: Cmd+M is reserved by macOS Window→Minimize. The add_marker binding
// is bare 'm' to avoid that conflict (DaVinci / Premiere / Final Cut convention).
describe('F-0516-8: add_marker binding does not conflict with macOS Cmd+M', () => {
  it('add_marker effective key is bare m', () => {
    expect(shortcutRegistry.getEffectiveKey('add_marker')).toBe('m')
  })

  it('bare m keypress dispatches to add_marker handler', () => {
    const callback = vi.fn()
    shortcutRegistry.register('add_marker', callback)

    const e = new KeyboardEvent('keydown', { key: 'm' })
    shortcutRegistry.handleKeyEvent(e)

    expect(callback).toHaveBeenCalledOnce()
    shortcutRegistry.unregister('add_marker')
  })

  it('meta+m no longer dispatches to add_marker (lets macOS minimize through)', () => {
    const callback = vi.fn()
    shortcutRegistry.register('add_marker', callback)

    const e = new KeyboardEvent('keydown', { key: 'm', metaKey: true })
    shortcutRegistry.handleKeyEvent(e)

    expect(callback).not.toHaveBeenCalled()
    shortcutRegistry.unregister('add_marker')
  })

  it('m keypress in text-input context is skipped (does not add marker mid-typing)', () => {
    const callback = vi.fn()
    shortcutRegistry.register('add_marker', callback)

    const e = new KeyboardEvent('keydown', { key: 'm' })
    Object.defineProperty(e, 'target', {
      value: { tagName: 'INPUT', isContentEditable: false },
    })
    shortcutRegistry.handleKeyEvent(e)

    expect(callback).not.toHaveBeenCalled()
    shortcutRegistry.unregister('add_marker')
  })

  it('m does not collide with another shortcut in the defaults', () => {
    // getConflicts excluding add_marker should return empty for 'm'
    expect(shortcutRegistry.getConflicts('m', 'add_marker')).toEqual([])
  })
})
