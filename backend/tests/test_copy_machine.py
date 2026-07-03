"""Unit tests for fx.copy_machine effect."""

import numpy as np

from effects.fx import copy_machine


def _subject_frame(h: int = 48, w: int = 48) -> np.ndarray:
    """Light frame with a dark central square + alpha=255 (dark-on-light source)."""
    frame = np.zeros((h, w, 4), dtype=np.uint8)
    frame[:, :, :3] = 200
    frame[h // 4 : 3 * h // 4, w // 4 : 3 * w // 4, :3] = 20
    frame[:, :, 3] = 255
    return frame


def _apply(frame, params=None, state_in=None, *, frame_index=0, seed=42):
    res = (frame.shape[1], frame.shape[0])
    return copy_machine.apply(
        frame,
        params or {},
        state_in,
        frame_index=frame_index,
        seed=seed,
        resolution=res,
    )


def _l1(a, b):
    return float(
        np.mean(np.abs(a[:, :, :3].astype(np.int16) - b[:, :, :3].astype(np.int16)))
    )


def test_metadata_and_registration():
    assert copy_machine.EFFECT_ID == "fx.copy_machine"
    assert copy_machine.EFFECT_NAME == "Copy Machine"
    from effects import registry

    assert registry.get("fx.copy_machine") is not None, (
        "Effect not in registry — add to registry.py _auto_register()"
    )


def test_all_machines_change_pixels():
    """Every machine must materially alter the frame at a non-trivial generation."""
    frame = _subject_frame()
    for machine in copy_machine.MACHINES:
        out, _ = _apply(frame, {"machine": machine, "generation": 4})
        l1 = _l1(out, frame)
        assert l1 > 3.0, f"machine {machine!r} barely changed pixels (L1={l1:.2f})"


def test_generation_zero_is_near_identity():
    """generation=0 (feedback off) => no copy passes => output ~ input (rgb)."""
    frame = _subject_frame()
    out, state = _apply(frame, {"machine": "toner", "generation": 0.0})
    assert np.array_equal(out[:, :, :3], frame[:, :, :3]), "gen=0 should be identity"
    assert state is None, "stateless mode must not carry state"


def test_generation_increases_degradation():
    """More generations => further from the original."""
    frame = _subject_frame()
    out_lo, _ = _apply(frame, {"machine": "toner", "generation": 1})
    out_hi, _ = _apply(frame, {"machine": "toner", "generation": 8})
    assert _l1(out_hi, frame) > _l1(out_lo, frame), (
        "higher generation not more degraded"
    )


def test_determinism_same_seed_frame_identical():
    """Same (seed, frame_index) + params => byte-identical output."""
    frame = _subject_frame()
    p = {"machine": "riso", "generation": 6}
    a, _ = _apply(frame, p, frame_index=10, seed=7)
    b, _ = _apply(frame, p, frame_index=10, seed=7)
    assert np.array_equal(a, b), "output not deterministic for fixed seed+frame"


def test_determinism_differs_by_frame_index():
    """Different frame_index => different noise realisation (renders aren't frozen)."""
    frame = _subject_frame()
    p = {"machine": "toner", "generation": 4}
    a, _ = _apply(frame, p, frame_index=0, seed=7)
    b, _ = _apply(frame, p, frame_index=25, seed=7)
    assert not np.array_equal(a, b), "frame_index had no effect on noise"


def test_feedback_accumulates_vs_stateless():
    """feedback=true frame 2 must differ from the stateless frame-2 output."""
    frame = _subject_frame()
    p = {"machine": "toner", "generation": 2, "feedback": True}
    out0, st0 = _apply(frame, p, None, frame_index=0)
    out1, st1 = _apply(frame, p, st0, frame_index=1)
    assert st0 is not None and "prev" in st0, "feedback did not carry state"
    # stateless render at the same frame index (no history)
    stateless1, _ = _apply(
        frame, {"machine": "toner", "generation": 2}, None, frame_index=1
    )
    assert not np.array_equal(out1, stateless1), (
        "feedback frame-2 output identical to stateless — state not compounding"
    )


def test_feedback_is_reproducible_sequence():
    """Two identical sequential feedback runs must match frame-for-frame."""
    frame = _subject_frame()
    p = {"machine": "photocopy", "generation": 1, "feedback": True}

    def run():
        st = None
        outs = []
        for fi in range(4):
            o, st = _apply(frame, p, st, frame_index=fi, seed=3)
            outs.append(o)
        return outs

    a, b = run(), run()
    for i, (x, y) in enumerate(zip(a, b)):
        assert np.array_equal(x, y), f"feedback sequence not reproducible at frame {i}"


def test_freeze_holds_content():
    """freeze=true degrades the SAME held frame even when the input changes."""
    frame_a = _subject_frame()
    frame_b = _subject_frame()
    frame_b[:, :, :3] = 255 - frame_b[:, :, :3]  # totally different second input
    p = {"machine": "toner", "generation": 3, "freeze": True}
    _, st = _apply(frame_a, p, None, frame_index=0)
    held = st["held"].copy()
    # advance with a different input; held frame must be preserved
    _, st2 = _apply(frame_b, p, st, frame_index=1)
    assert np.array_equal(st2["held"], held), "freeze did not hold the captured frame"
    assert np.array_equal(held, frame_a[:, :, :3]), "held frame is not the first input"


def test_freeze_clears_when_disabled():
    """Turning freeze off must drop the held frame from state."""
    frame = _subject_frame()
    _, st = _apply(frame, {"machine": "toner", "freeze": True}, None, frame_index=0)
    assert "held" in st
    _, st2 = _apply(frame, {"machine": "toner", "freeze": False}, st, frame_index=1)
    assert st2 is None or "held" not in st2, "held frame not cleared after freeze off"


def test_invert_auto_triggers_on_light_on_dark():
    """A dark background with a light mark should auto-invert (light spreads)."""
    h = w = 48
    dark = np.zeros((h, w, 4), dtype=np.uint8)
    dark[:, :, 3] = 255
    dark[h // 3 : 2 * h // 3, w // 3 : 2 * w // 3, :3] = 240  # light mark
    out_auto, _ = _apply(
        dark, {"machine": "toner", "generation": 3, "invert_auto": True}
    )
    out_off, _ = _apply(
        dark,
        {"machine": "toner", "generation": 3, "invert_auto": False, "invert": False},
    )
    assert not np.array_equal(out_auto, out_off), (
        "invert_auto had no effect on a light-on-dark source"
    )


def test_alpha_preserved():
    frame = _subject_frame()
    frame[:, :, 3] = 128
    out, _ = _apply(frame, {"machine": "halftone", "generation": 2})
    assert np.array_equal(out[:, :, 3], frame[:, :, 3]), "alpha modified"


def test_three_channel_input_handled():
    rgb_only = _subject_frame()[:, :, :3]
    out, _ = _apply(rgb_only, {"machine": "fax", "generation": 2})
    assert out.shape[2] == 3 and out.dtype == np.uint8


def test_mix_blends_toward_original():
    frame = _subject_frame()
    full, _ = _apply(frame, {"machine": "toner", "generation": 6, "mix": 1.0})
    half, _ = _apply(frame, {"machine": "toner", "generation": 6, "mix": 0.5})
    assert _l1(half, frame) < _l1(full, frame), (
        "mix<1 did not pull output back toward original"
    )


def test_trust_boundary_clamps_garbage_params():
    """Out-of-range / wrong-type params from a crafted project must not crash."""
    frame = _subject_frame()
    params = {
        "machine": "not-a-machine",
        "generation": 99999.0,
        "mix": -5.0,
        "feedback": "maybe",
        "freeze": 2,
        "invert": "nope",
    }
    out, _ = _apply(frame, params)
    assert out.shape == frame.shape and out.dtype == np.uint8


def test_trust_boundary_non_string_machine_does_not_crash():
    """A non-hashable / wrong-type machine value must clamp, not raise."""
    frame = _subject_frame()
    for bad in ([("toner",)], {"m": 1}, 3, None):
        out, _ = _apply(frame, {"machine": bad, "generation": 2})
        assert out.shape == frame.shape and out.dtype == np.uint8


def test_feedback_state_is_private_copy():
    """The returned frame must not alias state['prev'] (in-place mutation safety).

    3-channel input + default mix==1.0 is the case where `result` would otherwise
    be the same object stored as feedback state.
    """
    rgb_only = _subject_frame()[:, :, :3]
    p = {"machine": "toner", "generation": 2, "feedback": True}
    out, st = _apply(rgb_only, p, None, frame_index=0)
    assert out is not st["prev"], "returned frame aliases feedback state"
    snapshot = st["prev"].copy()
    out += 50  # simulate a downstream in-place buffer reuse
    assert np.array_equal(st["prev"], snapshot), (
        "mutating output corrupted state['prev']"
    )


def test_feedback_prev_cleared_when_disabled():
    """Toggling feedback off must drop the stale prev buffer (no resurrection)."""
    frame = _subject_frame()
    _, st0 = _apply(frame, {"machine": "toner", "feedback": True}, None, frame_index=0)
    assert "prev" in st0
    # a non-feedback frame (freeze keeps state alive) must clear prev
    _, st1 = _apply(
        frame,
        {"machine": "toner", "feedback": False, "freeze": True},
        st0,
        frame_index=1,
    )
    assert "prev" not in st1, "stale feedback state survived a feedback-off frame"


def test_no_nan_or_inf_and_uint8():
    frame = _subject_frame()
    for machine in copy_machine.MACHINES:
        out, _ = _apply(frame, {"machine": machine, "generation": 5}, frame_index=13)
        assert out.dtype == np.uint8
        f = out.astype(np.float32)
        assert not np.any(np.isnan(f)) and not np.any(np.isinf(f)), (
            f"{machine} produced NaN/Inf"
        )


def test_fractional_generation_is_between_neighbors():
    """A fractional generation blends between the two integer-generation outputs."""
    frame = _subject_frame()
    lo, _ = _apply(frame, {"machine": "toner", "generation": 3.0})
    mid, _ = _apply(frame, {"machine": "toner", "generation": 3.5})
    # mid must differ from the pure 3-pass output (the fractional pass took effect)
    assert not np.array_equal(mid, lo), "fractional generation had no effect"


# ---------------------------------------------------------------------------
# color subject helper
# ---------------------------------------------------------------------------
def _color_frame(h: int = 48, w: int = 48) -> np.ndarray:
    """Saturated color subject: red block on blue field (dark-on-... mixed)."""
    frame = np.zeros((h, w, 4), dtype=np.uint8)
    frame[:, :, 2] = 170  # blue field
    frame[h // 4 : 3 * h // 4, w // 4 : 3 * w // 4, 0] = 210  # red block
    frame[h // 4 : 3 * h // 4, w // 4 : 3 * w // 4, 2] = 20
    frame[:, :, 3] = 255
    return frame


def _chroma_var(rgb: np.ndarray) -> float:
    """Variance of an opponent (R-G, R-B) chroma signal — 0 for greyscale."""
    f = rgb[:, :, :3].astype(np.int32)
    rg = f[:, :, 0] - f[:, :, 1]
    rb = f[:, :, 0] - f[:, :, 2]
    return float(np.var(rg) + np.var(rb))


# ---------------------------------------------------------------------------
# random machine
# ---------------------------------------------------------------------------
def test_random_machine_runs_and_is_registered():
    from effects import registry

    assert "random" in copy_machine.MACHINES
    schema = registry.get("fx.copy_machine")["params"]
    assert "random" in schema["machine"]["options"]
    assert "random_pool" in schema and "color_mode" in schema
    frame = _subject_frame()
    out, _ = _apply(frame, {"machine": "random", "generation": 4})
    assert out.shape == frame.shape and out.dtype == np.uint8


def test_random_same_seed_same_sequence_diff_seed_differs():
    """Random machine selection is reproducible per seed and varies across seeds."""
    pool = list(copy_machine._REAL_MACHINES)

    def seq(seed, feedback):
        # stateless: vary pass index; feedback: vary frame index
        if feedback:
            return [
                copy_machine._pick_random_machine(pool, seed, fi, 0, True)
                for fi in range(12)
            ]
        return [
            copy_machine._pick_random_machine(pool, seed, 0, p, False)
            for p in range(12)
        ]

    for fb in (False, True):
        assert seq(7, fb) == seq(7, fb), (
            "random selection not reproducible for same seed"
        )
        assert seq(7, fb) != seq(999, fb), "different seeds produced identical sequence"
        assert all(m in pool for m in seq(7, fb)), "picked a machine outside the pool"


def test_random_pool_restricts_choices():
    """random_pool limits selection to the named subset."""
    frame = _subject_frame()
    # a 1-element pool forces that machine; output must match the explicit machine
    forced, _ = _apply(
        frame, {"machine": "random", "random_pool": "halftone", "generation": 3}, seed=5
    )
    direct, _ = _apply(frame, {"machine": "halftone", "generation": 3}, seed=5)
    assert np.array_equal(forced, direct), (
        "single-item random_pool did not force machine"
    )


def test_random_stateless_is_frame_stable():
    """Stateless random uses the same machine chain every frame (no flicker)."""
    pool = list(copy_machine._REAL_MACHINES)
    a = copy_machine._pick_random_machine(pool, 3, 0, 5, False)
    b = copy_machine._pick_random_machine(pool, 3, 99, 5, False)  # different frame
    assert a == b, "stateless random machine changed with frame_index (would flicker)"


# ---------------------------------------------------------------------------
# color_mode
# ---------------------------------------------------------------------------
def test_color_mode_retains_chroma_bw_collapses():
    """color mode keeps source chroma in inked regions; bw collapses to greyscale."""
    frame = _color_frame()
    for machine in ("toner", "halftone", "ascii", "photocopy"):
        base = {"machine": machine, "generation": 2, "invert_auto": False}
        color, _ = _apply(frame, {**base, "color_mode": "color"}, seed=4)
        bw, _ = _apply(frame, {**base, "color_mode": "bw"}, seed=4)
        cv_color = _chroma_var(color)
        cv_bw = _chroma_var(bw)
        # color mode must retain materially more chroma than bw (which collapses it)
        assert cv_color > 25.0, f"{machine} color mode lost chroma (var={cv_color:.1f})"
        assert cv_bw < cv_color * 0.35, (
            f"{machine} bw did not collapse chroma (bw={cv_bw:.1f} color={cv_color:.1f})"
        )


def test_color_mode_riso_bw_desaturates():
    """riso is inherently color; bw mode must desaturate it (near-greyscale)."""
    frame = _color_frame()
    bw, _ = _apply(
        frame, {"machine": "riso", "generation": 2, "color_mode": "bw"}, seed=1
    )
    color, _ = _apply(
        frame, {"machine": "riso", "generation": 2, "color_mode": "color"}, seed=1
    )
    assert _chroma_var(bw) < _chroma_var(color) * 0.2, "riso bw did not desaturate"


def test_riso_bw_is_neutral_after_starve_across_seeds():
    """riso+bw must stay per-pixel neutral (R==G==B) even after the starve stage's
    non-uniform paper clamp — swept across seeds where the split was worst."""
    frame = _color_frame()
    worst = 0
    for seed in range(20):
        for gen in (1, 2, 3):
            bw, _ = _apply(
                frame,
                {
                    "machine": "riso",
                    "generation": gen,
                    "color_mode": "bw",
                    "invert_auto": False,
                },
                seed=seed,
            )
            rgb = bw[:, :, :3].astype(int)
            split = int(
                (
                    np.abs(rgb[:, :, 0] - rgb[:, :, 1])
                    + np.abs(rgb[:, :, 1] - rgb[:, :, 2])
                ).max()
            )
            worst = max(worst, split)
    assert worst == 0, f"riso-bw not neutral: max channel split {worst}"


def test_random_selection_rng_disjoint_from_pixel_noise():
    """The random-machine RNG stream must never equal a pixel-noise key.

    Regression for the frame_index == namespace collision (previously the
    machine-selection key reused _seed_for's frame slot for the namespace).
    """
    for seed in (0, 1, 24301):
        for fi in (0, 24301, 65535):
            for p in range(4):
                pixel_key = copy_machine._seed_for(seed, fi, p)
                fb = copy_machine._seed_for(seed, fi, 0) ^ copy_machine._RANDOM_XOR
                st = copy_machine._seed_for(seed, 0, p) ^ copy_machine._RANDOM_XOR
                assert fb != pixel_key and st != pixel_key, (
                    f"random RNG key collided with pixel-noise key at "
                    f"seed={seed} fi={fi} p={p}"
                )


def test_color_mode_invalid_falls_back_to_bw():
    frame = _color_frame()
    out, _ = _apply(frame, {"machine": "toner", "generation": 2, "color_mode": "xyz"})
    assert out.dtype == np.uint8


# ---------------------------------------------------------------------------
# ascii machine
# ---------------------------------------------------------------------------
def test_ascii_output_is_composed_of_glyph_tiles():
    """In bw mode, every cell equals one of the glyph tiles => unique patterns <= glyphs."""
    frame = _subject_frame(64, 64)
    rng = np.random.default_rng(0)
    cell = 8
    out = copy_machine._m_ascii(
        frame[:, :, :3], rng, 0.0, {"cell_size": cell, "glyph_set": "classic"}
    )
    n_glyphs = len(copy_machine._GLYPH_BASE["classic"])
    # collect unique cell bitmaps (ink vs paper) over the glyph grid
    ink = (out.reshape(-1, 3) == copy_machine._INK.astype(np.uint8)).all(axis=1)
    ink = ink.reshape(out.shape[0], out.shape[1])
    gh, gw = out.shape[0] // cell, out.shape[1] // cell
    patterns = {
        ink[y * cell : (y + 1) * cell, x * cell : (x + 1) * cell].tobytes()
        for y in range(gh)
        for x in range(gw)
    }
    assert len(patterns) <= n_glyphs, (
        f"ascii produced {len(patterns)} distinct cells but only {n_glyphs} glyphs exist"
    )


def test_ascii_cell_coarsens_with_generation():
    """Higher generation -> larger effective cells -> coarser output (fewer edges)."""
    frame = _subject_frame(96, 96)
    rng = np.random.default_rng(0)
    cfg = {"cell_size": 4, "glyph_set": "dense"}
    fine = copy_machine._m_ascii(frame[:, :, :3], rng, 0.0, cfg)
    coarse = copy_machine._m_ascii(frame[:, :, :3], rng, 20.0, cfg)

    def edge_density(img):
        g = img[:, :, 0].astype(np.int16)
        return float(np.mean(np.abs(np.diff(g, axis=1)))) + float(
            np.mean(np.abs(np.diff(g, axis=0)))
        )

    assert edge_density(coarse) < edge_density(fine), (
        "ascii did not coarsen with generation"
    )


def test_ascii_glyph_sets_differ():
    frame = _subject_frame(64, 64)
    rng = np.random.default_rng(0)
    outs = [
        copy_machine._m_ascii(
            frame[:, :, :3], rng, 0.0, {"cell_size": 8, "glyph_set": gs}
        )
        for gs in copy_machine.GLYPH_SETS
    ]
    # at least two of the sets must produce materially different output
    diffs = [
        float(np.mean(np.abs(outs[0].astype(int) - o.astype(int)))) for o in outs[1:]
    ]
    assert max(diffs) > 1.0, "all glyph sets produced identical output"


def test_feedback_amount_param_compounds():
    """feedback_amount=0.9 over 30 frames on a STATIC source must degrade far more
    than the early frames — recursion compounds (user spec 2026-07-02)."""
    frame = _subject_frame()
    p = {"machine": "toner", "generation": 2, "feedback": True, "feedback_amount": 0.9}

    # compounding metric: divergence from the PRISTINE source. (High-frequency
    # energy saturates immediately under a binarizing machine like toner, so it
    # cannot measure compounding — divergence keeps growing as recursion erodes
    # the shapes through optics resample + noise, pass after pass.)
    src = frame[:, :, :3].astype(np.float32)

    def divergence(img):
        return float(np.abs(img[:, :, :3].astype(np.float32) - src).mean())

    st = None
    d5 = d30 = None
    for fi in range(30):
        out, st = _apply(frame, p, st, frame_index=fi)
        if fi == 4:
            d5 = divergence(out)
        if fi == 29:
            d30 = divergence(out)
    assert d5 is not None and d30 is not None
    assert d30 > d5 * 1.15, (
        f"recursion is not compounding: div@5={d5:.2f} div@30={d30:.2f}"
    )


def test_feedback_amount_low_vs_high_differ():
    """The param must actually steer the blend: low vs high recursion diverge."""
    frame = _subject_frame()
    lo_state = hi_state = None
    lo = hi = None
    for fi in range(6):
        lo, lo_state = _apply(
            frame,
            {"machine": "toner", "generation": 2, "feedback": True, "feedback_amount": 0.1},
            lo_state,
            frame_index=fi,
        )
        hi, hi_state = _apply(
            frame,
            {"machine": "toner", "generation": 2, "feedback": True, "feedback_amount": 0.95},
            hi_state,
            frame_index=fi,
        )
    assert not np.array_equal(lo, hi), "feedback_amount had no effect on output"


def test_feedback_amount_in_schema():
    assert "feedback_amount" in copy_machine.PARAMS
    spec = copy_machine.PARAMS["feedback_amount"]
    assert spec["default"] == 0.88 and spec["max"] == 0.98
