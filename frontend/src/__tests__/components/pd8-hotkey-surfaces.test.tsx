/**
 * PD.8 — Hotkey-discoverability surfaces
 *
 * Hard-oracle tests required by the packet contract:
 *   1. "track header menu shows shortcut text from registry"
 *      — when a binding exists in the registry for a track-header action,
 *        the formatted glyph appears in the context-menu item.
 *   2. "menu item without binding shows no shortcut text" (NEGATIVE)
 *      — when no binding exists (getEffectiveKey returns ''), no shortcut
 *        span renders — never the string "undefined".
 *   3. "rebound shortcut updates menu display" (INTEGRATION)
 *      — registry setOverride → prettyShortcut → ContextMenu shortcut prop
 *        renders the NEW key; proves the display is live, not hardcoded.
 *
 * Surface under test: TrackHeader (surface 1) — the component where all
 * five track-header actions are wired.  DeviceChain and EffectRack have
 * equivalent coverage in their own suites.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { shortcutRegistry } from '../../renderer/utils/shortcuts'
import { DEFAULT_SHORTCUTS } from '../../renderer/utils/default-shortcuts'
import { TrackHeader } from '../../renderer/components/timeline/Track'
import type { Track as TrackType } from '../../shared/types'

// Minimal track fixture — only the fields TrackHeader reads.
const MOCK_TRACK: TrackType = {
  id: 'track-1',
  name: 'Video 1',
  type: 'video',
  color: '#4ade80',
  isMuted: false,
  isSoloed: false,
  clips: [],
  effectChain: [],
}

function resetRegistry() {
  shortcutRegistry.loadDefaults(DEFAULT_SHORTCUTS)
  shortcutRegistry.resetAllOverrides()
}

beforeEach(resetRegistry)
afterEach(cleanup)

describe('PD.8 hotkey-discoverability — TrackHeader context menu', () => {
  /**
   * Hard oracle 1: track header menu shows shortcut text from registry.
   *
   * We set an override for 'rename_track' and verify the formatted glyph
   * appears next to the "Rename Track" menu item.
   */
  it('track header menu shows shortcut text from registry', () => {
    // Bind rename_track via override so the menu item gets a shortcut hint.
    shortcutRegistry.setOverride('rename_track', 'f2')

    const { container } = render(
      <TrackHeader track={MOCK_TRACK} isSelected={false} />,
    )

    // Open the context menu.
    const header = container.querySelector('.track-header')!
    fireEvent.contextMenu(header, { clientX: 100, clientY: 100 })

    // The shortcut span must render with the formatted glyph for F2.
    const hints = Array.from(
      container.querySelectorAll<HTMLElement>('.context-menu__shortcut'),
    )
    const texts = hints.map((el) => el.textContent)
    expect(texts).toContain('F2')
  })

  /**
   * Hard oracle 2 (NEGATIVE): menu item without binding shows no shortcut text.
   *
   * All track-header actions use DEFAULT_SHORTCUTS bindings. With defaults
   * loaded and no override, the registry returns an empty string for actions
   * that have no DEFAULT_SHORTCUTS entry (e.g. a hypothetical action).
   * Verify no `.context-menu__shortcut` span renders, and the text
   * "undefined" is NOT present anywhere in the menu.
   *
   * We reset to a clean slate (no overrides) so actions that DO have
   * DEFAULT_SHORTCUTS entries still appear, but actions we clear via
   * resetOverride will not render shortcuts.  To reliably test the
   * "no binding" path we temporarily unload defaults for rename_track.
   */
  it('menu item without binding shows no shortcut text', () => {
    // Load defaults but then forcibly clear any binding for rename_track
    // by resetting to defaults and then clearing the specific action.
    // Since DEFAULT_SHORTCUTS now has rename_track with a key, we remove it
    // by loading a filtered set that excludes rename_track.
    const filteredDefaults = DEFAULT_SHORTCUTS.filter(
      (b) => b.action !== 'rename_track',
    )
    shortcutRegistry.loadDefaults(filteredDefaults)

    const { container } = render(
      <TrackHeader track={MOCK_TRACK} isSelected={false} />,
    )

    const header = container.querySelector('.track-header')!
    fireEvent.contextMenu(header, { clientX: 100, clientY: 100 })

    // The "Rename Track" item must render — it's always in the menu.
    const menuItems = container.querySelectorAll('.context-menu__item')
    const renameItem = Array.from(menuItems).find(
      (el) => el.textContent?.startsWith('Rename Track'),
    )
    expect(renameItem).toBeTruthy()

    // No .context-menu__shortcut child inside rename item.
    const shortcutInRename = renameItem!.querySelector('.context-menu__shortcut')
    expect(shortcutInRename).toBeNull()

    // The literal string "undefined" must not appear anywhere in the menu.
    const menu = container.querySelector('.context-menu')!
    expect(menu.textContent).not.toContain('undefined')
  })

  /**
   * Hard oracle 3 (INTEGRATION): rebound shortcut updates menu display.
   *
   * Sequence:
   *   1. Set initial override for rename_track → 'meta+r' (⌘R).
   *   2. Render TrackHeader and open context menu → confirm ⌘R shows.
   *   3. Call setOverride again → 'meta+shift+r' (⇧⌘R).
   *   4. Re-render (new registry state) and open context menu →
   *      confirm ⇧⌘R shows and ⌘R is gone.
   *
   * This proves the display is driven live from the registry and is not
   * a hardcoded string captured at component creation time.
   */
  it('rebound shortcut updates menu display', () => {
    // Step 1: initial binding.
    shortcutRegistry.setOverride('rename_track', 'meta+r')

    const { container, unmount } = render(
      <TrackHeader track={MOCK_TRACK} isSelected={false} />,
    )

    const header = container.querySelector('.track-header')!
    fireEvent.contextMenu(header, { clientX: 100, clientY: 100 })

    const hints1 = Array.from(
      container.querySelectorAll<HTMLElement>('.context-menu__shortcut'),
    ).map((el) => el.textContent)
    expect(hints1).toContain('⌘R')

    // Step 3: rebind to a different key.
    shortcutRegistry.setOverride('rename_track', 'meta+shift+r')

    // Close menu so we get a fresh render on re-open.
    unmount()
    cleanup()

    const { container: container2 } = render(
      <TrackHeader track={MOCK_TRACK} isSelected={false} />,
    )
    const header2 = container2.querySelector('.track-header')!
    fireEvent.contextMenu(header2, { clientX: 100, clientY: 100 })

    const hints2 = Array.from(
      container2.querySelectorAll<HTMLElement>('.context-menu__shortcut'),
    ).map((el) => el.textContent)

    // New key must appear, old key must be gone.
    // Modifier order: ctrl+alt+shift+meta+key → 'meta+shift+r' normalizes to 'shift+meta+r' → ⇧⌘R.
    expect(hints2).toContain('⇧⌘R')
    expect(hints2).not.toContain('⌘R')
  })
})
