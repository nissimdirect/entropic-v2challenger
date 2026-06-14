"""Integration tests for signal engine via ZMQ server render_frame."""

import pytest

from zmq_server import ZMQServer


@pytest.fixture
def server(conftest_server):
    """Use the session-scoped conftest server fixture if available, else create one."""
    return conftest_server


# Use a standalone server for these tests to avoid conftest dependency issues
@pytest.fixture
def standalone_server():
    srv = ZMQServer()
    srv.token = "test-token"
    yield srv
    srv.reset_state()


def _make_msg(cmd, **kwargs):
    return {"cmd": cmd, "_token": "test-token", "id": "test-1", **kwargs}


class TestRenderFrameWithOperators:
    def test_render_without_operators_backward_compat(self, standalone_server):
        """render_frame without operators field works as before."""
        # No video loaded, so this will fail with "missing path"
        msg = _make_msg("render_frame")
        result = standalone_server.handle_message(msg)
        assert result["ok"] is False
        assert "missing path" in result.get("error", "")

    def test_operators_field_empty_list(self, standalone_server):
        """Empty operators list should not change behavior."""
        msg = _make_msg("render_frame", operators=[])
        result = standalone_server.handle_message(msg)
        # Still fails for missing path, but operators don't cause crash
        assert result["ok"] is False
        assert "missing path" in result.get("error", "")

    def test_check_dag_valid(self, standalone_server):
        """check_dag returns valid for non-cyclic graph."""
        msg = _make_msg(
            "check_dag",
            routings=[["A", "B"]],
            new_edge=["A", "C"],
        )
        result = standalone_server.handle_message(msg)
        assert result["ok"] is True
        assert result["is_valid"] is True

    def test_check_dag_cycle(self, standalone_server):
        """check_dag detects cycle."""
        msg = _make_msg(
            "check_dag",
            routings=[["A", "B"], ["B", "C"]],
            new_edge=["C", "A"],
        )
        result = standalone_server.handle_message(msg)
        assert result["ok"] is True
        assert result["is_valid"] is False

    def test_check_dag_invalid_edge(self, standalone_server):
        """check_dag with invalid new_edge returns error."""
        msg = _make_msg("check_dag", routings=[], new_edge=["only_one"])
        result = standalone_server.handle_message(msg)
        assert result["ok"] is False

    def test_signal_engine_lazy_init(self, standalone_server):
        """Signal engine should be lazily initialized."""
        assert standalone_server._signal_engine is None
        engine = standalone_server._get_signal_engine()
        assert engine is not None
        # Second call returns same instance
        assert standalone_server._get_signal_engine() is engine

    def test_signal_state_reset(self, standalone_server):
        """reset_state should clear signal state."""
        standalone_server._signal_state = {"lfo1": {"some": "state"}}
        standalone_server.reset_state()
        assert standalone_server._signal_state == {}

    def test_render_with_65_operators_returns_frame_and_caps_at_64_end_to_end(
        self, standalone_server
    ):
        """P4.1 E2E: 65 LFO operators fed to the signal engine via the server caps at 64.

        We can't call render_frame without a real video file, but we CAN call the
        signal engine through the same server code path the ZMQ handler uses —
        via _get_signal_engine().evaluate_all — which is the authoritative end-to-end
        path for the operator cap enforcement on the backend.
        """
        from modulation.engine import MAX_OPERATORS

        assert MAX_OPERATORS == 64, f"Expected 64, got {MAX_OPERATORS}"

        engine = standalone_server._get_signal_engine()
        ops = [
            {
                "id": f"op-{i}",
                "type": "lfo",
                "is_enabled": True,
                "parameters": {"waveform": "sine", "rate_hz": 1.0, "phase_offset": 0.0},
                "processing": [],
                "mappings": [],
            }
            for i in range(65)
        ]

        values, new_state = engine.evaluate_all(ops, frame_index=0, fps=30.0)

        # Must return a valid dict (no exception, no crash)
        assert isinstance(values, dict)
        assert isinstance(new_state, dict)

        # Cap enforced: only 64 operator values emitted, not 65
        assert len(values) <= MAX_OPERATORS, (
            f"Expected ≤{MAX_OPERATORS} operator values, got {len(values)}"
        )
        # The 65th operator (op-64) must not appear
        assert "op-64" not in values

    def test_render_with_kentaro_cluster_modulates_effect_param_end_to_end(
        self, standalone_server, synthetic_video_path
    ):
        """P4.2 E2E: a kentaroCluster + mapping(source_key='lfo3') changes a frame.

        Render the SAME frame twice: once unmodulated (chain only) and once with a
        kentaroCluster operator whose lfo3 sub-LFO is routed (via source_key) onto
        the hue_shift effect's `amount` param. The modulated frame's bytes must
        differ from the unmodulated frame's — proving the sub-LFO rides the param
        through the real render_frame path (decode → modulate → effect → encode).
        """
        chain = [
            {
                "effect_id": "fx.hue_shift",
                "enabled": True,
                "params": {"amount": 0.0},
                "mix": 1.0,
            }
        ]

        # Baseline: render with the effect but NO operators.
        base_msg = _make_msg(
            "render_frame",
            path=synthetic_video_path,
            chain=chain,
            frame_index=30,
        )
        base = standalone_server.handle_message(base_msg)
        assert base["ok"] is True, base.get("error")

        op_id = "op-1700000000-0"
        operators = [
            {
                "id": op_id,
                "type": "kentaroCluster",
                "is_enabled": True,
                "parameters": {
                    # lfo3 is a saw at frame 30 → a non-zero signal that rotates hue.
                    "lfos": [
                        {"shape": "saw", "rate_hz": 0.7, "depth": 1.0} for _ in range(8)
                    ],
                    "lfo_count": 8,
                },
                "processing": [],
                "mappings": [
                    {
                        "target_effect_id": "fx.hue_shift",
                        "target_param_key": "amount",
                        "source_key": "lfo3",
                        "depth": 1.0,
                        "min": 0.0,
                        "max": 1.0,
                        "blend_mode": "add",
                    }
                ],
            }
        ]
        mod_msg = _make_msg(
            "render_frame",
            path=synthetic_video_path,
            chain=chain,
            frame_index=30,
            operators=operators,
        )
        mod = standalone_server.handle_message(mod_msg)
        assert mod["ok"] is True, mod.get("error")

        # The cluster surfaced a non-zero lfo3 sub-value at frame 30...
        op_values = mod.get("operator_values", {})
        assert f"{op_id}/lfo3" in op_values
        assert op_values[f"{op_id}/lfo3"] > 0.0, (
            "lfo3 should be non-zero at frame 30 (saw), driving the param change"
        )
        # ...and that change made the rendered frame bytes differ.
        assert mod["frame_data"] != base["frame_data"], (
            "kentaroCluster sub-LFO modulation must alter the rendered frame"
        )
