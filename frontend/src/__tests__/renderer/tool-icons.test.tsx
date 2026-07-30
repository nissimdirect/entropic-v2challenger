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

  // ── PK.H1 reconciliation: diff every glyph against the recovered ground
  // truth (openspec/changes/ui-foundation/tool-glyphs-locked.js). Read as
  // raw text + regex-extracted (not `import`ed) so this test carries zero
  // tsconfig/module-resolution risk for a plain .js reference file that
  // lives outside src/. 'wand' is excluded — G2 (proposal.md, LOCKED
  // 2026-07-30) explicitly supersedes the locked file's historical pre-G2
  // Block wand entry, so wand is exempt from this diff by design.
  describe('reconciliation vs. tool-glyphs-locked.js ground truth', () => {
    const lockedFilePath = path.join(__dirname, '../../../../openspec/changes/ui-foundation/tool-glyphs-locked.js')
    const lockedSrc = fs.readFileSync(lockedFilePath, 'utf-8')

    // Matches `key:{...b:'...'}` entries (src/block flags may appear between
    // the key and `b:`, in any order per the file's actual formatting).
    const ENTRY_RE = /(\w+):\{[^}]*?b:'([^']*)'\}/g
    const locked = new Map<string, string>()
    for (const m of lockedSrc.matchAll(ENTRY_RE)) {
      locked.set(m[1], m[2])
    }

    it('the ground-truth file parses to at least 17 entries (18 glyphs incl. paint + historical wand)', () => {
      expect(locked.size).toBeGreaterThanOrEqual(17)
    })

    // Normalizes a DOM subtree (from either the rendered ToolIcon or the
    // locked file's raw markup string, parsed through the SAME jsdom
    // innerHTML setter) into an ordered [{tag, attrs}] shape. Comparing two
    // DOM-parsed structures — rather than raw strings — sidesteps cosmetic
    // differences (self-closing vs not, attribute order) that don't reflect
    // an actual shape difference; numeric attributes compare with a small
    // tolerance so "0.9" (React's Number->string) matches ".9" (the locked
    // file's literal) as the same value.
    function shapeOf(html: string): Array<{ tag: string; attrs: Record<string, string> }> {
      const div = document.createElement('div')
      div.innerHTML = html
      return Array.from(div.querySelectorAll('*')).map((el) => {
        const attrs: Record<string, string> = {}
        for (const a of Array.from(el.attributes)) attrs[a.name] = a.value
        return { tag: el.tagName.toLowerCase(), attrs }
      })
    }

    function shapesEqual(a: ReturnType<typeof shapeOf>, b: ReturnType<typeof shapeOf>): boolean {
      if (a.length !== b.length) return false
      for (let i = 0; i < a.length; i++) {
        if (a[i].tag !== b[i].tag) return false
        const aKeys = Object.keys(a[i].attrs).sort()
        const bKeys = Object.keys(b[i].attrs).sort()
        if (aKeys.join(',') !== bKeys.join(',')) return false
        for (const k of aKeys) {
          const av = a[i].attrs[k]
          const bv = b[i].attrs[k]
          const an = Number(av)
          const bn = Number(bv)
          if (av === '' || bv === '' || Number.isNaN(an) || Number.isNaN(bn)) {
            if (av !== bv) return false
          } else if (Math.abs(an - bn) > 0.001) {
            return false
          }
        }
      }
      return true
    }

    const EXCLUDED: ToolName[] = ['wand'] // G2 supersedes the locked file's pre-G2 entry.

    for (const name of TOOL_NAMES) {
      if (EXCLUDED.includes(name)) continue
      const lockedBody = locked.get(name)
      if (!lockedBody) continue // e.g. would skip a tool the locked file doesn't cover — none do today.

      it(`'${name}' glyph is shape-identical to the ground truth`, () => {
        const { container, unmount } = render(<ToolIcon name={name} />)
        const rendered = shapeOf(container.querySelector('svg')!.innerHTML)
        const expected = shapeOf(lockedBody)
        expect(shapesEqual(rendered, expected), `'${name}' diverges from tool-glyphs-locked.js`).toBe(true)
        unmount()
      })
    }
  })
})
