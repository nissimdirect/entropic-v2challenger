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
    LatentSentinelError,
    SentinelAction,
    SentinelResult,
    batch_validate,
    check_and_clamp,
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
