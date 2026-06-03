# PR #4 — Latency + Throughput Benchmark + Sidecar Topology

The benchmark instrumentation that PR #5's Tier 5 gate verdict depends on. Per-model encode p50/p95/p99/max/stddev across 100 iterations, queue saturation throughput, cold-load probe, and the canonical sidecar topology decision (DEC-Q7-008) that blocks Session 2 PR #9.

**Stacked on PR #119 (model loaders).** Will need to rebase to main once #117 + #119 merge.

## Uncertainty register

- [x] **UNK-01:** Sidecar topology — one process or two? → **Resolved in DEC-Q7-008:** separate L worker process for OS-level isolation, SG-4 compliance, bounded crash blast radius.
- [x] **UNK-02:** Warmup count, iteration count, percentile method? → **Resolved in DEC-Q7-006:** 3 warmup, 100 iterations, linear-interpolation percentiles, NO outlier removal.
- [ ] **UNK-03:** Where does the L worker entry-point live? → Decision sketch: `backend/src/q7_worker/__main__.py` (mirrors `backend/src/main.py`). PR #4 ships a stub; PR #9 lights up the real worker.
- [ ] **UNK-04:** Queue saturation default thread count? → Decision: 4 (matches M-series performance core count). Configurable via `--saturation-threads`.
- [ ] **UNK-05:** Should `--measure` mode require torch/mlx installed, or fall through gracefully? → Decision: lazy import in loader code path; `--measure` exits with clear error message if heavy deps missing. Real implementation in PR #5 / PR #9.
- [ ] **UNK-06:** Latency-under-load (CTO R3) implementation — synthetic CPU/memory load OR real 10-effect chain? → Decision: synthetic for PR #4 (no engine dep). Real-chain calibration deferred to PR #5.

## Scope

### What to test (mock tier)
- [ ] `runner.run_benchmark()` calls each loader N=100 times, captures latencies
- [ ] Warmup discards first 3 iterations from stats but exercises shape contract
- [ ] Cold-load is captured separately (sets `loader.cold_load_seconds`)
- [ ] Queue saturation spawns 4 threads, measures throughput
- [ ] Latency-under-load runs a 30-second background load + re-measures jitter (synthetic)
- [ ] JSON report shape extended for stats — schema_version bumps to 0.2.0
- [ ] All existing smoke tests still pass

