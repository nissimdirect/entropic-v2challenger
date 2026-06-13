"""Tests for the mask_thumbnail IPC handler (MK.13 deferral completion).

Gates verified:
  test_rect_static_returns_64x36_png            — static matte → base64 PNG that
                                                   decodes to (36, 64), masked
                                                   region non-zero, unmasked zero
  test_ellipse_static_returns_png               — ellipse node works the same way
  test_procedural_returns_null_no_crash         — procedural kind → thumbnail:null
  test_unknown_clip_id_rejected                 — bad clip_id → ok:false
  test_missing_node_dict_rejected               — node not a dict → ok:false
  test_invalid_node_rejected                    — node fails MatteNode.from_dict → ok:false
  test_default_dimensions_64x36                 — omitting width/height → 64×36
  test_custom_dimensions_respected              — explicit width=32 height=18
  test_additive_unknown_cmd_unchanged           — unknown cmd still → ok:false (regression)
"""

from __future__ import annotations

import base64

import cv2
import numpy as np
import pytest

from masking.schema import MatteNode
from zmq_server import ZMQServer


# --------------------------------------------------------------------------- #
#  Helpers
# --------------------------------------------------------------------------- #


def _make_server() -> ZMQServer:
    """Minimal ZMQServer instance (no threads, no sockets) for unit tests."""
    srv = ZMQServer.__new__(ZMQServer)
    srv.token = "test-token"
    return srv


def _msg(extra: dict) -> dict:
    """Build a handle_message payload with required auth token."""
    return {"id": "t1", "_token": "test-token", **extra}


def _call(srv: ZMQServer, payload: dict) -> dict:
    return srv.handle_message(payload)


def _decode_png(b64: str) -> np.ndarray:
    """Decode a base64 PNG string → grayscale uint8 (H, W)."""
    raw = base64.b64decode(b64)
    arr = np.frombuffer(raw, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_GRAYSCALE)
    assert img is not None, "cv2.imdecode returned None — not a valid PNG"
    return img


# --------------------------------------------------------------------------- #
#  Static matte correctness (Gate 2)
# --------------------------------------------------------------------------- #


