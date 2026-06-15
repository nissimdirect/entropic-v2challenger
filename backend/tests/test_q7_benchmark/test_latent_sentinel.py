"""Tests for SG-3 latent NaN/Inf sentinel (PR #15).

Pure-function module → all tests are unit-level. The in-app validation
happens when downstream code (PR #11 SG-8 or future Tier 5 features)
calls this on a real feedback runaway and the toast fires for the user.
Per [[feedback_sdlc-verify-in-app-not-just-code]].
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest

BACKEND_SRC = Path(__file__).resolve().parents[2] / "src"
if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))

from safety.latent_sentinel import (
    DEFAULT_L2_CEILING,
    DEFAULT_L2_FLOOR,
    MAX_L2_NORM_PER_BACKBONE,
    LatentSentinelError,
    SentinelAction,
    SentinelResult,
    batch_validate,
    check_and_clamp,
    get_l2_ceiling_for_backbone,
    safe_normalize,
)


def _make_latent(values: list[float]) -> np.ndarray:
    return np.array(values, dtype=np.float32)


# ---------------------------------------------------------------------------
# Threshold sentinels
# ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_default_ceiling_is_10():
    assert DEFAULT_L2_CEILING == 10.0


@pytest.mark.smoke
def test_default_floor_is_micro():
    assert DEFAULT_L2_FLOOR == 1e-6


# ---------------------------------------------------------------------------
# PASSTHROUGH
# ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_unit_vector_passes_through():
    lat = _make_latent([0.6, 0.8])  # L2 = 1.0
    result = check_and_clamp(lat)
    assert result.action == SentinelAction.PASSTHROUGH
    assert result.latent is lat  # no copy on passthrough
    assert result.pre_l2_norm == pytest.approx(1.0, abs=1e-5)
    assert result.post_l2_norm == result.pre_l2_norm


@pytest.mark.smoke
def test_mid_range_vector_passes_through():
    """L2 between floor and ceiling → PASSTHROUGH."""
    lat = _make_latent([3.0, 4.0])  # L2 = 5.0
    result = check_and_clamp(lat)
    assert result.action == SentinelAction.PASSTHROUGH
    assert result.pre_l2_norm == pytest.approx(5.0, abs=1e-5)


@pytest.mark.smoke
def test_zero_dim_high_dim_passthrough():
    """High-dim (384/512/1024) unit vectors are common; verify passthrough."""
    rng = np.random.default_rng(7)
    for dim in (384, 512, 1024):
        vec = rng.standard_normal(dim).astype(np.float32)
        vec /= np.linalg.norm(vec)
        result = check_and_clamp(vec)
        assert result.action == SentinelAction.PASSTHROUGH


# ---------------------------------------------------------------------------
# CLAMPED
# ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_above_ceiling_gets_clamped():
    """L2 = 20 → clamp to L2 = 1."""
    lat = _make_latent([12.0, 16.0])  # L2 = 20
    result = check_and_clamp(lat)
    assert result.action == SentinelAction.CLAMPED
    assert result.pre_l2_norm == pytest.approx(20.0, abs=1e-4)
    assert result.post_l2_norm == pytest.approx(1.0, abs=1e-5)
    # Direction preserved
    expected = lat / 20.0
    np.testing.assert_allclose(result.latent, expected, rtol=1e-5)


@pytest.mark.smoke
def test_clamped_dtype_preserved():
    lat32 = np.array([12.0, 16.0], dtype=np.float32)
    lat64 = np.array([12.0, 16.0], dtype=np.float64)
    assert check_and_clamp(lat32).latent.dtype == np.float32
    assert check_and_clamp(lat64).latent.dtype == np.float64


@pytest.mark.smoke
def test_custom_ceiling():
    lat = _make_latent([3.0, 4.0])  # L2 = 5
    # With ceiling=4, this gets clamped
    result = check_and_clamp(lat, l2_ceiling=4.0)
    assert result.action == SentinelAction.CLAMPED


# ---------------------------------------------------------------------------
# REJECTED_NAN
# ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_nan_raises():
    lat = _make_latent([1.0, float("nan"), 0.5])
    with pytest.raises(LatentSentinelError) as excinfo:
        check_and_clamp(lat, context="C8-feedback")
    assert excinfo.value.action == SentinelAction.REJECTED_NAN
    assert "C8-feedback" in str(excinfo.value)


@pytest.mark.smoke
def test_nan_no_raise_returns_status():
    lat = _make_latent([1.0, float("nan"), 0.5])
    result = check_and_clamp(lat, raise_on_reject=False)
    assert result.action == SentinelAction.REJECTED_NAN


@pytest.mark.smoke
def test_all_nan_raises():
    lat = _make_latent([float("nan")] * 5)
    with pytest.raises(LatentSentinelError):
        check_and_clamp(lat)


# ---------------------------------------------------------------------------
# REJECTED_INF
# ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_inf_raises():
    lat = _make_latent([1.0, float("inf"), 0.5])
    with pytest.raises(LatentSentinelError) as excinfo:
        check_and_clamp(lat)
    assert excinfo.value.action == SentinelAction.REJECTED_INF


@pytest.mark.smoke
def test_negative_inf_raises():
    lat = _make_latent([1.0, float("-inf"), 0.5])
    with pytest.raises(LatentSentinelError) as excinfo:
        check_and_clamp(lat)
    assert excinfo.value.action == SentinelAction.REJECTED_INF


# ---------------------------------------------------------------------------
# REJECTED_ZERO
# ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_zero_vector_raises():
    lat = _make_latent([0.0, 0.0, 0.0])
    with pytest.raises(LatentSentinelError) as excinfo:
        check_and_clamp(lat)
    assert excinfo.value.action == SentinelAction.REJECTED_ZERO


@pytest.mark.smoke
def test_subfloor_vector_raises():
    """Tiny non-zero vector below floor → rejected (can't normalize)."""
    lat = _make_latent([1e-9, 2e-9])
    with pytest.raises(LatentSentinelError):
        check_and_clamp(lat)


@pytest.mark.smoke
def test_custom_floor():
    lat = _make_latent([0.01, 0.02])
    # Default floor accepts this (~0.022)
    result = check_and_clamp(lat)
    assert result.action == SentinelAction.PASSTHROUGH
    # With floor=0.1, rejected
    with pytest.raises(LatentSentinelError):
        check_and_clamp(lat, l2_floor=0.1)


# ---------------------------------------------------------------------------
# Type guard
# ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_integer_input_raises_typeerror():
    lat = np.array([1, 2, 3], dtype=np.int32)
    with pytest.raises(TypeError, match="float32 or float64"):
        check_and_clamp(lat)


@pytest.mark.smoke
def test_bool_input_raises_typeerror():
    lat = np.array([True, False], dtype=bool)
    with pytest.raises(TypeError):
        check_and_clamp(lat)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_safe_normalize_unit_vector_returns_input():
    lat = _make_latent([0.6, 0.8])
    out = safe_normalize(lat)
    assert out is lat  # passthrough → identity


@pytest.mark.smoke
def test_safe_normalize_clamps_runaway():
    lat = _make_latent([12.0, 16.0])
    out = safe_normalize(lat)
    assert np.linalg.norm(out) == pytest.approx(1.0, abs=1e-5)


@pytest.mark.smoke
def test_safe_normalize_raises_on_nan():
    with pytest.raises(LatentSentinelError):
        safe_normalize(_make_latent([float("nan"), 0.1]))


@pytest.mark.smoke
def test_batch_validate_counts_actions():
    latents = [
        _make_latent([0.6, 0.8]),  # PASSTHROUGH
        _make_latent([12.0, 16.0]),  # CLAMPED
        _make_latent([float("nan")]),  # REJECTED_NAN
        _make_latent([0.0, 0.0]),  # REJECTED_ZERO
        _make_latent([float("inf")]),  # REJECTED_INF
    ]
    counts = batch_validate(latents)
    assert counts[SentinelAction.PASSTHROUGH] == 1
    assert counts[SentinelAction.CLAMPED] == 1
    assert counts[SentinelAction.REJECTED_NAN] == 1
    assert counts[SentinelAction.REJECTED_INF] == 1
    assert counts[SentinelAction.REJECTED_ZERO] == 1


@pytest.mark.smoke
def test_batch_validate_skips_bad_dtype():
    """Bad dtype is skipped in batch (logged, not raised)."""
    latents = [
        _make_latent([0.6, 0.8]),
        np.array([1, 2, 3], dtype=np.int32),  # skipped
    ]
    counts = batch_validate(latents)
    assert counts[SentinelAction.PASSTHROUGH] == 1
    # int32 was skipped; not in any category


@pytest.mark.smoke
def test_sentinel_action_enum_str_values():
    """Enum values are strings (JSON-friendly for telemetry)."""
    assert SentinelAction.PASSTHROUGH.value == "passthrough"
    assert SentinelAction.CLAMPED.value == "clamped"


@pytest.mark.smoke
def test_sentinel_result_carries_norms():
    lat = _make_latent([12.0, 16.0])
    result = check_and_clamp(lat)
    assert isinstance(result, SentinelResult)
    assert result.pre_l2_norm > 19  # ~20
    assert result.post_l2_norm == pytest.approx(1.0, abs=1e-5)


# ---------------------------------------------------------------------------
# Per-backbone ceiling table (SPEC-3 §3.3) — P5b.5
# ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_per_backbone_ceiling_override_sd_vae():
    """SD VAE ceiling (5.0) clamps a vector with L2 = 7 that default would pass."""
    # L2 = sqrt(3² + 4² + ...) — use a vector with L2 just above sd_vae's 5.0
    # 3-4-0 gives L2 = 5; scale up to 6 → above sd_vae ceiling, below default (10)
    lat = _make_latent([3.6, 4.8])  # L2 = 6.0
    ceiling = get_l2_ceiling_for_backbone("sd_vae")  # 5.0
    result = check_and_clamp(lat, l2_ceiling=ceiling)
    assert result.action == SentinelAction.CLAMPED, (
        f"expected CLAMPED with sd_vae ceiling={ceiling}; got {result.action}"
    )
    assert result.post_l2_norm == pytest.approx(1.0, abs=1e-5)


@pytest.mark.smoke
def test_per_backbone_ceiling_override_clip_image():
    """CLIP image ceiling (2.0): a unit-norm vector (L2=1) passes; L2=3 is clamped."""
    unit = _make_latent([0.6, 0.8])  # L2 = 1.0
    ceiling = get_l2_ceiling_for_backbone("clip_image")  # 2.0
    result_pass = check_and_clamp(unit, l2_ceiling=ceiling)
    assert result_pass.action == SentinelAction.PASSTHROUGH

    above = _make_latent([1.8, 2.4])  # L2 = 3.0
    result_clamp = check_and_clamp(above, l2_ceiling=ceiling)
    assert result_clamp.action == SentinelAction.CLAMPED


@pytest.mark.smoke
def test_per_backbone_ceiling_override_unknown_backbone_falls_back_to_default():
    """Unknown backbone name → DEFAULT_L2_CEILING."""
    ceiling = get_l2_ceiling_for_backbone("nonexistent_backbone_xyz")
    assert ceiling == DEFAULT_L2_CEILING


@pytest.mark.smoke
def test_per_backbone_ceiling_override_default_entry_equals_default_constant():
    """MAX_L2_NORM_PER_BACKBONE['_default'] must equal DEFAULT_L2_CEILING."""
    assert MAX_L2_NORM_PER_BACKBONE["_default"] == DEFAULT_L2_CEILING


@pytest.mark.smoke
def test_per_backbone_ceiling_all_values_positive():
    """Every value in MAX_L2_NORM_PER_BACKBONE must be a positive float."""
    for name, ceiling in MAX_L2_NORM_PER_BACKBONE.items():
        assert isinstance(ceiling, (int, float)), f"{name}: not numeric"
        assert ceiling > 0, f"{name}: ceiling must be > 0, got {ceiling}"


@pytest.mark.smoke
def test_per_backbone_ceiling_get_empty_string_falls_back():
    """Empty-string backbone name → _default."""
    assert get_l2_ceiling_for_backbone("") == MAX_L2_NORM_PER_BACKBONE["_default"]


@pytest.mark.smoke
def test_per_backbone_ceiling_get_non_string_falls_back():
    """Non-string backbone argument → _default (no TypeError)."""
    assert get_l2_ceiling_for_backbone(None) == MAX_L2_NORM_PER_BACKBONE["_default"]  # type: ignore[arg-type]
    assert get_l2_ceiling_for_backbone(42) == MAX_L2_NORM_PER_BACKBONE["_default"]  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Fuzz: malformed latents — never crash, never silent-pass (P5b.5)
# ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_fuzz_malformed_latents_never_silent_pass():
    """A suite of adversarial latents must all be rejected or clamped (never PASSTHROUGH)."""
    # Cases that must raise LatentSentinelError (NaN/Inf/zero):
    bad_latents = [
        np.array([float("nan")], dtype=np.float32),
        np.array([float("inf")], dtype=np.float32),
        np.array([float("-inf"), 1.0], dtype=np.float32),
        np.array([float("nan"), float("nan"), float("nan")], dtype=np.float32),
        np.array([0.0, 0.0], dtype=np.float32),  # zero vector
        np.array([1e-9], dtype=np.float32),  # below floor
        np.array([float("nan")] * 512, dtype=np.float32),  # high-dim all-NaN
        np.array([0.0] * 1024, dtype=np.float32),  # high-dim all-zero
        np.full(256, float("inf"), dtype=np.float64),  # float64 Inf
    ]
    for lat in bad_latents:
        with pytest.raises(LatentSentinelError):
            check_and_clamp(lat)

    # Cases that must be CLAMPED (huge but finite):
    huge_latents = [
        np.array([1e9, 0.0], dtype=np.float32),
        np.array([1e38, 1e38], dtype=np.float32),
        np.full(512, 1000.0, dtype=np.float32),
    ]
    for lat in huge_latents:
        result = check_and_clamp(lat)
        assert result.action == SentinelAction.CLAMPED, (
            f"expected CLAMPED for huge latent; got {result.action}"
        )
        assert np.isfinite(result.post_l2_norm), "post-clamp norm must be finite"

    # Cases that must raise TypeError (wrong dtype):
    wrong_dtype = [
        np.array([1, 2, 3], dtype=np.int32),
        np.array([1, 2], dtype=np.uint8),
        np.array([True, False], dtype=bool),
    ]
    for lat in wrong_dtype:
        with pytest.raises(TypeError):
            check_and_clamp(lat)


@pytest.mark.smoke
def test_fuzz_negative_dim_latent():
    """Negative-valued but finite latents in valid range → PASSTHROUGH or CLAMPED, never error."""
    lat = np.array([-0.6, -0.8], dtype=np.float32)  # L2=1, negative direction
    result = check_and_clamp(lat)
    assert result.action == SentinelAction.PASSTHROUGH
    assert result.latent is lat  # no copy


@pytest.mark.smoke
def test_fuzz_mixed_nan_finite():
    """A single NaN anywhere in the array triggers rejection."""
    rng = np.random.default_rng(99)
    for dim in (4, 64, 256):
        lat = rng.standard_normal(dim).astype(np.float32)
        lat[dim // 2] = float("nan")
        with pytest.raises(LatentSentinelError) as exc:
            check_and_clamp(lat)
        assert exc.value.action == SentinelAction.REJECTED_NAN


@pytest.mark.smoke
def test_fuzz_single_element_extremes():
    """Single-element edge cases are handled correctly."""
    # Exact floor edge
    lat_floor_ok = np.array([DEFAULT_L2_FLOOR * 2], dtype=np.float32)
    result = check_and_clamp(lat_floor_ok)
    assert result.action == SentinelAction.PASSTHROUGH

    # Just below floor
    lat_floor_bad = np.array([DEFAULT_L2_FLOOR / 2], dtype=np.float32)
    with pytest.raises(LatentSentinelError) as exc:
        check_and_clamp(lat_floor_bad)
    assert exc.value.action == SentinelAction.REJECTED_ZERO

    # Exact ceiling edge — should PASSTHROUGH (inclusive upper bound check is >)
    lat_ceil_ok = np.array([DEFAULT_L2_CEILING], dtype=np.float32)
    result2 = check_and_clamp(lat_ceil_ok)
    assert result2.action == SentinelAction.PASSTHROUGH

    # Just above ceiling
    lat_ceil_bad = np.array([DEFAULT_L2_CEILING + 0.001], dtype=np.float32)
    result3 = check_and_clamp(lat_ceil_bad)
    assert result3.action == SentinelAction.CLAMPED