### Edge cases
- [ ] Loader.encode raises NotImplementedError (real backends in PR #3 stub state) → benchmark catches + reports as "BACKEND_NOT_LIT" with clear message
- [ ] N=1 iteration → no stats (skip percentiles, just raw latency)
- [ ] Thread saturation with N_threads > CPU count → behavior documented, not crash
- [ ] Latency under load with no engine available → falls through to synthetic load
- [ ] Mock loader saturation behaves deterministically

### How to verify
- Smoke: `make q7-smoke` (uses mock loaders + small N)
- Full benchmark (mock): `cd backend/scripts && python3 -m q7_benchmark.runner --mock --n-iterations 100 --out /tmp/r.json`
- Schema validation: report.py validate
- Sidecar stub: `cd backend/scripts && python3 -m q7_worker --port 6001` then `ping`-test

### Existing patterns
- Threading: stdlib `concurrent.futures.ThreadPoolExecutor`
- Timing: `time.perf_counter()` per DEC-Q7-006
- Reporting: extend existing `q7-report.schema.json`

## Checkboxed items

### A. Decision docs
- [ ] **DEC-Q7-006** Stats methodology (warmup, N, percentiles, outliers, cold-load, queue saturation, under-load)
- [ ] **DEC-Q7-008** Sidecar topology (separate L worker process; blocks PR #9)

### B. Files to add
- [ ] `backend/scripts/q7_benchmark/bench.py` — benchmark orchestration (warmup, N iterations, stats collection)
- [ ] `backend/scripts/q7_benchmark/stats.py` — percentile + stddev computation; pure NumPy
- [ ] `backend/scripts/q7_benchmark/queue_sat.py` — concurrent-call throughput probe
- [ ] `backend/scripts/q7_benchmark/under_load.py` — synthetic background load + re-measure (CTO R3)
- [ ] `backend/src/q7_worker/__init__.py` — package marker
- [ ] `backend/src/q7_worker/__main__.py` — STUB worker entry-point (ZMQ REQ/REP on configurable port; responds to `ping` + `encode` with mock results; full impl in PR #9)
- [ ] `backend/scripts/q7_benchmark/requirements-q7-measure.txt` — pinned ML deps (torch, transformers, huggingface_hub, mlx, laion-clap, psutil, matplotlib) for `--measure` mode
- [ ] Tests for each: `test_bench.py`, `test_stats.py`, `test_queue_sat.py`, `test_under_load.py`, `test_q7_worker_stub.py`

### C. Files to modify
- [ ] `backend/scripts/q7_benchmark/runner.py` — wire benchmark into `--measure` path (still uses mock loaders by default; lazy-imports real loaders only when actually measuring)
- [ ] `backend/scripts/q7_benchmark/report.py` — bump `REPORT_SCHEMA_VERSION` to `0.2.0`; extend validator for new fields
- [ ] `backend/scripts/q7_benchmark/schemas/q7-report.schema.json` — schema 0.2.0 (cold_load_seconds, n_samples, queue throughput, degradation_under_load)
- [ ] `backend/scripts/q7_benchmark/mock.py` — update to match 0.2.0 shape (N samples, cold-load, queue, under-load fields)
- [ ] `Makefile` — `q7-saturation` + `q7-worker-stub` targets
- [ ] `.github/workflows/q7-smoke.yml` — no change (smoke still uses mock + small N)
- [ ] `docs/runbooks/q7/q7-smoke.md` — note schema bump

### D. Validation
- [ ] All PR #4 tests pass: `pytest backend/tests/test_q7_benchmark/ -m smoke -q`
- [ ] Existing 45 PR #3 tests still pass (no regression)
- [ ] `make q7-smoke` still passes (schema 0.2.0 round-trips)
- [ ] Worker stub responds to `ping`: `python3 -m q7_worker --port 6099 &; sleep 1; python3 -c "import zmq; ..."`
- [ ] CI green

### E. PR open + merge
- [ ] `gh pr create --base feat/q7-model-loaders --draft --title "[q7] PR #4: latency + throughput benchmark + sidecar topology (DEC-Q7-008)"`
- [ ] CI green
- [ ] Wait for PR #117 + PR #119 merges; rebase to main
- [ ] User merge nod (parallel-session sweep applied per [[feedback_check-parallel-before-merge]])
- [ ] Squash merge

## Effort estimate (high effort directive)

- Decision docs (DEC-Q7-006 + DEC-Q7-008): 1.5 h
- bench.py + stats.py + tests: 1.5 h
- queue_sat.py + under_load.py + tests: 1 h
- q7_worker stub + tests: 1 h
- Schema 0.2.0 migration + mock update + report tests: 1 h
- PR open + CI cycle: 30 min
- **Total: ~6-7 h** for the comprehensive build

## Architecture notes

```
backend/scripts/q7_benchmark/
├── runner.py                  (existing; extended in PR #4 — wires bench)
├── report.py                  (schema 0.2.0)
├── backends.py                (PR #1 — no change)
├── mock.py                    (extended for 0.2.0 shape)
├── bench.py                   (PR #4 NEW — orchestration)
├── stats.py                   (PR #4 NEW — pure-numpy percentiles)
├── queue_sat.py               (PR #4 NEW — concurrent encode throughput)
├── under_load.py              (PR #4 NEW — CTO R3 latency-under-load)
├── loaders/                   (PR #3 — no change in PR #4)
├── schemas/
│   └── q7-report.schema.json  (bumped to 0.2.0)
├── requirements-q7.txt         (PR #3 — numpy only)
└── requirements-q7-measure.txt (PR #4 NEW — full ML deps)

backend/src/q7_worker/         (PR #4 NEW)
├── __init__.py
└── __main__.py                 (ZMQ stub; full impl in PR #9)
```

## Next PR

PR #5 — Interpolation jitter at sparsity {4, 8, 16, 32} = **the Tier 5 gate**. Lights up real `encode()` paths on Apple silicon. Sparse-encode + slerp; verdict computation.
