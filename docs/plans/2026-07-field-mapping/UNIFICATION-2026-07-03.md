# UNIFICATION — Field-Mapping (Branch A) × Routing Design Suite (Branch B)

**Date:** 2026-07-03 · **Produced by:** /cto coherence pass (modified marathon, first pass)
**Method:** 2 multi-agent workflows, 144 agents total — doc-coherence (267 claims → 10 axes → 102 findings, each code-verified) + codebase ground truth (41 subsystem maps, 630 facts, 162 doc-vs-code surprises, all file:line-evidenced). Repo verified at main @ `af9ba3b`, clean tree.
**Branches:** A = `docs/plans/2026-07-field-mapping/` (Wave 0 + U0 marathon → K1/ST/P1+) · B = `~/.claude/plans/creatrix-*.md` (LayerTap routing suite, 9 docs, 44+ banked decisions).
**Verdict:** The branches are **complementary, not contradictory, at the architecture level** — A extends the ModEdge/operator rail, B adds a track-tap rail feeding three existing consumer surfaces. But they were authored the same day with **zero cross-references**, and they collide on 5 concrete surfaces that must be arbitrated **before packetize**. Plus one P0 code-reality discovery that invalidates part of Wave-0's headline landmine as written.

---

## 0. P0 DISCOVERY — targetEffectId is TYPE-scoped on the wire (adjudicated, confirmed)

**Ground truth (all verified by direct read this session):**
- `frontend/src/shared/ipc-serialize.ts:45` — `effect_id: effect.effectId` (the effect **TYPE**, e.g. `fx.datamosh`). `SerializedEffectInstance` carries **no instance-UUID field at all**.
- `backend/src/modulation/routing.py:214-218` — `effect_map` keyed by that `effect_id` (TYPE); `:310` — mappings whose target isn't in the map are dropped by a bare `continue` (no log, no telemetry).
- `RoutingCanvas.tsx:345` writes `targetEffectId: dest.effectId` (TYPE) → **works end-to-end**.
- `LFOEditor.tsx:31` (`firstEffect.id`) and `ModulationMatrix.tsx:121` (`effectId: fx.id`) write the **instance UUID** → those mappings are **silent no-ops on main today** (live shipped bug). `OperatorKentaroCluster` same. `crossStoreCleanup.ts` prunes on the instance assumption → fails to prune TYPE-scoped mappings.

**Consequences for Wave 0:**
1. The brief's landmine ("apply reassigns UUIDs → remap old→new") is aimed at the wrong invariant. TYPE-scoped routes survive apply unchanged (no remap needed); UUID-scoped routes are broken *even without apply*.
2. TYPE keying is last-writer-wins in `effect_map` — a chain with **two instances of the same effect** (certain in 24-device pre-routed compositions) cannot be faithfully routed per-instance at all today.
3. Presets saved from live `mappings[]` may bundle already-dead UUID-scoped edges created by LFOEditor/Matrix.

→ **Decision D-1 below.** Independently of the choice: file the LFOEditor/ModulationMatrix/KentaroCluster no-op bug + the `crossStoreCleanup` prune mismatch, and give `routing.py:310`'s silent drop a debug log.

---

## 1. Decisions required from the user (blocking packetize)

### D-1 · Route target addressing convention (Packet 1 core)
| Option | What | Cost | Risk |
|---|---|---|---|
| **(a) Instance-UUID end-to-end (CTO recommendation)** | Add instance `id` to `SerializedEffectInstance`; key backend `effect_map` by instance id with TYPE fallback for legacy mappings; presets bundle UUID routes; the brief's id-remap test becomes real and correct; fixes the live no-op bug by unifying on one convention | ~2 files core (`ipc-serialize.ts`, `routing.py`) + tests; a real (small) engine change — bends "no new engine" | LOW-MED; additive, byte-identical for legacy (fallback) |
| (b) TYPE-scoped v1 | Presets serialize TYPE-scoped routes (works today); drop UUID-remap from Packet 1; document "one routable instance per effect type per chain" limitation | near-zero engine | Flagship compositions with duplicate effect types silently mis-route — collides with the product thesis; bug remains live |

Recommendation rationale: (b)'s limitation directly contradicts the differentiator (inspectable multi-device compositions); (a) is a contained additive diff on two files already fully mapped.

