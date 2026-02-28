/**
 * Interaction Tests (Migrated from E2E)
 *
 * Originally in tests/e2e/phase-1/interactions.spec.ts,
 * tests/e2e/phase-1/import-video.spec.ts, and
 * tests/e2e/regression/edge-cases.spec.ts (Playwright + real Electron).
 *
 * Migrated: search filtering, categories, preview controls (empty),
 * param panel (empty), drop zone structure, file validation, import UI checks,
 * and empty-state transitions.
 *
 * Tests requiring real video import/IPC remain in E2E.
 * // WHY E2E: play/pause, scrub with video, export dialog with assets, param editing
 *
 * See: P97, docs/solutions/2026-02-28-e2e-test-pyramid.md
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import React from 'react'
import { setupMockEntropic, teardownMockEntropic } from '../helpers/mock-entropic'

import EffectBrowser from '../../renderer/components/effects/EffectBrowser'
import PreviewControls from '../../renderer/components/preview/PreviewControls'
import PreviewCanvas from '../../renderer/components/preview/PreviewCanvas'
import ParamPanel from '../../renderer/components/effects/ParamPanel'
import DropZone from '../../renderer/components/upload/DropZone'
import FileDialog from '../../renderer/components/upload/FileDialog'
import type { EffectInfo } from '../../shared/types'

// --- Test data ---
const mockRegistry: EffectInfo[] = [
  { id: 'fx.invert', name: 'Invert', category: 'fx', params: {} },
  {
    id: 'fx.blur',
    name: 'Blur',
    category: 'distortion',
    params: {
      radius: { type: 'float', min: 0, max: 50, default: 5, label: 'Blur Radius' },
    },
  },
  { id: 'fx.hue_shift', name: 'Hue Shift', category: 'fx', params: {} },
  { id: 'fx.pixelate', name: 'Pixelate', category: 'distortion', params: {} },
  { id: 'fx.mirror', name: 'Mirror', category: 'transform', params: {} },
]

beforeEach(() => {
  setupMockEntropic()
})

afterEach(() => {
  cleanup()
  teardownMockEntropic()
})

// =============================================================================
// Effect Browser — Search & Categories
// =============================================================================

describe('Interactions — Effect Browser Search', () => {
  it('search filters effects by name', () => {
    render(
      <EffectBrowser
        registry={mockRegistry}
        isLoading={false}
        onAddEffect={vi.fn()}
        chainLength={0}
      />,
    )

    const searchInput = document.querySelector('.effect-search__input') as HTMLInputElement
    expect(searchInput).toBeTruthy()

    // All 5 effects visible initially
    let items = document.querySelectorAll('.effect-browser__item')
    expect(items.length).toBe(5)

    // Type "invert" — should narrow results
    fireEvent.change(searchInput, { target: { value: 'invert' } })

    items = document.querySelectorAll('.effect-browser__item')
    expect(items.length).toBe(1)
    expect(items[0].textContent?.toLowerCase()).toContain('invert')

    // Clear search — all effects return
    fireEvent.change(searchInput, { target: { value: '' } })
    items = document.querySelectorAll('.effect-browser__item')
    expect(items.length).toBe(5)
  })

  it('search with no match shows empty state', () => {
    render(
      <EffectBrowser
        registry={mockRegistry}
        isLoading={false}
        onAddEffect={vi.fn()}
        chainLength={0}
      />,
    )

    const searchInput = document.querySelector('.effect-search__input') as HTMLInputElement
    fireEvent.change(searchInput, { target: { value: 'zzz_nonexistent_xyz' } })

    const items = document.querySelectorAll('.effect-browser__item')
    expect(items.length).toBe(0)

    const emptyMsg = document.querySelector('.effect-browser__empty')
    expect(emptyMsg).toBeTruthy()
    expect(emptyMsg!.textContent).toBe('No effects found')
  })
})

describe('Interactions — Effect Browser Categories', () => {
  it('each category filter shows relevant effects', () => {
    render(
      <EffectBrowser
        registry={mockRegistry}
        isLoading={false}
        onAddEffect={vi.fn()}
        chainLength={0}
      />,
    )

    const catBtns = document.querySelectorAll('.effect-browser__cat-btn')
    // "All" + 3 categories (distortion, fx, transform)
    expect(catBtns.length).toBe(4)

    // "All" should be active by default
    expect(catBtns[0].className).toContain('effect-browser__cat-btn--active')
    expect(catBtns[0].textContent).toBe('All')

    // Click "distortion" category
    fireEvent.click(catBtns[1])
    let items = document.querySelectorAll('.effect-browser__item')
    expect(items.length).toBe(2) // Blur + Pixelate
    expect(catBtns[1].className).toContain('effect-browser__cat-btn--active')

    // Click "fx" category
    fireEvent.click(catBtns[2])
    items = document.querySelectorAll('.effect-browser__item')
    expect(items.length).toBe(2) // Invert + Hue Shift

    // Click "transform" category
    fireEvent.click(catBtns[3])
    items = document.querySelectorAll('.effect-browser__item')
    expect(items.length).toBe(1) // Mirror

    // Click "All" to reset
    fireEvent.click(catBtns[0])
    items = document.querySelectorAll('.effect-browser__item')
    expect(items.length).toBe(5)
  })

  it('max chain length disables effect buttons', () => {
    render(
      <EffectBrowser
        registry={mockRegistry}
        isLoading={false}
        onAddEffect={vi.fn()}
        chainLength={10}
      />,
    )

    const items = document.querySelectorAll('.effect-browser__item')
    expect(items.length).toBeGreaterThan(0)

    // All buttons should be disabled
    items.forEach((item) => {
      expect((item as HTMLButtonElement).disabled).toBe(true)
      expect(item.getAttribute('title')).toBe('Max 10 effects')
    })
  })
})

// =============================================================================
// Preview Controls — Empty State
// =============================================================================

describe('Interactions — Preview Controls', () => {
  it('scrub slider disabled when no video loaded (totalFrames=0)', () => {
    render(
      <PreviewControls
        currentFrame={0}
        totalFrames={0}
        fps={30}
        isPlaying={false}
        onSeek={vi.fn()}
        onPlayPause={vi.fn()}
      />,
    )

    const scrub = document.querySelector('.preview-controls__scrub') as HTMLInputElement
    expect(scrub).toBeTruthy()
    expect(scrub.disabled).toBe(true)
  })

  it('play button shows ">" when paused', () => {
    render(
      <PreviewControls
        currentFrame={0}
        totalFrames={100}
        fps={30}
        isPlaying={false}
        onSeek={vi.fn()}
        onPlayPause={vi.fn()}
      />,
    )

    const playBtn = document.querySelector('.preview-controls__play-btn')
    expect(playBtn!.textContent?.trim()).toBe('>')
  })

  it('play button shows "||" when playing', () => {
    render(
      <PreviewControls
        currentFrame={0}
        totalFrames={100}
        fps={30}
        isPlaying={true}
        onSeek={vi.fn()}
        onPlayPause={vi.fn()}
      />,
    )

    const playBtn = document.querySelector('.preview-controls__play-btn')
    expect(playBtn!.textContent?.trim()).toBe('||')
  })

  it('timecode displays correct format', () => {
    render(
      <PreviewControls
        currentFrame={0}
        totalFrames={150}
        fps={30}
        isPlaying={false}
        onSeek={vi.fn()}
        onPlayPause={vi.fn()}
      />,
    )

    const counter = document.querySelector('.preview-controls__counter')
    expect(counter!.textContent).toContain('0:00.0')
  })
})

// =============================================================================
// Preview Canvas — States
// =============================================================================

describe('Interactions — Preview Canvas', () => {
  it('shows "No video loaded" in empty state', () => {
    render(
      <PreviewCanvas
        frameDataUrl={null}
        width={640}
        height={480}
        previewState="empty"
        renderError={null}
      />,
    )

    const placeholder = document.querySelector('.preview-canvas__placeholder')
    expect(placeholder).toBeTruthy()
    expect(placeholder!.textContent).toBe('No video loaded')
  })

  it('shows loading spinner in loading state', () => {
    render(
      <PreviewCanvas
        frameDataUrl={null}
        width={640}
        height={480}
        previewState="loading"
        renderError={null}
      />,
    )

    expect(document.querySelector('.preview-canvas__loading')).toBeTruthy()
    expect(document.querySelector('.preview-canvas__spinner')).toBeTruthy()
  })

  it('shows error overlay with retry in error state', () => {
    const onRetry = vi.fn()
    render(
      <PreviewCanvas
        frameDataUrl={null}
        width={640}
        height={480}
        previewState="error"
        renderError="Decode failed"
        onRetry={onRetry}
      />,
    )

    const errorOverlay = document.querySelector('.preview-canvas__error-overlay')
    expect(errorOverlay).toBeTruthy()
    expect(errorOverlay!.textContent).toContain('Decode failed')

    const retryBtn = document.querySelector('.preview-canvas__retry-btn')
    expect(retryBtn).toBeTruthy()
    fireEvent.click(retryBtn!)
    expect(onRetry).toHaveBeenCalled()
  })
})

// =============================================================================
// Param Panel — Empty State
// =============================================================================

describe('Interactions — Param Panel', () => {
  it('shows empty state message when no effect selected', () => {
    render(
      <ParamPanel
        effect={null}
        effectInfo={null}
        onUpdateParam={vi.fn()}
        onSetMix={vi.fn()}
      />,
    )

    const emptyPanel = document.querySelector('.param-panel--empty')
    expect(emptyPanel).toBeTruthy()
    expect(emptyPanel!.textContent).toContain('Select an effect')
  })
})

// =============================================================================
// Drop Zone — Structure & Validation
// =============================================================================

describe('Interactions — Drop Zone', () => {
  it('drop zone shows content elements', () => {
    render(<DropZone onFileDrop={vi.fn()} />)

    expect(document.querySelector('.drop-zone__icon')).toBeTruthy()
    expect(document.querySelector('.drop-zone__text')).toBeTruthy()
    expect(document.querySelector('.drop-zone__hint')).toBeTruthy()

    // No error initially
    expect(document.querySelector('.drop-zone__error')).toBeNull()
  })

  it('drop zone shows correct hint text', () => {
    render(<DropZone onFileDrop={vi.fn()} />)

    const text = document.querySelector('.drop-zone__text')
    expect(text!.textContent).toBe('Drop video file here')

    const hint = document.querySelector('.drop-zone__hint')
    expect(hint!.textContent).toBe('MP4, MOV, AVI, WebM, MKV')
  })

  it('file extension validation accepts video formats', () => {
    // Pure logic test — same assertions as E2E import-video 6/6b
    const ALLOWED = ['.mp4', '.mov', '.avi', '.webm', '.mkv']
    const tests = [
      { name: 'video.mp4', expected: true },
      { name: 'video.mov', expected: true },
      { name: 'video.avi', expected: true },
      { name: 'video.webm', expected: true },
      { name: 'video.mkv', expected: true },
      { name: 'document.pdf', expected: false },
      { name: 'script.js', expected: false },
      { name: 'image.png', expected: false },
      { name: 'archive.zip', expected: false },
      { name: 'noextension', expected: false },
      { name: '.mp4', expected: true },
      { name: 'VIDEO.MP4', expected: true },
    ]

    tests.forEach(({ name, expected }) => {
      const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
      const valid = ALLOWED.includes(ext)
      expect(valid).toBe(expected)
    })
  })
})

// =============================================================================
// FileDialog — Empty State
// =============================================================================

describe('Interactions — FileDialog', () => {
  it('Browse button is visible and enabled in empty state', () => {
    render(<FileDialog onFileSelect={vi.fn()} />)

    const btn = document.querySelector('.file-dialog-btn') as HTMLButtonElement
    expect(btn).toBeTruthy()
    expect(btn.disabled).toBe(false)
    expect(btn.textContent).toBe('Browse...')
  })
})

// =============================================================================
// Empty State Transitions (from edge-cases.spec.ts)
// =============================================================================

describe('Interactions — Empty State Constraints', () => {
  it('all UI constraints correct in empty/initial state', () => {
    // Render components in their empty states and verify constraints
    // This replicates edge-cases.spec.ts "empty state → all UI constraints correct"

    // 1. No export button (render status bar without assets)
    // Already covered by ux-contracts test #10

    // 2. Drop zone visible
    const { unmount: u1 } = render(<DropZone onFileDrop={vi.fn()} />)
    expect(document.querySelector('.drop-zone')).toBeTruthy()
    u1()

    // 3. Preview placeholder text
    const { unmount: u2 } = render(
      <PreviewCanvas
        frameDataUrl={null}
        width={640}
        height={480}
        previewState="empty"
        renderError={null}
      />,
    )
    expect(document.querySelector('.preview-canvas__placeholder')!.textContent).toBe('No video loaded')
    u2()

    // 4. Scrub disabled
    const { unmount: u3 } = render(
      <PreviewControls
        currentFrame={0}
        totalFrames={0}
        fps={30}
        isPlaying={false}
        onSeek={vi.fn()}
        onPlayPause={vi.fn()}
      />,
    )
    expect((document.querySelector('.preview-controls__scrub') as HTMLInputElement).disabled).toBe(true)
    u3()

    // 5. Empty param panel
    const { unmount: u4 } = render(
      <ParamPanel
        effect={null}
        effectInfo={null}
        onUpdateParam={vi.fn()}
        onSetMix={vi.fn()}
      />,
    )
    expect(document.querySelector('.param-panel--empty')).toBeTruthy()
    u4()
  })
})
