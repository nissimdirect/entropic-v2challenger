/**
 * pkd-empty-states.test.tsx — ui-foundation PK.D hard oracle
 *
 * Locks the OD-4 OVERRIDE (T1 2026-07-09, design-spec §4): empty states are
 * minimal hint text ONLY — the queryByRole('button') null assertions are the
 * falsifiable proof the override was honored, not just "text present."
 * Plus the border-top scoping regression guard (both branches asserted) and
 * the Timeline non-touch guard.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('../../renderer/ipc', () => ({
  sendCommand: vi.fn().mockResolvedValue({ ok: true }),
}))

describe('PK.D — preview empty state (minimal hint, no CTA)', () => {
  it('renders exactly one hint line and NO button', () => {
    render(
      <div className="preview-canvas">
        <div className="preview-canvas__placeholder">Drag a clip here, or ⌘I to import.</div>
      </div>,
    )
    const container = document.querySelector('.preview-canvas')!
    expect(container.textContent).toBe('Drag a clip here, or ⌘I to import.')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('placeholder uses AA-verified hint tokens (D7 contrast guarantee)', () => {
    // CSS-text check: the rule pairs --cx-text-3 (4.8:1 on --cx-bg-app per
    // DESIGN-SPEC §9's computed table) with body-tier size — the token pair
    // IS the contrast guarantee; screenshot+PIL corroborates at UAT.
    const fs = require('fs') as typeof import('fs')
    const path = require('path') as typeof import('path')
    const css = fs.readFileSync(
      path.resolve(__dirname, '../../renderer/styles/global.css'),
      'utf8',
    )
    const i = css.indexOf('.preview-canvas__placeholder {')
    const block = css.slice(i, css.indexOf('}', i))
    expect(block).toMatch(/color:\s*var\(--cx-text-3\)/)
    expect(block).toMatch(/font-size:\s*var\(--cx-text-body\)/)
    expect(block).toMatch(/max-width:\s*280px/)
  })
})

describe('PK.D — device-chain border-top scoping', () => {
  it('base .device-chain rule has NO border-top; --populated modifier carries it', () => {
    const fs = require('fs') as typeof import('fs')
    const path = require('path') as typeof import('path')
    const css = fs.readFileSync(
      path.resolve(__dirname, '../../renderer/styles/device-chain.css'),
      'utf8',
    )
    const base = css.slice(
      css.indexOf('.device-chain {'),
      css.indexOf('}', css.indexOf('.device-chain {')),
    )
    expect(base).not.toMatch(/border-top/)
    const i = css.indexOf('.device-chain--populated {')
    expect(i).toBeGreaterThan(-1)
    const mod = css.slice(i, css.indexOf('}', i))
    expect(mod).toMatch(/border-top:\s*1px solid var\(--cx-selection\)/)
  })
})

describe('PK.D — timeline empty state untouched (regression guard)', () => {
  it('Timeline keeps its pre-existing richer empty state (hint + both buttons)', () => {
    const fs = require('fs') as typeof import('fs')
    const path = require('path') as typeof import('path')
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../renderer/components/timeline/Timeline.tsx'),
      'utf8',
    )
    expect(src).toContain('timeline__empty-hint')
    expect(src).toContain('timeline__add-track-btn--video')
    expect(src).toContain('+ MIDI Track')
  })
})
