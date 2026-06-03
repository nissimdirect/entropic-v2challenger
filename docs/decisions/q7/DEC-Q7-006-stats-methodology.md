# DEC-Q7-006 — Benchmark statistics methodology

**Status:** Decided 2026-06-03
**Owner:** Q7 PR #4
**Scope:** How to measure latency reliably: warmup, sample count, percentile computation, outlier handling.

## Question

The Q7 verdict hinges on per-model encode latency (p50/p95/p99) and interpolation jitter (PR #5). Bad methodology → wrong verdict → wrong Tier 5 GO/NO-GO call. We need a single defensible measurement protocol.

## Decision

### Warmup (mandatory)

- **3 warmup iterations** before any timing capture, for every backbone + every backend
- Warmup outputs ARE compared for shape (catches dead encode paths) but timing is DISCARDED
- Why 3: first iteration triggers lazy load (cold-load measured separately), second/third stabilize CPU caches + MLX JIT compile

### Sample count

- **100 measured iterations** per backbone in the standard benchmark
- Configurable via `--n-iterations` CLI flag for debug
- Why 100: yields stable p95 (with ±5% confidence), p99 (with ±15% confidence). For tighter p99, bump to 1000 via CLI override.

### Percentile computation

- Use `numpy.percentile(latencies, [50, 95, 99], method="linear")` (default interpolation method)
- Also compute `max`, `min`, `stddev`, `mean` for completeness
- Report ALL of these — verdict uses p95 as the primary gate (per DEC-Q7-007 jitter threshold)

### Outlier handling

- NO outlier removal. We report raw percentiles.
- Rationale: Q7's <50ms gate is about user-perceived smoothness. A real worst-case 200ms encode that the user will hit must NOT be hidden by a trimmed mean.
- Stdev exposes variance; if stdev > p50, the report flags "high variance — Tier 5 may have hitches"

### Per-iteration timing

- `time.perf_counter()` for wall-clock (best resolution on macOS — Mach-monotonic)
- Capture per-iteration latency in ms (float64)
- Single call wraps the encode: `t0 = perf_counter(); loader.encode(payload); elapsed_ms = (perf_counter() - t0) * 1000`

### Cold-load

- Measured ONCE per backbone, in a separate phase from the steady-state benchmark
- Reported as `cold_load_seconds` on the loader instance
- Included in the JSON report under `heads.<name>.cold_load_seconds`
- Decision impact: if cold-load > 10s for any backbone, flag in the verdict as "first-launch UX requires loading screen"

### Concurrent calls (queue saturation)

- Separate benchmark: spawn N threads, each issuing back-to-back encodes for 5 seconds
- Measure: total encodes completed, throughput per backbone
- N defaults to 4 (matches typical M-series performance core count); configurable
- Report under `measurement.queue.throughput_encodes_per_s`

### "Latency under load" scenario (CTO R3)

- After steady-state benchmark, simulate a 10-effect render-chain workload (CPU + memory pressure) for 30 seconds
- Re-measure interpolation jitter during the load
- If jitter degrades >2× → flag `verdict.degradation_under_load: true`

### Deterministic vs sequential

- Steady-state benchmark uses the SAME synthetic frame for all iterations (per-iteration latency variance reflects backbone/backend, not input variance)
- For real-world calibration, optional `--with-frame-stream` flag uses a video sample (deferred to PR #5+)

## Considered alternatives

- **30 warmup iterations** — REJECTED. Overkill; 3 is enough for cache/JIT warmup. Saves test time.
- **Trimmed mean (drop top/bottom 5%)** — REJECTED. Hides worst-case behavior that matters for the Tier 5 verdict.
- **HDR histogram instead of percentiles** — REJECTED for v1. Adds dep + reporting complexity. Percentiles + stddev are enough for the GO/NO-GO decision.
- **`time.process_time()` instead of `perf_counter()`** — REJECTED. Want wall-clock since user-perceived latency is wall-clock.
- **Skip warmup, just average** — REJECTED. First-iteration cold path is a 5-10× outlier on MLX/MPS. Without warmup, the mean is unrepresentative.

## Verification

After PR #4 merges:

```bash
# Mock benchmark produces 100-iteration stats per head with sensible shape
cd backend/scripts && python3 -m q7_benchmark.runner --mock --out /tmp/r.json
python3 -c "
import json
r = json.loads(open('/tmp/r.json').read())
for name, head in r['measurement']['heads'].items():
    lat = head['encode_latency']
    print(f'{name}: p50={lat[\"p50_ms\"]:.2f}ms p95={lat[\"p95_ms\"]:.2f}ms p99={lat[\"p99_ms\"]:.2f}ms n={lat[\"n_samples\"]}')"
# Expected: 3 heads, n=100, p99 > p95 > p50
```

## Cross-references

- DEC-Q7-007 (jitter threshold) — will use p95 as the primary gate
- DEC-Q7-009 (canonical sparsity) — measured under this same methodology
- CTO R3 — "latency under load" scenario
- DEC-Q7-002 (CI matrix) — smoke uses mock (much faster than 100 iterations)
