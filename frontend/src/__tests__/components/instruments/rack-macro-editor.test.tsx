/**
 * B4-macro-editor — RackDevice Macros section: drives the B4.2 macro store
 * actions (addRackMacro / updateRackMacro / removeRackMacro / addMacroRoute /
 * removeMacroRoute) that shipped HEADLESS, and proves a route built in the UI
 * actually moves a pad param through the REAL resolveRackMacros (anti-dead-flag).
 *
 * Mirrors rack-device.test.tsx (component test + store-driven I/O, no IPC mock
 * needed — these actions are pure store writes).
 *
 * THREE GATES (inlined per brief):
 *  1. Regression: existing pad grid/editor untouched (covered by rack-device.test.tsx).
 *  2. Cap at the UI trust boundary: 9th macro blocked; addMacroRoute false → toast.
 *  3. Anti-dead-flag HARD ORACLE: macro_editor_drives_pad_param_via_resolver.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, screen, cleanup } from '@testing-library/react'
import RackDevice from '../../../renderer/components/instruments/RackDevice'
import { useInstrumentsStore } from '../../../renderer/stores/instruments'
import { usePerformanceStore } from '../../../renderer/stores/performance'
import { useProjectStore } from '../../../renderer/stores/project'
import { useToastStore } from '../../../renderer/stores/toast'
import { resolveRackMacros } from '../../../renderer/components/instruments/resolveRackMacros'
import {
  MAX_MACROS_PER_RACK,
  MAX_MODROUTES_PER_MACRO,
} from '../../../renderer/components/instruments/types'

const T = 'track-1'

function firstPadId(): string {
  return useInstrumentsStore.getState().racks[T].pads[0].id
}

beforeEach(() => {
  useInstrumentsStore.setState({ instruments: {}, racks: {} })
  usePerformanceStore.setState({ trackEvents: {} })
  useProjectStore.setState({ assets: {}, currentFrame: 0 })
  useToastStore.setState({ toasts: [] })
})
afterEach(() => cleanup())

describe('RackDevice — Macros section (B4-macro-editor)', () => {
  it('renders the macros section + add-macro button when a rack exists', () => {
    useInstrumentsStore.getState().addRack(T)
    render(<RackDevice trackId={T} />)
    expect(screen.getByTestId('rack-macros')).toBeTruthy()
    expect(screen.getByTestId('rack-add-macro')).toBeTruthy()
  })

  it('Add macro creates a macro with name + value controls', () => {
    useInstrumentsStore.getState().addRack(T)
    render(<RackDevice trackId={T} />)
    expect(useInstrumentsStore.getState().racks[T].macros ?? []).toHaveLength(0)
    fireEvent.click(screen.getByTestId('rack-add-macro'))
    const macros = useInstrumentsStore.getState().racks[T].macros!
    expect(macros).toHaveLength(1)
    expect(screen.getByTestId(`rack-macro-${macros[0].id}`)).toBeTruthy()
    expect(screen.getByTestId('rack-macro-name')).toBeTruthy()
    expect(screen.getByTestId('rack-macro-value')).toBeTruthy()
  })

  it('name input + value slider write to the macro store', () => {
    useInstrumentsStore.getState().addRack(T)
    render(<RackDevice trackId={T} />)
    fireEvent.click(screen.getByTestId('rack-add-macro'))
    fireEvent.change(screen.getByTestId('rack-macro-name'), { target: { value: 'Chaos' } })
    expect(useInstrumentsStore.getState().racks[T].macros![0].name).toBe('Chaos')
    fireEvent.change(screen.getByTestId('rack-macro-value'), { target: { value: '0.75' } })
    expect(useInstrumentsStore.getState().racks[T].macros![0].value).toBe(0.75)
  })

  it('remove-macro button deletes the macro', () => {
    useInstrumentsStore.getState().addRack(T)
    render(<RackDevice trackId={T} />)
    fireEvent.click(screen.getByTestId('rack-add-macro'))
    expect(useInstrumentsStore.getState().racks[T].macros).toHaveLength(1)
    fireEvent.click(screen.getByTestId('rack-macro-remove'))
    expect(useInstrumentsStore.getState().racks[T].macros).toHaveLength(0)
  })

  it('route editor adds a pad.<id>.<param> route; remove deletes it by index', () => {
    useInstrumentsStore.getState().addRack(T)
    const padId = firstPadId()
    render(<RackDevice trackId={T} />)
    fireEvent.click(screen.getByTestId('rack-add-macro'))
    fireEvent.change(screen.getByTestId('rack-route-param'), { target: { value: 'speed' } })
    fireEvent.change(screen.getByTestId('rack-route-depth'), { target: { value: '2' } })
    fireEvent.click(screen.getByTestId('rack-add-route'))
    const route = useInstrumentsStore.getState().racks[T].macros![0].routes[0]
    expect(route.targetPath).toBe(`pad.${padId}.speed`)
    expect(route.depth).toBe(2)
    expect(screen.getByTestId('rack-route-0')).toBeTruthy()
    fireEvent.click(screen.getByTestId('rack-route-remove'))
    expect(useInstrumentsStore.getState().racks[T].macros![0].routes).toHaveLength(0)
  })

  // ---- GATE 2: cap enforcement at the UI trust boundary ----

  it('(a) 9th macro is blocked: add-macro disabled at the cap, store stays at max', () => {
    useInstrumentsStore.getState().addRack(T)
    // Fill to the cap via the store (UI is exercised below for the (N+1)th click).
    for (let i = 0; i < MAX_MACROS_PER_RACK; i++) {
      expect(useInstrumentsStore.getState().addRackMacro(T)).not.toBeNull()
    }
    render(<RackDevice trackId={T} />)
    const btn = screen.getByTestId('rack-add-macro') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    // Even if forced, the store rejects the 9th → count never exceeds the cap.
    fireEvent.click(btn)
    expect(useInstrumentsStore.getState().racks[T].macros).toHaveLength(MAX_MACROS_PER_RACK)
    // A direct store call (bypassing the disabled button) returns null at the cap.
    expect(useInstrumentsStore.getState().addRackMacro(T)).toBeNull()
  })

  it('(b) addMacroRoute false (cap hit) surfaces a toast — never silently dropped', () => {
    useInstrumentsStore.getState().addRack(T)
    const macroId = useInstrumentsStore.getState().addRackMacro(T)!
    const padId = firstPadId()
    // Pre-fill this macro's routes to the per-macro cap so the UI add returns false.
    for (let i = 0; i < MAX_MODROUTES_PER_MACRO; i++) {
      expect(
        useInstrumentsStore.getState().addMacroRoute(T, macroId, {
          targetPath: `pad.${padId}.scrub`,
          depth: 1,
        }),
      ).toBe(true)
    }
    render(<RackDevice trackId={T} />)
    expect(useToastStore.getState().toasts).toHaveLength(0)
    fireEvent.click(screen.getByTestId('rack-add-route'))
    // The cap-hit must show feedback (toast), and routes stay AT the cap (no overflow).
    expect(useToastStore.getState().toasts.length).toBeGreaterThan(0)
    expect(useInstrumentsStore.getState().racks[T].macros![0].routes).toHaveLength(
      MAX_MODROUTES_PER_MACRO,
    )
  })

  // ---- GATE 3: ANTI-DEAD-FLAG HARD ORACLE (real store + real resolver) ----

  it('macro_editor_drives_pad_param_via_resolver — UI writes drive resolveRackMacros', () => {
    const store = useInstrumentsStore.getState()
    store.addRack(T)
    // Give the pad a source (a sourced pad is the realistic render target).
    const padId = firstPadId()
    store.setRackPadSource(T, padId, 'clip-a')

    render(<RackDevice trackId={T} />)

    // FAIL-BEFORE: a macro at value 1.0 but with NO route leaves scrub un-driven.
    fireEvent.click(screen.getByTestId('rack-add-macro'))
    fireEvent.change(screen.getByTestId('rack-macro-value'), { target: { value: '1' } })
    const before = resolveRackMacros(useInstrumentsStore.getState().racks[T])!
    const scrubBefore =
      (before.pads[0].instrument as unknown as Record<string, unknown>).scrub
    // No route → resolver returns rack unchanged → scrub never materialized.
    expect(scrubBefore).toBeUndefined()

    // PASS-AFTER: add a route pad.<padId>.scrub depth 1 via the UI route editor.
    // (param select defaults to 'scrub'; depth defaults to '1'.)
    fireEvent.click(screen.getByTestId('rack-add-route'))
    // Confirm the UI produced the EXACT targetPath the resolver matches.
    expect(useInstrumentsStore.getState().racks[T].macros![0].routes[0].targetPath).toBe(
      `pad.${padId}.scrub`,
    )
    const after = resolveRackMacros(useInstrumentsStore.getState().racks[T])!
    const scrubAfter =
      (after.pads[0].instrument as unknown as Record<string, unknown>).scrub
    // macro.value(1.0) * depth(1.0) → scrub clamped to [0,1] = 1.0 (NOT the
    // un-driven default). This proves the editor's store writes drive the resolver.
    expect(scrubAfter).toBeCloseTo(1.0, 5)
    expect(scrubAfter).not.toBe(scrubBefore)
  })
})
