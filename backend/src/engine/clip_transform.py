"""Shared clip-transform math (A2b — preview/export parity).

`apply_clip_transform` is the ONE implementation of the clip position/scale/
rotation/flip transform. It was previously a private method on the ZMQ server
(``_apply_clip_transform``); it lived only on the preview path, so a positioned/
scaled/rotated clip rendered correctly in preview but exported at default
placement (the A2b parity bug). Both the preview handlers (render_frame,
render_composite) and the export engine now call THIS function, so the two paths
cannot drift.

`fold_transform_override` mirrors the frontend ``mergeTransformOverride``
(``frontend/src/renderer/utils/transformLanes.ts``): a per-frame transform-lane
value REPLACES the field it automates; every unautomated field keeps the base.
The export engine uses it to fold the ``clipTransform.<clipId>.<field>`` keys that
ride the ``automation_by_frame`` channel over the clip's static transform, per
exported frame — the same numbers preview's ``mergeTransformOverride`` uses.

Trust boundary: every numeric is passed through ``clamp_finite`` at the SAME
bounds ``apply_clip_transform`` itself enforces, so a lane-sourced NaN/Inf/out-of-
range value can never reach the warpAffine math.
"""

from __future__ import annotations

import numpy as np

from engine.guards import clamp_finite

# The 5 automatable transform fields (flipH/flipV/anchor are NOT automatable —
# mirrors ``TRANSFORM_FIELDS`` in transformLanes.ts). Each maps to the SAME
# clamp bounds ``apply_clip_transform`` enforces and the frontend's
# ``TRANSFORM_FIELD_META.store{Min,Max}``.
TRANSFORM_FIELD_BOUNDS: dict[str, tuple[float, float, float]] = {
    # field: (lo, hi, fallback)
    "x": (-10000.0, 10000.0, 0.0),
    "y": (-10000.0, 10000.0, 0.0),
    "scaleX": (0.01, 100.0, 1.0),
    "scaleY": (0.01, 100.0, 1.0),
    "rotation": (-36000.0, 36000.0, 0.0),
}

# Reserved paramPath namespace for clip-transform lanes (mirrors
# ``CLIP_TRANSFORM_NAMESPACE`` in transformLanes.ts).
CLIP_TRANSFORM_NAMESPACE = "clipTransform"


def normalize_transform(base: dict | None) -> dict:
    """Fill a partial/legacy transform to the full 9-field shape.

    Mirrors ``normalizeTransform`` (frontend/src/shared/types.ts): legacy
    ``scale`` maps onto both ``scaleX`` and ``scaleY``; missing fields take
    identity defaults. Returns a NEW dict (never mutates ``base``).
    """
    b = base or {}
    legacy_scale = b.get("scale")
    return {
        "x": b.get("x", 0.0),
        "y": b.get("y", 0.0),
        "scaleX": b.get("scaleX", legacy_scale if legacy_scale is not None else 1.0),
        "scaleY": b.get("scaleY", legacy_scale if legacy_scale is not None else 1.0),
        "rotation": b.get("rotation", 0.0),
        "anchorX": b.get("anchorX", 0.0),
        "anchorY": b.get("anchorY", 0.0),
        "flipH": b.get("flipH", False),
        "flipV": b.get("flipV", False),
    }


def fold_transform_override(
    base: dict | None, per_frame_automation: dict | None, clip_id: str | None
) -> dict:
    """Fold a frame's transform-lane values over a static clip transform.

    Mirrors the frontend ``mergeTransformOverride`` semantics EXACTLY: for each
    of the 5 automatable fields, a finite ``clipTransform.<clip_id>.<field>``
    value in ``per_frame_automation`` REPLACES the base field; every other field
    (incl. flip/anchor) keeps the normalized base value. Returns a full 9-field
    transform dict ready for :func:`apply_clip_transform`.

    ``per_frame_automation`` is the flat ``{paramPath: value}`` map the frontend
    pre-resolves per source frame (``automation_by_frame[frame]``). Non-transform
    keys and other clips' lanes are ignored. Each folded value is re-clamped via
    ``clamp_finite`` at the field's store bounds (trust boundary; the values were
    already validated finite at export start, but the clamp is defense-in-depth
    and keeps the fold self-contained).
    """
    merged = normalize_transform(base)
    if not per_frame_automation or not clip_id:
        return merged
    prefix = f"{CLIP_TRANSFORM_NAMESPACE}.{clip_id}."
    for key, value in per_frame_automation.items():
        if not isinstance(key, str) or not key.startswith(prefix):
            continue
        field = key[len(prefix) :]
        bounds = TRANSFORM_FIELD_BOUNDS.get(field)
        if bounds is None:
            continue  # not one of the 5 automatable fields
        try:
            fval = float(value)
        except (ValueError, TypeError):
            continue
        lo, hi, fallback = bounds
        merged[field] = clamp_finite(fval, lo, hi, fallback)
    return merged


