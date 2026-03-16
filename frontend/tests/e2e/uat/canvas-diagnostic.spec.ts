/**
 * Diagnostic test: check canvas state after video import.
 * Determines why waitForFrame times out (canvas stays black).
 */
// WHY E2E: Diagnosing real Electron canvas rendering pipeline — Image.onload,
// drawToCanvas, canvas pixel data, frameReady dataset attribute. Cannot be
// reproduced in Vitest (no real canvas rendering, no ZMQ frame pipeline).
import { test, expect } from '../fixtures/electron-app.fixture'
import {
  waitForEngineConnected,
  importVideoViaDialog,
  getTestVideoPath,
  waitForIngestComplete,
} from '../fixtures/test-helpers'

test('canvas diagnostic: check frame state after import', async ({ electronApp, window, consoleMessages }) => {
  test.setTimeout(60_000)
  await waitForEngineConnected(window, 20_000)

  await importVideoViaDialog(electronApp, window, getTestVideoPath())
  await waitForIngestComplete(window, 30_000)

  // Inject diagnostic: check if frameDataUrl is set and if Image loads
  await window.evaluate(() => {
    // Monkey-patch Image to log load/error
    const origImage = globalThis.Image
    const origProto = origImage.prototype
    const origSet = Object.getOwnPropertyDescriptor(origProto, 'src')?.set
    if (origSet) {
      Object.defineProperty(origProto, 'src', {
        set(v: string) {
          if (typeof v === 'string' && v.startsWith('data:image')) {
            console.log('[DIAG] Image.src set, length=' + v.length)
            this.addEventListener('load', () => console.log('[DIAG] Image.onload fired, naturalWidth=' + this.naturalWidth))
            this.addEventListener('error', (e: Event) => console.log('[DIAG] Image.onerror fired: ' + (e as ErrorEvent).message))
          }
          origSet.call(this, v)
        },
        get() { return Object.getOwnPropertyDescriptor(origProto, 'src')?.get?.call(this) ?? '' },
        configurable: true,
      })
    }
  })

  // Poll canvas state every second for 10 seconds
  for (let i = 0; i < 10; i++) {
    await window.waitForTimeout(1000)

    const state = await window.evaluate(() => {
      // Check React component state via window.__ENTROPIC_DEBUG
      const debugInfo = (window as any).__ENTROPIC_DEBUG ?? {}

      const c = document.querySelector('.preview-canvas__element') as HTMLCanvasElement | null
      if (!c) return { exists: false, debug: debugInfo }

      let pixelInfo = 'no-ctx'
      const ctx = c.getContext('2d')
      if (ctx) {
        try {
          const d = ctx.getImageData(0, 0, 1, 1).data
          pixelInfo = `rgba(${d[0]},${d[1]},${d[2]},${d[3]})`
        } catch (e: unknown) {
          pixelInfo = `error: ${(e as Error).message}`
        }
      }

      // Check React state via DOM
      const placeholder = document.querySelector('.preview-canvas__placeholder')
      const loading = document.querySelector('.preview-canvas__loading')
      const errorOverlay = document.querySelector('.preview-canvas__error-overlay')

      return {
        exists: true,
        canvasWidth: c.width,
        canvasHeight: c.height,
        cssWidth: c.clientWidth,
        cssHeight: c.clientHeight,
        frameReady: c.dataset.frameReady ?? 'not-set',
        pixel: pixelInfo,
        placeholderVisible: placeholder !== null,
        loadingVisible: loading !== null,
        errorVisible: errorOverlay !== null,
      }
    })

    console.log(`[t+${i + 1}s] Canvas:`, JSON.stringify(state))

    if (state.frameReady === 'true') {
      console.log('Frame is ready!')
      break
    }
  }

  // Direct IPC test: call render_frame with the ACTUAL asset path
  const ipcResult = await window.evaluate(async () => {
    try {
      // Get path from the asset badge text or the DOM
      const assetEl = document.querySelector('.asset-badge__name, .asset-info__path, [data-asset-path]')
      const assetPath = assetEl?.getAttribute('data-asset-path') ?? assetEl?.textContent ?? 'unknown'

      const res = await (window as any).entropic.sendCommand({
        cmd: 'render_frame',
        path: assetPath,
        frame_index: 0,
        chain: [],
        project_seed: 12345,
      })
      return {
        ok: res.ok,
        hasFrameData: !!res.frame_data,
        frameDataLength: typeof res.frame_data === 'string' ? res.frame_data.length : 0,
        error: res.error ?? null,
        width: res.width,
        height: res.height,
      }
    } catch (e: unknown) {
      return { error: (e as Error).message }
    }
  })
  console.log('IPC render_frame result:', JSON.stringify(ipcResult))

  // Final assertion
  const final = await window.evaluate(() => {
    const c = document.querySelector('.preview-canvas__element') as HTMLCanvasElement | null
    return c?.dataset.frameReady ?? 'not-set'
  })
  console.log('Final frameReady:', final)

  // Dump console messages for render-related logs
  const renderLogs = consoleMessages.filter(m =>
    m.includes('Render') || m.includes('render') || m.includes('frame') ||
    m.includes('error') || m.includes('Error') || m.includes('CSP')
  )
  console.log('Render-related console messages:', JSON.stringify(renderLogs, null, 2))

  // Soft assertion — we're diagnosing, not gating
  expect(ipcResult).toHaveProperty('ok')
})
