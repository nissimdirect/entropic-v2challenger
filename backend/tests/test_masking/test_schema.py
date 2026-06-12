"""Tests for masking.schema — MatteNode validation and stack depth cap.

Covers:
  test_matte_node_roundtrip
  test_unknown_kind_rejected             (negative)
  test_node_params_nan_inf_clamped       (negative — NaN/Inf feather/growShrink clamped)
  test_ninth_node_rejected               (negative — MAX_MATTE_NODES_PER_CLIP cap)
"""

from __future__ import annotations

import math

import pytest

from masking.schema import MatteNode, MAX_MATTE_NODES_PER_CLIP, validate_stack


# --------------------------------------------------------------------------- #
#  Helpers
# --------------------------------------------------------------------------- #


def _rect_dict(**overrides) -> dict:
    base = {
        "id": "node-01",
        "kind": "rect",
        "params": {"x": 0.1, "y": 0.2, "w": 0.5, "h": 0.4},
        "op": "add",
        "invert": False,
        "feather": 5.0,
        "growShrink": 2.0,
        "enabled": True,
    }
    base.update(overrides)
    return base


# --------------------------------------------------------------------------- #
#  test_matte_node_roundtrip
# --------------------------------------------------------------------------- #


class TestMatteNodeRoundtrip:
    """Round-trip: from_dict → to_dict → from_dict must produce equal nodes."""

    def test_rect_roundtrip(self):
        data = _rect_dict()
        node = MatteNode.from_dict(data)
        assert node is not None, "Valid rect dict must parse"
        serialised = node.to_dict()
        node2 = MatteNode.from_dict(serialised)
        assert node2 is not None
        assert node2.id == node.id
        assert node2.kind == node.kind
        assert node2.op == node.op
        assert node2.invert == node.invert
        assert math.isclose(node2.feather, node.feather)
        assert math.isclose(node2.growShrink, node.growShrink)
        assert node2.enabled == node.enabled
        assert node2.params == node.params

    def test_ellipse_roundtrip(self):
        data = {
            "id": "ellipse-1",
            "kind": "ellipse",
            "params": {"cx": 0.5, "cy": 0.5, "rx": 0.3, "ry": 0.2},
            "op": "subtract",
            "invert": True,
            "feather": 0.0,
            "growShrink": -5.0,
            "enabled": True,
        }
        node = MatteNode.from_dict(data)
        assert node is not None
        rt = MatteNode.from_dict(node.to_dict())
        assert rt is not None
        assert rt.kind == "ellipse"
        assert rt.op == "subtract"
        assert rt.invert is True

    def test_polygon_roundtrip(self):
        data = {
            "id": "poly-A",
            "kind": "polygon",
            "params": {"vertices": [[0.0, 0.0], [0.5, 0.0], [0.5, 0.5]]},
            "op": "intersect",
            "invert": False,
            "feather": 10.0,
            "growShrink": 0.0,
            "enabled": False,
        }
        node = MatteNode.from_dict(data)
        assert node is not None
        rt = MatteNode.from_dict(node.to_dict())
        assert rt is not None
        assert rt.kind == "polygon"
        assert rt.enabled is False

    @pytest.mark.parametrize(
        "kind",
        [
            "rect",
            "ellipse",
            "polygon",
            "bitmap",
            "chroma_key",
            "luma_key",
            "color_range",
            "ai_matte",
        ],
    )
    def test_all_valid_kinds_accepted(self, kind):
        data = _rect_dict(kind=kind, id="node-x1")
        node = MatteNode.from_dict(data)
        assert node is not None, f"Kind '{kind}' should be accepted"

    def test_op_unknown_falls_back_to_add(self):
        data = _rect_dict(op="union")  # unknown → add
        node = MatteNode.from_dict(data)
        assert node is not None
        assert node.op == "add"

    def test_feather_clamped_on_parse(self):
        # 200 exceeds max [0, 100] → clamped to 100
        node = MatteNode.from_dict(_rect_dict(feather=200.0))
        assert node is not None
        assert node.feather == 100.0

    def test_grow_shrink_clamped_low(self):
        # -100 below min [-50, 50] → clamped to -50
        node = MatteNode.from_dict(_rect_dict(growShrink=-100.0))
        assert node is not None
        assert node.growShrink == -50.0

    def test_id_must_match_regex(self):
        # id with spaces → rejected
        assert MatteNode.from_dict(_rect_dict(id="bad id!")) is None

    def test_empty_id_rejected(self):
        assert MatteNode.from_dict(_rect_dict(id="")) is None

    def test_id_too_long_rejected(self):
        assert MatteNode.from_dict(_rect_dict(id="a" * 65)) is None

    def test_missing_id_rejected(self):
        data = _rect_dict()
        del data["id"]
        assert MatteNode.from_dict(data) is None

    def test_non_dict_rejected(self):
        assert MatteNode.from_dict(None) is None  # type: ignore[arg-type]
        assert MatteNode.from_dict("string") is None  # type: ignore[arg-type]
        assert MatteNode.from_dict(42) is None  # type: ignore[arg-type]


