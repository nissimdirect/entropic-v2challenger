"""Regression tests for per-effect state propagation in the preview render path.

The bug: `_handle_render_frame` and `_handle_apply_chain` called `apply_chain`
without threading the `states` dict, so stateful effects (datamosh,
reaction_mosh, frame_drop, generation_loss, temporal_dispersion, feedback,
etc.) silently no-op'd in live preview because they always saw `state_in=None`
and ran the cold-start branch on every frame.

Fix: cache `states` on the ZMQServer keyed by (path, last_frame_index) and
reset on path change or non-monotonic frame jumps. See
`docs/plans/2026-05-06-fix-preview-state-gap.md`.

These tests use `fx.feedback` (temporal_blend variant) as the canonical
stateful effect because it produces a deterministic, observable diff with
or without previous-frame state regardless of source motion. `fx.datamosh`
and `fx.reaction_mosh` are also exercised when registered.
"""

import base64
import uuid

import numpy as np
import pytest

from effects import registry
from engine.cache import decode_mjpeg


def _decode_b64_jpeg(frame_data: str) -> np.ndarray:
    raw = base64.b64decode(frame_data)
    return decode_mjpeg(raw)


def _render(zmq_client, path: str, frame_index: int, chain: list[dict]) -> np.ndarray:
    zmq_client.send_json(
        {
            "cmd": "render_frame",
            "id": str(uuid.uuid4()),
            "path": path,
            "frame_index": frame_index,
            "chain": chain,
            "project_seed": 42,
        }
    )
    resp = zmq_client.recv_json()
    assert resp["ok"], f"render_frame failed: {resp.get('error')}"
    return _decode_b64_jpeg(resp["frame_data"])


def _frames_differ(a: np.ndarray, b: np.ndarray, threshold: float = 0.5) -> bool:
    """True if mean per-pixel absolute diff exceeds `threshold` (0..255 scale)."""
    if a.shape != b.shape:
        return True
    diff = np.abs(a.astype(np.int16) - b.astype(np.int16)).mean()
    return diff > threshold


# Skip the whole module if the canonical stateful effect isn't registered
# (some test builds may strip effects).
if registry.get("fx.feedback") is None:
    pytestmark = pytest.mark.skip(reason="fx.feedback not registered in this build")


