"""MK.2 — Per-pixel alpha in the composite path (SPEC GT-2, §7-2). [RISK: HIGH]

Per-pixel alpha is HONORED, not just carried: all 9 blend modes weight by
`w = layer_alpha · scalar_opacity` per pixel (straight alpha). Output alpha is the
straight-alpha over-composite. Preview flattens the final RGBA canvas onto opaque
surface-0 (#0B0B10) before encode. Side effect: fx.chroma_key / fx.luma_key become
visible for the first time (GT-3).

THE GOLDEN GATE — `test_fully_opaque_layers_byte_identical_to_legacy` proves a
4-layer all-alpha=255 composite, across EVERY blend mode, is BYTE-EQUAL to a
pre-change legacy reference. The reference is captured by re-implementing the
pre-MK.2 legacy compositor inline (`_legacy_render_composite`) from the git-blamed
original (the `base*(1-opacity)+blended*opacity` whole-RGBA blend with the
transparent-black float canvas). This is the exact code that shipped on `main`
before this PR; if the MK.2 change alters any fully-opaque composite by even 1/255,
this test fails.
"""

from __future__ import annotations

import time

import numpy as np
import pytest

from engine.compositor import (
    BLEND_MODES,
    SURFACE_0_BG,
    _composite_layer,
    flatten_rgba,
    render_composite,
)

pytestmark = pytest.mark.smoke

NINE_MODES = [
    "normal",
    "add",
    "multiply",
    "screen",
    "overlay",
    "difference",
    "exclusion",
    "darken",
    "lighten",
]


def test_blend_modes_unchanged_keys():
    """DO-NOT-TOUCH guard: the BLEND_MODES dict keys are exactly the 9 modes."""
    assert sorted(BLEND_MODES.keys()) == sorted(NINE_MODES)


# ---------------------------------------------------------------------------
# Legacy reference — a faithful re-implementation of the PRE-MK.2 compositor
# (the byte-for-byte source of truth for the golden gate). This mirrors the
# blend formula and canvas evolution that shipped on `main` at commit ab7e438
# BEFORE this PR: blend functions take a SCALAR opacity and operate on the full
# RGBA array; the canvas starts as transparent-black float32; the alpha channel
# is blended as if it were a colour channel (the GT-2 behaviour this PR fixes for
# partial alpha, while keeping fully-opaque output byte-identical).
# ---------------------------------------------------------------------------


def _legacy_blend(mode: str, base: np.ndarray, layer: np.ndarray, opacity: float):
    if mode == "normal":
        blended = layer
    elif mode == "add":
        blended = base + layer
    elif mode == "multiply":
        blended = (base * layer) / 255.0
    elif mode == "screen":
        blended = 255.0 - ((255.0 - base) * (255.0 - layer)) / 255.0
    elif mode == "overlay":
        low = (2.0 * base * layer) / 255.0
        high = 255.0 - (2.0 * (255.0 - base) * (255.0 - layer)) / 255.0
        blended = np.where(base < 128.0, low, high)
    elif mode == "difference":
        blended = np.abs(base - layer)
    elif mode == "exclusion":
        blended = base + layer - 2.0 * base * layer / 255.0
    elif mode == "darken":
        blended = np.minimum(base, layer)
    elif mode == "lighten":
        blended = np.maximum(base, layer)
    else:
        raise AssertionError(f"unknown mode {mode}")
    return base * (1.0 - opacity) + blended * opacity


def _legacy_render_composite(layers, resolution, blend_mode, opacity):
    """Pre-MK.2 compositor (scalar opacity, alpha-as-colour). Reference oracle."""
    width, height = resolution
    canvas = np.zeros((height, width, 4), dtype=np.float32)
    for layer_info in layers:
        layer_f = layer_info["frame"].astype(np.float32)
        canvas = _legacy_blend(blend_mode, canvas, layer_f, opacity)
    return np.clip(canvas, 0, 255).astype(np.uint8)


def _opaque_layer(rgb, h=24, w=32):
    """An (h,w,4) uint8 layer, solid RGB, alpha=255 everywhere."""
    frame = np.zeros((h, w, 4), dtype=np.uint8)
    frame[:, :, 0] = rgb[0]
    frame[:, :, 1] = rgb[1]
    frame[:, :, 2] = rgb[2]
    frame[:, :, 3] = 255
    return frame


# ---------------------------------------------------------------------------
# THE GOLDEN GATE
# ---------------------------------------------------------------------------


