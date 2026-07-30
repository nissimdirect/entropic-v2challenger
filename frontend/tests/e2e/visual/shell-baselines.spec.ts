// WHY E2E: visual baselines require the real compositor — token/CSS drift,
// 0-CSS markup, native-blue controls, and truncation are only visible in the
// real Electron paint, not in happy-dom.
//
// ─── Screenshot-baseline lifecycle (FRONTEND-SDLC.md §3 — the law) ──────────
// The gate never forbids change — it forbids UNDECLARED change.
//
// • BIRTH: baselines are generated ON the CI runner (hermetic fixture:
//   1280×800, DPR 1 — F0.2) via a future workflow_dispatch job (a USER-merge
//   item; `.github/workflows/**` edits are owner-merge only). NEVER generate
//   canonical baselines on a dev Mac. `scripts/regen-baselines.sh` exists for
//   emergencies only and prints exactly this warning.
// • DECLARED CHANGE: a PR whose packet scope names surface X regenerates X's
//   baseline in the SAME PR; the before/after diff rides the PR for owner
//   approval.
// • REGRESSION: a diff on an UNdeclared surface → red. Fix the scope
//   declaration (consciously) or fix the CSS leak.
// • DEATH: surface removed → its baseline is deleted in the same PR.
// • REDESIGN MODE: a whole-frame change suspends affected baselines at start
//   and re-baselines at its exit gate.
// • ROLLOUT / AUTO-DEMOTE: main-push-only until stable two weeks → per-PR.
//   False positives blocking 2 PRs in a week → back to main-push-only (OD-2
//   verdict). Kill criterion: >30% of red runs blanket-regenerated over 60
//   days → the gate has no authority; delete it.
//
// ─── CI wiring (verified against .github/workflows/test.yml, NOT edited) ────
// The PR smoke gate (`electron-e2e` job) runs ONLY `tests/e2e/smoke.spec.ts`,
// so this spec never runs per-PR. It is picked up by the `electron-e2e-full`
// job (main-push only, sharded 1/4) whose glob is `tests/e2e/` — matching the
// main-push-only rollout stage above with zero workflow edits.
//
// ─── Determinism ────────────────────────────────────────────────────────────
// ONE Electron launch (single test, six toHaveScreenshot calls — surfaces are
// reached by in-app actions and build cumulatively). Every screenshot masks
// the nondeterministic regions (see MASK_SELECTORS) and uses
// maxDiffPixelRatio 0.001. Toasts are intentionally NOT masked: a toast
// appearing during these flows is itself a regression worth going red for.

import fs from 'fs'
import path from 'path'
import { test, expect } from '../fixtures/electron-app.fixture'
import { waitForEngineConnected } from '../fixtures/test-helpers'

// Playwright's default snapshot dir for this file. Baselines are committed
// like a lockfile once the CI workflow_dispatch generates them (SDLC §3
// "Birth"); until that dir exists this spec self-skips — running it locally
// must never fabricate baselines as a side effect.
const SNAPSHOT_DIR = path.join(__dirname, 'shell-baselines.spec.ts-snapshots')

// Escape hatch for the (documented, warned) emergency regen script and the
// future CI generation job: CREATRIX_REGEN_BASELINES=1 bypasses the guard so
// `--update-snapshots` can write the first baselines.
const REGEN_MODE = process.env.CREATRIX_REGEN_BASELINES === '1'

