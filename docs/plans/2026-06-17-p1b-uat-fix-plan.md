---
title: Creatrix UAT Fix-Plan — P1-B v2-Compositing-Guard Regression + Latent Siblings + Coverage + UX Papercuts
status: completed (all 6 packets shipped 2026-07-02 — P1-P3 via month-audit F1 #323, P4 #338, P5 #337, P6 #336)
created: 2026-06-17
source: docs/UAT-RESULTS-2026-06-17.md (12/12 UAT) + ultracode audit workflow wf_8299a75d-998 (5 agents)
---

# Creatrix UAT Fix-Plan (2026-06-17)

## Summary

P1-B is a **cross-PR cohesion gap**. PR #189–191 (Decision D1 "clean break") added a backend
render-time guard `_is_v2_compositing_shape` (`backend/src/zmq_server.py:1218-1258`, called at
`:1423`) that rejects the **entire preview render** with the misleading toast
`"v2 projects unsupported — start a new project"` (`schema.py:17`) for any `layer_type:'video'`
layer carrying top-level `opacity`/`blend_mode` where the chain is either:
- **(a) empty** — the empty-chain branch (`:1248-1253`) rejects video layers (its docstring claims
  the opposite; the code is intentional per the HT-2 red-team comment), or
- **(b) non-empty without a terminal `composite` effect**.

The **instrument/rack voice-layer builders were never migrated** off the pre-v3 top-level-field shape:
- `computeSamplerVoice.ts:322-329` emits `{layer_type:'video', chain:[], opacity, blend_mode}` →
  rejected by the empty-chain branch. **This is the layer my plain-sampler UAT repro hit** (puzzle solved).
- `buildRackLayers.ts:162-175` emits `{video, chain: pad.chain, opacity, blend_mode, no terminal composite}`
  → rejected the instant a user adds **any** effect to a rack pad's insert chain (a shipped, user-reachable feature).

**Export bypasses the guard** (`export.py` feeds `render_composite` directly), so the same project
**exports fine but preview fails** — a preview/export parity gap.

### Architectural decision (resolved by the audit)
**Fix at the backend guard (voice-marker exemption), NOT by re-architecting the frontend builders.**
Reason, confirmed from code: the compositor reads `opacity`/`blend_mode` from **top-level fields**
(`zmq_server.py:1630-1633`), not from a terminal composite on a voice layer. So the frontend
"route opacity/blend through a terminal composite" approach would silently render every instrument
at wrong opacity/blend and break export parity, and would require a larger backend compositor+export
read-path slice first. Exempting voice layers at the guard fixes preview with **zero builder changes**
and keeps preview==export. (Frontend unification onto one v3 terminal-composite contract is a possible
future roadmap item — see Open Questions.)

### Why the 3,247-test suite missed it
Both sides pass against **mismatched assumptions**: backend `test_ht2`
(`test_composite_render_terminal.py:433`) exempts `layer_type:'sampler'` which the frontend **never
sends** (it sends `'video'`, `types.ts:150`); frontend `buildRackLayers.test.ts:184` only ever tests
**empty chains** and its comment encodes the stale pre-v3 contract. No test feeds a real
pad-with-chain (or any instrument-voice-with-chain) through the actual frontend-shape → backend
`render_composite` path.

---

## Packets (sequenced)

### P1 — Fix P1-B core: backend voice-marker exemption  · priority P1 · effort S · depends: none
Unblocks the two ⏸ UAT areas (Area 2 Sampler trigger, Area 7 Freeze FSM).

- [x] **STEP 0 (reproduce-before-fix, runtime gate):** add a one-line log of `layer_info`
  (type/chain-length/has-opacity/voice_id/layer_id) immediately before the
  `_is_v2_compositing_shape(layer_info)` call at `zmq_server.py:1423`; rebuild/restart the sidecar;
  reproduce **(a)** Sampler-on-perf-track triggering a voice alongside a clip with a non-empty chain,
  and **(b)** a Sample Rack pad WITH a per-pad insert chain triggering; read `~/.creatrix/logs/sidecar.log`
  to confirm the rejected layer is the **voice layer** (not the clip) and matches the predicted shape.
  Then **remove the temporary log**.
- [x] **STEP 1:** in `_is_v2_compositing_shape`, add a positive voice-marker early-return —
  `voice_id` present OR `layer_id` starts with `voice:`/`framebank:` → `return False`.
- [x] **STEP 2:** relax the empty-chain branch (`:1248-1253`) so an empty-chain video layer is **not**
  auto-rejected (required because the silent-track fallback `buildSamplerLayer.ts:30-41` emits **no**
  `voice_id`). A real v2 clip still rejects: clips carry no voice marker AND send `clip_opacity`
  (not top-level `opacity`), so a marker-less video clip with non-empty chain + top-level
  opacity/blend + no terminal composite still hits `:1254-1258`.
- [x] **STEP 3:** correct the stale docstring (`:1219-1238`) to match the new code.
- **NO frontend builder changes.** Compositor already reads top-level opacity/blend (`:1630-1633`).
- **Files:** `backend/src/zmq_server.py`, `backend/src/project/schema.py`, `backend/src/security.py`
- **Acceptance:** sampler voice (video, voice_id, opacity/blend, empty chain) → ok:true · rack-pad voice
  (non-empty pad.chain, no terminal composite) → ok:true · silent-track fallback (no voice_id, empty chain)
  → ok:true · **genuine v2 clip (no voice marker, non-empty chain, top-level opacity/blend) still ok:false**
  (`test_composite_render_terminal.py:290` stays green) · `schema.py:174-175` load-time v2 reject unchanged
  (`test_schema.py` green; sidecar-no-restart test `:318` green) · voice opacity/blend visually honored;
  preview==export.
- **Risk:** Low. Real v2 files blocked at load (`schema.py:174-175` is the real gate; this render guard
  is defense-in-depth); clips carry no voice marker. Residual: a forged `voice_id` on a v2 clip — harmless
  (already rejected at load).

### P2 — Close latent P1-B siblings  · priority P1 · effort S · depends: P1
- [x] (1) Ensure the P1 voice-marker exemption recognizes **rack-group leaf voices** (`voice:`-prefixed);
  add a unit test asserting a group-leaf voice dict → `False`.
- [x] (2) **Rewrite `V2_UNSUPPORTED_MESSAGE`** (`schema.py:17`) so it no longer tells a valid-v3-project
  user to "start a new project"; sweep for the literal string first, update the rejection-path assertions.
- [x] (3) Add a defensive comment + regression test pinning that **frame-bank** (`zmq_server.py:~1718`) and
  **granulator** (`~1909`) voice layers return `False` from the guard (today they're safe only by
  append-order, not by design). **Do NOT move the guard relative to the appends.** **Do NOT broaden the
  guard to non-video layers** — `composite_tree.py:259-262,317-320` deliberately reads top-level
  opacity/blend for rack-branch group children.
- **Files:** `zmq_server.py`, `schema.py`, `engine/composite_tree.py`, `engine/frame_bank.py`
- **Note:** may ride in the **same PR as P1** (same function + message constant).

### P3 — Regression coverage for the P1-B class  · priority P1 · effort M · depends: P1
- [x] NEW `backend/tests/test_instrument_voice_composite_regression.py` (`pytestmark = smoke`):
  - **(A) handler-gate** (`_handle_render_composite`, mirror `:213`): instrument/rack/group voice shapes
    (video + top-level opacity/blend + non-empty chain + voice marker) → ok:true; **false-positive guard**:
    clip layer with chain + `clip_opacity` (no voice marker) → ok:true; genuine v2 clip → ok:false.
  - **(B) end-to-end IPC** (`zmq_client` + `synthetic_video_path`, mirror `:358`): rack-pad-shape voice +
    real asset + `fx.invert` → ok:true and `frame_data` decodes to JPEG (`raw[:2]==b'\xff\xd8'`).
  - **(C) pixel oracle:** decode source frame + rendered output, assert they **DIFFER** (deterministic
    `fx.invert`, byte/hash inequality — not an exact value). Parametrize across flat-sampler / rack-pad / group-leaf.
- [x] AMEND `frontend/src/__tests__/components/instruments/buildRackLayers.test.ts`: add a **pad-WITH-chain**
  case asserting the emitted layer is v3-contract-acceptable (carries a voice marker → exempt); replace the
  stale lines 12-13 comment with the v3 contract.
- [x] Annotate backend `test_ht2` (`:433`) that `layer_type:'sampler'` is not a production shape (frontend sends `'video'`).
- **Land as RED guards** that flip green when P1 lands — **never skip/xfail-permanent.** Prefer same PR as P1.

### P4 — Layout cramping: bound the device-editor region  · priority P2 · effort S · depends: none
- [x] Base grid (default; `F_CREATRIX_LAYOUT` off): give `.app__device-chain` (`global.css:206`) a
  `max-height` + `overflow-y:auto`, OR change base row 3 from `auto` → `minmax(0, <cap>)` so the `1fr`
  preview can't collapse. **Prefer the wrapper/overflow approach** (MEMORY `feedback_test-layout-changes`
  warns against editing root `grid-template-rows`).
