/**
 * P3.6 — I3 inline-probe action menu tests.
 *
 * Named tests (5 required by packet):
 *   3 positive:
 *     "inline action menu opens on right-click param"
 *     "menu action dispatches to backend inline_actions"
 *     "Escape closes menu"
 *   2 negative:
 *     "backend dispatch failure (error reply / timeout) surfaces a toast and closes the menu — no hung overlay, no crash"
 *     "right-click on a non-param row does not open the menu"
 */

import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest'
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import React from 'react'

// ── window.entropic setup ────────────────────────────────────────────────────

let mockSendCommand: ReturnType<typeof vi.fn>

function setupEntropicMock(sendCommandImpl?: ReturnType<typeof vi.fn>) {
  mockSendCommand = sendCommandImpl ?? vi.fn().mockResolvedValue({ ok: true, actions: [] })
  // Use Object.defineProperty to patch the JSDOM window without replacing it
  // (replacing window breaks @testing-library/react's document.body binding)
  Object.defineProperty(window, 'entropic', {
    value: {
      onEngineStatus: () => {},
      sendCommand: mockSendCommand,
      selectFile: async () => null,
      selectSavePath: async () => null,
      onExportProgress: () => {},
    },
    writable: true,
    configurable: true,
  })
}

// Initialise before any import that reads window.entropic
setupEntropicMock()

import { useTimelineStore } from '../../../renderer/stores/timeline'
import { useProjectStore } from '../../../renderer/stores/project'
import { useToastStore } from '../../../renderer/stores/toast'
import InspectorEffectState from '../../../renderer/components/inspector/InspectorEffectState'
import { useInlineActions } from '../../../renderer/components/inline-actions/useInlineActions'
import type { EffectInstance } from '../../../shared/types'

// ── Reset between tests ───────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  useToastStore.setState({ toasts: [] })
})

