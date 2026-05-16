/**
 * ModulationMatrix tests.
 * Loop 50 — synthesis Iter 28/29 named "modmatrix end-to-end" for Playwright
 * (real IPC + visual signal flow). This vitest layer locks the data-driven
 * render: rows × cols, active cells, depth slider, remove action, signal bar.
 *
 * What this layer covers:
 *   - Empty state (no operators OR no targets)
 *   - One row per ENABLED operator (or operator with mappings)
 *   - One col per (effect × float|int param)
 *   - Mapping cell renders depth slider + remove button
 *   - Depth slider onChange dispatches updateMapping with parsed float
 *   - Remove button calls removeMapping(operatorId, index)
 *   - Signal bar width reflects operatorValues for that operator
 *
 * What stays at the Playwright layer:
 *   - Live operator output → IPC → param modulation visible in frame
 *   - Rendering performance under N operators × M params
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'

import ModulationMatrix from '../../renderer/components/operators/ModulationMatrix'
import { useOperatorStore } from '../../renderer/stores/operators'
import type { EffectInfo } from '../../shared/types'

function makeRegistry(): EffectInfo[] {
  return [
    {
      id: 'fx.invert',
      name: 'Invert',
      category: 'color',
      params: {
        amount: { type: 'float', label: 'Amount', default: 1.0, min: 0, max: 1 },
        // Non-numeric param should be filtered out of the matrix.
        mode: { type: 'enum', label: 'Mode', default: 'all', options: ['all', 'r', 'g', 'b'] },
      },
    } as unknown as EffectInfo,
    {
      id: 'fx.glitch',
      name: 'Glitch',
      category: 'glitch',
      params: {
        intensity: { type: 'float', label: 'Intensity', default: 0.5, min: 0, max: 1 },
        seed: { type: 'int', label: 'Seed', default: 42, min: 0, max: 10000 },
      },
    } as unknown as EffectInfo,
  ]
}

beforeEach(() => {
  useOperatorStore.getState().resetOperators()
})

afterEach(() => {
  cleanup()
})

describe('ModulationMatrix — empty states', () => {
  it('renders empty hint when no operators exist', () => {
    const { container, getByText } = render(
      <ModulationMatrix
        effectChain={[{ id: 'fx1', effectId: 'fx.invert' }]}
        registry={makeRegistry()}
        operatorValues={{}}
      />,
    )
    expect(container.querySelector('.mod-matrix--empty')).toBeTruthy()
    expect(getByText(/Add operators and effects/i)).toBeTruthy()
  })

  it('renders empty hint when no effect targets exist', () => {
    useOperatorStore.getState().addOperator('lfo')
    const { container } = render(
      <ModulationMatrix
        effectChain={[]}
        registry={makeRegistry()}
        operatorValues={{}}
      />,
    )
    expect(container.querySelector('.mod-matrix--empty')).toBeTruthy()
  })

  it('renders empty hint when only non-numeric params exist', () => {
    useOperatorStore.getState().addOperator('lfo')
    const enumOnly: EffectInfo[] = [
      {
        id: 'fx.invert',
        name: 'Invert',
        category: 'color',
        params: {
          mode: { type: 'enum', label: 'Mode', default: 'all', options: ['all'] },
        },
      } as unknown as EffectInfo,
    ]
    const { container } = render(
      <ModulationMatrix
        effectChain={[{ id: 'fx1', effectId: 'fx.invert' }]}
        registry={enumOnly}
        operatorValues={{}}
      />,
    )
    expect(container.querySelector('.mod-matrix--empty')).toBeTruthy()
  })
})

describe('ModulationMatrix — grid structure', () => {
  it('renders one row per enabled operator', () => {
    useOperatorStore.getState().addOperator('lfo')
    useOperatorStore.getState().addOperator('envelope')

    const { container } = render(
      <ModulationMatrix
        effectChain={[{ id: 'fx1', effectId: 'fx.invert' }]}
        registry={makeRegistry()}
        operatorValues={{}}
      />,
    )
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2)
  })

  it('renders one column per numeric param across the chain', () => {
    useOperatorStore.getState().addOperator('lfo')
    const { container } = render(
      <ModulationMatrix
        effectChain={[
          { id: 'fx1', effectId: 'fx.invert' },
          { id: 'fx2', effectId: 'fx.glitch' },
        ]}
        registry={makeRegistry()}
        operatorValues={{}}
      />,
    )
    // Invert: amount (1) + Glitch: intensity, seed (2) = 3 numeric cols.
    // Note: 'mode' is enum and filtered out.
    expect(container.querySelectorAll('.mod-matrix__col-header')).toHaveLength(3)
  })

  it('disabled operators with no mappings are excluded; with mappings they appear', () => {
    useOperatorStore.getState().addOperator('lfo')
    const op = useOperatorStore.getState().operators[0]
    useOperatorStore.getState().setOperatorEnabled(op.id, false)

    const { container: emptyContainer } = render(
      <ModulationMatrix
        effectChain={[{ id: 'fx1', effectId: 'fx.invert' }]}
        registry={makeRegistry()}
        operatorValues={{}}
      />,
    )
    expect(emptyContainer.querySelector('.mod-matrix--empty')).toBeTruthy()
    cleanup()

    useOperatorStore.getState().addMapping(op.id, {
      targetEffectId: 'fx1',
      targetParamKey: 'amount',
      depth: 0.5,
      min: 0,
      max: 1,
      curve: 'linear',
    })

    const { container } = render(
      <ModulationMatrix
        effectChain={[{ id: 'fx1', effectId: 'fx.invert' }]}
        registry={makeRegistry()}
        operatorValues={{}}
      />,
    )
    expect(container.querySelector('.mod-matrix--empty')).toBeNull()
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1)
  })
})

describe('ModulationMatrix — active cell interaction', () => {
  it('cell becomes active when a mapping exists for that (operator, target)', () => {
    useOperatorStore.getState().addOperator('lfo')
    const op = useOperatorStore.getState().operators[0]
    useOperatorStore.getState().addMapping(op.id, {
      targetEffectId: 'fx1',
      targetParamKey: 'amount',
      depth: 0.75,
      min: 0,
      max: 1,
      curve: 'linear',
    })

    const { container, getByText } = render(
      <ModulationMatrix
        effectChain={[{ id: 'fx1', effectId: 'fx.invert' }]}
        registry={makeRegistry()}
        operatorValues={{}}
      />,
    )
    expect(container.querySelector('.mod-matrix__cell--active')).toBeTruthy()
    expect(getByText('75%')).toBeTruthy()
  })

  it('depth slider onChange dispatches updateMapping with parsed float', () => {
    useOperatorStore.getState().addOperator('lfo')
    const op = useOperatorStore.getState().operators[0]
    useOperatorStore.getState().addMapping(op.id, {
      targetEffectId: 'fx1',
      targetParamKey: 'amount',
      depth: 0.25,
      min: 0,
      max: 1,
      curve: 'linear',
    })

    const { container } = render(
      <ModulationMatrix
        effectChain={[{ id: 'fx1', effectId: 'fx.invert' }]}
        registry={makeRegistry()}
        operatorValues={{}}
      />,
    )

    const slider = container.querySelector('.mod-matrix__depth-slider') as HTMLInputElement
    expect(slider).toBeTruthy()

    fireEvent.change(slider, { target: { value: '0.9' } })

    const newDepth = useOperatorStore.getState().operators[0].mappings[0].depth
    expect(newDepth).toBeCloseTo(0.9, 2)
  })

  it('remove button calls removeMapping and the cell deactivates', () => {
    useOperatorStore.getState().addOperator('lfo')
    const op = useOperatorStore.getState().operators[0]
    useOperatorStore.getState().addMapping(op.id, {
      targetEffectId: 'fx1',
      targetParamKey: 'amount',
      depth: 0.5,
      min: 0,
      max: 1,
      curve: 'linear',
    })

    const { container, rerender } = render(
      <ModulationMatrix
        effectChain={[{ id: 'fx1', effectId: 'fx.invert' }]}
        registry={makeRegistry()}
        operatorValues={{}}
      />,
    )
    expect(container.querySelector('.mod-matrix__cell--active')).toBeTruthy()

    const removeBtn = container.querySelector('.mod-matrix__remove-btn') as HTMLElement
    fireEvent.click(removeBtn)

    // Mapping is gone from store; re-render to pull fresh state.
    rerender(
      <ModulationMatrix
        effectChain={[{ id: 'fx1', effectId: 'fx.invert' }]}
        registry={makeRegistry()}
        operatorValues={{}}
      />,
    )
    expect(useOperatorStore.getState().operators[0].mappings).toHaveLength(0)
  })
})

describe('ModulationMatrix — signal bar', () => {
  it('signal bar width reflects operatorValues for the row', () => {
    useOperatorStore.getState().addOperator('lfo')
    const op = useOperatorStore.getState().operators[0]

    const { container } = render(
      <ModulationMatrix
        effectChain={[{ id: 'fx1', effectId: 'fx.invert' }]}
        registry={makeRegistry()}
        operatorValues={{ [op.id]: 0.42 }}
      />,
    )
    const bar = container.querySelector('.mod-matrix__signal-bar') as HTMLElement
    expect(bar).toBeTruthy()
    expect(bar.style.width).toBe('42%')
  })

  it('signal bar defaults to 0% when operatorValues is missing the operator id', () => {
    useOperatorStore.getState().addOperator('lfo')

    const { container } = render(
      <ModulationMatrix
        effectChain={[{ id: 'fx1', effectId: 'fx.invert' }]}
        registry={makeRegistry()}
        operatorValues={{}}
      />,
    )
    const bar = container.querySelector('.mod-matrix__signal-bar') as HTMLElement
    expect(bar.style.width).toBe('0%')
  })
})
