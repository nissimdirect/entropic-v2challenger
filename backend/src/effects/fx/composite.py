"""Composite effect — the TERMINAL track-compositing primitive (P2.2c, slice 3c).

This is NOT an ordinary frame transform. Compositing (per-track opacity + blend
mode) was previously read from `Track.opacity` / `Track.blendMode` data-model
fields. The v3 clean break (Decision D1) removed those fields; compositing now
lives as a single TERMINAL `composite` EffectInstance at the END of a track's
effect chain (see frontend `shared/types.ts` getTerminalComposite / Decision D4
ships the 9 existing blend modes).

WHY this module exists even though its `apply` is an identity no-op:
  * It registers `composite` in the effect registry so the EffectBrowser tile
    lights up and the validated drag-onto-track path goes live (P2.2b wired the
    UI; this registration is the backend half).
  * It declares the contractual params — `opacity` (0..1) and `mode` (the 9
    canonical blend modes, BLEND_MODES at compositor.py:69, Decision D4) — so the
    tile's controls render and the modulation engine can resolve it via
    registry.get without raising "unknown effect".

WHY `apply` is identity (Decision D3 — the double-apply guard):
  The compositor (engine.compositor.render_composite) reads opacity/mode FROM the
  chain terminal and applies the blend itself, ONCE, when stacking layers. The
  per-layer effect pipeline (engine.pipeline.apply_chain) DETECTS the terminal
  composite and SKIPS it, so the blend is never applied twice. If this `apply`
  ever transformed the frame, a composite that survived into apply_chain (a bug)
  would corrupt the layer before the compositor blended it — the 9 per-blend-mode
  hash-stability tests are the catch for any double-apply regression.
"""

import numpy as np

EFFECT_ID = "composite"
EFFECT_NAME = "Composite"
EFFECT_CATEGORY = "composite"

# The 9 shipped blend modes (Decision D4) — must stay in lockstep with
# BLEND_MODES at backend/src/engine/compositor.py:69 and VALID_BLEND_MODES in
# frontend/src/shared/types.ts. A divergence here surfaces as a mode the tile
# offers but the compositor falls back to "normal" for.
BLEND_MODE_OPTIONS = [
    "normal",
    "add",
    "multiply",
    "screen",
    "overlay",
    "difference",
    "exclusion",
    "darken",
    "lighten",
]

PARAMS: dict = {
    "opacity": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 1.0,
        "label": "Opacity",
        "curve": "linear",
        "unit": "%",
        "description": "Per-track layer opacity when composited onto the stack.",
    },
    "mode": {
        "type": "choice",
        "options": BLEND_MODE_OPTIONS,
        "default": "normal",
        "label": "Blend Mode",
        "description": "Blend mode used when this track's layer is composited.",
    },
}


def apply(
    frame: np.ndarray,
    params: dict,
    state_in: dict | None = None,
    *,
    frame_index: int,
    seed: int,
    resolution: tuple[int, int],
) -> tuple[np.ndarray, dict | None]:
    """Identity no-op — compositing is applied by render_composite, not here.

    See module docstring (Decision D3). The terminal composite is skipped by
    apply_chain; this fn exists only so registry.get('composite') resolves. If it
    ever executes, returning the frame unchanged keeps a stray composite from
    double-applying the blend.
    """
    return frame, None
