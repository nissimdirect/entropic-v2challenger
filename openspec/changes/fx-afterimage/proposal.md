# Change: fx-afterimage

Rebuild `fx.afterimage` from an opponent-process ghost model into the
echo-line / motion-trail model banked 2026-07-03 (delay_frames / feedback /
opacity / echo_transform / color_drift / tint), per
`~/.claude/plans/creatrix-backspin-afterimage-spec.md` (§ fx.afterimage).

**Status:** DRAFT — planning only, no code written under this change.

---

## Open Decisions

Real tensions found while code-grounding the spec against the live repo.
None are silently resolved. Each has a recommended default; the user (or
the packet executor, if the user delegates) confirms before build.

### OD-1 — `fx.afterimage` already exists with an unrelated model — replace in place or fork the id?
`backend/src/effects/fx/afterimage.py:1-30` is **live and registered**
(`backend/src/effects/registry.py` Wave-6 import list) implementing an
"opponent-process afterimage" (params: `adaptation_rate` 0.01–0.2,
`strength` 0–1; model: `adaptation += rate*(rgb-adaptation)`,
`afterimage = 0.5 + (adaptation-rgb)`, blend by `strength`). This shares
**zero** params, zero model logic, and zero param names with the new
echo-line spec. Grep confirms no frontend component references
`afterimage` by name (generic `ParamPanel`/`ParamSlider`/`ParamChoice`
render any effect from its `PARAMS` schema — `frontend/src/renderer/components/effects/ParamPanel.tsx`),
and no fixture/preset JSON in the repo references either param name.
- **Recommended default: REPLACE in place.** Same `EFFECT_ID = "fx.afterimage"`,
  full `PARAMS` dict + `apply()` rewritten, `EFFECT_CATEGORY` changed
  `"misc"` → `"temporal"` (9 existing effects already use `"temporal"`,
  e.g. `backend/src/effects/fx/temporal_blend.py:7`,
  `backend/src/effects/fx/temporal_freeze.py:7` — established bucket).
  Justified by `openspec/project.md`: *"Single tester (the user) — no
  external user base, no production data, no backwards-compat obligation.
  Clean breaks are free; we delete and regenerate our own test fixtures."*
- Alternative (rejected unless user wants both to coexist): ship as a new
  id (`fx.echo_trail`) and leave the opponent-process model alone. Adds a
  22nd-effect-family branch for no stated demand; not recommended.

