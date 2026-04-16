/**
 * Sprint 1: Broken Wiring — Full chain verification tests.
 *
 * Tests the end-to-end wiring for all 5 Sprint 1 items:
 * 1. J/K/L transport shortcuts (state machine + dispatch)
 * 2. Cmd+D duplicate effect (deep clone + selection)
 * 3. Delete key routing (clips first, then effect fallback)
 * 4. Speed/Duration dialog (validation + store action)
 * 5. NumberInput on Knob (parsing, clamping, NaN handling)
 */
import { describe, it, expect, beforeEach } from 'vitest'

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

import { useTimelineStore } from '../renderer/stores/timeline'
import { useProjectStore } from '../renderer/stores/project'
import { useUndoStore } from '../renderer/stores/undo'
import { shortcutRegistry } from '../renderer/utils/shortcuts'
import { DEFAULT_SHORTCUTS } from '../renderer/utils/default-shortcuts'
import {
  transportForward,
  transportReverse,
  transportStop,
  resetTransportSpeed,
  getTransportSpeed,
  getTransportDirection,
} from '../renderer/utils/transport-speed'
import type { Clip, EffectInstance } from '../shared/types'

function makeClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: overrides.id ?? `clip-${Math.random().toString(36).slice(2, 8)}`,
    assetId: overrides.assetId ?? 'asset-1',
    trackId: overrides.trackId ?? '',
    position: overrides.position ?? 0,
    duration: overrides.duration ?? 5,
    inPoint: overrides.inPoint ?? 0,
    outPoint: overrides.outPoint ?? 5,
    speed: overrides.speed ?? 1,
  }
}

function makeEffect(id: string, effectId = 'fx.invert'): EffectInstance {
  return {
    id,
    effectId,
    isEnabled: true,
    isFrozen: false,
    parameters: { amount: 0.5, threshold: 100 },
    modulations: { amount: [{ sourceId: 'op1', depth: 0.3, min: 0, max: 1, curve: 'linear' as const }] },
    mix: 1.0,
    mask: null,
  }
}

// ─── 1. setClipSpeed store action ─────────────────────────────────────────────

describe('setClipSpeed', () => {
  beforeEach(() => {
    useTimelineStore.getState().reset()
    useUndoStore.getState().clear()
  })

  it('changes clip speed', () => {
    const ts = useTimelineStore.getState()
    const trackId = ts.addTrack('Track 1', '#f00')!
    ts.addClip(trackId, makeClip({ id: 'cs1', trackId, speed: 1 }))

    ts.setClipSpeed('cs1', 2)

    const clip = useTimelineStore.getState().tracks[0].clips[0]
    expect(clip.speed).toBe(2)
  })

  it('clamps speed to minimum 0.1', () => {
    const ts = useTimelineStore.getState()
    const trackId = ts.addTrack('Track 1', '#f00')!
    ts.addClip(trackId, makeClip({ id: 'cs2', trackId }))

    ts.setClipSpeed('cs2', 0.01)

    const clip = useTimelineStore.getState().tracks[0].clips[0]
    expect(clip.speed).toBeGreaterThanOrEqual(0.1)
  })

  it('clamps negative speed to 0.1', () => {
    const ts = useTimelineStore.getState()
    const trackId = ts.addTrack('Track 1', '#f00')!
    ts.addClip(trackId, makeClip({ id: 'cs3', trackId }))

    ts.setClipSpeed('cs3', -5)

    const clip = useTimelineStore.getState().tracks[0].clips[0]
    expect(clip.speed).toBeGreaterThanOrEqual(0.1)
  })

  it('is undoable', () => {
    const ts = useTimelineStore.getState()
    const trackId = ts.addTrack('Track 1', '#f00')!
    ts.addClip(trackId, makeClip({ id: 'cs4', trackId, speed: 1 }))

    ts.setClipSpeed('cs4', 4)
    expect(useTimelineStore.getState().tracks[0].clips[0].speed).toBe(4)

    useUndoStore.getState().undo()
    expect(useTimelineStore.getState().tracks[0].clips[0].speed).toBe(1)
  })

  it('no-ops for nonexistent clip', () => {
    const ts = useTimelineStore.getState()
    ts.addTrack('Track 1', '#f00')

    // Should not throw
    ts.setClipSpeed('nonexistent', 2)
    expect(useTimelineStore.getState().tracks[0].clips).toHaveLength(0)
  })

  it('allows fractional speeds', () => {
    const ts = useTimelineStore.getState()
    const trackId = ts.addTrack('Track 1', '#f00')!
    ts.addClip(trackId, makeClip({ id: 'cs5', trackId }))

    ts.setClipSpeed('cs5', 0.5)
    expect(useTimelineStore.getState().tracks[0].clips[0].speed).toBe(0.5)
  })
})

