import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/**
 * Regression guard for the W1.6 owner walk 3 master-header-alignment bug
 * (see tests/e2e/regression/w16-master-header-alignment.spec.ts for the
 * full root-cause writeup and the real-layout geometry proof).
 *
 * `.track-header--lean` and `.track-header` are both single-class selectors
 * → equal specificity (0,1,0). Since timeline.css (which sets `.track-header
 * { align-items: center }`) loads AFTER creatrix-shell.css (which sets
 * `.track-header--lean { align-items: stretch }`), the later rule silently
 * won the cascade — every lean track-header row was being horizontally
 * CENTERED instead of left-aligned, most visibly on the Master row (owner:
 * "reading centered/floating vs the track rows").
 *
 * Fixed by raising the lean-header rule to the compound `.track-header.
 * track-header--lean` selector (0,2,0), which always matches (every lean
 * header carries both classes — UnifiedTrackHeader.tsx's rootClasses) and
 * reliably beats `.track-header` regardless of stylesheet import order.
 * Mirrors the identical fix already applied to the `.app.app--creatrix`
 * grid shell (see creatrix-layout-specificity.test.ts).
 */
const __dirname = dirname(fileURLToPath(import.meta.url))
const cssPath = resolve(__dirname, '../../renderer/styles/creatrix-shell.css')

describe('creatrix-shell.css lean-header align-items specificity', () => {
  const css = readFileSync(cssPath, 'utf8')

  it('defines the lean-header stretch override with the compound .track-header.track-header--lean selector', () => {
    const compoundRule = /\.track-header\.track-header--lean\s*\{[^}]*align-items\s*:\s*stretch/m
    expect(compoundRule.test(css)).toBe(true)
  })

  it('does NOT define align-items on a bare single-class .track-header--lean selector', () => {
    // A standalone `.track-header--lean {` block owning align-items would
    // re-introduce the specificity tie against timeline.css's `.track-header`.
    const bareRule = /(^|\n)\s*\.track-header--lean\s*\{[^}]*align-items\s*:/m
    expect(bareRule.test(css)).toBe(false)
  })
})
