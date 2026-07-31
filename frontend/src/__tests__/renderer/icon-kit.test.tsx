import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import Icon, { CloseButton, MaskCountBadge, type KitIconName } from '../../renderer/assets/icon-kit'

const ALL_ICON_NAMES: KitIconName[] = [
  'x', 'plus',
  'chevron-right', 'chevron-down', 'chevron-up', 'chevron-left',
  'arrow-up', 'corner-up-left', 'external-link',
  'link', 'unlink',
  'lock', 'unlock',
  'eye', 'eye-off',
  'volume-1', 'volume-2', 'volume-x',
  'settings', 'triangle-alert', 'flask-conical', 'flag',
  'star', 'trash-2', 'circle', 'snowflake',
  'magnet',
]

describe('icon-kit (PK.H2 — manifest v4.1; W1-3 adds magnet)', () => {
  it('has exactly 27 icon names, all unique', () => {
    expect(ALL_ICON_NAMES.length).toBe(27)
    expect(new Set(ALL_ICON_NAMES).size).toBe(27)
  })

  it('renders every icon name without error, each producing an <svg> with a non-empty body', () => {
    for (const name of ALL_ICON_NAMES) {
      const { container, unmount } = render(<Icon name={name} />)
      const svg = container.querySelector('svg')
      expect(svg).toBeTruthy()
      expect(svg!.children.length).toBeGreaterThan(0)
      unmount()
    }
  })

  it('renders on the 24x24 / stroke-2 / currentColor grid (GLYPH GUIDELINES v1 rule 4)', () => {
    for (const name of ALL_ICON_NAMES) {
      const { container, unmount } = render(<Icon name={name} />)
      const svg = container.querySelector('svg')
      expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24')
      expect(svg?.getAttribute('stroke-width')).toBe('2')
      expect(svg?.getAttribute('stroke')).toBe('currentColor')
      unmount()
    }
  })

  it('fill-pair icons (star, circle, snowflake) render a visibly filled shape only when filled=true', () => {
    for (const name of ['star', 'circle', 'snowflake'] as const) {
      const unfilled = render(<Icon name={name} />)
      expect(unfilled.container.querySelector('[fill="currentColor"]')).toBeNull()
      unfilled.unmount()

      const filled = render(<Icon name={name} filled />)
      expect(filled.container.querySelector('[fill="currentColor"]')).toBeTruthy()
      filled.unmount()
    }
  })

  it('vendored Lucide path data carries the ISC license comment', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../renderer/assets/icon-kit.tsx'),
      'utf-8',
    )
    expect(src).toMatch(/ISC License/)
    expect(src).toMatch(/lucide-static/)
    expect(src).not.toMatch(/from ['"]lucide-react['"]/) // vendored, never an npm dependency
  })

  it('CloseButton renders the shared x icon with the expected aria/testid contract', () => {
    const { getByTestId, unmount } = render(
      <CloseButton onClick={() => {}} ariaLabel="Close thing" testId="my-close" />,
    )
    const btn = getByTestId('my-close')
    expect(btn.tagName).toBe('BUTTON')
    expect(btn.getAttribute('aria-label')).toBe('Close thing')
    expect(btn.querySelector('svg')).toBeTruthy()
    unmount()
  })

  it('MaskCountBadge renders the custom glyph + the count as text', () => {
    const { container, unmount } = render(<MaskCountBadge count={3} testId="badge" />)
    const badge = container.querySelector('[data-testid="badge"]')
    expect(badge?.querySelector('svg')).toBeTruthy()
    expect(badge?.textContent).toContain('3')
    unmount()
  })
})

/**
 * ONE-CLOSE-GLYPH TEST (PK.H2 hard oracle): every true dialog/panel close
 * button in this sweep's file set renders the shared <CloseButton />
 * component — never a standalone x/×/✕ button. Source-grep, matching the
 * existing repo convention for glyph-ground-truth assertions (see
 * tool-icons.test.tsx's use of fs.readFileSync against tool-icons.tsx and
 * the locked-glyph reference file).
 */
describe('one-close-glyph — dialog/panel closes render the shared CloseButton', () => {
  const CLOSE_CONSUMERS = [
    'App.tsx',
    'components/operators/B9EdgeInspector.tsx',
    'components/layout/UpdateBanner.tsx',
    'components/demos/DemosDrawer.tsx',
    'components/routing-canvas/RoutingCanvas.tsx',
    'components/performance/PadEditor.tsx',
  ]

  for (const rel of CLOSE_CONSUMERS) {
    it(`${rel} imports and uses <CloseButton /> for its dialog/panel close`, () => {
      const filePath = path.join(__dirname, '../../renderer', rel)
      const src = fs.readFileSync(filePath, 'utf-8')
      expect(src).toMatch(/CloseButton/)
      expect(src).toMatch(/<CloseButton\b/)
    })
  }
})

/**
 * PERMANENT NO-EMOJI GUARD (PK.H2 hard oracle): zero emoji/pictograph glyphs
 * remain anywhere under src/renderer (excluding this __tests__ tree). Scans
 * the true emoji/pictograph Unicode blocks; the handful of macOS keyboard
 * keycap symbols (⌘ ⌃ ⌥ ⏎ ⌫ ⌦) are an explicit, separate, still-current
 * convention (pretty-shortcut.ts is their canonical source) and are
 * allow-listed rather than flagged. Comment-only lines are skipped — this
 * guards rendered UI, not code-comment prose.
 */
describe('permanent guard — no raw emoji/pictograph glyphs in renderer source', () => {
  const EMOJI_RANGES: Array<[number, number]> = [
    [0x1f300, 0x1faff],
    [0x2600, 0x26ff],
    [0x2700, 0x27bf],
    [0x2300, 0x23ff], // misc technical — also where the allow-listed keycap symbols live
    [0x2b00, 0x2bff],
  ]
  const ALLOWED_KEYCAP_SYMBOLS = new Set(['⌘', '⌃', '⌥', '⏎', '⌫', '⌦'])

  function isForbiddenEmoji(codePoint: number, char: string): boolean {
    if (ALLOWED_KEYCAP_SYMBOLS.has(char)) return false
    return EMOJI_RANGES.some(([lo, hi]) => codePoint >= lo && codePoint <= hi)
  }

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '__tests__') continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full, out)
      } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) {
        out.push(full)
      }
    }
    return out
  }

  it('renderer source contains no forbidden emoji/pictograph characters outside comments', () => {
    const rendererRoot = path.join(__dirname, '../../renderer')
    const files = walk(rendererRoot)
    expect(files.length).toBeGreaterThan(50) // sanity: the walk actually found the tree

    const violations: string[] = []
    for (const file of files) {
      const lines = fs.readFileSync(file, 'utf-8').split('\n')
      lines.forEach((line, idx) => {
        const trimmed = line.trim()
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return
        for (const char of Array.from(line)) {
          const cp = char.codePointAt(0)
          if (cp !== undefined && isForbiddenEmoji(cp, char)) {
            violations.push(`${path.relative(rendererRoot, file)}:${idx + 1} -> "${char}" (U+${cp.toString(16).toUpperCase()})`)
          }
        }
      })
    }

    expect(violations).toEqual([])
  })
})
