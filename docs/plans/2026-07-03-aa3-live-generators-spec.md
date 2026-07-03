# AA.3 — Live Generators / Audio-Follower ON an Automation Lane

**One-shot build spec.** Status: architecture RESOLVED. Target: an engineer builds
this in a single pass with no rework. Every architectural fork is decided below,
not flagged.

Date: 2026-07-03
Author: design pass (read-only research, no code written)
Prereqs merged: AA.2 (drawn modulation lanes), AA.3a (insert-shape static bake).

---

## 1. Exact user intent

A modulation automation lane whose value is produced **live, per frame, by a
generator** — an LFO or an audio-follower — instead of by drawn breakpoints. The
generator rides **on** the lane: it superimposes onto the absolute (drawn) lane
sharing the same `paramPath` via the lane's `blendOp`, exactly the way an AA.2
drawn modulation lane does. The difference is only the **source of the per-frame
value**: an operator evaluation rather than keyframes.

Two concrete cases:
- **LFO-sourced lane** — sine/saw/tri/square/random cycling a param over time.
- **Audio-follower-sourced lane** — the param reacts to the loaded audio's
  envelope (RMS / frequency band / onset), landing on the beat.

Distinct from AA.3a: AA.3a bakes a *static* set of breakpoints once (a frozen
snapshot). AA.3 is *live* — the generator re-evaluates every frame, and an
audio-follower cannot be baked in the frontend at all (it needs the backend audio
envelope). PREVIEW must equal EXPORT deterministically.

---

## 2. The architectural fork — RESOLVED

### 2.1 What the code actually does today (grounding facts)

These are the load-bearing facts I verified in the tree; the decision rests on them.

1. **The backend already evaluates operators (LFO, audio_follower, …) per frame
   in BOTH the preview and the export paths, through the same `SignalEngine`.**
   - Preview: `zmq_server.py:742` — `_render_frame_core` calls
     `engine.evaluate_all(operators, frame_index, reader.fps, audio_pcm=…)`.
   - Export: `export.py:710` — the per-frame closure calls
     `signal_engine.evaluate_all(mod_operators, src_idx, source_fps, audio_pcm=…)`.
2. **Audio PCM for the follower comes from ONE shared function keyed on frame
   index**, so the follower is *already* frame-deterministic across preview and
   export by construction:
   - Preview: `_get_audio_pcm_for_frame(frame_index, reader.fps)` (`zmq_server.py:735`).
   - Export: the same bound method is passed as `audio_pcm_provider` and called at
     `src_idx` (`zmq_server.py:2770`, consumed at `export.py:701-704`).
   - Body: `zmq_server.py:2846` — window is one frame-duration of samples centered
     on `frame_index / fps`. Same input frame → same window → same envelope. There
     is **no separate audio clock to reconcile**; determinism is structural.
3. **Automation lanes (AA.2) are frontend-evaluated and REPLACE the param AFTER
   operator modulation.**
   - `evaluateAutomationOverrides.ts` composes absolute + drawn-mod lanes → a
     denormalized value per `effectId.paramKey`.
   - Preview sends it as `automation_overrides` (`App.tsx:1210`); export bakes it
     per source frame into `automation_by_frame` (`App.tsx:2864`) via the SAME
     evaluator → structural parity.
   - Backend applies it as **REPLACE**, after `resolve_routings`, in
     `engine.py:apply_modulation` (`engine.py:680-699`).
4. **Operator mappings (`routing.py`) apply `base + operator*depth*range` to a
   param BEFORE the automation REPLACE** (`engine.py:662` then `:680`).

### 2.2 Why each option was rejected or adapted

- **(d) "an operator-sourced lane is just sugar over an OperatorMapping →
  routing.py".** REJECTED as the primary mechanism. `routing.py` adds an offset to
  the param *before* the automation REPLACE (fact 3+4). So if the param also has an
  absolute drawn lane, that lane's REPLACE **clobbers** the operator's
  contribution — the generator would NOT ride on the drawn lane, which is the
  entire point of AA.3. Compose-onto-the-drawn-lane is impossible in the
  routing.py channel.
