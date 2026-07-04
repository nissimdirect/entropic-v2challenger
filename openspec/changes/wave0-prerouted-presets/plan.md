# Plan — wave0-prerouted-presets

Consolidated for a cold packetizer: every packet below is one-shottable from this file + the cited
PRDs. Do not re-derive scope from `MARATHON-BRIEF-wave0-AMENDED.md` — this file already folds in
the `UNIFICATION-2026-07-03.md` amendments. All file:line citations were re-verified against the
live tree during this planning pass (see "Code-ground verification" per packet).

## Sequencing (single-flight, binding)

**00 → 0a → 1 → 4 → 5**, with **2 and 3 parallel after 1 lands.** Rationale: 1 & 5 both touch
`backend/src/modulation/routing.py`; 1 & 4 both touch `frontend/src/renderer/stores/operators.ts`.
Cross-branch rule (routing-design-suite / "Branch B"): any B packet touching `operators.ts` or
`modulation/routing.py` rebases onto Wave-0's merged diff, not the reverse.

**Merge gate (UD-3, binding, supersedes any older "SMOKE-green" language in `HANDOFF.md` §8):**
no packet merges to main until the **full** suite is green — backend `pytest -x -n auto` full tier
+ frontend `npx --no vitest run` + e2e-full + sidecar. Packet 00 exists because this bar is not met
on main today (see Packet 00). `perf-nightly.yml` is untouched by Wave 0/U0 (scalar-only, no new
baselines needed).

---

## Packet 00 — CI stabilization to full green

**Required by UD-3 before ANY other packet in this change merges.**

| Field | Value |
|---|---|
| Risk | MED |
| Files | e2e regression specs, shards 2–3 (chaos / edge-cases / security-gates / ux-contracts); `backend/tests/test_effects/test_calibration.py::test_numeric_params_have_unit` (fails today — `fx.copy_machine.feedback_amount` param is missing a `unit` key, confirmed live at `backend/tests/test_effects/test_calibration.py:29-36`); 2 `test_zmq*` failures (identify at execution time via `pytest -x -n auto --tb=short`, not enumerated here — do not guess which); `frontend/src/renderer/App.tsx:4373` |
| Hard oracle | main-push CI fully green incl. e2e-full + sidecar; `tsc -b` clean |

**Code-ground verification (this session):** `App.tsx:4373` is `parameters={targetEffect?.parameters}`
inside the `PresetSaveDialog` JSX block (`App.tsx:4364-4378`). `targetEffect` is typed
`EffectInstance | undefined` (`App.tsx:4365-4366`, `effectChain.find(...)`), whose `.parameters`
field is `Record<string, ParamValue>` (a union that includes the FieldRef wrapper object per
`ipc-serialize.ts:35-38`'s comment on P6.6). `PresetSaveDialogProps.parameters` (`PresetSaveDialog.tsx:10`)
is narrower — `Record<string, number | string | boolean>` — hence the TS error at the call site.
Fix: widen `PresetSaveDialogProps.parameters`'s type to match `EffectInstance['parameters']` (or a
safe narrowing cast at the call site); do not weaken `EffectInstance.parameters`.

`test_numeric_params_have_unit` (verified present and it is a strict, no-skip assertion —
`backend/tests/test_effects/test_calibration.py:29-36` iterates every effect's every float/int param
and fails the whole test on any missing `unit` key). This is the SAME calibration gate that Packet 4
must satisfy for the new `_mix` ParamDef — fixing `fx.copy_machine.feedback_amount` here does not
substitute for giving `_mix` its own `unit`+`curve` in Packet 4.

**Note:** the 2 `test_zmq*` failures and the exact e2e shard 2-3 spec names were reported live in
`UNIFICATION-2026-07-03.md` §D-3 as of that session's CI run; they must be re-confirmed by running
CI (not re-derived by static reading) since CI state can drift between the unification pass and
packet execution — this packet's own oracle is "CI green", so the executor will discover the exact
failing tests from the CI log, not from this doc.

---

## Packet 0a — History Ledger discipline

**Rides in front, free. From the routing-design-suite's own spec ("costs nothing, applies to
everything after") — pulled forward per UD-2.**

| Field | Value |
|---|---|
| Risk | LOW |
| Files | new lint-style test over `undoable()` call sites (non-empty, non-generic description strings); upgrade generic descriptions in paths this change touches (`frontend/src/renderer/stores/project.ts` — e.g. bare `'Add effect'` sites) |
| Hard oracle | ledger lint test green; touched paths emit specific descriptions |

**Code-ground verification:** `undo.ts:127-186` (`beginTransaction`/`commitTransaction`) already
implements a working transaction-coalescing API — buffered entries commit as ONE `UndoEntry` with a
single `description` (verified: `commitTransaction` builds `compositeEntry` from `tx.entries`,
pushes one entry to `past`). This API is unused by the preset-apply path today (confirmed: no
`beginTransaction`/`commitTransaction` calls inside `App.tsx`'s `onApplyPreset` callback,
`App.tsx:3756-3776`) — Packet 1 is the first caller. The lint test this packet adds should assert
against `undoable()` call-site description strings (149 sites exist per `UNIFICATION-2026-07-03.md`
§2); it is a separate, narrower check than the transaction API itself.

---

