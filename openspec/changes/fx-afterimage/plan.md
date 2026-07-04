# Plan: fx-afterimage

Implementation plan for the change described in `proposal.md`. Assumes
OD-2…OD-5 resolve to their recommended defaults; **OD-1 is superseded by
the T1 COMBO verdict** (proposal.md, "T1 Verdicts" section, locked
2026-07-03): `fx.afterimage` ships as ONE effect with TWO engines
selected by a `style` choice param — `echo` (default; the banked
echo-line model) | `ghost` (the existing opponent-process model,
preserved verbatim). Every section below that assumed a full-replace
rewrite is revised accordingly; sections not touching `style` are
unchanged from the prior draft.

---

## 1. Code surface (verified by Read/Grep this session)

| File | Current state (cited) | Change |
|---|---|---|
| `backend/src/effects/fx/afterimage.py` (69 lines, re-confirmed current this session — `EFFECT_ID="fx.afterimage"` line 5, `EFFECT_CATEGORY="misc"` line 7, `PARAMS`=`adaptation_rate`/`strength` lines 9-30, `apply()` lines 33-69) | Re-verified against T1 combo: this is now the **`ghost`-style source**, not dead code to delete. `EFFECT_CATEGORY` `"misc"` → `"temporal"`. `PARAMS` becomes a merged dict: add `style` (choice `echo`\|`ghost`, default `echo`) plus the new echo-model params (§2); **keep `adaptation_rate`/`strength` verbatim** (same `min`/`max`/`default`/`label`/`curve`/`unit`/`description` as lines 10-29 today — do not touch a single field) as style-scoped params. `apply()` becomes a dispatcher: `style = params.get("style", "echo")` (missing key ⇒ `"echo"`, the documented clean-break for old projects — no `style` key exists in any persisted data today, confirmed no fixture/preset JSON references either param set per proposal.md OD-1); `if style == "ghost": return _apply_ghost(...)` else the new echo path. `_apply_ghost()` is lines 42-69 **moved verbatim, byte-for-byte** into a private helper — no reformatting, no variable renames, no clamp-logic changes. This verbatim-move is itself the oracle for the style-switch boundary (see §4.1a). |
| `backend/src/effects/registry.py` | `afterimage` already imported (Wave-6 import block, alongside `moire`, `temporal_crystal`) and already in the `mods` registration list | **No change** — id/import already wired, confirmed by grep; do not re-add |
| `backend/tests/oracles/test_afterimage_oracle.py` (34 lines) | Auto-generated; asserts first-frame `per_pixel_l1_distance >= 2.0` (line 31) | Rewrite per OD-2: switch to `nth_frame_l1_distance(..., n=10)` |
| `backend/tests/oracles/conftest.py` | `per_pixel_l1_distance` (lines 118-129, first-frame only) and `nth_frame_l1_distance` (lines 132-137+, parametrized `n`) both already exist | **No change** — reuse existing helper, do not add a new one |
| `backend/tests/test_parameter_sweep.py` | `"fx.afterimage"` is a blanket entry in `STATEFUL_FRAME0` (~line 289, comment: "needs buffer history or sidechain") | Verify still correct for new model (see §4.3); with the T1 combo, the discriminator pattern to copy is not the generic `("fx.copy_machine", "freeze")` case but the **`machine`-scoped** entries at lines 170-196 (re-confirmed this session: `("fx.copy_machine", "cell_size")` / `"glyph_set"` are inert unless `machine="ascii"`, with the exact diff numbers quoted in the comment) — `fx.copy_machine`'s `machine` choice param (`copy_machine.py:109`) is the direct structural precedent for `fx.afterimage`'s new `style` choice param: both are a discriminator that gates which sibling param block is live. Every echo-only param (`delay_frames`/`feedback`/`opacity`/`mode`/`echo_transform`/`transform_amount`/`color_drift`/`tint`/`threshold`/`mix`) needs a `("fx.afterimage", "<param>")` entry documented as "no-op when `style=ghost`" (mirroring the `cell_size`/`glyph_set`-under-`machine=toner` comment style), and `adaptation_rate`/`strength` need entries documented as "no-op when `style=echo`" — both directions, not just one |
| `backend/tests/test_effects/test_calibration.py` | Generic: `test_numeric_params_have_curve`/`test_numeric_params_have_unit` iterate `list_all()` (lines 19-36); `test_effect_at_defaults/_min/_max` (lines 51-100) call `apply()` directly | **No change** — new params must satisfy these generically; no new test needed here |
| `backend/tests/test_effect_harness.py` | Generic: survival/shape/type/range/determinism/10-frame-stateful/timing budget for every registered effect (lines 78-231) | **No change** — afterimage already covered; new model must pass these unmodified |
| `backend/tests/test_afterimage.py` (new) | Does not exist | New file, modeled on `backend/tests/test_copy_machine.py`'s structure (direct multi-frame `apply()` sequences, ring/state introspection) — houses the 11 named `echo`-style oracles from §4.1 PLUS the `ghost`-style regression oracle and the style-switch-default oracle from §4.1a (T1 combo) |
| `docs/EFFECT-CONTRACT.md` | Exists (confirmed) | No change expected; effect still honors the pure `(frame, params, state_in) -> (result, state_out)` contract |