- **(a) "evaluate all operator lanes backend-side and round-trip results to
  preview".** REJECTED as framed — but note there is **no new round-trip**: the
  preview already sends `operators` + `automation_overrides` to `render_frame`
  every frame and receives the rendered frame back. The operator values are
  already computed on that existing round-trip.
- **(b) "split — LFO frontend-baked, audio-follower backend-only with a
  preview≈export caveat".** REJECTED. A caveat means preview≠export, which the
  user explicitly forbids. And it doubles the code (two value-origin paths, two
  parity surfaces). AA.2's whole win was a *single* shared evaluator; splitting
  throws that away.
- **(c) "unify operator eval into a single place both preview and export call".**
  ADOPTED — and it turns out the single place **already exists**: `evaluate_all`
  (fact 1). We do not build a new evaluator; we *reuse* the one both paths already
  invoke.

### 2.3 The decided architecture

> **An operator-sourced lane injects a synthetic, mapping-less operator into the
> `operators` payload that both preview and export already send to `evaluate_all`.
> The lane's per-frame value is therefore computed by the existing operator engine
> — with audio PCM, per-operator state, and the budget guard all reused for free.
> A thin new backend compose step (`resolve_operator_lanes`) reads that operator's
> value out of `operator_values` and superimposes it onto the lane's absolute
> base via `blendOp`, producing the automation REPLACE for that param. This step
> lives inside `apply_modulation`, which both paths already call — so preview and
> export are structurally identical, exactly mirroring how AA.2 got parity from a
> single shared evaluator, but with the operator half moved to the backend because
> audio cannot be evaluated in the frontend.**

The fork **dissolves**: LFO and audio-follower are both "just operators in
`evaluate_all`." There is no per-source branch in the render path. LFO *could*
have been frontend-baked, but unifying both to the backend gives one seam and one
parity surface — the AA.2 philosophy, upheld.

Data flow per frame (both preview and export):

```
frontend (per operator-sourced lane L on paramPath P):
  1. synthetic op  {id: "__lane__"+L.id, type: L.operator.type,
                    parameters: L.operator.params, mappings: []}   ──┐ appended to
                                                                     │ `operators`
  2. operator_lanes descriptor  {paramPath:P, operatorId:"__lane__"+L.id,     │
                    blendOp, depth, min, max}                       ──┘ (constant)
  3. baseNormalized[P]  = composeModulatedValue(absoluteNorm, drawnModContribs)
                          (absolute + any DRAWN mod lanes, in [0,1])  ── per frame

backend evaluate_all(operators incl. synthetic):
  operator_values["__lane__"+L.id] = <LFO or audio-follower value 0..1>
        (audio PCM fed by the SAME _get_audio_pcm_for_frame → deterministic)

backend apply_modulation:
  resolve_routings(...)                       # real operator→param mappings (unchanged)
  auto_overrides REPLACE                      # absolute+drawn lanes (unchanged)
  resolve_operator_lanes(operator_lanes, operator_values, baseNormalized, registry):
     for each spec: v = operator_values[operatorId]
                    mod = lerp(min,max,v) * depth
                    composed = clamp01( applyBlendOp(baseNormalized[P], mod, blendOp) )
                    params[paramKey] = clamp( denormalize(composed, pMin,pMax) )   # REPLACE
```

Because the synthetic operators have `mappings: []`, `resolve_routings` iterates
zero mappings for them (`routing.py:237`) — they never modulate a param via the
routing channel; they exist *only* to be read by `resolve_operator_lanes`. And the
mod-edge validator (`_validate_mod_edges_change_gated`, `zmq_server.py:725`)
operates on mappings, so mapping-less synthetic ops pass cleanly.

---

## 3. Determinism, clock, domain — resolved sub-questions

### 3.1 Audio-follower clock / latency / "land on the beat"
Already solved by fact 2: preview and export both sample
`_get_audio_pcm_for_frame(frame_index, fps)`, a pure function of the frame index.
The window is centered on the frame's time. Same frame → same envelope → identical
reaction in preview and export. **No lookahead is implemented in AA.3** (see §7,
scoped out): the centered window is the deterministic default, and lookahead would
require per-operator frame-offset support inside `evaluate_all` (a spike). Deferring
it costs nothing to parity — the centered window already lands reactions on the
frame the transient occupies.

