/**
 * Sprint 11-4 Polish Component tests.
 * Vitest + @testing-library/react — mock IPC layer, no real Electron.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import React from 'react'
import { setupMockEntropic, teardownMockEntropic } from '../helpers/mock-entropic'

import WelcomeScreen from '../../renderer/components/layout/WelcomeScreen'
import AboutDialog from '../../renderer/components/layout/AboutDialog'
import Tooltip from '../../renderer/components/common/Tooltip'
import ErrorBoundary from '../../renderer/components/layout/ErrorBoundary'

beforeEach(() => {
  setupMockEntropic()
})

afterEach(() => {
  cleanup()
  teardownMockEntropic()
})

/* ─── WelcomeScreen ─── */

describe('WelcomeScreen', () => {
  it('renders when visible', () => {
    render(
      <WelcomeScreen
        isVisible={true}
        recentProjects={[]}
        onNewProject={vi.fn()}
        onOpenProject={vi.fn()}
        onOpenRecent={vi.fn()}
      />,
    )
    expect(document.querySelector('.welcome-screen')).not.toBeNull()
  })

  it('hidden when not visible', () => {
    render(
      <WelcomeScreen
        isVisible={false}
        recentProjects={[]}
        onNewProject={vi.fn()}
        onOpenProject={vi.fn()}
        onOpenRecent={vi.fn()}
      />,
    )
    expect(document.querySelector('.welcome-screen')).toBeNull()
  })

  it('shows recent projects', () => {
    render(
      <WelcomeScreen
        isVisible={true}
        recentProjects={[
          { name: 'Project A', path: '/a.glitch', lastModified: Date.now() - 3600000 },
          { name: 'Project B', path: '/b.glitch', lastModified: Date.now() - 86400000 },
        ]}
        onNewProject={vi.fn()}
        onOpenProject={vi.fn()}
        onOpenRecent={vi.fn()}
      />,
    )
    const items = document.querySelectorAll('.welcome-screen__recent-item')
    expect(items.length).toBe(2)
  })

  it('New Project button calls handler', () => {
    const onNewProject = vi.fn()
    render(
      <WelcomeScreen
        isVisible={true}
        recentProjects={[]}
        onNewProject={onNewProject}
        onOpenProject={vi.fn()}
        onOpenRecent={vi.fn()}
      />,
    )
    const btn = document.querySelector('.welcome-screen__btn--primary')
    expect(btn).not.toBeNull()
    fireEvent.click(btn!)
    expect(onNewProject).toHaveBeenCalledOnce()
  })
})

/* ─── AboutDialog ─── */

describe('AboutDialog', () => {
  it('renders when open', () => {
    render(<AboutDialog isOpen={true} onClose={vi.fn()} />)
    const dialog = document.querySelector('.about-dialog')
    expect(dialog).not.toBeNull()
    expect(dialog!.textContent).toContain('ENTROPIC')
  })

  it('hidden when closed', () => {
    render(<AboutDialog isOpen={false} onClose={vi.fn()} />)
    expect(document.querySelector('.about-dialog')).toBeNull()
  })
})

/* ─── Tooltip ─── */

describe('Tooltip', () => {
  it('shows text on hover', () => {
    vi.useFakeTimers()
    render(
      <Tooltip text="Save" shortcut="Cmd+S">
        <button>Test</button>
      </Tooltip>,
    )
    const wrapper = document.querySelector('.tooltip-wrapper')
    expect(wrapper).not.toBeNull()
    expect(document.querySelector('.tooltip')).toBeNull()

    fireEvent.mouseEnter(wrapper!)
    act(() => { vi.advanceTimersByTime(500) })

    expect(document.querySelector('.tooltip')).not.toBeNull()
    vi.useRealTimers()
  })
})

/* ─── ErrorBoundary ─── */

describe('ErrorBoundary', () => {
  it('catches error and shows recovery', () => {
    function ThrowingComponent(): React.ReactElement {
      throw new Error('test error')
    }

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>,
    )
    spy.mockRestore()

    const title = document.querySelector('.error-boundary__title')
    expect(title).not.toBeNull()
    expect(title!.textContent).toBe('Something went wrong')
  })
})

