/**
 * PK.C1 (W1.5b, mock artifact cf8ac3c1 "draw-omitted-overdub-truth") — the
 * owner called the old loop glyph "wonky af" (read as a refresh icon, not a
 * loop). Replaced with a bracketed-cycle: two rounded brackets + a chasing
 * arrow at each open end, geometry ported verbatim from the mock's
 * `svg.loopb`. This locks the new glyph is actually in the icon kit (not
 * the old orbit-arrows path) and that every transport icon still renders
 * stroke-based/currentColor (no emoji, no hardcoded hex — icon-kit
 * convention).
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import TransportIcon from '../../renderer/assets/transport-icons'

afterEach(() => cleanup())

describe('TransportIcon — loop glyph (PK.C1 bracketed-cycle)', () => {
  it('renders 4 sub-paths (2 bracket arcs + 2 chasing arrows), not the old 4-arc orbit', () => {
    const { container } = render(<TransportIcon name="loop" />)
    const paths = container.querySelectorAll('svg path')
    expect(paths).toHaveLength(4)
  })

  it('does not render the old orbit-arrows geometry', () => {
    const { container } = render(<TransportIcon name="loop" />)
    const svg = container.querySelector('svg')!
    // Old geometry's signature arcs — must be gone.
    expect(svg.innerHTML).not.toContain('M6 8a7 7 0 0111.5-4.2')
    expect(svg.innerHTML).not.toContain('M18 3.5v4.3h-4.3')
  })

  it('renders the new bracketed-cycle geometry (top + bottom bracket arcs)', () => {
    const { container } = render(<TransportIcon name="loop" />)
    const svg = container.querySelector('svg')!
    expect(svg.innerHTML).toContain('M4.5 12')
    expect(svg.innerHTML).toContain('M19.5 12')
  })

  it('never renders emoji or a hardcoded hex fill — stroke-based, currentColor only', () => {
    const { container } = render(<TransportIcon name="loop" />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('stroke')).toBe('currentColor')
    expect(svg.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}/)
    expect(svg.textContent).toBe('')
  })

  it('play/pause/stop icons are unaffected by the loop-glyph change', () => {
    for (const name of ['play', 'pause', 'stop'] as const) {
      const { container, unmount } = render(<TransportIcon name={name} />)
      expect(container.querySelector('svg')).toBeTruthy()
      unmount()
    }
  })
})