### D-2 · Marathon order + browser IA
- **Order (recommendation): Wave 0 first.** A is reviewed/one-shot-assessed/marathon-ready; B's own PRD is "Not yet roadmap-ranked". **But pull B's build-order item 1 (History Ledger discipline) in front as Packet 0a** — B's own doc: "costs nothing, applies to everything after".
- **Browser IA (needs your call):** A makes the Presets Library a promoted top-level surface; B (banked decision ㉜/㊱) makes the browser one folder tree — INSTRUMENTS·EFFECTS·GENERATORS·OPERATORS·UTILITIES + PRESETS + USER LIBRARY — with PresetBrowser re-hosted inside ("reused, chrome removed, not rewritten"). B also has an internal same-day contradiction (LayerTap decision ㉑ tabs-no-new-icon vs folder-tree ㉜ — ㉜ appears to supersede; confirm).
- **Mitigation either way (baked into Packet 2 amendment):** build folders/search *inside* PresetBrowser as an embeddable component, no new top-level chrome, one search field (B's one-search rule), so either IA answer is cheap.

### D-3 · Merge-gate matrix (contradiction is real, currently live)
CI verified live this session: main-push standing-red (e2e shards 2-3 regression specs; sidecar 3 failures incl. `test_numeric_params_have_unit` — `fx.copy_machine.feedback_amount` missing `unit`, i.e. B's curve+unit landmine is **already a live enforced test**). Two-layer resolution (recommendation):
- **Per-packet local gate:** full backend pytest + full vitest — but note the brief self-contradicts (§brief:33 vs :38): worktree executors can't run vitest → vitest runs on the main checkout by the orchestrator after each packet lands (or via CI), tsc in worktrees.
- **PR merge gate:** CI smoke (as A specs), with the standing-red carve-out documented per-run.
- **Third surface:** `perf-nightly.yml` exists (merged, live). Wave 0/U0 are scalar-only → no baseline changes; K1+ must add baselines.
- **Blocking pre-fix:** `tsc -b` FAILS on main today (`App.tsx:4373`, PresetSaveDialog `parameters` prop type) — fold the fix into Packet 1 (same file surface) or nothing gates cleanly.

### D-4 · Preset disk locations
Live: `<Documents>/Creatrix/Presets/<id>.glitchpreset`, flat (`library.ts:4,23-27`). A wants packs=folders; B banks `~/.creatrix/user-library/` (user-saved everything) + PRESETS node; stale EXECUTION-PLAN P3.2 wants `~/.creatrix/presets/<tab>/` (never built, conflicts). Recommendation: factory packs = subfolders of the existing Documents dir (Packet 2/3); user-library = B's browser epic later; P3.2's path declared superseded.

### D-5 · Edge-curve editor shape (Packet 5 UI)
Code reality: `OperatorMapping.curve` is a **closed 4-enum** (`linear/exponential/logarithmic/s-curve`), always serialized, hardcoded `'linear'` at every creation site, **applied nowhere** in the backend. A's PRD wants a draggable-points editor reusing `util/curves.py` (a points→LUT **effect**, private functions, zero external callers) — that's a schema change, and `smoothstep` (named in the oracle) isn't in the enum. Recommendation: **v1 = enum picker** (+ add `smoothstep` to the enum, additive) applied in `resolve_routings`' contribution path; points/Bezier editor deferred to K1 (where the spectral EQ-curve genuinely needs it) via additive union type. Note ParamDef.curve (per-param knob scaling, same enum values) is a **different concept** — both docs must name the two distinctly.

---

## 2. Marathon-brief amendments (mechanical — fold into packets, no user decision)

**Packet 0a (NEW, rides in front, ~free):** History Ledger discipline (B spec §2): lint-style test over `undoable()` call sites (non-empty, non-generic descriptions); upgrade generic descriptions in paths Wave 0 touches. Evidence: 149 `undoable()` sites exist; transactions API (`beginTransaction/commitTransaction`, commit-validator) ships in `undo.ts:127-186` — unused by apply path.
**Packet 1:** (i) apply wrapped in ONE transaction — "Apply preset: <name>" (today: N generic 'Add effect' entries, `App.tsx:3757-3776`); (ii) fix `App.tsx:4373` tsc error; (iii) materialize `chainData.macros` (captured on save, silently dropped on apply today — confirmed); (iv) validate bundled routes on load via `validateMappingForSave`-equivalent (preset JSON is pushed whole and unsanitized today — `library.ts:91`; `security.py` never validates `target_param_key`/`target_effect_id` — the only gate is routing.py's existence check); (v) missing-target degrade = A's skip+warn, with an explicit note that B's taps use flat-0.5+red-chip — two route classes, intentionally different until unified; (vi) casing note: `chainData.routes[]` entries serialize snake_case (ModEdge wire shape) inside a camelCase preset envelope — adopt "envelope camelCase, route objects wire-shape verbatim" explicitly.
**Packet 2:** embeddable folders/search inside PresetBrowser (per D-2 mitigation); keep the existing separate `application/entropic-preset` drag channel and document that the unified-browser one-handler model (B) will need a bespoke preset-drop case (finding #90); preset thumbnails: no shared thumbnail pipeline exists — build the minimal one and note B's matrix chip thumbs as a future consumer.
**Packet 3:** all 22 named seed effects verified present in the live registry (220 effects; `fx.*` ids confirmed) ✓; kuwahara/structure-tensor-dependent presets stay in the deferred bucket (neither exists in the registry — confirmed zero grep hits); upgrade the oracle from "screenshot-verify a sample" to automated apply+render+hash for all 24, screenshots as human spot-check only (finding #97).
**Packet 4:** backend needs nothing (confirmed: `routing.py:210-221` injects `_mix`, `:602-605` bounds [0,1]; `container.py:59` pops it) — scope is UI knob + target registry + **ParamDef metadata with `unit` + `curve`** (the live `test_numeric_params_have_unit` calibration test will fail otherwise); use the existing `Knob.tsx` convention (B's Knob-v3 single-circumference spec is unbuilt — do not implement it in Wave 0, do not contradict it either).
**Packet 5:** apply curve in `resolve_routings`' contribution step (order per A's SOURCES-SPEC edge pipeline: source → curve → depth/min/max), NOT in `lane_reader.py` (that's the separate axis-lane system); byte-identical-when-linear oracle stands; curve edits gesture-coalesced + Ledger rows; fix stale `EdgeInspector.tsx:1-15` "no backend storage" comment while there.
**Single-flight update:** 0a → 1 → 4 → 5; Packets 2/3 parallel. Cross-branch rule: B's later `operators.ts`/`routing.py` work rebases on Wave-0's merged diff (routing.py here = `modulation/routing.py`; B's DAG seam is `masking/routing.py` — different files, collision smaller than feared, finding #26 REFUTED).

**Bug filings (regardless of D-1):** LFOEditor/ModulationMatrix/KentaroCluster instance-UUID no-op mappings · `crossStoreCleanup.pruneEffectDependents` convention mismatch · `routing.py:310` silent drop needs a log · `EFFECT-CONTRACT.md` mask-order pseudocode contradicts `container.py` (mask is applied AFTER mix, on the mixed output) · `EFFECTS-INVENTORY.md` says 171 effects, registry has 220.

**Stale-doc fixes (both branches):** A: `PRD-mix-macro`/`PRD-edge-curve-ui` "Depends on: K1" is stale (S2 spike resolved it) — annotate. B: moire BDD still binds matte track to Cmd+Shift+M (superseded by Ctrl+Cmd+M, decision ㉜/#79) · LayerTap §9.1 "snake_case" header must scope to NEW keys (`growShrink` is live camelCase on the wire — verified) · System Monitor "95% assembled" claim is wrong: `_effect_timing` is keyed by effect TYPE globally, not per-instance/track — re-scope v1 (finding #70).

---

## 3. Later-wave reconciliation register (inputs to the K1/ST marathon briefs — do NOT build now)

1. **`reduce` has three spec loci** (K1 BindingRule · SOURCES-SPEC pipeline stage · layer_tap inline key) and **zero code presence**. Unify: one shared reduce implementation in `modulation/`; decide edge-level vs source-level; B's pinned whole-field formulas scoped to layer_tap v1, K1's region-probe stays open.
2. **FieldProvider reality check:** it's a cross-frame LRU keyed by (source_id, frame-bucket, resolution), readers hardcoded Image|Video, **never instantiated in production code**. Both A (K1 cache) and B (tap fan-out cache) assume a per-frame share-cache. K1 must wire it into the render path AND add the per-frame dimension, or both branches build against `masking/matte_source.py`'s budget-pool pattern; LayerTap's §9.3 tap-buffer cache should be the SAME mechanism (findings #1/#46/#98). Note MK.3's shipped `inject_device_masks` also has zero per-frame memoization (finding #71) — the cache work has three consumers.
3. **Signal-Tap × LayerTap:** distinct tiers (per-effect internal signals vs per-track pixel reads) that converged on the same `_tap_` vocabulary with different keying and different ordering models (at-slot vs backend DAG topo-sort). Unify under ONE DAG; define whether `effect_instance_id.signal` addressing joins D-1's convention; classify `temporal_blend.buffer` in the sequential-only parity bucket (B's datamosh-class caveat).
4. **LayerTap 'motion' field read** needs per-pixel motion — `video_analyzer.analyze_motion` is scalar-only (mean |Δluma| on 64² proxy); real per-pixel flow lives in A's optical-flow utility (datamosh Farneback reuse). Cross-reference instead of double-building.
5. **field_dst 'coord' does not exist** — current `field_dst` is a bool (per-row vector, EXPERIMENTAL-gated); K1 adds the (dx,dy) coord kind. B's FieldKind 'layer'/'generator' additions land in `field-param.ts`/`field_params.py` `_VALID_KINDS` (today: image|video|lane2d; lane2d is validated-but-rejected downstream). Key naming: FieldRef uses `source_id` — B's `track_id` key must be reconciled (finding #89). FieldRef is a frozen dataclass — 'layer' kind needs new fields = schema surgery, not addition (mapper-confirmed).
6. **Masking 'layer' kind:** `stack.py`'s evaluator registry accepts any kind string (3 procedural kinds already use the seam, zero dispatch edits needed) — but `masking/schema.py._VALID_KINDS` hardcodes the 8 kinds and rejects unknowns, and the new kind auto-counts against MAX_PROCEDURAL_MATTES_PER_RENDER=4 (decide intent).
7. **Perf mandates propagation:** B's PR#416 mandates (float hoisted once/consumer/frame, C-contiguous, INTER_AREA-to-64 forbidden, cost_est formula, YELLOW/RED thresholds) bind K1/ST/E2 field work; `container.py`'s `_mix`/`_mask` blend is naive numpy today (cv2 mandate applies when LayerTap masking lands, not Wave 0 — finding #37). A's utility PRDs should cite B's measured numbers instead of "confirm against budget" placeholders. SG-8 is ONE process-wide registry — register solver GPU pools and temporal rings against it explicitly; GPU has no observability surface in Monitor v1 (declare deferred).
8. **Composite-preview mask parity gap (MK.8, known-deferred):** `zmq_server.py:1688` omits `operators/operator_values` that all three export call sites pass — parity tests for presets/LayerTap must use the single-clip path or fix this first.
9. **UX unifications for B's build:** three "inspector" surfaces need one home (edge inspector = route inspector; inspector strip = hover readout); DeviceCard gets ONE '+' semantics (Signal-Tap publish vs tap consume); "chip" naming (B's tap chip claims the primitive; A's suggestion badge renames); Render-Safe badge (A) vs stateful-effect badge (B) = one two-state indicator; A's new surfaces get shortcut-table entries per B's convention; flatten/copy-paste lifecycle rules extend to ModEdge routes (B's asymmetric duplicate rule prevents A's copy-all double-drive); "Freeze-Melt" preset renamed (collides with system Freeze); 'composition' double-use inside A (preset vs morph A/B snapshot) renamed; B's PRESETS folder description gains A's Recipe-pack taxonomy; template projects ≠ chain presets (project-tier vs chain-tier — A does NOT close B's template gap, scope both explicitly).
10. **Preset schema vs tracks:** `chainData` cannot express tracks/matte-tracks — Recipe packs bundling LayerTap routings need an additive track-bundle extension or an explicit "chain-tier only" scope note (finding #51). Preset forward-compat: pair `presetSchemaVersion` with B's `min_feature_hints` advisory pattern (neither exists in code yet — greenfield, pick one story).

## 4. Corrections to prior session claims (for memory hygiene)
- "`.dna` no-regression precedent" (Wave-0 PRD): **no `.dna` file/format exists in this repo** — it's SPEC-6, Tier-6/E2, unbuilt. The pattern to cite is `project/schema.py`'s optional-field-absent-is-valid validators.
- "Presets folder promotes PresetBrowser (App.tsx:3756 'Presets' tab)" — actually a flat sidebar tab sibling-swap; browser has **5** tabs (fx/op/composite/tool/instruments), not 4.
- Browser "category-visibility Set" = actually `expanded` open-categories Set; dead `UserFolder` CRUD exists in `browser.ts` (localStorage, zero callers) — reuse or delete during Packet 2.
- `freeze_cut/freeze_frame` on `apply_chain` are unit-tested but have **zero production call sites**; the real Freeze feature is `engine/freeze.py`'s FreezeManager — B's promote-freeze should target the latter.

## 5. Definition of done for THIS unification pass
- [x] Both branches read end-to-end (39 docs) + codebase mapped (41 subsystems, 630 facts)
- [x] Every conflict code-verified; P0 finding independently adjudicated by orchestrator
- [x] Amendments enumerated; later-wave register written
- [ ] User decides D-1…D-5 → amend `MARATHON-BRIEF-wave0.md` accordingly → proceed to /marathon packetize (touchpoint 1 = packet-plan approval)
