/**
 * AutomationToolbar tests.
 *
 * Audit queue items G.24/G.25/G.26/G.27 + P.12/P.13/P.14/P.15 (parallel
 * session UAT 2026-05-16) were marked ❌ NOT TESTED for the four buttons:
 *   + Lane / + Trigger / Simplify / Clear
 *
 * The toolbar is fully implemented but had zero component test coverage.
 * This locks the button states (disabled when no track armed), the
 * arm-hint text (post-F-0516-10: hint referenced "R", not "A"; W1-2:
 * "R" itself was replaced by icon-kit's record-arm dot glyph), and the
 * param-picker open/close flow.
 *
 * D8/PK.C (2026-07-30): Simplify/Clear/Shape (and Flatten/Ramp, which never
 * lived here as strip buttons in the first place — see AutomationLane's
 * curve-ops test for why) moved OFF this strip onto the lane's own
 * right-click context menu — see automation-lane-curve-ops.test.tsx for
 * their (relocated) functional coverage. This file's "strip membership"
 * block below is the negative-assertion half of that move: the strip must
 * render exactly 8 buttons in exactly 2 clusters and contain NONE of them.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'

const mockEntropic = {
  sendCommand: vi.fn().mockResolvedValue({ ok: true }),
  onEngineStatus: vi.fn(),
}
;(globalThis as unknown as { window: unknown }).window = { entropic: mockEntropic }

import AutomationToolbar from '../../renderer/components/automation/AutomationToolbar'
import { useAutomationStore } from '../../renderer/stores/automation'
import { useTimelineStore } from '../../renderer/stores/timeline'
import { useEffectsStore } from '../../renderer/stores/effects'

beforeEach(() => {
  useAutomationStore.getState().resetAutomation()
  useTimelineStore.getState().reset()
  // Reset effects registry to a small known set.
  useEffectsStore.setState({
    registry: [
      {
        id: 'fx.invert',
        name: 'Invert',
        category: 'color',
        params: {
          amount: { type: 'float', label: 'Amount', default: 1, min: 0, max: 1 },
        },
      },
    ],
  } as Partial<ReturnType<typeof useEffectsStore.getState>> as never)
})

afterEach(() => {
  cleanup()
})

function armATrack() {
  useTimelineStore.getState().addTrack('Track A', '#ff0000')
  const t = useTimelineStore.getState().tracks[0]
  useAutomationStore.setState({ armedTrackId: t.id })
  return t
}

describe('AutomationToolbar — mode selector', () => {
  it('renders all four mode buttons R / L / T / D', () => {
    const { container } = render(<AutomationToolbar />)
    const modeButtons = Array.from(container.querySelectorAll('.auto-toolbar__mode-btn'))
    const labels = modeButtons.map((b) => b.textContent)
    expect(labels).toEqual(['R', 'L', 'T', 'D'])
  })

  it('default mode is "read" — R has active modifier class', () => {
    const { container } = render(<AutomationToolbar />)
    // Scope to the mode-button group so we don't also match the "R" in the
    // hint text ("Click R on a track to arm").
    const modeButtons = container.querySelectorAll('.auto-toolbar__mode-btn')
    const r = Array.from(modeButtons).find((b) => b.textContent === 'R') as HTMLElement
    expect(r).toBeTruthy()
    expect(r.className).toContain('auto-toolbar__mode-btn--active')
  })

  it('clicking a mode button sets that mode in the store', () => {
    const { container } = render(<AutomationToolbar />)
    const modeButtons = Array.from(container.querySelectorAll('.auto-toolbar__mode-btn'))
    const findMode = (label: string) =>
      modeButtons.find((b) => b.textContent === label) as HTMLElement
    fireEvent.click(findMode('L'))
    expect(useAutomationStore.getState().mode).toBe('latch')
    fireEvent.click(findMode('D'))
    expect(useAutomationStore.getState().mode).toBe('draw')
  })
})

// A4 — continuous-lane overdub toggle.
describe('AutomationToolbar — overdub toggle', () => {
  it('renders the Overdub toggle button, inactive by default (replace mode)', () => {
    const { container } = render(<AutomationToolbar />)
    const btn = container.querySelector('[data-testid="overdub-toggle-btn"]') as HTMLElement
    expect(btn).toBeTruthy()
    expect(btn.textContent).toBe('Overdub')
    expect(btn.className).not.toContain('auto-toolbar__btn--active')
    expect(btn.getAttribute('aria-pressed')).toBe('false')
  })

  it('is NOT gated on armedTrackId — clickable with no track armed', () => {
    const { container } = render(<AutomationToolbar />)
    const btn = container.querySelector('[data-testid="overdub-toggle-btn"]') as HTMLButtonElement
    expect(btn.disabled).toBe(false)
  })

  it('clicking toggles recordMode to "overdub" and back to "replace"', () => {
    const { container } = render(<AutomationToolbar />)
    const btn = container.querySelector('[data-testid="overdub-toggle-btn"]') as HTMLElement
    fireEvent.click(btn)
    expect(useAutomationStore.getState().recordMode).toBe('overdub')
    expect(btn.className).toContain('auto-toolbar__btn--active')
    expect(btn.getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(btn)
    expect(useAutomationStore.getState().recordMode).toBe('replace')
    expect(btn.className).not.toContain('auto-toolbar__btn--active')
    expect(btn.getAttribute('aria-pressed')).toBe('false')
  })
})

describe('AutomationToolbar — arm hint references the record-arm dot (W1-2)', () => {
  it('when no track is armed, hint renders the record-arm dot glyph, not the letter R', () => {
    const { container } = render(<AutomationToolbar />)
    const hint = container.querySelector('.auto-toolbar__hint')
    expect(hint).toBeTruthy()
    // W1-2: the record-arm affordance is icon-kit's dot glyph — the hint no
    // longer spells out a bare "R" (which collided with the Read-mode label).
    expect(hint!.querySelector('svg')).toBeTruthy()
    expect(hint!.textContent).not.toContain('R')
    // F-0516-10: must still NOT reference the old "A" label either.
    expect(hint!.textContent).not.toContain('A on a track')
  })

  it('when no track is armed, "Add Lane" tooltip references the record-arm dot, not the letter R', () => {
    const { container } = render(<AutomationToolbar />)
    const btn = container.querySelector('[data-testid="add-lane-btn"]') as HTMLElement
    expect(btn.getAttribute('title')).toContain('record-arm dot')
    expect(btn.getAttribute('title')).not.toContain('R button')
    expect(btn.getAttribute('title')).not.toContain('A button')
  })
})

describe('AutomationToolbar — buttons disabled until track armed', () => {
  it('+ Lane and + Trigger are disabled when no track is armed', () => {
    const { container } = render(<AutomationToolbar />)
    expect((container.querySelector('[data-testid="add-lane-btn"]') as HTMLButtonElement).disabled).toBe(true)
    expect((container.querySelector('[data-testid="add-trigger-btn"]') as HTMLButtonElement).disabled).toBe(true)
  })

  it('+ Lane and + Trigger enable when a track is armed', () => {
    armATrack()
    const { container } = render(<AutomationToolbar />)
    expect((container.querySelector('[data-testid="add-lane-btn"]') as HTMLButtonElement).disabled).toBe(false)
    expect((container.querySelector('[data-testid="add-trigger-btn"]') as HTMLButtonElement).disabled).toBe(false)
  })
})

// D8/PK.C — the amended hard oracle: strip renders exactly 8 buttons in
// exactly 2 grouping containers (Mode/Record) and contains NONE of
// Flatten/Ramp/Shape/Simplify/Clear.
describe('AutomationToolbar — strip membership (D8/PK.C)', () => {
  it('renders exactly 8 buttons total, split 4/4 across .auto-toolbar__modes and .auto-toolbar__record', () => {
    const { container } = render(<AutomationToolbar />)
    const modeButtons = container.querySelectorAll('.auto-toolbar__modes > button')
    const recordButtons = container.querySelectorAll('.auto-toolbar__record > button')
    expect(modeButtons).toHaveLength(4)
    expect(recordButtons).toHaveLength(4)
    expect(modeButtons.length + recordButtons.length).toBe(8)
  })

  it('the record cluster carries its data-testid and sits in exactly 2 top-level grouping containers', () => {
    const { container } = render(<AutomationToolbar />)
    expect(container.querySelector('[data-testid="auto-toolbar-record-cluster"]')).toBeTruthy()
    const root = container.querySelector('.auto-toolbar')!
    const groups = root.querySelectorAll(':scope > .auto-toolbar__modes, :scope > .auto-toolbar__record')
    expect(groups).toHaveLength(2)
  })

  it('contains NONE of Flatten/Ramp/Shape/Simplify/Clear — they moved to the lane context menu', () => {
    armATrack()
    const { container } = render(<AutomationToolbar />)
    const labels = Array.from(container.querySelectorAll('button')).map((b) => b.textContent)
    for (const removed of ['Flatten', 'Ramp', 'Shape', 'Simplify', 'Clear']) {
      expect(labels).not.toContain(removed)
    }
    // Also gone: the picker/testids those buttons used to open.
    expect(container.querySelector('[data-testid="insert-shape-btn"]')).toBeNull()
    expect(container.querySelector('[data-testid="flatten-selection-btn"]')).toBeNull()
    expect(container.querySelector('[data-testid="ramp-selection-btn"]')).toBeNull()
    expect(container.querySelector('[data-testid="shape-picker"]')).toBeNull()
  })
})

describe('AutomationToolbar — armed track label', () => {
  it('shows "Armed: <name>" when a track is armed', () => {
    armATrack()
    const { container } = render(<AutomationToolbar />)
    const armed = container.querySelector('.auto-toolbar__armed')
    expect(armed).toBeTruthy()
    expect(armed!.textContent).toContain('Track A')
  })

  it('hides "Armed:" label when nothing armed', () => {
    const { container } = render(<AutomationToolbar />)
    expect(container.querySelector('.auto-toolbar__armed')).toBeNull()
  })
})

describe('AutomationToolbar — + Lane picker flow (G.24 / P.12)', () => {
  it('click + Lane opens the picker', () => {
    const t = armATrack()
    // Add an effect to the track so picker has options
    useTimelineStore.setState({
      tracks: useTimelineStore.getState().tracks.map((tr) =>
        tr.id === t.id ? { ...tr, effectChain: [{ id: 'fx1', effectId: 'fx.invert', isEnabled: true, isFrozen: false, parameters: {}, modulations: {}, mix: 1, mask: null }] } : tr,
      ),
    })
    const { container, getByText } = render(<AutomationToolbar />)
    fireEvent.click(container.querySelector('[data-testid="add-lane-btn"]') as HTMLElement)
    expect(container.querySelector('[data-testid="param-picker"]')).toBeTruthy()
    expect(getByText(/Add Automation Lane/)).toBeTruthy()
  })

  it('clicking a param option calls addLane and closes the picker', () => {
    const t = armATrack()
    useTimelineStore.setState({
      tracks: useTimelineStore.getState().tracks.map((tr) =>
        tr.id === t.id ? { ...tr, effectChain: [{ id: 'fx1', effectId: 'fx.invert', isEnabled: true, isFrozen: false, parameters: {}, modulations: {}, mix: 1, mask: null }] } : tr,
      ),
    })
    const { container } = render(<AutomationToolbar />)
    fireEvent.click(container.querySelector('[data-testid="add-lane-btn"]') as HTMLElement)
    const option = container.querySelector('[data-testid="param-option-amount"]') as HTMLElement
    expect(option).toBeTruthy()
    fireEvent.click(option)

    const lanes = useAutomationStore.getState().getLanesForTrack(t.id)
    expect(lanes).toHaveLength(1)
    expect(lanes[0].paramPath).toBe('fx1.amount')
    // Picker should close after selection.
    expect(container.querySelector('[data-testid="param-picker"]')).toBeNull()
  })

  it('clicking + Lane twice toggles picker closed', () => {
    armATrack()
    const { container } = render(<AutomationToolbar />)
    fireEvent.click(container.querySelector('[data-testid="add-lane-btn"]') as HTMLElement)
    expect(container.querySelector('[data-testid="param-picker"]')).toBeTruthy()
    fireEvent.click(container.querySelector('[data-testid="add-lane-btn"]') as HTMLElement)
    expect(container.querySelector('[data-testid="param-picker"]')).toBeNull()
  })

  it('picker shows Mixer → BPM project param even when track has no effects (P2.1)', () => {
    // P2.1: "Mixer → BPM" is always available as a project-level automation target,
    // so "No available parameters" should never appear for a track with no effects.
    armATrack() // track with no effect chain
    const { container, getByText } = render(<AutomationToolbar />)
    fireEvent.click(container.querySelector('[data-testid="add-lane-btn"]') as HTMLElement)
    // Should show the BPM option instead of the empty hint
    expect(getByText(/Mixer/i)).toBeTruthy()
    expect(getByText(/BPM/i)).toBeTruthy()
  })

  it('picker shows empty hint only when all params (including Mixer BPM) are already mapped (P2.1)', () => {
    const t = armATrack()
    // Pre-map the Mixer → BPM lane so it appears in existingPaths
    useAutomationStore.getState().addLane(t.id, 'projectParam', 'bpm', '#4ade80')
    const { container, getByText } = render(<AutomationToolbar />)
    fireEvent.click(container.querySelector('[data-testid="add-lane-btn"]') as HTMLElement)
    expect(getByText(/No available parameters/i)).toBeTruthy()
  })
})

describe('AutomationToolbar — clip-transform lanes (A1+A2)', () => {
  const TRANSFORM_TESTIDS = [
    'param-option-x',
    'param-option-y',
    'param-option-scaleX',
    'param-option-scaleY',
    'param-option-rotation',
  ]

  function addAndSelectClip(trackId: string, clipId = 'clip-1') {
    useTimelineStore.getState().addClip(trackId, {
      id: clipId,
      assetId: 'asset-1',
      trackId,
      position: 0,
      duration: 5,
      inPoint: 0,
      outPoint: 5,
      speed: 1,
    })
    useTimelineStore.getState().selectClip(clipId)
    return clipId
  }

  it('lists exactly the 5 transform fields when a clip on the armed track is selected', () => {
    const t = armATrack()
    addAndSelectClip(t.id)
    const { container } = render(<AutomationToolbar />)
    fireEvent.click(container.querySelector('[data-testid="add-lane-btn"]') as HTMLElement)
    for (const testid of TRANSFORM_TESTIDS) {
      expect(container.querySelector(`[data-testid="${testid}"]`)).toBeTruthy()
    }
    // Labels read "Clip Transform · <Field>".
    const xOption = container.querySelector('[data-testid="param-option-x"]') as HTMLElement
    expect(xOption.textContent).toContain('Clip Transform')
  })

  it('does NOT list transform fields when no clip is selected', () => {
    armATrack() // armed, but nothing selected
    const { container } = render(<AutomationToolbar />)
    fireEvent.click(container.querySelector('[data-testid="add-lane-btn"]') as HTMLElement)
    for (const testid of TRANSFORM_TESTIDS) {
      expect(container.querySelector(`[data-testid="${testid}"]`)).toBeNull()
    }
  })

  it('does NOT list transform fields when the selected clip is on a DIFFERENT (non-armed) track', () => {
    const armed = armATrack()
    // A second track holds the selected clip; the armed track is `armed`.
    useTimelineStore.getState().addTrack('Track B', '#00ff00')
    const trackB = useTimelineStore.getState().tracks[1]
    addAndSelectClip(trackB.id, 'clip-onB')
    // Keep the FIRST track armed.
    useAutomationStore.setState({ armedTrackId: armed.id })
    const { container } = render(<AutomationToolbar />)
    fireEvent.click(container.querySelector('[data-testid="add-lane-btn"]') as HTMLElement)
    for (const testid of TRANSFORM_TESTIDS) {
      expect(container.querySelector(`[data-testid="${testid}"]`)).toBeNull()
    }
  })

  it('clicking a transform field creates a clipTransform.<clipId>.<field> lane', () => {
    const t = armATrack()
    const clipId = addAndSelectClip(t.id)
    const { container } = render(<AutomationToolbar />)
    fireEvent.click(container.querySelector('[data-testid="add-lane-btn"]') as HTMLElement)
    fireEvent.click(container.querySelector('[data-testid="param-option-scaleX"]') as HTMLElement)
    const lanes = useAutomationStore.getState().getLanesForTrack(t.id)
    expect(lanes).toHaveLength(1)
    expect(lanes[0].paramPath).toBe(`clipTransform.${clipId}.scaleX`)
  })

  it('an already-mapped transform field is not offered again', () => {
    const t = armATrack()
    const clipId = addAndSelectClip(t.id)
    useAutomationStore.getState().addLane(t.id, `clipTransform.${clipId}`, 'x', '#4ade80')
    const { container } = render(<AutomationToolbar />)
    fireEvent.click(container.querySelector('[data-testid="add-lane-btn"]') as HTMLElement)
    // x already mapped → gone; the other four remain.
    expect(container.querySelector('[data-testid="param-option-x"]')).toBeNull()
    expect(container.querySelector('[data-testid="param-option-y"]')).toBeTruthy()
  })
})

// G.26/P.14 (Simplify) and G.27/P.15 (Clear) functional coverage relocated
// to automation-lane-curve-ops.test.tsx — they now act on an explicit lane
// via the right-click CURVE menu, not this strip (D8/PK.C).