## Packet 1 — Preset routes: schema + save + apply + instance addressing (UD-1)

**RISK: HIGH.** This is the load-bearing packet; everything else in this change is additive
around it.

| Field | Value |
|---|---|
| Risk | HIGH |
| Files | `frontend/src/shared/schemas/preset.schema.json`; `frontend/src/renderer/components/library/PresetSaveDialog.tsx`; `frontend/src/renderer/App.tsx:3757-3778` (apply); `frontend/src/shared/ipc-serialize.ts` (+instance id on wire); `backend/src/modulation/routing.py` (`effect_map` keyed by instance id, TYPE fallback, log dropped targets); route validation on preset load |
| Hard oracle | wired round-trip byte-identical · **id-remap test** (UUID-scoped, now real) · **duplicate-effect-type routing test** (two datamosh instances, route to one) · macros applied (today: silently dropped) · apply == ONE undo entry · backward-compat (old presets + legacy TYPE-scoped mappings still resolve) · malformed `routes[]` rejected |

### D-1 decision this packet implements (verbatim, locked, do not re-litigate)

> **UD-1 Addressing = instance-UUID end-to-end.** The wire currently carries only effect TYPE ids
> (`ipc-serialize.ts:45`; backend `effect_map` keyed by type, `modulation/routing.py:214-218`,
> silent drop `:310`). Packet 1 adds the instance id to `SerializedEffectInstance` + keys the
> backend map by instance with TYPE fallback for legacy mappings. This makes the id-remap test real,
> enables duplicate-effect-type compositions, and fixes the live no-op bug (LFOEditor.tsx:31 /
> ModulationMatrix.tsx:121 write instance UUIDs that never resolve today).
> — `MARATHON-BRIEF-wave0-AMENDED.md`

### Code-ground verification (this session, all re-read from the live tree)

- **Wire shape today:** `frontend/src/shared/ipc-serialize.ts:26-33` — `SerializedEffectInstance`
  has `effect_id: string` (the TYPE, e.g. `fx.datamosh`), `enabled`, `params`, `mix`, optional
  `mask_ref` — **no instance-id field at all**. `serializeEffectInstance()` (`:43-55`) sets
  `effect_id: effect.effectId` (confirmed: this is the TYPE property, not `effect.id`).
- **Backend keying today:** `backend/src/modulation/routing.py:209-216` — `effect_map: dict[str, dict]`
  is built from `effect.get("effect_id", "")` — TYPE-keyed. Line `:310` — `if effect_id not in
  effect_map: continue` — confirmed bare, silent, no log.
- **Where UUID-scoped mappings already exist and are silent no-ops today:**
  `frontend/src/renderer/components/operators/LFOEditor.tsx:31` — `targetEffectId: firstEffect.id`
  (the instance UUID, from `effectChain[0].id`, not `.effectId`). `ModulationMatrix.tsx:117-123` —
  `targets.push({ effectId: fx.id, ... })`, i.e. also the instance UUID. Both diverge from
  `RoutingCanvas.tsx:345` (`targetEffectId: dest.effectId`, confirmed TYPE-scoped and this is the one
  that resolves correctly today). This confirms the P0 finding: two different addressing
  conventions are live in the same codebase right now, and only the TYPE one currently works.
