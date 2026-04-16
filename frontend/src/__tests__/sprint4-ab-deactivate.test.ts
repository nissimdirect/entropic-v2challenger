/**
 * Sprint 4: AB deactivation via right-click context menu.
 *
 * Verifies that the ABSwitch component's onContextMenu handler
 * calls project.deactivateAB(effectId) to exit AB mode.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { createElement } from 'react'
import { useProjectStore } from '../renderer/stores/project'
import { useUndoStore } from '../renderer/stores/undo'
import ABSwitch from '../renderer/components/device-chain/ABSwitch'
import type { EffectInstance } from '../shared/types'

const MOCK: EffectInstance = {
  id: 'fx-1',
  effectId: 'pixelsort',
  isEnabled: true,
  isFrozen: false,
  parameters: { threshold: 0.5, direction: 90 },
  modulations: {},
  mix: 1,
  mask: null,
}

function reset() {
  useProjectStore.setState({
    effectChain: [{ ...MOCK, parameters: { ...MOCK.parameters } }],
    selectedEffectId: null,
    assets: {},
    currentFrame: 0,
    totalFrames: 0,
    isIngesting: false,
    ingestError: null,
    projectPath: null,
    projectName: 'Test',
  })
  useUndoStore.getState().clear()
}

afterEach(cleanup)

describe('ABSwitch deactivation (right-click)', () => {
  beforeEach(reset)

  it('right-click on active AB switch calls deactivateAB and clears abState', () => {
    // Activate AB first
    useProjectStore.getState().activateAB('fx-1')
    expect(useProjectStore.getState().effectChain[0].abState).toBeDefined()

    const { getByTestId, unmount } = render(
      createElement(ABSwitch, { effectId: 'fx-1', isActive: true, activeSlot: 'a' }),
    )

    const button = getByTestId('ab-switch')
    fireEvent.contextMenu(button)

    // abState should be null after deactivation
    expect(useProjectStore.getState().effectChain[0].abState).toBeNull()
    unmount()
  })

  it('tooltip on active AB switch mentions right-click to deactivate', () => {
    useProjectStore.getState().activateAB('fx-1')

    const { getByTestId, unmount } = render(
      createElement(ABSwitch, { effectId: 'fx-1', isActive: true, activeSlot: 'a' }),
    )

    const button = getByTestId('ab-switch')
    expect(button.getAttribute('title')).toContain('Right-click to deactivate')
    unmount()
  })
})
