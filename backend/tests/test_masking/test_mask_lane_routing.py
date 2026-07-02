"""MK.8 P2 — key-params-as-lanes routing (the REAL integration oracle).

This file replaces the tautological frontend ``resolvePayload`` test. It drives
the ACTUAL backend modulation resolver (``resolve_mask_modulations``) with a
``mask.<node_id>.<param>`` mapping + an operator value, and asserts the matte
node's param ACTUALLY CHANGED from baseline — and that the changed value reaches
the chroma kernel (matte coverage moves).

Fails-before / passes-after: before the P1 fix there was NO consumer for
``mask.*`` targets — the mapping was emitted by the UI and silently discarded by
``resolve_routings`` (effect_map has no mask nodes). A test asserting the node
param changed would see it UNCHANGED → fail. After the fix the dedicated pass
writes the resolved value in → pass. ``test_mask_lane_is_not_a_noop`` encodes
exactly that contract.
"""

from __future__ import annotations

import cv2
import numpy as np

from modulation.routing import resolve_mask_modulations
from masking.schema import MatteNode
from masking.stack import FrameCtx, resolve_stack


def _chroma_node_dict(node_id: str, tolerance: float = 30.0) -> dict:
    """A mask_stack node in the snake_case IPC payload shape."""
    return {
        "id": node_id,
        "kind": "chroma_key",
        "params": {"hue": 120.0, "tolerance": tolerance, "softness": 0.0, "spill": 0.0},
        "op": "add",
        "invert": False,
        "feather": 0.0,
        "growShrink": 0.0,
        "enabled": True,
    }


def _operator(op_id: str, mappings: list[dict], enabled: bool = True) -> dict:
    return {"id": op_id, "is_enabled": enabled, "mappings": mappings}


def _mask_mapping(
    node_id: str,
    param: str,
    depth: float = 1.0,
    m_min: float = 0.0,
    m_max: float = 1.0,
    blend: str = "add",
) -> dict:
    return {
        "target_effect_id": f"mask.{node_id}",
        "target_param_key": f"mask.{node_id}.{param}",
        "depth": depth,
        "min": m_min,
        "max": m_max,
        "blend_mode": blend,
    }


# --------------------------------------------------------------------------- #
#  THE oracle — the lane is wired (fails-before / passes-after)
# --------------------------------------------------------------------------- #


def test_mask_lane_is_not_a_noop() -> None:
    """An operator mapped to mask.<id>.tolerance CHANGES the node's tolerance.

    This is the regression oracle for the P1 dead-code bug: emitting the target
    without a consumer left the param at baseline. It must now move.
    """
    baseline = 30.0
    mask_stack = [_chroma_node_dict("key-1", tolerance=baseline)]
    ops = [_operator("lfo1", [_mask_mapping("key-1", "tolerance")])]
    # Full signal (1.0) over the tolerance range [1,180] → +179 from base.
    values = {"lfo1": 1.0}

    out = resolve_mask_modulations(values, ops, mask_stack)
    new_tol = out[0]["params"]["tolerance"]

    assert new_tol != baseline, (
        "mask.<id>.tolerance modulation did not change the node param — "
        "the lane is dead code"
    )
    # full signal, depth 1, range [1,180] → clamped to the max (180).
    assert new_tol == 180.0

    # The input must NOT be mutated (deep copy contract).
    assert mask_stack[0]["params"]["tolerance"] == baseline


def test_mask_lane_signal_scales_param() -> None:
    """Partial operator signal maps proportionally into the param range."""
    mask_stack = [_chroma_node_dict("key-1", tolerance=1.0)]  # base at range min
    ops = [_operator("lfo1", [_mask_mapping("key-1", "tolerance")])]

    # signal 0.5, range [1,180] → 1 + 0.5*(180-1) = 90.5
    out = resolve_mask_modulations({"lfo1": 0.5}, ops, mask_stack)
    assert out[0]["params"]["tolerance"] == 90.5

    # hue lane, range [0,360], base 120, signal 0.5 → 120 + 0.5*360 = 300
    ms2 = [_chroma_node_dict("key-1")]
    ops2 = [_operator("lfo1", [_mask_mapping("key-1", "hue")])]
    out2 = resolve_mask_modulations({"lfo1": 0.5}, ops2, ms2)
    assert out2[0]["params"]["hue"] == 300.0


# --------------------------------------------------------------------------- #
#  End-to-end at this layer: modulated value reaches the kernel → matte moves
# --------------------------------------------------------------------------- #


