/**
 * B6.3 — FrameBankDevice + Frame-Bank store actions + InstrumentsBrowser create.
 *
 * Mirrors rack-device.test.tsx (component test + mock-free store-driven I/O).
 * Covers the 4 enforced gates:
 *   1. Additive/regression — no frameBank → device renders null.
 *   2. Create + edit (anti-dead-flag) — Wavetable create → device renders → the
 *      position slider WRITES frameBanks[trackId].position (which the existing
 *      B6.2 serialization sends to the backend → renders). FAIL-BEFORE: the
 *      Wavetable entry was disabled + there was no device.
 *   3. Caps (UI trust boundary) — position clamp [0,1], slot cap, byte-budget clamp.
 *   4. Live indicator — position→index mapping 0/0.5/1.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, screen, cleanup } from '@testing-library/react'
import FrameBankDevice, {
  frameBankMarkerIndex,
} from '../../../renderer/components/instruments/FrameBankDevice'
import InstrumentsBrowser from '../../../renderer/components/instruments/InstrumentsBrowser'
import { useInstrumentsStore } from '../../../renderer/stores/instruments'
import { useProjectStore } from '../../../renderer/stores/project'
import { useTimelineStore } from '../../../renderer/stores/timeline'
import { useUndoStore } from '../../../renderer/stores/undo'
import {
  MAX_FRAMEBANK_SLOTS,
  FRAMEBANK_BYTE_BUDGET_MIN,
  FRAMEBANK_BYTE_BUDGET_MAX,
} from '../../../renderer/components/instruments/types'
import type { Asset } from '../../../shared/types'

const T = 'track-1'
const MB = 1024 * 1024

function asset(id: string, path: string): Asset {
  return {
    id,
    path,
    type: 'video',
    meta: { width: 1920, height: 1080, duration: 10, fps: 30, codec: 'h264', hasAudio: false },
  }
}

beforeEach(() => {
  useInstrumentsStore.setState({ instruments: {}, racks: {}, frameBanks: {} })
  useProjectStore.setState({ assets: {} })
})
afterEach(() => cleanup())

describe('FrameBankDevice — mount safety (gate 1: additive/regression)', () => {
  it('renders nothing when the track has no frame-bank', () => {
    const { container } = render(<FrameBankDevice trackId={T} />)
    expect(container.querySelector('[data-testid="framebank-device"]')).toBeNull()
  })
})

describe('Frame-Bank store actions', () => {
  it('addFrameBank seeds slots + defaults (position 0.5, blend, byteBudget MIN)', () => {
    useInstrumentsStore.getState().addFrameBank(T, ['a1', 'a2'])
    const fb = useInstrumentsStore.getState().frameBanks[T]
    expect(fb).toBeTruthy()
    expect(fb.type).toBe('frameBank')
    expect(fb.slots.map((s) => s.clipId)).toEqual(['a1', 'a2'])
    expect(fb.position).toBe(0.5)
    expect(fb.interp).toBe('blend')
    expect(fb.byteBudget).toBe(FRAMEBANK_BYTE_BUDGET_MIN)
  })

  it('addFrameBank is a no-op when the track already has one', () => {
    const s = useInstrumentsStore.getState()
    s.addFrameBank(T, ['a1'])
    const id1 = useInstrumentsStore.getState().frameBanks[T].id
    s.addFrameBank(T, ['a2', 'a3'])
    const fb = useInstrumentsStore.getState().frameBanks[T]
    expect(fb.id).toBe(id1)
    expect(fb.slots.map((sl) => sl.clipId)).toEqual(['a1'])
  })

  it('setFrameBankPosition clamps to [0,1] (gate 3: caps)', () => {
    const s = useInstrumentsStore.getState()
    s.addFrameBank(T, ['a1'])
    s.setFrameBankPosition(T, 2)
    expect(useInstrumentsStore.getState().frameBanks[T].position).toBe(1)
    s.setFrameBankPosition(T, -5)
    expect(useInstrumentsStore.getState().frameBanks[T].position).toBe(0)
    // Non-finite → fallback to current (unchanged).
    s.setFrameBankPosition(T, 0.4)
    s.setFrameBankPosition(T, NaN)
    expect(useInstrumentsStore.getState().frameBanks[T].position).toBe(0.4)
  })

  it('setFrameBankByteBudget clamps to [MIN, MAX] (gate 3: caps)', () => {
    const s = useInstrumentsStore.getState()
    s.addFrameBank(T, ['a1'])
    s.setFrameBankByteBudget(T, 1)
    expect(useInstrumentsStore.getState().frameBanks[T].byteBudget).toBe(FRAMEBANK_BYTE_BUDGET_MIN)
    s.setFrameBankByteBudget(T, FRAMEBANK_BYTE_BUDGET_MAX * 10)
    expect(useInstrumentsStore.getState().frameBanks[T].byteBudget).toBe(FRAMEBANK_BYTE_BUDGET_MAX)
  })

  it('addFrameBankSlot respects MAX_FRAMEBANK_SLOTS (gate 3: caps)', () => {
    const s = useInstrumentsStore.getState()
    s.addFrameBank(T, [])
    for (let i = 0; i < MAX_FRAMEBANK_SLOTS + 5; i++) {
      s.addFrameBankSlot(T, { clipId: 'a1', frameIndex: i })
    }
    expect(useInstrumentsStore.getState().frameBanks[T].slots.length).toBe(MAX_FRAMEBANK_SLOTS)
  })

  it('removeFrameBankSlot / reorderFrameBankSlot mutate immutably', () => {
    const s = useInstrumentsStore.getState()
    s.addFrameBank(T, [])
    s.addFrameBankSlot(T, { clipId: 'a', frameIndex: 0 })
    s.addFrameBankSlot(T, { clipId: 'b', frameIndex: 1 })
    s.addFrameBankSlot(T, { clipId: 'c', frameIndex: 2 })
    s.reorderFrameBankSlot(T, 0, 2)
    expect(useInstrumentsStore.getState().frameBanks[T].slots.map((x) => x.clipId)).toEqual(['b', 'c', 'a'])
    s.removeFrameBankSlot(T, 1)
    expect(useInstrumentsStore.getState().frameBanks[T].slots.map((x) => x.clipId)).toEqual(['b', 'a'])
  })

  it('setFrameBankInterp only accepts known modes', () => {
    const s = useInstrumentsStore.getState()
    s.addFrameBank(T, ['a1'])
    s.setFrameBankInterp(T, 'nearest')
    expect(useInstrumentsStore.getState().frameBanks[T].interp).toBe('nearest')
    s.setFrameBankInterp(T, 'flow')
    expect(useInstrumentsStore.getState().frameBanks[T].interp).toBe('flow')
    // @ts-expect-error — invalid mode is rejected (no-op).
    s.setFrameBankInterp(T, 'bogus')
    expect(useInstrumentsStore.getState().frameBanks[T].interp).toBe('flow')
  })
})

describe('FrameBankDevice — render + edit (gate 2: anti-dead-flag)', () => {
  it('renders the slot strip + position + interp + budget when a frame-bank exists', () => {
    useInstrumentsStore.getState().addFrameBank(T, ['a1', 'a2'])
    render(<FrameBankDevice trackId={T} />)
    expect(screen.getByTestId('framebank-device')).toBeTruthy()
    expect(screen.getByTestId('framebank-slot-strip')).toBeTruthy()
    expect(screen.getByTestId('framebank-slot-0')).toBeTruthy()
    expect(screen.getByTestId('framebank-slot-1')).toBeTruthy()
    expect(screen.getByTestId('framebank-position')).toBeTruthy()
    expect(screen.getByTestId('framebank-interp')).toBeTruthy()
    expect(screen.getByTestId('framebank-byte-budget')).toBeTruthy()
  })

  it('the position slider WRITES frameBanks[trackId].position (drives serialization → backend)', () => {
    useInstrumentsStore.getState().addFrameBank(T, ['a1'])
    render(<FrameBankDevice trackId={T} />)
    fireEvent.change(screen.getByTestId('framebank-position'), { target: { value: '0.25' } })
    expect(useInstrumentsStore.getState().frameBanks[T].position).toBe(0.25)
  })

  it('interp dropdown writes the store', () => {
    useInstrumentsStore.getState().addFrameBank(T, ['a1'])
    render(<FrameBankDevice trackId={T} />)
    fireEvent.change(screen.getByTestId('framebank-interp'), { target: { value: 'nearest' } })
    expect(useInstrumentsStore.getState().frameBanks[T].interp).toBe('nearest')
  })

  it('byte-budget input writes a clamped value (MB → bytes)', () => {
    useInstrumentsStore.getState().addFrameBank(T, ['a1'])
    render(<FrameBankDevice trackId={T} />)
    fireEvent.change(screen.getByTestId('framebank-byte-budget'), { target: { value: '64' } })
    expect(useInstrumentsStore.getState().frameBanks[T].byteBudget).toBe(64 * MB)
  })

  it('add-slot / remove-slot from the UI mutate the bank', () => {
    useProjectStore.setState({ assets: { a1: asset('a1', '/clip.mp4') } })
    useInstrumentsStore.getState().addFrameBank(T, [])
    render(<FrameBankDevice trackId={T} />)
    fireEvent.change(screen.getByTestId('framebank-add-slot-clip'), { target: { value: 'a1' } })
    fireEvent.change(screen.getByTestId('framebank-add-slot-frame'), { target: { value: '5' } })
    fireEvent.click(screen.getByTestId('framebank-add-slot'))
    expect(useInstrumentsStore.getState().frameBanks[T].slots).toEqual([{ clipId: 'a1', frameIndex: 5 }])
    fireEvent.click(screen.getByTestId('framebank-slot-remove-0'))
    expect(useInstrumentsStore.getState().frameBanks[T].slots.length).toBe(0)
  })

  it('position slider cannot exceed [0,1] (gate 3: UI trust boundary)', () => {
    useInstrumentsStore.getState().addFrameBank(T, ['a1'])
    render(<FrameBankDevice trackId={T} />)
    const slider = screen.getByTestId('framebank-position') as HTMLInputElement
    expect(slider.min).toBe('0')
    expect(slider.max).toBe('1')
    // Even a forced out-of-range value is clamped by the store action.
    fireEvent.change(slider, { target: { value: '99' } })
    expect(useInstrumentsStore.getState().frameBanks[T].position).toBe(1)
  })
})

describe('FrameBankDevice — live position marker (gate 4: index mapping)', () => {
  it('frameBankMarkerIndex maps position 0/0.5/1 across the strip', () => {
    // 5 slots → indices [0..4]; midpoint of (slots-1)=4 is 2.
    expect(frameBankMarkerIndex(0, 5)).toBe(0)
    expect(frameBankMarkerIndex(1, 5)).toBe(4)
    expect(frameBankMarkerIndex(0.5, 5)).toBe(2)
    // Degenerate strips clamp to 0.
    expect(frameBankMarkerIndex(0.7, 1)).toBe(0)
    expect(frameBankMarkerIndex(0.7, 0)).toBe(0)
  })

  it('the rendered marker carries the computed index for position 0 / 0.5 / 1', () => {
    useInstrumentsStore.getState().addFrameBank(T, [])
    const s = useInstrumentsStore.getState()
    for (let i = 0; i < 5; i++) s.addFrameBankSlot(T, { clipId: 'a', frameIndex: i })

    s.setFrameBankPosition(T, 0)
    const { rerender } = render(<FrameBankDevice trackId={T} />)
    expect(
      screen.getByTestId('framebank-position-marker').getAttribute('data-marker-index'),
    ).toBe('0')

    s.setFrameBankPosition(T, 1)
    rerender(<FrameBankDevice trackId={T} />)
    expect(
      screen.getByTestId('framebank-position-marker').getAttribute('data-marker-index'),
    ).toBe('4')

    s.setFrameBankPosition(T, 0.5)
    rerender(<FrameBankDevice trackId={T} />)
    expect(
      screen.getByTestId('framebank-position-marker').getAttribute('data-marker-index'),
    ).toBe('2')
  })
})

// ---------------------------------------------------------------------------
// P5b.23 — B9 timeAxis selector tests (Vitest required gates)
// ---------------------------------------------------------------------------
describe('FrameBankDevice — P5b.23 timeAxis selector', () => {
  it('renders the time-axis selector when a frame-bank exists', () => {
    useInstrumentsStore.getState().addFrameBank(T, ['a1'])
    render(<FrameBankDevice trackId={T} />)
    const sel = screen.getByTestId('framebank-time-axis')
    expect(sel).toBeTruthy()
  })

  it('timeAxis selector renders exactly 3 options: t, y, x', () => {
    useInstrumentsStore.getState().addFrameBank(T, ['a1'])
    render(<FrameBankDevice trackId={T} />)
    const sel = screen.getByTestId('framebank-time-axis') as HTMLSelectElement
    const options = Array.from(sel.options).map((o) => o.value)
    expect(options).toHaveLength(3)
    expect(options).toContain('t')
    expect(options).toContain('y')
    expect(options).toContain('x')
  })

  it('timeAxis selector defaults to "t" when timeAxis is absent', () => {
    useInstrumentsStore.getState().addFrameBank(T, ['a1'])
    // Default bank has no timeAxis — the selector must show 't'.
    const fb = useInstrumentsStore.getState().frameBanks[T]
    expect(fb.timeAxis).toBeUndefined()
    render(<FrameBankDevice trackId={T} />)
    const sel = screen.getByTestId('framebank-time-axis') as HTMLSelectElement
    // The component shows 'fb.timeAxis ?? t' so selected value is 't'.
    expect(sel.value).toBe('t')
  })

  it('setFrameBankTimeAxis sets the axis and the selector reflects it', () => {
    const s = useInstrumentsStore.getState()
    s.addFrameBank(T, ['a1'])
    s.setFrameBankTimeAxis(T, 'y')
    expect(useInstrumentsStore.getState().frameBanks[T].timeAxis).toBe('y')
    render(<FrameBankDevice trackId={T} />)
    const sel = screen.getByTestId('framebank-time-axis') as HTMLSelectElement
    expect(sel.value).toBe('y')
  })

  it('timeAxis selector onChange writes the store (y → store, then x → store)', () => {
    useInstrumentsStore.getState().addFrameBank(T, ['a1'])
    render(<FrameBankDevice trackId={T} />)
    fireEvent.change(screen.getByTestId('framebank-time-axis'), { target: { value: 'y' } })
    expect(useInstrumentsStore.getState().frameBanks[T].timeAxis).toBe('y')
    fireEvent.change(screen.getByTestId('framebank-time-axis'), { target: { value: 'x' } })
    expect(useInstrumentsStore.getState().frameBanks[T].timeAxis).toBe('x')
    fireEvent.change(screen.getByTestId('framebank-time-axis'), { target: { value: 't' } })
    expect(useInstrumentsStore.getState().frameBanks[T].timeAxis).toBe('t')
  })

  it('setFrameBankTimeAxis rejects unknown axes (no-op, P1-A canon)', () => {
    const s = useInstrumentsStore.getState()
    s.addFrameBank(T, ['a1'])
    s.setFrameBankTimeAxis(T, 'y')
    // @ts-expect-error — uppercase 'Y' is invalid per P1-A axis canon.
    s.setFrameBankTimeAxis(T, 'Y')
    expect(useInstrumentsStore.getState().frameBanks[T].timeAxis).toBe('y')
    // @ts-expect-error — 'Z' is invalid.
    s.setFrameBankTimeAxis(T, 'Z')
    expect(useInstrumentsStore.getState().frameBanks[T].timeAxis).toBe('y')
  })
})

// ---------------------------------------------------------------------------
// Cohesion fix — opacity / blendMode were serialized to the backend compositor
// (serializeFrameBanks.ts) but had NO setter + NO control → permanently undefined.
// These tests prove the new setters write state, are undoable, and the device
// controls call them.
// ---------------------------------------------------------------------------
describe('Frame-Bank opacity + blendMode store actions (cohesion: WIRE)', () => {
  beforeEach(() => {
    useInstrumentsStore.setState({ instruments: {}, racks: {}, frameBanks: {} })
    useUndoStore.getState().clear()
  })

  it('setFrameBankOpacity clamps [0,1] + finite-guards', () => {
    const s = useInstrumentsStore.getState()
    s.addFrameBank(T, ['a1'])
    s.setFrameBankOpacity(T, 0.4)
    expect(useInstrumentsStore.getState().frameBanks[T].opacity).toBe(0.4)
    s.setFrameBankOpacity(T, 5)
    expect(useInstrumentsStore.getState().frameBanks[T].opacity).toBe(1)
    s.setFrameBankOpacity(T, -3)
    expect(useInstrumentsStore.getState().frameBanks[T].opacity).toBe(0)
    // Non-finite → fallback to current (unchanged).
    s.setFrameBankOpacity(T, 0.6)
    s.setFrameBankOpacity(T, NaN)
    expect(useInstrumentsStore.getState().frameBanks[T].opacity).toBe(0.6)
  })

  it('setFrameBankOpacity is undoable', () => {
    const s = useInstrumentsStore.getState()
    s.addFrameBank(T, ['a1'])
    s.setFrameBankOpacity(T, 0.3)
    expect(useInstrumentsStore.getState().frameBanks[T].opacity).toBe(0.3)
    useUndoStore.getState().undo()
    // Back to the pre-set value (undefined — bank default opacity absent).
    expect(useInstrumentsStore.getState().frameBanks[T].opacity).toBeUndefined()
    useUndoStore.getState().redo()
    expect(useInstrumentsStore.getState().frameBanks[T].opacity).toBe(0.3)
  })

  it('setFrameBankBlendMode accepts known modes + rejects unknown (no-op)', () => {
    const s = useInstrumentsStore.getState()
    s.addFrameBank(T, ['a1'])
    s.setFrameBankBlendMode(T, 'multiply')
    expect(useInstrumentsStore.getState().frameBanks[T].blendMode).toBe('multiply')
    s.setFrameBankBlendMode(T, 'screen')
    expect(useInstrumentsStore.getState().frameBanks[T].blendMode).toBe('screen')
    // @ts-expect-error — invalid blend mode rejected (no-op).
    s.setFrameBankBlendMode(T, 'bogus')
    expect(useInstrumentsStore.getState().frameBanks[T].blendMode).toBe('screen')
  })

  it('setFrameBankBlendMode is undoable', () => {
    const s = useInstrumentsStore.getState()
    s.addFrameBank(T, ['a1'])
    s.setFrameBankBlendMode(T, 'overlay')
    expect(useInstrumentsStore.getState().frameBanks[T].blendMode).toBe('overlay')
    useUndoStore.getState().undo()
    expect(useInstrumentsStore.getState().frameBanks[T].blendMode).toBeUndefined()
    useUndoStore.getState().redo()
    expect(useInstrumentsStore.getState().frameBanks[T].blendMode).toBe('overlay')
  })

  it('the opacity slider WRITES frameBanks[trackId].opacity', () => {
    useInstrumentsStore.getState().addFrameBank(T, ['a1'])
    render(<FrameBankDevice trackId={T} />)
    fireEvent.change(screen.getByTestId('framebank-opacity'), { target: { value: '0.42' } })
    expect(useInstrumentsStore.getState().frameBanks[T].opacity).toBe(0.42)
  })

  it('the blend dropdown WRITES frameBanks[trackId].blendMode', () => {
    useInstrumentsStore.getState().addFrameBank(T, ['a1'])
    render(<FrameBankDevice trackId={T} />)
    fireEvent.change(screen.getByTestId('framebank-blend'), { target: { value: 'difference' } })
    expect(useInstrumentsStore.getState().frameBanks[T].blendMode).toBe('difference')
  })

  it('blend dropdown lists all 9 shared blend modes', () => {
    useInstrumentsStore.getState().addFrameBank(T, ['a1'])
    render(<FrameBankDevice trackId={T} />)
    const sel = screen.getByTestId('framebank-blend') as HTMLSelectElement
    expect(sel.options.length).toBe(9)
  })
})

describe('InstrumentsBrowser — Wavetable create (gate 2: fail-before/pass-after)', () => {
  beforeEach(() => {
    useTimelineStore.getState().reset?.()
  })

  it('the Wavetable entry is ENABLED (no longer "soon")', () => {
    useTimelineStore.setState({ tracks: [], selectedTrackId: null })
    render(<InstrumentsBrowser />)
    const entry = screen.getByTestId('instrument-wavetable')
    // Enabled = no "(soon)" suffix and not the disabled class for non-clip reason.
    expect(entry.textContent).not.toContain('(soon)')
  })

  it('double-click creates a Frame-Bank on the selected performance track', () => {
    // A performance track + a video clip on a video track (hasVideoClips gate) +
    // a video asset to seed slots.
    useTimelineStore.setState({
      selectedTrackId: T,
      tracks: [
        { id: T, name: 'MIDI', type: 'performance', clips: [], effectChain: [] } as never,
        {
          id: 'v1',
          name: 'Video',
          type: 'video',
          clips: [{ id: 'c1' } as never],
          effectChain: [],
        } as never,
      ],
    })
    useProjectStore.setState({ assets: { a1: asset('a1', '/clip.mp4') } })

    render(<InstrumentsBrowser />)
    expect(useInstrumentsStore.getState().frameBanks[T]).toBeUndefined()
    fireEvent.doubleClick(screen.getByTestId('instrument-wavetable'))
    const fb = useInstrumentsStore.getState().frameBanks[T]
    expect(fb).toBeTruthy()
    expect(fb.slots[0]?.clipId).toBe('a1')
  })
})
