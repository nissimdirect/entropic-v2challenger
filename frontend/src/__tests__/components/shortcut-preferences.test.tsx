/**
 * ShortcutEditor and Preferences component tests.
 * Verifies rendering, capture mode, tab navigation, and close behavior.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { setupMockEntropic, teardownMockEntropic } from '../helpers/mock-entropic'
import { shortcutRegistry } from '../../renderer/utils/shortcuts'
import { DEFAULT_SHORTCUTS } from '../../renderer/utils/default-shortcuts'
import ShortcutEditor from '../../renderer/components/layout/ShortcutEditor'
import Preferences from '../../renderer/components/layout/Preferences'

beforeEach(() => {
  setupMockEntropic()
  shortcutRegistry.loadDefaults(DEFAULT_SHORTCUTS)
  shortcutRegistry.resetAllOverrides()
})

afterEach(() => {
  cleanup()
  teardownMockEntropic()
})

describe('ShortcutEditor', () => {
  it('renders category tables', async () => {
    render(<ShortcutEditor />)
    await waitFor(() => {
      const categories = document.querySelectorAll('.shortcut-editor__category')
      // P3.4 adds 'Tool' category; MK.4 adds 'Mask' category — now 8 categories
      expect(categories.length).toBe(8)
    })
  })

  it('shows all shortcuts', async () => {
    render(<ShortcutEditor />)
    await waitFor(() => {
      const rows = document.querySelectorAll('.shortcut-editor__row')
      // P3.4 adds 12 tool shortcuts — row count now equals total DEFAULT_SHORTCUTS entries
      // All shortcuts appear in at least one of the 7 categories shown in the editor
      expect(rows.length).toBe(DEFAULT_SHORTCUTS.length)
    })
  })

  it('click enters capture mode', async () => {
    render(<ShortcutEditor />)
    await waitFor(() => {
      expect(document.querySelector('.shortcut-editor__current')).not.toBeNull()
    })
    const firstCurrent = document.querySelector('.shortcut-editor__current') as HTMLElement
    fireEvent.click(firstCurrent)
    expect(firstCurrent.textContent).toBe('Press key...')
  })

  it('Escape cancels capture', async () => {
    render(<ShortcutEditor />)
    await waitFor(() => {
      expect(document.querySelector('.shortcut-editor__current')).not.toBeNull()
    })
    const firstCurrent = document.querySelector('.shortcut-editor__current') as HTMLElement
    const originalText = firstCurrent.textContent
    fireEvent.click(firstCurrent)
    expect(firstCurrent.textContent).toBe('Press key...')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(firstCurrent.textContent).toBe(originalText)
  })
})

describe('Preferences', () => {
  it('renders nothing when closed', () => {
    render(<Preferences isOpen={false} onClose={vi.fn()} />)
    expect(document.querySelector('.preferences')).toBeNull()
  })

  it('renders tabs when open', () => {
    render(<Preferences isOpen={true} onClose={vi.fn()} />)
    const tabs = document.querySelectorAll('.preferences__tab')
    expect(tabs.length).toBe(4)
  })

  it('Shortcuts tab shows editor', () => {
    render(<Preferences isOpen={true} onClose={vi.fn()} />)
    const tabs = document.querySelectorAll('.preferences__tab')
    const shortcutsTab = Array.from(tabs).find((t) => t.textContent === 'Shortcuts')!
    fireEvent.click(shortcutsTab)
    expect(document.querySelector('.shortcut-editor')).not.toBeNull()
  })

  it('close button calls onClose', () => {
    const onClose = vi.fn()
    render(<Preferences isOpen={true} onClose={onClose} />)
    const closeBtn = document.querySelector('.preferences__close') as HTMLElement
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledOnce()
  })
})
