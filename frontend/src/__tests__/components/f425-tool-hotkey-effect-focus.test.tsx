/**
 * GH #425 (F-1/F-2): masking tool hotkeys during effect-focus.
 *
 * Guard chain traced (App.tsx keydown -> store):
 *   window keydown (capture) -> App.tsx handleKeyDown (App.tsx:970)
 *     -> isInput guard (target.tagName INPUT/TEXTAREA/SELECT, App.tsx:972-973)
 *     -> perform-mode pad branch (not relevant, no armed track)
 *     -> Escape / Space raw branches (not relevant)
 *     -> shortcutRegistry.handleKeyEvent(e) (App.tsx:1060)
 *       -> isTextInput guard (target tag INPUT/TEXTAREA/contentEditable, shortcuts.ts:161-165)
 *       -> context guard (shortcuts.ts:177-178; always 'normal' — setContext() has zero callers)
 *       -> handler = shortcutRegistry.handlers.get('tool_marquee') (App.tsx:881-891, pre-fix)
 *
 * ROOT CAUSE (not an effect-selection guard — the handler always ran):
 * App.tsx's 'tool_marquee'/'tool_lasso' keyboard handlers (added MK.4/MK.5)
 * only wrote `useTimelineStore.previewToolMode`. Every OTHER tool hotkey
 * handler (tool_select/tool_razor/tool_ripple_delete/tool_marker, T1) AND
 * the click path (EffectBrowser.tsx/ToolRail.tsx -> selectCursorTool(),
 * effects/EffectBrowser.tsx:181-189) also write `useLayoutStore.cursorTool`.
 * Because `cursorTool` never changed, every visual indicator keyed off it —
 * the `tool: {cursorTool}` statusbar chip (EffectBrowser.tsx:745) and
 * ToolRail's active-icon highlight (ToolRail.tsx:101) — kept reading
 * 'select' after a 'q'/'w' press, which is the literal "status stays
 * 'tool: select'" symptom from the UAT report. This reproduces with or
 * without an effect selected; UAT happened to hit it while testing masking
 * on a selected compositing effect.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import App from '../../renderer/App'
import { setupMockEntropic, teardownMockEntropic } from '../helpers/mock-entropic'
import { useProjectStore } from '../../renderer/stores/project'
import { useTimelineStore } from '../../renderer/stores/timeline'
import { useLayoutStore } from '../../renderer/stores/layout'
import type { EffectInstance } from '../../shared/types'

function dispatchKey(key: string, target?: HTMLElement): void {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  ;(target ?? window).dispatchEvent(e)
}

function selectAnEffect(): void {
  const trackId = useTimelineStore.getState().addTrack('V1', '#4ade80') as string
  const fx: EffectInstance = {
    id: 'fx-under-test',
    effectId: 'fx.invert',
    isEnabled: true,
    parameters: {},
    modulations: {},
  }
  useProjectStore.getState().addEffect(trackId, fx)
  useProjectStore.getState().selectEffect(fx.id)
}

beforeEach(() => {
  useTimelineStore.getState().reset()
  useLayoutStore.setState({ cursorTool: 'select' })
})

afterEach(() => {
  cleanup()
  teardownMockEntropic()
})

describe('GH #425 F-1 — q/w tool hotkeys during effect-focus', () => {
  it('(a) with an effect selected, "q" activates the mask-marquee tool — cursorTool AND previewToolMode both update', async () => {
    setupMockEntropic({ onMenuAction: () => () => {} })
    const { container } = render(<App />)
    await waitFor(() => expect(container.querySelector('.app')).toBeTruthy())

    selectAnEffect()
    expect(useProjectStore.getState().selectedEffectId).toBe('fx-under-test')

    dispatchKey('q')

    expect(useTimelineStore.getState().previewToolMode).toBe('marquee-rect')
    // This is the assertion that failed pre-fix: cursorTool stayed 'select'.
    expect(useLayoutStore.getState().cursorTool).toBe('mask-marquee-rect')
  })

  it('(b) with focus inside a text input, "q" does NOT activate the mask tool (guard preserved)', async () => {
    setupMockEntropic({ onMenuAction: () => () => {} })
    const { container } = render(<App />)
    await waitFor(() => expect(container.querySelector('.app')).toBeTruthy())

    selectAnEffect()

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    dispatchKey('q', input)

    expect(useTimelineStore.getState().previewToolMode).toBeNull()
    expect(useLayoutStore.getState().cursorTool).toBe('select')

    document.body.removeChild(input)
  })

  it('(c) repeat-press "q" toggles marquee-rect -> marquee-ellipse -> off, cursorTool follows each step', async () => {
    setupMockEntropic({ onMenuAction: () => () => {} })
    const { container } = render(<App />)
    await waitFor(() => expect(container.querySelector('.app')).toBeTruthy())

    selectAnEffect()

    dispatchKey('q')
    expect(useTimelineStore.getState().previewToolMode).toBe('marquee-rect')
    expect(useLayoutStore.getState().cursorTool).toBe('mask-marquee-rect')

    dispatchKey('q')
    expect(useTimelineStore.getState().previewToolMode).toBe('marquee-ellipse')
    expect(useLayoutStore.getState().cursorTool).toBe('mask-marquee-ellipse')

    dispatchKey('q')
    expect(useTimelineStore.getState().previewToolMode).toBeNull()
    expect(useLayoutStore.getState().cursorTool).toBe('select')
  })

  it('(bonus) "w" (lasso) mirrors the same fix: freehand -> polygon -> off, cursorTool follows', async () => {
    setupMockEntropic({ onMenuAction: () => () => {} })
    const { container } = render(<App />)
    await waitFor(() => expect(container.querySelector('.app')).toBeTruthy())

    selectAnEffect()

    dispatchKey('w')
    expect(useTimelineStore.getState().previewToolMode).toBe('lasso-freehand')
    expect(useLayoutStore.getState().cursorTool).toBe('mask-lasso-freehand')

    dispatchKey('w')
    expect(useTimelineStore.getState().previewToolMode).toBe('lasso-polygon')
    expect(useLayoutStore.getState().cursorTool).toBe('mask-lasso-polygon')

    dispatchKey('w')
    expect(useTimelineStore.getState().previewToolMode).toBeNull()
    expect(useLayoutStore.getState().cursorTool).toBe('select')
  })
})
