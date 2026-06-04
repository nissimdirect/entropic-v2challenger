"""INJ-3: backend-enforced composite layer cap + per-layer frame_index guard.

Per PR-INJECTIONS.md #3. The composite render path was unguarded:
- no layer-count cap (the 4-voice limit was a frontend UX convention only) →
  50×4K layers OOM-freeze a 16 GB Mac.
- bare `int(layer_info["frame_index"])` with no clamp → negative seek into
  reader._decode_with_seek on a hand-edited / malformed project.
The single-clip path (_handle_render_frame) was already guarded; this mirrors it.
"""

from __future__ import annotations

from security import (
    MAX_COMPOSITE_LAYERS,
    validate_composite_layer_count,
)


class TestCompositeLayerCountValidator:
    def test_accepts_at_and_below_cap(self) -> None:
        assert validate_composite_layer_count(0) == []
        assert validate_composite_layer_count(MAX_COMPOSITE_LAYERS) == []

    def test_rejects_above_cap(self) -> None:
        errors = validate_composite_layer_count(MAX_COMPOSITE_LAYERS + 1)
        assert errors
        assert "INJ-3" in errors[0]


class TestCompositeHandlerGuards:
    def _build_server(self):
        from zmq_server import ZMQServer

        server = ZMQServer.__new__(ZMQServer)
        server.token = "test-token"
        return server

    def test_rejects_too_many_layers_before_decode(self) -> None:
        server = self._build_server()
        layers = [
            {"layer_type": "video", "frame_index": 0}
            for _ in range(MAX_COMPOSITE_LAYERS + 1)
        ]
        resp = server._handle_render_composite(
            {"layers": layers, "resolution": [1920, 1080]}, msg_id="m1"
        )
        assert resp["ok"] is False
        assert "exceeds maximum" in resp["error"]

    def test_rejects_negative_layer_frame_index(self) -> None:
        server = self._build_server()
        resp = server._handle_render_composite(
            {
                "layers": [{"layer_type": "video", "frame_index": -5, "chain": []}],
                "resolution": [1920, 1080],
            },
            msg_id="m2",
        )
        assert resp["ok"] is False
        assert "non-negative" in resp["error"]

    def test_layer_count_check_fires_before_resolution_parse(self) -> None:
        # cap is enforced even if resolution is also malformed → cap wins (it's first)
        server = self._build_server()
        layers = [{} for _ in range(MAX_COMPOSITE_LAYERS + 5)]
        resp = server._handle_render_composite(
            {"layers": layers, "resolution": "bad"}, msg_id="m3"
        )
        assert resp["ok"] is False
        assert "exceeds maximum" in resp["error"]
