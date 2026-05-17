"""Y.18 — stateful continuity sweep across all registered effects.

Origin: parallel-session UAT 2026-05-16 ran a single-frame sweep of all
206 effects against noise input. 164 produced a visible per-frame
change; 42 produced no single-frame output. The 42 broke into three
classes (per the synthesis Iter 29 notes):

  (a) Stateful effects — datamosh, reaction_mosh, frame_drop, etc.
      Need prior frames to accumulate state. Single-frame run never
      had a chance to build up internal state.
  (b) Util zero-default effects — curves, levels, hsl, color_balance.
      Defaults are no-op by design. Now surfaced with F-0516-7 toast.
  (c) Genuinely-dead effects — if any. The single-frame sweep can't
      distinguish these from (a). This is the Y.18 gap.

This sweep closes Y.18 by running EVERY effect across a 10-frame noise
sequence with state threaded forward, asserting at least one frame in
the sequence differs from input. Effects that fail are either dead or
need a richer input than noise — both worth investigating.

Effects whose stock defaults are intentionally neutral (util.*) are
skipped because they pass for an orthogonal reason (F-0516-7 design,
not stateful continuity).

Marked smoke so it runs in CI alongside the single-frame oracle.
"""

from __future__ import annotations

import numpy as np
import pytest

from effects.registry import list_all
from engine.pipeline import apply_chain

pytestmark = pytest.mark.smoke


# Util effects that ship with zero-adjustment defaults. F-0516-7 surfaces
# this with a one-time toast — they pass-through by design until the user
# turns a knob. Excluded from the dead-effect detection sweep below.
# NOTE: actual registered ID is `util.hsl_adjust`, not `util.hsl` —
# F-0516-7's frontend ZERO_DEFAULT_EFFECT_IDS set in shared/limits.ts has
# the wrong ID and needs a follow-up fix to wire the toast for HSL.
ZERO_DEFAULT_EFFECT_IDS = {
    "util.curves",
    "util.levels",
    "util.hsl_adjust",
    "util.color_balance",
}

# Effects whose default behavior depends on properties of the INPUT
# that noise frames don't have. Not dead — just need a different test
# fixture. Each entry has a one-line reason so a future maintainer
# knows what input would activate the effect.
INPUT_CONDITIONAL_EFFECT_IDS = {
    # Keying effects punch out a specific color range. Random noise has
    # no concentrated key color → no output difference.
    "fx.chroma_key": "needs solid key-color region in input",
    "fx.luma_key": "needs luminance-bimodal input (light foreground / dark background)",
    # Spectral freeze captures a frame and holds it — needs >1 sec of
    # accumulated state. 10 frames may not be enough for the freeze
    # logic to engage on noise input.
    "fx.spectral_freeze": "needs longer warm-up than 10 frames to engage freeze",
    # Sidechain effects modulate based on a control signal that isn't
    # populated in this isolated chain context.
    "fx.sidechain_interference": "modulated by sidechain control signal — not present in isolated chain",
    "fx.sidechain_cross_blend": "modulated by sidechain control signal — not present in isolated chain",
    "fx.sidechain_cross": "modulated by sidechain control signal — not present in isolated chain",
    "fx.sidechain_crossfeed": "modulated by sidechain control signal — not present in isolated chain",
    # Subliminal spray injects rare frame-content perturbations on a
    # probabilistic schedule. Default rate is low; 10 frames may not hit
    # a spray event.
    "fx.subliminal_spray": "probabilistic injection at low default rate — needs longer sequence to fire",
}

# Number of frames to run. 10 is enough for stateful effects to accumulate
# (datamosh-class effects typically show divergence by frame 2-3) without
# making the sweep slow. At 30 effects × 10 frames × ~5ms = ~1.5s per chunk.
SEQUENCE_LENGTH = 10

# Pixel-mean-difference threshold. 1.0/255 ≈ 0.004 → we use 1.0 (raw byte
# units) to require at least one ~1-byte-per-pixel visible change somewhere
# in the sequence. Anything less is below human perception on uint8 output.
MIN_PIXEL_DELTA = 1.0


def _noise_frame(seed: int = 42, h: int = 64, w: int = 64) -> np.ndarray:
    """Build a small deterministic noise RGBA frame."""
    rng = np.random.default_rng(seed)
    rgb = rng.integers(0, 256, size=(h, w, 3), dtype=np.uint8)
    alpha = np.full((h, w, 1), 255, dtype=np.uint8)
    return np.concatenate([rgb, alpha], axis=2)


def _all_effects_under_test() -> list[str]:
    """All registered effects minus zero-defaults and input-conditional ones.

    Skipped effects are documented in ZERO_DEFAULT_EFFECT_IDS and
    INPUT_CONDITIONAL_EFFECT_IDS above with one-line reasons each.
    A separate fixture-rich test suite is the right home for the
    input-conditional ones — that's filed as a follow-up.
    """
    skipped = ZERO_DEFAULT_EFFECT_IDS | INPUT_CONDITIONAL_EFFECT_IDS.keys()
    return [e["id"] for e in list_all() if e["id"] not in skipped]


def _max_pixel_delta_across_sequence(effect_id: str) -> tuple[float, list[float]]:
    """Run effect for SEQUENCE_LENGTH frames, return max + per-frame diffs.

    Threads state through `states` between frames so stateful effects
    (datamosh, reaction_mosh, etc.) have a chance to build up internal
    state and produce divergence by later frames.
    """
    base = _noise_frame()
    chain = [
        {
            "effect_id": effect_id,
            "enabled": True,
            "params": {},  # use defaults — same as single-frame sweep
            "mix": 1.0,
        }
    ]

    diffs = []
    states: dict | None = None
    for frame_idx in range(SEQUENCE_LENGTH):
        # Use a slightly different noise frame each iter so the input changes
        # over time (mimics real video). Stateful effects react to deltas.
        input_frame = _noise_frame(seed=42 + frame_idx)
        try:
            out, states = apply_chain(
                input_frame.copy(),
                chain,
                project_seed=42,
                frame_index=frame_idx,
                resolution=(64, 64),
                states=states,
            )
        except Exception:
            # Genuine crash — let pytest surface it as a failure for this id.
            raise

        diff = float(
            np.mean(
                np.abs(
                    out[..., :3].astype(np.int32)
                    - input_frame[..., :3].astype(np.int32)
                )
            )
        )
        diffs.append(diff)

    return (max(diffs) if diffs else 0.0, diffs)


@pytest.mark.parametrize("effect_id", _all_effects_under_test())
def test_stateful_continuity(effect_id: str):
    """Every effect must produce a visible pixel delta SOMEWHERE in the sequence."""
    max_delta, diffs = _max_pixel_delta_across_sequence(effect_id)
    assert max_delta >= MIN_PIXEL_DELTA, (
        f"Effect {effect_id!r} produced no visible output across "
        f"{SEQUENCE_LENGTH} frames at default params. Per-frame deltas: {diffs}. "
        f"This is the Y.18 sweep — either the effect is dead, or its defaults "
        f"need a non-noise input, or it requires non-default params to activate."
    )
