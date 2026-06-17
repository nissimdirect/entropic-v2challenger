import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/**
 * Regression guard for the UAT-found broken Creatrix layout.
 *
 * The `.app--creatrix` grid shell and the base `.app` grid (global.css) are both
 * single-class selectors → equal specificity (0,1,0). When the base `.app` rule
 * won the cascade by source order, the creatrix children were forced into the
 * base 2-col/4-row grid → the layout collapsed (left column floated on the base
 * `auto` row, right column wrapped, center void).
 *
 * The fix raises the creatrix grid shell to `.app.app--creatrix` (0,2,0) so it
 * reliably beats `.app` regardless of CSS bundle/source order. This test fails
 * if anyone reverts the grid shell to a single `.app--creatrix` class.
 */
const __dirname = dirname(fileURLToPath(import.meta.url))
const cssPath = resolve(__dirname, '../../renderer/styles/creatrix-layout.css')

describe('creatrix-layout.css grid-shell specificity', () => {
  const css = readFileSync(cssPath, 'utf8')

  it('defines the grid shell with the compound .app.app--creatrix selector', () => {
    // The rule that sets grid-template-columns must use the higher-specificity
    // compound selector so it beats the base `.app` grid in global.css.
    const gridRule = /\.app\.app--creatrix\s*\{[^}]*grid-template-columns\s*:/m
    expect(gridRule.test(css)).toBe(true)
  })

  it('does NOT define the grid shell with a bare single-class .app--creatrix selector', () => {
    // A line like `.app--creatrix {` immediately followed (within the block) by
    // grid-template-columns would re-introduce the specificity tie. Guard against
    // a standalone `.app--creatrix {` opening that owns grid-template-columns.
    const bareGrid = /(^|\n)\s*\.app--creatrix\s*\{[^}]*grid-template-columns\s*:/m
    expect(bareGrid.test(css)).toBe(false)
  })
})