No frontend file changes: confirmed zero references to `afterimage`
anywhere in `frontend/src` (`grep -rln "afterimage" frontend/src` = empty
hit set). Params render via the existing generic
`frontend/src/renderer/components/effects/ParamPanel.tsx` +
`ParamSlider.tsx` + `ParamChoice.tsx` from the `PARAMS` schema alone — no
new component, no new import.

---

## 2. Normative param table (verbatim from source spec, plus T1 combo's `style` discriminator)

Copied verbatim from `~/.claude/plans/creatrix-backspin-afterimage-spec.md`
§ fx.afterimage, for the `echo` style. An implementer must not re-derive
these — transcribe directly into `PARAMS`, adding `curve`/`unit` per the
calibration convention (`backend/src/effects/fx/copy_machine.py`'s
`PARAMS` dict is the house style reference: `type`/`min`/`max`/`default`/
`label`/`curve`/`unit`/`description`).

Per the T1 COMBO verdict, `PARAMS` is a **merged dict** with a leading
discriminator:

| param | type | range / options | default | notes |
|---|---|---|---|---|
| `style` | choice | `echo` · `ghost` | `echo` | Selects which engine runs. `echo` = new banked model (rows below). `ghost` = existing opponent-process model — routes to `adaptation_rate`/`strength`, unchanged from `backend/src/effects/fx/afterimage.py:10-29` today (re-verified this session, byte-identical field values). Missing `style` key (old project data) ⇒ treated as `echo` — the documented clean-break per `openspec/project.md`'s no-backwards-compat convention. This param has no `curve`/`unit` (choice type, same convention as `mode`/`echo_transform`/`tint` below — calibration tests only require `curve`/`unit` on numeric params, confirmed by `test_numeric_params_have_curve`/`_unit`'s `type in ("float","int")` filter, see §4.2). |

### `echo`-style params (DEPENDENT_PARAMS: inert when `style=ghost`)

| param | type | range / options | default | Ableton analog / notes |
|---|---|---|---|---|
| `delay_frames` | int | 1–30 | 1 | **Delay time** — echo SPACING in frames; 1 = classic smear, 8+ = discrete stutter echoes |
| `feedback` | float | 0–0.98 | 0.75 | **Feedback/regeneration** — how much each recursion diminishes: echo_n strength = opacity·feedback^n |
| `opacity` | float | 0–1 | 0.9 | **input gain into the echo line** — strength of the FIRST echo |
| `mode` | choice | `max` · `screen` · `lighten` · `min` · `average` | `max` | blend of echo accumulation under current frame; min = ink ghosts |
| `echo_transform` | choice | `none` · `hue_shift` · `blur` · `pixelate` · `posterize` | `none` | filter-in-the-feedback-loop, applied to the echo buffer EACH recursion, so it compounds |
| `transform_amount` | float | 0–1 | 0.3 | depth of `echo_transform` per recursion |
| `color_drift` | float | −60–60 °/echo | 0 | per-recursion hue rotation — the vaporwave knob |
| `tint` | choice | `none` · `warm` · `cool` · `violet` | `none` | STATIC color cast on the whole echo line — distinct from `color_drift`. Ghosts only; current frame never tinted |
| `threshold` | float | 0–1 | 0 | only pixels past threshold seed echoes (trails on highlights) |
| `mix` | float | 0–1 | 1.0 | dry/wet |

