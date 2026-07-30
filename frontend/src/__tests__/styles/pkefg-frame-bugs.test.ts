/**
 * pkefg-frame-bugs.test.ts — ui-foundation PK.E/F/G hard oracles
 *
 * Locks the four targeted frame-bug fixes (proposal.md symptoms 1/4/6/8):
 *  E — master-bus lane label degrades to a single ellipsized line
 *  F — search-clear chip is styled (with states) and the tab bar wraps
 *      instead of clipping behind an invisible scrollbar
 *  G — preview overlay chips live in ONE pinned bar; the three transport
 *      control types share --cx-control-h
 * CSS-text pattern per the repo's precedent suite.
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

describe('PK.E — master lane label truncation', () => {
  it('label is single-line with ellipsis, never a wrapped shard', () => {
    const b = block(read('timeline.css'), '.master-track-lane__label')
    expect(b).toMatch(/white-space:\s*nowrap/)
    expect(b).toMatch(/text-overflow:\s*ellipsis/)
    expect(b).toMatch(/overflow:\s*hidden/)
    expect(b).toMatch(/max-width:\s*100%/)
  })
})

describe('PK.F — browser fixes', () => {
  it('search-clear chip has a styled rule with hover and focus-visible states', () => {
    const g = read('global.css')
    block(g, '.effect-search__clear')
    expect(g).toContain('.effect-search__clear:hover')
    expect(g).toContain('.effect-search__clear:focus-visible')
  })

  it('search input reserves right padding for the inset chip', () => {
    expect(block(read('global.css'), '.effect-search__input')).toMatch(
      /padding:\s*6px 24px 6px 8px/,
    )
  })

  it('tab bar wraps — no invisible horizontal scroll', () => {
    const b = block(read('global.css'), '.effect-browser__tabs')
    expect(b).toMatch(/flex-wrap:\s*wrap/)
    expect(b).not.toMatch(/overflow-x:\s*auto/)
  })
})

describe('PK.G — overlay bar + transport control height', () => {
  it('overlay bar exists, pinned full-width to the top edge', () => {
    const b = block(read('global.css'), '.preview-canvas__overlay-bar')
    expect(b).toMatch(/position:\s*absolute/)
    expect(b).toMatch(/right:\s*0/)
    expect(b).toMatch(/display:\s*flex/)
  })

  it('fps and pop-out chips are flex children, no longer absolutes', () => {
    const g = read('global.css')
    expect(block(g, '.preview-canvas__fps')).not.toMatch(/position:\s*absolute/)
    expect(block(g, '.preview-canvas__popout-btn')).not.toMatch(/position:\s*absolute/)
  })

  it('the three transport control types share --cx-control-h', () => {
    const g = read('global.css')
    for (const sel of [
      '.app__transport-btn',
      '.app__transport-bpm input',
      '.app__transport-select',
    ]) {
      expect(block(g, sel), `${sel} must use the shared control height`).toMatch(
        /height:\s*var\(--cx-control-h\)/,
      )
    }
  })
})
