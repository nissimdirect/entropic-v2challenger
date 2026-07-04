# Packets — fx-backspin

**Emitted:** 2026-07-04 by /packetize. **Plan:** `plan.md` (same dir — packets POINT
to its line-anchored normative sections; do not re-derive). **Proposal:**
`proposal.md` (T1 Verdicts LOCKED 2026-07-03 — "Accept all 33 defaults": OD-1(b)
backend-resolve synthetic `_fps`/`_bpm`, OD-2 preset-bank + generic knobs (no new
curve-editor component), OD-3 cascade in `DeviceChain.tsx` via the existing
transaction API — do not re-open any of OD-1/2/3). **Route:** `/eng` Phase 3
(small loop, not marathon — 5 packets, single-effect scope).

**Branching rule (every packet):** cut from `origin/main` only (a parallel UAT
session may own the local checkout — never branch from it). PR-only; squash merge;
no `.github/workflows/**` edits.
**Merge gate (every packet, STRICT FULL-TIER):** full backend pytest
(`cd backend && python -m pytest -x -n auto --tb=short`) + full vitest
(`cd frontend && npx --no vitest run`, main-checkout or CI — worktree executors
cannot run vitest) → `Skill(review)` via Skill tool (ship-gate hook) → full CI
green (incl. e2e-full + sidecar where path-applicable).

**Cross-change constraints checked (per packetize contract):**
- `stores/operators.ts` / `modulation/routing.py` rebase-after-wave0 rule: **N/A**
  — no fx-backspin packet touches either file (verified against §2 file surface
  in plan.md; P4 touches `DeviceChain.tsx`, not `operators.ts`).
- browser-folders' PRESETS-node / multiwindow-stage-a's panel-stub rules: **N/A**
  — fx-backspin has no PresetBrowser or System Monitor surface.
- **fx-afterimage shared `DEPENDENT_PARAMS` registry: APPLIES.** See P1's STOP
  clause below — dedupe against whichever of {fx-backspin, fx-afterimage} lands
  first.
- Every new numeric param ships curve+unit metadata: enforced live by
  `backend/tests/test_effects/test_calibration.py::test_numeric_params_have_unit`
  — baked into P1's hard oracle.

---

