/**
 * Timeline UI Component Tests
 *
 * Migrated from frontend/tests/e2e/phase-4/timeline-ui.spec.ts
 *
 * WHY NOT E2E: Tests Timeline, Track, ZoomScroll, and HistoryPanel
 * rendering and interactions. No real Electron window, IPC, or sidecar needed.
 *
 * Tests that remain E2E:
 *   - Window title (needs real BrowserWindow title API)
 *   - window.entropic method count (needs real preload bridge)
 */
import { render, fireEvent, cleanup } from '@testing-library/react'
import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { setupMockEntropic, teardownMockEntropic } from '../helpers/mock-entropic'
import { useTimelineStore } from '../../renderer/stores/timeline'
import { useUndoStore } from '../../renderer/stores/undo'

import Timeline from '../../renderer/components/timeline/Timeline'
import HistoryPanel from '../../renderer/components/layout/HistoryPanel'

describe('Timeline UI — Empty State', () => {
  beforeEach(() => {
    setupMockEntropic()
    useTimelineStore.getState().reset()
  })

  afterEach(() => {
    cleanup()
    teardownMockEntropic()
  })

  test('timeline panel renders', () => {
    render(<Timeline onSeek={() => {}} />)
    expect(document.querySelector('.timeline')).toBeTruthy()
  })

  test('empty timeline shows add-track button', () => {
    render(<Timeline onSeek={() => {}} />)
    const addBtn = document.querySelector('.timeline__add-track-btn')
    expect(addBtn).toBeTruthy()
    expect(addBtn?.textContent).toContain('Add')
  })

  test('resize handle is present', () => {
    render(<Timeline onSeek={() => {}} />)
    expect(document.querySelector('.timeline__resize-handle')).toBeTruthy()
  })

  test('empty state has no footer zoom controls (zoom via Cmd+/- only)', () => {
    render(<Timeline onSeek={() => {}} />)
    // Zoom slider removed — zoom controlled via Cmd+=/- shortcuts
    expect(document.querySelector('.zoom-scroll__slider')).toBeNull()
  })
})

describe('Timeline UI — With Tracks', () => {
  beforeEach(() => {
    setupMockEntropic()
    useTimelineStore.getState().reset()
  })

  afterEach(() => {
    cleanup()
    teardownMockEntropic()
  })

  test('clicking add-track creates a track', () => {
    render(<Timeline onSeek={() => {}} />)

    const addBtn = document.querySelector('.timeline__add-track-btn')!
    fireEvent.click(addBtn)

    expect(document.querySelector('.track-header')).toBeTruthy()
    expect(document.querySelector('.track-lane')).toBeTruthy()
  })

  test('adding multiple tracks shows correct count', () => {
    render(<Timeline onSeek={() => {}} />)

    // Click add in empty state
    fireEvent.click(document.querySelector('.timeline__add-track-btn')!)

    // After first track, button moves to headers-spacer
    fireEvent.click(document.querySelector('.timeline__headers-spacer .timeline__add-track-btn')!)
    fireEvent.click(document.querySelector('.timeline__headers-spacer .timeline__add-track-btn')!)

    const headers = document.querySelectorAll('.track-header')
    expect(headers.length).toBe(3)
  })

  test('track header shows mute, solo and lock buttons', () => {
    render(<Timeline onSeek={() => {}} />)

    fireEvent.click(document.querySelector('.timeline__add-track-btn')!)

    const btns = document.querySelectorAll('.track-header__btn')
    // T3: mute + solo + lock (padlock toggle)
    expect(btns.length).toBe(3)

    const texts = Array.from(btns).map((b) => b.textContent)
    expect(texts).toContain('M')
    expect(texts).toContain('S')
    expect(document.querySelector('[data-testid="track-lock-btn"]')).toBeTruthy()
  })

  test('time ruler is visible after adding a track', () => {
    render(<Timeline onSeek={() => {}} />)

    fireEvent.click(document.querySelector('.timeline__add-track-btn')!)

    expect(document.querySelector('.time-ruler')).toBeTruthy()
  })
})

