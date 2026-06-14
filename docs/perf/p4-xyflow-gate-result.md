# P4.0 xyflow-gate perf measurement result

## Purpose

This document records the on-target performance measurement for P4.0. The harness
lives at `frontend/spike/xyflow-gate/` (spike branch only — not merged). The verdict
determines whether packet **P4.5** takes the `@xyflow/react` dependency or builds bare
SVG + rAF batching for the Creatrix routing canvas.

**Status: MEASURED 2026-06-14.** Verdict at the bottom.

---

## Environment

| Field | Value |
|---|---|
| Machine | Apple M4 (arm64) |
| OS | macOS 26.2 |
| Renderer | Playwright-bundled Chromium, build 1208 (≈ Chromium 141, Blink) |
| App runtime (for reference) | Electron ^40.0.0 (Chromium ~130) — see cross-environment caveat |
| Node version | v25.6.1 |
| Date / run by | 2026-06-14 / orchestrator (headed Playwright, real GPU compositing) |
| Display / refresh rate | 1920×1080 @ **100 Hz** (→ rAF cadence floor ≈ 10 ms/frame) |

---

## Methodology — and a correction to the harness's headline metric

The harness's on-page table compares **rAF-callback delta** (`performance.now()` between
successive `requestAnimationFrame` callbacks) against the `< 5 ms p50 / < 8 ms p95`
thresholds. **That comparison is invalid** and its on-page PASS/FAIL must be ignored:
rAF delta is **vsync-bound** — on this 100 Hz display it floors at ~10 ms and on a 60 Hz
display at ~16.7 ms, *regardless of how little work each frame does*. So rAF-delta p50/p95
measure **refresh cadence**, not scripting+render work-time, and can never read < 5 ms for
any animation that holds framerate. (This is exactly the "judgment about measurement
methodology" the packet flagged as RISK:HIGH.)

What is actually measured here, and how the thresholds are applied:

1. **True scripting+render work-time per frame** (the `< 5 / < 8 ms` gate) — taken from
   Chrome DevTools `Performance.getMetrics` over the measurement window via a CDP session:
   `work/frame = Δ(ScriptDuration + LayoutDuration + RecalcStyleDuration) ÷ 720`
   (720 = 120 warm-up + 600 measured frames in the sampling window). This is main-thread
   busy time per frame — the correct quantity for "is rendering cheap enough."
   Because the scene cost is near-constant per frame (0 dropped frames ⇒ no outlier frames),
   this **mean** work-time stands in for both p50 and p95 within the 38× margin observed.
2. **Dropped frames** (the real "holds 60 fps" gate) — count of rAF deltas > 17 ms (a missed
   vsync). Correctly measured by the harness; this is the meaningful framerate-hold metric.
3. **rAF cadence (p50/p95/max)** — reported as *informational* (it reflects the 100 Hz display).

- **Warm-up:** first 120 rAF frames discarded. **Window:** next 600 frames recorded.
- **Runs:** 3 per impl × variant; the **worst** (highest work-time / highest dropped) is reported.
- **Driver:** headed Playwright Chromium, real window + GPU compositing on the M4.

---

## Results (worst of 3 runs)

### Gating metrics — 32 paths

| Metric | PASS threshold | xyflow | bare SVG | xyflow verdict |
|---|---|---|---|---|
| Work-time / frame (script+layout+style, CDP) | < 5.0 ms | **0.127 ms** | 0.161 ms | ✅ PASS (39× margin) |
| Work-time / frame as p95 proxy | < 8.0 ms | **0.127 ms** | 0.161 ms | ✅ PASS |
| Dropped frames (rAF delta > 17 ms) / 600 | ≤ 6 | **0** | 0 | ✅ PASS |
| max rAF delta (informational) | — | 12.1 ms | 12.0 ms | — |

### 64-path headroom (informational)

| Impl | work/frame | dropped/600 | rAF p95 |
|---|---|---|---|
| xyflow | 0.129 ms | 0 | 11.9 ms |
| bare-svg | 0.189 ms | 0 | 11.9 ms |

### Per-frame work breakdown (worst run, ms/frame)

| Config | script | layout | style | total |
|---|---|---|---|---|
| xyflow / 32 | 0.065 | 0.000 | 0.061 | 0.127 |
| bare-svg / 32 | 0.066 | 0.039 | 0.056 | 0.161 |
| xyflow / 64 | 0.065 | 0.000 | 0.064 | 0.129 |
| bare-svg / 64 | 0.078 | 0.047 | 0.065 | 0.189 |

**Gate rule:** ALL of work-time-p50, work-time-p95, and dropped-frames must PASS for xyflow
to PASS. All three pass.

**Notable:** xyflow's per-frame work is *lower* than bare-SVG's. xyflow animates a composited
CSS `transform` on a `<div>` (layout = 0; GPU compositor handles the move), whereas the bare-SVG
control animates `setAttribute('transform')` on an `<svg><g>`, which triggers a style recalc +
layout each frame (layout 0.039–0.047 ms). So the "dependency saving" of bare SVG does **not**
buy a perf win here — the edge-case clause (bare SVG beats xyflow p95 by > 2×) does not apply.

---

## Caveats / scope boundaries (read before relying on this for P4.5)

1. **Cross-environment:** measured in Chromium 141 (Playwright), not the app's Electron 40
   (Chromium ~130). Same Blink/compositor engine; the 39× threshold margin makes the verdict
   robust to that delta. A confirmation pass inside the actual Electron renderer is cheap and
   recommended but not gate-blocking given the margin.
2. **Transform-only animation (per P4.5's contract):** the harness animates ONLY the container
   transform (pan/zoom of a *static* graph), with path-`d` strings computed once and never
   recomputed — exactly the contract the packet specified. **This gate therefore proves xyflow
   holds framerate for pan/zoom of a static routing graph. It does NOT measure dynamic edge
   re-routing** (live path-`d` recompute as nodes move). P4.5 must keep per-frame edge animation
   to transforms; if live re-routing is needed, that is a separate measurement.
3. **Display is 100 Hz:** dropped-frame detection used the 60 fps threshold (> 17 ms). At 100 Hz
   the bar is effectively stricter (frames arrive every ~10 ms and none were missed), so the
   0-dropped result is conservative, not lenient.

---

## Raw run data

Full per-run JSON: `frontend/spike/xyflow-gate/results.json` on branch `spike/p4-0-xyflow-gate`
(commit references the harness `e49daa9` + runner). All 12 runs (4 configs × 3) reported 0
dropped frames and work-time within ±0.03 ms of the worst-case values above.

---

VERDICT: PASS (use react-xyflow)

P4.5 may take the `@xyflow/react` dependency. xyflow renders 32 (and 64) animated SVG-path
edges with 0 dropped frames and ~0.13 ms main-thread work per frame on the M4 target —
~39× under the 5 ms budget, and marginally cheaper than the bare-SVG control. The dependency
is justified; no perf reason to hand-roll bare SVG. (Scope: static-graph pan/zoom per the P4.5
contract — see caveat 2 for the dynamic-re-routing boundary.)
