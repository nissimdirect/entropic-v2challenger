"""Two-clip blend oracle for the first 3 transitions (53-transitions content
sprint, docs/addendums/LAYER-TRANSITIONS.md #1-#3).

Feeds each transition effect two DISTINCT solid-color clips — layer A (the
`frame` argument) and layer B (via the `_sidechain_frame` convention, same as
`fx.sidechain_cross_blend`) — and asserts the reveal boundary actually moves
real content from A to B as `progress` sweeps 0->1. This is the "two-clip
blend" acceptance oracle referenced by the transitions-sprint task.
"""

import numpy as np
import pytest

from effects.fx.transition_column_cascade import apply as cascade_apply
from effects.fx.transition_column_cascade_reverse import (
    apply as cascade_reverse_apply,
)
from effects.fx.transition_row_waterfall import apply as waterfall_apply

pytestmark = pytest.mark.smoke

W, H = 64, 64
RED = (255, 0, 0)
BLUE = (0, 0, 255)
KW = {"frame_index": 0, "seed": 42, "resolution": (W, H)}


def _solid(color, h=H, w=W):
    f = np.zeros((h, w, 4), dtype=np.uint8)
    f[:, :, 0] = color[0]
    f[:, :, 1] = color[1]
    f[:, :, 2] = color[2]
    f[:, :, 3] = 255
    return f


LAYER_A = _solid(RED)
LAYER_B = _solid(BLUE)


@pytest.mark.parametrize(
    "apply_fn",
    [cascade_apply, cascade_reverse_apply, waterfall_apply],
    ids=["column_cascade", "column_cascade_reverse", "row_waterfall"],
)
class TestTwoClipBlend:
    def test_progress_zero_is_all_layer_a(self, apply_fn):
        params = {"progress": 0.0, "edge_softness": 0.04, "_sidechain_frame": LAYER_B}
        out, _ = apply_fn(LAYER_A.copy(), params, None, **KW)
        np.testing.assert_array_equal(out[:, :, :3], LAYER_A[:, :, :3])

    def test_progress_one_is_all_layer_b(self, apply_fn):
        params = {"progress": 1.0, "edge_softness": 0.04, "_sidechain_frame": LAYER_B}
        out, _ = apply_fn(LAYER_A.copy(), params, None, **KW)
        np.testing.assert_array_equal(out[:, :, :3], LAYER_B[:, :, :3])

    def test_progress_half_reveals_real_boundary(self, apply_fn):
        """At progress=0.5 the frame must contain BOTH clips' colors — proof
        this is an actual two-clip blend, not a uniform fade."""
        params = {"progress": 0.5, "edge_softness": 0.04, "_sidechain_frame": LAYER_B}
        out, _ = apply_fn(LAYER_A.copy(), params, None, **KW)
        rgb = out[:, :, :3]
        has_red = np.any(np.all(rgb == np.array(RED, dtype=np.uint8), axis=-1))
        has_blue = np.any(np.all(rgb == np.array(BLUE, dtype=np.uint8), axis=-1))
        assert has_red, "expected some pixels still fully layer A (red) at progress=0.5"
        assert has_blue, (
            "expected some pixels already fully layer B (blue) at progress=0.5"
        )

    def test_visible_change_vs_no_progress(self, apply_fn):
        """Sweeping progress from 0 to 1 must move a large mean-abs diff of
        the frame toward layer B — the core 'visible change' assertion."""
        low, _ = apply_fn(
            LAYER_A.copy(),
            {"progress": 0.0, "_sidechain_frame": LAYER_B},
            None,
            **KW,
        )
        high, _ = apply_fn(
            LAYER_A.copy(),
            {"progress": 1.0, "_sidechain_frame": LAYER_B},
            None,
            **KW,
        )
        diff = float(
            np.mean(
                np.abs(high[:, :, :3].astype(np.int16) - low[:, :, :3].astype(np.int16))
            )
        )
        assert diff >= 0.5, f"expected visible change across progress sweep, got {diff}"

    def test_alpha_preserved(self, apply_fn):
        f = LAYER_A.copy()
        f[:, :, 3] = 200
        out, _ = apply_fn(f, {"progress": 0.5, "_sidechain_frame": LAYER_B}, None, **KW)
        np.testing.assert_array_equal(out[:, :, 3], 200)

    def test_no_sidechain_is_identity(self, apply_fn):
        """No `_sidechain_frame` (no second layer wired) -> exact passthrough."""
        out, state = apply_fn(LAYER_A.copy(), {"progress": 1.0}, None, **KW)
        np.testing.assert_array_equal(out, LAYER_A)
        assert state is None


class TestColumnCascadeDirection:
    """Column Cascade fills left->right: at partial progress the LEFT columns
    have already flipped to layer B while the RIGHT columns are still layer A
    — the reveal boundary sweeps left-to-right as progress increases. The
    reverse variant sweeps the opposite way (right columns flip first)."""

    def test_left_columns_reveal_before_right(self):
        params = {"progress": 0.5, "edge_softness": 0.02, "_sidechain_frame": LAYER_B}
        out, _ = cascade_apply(LAYER_A.copy(), params, None, **KW)
        rgb = out[:, :, :3]
        assert np.all(rgb[:, 0] == np.array(BLUE, dtype=np.uint8)), (
            "left column should already be layer B at progress=0.5"
        )
        assert np.all(rgb[:, -1] == np.array(RED, dtype=np.uint8)), (
            "right column should still be layer A at progress=0.5"
        )

    def test_right_columns_reveal_before_left(self):
        params = {"progress": 0.5, "edge_softness": 0.02, "_sidechain_frame": LAYER_B}
        out, _ = cascade_reverse_apply(LAYER_A.copy(), params, None, **KW)
        rgb = out[:, :, :3]
        assert np.all(rgb[:, 0] == np.array(RED, dtype=np.uint8)), (
            "left column should still be layer A at progress=0.5 (reverse)"
        )
        assert np.all(rgb[:, -1] == np.array(BLUE, dtype=np.uint8)), (
            "right column should already be layer B at progress=0.5 (reverse)"
        )


class TestRowWaterfallDirection:
    """Row Waterfall fills top->down: at partial progress the TOP rows have
    already flipped to layer B while the BOTTOM rows are still layer A."""

    def test_top_rows_reveal_before_bottom(self):
        params = {"progress": 0.5, "edge_softness": 0.02, "_sidechain_frame": LAYER_B}
        out, _ = waterfall_apply(LAYER_A.copy(), params, None, **KW)
        rgb = out[:, :, :3]
        assert np.all(rgb[0, :] == np.array(BLUE, dtype=np.uint8)), (
            "top row should already be layer B at progress=0.5"
        )
        assert np.all(rgb[-1, :] == np.array(RED, dtype=np.uint8)), (
            "bottom row should still be layer A at progress=0.5"
        )
