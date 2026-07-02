/**
 * UpdateBanner tests.
 * Loop 42 vitest coverage — locks the available → downloaded → dismiss flow
 * plus the cleanup unsubscribers fire on unmount.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { setupMockEntropic, teardownMockEntropic } from '../helpers/mock-entropic'

import UpdateBanner from '../../renderer/components/layout/UpdateBanner'

beforeEach(() => {
  setupMockEntropic()
})

afterEach(() => {
  cleanup()
  teardownMockEntropic()
})

function captureSubscriber(method: 'onUpdateAvailable' | 'onUpdateDownloaded') {
  const fn = (window as unknown as { entropic: Record<string, unknown> }).entropic[method] as ReturnType<typeof vi.fn>
  // Latest call's first argument is the subscriber callback the component registered.
  const call = fn.mock.calls.at(-1)
  return call?.[0] as ((data: unknown) => void) | undefined
}

describe('UpdateBanner', () => {
  it('renders nothing until an update event fires', () => {
    const { container } = render(<UpdateBanner />)
    expect(container.firstChild).toBeNull()
  })

  it('renders "Update vX available" + Download button when onUpdateAvailable fires', () => {
    const { container, getByText } = render(<UpdateBanner />)
    const subscriber = captureSubscriber('onUpdateAvailable')
    expect(subscriber).toBeTruthy()

    act(() => {
      subscriber!({ version: '1.2.3' })
    })

    expect(getByText('Update v1.2.3 available')).toBeTruthy()
    expect(container.querySelector('.update-banner__download')).toBeTruthy()
    expect(container.querySelector('.update-banner__install')).toBeNull()
  })

  it('Download button calls window.entropic.downloadUpdate', () => {
    const { container } = render(<UpdateBanner />)
    const subscriber = captureSubscriber('onUpdateAvailable')
    act(() => {
      subscriber!({ version: '2.0.0' })
    })

    const downloadBtn = container.querySelector('.update-banner__download') as HTMLElement
    fireEvent.click(downloadBtn)

    const download = (window as unknown as { entropic: { downloadUpdate: ReturnType<typeof vi.fn> } }).entropic.downloadUpdate
    expect(download).toHaveBeenCalledOnce()
  })

  it('switches to "ready — restart" + Restart button when onUpdateDownloaded fires', () => {
    const { container, getByText } = render(<UpdateBanner />)
    const avail = captureSubscriber('onUpdateAvailable')
    const done = captureSubscriber('onUpdateDownloaded')

    act(() => {
      avail!({ version: '1.2.3' })
      done!({ version: '1.2.3' })
    })

    expect(getByText('Update v1.2.3 ready — restart to install')).toBeTruthy()
    expect(container.querySelector('.update-banner__install')).toBeTruthy()
    expect(container.querySelector('.update-banner__download')).toBeNull()
  })

  it('Restart button calls window.entropic.installUpdate', () => {
    const { container } = render(<UpdateBanner />)
    const avail = captureSubscriber('onUpdateAvailable')
    const done = captureSubscriber('onUpdateDownloaded')
    act(() => {
      avail!({ version: '1.0.0' })
      done!({ version: '1.0.0' })
    })

    fireEvent.click(container.querySelector('.update-banner__install') as HTMLElement)
    const install = (window as unknown as { entropic: { installUpdate: ReturnType<typeof vi.fn> } }).entropic.installUpdate
    expect(install).toHaveBeenCalledOnce()
  })

  it('Dismiss × hides the banner permanently within the session', () => {
    const { container, queryByText } = render(<UpdateBanner />)
    const avail = captureSubscriber('onUpdateAvailable')
    act(() => {
      avail!({ version: '1.0.0' })
    })
    expect(queryByText('Update v1.0.0 available')).toBeTruthy()

    fireEvent.click(container.querySelector('.update-banner__dismiss') as HTMLElement)
    expect(queryByText(/Update v/)).toBeNull()
  })

  it('returns cleanup functions on unmount (no leak)', () => {
    const cleanup1 = vi.fn()
    const cleanup2 = vi.fn()
    const entropic = (window as unknown as { entropic: Record<string, unknown> }).entropic
    ;(entropic.onUpdateAvailable as ReturnType<typeof vi.fn>).mockReturnValue(cleanup1)
    ;(entropic.onUpdateDownloaded as ReturnType<typeof vi.fn>).mockReturnValue(cleanup2)

    const { unmount } = render(<UpdateBanner />)
    unmount()

    expect(cleanup1).toHaveBeenCalledOnce()
    expect(cleanup2).toHaveBeenCalledOnce()
  })
})