test.describe('Shell visual baselines (exit gate)', () => {
  test.skip(
    !REGEN_MODE && !fs.existsSync(SNAPSHOT_DIR),
    'No baseline snapshots yet — baselines are generated ON CI via workflow_dispatch (USER-merge item), never on a dev Mac. See FRONTEND-SDLC.md §3.',
  )

  test('six shell surfaces match their baselines', async ({ window, electronApp }) => {
    // Six screenshots + one Electron launch + sidecar connect: needs headroom
    // over the 30s default.
    test.setTimeout(180_000)

    // Nondeterministic regions, masked in EVERY screenshot:
    // - .preview-canvas__element  — the preview canvas (frame pixels vary)
    // - .preview-canvas__fps      — the FPS chip in the preview overlay bar
    // - .uptime                   — status-bar uptime counter ("Uptime: Ns")
    // - [data-testid="boot-line"] — status-bar boot line (rAF typing + fade
    //                               timing varies run-to-run)
    // - .memory-status            — memory-pressure badge (renders only under
    //                               load; masked so a busy CI runner can't
    //                               flip pixels). Locators matching zero
    //                               elements are a mask no-op.
    const mask = [
      window.locator('.preview-canvas__element'),
      window.locator('.preview-canvas__fps'),
      window.locator('.uptime'),
      window.locator('[data-testid="boot-line"]'),
      window.locator('.memory-status'),
    ]
    const SHOT = {
      mask,
      maxDiffPixelRatio: 0.001,
      animations: 'disabled' as const,
    }

    // ── Surface 1: empty shell ──────────────────────────────────────────────
    await waitForEngineConnected(window, 20_000)
    // Fonts must be resolved or text metrics shift between runs.
    await window.evaluate(() => document.fonts.ready)
    await expect(window.locator('.preview-canvas__placeholder')).toBeVisible()
    await expect(window).toHaveScreenshot('01-empty-shell.png', SHOT)

    // ── Surface 2: shell with one track added ───────────────────────────────
    // Empty-state add-track button (phase-4/timeline-ui.spec.ts precedent).
    await window.locator('.timeline__add-track-btn').first().click()
    await expect(window.locator('[data-testid="lean-track-header"]')).toBeVisible()
    await expect(window).toHaveScreenshot('02-one-track.png', SHOT)

    // ── Surface 3: device chain with one effect ─────────────────────────────
    // Search-filter to a known effect (fx.hue_shift — registered in
    // backend/src/effects/registry.py) so the click target is deterministic
    // regardless of category ordering; addEffect resolves the active track
    // (D1: selectedTrackId else first video track) — the track from surface 2.
    await window.locator('[data-testid="browser-search-input"]').fill('hue')
    await window.locator('.effect-browser__item').first().click()
    await expect(window.locator('.device-chain__item')).toBeVisible()
    // Clear + blur the search (the clear button does both) so no filter state
    // or text caret leaks into the shot.
    await window.locator('[data-testid="browser-search-clear"]').click()
    await expect(window).toHaveScreenshot('03-device-chain-one-effect.png', SHOT)

    // ── Surface 4: LAYER panel with track selected ──────────────────────────
    await window.locator('[data-testid="lean-track-header"]').first().click()
    await expect(window.locator('[data-testid="layer-panel"]')).toBeVisible()
    await expect(window.locator('[data-testid="layer-panel-name"]')).toContainText('LAYER')
    await expect(window).toHaveScreenshot('04-layer-panel-track-selected.png', SHOT)

    // ── Surface 5: automation strip region ──────────────────────────────────
    // Arm the track (R button), add a lane via the automation toolbar; the
    // param picker is populated by the hue-shift effect added in surface 3.
    await window.locator('.track-header__auto-btn').first().click()
    await window.locator('[data-testid="add-lane-btn"]').click()
    await expect(window.locator('[data-testid="param-picker"]')).toBeVisible()
    // DOM-level click: the picker popover can extend below the fixed 1280×800
    // window (no scroll in the shell), which fails Playwright's actionability
    // check. This is state SETUP, not an interaction-fidelity assertion — the
    // no-journey-suites rule (SDLC §4) means we don't pointer-test this flow.
    await window
      .locator('.auto-toolbar__picker-item')
      .first()
      .evaluate((el) => (el as HTMLElement).click())
    await expect(window.locator('[data-testid="automation-lane"]')).toBeVisible()
    await expect(window).toHaveScreenshot('05-automation-strip.png', SHOT)

    // ── Surface 6: UnsavedChangesDialog ─────────────────────────────────────
    // Reachable: send 'close-requested' straight to the webContents instead of
    // calling win.close() — the real close path arms a 5s force-close timer
    // (main/index.ts win.on('close')) that would kill the app mid-screenshot.
    // The renderer's onCloseRequested handler shows the dialog because the
    // undo store is dirty (track + effect + lane additions above all push
    // undo transactions). If the state were somehow clean the renderer would
    // confirmClose() and the app would quit — failing this test loudly, which
    // is the correct outcome.
    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].webContents.send('close-requested')
    })
    await expect(window.locator('.dialog')).toBeVisible()
    await expect(window.locator('.dialog__header')).toHaveText('Unsaved Changes')
    await expect(window).toHaveScreenshot('06-unsaved-changes-dialog.png', SHOT)
    // Dismiss (Cancel) so fixture teardown isn't blocked behind the dialog.
    await window.locator('.dialog__btn--secondary').click()
    await expect(window.locator('.dialog')).toBeHidden()
  })
})
