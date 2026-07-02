/**
 * Loop 47a (Phase G) — MarkerFlag.
 *
 * Marker right-click is wired to silent-delete (not a context menu) per the
 * Phase 13C audit. Lock that behavior + off-screen culling + click-to-seek.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import MarkerFlag from '../../renderer/components/timeline/MarkerFlag'
import type { Marker } from '../../shared/types'

afterEach(cleanup)

function makeMarker(overrides: Partial<Marker> = {}): Marker {
  return {
    id: 'm1',
    time: 1.0,
    label: 'Intro',
    color: '#4ade80',
    ...overrides,
  }
}

describe('MarkerFlag (Loop 47a)', () => {
  it('renders with left = time * zoom - scrollX', () => {
    const { container } = render(
      <MarkerFlag marker={makeMarker({ time: 2.0 })} zoom={100} scrollX={50} onSeek={vi.fn()} onDelete={vi.fn()} />,
    )
    const flag = container.querySelector('.marker-flag') as HTMLDivElement
    expect(flag).toBeTruthy()
    expect(flag.style.left).toBe('150px') // 2 * 100 - 50
  })

  it('renders nothing when scrolled off-screen (left < -10)', () => {
    const { container } = render(
      <MarkerFlag marker={makeMarker({ time: 0 })} zoom={100} scrollX={500} onSeek={vi.fn()} onDelete={vi.fn()} />,
    )
    expect(container.querySelector('.marker-flag')).toBeNull()
  })

  it('left-click fires onSeek with marker.time', () => {
    const onSeek = vi.fn()
    const { container } = render(
      <MarkerFlag marker={makeMarker({ time: 3.5 })} zoom={100} scrollX={0} onSeek={onSeek} onDelete={vi.fn()} />,
    )
    fireEvent.click(container.querySelector('.marker-flag')!)
    expect(onSeek).toHaveBeenCalledWith(3.5)
  })

  it('right-click silently deletes (no context menu) per Phase 13C convention', () => {
    const onDelete = vi.fn()
    const { container } = render(
      <MarkerFlag marker={makeMarker({ id: 'm-target' })} zoom={100} scrollX={0} onSeek={vi.fn()} onDelete={onDelete} />,
    )
    fireEvent.contextMenu(container.querySelector('.marker-flag')!)
    expect(onDelete).toHaveBeenCalledWith('m-target')
  })

  it('label sits on the title attribute (tooltip on hover)', () => {
    const { container } = render(
      <MarkerFlag marker={makeMarker({ label: 'Drop' })} zoom={100} scrollX={0} onSeek={vi.fn()} onDelete={vi.fn()} />,
    )
    const flag = container.querySelector('.marker-flag') as HTMLDivElement
    expect(flag.title).toBe('Drop')
  })

  it('color drives both head border + line background', () => {
    const { container } = render(
      <MarkerFlag marker={makeMarker({ color: '#ff00ff' })} zoom={100} scrollX={0} onSeek={vi.fn()} onDelete={vi.fn()} />,
    )
    const head = container.querySelector('.marker-flag__head') as HTMLDivElement
    const line = container.querySelector('.marker-flag__line') as HTMLDivElement
    // jsdom normalizes #ff00ff to rgb(255, 0, 255)
    expect(head.style.borderBottomColor).toMatch(/(#ff00ff|rgb\(255, 0, 255\))/i)
    expect(line.style.backgroundColor).toMatch(/(#ff00ff|rgb\(255, 0, 255\))/i)
  })
})
