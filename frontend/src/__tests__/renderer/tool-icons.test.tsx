import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import ToolIcon, { TOOL_NAMES, type ToolName } from '../../renderer/assets/tool-icons'
import { TOOL_ENTRIES, MASK_TOOL_ENTRIES, TOOL_ICON } from '../../renderer/components/effects/EffectBrowser'
import type { CursorTool } from '../../renderer/components/effects/EffectBrowser'
import { CURSOR_FOR_TOOL, cursorForTool } from '../../renderer/assets/tool-cursors'
import fs from 'node:fs'
import path from 'node:path'

describe('ToolIcon (PK.H1 wire direction, 17 tool names — 14 wired CursorTools + 3 future)', () => {
  it('has exactly 17 tool names, all unique', () => {
    expect(TOOL_NAMES.length).toBe(17)
    expect(new Set(TOOL_NAMES).size).toBe(17)
  })

  it('renders every tool name without error, each producing an <svg> with a non-empty body', () => {
    for (const name of TOOL_NAMES) {
      const { container, unmount } = render(<ToolIcon name={name} />)
      const svg = container.querySelector('svg')
      expect(svg).toBeTruthy()
      // "no empty path" — every glyph renders at least one child shape node.
      expect(svg!.children.length).toBeGreaterThan(0)
      unmount()
    }
  })

  it('renders the shared wire stroke attributes (1.9 / round / round) on every icon', () => {
    for (const name of TOOL_NAMES) {
      const { container, unmount } = render(<ToolIcon name={name} />)
      const svg = container.querySelector('svg')
      expect(svg).toBeTruthy()
      expect(svg?.getAttribute('stroke-width')).toBe('1.9')
      expect(svg?.getAttribute('stroke-linecap')).toBe('round')
      expect(svg?.getAttribute('stroke-linejoin')).toBe('round')
      expect(svg?.getAttribute('stroke')).toBe('currentColor')
      expect(svg?.getAttribute('fill')).toBe('none')
      unmount()
    }
  })

  it('respects the size prop', () => {
    const { container } = render(<ToolIcon name="zoom" size={32} />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('32')
    expect(svg?.getAttribute('height')).toBe('32')
  })

  it('never hardcodes a hex color — only currentColor appears as a paint value', () => {
    for (const name of TOOL_NAMES) {
      const { container, unmount } = render(<ToolIcon name={name} />)
      const html = container.innerHTML
      expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}/)
      unmount()
    }
  })

  it('the ToolName union has exactly 17 members (compile-time exhaustiveness check)', () => {
    // If a member is added to or removed from ToolName without updating this
    // switch, the `default` branch's `never` assignment fails to compile —
    // `tsc --noEmit` catches drift between the union and this list.
    function assertExhaustive(name: ToolName): true {
      switch (name) {
        case 'transform':
        case 'text':
        case 'razor':
        case 'slip':
        case 'slide':
        case 'rippledel':
        case 'marqrect':
        case 'marqellipse':
        case 'lasso':
        case 'polylasso':
        case 'wand':
        case 'keypicker':
        case 'hand':
        case 'zoom':
        case 'marker':
        case 'loopin':
        case 'loopout':
          return true
        default: {
          const _exhaustive: never = name
          return _exhaustive
        }
      }
    }

    for (const name of TOOL_NAMES) {
      expect(assertExhaustive(name)).toBe(true)
    }
  })

  it('rejects a bogus tool name at compile time', () => {
    // @ts-expect-error — 'not-a-real-tool' is not a member of ToolName
    const bogus: ToolName = 'not-a-real-tool'
    expect(bogus).toBeDefined()
  })

  // ── PK.H1 hard oracle: G2 wand path fragment ──────────────────────────────
  it('wand glyph contains the WAND RESOLUTION G2 star path fragment (proposal.md, LOCKED 2026-07-30)', () => {
    const { container } = render(<ToolIcon name="wand" />)
    const html = container.innerHTML
    // The distinguishing G2 star path — verbatim from proposal.md "WAND RESOLUTION".
    expect(html).toContain('15.5 3.5l1.4 3.6 3.6 1.4-3.6 1.4-1.4 3.6-1.4-3.6-3.6-1.4 3.6-1.4z')
    // Rod (mass-fixed, 2.4 stroke) and the four tapering region-wake dots.
    expect(html).toContain('M5 19l6.5-6.5')
    expect(container.querySelectorAll('circle').length).toBe(4)
  })

  // ── PK.H1 hard oracle: vendored-Lucide license comment ────────────────────
  it('tool-icons.tsx carries the vendored-Lucide ISC license comment', () => {
    const filePath = path.join(__dirname, '../../renderer/assets/tool-icons.tsx')
    const src = fs.readFileSync(filePath, 'utf-8')
    expect(src).toContain('VENDORED LUCIDE ICONS')
    expect(src).toContain('ISC License')
    expect(src).toContain('lucide-static')
  })

  // ── PK.H1 hard oracle: every one of the 14 live CursorTool ids has a
  // non-empty glyph reachable via TOOL_ICON (not just present in tool-icons.tsx). ──
  it('every one of the 14 wired CursorTool ids resolves to a non-empty ToolIcon glyph', () => {
    const allToolIds: CursorTool[] = [
      ...TOOL_ENTRIES.map((e) => e.id),
      ...MASK_TOOL_ENTRIES.map((e) => e.id),
    ]
    expect(allToolIds.length).toBe(14)
    expect(new Set(allToolIds).size).toBe(14)

    for (const id of allToolIds) {
      const iconName = TOOL_ICON[id]
      expect(iconName, `TOOL_ICON has no entry for CursorTool '${id}'`).toBeTruthy()
      const { container, unmount } = render(<ToolIcon name={iconName!} />)
      const svg = container.querySelector('svg')
      expect(svg!.children.length, `glyph for '${id}' (${iconName}) is empty`).toBeGreaterThan(0)
      unmount()
    }
  })

  // ── PK.H1 hard oracle: cursor mapping — each CursorTool id -> expected cursor. ──
  it('cursorForTool maps each CursorTool id to its locked cursor value (v4.1 addendum)', () => {
    const expectations: Record<CursorTool, string | undefined> = {
      select: undefined, // default arrow, no override
      razor: CURSOR_FOR_TOOL.razor,
      slip: 'ew-resize',
      slide: 'ew-resize',
      'ripple-delete': CURSOR_FOR_TOOL['ripple-delete'],
      marker: 'crosshair',
      'loop-in': CURSOR_FOR_TOOL['loop-in'],
      'loop-out': CURSOR_FOR_TOOL['loop-out'],
      'mask-marquee-rect': 'crosshair',
      'mask-marquee-ellipse': 'crosshair',
      'mask-lasso-freehand': 'crosshair',
      'mask-lasso-polygon': 'crosshair',
      'mask-wand': 'crosshair',
      'mask-key-picker': CURSOR_FOR_TOOL['mask-key-picker'],
    }

    for (const [tool, expected] of Object.entries(expectations) as [CursorTool, string | undefined][]) {
      expect(cursorForTool(tool)).toBe(expected)
    }
  })

  it('the 5 custom-svg cursors (razor/ripple-delete/loop-in/loop-out/eyedropper) are url() data URIs with a hotspot + fallback', () => {
    const customCursorTools: CursorTool[] = ['razor', 'ripple-delete', 'loop-in', 'loop-out', 'mask-key-picker']
    for (const tool of customCursorTools) {
      const value = cursorForTool(tool)
      expect(value).toBeTruthy()
      expect(value).toMatch(/^url\("data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+"\) \d+ \d+, \w+$/)
    }
  })
})
