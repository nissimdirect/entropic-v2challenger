---
title: Undo/History work packets — coverage audit, new-op undo, painted-field history, memory smoke
created: 2026-06-11
status: packets — UH.1/UH.5 ready now; UH.2/UH.3 gated on Phase-5a; UH.4 gated on C3
sources: plans/entropic-history-buffer-validation.md (Gap-2/Gap-3) · packets/phase-5a.md (P5a.1/P5a.3/P5a.9–11) · EXECUTION-PLAN.md §1 contract
ground_truth_verified_at: origin/main d821ae8 (2026-06-11)
repo: ~/Development/entropic-v2challenger (nissimdirect/entropic-v2challenger)
---

# Undo/History packets (UH.1 – UH.5)

> Follows the EXECUTION-PLAN §1 contract: preconditions STOP on mismatch, ≥1 negative test per
> packet, quantified gates, Sonnet tier unless noted. The undo infrastructure itself is **DONE and
> sufficient** (`plans/entropic-history-buffer-validation.md` verdict: no new infra) — these packets
> are coverage, convention, and hygiene on top of it.

## Ground truth this file was verified against (2026-06-11, origin/main @ d821ae8)

| Fact | Where |
|---|---|
| Undo store: `undoable(description, forward, inverse)` export, `MAX_UNDO_ENTRIES = 500` / `MAX_REDO_ENTRIES = 500` (:12–13), `beginTransaction`/`commitTransaction`/`abortTransaction`, crash-push on forward-throw, `execute` clears `future` | `frontend/src/renderer/stores/undo.ts` (~207 lines; conventions header :1–7) |
| `UndoEntry {forward, inverse, description, timestamp}` | `frontend/src/shared/types.ts:316–321` |
| History panel w/ click-to-jump | `frontend/src/renderer/components/layout/HistoryPanel.tsx` |
| Existing tests | `frontend/src/__tests__/stores/undo.test.ts` · `frontend/src/__tests__/components/timeline/history-panel.test.ts` |
| `undoable(` call-site counts per store (the de-facto "action registry" — there is no central registry object; coverage = call sites) | `timeline.ts` 39 · `automation.ts` 13 · `project.ts` 9 · `operators.ts` 8 · `performance.ts` 5 · (`undo.ts` 4 internal) |
| Stores with mutations and **ZERO** `undoable(` | `effects.ts` (0) · `instruments.ts` (3 `set(` sites) · `freeze.ts` (9) · `library.ts` (10) · `midi.ts` (13) |
| Gap-2 description-string convention table + Gap-3 50MB smoke ceiling | `docs/roadmap/plans/entropic-history-buffer-validation.md` |
| Voice FSM / event-log design (B2): pure `evaluateVoices`, per-track `trackEvents` event logs, instrument param stores | `packets/phase-5a.md` P5a.1/P5a.3 |
| Rack ops (B4): `addRack`, leaf instrument/chain/sends edits, mute/solo, 8 macros | `packets/phase-5a.md` P5a.9–P5a.11 |
| Mod-edge writes: `setLaneAxisBinding` (#158, merges in P1.1) + B4-lite SPEC-2 routing mutations | EXECUTION-PLAN P1.1; `entropic-spec-2-b4lite-schema.md` |

**Standard negative tests (required in EVERY UH packet's suite):**
- **"undo on empty stack is a no-op — no crash, no toast, state unchanged"** (store guard exists at `undo.ts` `if (past.length === 0) return` — each packet re-asserts it through ITS new actions).
- **"redo after a divergent edit is impossible — new action clears the future stack"** (execute/`pushToStack` set `future: []` — each packet proves it with its own action pair: do A → undo → do B → redo is a no-op).

---

## UH.1 — Undo-coverage audit of new ops (matrix doc, audit-only)

- **ID:** UH.1 · **branch:** `docs/uh1-undo-coverage-matrix` · **base:** origin/main · **depends-on:** P1.0 (green baseline; schedulable Phase-1-adjacent)
- **Goal:** Enumerate every user-visible mutation on origin/main, classify it covered / uncovered / intentionally-not-undoable, and ship the coverage matrix as a doc — **audit only, zero production-code changes** (`feedback_stock-take-not-fix.md`).
- **Preconditions (mismatch → STOP):**
  ```bash
  cd ~/Development/entropic-v2challenger
  git grep -n "export function undoable" frontend/src/renderer/stores/undo.ts
  # EXPECT: 1 hit (the helper — there is no central action-registry object; call sites ARE the registry)
  git grep -c "undoable(" frontend/src/renderer/stores/*.ts
  # EXPECT: timeline 39 · automation 13 · project 9 · operators 8 · performance 5 · undo 4 — drift means
  # merges landed since 2026-06-11; re-snapshot the counts, do not STOP for higher numbers
  git grep -c "undoable(" frontend/src/renderer/stores/effects.ts || echo "0 — effects store uncovered, expected"
  # EXPECT: 0 (the headline known gap this audit formalizes)
  ```
- **Scope:** NEW `docs/roadmap/packets/undo-coverage-matrix.md` ONLY.
- **DO-NOT-TOUCH:** all production code; all test files (filing fix packets is the orchestrator's job after reading the matrix).
- **Steps:**
  1. Enumerate mutation surfaces: `git grep -n "set(" frontend/src/renderer/stores/*.ts` + every exported action per store; cross-reference against `undoable(` call sites.
  2. Per action, one matrix row: store · action · user-visible? · wrapped in `undoable()`? · transaction-grouped where multi-step? · description string (vs the Gap-2 convention table) · verdict ∈ {✅ covered · ❌ uncovered-should-be · ⏸ intentionally-not (view state: zoom, panel sizes, search text, toast, engine status…)}.
  3. Known starting points the matrix must adjudicate (verified 2026-06-11): `effects.ts` 0 call sites · `instruments.ts` 0 (3 mutations — B1 sampler add/update/remove are user-visible edits!) · `freeze.ts` 0 (9) · `library.ts` 0 (10) · `midi.ts` 0 (13 — mappings are user edits, CC values are runtime).
  4. Tally + a prioritized fix-packet list (each ❌ row names which future packet owns it: UH.2, UH.3, or a new UH.6+ row appended to this file by the orchestrator).
- **Test plan:** the matrix IS the deliverable; verification = spot-check 10 random rows by reading the cited store code (`feedback_grep-the-test-file-before-claiming-coverage.md` applies to coverage claims: every ✅ row must cite the `undoable(` line number). **Negative check:** pick 2 rows claimed ✅ and 2 claimed ❌, re-derive them from source; any misclassification → re-audit the whole store.
- **Acceptance gates (quantified):** every store under `frontend/src/renderer/stores/` has ≥1 matrix section (19 stores on main); 100% of exported mutating actions classified; 0 rows left "TBD"; the ❌ count is stated in the doc summary with the fix-packet routing table.
- **Failure modes:** classifying view-state as ❌ (inflates the gap) → the ⏸ category definition in step 2 is the guard; main moves mid-audit → re-snapshot counts and note the SHA audited.
- **Rollback:** revert (doc-only). · **Evidence:** the matrix + the 4-row spot-check transcript in the PR body.
- **Model:** Sonnet.

---

## UH.2 — Voice-FSM undo (B2 states: event-log + instrument-param mutations)

- **ID:** UH.2 · **branch:** `feat/uh2-voice-fsm-undo` · **base:** origin/main · **depends-on:** P1.3 (#167 track-keyed instruments), P5a.1 (voiceFSM), P5a.3 (per-track `trackEvents` event logs)
- **Goal:** Every B2-surface mutation is undoable: trigger-event log edits (clear/trim/merge of captured events), instrument-level param edits, and pad/instrument assignment — while **live pad performance itself stays OUT of the undo stack** (a pad hit is performance input, not an edit; only the captured/committed event log is document state).
- **Preconditions (mismatch → STOP):**
  ```bash
  cd ~/Development/entropic-v2challenger
  git grep -n "trackEvents" frontend/src/renderer/stores/performance.ts
  # EXPECT: ≥1 hit (P5a.3 landed). 0 hits → STOP, P5a.3 not merged.
  git grep -n "evaluateVoices" frontend/src/renderer/components/instruments/voiceFSM.ts
  # EXPECT: 1 export (P5a.1 landed)
  git grep -c "undoable(" frontend/src/renderer/stores/instruments.ts
  # EXPECT: 0 (this packet adds coverage; >0 → partial coverage landed, reconcile with UH.1 matrix first)
  ```
- **Scope:**
  - [ ] `frontend/src/renderer/stores/instruments.ts` — wrap `addSampler`/`updateSampler`/`removeSampler` (and rack-era successors if present) in `undoable()` with Gap-2-style descriptions (`Add sampler to {trackName}`, `Edit {param} on {trackName} sampler`, `Remove sampler from {trackName}`); param-drag edits coalesce via `beginTransaction` on drag-start / `commitTransaction` on drag-end (one history entry per gesture, the existing knob/slider pattern).
  - [ ] `frontend/src/renderer/stores/performance.ts` — event-LOG mutations (`clearTrackEvents`, captured-event merge/trim, choke-group edits, pad assignment) wrapped in `undoable()`. **Live `triggerPad`/`releasePad` appends during performance are explicitly NOT wrapped** — documented in a code comment at the trigger site (undoing mid-performance would corrupt replay determinism; the FSM derives all voice state from the log, so undo of a LOG EDIT cleanly recomputes voices).
  - [ ] Tests: extend `frontend/src/__tests__/stores/instruments.test.ts` + `performance.test.ts`.
- **DO-NOT-TOUCH:** `voiceFSM.ts` (pure, stateless — nothing to undo); `undo.ts` itself; backend.
- **Steps:** instruments-store wrap (+ tests) → event-log-mutation wrap (+ tests) → transaction coalescing for drags → description strings audited against the Gap-2 table.
- **Test plan:**
  ```bash
  cd ~/Development/entropic-v2challenger/frontend
  npx --no vitest run src/__tests__/stores/instruments.test.ts src/__tests__/stores/performance.test.ts
  npx --no vitest run   # full suite
  ```
  Named tests: "undo removes the sampler added to a performance track" · "undo of a sampler param drag restores the pre-drag value in one step (transaction)" · "undo of clear-events restores the full event log and voices recompute identically" · "live pad trigger does not push an undo entry" · "choke-group edit undoes atomically". **Negative tests:** the two standard ones (empty-stack no-op · redo-after-divergent-edit) exercised through `addSampler`/undo/`updateSampler`/redo.
- **Acceptance gates (quantified):** `git grep -c "undoable(" frontend/src/renderer/stores/instruments.ts` ≥ 3; every event-LOG mutation in `performance.ts` wrapped (enumerate in PR body; live-trigger sites explicitly listed as exempt with the comment quoted); FSM determinism preserved — "same event log + frame → identical voices" test (P5a.1) still green; full suite ≥ baseline.
- **Failure modes:** wrapping live triggers by mistake → the "no undo entry on pad trigger" negative test is the catch; inverse of an event-log edit captures the log by reference (mutates later) → deep-copy in the closure, proven by the "voices recompute identically" test; undo of `removeSampler` must restore the SAME instrument id (pre-generated IDs per undo.ts conventions header).
- **Rollback:** revert PR; wrapping is behavior-additive (same mutations, now reversible).
- **Evidence:** vitest output + the wrapped-vs-exempt mutation enumeration + description-string table.
- **Model:** Sonnet.

---

## UH.3 — Mod-edge + rack-op undo

- **ID:** UH.3 · **branch:** `feat/uh3-modedge-rack-undo` · **base:** origin/main · **depends-on:** P1.1 (#158 `setLaneAxisBinding` merged) for the lane half; P5a.9–P5a.11 (rack host, sends/returns, macros) for the rack half — **if the rack half is unmerged at dispatch, ship the lane half alone and retitle the PR** (don't sit on finished work).
- **Goal:** Modulation-routing edits (lane axis bindings, operator mod-route edges, B4-lite SPEC-2 writes) and rack operations (add rack, leaf edits, sends, mute/solo, macro assignments) are undoable with Gap-2 convention descriptions — the History panel reads like a routing log.
- **Preconditions (mismatch → STOP):**
  ```bash
  cd ~/Development/entropic-v2challenger
  git grep -n "setLaneAxisBinding" frontend/src/renderer/stores/automation.ts
  # EXPECT: ≥1 hit (#158 merged via P1.1). 0 → STOP, lane half blocked.
  git grep -n "undoable(" frontend/src/renderer/stores/automation.ts | wc -l
  # EXPECT: ≥13 (existing coverage — this packet ADDS the axisBinding wrap if #158 shipped it bare)
  git grep -n "addRack" frontend/src/renderer/stores/instruments.ts
  # EXPECT: ≥1 hit if P5a.9 merged; 0 → rack half deferred (see depends-on rule)
  ```
- **Scope:**
  - [ ] `frontend/src/renderer/stores/automation.ts` — `setLaneAxisBinding` wrapped (if #158 didn't): description `Bind lane {param} → {domain}` / inverse restores prior binding (incl. `undefined`).
  - [ ] B4-lite SPEC-2 routing mutations (wherever the SPEC-2 store landed them — find via `git grep -n "modRoutes\|binding_rule" frontend/src/renderer/stores/`): add/delete/edit-depth/edit-rule each wrapped using the **Gap-2 convention table verbatim** (`Map {source} → {target} (×{depth})` · `Unmap {source} → {target}` · `Adjust {edge} depth ({old}→{new})` · `Change binding {old}→{new} on {edge}` · `Bulk modulation edits ({count})` for transactions). This packet IS the Gap-2 action item ("ships with SPEC-2 writer-side work — same module").
  - [ ] `frontend/src/renderer/stores/instruments.ts` rack ops (P5a.9–11): `addRack`, pad-leaf instrument/chain/send edits, mute/solo, macro add/remove/assign — multi-edge macro fan-out edits wrapped in ONE transaction.
  - [ ] Tests: extend automation + instruments store suites; extend `history-panel.test.ts` with a description-rendering case.
- **DO-NOT-TOUCH:** `undo.ts`; `backend/**`; operator CC-value runtime writes (modulation OUTPUT is never undoable — only routing TOPOLOGY edits).
- **Steps:** lane half → SPEC-2 routing writes → rack half (if unblocked) → history-panel description check.
- **Test plan:**
  ```bash
  cd ~/Development/entropic-v2challenger/frontend
  npx --no vitest run src/__tests__/stores/automation.test.ts src/__tests__/stores/instruments.test.ts
  npx --no vitest run src/__tests__/components/timeline/history-panel.test.ts
  npx --no vitest run   # full
  ```
  Named tests: "undo unbinds a lane axis binding and restores the prior domain" · "mod-edge add/undo/redo round-trips the edge with identical id" · "macro assignment fan-out undoes as one history entry (transaction)" · "mute/solo undo restores sibling states (solo symmetry)" · "history panel renders the Gap-2 description for a mapped edge". **Negative tests:** the two standard ones via mod-edge add/undo/edit/redo; plus "undo of a deleted edge whose target effect was ALSO deleted restores the edge as orphan-safe (no crash, validator flags it)" — cross-store cleanup inverse must RESTORE cleaned data per the undo.ts conventions header.
- **Acceptance gates (quantified):** every routing mutation found by the precondition greps wrapped (enumerated in PR body); 5 named + 3 negative tests green; description strings byte-match the Gap-2 table templates (grep the literal templates in test assertions); full suite ≥ baseline.
- **Failure modes:** inverse closure captures array indices instead of IDs (the undo.ts header's #1 rule) → the identical-id round-trip test is the catch; cross-store edge deletion (edge + its lane) only half-restored → the orphan-safe negative test is the catch; rack half dispatched before P5a.9 → the precondition STOP.
- **Rollback:** revert PR.
- **Evidence:** vitest output + wrapped-mutation enumeration + a History-panel screenshot showing convention-formatted entries (live runtime path named, Gate 18).
- **Model:** Sonnet.

---

## UH.4 — Painted-field history (C3 field params) — **RISK:HIGH**, design-first

Brushstroke-granular undo for C3 per-pixel parameter fields (and the D-PB paint affordance,
spec-4 §3.4). A naive snapshot-per-stroke at 1080p **breaks the Gap-3 memory ceiling by ~20×** —
so this is TWO packets: a design decision packet (UH.4a) that picks the representation with real
memory math, then the implementation packet (UH.4b) that builds the winner. **UH.4b may not start
until UH.4a's decision doc is merged** (same gate pattern as P2.3 ← P5a.4a).

### UH.4a — Design decision: stroke-list vs buffer-snapshot vs tile-diff
- **ID:** UH.4a · **branch:** `docs/uh4a-painted-field-history-design` · **base:** origin/main · **depends-on:** C3 field-param schema exists in some form (P6.x expansion or the D-PB minimal `ParamValue = number | {field: ImageRef}` subset from spec-4 §3.3 — whichever lands first); UH.5 merged (the smoke test is the budget enforcement this design must satisfy).
- **Goal:** Ship `docs/decisions/painted-field-history-design.md` choosing the undo representation for painted fields, with per-option memory math at 1080p and a decision the UH.4b implementer executes with zero improvisation.
- **Preconditions:** `git grep -rn "ImageRef\|field.*canvasId" frontend/src/shared/types.ts` → ≥1 hit (field params exist); 0 → STOP, C3 not landed.
- **Scope:** the decision doc ONLY. It must contain at minimum:
  - **Option A — buffer-snapshot per stroke:** full field copy per undo entry. Math (1080p grayscale field, 1920×1080 = 2,073,600 px): uint8 = **1.98 MiB/entry** → 500-entry cap = **0.97 GiB** (float32: 7.91 MiB/entry → 3.86 GiB). Verdict math: exceeds the 50 MB Gap-3 ceiling by ~20× (uint8) — viable ONLY with a drastically lower per-field entry cap (≤25 entries/field).
  - **Option B — stroke-list replay:** store brush params + polyline (~24 B header + 8 B/point × ~200 pts ≈ **1.6–2 KiB/stroke**); 500 strokes ≈ **1 MB**. Undo = re-rasterize from last keyframe. Keyframe snapshots every K strokes bound replay cost: K=50 → ≤10 keyframes × 1.98 MiB = 19.8 MiB + strokes ≈ **~21 MiB total, PASSES**; worst-case undo latency = rasterize ≤50 strokes (state the per-stroke rasterize budget and measure one).
  - **Option C — tile-diff:** 64×64 uint8 tiles = 4 KiB; 1080p = 30×17 = **510 tiles**; a local stroke dirties ~10–40 tiles → **40–160 KiB/entry**; 500 entries = 20–80 MiB (borderline vs 50 MB); full-field ops (clear/invert) dirty all 510 tiles = 2 MiB/entry → needs a per-entry size cap with snapshot fallback.
  - Interaction with the global 500-entry stack (field entries share the cap with all other edits — state the eviction consequence); persistence question (paint history survives save? Round-1 says no cross-session undo — confirm and cite); redo semantics after divergent paint; the recommendation (expected: **B with keyframes**, C as fallback if strokes become raster imports) + the named tests UH.4b must write.
- **DO-NOT-TOUCH:** all production code.
- **Test plan:** doc review — the memory table re-derived by the reviewer (numbers above are the 2026-06-11 derivation; arithmetic must check out); each option has a stated PASS/FAIL against the UH.5 ceiling. **Negative check:** the doc must answer "what happens at entry 501" and "what happens on undo past the oldest keyframe" — missing either → bounce.
- **Acceptance gates:** doc merged with all 3 options quantified, 1 recommendation, UH.4b test list named.
- **Failure modes:** designing against float32 fields when the renderer samples uint8 (4× memory error) → state the field dtype from the C3 schema explicitly, with a grep citation.
- **Rollback:** revert (doc-only). · **Evidence:** the memory table + dtype citation.
- **Model:** **Opus/Fable (RISK:HIGH design)** + review per §6 protocol.

### UH.4b — Implementation of the chosen representation
- **ID:** UH.4b · **branch:** `feat/uh4b-painted-field-history` · **base:** origin/main · **depends-on:** UH.4a merged (existence gate: `test -f docs/decisions/painted-field-history-design.md || STOP`), the C3/D-PB paint surface merged (P3.7 or P6.x — whichever owns the brush at the time).
- **Goal:** Brushstroke-granular undo on painted fields per the UH.4a decision, inside the existing `undoable()` API (no new undo infra — the validation doc's verdict stands).
- **Preconditions:** the existence gate above; `git grep -n "PaintLayer\|paint" frontend/src/renderer/components/preview/ | head -3` → the paint surface exists; UH.5's smoke test green on main (the budget harness this packet must extend).
- **Scope:** per the decision doc ONLY (expected: stroke objects + keyframe ring in the paint store; `undoable()` entries whose forward/inverse rasterize-from-keyframe; one stroke = one entry; drag = one stroke, not N points). Extend UH.5's memory smoke with a painted-field scenario.
- **DO-NOT-TOUCH:** `undo.ts` (the API is sufficient — if you believe it isn't, STOP and report; that contradicts the validation doc and needs orchestrator sign-off).
- **Test plan:** named tests: "undo removes exactly the last brushstroke (pixel-level assert on the field)" · "redo repaints the identical stroke (field hash match)" · "undo across a keyframe boundary reconstructs from the prior keyframe" · "500-stroke painted-field session stays under the UH.4a memory budget" (extends UH.5 harness, quantified to the decision doc's number) · "clear-field undoes as one entry". **Negative tests:** the two standard ones through paint/undo/paint/redo; plus "undo past the oldest evicted entry is a no-op with the field intact".
- **Acceptance gates (quantified):** field-hash round-trip exact; memory test under the UH.4a budget (expected ≤25 MiB for the B+keyframe design at 1080p); undo latency for the worst replay window measured and under the decision doc's stated budget; full suite ≥ baseline.
- **Failure modes:** stroke replay non-deterministic (anti-aliasing/float order) → hash test catches; keyframe ring eviction desyncs from the global 500-entry stack eviction → the past-oldest negative test catches.
- **Rollback:** revert PR; painted fields fall back to non-undoable paint (pre-packet behavior).
- **Evidence:** vitest output + the memory + latency numbers vs budget.
- **Model:** **Opus/Fable (RISK:HIGH)** + `/qa-redteam` before merge.

---

## UH.5 — History-buffer 500-entry memory smoke (Gap-3, quantified ceiling)

- **ID:** UH.5 · **branch:** `test/uh5-undo-memory-smoke` · **base:** origin/main · **depends-on:** P1.0 only — schedulable NOW (Gap-3 action item: "anytime; lightweight").
- **Goal:** A CI-runnable smoke test that fills the undo stack to its 500-entry cap with realistically-sized captures and asserts a **quantified heap ceiling: < 50 MB heap delta** (the `entropic-history-buffer-validation.md` Gap-3 number), so closure-capture bloat (e.g. a full effect-chain snapshot per entry) is caught the day it appears, not at 4 GB RSS in production.
- **Preconditions (mismatch → STOP):**
  ```bash
  cd ~/Development/entropic-v2challenger
  git grep -n "MAX_UNDO_ENTRIES = 500" frontend/src/renderer/stores/undo.ts
  # EXPECT: 1 hit at ~:12 (cap changed → update the test's loop count AND this packet)
  git grep -rn "heapUsed" frontend/src/__tests__/ | wc -l
  # EXPECT: 0 (verified 2026-06-11 — no memory test exists; >0 → reconcile with the existing one first)
  ```
- **Scope:**
  - [ ] NEW `frontend/src/__tests__/stores/undo-memory-smoke.test.ts`
  - [ ] `frontend/package.json` — a `test:memory` script if a dedicated invocation is needed: `NODE_OPTIONS=--expose-gc npx --no vitest run src/__tests__/stores/undo-memory-smoke.test.ts` (vitest runs in Node — `global.gc()` is available under `--expose-gc`; if the harness can't guarantee the flag in CI, the test asserts with a 1.5× variance margin and is marked accordingly).
- **DO-NOT-TOUCH:** `undo.ts` (this packet MEASURES; if it finds a leak, the FIX is a separate packet filed with the evidence).
- **Steps:**
  1. Build the harness: `gc()` → snapshot `process.memoryUsage().heapUsed` → push 500 `undoable()` entries each capturing a **synthetic 50 KB payload** (typed-array in the closure — models a captured chain/track snapshot; 500 × 50 KB = 24.4 MiB of legitimate capture) → `gc()` → snapshot → assert delta < 50 MB (legit capture + entry overhead must fit with ≥2× headroom).
  2. Eviction case: push 600 entries → assert `past.length === 500` AND heap delta still < 50 MB (evicted entries actually free — slice() must not retain the old array's backing captures).
  3. Transaction case: 500 entries inside one `beginTransaction`/`commitTransaction` → 1 composite entry, heap accounts for all 500 closures (documents that transactions do NOT reduce memory, only entry count).
- **Test plan:**
  ```bash
  cd ~/Development/entropic-v2challenger/frontend
  NODE_OPTIONS=--expose-gc npx --no vitest run src/__tests__/stores/undo-memory-smoke.test.ts
  npx --no vitest run   # full suite — smoke must not destabilize others (it clear()s the store in afterEach)
  ```
  Named tests: "500-entry undo stack with 50KB captures stays under 50MB heap delta" · "eviction past MAX_UNDO_ENTRIES releases evicted captures (600→500, heap bounded)" · "transaction coalescing keeps all closure memory (documented, asserted)". **Negative tests:** the two standard ones (empty-stack undo no-op · redo cleared by divergent edit) asserted at the 500-entry boundary — i.e. after fill, undo 500 times then once more (no-op), redo after a new push (no-op).
- **Acceptance gates (quantified):** delta < 50 MB (test 1) · `past.length === 500` exactly after 600 pushes · all 3 + 2 negative tests green locally AND in the CI `smoke` job · runtime of the smoke file < 30 s (it must stay in the default suite, not a nightly).
- **Failure modes:** GC nondeterminism → the `--expose-gc` + forced-gc-before-snapshot pattern, plus the 1.5× margin fallback; jsdom env inflates baselines → use `// @vitest-environment node` for this file (no DOM needed); the test FINDS a real leak → that's a SUCCESS for this packet: land the test `it.skip`-ed with `// SKIP(UH.5): leak found, tracked in <new packet>` and file the fix packet with the numbers.
- **Rollback:** revert PR (test-only).
- **Evidence:** the heap-delta numbers from 3 runs pasted in the PR body + CI run link.
- **Model:** Sonnet.

---

## Sequencing summary

```
UH.1 (audit, now) ──→ informs UH.2/UH.3 scope + possible UH.6+ rows
UH.5 (smoke, now) ──→ budget harness for UH.4a/UH.4b
UH.2 ──(after P5a.3)── voice/event-log coverage
UH.3 ──(lane half after P1.1 · rack half after P5a.9–11)
UH.4a ──(after C3 schema + UH.5)──→ UH.4b (after paint surface)
```
