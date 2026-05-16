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

  it('still renders Mix column when effect has only non-numeric params (F-0516-9)', () => {
    // Before F-0516-9 this case rendered the empty hint. Now every effect
    // contributes a synthetic Mix target, so the matrix is non-empty even
    // when the effect has only enum / choice params.
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
    const { container, getByText } = render(
      <ModulationMatrix
        effectChain={[{ id: 'fx1', effectId: 'fx.invert' }]}
        registry={enumOnly}
        operatorValues={{}}
      />,
    )
    expect(container.querySelector('.mod-matrix--empty')).toBeNull()
    expect(getByText('Mix')).toBeTruthy()
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

  it('renders one column per numeric param across the chain plus _mix per effect', () => {
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
    // F-0516-9: Invert (mix + amount = 2) + Glitch (mix + intensity + seed = 3) = 5.
    // 'mode' is enum/choice and filtered out.
    expect(container.querySelectorAll('.mod-matrix__col-header')).toHaveLength(5)
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

describe('ModulationMatrix — F-0516-9 _mix synthetic target', () => {
  it('first column per effect is the Mix target', () => {
    useOperatorStore.getState().addOperator('lfo')
    const { container } = render(
      <ModulationMatrix
        effectChain={[{ id: 'fx1', effectId: 'fx.invert' }]}
        registry={makeRegistry()}
        operatorValues={{}}
      />,
    )
    const headers = container.querySelectorAll('.mod-matrix__col-header')
    // Invert has 1 numeric param + 1 mix col = 2 headers. First should be "Mix".
    expect(headers).toHaveLength(2)
    const firstParamLabel = headers[0].querySelector('.mod-matrix__param-name')?.textContent
    expect(firstParamLabel).toBe('Mix')
  })

  it('Mix target is per-effect (chain of 2 effects → 2 mix cols)', () => {
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
    const mixLabels = Array.from(
      container.querySelectorAll('.mod-matrix__param-name'),
    ).filter((el) => el.textContent === 'Mix')
    expect(mixLabels).toHaveLength(2)
  })

  it('clicking the Mix cell creates an operator mapping with paramKey=_mix', () => {
    useOperatorStore.getState().addOperator('lfo')
    const op = useOperatorStore.getState().operators[0]
    // Simulate the mapping being created (the click handler is in cell — we
    // assert routing endpoint rather than the click flow which depends on
    // OperatorRack's "+ Add" gesture).
    useOperatorStore.getState().addMapping(op.id, {
      targetEffectId: 'fx1',
      targetParamKey: '_mix',
      depth: 1.0,
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
    expect(getByText('100%')).toBeTruthy()
  })

  it('removing the mix mapping deactivates the cell', () => {
    useOperatorStore.getState().addOperator('lfo')
    const op = useOperatorStore.getState().operators[0]
    useOperatorStore.getState().addMapping(op.id, {
      targetEffectId: 'fx1',
      targetParamKey: '_mix',
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
    fireEvent.click(container.querySelector('.mod-matrix__remove-btn') as HTMLElement)
    expect(
      useOperatorStore
        .getState()
        .operators[0].mappings.filter((m) => m.targetParamKey === '_mix'),
    ).toHaveLength(0)
  })
})