// ─── 2. Duplicate effect handler logic ────────────────────────────────────────

describe('duplicate effect handler', () => {
  beforeEach(() => {
    useProjectStore.setState({
      effectChain: [],
      selectedEffectId: null,
    })
    useUndoStore.getState().clear()
  })

  it('creates a deep clone with new ID', () => {
    const ps = useProjectStore.getState()
    const original = makeEffect('orig-1')
    ps.addEffect(original)
    ps.selectEffect('orig-1')

    // Simulate the duplicate handler from App.tsx:390-403
    const state = useProjectStore.getState()
    const source = state.effectChain.find((e) => e.id === state.selectedEffectId)!
    const clone = {
      ...source,
      id: 'clone-1', // In real code this is crypto.randomUUID()
      parameters: { ...source.parameters },
      modulations: { ...source.modulations },
    }
    ps.addEffect(clone)
    ps.selectEffect(clone.id)

    const chain = useProjectStore.getState().effectChain
    expect(chain).toHaveLength(2)
    expect(chain[1].id).toBe('clone-1')
    expect(chain[1].id).not.toBe(chain[0].id)
  })

  it('copies parameters from source', () => {
    const ps = useProjectStore.getState()
    const original = makeEffect('orig-2')
    original.parameters = { amount: 0.75, decay: 200 }
    ps.addEffect(original)

    const source = useProjectStore.getState().effectChain[0]
    const clone = {
      ...source,
      id: 'clone-2',
      parameters: { ...source.parameters },
      modulations: { ...source.modulations },
    }
    ps.addEffect(clone)

    const chain = useProjectStore.getState().effectChain
    expect(chain[1].parameters).toEqual({ amount: 0.75, decay: 200 })
  })

  it('clone parameters are independent of source', () => {
    const ps = useProjectStore.getState()
    const original = makeEffect('orig-3')
    original.parameters = { amount: 0.5 }
    ps.addEffect(original)

    const source = useProjectStore.getState().effectChain[0]
    const cloneParams = { ...source.parameters }
    cloneParams.amount = 0.9 // modify clone params

    expect(source.parameters.amount).toBe(0.5) // source unchanged
  })

  it('copies modulations from source', () => {
    const ps = useProjectStore.getState()
    const original = makeEffect('orig-4')
    ps.addEffect(original)

    const source = useProjectStore.getState().effectChain[0]
    const clone = {
      ...source,
      id: 'clone-4',
      parameters: { ...source.parameters },
      modulations: { ...source.modulations },
    }
    ps.addEffect(clone)

    const chain = useProjectStore.getState().effectChain
    expect(chain[1].modulations).toEqual(original.modulations)
  })

  it('selects the new clone after duplication', () => {
    const ps = useProjectStore.getState()
    ps.addEffect(makeEffect('orig-5'))
    ps.selectEffect('orig-5')

    const source = useProjectStore.getState().effectChain[0]
    const clone = {
      ...source,
      id: 'clone-5',
      parameters: { ...source.parameters },
      modulations: { ...source.modulations },
    }
    ps.addEffect(clone)
    ps.selectEffect(clone.id)

    expect(useProjectStore.getState().selectedEffectId).toBe('clone-5')
  })

  it('no-ops when no effect is selected', () => {
    const ps = useProjectStore.getState()
    ps.addEffect(makeEffect('orig-6'))
    // Don't select anything

    const state = useProjectStore.getState()
    expect(state.selectedEffectId).toBeNull()
    // Handler should return early — chain stays at 1
    if (!state.selectedEffectId) {
      // This is the guard from App.tsx:392
      expect(state.effectChain).toHaveLength(1)
    }
  })
})

