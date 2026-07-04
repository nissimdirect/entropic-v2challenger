# Plan — fx.backspin

> Read `proposal.md` first — Open Decisions OD-1..OD-3 gate parts of packet 2 below.
> Everything in this file is implementer-ready: code-cited file:line, no re-derivation
> needed for the normative contract (param table reproduced verbatim from the source
> spec).

## 1. Normative contract — param table (verbatim, `~/.claude/plans/creatrix-backspin-afterimage-spec.md:22-40`)

> Every numeric gets curve+unit; temporal ones join DEPENDENT_PARAMS.

| param | type | range / options | default | notes |
|---|---|---|---|---|
| `spin` | bool (pulse lane) | — | false | trigger-lane target (one-shot/gate); rising edge fires; `_truthy` |
| `stop_mode` | choice | `frame` · `duration` · `tempo` · `gate` | `duration` | routing PRD decision 18 |
| `stop_frame` | int | 0–`ring_frames` | 0 | frame-selector; active when stop_mode=frame AND frames available; 0 = full ring |
| `duration_s` | float | 0.1–4.0 s | 0.8 | stop_mode=duration |
| `tempo_div` | choice | 1/4 · 1/2 · 1 · 2 · 4 bars | 1 | stop_mode=tempo; uses project BPM; cycles-per-frame conversion at the automation layer (CPF rule — never Hz in the effect) — see proposal.md OD-1 |
| `gate` | bool (lane) | — | false | stop_mode=gate: spin runs while the drawn binary lane is high; release = resume |
| `curve_a`,`curve_d`,`curve_s`,`curve_r` | float | 0–1 each | preset-driven | ADSR over the spin: A=snatch-up time, D=fall to sustain speed, S=sustain speed level, R=brake tail into resume |
| `preset` | choice | `hard_cut` · `long_brake` · `rubber_band` · `tape_stop` · `custom` | `long_brake` | writing any curve_* flips to custom — see proposal.md OD-3 |
| `ring_frames` | int | 12–90 | 45 | memory-bounded (half-res store, SG8 valves — see proposal.md Non-Goals) |
| `mix` | float | 0–1 | 1.0 | standard |

Preset curves (recommendations, user-tunable — verbatim, spec lines 35-40):
- `hard_cut` A0 D0 S1 R0 — instant full-speed reverse, instant stop.
- `long_brake` A.05 D.3 S.6 R.6 — classic decelerating platter.
- `rubber_band` A.1 D.2 S.8 R.3 + one overshoot oscillation on resume (implemented
  as a damped half-cycle on R).
- `tape_stop` A0 D.8 S.2 R.9 — long sagging brake.

### Semantics that must not drift (verbatim, spec lines 42-52)
- Empty/insufficient ring → pulse is a NO-OP (no crash, no blank) — copy_machine
  rewind precedent, tested.
- While spinning, the effect emits ring frames; input frames during the spin are
  DROPPED from recording (platter model), so back-to-back spins replay the same
  material — intentional, it's how DJs do doubles.
- Resume re-seeds from the landed frame; state seeded + sequential (datamosh-class
  scrub caveat, stated).
- stop_mode=frame with an empty selector falls back to duration (validator clamps).
- Sweep registry: `spin`, `gate`, `stop_frame`, `curve_*` are DEPENDENT_PARAMS
  (temporal/state; frame_index=0 no-ops) — register at implementation time (see §5).

## 2. Code-grounded file surface

