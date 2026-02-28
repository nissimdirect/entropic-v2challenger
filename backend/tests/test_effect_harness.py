"""Parametric effect test harness — survival, shape, type, range, determinism, stateful, timing.

Validates ALL registered effects across a standard frame set.
Includes ZMQ crash isolation integration test (UAT #3 — Phase 3 lesson).

Marks:
- pytest.mark.smoke: survival, shape, type, range
- pytest.mark.perf: timing budget tests (warning, not failure)
"""

import os
import time
import uuid

import numpy as np
import pytest

from effects import registry
from engine.pipeline import apply_chain, reset_effect_health

# --- Standard frame set ---

STANDARD_FRAMES = {
    "black": np.zeros((480, 640, 4), dtype=np.uint8),
    "white": np.full((480, 640, 4), 255, dtype=np.uint8),
    "gradient": None,  # built below
    "noise": None,  # built below
    "tiny": np.zeros((1, 1, 4), dtype=np.uint8),
    "hd": np.zeros((1080, 1920, 4), dtype=np.uint8),
}

# Build gradient frame
_grad = np.zeros((480, 640, 4), dtype=np.uint8)
for row in range(480):
    _grad[row, :, 0] = int(255 * row / 479)
for col in range(640):
    _grad[:, col, 1] = int(255 * col / 639)
_grad[:, :, 3] = 255
STANDARD_FRAMES["gradient"] = _grad

# Build seeded noise frame
_rng = np.random.default_rng(42)
STANDARD_FRAMES["noise"] = _rng.integers(0, 256, (480, 640, 4), dtype=np.uint8)

# Ensure alpha is set for frames that need it
STANDARD_FRAMES["black"][:, :, 3] = 255
STANDARD_FRAMES["white"][:, :, 3] = 255
STANDARD_FRAMES["tiny"][:, :, :] = [128, 64, 32, 255]
STANDARD_FRAMES["hd"][:, :, 3] = 255


def _get_registered_effect_ids():
    """Get all registered effect IDs (excluding debug.crash)."""
    return [e["id"] for e in registry.list_all() if e["id"] != "debug.crash"]


EFFECT_IDS = _get_registered_effect_ids()
FRAME_NAMES = list(STANDARD_FRAMES.keys())


# --- Fixtures ---


@pytest.fixture(autouse=True)
def _reset_pipeline_health():
    """Reset health tracking between tests."""
    reset_effect_health()
    yield
    reset_effect_health()


# --- Parametric tests ---


@pytest.mark.smoke
@pytest.mark.parametrize("effect_id", EFFECT_IDS)
@pytest.mark.parametrize("frame_name", FRAME_NAMES)
class TestEffectSurvival:
    """Survival: apply() returns (ndarray, state_or_None) without exception."""

    def test_survival(self, effect_id, frame_name):
        """Effect does not crash on standard frame."""
        frame = STANDARD_FRAMES[frame_name].copy()
        effect_info = registry.get(effect_id)
        assert effect_info is not None, f"Effect {effect_id} not registered"

        result = effect_info["fn"](
            frame,
            {},
            None,
            frame_index=0,
            seed=42,
            resolution=(frame.shape[1], frame.shape[0]),
        )
        assert isinstance(result, tuple), f"Expected tuple, got {type(result)}"
        assert len(result) == 2, f"Expected 2-tuple, got {len(result)}-tuple"

        output, state = result
        assert isinstance(output, np.ndarray), (
            f"Output is {type(output)}, expected ndarray"
        )

    def test_shape_preservation(self, effect_id, frame_name):
        """Output shape matches input shape."""
        frame = STANDARD_FRAMES[frame_name].copy()
        effect_info = registry.get(effect_id)
        output, _ = effect_info["fn"](
            frame,
            {},
            None,
            frame_index=0,
            seed=42,
            resolution=(frame.shape[1], frame.shape[0]),
        )
        assert output.shape == frame.shape, (
            f"Shape mismatch: {output.shape} != {frame.shape}"
        )

    def test_type_preservation(self, effect_id, frame_name):
        """Output dtype is uint8."""
        frame = STANDARD_FRAMES[frame_name].copy()
        effect_info = registry.get(effect_id)
        output, _ = effect_info["fn"](
            frame,
            {},
            None,
            frame_index=0,
            seed=42,
            resolution=(frame.shape[1], frame.shape[0]),
        )
        assert output.dtype == np.uint8, f"dtype is {output.dtype}, expected uint8"

    def test_range_preservation(self, effect_id, frame_name):
        """Output values in [0, 255], no NaN."""
        frame = STANDARD_FRAMES[frame_name].copy()
        effect_info = registry.get(effect_id)
        output, _ = effect_info["fn"](
            frame,
            {},
            None,
            frame_index=0,
            seed=42,
            resolution=(frame.shape[1], frame.shape[0]),
        )
        assert output.min() >= 0, f"Min value {output.min()} < 0"
        assert output.max() <= 255, f"Max value {output.max()} > 255"
        assert not np.isnan(output.astype(np.float32)).any(), "Output contains NaN"


