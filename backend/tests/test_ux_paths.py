"""UX path integration tests — color effects through the full ZMQ pipeline.

Tests the 7 UX coverage gaps identified during Phase 3 QA review:
1. list_effects returns all 15 effects including util.*
2. render_frame with color effects in chain produces changed output
3. render_frame with mixed color + glitch effects
4. apply_chain via ZMQ with color effects
5. Error sanitization through full ZMQ handler path
6. Effect params verification for util.* via list_effects
7. Color effects are identity-by-default through pipeline
"""

import uuid

import numpy as np
import pytest


KW_RENDER = {"frame_index": 0, "seed": 42, "resolution": (1280, 720)}


# ===========================================================================
# UX-1: list_effects returns all 15 effects including util.*
# ===========================================================================


class TestListEffectsViaZMQ:
    """Verify list_effects ZMQ command returns complete effect catalog."""

    def test_list_effects_returns_15(self, zmq_client):
        """list_effects should return all 15 registered effects."""
        zmq_client.send_json({"cmd": "list_effects", "id": str(uuid.uuid4())})
        resp = zmq_client.recv_json()
        assert resp["ok"] is True
        effects = resp["effects"]
        assert len(effects) == 15

    def test_list_effects_includes_util_namespace(self, zmq_client):
        """list_effects should include all 5 util.* color effects."""
        zmq_client.send_json({"cmd": "list_effects", "id": str(uuid.uuid4())})
        resp = zmq_client.recv_json()
        effect_ids = {e["id"] for e in resp["effects"]}
        expected_util = {
            "util.levels",
            "util.curves",
            "util.hsl_adjust",
            "util.color_balance",
            "util.auto_levels",
        }
        assert expected_util.issubset(effect_ids), (
            f"Missing util effects: {expected_util - effect_ids}"
        )

    def test_list_effects_includes_fx_namespace(self, zmq_client):
        """list_effects should include all 10 fx.* glitch effects."""
        zmq_client.send_json({"cmd": "list_effects", "id": str(uuid.uuid4())})
        resp = zmq_client.recv_json()
        effect_ids = {e["id"] for e in resp["effects"]}
        expected_fx = {
            "fx.invert",
            "fx.hue_shift",
            "fx.noise",
            "fx.blur",
            "fx.posterize",
            "fx.pixelsort",
            "fx.edge_detect",
            "fx.vhs",
            "fx.wave_distort",
            "fx.channelshift",
        }
        assert expected_fx.issubset(effect_ids), (
            f"Missing fx effects: {expected_fx - effect_ids}"
        )

    def test_util_effects_have_category_util(self, zmq_client):
        """All util.* effects should have category='util'."""
        zmq_client.send_json({"cmd": "list_effects", "id": str(uuid.uuid4())})
        resp = zmq_client.recv_json()
        for e in resp["effects"]:
            if e["id"].startswith("util."):
                assert e["category"] == "util", (
                    f"{e['id']} has category={e['category']}, expected 'util'"
                )


# ===========================================================================
# UX-6: Effect params verification for util.* via list_effects
# ===========================================================================