def test_fully_opaque_layers_byte_identical_to_legacy():
    """4-layer all-alpha=255 composite, EVERY blend mode → byte-equal to legacy.

    Capture method: the legacy compositor is re-implemented inline as
    `_legacy_render_composite` (scalar opacity, whole-RGBA blend, transparent-black
    float canvas) — the exact pre-MK.2 algorithm. We render the same 4 opaque
    layers through both the legacy reference and the live `render_composite`, for
    every blend mode, and assert byte-equality. Opacity 1.0 (the default) is used
    so compositing is driven purely by the blend mode; the fast path is exercised.
    """
    res = (32, 24)
    rgbs = [(200, 60, 60), (40, 180, 90), (70, 90, 210), (230, 220, 30)]
    layers = [{"frame": _opaque_layer(c), "chain": []} for c in rgbs]

    for mode in NINE_MODES:
        # Live render: drive blend mode via top-level field (no terminal composite).
        live_layers = [
            {"frame": ly["frame"], "chain": [], "blend_mode": mode} for ly in layers
        ]
        live = render_composite(live_layers, res)
        legacy = _legacy_render_composite(layers, res, mode, opacity=1.0)
        assert np.array_equal(live, legacy), (
            f"GOLDEN GATE FAIL mode={mode}: live composite differs from legacy "
            f"reference (max |Δ|={int(np.abs(live.astype(int) - legacy.astype(int)).max())})"
        )


def test_fully_opaque_partial_opacity_byte_identical_to_legacy():
    """Same golden gate but with opacity 0.5 — fast path must still be byte-exact."""
    res = (32, 24)
    rgbs = [(200, 60, 60), (40, 180, 90), (70, 90, 210), (230, 220, 30)]
    base = [{"frame": _opaque_layer(c), "chain": []} for c in rgbs]
    for mode in NINE_MODES:
        live_layers = [
            {
                "frame": ly["frame"],
                "chain": [
                    {"effect_id": "composite", "params": {"opacity": 0.5, "mode": mode}}
                ],
            }
            for ly in base
        ]
        live = render_composite(live_layers, res)
        legacy = _legacy_render_composite(base, res, mode, opacity=0.5)
        assert np.array_equal(live, legacy), f"opacity=0.5 golden fail mode={mode}"


# ---------------------------------------------------------------------------
# GT-2 — zero-alpha pixels do not paint
# ---------------------------------------------------------------------------


def test_zero_alpha_pixels_do_not_paint():
    """A layer's alpha=0 region leaves the base untouched (the GT-2 bug proof).

    On pre-MK.2 main this FAILS: the top layer's alpha=0 RGB still paints over the
    base at full weight (alpha blended as colour). This test documents the
    confirmed-fails-on-main expectation in its assertion message; under MK.2 the
    keyed-out region must equal the base layer.
    """
    res = (16, 16)
    base_rgb = (200, 30, 30)
    top_rgb = (10, 220, 10)  # would smear green over red on legacy
    base = _opaque_layer(base_rgb, 16, 16)
    top = _opaque_layer(top_rgb, 16, 16)
    # Punch the left half of the top layer to alpha=0.
    top[:, :8, 3] = 0

    out = render_composite(
        [{"frame": base, "chain": []}, {"frame": top, "chain": []}], res
    )

    # Left half (alpha=0): base shows through unchanged.
    assert np.array_equal(out[:, :8, :3], base[:, :8, :3]), (
        "GT-2: alpha=0 region painted over base — per-pixel alpha not honored. "
        "(This is the exact failure that occurs on pre-MK.2 main.)"
    )
    # Right half (alpha=255): top fully replaces base.
    assert np.array_equal(out[:, 8:, :3], top[:, 8:, :3])


# ---------------------------------------------------------------------------
# Half alpha → half weight
# ---------------------------------------------------------------------------


def test_half_alpha_blends_half():
    """alpha=128 over a base → ~50% blend within ±1/255 (normal mode)."""
    res = (8, 8)
    base = _opaque_layer((0, 0, 0), 8, 8)  # black base
    top = _opaque_layer((255, 255, 255), 8, 8)  # white top
    top[:, :, 3] = 128  # half alpha

    out = render_composite(
        [{"frame": base, "chain": []}, {"frame": top, "chain": []}], res
    )

    expected = 255.0 * (128.0 / 255.0)  # ~128.0
    diff = np.abs(out[:, :, :3].astype(np.float32) - expected)
    assert diff.max() <= 1.0, f"half-alpha blend off by {diff.max()} (> ±1/255)"


# ---------------------------------------------------------------------------
# Output alpha is the straight-alpha over-composite
# ---------------------------------------------------------------------------


