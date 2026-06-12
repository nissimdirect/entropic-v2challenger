# DEC-Q7-011 — Base memory budget

**Status:** Decided 2026-06-03 · **RATIFIED 2026-06-05 as the override of SPEC-3 §5.2 Part A (RAM tiering)**
**Owner:** Q7 PR #6 → carried into `adv/sg8-pressure` (SG-8 library PR)
**Scope:** What memory baseline does the SG-8 pressure monitor read against? Total RAM or available RAM at session start? Per-tier (16/32/64GB) behavior?

> **Override note (2026-06-05):** SPEC-3 §5.2 **Part A — Detected RAM tiers** (16/24/32/64/96/128GB tiers + per-tier budget table, `MemoryBudget.detect_for_total_gb()`) is **superseded by this decision**. The runtime does NOT detect a discrete RAM tier and does NOT use `virtual_memory().total`. Instead it anchors on session-start `virtual_memory().available` (the honest free-RAM denominator). The spec's tiering API and its `app_ceiling_gb == 11.2` CI test are intentionally NOT implemented. This is a deliberate, user-ratified contract deviation — not an omission.

## Question

CTO finding R5: "16GB M1 base has 500MB Resident L + 500MB Electron renderer + 500MB Python sidecar + 4GB macOS ≈ 10-11GB available, not 16GB." Reading `psutil.virtual_memory().total` and dividing by tiered thresholds (60% / 75% / 90%) treats RAM as if the user had all of it free, when they don't.

The pressure monitor must work against `available` memory, not `total`. But "available at session start" vs "available right now" also matters — if the user's other apps consume RAM mid-session, do we degrade Q7?

## Decision

### Budget anchor: session-start `psutil.virtual_memory().available`

At Q7 session start (Python sidecar boot), capture:

```python
SESSION_BUDGET_BYTES = psutil.virtual_memory().available
```

This becomes the denominator for pressure thresholds. NOT `total`. NOT a fixed assumption like "16GB - 1.5GB hardcoded".

Rationale:
- Honest about what RAM the user actually has free for Q7
- Adapts to the user's runtime context (Logic Pro open + Chrome with 50 tabs vs. clean boot)
- Avoids the "60% of 16GB" trap that on a 16GB M1 leaves only 6.4GB headroom and the user immediately hits the warn threshold

### Numerator: Q7 resident memory only

```python
def q7_resident_bytes() -> int:
    """Memory consumed by Q7 specifically — L worker + Python sidecar's
    cached frames + Electron's frontend caches related to Q7 routes.
    
    NOT total system memory. The pressure monitor compares this delta
    against SESSION_BUDGET_BYTES."""
    import psutil
    proc = psutil.Process()
    # PR #6 v1: include this process + L worker child if alive
    rss = proc.memory_info().rss
    for child in proc.children(recursive=True):
        try:
            rss += child.memory_info().rss
        except psutil.NoSuchProcess:
            pass
    return rss
```

PR #11 wires the L worker process as a tracked child; PR #6 ships the function with just the current process (the L worker isn't spawned yet — PR #9 builds it).

### Tier thresholds (percentage of SESSION_BUDGET)

| Threshold | Action |
|---|---|
| 60% | Telemetry log "MEMORY_PRESSURE_WARN"; no UI change |
| 75% | Trigger degrade stages 1-3 (DEC-Q7-010) |
| 80% | Trigger degrade stage 4 (suspend E1 VAE) |
| 82% | Trigger degrade stage 5 (Frame Bank drop) |
| 85% | Trigger degrade stage 6 (GPU pool release) |
| 88% | Trigger degrade stage 7 (CLAP unload) |
| 91% | Trigger degrade stage 8 (CLIP unload) |
| 94% | Trigger degrade stage 9 (DINOv2 unload — emergency) |
| 97% | Kill L worker process; route to BackboneUnavailable fallback |

### Recovery thresholds (hysteresis to prevent flapping)

A degrade fires at threshold X; the corresponding restore fires when memory drops to X − 10% (e.g., DINOv2 unloads at 94%, restores at 84%). This 10pp hysteresis prevents oscillation when the user is right at the boundary.

### Per-tier (16/32/64GB) behavior

The session-start budget naturally adapts:
- 16GB M1 base: SESSION_BUDGET ≈ 10-11GB; 60% warn = ~6.5GB Q7 → restrictive
- 32GB M2/M3 Max: SESSION_BUDGET ≈ 26-28GB; 60% warn = ~17GB Q7 → comfortable
- 64GB+ Mac Studio: SESSION_BUDGET ≈ 58-60GB; 60% warn rarely hits → near-unlimited

No special-case logic per RAM tier; the percentages do the right thing automatically because the budget is right-sized.

## Considered alternatives

- **Use `total` and hardcode "-1.5GB for OS"** — REJECTED. Doesn't account for other apps; magic constant
- **Snapshot at every check (instead of session start)** — REJECTED. If the user opens Chrome mid-session, RAM available drops, and we'd treat that as "Q7 consumed more" which is misleading. Session-start anchor is more honest
- **Use process RSS only (ignore SESSION_BUDGET)** — REJECTED. We can't know if 4GB RSS is "fine" or "catastrophic" without a denominator
- **Per-RAM-tier fixed budget (16GB → 6GB, 32GB → 16GB, 64GB → 40GB)** — REJECTED. Same goal as session-start anchor but less honest about what's actually free; magic-number maintenance burden

## Side effects to track

- `backend/src/safety/pressure/budget.py` exports `SESSION_BUDGET_BYTES` (initialized at import time) and `q7_resident_bytes()` (callable at any time)
- PR #11 SG-8 implementation consumes both
- Report JSON `measurement.memory` adds `session_budget_mb` field; schema patches to 0.3.1 (forward-compat: optional field)
- A user can override via `ENTROPIC_Q7_BUDGET_MB` env var (escape hatch for benchmarking or debugging)

## Verification

After PR #6 merges:

```python
from q7_benchmark.budget import SESSION_BUDGET_BYTES, q7_resident_bytes, pressure_percent
print(f"session budget: {SESSION_BUDGET_BYTES / 1e9:.2f} GB")
print(f"current resident: {q7_resident_bytes() / 1e6:.1f} MB")
print(f"pressure: {pressure_percent():.1f}%")
# Expected on dev machine: budget = 8-30GB depending on host; pressure low
```

## Cross-references

- DEC-Q7-010 (degrade order) — consumes pressure_percent()
- CTO finding R5 — original concern
- SPEC-3 §5 — SG-8 contract
- DEC-Q7-006 — psutil dependency (already in requirements-q7-measure.txt)