# --------------------------------------------------------------------------- #
#  test_unknown_kind_rejected  (negative)
# --------------------------------------------------------------------------- #


class TestUnknownKindRejected:
    """Unknown kind strings must be rejected — from_dict returns None, never crashes."""

    @pytest.mark.parametrize(
        "bad_kind",
        [
            "mask",
            "RECT",
            "Rect",
            "rectangle",
            "circle",
            "image",
            "",
            None,
            42,
            [],
        ],
    )
    def test_unknown_kind_rejected(self, bad_kind):
        data = _rect_dict(kind=bad_kind)
        result = MatteNode.from_dict(data)
        assert result is None, f"Expected None for kind={bad_kind!r}, got {result!r}"


# --------------------------------------------------------------------------- #
#  test_node_params_nan_inf_clamped  (negative)
# --------------------------------------------------------------------------- #


class TestNodeParamsNanInfClamped:
    """NaN and Inf in feather/growShrink must be clamped to finite defaults — never raise."""

    def test_nan_feather_clamped(self):
        node = MatteNode.from_dict(_rect_dict(feather=float("nan")))
        assert node is not None
        assert math.isfinite(node.feather), f"feather={node.feather} is not finite"
        assert node.feather == 0.0  # NaN → default 0

    def test_inf_feather_clamped(self):
        node = MatteNode.from_dict(_rect_dict(feather=float("inf")))
        assert node is not None
        assert math.isfinite(node.feather)
        assert node.feather == 100.0  # +Inf → clamp max = 100

    def test_neg_inf_feather_clamped(self):
        node = MatteNode.from_dict(_rect_dict(feather=float("-inf")))
        assert node is not None
        assert math.isfinite(node.feather)
        assert node.feather == 0.0  # −Inf → clamp min = 0

    def test_nan_grow_shrink_clamped(self):
        node = MatteNode.from_dict(_rect_dict(growShrink=float("nan")))
        assert node is not None
        assert math.isfinite(node.growShrink)
        assert node.growShrink == 0.0

    def test_inf_grow_shrink_clamped(self):
        node = MatteNode.from_dict(_rect_dict(growShrink=float("inf")))
        assert node is not None
        assert math.isfinite(node.growShrink)
        assert node.growShrink == 50.0  # clamp max

    def test_neg_inf_grow_shrink_clamped(self):
        node = MatteNode.from_dict(_rect_dict(growShrink=float("-inf")))
        assert node is not None
        assert math.isfinite(node.growShrink)
        assert node.growShrink == -50.0  # clamp min

    def test_nan_in_params_dict_clamped_to_zero(self):
        data = _rect_dict(params={"x": float("nan"), "y": 0.1, "w": 0.5, "h": 0.4})
        node = MatteNode.from_dict(data)
        assert node is not None
        assert node.params["x"] == 0.0, "NaN numeric param must be replaced with 0"

    def test_inf_in_params_dict_clamped_to_zero(self):
        data = _rect_dict(params={"cx": float("inf"), "cy": 0.5, "rx": 0.3, "ry": 0.2})
        node = MatteNode.from_dict(data)
        assert node is not None
        assert node.params["cx"] == 0.0


# --------------------------------------------------------------------------- #
#  test_ninth_node_rejected  (negative)
# --------------------------------------------------------------------------- #


class TestNinthNodeRejected:
    """validate_stack must cap at MAX_MATTE_NODES_PER_CLIP (8) — 9th is dropped."""

    def _make_nodes(self, n: int) -> list[dict]:
        return [
            {
                "id": f"node-{i:02d}",
                "kind": "rect",
                "params": {"x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0},
                "op": "add",
                "invert": False,
                "feather": 0.0,
                "growShrink": 0.0,
                "enabled": True,
            }
            for i in range(n)
        ]

    def test_eight_nodes_accepted(self):
        raw = self._make_nodes(MAX_MATTE_NODES_PER_CLIP)
        nodes = validate_stack(raw)
        assert len(nodes) == MAX_MATTE_NODES_PER_CLIP

    def test_ninth_node_rejected(self):
        raw = self._make_nodes(MAX_MATTE_NODES_PER_CLIP + 1)
        nodes = validate_stack(raw)
        # The 9th node must be silently dropped — no exception.
        assert len(nodes) == MAX_MATTE_NODES_PER_CLIP, (
            f"Expected {MAX_MATTE_NODES_PER_CLIP} nodes, got {len(nodes)}"
        )

    def test_many_nodes_still_capped(self):
        raw = self._make_nodes(50)
        nodes = validate_stack(raw)
        assert len(nodes) == MAX_MATTE_NODES_PER_CLIP

    def test_invalid_entries_do_not_count_toward_cap(self):
        """Malformed entries are dropped before counting — valid nodes fill the cap."""
        raw = self._make_nodes(MAX_MATTE_NODES_PER_CLIP)
        # Prepend some bad entries.
        bad = [{"id": "!!bad!!", "kind": "rect"}, None, 42, "string"]
        nodes = validate_stack(bad + raw)
        assert len(nodes) == MAX_MATTE_NODES_PER_CLIP
