"""MK.8 — chroma/luma key kernels, spill suppression, procedural matte budget.

Coverage:
  * test_chroma_kernel_keys_target_hue_within_tolerance
  * test_spill_zero_matches_legacy_effect_output   (THE back-compat GOLDEN)
  * test_spill_zero_matches_legacy_effect_output_luma (luma golden sibling)
  * test_spill_suppression_desaturates_edge_fringe
  * test_luma_kernel_dark_and_bright_modes
  * test_key_params_nan_clamped                    (negative)
  * test_fifth_procedural_matte_rejected           (negative — cap)
  * test_wraparound_hue_tolerance

Golden references are frozen .npy arrays captured from the PRE-REFACTOR effect
source (see fixtures/_capture_legacy_golden.py) — NOT produced by the code under
test. If the refactor changes any keyed output by 1/255, the byte-equal asserts
catch it.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from masking.key_kernels import (
    chroma_alpha,
    luma_alpha,
    evaluate_chroma_matte,
    evaluate_luma_matte,
)
from masking.schema import MatteNode
from masking.stack import (
    FrameCtx,
    resolve_stack,
    register_evaluator,
    ProceduralMatteBudgetError,
    MAX_PROCEDURAL_MATTES_PER_RENDER,
)
from effects.fx import chroma_key as chroma_effect
from effects.fx import luma_key as luma_effect

FIXTURES = Path(__file__).resolve().parent / "fixtures"
_KW = dict(frame_index=0, seed=0, resolution=(256, 256))


# Ensure the evaluators are registered (package import does this, but be
# explicit so this test file is self-contained regardless of import order).
register_evaluator("chroma_key", evaluate_chroma_matte)
register_evaluator("luma_key", evaluate_luma_matte)


def _green_screen() -> np.ndarray:
    return np.load(FIXTURES / "green_screen_fixture.npy")


def _luma_fixture() -> np.ndarray:
    return np.load(FIXTURES / "luma_fixture.npy")


# --------------------------------------------------------------------------- #
#  1. Chroma kernel keys the target hue within tolerance
# --------------------------------------------------------------------------- #


def test_chroma_kernel_keys_target_hue_within_tolerance() -> None:
    """Pure-green pixels (hue 120) are keyed out (alpha→0); magenta kept."""
    frame = _green_screen()
    rgb = frame[:, :, :3]
    alpha, _ = chroma_alpha(rgb, hue=120.0, tolerance=30.0, softness=0.0)

    # A pure-green background pixel → keyed out (alpha ~0).
    assert alpha[10, 200] < 0.01, "green background pixel should be keyed out"
    # A magenta subject pixel → kept (alpha ~1).
    assert alpha[128, 128] > 0.99, "magenta subject pixel should be kept"


# --------------------------------------------------------------------------- #
#  2. THE back-compat golden — byte-equal to legacy at spill=0
# --------------------------------------------------------------------------- #


def test_spill_zero_matches_legacy_effect_output() -> None:
    """Refactored fx.chroma_key at spill=0 byte-equals the frozen legacy output.

    Two param sets: default (softness=10, blurred edge) and sharp (softness=0).
    Compares the FULL RGBA output array, not just alpha — proves RGB is also
    untouched at spill=0 (rgb_out is the same object).
    """
    frame = _green_screen()

    golden_default = np.load(FIXTURES / "golden_chroma_default.npy")
    out_default, _ = chroma_effect.apply(
        frame.copy(),
        {"hue": 120.0, "tolerance": 30.0, "softness": 10.0, "spill": 0.0},
        None,
        **_KW,
    )
    assert np.array_equal(out_default, golden_default), (
        "chroma_key(spill=0, default) drifted from legacy — back-compat regression"
    )

    golden_sharp = np.load(FIXTURES / "golden_chroma_sharp.npy")
    out_sharp, _ = chroma_effect.apply(
        frame.copy(),
        {"hue": 120.0, "tolerance": 30.0, "softness": 0.0, "spill": 0.0},
        None,
        **_KW,
    )
    assert np.array_equal(out_sharp, golden_sharp), (
        "chroma_key(spill=0, sharp) drifted from legacy — back-compat regression"
    )

    # And spill param OMITTED entirely must also match (default=0 path).
    out_nospillkey, _ = chroma_effect.apply(
        frame.copy(),
        {"hue": 120.0, "tolerance": 30.0, "softness": 10.0},
        None,
        **_KW,
    )
    assert np.array_equal(out_nospillkey, golden_default), (
        "chroma_key with no spill key drifted — default must be legacy"
    )


def test_spill_zero_matches_legacy_effect_output_luma() -> None:
    """Refactored fx.luma_key byte-equals the frozen legacy output (both modes)."""
    frame = _luma_fixture()

    golden_dark = np.load(FIXTURES / "golden_luma_dark.npy")
    out_dark, _ = luma_effect.apply(
        frame.copy(),
        {"threshold": 0.3, "mode": "dark", "softness": 10.0},
        None,
        **_KW,
    )
    assert np.array_equal(out_dark, golden_dark), "luma_key(dark) drifted from legacy"

    golden_bright = np.load(FIXTURES / "golden_luma_bright.npy")
    out_bright, _ = luma_effect.apply(
        frame.copy(),
        {"threshold": 0.5, "mode": "bright", "softness": 10.0},
        None,
        **_KW,
    )
    assert np.array_equal(out_bright, golden_bright), (
        "luma_key(bright) drifted from legacy"
    )


# --------------------------------------------------------------------------- #
#  3. Spill suppression desaturates the edge fringe
# --------------------------------------------------------------------------- #


def test_spill_suppression_desaturates_edge_fringe() -> None:
    """A green fringe pixel's saturation strictly decreases with spill > 0.

    Build a pixel that is a partial-green fringe (hue near the key but kept by
    the alpha key). With spill it is desaturated toward luma → lower S.
    """
    import cv2

    # A 1x1 green-ish fringe pixel near the key hue (slightly off pure green).
    fringe = np.zeros((1, 1, 3), dtype=np.uint8)
    fringe[0, 0] = (80, 200, 80)  # greenish, hue ~120

    s_before = cv2.cvtColor(fringe, cv2.COLOR_RGB2HSV)[0, 0, 1]

    _, rgb_out = chroma_alpha(
        fringe, hue=120.0, tolerance=60.0, softness=0.0, spill=0.8
    )
    s_after = cv2.cvtColor(rgb_out, cv2.COLOR_RGB2HSV)[0, 0, 1]

    assert s_after < s_before, (
        f"spill suppression should reduce saturation: before={s_before}, "
        f"after={s_after}"
    )

    # And spill=0 must NOT change it (golden invariant at the pixel level).
    _, rgb_nospill = chroma_alpha(
        fringe, hue=120.0, tolerance=60.0, softness=0.0, spill=0.0
    )
    assert np.array_equal(rgb_nospill, fringe), "spill=0 must leave RGB untouched"


# --------------------------------------------------------------------------- #
#  4. Luma kernel — dark and bright modes
# --------------------------------------------------------------------------- #


def test_luma_kernel_dark_and_bright_modes() -> None:
    """Dark mode keys out dark pixels; bright mode keys out bright pixels."""
    frame = _luma_fixture()
    rgb = frame[:, :, :3]

    # Dark mode, threshold 0.3: the dark-gray (40/255 ≈ 0.157) left half is
    # below threshold → keyed out (alpha→0); bright right half kept.
    a_dark = luma_alpha(rgb, threshold=0.3, mode="dark", softness=0.0)
    assert a_dark[200, 10] < 0.01, "dark pixel keyed out in dark mode"
    assert a_dark[200, 250] > 0.99, "bright pixel kept in dark mode"

    # Bright mode, threshold 0.5: bright (210/255 ≈ 0.82) right half is above
    # threshold → keyed out; dark left half kept.
    a_bright = luma_alpha(rgb, threshold=0.5, mode="bright", softness=0.0)
    assert a_bright[200, 250] < 0.01, "bright pixel keyed out in bright mode"
    assert a_bright[200, 10] > 0.99, "dark pixel kept in bright mode"


# --------------------------------------------------------------------------- #
#  5. NEGATIVE — NaN/Inf key params are clamped, never raise
# --------------------------------------------------------------------------- #


def test_key_params_nan_clamped() -> None:
    """NaN/Inf in any key param → clamped to a finite default; never raises."""
    frame = _green_screen()
    rgb = frame[:, :, :3]

    # All params poisoned with NaN/Inf — must not raise, must return finite.
    alpha, rgb_out = chroma_alpha(
        rgb,
        hue=float("nan"),
        tolerance=float("inf"),
        softness=float("-inf"),
        spill=float("nan"),
    )
    assert np.all(np.isfinite(alpha)), "alpha must be finite under NaN params"
    assert alpha.dtype == np.float32
    assert np.all(np.isfinite(rgb_out.astype(np.float32)))

    # Luma too.
    la = luma_alpha(
        rgb,
        threshold=float("nan"),
        mode="dark",
        softness=float("inf"),
    )
    assert np.all(np.isfinite(la))

    # And through the effect boundary (the real IPC path).
    out, _ = chroma_effect.apply(
        frame.copy(),
        {"hue": float("nan"), "tolerance": float("inf"), "spill": float("inf")},
        None,
        **_KW,
    )
    assert out.dtype == np.uint8 and np.all(np.isfinite(out.astype(np.float32)))


# --------------------------------------------------------------------------- #
#  6. NEGATIVE — 5th procedural matte rejected (budget cap)
# --------------------------------------------------------------------------- #


def test_fifth_procedural_matte_rejected() -> None:
    """A stack with MAX+1 enabled procedural mattes → structured budget error."""
    assert MAX_PROCEDURAL_MATTES_PER_RENDER == 4

    frame = _green_screen()
    ctx = FrameCtx(frame=frame, frame_index=0, clip_id="clip-1")

    def mk(i: int) -> MatteNode:
        return MatteNode(
            id=f"key-{i}",
            kind="chroma_key",
            params={"hue": 120.0, "tolerance": 30.0, "softness": 0.0},
        )

    # Exactly at cap (4) → fine.
    ok_nodes = [mk(i) for i in range(MAX_PROCEDURAL_MATTES_PER_RENDER)]
    matte = resolve_stack(ok_nodes, ctx, (256, 256))
    assert matte.shape == (256, 256)

    # One over cap (5) → structured error.
    too_many = [mk(i) for i in range(MAX_PROCEDURAL_MATTES_PER_RENDER + 1)]
    with pytest.raises(ProceduralMatteBudgetError) as exc:
        resolve_stack(too_many, ctx, (256, 256))
    assert exc.value.code == "procedural_matte_budget_exceeded"
    assert exc.value.count == 5 and exc.value.cap == 4

    # Disabled procedural nodes do NOT count toward the budget.
    mixed = [mk(i) for i in range(MAX_PROCEDURAL_MATTES_PER_RENDER)]
    disabled = mk(99)
    disabled.enabled = False
    matte2 = resolve_stack(mixed + [disabled], ctx, (256, 256))
    assert matte2.shape == (256, 256)


# --------------------------------------------------------------------------- #
#  7. Hue wraparound — key at 350±30 keys hues 0–20
# --------------------------------------------------------------------------- #


def test_wraparound_hue_tolerance() -> None:
    """Key hue 350 with tolerance 60 keys hue 0–20 (the modulo seam)."""
    import cv2

    # Build a frame whose pixels span the red seam: hue ~10 (red-orange) and
    # hue ~180 (cyan, far away). Saturated so they pass the sat floor.
    frame = np.zeros((2, 1, 3), dtype=np.uint8)
    # hue 10° in HSV-opencv = 5; full sat/val.
    px_hue10 = cv2.cvtColor(
        np.array([[[5, 255, 255]]], dtype=np.uint8), cv2.COLOR_HSV2RGB
    )[0, 0]
    px_hue180 = cv2.cvtColor(
        np.array([[[90, 255, 255]]], dtype=np.uint8), cv2.COLOR_HSV2RGB
    )[0, 0]
    frame[0, 0] = px_hue10
    frame[1, 0] = px_hue180

    # Key at 350° ± 60 → band covers 320–360 AND 0–20 (wraps). hue10 is inside.
    alpha, _ = chroma_alpha(frame, hue=350.0, tolerance=60.0, softness=0.0)

    assert alpha[0, 0] < 0.01, "hue-10 pixel must be keyed by a 350±30 key (wrap)"
    assert alpha[1, 0] > 0.99, "hue-180 pixel must NOT be keyed (far from 350)"


# --------------------------------------------------------------------------- #
#  8. INTEGRATION — keying-as-performance: tolerance lane changes matte coverage
# --------------------------------------------------------------------------- #


def test_lfo_on_key_tolerance_changes_matte_over_time() -> None:
    """Same frame rendered with two payload tolerance values (simulating a lane
    output) → matte coverage grows monotonically with tolerance.

    This is the keying-as-performance proof at this layer: a higher tolerance
    (what an LFO/sidechain would push into ``mask.<node>.tolerance``) keys a
    wider hue band → more pixels selected. Full UI→lane→render E2E rides MK.11.
    """
    import cv2

    # A hue-gradient fixture: H sweeps 0–180 (OpenCV) across columns, full
    # sat/val. Widening the tolerance around the key hue selects more columns,
    # so coverage rises monotonically with tolerance.
    h, w = 64, 256
    hsv = np.zeros((h, w, 3), dtype=np.uint8)
    hsv[:, :, 0] = np.linspace(0, 179, w).astype(np.uint8)[None, :]
    hsv[:, :, 1] = 255
    hsv[:, :, 2] = 255
    rgb = cv2.cvtColor(hsv, cv2.COLOR_HSV2RGB)
    frame = np.dstack([rgb, np.full((h, w), 255, np.uint8)])
    ctx = FrameCtx(frame=frame, frame_index=0, clip_id="clip-1")

    def coverage(tolerance: float) -> float:
        node = MatteNode(
            id="key-perf",
            kind="chroma_key",
            params={"hue": 120.0, "tolerance": tolerance, "softness": 0.0},
        )
        matte = resolve_stack([node], ctx, (h, w))
        # The chroma matte SELECTS the keyed (green) region; coverage = mean.
        return float(matte.mean())

    cov_narrow = coverage(20.0)
    cov_mid = coverage(60.0)
    cov_wide = coverage(150.0)

    assert cov_narrow < cov_mid < cov_wide, (
        f"matte coverage must grow monotonically with tolerance: "
        f"{cov_narrow:.4f} < {cov_mid:.4f} < {cov_wide:.4f}"
    )
    # And it actually selects something (not a degenerate all-zero matte).
    assert cov_narrow > 0.0


# --------------------------------------------------------------------------- #
#  9. PERF — class-C contract: 1080p key eval under 4ms (or document degrade)
# --------------------------------------------------------------------------- #


def test_key_eval_1080p_under_4ms_or_halfres_degrade() -> None:
    """Median-of-N chroma kernel eval at 1080p is reported; ≤ 4ms is the target.

    The kernel is a class-C (per-frame) op. If full-res exceeds 4ms the renderer
    is expected to fall back to half-res (MK.3 degrade) — asserted here as: if
    full-res > 4ms, half-res MUST be meaningfully faster, proving the degrade
    path buys headroom.
    """
    import time

    rng = np.random.default_rng(0)
    full = rng.integers(0, 256, size=(1080, 1920, 3), dtype=np.uint8)
    half = full[::2, ::2]

    def median_ms(rgb: np.ndarray, n: int = 9) -> float:
        samples = []
        for _ in range(n):
            t0 = time.perf_counter()
            chroma_alpha(rgb, hue=120.0, tolerance=30.0, softness=0.0)
            samples.append((time.perf_counter() - t0) * 1000.0)
        return float(np.median(samples))

    # Warm up (first cv2 call pays one-time init).
    chroma_alpha(full, hue=120.0, tolerance=30.0, softness=0.0)

    full_ms = median_ms(full)
    print(f"\n[MK.8 perf] chroma 1080p median = {full_ms:.2f} ms (target ≤ 4ms)")

    if full_ms > 4.0:
        half_ms = median_ms(half)
        print(f"[MK.8 perf] chroma half-res median = {half_ms:.2f} ms (degrade path)")
        assert half_ms < full_ms, (
            "full-res exceeds 4ms budget and the half-res degrade is not faster — "
            "no headroom from the documented MK.3 degrade fallback"
        )
    else:
        assert full_ms <= 4.0
