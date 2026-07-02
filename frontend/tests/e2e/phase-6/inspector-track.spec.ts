// WHY E2E: Vitest mocks the IPC bridge, so only an Electron E2E proves the full
// chain UI→store→IPC→backend→render for the P6.8 inspector track: a registered
// probe actually accumulates a HISTORY in the Python registry (P6.7) across
// successive renders, and `probe_snapshot` returns values that CHANGE across two
// polls — which is exactly what drives the live sparkline pixels.
//
// Real OS-level drag-from-param onto a timeline track is brittle to script in
// Electron; the store/drag legs are covered by the vitest component test
// (`probe-binding.test.tsx`). This spec exercises the load-bearing remainder:
// register → mount → render (recording site fires) → snapshot×2 → values move.

/**
 * Phase 6 — P6.8 Inspector track (full-chain probe recording).
 *
 * Named test (packet TEST PLAN):
 *   - dragging param to inspector track shows live scope values during playback
 *     (here: probe registered + mounted → backend records across renders →
 *      snapshot values change across two polls)
 */

import { test, expect } from '../fixtures/electron-app.fixture'
import { waitForEngineConnected, getTestVideoPath } from '../fixtures/test-helpers'

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

test.describe('Phase 6 — P6.8 inspector track (full-chain)', () => {
  test.beforeEach(async ({ window }) => {
    await waitForEngineConnected(window, 25_000)
  })

  test('dragging param to inspector track shows live scope values during playback', async ({ window }) => {
    test.setTimeout(60_000)
    const videoPath = getTestVideoPath()

    const effectId = 'fx.brightness_exposure'
    const param = 'stops'
    // The backend records lane outputs under `{effect_id}.{param}:lane_output`
    // (zmq_server.py probe site 4). Register under that exact key so render-time
    // recording lands in our probe's history.
    const probeId = `${effectId}.${param}:lane_output`

    // 1. Register the probe + mount the registry (what the inspector track's
    //    lane does on mount: probe_register + probe_mount).
    const reg = await sendCommand(window, {
      cmd: 'probe_register',
      probe_id: probeId,
      kind: 'param_postmod',
      label: 'Exposure · stops',
      effect_id: effectId,
      param_path: param,
    })
    expect(reg.ok, `probe_register failed: ${reg.error}`).toBe(true)

    const mnt = await sendCommand(window, { cmd: 'probe_mount' })
    expect(mnt.ok, `probe_mount failed: ${mnt.error}`).toBe(true)

    // 2. Render several frames with VARYING automation overrides for that
    //    effect.param — each render records one reading (probe site 4).
    const values = [-2.0, -0.5, 1.0, 2.5, 0.0, -1.5]
    for (let i = 0; i < values.length; i++) {
      const r = await sendCommand(window, {
        cmd: 'render_frame',
        path: videoPath,
        frame_index: 0,
        chain: [{ effect_id: effectId, params: { [param]: 0.0 }, enabled: true }],
        auto_overrides: { [`${effectId}.${param}`]: values[i] },
        project_seed: 4242,
      })
      expect(r.ok, `render ${i} failed: ${r.error}`).toBe(true)
    }

    // 3. First snapshot — history should be populated.
    const snap1 = await sendCommand(window, { cmd: 'probe_snapshot' })
    expect(snap1.ok, `probe_snapshot failed: ${snap1.error}`).toBe(true)
    expect(snap1.mounted).toBe(true)
    const probe1 = snap1.probes?.[probeId]
    expect(probe1, 'probe missing from snapshot').toBeTruthy()
    expect(Array.isArray(probe1.history)).toBe(true)
    expect(probe1.history.length).toBeGreaterThan(0)
    // Bounded by backend MAX_HISTORY_PER_PROBE (32).
    expect(probe1.history.length).toBeLessThanOrEqual(32)
    const len1 = probe1.history.length
    const latest1 = probe1.latestValue

    // 4. Render more frames, then a second snapshot — the live values MOVE.
    const more = [3.0, -3.0, 0.7]
    for (let i = 0; i < more.length; i++) {
      const r = await sendCommand(window, {
        cmd: 'render_frame',
        path: videoPath,
        frame_index: 0,
        chain: [{ effect_id: effectId, params: { [param]: 0.0 }, enabled: true }],
        auto_overrides: { [`${effectId}.${param}`]: more[i] },
        project_seed: 4242,
      })
      expect(r.ok, `render+ ${i} failed: ${r.error}`).toBe(true)
    }

    const snap2 = await sendCommand(window, { cmd: 'probe_snapshot' })
    expect(snap2.ok).toBe(true)
    const probe2 = snap2.probes?.[probeId]
    expect(probe2).toBeTruthy()

    // PROOF (full chain): the probe's history advanced and the latest value
    // changed across the two polls — i.e. the sparkline would repaint with new
    // pixels. (History may saturate at 32; the latest reading is the live tip.)
    const advanced =
      probe2.history.length > len1 || probe2.latestValue !== latest1
    expect(advanced, 'probe history did not advance across two snapshots').toBe(true)
    expect(probe2.latestValue).toBeCloseTo(0.7, 5)

    // 5. Unmount (what the lane does on unmount) — recording stops.
    const un = await sendCommand(window, { cmd: 'probe_unmount' })
    expect(un.ok).toBe(true)
    const unreg = await sendCommand(window, { cmd: 'probe_unregister', probe_id: probeId })
    expect(unreg.ok).toBe(true)
  })
})