def test_mask_lane_modulates_node_param_reaches_kernel() -> None:
    """The modulated tolerance actually changes the rendered matte coverage.

    Drives the lane (resolve_mask_modulations) then rasterizes via resolve_stack
    — the same path zmq_server uses (modulate mask_stack → resolve mattes). A
    higher operator signal → wider tolerance → more pixels keyed.
    """
    # Hue-gradient frame so coverage varies with tolerance.
    h, w = 64, 256
    hsv = np.zeros((h, w, 3), dtype=np.uint8)
    hsv[:, :, 0] = np.linspace(0, 179, w).astype(np.uint8)[None, :]
    hsv[:, :, 1] = 255
    hsv[:, :, 2] = 255
    rgb = cv2.cvtColor(hsv, cv2.COLOR_HSV2RGB)
    frame = np.dstack([rgb, np.full((h, w), 255, np.uint8)])
    ctx = FrameCtx(frame=frame, frame_index=0, clip_id="clip-1")

    ops = [_operator("lfo1", [_mask_mapping("key-1", "tolerance")])]

    def coverage_at_signal(signal: float) -> float:
        # Start every render from the SAME baseline node so the only variable
        # is the operator signal (what an LFO would output that frame).
        mask_stack = [_chroma_node_dict("key-1", tolerance=1.0)]
        modulated = resolve_mask_modulations({"lfo1": signal}, ops, mask_stack)
        nodes = [MatteNode.from_dict(n) for n in modulated]
        matte = resolve_stack(nodes, ctx, (h, w))
        return float(matte.mean())

    cov_low = coverage_at_signal(0.1)
    cov_high = coverage_at_signal(0.8)

    assert cov_high > cov_low, (
        f"higher operator signal must widen the key (more coverage): "
        f"low={cov_low:.4f} high={cov_high:.4f}"
    )
    assert cov_low > 0.0


# --------------------------------------------------------------------------- #
#  Trust boundary — unknown node / non-key param / bad prefix are skipped
# --------------------------------------------------------------------------- #


def test_mask_lane_trust_boundary_skips() -> None:
    """Unknown node, non-lane-able param, and bad prefix never crash; no change."""
    mask_stack = [_chroma_node_dict("key-1", tolerance=30.0)]

    # Unknown node id → skipped, param untouched.
    ops_unknown = [_operator("lfo1", [_mask_mapping("does-not-exist", "tolerance")])]
    out = resolve_mask_modulations({"lfo1": 1.0}, ops_unknown, mask_stack)
    assert out[0]["params"]["tolerance"] == 30.0

    # Non-lane-able param for chroma (e.g. 'threshold' belongs to luma) → skip.
    ops_wrong = [_operator("lfo1", [_mask_mapping("key-1", "threshold")])]
    out2 = resolve_mask_modulations({"lfo1": 1.0}, ops_wrong, mask_stack)
    assert "threshold" not in out2[0]["params"]
    assert out2[0]["params"]["tolerance"] == 30.0

    # A non-mask target is left entirely to resolve_routings — ignored here.
    ops_effect = [
        _operator(
            "lfo1",
            [{"target_param_key": "fx1.amount", "depth": 1.0, "min": 0, "max": 1}],
        )
    ]
    out3 = resolve_mask_modulations({"lfo1": 1.0}, ops_effect, mask_stack)
    assert out3[0]["params"]["tolerance"] == 30.0

    # luma node CAN modulate threshold (the kind allowlist permits it).
    luma_stack = [
        {
            "id": "luma-1",
            "kind": "luma_key",
            "params": {"threshold": 0.3, "mode": "dark", "softness": 0.0},
            "op": "add",
            "invert": False,
            "feather": 0.0,
            "growShrink": 0.0,
            "enabled": True,
        }
    ]
    ops_luma = [_operator("lfo1", [_mask_mapping("luma-1", "threshold")])]
    out4 = resolve_mask_modulations({"lfo1": 0.5}, ops_luma, luma_stack)
    # base 0.3 + signal 0.5 * range (1-0) = 0.8 (within [0,1]).
    assert out4[0]["params"]["threshold"] == 0.8


def test_mask_lane_disabled_operator_is_inert() -> None:
    """A disabled operator contributes nothing to the mask lane."""
    mask_stack = [_chroma_node_dict("key-1", tolerance=30.0)]
    ops = [_operator("lfo1", [_mask_mapping("key-1", "tolerance")], enabled=False)]
    out = resolve_mask_modulations({"lfo1": 1.0}, ops, mask_stack)
    assert out[0]["params"]["tolerance"] == 30.0


def test_mask_lane_no_mask_stack_is_passthrough() -> None:
    """Absent / empty mask_stack returns unchanged (legacy path)."""
    ops = [_operator("lfo1", [_mask_mapping("key-1", "tolerance")])]
    assert resolve_mask_modulations({"lfo1": 1.0}, ops, None) is None
    assert resolve_mask_modulations({"lfo1": 1.0}, ops, []) == []
