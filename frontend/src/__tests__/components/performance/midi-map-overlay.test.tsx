/**
 * H-UI (2026-07-02 master-tuneup WS5) — MIDIMapOverlay tests.
 *
 * The overlay is the VIEW/hand-edit layer over the H1–H5 hardware-mapping
 * engine (stores/midi.ts). These tests cover the three load-bearing behaviors
 * the lane spec calls out:
 *   1. renders the MIDImix 4x8 grid from store state (and null when map mode is
 *      off), showing auto-default vs user-overridden slots distinctly;
 *   2. click-slot → click-param writes through the EXISTING setBankAssignment
 *      store action (no new persistence logic);
 *   3. a knob turn (ccValues change) FLASHES the slot bound to that CC.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import React from 'react'

// Mock window.entropic before store imports (Electron preload dependency).
;(globalThis as any).window = {
  entropic: {
    onEngineStatus: () => {},
    sendCommand: async () => ({ ok: true }),
    selectFile: async () => null,
    selectSavePath: async () => null,
    onExportProgress: () => {},
  },
}

import { useMIDIStore } from '../../../renderer/stores/midi'
import { useMIDIMapModeStore } from '../../../renderer/stores/midiMapMode'
import { useTimelineStore } from '../../../renderer/stores/timeline'
import { useProjectStore } from '../../../renderer/stores/project'
import { useEffectsStore } from '../../../renderer/stores/effects'
import { useInstrumentsStore } from '../../../renderer/stores/instruments'
import MIDIMapOverlay from '../../../renderer/components/performance/MIDIMapOverlay'
import type { RackNode } from '../../../renderer/components/instruments/types'

function macroRack(): RackNode {
  return {
    id: 'rack-1',
    type: 'rack',
    pads: [],
    macros: [
      { id: 'm1', name: 'Chaos', value: 0, routes: [] },
      { id: 'm2', name: 'Decay', value: 0, routes: [] },
    ],
  }
}

function resetStores() {
  useMIDIStore.getState().resetMIDI()
  useMIDIMapModeStore.setState({ mapMode: false, selectedSlot: null })
  useTimelineStore.getState().reset()
  useProjectStore.setState({ assets: {}, selectedEffectId: null, selectedRackPad: null, rackEditPath: [] })
  useEffectsStore.setState({ registry: [], isLoading: false, error: null })
  useInstrumentsStore.setState({ racks: {} })
  document.body.classList.remove('midi-map-mode')
}

/** Seed a 'track' focus context whose rack has 2 macros → 2 candidate targets. */
function seedTrackContext(): string {
  const trackId = useTimelineStore.getState().addTrack('Drums', '#ff0000')!
  useTimelineStore.getState().selectTrack(trackId)
  useInstrumentsStore.setState({ racks: { [trackId]: macroRack() } })
  return trackId
}

beforeEach(() => {
  resetStores()
  cleanup()
})
afterEach(cleanup)

// ─── 1. render / null-when-off ────────────────────────────────────────────

describe('MIDIMapOverlay — visibility', () => {
  it('renders nothing when map mode is off', () => {
    seedTrackContext()
    const { queryByTestId } = render(<MIDIMapOverlay />)
    expect(queryByTestId('midi-map-overlay')).toBeNull()
  })

  it('renders the full MIDImix 4x8 grid (32 slots) when map mode is on', () => {
    seedTrackContext()
    useMIDIMapModeStore.setState({ mapMode: true })
    const { getByTestId, queryAllByTestId } = render(<MIDIMapOverlay />)
    expect(getByTestId('midi-map-grid')).toBeTruthy()
    const slots = queryAllByTestId(/^map-slot-\d-\d$/)
    expect(slots).toHaveLength(32)
  })

  it('shows the default macro row (row 3) as auto-default, empty rows as empty', () => {
    seedTrackContext()
    useMIDIMapModeStore.setState({ mapMode: true })
    const { getByTestId } = render(<MIDIMapOverlay />)
    // deriveDefaultAssignment maps rack macros onto row 3 (fader row).
    expect(getByTestId('map-slot-3-0').getAttribute('data-slot-state')).toBe('default')
    expect(getByTestId('map-slot-3-1').getAttribute('data-slot-state')).toBe('default')
    // Untouched knob rows are empty.
    expect(getByTestId('map-slot-0-0').getAttribute('data-slot-state')).toBe('empty')
  })

  it('shows the bound CC number for a slot with a ccBankBinding', () => {
    const trackId = seedTrackContext()
    void trackId
    useMIDIStore.getState().setCCBankBinding(16, { row: 0, col: 0 })
    useMIDIMapModeStore.setState({ mapMode: true })
    const { getByTestId } = render(<MIDIMapOverlay />)
    expect(getByTestId('map-slot-0-0').getAttribute('data-cc')).toBe('16')
    expect(getByTestId('map-slot-0-1').getAttribute('data-cc')).toBe('')
  })
})

