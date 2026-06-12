"""Registration test for the A4 Spectral Frame Warper effects (SPEC-7 §A4).

Asserts the six spectral primitives are discoverable via the effect registry
and conform to the pure-function effect contract. This is the AC gate:
"six effects registered + appear in browser" (the browser is fed by list_all()).
"""

from __future__ import annotations

import numpy as np
import pytest

from effects.registry import get, list_all

SPECTRAL_EFFECT_IDS = (
    "fx.spectral_shift",
    "fx.spectral_comb",
    "fx.spectral_smear",
    "fx.spectral_formant",
    "fx.spectral_parity",
    "fx.spectral_inversion",
)


@pytest.mark.smoke
@pytest.mark.parametrize("effect_id", SPECTRAL_EFFECT_IDS)
def test_spectral_effect_is_registered(effect_id: str) -> None:
    info = get(effect_id)
    assert info is not None, f"{effect_id} not in registry"
    assert callable(info["fn"])
    assert info["category"] == "spectral"
    assert isinstance(info["name"], str) and info["name"]


@pytest.mark.smoke
def test_all_six_spectral_effects_discoverable() -> None:
    ids = {e["id"] for e in list_all()}
    missing = set(SPECTRAL_EFFECT_IDS) - ids
    assert not missing, f"spectral effects missing from list_all(): {sorted(missing)}"


@pytest.mark.smoke
@pytest.mark.parametrize("effect_id", SPECTRAL_EFFECT_IDS)
def test_spectral_effect_conforms_to_contract(effect_id: str) -> None:
    """apply(frame, params, state_in, *, frame_index, seed, resolution) -> (frame, state)."""
    info = get(effect_id)
    assert info is not None
    fn = info["fn"]

    rng = np.random.default_rng(7)
    frame = rng.integers(0, 256, size=(48, 48, 4), dtype=np.uint8)
    params = {k: v["default"] for k, v in info["params"].items()}

    output, state_out = fn(
        frame,
        params,
        None,
        frame_index=0,
        seed=0,
        resolution=(48, 48),
    )

    assert output.shape == frame.shape, "output must preserve HxWx4 shape"
    assert output.dtype == np.uint8
    # Alpha channel must be preserved (spectral warp touches RGB only).
    np.testing.assert_array_equal(output[:, :, 3], frame[:, :, 3])
    assert state_out is None, (
        "spectral effects are stateless (recursive F-mod deferred)"
    )


@pytest.mark.smoke
@pytest.mark.parametrize("effect_id", SPECTRAL_EFFECT_IDS)
def test_spectral_effect_changes_busy_frame(effect_id: str) -> None:
    """Each effect should visibly alter a high-energy frame (not a silent no-op)."""
    info = get(effect_id)
    assert info is not None
    fn = info["fn"]

    rng = np.random.default_rng(11)
    frame = rng.integers(0, 256, size=(48, 48, 4), dtype=np.uint8)
    params = {k: v["default"] for k, v in info["params"].items()}

    output, _ = fn(frame, params, None, frame_index=0, seed=0, resolution=(48, 48))
    delta = float(np.abs(output[:, :, :3].astype(np.int32) - frame[:, :, :3]).mean())
    assert delta > 0.1, f"{effect_id} produced no visible change (delta={delta:.3f})"


@pytest.mark.smoke
@pytest.mark.parametrize("effect_id", SPECTRAL_EFFECT_IDS)
def test_spectral_effect_fft_transform_path(effect_id: str) -> None:
    """The opt-in FFT basis runs without error and preserves shape."""
    info = get(effect_id)
    assert info is not None
    fn = info["fn"]

    rng = np.random.default_rng(13)
    frame = rng.integers(0, 256, size=(32, 32, 4), dtype=np.uint8)
    params = {k: v["default"] for k, v in info["params"].items()}
    params["transform"] = "fft"

    output, _ = fn(frame, params, None, frame_index=0, seed=0, resolution=(32, 32))
    assert output.shape == frame.shape
    assert output.dtype == np.uint8