Suggested `unit` values (house convention grep'd from
`backend/src/effects/fx/*.py`: `"frames"` used elsewhere, `"°"` exact
unicode char used at `backend/src/effects/fx/hue_shift.py:22`, `"%"`
used for 0-1 gain/mix params e.g. `copy_machine.py`'s `mix` param):
`delay_frames`→`"frames"`, `feedback`/`opacity`/`transform_amount`/
`threshold`/`mix`→`"%"`, `color_drift`→`"°"`. All `curve`→`"linear"`
(no basis in the source spec for a non-linear curve on any of these).

### `ghost`-style params (DEPENDENT_PARAMS: inert when `style=echo`)

Moved verbatim from the live `backend/src/effects/fx/afterimage.py:10-29`
(re-read this session — field values below are transcribed exactly, no
edits):

| param | type | range / options | default | notes |
|---|---|---|---|---|
| `adaptation_rate` | float | 0.01–0.2 | 0.05 | "How fast the eye adapts to the stimulus" — `curve="linear"`, `unit=""` in the current file; **do not add a unit string during the move** — changing `unit` from `""` to something else is a field edit, and the verbatim-move contract (§1) forbids any field edit on this param block |
| `strength` | float | 0.0–1.0 | 0.5 | "Afterimage intensity" — same `curve`/`unit` verbatim-preservation rule |

### Presets (ship verbatim)

| preset | delay_frames | feedback | opacity | mode | color_drift | echo_transform | transform_amount |
|---|---|---|---|---|---|---|---|
| `vaporwave` | 6 | 0.85 | 0.8 | screen | +14° | blur | 0.2 |
| `smear` | 1 | 0.9 | 0.9 | max | 0 | none | (n/a) |
| `stutter` | 12 | 0.7 | 1 | lighten | 0 | none | (n/a) |
| `ink_ghost` | 2 | 0.8 | 0.7 | min | 0 | none | (n/a) |

Check with the packet executor how presets are persisted in this repo
(no preset-file convention search was in scope for this planning pass —
if effect presets are a `PRESETS` dict in the module vs an external
`.glitchpreset`-style JSON, follow whatever `fx.copy_machine.py` does, if
it ships presets at all; if it doesn't, this may be new plumbing and
should be flagged back as its own Open Decision before build, not
invented here).

---

## 3. Model (verbatim from source spec, § Model + § Semantics)

This section describes the `echo`-style engine only. The `ghost`-style
engine has no separate model section — it IS
`backend/src/effects/fx/afterimage.py:42-69` today (opponent-process
adaptation + inverted-diff blend, re-read this session), moved verbatim
into a private helper (§1) with zero formula changes. Do not re-derive
or "clean up" the ghost math while moving it; the move itself is the
byte-identical oracle (§4.1a).

> `out = blend(current, prev_out · decay) per pixel, mode-dependent` — the
> s-3d.html max-composite ghost trick as a first-class 2D effect.
>
> feedback=0 or opacity=0 ⇒ byte-identical passthrough and NO carried
> state.
>
> State: ONE accumulation buffer (the echo line) + a small frame ring
> when delay_frames>1 (cap 30, half-res storage option if memory
> pressure; SG8-aware).
>
> Implementation is single-buffer recursive (like an analog delay line),
> NOT N-copies: echo line = blend(ring[t-delay], echo_line·feedback→echo_transform);
> per-recursion diminish and compounding loop-transform fall out
> naturally.
>
> Deterministic sequential; scrub caveat documented (datamosh-class).
>
> Composes with backspin: afterimage AFTER backspin in a chain gives
> smeared spin-backs — template material. [Out of scope to build; noted
> for chain-ordering awareness only — `fx.backspin` is a separate change.]

### Implementation-note sketch (NOT verbatim — derive-at-build-time, resolves OD-4 to its recommended default)

This is a recommended starting point, not a pinned contract. The
implementer must verify it against all 8 oracles in §4 before considering
the packet done; if it fails any of them, the equation must change, not
the oracle.

Per the T1 combo, this sketch sits behind a dispatcher, not at the top of
`apply()`:

```
def apply(frame, params, state_in=None, *, frame_index, seed, resolution):
    style = params.get("style", "echo")   # missing key -> "echo" (clean-break default)
    if style == "ghost":
        return _apply_ghost(frame, params, state_in)  # verbatim move of current lines 42-69
    return _apply_echo(frame, params, state_in, frame_index=frame_index, seed=seed, resolution=resolution)
```

`_apply_echo` is the sketch below, unchanged in content from the prior
draft (only renamed from bare `apply` to `_apply_echo`):

```
state = { ring: [...raw frames, cap=30], echo_line: ndarray|None }

on frame t:
  ring.append(current)  # raw, full-res (spec allows half-res under SG8
                         # pressure, deferred per OD-5 — v1 stores full-res)
  if len(ring) > 30: ring.pop(0)

  if echo_line is None or len(ring) <= delay_frames:
      # No echo history yet (frame_index == 0 case, or ring not yet
      # deep enough for delay_frames). Pure passthrough — do NOT seed
      # echo_line with zeros and run it through `mode`, which would
      # inject a spurious black/gray frame for min/average modes.
      output = current
      state_out = {"ring": ring, "echo_line": None} if (feedback>0 and opacity>0) else None
      return output, state_out

  tap = ring[-1 - delay_frames]                      # ring[t - delay_frames]
  tap = threshold_gate(tap, threshold)                 # only pixels > threshold seed echoes
  transformed_echo = echo_transform_fn(echo_line, transform_amount, color_drift)
  echo_line = opacity * tap + feedback * transformed_echo   # OD-4(a): fixed weighted sum, NOT mode-dependent
  composited = mode_blend(current, tint_fn(echo_line, tint), mode)  # OD-4(a): mode applies here only
  output = lerp(current, composited, mix)
  state_out = {"ring": ring, "echo_line": echo_line}
  return output, state_out
```

Purity check against this sketch: `feedback=0` → `echo_line` stays at
whatever `opacity*tap` contributes each frame with zero carry-forward
(NOT byte-identical unless `opacity` is also 0) — re-read the spec's
purity line: *"feedback=0 **OR** opacity=0 ⇒ byte-identical passthrough."*
The sketch must special-case `opacity==0` (skip entirely, no tap
contribution) and separately special-case `feedback==0` (echo_line ==
`opacity*tap` every frame with no memory — this is NOT byte-identical to
current unless the compositing step also happens to no-op). **This means
the sketch above is incomplete for the `feedback=0` purity leg** and the
implementer must special-case both: `if feedback == 0 or opacity == 0:
output = current; state_out = None` as an explicit early-return, ahead of
the general path. Flagging this explicitly rather than leaving it
implicit — the purity oracle (§4, oracle 1) is the acceptance gate, not
this sketch.

---

## 4. Test Plan

### 4.1 Backend unit layer — `backend/tests/test_afterimage.py` (new)

Direct multi-frame `apply()` sequences, following
`backend/tests/test_copy_machine.py`'s pattern (e.g. its
`test_ring_is_capped` at line 563, `test_rewind_pulse_plays_ring_backward`
at line 543 — introspects `state["ring"]` directly rather than only
round-tripping through rendered video).