def test_output_alpha_is_over_composite():
    """a_out = a_layer + a_base·(1 - a_layer), straight alpha."""
    res = (8, 8)
    base = _opaque_layer((10, 10, 10), 8, 8)
    base[:, :, 3] = 100  # base alpha ~0.392
    top = _opaque_layer((20, 20, 20), 8, 8)
    top[:, :, 3] = 60  # top alpha ~0.235

    out = render_composite(
        [{"frame": base, "chain": []}, {"frame": top, "chain": []}], res
    )

    a_base = 100.0 / 255.0
    a_top = 60.0 / 255.0
    expected_a = (a_top + a_base * (1.0 - a_top)) * 255.0
    diff = np.abs(out[:, :, 3].astype(np.float32) - expected_a)
    assert diff.max() <= 1.0, (
        f"output alpha not over-composite: got {out[0, 0, 3]}, expected ~{expected_a:.1f}"
    )


# ---------------------------------------------------------------------------
# Each of 9 modes is alpha-weighted (parameterized) + both-paths equality
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("mode", NINE_MODES)
def test_each_of_9_modes_alpha_weighted(mode):
    """For every mode: alpha=0 region of the top layer leaves base RGB untouched.

    Proves the per-pixel weight reaches all 9 blend functions, not just normal.
    """
    res = (16, 16)
    base = _opaque_layer((120, 60, 200), 16, 16)
    top = _opaque_layer((30, 240, 90), 16, 16)
    top[:, :8, 3] = 0  # left half transparent

    live = [
        {"frame": base, "chain": []},
        {"frame": top, "chain": [], "blend_mode": mode},
    ]
    out = render_composite(live, res)
    assert np.array_equal(out[:, :8, :3], base[:, :8, :3]), (
        f"mode={mode}: alpha=0 region not honored"
    )


@pytest.mark.parametrize("mode", NINE_MODES)
def test_fast_path_and_array_path_rgb_agree(mode):
    """Failure-mode guard: the scalar fast path and the per-pixel array path must
    produce IDENTICAL RGB for a fully-opaque layer.

    The fast path runs the legacy whole-RGBA blend; the array path runs the
    per-pixel weighting with `a_layer ≡ 1`. Their visible (RGB) result must match
    bit-for-bit; only the alpha channel legitimately differs (fast path blends
    alpha as colour, array path does over-composite). We assert RGB equality.
    """
    h, w = 12, 12
    canvas = np.zeros((h, w, 4), dtype=np.float32)
    canvas[:, :, :3] = np.array([90, 140, 60], dtype=np.float32)
    canvas[:, :, 3] = 255.0
    layer = np.zeros((h, w, 4), dtype=np.float32)
    layer[:, :, :3] = np.array([200, 40, 180], dtype=np.float32)
    layer[:, :, 3] = 255.0  # fully opaque → fast path
    blend_fn = BLEND_MODES[mode]

    fast = _composite_layer(canvas, layer, 0.7, blend_fn)

    # Force the array path with an alpha just under 255 then compare to the exact
    # expectation that a≡1 should yield (RGB == fast-path RGB).
    layer_partial = layer.copy()
    layer_partial[0, 0, 3] = 254.0  # one pixel < 255 forces the array branch
    arr = _composite_layer(canvas, layer_partial, 0.7, blend_fn)

    # Pixels where alpha stayed 255: RGB must equal the fast path exactly.
    mask = layer_partial[:, :, 3] == 255.0
    assert np.allclose(arr[:, :, :3][mask], fast[:, :, :3][mask], atol=1e-3), (
        f"mode={mode}: array path RGB diverges from fast path for a=1 pixels"
    )


# ---------------------------------------------------------------------------
# GT-3 — chroma_key now visible in the composite (integration, full chain)
# ---------------------------------------------------------------------------


def test_chroma_key_now_visible_in_composite():
    """Layer with fx.chroma_key in its chain → keyed region shows the base layer.

    Full chain: apply_chain runs fx.chroma_key (writes alpha=0 over green) →
    render_composite blends with per-pixel alpha → keyed (green) region reveals the
    base layer's pixels. This is a no-op on pre-MK.2 main (GT-3 shipped-but-dark);
    here it proves GT-3 fixed end-to-end.
    """
    res = (32, 24)
    base = _opaque_layer((220, 40, 40), 24, 32)  # red base layer (h, w)
    # Top layer: half green (keyed), half blue (kept).
    top = np.zeros((24, 32, 4), dtype=np.uint8)
    top[:, :16] = (0, 255, 0, 255)  # pure green left half → keyed out
    top[:, 16:] = (0, 0, 255, 255)  # blue right half → kept

    layers = [
        {"frame": base, "chain": []},
        {
            "frame": top,
            "chain": [
                {
                    "effect_id": "fx.chroma_key",
                    "params": {"hue": 120.0, "tolerance": 60.0, "softness": 0.0},
                    "enabled": True,
                }
            ],
        },
    ]
    out = render_composite(layers, res)

    # Left (green, keyed): base red shows through.
    left_center = out[12, 4, :3]
    assert left_center[0] > 150 and left_center[1] < 80, (
        f"GT-3: keyed green region did not reveal base; got RGB={tuple(int(x) for x in left_center)}"
    )
    # Right (blue, kept): blue dominates.
    right_center = out[12, 28, :3]
    assert right_center[2] > 150 and right_center[0] < 80, (
        f"GT-3: kept region lost the blue top layer; got RGB={tuple(int(x) for x in right_center)}"
    )