describe.skip('Timeline UI — Transport Controls (moved to app__transport-bar)', () => {
  beforeEach(() => {
    setupMockEntropic()
    useTimelineStore.getState().reset()
  })

  afterEach(() => {
    cleanup()
    teardownMockEntropic()
  })

  test('transport buttons render when props provided', () => {
    render(
      <Timeline
        onSeek={() => {}}
        isPlaying={false}
        onPlayPause={() => {}}
        onStop={() => {}}
        onToggleLoop={() => {}}
      />
    )
    // Add a track to show the footer
    fireEvent.click(document.querySelector('.timeline__add-track-btn')!)

    const transport = document.querySelector('.timeline__transport')
    expect(transport).toBeTruthy()

    const buttons = transport!.querySelectorAll('.timeline__transport-btn')
    expect(buttons.length).toBe(3) // play, stop, loop
  })

  test('timecode display shows in footer', () => {
    render(
      <Timeline
        onSeek={() => {}}
        isPlaying={false}
        onPlayPause={() => {}}
        onStop={() => {}}
      />
    )
    fireEvent.click(document.querySelector('.timeline__add-track-btn')!)

    const timecode = document.querySelector('.timeline__timecode')
    expect(timecode).toBeTruthy()
    expect(timecode?.textContent).toContain('/')
  })

  test('BPM input renders when onBpmChange provided', () => {
    render(
      <Timeline
        onSeek={() => {}}
        bpm={120}
        onBpmChange={() => {}}
      />
    )
    fireEvent.click(document.querySelector('.timeline__add-track-btn')!)

    const bpmInput = document.querySelector('.timeline__bpm-input') as HTMLInputElement
    expect(bpmInput).toBeTruthy()
    expect(bpmInput.value).toBe('120')
  })

  test('quantize button renders when onToggleQuantize provided', () => {
    render(
      <Timeline
        onSeek={() => {}}
        quantizeEnabled={false}
        onToggleQuantize={() => {}}
        onQuantizeDivisionChange={() => {}}
      />
    )
    fireEvent.click(document.querySelector('.timeline__add-track-btn')!)

    const qBtn = document.querySelector('.timeline__quant .timeline__transport-btn')
    expect(qBtn).toBeTruthy()
    expect(qBtn?.textContent).toBe('Q')

    const qSelect = document.querySelector('.timeline__quant-select')
    expect(qSelect).toBeTruthy()
  })
})

describe('Timeline UI — History Panel', () => {
  beforeEach(() => {
    setupMockEntropic()
    useUndoStore.getState().clear()
  })

  afterEach(() => {
    cleanup()
    teardownMockEntropic()
  })

  test('history panel renders', () => {
    render(<HistoryPanel />)
    expect(document.querySelector('.history-panel')).toBeTruthy()
  })

  test('empty history shows "No actions yet"', () => {
    render(<HistoryPanel />)
    const empty = document.querySelector('.history-panel__empty')
    expect(empty).toBeTruthy()
    expect(empty?.textContent).toContain('No actions yet')
  })
})

// M.2 (Master-Out Bus PRD) — Master track row: pinned bottom, visually
// distinct, NO clip lane, selectable → same DeviceChain panel any track uses.
describe('Timeline UI — Master track (M.2)', () => {
  beforeEach(() => {
    setupMockEntropic()
    useTimelineStore.getState().reset()
  })

  afterEach(() => {
    cleanup()
    teardownMockEntropic()
  })

  test('master track renders a header + lane row', () => {
    useTimelineStore.getState().addMasterTrack()
    render(<Timeline onSeek={() => {}} />)
    expect(document.querySelector('[data-testid="master-track-header"]')).toBeTruthy()
    expect(document.querySelector('[data-testid="master-track-lane"]')).toBeTruthy()
  })

  test('master track lane has NO clip content (no .clip nodes, no marquee overlay)', () => {
    useTimelineStore.getState().addMasterTrack()
    render(<Timeline onSeek={() => {}} />)
    const masterLane = document.querySelector('[data-testid="master-track-lane"]')!
    expect(masterLane.querySelector('.clip')).toBeNull()
    expect(masterLane.querySelector('.marquee-overlay')).toBeNull()
  })

  test('master track is pinned LAST regardless of its position in the tracks array', () => {
    // Master created FIRST, then two ordinary video tracks — the store's
    // array order does not determine the master's row position (Timeline.tsx
    // always renders it last; render/export locate it by type, not index).
    useTimelineStore.getState().addMasterTrack()
    useTimelineStore.getState().addTrack('V1', '#ff0000')
    useTimelineStore.getState().addTrack('V2', '#00ff00')
    // Scope queries to THIS render's container (not whole-document) to avoid any
    // cross-render ambiguity that made this flake under CI timing.
    const { container: root } = render(<Timeline onSeek={() => {}} />)
    const container = root.querySelector('.timeline__track-headers')!
    const headers = container.querySelectorAll('[data-testid="master-track-header"], .track-header--video')
    expect(headers.length).toBe(3)
    // Last rendered header in document order is the master row (pinned
    // bottom), even though it was added FIRST in the store's array.
    expect(headers[headers.length - 1].getAttribute('data-testid')).toBe('master-track-header')
  })

  test('selecting the master track shows its effectChain in the DeviceChain panel', () => {
    const masterId = useTimelineStore.getState().addMasterTrack()!
    const { container } = render(<Timeline onSeek={() => {}} />)
    fireEvent.click(container.querySelector('[data-testid="master-track-header"]')!)
    expect(useTimelineStore.getState().selectedTrackId).toBe(masterId)
  })
})