Oracles (verbatim from source spec § Tests, each maps to ≥1 test case):

1. **Bypass purity**: `feedback=0` OR `opacity=0` ⇒ output bit-identical
   to input, `state_out is None`, across ≥3 consecutive frames.
2. **Echo energy monotonic in feedback**: fixed impulse input, sweep
   `feedback` low→high at fixed `opacity`; assert echo-region mean pixel
   delta from a `feedback=0` baseline is non-decreasing.
3. **Echo energy monotonic in opacity**: same, sweeping `opacity`.
4. **Echo spacing == delay_frames exactly (impulse test)**: feed a single
   bright impulse frame into an otherwise-black sequence; assert the
   first visible echo appears at exactly `frame_index == delay_frames`
   frames after the impulse, not before, not after (off-by-one is a real
   risk — see the OD-4 recursion-index ambiguity; this test is what pins
   the final answer).
5. **Per-recursion diminish matches `opacity·feedback^n`** within
   rounding: measure echo-region intensity at each of several
   `n`-frame-later samples after an impulse, fit against the formula,
   assert within a documented tolerance (mirror the tolerance style used
   by `backend/tests/test_effects/test_calibration.py`'s
   `mean_pixel_diff` checks).
6. **`echo_transform` compounds (geometric, not linear)**: 2 recursions
   of e.g. `hue_shift` transform_amount must NOT equal 1 recursion at 2x
   `transform_amount` — assert the two differ.
