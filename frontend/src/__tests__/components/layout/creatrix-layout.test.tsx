/**
 * CreatrixLayout + ResizeHandle SHELL tests (PR-A, PLAN §3.2–§3.4).
 */
import { beforeEach, describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import CreatrixLayout from '../../../renderer/components/layout/CreatrixLayout'
import ResizeHandle from '../../../renderer/components/layout/ResizeHandle'

// happy-dom in this repo provides a non-functional localStorage stub
// (see "--localstorage-file" warning). Install a real in-memory implementation
// so the persistence path is exercised.
function installMemoryLocalStorage() {
  const store = new Map<string, string>()
  const mock = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size
    },
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: mock,
    configurable: true,
    writable: true,
  })
}

beforeEach(() => {
  installMemoryLocalStorage()
})

// This repo does NOT auto-cleanup between tests.
afterEach(() => {
  cleanup()
  try {
    localStorage.clear()
  } catch {
    /* ignore */
  }
})

const slots = {
  left: <div data-testid="slot-left">browser</div>,
  preview: <div data-testid="slot-preview">preview</div>,
  deviceChain: <div data-testid="slot-device-chain">chain</div>,
  inspector: <div data-testid="slot-inspector">inspector</div>,
}

describe('CreatrixLayout', () => {
  it('renders all four regions with their slotted children', () => {
    const { getByTestId, container } = render(<CreatrixLayout {...slots} />)

    expect(getByTestId('slot-left')).toBeInTheDocument()
    expect(getByTestId('slot-preview')).toBeInTheDocument()
    expect(getByTestId('slot-device-chain')).toBeInTheDocument()
    expect(getByTestId('slot-inspector')).toBeInTheDocument()

    expect(container.querySelector('.creatrix-layout')).not.toBeNull()
    expect(container.querySelector('.creatrix-layout__left')).not.toBeNull()
    expect(container.querySelector('.creatrix-layout__preview')).not.toBeNull()
    expect(container.querySelector('.creatrix-layout__device-chain')).not.toBeNull()
    expect(container.querySelector('.creatrix-layout__inspector')).not.toBeNull()
  })

  it('renders resize handles with role="separator"', () => {
    const { getAllByRole, container } = render(<CreatrixLayout {...slots} />)
    const handles = getAllByRole('separator')
    // One column handle (left edge) + two row handles (device-chain top, inspector top).
    expect(handles.length).toBe(3)
    expect(container.querySelector('.creatrix-resize-handle--col')).not.toBeNull()
    expect(container.querySelectorAll('.creatrix-resize-handle--row').length).toBe(2)
  })

  it('reads persisted dims from localStorage on mount', () => {
    localStorage.setItem('creatrix.layout.leftW', '320')
    localStorage.setItem('creatrix.layout.inspectorH', '200')
    localStorage.setItem('creatrix.layout.deviceChainH', '240')

    const { container } = render(<CreatrixLayout {...slots} />)
    const root = container.querySelector('.creatrix-layout') as HTMLElement

    expect(root.style.getPropertyValue('--left-col-w')).toBe('320px')
    expect(root.style.getPropertyValue('--inspector-h')).toBe('200px')
    expect(root.style.getPropertyValue('--device-chain-h')).toBe('240px')
  })

  it('clamps out-of-range persisted values on mount', () => {
    // leftW above max (600), deviceChainH below min (120).
    localStorage.setItem('creatrix.layout.leftW', '9999')
    localStorage.setItem('creatrix.layout.deviceChainH', '10')

    const { container } = render(<CreatrixLayout {...slots} />)
    const root = container.querySelector('.creatrix-layout') as HTMLElement

    expect(root.style.getPropertyValue('--left-col-w')).toBe('600px')
    expect(root.style.getPropertyValue('--device-chain-h')).toBe('120px')
  })

  it('falls back to defaults when persisted value is NaN', () => {
    localStorage.setItem('creatrix.layout.leftW', 'not-a-number')

    const { container } = render(<CreatrixLayout {...slots} />)
    const root = container.querySelector('.creatrix-layout') as HTMLElement

    expect(root.style.getPropertyValue('--left-col-w')).toBe('260px')
  })

  it('drag on a handle updates the corresponding custom property', () => {
    const { container } = render(<CreatrixLayout {...slots} />)
    const root = container.querySelector('.creatrix-layout') as HTMLElement
    const colHandle = container.querySelector('.creatrix-resize-handle--col') as HTMLElement

    fireEvent.pointerDown(colHandle, { button: 0, clientX: 100, clientY: 0, pointerId: 1 })
    fireEvent(window, new PointerEvent('pointermove', { clientX: 140, clientY: 0 } as any))
    fireEvent(window, new PointerEvent('pointerup', { clientX: 140, clientY: 0 } as any))

    // 260 default + 40px drag = 300px.
    expect(root.style.getPropertyValue('--left-col-w')).toBe('300px')
    // Persisted on drag end.
    expect(localStorage.getItem('creatrix.layout.leftW')).toBe('300')
  })
})

