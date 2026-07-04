# Proposal — fx.backspin (DJ backspin-on-a-pulse effect)

> **Status:** PLANNING (docs-only). Companion `fx.afterimage` (same source spec) is
> explicitly OUT OF SCOPE for this change — see Non-Goals. No build follows from this
> package; a separate `/packetize` + implementer pass consumes it.

## Open Decisions (read first — recommended defaults below, not silently resolved)

### OD-1 · How does `stop_mode=tempo` get real BPM/FPS into a per-frame effect?
**Tension found by code-grounding:** the backspin spec (banked) requires `tempo_div`
to do "cycles-per-frame conversion at the automation layer (CPF rule — never Hz in
the effect)" — but `apply_chain` (`backend/src/engine/pipeline.py:120`) calls every
effect's `apply()` with only `frame_index, seed, resolution` (verified against
`backend/src/effects/fx/copy_machine.py:770-778`'s exact signature). **No effect
receives fps or bpm today.** The only place BPM currently reaches the render path is
the *operator* (modulation) engine — `backend/src/zmq_server.py:739-751`:
`bpm = clamp_finite(message.get("bpm", 120.0), 1.0, 999.0, 120.0)` then
`engine.evaluate_all(operators, frame_index, reader.fps, ..., bpm=bpm)` — a
completely separate code path (Signal Engine / operators) from `apply_chain`'s
per-effect params dict.
- **(a) Frontend pre-resolves.** Frontend already has `projectParam.bpm` (see
  `frontend/src/renderer/components/automation/AutomationToolbar.tsx` `PROJECT_PARAM_OPTIONS`)
  and clip fps. When the user sets `stop_mode=tempo` + `tempo_div`, the frontend
  computes an equivalent `duration_s` once at edit time and writes THAT — `tempo_div`
  becomes UI sugar over `duration_s`, zero backend/engine changes. **Con:** a later
  BPM change does not retroactively re-time already-set spins (stale bake).
