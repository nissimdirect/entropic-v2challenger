# PR #5 — Interpolation Jitter (the Tier 5 Gate)

The verdict-producing PR. Implements sparse-encode + slerp interpolation, measures per-sparsity jitter at {4, 8, 16, 32}, computes the verdict per DEC-Q7-007, and lights up real DINOv2 encode so the Apple-silicon measurement is meaningful.

**This is the highest-stakes PR of Session 1** — its output is the Tier 5 GO/NO-GO commit.

**Stacked on PR #121** (latency bench). Rebases to main once #117 + #118 + #119 + #121 merge.

## Uncertainty register

- [x] **UNK-01:** Which percentile gates Tier 5? → **DEC-Q7-007**: p95 < 50ms at canonical sparsity.
- [x] **UNK-02:** Which sparsity is canonical? → **DEC-Q7-009**: 1:8.
- [x] **UNK-03:** What's the verdict shape — GO/NO-GO binary or graded? → **DEC-Q7-007**: three states (GO, CONDITIONAL, NO_GO) + advisory flags.
- [ ] **UNK-04:** Slerp formula for high-dim unit vectors — straight from the unit-quaternion formula or a generalized version? → Use the standard formula (works for any N-dim unit vector); guard against parallel vectors (linear fall-through).
- [ ] **UNK-05:** Light up CLIP + CLAP encode in PR #5 or defer? → DECISION: ONLY DINOv2 lit in PR #5 (the jitter-relevant backbone). CLIP + CLAP stay as NotImplementedError stubs (real impl deferred to Session 2 PR #9 or later if the verdict justifies).
- [ ] **UNK-06:** Real DINOv2 input — frame array shape + dtype? → Per existing convention: HxWx3 uint8 BGR (matches OpenCV); loader handles conversion to ImageNet-normalized float32 internally.
- [ ] **UNK-07:** Should jitter be measured under load too, or only steady-state? → Steady-state for the verdict; under-load is the existing CTO R3 measurement on encode latency (not jitter). Re-using the existing under_load.py is fine.

## Scope

### What to test (smoke tier, mock)
- [ ] `jitter.py` slerp produces correct interpolation (known vector pairs)
- [ ] `jitter.measure_jitter` runs sparse-encode at each sparsity ratio
- [ ] Per-sparsity stats computed correctly
- [ ] `verdict.compute_verdict` returns GO / CONDITIONAL / NO_GO based on canonical p95
- [ ] Advisory flags surface correctly (HIGH_VARIANCE, DEGRADES_UNDER_LOAD)
- [ ] Schema 0.3.0 round-trip valid
- [ ] mock_measure() produces a verdict
- [ ] runner --measure produces a verdict from real bench results

### Edge cases
- [ ] Slerp with parallel vectors → linear fall-through (no div-by-zero)
- [ ] Slerp with anti-parallel vectors → still produces unit vector
- [ ] Single-sparsity benchmark (sparsity=1 means dense; should still work) — deferred to optional CLI
- [ ] Verdict on borderline p95 (49.99 → GO, 50.01 → CONDITIONAL)
- [ ] DINOv2 encode with non-224x224 frame → resized internally
- [ ] DINOv2 encode with grayscale or RGBA → converted to 3-channel
- [ ] DINOv2 encode without torch installed → clear NotImplementedError with install hint

### How to verify
- Unit tests: `pytest tests/test_q7_benchmark/test_jitter.py -m smoke -q`
- Mock pipeline: `make q7-smoke` (now includes verdict)
- Real DINOv2 (Apple silicon, requires requirements-q7-measure.txt): `make q7-measure`
- Verdict snapshot: `python3 -c "from q7_benchmark.verdict import compute_verdict; print(compute_verdict(45.0, False, False))"` → `("TIER_5_GO", [])`

### Patterns
- Slerp: numpy implementation; reference https://en.wikipedia.org/wiki/Slerp
- DINOv2 loading: `torch.hub.load('facebookresearch/dinov2', 'dinov2_vits14')` OR `transformers.AutoModel.from_pretrained('facebook/dinov2-small')`; PR #5 uses transformers + huggingface_hub (already pinned in requirements-q7-measure.txt)

## Checkboxed items

### A. Decision docs first
- [ ] **DEC-Q7-007** Jitter threshold (p95 < 50ms canonical; 3 verdict states; advisory flags)
- [ ] **DEC-Q7-009** Canonical sparsity = 1:8; report all four; verdict reads canonical only