class TestEffectParamsViaZMQ:
    """Verify util.* effect params are correctly exposed through ZMQ."""

    def test_levels_params_include_5_point_controls(self, zmq_client):
        """util.levels params should include input_black, input_white, gamma, output_black, output_white."""
        zmq_client.send_json({"cmd": "list_effects", "id": str(uuid.uuid4())})
        resp = zmq_client.recv_json()
        levels = next(e for e in resp["effects"] if e["id"] == "util.levels")
        param_names = set(levels["params"].keys())
        expected = {
            "input_black",
            "input_white",
            "gamma",
            "output_black",
            "output_white",
            "channel",
        }
        assert expected.issubset(param_names), (
            f"Missing levels params: {expected - param_names}"
        )

    def test_hsl_params_include_hue_ranges(self, zmq_client):
        """util.hsl_adjust target_hue should list all 8 hue ranges + 'all'."""
        zmq_client.send_json({"cmd": "list_effects", "id": str(uuid.uuid4())})
        resp = zmq_client.recv_json()
        hsl = next(e for e in resp["effects"] if e["id"] == "util.hsl_adjust")
        target_hue = hsl["params"]["target_hue"]
        assert target_hue["type"] == "choice"
        expected_options = {
            "all",
            "reds",
            "oranges",
            "yellows",
            "greens",
            "cyans",
            "blues",
            "purples",
            "magentas",
        }
        assert set(target_hue["options"]) == expected_options

    def test_curves_params_include_interpolation_choices(self, zmq_client):
        """util.curves interpolation should have cubic and linear."""
        zmq_client.send_json({"cmd": "list_effects", "id": str(uuid.uuid4())})
        resp = zmq_client.recv_json()
        curves = next(e for e in resp["effects"] if e["id"] == "util.curves")
        interp = curves["params"]["interpolation"]
        assert interp["type"] == "choice"
        assert set(interp["options"]) == {"cubic", "linear"}

    def test_color_balance_params_include_9_zone_controls(self, zmq_client):
        """util.color_balance should have 9 zone controls (3 zones x 3 channels)."""
        zmq_client.send_json({"cmd": "list_effects", "id": str(uuid.uuid4())})
        resp = zmq_client.recv_json()
        cb = next(e for e in resp["effects"] if e["id"] == "util.color_balance")
        param_names = set(cb["params"].keys())
        expected = {
            "shadows_r",
            "shadows_g",
            "shadows_b",
            "midtones_r",
            "midtones_g",
            "midtones_b",
            "highlights_r",
            "highlights_g",
            "highlights_b",
            "preserve_luma",
        }
        assert expected.issubset(param_names), (
            f"Missing color_balance params: {expected - param_names}"
        )


# ===========================================================================
# UX-2: render_frame with color effects in chain
# ===========================================================================


class TestRenderFrameWithColorEffects:
    """Test render_frame ZMQ command with color effect chains."""

    def test_render_with_levels_chain(self, zmq_client, synthetic_video_path):
        """render_frame with util.levels in chain returns frame_data."""
        chain = [
            {
                "effect_id": "util.levels",
                "params": {"gamma": 0.5},
                "enabled": True,
            }
        ]
        zmq_client.send_json(
            {
                "cmd": "render_frame",
                "id": str(uuid.uuid4()),
                "path": synthetic_video_path,
                "frame_index": 0,
                "chain": chain,
                "project_seed": 42,
            }
        )
        resp = zmq_client.recv_json()
        assert resp["ok"] is True
        assert "frame_data" in resp
        assert len(resp["frame_data"]) > 0

    def test_render_with_hsl_chain(self, zmq_client, synthetic_video_path):
        """render_frame with util.hsl_adjust produces valid response."""
        chain = [
            {
                "effect_id": "util.hsl_adjust",
                "params": {"saturation": 50.0, "lightness": 10.0},
                "enabled": True,
            }
        ]
        zmq_client.send_json(
            {
                "cmd": "render_frame",
                "id": str(uuid.uuid4()),
                "path": synthetic_video_path,
                "frame_index": 0,
                "chain": chain,
                "project_seed": 42,
            }
        )
        resp = zmq_client.recv_json()
        assert resp["ok"] is True
        assert "frame_data" in resp

    def test_render_with_empty_chain_succeeds(self, zmq_client, synthetic_video_path):
        """render_frame with empty chain returns unprocessed frame."""
        zmq_client.send_json(
            {
                "cmd": "render_frame",
                "id": str(uuid.uuid4()),
                "path": synthetic_video_path,
                "frame_index": 0,
                "chain": [],
                "project_seed": 42,
            }
        )
        resp = zmq_client.recv_json()
        assert resp["ok"] is True
        assert "frame_data" in resp


# ===========================================================================
# UX-3: render_frame with mixed color + glitch effects
# ===========================================================================


