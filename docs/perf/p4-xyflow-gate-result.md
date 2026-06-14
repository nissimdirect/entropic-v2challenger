# P4.0 xyflow-gate perf measurement result

## Purpose

This document records the live on-target performance measurement for P4.0.
The harness lives at `frontend/spike/xyflow-gate/`. The verdict determines
whether packet P4.5 takes the `@xyflow/react` dependency or builds bare SVG
+ rAF batching for the Creatrix routing canvas.

**All `_measure_` cells are filled during the live Electron run — never here.**

---

## Environment

| Field | Value |
|---|---|
| Machine | _measure_ |
| Electron version | _measure_ |
| Chrome (renderer) version | _measure_ |
| Node version | _measure_ |
| Date / run by | _measure_ |
| Display / refresh rate | _measure_ |

---

## Methodology

- **Warm-up exclusion:** first 120 rAF frames (~2 s at 60 fps) are discarded before sampling begins.
- **Measurement window:** 600 rAF frames (~10 s at 60 fps) are recorded per run.
- **Metric definition:** each sample = `performance.now()` delta between successive rAF callbacks. This captures scripting + compositing latency as seen by the JS event loop.
- **Percentile math:** samples sorted ascending. `p50 = sorted[floor(0.50 × n)]`, `p95 = sorted[floor(0.95 × n)]`, index clamped to `[0, n-1]`.
- **Dropped frames:** count of samples where delta > 17 ms (exceeds one 60 fps vsync period).
- **Runs per condition:** 3 runs per impl × variant. The **worst p95** across the 3 runs is the reported value.
- **64-path variant:** informational headroom only — not subject to the gate thresholds.

---

## Run instructions

1. Ensure `@xyflow/react` is installed: `cd frontend && npm install`.
2. Launch harness:
   ```
   cd frontend && npx vite spike/xyflow-gate --config spike/xyflow-gate/vite.config.ts --port 5199
   ```
3. Open `http://localhost:5199` in the Electron renderer (or Chrome for reference).
4. Select **xyflow** impl + **32-path** variant.
5. Click **Start measurement**. Wait ~12 s for the run to complete (120 warm-up + 600 measure).
6. The result table renders on-page. Also available in DevTools console as `[P4.0 perf result]` JSON.
7. Repeat 3 times. Record the **worst** p95.
8. Repeat steps 4–7 for **bare-svg** + **32-path**.
9. Optionally repeat for **64-path** variant on both impls (headroom only).
10. Transcribe all values into the verdict table below.

---

## Verdict threshold table

| Metric (32 paths, 10 s run, worst of 3) | PASS threshold | FAIL threshold | xyflow | bare SVG |
|---|---|---|---|---|
| p50 frame time (scripting+render) | < 5.0 ms | >= 5.0 ms | _measure_ | _measure_ |
| p95 frame time (scripting+render) | < 8.0 ms | >= 8.0 ms | _measure_ | _measure_ |
| Dropped frames (rAF delta > 17 ms) per 600 | <= 6 (1%) | > 6 | _measure_ | _measure_ |
| max frame time (informational) | — | — | _measure_ | _measure_ |
| 64-path p95 (informational headroom) | — | — | _measure_ | _measure_ |

**Gate rule:** ALL THREE of p50, p95, and dropped-frames criteria must PASS for xyflow
to receive a PASS verdict. A single criterion failing = xyflow FAILS = P4.5 takes the
bare-SVG + rAF batching path.

---

## Raw run data (fill during live run)

### xyflow / 32-path

| Run | p50 (ms) | p95 (ms) | max (ms) | dropped |
|---|---|---|---|---|
| 1 | _measure_ | _measure_ | _measure_ | _measure_ |
| 2 | _measure_ | _measure_ | _measure_ | _measure_ |
| 3 | _measure_ | _measure_ | _measure_ | _measure_ |
| **worst** | _measure_ | _measure_ | _measure_ | _measure_ |

### bare-svg / 32-path

| Run | p50 (ms) | p95 (ms) | max (ms) | dropped |
|---|---|---|---|---|
| 1 | _measure_ | _measure_ | _measure_ | _measure_ |
| 2 | _measure_ | _measure_ | _measure_ | _measure_ |
| 3 | _measure_ | _measure_ | _measure_ | _measure_ |
| **worst** | _measure_ | _measure_ | _measure_ | _measure_ |

### 64-path headroom (informational)

| Impl | Run 1 p95 | Run 2 p95 | Run 3 p95 | worst |
|---|---|---|---|---|
| xyflow | _measure_ | _measure_ | _measure_ | _measure_ |
| bare-svg | _measure_ | _measure_ | _measure_ | _measure_ |

---

## Notes / observations

_Fill during live run._

---

VERDICT: PENDING (awaiting live on-target measurement)