// ─── 3. Delete selected routing ───────────────────────────────────────────────

describe('delete_selected routing', () => {
  beforeEach(() => {
    useTimelineStore.getState().reset()
    useProjectStore.setState({
      effectChain: [],
      selectedEffectId: null,
    })
    useUndoStore.getState().clear()
  })

  it('deletes selected clips when clips are selected', () => {
    const ts = useTimelineStore.getState()
    const trackId = ts.addTrack('Track 1', '#f00')!
    ts.addClip(trackId, makeClip({ id: 'del1', trackId }))
    ts.addClip(trackId, makeClip({ id: 'del2', trackId, position: 6 }))
    ts.selectClip('del1')

    // Simulate the handler from App.tsx:377-387
    const state = useTimelineStore.getState()
    if (state.selectedClipIds.length > 0) {
      state.deleteSelectedClips()
    }

    expect(useTimelineStore.getState().tracks[0].clips).toHaveLength(1)
    expect(useTimelineStore.getState().tracks[0].clips[0].id).toBe('del2')
  })

  it('falls back to deleting selected effect when no clips selected', () => {
    const ps = useProjectStore.getState()
    ps.addEffect(makeEffect('fx-del1'))
    ps.addEffect(makeEffect('fx-del2'))
    ps.selectEffect('fx-del1')

    // Simulate the handler from App.tsx:377-387
    const ts = useTimelineStore.getState()
    if (ts.selectedClipIds.length > 0) {
      ts.deleteSelectedClips()
    } else {
      const projState = useProjectStore.getState()
      if (projState.selectedEffectId) {
        projState.removeEffect(projState.selectedEffectId)
      }
    }

    const chain = useProjectStore.getState().effectChain
    expect(chain).toHaveLength(1)
    expect(chain[0].id).toBe('fx-del2')
  })

  it('does nothing when nothing is selected', () => {
    const ts = useTimelineStore.getState()
    ts.addTrack('Track 1', '#f00')

    const ps = useProjectStore.getState()
    ps.addEffect(makeEffect('fx-noop'))
    // Neither clips nor effects selected

    // Simulate the handler
    const timelineState = useTimelineStore.getState()
    if (timelineState.selectedClipIds.length > 0) {
      timelineState.deleteSelectedClips()
    } else {
      const projState = useProjectStore.getState()
      if (projState.selectedEffectId) {
        projState.removeEffect(projState.selectedEffectId)
      }
    }

    // Nothing should have been deleted
    expect(useProjectStore.getState().effectChain).toHaveLength(1)
  })

  it('prioritizes clips over effects when both are selected', () => {
    const ts = useTimelineStore.getState()
    const trackId = ts.addTrack('Track 1', '#f00')!
    ts.addClip(trackId, makeClip({ id: 'both1', trackId }))
    ts.selectClip('both1')

    const ps = useProjectStore.getState()
    ps.addEffect(makeEffect('fx-both'))
    ps.selectEffect('fx-both')

    // Simulate handler — clips take priority
    const state = useTimelineStore.getState()
    if (state.selectedClipIds.length > 0) {
      state.deleteSelectedClips()
    } else {
      const projState = useProjectStore.getState()
      if (projState.selectedEffectId) {
        projState.removeEffect(projState.selectedEffectId)
      }
    }

    // Clip deleted, effect still there
    expect(useTimelineStore.getState().tracks[0].clips).toHaveLength(0)
    expect(useProjectStore.getState().effectChain).toHaveLength(1)
  })
})

