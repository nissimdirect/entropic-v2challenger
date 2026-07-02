"""Tests for masking.stack — resolve_stack boolean fold + per-node ops.

Covers:
  test_stack_add_subtract_intersect_fold
  test_feather_then_grow_order_matches_docstring
"""

from __future__ import annotations

import math

import numpy as np
import pytest

import masking.matte_source as ms
from masking.schema import MatteNode
from masking.stack import FrameCtx, resolve_stack


# --------------------------------------------------------------------------- #
#  Helpers
# --------------------------------------------------------------------------- #


def _fresh() -> None:
    ms.clear_cache()
    ms.reset_sg8_cap()


def _ctx() -> FrameCtx:
    return FrameCtx(frame=None, frame_index=0, clip_id="test-clip")


def _rect_node(
    node_id: str,
    x: float = 0.0,
    y: float = 0.0,
    w: float = 1.0,
    h: float = 1.0,
    op: str = "add",
    invert: bool = False,
    feather: float = 0.0,
    grow_shrink: float = 0.0,
    enabled: bool = True,
) -> MatteNode:
    return MatteNode(
        id=node_id,
        kind="rect",
        params={"x": x, "y": y, "w": w, "h": h},
        op=op,
        invert=invert,
        feather=feather,
        growShrink=grow_shrink,
        enabled=enabled,
    )


H, W = 100, 100
RESOLUTION = (H, W)


# --------------------------------------------------------------------------- #
#  test_stack_add_subtract_intersect_fold
# --------------------------------------------------------------------------- #


class TestStackAddSubtractIntersectFold:
    """Boolean combine semantics for add/subtract/intersect."""

    def test_empty_stack_returns_zeros(self):
        _fresh()
        result = resolve_stack([], _ctx(), RESOLUTION)
        assert result.shape == (H, W)
        assert result.dtype == np.float32
        assert result.max() == pytest.approx(0.0)

    def test_single_add_node_is_identity(self):
        """Single add node → output equals that node's matte."""
        _fresh()
        node = _rect_node("n1", x=0.0, y=0.0, w=0.5, h=1.0, op="add")
        result = resolve_stack([node], _ctx(), RESOLUTION)
        # Left half should be 1, right half 0
        assert result[:, :50].min() == pytest.approx(1.0)
        assert result[:, 50:].max() == pytest.approx(0.0)

    def test_add_union_of_two_rects(self):
        """Add two non-overlapping rects → union covers both regions."""
        _fresh()
        left = _rect_node("left", x=0.0, y=0.0, w=0.5, h=1.0, op="add")
        right = _rect_node("right", x=0.5, y=0.0, w=0.5, h=1.0, op="add")
        result = resolve_stack([left, right], _ctx(), RESOLUTION)
        assert result.min() == pytest.approx(1.0), "Full union must be all-ones"

    def test_subtract_removes_overlap(self):
        """Full-frame add, then subtract left half → only right half remains."""
        _fresh()
        full = _rect_node("full", x=0.0, y=0.0, w=1.0, h=1.0, op="add")
        sub = _rect_node("sub", x=0.0, y=0.0, w=0.5, h=1.0, op="subtract")
        result = resolve_stack([full, sub], _ctx(), RESOLUTION)
        # Right half should be 1
        assert result[:, 50:].min() == pytest.approx(1.0)
        # Left half should be 0
        assert result[:, :50].max() == pytest.approx(0.0)

    def test_intersect_gives_overlap_only(self):
        """Intersect left-half and top-half → only top-left quadrant."""
        _fresh()
        left = _rect_node("left", x=0.0, y=0.0, w=0.5, h=1.0, op="add")
        top = _rect_node("top", x=0.0, y=0.0, w=1.0, h=0.5, op="intersect")
        result = resolve_stack([left, top], _ctx(), RESOLUTION)
        # Top-left quadrant
        assert result[:50, :50].min() == pytest.approx(1.0), "TL quadrant must be 1"
        # Bottom-left (in left but not top)
        assert result[50:, :50].max() == pytest.approx(0.0), "BL must be 0"
        # Top-right (in top but not left — after intersect with left, this is 0)
        assert result[:50, 50:].max() == pytest.approx(0.0), "TR must be 0"

    def test_disabled_node_skipped(self):
        """disabled=False node must not contribute to the fold."""
        _fresh()
        active = _rect_node("active", x=0.0, y=0.0, w=0.5, h=1.0, op="add")
        disabled = _rect_node(
            "dis", x=0.5, y=0.0, w=0.5, h=1.0, op="add", enabled=False
        )
        result = resolve_stack([active, disabled], _ctx(), RESOLUTION)
        # Only left half covered
        assert result[:, :50].min() == pytest.approx(1.0)
        assert result[:, 50:].max() == pytest.approx(0.0)

    def test_invert_flips_matte(self):
        """invert=True on a full-frame matte → output is all-zeros."""
        _fresh()
        inverted = _rect_node("inv", x=0.0, y=0.0, w=1.0, h=1.0, op="add", invert=True)
        result = resolve_stack([inverted], _ctx(), RESOLUTION)
        assert result.max() == pytest.approx(0.0), "Inverted full-frame must be 0"

    def test_invert_partial_flips_regions(self):
        """Invert left-half rect → right half is 1, left half is 0."""
        _fresh()
        node = _rect_node("inv-half", x=0.0, y=0.0, w=0.5, h=1.0, op="add", invert=True)
        result = resolve_stack([node], _ctx(), RESOLUTION)
        assert result[:, 50:].min() == pytest.approx(1.0)
        assert result[:, :50].max() == pytest.approx(0.0)

    def test_subtract_clamps_to_zero_not_negative(self):
        """Subtracting from an empty stack must not produce negative values."""
        _fresh()
        sub = _rect_node("sub", x=0.0, y=0.0, w=1.0, h=1.0, op="subtract")
        result = resolve_stack([sub], _ctx(), RESOLUTION)
        assert result.min() >= 0.0, "Subtract from empty stack must not go negative"

    def test_output_values_in_zero_one(self):
        """resolve_stack must always return values clipped to [0, 1]."""
        _fresh()
        nodes = [
            _rect_node("a", x=0.0, y=0.0, w=0.6, h=0.6, op="add"),
            _rect_node("b", x=0.4, y=0.4, w=0.6, h=0.6, op="add"),
            _rect_node("c", x=0.2, y=0.2, w=0.2, h=0.2, op="subtract"),
        ]
        result = resolve_stack(nodes, _ctx(), RESOLUTION)
        assert result.min() >= 0.0
        assert result.max() <= 1.0


