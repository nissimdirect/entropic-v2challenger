"""A4 Spectral Smear — smooth (box-blur) the spectrum within the frame.

NOTE (deferred gap, SPEC-7 §2.6): the spec table describes smear as a
phase-scramble (|F|·e^(iφ_random)). This implementation is a spectral box-blur
(plausible, visually distinct), shipped as-is; math/spec reconciliation is a
documented follow-up.
"""

from ._effect_base import TRANSFORM_PARAM, make_apply

EFFECT_ID = "fx.spectral_smear"
EFFECT_NAME = "Spectral Smear"
EFFECT_CATEGORY = "spectral"

PARAMS: dict = {
    "kernel": {
        "type": "int",
        "min": 1,
        "max": 15,
        "default": 3,
        "label": "Kernel",
        "curve": "linear",
        "unit": "bins",
        "description": "Box-blur kernel size in spectrum space (1 = identity)",
    },
    **TRANSFORM_PARAM,
}

apply = make_apply("smear", ("kernel",))
