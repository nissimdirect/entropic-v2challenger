"""Registration tests for the spectral family extension: A5 + C4 (SPEC-7).

Asserts `fx.spectral_granulator` (A5) and `fx.band_isolated` (C4) are
discoverable via the registry and conform to the pure-function effect contract.
This is the AC gate: the effects appear in the browser (fed by list_all()).
"""

from __future__ import annotations

import numpy as np
import pytest

from effects.registry import get, list_all

EXT_EFFECT_IDS = (
    "fx.spectral_granulator",
    "fx.band_isolated",
)


@pytest.mark.smoke
@pytest.mark.parametrize("effect_id", EXT_EFFECT_IDS)
def test_ext_effect_is_registered(effect_id: str) -> None:
    info = get(effect_id)
    assert info is not None, f"{effect_id} not in registry"
    assert callable(info["fn"])
    assert info["category"] == "spectral"
    assert isinstance(info["name"], str) and info["name"]
    # Each exposes a `primitive` enum param (A4 primitive selector).
    assert "primitive" in info["params"]


@pytest.mark.smoke
def test_both_ext_effects_discoverable() -> None:
    ids = {e["id"] for e in list_all()}
    missing = set(EXT_EFFECT_IDS) - ids
    assert not missing, f"ext effects missing from list_all(): {sorted(missing)}"


@pytest.mark.smoke
def test_a4_warpers_still_registered() -> None:
    """Additive guard: the merged A4 effects must remain registered alongside."""
    ids = {e["id"] for e in list_all()}
    a4 = {
        "fx.spectral_shift",
        "fx.spectral_comb",
        "fx.spectral_smear",
        "fx.spectral_formant",
        "fx.spectral_parity",
        "fx.spectral_inversion",
    }
    assert a4 <= ids, f"A4 effects dropped: {sorted(a4 - ids)}"


@pytest.mark.smoke
@pytest.mark.parametrize("effect_id", EXT_EFFECT_IDS)
def test_ext_effect_conforms_to_contract(effect_id: str) -> None:
    """apply(frame, params, state_in, *, frame_index, seed, resolution) -> (frame, state)."""
    info = get(effect_id)
    assert info is not None
    fn = info["fn"]

    rng = np.random.default_rng(7)
    frame = rng.integers(0, 256, size=(48, 48, 4), dtype=np.uint8)
    params = {k: v["default"] for k, v in info["params"].items()}

    output, state_out = fn(
        frame, params, None, frame_index=0, seed=0, resolution=(48, 48)
    )

    assert output.shape == frame.shape, "output must preserve HxWx4 shape"
    assert output.dtype == np.uint8
    # Alpha channel preserved (spectral ops touch RGB only).
    np.testing.assert_array_equal(output[:, :, 3], frame[:, :, 3])
    assert state_out is None, "ext spectral effects are stateless (deferred features)"


@pytest.mark.smoke
@pytest.mark.parametrize("effect_id", EXT_EFFECT_IDS)
def test_ext_effect_changes_busy_frame(effect_id: str) -> None:
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
def test_granulator_each_primitive_runs() -> None:
    """A5 granulator runs for every A4 primitive without error."""
    from effects.spectral.primitives import SUPPORTED_PRIMITIVES

    info = get("fx.spectral_granulator")
    assert info is not None
    fn = info["fn"]
    rng = np.random.default_rng(3)
    frame = rng.integers(0, 256, size=(48, 48, 4), dtype=np.uint8)

    for primitive in SUPPORTED_PRIMITIVES:
        params = {k: v["default"] for k, v in info["params"].items()}
        params["primitive"] = primitive
        out, _ = fn(frame, params, None, frame_index=0, seed=1, resolution=(48, 48))
        assert out.shape == frame.shape


@pytest.mark.smoke
def test_band_isolated_narrow_band_changes_less_than_full() -> None:
    """C4: isolating a narrow band changes the frame less than a full-band warp."""
    info = get("fx.band_isolated")
    assert info is not None
    fn = info["fn"]
    rng = np.random.default_rng(5)
    frame = rng.integers(0, 256, size=(64, 64, 4), dtype=np.uint8)

    base = {k: v["default"] for k, v in info["params"].items()}

    narrow = dict(base, primitive="smear", low_frac=0.45, high_frac=0.5)
    wide = dict(base, primitive="smear", low_frac=0.0, high_frac=1.0)

    out_narrow, _ = fn(frame, narrow, None, frame_index=0, seed=0, resolution=(64, 64))
    out_wide, _ = fn(frame, wide, None, frame_index=0, seed=0, resolution=(64, 64))

    d_narrow = float(
        np.abs(out_narrow[:, :, :3].astype(np.int32) - frame[:, :, :3]).mean()
    )
    d_wide = float(np.abs(out_wide[:, :, :3].astype(np.int32) - frame[:, :, :3]).mean())
    assert d_narrow < d_wide, (
        f"narrow ({d_narrow:.2f}) should change less than wide ({d_wide:.2f})"
    )
