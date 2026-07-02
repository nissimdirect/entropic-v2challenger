/**
 * Phase 12 shortcut registration tests.
 * Verifies J/K/L, Cmd+D, and I/O shortcuts are registered and dispatchable.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { shortcutRegistry } from '../../renderer/utils/shortcuts'
import { DEFAULT_SHORTCUTS } from '../../renderer/utils/default-shortcuts'

beforeEach(() => {
  shortcutRegistry.loadDefaults(DEFAULT_SHORTCUTS)
  shortcutRegistry.resetAllOverrides()
})

describe('Phase 12 shortcut bindings', () => {
  it('registers transport_forward on L', () => {
    const binding = shortcutRegistry.getBinding('transport_forward')
    expect(binding).toBeDefined()
    expect(binding?.keys).toBe('l')
    expect(binding?.category).toBe('transport')
  })

  it('registers transport_stop on K', () => {
    const binding = shortcutRegistry.getBinding('transport_stop')
    expect(binding).toBeDefined()
    expect(binding?.keys).toBe('k')
    expect(binding?.category).toBe('transport')
  })

  it('registers transport_reverse on J', () => {
    const binding = shortcutRegistry.getBinding('transport_reverse')
    expect(binding).toBeDefined()
    expect(binding?.keys).toBe('j')
    expect(binding?.category).toBe('transport')
  })

  it('registers duplicate_effect on Cmd+D', () => {
    const binding = shortcutRegistry.getBinding('duplicate_effect')
    expect(binding).toBeDefined()
    expect(binding?.keys).toBe('meta+d')
    expect(binding?.category).toBe('edit')
  })

  it('loop_in and loop_out still exist', () => {
    expect(shortcutRegistry.getBinding('loop_in')?.keys).toBe('i')
    expect(shortcutRegistry.getBinding('loop_out')?.keys).toBe('o')
  })

  it('no conflicts between J/K/L and other shortcuts', () => {
    // getConflicts returns actions OTHER than the one being checked
    expect(shortcutRegistry.getConflicts('j', 'transport_reverse')).toHaveLength(0)
    expect(shortcutRegistry.getConflicts('k', 'transport_stop')).toHaveLength(0)
    expect(shortcutRegistry.getConflicts('l', 'transport_forward')).toHaveLength(0)
  })

  it('total shortcut count includes Phase 12 additions', () => {
    const bindings = shortcutRegistry.getAllBindings()
    // Should include all defaults + 4 new (J, K, L, Cmd+D)
    expect(bindings.length).toBeGreaterThanOrEqual(21)
  })
})

describe('Phase 12 shortcut dispatch', () => {
  it('transport_forward dispatches on L keypress', () => {
    let called = false
    shortcutRegistry.register('transport_forward', () => { called = true })
    const e = new KeyboardEvent('keydown', { key: 'l' })
    shortcutRegistry.handleKeyEvent(e)
    expect(called).toBe(true)
  })

  it('transport_stop dispatches on K keypress', () => {
    let called = false
    shortcutRegistry.register('transport_stop', () => { called = true })
    const e = new KeyboardEvent('keydown', { key: 'k' })
    shortcutRegistry.handleKeyEvent(e)
    expect(called).toBe(true)
  })

  it('transport_reverse dispatches on J keypress', () => {
    let called = false
    shortcutRegistry.register('transport_reverse', () => { called = true })
    const e = new KeyboardEvent('keydown', { key: 'j' })
    shortcutRegistry.handleKeyEvent(e)
    expect(called).toBe(true)
  })

  it('duplicate_effect dispatches on Cmd+D', () => {
    let called = false
    shortcutRegistry.register('duplicate_effect', () => { called = true })
    const e = new KeyboardEvent('keydown', { key: 'd', metaKey: true })
    shortcutRegistry.handleKeyEvent(e)
    expect(called).toBe(true)
  })
})
