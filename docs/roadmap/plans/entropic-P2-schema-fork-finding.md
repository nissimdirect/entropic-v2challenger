# P2 FINDING — Backend↔Frontend B4-lite schema fork (✅ RESOLVED 2026-06-04)

*Found 2026-06-04 during master-sequence steamroll (P2). This is the #1 architectural risk the CTO review flagged — confirmed LIVE, then **fixed via option 1** (user-approved): backend `BindingRule` adopted canonical camelCase + 8 members to match the frontend. Shipped in PR #148 (commit `aafdf02`). The self-clearing contract test now passes cleanly (xfail marker removed). 34 schema/contract/lane tests green; member names unchanged so no referent broke; no `.dna` fixtures carried the old strings so no migration. The text below is the original finding, retained for the record.*

## The fork

| | Backend `modulation/schema.py` | Frontend `shared/axis-binding.ts` |
|---|---|---|
| `BindingRule` values | snake_case: `broadcast`, **`sample_at`**, **`scan_over`**, `integrate`, `painted` | camelCase: `broadcast`, **`sampleAt`**, **`scanOver`**, `integrate`, `painted`, `hilbert`, `polar`, `learned` |
| member count | **5** | **8** |
| `LaneDomain`/`Axis` | `t y x c f l` (lowercase) | `t y x c f l` (lowercase) | ✅ already agree |

## Why it's a P1 (not cosmetic)

The `.dna`/`.entropic` portability thesis (Vision §2) is **strict no-regression**. A patch saved by the frontend persists `binding_rule: "sampleAt"`. On load the backend does `BindingRule("sampleAt")` → **`ValueError`** (no such member; backend only knows `"sample_at"`). And a frontend-saved `binding_rule: "hilbert"` has no backend representation at all. The moment any non-`broadcast` rule ships, cross-side load breaks — and because `.dna` is forward+backward no-regression forever, baking the wrong casing now is a permanent tax.

Today this is latent only because **Tier 1 validator accepts `broadcast` only** (which matches on both sides). It detonates the instant Tier 3 widens the accept-set (B9 / B4-full).

## Required reconciliation (PR-B owns the call — it's permanent for `.dna`)

**Recommended:** backend adopts the frontend canonical = **camelCase + all 8 members**, because (a) `shared/axis-binding.ts` is the documented "canonical module" (SPEC-2 §5a), (b) lowercase axis is already locked canonical from the frontend side (P1-A), so canonical-wire-form = frontend serialization. Concretely:
```python
class BindingRule(str, Enum):
    BROADCAST = "broadcast"
    SAMPLE_AT = "sampleAt"      # was "sample_at"
    SCAN_OVER = "scanOver"      # was "scan_over"
    INTEGRATE = "integrate"
    PAINTED = "painted"
    HILBERT = "hilbert"         # NEW
    POLAR = "polar"             # NEW
    LEARNED = "learned"         # NEW
```
Then grep every backend referent of `BindingRule.SAMPLE_AT`/`.value`/serialized strings (Gate 16 dependency-map) before flipping, and keep the writer-side validator's `TIER1_IMPLEMENTED_RULES = {BROADCAST}` unchanged.

**Alternative** (if backend snake_case is load-bearing elsewhere): a normalization layer at the project (de)serialization boundary that converts `binding_rule` values camelCase↔snake_case — but this adds a permanent conversion surface and a place for the two to drift again. Prefer the single canonical value.

## Guard shipped with this finding

`backend/tests/test_q7_benchmark/test_schema_frontend_contract.py`:
- `test_lane_domain_values_match_frontend` — **passes** (axes already agree).
- `test_binding_rule_values_match_frontend_canonical` — **`xfail(strict=True)`** documenting the fork. When PR-B reconciles, it "unexpectedly passes" → strict xfail fails the run, prompting removal of the marker. Self-clearing.

Lands in PR #148. **Action: PR-B must reconcile + the SPEC-6 Lint-3 rule (new enum value lands with renderer impl + validator in the same PR) enforced from PR-B onward.**
