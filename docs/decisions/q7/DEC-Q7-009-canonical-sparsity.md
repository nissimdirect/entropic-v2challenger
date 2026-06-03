# DEC-Q7-009 — Canonical sparsity ratio for the Tier 5 verdict

**Status:** Decided 2026-06-03
**Owner:** Q7 PR #5
**Scope:** Which sparsity ratio (1:N) is the official Tier 5 commit point.

## Question

The Q7 benchmark measures interpolation jitter at FOUR sparsity ratios: 1:4, 1:8, 1:16, 1:32 (per master roadmap PR #4 spec). Higher sparsity = fewer real encodes per second = lower compute load = more interpolation "slack" between true latents. But higher sparsity also means worse perceptual continuity (the slerp'd intermediate frames diverge further from a true encode).

Which ratio do we hold the `<50ms p95` gate against? Or do we require multiple ratios to pass?

## Decision

**Canonical sparsity: 1:8.** The Tier 5 GO/NO-GO verdict is computed against jitter at sparsity 1:8.

Other sparsities (1:4, 1:16, 1:32) are measured and reported but do NOT independently determine the verdict.

### Why 1:8

| Sparsity | Compute cost vs dense | Perceptual quality | Why not the canonical |
|---|---|---|---|
| 1:4 | ~25% of dense | excellent (slerp interpolates 3 frames; small angular drift) | too expensive — Tier 5 routinely runs at 60fps; 1:4 means 15 encodes/sec per active L route which strains the budget |
| **1:8** ← **chosen** | **~12.5% of dense** | **good (slerp interpolates 7 frames)** | **best compute/quality tradeoff for the typical Tier 5 use case (4 active L routes at 60fps = 30 encodes/sec total)** |
| 1:16 | ~6% of dense | acceptable (slerp 15 frames; visible angular drift on slow camera moves) | risk of perceptual artifacts on slow content; not safe as default |
| 1:32 | ~3% of dense | poor (slerp 31 frames; obvious drift on most content) | use only as fallback under SG-8 memory pressure |

### Why a single canonical ratio (not "must pass all four")

- **Communication clarity:** "Tier 5 GO" with a single percentile + single sparsity is unambiguous
- **Implementation simplicity:** PR #6 SG-8 design uses 1:16 / 1:32 as auto-degrade fallbacks; they're already coded as a recovery path. Requiring them to ALSO pass the 50ms gate at full quality would conflict with their "graceful degradation" role
- **Pragmatism:** if 1:8 passes, 1:16 + 1:32 are almost certainly faster (less work per encode); they don't need their own gate
- **Failure mode honesty:** if 1:4 fails but 1:8 passes, the verdict is still TIER_5_GO; users who want 1:4 quality will need to wait for MLX optimization or quantized models (future work, not a v1 blocker)

### Reporting

All four sparsity ratios are measured AND reported:

```json
{
  "interpolation": {
    "canonical_sparsity": 8,
    "by_sparsity": {
      "4":  { "jitter_p95_ms": 38.2, "jitter_p99_ms": 51.1 },
      "8":  { "jitter_p95_ms": 22.4, "jitter_p99_ms": 31.8 },
      "16": { "jitter_p95_ms": 14.1, "jitter_p99_ms": 19.6 },
      "32": { "jitter_p95_ms": 9.8,  "jitter_p99_ms": 13.4 }
    },
    "jitter_p95_ms": 22.4,
    "below_threshold_50ms": true
  }
}
```

The top-level `jitter_p95_ms` references the canonical sparsity (1:8). Verdict logic (DEC-Q7-007) reads only that field.

### SG-8 interaction

When memory pressure hits 75% (SG-8 §3 per SPEC-3), the system degrades sparsity in this order:
- 1:8 (default canonical) → 1:16 (lighter)
- 1:16 → 1:32 (lightest)
- 1:32 still insufficient → drop a backbone (CLAP → CLIP → DINOv2 per SPEC-5)

The Q7 report under PR #5 establishes the baseline at 1:8. PR #6 SG-8 design uses these measurements to pick the canonical degrade behavior.

## Considered alternatives

- **Canonical = 1:4** — REJECTED. Too compute-heavy for v1; Tier 5 routinely runs multiple L routes simultaneously
- **Canonical = 1:16** — REJECTED. Acceptable but risks visible drift on slow content; not safe as default
- **"Must pass at all four sparsities"** — REJECTED. Conflicts with graceful-degradation philosophy; over-specifies the gate
- **Adaptive sparsity (let the runtime pick)** — DEFERRED. Reasonable v2 direction; needs telemetry to inform; out of scope for v1 verdict

## Side effects to track

- Report JSON adds `interpolation.canonical_sparsity` (integer) and `interpolation.by_sparsity` (dict). Schema bumps 0.2.0 → 0.3.0 (paired with DEC-Q7-007 changes)
- Existing `interpolation.sparsity` becomes ambiguous — replaced by `canonical_sparsity` (more precise)
- runner.py `--sparsity` CLI flag becomes `--canonical-sparsity` (the verdict-deciding ratio); a new `--all-sparsities` flag (default true) controls whether 1:4 / 1:16 / 1:32 are also measured

## Verification

After PR #5 merges:

```bash
cd backend/scripts && python3 -m q7_benchmark.runner --mock --out /tmp/r.json
cat /tmp/r.json | jq '.measurement.interpolation.canonical_sparsity, .measurement.interpolation.by_sparsity | keys'
# Expected: 8 ; ["16","32","4","8"]
```

## Cross-references

- DEC-Q7-007 (jitter threshold) — verdict computation depends on canonical sparsity field
- SPEC-3 §5 (SG-8) — degrade order uses sparsity as a recovery lever
- SPEC-5 §9 — Q7 benchmark spec (which sparsities to measure)
- Master roadmap PR #5