7. **`color_drift` rotates per echo**: successive echoes show
   monotonically increasing hue offset (measure via `cv2.cvtColor` HSV
   hue channel, same technique as `backend/src/effects/fx/hue_shift.py:39-42`).
8. **`tint` never touches the current frame**: with `tint != "none"`,
   assert the CURRENT-frame-only region (pixels with zero echo
   contribution, e.g. before any echo has arrived) is pixel-identical to
   the same run with `tint == "none"`.
9. **`threshold` gates echo seeding**: pixels below threshold in the
   source never appear in the echo buffer; verify via a synthetic
   half-bright/half-dark frame.
10. **Determinism**: already covered generically by
    `backend/tests/test_effect_harness.py::TestEffectDeterminism` — no
    new test needed, but the new model must not regress it (uses
    `noise` frame, `frame_index=5`, twice — no RNG is used by this
    effect per the model, so this should hold trivially; confirm no
    accidental `np.random`/unseeded call sneaks into `echo_transform`
    filters).
11. **State bounded (1 buffer + ring ≤ 30)**: after N>30 frames, assert
    `len(state["ring"]) <= 30` and `echo_line.shape` stays constant
    (no unbounded growth) — same pattern as `test_copy_machine.py`'s
    `test_ring_is_capped` (line 563).

Oracles 1-11 above exercise the `echo` style only — every test case must
explicitly pass `params={"style": "echo", ...}` (or omit `style`, since
`echo` is the default) so the suite keeps testing the right engine even
after `ghost` is re-added to `PARAMS`.

### 4.1a `ghost`-style regression + style-switch boundary (T1 combo — new, same file)

Two additional oracle classes required by the T1 combo verdict, both in
`backend/tests/test_afterimage.py`:

12. **`ghost` byte-identical to pre-refactor behavior (the verbatim-move
    oracle).** Since `_apply_ghost` is a straight move of
    `backend/src/effects/fx/afterimage.py:43-69` (re-read this session:
    `adaptation = adaptation + adaptation_rate * (rgb - adaptation)`;
    `diff = adaptation - rgb`; `afterimage = 0.5 + diff`; `result = rgb *
    (1.0 - strength) + afterimage * strength`, clip-and-cast at line 67),
    the test must inline that exact four-line formula as a **hand-copied
    reference implementation directly in the test file** (copied from
    this read, not re-derived from the prose model) and assert
    `apply(frame, {"style": "ghost", "adaptation_rate": ..., "strength":
    ...}, state_in, ...)` matches the reference bit-for-bit across: (a)
    defaults (`adaptation_rate=0.05`, `strength=0.5`), (b) both params at
    min (`0.01`/`0.0`), (c) both at max (`0.2`/`1.0`), (d) a 5-frame
    sequence with carried `state_in={"adaptation": ...}` to confirm the
    state dict shape/key (`"adaptation"`) is unchanged. This is the
    single test that proves the "verbatim move, no formula edits" claim
    in §1/§3 rather than asserting it by comment alone.
