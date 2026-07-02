"""Invert effect — inverts RGB channels, preserves alpha."""

import numpy as np

EFFECT_ID = "fx.invert"
EFFECT_NAME = "Invert"
EFFECT_CATEGORY = "fx"

PARAMS: dict = {}  # No user-facing params (mix/mask handled by container)


def apply(
    frame: np.ndarray,
    params: dict,
    state_in: dict | None = None,
    *,
    frame_index: int,
    seed: int,
    resolution: tuple[int, int],
) -> tuple[np.ndarray, dict | None]:
    """Invert RGB channels. Stateless."""
    output = frame.copy()
    output[:, :, :3] = 255 - frame[:, :, :3]
    return output, None
