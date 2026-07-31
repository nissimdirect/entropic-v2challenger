/**
 * W1.5b PK.A3 oracle — QuantizeReadout status-bar chip.
 */
;(globalThis as any).window = {
  entropic: {
    onEngineStatus: () => {},
    sendCommand: async () => ({ ok: true }),
    selectFile: async () => null,
    selectSavePath: async () => null,
    onExportProgress: () => {},
  },
}

import { describe, it, expect, beforeEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { useLayoutStore } from '../../renderer/stores/layout'
import { useProjectStore } from '../../renderer/stores/project'
import QuantizeReadout from '../../renderer/components/layout/QuantizeReadout'

beforeEach(() => {
  useLayoutStore.setState({ quantizeEnabled: false, quantizeDivision: 4 })
  useProjectStore.setState({ bpm: 120, effectiveBpm: 120 })
  cleanup()
})

describe('QuantizeReadout', () => {
  it('is hidden when quantize is off', () => {
    const { queryByTestId } = render(<QuantizeReadout />)
    expect(queryByTestId('quantize-readout')).toBeNull()
  })

  it('shows "1/4 · bar 2.0s @ 120" for {division 1/4, bpm 120}', () => {
    useLayoutStore.setState({ quantizeEnabled: true, quantizeDivision: 4 })
    useProjectStore.setState({ bpm: 120, effectiveBpm: 120 })
    const { getByTestId } = render(<QuantizeReadout />)
    expect(getByTestId('quantize-readout').textContent).toBe('1/4 · bar 2.0s @ 120')
  })

  it('shows "1/16 · bar 2.7s @ 90" for {division 1/16, bpm 90}', () => {
    useLayoutStore.setState({ quantizeEnabled: true, quantizeDivision: 16 })
    useProjectStore.setState({ bpm: 90, effectiveBpm: 90 })
    const { getByTestId } = render(<QuantizeReadout />)
    expect(getByTestId('quantize-readout').textContent).toBe('1/16 · bar 2.7s @ 90')
  })

  it('updates live when BPM changes', () => {
    useLayoutStore.setState({ quantizeEnabled: true, quantizeDivision: 4 })
    useProjectStore.setState({ bpm: 120, effectiveBpm: 120 })
    const { getByTestId } = render(<QuantizeReadout />)
    expect(getByTestId('quantize-readout').textContent).toBe('1/4 · bar 2.0s @ 120')
    act(() => { useProjectStore.getState().setBpm(100) })
    expect(getByTestId('quantize-readout').textContent).toBe('1/4 · bar 2.4s @ 100')
  })
})
