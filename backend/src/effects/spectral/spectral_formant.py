"""A4 Spectral Formant — multiplicative envelope tilt across the freq axes."""

from ._effect_base import TRANSFORM_PARAM, make_apply

EFFECT_ID = "fx.spectral_formant"
EFFECT_NAME = "Spectral Formant"
EFFECT_CATEGORY = "spectral"

PARAMS: dict = {
    "tilt": {
        "type": "float",
        "min": -2.0,
        "max": 2.0,
        "default": 0.5,
        "label": "Tilt",
        "curve": "linear",
        "unit": "",
        "description": "Spectral tilt: >0 boosts high freqs, <0 boosts low freqs",
    },
    **TRANSFORM_PARAM,
}

apply = make_apply("formant", ("tilt",))