13. **Style-switch default (clean-break) boundary.** `params` dict with
    no `"style"` key at all (simulating old persisted project data that
    predates this change) must produce output identical to
    `params={"style": "echo", ...same other keys...}` — i.e. confirm the
    dispatcher's `params.get("style", "echo")` default, not just assume
    it from the source line. Pair with a second case: `params` with an
    unrecognized `style` value (e.g. `"bogus"`, simulating a
    hand-edited/corrupted project file) — pin whatever behavior the
    implementer chooses (recommended: same fallback to `echo`, since the
    dispatcher's `if style == "ghost": ... else: ...` structure already
    makes anything non-`"ghost"` fall through to `echo` for free) so the
    behavior is asserted, not accidental.

### 4.2 Calibration / schema layer — no new file, existing tests must pass unmodified

- `backend/tests/test_effects/test_calibration.py::test_numeric_params_have_curve`
  and `::test_numeric_params_have_unit` — re-verified this session
  (`test_calibration.py:19-35`) that both gates only iterate params where
  `pdef.get("type") in ("float", "int")`, so the new `style` choice param
  needs neither field (matches existing choice params `mode`/
  `echo_transform`/`tint` having none — pattern already correct in the
  prior draft). Every float/int param in the **merged** `PARAMS` dict —
  both the `echo`-style rows (§2) AND the moved `adaptation_rate`/
  `strength` ghost-style rows — needs `curve` + `unit`; `adaptation_rate`/
  `strength` already carry `curve="linear"`/`unit=""` verbatim in the
  live file (lines 16-17, 26-27) so this gate passes for them
  automatically as long as the move doesn't drop those keys. This is a
  **live CI gate** (`UNIFICATION-2026-07-03.md` §D-3 confirms
  `test_numeric_params_have_unit` is already enforced and currently
  failing on an unrelated effect — don't add a second failure).
- `test_effect_at_defaults` / `_min` / `_max` (re-read this session,
  `test_calibration.py:49-95`) — for choice-type params these three
  tests always set `params[k] = v["default"]` (only float/int params get
  swept to `min`/`max`; the `else` branch at lines 74/93 falls through to
  `default` for every non-numeric param). Since `style`'s `default` is
  `"echo"`, **all three of these generic tests only ever exercise the
  `echo` engine, never `ghost`, for `fx.afterimage`** — this is not
  speculative, it's a direct consequence of the harness code as written.
  `ghost`-path defaults/min/max survival is therefore covered exclusively
  by oracle 12 in §4.1a; do not assume this generic layer gives it any
  coverage.

### 4.3 Parameter-sweep layer — `backend/tests/test_parameter_sweep.py`

Two independent kinds of inertness now apply — do not conflate them.

**(a) Frame-0 inertness within the `echo` style (pre-existing concern,
unchanged by the T1 combo).** Verify, don't assume, whether `mode`/
`tint`/`threshold` (or any echo param) is frame-0-inert under the
Implementation-note sketch in §3: per that sketch, frame 0 (and every
frame until `len(ring) > delay_frames`) is a hard passthrough for
**every** echo param — so the correct registration is likely to **keep**
the existing blanket `"fx.afterimage"` entry in `STATEFUL_FRAME0` (no
split into per-param `DEPENDENT_PARAMS` needed for this reason alone).
Confirm this empirically once `apply()` is written — if any param DOES
show frame-0 impact, that param must move to a scoped `DEPENDENT_PARAMS`
entry instead.

**(b) Cross-style inertness (new, T1 combo).** Independent of (a): under
the sweep's default call shape (every param at its schema `default`
except the one being swept), `style` stays at its default, `"echo"`. That
means:
  - `adaptation_rate` and `strength` (ghost-style params) will show
    `diff == 0.0` when swept, because the dispatcher never reads them
    while `style="echo"` — they must be registered as
    `("fx.afterimage", "adaptation_rate")` /
    `("fx.afterimage", "strength")` in `DEPENDENT_PARAMS`, with a comment
    citing this exact reason (structurally identical to
    `("fx.copy_machine", "cell_size")` being a no-op under the default
    `machine="toner"`, `test_parameter_sweep.py:170-176`, re-confirmed
    this session).
  - Conversely, if `SWEEP_CASES` generates a case for `style` itself
    (sweeping `"echo"` → `"ghost"` low/high), that case should show a
    REAL diff (the two engines produce different math) and must NOT be
    added to `DEPENDENT_PARAMS` — confirm this is not accidentally
    suppressed.
  - Follow the `("fx.copy_machine", "freeze")`-style documented-entry
    convention (`test_parameter_sweep.py:109-196`) — each new entry needs
    a comment explaining WHY, matching house convention, not a bare
    tuple.

