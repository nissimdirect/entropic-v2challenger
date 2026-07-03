/**
 * F7 (2026-07-02 month-audit-fix-plan) — shared helper for tests that need
 * to render the REAL <App /> component tree with a video already imported
 * (so `activeAssetPath.current` is set and the real render-preview effects
 * fire) and intercept the REAL `window.entropic.sendCommand` calls App.tsx
 * issues.
 *
 * Drives the exact real code path a user hits: the Electron "Import Media"
 * menu action (captured via the `onMenuAction` mock, same as a native-menu
 * click) -> real `handleFileIngest` -> real `ingest` sendCommand -> real
 * `activeAssetPath.current` set -> real `requestRenderFrame` fires.
 *
 * Extracted from granulator-payload-wiring.test.tsx so other payload-wiring
 * tests (axis-lanes, sampler, rack, frameBank, ...) can drive the same real
 * render+intercept path without re-implementing App.tsx's internals.
 */
import { vi, expect } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import App from '../../renderer/App'
import { setupMockEntropic } from './mock-entropic'
import type { EntropicBridge } from './mock-entropic'

export interface RenderAppWithMediaResult {
  /** Every `window.entropic.sendCommand` call App.tsx has made so far (live array — keeps growing). */
  sendCommandCalls: Record<string, unknown>[]
}

/**
 * Renders the real App, drives the real "Import Media" menu action, and
 * returns the live array of every `window.entropic.sendCommand` call
 * App.tsx actually made (including the ones fired during import).
 *
 * `sendCommandOverrides` lets a caller extend the mock's per-cmd responses
 * (e.g. for cmds beyond `ingest`/the default `{ ok: true, frame_data: '' }`)
 * without losing call interception.
 */
export async function renderAppWithImportedMedia(
  entropicOverrides?: Partial<EntropicBridge>,
): Promise<RenderAppWithMediaResult> {
  const sendCommandCalls: Record<string, unknown>[] = []
  let menuActionCallback: ((action: string) => void) | null = null

  setupMockEntropic({
    onMenuAction: vi.fn((cb: (action: string) => void) => {
      menuActionCallback = cb
      return vi.fn()
    }),
    showOpenDialog: vi.fn().mockResolvedValue('/test/video.mp4'),
    sendCommand: vi.fn(async (command: Record<string, unknown>) => {
      sendCommandCalls.push(command)
      if (command.cmd === 'ingest') {
        return {
          ok: true,
          width: 1920,
          height: 1080,
          duration_s: 5,
          fps: 30,
          codec: 'h264',
          has_audio: false,
          frame_count: 150,
        }
      }
      return { ok: true, frame_data: '' }
    }),
    ...entropicOverrides,
  })

  render(<App />)

  // The real onMenuAction subscription is set up in a useEffect on mount.
  await waitFor(() => expect(menuActionCallback).not.toBeNull())
  // Dispatch the real 'import-media' menu action — exercises the exact
  // App.tsx switch-case a native Electron menu click hits.
  menuActionCallback!('import-media')

  // Real handleFileIngest -> real `ingest` sendCommand.
  await waitFor(() => {
    expect(sendCommandCalls.some((c) => c.cmd === 'ingest')).toBe(true)
  })

  // Real requestRenderFrame(0, []) fires immediately after ingest resolves
  // (BUG-3 fix, App.tsx) — the first real render call.
  await waitFor(() => {
    expect(sendCommandCalls.some((c) => c.cmd === 'render_frame' || c.cmd === 'render_composite')).toBe(true)
  })

  return { sendCommandCalls }
}