class TestStaticMatteReturns64x36PNG:
    """Static matte → base64 PNG with correct shape, masked region non-zero."""

    def test_rect_static_returns_64x36_png(self):
        """Full-frame rect matte should produce a (36, 64) all-white PNG."""
        srv = _make_server()
        node = {
            "id": "rect1",
            "kind": "rect",
            "params": {"x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0},
            "op": "add",
            "invert": False,
            "feather": 0,
            "growShrink": 0,
            "enabled": True,
        }
        resp = _call(
            srv, _msg({"cmd": "mask_thumbnail", "clip_id": "clip-1", "node": node})
        )

        assert resp["ok"] is True
        assert isinstance(resp["thumbnail"], str) and len(resp["thumbnail"]) > 0
        assert resp["width"] == 64
        assert resp["height"] == 36

        img = _decode_png(resp["thumbnail"])
        assert img.shape == (36, 64), f"Expected (36,64), got {img.shape}"
        # Full-frame rect → entire matte is 1.0 → all pixels ~255
        assert img.max() > 0, "Masked region must be non-zero"
        assert img.mean() > 200, "Full-frame rect should be mostly white"

    def test_rect_half_frame_masked_vs_unmasked(self):
        """Left-half rect → left side non-zero, right side zero (within tolerance)."""
        srv = _make_server()
        node = {
            "id": "half1",
            "kind": "rect",
            "params": {"x": 0.0, "y": 0.0, "w": 0.5, "h": 1.0},
            "op": "add",
            "invert": False,
            "feather": 0,
            "growShrink": 0,
            "enabled": True,
        }
        resp = _call(
            srv, _msg({"cmd": "mask_thumbnail", "clip_id": "clip-2", "node": node})
        )

        assert resp["ok"] is True
        img = _decode_png(resp["thumbnail"])
        assert img.shape == (36, 64)

        left_half = img[:, :32]
        right_half = img[:, 32:]
        assert left_half.max() > 0, "Masked (left) region must be non-zero"
        assert right_half.max() == 0, "Unmasked (right) region must be zero"

    def test_ellipse_static_returns_png(self):
        """Centre-fill ellipse → (36, 64) PNG with non-zero interior."""
        srv = _make_server()
        node = {
            "id": "ell1",
            "kind": "ellipse",
            "params": {"cx": 0.5, "cy": 0.5, "rx": 0.4, "ry": 0.4},
            "op": "add",
            "invert": False,
            "feather": 0,
            "growShrink": 0,
            "enabled": True,
        }
        resp = _call(
            srv, _msg({"cmd": "mask_thumbnail", "clip_id": "clip-3", "node": node})
        )

        assert resp["ok"] is True
        img = _decode_png(resp["thumbnail"])
        assert img.shape == (36, 64)
        # Centre pixel of a large-enough ellipse must be non-zero
        cy, cx = img.shape[0] // 2, img.shape[1] // 2
        assert img[cy, cx] > 0, "Centre of ellipse matte should be non-zero"
        # Corner pixels should be zero (outside ellipse)
        assert img[0, 0] == 0, "Top-left corner should be outside the ellipse"


# --------------------------------------------------------------------------- #
#  Procedural fallback (Gate 3 — backend side)
# --------------------------------------------------------------------------- #


class TestProceduralFallback:
    """Procedural node → thumbnail:null, kind:'procedural', no crash."""

    @pytest.mark.parametrize(
        "kind",
        ["chroma_key", "luma_key", "color_range", "ai_matte"],
    )
    def test_procedural_returns_null_no_crash(self, kind: str):
        srv = _make_server()
        node = {
            "id": "proc1",
            "kind": kind,
            "params": {},
            "op": "add",
            "invert": False,
            "feather": 0,
            "growShrink": 0,
            "enabled": True,
        }
        resp = _call(
            srv, _msg({"cmd": "mask_thumbnail", "clip_id": "clip-4", "node": node})
        )

        assert resp["ok"] is True
        assert resp["thumbnail"] is None
        assert resp.get("kind") == "procedural"


# --------------------------------------------------------------------------- #
#  Validation / error paths
# --------------------------------------------------------------------------- #


class TestValidationErrors:
    """Invalid inputs → ok:false, no crash."""

    def test_bad_clip_id_rejected(self):
        srv = _make_server()
        node = {"id": "n1", "kind": "rect", "params": {"x": 0, "y": 0, "w": 1, "h": 1}}
        resp = _call(
            srv,
            _msg({"cmd": "mask_thumbnail", "clip_id": "bad clip!", "node": node}),
        )
        assert resp["ok"] is False
        assert "clip_id" in resp["error"]

    def test_missing_clip_id_rejected(self):
        srv = _make_server()
        node = {"id": "n1", "kind": "rect", "params": {"x": 0, "y": 0, "w": 1, "h": 1}}
        resp = _call(srv, _msg({"cmd": "mask_thumbnail", "node": node}))
        assert resp["ok"] is False

    def test_missing_node_dict_rejected(self):
        srv = _make_server()
        resp = _call(srv, _msg({"cmd": "mask_thumbnail", "clip_id": "c1"}))
        assert resp["ok"] is False
        assert "node" in resp["error"]

    def test_node_not_dict_rejected(self):
        srv = _make_server()
        resp = _call(
            srv, _msg({"cmd": "mask_thumbnail", "clip_id": "c1", "node": "not-a-dict"})
        )
        assert resp["ok"] is False

    def test_invalid_node_rejected(self):
        """Node that fails MatteNode.from_dict (unknown kind) → ok:false."""
        srv = _make_server()
        node = {"id": "n1", "kind": "ufo_shape", "params": {}}
        resp = _call(
            srv, _msg({"cmd": "mask_thumbnail", "clip_id": "c1", "node": node})
        )
        assert resp["ok"] is False
        assert "validation" in resp["error"]


# --------------------------------------------------------------------------- #
#  Dimension handling
# --------------------------------------------------------------------------- #


class TestDimensions:
    """Default and custom width/height are respected."""

    def _rect_node(self, node_id: str = "rn1") -> dict:
        return {
            "id": node_id,
            "kind": "rect",
            "params": {"x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0},
            "op": "add",
            "invert": False,
            "feather": 0,
            "growShrink": 0,
            "enabled": True,
        }

    def test_default_dimensions_64x36(self):
        srv = _make_server()
        resp = _call(
            srv,
            _msg({"cmd": "mask_thumbnail", "clip_id": "c1", "node": self._rect_node()}),
        )
        assert resp["ok"] is True
        assert resp["width"] == 64
        assert resp["height"] == 36
        img = _decode_png(resp["thumbnail"])
        assert img.shape == (36, 64)

    def test_custom_dimensions_respected(self):
        srv = _make_server()
        resp = _call(
            srv,
            _msg(
                {
                    "cmd": "mask_thumbnail",
                    "clip_id": "c1",
                    "node": self._rect_node("rn2"),
                    "width": 32,
                    "height": 18,
                }
            ),
        )
        assert resp["ok"] is True
        assert resp["width"] == 32
        assert resp["height"] == 18
        img = _decode_png(resp["thumbnail"])
        assert img.shape == (18, 32)


# --------------------------------------------------------------------------- #
#  Additive / regression gate
# --------------------------------------------------------------------------- #


def test_additive_unknown_cmd_unchanged():
    """Unknown cmd still returns ok:false (existing dispatch path not broken)."""
    srv = _make_server()
    resp = _call(srv, _msg({"cmd": "nonexistent_cmd_xyz"}))
    assert resp["ok"] is False
    assert "unknown" in resp["error"].lower()