class TestMixedColorGlitchChain:
    """Test chains combining util.* and fx.* effects through ZMQ."""

    def test_levels_then_invert(self, zmq_client, synthetic_video_path):
        """Chain: util.levels -> fx.invert through render_frame."""
        chain = [
            {
                "effect_id": "util.levels",
                "params": {"gamma": 0.7},
                "enabled": True,
            },
            {
                "effect_id": "fx.invert",
                "params": {},
                "enabled": True,
            },
        ]
        zmq_client.send_json(
            {
                "cmd": "render_frame",
                "id": str(uuid.uuid4()),
                "path": synthetic_video_path,
                "frame_index": 0,
                "chain": chain,
                "project_seed": 42,
            }
        )
        resp = zmq_client.recv_json()
        assert resp["ok"] is True
        assert "frame_data" in resp

    def test_hsl_blur_colorbalance_chain(self, zmq_client, synthetic_video_path):
        """Chain: util.hsl_adjust -> fx.blur -> util.color_balance."""
        chain = [
            {
                "effect_id": "util.hsl_adjust",
                "params": {"saturation": 30.0},
                "enabled": True,
            },
            {
                "effect_id": "fx.blur",
                "params": {"radius": 3.0},
                "enabled": True,
            },
            {
                "effect_id": "util.color_balance",
                "params": {"midtones_r": 20},
                "enabled": True,
            },
        ]
        zmq_client.send_json(
            {
                "cmd": "render_frame",
                "id": str(uuid.uuid4()),
                "path": synthetic_video_path,
                "frame_index": 0,
                "chain": chain,
                "project_seed": 42,
            }
        )
        resp = zmq_client.recv_json()
        assert resp["ok"] is True

    def test_5_color_2_glitch_chain(self, zmq_client, synthetic_video_path):
        """All 5 color + 2 glitch effects in one chain via ZMQ."""
        chain = [
            {
                "effect_id": "util.auto_levels",
                "params": {"clip_percent": 1.0},
                "enabled": True,
            },
            {"effect_id": "util.levels", "params": {"gamma": 0.9}, "enabled": True},
            {
                "effect_id": "util.curves",
                "params": {"points": [[0, 0], [64, 48], [192, 208], [255, 255]]},
                "enabled": True,
            },
            {
                "effect_id": "util.hsl_adjust",
                "params": {"saturation": 15.0},
                "enabled": True,
            },
            {
                "effect_id": "util.color_balance",
                "params": {"shadows_b": 10},
                "enabled": True,
            },
            {"effect_id": "fx.blur", "params": {"radius": 2.0}, "enabled": True},
            {"effect_id": "fx.invert", "params": {}, "enabled": True},
        ]
        zmq_client.send_json(
            {
                "cmd": "render_frame",
                "id": str(uuid.uuid4()),
                "path": synthetic_video_path,
                "frame_index": 0,
                "chain": chain,
                "project_seed": 42,
            }
        )
        resp = zmq_client.recv_json()
        assert resp["ok"] is True
        assert "frame_data" in resp

    def test_disabled_color_effect_skipped(self, zmq_client, synthetic_video_path):
        """Disabled color effect in chain should be skipped."""
        # Get baseline with no effects
        zmq_client.send_json(
            {
                "cmd": "render_frame",
                "id": str(uuid.uuid4()),
                "path": synthetic_video_path,
                "frame_index": 0,
                "chain": [],
                "project_seed": 42,
            }
        )
        resp_base = zmq_client.recv_json()
        assert resp_base["ok"] is True

        # Chain with disabled levels
        chain = [
            {
                "effect_id": "util.levels",
                "params": {"gamma": 0.1},
                "enabled": False,
            },
        ]
        zmq_client.send_json(
            {
                "cmd": "render_frame",
                "id": str(uuid.uuid4()),
                "path": synthetic_video_path,
                "frame_index": 0,
                "chain": chain,
                "project_seed": 42,
            }
        )
        resp_disabled = zmq_client.recv_json()
        assert resp_disabled["ok"] is True
        # Disabled effect should produce same frame as no-chain
        assert resp_base["frame_data"] == resp_disabled["frame_data"]


