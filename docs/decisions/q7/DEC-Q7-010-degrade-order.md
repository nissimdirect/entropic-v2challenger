# DEC-Q7-010 — Canonical SG-8 degrade order

**Status:** Decided 2026-06-03 · **USER-APPROVED 2026-06-05 (authoritative)**
**Owner:** Q7 PR #6 → carried into `adv/sg8-pressure` (SG-8 library PR)
**Scope:** Resolves the three partial orderings of SG-8 memory-pressure degradation across BUILD-PLAN (4 items), SPEC-3 (7 items), and SPEC-5 (CLAP→CLIP→DINOv2). Canonicalizes the order so the runtime, the spec docs, and the user expectation are all aligned. The 10-stage order below is now the user-approved authoritative ordering; `backend/src/safety/pressure/degrade_order.py` is its sole runtime source of truth.

## Question

Three documents describe SG-8 degrade behavior with three different (overlapping) priority lists:

- **Creatrix BUILD-PLAN.md** lists 4 items: D4 latent grains → A5 spectral → A1 grain density → E1 VAE
- **SPEC-3 §5** lists 7 items: D4 → A5 → A1 density → E1 → Frame Bank → GPU pools → Q7 heads
- **SPEC-5 (L backbone)** lists 3 L-heads: CLAP → CLIP → DINOv2 (within the "Q7 heads" bucket of SPEC-3)

What order does the runtime use? Where does the L-head ordering sit relative to the other items?

## Decision

**The canonical SG-8 degrade order has 10 stages — USER-APPROVED 2026-06-05 as the authoritative ordering.** When the pressure monitor (DEC-Q7-011) crosses each threshold, the system attempts the next stage. Recovery (pressure drops) re-enables in reverse order.

The 10 stage names — verbatim, matching `backend/src/safety/pressure/degrade_order.py::CANONICAL_DEGRADE_ORDER` exactly — are:

1. `d4_latent_grain_pool`
2. `a5_spectral_state`
3. `a1_grain_density_halved`
4. `e1_vae_suspended`
5. `frame_bank_cache_dropped`
6. `gpu_texture_pool_released`
7. `clap_unloaded`
8. `clip_unloaded`
9. `dinov2_unloaded`
10. `l_worker_killed`

| Stage | Name | Action | Owner | Threshold / Restore |
|---|---|---|---|---|
| 1 | `d4_latent_grain_pool` | Drop **D4 latent grain pool** (kill cached embedding palette) | PR #11 SG-8 implementation | 75% / 65% |
| 2 | `a5_spectral_state` | Drop **A5 spectral granulator state** (clear FFT memo) | PR #11 | 75% / 65% |
| 3 | `a1_grain_density_halved` | Reduce **A1 grain density by 50%** (halve per-frame grain count) | PR #11 | 75% / 65% |
| 4 | `e1_vae_suspended` | Suspend **E1 per-project VAE** (use generic embedding only) | PR #11 | 80% / 70% |
| 5 | `frame_bank_cache_dropped` | Drop **Frame Bank cache** (force redecode) | PR #11 | 82% / 72% |
| 6 | `gpu_texture_pool_released` | Release **GPU texture pool** (force re-upload) | PR #11 | 85% / 75% |
| 7 | `clap_unloaded` | Unload **CLAP** (audio-text L head) | PR #11 + PR #9 worker | 88% / 78% |
| 8 | `clip_unloaded` | Unload **CLIP** (vision-text L head) | PR #11 + PR #9 worker | 91% / 81% |
| 9 | `dinov2_unloaded` | Unload **DINOv2** (vision L head) — **last resort** | PR #11 + PR #9 worker | 94% / 84% (emergency) |
| 10 | `l_worker_killed` | Kill **L worker process** entirely; route all L features to `BackboneUnavailable` graceful-fallback | PR #11 + PR #9 worker | 97% / 87% (last resort) |

At stage 10, the system kills the L worker entirely (process exit) and routes all L-dependent features to a `BackboneUnavailable` graceful-fallback state. Render path continues. This stage is the process-exit backstop beyond all three source docs (BUILD-PLAN's 4, SPEC-3's 7, SPEC-5's CLAP→CLIP→DINOv2 = stages 7-9).

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

The source-of-truth ordering lives ONLY in this decision doc + `backend/src/safety/pressure/degrade_order.py`. The other three docs get updated in a follow-up commit to reference this one:

- BUILD-PLAN.md: replaces its 4-item list (latent grains → spectral → density → frame-bank) with "see DEC-Q7-010 for canonical 10-stage order"
- SPEC-3 §5: replaces its 7-item list with same reference
- SPEC-5: keeps CLAP→CLIP→DINOv2 but notes "this is stages 7-9 of DEC-Q7-010's 10-stage order"

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

```bash
# Order constant is exported and importable
cd backend && python3 -c "
import sys; sys.path.insert(0, 'src')
from safety.pressure.degrade_order import CANONICAL_DEGRADE_ORDER
for i, stage in enumerate(CANONICAL_DEGRADE_ORDER, 1):
    print(f'{i}. {stage.name} (threshold {stage.threshold_pct}%)')"
# Expected: 10 stages in the order above (d4_latent_grain_pool ... l_worker_killed)
```

`backend/tests/test_q7_benchmark/test_pressure.py::test_canonical_order_has_10_stages` enforces the count; `test_l_backbones_in_correct_order` enforces the CLAP→CLIP→DINOv2 sub-order.

## Cross-references

- DEC-Q7-011 (memory budget) — defines `pressure_percent()` that this order consults
- SPEC-3 §5 — SG-8 contract (this decision IS the canonical SG-8 order)
- SPEC-5 — L head ordering (folded into stages 7-9 here)
- Creatrix BUILD-PLAN — original 4-item list (now superseded)