- [x] Creatrix-flag path: add `overflow-y:auto` to `creatrix-layout.css:70-75` so the fixed-height device
  editor scrolls internally instead of clipping.
- **Verify in BOTH flag states** in the running Electron app. Test: Playwright `_electron` (preview has
  non-zero height; device region scrollable/bounded).
- **Files:** `global.css`, `creatrix-layout.css`, `instruments.css`

### P5 — Color Invert "no-op" is a unit-label bug  · priority P2 · effort S · depends: none
Default is **1.0 = full invert** (`color_invert.py:17-26`) — NOT ~1%. The defect: `unit:'%'` on a 0..1
param with no ×100 in the formatter → renders `"1.00%"`, which reads as one percent.
- [x] Fix the **shared** formatter (`Slider.tsx:95`, `ParamLabel.tsx:14`, `Knob.tsx:207`) to render a param
  whose `unit==='%'` AND `max<=1` as `Math.round(value*100)+'%'` → `"100%"`.
- [x] **MANDATORY PRECONDITION:** sweep **every** `%`-unit param in the backend registry; if any already uses
  a 0–100 range, the `max<=1` guard must exclude it (no double-scale). Fall back to backend-only
  `color_invert.py:24` `unit:'%'→''` only if the sweep finds the shared change unsafe.