### P1 — Backend effect core (`fx.backspin` registration + ring/ADSR logic)
- **Scope:** everything in `plan.md` §1 (normative param table) + §2 "Backend"
  minus the OD-1(b) container/pipeline plumbing (that's P2): new
  `backend/src/effects/fx/backspin.py` implementing `EFFECT_ID = "fx.backspin"`,
  `EFFECT_CATEGORY = "codec_archaeology"`, full `PARAMS` table (`plan.md:12-23`),
  half-res ring record/pop (mirrors `copy_machine.py:882-916`), `_truthy()` bool
  coercion (copied from `copy_machine.py:259-268`, no shared util exists), ADSR
  piecewise curve function (elapsed-frames-since-trigger, state-carried, CPF
  rule — never wall-clock), `stop_mode` dispatch for `frame`/`duration`/`gate`
  (per `plan.md:61-69`) and `tempo` dispatch that reads `params.pop("_bpm", ...)`/
  `params.pop("_fps", ...)` with safe defaults (functions standalone in unit
  tests even before P2 wires real values into the render call site); registry
  edits (`backend/src/effects/registry.py`: import tuple + `phase12_mods` list,
  two edits, `:435-445` / `:457-470`); `DEPENDENT_PARAMS` entries for `spin`,
  `gate`, `stop_frame`, `curve_a/d/s/r` in
  `backend/tests/test_parameter_sweep.py` (`:67`, second occurrence, with
  rationale comments per `:104-135`/`:174-196` format).
- **Non-scope:** OD-1(b) container.py/pipeline.py synthetic-key injection (P2 —
  P1 only *consumes* `_bpm`/`_fps` if present, does not wire them in from a real
  render request); frontend rendering (P3); preset-cascade UI (P4); BDD
  scenarios (P5); modifying `fx.copy_machine` (read-only precedent).
- **Files:** `backend/src/effects/fx/backspin.py` (new, owns fully),
  `backend/src/effects/registry.py` (2-line-range edit — see single-flight map),
  `backend/tests/test_effects/test_backspin.py` (new),
  `backend/tests/test_parameter_sweep.py` (DEPENDENT_PARAMS entries — cross-change
  file, see STOP below).
- **Depends:** none — dispatchable now. **Blocks:** P2 (needs `fx.backspin`
  registered for its own verification test), P3, P4 (soft — integration
  sanity), P5.
- **Risk:** STD. New stateful temporal effect; ring/ADSR logic is genuinely new
  (not copy-paste), but isolated to one new file + additive registry edits.
- **Hard oracle:**
  - `cd backend && python -m pytest tests/test_effects/test_backspin.py -x --tb=short`
    — all new tests pass (file does not exist pre-packet; the FAIL-before proof
    is: `pytest -k backspin` collects 0 tests on main today, ≥6 tests post-packet,
    all green).
  - `pytest -k backspin tests/test_effect_harness.py -v` — `fx.backspin` is
    auto-parametrized into `TestEffectSurvival`, `TestEffectDeterminism`,
    `TestEffectStateful` with zero new harness code; all pass.
    (`test_timing_budget_1080p` is `@pytest.mark.perf`-gated and deselected by
    default per `backend/pyproject.toml:39` — it is NOT part of this packet's
    blocking merge-gate oracle. If perf verification is desired, run it
    explicitly and non-blockingly via `RUN_PERF=1 python -m pytest -m perf
    tests/test_effect_harness.py -k backspin -n 0 -s` per CLAUDE.md's opt-in
    perf-tier convention; note this test only warns, never fails, on budget
    overage.)
  - `pytest tests/test_effects/test_calibration.py -k backspin` — `curve` +
    `unit` present on every one of the 8 numeric params, all `curve` values in
    `VALID_CURVES`.
  - `grep -c "backspin" backend/src/effects/registry.py` == 2 (import tuple +
    `phase12_mods` entry) — proves explicit-import convention followed, no
    orphan list invented.
  - Full `python -m pytest -x -n auto --tb=short` green with ZERO exceptions —
    the wave0 `feedback_amount` unit-metadata fix has already landed (PR #408,
    PR #418; see plan.md §4), so no pre-existing failure is expected. Re-run
    `git log -- backend/src/effects/fx/copy_machine.py` first to confirm
    PR #408/#418 are present; if so, any red in the suite is a fx-backspin
    regression, full stop.
- **Test plan:** backend unit, `backend/tests/test_effects/test_backspin.py`
  (new) covering the 7 acceptance oracles verbatim from `plan.md` §5: ring caps
  + half-res shape, rising-edge-only pulse fire, per-`stop_mode` termination
  boundary (frame/duration/gate; tempo asserted with directly-injected
  `_bpm`/`_fps` params, not via P2's live plumbing), ADSR monotonicity per
  preset (rubber_band's damped-R gets its documented non-monotone-but-bounded
  exception), no-op on empty/insufficient ring (byte-identical assertion,
  mirrors `copy_machine.py:897`'s `and ring` guard), determinism (copied
  frame+state, `TestEffectDeterminism` pattern), resume continuity
  (`state["prev"]` == last popped ring frame). Generic harness + calibration
  suites inherited automatically (zero new code, registry-driven).
- **STOP:**
  - If `test_numeric_params_have_unit` fails at all (any count >0), STOP — the
    wave0 fix is confirmed landed (plan.md §4), so any failure here means a
    fx-backspin param is missing curve/unit metadata; do not paper over it.
  - **DEPENDENT_PARAMS dedupe (fx-afterimage cross-change):** before editing
    `backend/tests/test_parameter_sweep.py`, run
    `git log --oneline -- backend/tests/test_parameter_sweep.py` and
    `grep -n "DEPENDENT_PARAMS" backend/tests/test_parameter_sweep.py`. If
    fx-afterimage's packet already landed and converted the ad-hoc `set` at
    `:67` into a formalized registry module, CONSUME that module (import +
    register fx-backspin's keys through it) — do NOT rebuild the ad-hoc set.
    If fx-backspin lands first, add the 4-key entry as today's plain-set
    convention (no registry module invented) so fx-afterimage's later packet
    has a concrete precedent to either extend or formalize.
  - If `copy_machine.py:770-778`'s exact `apply()` signature has drifted from
    what `plan.md` quotes, STOP and re-verify against current `main` before
    writing `backspin.py`'s signature (parallel sessions may be active).
- **Executor brief:** Sonnet. Inline verbatim: (1) Core Rule 1 — "Read files
  before editing — never Edit without prior Read"; (2) House Landmines
  checklist bullet, `plan.md:107-109` — "Every float/int param declares BOTH
  `curve` and `unit` (empty string `""` is a valid unit)"; (3) Gate 6 —
  "fixing a bug → RUN the failing code first, capture the actual error/stack
  trace... You need the real output" (applies to verifying the pre-existing-red
  count before assuming it's expected). Last line: return PR # + the 5 hard-oracle
  command outputs (pytest -k backspin count, harness pass, calibration pass,
  grep count, full-suite red-count).

### P2 — `tempo_div` plumbing: `_fps`/`_bpm` synthetic keys (OD-1(b)) — **RISK: HIGH**
- **Scope:** OD-1(b) exactly as banked in `proposal.md` (verbatim, do not
  re-derive): extend the `_*` synthetic-key extension point in
  `backend/src/effects/registry.py:10-20` with two new keys, `_fps`/`_bpm`,
  injected by `backend/src/engine/container.py` (precedent: `:58-59`
  `effect_params.pop("_mask", None)` / `pop("_mix", 1.0)`) using values already
  present on every render request (`zmq_server.py:741`
  `message.get("bpm", ...)`, `reader.fps`). Only `fx.backspin` pops them; every
  other registered effect must remain byte-identical (unused pop is a no-op).
- **Non-scope:** `fx.backspin`'s own tempo-dispatch logic (already written in
  P1, standalone-functional with param defaults); any change to the operator/
  Signal-Engine BPM path (`zmq_server.py:739-751`) beyond reading the value
  that's already extracted there.
- **Files:** `backend/src/engine/container.py` (near `:58-59`),
  `backend/src/engine/pipeline.py` and/or `backend/src/zmq_server.py` (render
  call site, `:741` already extracts `bpm` — exact file TBD by executor,
  confirm which one owns the `apply_chain` call before editing).
- **Depends:** P1 (registered `fx.backspin` target needed for this packet's own
  verification test). **Blocks:** none downstream (P4/P5 don't need tempo
  plumbing to be correct, only present).
- **Risk:** **HIGH** → Opus-tier executor + mandatory `/qa-redteam` before merge
  (shared container/pipeline code on the hot path of all 220 registered
  effects — any mistake regresses everything, not just backspin).
- **Hard oracle:**
  - Full `cd backend && python -m pytest -x -n auto --tb=short` green — this
    IS the regression proof for the other 220 effects (byte-identical output,
    since an unused `.pop()` is a no-op by construction; if any non-backspin
    effect's test changes shape, that's a fail).
  - New test (`backend/tests/test_engine/test_synthetic_params.py` or
    extend the closest existing container test): render request with
    `stop_mode=tempo` on `fx.backspin` → assert `_bpm`/`_fps` values reach
    `apply()`'s `params` dict matching the request's `bpm`/`reader.fps`; render
    request on ANY other effect (e.g. `fx.copy_machine`) → assert its
    `params` dict has NO `_bpm`/`_fps` keys (byte-identical to pre-packet
    behavior) — this test must FAIL on pre-packet `main` (the keys don't exist
    yet) and PASS after (anti-dead-flag).
  - `test_timing_budget_1080p` is `@pytest.mark.perf`-gated and deselected by
    default (`backend/pyproject.toml:39`); it is NOT part of this packet's
    blocking `pytest -x -n auto --tb=short` gate and, being warn-only on
    overage (`test_effect_harness.py:224-229`), cannot serve as P2's
    regression proof by itself — the byte-identical full-suite run above is
    the real gate. If a timing spot-check is desired, run it explicitly and
    non-blockingly via `RUN_PERF=1 python -m pytest -m perf
    tests/test_effect_harness.py -k "backspin or copy_machine" -n 0 -s` for
    `fx.backspin` and a spot-check of 2 other effects.
- **Test plan:** backend unit/integration — the new synthetic-params test above
  (unit-tier on `container.py`'s injection function) + an integration-tier
  render-request round-trip through `apply_chain` (justify E2E-adjacent: this
  is the actual production call path, not a mock).
- **Trust-boundary rule:** the REAL boundary for `bpm`/`fps` values is the
  render request already validated at `zmq_server.py:739-751`
  (`clamp_finite(message.get("bpm", 120.0), 1.0, 999.0, 120.0)`) — P2 must
  consume that ALREADY-CLAMPED value at the container injection point, not
  re-validate raw `message` fields itself (would be a second, divergent
  trust boundary).
- **STOP:**
  - If injecting `_fps`/`_bpm` requires touching more than the two named
    files (container.py + one call-site file), STOP and report — scope
    contamination into unrelated engine code is out of bounds for this packet.
  - If ANY non-backspin effect's existing test output changes (not just a new
    key silently present but ignored), STOP immediately — that means the pop
    isn't actually a no-op and the byte-identity assumption in `proposal.md`
    OD-1(b) has failed; do not "fix" by suppressing the test.
- **Executor brief:** Opus-tier. Inline verbatim: (1) OD-1(b) decision text —
  "Extend the documented extension point in `backend/src/effects/registry.py:10-20`
  ... with two new keys, `_fps`/`_bpm` ... Only `fx.backspin` pops `_fps`/`_bpm`;
  the other 220 effects are byte-identical (they never look for those keys; an
  unused pop is a no-op)"; (2) Gate 13 (Trace Path) — "grep for the setter/action
  name across ALL files... Read every function in the chain... Fix the actual
  bottleneck"; applied here as: trace `bpm`/`fps` from `zmq_server.py:741` →
  `container.py` injection → `apply()` params, and cite the chain in a comment
  before the fix; (3) Core Rule 1 — read before edit. Last line: return PR # +
  full-suite pass/fail summary + the byte-identity test's before/after output.

### P3 — Frontend param rendering + trigger-lane verification (no new code expected)
- **Scope:** verification-only packet per OD-2's banked default (generic
  rendering, no new component): confirm `fx.backspin` appears in EffectBrowser
  once P1 registers it; confirm all 8 numeric params (`stop_frame`,
  `duration_s`, `curve_a/d/s/r`, `ring_frames`, `mix`) render via the
  ALREADY-GENERIC `ParamPanel.tsx` → `Knob.tsx` path with zero per-effect code;
  confirm `stop_mode`/`tempo_div`/`preset` render via `ParamChoice.tsx`;
  confirm `spin`/`gate` (bool params) appear ONLY in the trigger-lane
  automation picker (`AutomationToolbar.tsx:214-227`'s `isBool` → `boolOnly`
  logic, `:388` `gate` `TriggerMode`), never the continuous-lane picker — same
  generic mechanism that shipped copy_machine's `freeze`/`rewind` in `a66794f`.
- **Non-scope:** building any new UI component (OD-2 explicitly rejected this
  for v1 — a draggable ADSR curve editor is a later-wave item, NOT this
  packet); the preset-cascade special-case (P4).
- **Files:** none owned — this is a verification-only packet. If the generic
  mechanism has a real gap (e.g. `spin`/`gate` leak into the continuous
  picker), the fix packet is scoped fresh, not absorbed silently here.
- **Depends:** P1 (needs `fx.backspin` registered so the app can actually
  render it). **Blocks:** none.
- **Risk:** LOW.
- **Hard oracle:** manual + automated check: launch the app
  (`cd frontend && npm start`), add `fx.backspin` to a chain, screenshot the
  device card showing all params rendered; automated Vitest assertion (see
  Test plan) that the trigger-lane picker's `boolOnly` filter includes
  `spin`/`gate` and the continuous-lane picker excludes them.
- **Test plan:** frontend component (Vitest, mock IPC) — extend or add
  `AutomationToolbar.test.tsx` (or the closest existing picker test): assert
  `fx.backspin`'s `spin`/`gate` are present in `pickerMode === 'trigger'`
  results and absent from continuous-lane results (this is a schema-
  registration regression test, not new picker logic — must FAIL if
  `fx.backspin` is unregistered or its params aren't declared `type: 'bool'`).
- **UAT journey:** open EffectBrowser → drag `fx.backspin` onto a track →
  device card shows `stop_mode` choice, 6 knobs, `preset` choice, `spin`
  button; open automation lane picker for that instance → `spin`/`gate`
  appear under trigger targets only. Pixel-verify the device-card render with
  `--cx-*` design tokens (no raw hex) per the hex-ratchet CI convention.
- **STOP:** if `spin`/`gate` DO leak into the continuous-lane picker, STOP —
  that is a real regression in shared automation code, not a fx-backspin
  scope item; file it separately rather than patching `AutomationToolbar.tsx`
  inside this verification packet.
- **Executor brief:** Sonnet. Inline verbatim: (1) OD-2 recommended default —
  "ship `curve_a`/`curve_d`/`curve_s`/`curve_r` as four plain numeric params...
  rendered through the ALREADY-GENERIC `ParamPanel.tsx` → `Knob.tsx` path (no
  new component)... A draggable ADSR curve overlay is a later-wave item,
  tracked but not built here"; (2) Gate 15 (Research Gate) explicitly does NOT
  fire here — no new interactive component is being built, confirm this
  before considering any custom control; (3) hex-ratchet UAT rule — pixel-verify
  via `--cx-*` tokens, never raw hex. Last line: return screenshot paths +
  Vitest pass/fail for the picker-filter assertion.

### P4 — Preset → curve cascade (OD-3)
- **Scope:** exactly OD-3 as banked in `proposal.md`: on `preset` param change
  to a value `!== 'custom'`, cascade-write all 4 `curve_a/d/s/r` params + the
  `preset` value itself as ONE atomic operation using the transaction API
  (`frontend/src/renderer/stores/undo.ts:127-186` `beginTransaction`/
  `commitTransaction` — live but currently unused by any caller, this is the
  first real caller); on any `curve_*` param edit while `preset !== 'custom'`,
  cascade `preset → 'custom'` in the SAME transaction (2-entry, still one
  Ledger row). Preset curve values are the ones quoted verbatim in `plan.md`
  §1: `hard_cut` A0 D0 S1 R0, `long_brake` A.05 D.3 S.6 R.6, `rubber_band`
  A.1 D.2 S.8 R.3 (+damped R-phase oscillation), `tape_stop` A0 D.8 S.2 R.9.
- **Non-scope:** a generic `ParamDef.cascades` schema field (proposal.md
  explicitly rejects this — "scope the special-case to this one effect");
  any change to `beginTransaction`/`commitTransaction` themselves (consume as-
  is; if they have a latent bug, that's a STOP, not an in-packet fix).
- **Files:** `frontend/src/renderer/components/device-chain/DeviceChain.tsx`
  (`handleUpdateParam`, `:297-302` — add the `effectId`-type-keyed special
  case), plus its new/extended test file.
- **Depends:** P1 (soft — for full-stack integration sanity; the cascade logic
  itself is a hardcoded `effectType === 'fx.backspin'` check and can be built/
  tested with mock IPC before P1 merges, but do not merge P4 ahead of P1).
  **Blocks:** none.
- **Risk:** STD. New per-effect special-case; the transaction API is
  live-but-previously-unused, so this is the first real exercise of
  `beginTransaction`/`commitTransaction` — verify no dormant bugs there before
  trusting it.
- **Hard oracle:**
  - Selecting a `preset` (e.g. `long_brake`) writes `curve_a/d/s/r` + `preset`
    in exactly ONE undo-store entry: `useUndoStore.getState().past` length
    delta == 1, `.description === "Set backspin preset: long_brake"`.
  - Editing any `curve_*` while `preset !== 'custom'` cascades `preset` to
    `'custom'` in the SAME entry (delta == 1, both fields changed).
  - Undo of either operation restores all 5 fields atomically (assert full
    param snapshot equality before/after undo).
  - This test must FAIL on pre-packet `main` (no cascade exists today — plain
    `dispatchChain().updateParam()` writes one param per Ledger row) —
    anti-dead-flag proof required in the PR body.
- **Test plan:** frontend component (Vitest, mock IPC), new
  `frontend/src/renderer/components/device-chain/backspin-preset-cascade.test.tsx`
  covering the 3 oracle bullets above.
- **STOP:** if exercising `beginTransaction`/`commitTransaction` surfaces a
  latent bug in the transaction API itself (e.g. nested transactions, partial
  commit on error), STOP and report — fixing `undo.ts` is out of this
  packet's file-ownership scope; file it as its own bug/packet.
- **Executor brief:** Sonnet. Inline verbatim: (1) OD-3 decision text —
  "Wrap the multi-param preset-apply in the ALREADY-LIVE (but currently
  unused-by-any-caller) transaction API... so 'Set backspin preset: long_brake'
  lands as ONE Ledger row, not 5. Do NOT add a generic `ParamDef.cascades`
  schema field"; (2) Gate 14 (Wiring Check) — "verify... All callbacks trigger
  the expected side effects... Entry AND exit paths work (select AND deselect)"
  — applied as: preset-select AND curve-edit-while-non-custom are both entry
  paths, undo is the exit path, test all three; (3) History Ledger rule —
  "every new user-visible op" needs a specific `undoable()` description, not a
  generic one. Last line: return PR # + the failing-then-passing test output
  for the anti-dead-flag proof.

### P5 — BDD scenarios + docs follow-up flag
- **Scope:** author `Feature: fx.backspin` BDD scenarios mirroring the
  acceptance oracles in `plan.md` §5 (ring caps, rising-edge pulse, per-
  `stop_mode` termination, ADSR monotonicity, no-op on empty ring,
  determinism, resume continuity, preset cascade atomicity) in whatever format
  the sibling BDD suite uses (reference format:
  `~/.claude/plans/creatrix-moire-generator-bdd.md`-style, location TBD by
  whoever owns that convention in this repo — confirm the actual directory via
  `find . -iname '*.feature'` or the sibling suite's location before creating
  a new one).
- **Non-scope:** writing NEW acceptance criteria not already stated in
  `plan.md` §5 — Hard Rule #3 forbids inventing normative contract text; if a
  scenario needs a criterion `plan.md` doesn't state, STOP and ask rather than
  fabricate.
- **Files:** new BDD feature file (path determined by executor's convention
  search, documented in the PR body).
- **Depends:** P1, P2, P4 (scenarios reference behavior all three implement;
  written accurately only once the behavior exists — but can be drafted in
  parallel and merged last).
- **Risk:** LOW.
- **Hard oracle:** scenario file reviewed 1:1 against `plan.md` §5's 7
  acceptance oracles + P4's 3 cascade oracles — every oracle bullet has a
  corresponding scenario, no scenario invents behavior absent from `plan.md`
  or `proposal.md`.
- **Test plan:** none new (docs artifact) — if the repo's BDD convention
  includes a runner (e.g. `behave`/`pytest-bdd`), wire the scenarios to the
  SAME test functions written in P1/P4 rather than duplicating assertions.
- **STOP:** if no sibling BDD suite/convention is actually findable in the
  repo (contradicting the "sibling suite" reference in `plan.md`), STOP and
  report — do not invent a new BDD framework/location unilaterally.
- **Executor brief:** Sonnet. Inline verbatim: (1) Hard Rule #3 (plan.md
  quoting it) — "Hard Rule #3 forbids inventing normative contract text";
  (2) Core Rule 3 — "Do what was asked, nothing more — no bonus features".
  Last line: return the feature-file path + a table mapping each scenario to
  its `plan.md`/P4 oracle source line.

---

## Single-flight map
| File | Packets | Order |
|---|---|---|
| `backend/src/effects/registry.py` | P1 only | n/a (single owner) |
| `backend/tests/test_parameter_sweep.py` | P1 (this change) + fx-afterimage (cross-change) | whichever change lands first builds the entry format; the other consumes/extends per P1's dedupe STOP |
| `backend/src/engine/container.py`, `pipeline.py`/`zmq_server.py` | P2 only | n/a (single owner) |
| `frontend/src/renderer/components/device-chain/DeviceChain.tsx` | P4 only | n/a (single owner) |

No two fx-backspin packets touch the same file — no in-change serialization
required beyond the dependency edges already stated per packet.

## Coverage check (plan.md + proposal.md → packets)
- Normative param table + core semantics (ring, ADSR, no-op guard, resume
  continuity, dropped-frames-during-spin) → **P1**.
- OD-1 tempo/BPM plumbing (accepted default (b)) → **P2**.
- OD-2 preset-bank + generic-knobs UI (accepted default, no new component) →
  **P3** (verification that the generic path renders it correctly).
- OD-3 preset↔curve cascade + transaction wiring (accepted default) → **P4**.
- House Landmines checklist (curve+unit, `VALID_CURVES`, `_` prefix guard,
  explicit-import registry, alpha/RGB split, cv2 hygiene, Ledger rows,
  preview==export parity, additive schema) → **P1** (backend bullets) + **P4**
  (Ledger/transaction bullet).
- Pre-existing `feedback_amount` red (§4, not this change's regression) →
  handled as a P1 oracle/STOP note, not a fix packet (explicitly out of
  file-ownership scope per `plan.md`).
- Backend unit/harness/calibration test plan (§5) → **P1**. Frontend
  component tests (cascade, automation picker) → **P4** (cascade) + **P3**
  (picker). BDD scenarios (§5, flagged as follow-up) → **P5**.
- Non-Goals from `proposal.md` (fx.afterimage, SG-8 pressure-registry
  integration, bespoke pulse-button UI, per-instance System Monitor display,
  draggable ADSR curve editor, modifying fx.copy_machine) → **explicitly
  descoped by the proposal itself** — no packet covers them; nothing silently
  narrowed beyond what T1 already locked.

Nothing in `plan.md` or `proposal.md` is uncovered or silently narrowed.

## Ledger
| Packet | Status | PR | Oracle evidence |
|--------|--------|----|-----------------|
| P1 | ⬜ | — | — |
| P2 | ⬜ | — | — |
| P3 | ⬜ | — | — |
| P4 | ⬜ | — | — |
| P5 | ⬜ | — | — |
