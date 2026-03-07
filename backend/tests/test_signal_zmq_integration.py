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
