/**
 * pkb-tool-rail-dims.test.ts — ui-foundation PK.B hard oracle
 *
 * Locks design-spec.md §2's rail-dims table (OD-3, LOCKED): hotkey badge
 * repositioned to the top-right corner (was bottom-right) and both the
 * intra-group and inter-group gaps routed through the §3 spacing tokens
 * (--cx-space-4 / --cx-space-8, was raw 3px/4px). CSS-text pattern per the
 * repo's precedent suite (pka-type-scale.test.ts, creatrix-layout-specificity
 * et al.) — ToolRail.tsx does not import tool-rail.css itself (App.tsx does,
 * centrally), so a component-render + getComputedStyle approach would not
 * see the real cascade in this test environment.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const STYLES = path.resolve(__dirname, '../../renderer/styles')
const read = (f: string) => fs.readFileSync(path.join(STYLES, f), 'utf8')

function block(src: string, selector: string): string {
  const i = src.indexOf(`${selector} {`)
  expect(i, `${selector} not found`).toBeGreaterThan(-1)
  return src.slice(i, src.indexOf('}', i))
}

describe('PK.B — tool-rail dims (OD-3 locked)', () => {
  const css = read('tool-rail.css')

  it('.tool-rail__hotkey moves to the top-right corner (was bottom-right)', () => {
    const b = block(css, '.tool-rail__hotkey')
    expect(b).toMatch(/top:\s*2px/)
    expect(b).toMatch(/right:\s*2px/)
    expect(b).not.toMatch(/bottom:/)
  })

  it('.tool-rail intra-rail gap routes through --cx-space-4 (was 3px)', () => {
    const b = block(css, '.tool-rail')
    expect(b).toMatch(/gap:\s*var\(--cx-space-4\)/)
  })

  it('.tool-rail__group intra-group gap routes through --cx-space-4 (was 3px)', () => {
    const b = block(css, '.tool-rail__group')
    expect(b).toMatch(/gap:\s*var\(--cx-space-4\)/)
  })

  it('.tool-rail__group + .tool-rail__group inter-group margin/padding route through --cx-space-8 (was 4px)', () => {
    const b = block(css, '.tool-rail__group + .tool-rail__group')
    expect(b).toMatch(/margin-top:\s*var\(--cx-space-8\)/)
    expect(b).toMatch(/padding-top:\s*var\(--cx-space-8\)/)
  })

  it('.tool-rail__group-label and .tool-rail__hotkey still route through --cx-text-data (PK.A, unaffected by PK.B)', () => {
    expect(block(css, '.tool-rail__group-label')).toMatch(/font-size:\s*var\(--cx-text-data\)/)
    expect(block(css, '.tool-rail__hotkey')).toMatch(/font-size:\s*var\(--cx-text-data\)/)
  })

  it('rail width and button footprint stay at the non-escalated locked values (44px / 32x30px)', () => {
    expect(block(css, '.tool-rail')).toMatch(/width:\s*44px/)
    const btn = block(css, '.tool-rail__tool')
    expect(btn).toMatch(/width:\s*32px/)
    expect(btn).toMatch(/height:\s*30px/)
  })

  it('.cx-preview-row carries no !important (flag-off regression guard — App.tsx overrides with an inline display:contents style when F_CREATRIX_LAYOUT is off, and inline style only loses to !important)', () => {
    const b = block(css, '.cx-preview-row')
    expect(b).not.toMatch(/!important/)
  })
})