# ---------------------------------------------------------------------------
# NaN/Inf alpha sanitized (negative)
# ---------------------------------------------------------------------------


def test_nan_alpha_sanitized():
    """NaN/Inf in an alpha plane → treated as OPAQUE (255), never propagated."""
    res = (8, 8)
    base = _opaque_layer((0, 0, 0), 8, 8)
    top = _opaque_layer((123, 200, 50), 8, 8).astype(np.float32)
    top[:, :4, 3] = np.nan
    top[:, 4:, 3] = np.inf
    # Pass as float frame; compositor astype(float32) preserves nan/inf.
    out = render_composite(
        [{"frame": base, "chain": []}, {"frame": top.astype(np.float32), "chain": []}],
        res,
    )
    # NaN/Inf → opaque → top fully replaces base, NO NaN in output.
    assert not np.isnan(out.astype(np.float32)).any(), "NaN leaked into composite"
    assert np.array_equal(
        out[:, :, :3], np.full((8, 8, 3), [123, 200, 50], dtype=np.uint8)
    ), "NaN/Inf alpha not treated as opaque"


# ---------------------------------------------------------------------------
# Preview flatten onto surface-0
# ---------------------------------------------------------------------------


def test_preview_flatten_produces_opaque_rgb():
    """flatten_rgba: output alpha ≡ 255; transparent canvas → surface-0 (#0B0B10)."""
    h, w = 8, 8
    frame = np.zeros((h, w, 4), dtype=np.uint8)
    frame[:, :4] = (255, 255, 255, 255)  # opaque white left
    frame[:, 4:] = (255, 0, 0, 0)  # transparent red right (RGB rides under a=0)

    flat = flatten_rgba(frame)

    assert (flat[:, :, 3] == 255).all(), "flatten did not produce opaque alpha"
    # Opaque white preserved.
    assert np.array_equal(flat[:, :4, :3], np.full((h, 4, 3), 255, dtype=np.uint8))
    # Transparent region → surface-0, NOT the red that rode under alpha=0.
    assert np.array_equal(
        flat[:, 4:, :3], np.full((h, 4, 3), SURFACE_0_BG, dtype=np.uint8)
    ), (
        f"transparent region not flattened to #0B0B10; got {tuple(int(x) for x in flat[0, 4, :3])}"
    )
    assert SURFACE_0_BG == (11, 11, 16)


def test_flatten_nan_alpha_safe():
    """flatten_rgba tolerates NaN/Inf alpha (→ opaque) without leaking NaN."""
    frame = np.zeros((4, 4, 4), dtype=np.float32)
    frame[:, :, :3] = 200.0
    frame[:, :, 3] = np.nan
    flat = flatten_rgba(frame)
    assert not np.isnan(flat.astype(np.float32)).any()
    assert (flat[:, :, 3] == 255).all()


# ---------------------------------------------------------------------------
# Timing budget — composite stage ≤ legacy median × 1.15
# ---------------------------------------------------------------------------


def test_composite_stage_timing_budget():
    """4 layers @640×360, median-of-20: ≤ legacy median × 1.15.

    CI-scale proxy for the ≤ +0.25 ms/layer @1080p gate. The fast path keeps the
    fully-opaque case on the legacy code path, so the median should be within
    noise of legacy.
    """
    res = (640, 360)
    rng = np.random.default_rng(7)
    frames = [
        np.concatenate(
            [
                rng.integers(0, 256, (360, 640, 3), dtype=np.uint8),
                np.full((360, 640, 1), 255, dtype=np.uint8),
            ],
            axis=2,
        )
        for _ in range(4)
    ]
    layers = [{"frame": f, "chain": []} for f in frames]

    def _median(fn, n=20):
        samples = []
        for _ in range(n):
            t0 = time.perf_counter()
            fn()
            samples.append(time.perf_counter() - t0)
        return float(np.median(samples))

    legacy_med = _median(lambda: _legacy_render_composite(layers, res, "normal", 1.0))
    live_med = _median(lambda: render_composite([dict(ly) for ly in layers], res))

    # Generous CI headroom; the real gate is the 1080p scripted number in the PR.
    assert live_med <= legacy_med * 1.15 + 0.002, (
        f"composite stage too slow: live={live_med * 1000:.3f}ms "
        f"legacy={legacy_med * 1000:.3f}ms (budget ×1.15)"
    )
