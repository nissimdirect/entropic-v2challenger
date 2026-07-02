# Transitions Content Sprint — Pattern Doc

**Source spec:** `docs/addendums/LAYER-TRANSITIONS.md` (53 transition types
across 11 sections; confirmed on `origin/main`, referenced by
`docs/roadmap/ROADMAP.md` §2.5 decision 2 and `docs/roadmap/packets/parallel-track.md`
PD.13).

**Status:** First 3 transitions shipped in `pkt/transitions-v2` — this doc is
the template for authoring the remaining 50. "First 3 establish the pattern"
per the locked decision; the rest is batch Haiku/Sonnet work.

Shipped so far (Geometric Reveals #1-3):

| # | Effect ID | Name | File |
|---|-----------|------|------|
| 1 | `fx.transition_column_cascade` | Column Cascade | `backend/src/effects/fx/transition_column_cascade.py` |
| 2 | `fx.transition_column_cascade_reverse` | Column Cascade Reverse | `backend/src/effects/fx/transition_column_cascade_reverse.py` |
| 3 | `fx.transition_row_waterfall` | Row Waterfall | `backend/src/effects/fx/transition_row_waterfall.py` |

---

## 1. Contract

The addendum's target architecture (see its "Architecture Notes" section) is
a two-layer signature:

```
(frame_a, frame_b, params, progress, state_in) -> (result, state_out)
```

That needs real layer-to-layer compositing, which does not exist yet in this
codebase — it's gated on Phase 5 / B5 composite-tree work (ROADMAP.md §2.5).
**Until that lands, every transition in this sprint runs inside the EXISTING
single-frame `fx.*` effect contract** (same one every other effect in
`backend/src/effects/fx/` uses):

```python
def apply(
    frame: np.ndarray,          # (h, w, 4) uint8 RGBA
    params: dict,
    state_in: dict | None = None,
    *,
    frame_index: int,
    seed: int,
    resolution: tuple[int, int],
) -> tuple[np.ndarray, dict | None]:
    ...
```

Adaptation used by the first 3 (reuse this for the rest unless a transition's
reveal genuinely needs different plumbing, e.g. audio-synced ones need
`params` to carry an amplitude/onset value fed by the modulation engine — see
§4):

- `frame_b` ("incoming" layer) = the `frame` argument.
- `frame_a` ("outgoing" layer) = solid black, standing in for "nothing
  revealed yet." Alpha is carried through unchanged from `frame` so the
  transition only affects color, not transparency.
- `progress` = `frame_index / duration_frames`, clamped to `[0, 1]`.
- Every transition takes a `duration_frames` param (int, sensible min/max,
  default ~30) and a reveal-density param (`columns`, `rows`, or whatever fits
  the transition's geometry).
- State is `None` unless the transition genuinely needs continuity across
  frames (e.g. physics/organic reveals with a persistent particle field —
  follow `fx.afterimage`'s `state_in`/`state_out` pattern for those).
- All numeric params MUST be clamped inside `apply()` regardless of the
  declared PARAMS min/max (trust-boundary rule — a param dict can arrive with
  out-of-range or malformed values from IPC/automation/presets).

When real two-layer compositing lands, swap `frame_a` for a second real input
and thread `progress` from the compositor instead of deriving it from
`frame_index`. The rest of the reveal math (the per-pixel/column/row mask
logic) carries over unchanged.

## 2. Registration (registry is EXPLICIT-IMPORT, not auto-discovery)

See `docs/solutions/2026-05-14-effect-registry-explicit-import.md` — a new
`fx/<name>.py` file is invisible to the CLI/runtime until it's in BOTH the
import block AND the matching `mods` list in
`backend/src/effects/registry.py`.

Steps:

1. Write `backend/src/effects/fx/<name>.py` with `EFFECT_ID` (prefix
   `fx.transition_`), `EFFECT_NAME`, `EFFECT_CATEGORY = "transition"`,
   `PARAMS`, and `apply()`.
2. Open `backend/src/effects/registry.py`. Find the "Transitions content
   sprint v2" block (search `transition_column_cascade`) inside
   `_auto_register()`.
3. Add the new module name to the `from effects.fx import (...)` block right
   above `phase12_mods`.
4. Add the same module name to the `phase12_mods = [...]` list.
   **Do NOT invent a new `*_mods` list** — `test_no_orphan_module_lists`
   (`backend/tests/test_effects/test_registry.py`) fails the build if you do.
   Every transition module goes on `phase12_mods`.
5. Verify:
   ```bash
   cd backend
   PYTHONPATH=src python3 -c "from effects.registry import get; assert get('fx.transition_<name>') is not None"
   PYTHONPATH=src python3 src/cli.py list | grep fx.transition_<name>
   ```
   Both must show the new id. If the CLI list doesn't show it, the import/mods
   wiring is incomplete — the file existing is not enough.

## 3. Test template

One test file per transition at `backend/tests/test_effects/test_transition_<name>.py`,
marked `pytest.mark.smoke` (pure numpy, no I/O). Minimum coverage (see the
first 3 files for a full worked example):

1. **Registered-in-registry guard** — `registry.get(EFFECT_ID)` is not
   `None`, and `name`/`category` match. Catches "wrote the file, forgot the
   registry" (the exact failure mode the prior attempt shipped).
2. **Frame-zero baseline** — at `frame_index=0`, output matches the "nothing
   revealed" state (usually fully black RGB, alpha preserved).
3. **Visible transition at defaults** — at some `frame_index` between 0 and
   `duration_frames`, assert the output is PARTIALLY revealed: some region
   equals the input frame's color, another region is still the black
   stand-in, and the two regions provably differ
   (`assert not np.array_equal(...)`). This is the "prove it's actually
   visible" assertion — a test that only checks `result.shape` or
   `result.dtype` does NOT prove the transition renders.
4. **Fully revealed after duration** — at `frame_index == duration_frames`,
   output equals the input frame exactly.
5. **Clamp past duration** — `frame_index` far beyond `duration_frames`
   produces the same fully-revealed output (no wraparound/overflow).
6. **Determinism** — same `(frame, params, state_in, frame_index, seed,
   resolution)` in, same bytes out, called twice.
7. **Custom params respected** — non-default `duration_frames` +
   density param changes the reveal boundary as expected.
8. **Out-of-range param clamp** — negative/huge param values never crash and
   never escape `dtype=uint8` / original `shape` (trust-boundary rule,
   `feedback_numeric-trust-boundary.md`).

Run per-transition:
```bash
cd backend && python3 -m pytest tests/test_effects/ -k "transition" -q
```
`-k transition` matches on the test module's name, so keep `transition` in
every new test file's basename.

## 4. Category-specific notes for the remaining 50

- **Geometric Reveals (#4-15, 12 left):** same pattern as the first 3 — a
  per-pixel mask (radial for Iris, angular for Clock Wipe, diagonal distance
  for Diagonal Slash, etc.) compared against `progress`. No state needed.
- **Pixel/Digital Reveals (#16-24, 9):** deterministic per-pixel randomness
  (`Pixel Dissolve`) should derive its mask from `seed` + fixed pixel
  coordinates (not `np.random` reseeded per call) so the determinism test
  still holds — follow `fx.bitcrush`'s `engine.determinism.make_rng(seed)`
  convention if a transition needs a stable-per-seed random field.
- **Glitch-Native Reveals (#25-35, 11):** several of these (Channel Shift
  Arrival, Datamosh Blend, Compression Artifact) can be implemented as
  variations on the existing single-frame mask approach — reveal each RGB
  channel independently for Channel Shift, for example.
- **Physics/Organic Reveals (#36-46, 11):** these are the ones that likely
  need real `state_in`/`state_out` continuity (e.g. Cellular Automata, Ink
  Bleed). Follow `fx.afterimage`'s state pattern: initialize from
  `state_in` if present and shape-compatible, else seed fresh from `frame`.
- **Audio-Synced Reveals (#47-53, 7):** these need an amplitude/onset value
  that isn't in the current `apply()` signature. Do NOT invent a new
  parameter out of thin air — check whether the modulation/routing engine
  (`backend/src/engine/modulation/`) can feed an audio-derived value through
  `params` (similar to how sidechain effects consume levels) before writing
  these. This is a scoping question for whoever picks up that batch, not
  something to guess at.

## 5. What NOT to do (prior attempt's failure mode, PR #367 — CLOSED)

- Do not create `effects/shared/transitions.py` or any shared helper module
  unless you actually wire the import correctly and prove it resolves
  (`python3 -c "import effects.shared.transitions"` from `backend/`). The
  prior attempt referenced a shared module that never got created, so every
  transition importing it failed at import time and the registry silently
  dropped them — but the tests it shipped didn't actually exercise the CLI
  path, so it looked green. **Always run the CLI list check in §2 step 5, not
  just direct `apply()` calls.**
- Do not invent a new `*_mods` list name in `registry.py` — use
  `phase12_mods`.
- Do not report tests as passing without pasting real `pytest` output —
  fabricated pass counts is why the prior PR was closed.
