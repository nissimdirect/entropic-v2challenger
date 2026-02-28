/**
 * UX Contract Tests — Don Norman Principles (Component Layer)
 *
 * Migrated from frontend/tests/e2e/regression/ux-contracts.spec.ts (tests 3-9, 11, 13)
 *
 * WHY NOT E2E: Tests affordances, constraints, feedback, and consistency
 * via component rendering. No real Electron, IPC, or sidecar needed.
 *
 * Tests that remain E2E:
 *   2. status indicator color (needs real engine connection)
 *   14. status bar position (needs electronApp.evaluate + BrowserWindow)
 *   15. dark theme computed styles (needs real Electron CSS rendering)
 *   1, 10. status-bar/export-btn (inline in App.tsx, need full app context)
 */
import { render, cleanup } from '@testing-library/react'
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { setupMockEntropic, teardownMockEntropic } from '../helpers/mock-entropic'

import PreviewCanvas from '../../renderer/components/preview/PreviewCanvas'
import DropZone from '../../renderer/components/upload/DropZone'
import FileDialog from '../../renderer/components/upload/FileDialog'
import EffectBrowser from '../../renderer/components/effects/EffectBrowser'
import EffectRack from '../../renderer/components/effects/EffectRack'
import type { EffectInfo } from '../../shared/types'

const registry: EffectInfo[] = [
  { id: 'fx.invert', name: 'Invert', category: 'color', params: {} },
  { id: 'fx.blur', name: 'Blur', category: 'distortion', params: {} },
]

describe('UX Contracts — Visibility of System Status', () => {
  beforeEach(() => {
    setupMockEntropic()
  })

  afterEach(() => {
    cleanup()
    teardownMockEntropic()
  })

  test('3. preview placeholder communicates empty state with text', () => {
    render(
      <PreviewCanvas
        frameDataUrl={null}
        width={1920}
        height={1080}
        previewState="empty"
        renderError={null}
      />,
    )

    const placeholder = document.querySelector('.preview-canvas__placeholder')
    expect(placeholder).toBeTruthy()
    const text = placeholder?.textContent ?? ''
    expect(text.length).toBeGreaterThan(0)
    expect(text).toContain('No video loaded')
  })

  test('5. effect rack shows empty state placeholder', () => {
    render(
      <EffectRack
        chain={[]}
        registry={registry}
        selectedEffectId={null}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onReorder={vi.fn()}
      />,
    )

    expect(document.querySelector('.effect-rack--empty')).toBeTruthy()
    const placeholder = document.querySelector('.effect-rack__placeholder')
    expect(placeholder).toBeTruthy()
    expect(placeholder?.textContent).toContain('No effects')
  })

  test('6. effect browser shows loading state', () => {
    render(
      <EffectBrowser
        registry={[]}
        isLoading={true}
        onAddEffect={vi.fn()}
        chainLength={0}
      />,
    )

    const browser = document.querySelector('.effect-browser')
    expect(browser).toBeTruthy()
    expect(browser?.classList.contains('effect-browser--loading')).toBe(true)
    expect(browser?.textContent).toContain('Loading effects')
  })
})

describe('UX Contracts — Feedback', () => {
  beforeEach(() => {
    setupMockEntropic()
  })

  afterEach(() => {
    cleanup()
    teardownMockEntropic()
  })

  test('4. drop zone has BEM class structure for active state', () => {
    render(<DropZone onFileDrop={vi.fn()} />)

    const dropZone = document.querySelector('.drop-zone')
    expect(dropZone).toBeTruthy()
    const className = dropZone?.getAttribute('class')
    expect(className).toContain('drop-zone')
    // In idle state, should NOT have active class
    expect(className).not.toContain('drop-zone--active')
  })
})

describe('UX Contracts — Affordances', () => {
  beforeEach(() => {
    setupMockEntropic()
  })

  afterEach(() => {
    cleanup()
    teardownMockEntropic()
  })

  test('7. FileDialog renders as a <button> element', () => {
    render(<FileDialog onFileSelect={vi.fn()} />)

    const btn = document.querySelector('.file-dialog-btn')
    expect(btn).toBeTruthy()
    expect(btn?.tagName.toLowerCase()).toBe('button')
  })

  test('9. effect browser items are <button> elements', () => {
    render(
      <EffectBrowser
        registry={registry}
        isLoading={false}
        onAddEffect={vi.fn()}
        chainLength={0}
      />,
    )

    const items = document.querySelectorAll('.effect-browser__item')
    expect(items.length).toBe(2)
    items.forEach((item) => {
      expect(item.tagName.toLowerCase()).toBe('button')
    })
  })

  test('11. effect browser items show "Add <name>" title attribute', () => {
    render(
      <EffectBrowser
        registry={registry}
        isLoading={false}
        onAddEffect={vi.fn()}
        chainLength={0}
      />,
    )

    const items = document.querySelectorAll('.effect-browser__item')
    expect(items[0].getAttribute('title')).toBe('Add Invert')
    expect(items[1].getAttribute('title')).toBe('Add Blur')
  })
})

describe('UX Contracts — Consistency', () => {
  beforeEach(() => {
    setupMockEntropic()
  })

  afterEach(() => {
    cleanup()
    teardownMockEntropic()
  })

  test('13. key UI elements follow BEM naming convention', () => {
    render(
      <>
        <DropZone onFileDrop={vi.fn()} />
        <FileDialog onFileSelect={vi.fn()} />
        <PreviewCanvas
          frameDataUrl={null}
          width={1920}
          height={1080}
          previewState="empty"
          renderError={null}
        />
        <EffectBrowser
          registry={registry}
          isLoading={false}
          onAddEffect={vi.fn()}
          chainLength={0}
        />
      </>,
    )

    // Each of these BEM selectors should exist
    const selectors = [
      '.drop-zone',
      '.drop-zone__content',
      '.file-dialog-btn',
      '.preview-canvas',
      '.effect-browser',
    ]

    for (const selector of selectors) {
      expect(document.querySelector(selector)).toBeTruthy()
    }
  })
})