- **`_mix` injection + bounds already exist (Packet 1 doesn't need to build this, only route to it):**
  `routing.py:210-221` injects `params["_mix"] = effect["mix"]` when absent;
  `routing.py:596-599` (`_get_param_bounds`) hardcodes `_mix`'s range to `(0.0, 1.0)`.
- **Apply path today:** `App.tsx:3756-3776` — the `PresetBrowser`'s `onApplyPreset` callback.
  `effect_chain` branch (`:3766-3773`): `for (const effect of preset.chainData.effects) { addEffect({ ...effect, id: randomUUID() }) }` — confirmed: reassigns a fresh UUID per effect, does NOT
  build or apply an old-id→new-id map, does NOT touch `chainData.routes` (doesn't exist yet) or
  `chainData.macros` (exists in the type/schema, silently dropped — confirmed no macro-materialization
  code anywhere in this callback).
- **Save path today:** `PresetSaveDialog.tsx:59-64` — the `effect_chain` branch of `handleSave`
  writes `preset.chainData = { effects: chain, macros }` — confirmed macros ARE captured on save
  (`macros` state, `:29`) but never applied (see above) — this is the "pre-existing gap" the PRD
  names.
- **Schema today:** `preset.schema.json:25-49` — `chainData.effects` has `maxItems: 10`;
  `chainData.macros[]` schema exists (`label`/`effectId`/`paramKey`/`min`/`max`, all required) but
  there is **no `routes` property at all** and **no `presetSchemaVersion` field**.
- **Load-time validation gap:** `library.ts:29-51` (`validatePresetFields`) only checks top-level
  shape (id/name/type/created/tags, `effectData`/`chainData` presence + array-ness) — it does NOT
  validate the *contents* of `chainData.effects[]` entries, and there is no equivalent of
  `operators.ts`'s `validateMappingForSave` (`operators.ts:72-96`) applied to loaded preset data.
  `library.ts:111-124` (`savePreset`) writes the preset object to disk via `JSON.stringify` with no
  additional sanitization. This confirms `UNIFICATION-2026-07-03.md` §2 Packet-1 amendment (iv):
  preset JSON is pushed whole and unsanitized; the only backend gate is `routing.py`'s effect-map
  existence check, which is precisely the silent-drop path being fixed by this packet.
- **Preset disk location (context for the `<id>.glitchpreset` write target, unaffected in shape by
  this packet but load-bearing for Packet 2/3):** `library.ts:23-27` (`getPresetDir`) returns
  `${docsPath}/Creatrix/Presets`, flat — confirms UD-4's premise.

### Normative contract — Packet 1 must implement exactly this (no re-derivation)

1. **`preset.schema.json`:**
   - Add `chainData.routes`: array of route objects (shape = the wire-serialized `ModulationRoute`/
     operator-mapping shape used by `modulation/routing.py`'s consumers — i.e. the same fields
     `operators.ts`'s `OperatorMapping` serializes: `target_effect_id`, `target_param_key`, `depth`,
     `min`, `max`, `blend_mode`, optional `source_key`, `binding_rule`, `axis_index`, `curve`).
     **Casing rule (binding, from `UNIFICATION-2026-07-03.md` §2 Packet-1 amendment vi):** the
     preset envelope (`id`/`name`/`type`/`tags`/`chainData`/etc.) stays camelCase; **route objects
     inside `chainData.routes[]` are wire-shape verbatim (snake_case)** — "envelope camelCase, route
     objects wire-shape verbatim." Do not camelCase the route object keys.
   - Add top-level `presetSchemaVersion: number` (new presets set it; absence on load = version 1 /
     legacy — do not require it retroactively).
   - Bump `chainData.effects.maxItems` from `10` to `24`.
   - Unknown-field-preserve on read: do not reject or strip fields the schema doesn't recognize (the
     forward-compat pattern to cite is `project/schema.py`'s optional-field-absent-is-valid
     validators — **NOT** any `.dna` format; `UNIFICATION-2026-07-03.md` §4 confirms no `.dna`
     file/format exists in this repo, that citation in the original PRD is wrong).
2. **`ipc-serialize.ts`:** add an instance-id field to `SerializedEffectInstance` (e.g. `id: string`,
   populated from `effect.id`) alongside the existing TYPE-scoped `effect_id`. Additive — existing
   consumers reading only `effect_id` are unaffected.
3. **`modulation/routing.py`:** key `effect_map` by the new instance id when present, falling back to
   TYPE-id lookup for legacy mappings that only carry `target_effect_id` as a TYPE (this is the
   backward-compat path for old presets / old live mappings). Add a debug log at the `:310` silent-drop
   `continue` (do not change its control flow, only add observability).
4. **`PresetSaveDialog.tsx`:** in the `effect_chain` save branch, collect the chain's live operator
   mappings (from `operators.ts`'s store — the `mappings[]` on each operator, filtered to those
   targeting an effect in this chain) and write them into `chainData.routes` in the wire shape above.
   Fix the `App.tsx:4373` tsc error's root cause here if not already fixed by Packet 00 (same file
   surface — coordinate, don't duplicate the fix).
5. **`App.tsx:3757` `onApplyPreset`, `effect_chain` branch:**
   - Wrap the whole apply in ONE undo transaction via `undo.ts`'s `beginTransaction("Apply preset: <name>")` /
     `commitTransaction()` (today: N generic `'Add effect'` entries per `App.tsx:3766-3773`).
   - Build the old-id→new-id map while adding effects (today: `id: randomUUID()` is generated and
     discarded per-iteration with no map kept).
   - Materialize `chainData.routes` through `operators.ts`'s `addOperator`/`addMapping`
     (`operators.ts:98`/`:202`), rewriting every `target_effect_id`/instance-id reference through the
     old→new map.
   - Materialize `chainData.macros` (currently captured on save, never applied — close this gap).
   - Validate `chainData.routes[]` on load via a `validateMappingForSave`-equivalent
     (`operators.ts:82-96` is the pattern to mirror) before materializing — reject malformed entries,
     don't crash.
   - Missing-target degrade: skip + warn (the existing fail-safe-skip pattern per `REVIEW.md` §4),
     with an explicit code comment noting this is a *different* route class from the routing-design-
     suite's tap chips (which use flat-0.5 + a red chip) — intentionally different until a later
     unification pass, per `UNIFICATION-2026-07-03.md` §2 Packet-1 amendment (v).

### The correctness landmine (revised — read before touching this packet)

The **original** brief's landmine ("apply reassigns fresh UUIDs, so bundled routes must be remapped
old→new or they dangle") is real but was aimed at the wrong root cause. Per
`UNIFICATION-2026-07-03.md` §0: **TYPE-scoped routes survive apply unchanged today with no remap
needed** (they re-resolve against the new instances by TYPE, same as `RoutingCanvas.tsx` mappings
do live). **UUID-scoped routes are broken independent of apply** — they're dead on arrival the
moment they're created by `LFOEditor.tsx`/`ModulationMatrix.tsx`, because nothing in `routing.py`
resolves against instance ids at all yet. Sequencing that actually holds:

1. First make instance addressing real (steps 2-3 of the normative contract above: wire + backend
   keying with TYPE fallback).
2. Only THEN does "apply must remap old→new instance ids" become the correct, testable invariant
   (step 5's old→new map). Before step 1 lands, there is nothing to remap — the ids are inert.

**Headline tests, all three required, none optional:**
- **id-remap test:** a route bundled with an instance-UUID target resolves to the NEW instance's id
  after apply (not the saved id).
- **duplicate-effect-type routing test:** a preset with two instances of the same effect TYPE (e.g.
  two `fx.datamosh`), where the bundled route targets only one of them, routes correctly to that one
  instance post-apply (this is impossible under TYPE-only keying — proves UD-1 actually fixed the
  last-writer-wins collision `UNIFICATION-2026-07-03.md` §0 flagged).
- **legacy TYPE-fallback byte-identical test:** an old preset (or a live TYPE-scoped mapping created
  via `RoutingCanvas.tsx`'s existing path) still resolves exactly as it does on main today.

### Bug filings alongside Packet 1 (file as bugs, not additional packet scope)

- `LFOEditor.tsx:31` / `ModulationMatrix.tsx:117-123` / `OperatorKentaroCluster` (same pattern) write
  instance-UUID `targetEffectId` that is a silent no-op on main **today, independent of this
  change** — Packet 1's UD-1 work fixes this as a side effect; verify post-merge, don't assume.
- `crossStoreCleanup.ts`'s `pruneEffectDependents` (`frontend/src/renderer/stores/crossStoreCleanup.ts:49`,
  called from `project.ts:304` and `timeline.ts:1120`) prunes on the instance-id assumption and so
  fails to prune TYPE-scoped mappings — convention mismatch, file separately.
- `EFFECT-CONTRACT.md` mask-order doc bug: the doc's pseudocode contradicts `container.py` (mask is
  applied AFTER mix, on the mixed output, per `container.py:55-59`'s pop-order: `_mask` popped before
  `_mix`, `_mix` clamp comment says "Mix dry/wet" happens later in the pipeline than the mask pop —
  confirm exact order against `container.py`'s full pipeline before filing wording).
- `EFFECTS-INVENTORY.md` says 171 effects; the live registry has 220 (per `UNIFICATION-2026-07-03.md`
  §2, independently confirmed by Packet 3's 24-preset effect-id audit below).

---

## Packet 2 — Presets Library folders (embeddable, UD-2)

| Field | Value |
|---|---|
| Risk | MED |
| Files | `frontend/src/renderer/components/library/PresetBrowser.tsx` (+folders/search/tags INSIDE the component, no new top-level chrome); reuse-or-delete the dead `UserFolder` CRUD in `frontend/src/renderer/stores/browser.ts`; apply = click/drag (keep the existing `application/entropic-preset` drag channel) |
| Hard oracle | browse/search/apply smoke · **apply == hand-built pixel-diff** · **transparency**: apply→remove-all == baseline byte-identical · agent can apply via tool (parity) |

### UD-2 decision this packet implements (verbatim, locked)

> **UD-2 Wave 0 runs first; B's browser folder-tree wins the IA.** Packet 0a (History Ledger
> discipline) rides in front; Packet 2 builds folders/search INSIDE PresetBrowser (embeddable, no new
> top-level chrome) so B's tree re-hosts it as the PRESETS node.
> — `MARATHON-BRIEF-wave0-AMENDED.md`

### Code-ground verification (this session)

`PresetBrowser.tsx` is 85 lines today; `PresetCard.tsx` is 61 lines — confirmed both are small,
flat components (category filter buttons `:51-60`, no folder/tree structure). It is mounted as one
of 3 flat sibling tabs in `App.tsx`'s local `sidebarTab` state (`App.tsx:433`, values
`'effects' | 'presets' | 'instruments'`) — this is a **3-way tab sibling-swap**, not a 4- or 5-tab
structure; the "5 tabs" figure in `UNIFICATION-2026-07-03.md` §4's correction refers to a *different*
component (`EffectBrowser`'s own internal tab bar: `browser-tab-fx`/`op`/`composite`/`tool`/
`instruments`, confirmed via `UAT-CU-ADDENDUM-2026-07-03.md` row X201-1) — do not conflate the two
when writing this packet's UI diff; `sidebarTab` is what this packet's "no new top-level chrome"
constraint is protecting.

`browser.ts`'s `UserFolder` interface (`frontend/src/renderer/stores/browser.ts:11`, used at `:25`/
`:45`) is confirmed present with a `persist()` call site (`:65`) but — per
`UNIFICATION-2026-07-03.md` §4 — has zero live callers (localStorage-backed, dead). This packet must
either wire it up as the folder-storage mechanism for Packet 2's embeddable folders, or delete it;
do not leave it dead-but-present alongside a newly-built parallel folder mechanism.

