"""A4 Spectral Comb — periodic spectral dropouts at modulatable spacing."""

from ._effect_base import TRANSFORM_PARAM, make_apply

EFFECT_ID = "fx.spectral_comb"
EFFECT_NAME = "Spectral Comb"
EFFECT_CATEGORY = "spectral"

PARAMS: dict = {
    "period": {
        "type": "int",
        "min": 2,
        "max": 32,
        "default": 3,
        "label": "Period",
        "curve": "linear",
        "unit": "bins",
        "description": "Zero every Nth spectral row/column",
    },
    **TRANSFORM_PARAM,
}

apply = make_apply("comb", ("period",))