- Test: vitest formatter (1.0 → "100%"; 0–100 `%` param unchanged; non-`%` unchanged).

### P6 — Stray empty track on clip select  · priority P3 · effort S · depends: none
`Clip.tsx` has **no drag-distance threshold**: `upHandler` always runs the new-track check
(`:375-413`); a pointerup slightly below the last lane (`belowAllTracks`, `:389`) calls `addTrack` +
`moveClip`, and `moveClip` doesn't prune the emptied source track.
- [x] Add a **>4px drag threshold** in `Clip.tsx`; only run the below-lane/drop-zone new-track logic
  (`:398`) on a real drag. A pure click/select must never reach it. Keep the explicit drop-zone path
  (`Timeline.tsx:330-336`) and legitimate drag-to-new-track working.
- [x] **Reproduce the exact UAT gesture before merging** (mechanism code-confirmed; gesture lower-confidence).
- Test: vitest — `<4px` pointerup does NOT call `addTrack`; below-lane after a real drag DOES.

---

## Sequencing

1. **P1 first, alone** (own branch/PR) — gates the two ⏸ UAT areas; highest-value, lowest-risk. STEP 0
   runtime-confirm must match the code prediction before the fix is applied.
2. **P2** (same root class) — may bundle into P1's PR (same function + message constant).
3. **P3** (coverage) — author RED, flips green with P1; same PR as P1 preferred. Frontend amendment rides here.
4. **P4 / P5 / P6** (UX papercuts) — independent of P1-B and of each other (CSS / shared formatter / `Clip.tsx`),
   zero file overlap with the backend slice → parallelizable as separate branch+PRs. P5 and P6 each have a
   mandatory precondition before merge (registry `%`-sweep; reproduce the gesture).

**Campaign rules:** each packet on its own feature branch + PR; squash-merge `--delete-branch`; CI green
(smoke + electron-e2e where path-applicable + sidecar for backend packets); **no** packet touches
`.github/workflows/**`; **executors never self-merge** — open PR + run per-packet verification, leave merge
to user/orchestrator. Every code change ships with a persistent test.

## Open questions (for the user)
1. **P2 message copy:** approved new wording for `V2_UNSUPPORTED_MESSAGE` distinguishing the genuine
   load-time v2-file path from the (now-fixed) render-time false-reject?
2. **P5:** does any `%`-unit registry param already use a 0–100 range (the `max<=1` guard must exclude it)?
   The sweep answers this; else fall back to the backend-only `color_invert.py` edit.
3. **Frontend terminal-composite unification** (deferred): keep the backend voice exemption as the permanent
   contract for voice layers, or pursue a future v3 unification of clips+instruments (needs a backend
   compositor+export read-path slice first)?
4. **Separate latent (not in scope):** per-**instrument** (non-rack) sampler export hardcodes `chain:[]`
   (`App.tsx:2729,2763`) while per-**pad** export serializes `pad.chain` (`:2854`) — non-rack sampler insert
   chains may be **dropped on export**. Worth a follow-up audit (confirm non-rack sampler instruments even
   support insert chains first).

---
*Audit basis: 12/12 UAT (`docs/UAT-RESULTS-2026-06-17.md`) + ultracode workflow wf_8299a75d-998 — 4 parallel
investigators (P1-B frontend, P1-B backend, minor+latent sweep, test-gap) + synthesis. P1-B fully pinned from
code; no runtime log strictly required (STEP 0 is a reproduce-before-fix gate, not a discovery step).*
