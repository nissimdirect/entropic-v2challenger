"""Unit tests for fx.torn_edges effect."""

import numpy as np

from effects.fx import torn_edges


def _gradient_frame(h: int = 64, w: int = 64) -> np.ndarray:
    """Horizontal grayscale gradient with alpha=255."""
    g = np.linspace(0, 255, w, dtype=np.uint8)
    rgb = np.tile(g, (h, 1))
    frame = np.zeros((h, w, 4), dtype=np.uint8)
    for c in range(3):
        frame[:, :, c] = rgb
    frame[:, :, 3] = 255
    return frame


def _apply(frame, params=None, *, frame_index=0, seed=42, resolution=None):
    res = resolution or (frame.shape[1], frame.shape[0])
    out, _ = torn_edges.apply(
        frame,
        params or {},
        None,
        frame_index=frame_index,
        seed=seed,
        resolution=res,
    )
    return out


def test_metadata_correct():
    assert torn_edges.EFFECT_ID == "fx.torn_edges"
    assert torn_edges.EFFECT_NAME == "Torn Edges"
    assert torn_edges.EFFECT_CATEGORY == "texture"


def test_determinism_same_input_same_output():
    frame = _gradient_frame()
    params = {
        "image_balance": 25,
        "smoothness": 5,
        "contrast": 18,
        "greyscale": True,
    }
    out_a = _apply(frame, params, frame_index=10, seed=7)
    out_b = _apply(frame, params, frame_index=10, seed=7)
    assert np.array_equal(out_a, out_b)


def test_oscillation_produces_frame_variance():
    """With osc_rate>0, output must differ between frames."""
    frame = _gradient_frame()
    params = {
        "osc_rate": 1.0,
        "osc_depth": 20.0,
        "image_balance": 25,
        "contrast": 18,
    }
    out_0 = _apply(frame, params, frame_index=0)
    out_15 = _apply(frame, params, frame_index=15)
    l1 = np.mean(np.abs(out_0.astype(np.int16) - out_15.astype(np.int16)))
    assert l1 > 1.0, f"Oscillator did not produce frame variance (L1={l1:.3f})"


def test_osc_rate_zero_is_frozen():
    """osc_rate=0 → Photoshop parity (no time variance, no tear boil)."""
    frame = _gradient_frame()
    params = {
        "osc_rate": 0.0,
        "osc_depth": 25.0,
        "image_balance": 25,
        "contrast": 18,
    }
    out_0 = _apply(frame, params, frame_index=0)
    out_15 = _apply(frame, params, frame_index=15)
    assert np.array_equal(out_0, out_15), "Static mode produced frame variance"


def test_depth_zero_freezes_output_regardless_of_rate():
    """HT-1+HT-2: osc_rate>0 with osc_depth=0 must not produce noise boil."""
    frame = _gradient_frame()
    params = {
        "osc_rate": 1.0,
        "osc_depth": 0.0,
        "image_balance": 25,
        "contrast": 18,
    }
    out_0 = _apply(frame, params, frame_index=0)
    out_15 = _apply(frame, params, frame_index=15)
    assert np.array_equal(out_0, out_15), (
        "depth=0 should freeze tear noise regardless of rate"
    )


def test_greyscale_extreme_contrast_collapses_toward_binary():
    """greyscale=True, contrast=25 → output mostly bimodal (black/white)."""
    frame = _gradient_frame()
    params = {
        "greyscale": True,
        "contrast": 25,
        "image_balance": 25,
        "smoothness": 1,
    }
    out = _apply(frame, params)
    # Count pixels far from black (0) AND far from white (255). Should be small.
    mid_band_pixels = np.sum((out[:, :, 0] > 30) & (out[:, :, 0] < 225))
    total = out.shape[0] * out.shape[1]
    assert mid_band_pixels / total < 0.15, (
        f"Extreme contrast didn't collapse to binary: "
        f"{mid_band_pixels}/{total} mid-band pixels"
    )


