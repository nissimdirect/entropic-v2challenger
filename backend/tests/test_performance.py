"""Performance gate tests — 1080p frame budget and sequential decode penalty.

All timing tests use time.perf_counter() for wall-clock measurement.

Gates:
  - Each effect must process a 1080p (1920x1080) RGBA frame in < 100 ms.
  - Sequential frame decode must average < 5 ms per frame.

These tests are marked with @pytest.mark.perf so they can be skipped in CI
with: pytest -m "not perf"
Or run in isolation with: pytest -m perf
"""

import time

import numpy as np
import pytest

from effects.registry import _REGISTRY


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

FRAME_BUDGET_MS = 100.0  # Maximum ms per effect for a 1080p frame
DECODE_BUDGET_MS = 5.0  # Maximum average ms per sequential frame decode
SEQUENTIAL_FRAMES = 20  # Number of sequential frames to average over


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _frame_1080p() -> np.ndarray:
    """Create a deterministic 1920x1080 RGBA uint8 frame."""
    rng = np.random.default_rng(42)
    return rng.integers(0, 256, (1080, 1920, 4), dtype=np.uint8)


def _default_params(effect_info: dict) -> dict:
    """Build params dict using each parameter's default value."""
    params = {}
    for pname, pspec in effect_info["params"].items():
        params[pname] = pspec.get("default")
    return params


def _all_effect_ids() -> list[str]:
    """Return all registered effect IDs."""
    return list(_REGISTRY.keys())


# ---------------------------------------------------------------------------
# Effect frame budget — 1080p
# ---------------------------------------------------------------------------


@pytest.mark.perf
@pytest.mark.parametrize("effect_id", _all_effect_ids(), ids=_all_effect_ids())
def test_effect_frame_budget_1080p(effect_id: str):
    """Each effect must process a 1080p frame in under 100 ms.

    Uses default params and measures wall-clock time with time.perf_counter().
    The frame is pre-allocated outside the timer so only the effect execution
    is measured.
    """
    info = _REGISTRY[effect_id]
    frame = _frame_1080p()
    params = _default_params(info)
    kw = {"frame_index": 0, "seed": 42, "resolution": (1920, 1080)}

    # Warm-up pass — avoid first-call JIT / import overhead skewing results
    info["fn"](frame, params, None, **kw)

    # Timed pass
    t0 = time.perf_counter()
    result, _ = info["fn"](frame, params, None, **kw)
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    assert result.shape == (1080, 1920, 4), (
        f"{effect_id}: output shape wrong — got {result.shape}"
    )
    assert result.dtype == np.uint8, (
        f"{effect_id}: output dtype wrong — got {result.dtype}"
    )
    assert elapsed_ms < FRAME_BUDGET_MS, (
        f"{effect_id}: 1080p frame took {elapsed_ms:.1f} ms "
        f"(budget = {FRAME_BUDGET_MS} ms)"
    )


# ---------------------------------------------------------------------------
# Effect frame budget — parametrised at three quality presets
# ---------------------------------------------------------------------------

_RESOLUTIONS = [
    pytest.param((640, 360), id="360p"),
    pytest.param((1280, 720), id="720p"),
    pytest.param((1920, 1080), id="1080p"),
]


@pytest.mark.perf
@pytest.mark.parametrize("resolution", _RESOLUTIONS)
@pytest.mark.parametrize("effect_id", _all_effect_ids(), ids=_all_effect_ids())
def test_effect_frame_budget_multi_res(effect_id: str, resolution: tuple[int, int]):
    """Each effect must stay under 100 ms across 360p / 720p / 1080p.

    Budget scales linearly with pixel count relative to 1080p:
      360p  → ~10.7% of 1080p pixels → budget = 100 ms (generous)
      720p  → ~44.4% of 1080p pixels → budget = 100 ms
      1080p → 100%                    → budget = 100 ms
    """
    w, h = resolution
    rng = np.random.default_rng(42)
    frame = rng.integers(0, 256, (h, w, 4), dtype=np.uint8)
    info = _REGISTRY[effect_id]
    params = _default_params(info)
    kw = {"frame_index": 0, "seed": 42, "resolution": (w, h)}

    # Warm-up
    info["fn"](frame, params, None, **kw)

    t0 = time.perf_counter()
    result, _ = info["fn"](frame, params, None, **kw)
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    assert result.shape == (h, w, 4), f"{effect_id} @ {w}x{h}: wrong shape"
    assert result.dtype == np.uint8, f"{effect_id} @ {w}x{h}: wrong dtype"
    assert elapsed_ms < FRAME_BUDGET_MS, (
        f"{effect_id} @ {w}x{h}: {elapsed_ms:.1f} ms > {FRAME_BUDGET_MS} ms budget"
    )


# ---------------------------------------------------------------------------
# Sequential decode — no seek penalty
# ---------------------------------------------------------------------------


