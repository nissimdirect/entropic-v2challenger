/**
 * AutomationToolbar tests.
 *
 * Audit queue items G.24/G.25/G.26/G.27 + P.12/P.13/P.14/P.15 (parallel
 * session UAT 2026-05-16) were marked ❌ NOT TESTED for the four buttons:
 *   + Lane / + Trigger / Simplify / Clear
 *
 * The toolbar is fully implemented but had zero component test coverage.
 * This locks the button states (disabled when no track armed), the
 * arm-hint text (post-F-0516-10: hint now reads "R", not "A"), the
 * param-picker open/close flow, and the four button handlers.
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

describe('AutomationToolbar — arm hint references R (post-F-0516-10)', () => {
  it('when no track is armed, hint label reads "Click R on a track"', () => {
    const { container } = render(<AutomationToolbar />)
    const hint = container.querySelector('.auto-toolbar__hint')
    expect(hint).toBeTruthy()
    expect(hint!.textContent).toContain('R')
    // F-0516-10: must NOT reference the old "A" label.
    // textContent of the hint is "Click R on a track to arm" — assert "R" exists
    // and that the literal "A on a track" phrasing is gone.
    expect(hint!.textContent).not.toContain('A on a track')
  })

  it('when no track is armed, "Add Lane" tooltip references R', () => {
    const { container } = render(<AutomationToolbar />)
    const btn = container.querySelector('[data-testid="add-lane-btn"]') as HTMLElement
    expect(btn.getAttribute('title')).toContain('R button')
    expect(btn.getAttribute('title')).not.toContain('A button')
  })
})

describe('AutomationToolbar — buttons disabled until track armed', () => {
  it('all 4 action buttons are disabled when no track is armed', () => {
    const { container } = render(<AutomationToolbar />)
    expect((container.querySelector('[data-testid="add-lane-btn"]') as HTMLButtonElement).disabled).toBe(true)
    expect((container.querySelector('[data-testid="add-trigger-btn"]') as HTMLButtonElement).disabled).toBe(true)
    // Simplify + Clear are by-text since they have no testid.
    const buttons = Array.from(container.querySelectorAll('button'))
    const simplify = buttons.find((b) => b.textContent === 'Simplify') as HTMLButtonElement
    const clear = buttons.find((b) => b.textContent === 'Clear') as HTMLButtonElement
    expect(simplify.disabled).toBe(true)
    expect(clear.disabled).toBe(true)
  })

  it('all 4 action buttons enable when a track is armed', () => {
    armATrack()
    const { container } = render(<AutomationToolbar />)
    expect((container.querySelector('[data-testid="add-lane-btn"]') as HTMLButtonElement).disabled).toBe(false)
    expect((container.querySelector('[data-testid="add-trigger-btn"]') as HTMLButtonElement).disabled).toBe(false)
    const buttons = Array.from(container.querySelectorAll('button'))
    const simplify = buttons.find((b) => b.textContent === 'Simplify') as HTMLButtonElement
    const clear = buttons.find((b) => b.textContent === 'Clear') as HTMLButtonElement
    expect(simplify.disabled).toBe(false)
    expect(clear.disabled).toBe(false)
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

describe('AutomationToolbar — Simplify (G.26 / P.14)', () => {
  it('Simplify on a lane with >2 points reduces point count', () => {
    const t = armATrack()
    useAutomationStore.setState({
      lanes: {
        [t.id]: [
          {
            id: 'lane-1',
            paramPath: 'fx1.amount',
            // 5 collinear points → RDP should reduce to 2.
            points: [
              { time: 0, value: 0, curve: 0 },
              { time: 1, value: 0.25, curve: 0 },
              { time: 2, value: 0.5, curve: 0 },
              { time: 3, value: 0.75, curve: 0 },
              { time: 4, value: 1, curve: 0 },
            ],
            color: '#4ade80',
            isVisible: true,
            mode: 'smooth',
          },
        ],
      },
    })

    const { container } = render(<AutomationToolbar />)
    const buttons = Array.from(container.querySelectorAll('button'))
    const simplify = buttons.find((b) => b.textContent === 'Simplify') as HTMLElement
    fireEvent.click(simplify)

    const after = useAutomationStore.getState().lanes[t.id][0].points
    expect(after.length).toBeLessThan(5)
  })
})

describe('AutomationToolbar — Clear (G.27 / P.15)', () => {
  it('Clear empties all lanes on the armed track', () => {
    const t = armATrack()
    useAutomationStore.setState({
      lanes: {
        [t.id]: [
          {
            id: 'lane-1',
            paramPath: 'fx1.amount',
            points: [
              { time: 0, value: 0, curve: 0 },
              { time: 1, value: 1, curve: 0 },
            ],
            color: '#4ade80',
            isVisible: true,
            mode: 'smooth',
          },
        ],
      },
    })

    const { container } = render(<AutomationToolbar />)
    const buttons = Array.from(container.querySelectorAll('button'))
    const clear = buttons.find((b) => b.textContent === 'Clear') as HTMLElement
    fireEvent.click(clear)

    const after = useAutomationStore.getState().lanes[t.id][0].points
    expect(after).toHaveLength(0)
  })

  it('Clear has the --danger modifier class', () => {
    const { container } = render(<AutomationToolbar />)
    const buttons = Array.from(container.querySelectorAll('button'))
    const clear = buttons.find((b) => b.textContent === 'Clear') as HTMLElement
    expect(clear.className).toContain('auto-toolbar__btn--danger')
  })
})
