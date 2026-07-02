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
import { useTimelineStore } from '../renderer/stores/timeline'
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

// TODO(Epic02): use active track — mechanical migration for Epic 01 compatibility.
let V1_TRACK_ID: string

function reset() {
  useTimelineStore.getState().reset()
  useProjectStore.setState({
    effectChain: [],
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
  // Add V1 track and seed its effectChain with MOCK
  V1_TRACK_ID = useTimelineStore.getState().addTrack('V1', '#ff0000')!
  useTimelineStore.getState().selectTrack(V1_TRACK_ID)
  useTimelineStore.getState().updateTrackEffectChain(V1_TRACK_ID, () => [{ ...MOCK, parameters: { ...MOCK.parameters } }])
  useUndoStore.getState().clear()
}

function getV1Chain(): EffectInstance[] {
  return useTimelineStore.getState().tracks.find((t) => t.id === V1_TRACK_ID)?.effectChain ?? []
}

afterEach(cleanup)

describe('ABSwitch deactivation (right-click)', () => {
  beforeEach(reset)

  it('right-click on active AB switch calls deactivateAB and clears abState', () => {
    // Activate AB first
    useProjectStore.getState().activateAB(V1_TRACK_ID, 'fx-1')
    expect(getV1Chain()[0].abState).toBeDefined()

    const { getByTestId, unmount } = render(
      createElement(ABSwitch, { effectId: 'fx-1', isActive: true, activeSlot: 'a' }),
    )

    const button = getByTestId('ab-switch')
    fireEvent.contextMenu(button)

    // abState should be null after deactivation
    expect(getV1Chain()[0].abState).toBeNull()
    unmount()
  })

  it('tooltip on active AB switch mentions right-click to deactivate', () => {
    useProjectStore.getState().activateAB(V1_TRACK_ID, 'fx-1')

    const { getByTestId, unmount } = render(
      createElement(ABSwitch, { effectId: 'fx-1', isActive: true, activeSlot: 'a' }),
    )

    const button = getByTestId('ab-switch')
    expect(button.getAttribute('title')).toContain('Right-click to deactivate')
    unmount()
  })
})