### 4.4 Oracle / CLI-render layer — `backend/tests/oracles/test_afterimage_oracle.py`

- This oracle renders at param defaults, so post-combo it exercises the
  `echo` engine (default `style`) exactly as OD-2 intended — no change to
  OD-2's disposition from the T1 combo. `ghost` gets no CLI-render oracle
  in this change (out of scope; its correctness is covered by the
  byte-identical unit oracle in §4.1a, which is a stronger guarantee than
  an `nth_frame_l1_distance` render check anyway).
- Per OD-2: replace the first-frame `per_pixel_l1_distance` assertion
  with `nth_frame_l1_distance(mandelbrot_clip_output, original, n=10)`
  (clip is 2s @ 30fps = 60 frames per `conftest.py`'s `mandelbrot_clip`
  fixture (lines 67-97): `-t 2` duration at `rate=30` in the inline ffmpeg
  invocation, no separate helper function, plenty of headroom for `n=10`).
  Keep the `@pytest.mark.oracle`
  marker and the `mandelbrot_clip`/`tmp_path` fixture usage identical to
  the existing file's structure — only the distance function and `n`
  change.
- Optionally (not required, executor's call) add oracle coverage for the
  `vaporwave` preset specifically, since it's the headline named preset
  in the source spec.

### 4.5 Harness / smoke layer — no new file

- `backend/tests/test_effect_harness.py` (survival, shape, type-preserve,
  range-preserve, determinism, 10-frame stateful continuity, 500ms@1080p
  timing budget) already parametrizes over every registered effect id —
  `fx.afterimage` is automatically included. Run the full
  `-m smoke` tier locally before declaring the packet done (per repo
  `CLAUDE.md`: `cd backend && python -m pytest -x -n auto --tb=short`).
- Perf note from the source spec: *"afterimage = one blend (~4.9ms
  @1080p full-res, cv2 path mandatory)"* — comfortably inside the 500ms
  budget; still use `cv2` (not manual numpy loops) for the HSV rotation
  (`color_drift`) and any blur/pixelate `echo_transform`, per the
  measured 15x speedup precedent at
  `backend/src/effects/fx/hue_shift.py:1-5` and the general C-contiguous
  mandate (`np.ascontiguousarray` precedent at
  `backend/src/effects/fx/pixelsort.py:72`,
  `backend/src/masking/key_kernels.py:302`).

### 4.6 BDD scenarios