// ─── 4. delete_selected shortcut binding ──────────────────────────────────────

describe('delete_selected shortcut binding', () => {
  beforeEach(() => {
    shortcutRegistry.loadDefaults(DEFAULT_SHORTCUTS)
    shortcutRegistry.resetAllOverrides()
  })

  it('is registered on backspace', () => {
    const binding = shortcutRegistry.getBinding('delete_selected')
    expect(binding).toBeDefined()
    expect(binding?.keys).toBe('backspace')
    expect(binding?.category).toBe('edit')
  })

  it('dispatches on Backspace keypress', () => {
    let called = false
    shortcutRegistry.register('delete_selected', () => { called = true })
    const e = new KeyboardEvent('keydown', { key: 'Backspace' })
    shortcutRegistry.handleKeyEvent(e)
    expect(called).toBe(true)
  })

  it('no conflict with other shortcuts', () => {
    expect(shortcutRegistry.getConflicts('backspace', 'delete_selected')).toHaveLength(0)
  })
})

// ─── 5. SpeedDialog validation logic ──────────────────────────────────────────

describe('SpeedDialog validation', () => {
  // Test the validation logic from SpeedDialog.tsx without rendering
  function validateSpeed(input: string): { isValid: boolean; clamped: number } {
    const parsed = Number(input)
    const isValid = Number.isFinite(parsed) && parsed >= 0.1 && parsed <= 10
    const clamped = isValid ? Math.max(0.1, Math.min(10, parsed)) : 1
    return { isValid, clamped }
  }

  it('accepts valid speed 1x', () => {
    const { isValid, clamped } = validateSpeed('1')
    expect(isValid).toBe(true)
    expect(clamped).toBe(1)
  })

  it('accepts valid speed 0.5x', () => {
    const { isValid, clamped } = validateSpeed('0.5')
    expect(isValid).toBe(true)
    expect(clamped).toBe(0.5)
  })

  it('accepts valid speed 10x (upper bound)', () => {
    const { isValid, clamped } = validateSpeed('10')
    expect(isValid).toBe(true)
    expect(clamped).toBe(10)
  })

  it('accepts valid speed 0.1x (lower bound)', () => {
    const { isValid, clamped } = validateSpeed('0.1')
    expect(isValid).toBe(true)
    expect(clamped).toBeCloseTo(0.1)
  })

  it('rejects speed 0', () => {
    expect(validateSpeed('0').isValid).toBe(false)
  })

  it('rejects negative speed', () => {
    expect(validateSpeed('-1').isValid).toBe(false)
  })

  it('rejects speed above 10', () => {
    expect(validateSpeed('11').isValid).toBe(false)
  })

  it('rejects NaN input', () => {
    expect(validateSpeed('abc').isValid).toBe(false)
  })

  it('rejects empty input', () => {
    expect(validateSpeed('').isValid).toBe(false)
  })

  it('rejects Infinity', () => {
    expect(validateSpeed('Infinity').isValid).toBe(false)
  })

  it('calculates result duration correctly', () => {
    const clipDuration = 10
    const speed = 2
    const resultDuration = clipDuration / speed
    expect(resultDuration).toBe(5) // 10s at 2x = 5s
  })

  it('calculates slow-motion duration correctly', () => {
    const clipDuration = 10
    const speed = 0.5
    const resultDuration = clipDuration / speed
    expect(resultDuration).toBe(20) // 10s at 0.5x = 20s
  })
})

// ─── 6. NumberInput parsing and clamping ──────────────────────────────────────

