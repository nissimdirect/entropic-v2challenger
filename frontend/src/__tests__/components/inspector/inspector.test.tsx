/**
 * P3.3 — Polymorphic inspector tests.
 *
 * Covers:
 *   - 8 named state tests ("inspector renders <state> info")
 *   - 2 negative tests:
 *       "unknown/unmapped selection type renders the none state — no crash, no blank shell"
 *       "selector returns stable empty TrackStats for a deleted trackId (stale selection)"
 *   - 2 integration tests:
 *       "hover slot survives selection change"
 *       "selection change remounts body via key"
 *
 * Zero store writes from inspector code (read-only through selectors).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import React from 'react'

// Mock window.entropic before store imports
;(globalThis as any).window = {
  entropic: {
    onEngineStatus: () => {},
    sendCommand: async () => ({ ok: true }),
    selectFile: async () => null,
    selectSavePath: async () => null,
    onExportProgress: () => {},
  },
}

import { useTimelineStore } from '../../../renderer/stores/timeline'
import { useProjectStore } from '../../../renderer/stores/project'
import { useOperatorStore } from '../../../renderer/stores/operators'
import { getTrackStats } from '../../../renderer/selectors/trackStats'
import Inspector from '../../../renderer/components/inspector/Inspector'
import type { SelectionState } from '../../../renderer/components/inspector/selectionState'
import type { EffectInstance } from '../../../shared/types'

// ─── Store reset helpers ──────────────────────────────────────────────────────

function makeEffect(id: string, effectId = 'fx.invert'): EffectInstance {
  return {
    id,
    effectId,
    isEnabled: true,
    isFrozen: false,
    parameters: { amount: 0.5 },
    modulations: {},
    mix: 1.0,
    mask: null,
  }
}

function resetStores() {
  useTimelineStore.getState().reset()
  useProjectStore.setState({
    assets: {},
    selectedEffectId: null,
    currentFrame: 0,
    totalFrames: 0,
    isIngesting: false,
    ingestError: null,
    projectPath: null,
    projectName: 'Test',
  })
  useOperatorStore.setState({ operators: [] })
}

beforeEach(() => {
  resetStores()
  cleanup()
})

// ─── 8 state tests ────────────────────────────────────────────────────────────

describe('inspector renders none info', () => {
  it('inspector renders none info — no selection shows none state', () => {
    const { getByTestId } = render(<Inspector />)
    expect(getByTestId('inspector-state-none')).toBeTruthy()
  })
})

describe('inspector renders track info', () => {
  it('inspector renders track info — selected track shows track state', () => {
    const trackId = useTimelineStore.getState().addTrack('Test Track', '#ff0000')!
    useTimelineStore.getState().selectTrack(trackId)
    const { getByTestId } = render(<Inspector />)
    expect(getByTestId('inspector-state-track')).toBeTruthy()
    expect(getByTestId('inspector-track-name').textContent).toBe('Test Track')
  })
})

describe('inspector renders clip info', () => {
  it('inspector renders clip info — single clip selected shows clip state', () => {
    const trackId = useTimelineStore.getState().addTrack('V1', '#ff0000')!
    useTimelineStore.getState().addClip(trackId, {
      id: 'clip-1',
      assetId: 'asset-1',
      trackId,
      position: 0,
      duration: 5,
      inPoint: 0,
      outPoint: 5,
      speed: 1,
    })
    useTimelineStore.getState().selectClip('clip-1')
    const { getByTestId } = render(<Inspector />)
    expect(getByTestId('inspector-state-clip')).toBeTruthy()
    expect(getByTestId('inspector-clip-duration').textContent).toContain('5.00s')
  })
})

describe('inspector renders multi info', () => {
  it('inspector renders multi info — multiple clips selected shows multi state', () => {
    const trackId = useTimelineStore.getState().addTrack('V1', '#ff0000')!
    useTimelineStore.getState().addClip(trackId, {
      id: 'clip-1', assetId: 'a1', trackId, position: 0, duration: 5, inPoint: 0, outPoint: 5, speed: 1,
    })
    useTimelineStore.getState().addClip(trackId, {
      id: 'clip-2', assetId: 'a2', trackId, position: 5, duration: 5, inPoint: 0, outPoint: 5, speed: 1,
    })
    // Select multiple clips by toggling
    useTimelineStore.getState().selectClip('clip-1')
    useTimelineStore.getState().toggleClipSelection('clip-2')
    const { getByTestId } = render(<Inspector />)
    expect(getByTestId('inspector-state-multi')).toBeTruthy()
    expect(getByTestId('inspector-multi-count').textContent).toContain('2 clips')
  })
})

describe('inspector renders effect info', () => {
  it('inspector renders effect info — selected effect shows effect state', () => {
    const trackId = useTimelineStore.getState().addTrack('V1', '#ff0000')!
    const fx = makeEffect('fx-1')
    useProjectStore.getState().addEffect(trackId, fx)
    useProjectStore.getState().selectEffect('fx-1')
    const { getByTestId } = render(<Inspector />)
    expect(getByTestId('inspector-state-effect')).toBeTruthy()
    expect(getByTestId('inspector-effect-id').textContent).toBe('fx.invert')
  })
})

describe('inspector renders operator info', () => {
  it('inspector renders operator info — operator selection override shows operator state', () => {
    const op = { id: 'op-1', type: 'lfo' as const, label: 'LFO 1', isEnabled: true, parameters: { waveform: 'sine' }, processing: [], mappings: [] }
    useOperatorStore.setState({ operators: [op] })
    const selection: SelectionState = { type: 'operator', operatorId: 'op-1' }
    const { getByTestId } = render(<Inspector selectionOverride={selection} />)
    expect(getByTestId('inspector-state-operator')).toBeTruthy()
    expect(getByTestId('inspector-operator-label').textContent).toBe('LFO 1')
  })
})

describe('inspector renders marker info', () => {
  it('inspector renders marker info — marker selection override shows marker state', () => {
    useTimelineStore.getState().addMarker(3.5, 'Section A', '#00ff00')
    const markers = useTimelineStore.getState().markers
    const markerId = markers[0].id
    const selection: SelectionState = { type: 'marker', markerId }
    const { getByTestId } = render(<Inspector selectionOverride={selection} />)
    expect(getByTestId('inspector-state-marker')).toBeTruthy()
    expect(getByTestId('inspector-marker-label').textContent).toBe('Section A')
    expect(getByTestId('inspector-marker-time').textContent).toContain('3.50s')
  })
})

describe('inspector renders tool info', () => {
  it('inspector renders tool info — tool selection override shows tool state', () => {
    const selection: SelectionState = { type: 'tool', toolMode: 'razor' }
    const { getByTestId } = render(<Inspector selectionOverride={selection} />)
    expect(getByTestId('inspector-state-tool')).toBeTruthy()
    expect(getByTestId('inspector-tool-mode').textContent).toBe('razor')
  })
})

// ─── Negative tests ───────────────────────────────────────────────────────────

describe('negative: unknown type → none state, no crash', () => {
  it('unknown/unmapped selection type renders the none state — no crash, no blank shell', () => {
    // Force an unknown type via cast — defensive default in Inspector switch
    const selection = { type: 'unknown-future-type' } as unknown as SelectionState
    let renderErr: unknown = null
    try {
      const { getByTestId } = render(<Inspector selectionOverride={selection} />)
      // Must render the none state fallback, not crash
      expect(getByTestId('inspector-state-none')).toBeTruthy()
    } catch (err) {
      renderErr = err
    }
    expect(renderErr).toBeNull()
  })
})

describe('negative: stale selection → stable empty TrackStats', () => {
  it('selector returns stable empty TrackStats for a deleted trackId (stale selection)', () => {
    // Create a track, then delete it — trackId becomes stale
    const trackId = useTimelineStore.getState().addTrack('Temp', '#ffffff')!
    useTimelineStore.getState().removeTrack(trackId)

    const stats = getTrackStats(trackId)

    // Must return a stable empty shape — no crash, no throw
    expect(stats).toBeDefined()
    expect(stats.effectCount).toBe(0)
    expect(stats.clipCount).toBe(0)
    expect(stats.effectChain).toEqual([])
    // trackId field is preserved (stable identity for stale check callers)
    expect(stats.trackId).toBe(trackId)
  })
})

// ─── Integration tests ────────────────────────────────────────────────────────

describe('integration: hover slot survives selection change', () => {
  it('hover slot survives selection change', () => {
    // Render with no selection — hover help is outside the key= subtree
    const { getByTestId, rerender } = render(<Inspector />)
    const hoverHelpEl = getByTestId('inspector-hover-help')
    expect(hoverHelpEl).toBeTruthy()

    // Change selection — InspectorBody remounts, but HoverHelp must survive
    const trackId = useTimelineStore.getState().addTrack('V1', '#ff0000')!
    useTimelineStore.getState().selectTrack(trackId)
    rerender(<Inspector />)

    // hover-help element must still be present (same DOM slot, not remounted away)
    const hoverHelpAfter = getByTestId('inspector-hover-help')
    expect(hoverHelpAfter).toBeTruthy()
    // Track state rendered after change
    expect(getByTestId('inspector-state-track')).toBeTruthy()
  })
})

describe('integration: selection change remounts body via key', () => {
  it('selection change remounts body via key', () => {
    // Start with track selection
    const trackId = useTimelineStore.getState().addTrack('V1', '#ff0000')!
    useTimelineStore.getState().selectTrack(trackId)
    const { getByTestId, queryByTestId, rerender } = render(<Inspector />)
    expect(getByTestId('inspector-state-track')).toBeTruthy()
    expect(queryByTestId('inspector-state-none')).toBeNull()

    // Clear selection — body should remount to none state
    useTimelineStore.getState().selectTrack(null)
    useProjectStore.setState({ selectedEffectId: null })
    rerender(<Inspector />)

    expect(getByTestId('inspector-state-none')).toBeTruthy()
    expect(queryByTestId('inspector-state-track')).toBeNull()
  })
})
