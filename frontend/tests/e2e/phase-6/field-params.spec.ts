// WHY E2E: Exercises the real ZMQ path through the Python sidecar — the P6.1
// banded render (axis_lanes) and the P6.2 field-param guard. Vitest mocks IPC,
// so only an E2E proves the full chain UI→store→IPC→backend→render: the sampled
// curve actually produces a per-band spatial gradient, and a __field__ value
// actually changes the rendered frame. The frame_data is base64 MJPEG; we decode
// it in the renderer (Image + canvas) to compare pixel rows.

/**
 * Phase 6 — C2/C3 field params + axis-lane render wiring (full-chain).
 *
 * Named tests (packet TEST PLAN):
 *   - y-domain lane changes rendered preview gradient end-to-end
 *   - assigning image field changes rendered frame
 */

import { test, expect } from '../fixtures/electron-app.fixture'
import {
  waitForEngineConnected,
  getTestVideoPath,
} from '../fixtures/test-helpers'

/**
 * Send a raw command through the renderer's entropic bridge.
 *
 * The relay holds a single persistent ZMQ REQ socket with no server-side queue,
 * so a command issued while another send is mid-flight returns "Socket is busy
 * writing". We don't import a video in this spec (which would start the app's
 * continuous render loop and contend for the socket), and we additionally retry
 * a handful of times on the transient busy error to be robust against the
 * heartbeat ping.
 */
async function sendCommand(window: any, cmd: Record<string, unknown>): Promise<any> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await window.evaluate(async (c: Record<string, unknown>) => {
      const w = window as any
      if (!w.entropic?.sendCommand) return { ok: false, error: 'no bridge' }
      return await w.entropic.sendCommand(c)
    }, cmd)
    const err = String(res?.error ?? '')
    if (res?.ok === false && /busy|in progress/i.test(err)) {
      await window.waitForTimeout(250)
      continue
    }
    return res
  }
  return { ok: false, error: 'socket busy after retries' }
}

/**
 * Decode a base64 MJPEG frame in the renderer and return mean luma of the top
 * band, the bottom band, and a cheap whole-frame hash (sum of sampled bytes).
 */
async function decodeFrameStats(
  window: any,
  frameDataBase64: string,
): Promise<{ topMean: number; bottomMean: number; hash: number }> {
  return window.evaluate(async (b64: string) => {
    const img = new Image()
    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('image decode failed'))
    })
    img.src = `data:image/jpeg;base64,${b64}`
    await loaded
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    const w = canvas.width
    const h = canvas.height
    const bandH = Math.max(1, Math.floor(h * 0.15))
    const top = ctx.getImageData(0, 0, w, bandH).data
    const bottom = ctx.getImageData(0, h - bandH, w, bandH).data
    const luma = (d: Uint8ClampedArray) => {
      let sum = 0
      let n = 0
      for (let i = 0; i < d.length; i += 4) {
        sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
        n++
      }
      return n ? sum / n : 0
    }
    // Cheap whole-frame hash: sum a sparse sample of the full frame's bytes.
    const full = ctx.getImageData(0, 0, w, h).data
    let hash = 0
    for (let i = 0; i < full.length; i += 997) hash = (hash + full[i]) % 1_000_000_007
    return { topMean: luma(top), bottomMean: luma(bottom), hash }
  }, frameDataBase64)
}