// ─── 2. click-slot → click-param writes setBankAssignment ─────────────────

describe('MIDIMapOverlay — click-to-assign', () => {
  it('picking a slot then a param writes an override via setBankAssignment', () => {
    const trackId = seedTrackContext()
    useMIDIMapModeStore.setState({ mapMode: true })
    const { getByTestId, getByText, queryByTestId } = render(<MIDIMapOverlay />)

    // Slot (0,0) is empty by default — click it to open the param picker.
    act(() => {
      fireEvent.click(getByTestId('map-slot-0-0'))
    })
    expect(getByTestId('midi-map-picker')).toBeTruthy()

    // Pick the "Chaos" macro (m1). Writes through the existing store action.
    act(() => {
      fireEvent.click(getByText('Chaos'))
    })

    const assignment = useMIDIStore.getState().bankAssignments[`track:${trackId}`]
    expect(assignment).toBeTruthy()
    expect(assignment.slots[0][0]).toEqual({ kind: 'macro', trackId, macroId: 'm1' })
    // Untouched default slot (row 3) is preserved in the saved grid.
    expect(assignment.slots[3][0]).toEqual({ kind: 'macro', trackId, macroId: 'm1' })

    // The picker closes and the overridden slot is badged distinctly.
    expect(queryByTestId('midi-map-picker')).toBeNull()
    expect(getByTestId('map-slot-0-0').getAttribute('data-slot-state')).toBe('overridden')
  })

  it('grid slots are disabled (not assignable) when nothing is focused', () => {
    // No track selected → context 'none' → no candidates.
    useMIDIMapModeStore.setState({ mapMode: true })
    const { getByTestId } = render(<MIDIMapOverlay />)
    expect(getByTestId('midi-map-hint')).toBeTruthy()
    expect((getByTestId('map-slot-0-0') as HTMLButtonElement).disabled).toBe(true)
  })
})

// ─── 3. flash-on-CC ────────────────────────────────────────────────────────

describe('MIDIMapOverlay — flash on knob turn', () => {
  it('flashes the slot bound to a CC when that CC value changes', () => {
    seedTrackContext()
    useMIDIStore.getState().setCCBankBinding(16, { row: 0, col: 0 })
    useMIDIMapModeStore.setState({ mapMode: true })
    const { getByTestId } = render(<MIDIMapOverlay />)

    // Not flashing initially.
    expect(getByTestId('map-slot-0-0').getAttribute('data-flashing')).toBe('false')

    // Simulate a hardware knob turn: CC16 lands a value in the store.
    act(() => {
      useMIDIStore.setState({ ccValues: { 16: 0.5 } })
    })

    expect(getByTestId('map-slot-0-0').getAttribute('data-flashing')).toBe('true')
    // A slot with no binding for that CC does not flash.
    expect(getByTestId('map-slot-1-1').getAttribute('data-flashing')).toBe('false')
  })
})

// ─── map-mode store ────────────────────────────────────────────────────────

describe('useMIDIMapModeStore', () => {
  it('toggles map mode and clears the selected slot on close', () => {
    useMIDIMapModeStore.getState().setMapMode(true)
    expect(useMIDIMapModeStore.getState().mapMode).toBe(true)
    useMIDIMapModeStore.getState().setSelectedSlot({ row: 1, col: 2 })
    expect(useMIDIMapModeStore.getState().selectedSlot).toEqual({ row: 1, col: 2 })
    useMIDIMapModeStore.getState().toggleMapMode() // close
    expect(useMIDIMapModeStore.getState().mapMode).toBe(false)
    expect(useMIDIMapModeStore.getState().selectedSlot).toBeNull()
  })

  it('clicking the already-selected slot toggles it off', () => {
    useMIDIMapModeStore.getState().setSelectedSlot({ row: 2, col: 3 })
    useMIDIMapModeStore.getState().setSelectedSlot({ row: 2, col: 3 })
    expect(useMIDIMapModeStore.getState().selectedSlot).toBeNull()
  })

  it('rejects out-of-grid slot addresses', () => {
    useMIDIMapModeStore.getState().setSelectedSlot({ row: 9 as 0, col: 0 })
    expect(useMIDIMapModeStore.getState().selectedSlot).toBeNull()
  })
})
