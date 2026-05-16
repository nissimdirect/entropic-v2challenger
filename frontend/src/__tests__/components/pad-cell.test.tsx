/**
 * PadCell tests.
 * Loop 38/39 PadCell trigger — synthesis Iter 28/29 named "PadCell trigger
 * (synthetic key events)" for Playwright. Playwright still owns the real
 * keyboard → store dispatch path; this vitest layer locks the cell's render
 * states (idle / armed / active / releasing) and its event handler wiring.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'

import PadCell from '../../renderer/components/performance/PadCell'
import type { Pad, PadRuntimeState, ModulationRoute } from '../../shared/types'

function makePad(overrides: Partial<Pad> = {}): Pad {
  return {
    id: 'pad-1',
    label: 'Kick',
    keyBinding: 'KeyA',
    midiNote: null,
    mode: 'gate',
    chokeGroup: null,
    envelope: { attack: 0, decay: 0, sustain: 1, release: 0 } as Pad['envelope'],
    mappings: [],
    color: '#4ade80',
    ...overrides,
  }
}

function runtime(overrides: Partial<PadRuntimeState> = {}): PadRuntimeState {
  return {
    phase: 'idle',
    triggerFrame: 0,
    releaseFrame: 0,
    currentValue: 0,
    releaseStartValue: 0,
    ...overrides,
  } as PadRuntimeState
}

afterEach(() => {
  cleanup()
})

describe('PadCell — render states', () => {
  it('renders idle (no mappings) with bare pad-cell class only', () => {
    const { container } = render(
      <PadCell
        pad={makePad({ mappings: [] })}
        runtimeState={undefined}
        onTrigger={vi.fn()}
        onRelease={vi.fn()}
        onEdit={vi.fn()}
      />,
    )
    const cell = container.querySelector('.pad-cell') as HTMLElement
    expect(cell).toBeTruthy()
    expect(cell.className).toBe('pad-cell')
  })

  it('renders armed class when pad has at least one mapping (idle phase)', () => {
    const { container } = render(
      <PadCell
        pad={makePad({ mappings: [{ targetEffectId: 'fx1' } as unknown as ModulationRoute] })}
        runtimeState={runtime({ phase: 'idle' })}
        onTrigger={vi.fn()}
        onRelease={vi.fn()}
        onEdit={vi.fn()}
      />,
    )
    expect(container.querySelector('.pad-cell--armed')).toBeTruthy()
  })

  it('renders active class for attack / decay / sustain phases', () => {
    for (const phase of ['attack', 'decay', 'sustain'] as const) {
      cleanup()
      const { container } = render(
        <PadCell
          pad={makePad({ mappings: [{ targetEffectId: 'fx1' } as unknown as ModulationRoute] })}
          runtimeState={runtime({ phase, currentValue: 0.5 })}
          onTrigger={vi.fn()}
          onRelease={vi.fn()}
          onEdit={vi.fn()}
        />,
      )
      expect(container.querySelector('.pad-cell--active')).toBeTruthy()
    }
  })

  it('renders releasing class during release phase (overrides armed)', () => {
    const { container } = render(
      <PadCell
        pad={makePad({ mappings: [{ targetEffectId: 'fx1' } as unknown as ModulationRoute] })}
        runtimeState={runtime({ phase: 'release', currentValue: 0.4 })}
        onTrigger={vi.fn()}
        onRelease={vi.fn()}
        onEdit={vi.fn()}
      />,
    )
    expect(container.querySelector('.pad-cell--releasing')).toBeTruthy()
    expect(container.querySelector('.pad-cell--armed')).toBeNull()
  })

  it('sets opacity from currentValue during active/releasing (0.3 + 0.7*v)', () => {
    const { container } = render(
      <PadCell
        pad={makePad()}
        runtimeState={runtime({ phase: 'attack', currentValue: 0.5 })}
        onTrigger={vi.fn()}
        onRelease={vi.fn()}
        onEdit={vi.fn()}
      />,
    )
    const cell = container.querySelector('.pad-cell') as HTMLElement
    // 0.3 + 0.7*0.5 = 0.65
    expect(parseFloat(cell.style.opacity)).toBeCloseTo(0.65, 3)
  })

  it('does NOT set opacity in idle phase', () => {
    const { container } = render(
      <PadCell
        pad={makePad()}
        runtimeState={runtime({ phase: 'idle', currentValue: 1.0 })}
        onTrigger={vi.fn()}
        onRelease={vi.fn()}
        onEdit={vi.fn()}
      />,
    )
    const cell = container.querySelector('.pad-cell') as HTMLElement
    expect(cell.style.opacity).toBe('')
  })
})

describe('PadCell — labels + indicators', () => {
  it('renders the pad label', () => {
    const { getByText } = render(
      <PadCell
        pad={makePad({ label: 'Snare' })}
        runtimeState={undefined}
        onTrigger={vi.fn()}
        onRelease={vi.fn()}
        onEdit={vi.fn()}
      />,
    )
    expect(getByText('Snare')).toBeTruthy()
  })

  it('renders key glyph when keyBinding is set', () => {
    const { container } = render(
      <PadCell
        pad={makePad({ keyBinding: 'KeyQ' })}
        runtimeState={undefined}
        onTrigger={vi.fn()}
        onRelease={vi.fn()}
        onEdit={vi.fn()}
      />,
    )
    const keyText = container.querySelector('.pad-cell__key')?.textContent ?? ''
    // codeToLabel('KeyQ') is expected to be 'Q' (or similar)
    expect(keyText.length).toBeGreaterThan(0)
    expect(keyText).not.toBe('—')
  })

  it('renders em-dash when keyBinding is null', () => {
    const { container } = render(
      <PadCell
        pad={makePad({ keyBinding: null })}
        runtimeState={undefined}
        onTrigger={vi.fn()}
        onRelease={vi.fn()}
        onEdit={vi.fn()}
      />,
    )
    expect(container.querySelector('.pad-cell__key')?.textContent).toBe('—')
  })

  it('shows choke-group dot when chokeGroup is set', () => {
    const { container } = render(
      <PadCell
        pad={makePad({ chokeGroup: 1 })}
        runtimeState={undefined}
        onTrigger={vi.fn()}
        onRelease={vi.fn()}
        onEdit={vi.fn()}
      />,
    )
    expect(container.querySelector('.pad-cell__choke-dot')).toBeTruthy()
  })

  it('hides choke-group dot when chokeGroup is null', () => {
    const { container } = render(
      <PadCell
        pad={makePad({ chokeGroup: null })}
        runtimeState={undefined}
        onTrigger={vi.fn()}
        onRelease={vi.fn()}
        onEdit={vi.fn()}
      />,
    )
    expect(container.querySelector('.pad-cell__choke-dot')).toBeNull()
  })

  it('shows midi-dot when midiNote is a number', () => {
    const { container } = render(
      <PadCell
        pad={makePad({ midiNote: 36 })}
        runtimeState={undefined}
        onTrigger={vi.fn()}
        onRelease={vi.fn()}
        onEdit={vi.fn()}
      />,
    )
    expect(container.querySelector('.pad-cell__midi-dot')).toBeTruthy()
  })

  it('hides midi-dot when midiNote is null', () => {
    const { container } = render(
      <PadCell
        pad={makePad({ midiNote: null })}
        runtimeState={undefined}
        onTrigger={vi.fn()}
        onRelease={vi.fn()}
        onEdit={vi.fn()}
      />,
    )
    expect(container.querySelector('.pad-cell__midi-dot')).toBeNull()
  })

  it('aria-label includes label + bound key label or "unbound"', () => {
    const { container, rerender } = render(
      <PadCell
        pad={makePad({ label: 'Hat', keyBinding: 'KeyH' })}
        runtimeState={undefined}
        onTrigger={vi.fn()}
        onRelease={vi.fn()}
        onEdit={vi.fn()}
      />,
    )
    expect(container.querySelector('[aria-label]')?.getAttribute('aria-label')).toMatch(/^Hat /)

    rerender(
      <PadCell
        pad={makePad({ label: 'Hat', keyBinding: null })}
        runtimeState={undefined}
        onTrigger={vi.fn()}
        onRelease={vi.fn()}
        onEdit={vi.fn()}
      />,
    )
    expect(container.querySelector('[aria-label]')?.getAttribute('aria-label')).toBe('Hat unbound')
  })

  it('aria-pressed reflects active or releasing phase', () => {
    const { container, rerender } = render(
      <PadCell
        pad={makePad()}
        runtimeState={runtime({ phase: 'attack' })}
        onTrigger={vi.fn()}
        onRelease={vi.fn()}
        onEdit={vi.fn()}
      />,
    )
    expect(container.querySelector('[aria-pressed]')?.getAttribute('aria-pressed')).toBe('true')

    rerender(
      <PadCell
        pad={makePad()}
        runtimeState={runtime({ phase: 'idle' })}
        onTrigger={vi.fn()}
        onRelease={vi.fn()}
        onEdit={vi.fn()}
      />,
    )
    expect(container.querySelector('[aria-pressed]')?.getAttribute('aria-pressed')).toBe('false')
  })
})

describe('PadCell — event wiring', () => {
  it('mouseDown calls onTrigger with pad.id', () => {
    const onTrigger = vi.fn()
    const { container } = render(
      <PadCell
        pad={makePad({ id: 'pad-X' })}
        runtimeState={undefined}
        onTrigger={onTrigger}
        onRelease={vi.fn()}
        onEdit={vi.fn()}
      />,
    )
    fireEvent.mouseDown(container.querySelector('.pad-cell') as HTMLElement)
    expect(onTrigger).toHaveBeenCalledOnce()
    expect(onTrigger).toHaveBeenCalledWith('pad-X')
  })

  it('mouseUp calls onRelease with pad.id', () => {
    const onRelease = vi.fn()
    const { container } = render(
      <PadCell
        pad={makePad({ id: 'pad-Y' })}
        runtimeState={undefined}
        onTrigger={vi.fn()}
        onRelease={onRelease}
        onEdit={vi.fn()}
      />,
    )
    fireEvent.mouseUp(container.querySelector('.pad-cell') as HTMLElement)
    expect(onRelease).toHaveBeenCalledWith('pad-Y')
  })

  it('mouseLeave calls onRelease ONLY while active (drag-out behavior)', () => {
    const onRelease = vi.fn()
    const { container, rerender } = render(
      <PadCell
        pad={makePad({ id: 'pad-Z' })}
        runtimeState={runtime({ phase: 'attack' })}
        onTrigger={vi.fn()}
        onRelease={onRelease}
        onEdit={vi.fn()}
      />,
    )
    fireEvent.mouseLeave(container.querySelector('.pad-cell') as HTMLElement)
    expect(onRelease).toHaveBeenCalledWith('pad-Z')

    onRelease.mockClear()
    rerender(
      <PadCell
        pad={makePad({ id: 'pad-Z' })}
        runtimeState={runtime({ phase: 'idle' })}
        onTrigger={vi.fn()}
        onRelease={onRelease}
        onEdit={vi.fn()}
      />,
    )
    fireEvent.mouseLeave(container.querySelector('.pad-cell') as HTMLElement)
    expect(onRelease).not.toHaveBeenCalled()
  })

  it('doubleClick calls onEdit with pad.id', () => {
    const onEdit = vi.fn()
    const { container } = render(
      <PadCell
        pad={makePad({ id: 'pad-E' })}
        runtimeState={undefined}
        onTrigger={vi.fn()}
        onRelease={vi.fn()}
        onEdit={onEdit}
      />,
    )
    fireEvent.doubleClick(container.querySelector('.pad-cell') as HTMLElement)
    expect(onEdit).toHaveBeenCalledWith('pad-E')
  })
})
