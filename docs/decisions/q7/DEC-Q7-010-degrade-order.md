# DEC-Q7-010 — Canonical SG-8 degrade order

**Status:** Decided 2026-06-03
**Owner:** Q7 PR #6
**Scope:** Resolves the three partial orderings of SG-8 memory-pressure degradation across BUILD-PLAN (4 items), SPEC-3 (7 items), and SPEC-5 (CLAP→CLIP→DINOv2). Canonicalizes the order so the runtime, the spec docs, and the user expectation are all aligned.

## Question

Three documents describe SG-8 degrade behavior with three different (overlapping) priority lists:

- **Creatrix BUILD-PLAN.md** lists 4 items: D4 latent grains → A5 spectral → A1 grain density → E1 VAE
- **SPEC-3 §5** lists 7 items: D4 → A5 → A1 density → E1 → Frame Bank → GPU pools → Q7 heads
- **SPEC-5 (L backbone)** lists 3 L-heads: CLAP → CLIP → DINOv2 (within the "Q7 heads" bucket of SPEC-3)

What order does the runtime use? Where does the L-head ordering sit relative to the other items?

## Decision

**The canonical SG-8 degrade order has 8 stages.** When the pressure monitor (DEC-Q7-011) crosses each threshold, the system attempts the next stage. Recovery (pressure drops) re-enables in reverse order.

| Stage | Action | Owner | Pressure threshold |
|---|---|---|---|
| 1 | Drop **D4 latent grain pool** (kill cached embedding palette) | PR #11 SG-8 implementation | 75% |
| 2 | Drop **A5 spectral granulator state** (clear FFT memo) | PR #11 | 75% |
| 3 | Reduce **A1 grain density by 50%** (halve per-frame grain count) | PR #11 | 75% |
| 4 | Suspend **E1 per-project VAE** (use generic embedding only) | PR #11 | 80% |
| 5 | Drop **Frame Bank cache** (force redecode) | PR #11 | 82% |
| 6 | Release **GPU texture pool** (force re-upload) | PR #11 | 85% |
| 7 | Unload **CLAP** (audio-text L head) | PR #11 + PR #9 worker | 88% |
| 8 | Unload **CLIP** (vision-text L head) | PR #11 + PR #9 worker | 91% |
| 9 | Unload **DINOv2** (vision L head) — **last resort** | PR #11 + PR #9 worker | 94% (emergency) |

Above stage 9, the system kills the L worker entirely (process exit) and routes all L-dependent features to a `BackboneUnavailable` graceful-fallback state. Render path continues.

### L-head ordering rationale (CLAP → CLIP → DINOv2)

CLAP last? No — **first** to drop because:
1. **Largest memory footprint** (~300MB CLAP vs ~150MB CLIP vs ~22MB DINOv2)
2. **Lowest expected usage in v1** — audio-text routing is the least-used cross-modal path; most v1 Tier 5 features (C5 latent trajectory, C6 self-wavetable, C8 feedback) use vision latents
3. **Re-load cost acceptable** — when pressure subsides, lazy-reload from cache is ~3-5s wait, acceptable for a low-usage feature

DINOv2 last to drop because:
1. **Smallest footprint** (~22MB; freeing it barely helps)
2. **Most-used backbone** (every C-tier feature touches vision)
3. **Smallest re-load cost** — but its absence is the most user-visible

### Cross-doc reconciliation

After PR #6 merges, the source-of-truth ordering lives ONLY in this decision doc + `backend/src/safety/pressure/degrade_order.py`. The other three docs get updated in a follow-up commit to reference this one:

- BUILD-PLAN.md: replaces its 4-item list with "see DEC-Q7-010 for canonical 9-stage order"
- SPEC-3 §5: replaces its 7-item list with same reference
- SPEC-5: keeps CLAP→CLIP→DINOv2 but notes "this is stages 7-9 of DEC-Q7-010"

## Considered alternatives

- **Drop DINOv2 first (alphabetical)** — REJECTED. Largest memory wins for "drop first"; not alphabetical
- **Drop all three L heads simultaneously at 90%** — REJECTED. Graduated degradation preserves user value longer; sudden 3-backbone drop is a worse UX than progressive
- **Drop GPU pools BEFORE Frame Bank** — REJECTED. GPU pool release forces re-upload (CPU→GPU bandwidth cost). Frame Bank drop is purely memory recovery without re-render cost. Cheaper to drop first
- **Use round-robin across L heads instead of priority** — REJECTED. Round-robin destabilizes the user experience (random feature unavailability). Priority is predictable

## Side effects to track

- `backend/src/safety/pressure/degrade_order.py` is the runtime source of truth (PR #11)
- Each degraded feature must register a `degrade()` + `restore()` callback in the feature registry
- The pressure monitor (DEC-Q7-011) consults this order; PR #11 implementation enforces it
- Report JSON optionally surfaces `degrade_history: [{stage, fired_at, reason}, ...]` for diagnostics (deferred to PR #7)

## Verification

After PR #6 merges:

```bash
# Order constant is exported and importable
cd backend/scripts && python3 -c "
from q7_benchmark.degrade_order import CANONICAL_DEGRADE_ORDER
for i, stage in enumerate(CANONICAL_DEGRADE_ORDER, 1):
    print(f'{i}. {stage.name} (threshold {stage.threshold_pct}%)')"
# Expected: 9 stages in the order above
```

## Cross-references

- DEC-Q7-011 (memory budget) — defines `pressure_percent()` that this order consults
- SPEC-3 §5 — SG-8 contract (this decision IS the canonical SG-8 order)
- SPEC-5 — L head ordering (folded into stages 7-9 here)
- Creatrix BUILD-PLAN — original 4-item list (now superseded)
