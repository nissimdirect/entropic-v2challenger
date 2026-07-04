# Packets — wave0-prerouted-presets

**Emitted:** 2026-07-03 by /packetize (cascade mode, /marathon Stage 4). **Plan:** `plan.md` (same dir — packets POINT to its line-anchored normative sections; do not re-derive). **Decisions:** ALL LOCKED (D1-D4 + UD-1..UD-5, `plan.md` per-packet verbatims). **Route:** /eng Phase 3M.
**Branching rule (every packet):** cut from `origin/main` (≥ af9ba3b), NEVER from the local checkout (a parallel UAT session owns it; its branch `docs/uat-live-cu-stage-a-results` and `stash@{0}` are untouchable). PR-only; squash; no `.github/workflows/**` edits.
**Merge gate (every packet, UD-3 STRICT FULL-TIER):** full backend pytest + full vitest green (vitest on main checkout or CI — worktree executors cannot run vitest) → `Skill(review)` via Skill tool (ship-gate hook) → parity via single-clip path (MK.8 landmine, `plan.md:494`) → full CI green incl. e2e-full + sidecar.

### PK.00 — CI stabilization to full green
- **Scope:** make main-push CI fully green: e2e regression shards 2–3 (chaos/edge-cases/security-gates/ux-contracts specs), sidecar `test_calibration.py::test_numeric_params_have_unit` (`fx.copy_machine.feedback_amount` missing `unit`), 2 `test_zmq*` failures, and the `frontend/src/renderer/App.tsx:4373` tsc error (PresetSaveDialog `parameters` prop type). **Non-scope:** any Wave-0 feature code; perf-nightly; skipping/deleting tests to get green (fix root cause; a legitimately-obsolete test needs the reason in the PR body).
- **Files:** e2e spec files under `frontend/tests/e2e/regression/`; `backend/src/effects/fx/copy_machine.py` (add `unit` metadata); the failing `test_zmq*` targets; `App.tsx:4373` + `PresetSaveDialog.tsx:10` (prop type widening to `ParamValue`).
- **Depends:** none (dispatchable now). **Blocks:** ALL other packets' merges.
- **Risk:** STD (MED). Diagnosis-heavy: reproduce each failure BEFORE fixing (Gate 6 — run the failing test, capture output).
- **Hard oracle:** (1) `gh run list --branch main -L 1 --json databaseId,conclusion -q '.[0].conclusion'` must print `success`; (2) `gh run view $(gh run list --branch main -L 1 --json databaseId -q '.[0].databaseId') --json jobs -q '.jobs[] | "\(.name): \(.conclusion)"'` must show `success` for the job name(s) corresponding to e2e-full and sidecar — pull the exact job-name strings from `.github/workflows/*.yml` at execution time rather than assuming literal 'e2e-full'/'sidecar' names; `cd frontend && npx tsc -b` exit 0; the 3 named backend tests pass in the full run.
- **Test plan:** no new tests; the suite IS the deliverable. Evidence = CI run URL.
- **STOP:** if an e2e failure is a REAL product bug (not flake/stale-selector), STOP and report — product fixes are not this packet's scope.
- **Executor brief:** Sonnet; template `~/.claude/templates/subagent-brief.md`; inline verbatim: Gate 6 (reproduce first), R30 (no --force/--no-verify), the branching rule above. Last line: return PR # + CI URL.

### PK.0a — History Ledger discipline
- **Scope:** lint-style vitest over all `undoable()` call sites asserting non-empty, non-generic descriptions (deny-list: bare 'Add effect', 'update param', etc.; allow entity-interpolated); upgrade generic descriptions in Wave-0-touched paths (`project.ts` 'Add effect' → entity-specific). **Non-scope:** HistoryPanel UI changes (Lane-2 `history-panel-delta`); descriptions in files Wave 0 doesn't touch (report count, don't fix).
- **Files:** new `frontend/src/__tests__/stores/ledger-lint.test.ts`; `frontend/src/renderer/stores/project.ts` (descriptions only).
- **Depends:** PK.00 (merge gate only — can build in parallel). **Blocks:** none hard; PK.1 should land after so its new op descriptions are lint-covered.
- **Risk:** LOW.
- **Hard oracle:** ledger-lint test FAILS on pre-packet tree (anti-dead-flag proof, capture output), PASSES after; full vitest green.
- **Test plan:** unit (the lint test itself); grep-count assertion of remaining generic descriptions recorded in PR body.
- **STOP:** if >30 call sites need description changes to pass, STOP — deny-list too aggressive; report and narrow.
- **Executor brief:** Sonnet; inline: B-spec ledger rule (`creatrix-history-panel-spec.md §2`), test-layer rule (unit tier). Last line: PR # + failing-then-passing lint output.