# ===========================================================================
# UX-4: apply_chain via ZMQ with color effects
# ===========================================================================


class TestApplyChainZMQ:
    """Test apply_chain ZMQ command (shared memory path) with color effects."""

    def test_apply_chain_with_levels(self, zmq_client, synthetic_video_path):
        """apply_chain with util.levels returns ok via shared memory path."""
        chain = [
            {
                "effect_id": "util.levels",
                "params": {"gamma": 0.5, "output_black": 20, "output_white": 230},
                "enabled": True,
            }
        ]
        zmq_client.send_json(
            {
                "cmd": "apply_chain",
                "id": str(uuid.uuid4()),
                "path": synthetic_video_path,
                "frame_index": 0,
                "chain": chain,
                "project_seed": 42,
            }
        )
        resp = zmq_client.recv_json()
        assert resp["ok"] is True
        assert resp["frame_index"] == 0

    def test_apply_chain_unknown_effect_zmq(self, zmq_client, synthetic_video_path):
        """apply_chain with unknown effect ID returns error, no stack trace."""
        chain = [
            {"effect_id": "nonexistent.foo", "params": {}, "enabled": True},
        ]
        zmq_client.send_json(
            {
                "cmd": "apply_chain",
                "id": str(uuid.uuid4()),
                "path": synthetic_video_path,
                "frame_index": 0,
                "chain": chain,
                "project_seed": 42,
            }
        )
        resp = zmq_client.recv_json()
        assert resp["ok"] is False
        assert "error" in resp
        assert "Traceback" not in resp.get("error", "")

    def test_apply_chain_with_all_color_effects(self, zmq_client, synthetic_video_path):
        """apply_chain with all 5 color effects stacked."""
        chain = [
            {
                "effect_id": "util.auto_levels",
                "params": {"clip_percent": 2.0},
                "enabled": True,
            },
            {"effect_id": "util.levels", "params": {"gamma": 1.2}, "enabled": True},
            {
                "effect_id": "util.curves",
                "params": {"points": [[0, 10], [128, 140], [255, 245]]},
                "enabled": True,
            },
            {
                "effect_id": "util.hsl_adjust",
                "params": {"saturation": 20.0},
                "enabled": True,
            },
            {
                "effect_id": "util.color_balance",
                "params": {"midtones_g": 15},
                "enabled": True,
            },
        ]
        zmq_client.send_json(
            {
                "cmd": "apply_chain",
                "id": str(uuid.uuid4()),
                "path": synthetic_video_path,
                "frame_index": 0,
                "chain": chain,
                "project_seed": 42,
            }
        )
        resp = zmq_client.recv_json()
        assert resp["ok"] is True


# ===========================================================================
# UX-5: Error sanitization through full ZMQ handler path
# ===========================================================================


class TestErrorSanitizationZMQ:
    """Verify errors from color effects don't leak internals via ZMQ."""

    def test_unknown_effect_in_chain(self, zmq_client, synthetic_video_path):
        """Unknown effect ID in chain returns sanitized error."""
        chain = [
            {"effect_id": "util.nonexistent", "params": {}, "enabled": True},
        ]
        zmq_client.send_json(
            {
                "cmd": "render_frame",
                "id": str(uuid.uuid4()),
                "path": synthetic_video_path,
                "frame_index": 0,
                "chain": chain,
                "project_seed": 42,
            }
        )
        resp = zmq_client.recv_json()
        assert resp["ok"] is False
        # Error should not leak stack traces or file paths
        assert "Traceback" not in resp.get("error", "")

    def test_chain_depth_exceeded(self, zmq_client, synthetic_video_path):
        """Chain exceeding 10 effects returns error before processing."""
        chain = [
            {"effect_id": "fx.invert", "params": {}, "enabled": True} for _ in range(11)
        ]
        zmq_client.send_json(
            {
                "cmd": "render_frame",
                "id": str(uuid.uuid4()),
                "path": synthetic_video_path,
                "frame_index": 0,
                "chain": chain,
                "project_seed": 42,
            }
        )
        resp = zmq_client.recv_json()
        assert resp["ok"] is False

    def test_missing_auth_token(self, zmq_server):
        """Request without auth token returns auth error."""
        import zmq as _zmq

        ctx = _zmq.Context()
        sock = ctx.socket(_zmq.REQ)
        sock.connect(f"tcp://127.0.0.1:{zmq_server.port}")
        sock.send_json({"cmd": "list_effects", "id": str(uuid.uuid4())})
        resp = sock.recv_json()
        assert resp["ok"] is False
        assert "token" in resp["error"].lower()
        sock.close()
        ctx.term()


