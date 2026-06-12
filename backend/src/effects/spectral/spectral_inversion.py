"""A4 Spectral Inversion — swap high/low spectral bands (reverse both axes)."""

from ._effect_base import TRANSFORM_PARAM, make_apply

EFFECT_ID = "fx.spectral_inversion"
EFFECT_NAME = "Spectral Inversion"
EFFECT_CATEGORY = "spectral"

# No primitive-specific params; only the shared transform selector.
PARAMS: dict = {
    **TRANSFORM_PARAM,
}

apply = make_apply("inversion", ())
