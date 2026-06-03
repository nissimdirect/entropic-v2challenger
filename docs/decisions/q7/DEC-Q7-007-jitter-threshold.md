# DEC-Q7-007 — Jitter threshold interpretation (the Tier 5 gate)

**Status:** Decided 2026-06-03
**Owner:** Q7 PR #5
**Scope:** What latency percentile does the `<50ms` Tier 5 gate measure against, and how is the verdict computed.

## Question

The vision doc states the Tier 5 gate is "<50ms interpolation jitter on M1 Pro 16GB" (SPEC-5 §9). "Jitter" is ambiguous — it could mean p50, p95, p99, max, or a stddev-based metric. The wrong choice yields the wrong verdict.

User-perceived smoothness depends on the long tail of latency, not the typical case. A p50 of 12ms with a p99 of 180ms feels janky even though the median is great. Conversely, a tight p99 of 48ms with p50 of 35ms feels smooth despite a higher median.

## Decision

**Primary gate: `p95 < 50ms` at the canonical sparsity ratio** (per DEC-Q7-009 = 1:8).

This is the GO/NO-GO threshold. Single number, easy to communicate.

### Why p95 over alternatives

| Metric | Verdict tightness | Rationale |
|---|---|---|
| **p95** ← chosen | tight enough to catch hitches; loose enough not to be dominated by single-frame outliers (cache miss, GC) | Industry-standard for "smoothness" claims (audio plugins, real-time video) |
| p50 | too loose; misses the long tail that users actually feel | Hides janks |
| p99 | too tight for a v1 spike — Apple silicon GC + macOS thermal throttling produce occasional 5× outliers we don't want to gate on | Reserved for v2 cadence after MLX matures |
| max | dominated by single outliers; not actionable | Used only as a flag, not a gate |
| stddev/mean | not user-perceptible; abstract | Reported but not gated |

### Secondary signals (advisory, not gates)

- **`high_variance` flag** (per DEC-Q7-006): if `stddev > p50`, report adds a warning "Tier 5 may have hitches even though gate passed"
- **`p99 < 100ms`** as a soft target: if p99 exceeds 100ms, report includes a comment "consider re-running after macOS thermal cool-down" — does not affect verdict
- **`degradation_under_load < 2.0x`** (CTO R3): independent gate; if jitter degrades >2× under simulated load, report flags `verdict.degradation_concern: true` — does not block Tier 5 GO but is surfaced
- **Cold-load time** ≤ 10s per backbone: not a gate, but if any exceeds, report says "first-launch UX requires loading screen"

### Verdict computation (deterministic algorithm)

```python
def compute_verdict(jitter_p95_ms, high_variance, degradation_under_load):
    if jitter_p95_ms < 50.0:
        verdict = "TIER_5_GO"
    elif jitter_p95_ms < 100.0:
        verdict = "TIER_5_CONDITIONAL"  # close to threshold; re-measure on cold start
    else:
        verdict = "TIER_5_NO_GO"  # defer L-axis to v1.1 per Vision §11
    
    flags = []
    if high_variance:
        flags.append("HIGH_VARIANCE")
    if degradation_under_load:
        flags.append("DEGRADES_UNDER_LOAD")
    
    return verdict, flags
```

Three verdict states (not just GO/NO-GO):
- `TIER_5_GO` — p95 < 50ms; proceed with Tier 5 implementation in Session 2
- `TIER_5_CONDITIONAL` — 50ms ≤ p95 < 100ms; close to threshold; possibly thermal- or first-run-affected; user re-runs with cold start before final commit
- `TIER_5_NO_GO` — p95 ≥ 100ms; defer L-axis to v1.1 per Vision Round 1 contingency

## Considered alternatives

- **Use `<100ms` as the gate** — REJECTED. Vision doc explicitly says `<50ms`; we honor that. The `100ms` ceiling shows up as the boundary between CONDITIONAL and NO_GO.
- **Use a composite score (p50 × 0.3 + p95 × 0.5 + p99 × 0.2)** — REJECTED. Easier to game and harder to communicate. Single percentile is clear.
- **Use perceptual smoothness (e.g., 24fps frame budget = 41.67ms)** — REJECTED for v1. Interesting future direction; 50ms is a clearer numeric target.
- **Make the threshold backend-dependent (MLX < 50ms, MPS < 75ms, CPU advisory only)** — REJECTED. Tier 5 ships on Apple silicon (DEC-Q7-014); other backends are advisory only. One threshold simplifies.

## Side effects to track

- Report JSON adds `verdict: { state, flags }` at the top level (NOT inside measurement). Schema bumps 0.2.0 → 0.3.0.
- Mock mode produces a verdict too (deterministic based on synthetic jitter; defaults to GO since synthetic jitter < 50)
- The verdict commit lands in `~/.claude/projects/-Users-nissimagent/memory/entropic-synth-paradigm.md` + ACTIVE-TASKS.md at session close

## Verification

After PR #5 merges:

```bash
# Real measure → verdict in JSON
cd backend/scripts && python3 -m q7_benchmark.runner --measure --out /tmp/r.json
cat /tmp/r.json | jq '.verdict'
# Expected: { state: "TIER_5_GO" | "TIER_5_CONDITIONAL" | "TIER_5_NO_GO", flags: [...] }

# Mock mode also produces a verdict
python3 -m q7_benchmark.runner --mock --out /tmp/m.json
cat /tmp/m.json | jq '.verdict.state'
# Expected: "TIER_5_GO" (mock jitter is synthesized below threshold by default)
```

## Cross-references

- DEC-Q7-006 (stats methodology) — p95 computed per the percentile algorithm there
- DEC-Q7-009 (canonical sparsity) — p95 is measured at sparsity 1:8 (canonical)
- Vision doc §9 — original <50ms target
- SPEC-5 §9 — gate enforcement contract
- CTO R3 — `degradation_under_load` advisory tied to verdict surfacing