### PK.1 — Preset routes: schema + save + apply + instance addressing (UD-1) — **RISK: HIGH**
- **Scope:** everything in `plan.md:78-230` (read it in full before starting — normative contract at `plan.md:142`, revised landmine at `plan.md:189`): (a) instance-UUID addressing — `shared/ipc-serialize.ts` adds instance `id` to `SerializedEffectInstance`; `backend/src/modulation/routing.py` keys `effect_map` by instance id with TYPE fallback for legacy mappings + debug log on dropped targets (today: bare `continue` at :310); (b) `preset.schema.json` `chainData.routes[]` + `presetSchemaVersion` + `effects.maxItems` 10→24 (shape at `plan.md:389`); (c) `PresetSaveDialog.tsx` collects operator mappings→routes + prop-type fix; (d) `App.tsx:3757` apply: materialize routes (old-id→new-id remap) + macros (today captured-but-dropped) in ONE `beginTransaction`/`commitTransaction` "Apply preset: <name>"; (e) load-time route validation (`validateMappingForSave`-equivalent at the preset trust boundary — `library.ts:91` pushes unsanitized JSON today). **Non-scope:** PresetBrowser UI (PK.2); seed presets (PK.3); curve application (PK.5).
- **Files:** `frontend/src/shared/schemas/preset.schema.json`, `frontend/src/shared/ipc-serialize.ts`, `frontend/src/renderer/components/library/PresetSaveDialog.tsx`, `frontend/src/renderer/App.tsx` (apply path + :4373 if PK.00 didn't), `frontend/src/renderer/stores/library.ts`, `backend/src/modulation/routing.py`.
- **Depends:** PK.00 (gate), PK.0a (soft). **Blocks:** PK.2, PK.3, PK.4, PK.5.
- **Risk:** **HIGH** → Opus-tier executor + mandatory `/qa-redteam` before merge (preset file = untrusted input crossing into the routing engine).
- **Hard oracle:** ALL of: wired round-trip byte-identical · id-remap test (applied routes point at NEW instance ids) · **duplicate-effect-type test: chain with TWO fx.datamosh instances, route targets exactly one — the targeted one modulates, the other doesn't** (impossible pre-UD-1; anti-dead-flag: this test must FAIL on main) · macros materialize on apply · apply == ONE undo entry (undo reverts everything atomically) · legacy TYPE-scoped mappings still resolve byte-identical (fallback) · old presets without `routes` load unchanged · malformed `routes[]` rejected with toast, no crash.
- **Test plan:** backend `tests/test_modulation/test_instance_addressing.py` (new; instance-key + TYPE-fallback + dropped-target log); frontend unit: schema round-trip, remap map, validation rejects; component: PresetSaveDialog collect + apply transaction (mock IPC); parity: single-clip pixel-diff applied-vs-hand-built (backend integration test).
- **Trust-boundary rule (verified this session):** the REAL boundaries are `library.ts` load (preset file → store) and the render/export IPC (`security.validate_operator_mod_edges` — does NOT validate target fields; don't add validation to `project/schema.py`'s deserialize path thinking it's the live gate).
- **STOP:** if instance-id-on-the-wire breaks any existing test in a way that isn't a trivial fixture update, STOP and report (the fallback design should make it purely additive — breakage means the design assumption failed) · if `App.tsx` apply path has materially changed from `plan.md:99` code-ground (parallel sessions are active), STOP and re-verify before editing.
- **Executor brief:** Opus-tier; inline verbatim: UD-1 decision text (`plan.md:89`), trust-boundary rule, Gate 13 (trace full chain before fixing), R4 (read before edit). Last line: PR # + oracle evidence list.

### PK.2 — Presets Library folders (embeddable, UD-2)
- **Scope:** folders (packs)/search/tag-filter INSIDE `PresetBrowser.tsx` as an embeddable component — no new top-level chrome (UD-2: routing-suite's browser tree re-hosts it later as the PRESETS node); apply = click + drag (keep the `application/entropic-preset` drag channel); resolve dead `browser.ts` UserFolder CRUD per Lane-2 browser-folders OD-2 default (delete) ONLY if trivially separable, else leave untouched and note. **Non-scope:** the folder-tree browser itself (Lane 2); USER LIBRARY disk sync.
- **Files:** `frontend/src/renderer/components/library/PresetBrowser.tsx`, `PresetCard.tsx`, `stores/library.ts` (folder = subdir of `<Documents>/Creatrix/Presets/`, UD-4).
- **Depends:** PK.1 (needs routes-bearing presets to display counts). **Blocks:** PK.3 verification path. Parallel-safe with PK.4/PK.5 (disjoint files).
- **Risk:** STD (MED).
- **Hard oracle:** browse/search/filter/apply smoke green · apply == hand-built pixel-diff (single-clip path) · transparency: apply→remove-all == baseline byte-identical · agent-tool parity (agent applies a preset via tool, same result) · CU rows for the preset flow in `docs/UAT-CU-ADDENDUM-2026-07-03.md` executable as written.
- **Test plan:** component tests (folder nav, search, tag filter, drag payload unchanged — mock IPC); the pixel-diff parity test rides PK.1's harness.
- **UAT journey:** open Presets → browse pack → one-click apply wired preset → open chain + Matrix → edges visible/editable → remove-all → baseline. Pixel-verify with design tokens (no raw hex — hex-ratchet CI).
- **STOP:** any need for a new top-level surface/tab → STOP (violates UD-2).
- **Executor brief:** Sonnet; inline: UD-2 verbatim, hex-ratchet rule, embeddable constraint. Last line: PR # + screenshot paths.

### PK.3 — Seed 24 presets
- **Scope:** author the 24 🟢 rows of `PRESET-TOP50.md` as `.glitchpreset` JSON (schema per PK.1) in pack subfolders of `<Documents>/Creatrix/Presets/` (UD-4; shipped via app resources + first-run copy — follow `plan.md:291` code-ground) + rendered real thumbnails. **Non-scope:** presets needing unbuilt effects (kuwahara/structure-tensor rows stay in the deferred bucket — verified absent from registry).
- **Files:** new preset JSONs + thumbnails; a `backend/scripts/render_preset_thumbs.py` one-off is acceptable (Code > Tokens).
- **Depends:** PK.1 (schema) only. Parallel-safe with PK.2 — both depend only on PK.1; PK.3's hard oracle drives apply programmatically (automated apply+render+hash), not through the `PresetBrowser` UI, so it has no runtime dependency on PK.2's folders/search/tags work.
- **Risk:** LOW.
- **Hard oracle:** automated loop: each of 24 applies + renders + output hash recorded (screenshot = human spot-check only, per UNIFICATION #97); every preset's effect ids verified against live registry (`list_all()`); ≥1 preset per pack carries a route AND a macro (proves the full bundle path).
- **Test plan:** backend integration test iterating all 24 (apply-chain render, non-black assertion + hash stability for deterministic ones; seeded/stateful flagged per `plan.md` landmines).
- **STOP:** >4 of the 24 unable to render non-trivially with today's effects → STOP, report roster problem (don't silently swap presets in).
- **Executor brief:** Sonnet; inline: registry explicit-import rule, stateful-effect multi-frame rule (learning #44). Last line: PR # + 24-row hash table path.

### PK.4 — `_mix` mappable macro
- **Scope:** `stores/operators.ts` allows `_mix` as `target_param_key`; wet/dry knob on every device card (EXISTING `Knob.tsx` convention — Knob-v3 is unbuilt Lane-2 spec, do NOT implement); `_mix` ParamDef metadata with `unit` + `curve` (calibration test enforces). Backend: NOTHING (verified: `routing.py:210-221` injects `_mix`, `:602-605` bounds, `container.py:59` mixes). **Non-scope:** mix math changes; per-region mix; morph itself (only the `_mix→0` bypass proof).
- **Files:** `frontend/src/renderer/stores/operators.ts`, device-card knob mount (`DeviceCard.tsx`), ParamDef registration point.
- **Depends:** PK.1 (operators.ts single-flight — REBASE AFTER PK.1 MERGES). **Blocks:** PK.5 dispatch (order 1→4→5).
- **Risk:** LOW.
- **Hard oracle:** `_mix` default==1.0 byte-identical render (regression) · `[audio.rms → effect._mix]` A/B shows wet/dry modulation · `_mix→0` == bypassed byte-identical · `test_numeric_params_have_unit`-class calibration green for the new ParamDef · `_*` registration guard NOT tripped (it's registration-time only — verified).
- **Test plan:** backend test: route writes `_mix`, container consumes (exists? extend `test_mix_integration.py`); frontend unit: target validation accepts `_mix`; component: knob renders + binds.
- **STOP:** if allowing `_mix` requires touching `registry.py`'s guard → STOP (design says it doesn't; report).
- **Executor brief:** Sonnet; inline: the S2 spike resolution verbatim (`PRD-mix-macro.md §5`), calibration-test requirement. Last line: PR # + byte-identical proof.

### PK.5 — Edge-curve applied + enum picker (UD-5)
- **Scope:** apply `OperatorMapping.curve` in `resolve_routings`' contribution step (order: source → curve → depth/min/max, per `plan.md:359` code-ground; NOT in `lane_reader.py` — separate system); add `smoothstep` to `CurveType` (additive, both TS + accepted values backend-side); enum-picker UI in `frontend/src/renderer/components/operators/B9EdgeInspector.tsx` (the live per-edge inspector mounted at `OperatorRack.tsx:323`, which already renders depth/polarity/delete + bindingRule for `op-edge:` mappings — add the curve picker alongside those); separately, fix the now-stale "curve ... DEFERRED (B4-full; no backend storage exists for them yet)" comment at `routing-canvas/EdgeInspector.tsx:1-15` (a different, also-live component mounted at `RoutingCanvas.tsx:523`) since it becomes false once Packet 5 lands, but do NOT add the picker UI to that file; curve edits = specific Ledger descriptions, gesture-coalesced n/a (discrete picker). **Non-scope:** draggable-points editor (K1, UD-5); ParamDef.curve (different concept — one doc note distinguishing them, per UNIFICATION #11).
- **Files:** `backend/src/modulation/routing.py` (+ curve shaping fn), `frontend/src/shared/types.ts` (CurveType), `frontend/src/renderer/components/operators/B9EdgeInspector.tsx` (add curve picker), `frontend/src/renderer/components/routing-canvas/EdgeInspector.tsx` (stale-comment fix only, no new UI), `stores/operators.ts` (picker write — after PK.4 rebase).
- **Depends:** PK.1 + PK.4 (single-flight on routing.py + operators.ts — LAST in the serial chain).
- **Risk:** STD (MED) — silent-change guard is the whole game.
- **Hard oracle:** **curve absent/'linear' == byte-identical to today** (regression across a corpus of existing mappings — anti-silent-change) · smoothstep unit test (shaped output matches formula) · picker round-trips (set → save → reload → applied) · `docs/UAT-CU-ADDENDUM` row for edge-curve executable.
- **Test plan:** backend unit: shaping fn per enum value + identity proof; backend integration: route with s-curve vs linear differ, linear==legacy; frontend component: picker (mock IPC).
- **STOP:** if applying curve requires touching `_blend_contributions`' cross-mapping semantics beyond the per-contribution value → STOP (scope creep into blend policy).
- **Executor brief:** Sonnet; inline: UD-5 verbatim, the two-curve-concepts note, byte-identical oracle primacy. Last line: PR # + identity-regression proof.

## Single-flight map
| File | Packets | Order |
|---|---|---|
| `modulation/routing.py` | PK.1, PK.5 | 1 → 5 |
| `stores/operators.ts` | PK.1(reads)/PK.4, PK.5 | 1 → 4 → 5 |
| `App.tsx` | PK.00 (:4373), PK.1 | 00 → 1 |
| `PresetSaveDialog.tsx` | PK.00 (type fix), PK.1 | 00 → 1 (or fold type fix into 1 if 00 lands without it) |
**Serial chain:** 00 → 0a → 1 → 4 → 5. **Parallel:** 2 + 3 after 1 (disjoint from 4/5). Cross-lane: Lane-2 changes touching these files rebase after this change merges.

## Coverage check (plan → packets)
Every plan item maps: instance addressing + schema + save/apply + validation + transaction → PK.1 · CI + tsc → PK.00 · ledger → PK.0a · folders UI → PK.2 · seeds → PK.3 · _mix → PK.4 · curve → PK.5 · bug filings (`plan.md:444`) → filed as issues alongside PK.1, NOT packet scope · UAT rows → consumed at Stage 6 from `docs/UAT-CU-ADDENDUM-2026-07-03.md`. Nothing descoped.

## Ledger
| Packet | Status | PR | Oracle evidence |
|--------|--------|----|-----------------|
| PK.00 | ⬜ | — | — |
| PK.0a | ⬜ | — | — |
| PK.1 | ⬜ | — | — |
| PK.2 | ⬜ | — | — |
| PK.3 | ⬜ | — | — |
| PK.4 | ⬜ | — | — |
| PK.5 | ⬜ | — | — |
