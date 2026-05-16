/**
 * TextOverlay tests.
 * Phase D residual (text clip creation sequence) — synthesis Iter 29 listed
 * Phase D as STILL pending. Existing coverage: text-tracks (store CRUD),
 * text-persistence (roundtrip). MISSING: TextOverlay component (preview-canvas
 * draggable + double-click-to-edit).
 *
 * What this covers (vitest layer):
 *   - Idle render shows preview text with font/color/alignment styling
 *   - Empty text renders the "Double-click to edit" placeholder
 *   - Double-click enters edit mode (contentEditable visible)
 *   - Enter key commits and exits edit mode → onUpdateText fires with new text
 *   - Escape commits as well
 *   - Blur commits
 *   - Commit only fires onUpdateText when the text actually changed (dedup)
 *   - Position math: % of canvas
 *   - Alignment transform: center → translateX(-50%), right → -100%
 *   - mousedown adds dragging class
 *
 * What stays at the Playwright layer:
 *   - Real mousemove drag → onUpdatePosition flow (window event listeners)
 *   - Cross-canvas-resolution coordinate accuracy
 *   - contentEditable Selection/Range cursor placement after entering edit
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'

import TextOverlay from '../../renderer/components/text/TextOverlay'
import type { TextClipConfig } from '../../shared/types'

function makeConfig(overrides: Partial<TextClipConfig> = {}): TextClipConfig {
  return {
    text: 'Hello',
    fontFamily: 'monospace',
    fontSize: 48,
    color: '#ffffff',
    position: [960, 540],
    alignment: 'left',
    opacity: 1,
    strokeWidth: 0,
    strokeColor: '#000000',
    shadowOffset: [0, 0],
    shadowColor: '#000000',
    animation: 'none',
    animationDuration: 1.0,
    ...overrides,
  } as TextClipConfig
}

afterEach(() => {
  cleanup()
})

describe('TextOverlay — idle render', () => {
  it('renders preview text with configured fontSize × 0.3 + color', () => {
    const { container } = render(
      <TextOverlay
        config={makeConfig({ text: 'Hi', fontSize: 60, color: '#ff00ff' })}
        canvasWidth={1920}
        canvasHeight={1080}
        onUpdatePosition={vi.fn()}
        onUpdateText={vi.fn()}
      />,
    )
    const preview = container.querySelector('.text-overlay__preview') as HTMLElement
    expect(preview).toBeTruthy()
    expect(preview.textContent).toBe('Hi')
    // 60 * 0.3 = 18 (above the 10px floor)
    expect(preview.style.fontSize).toBe('18px')
    // jsdom normalizes color to rgb
    expect(preview.style.color).toMatch(/#ff00ff|rgb\(255,\s*0,\s*255\)/i)
  })

  it('shows placeholder when text is empty', () => {
    const { getByText } = render(
      <TextOverlay
        config={makeConfig({ text: '' })}
        canvasWidth={1920}
        canvasHeight={1080}
        onUpdatePosition={vi.fn()}
        onUpdateText={vi.fn()}
      />,
    )
    expect(getByText('Double-click to edit')).toBeTruthy()
  })

  it('enforces minimum preview fontSize of 10px', () => {
    const { container } = render(
      <TextOverlay
        config={makeConfig({ fontSize: 1 })} // 1 * 0.3 = 0.3, floor to 10
        canvasWidth={1920}
        canvasHeight={1080}
        onUpdatePosition={vi.fn()}
        onUpdateText={vi.fn()}
      />,
    )
    const preview = container.querySelector('.text-overlay__preview') as HTMLElement
    expect(preview.style.fontSize).toBe('10px')
  })

  it('positions overlay as percentage of canvas (center example)', () => {
    const { container } = render(
      <TextOverlay
        config={makeConfig({ position: [960, 540] })}
        canvasWidth={1920}
        canvasHeight={1080}
        onUpdatePosition={vi.fn()}
        onUpdateText={vi.fn()}
      />,
    )
    const overlay = container.querySelector('.text-overlay') as HTMLElement
    expect(overlay.style.left).toBe('50%')
    expect(overlay.style.top).toBe('50%')
  })

  it('falls back to 50% positioning when canvas size is 0', () => {
    const { container } = render(
      <TextOverlay
        config={makeConfig({ position: [100, 100] })}
        canvasWidth={0}
        canvasHeight={0}
        onUpdatePosition={vi.fn()}
        onUpdateText={vi.fn()}
      />,
    )
    const overlay = container.querySelector('.text-overlay') as HTMLElement
    expect(overlay.style.left).toBe('50%')
    expect(overlay.style.top).toBe('50%')
  })

  it('alignment "left" → no transform', () => {
    const { container } = render(
      <TextOverlay
        config={makeConfig({ alignment: 'left' })}
        canvasWidth={1920}
        canvasHeight={1080}
        onUpdatePosition={vi.fn()}
        onUpdateText={vi.fn()}
      />,
    )
    const overlay = container.querySelector('.text-overlay') as HTMLElement
    expect(overlay.style.transform).toBe('none')
  })

  it('alignment "center" → translateX(-50%)', () => {
    const { container } = render(
      <TextOverlay
        config={makeConfig({ alignment: 'center' })}
        canvasWidth={1920}
        canvasHeight={1080}
        onUpdatePosition={vi.fn()}
        onUpdateText={vi.fn()}
      />,
    )
    const overlay = container.querySelector('.text-overlay') as HTMLElement
    expect(overlay.style.transform).toBe('translateX(-50%)')
  })

  it('alignment "right" → translateX(-100%)', () => {
    const { container } = render(
      <TextOverlay
        config={makeConfig({ alignment: 'right' })}
        canvasWidth={1920}
        canvasHeight={1080}
        onUpdatePosition={vi.fn()}
        onUpdateText={vi.fn()}
      />,
    )
    const overlay = container.querySelector('.text-overlay') as HTMLElement
    expect(overlay.style.transform).toBe('translateX(-100%)')
  })
})

describe('TextOverlay — edit mode (double-click entry)', () => {
  it('double-click swaps preview → contentEditable + adds editing class', () => {
    const { container } = render(
      <TextOverlay
        config={makeConfig({ text: 'Hello' })}
        canvasWidth={1920}
        canvasHeight={1080}
        onUpdatePosition={vi.fn()}
        onUpdateText={vi.fn()}
      />,
    )
    const overlay = container.querySelector('.text-overlay') as HTMLElement
    fireEvent.doubleClick(overlay)
    expect(container.querySelector('.text-overlay--editing')).toBeTruthy()
    expect(container.querySelector('.text-overlay__edit')).toBeTruthy()
    expect(container.querySelector('.text-overlay__preview')).toBeNull()
  })

  it('edit mode uses larger fontSize (× 0.5) with 12px floor', () => {
    const { container } = render(
      <TextOverlay
        config={makeConfig({ fontSize: 60 })}
        canvasWidth={1920}
        canvasHeight={1080}
        onUpdatePosition={vi.fn()}
        onUpdateText={vi.fn()}
      />,
    )
    fireEvent.doubleClick(container.querySelector('.text-overlay') as HTMLElement)
    const edit = container.querySelector('.text-overlay__edit') as HTMLElement
    expect(edit.style.fontSize).toBe('30px')
  })

  it('mousedown while editing does NOT start drag', () => {
    const onUpdatePosition = vi.fn()
    const { container } = render(
      <TextOverlay
        config={makeConfig()}
        canvasWidth={1920}
        canvasHeight={1080}
        onUpdatePosition={onUpdatePosition}
        onUpdateText={vi.fn()}
      />,
    )
    const overlay = container.querySelector('.text-overlay') as HTMLElement
    fireEvent.doubleClick(overlay)
    fireEvent.mouseDown(overlay)
    // dragging class should not appear
    expect(container.querySelector('.text-overlay--dragging')).toBeNull()
  })
})

describe('TextOverlay — commit paths', () => {
  it('Enter (no shift) commits text and exits edit mode', () => {
    const onUpdateText = vi.fn()
    const { container } = render(
      <TextOverlay
        config={makeConfig({ text: 'Hi' })}
        canvasWidth={1920}
        canvasHeight={1080}
        onUpdatePosition={vi.fn()}
        onUpdateText={onUpdateText}
      />,
    )
    fireEvent.doubleClick(container.querySelector('.text-overlay') as HTMLElement)
    const edit = container.querySelector('.text-overlay__edit') as HTMLElement
    edit.textContent = 'Edited'
    fireEvent.keyDown(edit, { key: 'Enter' })
    expect(onUpdateText).toHaveBeenCalledOnce()
    expect(onUpdateText).toHaveBeenCalledWith('Edited')
    expect(container.querySelector('.text-overlay--editing')).toBeNull()
  })

  it('Escape commits text (same as Enter)', () => {
    const onUpdateText = vi.fn()
    const { container } = render(
      <TextOverlay
        config={makeConfig({ text: 'old' })}
        canvasWidth={1920}
        canvasHeight={1080}
        onUpdatePosition={vi.fn()}
        onUpdateText={onUpdateText}
      />,
    )
    fireEvent.doubleClick(container.querySelector('.text-overlay') as HTMLElement)
    const edit = container.querySelector('.text-overlay__edit') as HTMLElement
    edit.textContent = 'new'
    fireEvent.keyDown(edit, { key: 'Escape' })
    expect(onUpdateText).toHaveBeenCalledWith('new')
  })

  it('Blur commits text', () => {
    const onUpdateText = vi.fn()
    const { container } = render(
      <TextOverlay
        config={makeConfig({ text: 'before' })}
        canvasWidth={1920}
        canvasHeight={1080}
        onUpdatePosition={vi.fn()}
        onUpdateText={onUpdateText}
      />,
    )
    fireEvent.doubleClick(container.querySelector('.text-overlay') as HTMLElement)
    const edit = container.querySelector('.text-overlay__edit') as HTMLElement
    edit.textContent = 'after'
    fireEvent.blur(edit)
    expect(onUpdateText).toHaveBeenCalledWith('after')
  })

  it('commit dedupes — onUpdateText NOT called when text is unchanged', () => {
    const onUpdateText = vi.fn()
    const { container } = render(
      <TextOverlay
        config={makeConfig({ text: 'same' })}
        canvasWidth={1920}
        canvasHeight={1080}
        onUpdatePosition={vi.fn()}
        onUpdateText={onUpdateText}
      />,
    )
    fireEvent.doubleClick(container.querySelector('.text-overlay') as HTMLElement)
    const edit = container.querySelector('.text-overlay__edit') as HTMLElement
    // Leave textContent unchanged ('same')
    fireEvent.keyDown(edit, { key: 'Enter' })
    expect(onUpdateText).not.toHaveBeenCalled()
  })

  it('Shift+Enter does NOT commit (allows multiline)', () => {
    const onUpdateText = vi.fn()
    const { container } = render(
      <TextOverlay
        config={makeConfig({ text: 'line1' })}
        canvasWidth={1920}
        canvasHeight={1080}
        onUpdatePosition={vi.fn()}
        onUpdateText={onUpdateText}
      />,
    )
    fireEvent.doubleClick(container.querySelector('.text-overlay') as HTMLElement)
    const edit = container.querySelector('.text-overlay__edit') as HTMLElement
    edit.textContent = 'line1\nline2'
    fireEvent.keyDown(edit, { key: 'Enter', shiftKey: true })
    expect(onUpdateText).not.toHaveBeenCalled()
    // still in edit mode
    expect(container.querySelector('.text-overlay--editing')).toBeTruthy()
  })

  it('multiple commits in the same edit session deduped (hasCommittedRef latch)', () => {
    const onUpdateText = vi.fn()
    const { container } = render(
      <TextOverlay
        config={makeConfig({ text: 'a' })}
        canvasWidth={1920}
        canvasHeight={1080}
        onUpdatePosition={vi.fn()}
        onUpdateText={onUpdateText}
      />,
    )
    fireEvent.doubleClick(container.querySelector('.text-overlay') as HTMLElement)
    const edit = container.querySelector('.text-overlay__edit') as HTMLElement
    edit.textContent = 'b'
    fireEvent.keyDown(edit, { key: 'Enter' })
    fireEvent.blur(edit) // second commit attempt
    expect(onUpdateText).toHaveBeenCalledTimes(1)
  })
})

describe('TextOverlay — drag entry', () => {
  beforeEach(() => {
    // no jsdom event listener setup needed — drag relies on window events,
    // which we'll add via fireEvent below.
  })

  it('mousedown when not editing adds the dragging class', () => {
    const { container } = render(
      <TextOverlay
        config={makeConfig()}
        canvasWidth={1920}
        canvasHeight={1080}
        onUpdatePosition={vi.fn()}
        onUpdateText={vi.fn()}
      />,
    )
    const overlay = container.querySelector('.text-overlay') as HTMLElement
    fireEvent.mouseDown(overlay, { clientX: 100, clientY: 100 })
    expect(container.querySelector('.text-overlay--dragging')).toBeTruthy()
  })
})