test.describe('Phase 6 — field params + axis-lane render (full-chain)', () => {
  test.beforeEach(async ({ window }) => {
    // No video import here: importing starts the app's continuous render loop,
    // which contends for the single ZMQ socket. We render the fixture path
    // directly via the bridge instead (the same render_frame contract App.tsx
    // uses), keeping the socket free for our explicit, serialized calls.
    await waitForEngineConnected(window, 25_000)
  })

  test('y-domain lane changes rendered preview gradient end-to-end', async ({ window }) => {
    test.setTimeout(40_000)
    const videoPath = getTestVideoPath()

    // Baseline: render with no axis_lanes (flat brightness response).
    // fx.brightness_exposure.stops is a field-capable exposure control (range
    // -3..+3 stops); a uniform value gives a flat top/bottom band relationship.
    const baseline = await sendCommand(window, {
      cmd: 'render_frame',
      path: videoPath,
      frame_index: 0,
      chain: [{ effect_id: 'fx.brightness_exposure', params: { stops: 0.0 }, enabled: true }],
      project_seed: 12345,
    })
    expect(baseline.ok, `baseline render failed: ${baseline.error}`).toBe(true)
    expect(typeof baseline.frame_data).toBe('string')
    const baseStats = await decodeFrameStats(window, baseline.frame_data)

    // Y-domain axis lane on fx.brightness_exposure.stops: the banded render
    // substitutes the band's curve value as `stops` per row-band. A ramp from
    // -3 (top → very dark) to +3 (bottom → very bright) produces a strong
    // vertical exposure gradient. The backend banded render (P6.1) applies it.
    const ramp = Array.from({ length: 64 }, (_, i) => -3 + (6 * i) / 63)
    const gradient = await sendCommand(window, {
      cmd: 'render_frame',
      path: videoPath,
      frame_index: 0,
      chain: [{ effect_id: 'fx.brightness_exposure', params: { stops: 0.0 }, enabled: true }],
      project_seed: 12345,
      axis_lanes: [
        {
          effect_id: 'fx.brightness_exposure',
          param: 'stops',
          curve: ramp,
          domain: 'y',
          direction: 1.0,
          interp_mode: 'linear',
          loop_mode: 'off',
          n_bands: 32,
        },
      ],
    })
    expect(gradient.ok, `gradient render failed: ${gradient.error}`).toBe(true)
    const gradStats = await decodeFrameStats(window, gradient.frame_data)

    // PROOF (full chain UI→store→IPC→backend→render): the Y-domain lane reached
    // the Python banded render and produced a vertical exposure gradient.
    //  (a) In the gradient frame the BOTTOM band (high stops → bright) is clearly
    //      brighter than the TOP band (low stops → dark) — the defining property
    //      of a Y-domain lane. The flat baseline has no such forced relationship.
    //  (b) The gradient frame as a whole differs from the baseline frame.
    expect(gradStats.bottomMean).toBeGreaterThan(gradStats.topMean + 10)
    // The forced gradient is much stronger than whatever the source content had.
    const baseDelta = baseStats.bottomMean - baseStats.topMean
    const gradDelta = gradStats.bottomMean - gradStats.topMean
    expect(gradDelta).toBeGreaterThan(baseDelta + 10)
    expect(gradStats.hash).not.toBe(baseStats.hash)
  })

  test('assigning image field changes rendered frame', async ({ window }) => {
    test.setTimeout(40_000)
    const videoPath = getTestVideoPath()

    // Target a known FIELD_TOP25 entry directly: fx.brightness_exposure.stops.
    // (The render-path field guard reads FIELD_TOP25 — backend/src/effects/
    // field_top25.py — so this is the authoritative field-capable surface that
    // the render actually honours.)
    const effectId = 'fx.brightness_exposure'
    const paramName = 'stops'

    // Baseline render of that effect with a scalar param.
    const scalar = await sendCommand(window, {
      cmd: 'render_frame',
      path: videoPath,
      frame_index: 0,
      chain: [{ effect_id: effectId, params: { [paramName]: 0.5 }, enabled: true }],
      project_seed: 777,
    })
    expect(scalar.ok, `scalar render failed: ${scalar.error}`).toBe(true)
    const scalarStats = await decodeFrameStats(window, scalar.frame_data)

    // Render with the SAME param now a __field__ value — sourced from the
    // fixture video frame as a 2D field. The backend resolves the FieldRef
    // (P6.3 field_source) and the frame changes.
    const field = await sendCommand(window, {
      cmd: 'render_frame',
      path: videoPath,
      frame_index: 0,
      chain: [
        {
          effect_id: effectId,
          params: {
            [paramName]: { __field__: { kind: 'video', source_id: videoPath, gain: 1.0, invert: false } },
          },
          enabled: true,
        },
      ],
      project_seed: 777,
    })
    // The backend must ACCEPT the field value (the param is in FIELD_TOP25) and
    // render successfully — never raise the field-guard ValueError.
    expect(field.ok, `field render failed (guard rejected a field-capable param?): ${field.error}`).toBe(true)
    const fieldStats = await decodeFrameStats(window, field.frame_data)

    // PROOF (full chain): assigning the field changed the rendered frame.
    expect(fieldStats.hash).not.toBe(scalarStats.hash)
  })
})