afterEach(() => {
  cleanup()
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEffect(id: string, effectId = 'fx.blur'): EffectInstance {
  return {
    id,
    effectId,
    isEnabled: true,
    isFrozen: false,
    parameters: { radius: 0.5, angle: 0.3 },
    modulations: {},
    mix: 0.8,
    mask: null,
  }
}

function setupEffectInStore() {
  useTimelineStore.getState().reset()
  const trackId = useTimelineStore.getState().addTrack('V1', '#ff0000')!
  const fx = makeEffect('fx-blur-1')
  useProjectStore.getState().addEffect(trackId, fx)
  return { trackId, effectId: 'fx-blur-1' }
}

// ── Positive test 1: menu opens on right-click param ─────────────────────────

describe('inline action menu opens on right-click param', () => {
  it('inline action menu opens on right-click param', () => {
    setupEntropicMock()
    const { effectId } = setupEffectInStore()
    render(<InspectorEffectState effectId={effectId} />)

    // Right-click on the Mix param row (a param row)
    const mixRow = screen.getByTestId('inspector-param-row-mix')
    fireEvent.contextMenu(mixRow)

    // Menu should appear synchronously (menu state is local useState)
    const menu = screen.getByTestId('inline-action-menu')
    expect(menu).toBeTruthy()
    expect(menu.getAttribute('data-param-id')).toBe(`${effectId}:mix`)
  })
})

// ── Positive test 2: dispatches to backend inline_actions ─────────────────────

describe('menu action dispatches to backend inline_actions', () => {
  it('menu action dispatches to backend inline_actions', async () => {
    // Wire the mock before render so the hook picks it up
    // There are 2 ParamProbeRow instances (mix + params_count), each fetches actions
    // on mount. So calls are: list(mix) + list(params_count) + invoke(mix).
    const listResponse = {
      ok: true,
      actions: [{ id: 'reveal_in_canvas', label: 'Reveal in routing canvas', shortcut: 'Cmd+Shift+I' }],
    }
    const invokeResponse = {
      ok: true,
      message: "jump to 'blur'",
      payload: { jump_to_node: 'fx-blur-1', node_kind: 'effect' },
    }
    setupEntropicMock(
      vi.fn()
        .mockResolvedValueOnce(listResponse)   // call 1: list for mix row
        .mockResolvedValueOnce(listResponse)   // call 2: list for params_count row
        .mockResolvedValueOnce(invokeResponse), // call 3: invoke on click
    )

    const { effectId } = setupEffectInStore()
    const { getByTestId, queryByTestId } = render(<InspectorEffectState effectId={effectId} />)

    // Open the menu on the mix param row
    await act(async () => {
      fireEvent.contextMenu(getByTestId('inspector-param-row-mix'))
    })

    // Wait for async hook to load backend actions and re-render the menu items
    await waitFor(
      () => expect(queryByTestId('action-reveal_in_canvas')).not.toBeNull(),
      { timeout: 3000 },
    )

    // Click the action — this triggers the invoke IPC call
    await act(async () => {
      fireEvent.click(getByTestId('action-reveal_in_canvas'))
    })

    // 3rd IPC call is the invoke (calls 1+2 are list fetches for both rows)
    await waitFor(() => expect(mockSendCommand).toHaveBeenCalledTimes(3), { timeout: 3000 })

    const invokeCall = mockSendCommand.mock.calls[2][0]
    expect(invokeCall.cmd).toBe('inline_actions_invoke')
    expect(invokeCall.action_id).toBe('reveal_in_canvas')
    expect(invokeCall.kind).toBe('param')
    expect(invokeCall.node_id).toBe(effectId)
  })
})

// ── Positive test 3: Escape closes menu ──────────────────────────────────────

describe('Escape closes menu', () => {
  it('Escape closes menu', () => {
    setupEntropicMock()
    const { effectId } = setupEffectInStore()
    render(<InspectorEffectState effectId={effectId} />)

    fireEvent.contextMenu(screen.getByTestId('inspector-param-row-mix'))
    expect(screen.getByTestId('inline-action-menu')).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('inline-action-menu')).toBeNull()
  })
})

// ── Negative test 1: backend error → toast, menu closes, no crash ─────────────

describe('negative: backend dispatch failure (error reply / timeout) surfaces a toast and closes the menu — no hung overlay, no crash', () => {
  it('backend dispatch failure (error reply / timeout) surfaces a toast and closes the menu — no hung overlay, no crash', async () => {
    const listResponse = {
      ok: true,
      actions: [{ id: 'reveal_in_canvas', label: 'Reveal in routing canvas', shortcut: '' }],
    }
    // 2 list calls (mix + params_count) + 1 invoke call (error reply)
    setupEntropicMock(
      vi.fn()
        .mockResolvedValueOnce(listResponse)   // call 1: list for mix row
        .mockResolvedValueOnce(listResponse)   // call 2: list for params_count row
        .mockResolvedValueOnce({ ok: false, message: 'node ghost not in routing graph', payload: {} }),
    )

    const { effectId } = setupEffectInStore()
    const { getByTestId, queryByTestId } = render(<InspectorEffectState effectId={effectId} />)

    // Open the menu
    await act(async () => {
      fireEvent.contextMenu(getByTestId('inspector-param-row-mix'))
    })

    // Wait for the backend action item to appear
    await waitFor(
      () => expect(queryByTestId('action-reveal_in_canvas')).not.toBeNull(),
      { timeout: 3000 },
    )

    // Click — invoke returns an error
    await act(async () => {
      fireEvent.click(getByTestId('action-reveal_in_canvas'))
    })

    // 3rd IPC call is the invoke
    await waitFor(() => expect(mockSendCommand).toHaveBeenCalledTimes(3), { timeout: 3000 })

    // Menu closes after item click (InlineActionMenu calls onClose after onSelect)
    expect(queryByTestId('inline-action-menu')).toBeNull()

    // Toast surfaced for error
    await waitFor(
      () => {
        const toasts = useToastStore.getState().toasts
        expect(
          toasts.some((t) => t.level === 'error' && t.source === 'inline-action-invoke'),
        ).toBe(true)
      },
      { timeout: 3000 },
    )

    // No crash: component still renders
    expect(getByTestId('inspector-state-effect')).toBeTruthy()
  })
})

// ── Negative test 2: right-click non-param row → no menu ─────────────────────

describe('negative: right-click on a non-param row does not open the menu', () => {
  it('right-click on a non-param row does not open the menu', () => {
    setupEntropicMock()
    const { effectId } = setupEffectInStore()
    render(<InspectorEffectState effectId={effectId} />)

    // The ID row and Enabled row are non-param rows (no onContextMenu wired)
    const idRow = screen.getByTestId('inspector-row-id')
    fireEvent.contextMenu(idRow)

    // Inline-action-menu must NOT appear
    expect(screen.queryByTestId('inline-action-menu')).toBeNull()
  })
})

// ── useInlineActions IPC dispatch unit test ───────────────────────────────────

describe('useInlineActions hook IPC dispatch', () => {
  it('calls inline_actions_list with correct context fields', async () => {
    const listMock = vi.fn().mockResolvedValue({
      ok: true,
      actions: [{ id: 'reveal_in_canvas', label: 'Reveal', shortcut: '' }],
    })
    setupEntropicMock(listMock)

    const ctx = { kind: 'param' as const, nodeId: 'fx-1', paramPath: 'radius', trackId: 't1' }
    const { result } = renderHook(() => useInlineActions(ctx))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(listMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cmd: 'inline_actions_list',
        kind: 'param',
        node_id: 'fx-1',
        param_path: 'radius',
        track_id: 't1',
      }),
    )
    expect(result.current.actions.length).toBeGreaterThan(0)
  })
})
