# SPEC-2 — B4-lite Schema Injection (INJ-5)
*Written 2026-06-03 · ships as a single additive commit into Creatrix PR-B before lock*

> Defines the schema additions that unlock the wavetable-axes paradigm in Tier 1 without implementing the full B4 binding-rule grammar. Designed to be additive, backward-compat-by-construction, and rejected-by-validator for unsupported rules. The smallest possible change that makes the paradigm felt.

---

## 1. Why this exists

Vision Tier 1 says: paradigm becomes felt with one PR that ships the schema for `domain`/`direction`/`binding_rule` on automation lanes, even though only `broadcast` is implemented. Without it: no `domain='y'` (so no Y-is-Time demo), no I3 inline action menu (action targets a routing graph that doesn't exist), no forward-compat path for Tiers 2–6.

Creatrix PR-B unifies automation (drops `isTrigger`, adds `InterpolationMode = 'smooth'|'step'|'gate'|'oneShot'`). That's the right schema break to piggyback our additive fields on. **One PR-B; not two; no migration cost** (no user base per Creatrix v1.2 plan).

Per CTO review pass (this session, 2026-06-03): "schema-vs-implementation asymmetry — writer-side validator must REJECT non-`broadcast` binding-rule values on save. Prevents `.dna` patches encoding values that Tier 1 doesn't implement but Tier 3 will."

---

## 2. TS type additions

### 2.1 New shared types — `frontend/src/shared/types.ts`

> **Lowercase axis canonical** (per parallel-session 2026-06-03 08:11 review P1-A — already serialized lowercase in SPEC-4 demos + SPEC-6 `.dna`; uppercase was a typo).

```ts
// New: the 6 modulation axes (lowercase string literals — canonical)
export type Axis = 't' | 'y' | 'x' | 'c' | 'f' | 'l'

// New: binding rule enum — full 8-member union, tier-gated by validator (§3.1)
export type BindingRule =
  | 'broadcast'        // Tier 1 — IMPLEMENTED
  | 'sampleAt'         // Tier 3 (B9) — schema-reserved
  | 'scanOver'         // Tier 3 (B9) — schema-reserved
  | 'integrate'        // Tier 3 (B9) — schema-reserved
  | 'painted'          // Tier 3 (B9) — schema-reserved (research)
  | 'hilbert'          // Tier 6+ — schema-reserved (research)
  | 'polar'            // Tier 6+ — schema-reserved (research)
  | 'learned'          // Tier 6+ — schema-reserved (research, needs SG-3 NaN sentinel)
```

**Per-tier validator widening:** the writer-validator accept-set is a tier-gated constant (§3.1). At Tier 1, only `'broadcast'` accepted. B9 widens to add the 4 standard rules. Research-tier (Tier 6+) gates the last 3 behind SG-3 / SG-5.

### 2.2 Lane schema extensions

> **Type-name dependency** (per parallel review P1-C): SPEC-2 references `Lane` + `InterpolationMode` which are **PR-B deliverables** — they do not yet exist in code. Current type is `AutomationLane` at `frontend/src/shared/types.ts:261` with field `isTrigger: boolean`. PR-B's commit-1 renames + introduces `InterpolationMode`; SPEC-2's commit-2 (this) adds the axis-binding fields on top. If PR-B chooses a different type name, this spec mirrors that choice.

Creatrix's PR-B drops `isTrigger`, introduces `InterpolationMode`. Our additions sit alongside:

```ts
// After PR-B commit-1 lands; SPEC-2 (commit-2) adds the optional axis-binding fields.
interface AutomationLane {
  id: string
  trackId: string
  effectId: string | 'mixer'
  paramPath: string
  mode: InterpolationMode     // PR-B: 'smooth' | 'step' | 'gate' | 'oneShot'
  color: string
  points: Point[]

  // ---- NEW (SPEC-2 / INJ-5) ----
  domain?: Axis                // default 't' — axis the lane evaluates over
  direction?: number           // default 1 — signed real magnitude; negative = reverse-scan, |x|≠1 = rate scaling
  binding_rule?: BindingRule   // default 'broadcast' — how source axis maps to destination axis
}
```

**All three fields are OPTIONAL.** Readers without the fields treat them as defaults. Backward-compat with PR-B's unified schema by construction.

### 2.3 ModEdge schema (new)

Creatrix has `OperatorMapping` (modulation source → param destination, scalar over T). B4-lite generalizes by adding axis metadata:

```ts
interface OperatorMapping {
  // (existing fields preserved verbatim — adopt them as-is)
  source_id: string            // operator producing the value
  target_param_path: string    // dotted path to the param
  depth: number                // scalar multiplier
  curve?: Curve                // existing
  polarity?: 1 | -1            // existing

  // ---- NEW (SPEC-2 / INJ-5) ----
  src_axis?: Axis              // default 't' — which axis of source to read
  dst_axis?: Axis              // default 't' — which axis of destination to write
  binding_rule?: BindingRule   // default 'broadcast'
}
```

Same backward-compat rule: missing fields → defaults.

### 2.4 What "broadcast" means in Tier 1

`broadcast` = the source value at the current `(t)` applies UNIFORMLY across the destination axis. For `dst_axis='t'` this is the existing behavior (no change). For `dst_axis='y'` (or x), broadcast means "every row of the frame sees the same value" — equivalent to today's behavior + an annotation. The actual scanline-as-time semantic ships when `binding_rule='scanOver'` is implemented in B4-full.

Tier 1 demos use **`domain` on the Lane** (not `binding_rule` on the edge) to get Y-as-time:

```ts
// Y-is-Time demo lane:
{ paramPath: 'hue_shift', mode: 'smooth', domain: 'y', direction: 1, points: [...] }
```

The renderer interprets `domain='y'` as: evaluate the curve at fractional-y position within each frame instead of at the timeline `t`. **This is what makes the paradigm felt in Tier 1** — and it costs the renderer ~5 lines (sample at `current_y / frame_height` instead of `current_t / duration`).

---

## 3. Writer-side validator (CRITICAL — per CTO finding)

**Why:** schema accepts 5 binding rules; Tier 1 implements only `broadcast`. Without a writer-side guard, the UI (or a hand-edited `.dna`) could persist `binding_rule:'integrate'` which the Tier-1 renderer doesn't handle. Worse: `.dna` files authored in Tier 1 might encode values that BEHAVE DIFFERENTLY when Tier 3 ships actual `integrate` semantics. Drift.

### 3.1 Validator rules (tier-gated constants)

```ts
// frontend/src/renderer/stores/automation.ts (or wherever lanes are persisted)

// Tier-gated accept-sets. WIDENING THESE IS A B9 RESPONSIBILITY (not Tier 1).
// SPEC-6 Lint-3 enforces: adding a BindingRule to TIER_BINDING_RULES requires renderer impl + test
// in the same PR.
const TIER_BINDING_RULES: ReadonlySet<BindingRule> = new Set(['broadcast'])
const TIER_DOMAINS: ReadonlySet<Axis> = new Set(['t', 'y', 'x'])  // c/f/l not yet supported

function validateLaneOnWrite(lane: AutomationLane): void {
  if (lane.binding_rule && !TIER_BINDING_RULES.has(lane.binding_rule)) {
    throw new SchemaValidationError(
      `binding_rule='${lane.binding_rule}' not yet implemented at this tier. ` +
      `Schema accepts the field for forward-compat; ` +
      `writer rejects unimplemented values until renderer catches up (B9 widens to standard 5).`
    )
  }
  if (lane.domain && !TIER_DOMAINS.has(lane.domain)) {
    throw new SchemaValidationError(
      `domain='${lane.domain}' not yet supported (c/f/l axes ship in Tier 4+). ` +
      `Currently: 't', 'y', 'x'.`
    )
  }
  if (lane.direction !== undefined && !isFinite(lane.direction)) {
    throw new SchemaValidationError(`direction must be finite real; got ${lane.direction}`)
  }
}

function validateOperatorMappingOnWrite(m: OperatorMapping): void {
  // Same TIER_BINDING_RULES + TIER_DOMAINS used for src_axis / dst_axis / binding_rule
  // (single source of truth for accept-sets across Lane + OperatorMapping)
}
```

### 3.2 Where validators run

1. **Store mutation actions** — every `addLane / updateLane / addOperatorMapping / updateOperatorMapping` calls the validator. Throws → action rejected, store unchanged.
2. **Project save** — before serializing to disk, validate every lane + mapping. Throws → save fails with toast.
3. **Project load** — `backend/src/project/schema.py` mirrors the rules. Files with disallowed values rejected at load with clear error.

### 3.3 Schema version

Creatrix PR-B bumps `CURRENT_VERSION = "3.0.0"`. This spec piggybacks; no separate version. Version 3.0.0 = "automation unified + B4-lite axis schema reserved."

---

## 4. Backward-compatibility rules

| Scenario | Behavior |
|---|---|
| Old lane WITHOUT `domain` field | Treated as `domain='t'` everywhere |
| Old lane WITHOUT `direction` | Treated as `direction=1` |
| Old lane WITHOUT `binding_rule` | Treated as `binding_rule='broadcast'` |
| Old OperatorMapping WITHOUT `src_axis`/`dst_axis`/`binding_rule` | All default to `'t'` / `'t'` / `'broadcast'` |
| Reader encounters `binding_rule:'sampleAt'` (Tier 3 value) on a Tier 1 build | **Reject** with clear error per §3.1 (no silent fallback — would create drift) |
| `.dna` file unknown future field on a Lane | **Preserve verbatim on round-trip** (per E2 `.dna` no-regression rule — covered in SPEC-6) |

---

## 5. File-by-file change inventory

| File | Change | Lines |
|---|---|---|
| `frontend/src/shared/types.ts` | Add `Axis`, `BindingRule` types; extend `Lane` + `OperatorMapping` with optional fields | ~20 |
| `frontend/src/renderer/stores/automation.ts` | Validator on `addLane`/`updateLane`/`addPoint`; default `domain`/`direction`/`binding_rule` on creation | ~30 |
| `frontend/src/renderer/stores/operators.ts` | Validator on operator-mapping mutations; defaults | ~20 |
| `frontend/src/renderer/project-persistence.ts` | On save: validate every lane + mapping. On load: schema 3.0.0 check (Creatrix PR-B already bumps) | ~15 |
| `backend/src/project/schema.py` | Mirror validators server-side; reject load with clear error if disallowed | ~30 |
| **Renderer change for `domain` evaluation** (the Y-is-Time unlock) | `frontend/src/renderer/components/performance/applyEffectModulations.ts` (or wherever lane evaluation lives — Creatrix PR-B refactors this; coordinate location): evaluate lane curve at `current_y / frame_height` when `domain='y'`, at `current_x / frame_width` when `domain='x'`, otherwise existing `t` evaluation | ~15 |
| Tests | unit (validator rejects 4 non-broadcast values + non-T-Y-X domains + non-finite direction); component (Y-is-Time demo project loads + renders correctly); persistence round-trip (lane with `domain='y'` saves and reloads) | ~120 |

**Total: ~250 lines added, ~0 lines removed.** Net additive.

---

## 6. CI lint rule

In addition to the writer-side validator, a CI lint rule on `.dna` schema evolution (covered fully in SPEC-6):

- **Rule:** any schema field added to `Lane` or `OperatorMapping` must be `?` (optional) at the TS level.
- **Rule:** any new enum value added to `BindingRule` or `Axis` must coincide with a renderer implementation AND a writer-validator update in the same PR.
- **Auto-fail PR otherwise.**

---

## 7. Tests

### 7.1 Validator unit tests

```ts
describe('B4-lite validator', () => {
  it('accepts broadcast binding_rule', () => { /* expect no throw */ })
  it('accepts no binding_rule (default broadcast)', () => { /* expect no throw */ })
  it('rejects sampleAt binding_rule', () => { /* expect throw SchemaValidationError */ })
  it('rejects scanOver / integrate / painted on save', () => { /* same */ })
  it('accepts t/y/x domain', () => { /* expect no throw */ })
  it('rejects c/f/l domain in Tier 1', () => { /* expect throw */ })
  it('accepts negative direction (reverse-scan)', () => { /* expect no throw */ })
  it('accepts |direction|>1 (rate scaling)', () => { /* expect no throw */ })
  it('rejects non-finite direction', () => { /* expect throw */ })
})
```

### 7.2 Lane evaluation tests (the actual paradigm unlock)

```ts
describe('domain="y" lane evaluation', () => {
  it('evaluates curve at fractional-y instead of fractional-t', () => {
    const lane = { domain: 'y', points: [{t:0, v:0}, {t:1, v:1}] }
    // For a 100-row frame, row 0 → value 0, row 99 → value ~1, row 50 → value ~0.5
    expect(evaluateLane(lane, { t: 0, y: 0, frame_height: 100 })).toBe(0)
    expect(evaluateLane(lane, { t: 0, y: 50, frame_height: 100 })).toBeCloseTo(0.5)
    expect(evaluateLane(lane, { t: 0, y: 99, frame_height: 100 })).toBeCloseTo(0.99)
  })
})
```

### 7.3 Y-is-Time demo project test

A demo `.entropic` file (defined in SPEC-4) with one image + one audio + one lane on `hue_shift` with `domain='y'`. Test:
1. Load the project — no validation errors
2. Render frame at t=1.0s — frame contains visible vertical hue gradient (row 0 hue ≠ row 99 hue)
3. Frame at t=2.0s — hue pattern shifted (audio-driven curve)
4. Save → reload → identical render

### 7.4 Backward-compat test

Old lane (no `domain`/`direction`/`binding_rule` fields) loads, validates, renders with defaults. Save → file has explicit fields populated (or omitted — implementer choice).

### 7.5 Persistence round-trip

Save project with `domain='y'` lane → load → re-save → byte-compare (modulo timestamps). Should be identical.

---

## 8. Acceptance criteria (PR review checklist)

- [ ] Schema additions in `types.ts` compile clean, no `any` casts
- [ ] Validator rejects all 4 non-broadcast binding-rule values
- [ ] Validator rejects C/F/L domains in Tier 1 with clear error message
- [ ] Validator accepts signed real direction (negative, fractional ≠ 1, > 1)
- [ ] Renderer evaluates `domain='y'` lanes at fractional-y position
- [ ] Renderer evaluates `domain='x'` lanes at fractional-x position
- [ ] Backward-compat: lanes without new fields load and render with defaults
- [ ] Y-is-Time demo project (SPEC-4) loads + renders correctly (visible vertical hue variation)
- [ ] Audio-LFO-stripes demo project (SPEC-4) loads + renders correctly
- [ ] Persistence round-trip preserves all fields
- [ ] CI lint rule catches new enum value added without renderer impl in same PR
- [ ] All unit tests green

---

## 9. Coordination note to Creatrix session

This is **INJ-5** — fifth injection needed in PR-B before lock, alongside their existing INJ-1 through INJ-4 (rename Pad.mappings, fix toposort, MAX_COMPOSITE_LAYERS, real Sampler entry).

**Why bundle into PR-B and not a separate PR:**
- PR-B already unifies automation schema (drops `isTrigger`, adds `InterpolationMode`) — one schema break is cheaper than two
- Backward-compat is "no user base, fresh start in v3" anyway — adding optional fields is free
- Validators piggyback on the same store actions PR-B touches

**Recommended commit boundary inside PR-B:**
- Commit 1: PR-B's automation unification (`isTrigger` → `InterpolationMode`)
- Commit 2 (THIS spec): B4-lite axis fields + validator + renderer domain evaluation
- Commit 3: PR-B's BPM split + cycle detection + export snapshot

That way the axis-schema commit can be reverted independently if it causes issues.

**Estimated added cost to PR-B:** ~2-3 hours on top of Creatrix's existing 12-18h estimate.

---

## 10. Risk + rollback

| Risk | Mitigation |
|---|---|
| Validator too strict, blocks legitimate user actions | Validator rejects only `binding_rule` not-in-{broadcast} and `domain` not-in-{t,y,x}. Direction allows any finite real. Low risk. |
| Renderer `domain='y'` evaluation has subtle off-by-one | Unit tests cover edge cases (row 0, row last, fractional-y interp). |
| Renderer perf regression on hot path (every frame evaluates lanes) | Domain check is one branch per lane per frame. Negligible. |
| `.dna` files start including `domain='y'` immediately, hard to remove later | Forward-compat by design — schema reserves the fields; this is the intended state. |
| Forgotten unit test for `domain='x'` | Tests cover Y; X is symmetric. Add anyway. |

**Rollback:** revert the SPEC-2 commit inside PR-B. PR-B's other changes (automation unify, BPM, cycle, export) survive. Renderer falls back to T-only evaluation. No data loss (no user base).

---

## 11. What this DOES NOT cover (next specs)

- Full B4 binding-rule grammar (`sampleAt`, `scanOver`, `integrate`, `painted`) — Tier 3, B9 in Creatrix plan
- C/F/L axes — Tier 4+ (need spectral DCT layer for F, latent backbone for L)
- Field-typed parameter destinations (C3 per-pixel fields) — Tier 2, separate spec
- The Inspector Track / Routing Canvas / inline action menu surfaces — separate spec set
- Demo project files themselves — **SPEC-4** is the next deliverable
- Safety gates (SG-1/3/5/8) — **SPEC-3**

---

## 12. Next spec

**SPEC-4 — Demo trilogy.** Small, well-bounded, ships as Tier 1 deliverable alongside SPEC-2. Three demo `.entropic` projects + their assets + acceptance criteria. Becomes the marketing surface + onboarding ritual. Should be ~2-page spec, then this writer continues into SPEC-3 (safety gates).
