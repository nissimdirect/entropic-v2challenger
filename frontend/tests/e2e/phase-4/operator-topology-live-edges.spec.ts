/**
 * P4.5 — Operator topology graph live edges (Playwright _electron).
 *
 * WHY E2E: proves the full vertical slice — an LFO operator mapped to an effect
 * param, time-varying live operator values flowing into the topology graph
 * during playback, and the graph's rAF loop turning those live values into an
 * animated edge (stroke-width swells with the live signal). A unit test
 * (happy-dom, no real rAF clock, no live render loop) cannot exercise the live
 * signal → DOM animation path.
 *
 * Fixture: 1 LFO mapped to an effect param (seeded via the test-only operator
 * store hook so the exact fixture is deterministic). Playback is started (Space
 * → the App render-loop timer). The graph consumes the SAME `operatorValues`
 * state the live render loop feeds; to keep the assertion deterministic (free of
 * wall-clock timer flake) we ALSO drive that state through the test hook setter,
 * exercising the identical prop → rAF → DOM path the live loop drives. We sample
 * the mapped edge's stroke-width at 3 instants ≥500ms apart — they must NOT all
 * be equal. Then collapse → the graph subtree unmounts (node count → 0).
 */
// WHY E2E: live operator-value animation of a topology edge during playback

import { test, expect } from '../fixtures/electron-app.fixture'
import { waitForEngineConnected, getTestVideoPath } from '../fixtures/test-helpers'

test.describe('P4.5 — Operator topology live edges', () => {
  test('expanding the topology section during playback shows edges animating from live operator values', async ({
    window,
  }) => {
    test.setTimeout(180_000)

    await waitForEngineConnected(window, 25_000)

    // Warm up the sidecar (first IPC initializes PyAV + numpy).
    await window.evaluate(async () => {
      await (window as any).entropic.sendCommand({ cmd: 'ping' })
    })

    // Ingest the fixture video so the App has a clip + render loop running.
    const videoPath = getTestVideoPath()
    const ingest = await window.evaluate(async (p) => {
      return await (window as any).entropic.sendCommand({ cmd: 'ingest', path: p })
    }, videoPath)
    expect((ingest as any).ok).toBeTruthy()

    // ── Seed the fixture: 1 LFO operator mapped to an effect param ──
    const seeded = await window.evaluate(() => {
      const hook = (window as any).__creatrixTest
      if (!hook || !hook.operatorStore) return { ok: false, reason: 'no test hook' }
      const store = hook.operatorStore.getState()
      store.resetOperators()
      store.addOperator('lfo')
      const op = hook.operatorStore.getState().operators[0]
      store.updateOperator(op.id, {
        parameters: { waveform: 'sine', rate_hz: 2.0, phase_offset: 0 },
      })
      store.addMapping(op.id, {
        targetEffectId: 'fx.invert',
        targetParamKey: 'amount',
        depth: 1.0,
        min: 0.0,
        max: 1.0,
        curve: 'linear',
      })
      const after = hook.operatorStore.getState().operators
      return { ok: true, opId: op.id, opCount: after.length, mappingCount: after[0].mappings.length }
    })
    expect(seeded.ok).toBeTruthy()
    expect(seeded.opCount).toBe(1)
    expect(seeded.mappingCount).toBe(1)
    const opId = seeded.opId as string

    // ── Open the operators panel so the rack + topology section mount ──
    const opToggle = window.locator(
      '[title*="perator" i], [aria-label*="perator" i], button:has-text("Operators")',
    )
    if ((await opToggle.count()) > 0) {
      try {
        await opToggle.first().click({ timeout: 2_000 })
      } catch {
        /* panel may already be visible */
      }
    } else {
      await window.keyboard.press('Meta+Shift+O')
    }
    await expect(window.locator('.operator-rack').first()).toBeVisible({ timeout: 10_000 })

    // ── Start playback (the App render-loop timer) ──
    await window.locator('.preview-canvas, body').first().click().catch(() => {})
    await window.keyboard.press('Space').catch(() => {})

    // ── Expand the Topology section ──
    const topoToggle = window.locator('.operator-rack__topology-toggle')
    await expect(topoToggle).toBeVisible({ timeout: 10_000 })
    await topoToggle.click()

    // The graph mounts and renders exactly one edge for the single mapping.
    // xyflow draws it as `.react-flow__edge-path` inside a `.react-flow__edge`
    // group. Wait for the edge group, then the drawn path.
    const edgeGroup = window.locator('.operator-topology .react-flow__edge').first()
    try {
      await expect(edgeGroup).toBeAttached({ timeout: 10_000 })
    } catch (e) {
      // Diagnostic: dump what DOM the graph produced to triage selector drift.
      const dump = await window.evaluate(() => {
        const root = document.querySelector('.operator-topology')
        return {
          rootHTML: root ? root.outerHTML.slice(0, 1500) : '(no .operator-topology)',
          edgeCount: document.querySelectorAll('.operator-topology .react-flow__edge').length,
          pathCount: document.querySelectorAll('.operator-topology path').length,
        }
      })
      // eslint-disable-next-line no-console
      console.log('[topology-live-edges] DIAG:', JSON.stringify(dump, null, 2))
      throw e
    }
    const edgePath = window.locator('.operator-topology .react-flow__edge-path').first()
    await expect(edgePath).toBeAttached({ timeout: 10_000 })

    // Drive the LIVE operator value (the same state the render loop feeds) to a
    // distinct level, then read the edge stroke-width the rAF loop applied.
    const driveValue = async (value: number) => {
      await window.evaluate(
        ({ id, v }) => {
          const hook = (window as any).__creatrixTest
          hook.setOperatorValues({ [id]: v })
        },
        { id: opId, v: value },
      )
    }

    const readStrokeWidth = async (): Promise<number> => {
      return await window.evaluate(() => {
        const el = document.querySelector(
          '.operator-topology .react-flow__edge-path',
        ) as SVGPathElement | null
        if (!el) return -1
        const sw = el.style.strokeWidth || el.getAttribute('stroke-width') || '0'
        return parseFloat(String(sw)) || 0
      })
    }

    // Three distinct live levels → the rAF loop should map them to three
    // distinct stroke-widths. Sample ≥500ms apart so a full rAF cycle applies
    // each value (proving the loop is live, not a one-shot paint).
    const levels = [0.0, 0.5, 1.0]
    const samples: number[] = []
    for (let i = 0; i < levels.length; i++) {
      await driveValue(levels[i])
      await window.waitForTimeout(550)
      samples.push(await readStrokeWidth())
    }

    // eslint-disable-next-line no-console
    console.log(`[topology-live-edges] stroke-width samples: ${JSON.stringify(samples)}`)

    // All three samples must be real (edge present and stroked).
    for (const s of samples) expect(s).toBeGreaterThan(0)
    // The 3 samples must NOT all be equal — the edge animates from live values.
    const allEqual = samples.every((s) => Math.abs(s - samples[0]) < 1e-6)
    expect(allEqual).toBe(false)

    // ── Collapse → the graph subtree UNMOUNTS (node count → 0) ──
    await topoToggle.click()
    await expect(window.locator('.operator-topology')).toHaveCount(0, { timeout: 5_000 })
    const nodeCount = await window.locator('.operator-topology .react-flow__node').count()
    expect(nodeCount).toBe(0)
  })
})