**One real divergence to FIX in the audio packet (AA.3-B):** export's
`evaluate_all` at `export.py:710` does **not** pass `audio_sample_rate`, so it
defaults to 44100, while preview passes the live
`audio_player._sample_rate` (`zmq_server.py:736-738`). For `rms` this is
inconsequential (SR-independent), but `frequency_band`/`onset` use SR in the FFT
bin math and would drift preview≠export. The audio packet MUST thread the same
`audio_sample_rate` into the export `evaluate_all` call. (Cited so it is fixed,
not discovered mid-build.)

### 3.2 over-T (LFO / temporal) vs over-Y (spatial ripple) domain
AA.3 ships **`domain: 't'` (temporal, scalar-per-frame) ONLY.** A `y`/`x`-domain
operator lane (operator value varying per row/column — a spatial ripple) needs the
field-destination path (`routing.py` `scanOver`→vector, gated behind
`EXPERIMENTAL_FIELD_DST`, unshipped) **and** AA.2's own cross-domain compose TODO,
which is explicitly NOT implemented (`evaluateAutomationOverrides.ts:73-84`). Both
are prerequisites AA.3 does not own. **Spatial-operator lanes are scoped OUT** (§7)
and guarded: the lane UI offers only `t` for operator source; a lane with
`source:'operator'` and `axisBinding.domain !== 't'` is skipped by
`buildOperatorLaneSpecs` (never sent to the backend). This is what keeps AA.3
one-shot.

### 3.3 Reuse AA.2's `kind:'modulation'` or add a new source field?
**Reuse `kind:'modulation'`; ADD an optional `source` field.** Justification: the
*composition* semantics (superimpose onto the absolute lane via `blendOp`,
same-domain grouping, distinct blue color, domain filtering) are identical for
drawn and operator lanes — reusing `kind` means every piece of AA.2's grouping /
color / domain-gate logic works unchanged. The `source` field changes only *how*
and *where* the per-frame value is obtained (frontend breakpoints vs backend
operator). This is the smallest coherent delta and is back-compatible: pre-AA.3
files have no `source` field → treated as `'drawn'`.

### 3.4 Lane UI picks {operator type, rate, depth, phase}
An inline generator panel on the modulation-lane header, shown when
`source === 'operator'`. Fields map straight to `operator.params`:
LFO → `waveform`, `rate_hz`, `phase_offset`; audio → `method`,
`sensitivity`, (band: `low_hz`/`high_hz`). Lane-level (not operator) fields:
`blendOp`, `depth`, `min`, `max`. Reuse the existing operator param widgets from
the operator-rack UI (same param names as `operators.ts:createDefaultOperator`).

---

## 4. Data model (types)

`frontend/src/shared/types.ts` — extend `AutomationLane` (additive, back-compat):

```ts
// AA.3 — a modulation lane whose per-frame value is produced by a live operator
// (LFO / audio_follower) instead of drawn breakpoints. Absent === 'drawn'
// (AA.2 behavior, byte-identical for every pre-AA.3 file).
export type AutomationLaneSource = 'drawn' | 'operator';

export interface AutomationLaneOperator {
  type: 'lfo' | 'audio_follower';        // the two AA.3 generator kinds
  params: Record<string, number | string>; // mirrors operators.ts param shape
  depth?: number;   // [0,1] scales operator influence (default 1)
  min?: number;     // normalized remap lo (default 0)
  max?: number;     // normalized remap hi (default 1)
}

export interface AutomationLane {
  // …existing fields…
  kind?: AutomationLaneKind;            // reuse 'modulation'
  blendOp?: BlendOp;                    // reuse
  source?: AutomationLaneSource;        // AA.3 — absent = 'drawn'
  operator?: AutomationLaneOperator;    // AA.3 — present iff source==='operator'
}
```

