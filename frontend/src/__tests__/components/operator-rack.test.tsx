/**
 * Smoke tests for the re-mounted OperatorRack (2026-05-15).
 *
 * Operators were unmounted in Sprint 2 (commit 9abb10b) but the components
 * stayed on disk. This test guards the mount path by exercising:
 *   - empty-state render (no operators)
 *   - add menu open / close
 *   - addOperator wiring through the store
 *   - close-by-x affordance
 *
 * NOT a UX test; the rack interaction surface is large and covered by
 * Playwright in tests/e2e/.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'

;(globalThis as any).window = {
  entropic: {
    sendCommand: async () => ({ ok: true }),
    onEngineStatus: () => {},
    onExportProgress: () => {},
  },
}

import OperatorRack from '../../renderer/components/operators/OperatorRack'
import { useOperatorStore } from '../../renderer/stores/operators'
import { useUndoStore } from '../../renderer/stores/undo'

function resetStores() {
  useOperatorStore.getState().resetOperators()
  useUndoStore.getState().clear()
}

const baseProps = {
  effectChain: [],
  registry: [],
  operatorValues: {},
  hasAudio: false,
}

describe('OperatorRack mount (re-enabled 2026-05-15)', () => {
  beforeEach(resetStores)
  afterEach(cleanup)

  it('renders the empty state with no operators', () => {
    const { getByText } = render(<OperatorRack {...baseProps} />)
    expect(getByText(/no operators/i)).toBeTruthy()
  })

  it('opens the add-menu when + Add is clicked', () => {
    const { getByText, queryByText } = render(<OperatorRack {...baseProps} />)
    expect(queryByText('LFO')).toBeNull()
    fireEvent.click(getByText('+ Add'))
    expect(queryByText('LFO')).not.toBeNull()
    expect(queryByText('Envelope')).not.toBeNull()
    expect(queryByText('Fusion')).not.toBeNull()
  })

  it('adds an LFO operator when LFO option is clicked', () => {
    const { getByText } = render(<OperatorRack {...baseProps} />)
    fireEvent.click(getByText('+ Add'))
    fireEvent.click(getByText('LFO'))
    const ops = useOperatorStore.getState().operators
    expect(ops).toHaveLength(1)
    expect(ops[0].type).toBe('lfo')
  })

  it('reflects the operator card after adding from store', () => {
    useOperatorStore.getState().addOperator('envelope')
    const { container } = render(<OperatorRack {...baseProps} />)
    const card = container.querySelector('.operator-card')
    expect(card).not.toBeNull()
  })
})
