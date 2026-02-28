"""Debug crash effect — deliberately raises for UAT testing.

Only registered when APP_ENV=development.
"""

import numpy as np

EFFECT_ID = "debug.crash"
EFFECT_NAME = "Debug Crash (dev only)"
EFFECT_CATEGORY = "debug"
PARAMS: dict = {}


def apply(
    frame: np.ndarray,
    params: dict,
    state_in: dict | None = None,
    *,
    frame_index: int,
    seed: int,
    resolution: tuple[int, int],
) -> tuple[np.ndarray, dict | None]:
    """Always raises ZeroDivisionError for crash isolation testing."""
    raise ZeroDivisionError("Deliberate crash for UAT")