Validation (mirror the operator store's discipline in `operators.ts`):
- `depth`/`min`/`max` must be finite (reject non-finite at save + load, like
  `validateMappingForSave`).
- `operator.type` ∈ {lfo, audio_follower}; unknown → lane loads as `drawn`-noop
  (or is dropped) with a `console.warn`, never crashes.
- A `source:'operator'` lane with `axisBinding.domain !== 't'` is accepted in the
  store but **skipped at send time** (§3.2 guard).

---

## 5. File-by-file change list

### AA.3-A (LFO) — the full seam

**Frontend**
1. `frontend/src/shared/types.ts` — add the types in §4.
2. `frontend/src/renderer/utils/operatorLaneSpecs.ts` **(new)** — two pure
   functions, both used by preview AND export bake (this is the parity seam,
   mirroring `evaluateAutomationOverrides`):
   - `buildSyntheticLaneOperators(lanes): SerializedOperator[]` — one synthetic
     op per visible `source:'operator'`, `domain:'t'` lane:
     `{id:"__lane__"+lane.id, type, is_enabled:true, parameters:operator.params, processing:[], mappings:[]}`.
   - `buildOperatorLaneSpecs(lanes, time, registry): { specs, baseNormalized }`:
     - `specs`: `[{param_path, operator_id, blend_op, depth, min, max}]` (constant
       across time; time param unused here but kept for signature symmetry).
     - `baseNormalized`: `{param_path: number|null}` — for each operator-lane
       paramPath, `composeModulatedValue(absoluteNorm, drawnModContribs)` (the
       [0,1] base BEFORE denormalize), grouping exactly as
       `evaluateAutomationOverrides` does (last absolute wins; drawn same-domain
       mods fold in). Reuse the grouping code — factor the shared grouping out of
       `evaluateAutomationOverrides.ts` or duplicate the small loop.
3. `frontend/src/renderer/utils/evaluateAutomationOverrides.ts` — one-line guard:
   skip lanes with `source === 'operator'` (they must not emit a conflicting
   denormalized REPLACE; the backend owns their param). Add to the `for (const
   lane of lanes)` loop: `if (lane.source === 'operator') continue`.
4. `frontend/src/renderer/App.tsx` (preview, `requestRenderFrame` ~1192-1211):
   - `const laneOps = buildSyntheticLaneOperators(allLanes)`
   - append to the serialized `operators` payload: `[...serializedOps, ...laneOps]`
   - `const { specs, baseNormalized } = buildOperatorLaneSpecs(allLanes, currentTime, registry)`
   - add to the render message: `operator_lanes: specs`, `operator_lane_base: baseNormalized`
     (omit when `specs.length === 0` — byte-identical legacy payload).
5. `frontend/src/renderer/App.tsx` (export, ~2847-2886):
   - append `buildSyntheticLaneOperators(exportLanes)` to `exportOperators`.
   - in the per-frame bake loop, compute
     `const { specs, baseNormalized } = buildOperatorLaneSpecs(exportLanes, t, registry)`
     and accumulate `operatorLaneBaseByFrame[f] = baseNormalized`.
   - send `operator_lanes: specs` (constant) + `operator_lane_base_by_frame` in the
     export payload (omit when empty).
6. Lane UI: `frontend/src/renderer/components/automation/` — the modulation-lane
   header gets a generator panel (source toggle drawn↔operator; when operator: type
   dropdown, LFO params, depth/min/max/blendOp). New store actions on the
   automation store: `setLaneSource`, `updateLaneOperator`. (Locate the exact
   component via `grep -rl "MODULATION_LANE_COLOR\|blendOp" frontend/src/renderer/components`.)

**Backend**
7. `backend/src/modulation/routing.py` **(new function)** `resolve_operator_lanes`:
   ```python
   def resolve_operator_lanes(operator_lanes, operator_values, base_map, chain,
                              effect_registry_fn=None):
       """AA.3 — superimpose live-operator lane values onto their absolute base and
       REPLACE the target param. Mirrors composeModulatedValue + denormalize."""
   ```
   - Group specs by `param_path` ("effectId.paramKey"). For each group, in list
     order: `v = _finite(operator_values.get(operator_id, 0.0))`;
     `mod = (m_min + v*(m_max-m_min)) * depth`; if base is None seed acc from the
     first mod (mirror `composeModulatedValue`'s null-base fallback), else acc =
     base; `acc = applyBlendOp(acc, mod, blend_op)`; clamp `[0,1]`.
   - Split paramPath on first `.`; look up effect + param bounds via
     `_get_param_bounds`; `value = denormalize(clamp01(acc), pMin, pMax)`; clamp to
     `[min(pMin,pMax), max(pMin,pMax)]`; write `params[paramKey] = value`. Skip
     non-finite, missing effect, non-numeric base param. Never raise.
   - Add a python `apply_blend_op(base, mod, op)` helper matching
     `automation-evaluate.ts:applyBlendOp` (add/multiply/max).
8. `backend/src/modulation/engine.py` — `apply_modulation` gains two params
   `operator_lane_specs=None, operator_lane_base=None`; after the `automation_overrides`
   REPLACE block (`engine.py:699`), call `resolve_operator_lanes(...)` when specs
   present. Same call in both callers, so parity is structural.
9. `backend/src/zmq_server.py` `_render_frame_core` (~770) — read
   `message.get("operator_lanes")` + `message.get("operator_lane_base")`; pass to
   `apply_modulation`.
10. `backend/src/engine/export.py` — thread `operator_lanes` (constant) +
    `operator_lane_base_by_frame` through the export handler
    (`zmq_server.py:2765`+`export.py:581`) into the per-frame closure; look up
    `operator_lane_base_by_frame.get(src_idx)` and pass to `apply_modulation`
    (`export.py:720`). **Also inject the synthetic lane operators into the export
    operator list** (they arrive inside `exportOperators`, so nothing extra — just
    confirm `mod_operators` is the frontend `operators` list unmodified).

### AA.3-B (audio-follower) — thin follow-up
1. Backend: **no render-path change** — `evaluate_all` already evaluates
   `audio_follower` ops with the shared PCM window; `resolve_operator_lanes`
   already reads their value. Only FIX §3.1's `audio_sample_rate` gap in
   `export.py:710`.
2. Frontend lane UI: add `audio_follower` to the source-type dropdown + its params
   (`method` rms/frequency_band/onset, `sensitivity`, band `low_hz`/`high_hz`).
3. Tests: the parity test from AA.3-A re-run with a fixture audio track.

---

## 6. Test plan

**Backend (pytest)**
- `test_resolve_operator_lanes.py`:
  - LFO op value composes onto a base via add/multiply/max (assert exact numbers).
  - null base → seeds from first operator mod (mirror composeModulatedValue).
  - denormalize + clamp to inverted `[max,min]` registry bounds.
  - non-finite operator value → skipped, param untouched.
  - synthetic op with `mappings:[]` produces zero routing deltas (regression:
    `resolve_routings` unchanged).
- `test_operator_lane_parity.py` — **the parity test that makes this one-shot**:
  render a fixed frame range twice — once via the preview path
  (`_render_frame_core`) and once via the export path (`export.py` frame closure) —
  with (a) an LFO operator lane, (b) an audio-follower operator lane over a fixture
  WAV. Assert the modulated param value per frame is **equal** (exact for LFO;
  exact for audio once §3.1 SR fix lands). This is the structural-parity guarantee
  turned into an oracle.

**Frontend (vitest, mock IPC)**
- `buildSyntheticLaneOperators`: one op per operator lane, `mappings:[]`, correct id.
- `buildOperatorLaneSpecs`: base = absolute+drawn compose; specs carry
  blendOp/depth/min/max; `domain:'t'` filter drops non-t lanes; empty when no
  operator lanes.
- `evaluateAutomationOverrides` skips `source:'operator'` lanes (no REPLACE emitted
  for their paramPath).
- Back-compat: a project with zero operator lanes produces byte-identical
  `operators` + `automation_overrides` payloads (snapshot test).
- Store: `setLaneSource`/`updateLaneOperator` undo/redo symmetric; non-finite
  depth rejected at save + dropped at load (mirror `operators.ts`).

**E2E (playwright _electron)** — justified (crosses UI→IPC→render): add an LFO
operator lane on a param, scrub the playhead, assert the rendered param LED /
inspector value oscillates; export a short clip and assert it completes without a
sentinel abort. (Keep light — the parity oracle lives in pytest.)

---

## 7. Scoped OUT (explicitly, to protect one-shot confidence)

- **Spatial (`y`/`x`-domain) operator lanes** — needs field-dst
  (`EXPERIMENTAL_FIELD_DST`) + AA.2's unimplemented cross-domain compose. Guarded
  off at send time. Follow-up: AA.3-C, requires a field-dst spike.
- **Audio-follower lookahead** — needs per-operator frame-offset in `evaluate_all`.
  Centered-window determinism ships instead (§3.1). Follow-up spike.
- **Operator lane using its `points` as a depth/rate envelope** — `points` are
  unused for operator lanes in AA.3 (`depth` is a scalar). Future enhancement.
- **Interleaving drawn + operator mods by exact lane-array order on one param** —
  AA.3 folds operator mods *after* drawn mods (drawn are inside `baseNormalized`).
  Mixing both kinds on one param is an edge case; documented ordering, not a bug.

---

## 8. One-shot confidence

Per assumption, with the evidence that validates it:

| # | Assumption | Evidence / validation |
|---|---|---|
| 1 | Backend already evals operators per frame in both paths | `zmq_server.py:742`, `export.py:710` — read, confirmed same `evaluate_all`. |
| 2 | Audio-follower is frame-deterministic across preview/export | shared `_get_audio_pcm_for_frame(frame_index,fps)` (`zmq_server.py:735,2770,2846`); pure fn of frame index. |
| 3 | Synthetic mapping-less op is evaluated but modulates nothing via routing | `routing.py:237` iterates `mappings` (empty → zero deltas); `evaluate_all` still returns its value. |
| 4 | Synthetic op passes the mod-edge validator | `_validate_mod_edges_change_gated` inspects mappings (`zmq_server.py:725`); none → pass. |
| 5 | Automation REPLACE runs after operators, is the right seam to hook | `engine.py:680-699` REPLACE, right after `resolve_routings` (`:662`). |
| 6 | Frontend has a single shared evaluator to mirror | `evaluateAutomationOverrides` called by preview (`App.tsx:1210`) + export bake (`App.tsx:2864`). |
| 7 | Compose math has a canonical source to port | `composeModulatedValue`/`applyBlendOp`/`denormalize` in `automation-evaluate.ts`. |
| 8 | Op count stays under cap | `LIMITS.MAX_OPERATORS=64` (`limits.ts:13`); add a guard capping synthetic lane ops so real+synthetic ≤ 64. |
| 9 | `kind:'modulation'` + `source` is back-compat | `AutomationLaneKind` absent-safe (`types.ts:456`); mirror with absent-safe `source`. |

**Verdict per packet:**

- **AA.3-A (LFO): ONE-SHOT CONFIDENT.** No audio dependency; fully deterministic;
  reuses `evaluate_all` + mirrors AA.2's compose; the parity oracle
  (`test_operator_lane_parity.py`) mechanically proves preview==export. The only
  net-new logic is the thin `resolve_operator_lanes` compose + descriptor
  plumbing.

- **AA.3-B (audio-follower): ONE-SHOT CONFIDENT, conditional on the §3.1
  `audio_sample_rate` fix.** The render path is *unchanged* from AA.3-A (audio ops
  already flow through `evaluate_all` + the shared PCM provider), so the only
  substantive item beyond UI is threading the export `audio_sample_rate` so
  `frequency_band`/`onset` don't drift. With that fix in the packet, the same
  parity oracle covers it. Without lookahead (scoped out), there is no unresolved
  determinism question.

- **AA.3-C (spatial `y`/`x` operator lanes): NOT one-shot — spike required.**
  Depends on the unshipped `EXPERIMENTAL_FIELD_DST` field-destination path and
  AA.2's unimplemented cross-domain compose. Explicitly scoped out of AA.3; guarded
  off so it cannot half-ship.

Recommended order: build **AA.3-A** (establishes the entire seam), then **AA.3-B**
(UI enablement + the SR fix + audio parity test). AA.3-C is a separate future
effort gated on a field-dst spike.
```