@pytest.mark.smoke
@pytest.mark.parametrize("effect_id", EFFECT_IDS)
class TestEffectDeterminism:
    """Determinism: same seed + frame_index → identical output."""

    def test_deterministic_output(self, effect_id):
        """Running twice with same inputs produces identical output."""
        frame = STANDARD_FRAMES["noise"].copy()
        effect_info = registry.get(effect_id)
        resolution = (frame.shape[1], frame.shape[0])

        out1, _ = effect_info["fn"](
            frame.copy(), {}, None, frame_index=5, seed=42, resolution=resolution
        )
        out2, _ = effect_info["fn"](
            frame.copy(), {}, None, frame_index=5, seed=42, resolution=resolution
        )
        np.testing.assert_array_equal(
            out1, out2, err_msg=f"Effect {effect_id} is not deterministic"
        )


@pytest.mark.smoke
@pytest.mark.parametrize("effect_id", EFFECT_IDS)
class TestEffectStateful:
    """Stateful continuity: 10 consecutive frames with state passthrough."""

    def test_stateful_continuity(self, effect_id):
        """10 consecutive frames with state passthrough, no crash."""
        frame = STANDARD_FRAMES["gradient"].copy()
        effect_info = registry.get(effect_id)
        resolution = (frame.shape[1], frame.shape[0])
        state = None

        for i in range(10):
            output, state = effect_info["fn"](
                frame.copy(), {}, state, frame_index=i, seed=42, resolution=resolution
            )
            assert isinstance(output, np.ndarray)
            assert output.shape == frame.shape


@pytest.mark.perf
@pytest.mark.parametrize("effect_id", EFFECT_IDS)
class TestEffectTiming:
    """Timing budget: < 500ms at 1080p."""

    def test_timing_budget_1080p(self, effect_id):
        """Effect processes 1080p frame within 500ms budget."""
        frame = STANDARD_FRAMES["hd"].copy()
        effect_info = registry.get(effect_id)
        resolution = (frame.shape[1], frame.shape[0])

        t0 = time.monotonic()
        effect_info["fn"](
            frame, {}, None, frame_index=0, seed=42, resolution=resolution
        )
        elapsed_ms = (time.monotonic() - t0) * 1000

        if elapsed_ms > 500:
            import warnings

            warnings.warn(
                f"Effect {effect_id} took {elapsed_ms:.0f}ms at 1080p (budget: 500ms)",
                stacklevel=1,
            )


# --- Category-level chain tests ---


@pytest.mark.smoke
class TestCategoryChains:
    """Representative effects chained pairwise — cross-category compatibility."""

    def test_fx_invert_plus_util_levels(self):
        """fx.invert → util.levels chain."""
        frame = STANDARD_FRAMES["gradient"].copy()
        chain = [
            {"effect_id": "fx.invert", "params": {}},
            {"effect_id": "util.levels", "params": {}},
        ]
        output, _ = apply_chain(
            frame, chain, project_seed=42, frame_index=0, resolution=(640, 480)
        )
        assert output.shape == frame.shape
        assert output.dtype == np.uint8

    def test_fx_pixelsort_plus_util_curves(self):
        """fx.pixelsort → util.curves chain."""
        frame = STANDARD_FRAMES["noise"].copy()
        chain = [
            {"effect_id": "fx.pixelsort", "params": {}},
            {"effect_id": "util.curves", "params": {}},
        ]
        output, _ = apply_chain(
            frame, chain, project_seed=42, frame_index=0, resolution=(640, 480)
        )
        assert output.shape == frame.shape
        assert output.dtype == np.uint8

    def test_fx_vhs_plus_util_hsl(self):
        """fx.vhs → util.hsl_adjust chain."""
        frame = STANDARD_FRAMES["gradient"].copy()
        chain = [
            {"effect_id": "fx.vhs", "params": {}},
            {"effect_id": "util.hsl_adjust", "params": {}},
        ]
        output, _ = apply_chain(
            frame, chain, project_seed=42, frame_index=0, resolution=(640, 480)
        )
        assert output.shape == frame.shape

    def test_fx_blur_plus_util_auto_levels(self):
        """fx.blur → util.auto_levels chain."""
        frame = STANDARD_FRAMES["noise"].copy()
        chain = [
            {"effect_id": "fx.blur", "params": {}},
            {"effect_id": "util.auto_levels", "params": {}},
        ]
        output, _ = apply_chain(
            frame, chain, project_seed=42, frame_index=0, resolution=(640, 480)
        )
        assert output.shape == frame.shape