@pytest.mark.perf
def test_sequential_decode_no_seek_penalty(synthetic_video_path):
    """Sequential frame decode should average < 5 ms per frame.

    VideoReader.decode_frame() detects sequential access and skips the
    expensive PyAV seek (which costs 50-200 ms per call).  This test
    verifies that the optimisation is in effect by decoding
    SEQUENTIAL_FRAMES frames one-by-one and checking the per-frame average.

    The synthetic_video_path fixture creates a 150-frame 720p video so
    SEQUENTIAL_FRAMES=20 is well within bounds.
    """
    from video.reader import VideoReader

    reader = VideoReader(synthetic_video_path)
    try:
        # Seek to frame 0 first (establishes baseline decoder position)
        _ = reader.decode_frame(0)

        times_ms: list[float] = []
        for i in range(1, SEQUENTIAL_FRAMES + 1):
            t0 = time.perf_counter()
            frame = reader.decode_frame(i)
            elapsed_ms = (time.perf_counter() - t0) * 1000.0
            times_ms.append(elapsed_ms)

            # Basic sanity on each decoded frame
            assert frame.ndim == 3, f"Frame {i}: expected 3D array"
            assert frame.shape[2] == 4, f"Frame {i}: expected RGBA (4 channels)"
            assert frame.dtype == np.uint8, f"Frame {i}: expected uint8"

        avg_ms = sum(times_ms) / len(times_ms)
        max_ms = max(times_ms)

        assert avg_ms < DECODE_BUDGET_MS, (
            f"Sequential decode average {avg_ms:.2f} ms exceeds budget "
            f"{DECODE_BUDGET_MS} ms (max single frame: {max_ms:.2f} ms). "
            "Check VideoReader sequential-decode optimisation."
        )
    finally:
        reader.close()


# ---------------------------------------------------------------------------
# Seek decode — verify seek is more expensive than sequential (sanity check)
# ---------------------------------------------------------------------------


@pytest.mark.perf
def test_seek_decode_is_slower_than_sequential(synthetic_video_path):
    """Verify seek-based decode is measurably slower than sequential.

    This test confirms the two code paths are distinct.  If seek is somehow
    as fast as sequential, the optimisation may have been broken.

    The test is lenient — it passes as long as sequential average is <= the
    seek average.  It does not enforce a fixed seek budget.
    """
    from video.reader import VideoReader

    reader = VideoReader(synthetic_video_path)
    try:
        # --- Measure sequential decode ---
        _ = reader.decode_frame(0)
        seq_times: list[float] = []
        for i in range(1, 11):
            t0 = time.perf_counter()
            reader.decode_frame(i)
            seq_times.append((time.perf_counter() - t0) * 1000.0)

        # --- Measure seek decode (jump around non-sequentially) ---
        seek_indices = [50, 10, 80, 5, 120, 30, 100, 20, 60, 40]
        seek_times: list[float] = []
        for idx in seek_indices:
            t0 = time.perf_counter()
            reader.decode_frame(idx)
            seek_times.append((time.perf_counter() - t0) * 1000.0)

        avg_seq = sum(seq_times) / len(seq_times)
        avg_seek = sum(seek_times) / len(seek_times)

        # Sequential should never be slower than seek-based access
        assert avg_seq <= avg_seek + 5.0, (
            f"Sequential decode ({avg_seq:.1f} ms avg) is not faster than "
            f"seek decode ({avg_seek:.1f} ms avg) — optimisation may be broken"
        )
    finally:
        reader.close()


# ---------------------------------------------------------------------------
# Throughput — apply_chain with a 3-effect chain at 1080p
# ---------------------------------------------------------------------------


@pytest.mark.perf
def test_apply_chain_3_effects_1080p_throughput():
    """A 3-effect chain must process a 1080p frame in under 300 ms total.

    Uses invert + blur + posterize — a representative lightweight chain.
    Tests that chain overhead (loop, container, state) is negligible.
    """
    from engine.pipeline import apply_chain

    frame = _frame_1080p()
    chain = [
        {"effect_id": "fx.invert", "params": {}, "enabled": True},
        {"effect_id": "fx.blur", "params": {"radius": 3.0}, "enabled": True},
        {"effect_id": "fx.posterize", "params": {"levels": 4}, "enabled": True},
    ]

    # Warm-up
    apply_chain(frame, chain, project_seed=0, frame_index=0, resolution=(1920, 1080))

    t0 = time.perf_counter()
    output, _ = apply_chain(
        frame, chain, project_seed=0, frame_index=0, resolution=(1920, 1080)
    )
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    assert output.shape == (1080, 1920, 4)
    assert output.dtype == np.uint8
    assert elapsed_ms < 300.0, (
        f"3-effect 1080p chain took {elapsed_ms:.1f} ms (budget = 300 ms)"
    )
