/**
 * Loop 47a (Phase G) — MarkerFlag.
 *
 * Marker right-click is wired to silent-delete (not a context menu) per the
 * Phase 13C audit. Lock that behavior + off-screen culling + click-to-seek.
 *
 * T4: double-click opens an inline rename editor (Enter commits, Escape /
 * blur behavior). Sanitization/clamp lives in the store, so these tests only
 * assert the editor lifecycle + that the raw text is forwarded to onRename.
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

const noopProps = {
  onSeek: vi.fn(),
  onDelete: vi.fn(),
  onRename: vi.fn(),
}

describe('MarkerFlag (Loop 47a)', () => {
  it('renders with left = time * zoom - scrollX', () => {
    const { container } = render(
      <MarkerFlag marker={makeMarker({ time: 2.0 })} zoom={100} scrollX={50} {...noopProps} />,
    )
    const flag = container.querySelector('.marker-flag') as HTMLDivElement
    expect(flag).toBeTruthy()
    expect(flag.style.left).toBe('150px') // 2 * 100 - 50
  })

  it('renders nothing when scrolled off-screen (left < -10)', () => {
    const { container } = render(
      <MarkerFlag marker={makeMarker({ time: 0 })} zoom={100} scrollX={500} {...noopProps} />,
    )
    expect(container.querySelector('.marker-flag')).toBeNull()
  })

  it('left-click fires onSeek with marker.time', () => {
    const onSeek = vi.fn()
    const { container } = render(
      <MarkerFlag marker={makeMarker({ time: 3.5 })} zoom={100} scrollX={0} {...noopProps} onSeek={onSeek} />,
    )
    fireEvent.click(container.querySelector('.marker-flag')!)
    expect(onSeek).toHaveBeenCalledWith(3.5)
  })

  it('right-click silently deletes (no context menu) per Phase 13C convention', () => {
    const onDelete = vi.fn()
    const { container } = render(
      <MarkerFlag marker={makeMarker({ id: 'm-target' })} zoom={100} scrollX={0} {...noopProps} onDelete={onDelete} />,
    )
    fireEvent.contextMenu(container.querySelector('.marker-flag')!)
    expect(onDelete).toHaveBeenCalledWith('m-target')
  })

  it('label sits on the title attribute (tooltip on hover)', () => {
    const { container } = render(
      <MarkerFlag marker={makeMarker({ label: 'Drop' })} zoom={100} scrollX={0} {...noopProps} />,
    )
    const flag = container.querySelector('.marker-flag') as HTMLDivElement
    expect(flag.title).toBe('Drop')
  })

  it('color drives both head border + line background', () => {
    const { container } = render(
      <MarkerFlag marker={makeMarker({ color: '#ff00ff' })} zoom={100} scrollX={0} {...noopProps} />,
    )
    const head = container.querySelector('.marker-flag__head') as HTMLDivElement
    const line = container.querySelector('.marker-flag__line') as HTMLDivElement
    // jsdom normalizes #ff00ff to rgb(255, 0, 255)
    expect(head.style.borderBottomColor).toMatch(/(#ff00ff|rgb\(255, 0, 255\))/i)
    expect(line.style.backgroundColor).toMatch(/(#ff00ff|rgb\(255, 0, 255\))/i)
  })
})

describe('MarkerFlag rename (T4)', () => {
  it('no editor is shown by default', () => {
    const { container } = render(
      <MarkerFlag marker={makeMarker()} zoom={100} scrollX={0} {...noopProps} />,
    )
    expect(container.querySelector('.marker-flag__rename-input')).toBeNull()
  })

  it('double-click opens the inline editor seeded with the current label', () => {
    const { container } = render(
      <MarkerFlag marker={makeMarker({ label: 'Verse' })} zoom={100} scrollX={0} {...noopProps} />,
    )
    fireEvent.doubleClick(container.querySelector('.marker-flag')!)
    const input = container.querySelector('.marker-flag__rename-input') as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.value).toBe('Verse')
  })

  it('double-click does NOT trigger onSeek (edit takes over the interaction)', () => {
    const onSeek = vi.fn()
    const { container } = render(
      <MarkerFlag marker={makeMarker()} zoom={100} scrollX={0} {...noopProps} onSeek={onSeek} />,
    )
    fireEvent.doubleClick(container.querySelector('.marker-flag')!)
    // Clicking the input must not bubble to the flag's seek handler.
    fireEvent.click(container.querySelector('.marker-flag__rename-input')!)
    expect(onSeek).not.toHaveBeenCalled()
  })

  it('Enter commits the edited text via onRename', () => {
    const onRename = vi.fn()
    const { container } = render(
      <MarkerFlag marker={makeMarker({ id: 'mk' })} zoom={100} scrollX={0} {...noopProps} onRename={onRename} />,
    )
    fireEvent.doubleClick(container.querySelector('.marker-flag')!)
    const input = container.querySelector('.marker-flag__rename-input') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Chorus' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRename).toHaveBeenCalledWith('mk', 'Chorus')
    // Editor closes after commit.
    expect(container.querySelector('.marker-flag__rename-input')).toBeNull()
  })

  it('Escape cancels without calling onRename and closes the editor', () => {
    const onRename = vi.fn()
    const { container } = render(
      <MarkerFlag marker={makeMarker({ label: 'Orig' })} zoom={100} scrollX={0} {...noopProps} onRename={onRename} />,
    )
    fireEvent.doubleClick(container.querySelector('.marker-flag')!)
    const input = container.querySelector('.marker-flag__rename-input') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Discarded' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onRename).not.toHaveBeenCalled()
    expect(container.querySelector('.marker-flag__rename-input')).toBeNull()
  })

  it('blur commits the edited text (forwarded to the store)', () => {
    const onRename = vi.fn()
    const { container } = render(
      <MarkerFlag marker={makeMarker({ id: 'mk' })} zoom={100} scrollX={0} {...noopProps} onRename={onRename} />,
    )
    fireEvent.doubleClick(container.querySelector('.marker-flag')!)
    const input = container.querySelector('.marker-flag__rename-input') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Bridge' } })
    fireEvent.blur(input)
    expect(onRename).toHaveBeenCalledWith('mk', 'Bridge')
  })
})
