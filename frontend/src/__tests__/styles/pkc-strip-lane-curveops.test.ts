/**
 * pkc-strip-lane-curveops.test.ts — ui-foundation PK.C hard oracle (D8
 * re-scope, 2026-07-30): automation strip is wrap-safe and carries only the
 * Mode + Record clusters; curve ops relocated to the lane's own popover.
 * CSS-text pattern per the repo's precedent suite (pkefg-frame-bugs.test.ts).
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const STYLES = path.resolve(__dirname, '../../renderer/styles')
const read = (f: string) => fs.readFileSync(path.join(STYLES, f), 'utf8')
const block = (src: string, selector: string) => {
  const i = src.indexOf(`${selector} {`)
  expect(i, `${selector} rule missing`).toBeGreaterThan(-1)
  return src.slice(i, src.indexOf('}', i))
}

describe('PK.C — automation strip is wrap-safe', () => {
  it('.auto-toolbar wraps instead of overflowing', () => {
    expect(block(read('automation.css'), '.auto-toolbar')).toMatch(/flex-wrap:\s*wrap/)
  })

  it('.auto-toolbar__record carries the horizontal-divider convention (rotated from tool-rail.css)', () => {
    const b = block(read('automation.css'), '.auto-toolbar__record')
    expect(b).toMatch(/margin-left:\s*var\(--cx-space-4\)/)
    expect(b).toMatch(/padding-left:\s*var\(--cx-space-8\)/)
    expect(b).toMatch(/border-left:\s*1px solid var\(--cx-line-1\)/)
  })

  it('__hint and __armed reflow onto flex-basis:100% so they never compete with the 8 buttons for row space', () => {
    expect(block(read('automation.css'), '.auto-toolbar__hint')).toMatch(/flex-basis:\s*100%/)
    expect(block(read('automation.css'), '.auto-toolbar__armed')).toMatch(/flex-basis:\s*100%/)
  })
})

describe('PK.C — lane Shape popover', () => {
  it('is a floating panel positioned like the established ContextMenu convention', () => {
    const b = block(read('automation.css'), '.lane-shape-popover')
    expect(b).toMatch(/position:\s*fixed/)
    expect(b).toMatch(/background:\s*var\(--cx-bg-raised\)/)
    expect(b).toMatch(/border:\s*1px solid var\(--cx-line-2\)/)
  })
})
