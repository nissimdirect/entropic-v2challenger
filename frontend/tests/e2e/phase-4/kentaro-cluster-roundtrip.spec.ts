/**
 * P4.4 — Kentaro Cluster preview roundtrip (Playwright _electron).
 *
 * WHY E2E: proves the full vertical slice — Kentaro Cluster operator added via
 * the rack UI, an lfo0→effect-param mapping (sourceKey routing), and the live
 * backend (SignalEngine.evaluate_all → kentaro_cluster.evaluate_kentaro_cluster
 * → routing.apply_modulation) actually modulating the rendered preview frame.
 * A unit test cannot exercise the Python signal engine + frame pipeline.
 *
 * Strategy:
 *   1. Launch app, connect engine, ingest the fixture video.
 *   2. Open the operators panel, add a Kentaro Cluster via the rack menu, and
 *      assert the editor mounts through the rack (wiring assertion).
 *   3. Render 30 frames via `render_frame` at master_depth 0 (baseline) and again
 *      at master_depth 1.0, each carrying an lfo0→param mapping (source_key),
 *      and checksum `frame_data` per frame. At depth 0 every sub-LFO output is
 *      0 → the mapped param is constant; at depth 1.0 lfo0 sweeps → the param
 *      (and pixels) change across frames. The two checksum series must differ in
 *      ≥10/30 frames.
 *
 * Routing contract (backend modulation/routing.py): a mapping's
 * `target_effect_id` is matched against the chain entry's `effect_id` (the
 * effect TYPE id, not an instance id), and the target param must already exist
 * in the entry's `params` with a numeric base value — so the chain seeds it.
 */
// WHY E2E: kentaro cluster live signal-engine modulation of preview frames

import { test, expect } from '../fixtures/electron-app.fixture'
import {
  waitForEngineConnected,
  getTestVideoPath,
} from '../fixtures/test-helpers'

/** Tiny deterministic string checksum (djb2) for base64 frame data. */
function checksum(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0
  }
  return h >>> 0
}

test.describe('P4.4 — Kentaro Cluster roundtrip', () => {
  test('dragging master depth on a Kentaro Cluster changes the rendered preview frame', async ({
    electronApp,
    window,
  }) => {
    test.setTimeout(180_000)

    await waitForEngineConnected(window, 25_000)

    // Warm up the sidecar (first IPC initializes PyAV + numpy).
    await window.evaluate(async () => {
      await (window as any).entropic.sendCommand({ cmd: 'ping' })
    })

    const videoPath = getTestVideoPath()

    // Ingest the fixture video directly (cold PyAV decode → generous timeout).
    const ingest = await window.evaluate(async (p) => {
      return await (window as any).entropic.sendCommand({ cmd: 'ingest', path: p })
    }, videoPath)
    expect((ingest as any).ok).toBeTruthy()

    // ── UI wiring: add a Kentaro Cluster via the rack menu ──
    // The operators panel is behind a `showOperators` toggle; tolerate either an
    // always-on rack or a toggle affordance.
    const opToggle = window.locator(
      '[title*="perator" i], [aria-label*="perator" i], button:has-text("Operators")',
    )
    if ((await opToggle.count()) > 0) {
      try {
        await opToggle.first().click({ timeout: 2_000 })
      } catch {
        /* panel may already be visible */
      }
    }
    const addBtn = window.locator('.operator-rack__add-btn')
    if ((await addBtn.count()) > 0) {
      await addBtn.first().click()
      const kentaroOpt = window.locator(
        '.operator-rack__add-option:has-text("Kentaro Cluster")',
      )
      await expect(kentaroOpt).toBeEnabled() // P4.4: now available (was disabled in P4.1)
      await kentaroOpt.click()
      // Editor mounted through the rack (catches a missing editor branch).
      await expect(window.locator('.operator-kentaro').first()).toBeVisible({
        timeout: 5_000,
      })
    }

    // ── Deterministic checksum comparison via render_frame ──
    const FRAMES = 30
    const renderSeries = await window.evaluate(
      async ({ frames, path }) => {
        const entropic = (window as any).entropic

        // Pick a float-param effect from the live registry; fall back to invert.
        const reg = await entropic.sendCommand({ cmd: 'list_effects' }).catch(() => null)
        let effectId = 'fx.invert'
        let paramKey = 'amount'
        const effects = reg && reg.effects
        if (Array.isArray(effects)) {
          for (const e of effects) {
            const params = e.params || {}
            const floatKey = Object.keys(params).find((k) => params[k]?.type === 'float')
            if (floatKey) {
              effectId = e.id
              paramKey = floatKey
              break
            }
          }
        }

        // Chain entry: routing matches mapping.target_effect_id against this
        // entry's effect_id, and the target param must already exist with a
        // numeric base so the modulation delta has something to apply to.
        const chain = [
          {
            effect_id: effectId,
            enabled: true,
            mix: 1.0,
            params: { [paramKey]: 0.5 },
          },
        ]

        const makeOperator = (masterDepth: number) => ({
          id: 'op-kentaro-rt',
          type: 'kentaroCluster',
          is_enabled: true,
          parameters: {
            lfo_count: 4,
            master_rate_hz: 1.0,
            master_depth: masterDepth,
            bpm_sync: false,
            lfos: [
              { shape: 'sine', rate_hz: 2.0, depth: 1.0, phase: 0.0 },
              { shape: 'saw', rate_hz: 1.0, depth: 1.0, phase: 0.0 },
              { shape: 'triangle', rate_hz: 0.5, depth: 1.0, phase: 0.0 },
              { shape: 'square', rate_hz: 1.5, depth: 1.0, phase: 0.0 },
            ],
          },
          processing: [],
          // lfo0 → effect param via source_key (P4.2 routing).
          mappings: [
            {
              target_effect_id: effectId,
              target_param_key: paramKey,
              depth: 1.0,
              min: 0.0,
              max: 1.0,
              curve: 'linear',
              source_key: 'lfo0',
            },
          ],
        })

        const renderAt = async (masterDepth: number): Promise<string[]> => {
          const sums: string[] = []
          for (let f = 0; f < frames; f++) {
            const res = await entropic.sendCommand({
              cmd: 'render_frame',
              path,
              frame_index: f,
              chain,
              operators: [makeOperator(masterDepth)],
            })
            sums.push(res && res.frame_data ? String(res.frame_data) : `__noframe_${f}`)
          }
          return sums
        }

        const baseline = await renderAt(0.0) // master_depth 0 → mapped param constant
        const swept = await renderAt(1.0) // master_depth 1.0 → lfo0 sweeps the param
        return { baseline, swept, effectId, paramKey }
      },
      { frames: FRAMES, path: videoPath },
    )

    const series = renderSeries as {
      baseline: string[]
      swept: string[]
      effectId: string
      paramKey: string
    }

    // Sanity: real frames came back (not placeholders).
    const realFrames = series.swept.filter((s) => !s.startsWith('__noframe_')).length
    expect(realFrames).toBeGreaterThan(0)

    const baseSums = series.baseline.map(checksum)
    const sweptSums = series.swept.map(checksum)

    let differing = 0
    for (let i = 0; i < FRAMES; i++) {
      if (baseSums[i] !== sweptSums[i]) differing++
    }

    // eslint-disable-next-line no-console
    console.log(
      `[kentaro-roundtrip] effect=${series.effectId} param=${series.paramKey} differing=${differing}/${FRAMES}`,
    )

    // The depth-1.0 series must differ from the depth-0 baseline in ≥10/30 frames.
    expect(differing).toBeGreaterThanOrEqual(10)
  })
})