The source spec does not carry BDD/Gherkin scenarios for `fx.afterimage`
specifically (the doc header mentions "BDD Feature 12 scenarios" as the
acceptance layer for the backspin+afterimage spec as a whole, but no
`.feature` file or Given/When/Then text was found in the required
reading set, and `find` for a `Feature 12` file was not part of this
change's required sources). If such a file exists elsewhere in the repo
it was not located during this planning pass — flag back to the
orchestrator to locate `Feature 12` before packetize, rather than
inventing Gherkin text here.

---

## 5. Packet candidates

| Packet | Files | Risk | Oracle |
|---|---|---|---|
| **P1 — effect rewrite (combo dispatcher)** | `backend/src/effects/fx/afterimage.py` (merge, not full-replace: add `style` discriminator + full echo-model `PARAMS`/`apply()` path; move lines 42-69 verbatim into `_apply_ghost`, keep `adaptation_rate`/`strength` PARAMS entries byte-identical; module docstring documents OD-3's max/lighten aliasing AND the two-engine dispatch) | MED — adds a new engine and a dispatcher to a live registered effect (T1 combo supersedes OD-1's replace-in-place); no external callers found (grep-confirmed) so blast radius is contained to this one file; the diminish-formula/mode-scope ambiguity (OD-4) means the echo path may need a second pass once oracles run; the ghost-move carries LOW risk in isolation (mechanical, oracle-12-verified) but raises the packet's overall file-diff size | `cd backend && python -m pytest tests/test_afterimage.py tests/test_effects/test_calibration.py -x --tb=short` all green (covers both engines + oracle 12's byte-identical ghost check + oracle 13's style-switch default); `python -m pytest tests/test_effect_harness.py -k afterimage -x` green |
| **P2 — dedicated unit test file** | `backend/tests/test_afterimage.py` (new) | LOW — additive test file, no production code touched | File exists, all 11 `echo` cases (§4.1) + 2 combo cases (§4.1a, oracles 12-13) present and passing against P1's implementation |
| **P3 — oracle fix** | `backend/tests/oracles/test_afterimage_oracle.py` | LOW — single assertion swap (OD-2), isolated file; unaffected by the combo (renders at defaults, which is `style=echo`) | `cd backend && python -m pytest tests/oracles/test_afterimage_oracle.py -x --tb=short` green (was red immediately after P1 lands, before P3) |
| **P4 — parameter-sweep registration audit** | `backend/tests/test_parameter_sweep.py` (edit expected, not just verify — the combo's cross-style inertness in §4.3(b) is a known, not merely possible, `DEPENDENT_PARAMS` addition for `adaptation_rate`/`strength`) | LOW — additive `DEPENDENT_PARAMS` entries with documented reasons, following house convention (`fx.copy_machine`'s `machine`-scoped entries, lines 170-196) | `cd backend && python -m pytest tests/test_parameter_sweep.py -k afterimage -x --tb=short` green, zero unexplained skips or failures; both `adaptation_rate`/`strength` (ghost) AND any newly-discovered echo frame-0 exclusions are accounted for, not just one direction |

**Suggested order:** P1 → P2 (needs P1's real `apply()` — both branches
— to write meaningful assertions against) → P3 (P1 breaks it, so P3 must
land in the same merge unit as P1, not stranded) → P4 (§4.3(b)'s
cross-style entries are now a known requirement, not a maybe, so this
packet is no longer purely a "confirm-or-adjust" step — do not skip it
expecting a no-op). P1 and P3 should not ship independently of each
other — landing P1 alone leaves `main` red on the existing oracle.

**Explicitly not a packet in this change** (per proposal.md's Out of
Scope): any `fx.backspin` file, any SG-8 `FeatureRegistry` registration,
any frontend file, any preset-persistence plumbing beyond what
`fx.copy_machine.py` already establishes as precedent (flagged in §2 as
needing its own check before build if no precedent exists).

---

## 6. Open items carried forward (not blocking this plan, but not silently dropped)

- Whether the repo has ANY existing "effect presets" mechanism (as
  opposed to whole-chain/project presets) was not resolved during this
  planning pass — the 4 named presets (§2) need a landing spot the
  executor must locate or, if none exists, flag as new scope before
  building rather than inventing a persistence format here.
- The "BDD Feature 12" reference (§4.6) — locate before packetize.
- OD-4's recursion-index convention (0- vs 1-based `n` in
  `opacity·feedback^n`) is pinned to a recommended default but the exact
  numeric tolerance for oracle 5 (§4.1) is left to the implementer,
  consistent with how `backend/src/effects/_calibration.py`'s own
  `mean_pixel_diff` checks use empirically-chosen thresholds rather than
  exact equality.
- **T1 combo carryover:** proposal.md's T1 Verdicts section requires a PR
  body note ("Old projects (no `style` param) default to `echo` —
  acceptable clean-break per project.md; note in PR body") — the
  executor must add this note when opening the PR; not a plan-time item,
  but flagged so it isn't dropped between plan and packet execution.
- The 4 named presets (§2) are all `echo`-style (per the source spec,
  which predates the combo) — confirm during build whether a `ghost`-
  style preset is wanted (none specified by any source; not inventing
  one here). Absent a request, ship zero `ghost` presets — the style
  still works via direct param entry.