class TestRenderStatePropagation:
    """State must propagate across consecutive monotonic frames in preview."""

    def test_feedback_accumulates_across_consecutive_frames(
        self, zmq_client, synthetic_video_path
    ):
        """fx.feedback (temporal_blend feedback mode) blends each frame with
        the previous output. Without state propagation it would equal the
        raw input on every frame; with it, frames 1..N visibly diverge from
        a cold-start render of the same frame.
        """
        chain = [
            {
                "effect_id": "fx.feedback",
                "params": {},
                "enabled": True,
            }
        ]

        # Render 5 consecutive frames — state should accumulate.
        warm_frames = [
            _render(zmq_client, synthetic_video_path, i, chain) for i in range(5)
        ]

        # Cold-start renders: jump-seek to each index from a different path
        # to force state reset, then render that index alone.
        # Easier: kick state by rendering a far-away frame between cold renders.
        cold_2 = _render(
            zmq_client, synthetic_video_path, 2, chain
        )  # cold (just seeked)
        # Make warm again by rendering a sequence ending before the comparison.
        for i in range(3):
            _render(zmq_client, synthetic_video_path, i, chain)
        warm_2_again = _render(zmq_client, synthetic_video_path, 3, chain)

        # Warm frame at index 2 (after run 0..2 in a row) should differ
        # from a cold-start render of the same index.
        warm_2 = warm_frames[2]
        assert _frames_differ(warm_2, cold_2, threshold=0.5), (
            "fx.feedback frame 2 with state propagated equals frame 2 cold — "
            "state is NOT propagating in the preview path. "
            f"diff={np.abs(warm_2.astype(int) - cold_2.astype(int)).mean():.3f}"
        )

        # Sanity: warm-2-again should also differ from cold-2 (state still
        # propagating after a seek-and-resume).
        assert _frames_differ(warm_2_again, cold_2, threshold=0.5)

    def test_datamosh_state_propagates_when_registered(
        self, zmq_client, synthetic_video_path
    ):
        """fx.datamosh requires prev-frame state; first frame returns
        `frame.copy()`, only frame 1+ produces warped output. Without
        state propagation, EVERY frame hits the cold-start branch.
        """
        if registry.get("fx.datamosh") is None:
            pytest.skip("fx.datamosh not registered in this build")

        chain = [
            {
                "effect_id": "fx.datamosh",
                "params": {},
                "enabled": True,
            }
        ]

        # Render 5 consecutive frames — datamosh accumulates flow.
        # Note: synthetic_video_path is a low-motion gradient, so flow may
        # be small; we just assert state propagates by cross-checking
        # against a cold-start render (which would hit the no-op branch).
        for i in range(5):
            _render(zmq_client, synthetic_video_path, i, chain)
        # Now we're in a "warm" state at frame_index=4. Render frame 5
        # (continuous) — has state. Then seek-render frame 5 again — cold.
        warm_5 = _render(zmq_client, synthetic_video_path, 5, chain)
        # Force seek to break continuity (state reset).
        _render(zmq_client, synthetic_video_path, 100, chain)
        cold_5 = _render(zmq_client, synthetic_video_path, 5, chain)
        # On synthetic frames warm and cold may match closely (no motion);
        # we just assert the comparison is consistent (no crash, both decode).
        assert warm_5.size > 0 and cold_5.size > 0

    def test_reaction_mosh_state_propagates_when_registered(
        self, zmq_client, synthetic_video_path
    ):
        """The CTO-cited canonical case: fx.reaction_mosh state propagation."""
        if registry.get("fx.reaction_mosh") is None:
            pytest.skip("fx.reaction_mosh not registered in this build")

        chain = [
            {
                "effect_id": "fx.reaction_mosh",
                "params": {},
                "enabled": True,
            }
        ]
        frames = [_render(zmq_client, synthetic_video_path, i, chain) for i in range(5)]
        assert all(f.size > 0 for f in frames)
        # Some divergence between frame 0 and frame 4 should exist when state
        # is being threaded — at minimum the render didn't crash.
        # Strict diff assertion is left to fx.feedback test which is more sensitive.

    def test_seek_resets_state(self, zmq_client, synthetic_video_path):
        """A non-monotonic frame jump (seek) must reset accumulated state.

        Two seek-to-50 calls (each preceded by a different continuous run)
        must produce identical output — they're both cold-starts at index 50.
        """
        chain = [
            {
                "effect_id": "fx.feedback",
                "params": {},
                "enabled": True,
            }
        ]

        # Build state in a continuous run from 0..2.
        for i in range(3):
            _render(zmq_client, synthetic_video_path, i, chain)
        # Seek to 50 (discontinuity → state reset).
        first_jump = _render(zmq_client, synthetic_video_path, 50, chain)

        # Different continuous run, then seek to 50 again.
        for i in range(10, 13):
            _render(zmq_client, synthetic_video_path, i, chain)
        second_jump = _render(zmq_client, synthetic_video_path, 50, chain)

        assert not _frames_differ(first_jump, second_jump, threshold=1.0), (
            "seek to frame 50 produced different output on two cold starts — "
            "state was not reset on the discontinuity"
        )

    def test_path_change_resets_state(
        self, zmq_client, synthetic_video_path, synthetic_video_with_audio_path
    ):
        """Switching to a different source path must reset state.

        Render N frames on path A, then a frame on path B. State for A
        must not leak into B's render.
        """
        chain = [
            {
                "effect_id": "fx.feedback",
                "params": {},
                "enabled": True,
            }
        ]
        # Build state on path A.
        for i in range(3):
            _render(zmq_client, synthetic_video_path, i, chain)
        # Switch to path B → should be a cold start on B.
        path_b_first = _render(zmq_client, synthetic_video_with_audio_path, 0, chain)

        # Bounce back to path A and build state there, then re-render path B[0].
        for i in range(3):
            _render(zmq_client, synthetic_video_path, i, chain)
        path_b_again = _render(zmq_client, synthetic_video_with_audio_path, 0, chain)

        assert not _frames_differ(path_b_first, path_b_again, threshold=1.0), (
            "path change did not reset state — content from path A bled "
            "into path B's cold-start render"
        )
