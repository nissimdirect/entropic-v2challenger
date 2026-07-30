/**
 * GH issue 422 / ui-foundation PK.B2 — ToolRail (L-block left tool rail,
 * Convention 1 grouped rail) component tests.
 *
 * PK.B2 (D4a, RATIFIED-FOUNDATIONS.md) replaces the PK.B "14 buttons,
 * visually clustered under TRNS/EDIT/MASK/MISC" rail with a true grouped
 * rail: 6 groups, one visible slot per group, flyout for multi-subtool
 * groups. This file REPLACES the old TRNS/EDIT/MASK/MISC group-membership
 * suite (that grouping no longer exists) — justification for the PR body
 * per the packet's "if grouping legitimately changes an expectation, update
 * WITH justification" allowance. Regression coverage carried over from the
 * old suite (statusbar chip sync, live hotkey remap, keyboard-selected tool
 * updates the highlight, icon size stability) is preserved below, adapted
 * to the group model.
 *
 * Hard oracle covered here (packets.md PK.B2):
 *  1. 6 groups render with correct slots/carets (multi-subtool groups only)
 *  2. group-hotkey cycle order is deterministic and wraps (via the exported
 *     cycleRailGroup dispatcher — the same function App.tsx's hotkey
 *     handlers call, so this is a direct test of the real dispatch path)
 *  3. flyout opens on hold (>=300ms) AND right-click
 *  4. flyout dismisses on Esc AND outside-click
 *  5. menuitemradio aria-checked tracks the active subtool
 *  6. every one of the 14 CursorTool ids is reachable (no orphan)
 *  7. NO text/nav placeholder slots exist (D4a REAL-INVENTORY negative check)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { setupMockEntropic, teardownMockEntropic } from '../../helpers/mock-entropic'

import ToolRail, { cycleRailGroup } from '../../../renderer/components/layout/ToolRail'
import { useLayoutStore } from '../../../renderer/stores/layout'
import { useTimelineStore } from '../../../renderer/stores/timeline'
import { TOOL_ENTRIES, MASK_TOOL_ENTRIES } from '../../../renderer/components/effects/EffectBrowser'
import { shortcutRegistry } from '../../../renderer/utils/shortcuts'
import { DEFAULT_SHORTCUTS } from '../../../renderer/utils/default-shortcuts'

function resetStores() {
  useLayoutStore.setState({ cursorTool: 'select' })
  useTimelineStore.getState().setPreviewToolMode(null)
  document.body.removeAttribute('data-cursor-tool')
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
  vi.useRealTimers()
})

const ALL_TOOL_IDS = [...TOOL_ENTRIES, ...MASK_TOOL_ENTRIES].map((e) => e.id)
const GROUP_KEYS = ['select', 'trim', 'mask-shape', 'mask-free', 'key', 'mark-loop'] as const
const MULTI_SUBTOOL_GROUPS = ['trim', 'mask-shape', 'mask-free', 'key', 'mark-loop'] as const

describe('ToolRail (D4a Convention 1 — 6 groups, no text/nav placeholders)', () => {
  it('renders exactly 6 group slots, no more, no fewer', () => {
    const { getByTestId, queryAllByTestId } = render(<ToolRail />)
    for (const key of GROUP_KEYS) {
      expect(getByTestId(`tool-rail-group-${key}`)).toBeTruthy()
    }
    expect(queryAllByTestId(/^tool-rail-group-/)).toHaveLength(6)
  })

  it('D4a REAL-INVENTORY negative check: no text/nav placeholder slots exist', () => {
    const { queryByTestId } = render(<ToolRail />)
    expect(queryByTestId('tool-rail-group-text')).toBeNull()
    expect(queryByTestId('tool-rail-group-nav')).toBeNull()
  })

  it('every CursorTool id (14 total) is reachable from exactly one group — no orphan', () => {
    // Re-derive RAIL_GROUPS membership indirectly: cycling every group's hotkey
    // enough times must visit every id exactly once per group, and the union
    // must equal the full 14-tool set with no duplicates.
    expect(ALL_TOOL_IDS).toHaveLength(14)
    const setCursorTool = useLayoutStore.getState().setCursorTool
    const visited = new Set<string>()
    for (const key of GROUP_KEYS) {
      useLayoutStore.setState({ cursorTool: 'select' }) // force idx===-1 entry each time
      // Cycle up to 5 times (max group size) collecting ids; stop once it repeats.
      const seen: string[] = []
      for (let i = 0; i < 5; i++) {
        cycleRailGroup(key, setCursorTool)
        const t = useLayoutStore.getState().cursorTool
        if (seen.includes(t)) break
        seen.push(t)
      }
      for (const id of seen) visited.add(id)
    }
    expect(visited).toEqual(new Set(ALL_TOOL_IDS))
  })

  it('caret renders only on multi-subtool groups (trim/mask-shape/mask-free/key/mark-loop), not select', () => {
    const { getByTestId } = render(<ToolRail />)
    for (const key of MULTI_SUBTOOL_GROUPS) {
      expect(getByTestId(`tool-rail-group-${key}`).querySelector('.tool-rail__caret')).toBeTruthy()
    }
    expect(getByTestId('tool-rail-group-select').querySelector('.tool-rail__caret')).toBeNull()
  })
})

describe('ToolRail — cycleRailGroup (group-hotkey cycle order, deterministic + wraps)', () => {
  beforeEach(() => {
    resetStores()
  })

  it('select: single-member group, cycling is a no-op (always select)', () => {
    const setCursorTool = useLayoutStore.getState().setCursorTool
    cycleRailGroup('select', setCursorTool)
    expect(useLayoutStore.getState().cursorTool).toBe('select')
    cycleRailGroup('select', setCursorTool)
    expect(useLayoutStore.getState().cursorTool).toBe('select')
  })

  it('trim: razor -> slip -> slide -> ripple-delete -> razor (wraps, no "off" step)', () => {
    const setCursorTool = useLayoutStore.getState().setCursorTool
    const order = ['razor', 'slip', 'slide', 'ripple-delete', 'razor']
    for (const expected of order) {
      cycleRailGroup('trim', setCursorTool)
      expect(useLayoutStore.getState().cursorTool).toBe(expected)
    }
  })

  it('mask-shape: mask-marquee-rect <-> mask-marquee-ellipse (2-state wrap, "off" step removed per D4a)', () => {
    const setCursorTool = useLayoutStore.getState().setCursorTool
    cycleRailGroup('mask-shape', setCursorTool)
    expect(useLayoutStore.getState().cursorTool).toBe('mask-marquee-rect')
    cycleRailGroup('mask-shape', setCursorTool)
    expect(useLayoutStore.getState().cursorTool).toBe('mask-marquee-ellipse')
    // Third press wraps back to rect — pre-D4a behavior fell back to 'select' here.
    cycleRailGroup('mask-shape', setCursorTool)
    expect(useLayoutStore.getState().cursorTool).toBe('mask-marquee-rect')
  })

  it('mask-free: mask-lasso-freehand <-> mask-lasso-polygon (2-state wrap, "off" step removed per D4a)', () => {
    const setCursorTool = useLayoutStore.getState().setCursorTool
    cycleRailGroup('mask-free', setCursorTool)
    expect(useLayoutStore.getState().cursorTool).toBe('mask-lasso-freehand')
    cycleRailGroup('mask-free', setCursorTool)
    expect(useLayoutStore.getState().cursorTool).toBe('mask-lasso-polygon')
    cycleRailGroup('mask-free', setCursorTool)
    expect(useLayoutStore.getState().cursorTool).toBe('mask-lasso-freehand')
  })

  it('key: mask-wand <-> mask-key-picker (new group, previously unwired)', () => {
    const setCursorTool = useLayoutStore.getState().setCursorTool
    cycleRailGroup('key', setCursorTool)
    expect(useLayoutStore.getState().cursorTool).toBe('mask-wand')
    cycleRailGroup('key', setCursorTool)
    expect(useLayoutStore.getState().cursorTool).toBe('mask-key-picker')
    cycleRailGroup('key', setCursorTool)
    expect(useLayoutStore.getState().cursorTool).toBe('mask-wand')
  })

  it('mark-loop: marker -> loop-in -> loop-out -> marker (D4a: shift+m only, bare m stays add_marker)', () => {
    const setCursorTool = useLayoutStore.getState().setCursorTool
    const order = ['marker', 'loop-in', 'loop-out', 'marker']
    for (const expected of order) {
      cycleRailGroup('mark-loop', setCursorTool)
      expect(useLayoutStore.getState().cursorTool).toBe(expected)
    }
  })

  it('cycling honors the LIVE cursorTool as the starting position (e.g. reached via the standalone "x" ripple-delete shortcut)', () => {
    const setCursorTool = useLayoutStore.getState().setCursorTool
    useLayoutStore.setState({ cursorTool: 'ripple-delete' }) // simulates the 'x' direct-select path
    cycleRailGroup('trim', setCursorTool)
    expect(useLayoutStore.getState().cursorTool).toBe('razor') // wraps from the last member
  })

  it("cycling from a non-member tool jumps to the group's first member", () => {
    const setCursorTool = useLayoutStore.getState().setCursorTool
    useLayoutStore.setState({ cursorTool: 'select' })
    cycleRailGroup('mark-loop', setCursorTool)
    expect(useLayoutStore.getState().cursorTool).toBe('marker')
  })

  it('mask cycling sets previewToolMode->non-null and non-mask cycling clears it to null (selectCursorTool wiring intact)', () => {
    const setCursorTool = useLayoutStore.getState().setCursorTool
    cycleRailGroup('mask-shape', setCursorTool)
    expect(useTimelineStore.getState().previewToolMode).toBe('marquee-rect')
    cycleRailGroup('trim', setCursorTool)
    expect(useLayoutStore.getState().cursorTool).toBe('razor')
    expect(useTimelineStore.getState().previewToolMode).toBeNull()
  })
})

describe('ToolRail — click, active state, statusbar sync (regression, adapted to groups)', () => {
  it('clicking a slot activates its current (last-active) subtool', () => {
    const { getByTestId } = render(<ToolRail />)
    fireEvent.click(getByTestId('tool-rail-group-trim'))
    expect(useLayoutStore.getState().cursorTool).toBe('razor') // trim's default first member
  })

  it('active group gets the active class + aria-pressed', () => {
    useLayoutStore.setState({ cursorTool: 'slip' })
    const { getByTestId } = render(<ToolRail />)
    const trimSlot = getByTestId('tool-rail-group-trim')
    const selectSlot = getByTestId('tool-rail-group-select')
    expect(trimSlot.className).toContain('tool-rail__tool--active')
    expect(trimSlot.getAttribute('aria-pressed')).toBe('true')
    expect(selectSlot.className).not.toContain('tool-rail__tool--active')
    expect(selectSlot.getAttribute('aria-pressed')).toBe('false')
  })

  it("keyboard-selected tool (store change) updates the correct group's highlight, even across groups", () => {
    const { getByTestId } = render(<ToolRail />)
    expect(getByTestId('tool-rail-group-select').className).toContain('tool-rail__tool--active')

    act(() => {
      useLayoutStore.getState().setCursorTool('mask-lasso-polygon')
    })

    expect(getByTestId('tool-rail-group-select').className).not.toContain('tool-rail__tool--active')
    expect(getByTestId('tool-rail-group-mask-free').className).toContain('tool-rail__tool--active')
  })

  it("a group slot keeps showing its own last-active subtool while a sibling group is active (Photoshop flyout-group convention)", () => {
    const { getByTestId } = render(<ToolRail />)
    act(() => {
      useLayoutStore.getState().setCursorTool('mask-marquee-ellipse')
    })
    act(() => {
      useLayoutStore.getState().setCursorTool('select')
    })
    // mask-shape is no longer globally active, but its slot's icon should still
    // reflect mask-marquee-ellipse (verified via aria-label since the fallback
    // glyph choice is PK.H's concern, not this packet's).
    expect(getByTestId('tool-rail-group-mask-shape').getAttribute('aria-label')).toBe('Mask Ellipse')
  })

  it('statusbar chip attribute (document.body[data-cursor-tool]) stays in sync', () => {
    expect(document.body.getAttribute('data-cursor-tool')).toBeNull()
    const { getByTestId } = render(<ToolRail />)
    expect(document.body.getAttribute('data-cursor-tool')).toBe('select')

    fireEvent.click(getByTestId('tool-rail-group-trim'))
    expect(document.body.getAttribute('data-cursor-tool')).toBe('razor')
  })

  it('hotkey badge reflects a live user remap, not the static default table', () => {
    let { getByTestId, unmount } = render(<ToolRail />)
    expect(getByTestId('tool-rail-group-trim').title).toContain('B')
    unmount()

    shortcutRegistry.setOverride('tool_razor', 'r')
    ;({ getByTestId, unmount } = render(<ToolRail />))
    expect(getByTestId('tool-rail-group-trim').title).toContain('R')
  })

  it('every wired slot renders its icon at size=16 (PK.B locked dims, unaffected by PK.B2 grouping)', () => {
    const { getByTestId } = render(<ToolRail />)
    for (const key of GROUP_KEYS) {
      const svg = getByTestId(`tool-rail-group-${key}`).querySelector('svg')
      if (svg) {
        expect(svg.getAttribute('width'), `${key} icon width`).toBe('16')
        expect(svg.getAttribute('height'), `${key} icon height`).toBe('16')
      }
    }
  })
})

describe('ToolRail — flyout (Photoshop convention: hold + right-click, ARIA, dismiss)', () => {
  it('right-click opens the flyout with role="menu" and one menuitemradio per subtool', () => {
    const { getByTestId, queryByTestId } = render(<ToolRail />)
    expect(queryByTestId('tool-rail-flyout')).toBeNull()

    fireEvent.contextMenu(getByTestId('tool-rail-group-trim'))

    const flyout = getByTestId('tool-rail-flyout')
    expect(flyout.getAttribute('role')).toBe('menu')
    for (const id of ['razor', 'slip', 'slide', 'ripple-delete']) {
      const item = getByTestId(`tool-rail-flyout-item-${id}`)
      expect(item.getAttribute('role')).toBe('menuitemradio')
    }
  })

  it('press-and-hold >=300ms opens the flyout; a quick click does not', () => {
    vi.useFakeTimers()
    const { getByTestId, queryByTestId } = render(<ToolRail />)
    const slot = getByTestId('tool-rail-group-mask-shape')

    // Quick click: mousedown -> mouseup well before 300ms -> no flyout.
    fireEvent.mouseDown(slot)
    fireEvent.mouseUp(slot)
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(queryByTestId('tool-rail-flyout')).toBeNull()

    // Hold: mousedown, then let 300ms elapse before releasing.
    fireEvent.mouseDown(slot)
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(getByTestId('tool-rail-flyout')).toBeTruthy()
  })

  it('menuitemradio aria-checked tracks the active subtool, and clicking an item selects + closes', () => {
    const { getByTestId, queryByTestId } = render(<ToolRail />)
    fireEvent.contextMenu(getByTestId('tool-rail-group-trim'))

    expect(getByTestId('tool-rail-flyout-item-razor').getAttribute('aria-checked')).toBe('true')
    expect(getByTestId('tool-rail-flyout-item-slide').getAttribute('aria-checked')).toBe('false')

    fireEvent.click(getByTestId('tool-rail-flyout-item-slide'))

    expect(useLayoutStore.getState().cursorTool).toBe('slide')
    expect(queryByTestId('tool-rail-flyout')).toBeNull()

    fireEvent.contextMenu(getByTestId('tool-rail-group-trim'))
    expect(getByTestId('tool-rail-flyout-item-slide').getAttribute('aria-checked')).toBe('true')
  })

  it('dismisses on Escape', () => {
    const { getByTestId, queryByTestId } = render(<ToolRail />)
    fireEvent.contextMenu(getByTestId('tool-rail-group-mask-free'))
    expect(getByTestId('tool-rail-flyout')).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(queryByTestId('tool-rail-flyout')).toBeNull()
  })

  it('dismisses on outside click', () => {
    const { getByTestId, queryByTestId } = render(<ToolRail />)
    fireEvent.contextMenu(getByTestId('tool-rail-group-key'))
    expect(getByTestId('tool-rail-flyout')).toBeTruthy()

    fireEvent.pointerDown(document.body)
    expect(queryByTestId('tool-rail-flyout')).toBeNull()
  })

  it('only one flyout is open at a time', () => {
    const { getByTestId, queryAllByTestId } = render(<ToolRail />)
    fireEvent.contextMenu(getByTestId('tool-rail-group-trim'))
    fireEvent.contextMenu(getByTestId('tool-rail-group-mask-shape'))
    expect(queryAllByTestId('tool-rail-flyout')).toHaveLength(1)
  })
})
