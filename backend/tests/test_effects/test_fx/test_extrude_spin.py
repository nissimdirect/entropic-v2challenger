"""Tests for fx.extrude_spin — the 3D Extrude + Spin recipe (spec oracles 1 & 2).

Oracle 1 (unit): construction yields >0 geometry for a logo source, every
machine alters pixels, output is deterministic per (seed, frame_index).
Oracle 2 (golden): over a 24-frame sequential render, changes occur only at
print boundaries, the degradation metric rises across the decay phase, and
feedback on != off. Mirrors scripts/smoke_extrude_spin.py.
"""

import numpy as np
import cv2
import pytest

from effects.fx.extrude_spin import EFFECT_ID, PARAMS, apply
from effects.fx import extrude_spin as m

pytestmark = pytest.mark.smoke


def _logo(h=200, w=200):
    """Deterministic logo-like source: bar, disc, stroke on black RGBA."""
    img = np.zeros((h, w, 4), np.uint8)
    img[:, :, 3] = 255
    cv2.rectangle(img, (40, 60), (160, 90), (240, 240, 240), -1)
    cv2.circle(img, (100, 140), 35, (240, 240, 240), -1)
    cv2.line(img, (30, 30), (170, 30), (240, 240, 240), 6)
    return img


def _defaults(**over):
    p = {k: v.get("default") for k, v in PARAMS.items()}
    p.update(over)
    return p


KW = {"frame_index": 0, "seed": 42, "resolution": (200, 200)}


def _ink(rgb):
    return int((rgb[:, :, :3].sum(axis=2) > 40).sum())


def _hf_energy(rgb):
    g = cv2.cvtColor(rgb[:, :, :3], cv2.COLOR_RGB2GRAY).astype(np.float32)
    return float(np.mean(np.abs(cv2.Laplacian(g, cv2.CV_32F))))


# --- Registry probe (per docs/solutions/2026-05-14-effect-registry-...) ------
def test_registered():
    from effects import registry

    assert registry.get(EFFECT_ID) is not None, (
        "Effect not in registry — add extrude_spin to registry.py _auto_register()"
    )


# --- Oracle 1: construction produces geometry -------------------------------
@pytest.mark.parametrize("construction", ["extrude", "voxels", "points", "planes"])
def test_construction_produces_geometry(construction):
    frame = _logo()
    out, _ = apply(frame, _defaults(construction=construction), None, **KW)
    assert out.shape == frame.shape and out.dtype == np.uint8
    assert _ink(out) > 0, f"{construction}: rendered no geometry"


# --- Oracle 1: every machine alters pixels ----------------------------------
@pytest.mark.parametrize(
    "machine", ["toner", "bayer", "halftone", "sobel", "ascii", "random"]
)
def test_machine_alters_pixels(machine):
    frame = _logo()
    out, _ = apply(frame, _defaults(machine=machine), None, **KW)
    assert not np.array_equal(out[:, :, :3], frame[:, :, :3]), f"{machine}: no change"
    assert _ink(out) > 0, f"{machine}: produced an empty frame"


# --- Oracle 1: determinism ---------------------------------------------------
def test_determinism_same_seed_frame():
    frame = _logo()
    p = _defaults()
    r1, _ = apply(frame, p, None, frame_index=5, seed=42, resolution=(200, 200))
    r2, _ = apply(frame, p, None, frame_index=5, seed=42, resolution=(200, 200))
    np.testing.assert_array_equal(r1, r2)


def test_different_seed_differs():
    frame = _logo()
    p = _defaults(generations=6)
    a, _ = apply(frame, p, None, frame_index=10, seed=1, resolution=(200, 200))
    b, _ = apply(frame, p, None, frame_index=10, seed=2, resolution=(200, 200))
    # different noise seed -> different toner speckle at a degraded generation
    assert not np.array_equal(a, b)


# --- Oracle 2: the 24-frame golden properties -------------------------------
def _render_sequence(params, n=24):
    frame = _logo()
    mspf = params["ms_per_frame"]
    frames, pnos, per_print = [], [], {}
    state = None
    for fi in range(n):
        pno, gen, *_ = m._print_state_at(fi * mspf, params)
        out, state = apply(
            frame, params, state, frame_index=fi, seed=42, resolution=(200, 200)
        )
        frames.append(out)
        pnos.append(pno)
        per_print.setdefault(pno, (gen, _hf_energy(out)))
    return frames, pnos, per_print


def test_oracle2a_diffs_only_at_print_boundaries():
    frames, pnos, _ = _render_sequence(_defaults(generations=6))
    for i in range(1, len(frames)):
        changed = not np.array_equal(frames[i], frames[i - 1])
        boundary = pnos[i] != pnos[i - 1]
        assert changed == boundary, (
            f"frame {i}: boundary={boundary} but changed={changed} "
            "(frozen between prints, new print at boundary)"
        )


def test_oracle2b_degradation_rises_across_decay():
    _f, _p, per_print = _render_sequence(_defaults(generations=6))
    ordered = sorted(per_print.items())
    hfs = [e for _pn, (_g, e) in ordered]
    assert hfs[-1] > hfs[0] * 1.5, f"degradation did not rise: {hfs}"


def test_oracle2c_feedback_on_differs_from_off():
    frame = _logo()
    p = _defaults(generations=6)
    state = None
    for fi in range(24):
        on, state = apply(
            frame,
            dict(p, feed_base=0.30, feed_ramp=0.18),
            state,
            frame_index=fi,
            seed=42,
            resolution=(200, 200),
        )
    state = None
    for fi in range(24):
        off, state = apply(
            frame,
            dict(p, feed_base=0.0, feed_ramp=0.0),
            state,
            frame_index=fi,
            seed=42,
            resolution=(200, 200),
        )
    assert int(np.abs(on.astype(int) - off.astype(int)).sum()) > 0


# --- Edge cases (chaos) ------------------------------------------------------
def test_empty_source_does_not_crash():
    frame = np.zeros((80, 80, 4), np.uint8)
    frame[:, :, 3] = 255
    out, _ = apply(frame, _defaults(), None, frame_index=0, seed=1, resolution=(80, 80))
    assert out.shape == frame.shape and out.dtype == np.uint8


def test_tiny_frame():
    frame = _logo(16, 16)
    out, _ = apply(
        frame,
        _defaults(machine="ascii"),
        None,
        frame_index=2,
        seed=1,
        resolution=(16, 16),
    )
    assert out.shape == (16, 16, 4)


def test_output_opaque_and_shape_matches_input():
    frame = _logo(150, 220)  # non-square
    out, _ = apply(
        frame, _defaults(), None, frame_index=3, seed=9, resolution=(220, 150)
    )
    assert out.shape == (150, 220, 4)
    assert np.all(out[:, :, 3] == 255)


def test_invert_and_color_modes():
    frame = _logo()
    normal, _ = apply(frame, _defaults(), None, **KW)
    inverted, _ = apply(frame, _defaults(invert=True), None, **KW)
    colored, _ = apply(frame, _defaults(color_mode="color"), None, **KW)
    assert not np.array_equal(normal, inverted)
    assert colored.shape == frame.shape and colored.dtype == np.uint8