- **(b) Backend-resolves via synthetic param injection (RECOMMENDED).** Extend the
  documented extension point in `backend/src/effects/registry.py:10-20` ("Container
  plumbing reserves the `_*` namespace... current synthetic keys: `_mix`, `_mask`")
  with two new keys, `_fps` / `_bpm`, injected by `backend/src/engine/container.py`
  (precedent: `:58-59` `effect_params.pop("_mask", None)` / `pop("_mix", 1.0)`) using
  values already present on every render request (`zmq_server.py:741` `message.get("bpm", ...)`,
  `reader.fps`). Only `fx.backspin` pops `_fps`/`_bpm`; the other 220 effects are
  byte-identical (they never look for those keys; an unused pop is a no-op). Stays
  live-tempo-correct across playback.
- **Recommended default: (b).** Contained additive diff (2 files: container.py +
  pipeline.py call site), same shape as the `UD-1` precedent already accepted in
  `docs/plans/2026-07-field-mapping/MARATHON-BRIEF-wave0-AMENDED.md:12` ("a real
  (small) engine change... bends 'no new engine'... LOW-MED, additive").

### OD-2 · ADSR curve editor shape (routing PRD Decision 18 says "ADSR-style curve
editor with a preset bank" — House Landmine directive: reuse-not-fork, else propose
minimal preset-bank-only v1 as the default)
**Code-grounded finding:** `frontend/src/renderer/components/operators/EnvelopeEditor.tsx`
(the only ADSR UI in the codebase — for the modulation Envelope *operator*) is **not**
a draggable curve-shape editor. It is 4 plain `<input type="number">` rows (Attack/
Decay/Sustain/Release, `min/max/step` per field) bound to `useOperatorStore` /
`Operator.parameters` — a different store and entity type from `EffectInstance`
(`frontend/src/shared/types.ts:545` `ParamDef`), so it cannot be imported as-is. There
is **no visual/draggable curve component anywhere in the repo** to reuse or fork
(confirmed: no SVG/canvas curve-drawing component under `frontend/src/renderer/components/**`
named curve/envelope/adsr besides this numeric one). Building one is a NEW interactive
UI component and would trip Gate 15 (Research Gate: cite react-moveable/Fabric/Konva
etc.) — out of scope for this packet.
- **Recommended default (v1, per the House Landmine fallback):** ship `curve_a` /
  `curve_d` / `curve_s` / `curve_r` as four plain numeric params (0–1, `curve: "linear"`,
  `unit: ""`) rendered through the ALREADY-GENERIC `ParamPanel.tsx` → `Knob.tsx` path
  (no new component) plus the `preset` choice param rendered via the already-generic
  `ParamChoice.tsx` (`frontend/src/renderer/components/effects/ParamChoice.tsx`) —
  i.e. a preset-bank + 4 knobs, matching EnvelopeEditor.tsx's actual (non-visual)
  precedent. A draggable ADSR curve overlay is a later-wave item, tracked but not
  built here.

### OD-3 · Preset → params cascade (no existing mechanism)
The spec requires: picking `preset` writes `curve_a/d/s/r` all at once; manually
editing any `curve_*` flips `preset` to `custom`. No effect in the codebase has a
choice param that cascades into sibling numeric params (checked `fx.color_filter`'s
`preset` — it is consumed entirely inside `apply()`, no sibling-param writeback).
This is bidirectional UI state, not a backend concern.
- **Recommended default:** effect-specific cascade logic added at the single param-
  write call site, `frontend/src/renderer/components/device-chain/DeviceChain.tsx:297-302`
  (`handleUpdateParam` → `dispatchChain().updateParam(...)`), keyed on
  `effectId`'s effect type `=== 'fx.backspin'`. Wrap the multi-param preset-apply in
  the ALREADY-LIVE (but currently unused-by-any-caller) transaction API —
  `frontend/src/renderer/stores/undo.ts:127-186` `beginTransaction` /
  `commitTransaction` — so "Set backspin preset: long_brake" lands as ONE Ledger
  row (House Landmine #5), not 5. Do NOT add a generic `ParamDef.cascades` schema
  field — scope the special-case to this one effect; a generic mechanism is
  speculative for a single user.

## Why
Banked decision (routing PRD, verbatim — `~/.claude/plans/creatrix-layertap-routing-prd.md:180-182`):

> **18. fx.backspin stop-point + curve:** the spin's end is pickable — (a) a
> clip-frame selector when frames are available, (b) a duration, (c) tempo-sync
> divisions, or (d) a drawn binary on/off gate in the automation lane. Spin
> velocity has an ADSR-style curve editor with a preset bank (recommended
> platter feels).

`fx.copy_machine` already ships a `rewind`/`reverse_at` output-ring rewind pulse
(`backend/src/effects/fx/copy_machine.py:195-218, 882-916`, landed in commit
`a66794f`) that is the direct precursor of this effect: `fx.backspin` generalizes
that one-off "replay the ring backward" mechanic into a first-class temporal effect
with a real platter velocity curve (ADSR) and four selectable stop-point modes
instead of copy_machine's two (duration-style `reverse_at` threshold + manual bool).

## What
Add one new registered effect, `fx.backspin` (category `codec_archaeology`, beside
`fx.copy_machine`), per the full param table and semantics in
`~/.claude/plans/creatrix-backspin-afterimage-spec.md` lines 11–58 (quoted verbatim
in `plan.md` — NORMATIVE, do not re-derive):
- Continuous half-res ring recording of the effect's input (`ring_frames`,
  memory-bounded, same shape as copy_machine's `_RING_MAX`/half-res pattern).
- A `spin` pulse (bool, trigger-lane target) that plays the ring backward under an
  ADSR platter-velocity curve, landing back on forward playback.
- Four `stop_mode`s: `frame` (clip-frame selector), `duration` (seconds), `tempo`
  (BPM-synced bar divisions — see OD-1), `gate` (drawn binary automation lane, spin
  runs while high, release = resume).
- Four ADSR curve params (`curve_a/d/s/r`) + a `preset` bank (`hard_cut`,
  `long_brake`, `rubber_band`, `tape_stop`, `custom`) — see OD-2/OD-3 for UI shape.
- Recording pauses during a spin (platter model — dropped frames during spin are
  intentional, matches the source spec's "doubles" semantics).

## Non-Goals
- **`fx.afterimage`** (same source spec doc, different effect/category) — NOT part
  of this change. It already has entries in the live registry
  (`backend/src/effects/registry.py` `phase8_mods` includes `afterimage`) under an
  older param model; the spec's "rev 2026-07-03" echo-line rewrite is a separate
  change with its own migration story (old→new param mapping table in the source
  doc) and is out of scope here.
- **SG-8 pressure-registry integration** for the backspin ring. Verified:
  `fx.copy_machine`'s existing ring (`_RING_MAX = 36`, same pattern) is **not**
  registered against `backend/src/safety/pressure/registry.py` /
  `degrade_order.py` today (grepped — zero hits) despite the source spec's
  aspirational "share ONE SG8-governed budget" framing. Backspin follows
  copy_machine's ACTUAL (static per-instance cap via `ring_frames` param, 12–90,
  default 45) precedent, not the aspirational one. Cross-effect ring unification is
  explicitly item 7 in `docs/plans/2026-07-field-mapping/UNIFICATION-2026-07-03.md`'s
  later-wave register — not this packet.
- **A bespoke "pulse button + auto-at affordance" UI component.** The source
  spec's "UI: both get pulse-friendly UI per the copy_machine mock language" does
  not correspond to any shipped component — grepped `frontend/src/renderer/components`
  for any `rewind`/`reverse_at`-specific control and found none; copy_machine's
  `rewind` bool ships today as a plain `ParamToggle.tsx` checkbox plus the generic
  automation trigger-lane target. Backspin's `spin`/`gate` follow that same
  ACTUAL (not aspirational) precedent for v1.
- **Per-instance System Monitor "spin" state display.** Confirmed
  `backend/src/engine/pipeline.py:56` `_effect_timing: dict[str, deque]` is keyed by
  effect TYPE globally (matches `UNIFICATION-2026-07-03.md` §69's finding #70 for
  the sibling System Monitor claim) — there is no per-instance/per-track latency
  channel to hang a "spin" display state off of today. Deferred; v1 shows whatever
  the generic per-type latency number shows during a spin (may read as a
  momentary spike, not mislabeled — acceptable per the spec's own "no silent
  quality loss" bar since nothing is silently dropped, just unlabeled).
- **Draggable/visual ADSR curve editor** — see OD-2. Preset-bank + numeric knobs
  only, v1.
- **Building or modifying `fx.copy_machine`.** Read-only precedent reference.

## Banked decisions this change must not re-litigate
- Routing PRD Decision 18 (quoted above, verbatim) — the four `stop_mode`s and the
  ADSR-with-preset-bank requirement are LAW, not open for redesign.
- House Landmines (binding on every numeric param, every user-visible op, every
  effect registration) apply unmodified: curve+unit metadata on every new numeric
  param (enforced live by `backend/tests/test_effects/test_calibration.py::test_numeric_params_have_unit`
  — see plan.md Test Plan for the pre-existing unrelated red on
  `fx.copy_machine.feedback_amount` that predates this change); explicit-import
  effect registry (`backend/src/effects/registry.py:115-539`, `phase12_mods`-style
  list convention per the `test_no_orphan_module_lists` guard cited at
  registry.py:425-430); History Ledger row + specific `undoable()` description for
  every new user-visible op; additive schema, no `PROJECT_VERSION` bump.


## T1 Verdicts (LOCKED 2026-07-03, /marathon chunked T1 — do not re-open)
All Open Decisions above: **defaults ACCEPTED as written** (user: "Accept all 33 defaults"). Hotkey ODs additionally governed by the global verdict: menu-entry-only now, accelerator picked at build/UAT.