### B. Files to add
- [ ] `backend/scripts/q7_benchmark/jitter.py` — slerp + measure_jitter (sparse-encode interpolation)
- [ ] `backend/scripts/q7_benchmark/verdict.py` — compute_verdict + verdict states + flag logic
- [ ] `backend/tests/test_q7_benchmark/test_jitter.py` — slerp correctness + measure_jitter shape + edge cases
- [ ] `backend/tests/test_q7_benchmark/test_verdict.py` — three states + advisory flags + boundary
- [ ] `backend/tests/test_q7_benchmark/test_dinov2_real.py` — REAL torch path tests (marked `@pytest.mark.requires_torch`; skip if not installed); load + encode + shape assertions

### C. Files to modify
- [ ] `backend/scripts/q7_benchmark/loaders/dinov2.py` — light up `DINOv2Loader.encode()` lazy-loading torch + transformers + HF; ImageNet normalization; forward pass
- [ ] `backend/scripts/q7_benchmark/runner.py` — wire jitter measurement + verdict; CLI flags `--canonical-sparsity` (default 8); compute verdict in --measure and --mock
- [ ] `backend/scripts/q7_benchmark/report.py` — bump REPORT_SCHEMA_VERSION to 0.3.0; validate verdict + by_sparsity
- [ ] `backend/scripts/q7_benchmark/schemas/q7-report.schema.json` — 0.3.0 shape
- [ ] `backend/scripts/q7_benchmark/mock.py` — produce 0.3.0 shape including verdict + by_sparsity
- [ ] `backend/scripts/q7_benchmark/loaders/models.toml` — DINOv2 revision SHA (captured after first download)
- [ ] `Makefile` — q7-jitter target (run jitter benchmark alone)

### D. Validation
- [ ] All PR #5 tests pass
- [ ] 82 PR #4 tests still pass (no regression)
- [ ] `make q7-smoke` passes (schema 0.3.0 round-trip)
- [ ] Verdict produced in both mock + measure modes
- [ ] DINOv2 real encode produces a 384-dim unit vector when torch installed

### E. PR open + merge
- [ ] `gh pr create --base feat/q7-latency-bench --draft --title "[q7] PR #5: interpolation jitter + Tier 5 verdict (DEC-Q7-007 + DEC-Q7-009)"`
- [ ] CI green
- [ ] User merge nod (parallel-session sweep per `[[feedback_check-parallel-before-merge]]`)
- [ ] Squash merge

## Effort estimate (high effort directive)

- Decision docs DEC-Q7-007 + DEC-Q7-009: 1 h
- jitter.py + verdict.py + tests: 2 h
- DINOv2 real encode light-up (lazy import, HF download, forward pass): 2-3 h
- test_dinov2_real.py (marker, skip-if-no-torch): 30 min
- Schema 0.3.0 + mock + report updates: 1 h
- runner wiring + verdict surfacing: 1 h
- PR open + CI cycle: 30 min
- **Total: ~8-9 h** for the deep build

## What this does NOT do

- Light up CLIP encode (deferred — jitter only needs vision; CLIP image lit if jitter measurement is extended later)
- Light up CLAP encode (deferred — audio doesn't apply to frame jitter)
- Run on actual Apple silicon in CI (manual measurement on user's Mac after install)
- Produce the markdown report (PR #7 territory)

## Architecture

```
q7_benchmark/
├── runner.py        (extended; --canonical-sparsity flag; verdict surfacing)
├── bench.py         (no change)
├── stats.py         (no change)
├── jitter.py        (NEW — slerp + sparse-encode interpolation)
├── verdict.py       (NEW — three states + flags)
├── queue_sat.py     (no change)
├── under_load.py    (no change)
├── mock.py          (extended for 0.3.0 shape)
├── report.py        (schema 0.3.0)
├── loaders/
│   ├── dinov2.py    (encode LIT UP; lazy-imports torch + transformers)
│   ├── clip.py      (stub, unchanged)
│   ├── clap.py      (stub, unchanged)
│   ├── cache.py     (no change; verified.json populated by real download)
│   └── models.toml  (DINOv2 revision SHA captured)
└── schemas/
    └── q7-report.schema.json   (0.3.0)
```

## Next PR

PR #6 — SG-8 memory-pressure design + degrade order canonicalization + first-launch download UX + latent cache invalidation strategy. The last PR before Session 1 verdict commit (PR #7).