# --- ZMQ crash isolation integration test (UAT #3) ---


@pytest.mark.smoke
class TestZMQCrashIsolation:
    """ZMQ-level crash isolation — debug.crash in chain, server survives."""

    def test_zmq_crash_isolation(self, zmq_client, synthetic_video_path):
        """Send chain with debug.crash over ZMQ. Verify server survives."""
        # Register debug.crash
        os.environ["APP_ENV"] = "development"
        from effects.fx import debug_crash

        if registry.get("debug.crash") is None:
            registry.register(
                debug_crash.EFFECT_ID,
                debug_crash.apply,
                debug_crash.PARAMS,
                debug_crash.EFFECT_NAME,
                debug_crash.EFFECT_CATEGORY,
            )

        msg_id = str(uuid.uuid4())
        zmq_client.send_json(
            {
                "cmd": "render_frame",
                "id": msg_id,
                "path": synthetic_video_path,
                "frame_index": 0,
                "chain": [{"effect_id": "debug.crash", "params": {}, "enabled": True}],
                "project_seed": 42,
            }
        )
        response = zmq_client.recv_json()
        assert response["ok"] is True, f"Crash should be isolated: {response}"

        # Server still alive — can handle next request
        msg_id2 = str(uuid.uuid4())
        zmq_client.send_json({"cmd": "ping", "id": msg_id2})
        pong = zmq_client.recv_json()
        assert pong.get("status") == "alive", "Server should still be alive after crash"

    def test_zmq_crash_with_other_effects(self, zmq_client, synthetic_video_path):
        """debug.crash in chain with real effects — real effects still apply."""
        os.environ["APP_ENV"] = "development"
        from effects.fx import debug_crash

        if registry.get("debug.crash") is None:
            registry.register(
                debug_crash.EFFECT_ID,
                debug_crash.apply,
                debug_crash.PARAMS,
                debug_crash.EFFECT_NAME,
                debug_crash.EFFECT_CATEGORY,
            )

        msg_id = str(uuid.uuid4())
        zmq_client.send_json(
            {
                "cmd": "render_frame",
                "id": msg_id,
                "path": synthetic_video_path,
                "frame_index": 0,
                "chain": [
                    {"effect_id": "debug.crash", "params": {}, "enabled": True},
                    {"effect_id": "fx.invert", "params": {}, "enabled": True},
                ],
                "project_seed": 42,
            }
        )
        response = zmq_client.recv_json()
        assert response["ok"] is True

    def test_zmq_disabled_effects_in_response(self, zmq_client, synthetic_video_path):
        """After enough crashes, disabled_effects appears in response."""
        os.environ["APP_ENV"] = "development"
        from effects.fx import debug_crash

        if registry.get("debug.crash") is None:
            registry.register(
                debug_crash.EFFECT_ID,
                debug_crash.apply,
                debug_crash.PARAMS,
                debug_crash.EFFECT_NAME,
                debug_crash.EFFECT_CATEGORY,
            )

        # Send 3 requests to trigger auto-disable
        for i in range(3):
            msg_id = str(uuid.uuid4())
            zmq_client.send_json(
                {
                    "cmd": "render_frame",
                    "id": msg_id,
                    "path": synthetic_video_path,
                    "frame_index": 0,
                    "chain": [{"effect_id": "debug.crash", "params": {}}],
                    "project_seed": 42,
                }
            )
            zmq_client.recv_json()

        # 4th request — debug.crash should be auto-disabled
        msg_id = str(uuid.uuid4())
        zmq_client.send_json(
            {
                "cmd": "render_frame",
                "id": msg_id,
                "path": synthetic_video_path,
                "frame_index": 0,
                "chain": [{"effect_id": "debug.crash", "params": {}}],
                "project_seed": 42,
            }
        )
        response = zmq_client.recv_json()
        assert response["ok"] is True
        # disabled_effects should be piggybacked
        assert "disabled_effects" in response
        assert "debug.crash" in response["disabled_effects"]
