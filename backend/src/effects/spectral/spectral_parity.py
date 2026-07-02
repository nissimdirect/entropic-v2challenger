"""A4 Spectral Parity — sign-flip alternating spectral coefficients.

NOTE (deferred gap, SPEC-7 §2.6): the spec table describes parity as an even/odd
coefficient boost (F·(1+α·parity(u+v))). This implementation flips the sign of
the checkerboard-complementary bins; math/spec reconciliation is a documented
follow-up.
"""

from ._effect_base import TRANSFORM_PARAM, make_apply

EFFECT_ID = "fx.spectral_parity"
EFFECT_NAME = "Spectral Parity"
EFFECT_CATEGORY = "spectral"

PARAMS: dict = {
    "sign": {
        "type": "float",
        "min": -2.0,
        "max": 2.0,
        "default": -1.0,
        "label": "Sign",
        "curve": "linear",
        "unit": "",
        "description": "Multiplier applied to the complementary parity bins",
    },
    **TRANSFORM_PARAM,
}

apply = make_apply("parity", ("sign",))