### Backend (new file + 2 registration edits)
- **NEW** `backend/src/effects/fx/backspin.py` — `EFFECT_ID = "fx.backspin"`,
  `EFFECT_CATEGORY = "codec_archaeology"`, `PARAMS` per §1, `apply(frame, params,
  state_in=None, *, frame_index, seed, resolution)` matching the exact signature
  precedent at `backend/src/effects/fx/copy_machine.py:770-778`.
  - Ring mechanics: half-res record/pop exactly like
    `copy_machine.py:882-916` (`cv2.resize(..., interpolation=cv2.INTER_AREA)` to
    store, `cv2.INTER_LINEAR` to restore) — reuse the pattern, do not invent a new
    one. `ring_frames` (12–90) replaces copy_machine's hardcoded `_RING_MAX = 36`.
  - `_truthy()` bool coercion: copy exact helper from `copy_machine.py:259-268`
    (module-private, no shared util exists to import — confirmed by grep, every
    effect that needs it currently duplicates it locally).
  - ADSR curve evaluation: new pure function, no engine dependency — a monotone
    A→D→S→R piecewise curve over the spin's elapsed-frames-since-trigger counter
    (carried in `state`, not wall-clock — CPF rule).
  - `stop_mode` dispatch: `frame` reads `stop_frame` (clamp to
    `min(stop_frame, len(ring))` — this IS the "empty selector falls back to
    duration" validator clamp called out in §1); `duration` converts `duration_s`
    to a frame count via `state`-carried elapsed count (no fps needed — count
    frames, not seconds, exactly like copy_machine counts `generation` in
    frame-domain units); `tempo` — **blocked on proposal.md OD-1**, pops `_bpm`/
    `_fps` synthetic keys (only if OD-1(b) is picked) or receives a pre-resolved
    frame-count-equivalent (if OD-1(a)); `gate` reads the `gate` bool directly
    (same `_truthy` path as `spin`) — high = spinning, falling edge = resume.
- **EDIT** `backend/src/effects/registry.py`: add `backspin` to the explicit
  `from effects.fx import (...)` block and to `phase12_mods` (the canonical home
  for new fx-style effects per the `test_no_orphan_module_lists` guard documented
  at `:425-430` — do NOT invent a new list name). Two edits: the import tuple
  (near `:435-445`) and the `phase12_mods` list (`:457-470`).
- **EDIT (conditional on OD-1(b))** `backend/src/engine/container.py` (near
  `:58-59`) + `backend/src/engine/pipeline.py`/`zmq_server.py` render call site
  (`:741` already extracts `bpm`) to inject `_fps`/`_bpm` synthetic keys per the
  `_mix`/`_mask` precedent — additive, only consumed by `fx.backspin`.

### Frontend
- **No new component required** for `spin`/`gate` (bool params auto-appear as
  TRIGGER-only automation targets — generic logic already in
  `frontend/src/renderer/components/automation/AutomationToolbar.tsx:214-227`,
  `const isBool = def.type === 'bool'` → `boolOnly: true`; confirmed live via the
  `a66794f` commit that shipped this for copy_machine's `freeze`/`rewind`). The
  `gate` stop-mode's "drawn binary lane" is the SAME `TriggerMode: 'gate'` value
  already wired at `AutomationToolbar.tsx:388` (`const defaultTriggerMode:
  TriggerMode = 'gate'`) → stored as `AutomationLane.mode: InterpolationMode`
  (`frontend/src/shared/types.ts:448,492`, value `'gate'` — spells identically in
  both the `TriggerMode` and `InterpolationMode` unions, no translation needed for
  this specific value; NOTE for implementer: `TriggerMode`'s `'one-shot'` and
  `InterpolationMode`'s `'oneShot'` do NOT spell identically — irrelevant to
  backspin's `gate` case but flag if touching `spin`'s one-shot wiring).
- Numeric params (`stop_frame`, `duration_s`, `curve_a/d/s/r`, `ring_frames`,
  `mix`) render for free through `frontend/src/renderer/components/effects/ParamPanel.tsx`
  → `Knob.tsx` (generic, no per-effect code). `stop_mode`, `tempo_div`, `preset`
  render for free through `ParamChoice.tsx` (`frontend/src/renderer/components/effects/ParamChoice.tsx`).
- **EDIT** `frontend/src/renderer/components/device-chain/DeviceChain.tsx`
  (`handleUpdateParam`, `:297-302`): add the preset-cascade special-case per
  proposal.md OD-3 — on `preset` change (≠ `custom`), `beginTransaction("Set
  backspin preset: <name>")` then 5× `dispatchChain().updateParam(...)` (curve_a/
  d/s/r + preset) then `commitTransaction()` (`frontend/src/renderer/stores/undo.ts:127,135`);
  on any `curve_*` change while the effect's own `preset !== 'custom'`, cascade
  `preset → 'custom'` in the SAME transaction (2-entry, still one Ledger row).

## 3. House Landmines checklist (apply to every param in §1)
- [ ] Every float/int param declares BOTH `curve` and `unit` (empty string `""` is
      a valid unit — see `copy_machine.py:164,187` precedent for `generation`/
      `mix`) — `stop_frame`, `duration_s`, `curve_a/d/s/r`, `ring_frames`, `mix`.
      Recommended units (mechanical, not a decision): `stop_frame`→`"frames"`
      (4 existing precedents via grep), `duration_s`→`"s"` (no exact precedent,
      unambiguous, freeform field — no enum constraint on `unit`), `curve_a/d/s/r`→
      `""` (normalized 0-1, matches copy_machine's `generation`), `ring_frames`→
      `"frames"`, `mix`→`"%"` (matches `copy_machine.py:250` exactly).
- [ ] `curve` values restricted to `VALID_CURVES = {"linear", "logarithmic",
      "exponential", "s-curve"}` (`backend/src/effects/_calibration.py:30`) — all
      six numeric params use `"linear"` (no precedent need for anything else; the
      ADSR shape itself, not the knob-to-value curve, carries the platter feel).
- [ ] `RESERVED_PARAM_PREFIX = "_"` guard (`registry.py:19,23-35`) — none of the
      §1 param names start with `_`; if OD-1(b) is picked, `_fps`/`_bpm` are
      injected by the CONTAINER, never declared in `PARAMS` (would hard-error at
      registration per `_validate_params`).
- [ ] Explicit-import registry — see §2 registry.py edits, `phase12_mods` only.
- [ ] Alpha never crosses JPEG preview transport — `backspin.py`'s ring stores
      RGB only (mirror `copy_machine.py:830-832`'s `has_alpha` split: store
      `rgb = frame[:, :, :3]` in the ring, re-concat `alpha` at output, same as
      `copy_machine.py:921`).
- [ ] cv2 paths + C-contiguous + float-hoisted for pixel work — the half-res
      resize IS the only per-frame pixel op (0.07ms measured for copy_machine's
      identical resize, per the source spec's perf note, line 145-146); no numpy
      float path needed beyond the ADSR curve scalar math (already float64/Python
      scalars, not per-pixel).
- [ ] History Ledger row + specific `undoable()` description — covered by §2's
      OD-3 transaction wiring for preset-apply; single-param edits (spin/gate/
      individual curve_* drag) already get generic per-param undo entries via
      whatever `dispatchChain().updateParam` already does (unchanged, no new
      wiring needed there — confirmed generic, no per-effect special-case exists
      for plain param writes).
- [ ] Preview==export parity via the single-clip path — no field-params, no
      composite-mask involvement for this effect; the MK.8 composite-preview gap
      (UNIFICATION-2026-07-03.md §82, `zmq_server.py:1688`) does not apply
      (backspin never touches `operators/operator_values`).
- [ ] Additive schema, no `PROJECT_VERSION` bump — new effect + optional
      synthetic keys only; no existing schema field changes shape.

## 4. Pre-existing red — RESOLVED (verified 2026-07-04)
As of commit 52b81512 (main),
`backend/tests/test_effects/test_calibration.py::test_numeric_params_have_unit`
**PASSES** — the wave0 fix landed in PR #408 (`7890974`) and PR #418 (`f82cc07`);
`copy_machine.py:187` now declares `"unit": ""` on the `feedback_amount` PARAMS
entry. The full backend suite is expected 100% green with ZERO pre-existing
failures. Do not assume a baseline failure — re-run `git log -- backend/src/effects/fx/copy_machine.py`
first; if PR #408/#418 are present, any red in the suite is a fx-backspin
regression, full stop.

## 5. Test Plan

### Backend unit (pytest, `backend/tests/test_effects/test_backspin.py` — NEW)
Acceptance oracles (verbatim from spec lines 54-58):
- Ring caps + memory bound: ring never exceeds `ring_frames`; half-res storage
  verified by shape assertion on stored entries.
- Pulse fires on rising edge only: `spin=False→True` fires once; holding `True`
  across frames does not re-fire (mirror `copy_machine`'s edge-detection tests if
  any exist — check `backend/tests/test_copy_machine*.py` for the analogous
  `rewind` edge test before writing a new one from scratch).
- Each `stop_mode` terminates at its boundary: `frame` stops exactly at
  `stop_frame`; `duration` stops after `round(duration_s * assumed_frame_rate)`
  frames-since-trigger (assert against the SAME frame-domain counting convention
  used, not wall-clock); `tempo` — deferred until OD-1 resolves; `gate` stops on
  the falling edge of the `gate` bool.
- ADSR monotonicity per preset: sample the curve function at N points across a
  spin and assert the expected monotonic segments per phase (A rises, D falls to
  S, S flat, R falls to 0) for `hard_cut`/`long_brake`/`tape_stop`;
  `rubber_band`'s damped-oscillation R phase gets its own non-monotone-but-bounded
  assertion (documented exception).
- No-op on empty ring: `spin=True` with `state_in=None` (or a ring shorter than
  `_RING_MIN_FIRE`-equivalent) returns the frame unchanged — byte-identical
  assertion, mirrors `copy_machine.py:897` (`if (rewind or auto_fire or
  state.get("rewinding")) and ring:` — the `and ring` guard IS the no-op path;
  same pattern for backspin).
- Determinism: same seed + lanes → identical frames (assert twice with copied
  frame + copied state, per `test_effect_harness.py`'s `TestEffectDeterminism`
  pattern, `backend/tests/test_effect_harness.py:151-181`).
- Resume continuity: landed frame == first forward frame after the ring drains
  (assert `state["prev"]` — or backspin's equivalent carried-state key — equals
  the last popped ring frame, mirror `copy_machine.py:901` `state["prev"] =
  out.copy()`).

### Backend — generic harness (inherited automatically, zero new code)
Once registered in `registry.py`, `fx.backspin` is automatically parametrized into
ALL of `backend/tests/test_effect_harness.py`'s `EFFECT_IDS`-driven suites:
`TestEffectSurvival` (4 checks × 6 standard frames), `TestEffectDeterminism`,
`TestEffectStateful` (10-frame continuity), and the `@pytest.mark.perf`
`test_timing_budget_1080p` (<500ms, `:207-228`) — no manual "register a budget"
step exists or is needed (confirmed: the harness is `EFFECT_IDS`-parametrized off
`registry.list_all()`, not an opt-in list).

### Backend — calibration (inherited + 1 manual addition)
`test_all_curves_are_valid` and `test_numeric_params_have_unit`
(`backend/tests/test_effects/test_calibration.py:9-31`) run automatically. Add
`fx.backspin`'s DEPENDENT_PARAMS entries to
`backend/tests/test_parameter_sweep.py`'s `DEPENDENT_PARAMS` set (`:67`, second
occurrence with rationale comments at `:174-196` per the `copy_machine` precedent)
for: `stop_frame` (no-op unless `stop_mode=frame` AND ring has frames),
`curve_a/d/s/r` (no-op absent a carried spin-in-progress state at
`frame_index=0`/single-shot sweep call), `spin`/`gate` (no-op on a single-shot
call with `state_in=None` — mirrors copy_machine's `freeze`/`rewind` rationale at
`:190,196` exactly). Follow the exact comment format precedent (quote mean-abs-
diff numbers from a manual multi-frame run, per `:104-135`).

### Frontend component (Vitest, mock IPC)
- `DeviceChain.test.tsx` (or new `backspin-preset-cascade.test.tsx`): selecting a
  `preset` writes all 4 `curve_*` params + `preset` in ONE undo entry (assert
  `useUndoStore.getState().past` length delta == 1, and `.description` matches
  `"Set backspin preset: <name>"`); editing any `curve_*` while `preset !==
  'custom'` cascades `preset → 'custom'` in the same undo entry; undo of either
  restores all 5 fields atomically.
- Automation picker: `fx.backspin`'s `spin`/`gate` appear ONLY in the trigger-lane
  picker (`pickerMode === 'trigger'`), never the continuous-lane picker — assert
  against the existing `boolOnly` filter logic
  (`AutomationToolbar.tsx:407-408`), no new logic to test beyond confirming the
  generic mechanism picks up the new effect's schema (a schema-registration test,
  not a new code-path test).

### BDD scenarios (source doc has none written yet for backspin specifically —
flag as a follow-up, not fabricated here per Hard Rule #2/#7): the routing PRD's
sibling BDD suite (`~/.claude/plans/creatrix-moire-generator-bdd.md`-style format)
should get a `Feature: fx.backspin` file mirroring the acceptance oracles in §5
once this packetizes — out of scope to author now (no existing BDD scenarios
for this effect exist to quote verbatim, and Hard Rule #3 forbids inventing
normative contract text).

## 6. Packet candidates

| name | files | risk | oracle |
|---|---|---|---|
| P1 — backend effect core | `backend/src/effects/fx/backspin.py` (new), `backend/src/effects/registry.py` (2 edits) | MED — new stateful temporal effect, ring/ADSR logic is genuinely new (not a copy-paste) | full backend pytest green INCL. new `test_backspin.py`; `test_effect_harness.py` + `test_calibration.py` pass for `fx.backspin` (curve/unit present); pre-existing `feedback_amount` red from §4 is the ONLY expected pre-existing failure — any other red is a regression |
| P2 — tempo_div plumbing (OD-1) | conditional: `backend/src/engine/container.py`, `backend/src/engine/pipeline.py` or `zmq_server.py` render call site | MED-HIGH — touches shared container/pipeline code, must be byte-identical for the other 220 effects | full backend pytest green (regression proof for all non-backspin effects); new test asserting `_fps`/`_bpm` reach `fx.backspin` when `stop_mode=tempo`, absent/ignored otherwise |
| P3 — frontend param rendering + trigger lanes | none (generic — verification-only packet) | LOW | manual/automated check: `fx.backspin` shows up in EffectBrowser, all params render via existing generic components, `spin`/`gate` appear in trigger-lane picker only |
| P4 — preset cascade (OD-3) | `frontend/src/renderer/components/device-chain/DeviceChain.tsx` | MED — new per-effect special-case, transaction API is live-but-previously-unused (first real caller — verify no dormant bugs in `beginTransaction`/`commitTransaction`) | Vitest: preset apply == 1 undo entry, curve edit == 1 undo entry w/ cascade, undo restores atomically; `npx --no vitest run` green |
| P5 — BDD scenarios + docs | new BDD feature file (location TBD by whoever owns the BDD suite convention) | LOW | scenario file reviewed against §5 oracles for 1:1 coverage |

Suggested order: P1 → P3 (parallel-safe once P1 lands, verification-only) → P2 (only
if OD-1(b) is the chosen default) → P4 → P5. P2 can be dropped entirely if OD-1(a)
(frontend pre-resolve) is chosen instead — cheaper but see the staleness con in
proposal.md.
