import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/**
 * Regression guard (F3 e2e red cluster, 2026-07-02).
 *
 * `.app__sidebar` used to span `grid-row: 1 / 3` (rows 1 AND 2) while
 * `.app__timeline` occupies `grid-row: 2; grid-column: 1 / -1` (row 2, full
 * width, including column 1 where the sidebar lives). Because CSS grid items
 * stretch to fill their grid area regardless of content height, the sidebar's
 * own box — solid background, `.effect-browser` inside it — always extended
 * down through row 2, geometrically overlapping `.app__timeline` in the
 * row2×col1 region. `.app__timeline` is later in DOM order (App.tsx: sidebar
 * → main → timeline → device-chain) so it painted on top and intercepted
 * pointer events meant for the sidebar, e.g. clicking `.effect-browser__item`
 * hit a `.track-header__btn` "Solo" button instead — the exact failure mode
 * across the phase-0a/watchdog, phase-1/effect-chain, and phase-1/full-journey
 * e2e specs.
 *
 * Fix: `.app__sidebar` is `grid-row: 1` only, matching `.app__main`'s row so
 * the two never share a grid cell with `.app__timeline`. This test fails if
 * `.app__sidebar` is ever re-expanded back to a multi-row span.
 */
const __dirname = dirname(fileURLToPath(import.meta.url))
const cssPath = resolve(__dirname, '../../renderer/styles/global.css')

describe('global.css .app__sidebar / .app__timeline grid-row overlap', () => {
  const css = readFileSync(cssPath, 'utf8')

  it('.app__sidebar occupies exactly row 1 (not a multi-row span)', () => {
    const singleRow = /\.app__sidebar\s*\{[^}]*grid-row\s*:\s*1\s*;/m
    expect(singleRow.test(css)).toBe(true)
  })

  it('.app__sidebar does NOT span into row 2 where .app__timeline lives', () => {
    // Catches `grid-row: 1 / 3`, `grid-row: 1 / span 2`, etc. — any span that
    // would reintroduce the row2×col1 overlap with .app__timeline.
    const multiRowSpan = /\.app__sidebar\s*\{[^}]*grid-row\s*:\s*1\s*\/[^;]+;/m
    expect(multiRowSpan.test(css)).toBe(false)
  })
})
