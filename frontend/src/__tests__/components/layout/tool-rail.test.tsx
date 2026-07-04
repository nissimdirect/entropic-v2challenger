/**
 * GH issue 422 — ToolRail (L-block left tool rail) component tests.
 *
 * Named tests per the executor brief's hard oracle:
 *  1. renders all 14 tools grouped TRNS/EDIT/MASK/MISC
 *  2. clicking a tool calls setCursorTool with the right id
 *  3. active tool gets the active class
 *  4. keyboard-selected tool (store change) updates the rail highlight
 *
 * Plus regression coverage from code review:
 *  5. statusbar chip attribute stays in sync while EffectBrowser is unmounted
 *  6. hotkey badge reflects a LIVE user remap, not the static default table
 *  7. no hotkey badge for a CursorTool whose shortcut has no registered handler
 *  8. every TOOL_ENTRIES/MASK_TOOL_ENTRIES id appears in exactly one rail group
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { setupMockEntropic, teardownMockEntropic } from '../../helpers/mock-entropic'

import ToolRail from '../../../renderer/components/layout/ToolRail'
import { useLayoutStore } from '../../../renderer/stores/layout'
import { useTimelineStore } from '../../../renderer/stores/timeline'
import { TOOL_ENTRIES, MASK_TOOL_ENTRIES } from '../../../renderer/components/effects/EffectBrowser'
import { shortcutRegistry } from '../../../renderer/utils/shortcuts'
import { DEFAULT_SHORTCUTS } from '../../../renderer/utils/default-shortcuts'

function resetStores() {
  useLayoutStore.setState({ cursorTool: 'select' })
  useTimelineStore.getState().setPreviewToolMode(null)
  document.body.removeAttribute('data-cursor-tool')
  // Mirrors App.tsx's own startup call (App.tsx:628) — shortcutRegistry.getEffectiveKey()
  // returns '' for every action until loadDefaults() has populated the bindings map,
  // and ToolRail is rendered standalone here (no App.tsx mount).
  shortcutRegistry.loadDefaults(DEFAULT_SHORTCUTS)
  shortcutRegistry.resetAllOverrides()
}

beforeEach(() => {
  setupMockEntropic()
  resetStores()
})

afterEach(() => {
  cleanup()
  teardownMockEntropic()
  resetStores()
})

const ALL_TOOL_IDS = [...TOOL_ENTRIES, ...MASK_TOOL_ENTRIES].map((e) => e.id)

describe('ToolRail (GH issue 422)', () => {
  it('renders all 14 tools grouped TRNS/EDIT/MASK/MISC', () => {
    const { getByTestId, queryAllByTestId } = render(<ToolRail />)

    // 4 groups present
    expect(getByTestId('tool-rail-group-TRNS')).toBeTruthy()
    expect(getByTestId('tool-rail-group-EDIT')).toBeTruthy()
    expect(getByTestId('tool-rail-group-MASK')).toBeTruthy()
    expect(getByTestId('tool-rail-group-MISC')).toBeTruthy()

    // Exactly 14 tool buttons total, one per CursorTool id (TOOL_ENTRIES + MASK_TOOL_ENTRIES)
    expect(ALL_TOOL_IDS).toHaveLength(14)
    for (const id of ALL_TOOL_IDS) {
      expect(getByTestId(`tool-rail-item-${id}`)).toBeTruthy()
    }
    expect(queryAllByTestId(/^tool-rail-item-/)).toHaveLength(14)

    // Group membership matches the L-block spec (TRNS=1, EDIT=4, MASK=6, MISC=3)
    const trns = getByTestId('tool-rail-group-TRNS')
    const edit = getByTestId('tool-rail-group-EDIT')
    const mask = getByTestId('tool-rail-group-MASK')
    const misc = getByTestId('tool-rail-group-MISC')
    expect(trns.querySelectorAll('.tool-rail__tool')).toHaveLength(1)
    expect(edit.querySelectorAll('.tool-rail__tool')).toHaveLength(4)
    expect(mask.querySelectorAll('.tool-rail__tool')).toHaveLength(6)
    expect(misc.querySelectorAll('.tool-rail__tool')).toHaveLength(3)
  })

  it('every TOOL_ENTRIES/MASK_TOOL_ENTRIES id appears in exactly one rail group (no silent future omission)', () => {
    // Guards RAIL_GROUPS' hand-written TRNS/EDIT/MISC arrays: if a new entry is
    // ever added to TOOL_ENTRIES without also adding it to a rail group, this
    // test fails loudly instead of the tool silently never appearing in the UI.
    const { queryAllByTestId } = render(<ToolRail />)
    const renderedIds = queryAllByTestId(/^tool-rail-item-/).map((el) =>
      el.getAttribute('data-testid')!.replace('tool-rail-item-', ''),
    )
    expect(new Set(renderedIds)).toEqual(new Set(ALL_TOOL_IDS))
    expect(renderedIds).toHaveLength(ALL_TOOL_IDS.length) // no duplicates either
  })

  it('clicking a tool calls setCursorTool with the right id (non-mask tool)', () => {
    const { getByTestId } = render(<ToolRail />)
    fireEvent.click(getByTestId('tool-rail-item-razor'))
    expect(useLayoutStore.getState().cursorTool).toBe('razor')
    // Non-mask tool clears previewToolMode (mirrors EffectBrowser.selectCursorTool)
    expect(useTimelineStore.getState().previewToolMode).toBeNull()
  })

  it('clicking a mask tool calls setCursorTool AND wires previewToolMode', () => {
    const { getByTestId } = render(<ToolRail />)
    fireEvent.click(getByTestId('tool-rail-item-mask-wand'))
    expect(useLayoutStore.getState().cursorTool).toBe('mask-wand')
    expect(useTimelineStore.getState().previewToolMode).toBe('wand')
  })

  it('active tool gets the active class', () => {
    useLayoutStore.setState({ cursorTool: 'slip' })
    const { getByTestId } = render(<ToolRail />)
    const slipBtn = getByTestId('tool-rail-item-slip')
    const razorBtn = getByTestId('tool-rail-item-razor')
    expect(slipBtn.className).toContain('tool-rail__tool--active')
    expect(slipBtn.getAttribute('aria-pressed')).toBe('true')
    expect(razorBtn.className).not.toContain('tool-rail__tool--active')
    expect(razorBtn.getAttribute('aria-pressed')).toBe('false')
  })

  it('keyboard-selected tool (store change) updates the rail highlight', () => {
    const { getByTestId } = render(<ToolRail />)
    expect(getByTestId('tool-rail-item-select').className).toContain('tool-rail__tool--active')

    // Simulate the keyboard-shortcut path (App.tsx writes the store directly, same as a hotkey)
    act(() => {
      useLayoutStore.getState().setCursorTool('mask-lasso-polygon')
    })

    expect(getByTestId('tool-rail-item-select').className).not.toContain('tool-rail__tool--active')
    expect(getByTestId('tool-rail-item-mask-lasso-polygon').className).toContain('tool-rail__tool--active')
  })

  it('statusbar chip attribute (document.body[data-cursor-tool]) stays in sync even when EffectBrowser is unmounted', () => {
    // Regression guard: this attribute used to be written ONLY by EffectBrowser's
    // own useEffect, which unmounts whenever the sidebar isn't on the [tool] tab.
    // ToolRail is mounted unconditionally under the flag, so it must own this too.
    expect(document.body.getAttribute('data-cursor-tool')).toBeNull()
    const { getByTestId } = render(<ToolRail />)
    expect(document.body.getAttribute('data-cursor-tool')).toBe('select')

    fireEvent.click(getByTestId('tool-rail-item-razor'))
    expect(document.body.getAttribute('data-cursor-tool')).toBe('razor')
  })

  it('hotkey badge reflects a live user remap, not the static default table', () => {
    // Default 'razor' binding is 'b'.
    let { getByTestId, unmount } = render(<ToolRail />)
    expect(getByTestId('tool-rail-item-razor').title).toContain('B')
    unmount()

    // User remaps razor to 'r' via the Keyboard Shortcuts editor (ShortcutEditor.tsx
    // calls shortcutRegistry.setOverride under the hood).
    shortcutRegistry.setOverride('tool_razor', 'r')
    ;({ getByTestId, unmount } = render(<ToolRail />))
    expect(getByTestId('tool-rail-item-razor').title).toContain('R')
    expect(getByTestId('tool-rail-item-razor').title).not.toContain('(B)')
  })

  it('does NOT show a hotkey badge for slip/slide (registered in DEFAULT_SHORTCUTS but no handler wired in App.tsx yet)', () => {
    const { getByTestId } = render(<ToolRail />)
    // title falls back to the bare label (no "(key)" suffix) when hotkeyFor() returns undefined
    expect(getByTestId('tool-rail-item-slip').title).toBe('Slip')
    expect(getByTestId('tool-rail-item-slide').title).toBe('Slide')
    expect(getByTestId('tool-rail-item-slip').querySelector('.tool-rail__hotkey')).toBeNull()
    expect(getByTestId('tool-rail-item-slide').querySelector('.tool-rail__hotkey')).toBeNull()
  })
})
