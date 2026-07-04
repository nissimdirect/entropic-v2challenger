/**
 * UAT #424 (E-1/E-2, LIVE-M1) — B3 left-column overlap + track-header
 * clipped automation controls (CSS-source assertions).
 *
 * (a) `.app--creatrix .cx-left-col` was `display: grid` with only 2 explicit
 * row tracks (`1fr` + `var(--cx-inspector-h, 150px)`) for what is actually
 * 5-9 DOM children in App.tsx (conditional upload/error/asset-info banners,
 * TransformPanel, LayerPanel, sidebar-tabs, effect-browser, the inspector
 * resize handle, Inspector) — none carried an explicit grid-row. Grid
 * auto-placement assigned each child to the next row line in DOM order, so
 * whichever child landed on row 2 (nominally the Inspector's 150px slot) had
 * ITS OWN box clamped to 150px, but its content (no overflow:hidden of its
 * own) kept its natural height and painted straight through the clamped box
 * onto the following siblings — reproduced with a geometry harness
 * (Playwright boundingClientRect against the real CSS) showing LayerPanel's
 * content bleeding ~180px past the sidebar tabs into the Instruments browser
 * and directly over a "Wavetable" rack row.
 *
 * Fix: switch `.cx-left-col` to flex-column (matches the legacy
 * `.app__sidebar` behavior in global.css) so children stack in natural
 * document order with no placement guesswork; `.effect-browser` (already
 * flex:1 + min-height:0 in global.css) absorbs/yields leftover space, and
 * `.cx-inspector` gets an explicit flex-basis instead of relying on a grid
 * row.
 *
 * (b) `.timeline__headers` is a fixed 180px column shared with the legacy
 * (non-lean) header. The lean row's non-shrinking button cluster needs more
 * room than that even with the track name collapsed to 0 — and separately,
 * `.track-header--lean` never reset `align-items` for its own column-flex
 * axis, so it inherited `align-items: center` from `.track-header` in
 * timeline.css (loaded AFTER b3-layout.css, same 0,1,0 specificity — later
 * wins for any property the earlier rule doesn't also set). In a
 * flex-direction:column container, align-items controls the CROSS
 * (horizontal) axis, so the lean row rendered centered at its own natural
 * width instead of stretched — `.track-header__info--lean`'s flex:1/
 * min-width:0 never got a chance to shrink, and the row overflowed both
 * edges regardless of column width. Confirmed via the same geometry harness:
 * the arm-R and lock buttons' right edges landed past the header column's
 * right edge until both the width and the align-items fix were applied.
 *
 * Follows this repo's established static-CSS-source convention for grid/
 * layout regression guards — see `device-chain-bounds.test.ts` and
 * `creatrix-layout-specificity.test.ts` in this same directory. happy-dom
 * does not reliably compute cascaded grid/flex values from stylesheets that
 * aren't injected at render time, so these assertions read the CSS source
 * directly.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const creatrixCssPath = resolve(__dirname, '../../renderer/styles/creatrix-layout.css')
const b3CssPath = resolve(__dirname, '../../renderer/styles/b3-layout.css')

/** Extract the first `{ ... }` block body following `selector {`. */
function ruleBody(css: string, selectorRegex: RegExp): string | null {
  const m = selectorRegex.exec(css)
  if (!m) return null
  const openBrace = css.indexOf('{', m.index)
  if (openBrace === -1) return null
  const closeBrace = css.indexOf('}', openBrace)
  if (closeBrace === -1) return null
  // Strip /* ... */ comments: only real declarations count, otherwise an
  // explanatory comment mentioning the old value trips the negative asserts.
  return css.slice(openBrace + 1, closeBrace).replace(/\/\*[\s\S]*?\*\//g, '')
}

describe('creatrix-layout.css .cx-left-col — flex-column, not grid auto-placement (UAT #424 E-1/E-2)', () => {
  const css = readFileSync(creatrixCssPath, 'utf8')
  const body = ruleBody(css, /\.app--creatrix\s+\.cx-left-col\s*\{/m)

  it('rule exists', () => {
    expect(body).not.toBeNull()
  })

  it('is display: flex (NOT grid — grid auto-placement caused the overlap)', () => {
    expect(body).toMatch(/display\s*:\s*flex\s*;/)
    expect(body).not.toMatch(/display\s*:\s*grid\s*;/)
  })

  it('is flex-direction: column so the arbitrary child count stacks naturally', () => {
    expect(body).toMatch(/flex-direction\s*:\s*column\s*;/)
  })

  it('does NOT rely on grid-template-rows for its own children (that was the root cause)', () => {
    expect(body).not.toMatch(/grid-template-rows\s*:/)
  })
})

describe('creatrix-layout.css .cx-inspector — explicit flex-basis (UAT #424 E-1/E-2)', () => {
  const css = readFileSync(creatrixCssPath, 'utf8')
  const body = ruleBody(css, /\.app--creatrix\s+\.cx-inspector\s*\{/m)

  it('rule exists', () => {
    expect(body).not.toBeNull()
  })

  it('pins its height via flex: 0 0 var(--cx-inspector-h, ...) now that the parent is flex, not grid', () => {
    expect(body).toMatch(/flex\s*:\s*0\s+0\s+var\(--cx-inspector-h/)
  })
})

describe('b3-layout.css .track-header--lean — stretch cross-axis (UAT #424 LIVE-M1)', () => {
  const css = readFileSync(b3CssPath, 'utf8')
  const body = ruleBody(css, /\.track-header--lean\s*\{/m)

  it('rule exists', () => {
    expect(body).not.toBeNull()
  })

  it('explicitly sets align-items: stretch (guards against inheriting .track-header\'s align-items: center from timeline.css)', () => {
    expect(body).toMatch(/align-items\s*:\s*stretch\s*;/)
  })
})

describe('b3-layout.css .app--creatrix .timeline__headers — widened for the lean button cluster (UAT #424 LIVE-M1)', () => {
  const css = readFileSync(b3CssPath, 'utf8')
  const body = ruleBody(css, /\.app--creatrix\s+\.timeline__headers\s*\{/m)

  it('rule exists', () => {
    expect(body).not.toBeNull()
  })

  it('widens the column past the base 180px so twirl+eye+color+bchip+M/S/R/lock all fit', () => {
    const match = /width\s*:\s*(\d+)px\s*;/.exec(body ?? '')
    expect(match).not.toBeNull()
    const width = match ? parseInt(match[1], 10) : 0
    // Measured minimum via the geometry harness (frontend/scratch-oracle/,
    // not committed) was ~254px with the name collapsed to 0 width.
    expect(width).toBeGreaterThanOrEqual(254)
  })
})