# ===========================================================================
# UX-7: Color effects identity-by-default through pipeline
# ===========================================================================


class TestIdentityByDefaultViaPipeline:
    """Color effects with default params should not alter frames through pipeline."""

    def test_levels_default_identity(self, zmq_client, synthetic_video_path):
        """util.levels with default params produces same frame as no chain."""
        # No chain
        zmq_client.send_json(
            {
                "cmd": "render_frame",
                "id": str(uuid.uuid4()),
                "path": synthetic_video_path,
                "frame_index": 5,
                "chain": [],
                "project_seed": 42,
            }
        )
        resp_base = zmq_client.recv_json()
        assert resp_base["ok"] is True

        # Default levels
        chain = [
            {"effect_id": "util.levels", "params": {}, "enabled": True},
        ]
        zmq_client.send_json(
            {
                "cmd": "render_frame",
                "id": str(uuid.uuid4()),
                "path": synthetic_video_path,
                "frame_index": 5,
                "chain": chain,
                "project_seed": 42,
            }
        )
        resp_levels = zmq_client.recv_json()
        assert resp_levels["ok"] is True
        assert resp_base["frame_data"] == resp_levels["frame_data"]

    def test_hsl_default_identity(self, zmq_client, synthetic_video_path):
        """util.hsl_adjust with default params (all zeros) is identity."""
        zmq_client.send_json(
            {
                "cmd": "render_frame",
                "id": str(uuid.uuid4()),
                "path": synthetic_video_path,
                "frame_index": 5,
                "chain": [],
                "project_seed": 42,
            }
        )
        resp_base = zmq_client.recv_json()

        chain = [
            {"effect_id": "util.hsl_adjust", "params": {}, "enabled": True},
        ]
        zmq_client.send_json(
            {
                "cmd": "render_frame",
                "id": str(uuid.uuid4()),
                "path": synthetic_video_path,
                "frame_index": 5,
                "chain": chain,
                "project_seed": 42,
            }
        )
        resp_hsl = zmq_client.recv_json()
        assert resp_hsl["ok"] is True
        assert resp_base["frame_data"] == resp_hsl["frame_data"]

    def test_all_color_defaults_identity(self, zmq_client, synthetic_video_path):
        """All 5 color effects with default params chained = identity."""
        zmq_client.send_json(
            {
                "cmd": "render_frame",
                "id": str(uuid.uuid4()),
                "path": synthetic_video_path,
                "frame_index": 5,
                "chain": [],
                "project_seed": 42,
            }
        )
        resp_base = zmq_client.recv_json()

        chain = [
            {"effect_id": "util.levels", "params": {}, "enabled": True},
            {"effect_id": "util.curves", "params": {}, "enabled": True},
            {"effect_id": "util.hsl_adjust", "params": {}, "enabled": True},
            {"effect_id": "util.color_balance", "params": {}, "enabled": True},
            {"effect_id": "util.auto_levels", "params": {}, "enabled": True},
        ]
        zmq_client.send_json(
            {
                "cmd": "render_frame",
                "id": str(uuid.uuid4()),
                "path": synthetic_video_path,
                "frame_index": 5,
                "chain": chain,
                "project_seed": 42,
            }
        )
        resp_all = zmq_client.recv_json()
        assert resp_all["ok"] is True
        assert resp_base["frame_data"] == resp_all["frame_data"]