### OD-2 — the existing auto-oracle asserts a first-frame diff the new banked semantics forbid
`backend/tests/oracles/test_afterimage_oracle.py::test_afterimage_changes_output`
asserts `per_pixel_l1_distance(...) >= 2.0`, and
`per_pixel_l1_distance` (`backend/tests/oracles/conftest.py:118-129`)
compares **only the first frame** of input vs output. The spec's own
banked semantics (§ Semantics, "Sweep registry" note: *"`mode`/`tint`/
`threshold` at frame_index=0 are DEPENDENT_PARAMS (no prev frame yet)"*)
mean frame 0 has no ring/echo history to draw from — the only correct
behavior is a byte-identical passthrough on frame 0 (see plan.md
Implementation Note on frame-0 gating). That makes the existing oracle
fail by construction once the new model ships.
`backend/tests/oracles/conftest.py:132-137` already ships
`nth_frame_l1_distance(path_a, path_b, n=10)` for exactly this case
("temporal effects whose first frame is often pass-through").
- **Recommended default:** rewrite `test_afterimage_oracle.py` to assert
  on `nth_frame_l1_distance(..., n=10)` against the `smear` preset (or
  bare defaults — both accumulate visibly by frame 10 at
  `delay_frames=1, feedback=0.75, opacity=0.9`). This is a mechanical
  consequence of OD-1's banked semantics, not a business call, but it is
  called out here because it means the packet touches a **test file**
  the user might not expect an "afterimage effect" change to touch.

### OD-3 — `mode` options `max` and `lighten` are the same operation under the pinned single-buffer model
Spec's `mode` choice list is `max · screen · lighten · min · average`
(default `max`). The spec pins the implementation as **single-buffer
recursive, not N-copies** (§ Semantics). Per-channel `max(a,b)` is the
exact operation already shipped as `lighten` in the compositor
(`backend/src/engine/compositor.py:95-97 _blend_lighten` —
`np.maximum(base, layer)`). There is no second axis (e.g. "brightest of
the whole accumulated history" vs "brightest of two buffers") available
in a single-buffer model to make `max` and `lighten` differ. The shipped
presets even land on both sides of the ambiguity: `smear` names `max`,
`stutter` names `lighten` — same math, different labels, both pinned
verbatim by the spec's preset table.
- **Recommended default:** implement both names, both call the same
  `np.maximum` kernel. Byte-identical output for `smear` and a
  hypothetical `lighten`-flavored `smear` is *correct*, not a bug — note
  this inline in the effect module docstring so a future reviewer
  doesn't "fix" it into two different formulas. Do not collapse the enum
  (verbatim contract — the spec pins both names).

### OD-4 — the per-frame recursive update equation is prose-only; two readings both fit the given constraints
The source gives the diminish law verbatim (`echo_n strength =
opacity·feedback^n`, § `feedback` param row) and the outer-composite
sentence verbatim (`out = blend(current, prev_out · decay) per pixel,
mode-dependent`, § Model — this sentence is UNCHANGED from the pre-rev
draft; only `decay` was renamed to `opacity`/`feedback`/`delay_frames`).
Neither gives the literal update assignment for the recursive buffer, and
the "mode-dependent" clause attaches grammatically to the **outer**
composite (current vs echo), not the inner recursive accumulation. Two
readings both satisfy the stated oracles (impulse spacing, geometric
diminish, compounding transform, bypass purity):
  - (a) `mode` selects the blend used ONLY for the final `current` vs
    `echo_line` composite; the internal recursive accumulation
    (`echo_line' = opacity·tap + feedback·transform(echo_line)`) is a
    fixed weighted sum, independent of `mode`.
  - (b) `mode` is reused for the internal recursive accumulation too
    (i.e. `echo_line' = mode_blend(opacity·tap, feedback·transform(echo_line))`).
- **Recommended default: (a).** The diminish formula
  `opacity·feedback^n` makes no reference to `mode`, implying magnitude
  is mode-independent; the unchanged top-line sentence names exactly one
  blend ("blend(current, prev_out)"), and the param table's own gloss for
  `mode` is *"blend of echo accumulation **under current frame**"* — i.e.
  compositing the echo layer under the live frame, singular. Implementer
  must confirm (a) reproduces all six named oracles (bypass purity; echo
  energy monotonic in feedback/opacity; echo spacing == delay_frames
  exactly; diminish == opacity·feedback^n; transform compounds
  geometrically; tint never touches current frame) before considering
  the packet done — plan.md's Test Plan enumerates each as a required
  case.

### OD-5 — "ONE global SG-8 temporal-buffer budget" does not exist in code yet
Routing memory (embedded in the source spec, § Integration & edge cases)
asserts backspin rings + afterimage echo lines + copy_machine rings +
tap_prev buffers "share ONE SG8-governed budget." Verified against
`backend/src/safety/pressure/registry.py` (real `FeatureRegistry`
infrastructure) and its actual callers: `granulator_gpu.py:161,537` and
`instruments/granulator_instrument.py:947` (GPU pools / grain density),
plus `masking/matte_source.py:125-156` (a **different** pattern — a
direct `pressure_percent() >= 82` threshold check, not the registry).
The only existing `effects/fx/*` temporal ring —
`backend/src/effects/fx/copy_machine.py:84-85,908-909`
(`_RING_MAX = 36`) — enforces a **purely local hard cap** with zero
interaction with the pressure system. No shared cross-effect budget
exists today; the routing memory's claim describes an aspiration, not
current code. `UNIFICATION-2026-07-03.md` §3 item 7 independently reaches
the same conclusion and explicitly defers it: *"SG-8 is ONE process-wide
registry — register solver GPU pools and temporal rings against it
explicitly... declare deferred."*
- **Recommended default:** `fx.afterimage` follows the `copy_machine`
  precedent — local hard caps only (echo-frame ring capped ≤30 per spec;
  half-res storage under memory pressure is a nice-to-have, not wired to
  a live signal for v1). File a follow-up ticket for the real
  `FeatureRegistry` registration across copy_machine/backspin/afterimage
  rings as a later-wave item; do not block this packet on it.

---

## Why

The currently shipped `fx.afterimage` (opponent-process ghost) is an
orphaned experiment: zero frontend wiring, zero fixtures, zero user-facing
surface beyond the generic auto-rendered param panel. The user has since
banked a fully-specified echo/motion-trail model (Ableton Delay/Echo
mapping: delay time, feedback, input gain, loop-filter, vaporwave preset)
that composes with the also-banked `fx.backspin` effect and reuses the
`copy_machine` temporal-ring precedent. This change replaces the dead
implementation with the banked one so the effect earns its registry slot.

## What

In scope:
- Rewrite `backend/src/effects/fx/afterimage.py`: new `PARAMS` schema
  (`delay_frames`, `feedback`, `opacity`, `mode`, `echo_transform`,
  `transform_amount`, `color_drift`, `tint`, `threshold`, `mix` — see
  plan.md for the verbatim param table) and new `apply()` implementing
  the single-buffer recursive echo-line model.
- `EFFECT_CATEGORY` `"misc"` → `"temporal"`.
- Ship the 4 named presets verbatim: `vaporwave`, `smear`, `stutter`,
  `ink_ghost` (exact values in plan.md, copied from source spec).
- New dedicated unit test file (`backend/tests/test_afterimage.py`, name
  TBD by executor, following the `test_copy_machine.py` precedent)
  covering the 8 named oracles from the source spec's Tests section.
- Rewrite `backend/tests/oracles/test_afterimage_oracle.py` per OD-2.
- Register `("fx.afterimage", "mode")`, `("fx.afterimage", "tint")`,
  `("fx.afterimage", "threshold")` (and any other frame_index=0-inert
  params confirmed during build) — verify whether the existing blanket
  `"fx.afterimage"` entry in `test_parameter_sweep.py`'s `STATEFUL_FRAME0`
  set (already present, currently covering the old model) remains
  correct for the new model or needs to move to per-param
  `DEPENDENT_PARAMS` entries instead (see plan.md).
- Calibration compliance: every float/int param carries `curve` + `unit`
  (enforced by `backend/tests/test_effects/test_calibration.py::test_numeric_params_have_unit`
  and `::test_numeric_params_have_curve` — both already gate CI per
  `UNIFICATION-2026-07-03.md` §D-3, "already a live enforced test").

Out of scope (explicitly deferred, do not build now):
- `fx.backspin` (separate effect, separate change — referenced here only
  for the shared temporal-buffer-budget context in OD-5 and the chain
  ordering note in plan.md's Semantics section).
- Real SG-8 `FeatureRegistry` registration for temporal rings (OD-5,
  later-wave item).
- Any UI beyond the generic `ParamPanel`/`ParamSlider`/`ParamChoice`
  auto-render — no bespoke component is needed (confirmed: no existing
  `Afterimage*.tsx` component, no dedicated afterimage UI anywhere in
  `frontend/src`).
- Trigger-lane wiring — `fx.afterimage`'s new params are all
  float/int/choice, no `bool` params, so the bool-pulse-lane mechanism
  (`a66794f`, `AutomationToolbar.tsx`) does not apply to this effect
  (it applies to `fx.backspin`'s `spin`/`gate` params instead).
- The System Monitor per-effect budget/latency display mentioned in the
  source spec's Integration section — no System Monitor component exists
  in the live frontend today (grep confirmed zero hits); nothing to wire
  it into yet.
- `masking/schema.py`'s `_VALID_KINDS` 8-kind enum (a house landmine
  named in this campaign's general instructions) — does not intersect
  this change; `fx.afterimage` is a pixel effect, not a masking kind.

## Non-Goals

- No change to `fx.backspin` (not built here).
- No change to the frontend beyond whatever the generic param-schema
  renderer already does automatically.
- No project-schema / preset-schema version bump — effect `PARAMS`
  changes are internal to the effect module and the generic
  `ParamDef`-driven UI; they do not touch `presetSchemaVersion` or any
  persisted project field.
- No attempt to unify the local ring cap with a cross-effect SG-8 budget
  in this packet (OD-5).

---

## Banked Decisions (binding, quoted verbatim)

Per `~/.claude/plans/creatrix-backspin-afterimage-spec.md`:

> `delay_frames` — **Delay time** — echo SPACING in frames; 1 = classic
> smear, 8+ = discrete stutter echoes. Range 1–30, default 1.
>
> `feedback` — **Feedback/regeneration** — how much each recursion
> diminishes: echo_n strength = opacity·feedback^n. Range 0–0.98, default
> 0.75.
>
> `opacity` — **input gain into the echo line** — strength of the FIRST
> echo (user: "opacity and feedback and how much each recursion
> diminishes"). Range 0–1, default 0.9.
>
> tint was LOST in the [echo-line] rev and is RESTORED above (static cast
> ≠ per-echo drift; both can be used together: violet tint + slow drift).
>
> `decay 0.85` (old) ≡ `delay_frames 1 · opacity 0.85 · feedback 0.85`
> (new) — the old model is the delay=1 special case.
>
> feedback=0 or opacity=0 ⇒ byte-identical passthrough and NO carried
> state.

`openspec/project.md` (binding project convention):

> Single tester (the user) — no external user base, no production data,
> no backwards-compat obligation. Clean breaks are free; we delete and
> regenerate our own test fixtures.
>
> Effects are pure: `(frame, params, state_in) -> (result, state_out)`.

Not applicable to this change (checked, no intersection):
`UNIFICATION-2026-07-03.md`'s D-1…D-5 (route-target addressing, browser
IA, merge-gate matrix, preset disk locations, edge-curve editor shape) —
all concern the ModEdge/routing/preset-browser subsystem; `fx.afterimage`
is a pixel-effect param/model rewrite with no routing, preset-browser, or
edge-curve surface. `UD-1…UD-5` were named in this task's boilerplate but
do not appear in either required source
(`creatrix-backspin-afterimage-spec.md` or
`UNIFICATION-2026-07-03.md`) — not fabricated here; flagged for the
orchestrator to locate if they exist elsewhere.


## T1 Verdicts (LOCKED 2026-07-03 — COMBO verdict, do not re-open)
- **OD-1 user verdict: "figure out combo" → BOTH models survive under one id.** `fx.afterimage` = the banked echo-line model (spec verbatim: delay_frames/feedback/opacity/echo_transform/color_drift + vaporwave preset) PLUS a `style` choice param: `echo` (default, new model) | `ghost` (the existing opponent-process model preserved verbatim — adaptation_rate/strength become style-scoped params). One effect, two engines, style-switched; DEPENDENT_PARAMS entries scope each style's params. Old projects (no `style` param) default to `echo` — acceptable clean-break per project.md; note in PR body.
- OD-2..OD-5: defaults ACCEPTED (oracle → nth_frame_l1_distance(n=10); max/lighten aliasing documented; mode governs outer composite only; local ring cap 30, SG-8 registration deferred).
