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

  test('zoom controls are visible in footer', () => {
    render(<Timeline onSeek={() => {}} />)
    expect(document.querySelector('.timeline__footer')).toBeTruthy()
    expect(document.querySelector('.zoom-scroll__slider')).toBeTruthy()
    expect(document.querySelector('.zoom-scroll__label')).toBeTruthy()
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

  test('track header shows mute and solo buttons', () => {
    render(<Timeline onSeek={() => {}} />)

    fireEvent.click(document.querySelector('.timeline__add-track-btn')!)

    const btns = document.querySelectorAll('.track-header__btn')
    expect(btns.length).toBe(2)

    const texts = Array.from(btns).map((b) => b.textContent)
    expect(texts).toContain('M')
    expect(texts).toContain('S')
  })

  test('time ruler is visible after adding a track', () => {
    render(<Timeline onSeek={() => {}} />)

    fireEvent.click(document.querySelector('.timeline__add-track-btn')!)

    expect(document.querySelector('.time-ruler')).toBeTruthy()
  })
})

describe('Timeline UI — History Panel', () => {
  beforeEach(() => {
    setupMockEntropic()
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