### Notes carried from the amendment (mechanical, no new decision)

- Keep the existing separate `application/entropic-preset` drag channel; document (in the
  component's own comments, not a separate doc) that a future unified-browser one-handler model
  will need a bespoke preset-drop case — this is a known future integration point, not something to
  solve now.
- No shared thumbnail pipeline exists anywhere in the codebase today — build the minimal one needed
  for Packet 2/3's cards; note (in-code comment) that the routing-design-suite's matrix chip thumbs
  are a plausible future consumer of the same pipeline, but do not build for that consumer now.

---

## Packet 3 — Seed 24 presets

| Field | Value |
|---|---|
| Risk | LOW |
| Files | 24 `.glitchpreset` JSON files (the 🟢 rows of `PRESET-TOP50.md` — confirmed exactly 24 rows tagged 🟢 in the live doc) + rendered thumbnails; packs = subfolders of `<Documents>/Creatrix/Presets/` (UD-4) |
| Hard oracle | **each of the 24: automated apply + render + hash** (screenshot is human spot-check ONLY, not the oracle — amended up from the original PRD's "screenshot-verify a sample") |

### UD-4 decision this packet implements (verbatim, locked)

> UD-4 (default, user may override): factory packs = subfolders of `<Documents>/Creatrix/Presets/`;
> `~/.creatrix/user-library/` stays with B's browser epic; EXECUTION-PLAN P3.2's
> `~/.creatrix/presets/<tab>/` path is superseded.
> — `MARATHON-BRIEF-wave0-AMENDED.md`

### Code-ground verification (this session)

`PRESET-TOP50.md` was grepped for the 🟢 tag: **exactly 24 matches** (rows 3-4, 8-20, 43-49 by the
doc's own numbering), confirming the count in both the PRD and the amended brief. All 22 named seed
effect ids (cyanotype, solarize, infrared, datamosh, channelshift, grid_moire, invert_bands,
reaction_diffusion, posterize, bitcrush, ascii_art, false_color, duotone, scanlines, kaleidoscope,
strange_attractor, entropy_map, temporal_blend + the operator-driven ones) were confirmed present in
the live registry per `UNIFICATION-2026-07-03.md` §2's audit ("all 22 named seed effects verified
present in the live registry (220 effects)") — this plan does not re-run that audit; re-verify at
packet-execution time only if the registry has changed since 2026-07-03.

**Deferred, not this packet:** kuwahara/structure-tensor-dependent presets — neither `kuwahara` nor
`structure_tensor` exists in the registry (confirmed zero grep hits per `UNIFICATION-2026-07-03.md`
§2); any 🔵-tagged `PRESET-TOP50.md` row depending on them stays in the bench, not the 24.

---

## Packet 4 — `_mix` mappable macro

| Field | Value |
|---|---|
| Risk | LOW |
| Files | `frontend/src/renderer/stores/operators.ts` (allow `_mix` as a valid mapping target); device UI knob using the existing `Knob.tsx` convention (`frontend/src/renderer/components/common/Knob.tsx`) — **NOT** the routing-design-suite's unbuilt Knob-v3 single-circumference spec (do not implement it here, do not contradict it either); `ParamDef` metadata with `unit` + `curve` for `_mix` (the live `test_numeric_params_have_unit` calibration test — see Packet 00 — will fail otherwise) |
| Hard oracle | `_mix` default == identity byte-identical · `audio → _mix` A/B · morph bypass via `_mix → 0` · calibration test green |

### Code-ground verification (this session)

Confirmed **backend needs zero changes** for this packet:
- `routing.py:210-221` already injects `params["_mix"] = effect["mix"]` when the key is absent (the
  F-0516-9 comment block documents this exact purpose: "inject top-level `mix` into params as `_mix`
  so it can be a modulation target").
- `routing.py:596-599` (`_get_param_bounds`) already hard-codes `_mix`'s range to `[0.0, 1.0]`.
- `container.py:59` already pops `_mix` at runtime: `mix = clamp_finite(effect_params.pop("_mix", 1.0), 0.0, 1.0, 1.0)` — confirmed clamp is finite-guarded and bounded, default `1.0` (== today's
  behavior, satisfying the byte-identical-at-default oracle for free).

So Packet 4's entire scope is frontend: the UI knob + the routing-destination registry entry (so the
"map ▸" picker offers `_mix` as a target) + the `ParamDef` unit/curve metadata. The `_*`
reserved-namespace registration guard (named as a risk in `PRD-mix-macro.md` §5) is confirmed
registration-time only per `UNIFICATION-2026-07-03.md`/`REVIEW.md` §6 — `_mix` is popped from
params at runtime before the effect ever sees it, so a route that *writes* `_mix` is simply consumed;
no registration-guard collision is possible. Treat this risk as closed, not open — do not re-spike it.

---

## Packet 5 — Edge-curve applied + enum picker (UD-5)

| Field | Value |
|---|---|
| Risk | MED |
| Files | `backend/src/modulation/routing.py` (apply `curve` in the contribution step: source → curve → depth/min/max — **NOT** `lane_reader.py`, that is the separate axis-lane system); `CurveType` enum + additive `smoothstep` value; enum-picker UI in `frontend/src/renderer/components/operators/B9EdgeInspector.tsx` (the live per-edge inspector mounted at `OperatorRack.tsx:323`, already renders depth/polarity/delete/bindingRule); fix the stale comment at `frontend/src/renderer/components/routing-canvas/EdgeInspector.tsx:1-15` (a separate, also-live component mounted at `RoutingCanvas.tsx:523` — comment fix only, no new UI there) |
| Hard oracle | **curve default == linear byte-identical** (silent-change guard — the #1 correctness detail for this packet) · smoothstep unit test · round-trip · points-editor explicitly deferred to K1 |

### UD-5 decision this packet implements (verbatim, locked)

> **UD-5 Edge-curve v1 = enum picker** (existing 4-value `CurveType` + additive `smoothstep`),
> applied in `resolve_routings`; draggable-points editor deferred to K1.
> — `MARATHON-BRIEF-wave0-AMENDED.md`

Full rationale (verbatim, `UNIFICATION-2026-07-03.md` §1 D-5): *"Code reality: `OperatorMapping.curve`
is a closed 4-enum (`linear/exponential/logarithmic/s-curve`), always serialized, hardcoded 'linear'
at every creation site, applied nowhere in the backend. A's PRD wants a draggable-points editor
reusing `util/curves.py` (a points→LUT effect, private functions, zero external callers) — that's a
schema change, and `smoothstep` (named in the oracle) isn't in the enum. Recommendation: v1 = enum
picker (+ add `smoothstep` to the enum, additive) applied in `resolve_routings`'s contribution path;
points/Bezier editor deferred to K1 (where the spectral EQ-curve genuinely needs it) via additive
union type. Note ParamDef.curve (per-param knob scaling, same enum values) is a different concept —
both docs must name the two distinctly."*

### Code-ground verification (this session)

Confirmed `backend/src/effects/util/curves.py` exists with `_parse_points`, `_build_lut`, `apply` —
a points→LUT implementation, but per the D-5 finding it has zero external callers today and is a
different data model (points list) than `OperatorMapping.curve`'s closed enum — do not wire this
file into Packet 5's enum-picker path; it is the K1-era points-editor's future home, not this
packet's.

Confirmed `EdgeInspector.tsx:1-15`'s doc-comment states: *"Shows the selected edge and its editable
fields. Per the packet, ONLY depth / polarity / delete are wired in v1 — curve / lag / axis-binding
are DEFERRED (B4-full; no backend storage exists for them yet), so they are not rendered."* This
comment is stale the moment Packet 5 lands (curve DOES get backend storage + application) — fixing
it is explicitly in this packet's file surface per the amendment, not a drive-by.

Confirmed `_get_param_bounds` (`routing.py:596-627`, adjacent to `_blend_contributions`
`routing.py:561-591`) is the contribution pipeline where `curve` must be inserted, per the
pipeline order the PRD specifies: **source value → curve shaping → depth/min/max mapping → blend**.
`_blend_contributions` today computes `mapped = m_min + signal * (m_max - m_min)` then
`scaled = mapped * depth` with no curve step — this is the exact insertion point.

**Byte-identical-when-linear is the hard invariant:** every existing preset/mapping in the wild
carries `curve` (or omits it, defaulting to `'linear'`) and has NEVER had it applied — turning
application on is a **live behavior change** for any non-linear curve, but MUST be a no-op for
`linear`/absent. This is `REVIEW.md`'s red-team tiger #1, confirmed still open until this packet's
test suite proves it closed.

---

## Normative contracts (verbatim, do not re-derive)

### `preset.schema.json` `chainData` shape after Packet 1 (additive delta from the version read this session)

```
chainData: {
  effects: Effect[]        // maxItems 10 → 24 (Packet 1)
  macros?: Macro[]         // unchanged shape (label, effectId, paramKey, min, max — all required)
  routes?: Route[]         // NEW (Packet 1) — wire-shape verbatim (snake_case), see below
}
presetSchemaVersion?: number   // NEW (Packet 1); absent == legacy/v1, do not require retroactively
```

Route object shape (snake_case, matches `modulation/routing.py`'s mapping consumption contract):
`target_effect_id` (instance-UUID per UD-1, TYPE-id accepted as legacy fallback), `target_param_key`,
`depth`, `min`, `max`, `blend_mode`, optional `source_key`, `binding_rule`, `axis_index`, `curve`
(Packet 5 adds `smoothstep` as a valid value alongside `linear`/`exponential`/`logarithmic`/`s-curve`).

### `_get_param_bounds` `_mix` special-case (already live, cite exactly, do not modify)

```python
# F-0516-9: _mix is a synthetic param that lives on the EffectInstance,
# not in info.params. Hard-code its [0.0, 1.0] range.
if param_key == "_mix":
    return 0.0, 1.0
```
(`backend/src/modulation/routing.py:596-599`)

---

## House landmines (apply to every packet in this change, restated for the packetizer)

- **Curve + unit metadata on every new numeric param** — the live `test_numeric_params_have_unit`
  calibration test (`backend/tests/test_effects/test_calibration.py:29`) enforces this with zero
  skip/allowlist mechanism found in the test itself; Packet 4's `_mix` ParamDef must ship both
  fields or CI fails immediately, not eventually.
- **Explicit-import effect registry** — do not assume dynamic effect discovery anywhere in this
  change; every new/touched effect reference goes through the existing explicit-import pattern.
- **Alpha never crosses the JPEG preview transport** — not directly touched by this change (no new
  alpha-bearing surfaces), but if Packet 3's thumbnail pipeline renders anything with transparency,
  claims about alpha correctness must be verified via export + PIL, never the live preview.
- **cv2 paths + C-contiguous + float-hoisted for field/pixel work** — not applicable to Wave 0/U0
  (scalar-only, confirmed by `REVIEW.md` §5: "perf-nightly: untouched by Wave 0 (scalar-only)"); this
  mandate binds K1+ field work, noted here only so the packetizer doesn't misapply it.
- **History Ledger row + specific `undoable()` description for every new user-visible op** — binding
  on Packet 1's apply-transaction (`"Apply preset: <name>"`, not a generic string) and on Packet 5's
  curve edits ("gesture-coalesced + Ledger rows" per the amended brief's Packet 5 oracle).
- **preview == export parity via the single-clip path** — `zmq_server.py:1688`'s comment confirms the
  composite-preview path "carries no per-frame operator_values" and mask-node operator modulation is
  "single-clip-only for now (deferred)" — this is the known MK.8 gap. Any parity claim for Packet
  1/2/5 (preset apply renders identically to hand-built) MUST use the single-clip render path, not
  composite-preview, or the parity test will spuriously pass/fail on an unrelated gap.
- **Additive schema, no `PROJECT_VERSION` bump for optional fields** — `chainData.routes` and
  `presetSchemaVersion` are both optional-on-read; this change does not touch `PROJECT_VERSION`.

---

## Bug filings alongside this change (not packets — file separately, do not fold into packet scope)

- LFOEditor / ModulationMatrix / KentaroCluster instance-UUID no-op mappings (Packet 1's UD-1 work
  incidentally fixes these — verify post-merge, file regardless in case verification finds gaps).
- `crossStoreCleanup.pruneEffectDependents` convention mismatch (instance-id assumption vs
  TYPE-scoped mappings it fails to prune).
- `EFFECT-CONTRACT.md` mask-order doc bug (doc pseudocode vs `container.py`'s actual pop-order).
- `EFFECTS-INVENTORY.md` count 171 → 220 (stale).
- `routing.py:310`'s silent drop (Packet 1 adds a debug log here — filing is for tracking, the fix
  itself is already in Packet 1's normative contract above, not a separate fix).

---

## Test Plan

### Backend (pytest, full tier — `cd backend && python -m pytest -x -n auto --tb=short`)

- **Packet 1:** id-remap test (instance-UUID route target resolves to post-apply new id, not saved
  id) · duplicate-effect-type routing test (two same-TYPE instances, route targets exactly one) ·
  legacy TYPE-fallback byte-identical test · malformed `chainData.routes[]` entries rejected at load
  (mirrors `operators.ts`'s `validateMappingForSave` pattern, backend-side equivalent) · macro-apply
  materialization test.
- **Packet 4:** `test_numeric_params_have_unit` and `test_all_curves_are_valid`
  (`test_calibration.py:13`/`:29`) both green with `_mix`'s new `ParamDef` included · `_mix` default
  1.0 → byte-identical render vs. pre-change baseline · `[audio.rms → effect._mix]` A/B render diff
  test.
- **Packet 5:** curve-application unit test (smoothstep-shaped output vs. linear, same input signal)
  · **byte-identical-when-linear regression test** (this is the hard gate — run against a corpus of
  existing presets/mappings, not just a synthetic one) · round-trip test (curve saved → reloaded →
  same shaping applied).
- **Packet 3:** automated apply + render + hash for all 24 seed presets (loop over the pack, no
  manual per-preset test).
- **Packet 00:** the CI stabilization items themselves ARE the backend test-suite gate; no new tests
  authored, existing failures fixed.

### Frontend unit/component (Vitest — `cd frontend && npx --no vitest run`; MUST use `--no` per
`CLAUDE.md`/`openspec/project.md`, global `npx vitest` picks up E2E specs)

- **Packet 1:** `PresetSaveDialog` — chain-save branch collects `mappings[]` into `chainData.routes`
  in the correct wire shape (snake_case route objects) · `App.tsx` apply-flow unit test: ONE
  `beginTransaction`/`commitTransaction` pair per apply, old→new id map correctly rewrites every
  route reference · schema round-trip test (save → JSON → reload → identical routes/macros).
- **Packet 2:** `PresetBrowser` folder/search/tag filter component tests · drag channel
  (`application/entropic-preset`) still fires on drag-to-chain · `UserFolder` reuse-or-delete
  decision reflected in a passing test either way (no dead code left both ways).
- **Packet 4:** `_mix` knob component renders using `Knob.tsx`'s existing convention (visual/prop
  contract test, not a new Knob-v3 test).
- **Packet 5:** enum-picker component test (4 existing values + `smoothstep` all selectable) ·
  `EdgeInspector` no longer shows the stale "curve deferred" state once wired.

### Backend + frontend integration (parity / pixel-diff — single-clip render path only, per the
composite-preview MK.8 gap landmine above)

- **Packet 1/2:** apply a wired preset → pixel-diff against the hand-built equivalent chain, render
  identical. Transparency invariant: apply → remove-all-devices → byte-identical to the pre-apply
  baseline frame (no hidden state survives removal).
- **Packet 4:** morph bypass — an effect at `_mix → 0` renders byte-identical to that effect being
  fully bypassed (ties `PRD-composition-morph`, cited for context only — that PRD is out of scope
  for this change).

### E2E (Playwright `_electron` — `cd frontend && npx playwright test`; run on the MAIN checkout or
CI only — worktree executors cannot run vitest/E2E per this repo's standing constraint)

- Full preset flow: open Presets folder (sidebar `presets` tab) → browse/search/filter → apply a
  pack preset by click and by drag → verify devices + edges + macros materialize → open Modulation
  Matrix and confirm normal editable edges (transparency invariant, UI-level).
- Agent-native parity: confirm a preset can be applied via the same tool surface an agent would use
  (not just human click/drag) — this is an explicit oracle in the amended brief's Packet 2 row, not
  optional polish.

### UAT (final gate, per `MARATHON-BRIEF-wave0-AMENDED.md` Gates section: `/uat` on the preset flow)

No dedicated preset-apply row exists yet in `docs/UAT-CU-ADDENDUM-2026-07-03.md` (that addendum
covers already-shipped PRs; Wave 0 is unbuilt as of this plan). Two existing rows are directly
adjacent and must not regress:
- **X216-1** (`docs/UAT-CU-ADDENDUM-2026-07-03.md:113`) — the device-chain context menu's
  "Save as Preset…" / "Save Chain as Preset…" shortcut labels must still byte-for-byte match
  Preferences → Shortcuts after Packet 1 touches `PresetSaveDialog.tsx`.
- **X186-1** (`docs/UAT-CU-ADDENDUM-2026-07-03.md:239`) — the Preset Save dialog's focus-trap
  behavior (20-Tab-press containment, Escape-to-close) must not regress from Packet 1's changes to
  that same component.

New Wave-0-specific UAT rows (preset browse → apply → transparency → 24-seed spot-check) must follow
the same trap-guarded, falsifiable-oracle format as the addendum: literal UI labels in Setup/Drive,
a falsifiable on-screen/pixel/hash oracle (not "looks right"), and an explicit "Trap guarded" column
naming the specific rubber-stamp risk (e.g. for the transparency invariant: the trap is judging
"chain looks editable" without actually removing all devices and diffing against the pre-apply
baseline). Author these rows during the marathon's UAT phase (P5), not in this plan — this plan only
establishes that the format and the two adjacent regression rows are binding inputs to that phase.

Final gate per the amended brief: `/uat` on the preset flow **and** `/qa-redteam` on Packet 1
specifically (RISK: HIGH).

---

## Packet candidates (summary table, verbatim from `MARATHON-BRIEF-wave0-AMENDED.md`, for the packetizer)

| # | Packet | Files (verified) | Risk | Hard oracle |
|---|--------|------------------|------|-------------|
| 00 | CI stabilization to FULL green | e2e regression shards 2-3; `test_numeric_params_have_unit`; 2 `test_zmq*` failures; `App.tsx:4373` | MED | main-push CI fully green incl. e2e-full + sidecar · `tsc -b` clean |
| 0a | History Ledger discipline | lint test over `undoable()` sites; upgrade generic descriptions in Wave-0-touched paths | LOW | ledger lint test green · touched paths emit specific descriptions |
| 1 | Preset routes: schema + save + apply + instance addressing (UD-1) | `preset.schema.json`; `PresetSaveDialog.tsx`; `App.tsx:3757`; `ipc-serialize.ts`; `modulation/routing.py`; load-time route validation | **HIGH** | wired round-trip byte-identical · id-remap test · duplicate-effect-type routing test · macros applied · apply == ONE undo entry · backward-compat · malformed routes rejected |
| 2 | Presets Library folders (embeddable, UD-2) | `PresetBrowser.tsx`; `browser.ts` UserFolder reuse-or-delete; keep `application/entropic-preset` channel | MED | browse/search/apply smoke · apply == hand-built pixel-diff · transparency byte-identical · agent-tool parity |
| 3 | Seed 24 presets | 24 `.glitchpreset` JSON + thumbnails, subfolders of `<Documents>/Creatrix/Presets/` (UD-4) | LOW | each of 24: automated apply+render+hash (screenshot = human spot-check only) |
| 4 | `_mix` mappable macro | `stores/operators.ts`; `Knob.tsx`-convention UI; `ParamDef` unit+curve metadata | LOW | `_mix` default == identity byte-identical · audio→`_mix` A/B · morph bypass via `_mix→0` · calibration test green |
| 5 | Edge-curve applied + enum picker (UD-5) | `modulation/routing.py` contribution step; `CurveType` + `smoothstep`; enum-picker UI; fix stale `EdgeInspector.tsx:1-15` comment | MED | curve default == linear byte-identical · smoothstep unit test · round-trip · points-editor deferred to K1 |

**Single-flight:** 00 → 0a → 1 → 4 → 5 (serialize; 1&5 share `modulation/routing.py`, 1&4 share
`operators.ts`). Packets 2/3 run parallel after 1 lands. Cross-branch: routing-design-suite (B)
packets touching `operators.ts`/`modulation/routing.py` rebase after Wave-0 merges.

## Gates (per packet + final, STRICT FULL-TIER per UD-3)

Per packet: full backend pytest + full frontend vitest (run on the main checkout or CI — worktree
executors cannot run vitest) → `Skill(review)` (via the Skill tool, not slash-command — the ship-gate
hook blocks `git push` otherwise) → verify-for-real → parity (single-clip path, per the MK.8 landmine
above) → update the relevant PRD's status. Merge gate: full CI green incl. e2e-full + sidecar
(Packet 00 is the prerequisite that makes this achievable). Final: `/uat` on the full preset flow +
`/qa-redteam` on Packet 1 (RISK: HIGH).

## Two human touchpoints (unchanged from the marathon brief)

1. Approve the packet plan (this document) — before build.
2. Ship sign-off — after build + UAT + gates, before merge/archive.
