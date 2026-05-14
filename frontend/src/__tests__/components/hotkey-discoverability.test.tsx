/**
 * Hotkey discoverability sprint (#65) — sweep coverage.
 *
 * Verifies:
 *   1. EffectRack refactor regression — the 4 right-click actions (Freeze up
 *      to here / Unfreeze / Flatten to video / Save effect as preset) still
 *      render with the correct conditional visibility and dispatch the
 *      expected callbacks. This is the highest-risk change in the sprint
 *      because EffectRack swapped from a bespoke menu div to the shared
 *      ContextMenu component.
 *   2. Shortcut hint surfacing — when the registry has a binding for a
 *      probed action (e.g. setOverride('save_effect_preset', 'meta+p')),
 *      the EffectRack menu renders the formatted glyph next to the item.
 *      When no binding exists, no shortcut span renders.
 *
 * Out-of-scope coverage (already tested elsewhere):
 *   - ContextMenu prop contract (context-menu-propagation.test.tsx)
 *   - prettyShortcut format mapping (covered implicitly via integration)
 *   - DeviceChain / Track header full render (covered in device-chain.test.tsx
 *     and the rest of the timeline tests; the wiring here is one-line per
 *     MenuItem so behavioral risk is low)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import EffectRack from '../../renderer/components/effects/EffectRack'
import { shortcutRegistry } from '../../renderer/utils/shortcuts'
import { DEFAULT_SHORTCUTS } from '../../renderer/utils/default-shortcuts'
import { useFreezeStore } from '../../renderer/stores/freeze'
import type { EffectInstance, EffectInfo } from '../../shared/types'

const MOCK_FX: EffectInstance = {
  id: 'fx-1',
  effectId: 'pixelsort',
  isEnabled: true,
  isFrozen: false,
  parameters: {},
  modulations: {},
  mix: 1,
  mask: null,
}

const MOCK_REG: EffectInfo[] = [
  { id: 'pixelsort', name: 'Pixel Sort', category: 'glitch', params: {} },
]

function resetRegistry() {
  shortcutRegistry.loadDefaults(DEFAULT_SHORTCUTS)
  shortcutRegistry.resetAllOverrides()
}

function resetFreeze() {
  useFreezeStore.setState({ frozenPrefixes: {} })
}

beforeEach(() => {
  resetRegistry()
  resetFreeze()
})
afterEach(cleanup)

describe('EffectRack — right-click menu (post-refactor)', () => {
  it('shows all 4 actions when no effect is frozen and all callbacks provided', () => {
    const props = {
      chain: [MOCK_FX],
      registry: MOCK_REG,
      selectedEffectId: null,
      onSelect: vi.fn(),
      onToggle: vi.fn(),
      onRemove: vi.fn(),
      onReorder: vi.fn(),
      onFreezeUpTo: vi.fn(),
      onUnfreeze: vi.fn(),
      onFlatten: vi.fn(),
      onSaveEffectPreset: vi.fn(),
    }
    const { container, queryByText } = render(<EffectRack {...props} />)

    const item = container.querySelector('.effect-rack__item')!
    fireEvent.contextMenu(item, { clientX: 100, clientY: 100 })

    // No frozen state, so Unfreeze + Flatten are gated off.
    expect(queryByText('Freeze up to here')).toBeTruthy()
    expect(queryByText('Save effect as preset')).toBeTruthy()
    expect(queryByText('Unfreeze')).toBeNull()
    expect(queryByText('Flatten to video')).toBeNull()
  })

  it('shows Unfreeze + Flatten only when the effect is frozen', () => {
    useFreezeStore.setState({
      frozenPrefixes: { default: { cacheId: 'frozen-cache', cutIndex: 0 } },
    })

    const props = {
      chain: [MOCK_FX],
      registry: MOCK_REG,
      selectedEffectId: null,
      onSelect: vi.fn(),
      onToggle: vi.fn(),
      onRemove: vi.fn(),
      onReorder: vi.fn(),
      onFreezeUpTo: vi.fn(),
      onUnfreeze: vi.fn(),
      onFlatten: vi.fn(),
      onSaveEffectPreset: vi.fn(),
    }
    const { container, queryByText } = render(<EffectRack {...props} />)

    const item = container.querySelector('.effect-rack__item')!
    fireEvent.contextMenu(item, { clientX: 100, clientY: 100 })

    expect(queryByText('Freeze up to here')).toBeTruthy()
    expect(queryByText('Unfreeze')).toBeTruthy()
    expect(queryByText('Flatten to video')).toBeTruthy()
    expect(queryByText('Save effect as preset')).toBeTruthy()
  })

  it('renders nothing when no callbacks are provided (empty items array)', () => {
    const props = {
      chain: [MOCK_FX],
      registry: MOCK_REG,
      selectedEffectId: null,
      onSelect: vi.fn(),
      onToggle: vi.fn(),
      onRemove: vi.fn(),
      onReorder: vi.fn(),
      // No onFreezeUpTo / onUnfreeze / onFlatten / onSaveEffectPreset
    }
    const { container } = render(<EffectRack {...props} />)

    const item = container.querySelector('.effect-rack__item')!
    fireEvent.contextMenu(item, { clientX: 100, clientY: 100 })

    // ContextMenu is null when items.length === 0; bespoke menu div gone.
    expect(container.querySelector('.context-menu')).toBeNull()
    expect(container.querySelector('.effect-rack__context-menu')).toBeNull()
  })

  it('fires onSaveEffectPreset with the correct effect id', () => {
    const onSaveEffectPreset = vi.fn()
    const props = {
      chain: [MOCK_FX, { ...MOCK_FX, id: 'fx-2' }],
      registry: MOCK_REG,
      selectedEffectId: null,
      onSelect: vi.fn(),
      onToggle: vi.fn(),
      onRemove: vi.fn(),
      onReorder: vi.fn(),
      onSaveEffectPreset,
    }
    const { container, getByText } = render(<EffectRack {...props} />)

    // Right-click the SECOND item.
    const items = container.querySelectorAll('.effect-rack__item')
    fireEvent.contextMenu(items[1], { clientX: 100, clientY: 100 })
    fireEvent.click(getByText('Save effect as preset'))

    expect(onSaveEffectPreset).toHaveBeenCalledOnce()
    expect(onSaveEffectPreset).toHaveBeenCalledWith('fx-2')
  })

  it('surfaces the shortcut glyph when the registry has a binding for the action', () => {
    // Bind a key to save_effect_preset via override (lightweight, no defaults edit).
    shortcutRegistry.setOverride('save_effect_preset', 'meta+shift+p')

    const props = {
      chain: [MOCK_FX],
      registry: MOCK_REG,
      selectedEffectId: null,
      onSelect: vi.fn(),
      onToggle: vi.fn(),
      onRemove: vi.fn(),
      onReorder: vi.fn(),
      onSaveEffectPreset: vi.fn(),
    }
    const { container } = render(<EffectRack {...props} />)

    const item = container.querySelector('.effect-rack__item')!
    fireEvent.contextMenu(item, { clientX: 100, clientY: 100 })

    // The shortcut span should render with the formatted glyph.
    // Modifier order is ctrl+alt+shift+meta per registry's MODIFIER_ORDER,
    // so 'meta+shift+p' normalizes to 'shift+meta+p' → glyphs '⇧⌘P'.
    const hints = Array.from(
      container.querySelectorAll<HTMLElement>('.context-menu__shortcut'),
    )
    expect(hints.map((el) => el.textContent)).toContain('⇧⌘P')
  })

  it('omits the shortcut span when no binding exists for the probed action', () => {
    // freeze_up_to / unfreeze_effects / flatten_to_video / save_effect_preset
    // are not in DEFAULT_SHORTCUTS, and we have not set an override —
    // getEffectiveKey returns '', prettyShortcut('') returns undefined,
    // ContextMenu renders no shortcut span.
    const props = {
      chain: [MOCK_FX],
      registry: MOCK_REG,
      selectedEffectId: null,
      onSelect: vi.fn(),
      onToggle: vi.fn(),
      onRemove: vi.fn(),
      onReorder: vi.fn(),
      onFreezeUpTo: vi.fn(),
      onSaveEffectPreset: vi.fn(),
    }
    const { container } = render(<EffectRack {...props} />)

    const item = container.querySelector('.effect-rack__item')!
    fireEvent.contextMenu(item, { clientX: 100, clientY: 100 })

    expect(container.querySelector('.context-menu__shortcut')).toBeNull()
  })
})
