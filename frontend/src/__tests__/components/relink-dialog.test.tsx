/**
 * UE.5 — RelinkDialog component tests.
 * Covers the dialog rendering and interactions for the 6 named tests.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import React from 'react'
import { setupMockEntropic, teardownMockEntropic } from '../helpers/mock-entropic'

import RelinkDialog, { type MissingAsset } from '../../renderer/components/dialogs/RelinkDialog'

beforeEach(() => {
  setupMockEntropic()
})

afterEach(() => {
  cleanup()
  teardownMockEntropic()
})

const MOCK_ASSETS: MissingAsset[] = [
  {
    assetId: 'asset-1',
    name: 'video.mp4',
    oldPath: '/old/path/video.mp4',
    kind: 'video',
  },
]

const MULTI_ASSETS: MissingAsset[] = [
  {
    assetId: 'asset-1',
    name: 'video.mp4',
    oldPath: '/old/path/video.mp4',
    kind: 'video',
  },
  {
    assetId: 'asset-2',
    name: 'audio.wav',
    oldPath: '/old/path/audio.wav',
    kind: 'audio',
  },
]

describe('RelinkDialog — UE.5', () => {
  it('renders nothing when isOpen=false', () => {
    render(
      <RelinkDialog
        isOpen={false}
        missingAssets={MOCK_ASSETS}
        onLocate={vi.fn()}
        onSkip={vi.fn()}
        onClose={vi.fn()}
        onShowOpenDialog={vi.fn()}
      />,
    )
    expect(document.querySelector('.relink-dialog')).toBeNull()
  })

  it('missing asset triggers relink dialog — dialog shown with asset name', () => {
    render(
      <RelinkDialog
        isOpen={true}
        missingAssets={MOCK_ASSETS}
        onLocate={vi.fn()}
        onSkip={vi.fn()}
        onClose={vi.fn()}
        onShowOpenDialog={vi.fn()}
      />,
    )
    expect(document.querySelector('.relink-dialog')).not.toBeNull()
    expect(document.querySelector('.relink-dialog__header')?.textContent).toContain('Media Files Missing')
    expect(document.querySelector('.relink-dialog__entry-name')?.textContent).toContain('video.mp4')
  })

  it('relinked path persists — onLocate called with new path', async () => {
    const onLocate = vi.fn()
    const onShowOpenDialog = vi.fn().mockResolvedValue('/new/path/video.mp4')

    render(
      <RelinkDialog
        isOpen={true}
        missingAssets={MOCK_ASSETS}
        onLocate={onLocate}
        onSkip={vi.fn()}
        onClose={vi.fn()}
        onShowOpenDialog={onShowOpenDialog}
      />,
    )

    const locateBtn = document.querySelector('.relink-dialog__btn--locate') as HTMLElement
    fireEvent.click(locateBtn)

    // Wait for the async dialog to resolve
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(onShowOpenDialog).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ name: expect.stringContaining('Video') }),
      ]),
    )
    expect(onLocate).toHaveBeenCalledWith('asset-1', '/new/path/video.mp4')
  })

  it('skip leaves clip flagged missing — onSkip called with assetId', () => {
    const onSkip = vi.fn()

    render(
      <RelinkDialog
        isOpen={true}
        missingAssets={MOCK_ASSETS}
        onLocate={vi.fn()}
        onSkip={onSkip}
        onClose={vi.fn()}
        onShowOpenDialog={vi.fn()}
      />,
    )

    const skipBtn = document.querySelector('.relink-dialog__btn--skip') as HTMLElement
    fireEvent.click(skipBtn)

    expect(onSkip).toHaveBeenCalledWith('asset-1')
  })

  it('all-present project never shows relink dialog (NEGATIVE) — zero missing → not rendered', () => {
    render(
      <RelinkDialog
        isOpen={false}
        missingAssets={[]}
        onLocate={vi.fn()}
        onSkip={vi.fn()}
        onClose={vi.fn()}
        onShowOpenDialog={vi.fn()}
      />,
    )
    expect(document.querySelector('.relink-dialog')).toBeNull()
  })

  it('done button calls onClose', () => {
    const onClose = vi.fn()

    render(
      <RelinkDialog
        isOpen={true}
        missingAssets={MOCK_ASSETS}
        onLocate={vi.fn()}
        onSkip={vi.fn()}
        onClose={onClose}
        onShowOpenDialog={vi.fn()}
      />,
    )

    // Skip all entries to make "Done" button show full text
    const skipBtn = document.querySelector('.relink-dialog__btn--skip') as HTMLElement
    fireEvent.click(skipBtn)

    const doneBtn = document.querySelector('.relink-dialog__btn--done') as HTMLElement
    fireEvent.click(doneBtn)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('multiple missing assets show multiple rows', () => {
    render(
      <RelinkDialog
        isOpen={true}
        missingAssets={MULTI_ASSETS}
        onLocate={vi.fn()}
        onSkip={vi.fn()}
        onClose={vi.fn()}
        onShowOpenDialog={vi.fn()}
      />,
    )

    const entries = document.querySelectorAll('.relink-dialog__entry')
    expect(entries).toHaveLength(2)
  })
})
