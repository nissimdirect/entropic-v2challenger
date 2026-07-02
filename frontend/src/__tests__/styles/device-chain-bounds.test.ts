/**
 * UAT P4 — layout cramping regression guard (CSS-source assertions).
 *
 * A tall instrument device editor (RackDevice's pad grid + per-pad editor,
 * which reuses `.sampler-device` — no height cap of its own, instruments.css)
 * plus a selected clip's MaskStackPanel could grow `.app__device-chain`
 * (App.tsx:3756) without limit:
 *   - Base grid (flag off): row 3 is `auto` (global.css:24) → an over-tall
 *     device-chain squeezed the `1fr` preview row (row 1) toward zero height.
 *   - Creatrix flag path: the fixed-height region had `overflow: hidden` →
 *     the tail of the editor was silently clipped instead of reachable.
 *
 * Fix: bound `.app__device-chain` with `max-height` + `overflow-y: auto` in
 * global.css (wrapper/overflow approach — NOT touching `.app`'s
 * `grid-template-rows`, per MEMORY `feedback_test-layout-changes`), and swap
 * `overflow: hidden` -> `overflow-y: auto` on the Creatrix flag-path rule in
 * creatrix-layout.css so the region scrolls internally.
 *
 * Follows this repo's established static-CSS-source convention for grid/
 * layout regression guards — see `app-sidebar-timeline-overlap.test.ts` and
 * `creatrix-layout-specificity.test.ts` in this same directory. happy-dom
 * does not reliably compute cascaded grid/overflow values from stylesheets
 * that aren't injected at render time, so these assertions read the CSS
 * source directly rather than relying on `getComputedStyle` in a rendered
 * test (the render-level companion test lives at
 * `../components/device-chain-region-bounds.test.tsx` and asserts DOM
 * structure/class only).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const globalCssPath = resolve(__dirname, '../../renderer/styles/global.css')
const creatrixCssPath = resolve(__dirname, '../../renderer/styles/creatrix-layout.css')

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

describe('global.css .app__device-chain — base grid bounding (UAT P4)', () => {
  const css = readFileSync(globalCssPath, 'utf8')
  const body = ruleBody(css, /\.app__device-chain\s*\{/m)

  it('rule exists', () => {
    expect(body).not.toBeNull()
  })

  it('sets a max-height so row 3 (auto) cannot grow unbounded', () => {
    expect(body).toMatch(/max-height\s*:/)
  })

  it('sets overflow-y: auto (scrolls internally instead of clipping/pushing)', () => {
    expect(body).toMatch(/overflow-y\s*:\s*auto\s*;/)
  })

  it('does NOT resort to overflow: hidden (that would silently clip content, not fix the squeeze)', () => {
    expect(body).not.toMatch(/overflow\s*:\s*hidden/)
  })

  it('the root .app grid-template-rows is untouched — fix uses the wrapper/overflow approach, not a root-grid edit', () => {
    // MEMORY feedback_test-layout-changes: never modify grid-template-rows on
    // the root .app layout. Guard the known-good baseline value.
    const appRule = /\.app\s*\{[^}]*grid-template-rows\s*:\s*1fr\s+auto\s+auto\s+var\(--statusbar-height\)\s*;/m
    expect(appRule.test(css)).toBe(true)
  })
})

describe('creatrix-layout.css .app__device-chain flag path — scrolls instead of clipping (UAT P4)', () => {
  const css = readFileSync(creatrixCssPath, 'utf8')
  const body = ruleBody(css, /\.app--creatrix\s+\.cx-right-col\s+\.app__device-chain\s*\{/m)

  it('rule exists', () => {
    expect(body).not.toBeNull()
  })

  it('keeps the fixed resizable height (flex-shrink:0 + height var) untouched', () => {
    expect(body).toMatch(/flex-shrink\s*:\s*0\s*;/)
    expect(body).toMatch(/height\s*:\s*var\(--cx-device-chain-h/)
  })

  it('sets overflow-y: auto (was overflow: hidden, which clipped the tail of a tall editor)', () => {
    expect(body).toMatch(/overflow-y\s*:\s*auto\s*;/)
  })

  it('does NOT still declare bare overflow: hidden on this rule', () => {
    expect(body).not.toMatch(/overflow\s*:\s*hidden/)
  })
})
