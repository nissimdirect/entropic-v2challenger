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
    MAX_TOTAL_VOICES_PER_RENDER,
    validate_composite_layer_count,
    validate_voice_layers,
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


# --- P5a.2: voice-layer cap + voice_id validation (INSTRUMENTS.md §10 P1-1) ---


class TestVoiceLayerValidator:
    """Unit tests for the pure validator (no server)."""

    def test_no_voice_layers_is_valid(self) -> None:
        # Legacy / B1 / PR #167 shape — no voice_id anywhere → empty errors.
        assert validate_voice_layers([]) == []
        assert (
            validate_voice_layers([{"asset_path": "a"}, {"layer_type": "text"}]) == []
        )

    def test_voice_layers_at_and_below_cap_valid(self) -> None:
        layers = [{"voice_id": f"v{i}"} for i in range(MAX_TOTAL_VOICES_PER_RENDER)]
        assert validate_voice_layers(layers) == []

    def test_fifth_voice_rejected(self) -> None:
        layers = [{"voice_id": f"v{i}"} for i in range(MAX_TOTAL_VOICES_PER_RENDER + 1)]
        errors = validate_voice_layers(layers)
        assert errors
        assert "MAX_TOTAL_VOICES_PER_RENDER" in errors[-1]

    def test_non_voice_layers_do_not_count_toward_cap(self) -> None:
        # 4 voices + many plain asset layers → still valid (only voices counted).
        layers = [{"voice_id": f"v{i}"} for i in range(MAX_TOTAL_VOICES_PER_RENDER)]
        layers += [{"asset_path": f"clip{i}.mp4"} for i in range(20)]
        assert validate_voice_layers(layers) == []

    def test_path_traversal_voice_id_rejected(self) -> None:
        errors = validate_voice_layers([{"voice_id": "../../etc/passwd"}])
        assert errors and "malformed" in errors[0]

    def test_oversize_voice_id_rejected(self) -> None:
        errors = validate_voice_layers([{"voice_id": "x" * 4096}])
        assert errors and "malformed" in errors[0]

    def test_empty_voice_id_rejected(self) -> None:
        # Empty string is present (not None) but fails the {1,128} length floor.
        errors = validate_voice_layers([{"voice_id": ""}])
        assert errors and "malformed" in errors[0]

    def test_non_string_voice_id_rejected(self) -> None:
        errors = validate_voice_layers([{"voice_id": 123}])
        assert errors and "must be a string" in errors[0]

    def test_duplicate_voice_id_rejected(self) -> None:
        errors = validate_voice_layers([{"voice_id": "a"}, {"voice_id": "a"}])
        assert errors and "duplicate" in errors[0]

    def test_valid_charset_accepted(self) -> None:
        # Allowed charset [A-Za-z0-9_-]. Colon is RESERVED as the handler's
        # namespace delimiter (red-team HT-2) — a voice_id must not contain it.
        assert validate_voice_layers([{"voice_id": "pad_1-A_99"}]) == []

    def test_colon_in_voice_id_rejected(self) -> None:
        # HT-2: ':' belongs to the "voice:" prefix the handler prepends, never
        # to the voice_id itself — rejecting it prevents "voice:voice:x".
        assert validate_voice_layers([{"voice_id": "voice:pad_1"}]) != []
        assert validate_voice_layers([{"voice_id": ":"}]) != []


class TestVoiceCapHandlerGuard:
    """The handler must reject before any decode runs."""

    def _build_server(self):
        from zmq_server import ZMQServer

        server = ZMQServer.__new__(ZMQServer)
        server.token = "test-token"
        return server

    def test_fifth_voice_rejected_before_decode(self) -> None:
        # Each layer points at an UNREADABLE asset path; if the cap check did NOT
        # fire first, the decode loop would fail on the asset, not the cap. The
        # error proving rejection is the voice cap → decode never ran.
        server = self._build_server()
        layers = [
            {"voice_id": f"v{i}", "asset_path": "/nonexistent/unreadable.mp4"}
            for i in range(MAX_TOTAL_VOICES_PER_RENDER + 1)
        ]
        resp = server._handle_render_composite(
            {"layers": layers, "resolution": [128, 128]}, msg_id="vc1"
        )
        assert resp["ok"] is False
        assert "MAX_TOTAL_VOICES_PER_RENDER" in resp["error"]

    def test_malformed_voice_id_rejected_before_decode(self) -> None:
        server = self._build_server()
        layers = [
            {"voice_id": "../traversal", "asset_path": "/nonexistent/unreadable.mp4"}
        ]
        resp = server._handle_render_composite(
            {"layers": layers, "resolution": [128, 128]}, msg_id="vc2"
        )
        assert resp["ok"] is False
        assert "malformed" in resp["error"]

    def test_duplicate_voice_id_rejected_before_decode(self) -> None:
        server = self._build_server()
        layers = [
            {"voice_id": "dup", "asset_path": "/nonexistent/unreadable.mp4"},
            {"voice_id": "dup", "asset_path": "/nonexistent/unreadable.mp4"},
        ]
        resp = server._handle_render_composite(
            {"layers": layers, "resolution": [128, 128]}, msg_id="vc3"
        )
        assert resp["ok"] is False
        assert "duplicate" in resp["error"]