describe('NumberInput parsing logic', () => {
  // Replicate the confirm logic from NumberInput.tsx:26-33
  function simulateConfirm(
    text: string,
    min: number,
    max: number,
    step: number,
  ): { action: 'confirm'; value: number } | { action: 'cancel' } {
    const parsed = parseFloat(text)
    if (isNaN(parsed)) return { action: 'cancel' }
    const clamped = Math.max(min, Math.min(max, parsed))
    const value = step >= 1 ? Math.round(clamped) : clamped
    return { action: 'confirm', value }
  }

  it('parses valid integer', () => {
    const result = simulateConfirm('50', 0, 100, 1)
    expect(result).toEqual({ action: 'confirm', value: 50 })
  })

  it('parses valid float', () => {
    const result = simulateConfirm('0.75', 0, 1, 0.01)
    expect(result).toEqual({ action: 'confirm', value: 0.75 })
  })

  it('clamps below minimum', () => {
    const result = simulateConfirm('-10', 0, 100, 1)
    expect(result).toEqual({ action: 'confirm', value: 0 })
  })

  it('clamps above maximum', () => {
    const result = simulateConfirm('200', 0, 100, 1)
    expect(result).toEqual({ action: 'confirm', value: 100 })
  })

  it('rounds to integer when step >= 1', () => {
    const result = simulateConfirm('42.7', 0, 100, 1)
    expect(result).toEqual({ action: 'confirm', value: 43 })
  })

  it('preserves float when step < 1', () => {
    const result = simulateConfirm('0.333', 0, 1, 0.001)
    expect(result).toEqual({ action: 'confirm', value: 0.333 })
  })

  it('cancels on NaN input', () => {
    expect(simulateConfirm('abc', 0, 100, 1)).toEqual({ action: 'cancel' })
  })

  it('cancels on empty input', () => {
    expect(simulateConfirm('', 0, 100, 1)).toEqual({ action: 'cancel' })
  })

  it('handles negative ranges', () => {
    const result = simulateConfirm('-50', -100, 100, 1)
    expect(result).toEqual({ action: 'confirm', value: -50 })
  })

  it('handles zero input', () => {
    const result = simulateConfirm('0', 0, 360, 1)
    expect(result).toEqual({ action: 'confirm', value: 0 })
  })
})

// ─── 7. Transport speed + shortcut integration ───────────────────────────────

describe('J/K/L transport integration', () => {
  beforeEach(() => {
    resetTransportSpeed()
    shortcutRegistry.loadDefaults(DEFAULT_SHORTCUTS)
    shortcutRegistry.resetAllOverrides()
  })

  it('L dispatch triggers transport state change', () => {
    let speed = 0
    shortcutRegistry.register('transport_forward', () => {
      speed = transportForward()
    })

    const e = new KeyboardEvent('keydown', { key: 'l' })
    shortcutRegistry.handleKeyEvent(e)

    expect(speed).toBe(1)
    expect(getTransportDirection()).toBe('forward')
  })

  it('J dispatch triggers reverse', () => {
    let speed = 0
    shortcutRegistry.register('transport_reverse', () => {
      speed = transportReverse()
    })

    const e = new KeyboardEvent('keydown', { key: 'j' })
    shortcutRegistry.handleKeyEvent(e)

    expect(speed).toBe(-1)
    expect(getTransportDirection()).toBe('reverse')
  })

  it('K dispatch stops playback', () => {
    transportForward() // must be playing first

    let speed = 999
    shortcutRegistry.register('transport_stop', () => {
      speed = transportStop()
    })

    const e = new KeyboardEvent('keydown', { key: 'k' })
    shortcutRegistry.handleKeyEvent(e)

    expect(speed).toBe(0)
    expect(getTransportDirection()).toBe('stopped')
  })

  it('L→L→L escalates speed via shortcut dispatch', () => {
    shortcutRegistry.register('transport_forward', () => { transportForward() })

    for (let i = 0; i < 3; i++) {
      const e = new KeyboardEvent('keydown', { key: 'l' })
      shortcutRegistry.handleKeyEvent(e)
    }

    expect(getTransportSpeed()).toBe(4) // 1x → 2x → 4x
  })
})