describe('ResizeHandle', () => {
  it('renders a column handle with separator role and aria-orientation=vertical', () => {
    const { getByRole } = render(
      <ResizeHandle orientation="col" onDelta={() => {}} ariaLabel="Resize col" />
    )
    const handle = getByRole('separator')
    expect(handle).toHaveAttribute('aria-orientation', 'vertical')
    expect(handle).toHaveAttribute('aria-label', 'Resize col')
    expect(handle).toHaveAttribute('tabindex', '0')
    expect(handle.className).toContain('creatrix-resize-handle--col')
  })

  it('renders a row handle with aria-orientation=horizontal', () => {
    const { getByRole } = render(
      <ResizeHandle orientation="row" onDelta={() => {}} ariaLabel="Resize row" />
    )
    expect(getByRole('separator')).toHaveAttribute('aria-orientation', 'horizontal')
  })

  it('pointerdown → pointermove → pointerup calls onDelta then onDragEnd', () => {
    const onDelta = vi.fn()
    const onDragEnd = vi.fn()
    const { getByRole } = render(
      <ResizeHandle
        orientation="col"
        onDelta={onDelta}
        onDragEnd={onDragEnd}
        ariaLabel="Resize col"
      />
    )
    const handle = getByRole('separator')

    fireEvent.pointerDown(handle, { button: 0, clientX: 50, clientY: 0, pointerId: 1 })
    fireEvent(window, new PointerEvent('pointermove', { clientX: 70, clientY: 0 } as any))
    fireEvent(window, new PointerEvent('pointermove', { clientX: 95, clientY: 0 } as any))
    fireEvent(window, new PointerEvent('pointerup', { clientX: 95, clientY: 0 } as any))

    expect(onDelta).toHaveBeenCalled()
    // Deltas: +20 then +25.
    expect(onDelta).toHaveBeenNthCalledWith(1, 20)
    expect(onDelta).toHaveBeenNthCalledWith(2, 25)
    expect(onDragEnd).toHaveBeenCalledTimes(1)

    // After drag end, further pointermove must NOT fire onDelta (listeners removed).
    onDelta.mockClear()
    fireEvent(window, new PointerEvent('pointermove', { clientX: 200, clientY: 0 } as any))
    expect(onDelta).not.toHaveBeenCalled()
  })

  it('row handle uses clientY for its delta', () => {
    const onDelta = vi.fn()
    const { getByRole } = render(
      <ResizeHandle orientation="row" onDelta={onDelta} ariaLabel="Resize row" />
    )
    const handle = getByRole('separator')

    fireEvent.pointerDown(handle, { button: 0, clientX: 0, clientY: 100, pointerId: 1 })
    fireEvent(window, new PointerEvent('pointermove', { clientX: 0, clientY: 130 } as any))
    fireEvent(window, new PointerEvent('pointerup', { clientX: 0, clientY: 130 } as any))

    expect(onDelta).toHaveBeenCalledWith(30)
  })

  it('ignores non-primary (right) button pointerdown', () => {
    const onDelta = vi.fn()
    const { getByRole } = render(
      <ResizeHandle orientation="col" onDelta={onDelta} ariaLabel="Resize col" />
    )
    const handle = getByRole('separator')

    fireEvent.pointerDown(handle, { button: 2, clientX: 50, clientY: 0, pointerId: 1 })
    fireEvent(window, new PointerEvent('pointermove', { clientX: 90, clientY: 0 } as any))

    expect(onDelta).not.toHaveBeenCalled()
  })
})