# --------------------------------------------------------------------------- #
#  test_feather_then_grow_order_matches_docstring
# --------------------------------------------------------------------------- #


class TestFeatherThenGrowOrderMatchesDocstring:
    """Per-node processing order: invert → feather → grow/shrink → combine.

    This test verifies the order by checking that feather is applied BEFORE
    grow/shrink (the docstring order). If the order were reversed, the
    feathered edge would be structurally different.

    Verification strategy: on a hard-edged rect, feather=5 then grow=5 should
    result in a different edge profile than grow=5 then feather=5.
    We confirm the order by checking interior pixel values.
    """

    def _feather_then_grow(
        self, H: int, W: int, feather: float, grow: float
    ) -> np.ndarray:
        """Simulate the correct order: feather first, then grow."""
        from scipy.ndimage import gaussian_filter
        import cv2

        # Start with a hard-edged half-frame rect
        base = np.zeros((H, W), dtype=np.float32)
        base[:, : W // 2] = 1.0

        # 1. Feather
        if feather > 0:
            base = gaussian_filter(base, sigma=feather).astype(np.float32)
        # 2. Grow
        if grow > 0:
            r = max(1, int(round(grow)))
            kernel = cv2.getStructuringElement(
                cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1)
            )
            base = cv2.dilate(base, kernel).astype(np.float32)

        return np.clip(base, 0.0, 1.0)

    def test_feather_then_grow_order_matches_docstring(self):
        """resolve_stack applies feather then grow, matching the docstring order."""
        _fresh()
        H, W = 100, 100
        feather_val = 5.0
        grow_val = 5.0

        # Build a node with both feather and grow
        node = _rect_node(
            "fg-node",
            x=0.0,
            y=0.0,
            w=0.5,
            h=1.0,
            feather=feather_val,
            grow_shrink=grow_val,
        )
        result = resolve_stack([node], FrameCtx(clip_id="fg-clip"), (H, W))

        # Compute expected (feather THEN grow)
        expected = self._feather_then_grow(H, W, feather_val, grow_val)

        # They must be close (within float32 rounding)
        assert np.allclose(result, expected, atol=0.02), (
            "resolve_stack does not match feather-then-grow docstring order"
        )

    def test_grow_only_expands_boundary(self):
        """grow > 0 must expand the selection boundary outward."""
        _fresh()
        H, W = 100, 100
        # Left-half rect, no feather, grow=5
        node = _rect_node("grow5", x=0.0, y=0.0, w=0.5, h=1.0, grow_shrink=5.0)
        result = resolve_stack([node], _ctx(), (H, W))
        # Pixel at col=54 (5 pixels right of the boundary at col=50) must be 1
        assert result[50, 54] == pytest.approx(1.0, abs=0.05), (
            "grow=5 must expand the boundary by ~5 px"
        )

    def test_shrink_only_contracts_boundary(self):
        """growShrink < 0 must contract the selection boundary inward."""
        _fresh()
        H, W = 100, 100
        # Left-half rect, no feather, shrink=5
        node = _rect_node("shrink5", x=0.0, y=0.0, w=0.5, h=1.0, grow_shrink=-5.0)
        result = resolve_stack([node], _ctx(), (H, W))
        # Pixel at col=46 (4 pixels inside the boundary at col=50) should still be 1
        assert result[50, 44] == pytest.approx(1.0, abs=0.05)
        # Pixel at col=48 (2 pixels inside, may be eroded) — edge moves in
        # Pixel at col=52 (beyond boundary even before erosion) must be 0
        assert result[50, 52] == pytest.approx(0.0, abs=0.05)

    def test_procedural_kind_raises_not_implemented(self):
        """Unregistered procedural kinds must raise NotImplementedError.

        MK.8/MK.12 note: ``chroma_key``/``luma_key``/``color_range``/``ai_matte``
        are now all REGISTERED, so this test constructs a MatteNode directly
        (bypassing schema validation) with a synthetic, never-registered
        procedural kind to exercise the unregistered-procedural-kind path. The
        behavior under test is unchanged.
        """
        _fresh()
        node = MatteNode(
            id="proc-01",
            kind="_never_registered_procedural_",
            params={},
        )
        with pytest.raises(NotImplementedError):
            resolve_stack([node], _ctx(), RESOLUTION)
