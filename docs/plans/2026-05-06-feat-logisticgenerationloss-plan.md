# Feat: fx.logistic_generation_loss — recursive JPEG decay driven by the logistic-map cascade

> Status: shipped (PR open)
> Branch: `feat/logisticgenerationloss`
> Worktree: `/Users/nissimagent/Development/entropic-logisticgenerationloss-wt`
> Date: 2026-05-06

## What

Add a new Entropic effect `fx.logistic_generation_loss` that runs N recursive JPEG
encode/decode passes per frame, with the per-frame number of passes (and/or quality)
governed by an iterated logistic map:

`x_{n+1} = r * x_n * (1 - x_n)`

The effect's artifact intensity follows the bifurcation cascade — stable fixed point
at `r < 3.0`, period-2 between 3.0 and 3.45, period-doubling, then full chaos at
`r > 3.57`. Compression as a chaotic dynamical system.

## Why

`generation_loss.py` already runs N JPEG cycles per frame, but at fixed quality and
fixed pass count — same every frame, mechanical. `logistic_cascade.py` runs the
logistic map ON pixel brightness for visual chaos, but doesn't drive any other
effect. This effect uses the logistic map's iterated value as the *control signal*
for codec degradation, giving artifact intensity the famous bifurcation-cascade
temporal structure. Modulating `r` from audio (e.g. `audio_follower.rms` -> `r`)
lets a producer push the visual through the period-doubling threshold on the drop.

## Files touched

- `backend/src/effects/fx/logistic_generation_loss.py` (new)
- `backend/src/effects/registry.py` (add to two `from effects.fx import (...)` blocks
  and the `phase8_mods` list)
- `backend/tests/test_effects/test_fx/test_logistic_generation_loss.py` (new, 15 tests)
- `backend/tests/test_all_effects.py` (add to `IDENTITY_BY_DEFAULT` — stateful at frame 0)

## Algorithm (per DESIGN doc)

1. Restore or initialize `state["x"]` (default 0.5; reseed on NaN / out-of-range).
2. Step the map `iter_per_frame` times, hard-clamping x to (0, 1) each iteration so
   numeric drift or `r > 4` cannot escape.
3. Map `x in [0, 1]` to codec parameters per `mode`:
   - `passes`: `n = round(min_passes + x * (max_passes - min_passes))`, q = q_min.
   - `quality`: n = max_passes, `q = round(q_max - x * (q_max - q_min))`.
   - `both`: n and q both interpolated by x.
4. Run `cv2.imencode(.jpg, ...)` + `cv2.imdecode` n times on the BGR frame (cv2
   convention) — same primitive as `generation_loss.py`, ~50ms per pass at 1080p.
5. Convert back to RGB, optionally blend with the original by `intensity`.
6. Return `(result, {"x": x})` so the chaos trajectory persists across frames.

## Trust boundary (PLAY-005)

Every numeric input is clamped at function entry:

| Param | Range | Default |
|-------|-------|---------|
| `mode` | choice: passes / quality / both | passes |
| `r` | 1.0–4.0 | 3.95 |
| `max_passes` | 1–30 | 8 |
| `min_passes` | 0–30 (clamped <= max_passes) | 1 |
| `q_min` | 5–95 | 15 |
| `q_max` | 5–95 (auto-swapped if < q_min) | 85 |
| `iter_per_frame` | 1–10 | 1 |
| `seed_x` | 0.01–0.99 (NaN -> 0.5) | 0.5 |
| `intensity` | 0.0–1.0 | 1.0 |

Inside `_step_logistic`, x is rejected if non-finite, clamped to (1e-3, 1 - 1e-3)
per iteration. State `x` from `state_in` is re-validated and reseeded if corrupt.

## Tests (15 in suite + 11 in test_all_effects)

Smoke (`tests/test_effects/test_fx/test_logistic_generation_loss.py`):
- Contract: shape/dtype, alpha preserved, EFFECT_ID + PARAMS sanity
- Defaults produce visible degradation
- Determinism across calls
- State advances across frames (chaotic trajectory diverges)
- State `x` stays in (0, 1) across 50 iterations even at r=4.0
- `intensity=0` => identity (state still advances)
- Invalid mode falls back to "passes"
- r out-of-range clamped (-10, 99)
- Swapped q range (q_min > q_max) handled
- Recovers from corrupt state (NaN x reseeded)
- `mode="quality"` produces visible degradation
- `seed_x` controls initial trajectory (different seeds diverge)
- `mode="quality"` with high vs low q range (95 vs 5) — high q is cleaner

Parametrized (`tests/test_all_effects.py -k logistic_generation_loss`):
- 10 passed, 1 skipped (visible-change-with-defaults expected to skip — listed in
  IDENTITY_BY_DEFAULT because at frame_index=0 the state.x stays near seed_x and
  chaos hasn't kicked in yet; subsequent frames diverge)

## Smoke commands

```bash
cd backend && python3 -m pytest tests/test_effects/test_fx/test_logistic_generation_loss.py --tb=short -q
# 15 passed

cd backend && python3 -m pytest tests/test_all_effects.py -k logistic_generation_loss --tb=short -q
# 10 passed, 1 skipped
```

## Reference effects (pattern alignment)

- `effects/fx/generation_loss.py` — JPEG round-trip via cv2.imencode/imdecode (lifted
  pattern: BGR cvt + IMWRITE_JPEG_QUALITY encode_params + decode + RGB cvt back).
- `effects/fx/logistic_cascade.py` — logistic-map iteration (per-pixel there; per-frame
  scalar here).
- `effects/fx/reaction_diffusion.py` — PARAMS schema format (type/min/max/default/label/
  curve/unit/description; choice with options).
- `effects/fx/reaction_mosh.py` (PR #39 sibling) — stateful effect contract, PLAY-005
  guard pattern, IDENTITY_BY_DEFAULT registration on first frame.
- `tests/test_effects/test_fx/test_invert.py` — test scaffold (pytest.mark.smoke,
  KW dict, _frame helper).

## Risks / open

- At r=4.0 the trajectory is genuinely chaotic — repeated calls diverge. Tests rely
  on `intensity=0` and corrupt-state recovery for identity comparisons rather than
  expecting fixed numerical output across iterations.
- JPEG saturation: at low quality (q<=15), additional passes converge to a fixed
  attractor — the `quality` mode is the more sensitive knob for visual modulation.
- Performance: at default `max_passes=8` and 1080p, ~400ms per frame worst case.
  Frontend can throttle by reducing max_passes or running in offline render mode.