def test_color_mode_per_channel_diverges():
    """greyscale=False produces independent per-channel thresholding."""
    h, w = 32, 32
    frame = np.zeros((h, w, 4), dtype=np.uint8)
    frame[:, :, 0] = 200  # R above any plausible threshold
    frame[:, :, 1] = 50  # G below any plausible threshold
    frame[:, :, 2] = 128  # B mid
    frame[:, :, 3] = 255
    params = {
        "greyscale": False,
        "contrast": 25,
        "image_balance": 25,
        "smoothness": 1,
    }
    out = _apply(frame, params)
    r_mean = float(out[:, :, 0].mean())
    g_mean = float(out[:, :, 1].mean())
    assert r_mean > g_mean + 50, (
        f"Per-channel threshold not differentiating: R={r_mean:.1f}, G={g_mean:.1f}"
    )


def test_smoothness_reduces_high_freq_detail():
    """Higher smoothness → smoother output (lower Laplacian variance)."""
    import cv2

    frame = _gradient_frame()
    params_low = {"smoothness": 1, "contrast": 5, "greyscale": True}
    params_high = {"smoothness": 15, "contrast": 5, "greyscale": True}
    out_low = _apply(frame, params_low)
    out_high = _apply(frame, params_high)
    lap_low = cv2.Laplacian(out_low[:, :, 0], cv2.CV_64F).var()
    lap_high = cv2.Laplacian(out_high[:, :, 0], cv2.CV_64F).var()
    assert lap_low > lap_high, (
        f"Smoothness did not reduce detail: low={lap_low:.2f}, high={lap_high:.2f}"
    )


def test_alpha_channel_preserved():
    frame = _gradient_frame()
    frame[:, :, 3] = 128
    out = _apply(frame)
    assert np.array_equal(out[:, :, 3], frame[:, :, 3]), "Alpha was modified"


def test_no_nan_or_inf_at_extreme_params():
    frame = _gradient_frame()
    params = {
        "image_balance": 50,
        "contrast": 25,
        "smoothness": 15,
        "osc_rate": 1.0,
        "osc_depth": 25.0,
        "greyscale": False,
    }
    out = _apply(frame, params, frame_index=999)
    out_f = out.astype(np.float32)
    assert not np.any(np.isnan(out_f)), "Output contains NaN"
    assert not np.any(np.isinf(out_f)), "Output contains Inf"
    assert out.dtype == np.uint8


def test_trust_boundary_clamps_garbage_params():
    """Out-of-range / wrong-type params from a crafted project file must not crash."""
    frame = _gradient_frame()
    params = {
        "image_balance": 999.0,
        "smoothness": 9999,
        "contrast": -50,
        "osc_rate": 99.0,
        "osc_depth": -10.0,
        "osc_shape": "exploit",
        "greyscale": "not-a-bool",
    }
    out = _apply(frame, params)
    assert out.shape == frame.shape
    assert out.dtype == np.uint8


def test_three_channel_input_handled():
    """3-channel frames (no alpha) pass through without crashing."""
    rgb_only = _gradient_frame()[:, :, :3]
    out = _apply(rgb_only)
    assert out.shape[2] == 3
    assert out.dtype == np.uint8


def test_1x1_frame_does_not_crash():
    """Edge case: kernel >> frame dims must use BORDER_REPLICATE."""
    tiny = np.array([[[128, 128, 128, 255]]], dtype=np.uint8)
    out = _apply(tiny, {"smoothness": 15})
    assert out.shape == (1, 1, 4)


def test_default_params_produce_visible_torn_output():
    """With all defaults, output must materially differ from input."""
    frame = _gradient_frame()
    out = _apply(frame, {})
    l1 = np.mean(
        np.abs(out[:, :, :3].astype(np.int16) - frame[:, :, :3].astype(np.int16))
    )
    assert l1 > 5.0, f"Default params produced near-passthrough output (L1={l1:.2f})"


def test_osc_shape_choices_all_work():
    """All three osc shapes must run without error and produce variance."""
    frame = _gradient_frame()
    for shape in ("sine", "triangle", "square"):
        params = {"osc_rate": 1.0, "osc_depth": 20.0, "osc_shape": shape}
        out_a = _apply(frame, params, frame_index=0)
        out_b = _apply(frame, params, frame_index=5)
        l1 = np.mean(np.abs(out_a.astype(np.int16) - out_b.astype(np.int16)))
        assert l1 > 0.5, f"Shape {shape!r} produced no variance"
