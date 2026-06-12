"""A4 Spectral Shift — translate spectral coefficients along the freq axes."""

from ._effect_base import TRANSFORM_PARAM, make_apply

EFFECT_ID = "fx.spectral_shift"
EFFECT_NAME = "Spectral Shift"
EFFECT_CATEGORY = "spectral"

PARAMS: dict = {
    "dy": {
        "type": "int",
        "min": -32,
        "max": 32,
        "default": 1,
        "label": "Shift Y",
        "curve": "linear",
        "unit": "bins",
        "description": "Vertical spectral translation (bins; wraps around)",
    },
    "dx": {
        "type": "int",
        "min": -32,
        "max": 32,
        "default": 1,
        "label": "Shift X",
        "curve": "linear",
        "unit": "bins",
        "description": "Horizontal spectral translation (bins; wraps around)",
    },
    **TRANSFORM_PARAM,
}

apply = make_apply("shift", ("dy", "dx"))
