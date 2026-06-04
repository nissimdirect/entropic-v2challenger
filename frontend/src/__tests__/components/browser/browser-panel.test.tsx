/**
 * BrowserPanel (PR-A) — Creatrix 5-tab browser.
 *
 * Presentational + prop-driven: search, tab row, entry list, drag payload +
 * session nonce, double-click add, disabled-entry guards.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import BrowserPanel from '../../../renderer/components/browser/BrowserPanel'
import {
  NONCE_MIME,
  PAYLOAD_MIME,
  type BrowserEntry,
  type TabKey,
} from '../../../renderer/components/browser/types'

// This repo does NOT auto-cleanup between tests; without this getByTestId finds dupes.
afterEach(() => cleanup())

function makeTabs(): Record<TabKey, BrowserEntry[]> {
  return {
    fx: [
      { id: 'builtin:fx.pixelsort', label: 'Pixel Sort', kind: 'fx' },
      { id: 'builtin:fx.datamosh', label: 'Datamosh', kind: 'fx' },
    ],
    op: [{ id: 'builtin:op.blend', label: 'Blend', kind: 'op' }],
    composite: [{ id: 'builtin:composite.stack', label: 'Stack', kind: 'composite' }],
    tool: [{ id: 'builtin:tool.ruler', label: 'Ruler', kind: 'tool' }],
    instruments: [
      { id: 'builtin:instr.sampler', label: 'Sampler', kind: 'instruments' },
      {
        id: 'builtin:instr.synth',
        label: 'Synth',
        kind: 'instruments',
        disabled: true,
        disabledReason: 'needs a base clip',
      },
    ],
  }
}

function mockDataTransfer() {
  const store: Record<string, string> = {}
  return {
    store,
    setData: vi.fn((type: string, val: string) => {
      store[type] = val
    }),
    getData: (type: string) => store[type] ?? '',
    effectAllowed: '',
  }
}

describe('BrowserPanel', () => {
  it('renders all 5 tabs', () => {
    const { getByTestId } = render(
      <BrowserPanel tabs={makeTabs()} onAdd={vi.fn()} sessionNonce="n1" />,
    )
    for (const tab of ['fx', 'op', 'composite', 'tool', 'instruments']) {
      expect(getByTestId(`browser-tab-${tab}`)).toBeTruthy()
    }
  })

  it('marks the initial tab active and lists its entries', () => {
    const { getByTestId } = render(
      <BrowserPanel tabs={makeTabs()} onAdd={vi.fn()} sessionNonce="n1" />,
    )
    const fxTab = getByTestId('browser-tab-fx')
    expect(fxTab.getAttribute('aria-selected')).toBe('true')
    expect(fxTab.className).toContain('creatrix-browser__tab--active')
    expect(getByTestId('browser-list-fx')).toBeTruthy()
    expect(getByTestId('browser-entry-builtin:fx.pixelsort')).toBeTruthy()
  })

  it('honors the initialTab prop', () => {
    const { getByTestId } = render(
      <BrowserPanel
        tabs={makeTabs()}
        onAdd={vi.fn()}
        sessionNonce="n1"
        initialTab="instruments"
      />,
    )
    expect(getByTestId('browser-tab-instruments').getAttribute('aria-selected')).toBe(
      'true',
    )
    expect(getByTestId('browser-entry-builtin:instr.sampler')).toBeTruthy()
  })

  it('switches active tab on click (aria-selected + list swap)', () => {
    const { getByTestId } = render(
      <BrowserPanel tabs={makeTabs()} onAdd={vi.fn()} sessionNonce="n1" />,
    )
    fireEvent.click(getByTestId('browser-tab-op'))

    expect(getByTestId('browser-tab-op').getAttribute('aria-selected')).toBe('true')
    expect(getByTestId('browser-tab-fx').getAttribute('aria-selected')).toBe('false')
    expect(getByTestId('browser-list-op')).toBeTruthy()
    expect(getByTestId('browser-entry-builtin:op.blend')).toBeTruthy()
  })

  it('filters entries case-insensitively', () => {
    const { getByTestId, queryByTestId } = render(
      <BrowserPanel tabs={makeTabs()} onAdd={vi.fn()} sessionNonce="n1" />,
    )
    fireEvent.change(getByTestId('browser-search'), { target: { value: 'PIXEL' } })

    expect(getByTestId('browser-entry-builtin:fx.pixelsort')).toBeTruthy()
    expect(queryByTestId('browser-entry-builtin:fx.datamosh')).toBeNull()
  })

  it('shows the empty state when nothing matches', () => {
    const { getByTestId, queryByTestId } = render(
      <BrowserPanel tabs={makeTabs()} onAdd={vi.fn()} sessionNonce="n1" />,
    )
    fireEvent.change(getByTestId('browser-search'), {
      target: { value: 'zzz-no-such-entry' },
    })

    const empty = getByTestId('browser-empty')
    expect(empty).toBeTruthy()
    expect(empty.textContent).toContain('no matches')
    expect(queryByTestId('browser-entry-builtin:fx.pixelsort')).toBeNull()
  })

  it('clear button resets the search', () => {
    const { getByTestId, queryByTestId } = render(
      <BrowserPanel tabs={makeTabs()} onAdd={vi.fn()} sessionNonce="n1" />,
    )
    const search = getByTestId('browser-search') as HTMLInputElement
    fireEvent.change(search, { target: { value: 'pixel' } })
    expect(queryByTestId('browser-entry-builtin:fx.datamosh')).toBeNull()

    fireEvent.click(getByTestId('browser-search-clear'))

    expect(search.value).toBe('')
    expect(getByTestId('browser-entry-builtin:fx.datamosh')).toBeTruthy()
    // clear button disappears once the query is empty
    expect(queryByTestId('browser-search-clear')).toBeNull()
  })

  it('Escape clears the search and blurs the input', () => {
    const { getByTestId } = render(
      <BrowserPanel tabs={makeTabs()} onAdd={vi.fn()} sessionNonce="n1" />,
    )
    const search = getByTestId('browser-search') as HTMLInputElement
    fireEvent.change(search, { target: { value: 'pixel' } })
    search.focus()
    expect(document.activeElement).toBe(search)

    fireEvent.keyDown(search, { key: 'Escape' })

    expect(search.value).toBe('')
    expect(document.activeElement).not.toBe(search)
    expect(getByTestId('browser-entry-builtin:fx.datamosh')).toBeTruthy()
  })

  it('double-click on an enabled entry calls onAdd with {kind,id}', () => {
    const onAdd = vi.fn()
    const { getByTestId } = render(
      <BrowserPanel tabs={makeTabs()} onAdd={onAdd} sessionNonce="n1" />,
    )
    fireEvent.doubleClick(getByTestId('browser-entry-builtin:fx.pixelsort'))

    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(onAdd).toHaveBeenCalledWith({ kind: 'fx', id: 'builtin:fx.pixelsort' })
  })

  it('double-click on a disabled entry does NOT call onAdd', () => {
    const onAdd = vi.fn()
    const { getByTestId } = render(
      <BrowserPanel
        tabs={makeTabs()}
        onAdd={onAdd}
        sessionNonce="n1"
        initialTab="instruments"
      />,
    )
    fireEvent.doubleClick(getByTestId('browser-entry-builtin:instr.synth'))

    expect(onAdd).not.toHaveBeenCalled()
  })

  it('disabled entry is not draggable and shows the disabledReason title', () => {
    const { getByTestId } = render(
      <BrowserPanel
        tabs={makeTabs()}
        onAdd={vi.fn()}
        sessionNonce="n1"
        initialTab="instruments"
      />,
    )
    const disabled = getByTestId('browser-entry-builtin:instr.synth')
    // draggable={!disabled} → false
    expect(disabled.getAttribute('draggable')).toBe('false')
    expect(disabled.getAttribute('title')).toBe('needs a base clip')
    expect(disabled.className).toContain('creatrix-browser__entry--disabled')
  })

  it('disabled entry dragStart is prevented (no payload set)', () => {
    const { getByTestId } = render(
      <BrowserPanel
        tabs={makeTabs()}
        onAdd={vi.fn()}
        sessionNonce="n1"
        initialTab="instruments"
      />,
    )
    const dt = mockDataTransfer()
    fireEvent.dragStart(getByTestId('browser-entry-builtin:instr.synth'), {
      dataTransfer: dt,
    })
    expect(dt.setData).not.toHaveBeenCalled()
  })

  it('onDragStart sets the payload + nonce on the dataTransfer', () => {
    const { getByTestId } = render(
      <BrowserPanel tabs={makeTabs()} onAdd={vi.fn()} sessionNonce="nonce-abc" />,
    )
    const dt = mockDataTransfer()
    fireEvent.dragStart(getByTestId('browser-entry-builtin:fx.pixelsort'), {
      dataTransfer: dt,
    })

    expect(dt.setData).toHaveBeenCalledWith(
      PAYLOAD_MIME,
      JSON.stringify({ kind: 'fx', id: 'builtin:fx.pixelsort' }),
    )
    expect(dt.setData).toHaveBeenCalledWith(NONCE_MIME, 'nonce-abc')
    expect(JSON.parse(dt.store[PAYLOAD_MIME])).toEqual({
      kind: 'fx',
      id: 'builtin:fx.pixelsort',
    })
    expect(dt.store[NONCE_MIME]).toBe('nonce-abc')
  })
})