def apply_clip_transform(
    frame: np.ndarray, transform: dict, resolution: tuple[int, int]
) -> np.ndarray:
    """Apply position/scale/rotation/flip transform to frame.

    Supports: scaleX/scaleY (independent), anchorX/anchorY, flipH/flipV.
    Falls back to legacy 'scale' field for old project compatibility.
    All values are clamped at the trust boundary via clamp_finite.
    """
    import cv2

    try:
        # Support both new scaleX/scaleY and legacy scale field
        legacy_scale = transform.get("scale", None)
        scale_x = clamp_finite(
            float(
                transform.get(
                    "scaleX", legacy_scale if legacy_scale is not None else 1.0
                )
            ),
            0.01,
            100.0,
            1.0,
        )
        scale_y = clamp_finite(
            float(
                transform.get(
                    "scaleY", legacy_scale if legacy_scale is not None else 1.0
                )
            ),
            0.01,
            100.0,
            1.0,
        )
        rotation = clamp_finite(
            float(transform.get("rotation", 0.0)), -36000.0, 36000.0, 0.0
        )
        tx = clamp_finite(float(transform.get("x", 0.0)), -10000.0, 10000.0, 0.0)
        ty = clamp_finite(float(transform.get("y", 0.0)), -10000.0, 10000.0, 0.0)
        anchor_x = clamp_finite(
            float(transform.get("anchorX", 0.0)), -10000.0, 10000.0, 0.0
        )
        anchor_y = clamp_finite(
            float(transform.get("anchorY", 0.0)), -10000.0, 10000.0, 0.0
        )
        flip_h = bool(transform.get("flipH", False))
        flip_v = bool(transform.get("flipV", False))
    except (ValueError, TypeError):
        return frame  # Malformed transform values — render unmodified

    # No-op check
    if (
        scale_x == 1.0
        and scale_y == 1.0
        and rotation == 0.0
        and tx == 0.0
        and ty == 0.0
        and anchor_x == 0.0
        and anchor_y == 0.0
        and not flip_h
        and not flip_v
    ):
        return frame

    h, w = frame.shape[:2]
    canvas_w, canvas_h = resolution

    # Flip
    if flip_h:
        frame = cv2.flip(frame, 1)
    if flip_v:
        frame = cv2.flip(frame, 0)

    # Scale (independent X/Y)
    if scale_x != 1.0 or scale_y != 1.0:
        new_w = max(1, int(w * scale_x))
        new_h = max(1, int(h * scale_y))
        frame = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
        h, w = frame.shape[:2]

    # Create canvas and center the frame
    channels = frame.shape[2] if frame.ndim == 3 else 1
    canvas = np.zeros((canvas_h, canvas_w, channels), dtype=np.uint8)
    x_off = int((canvas_w - w) / 2 + tx)
    y_off = int((canvas_h - h) / 2 + ty)

    # Compute source and destination regions (clip to canvas bounds)
    src_x1 = max(0, -x_off)
    src_y1 = max(0, -y_off)
    dst_x1 = max(0, x_off)
    dst_y1 = max(0, y_off)
    copy_w = min(w - src_x1, canvas_w - dst_x1)
    copy_h = min(h - src_y1, canvas_h - dst_y1)

    if copy_w > 0 and copy_h > 0:
        canvas[dst_y1 : dst_y1 + copy_h, dst_x1 : dst_x1 + copy_w] = frame[
            src_y1 : src_y1 + copy_h, src_x1 : src_x1 + copy_w
        ]

    # Rotation (around anchor point offset from canvas center)
    if rotation != 0.0:
        center = (canvas_w / 2 + anchor_x, canvas_h / 2 + anchor_y)
        rot_mat = cv2.getRotationMatrix2D(center, rotation, 1.0)
        canvas = cv2.warpAffine(canvas, rot_mat, (canvas_w, canvas_h))

    return canvas
