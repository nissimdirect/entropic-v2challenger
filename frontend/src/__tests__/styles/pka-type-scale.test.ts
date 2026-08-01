/**
 * pka-type-scale.test.ts — ui-foundation PK.A hard oracle
 *
 * Locks the RATIFIED D6 "Scale B+1" type system (docs/frontend/
 * RATIFIED-FOUNDATIONS.md, user-ratified 2026-07-29): tokens.css declares
 * the four tiers at exactly the ratified values, and the 8 diagnosed
 * surfaces' typography routes through tokens — no raw px on the lines
 * PK.A tokenized. CSS-text pattern per the repo's precedent suite
 * (creatrix-layout-specificity et al.).
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const STYLES = path.resolve(__dirname, '../../renderer/styles')
const read = (f: string) => fs.readFileSync(path.join(STYLES, f), 'utf8')

describe('PK.A — Scale B+1 tokens', () => {
  it('tokens.css declares the four ratified tiers at exact B+1 values', () => {
    const tokens = read('tokens.css')
    expect(tokens).toMatch(/--cx-text-heading:\s*16px/)
    expect(tokens).toMatch(/--cx-text-body:\s*14px/)
    expect(tokens).toMatch(/--cx-text-label:\s*13px/)
    expect(tokens).toMatch(/--cx-text-data:\s*12px/)
    expect(tokens).toMatch(/--cx-weight-heading:\s*650/)
    expect(tokens).toMatch(/--cx-weight-label:\s*600/)
    expect(tokens).toMatch(/--cx-weight-body:\s*450/)
    expect(tokens).toMatch(/--cx-weight-data:\s*450/)
    expect(tokens).toMatch(/--cx-control-h:\s*22px/)
  })

  const tokenized: Array<[string, string]> = [
    ['tool-rail.css', '.tool-rail__group-label'],
    ['tool-rail.css', '.tool-rail__hotkey'],
    ['tool-rail.css', '.tool-rail__fallback-label'],
    ['automation.css', '.auto-toolbar__btn'],
    ['automation.css', '.auto-toolbar__hint'],
    ['automation.css', '.track-header__badge'],
    ['timeline.css', '.master-track-lane__label'],
    ['global.css', '.app__transport-btn'],
    // PK.C1 (W1.5b, C2 mock ruling): .auto-toolbar__mode-btn moved out of
    // AutomationToolbar into the transport bar as .app__transport-automation-btn;
    // .app__transport-timecode moved out of the transport bar to
    // .app__preview-timecode under the preview window. Both new selectors
    // still route through --cx-text-label (same tier the originals used).
    ['global.css', '.app__transport-automation-btn'],
    ['global.css', '.app__preview-timecode'],
    ['global.css', '.app__transport-select'],
    ['global.css', '.effect-browser__tab'],
    ['global.css', '.preview-canvas__placeholder'],
    ['device-chain.css', '.device-chain__empty'],
  ]

  it.each(tokenized)('%s %s uses a --cx-text token, not raw px', (file, selector) => {
    const src = read(file)
    const i = src.indexOf(`${selector} {`)
    expect(i, `${selector} not found in ${file}`).toBeGreaterThan(-1)
    const block = src.slice(i, src.indexOf('}', i))
    const fontSize = /font-size:\s*([^;]+);/.exec(block)?.[1] ?? ''
    expect(
      fontSize,
      `${selector} font-size must route through a --cx-text-* token (PK.A). ` +
        'Raw px on a PK.A-tokenized line is a regression.',
    ).toMatch(/var\(--cx-text-/)
  })
})
