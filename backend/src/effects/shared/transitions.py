"""Shared reveal-mask math for `transition` category effects.

Layer transitions (docs/addendums/LAYER-TRANSITIONS.md, 53 total) share one
mechanism: sweep a 1D "reveal position" axis (derived from the frame's
geometry — column index, row index, radius, angle, ...) and compare it
against an animated `progress` param to decide how much of a second layer
(fed in via the existing `_sidechain_frame` convention — see
`effects/fx/sidechain_cross_blend.py`) shows through at each pixel.

This module owns the progress->mask math so every transition effect applies
identical, tested edge-softness behavior. See `docs/plans/transitions-pattern.md`
for the full authoring pattern (param conventions, test template, registry
wiring) used to add the remaining transitions.
"""

import numpy as np


def reveal_mask_1d(pos: np.ndarray, progress: float, softness: float) -> np.ndarray:
    """Reveal mask along a normalized [0..1] position axis.

    Args:
        pos:      Normalized position per sample, 0..1, float32 array.
        progress: 0 = fully layer A (mask=0 everywhere), 1 = fully layer B
                   (mask=1 everywhere). Values outside [0, 1] are NOT clamped
                   here — callers must clamp at the trust boundary (PLAY-005).
        softness: Width of the anti-aliased blend band, as a fraction of the
                   sweep axis. Must be > 0 (callers clamp to a small epsilon).

    Returns:
        float32 array same shape as `pos`, in [0, 1]. 0 = layer A, 1 = layer B.

    The sweep is padded by `softness` at both ends so progress=0 and
    progress=1 always fully resolve to an all-0 / all-1 mask regardless of
    softness — otherwise a boundary sample sitting exactly at pos=progress
    would freeze at 0.5 and the transition would never fully complete.
    """
    soft = max(float(softness), 1e-6)
    threshold = progress * (1.0 + soft) - soft / 2.0
    mask = (threshold - pos) / soft + 0.5
    return np.clip(mask, 0.0, 1.0).astype(np.float32)


def get_sidechain_rgb(frame: np.ndarray, params: dict) -> np.ndarray | None:
    """Resolve the incoming layer-B RGB frame for a transition.

    Returns None when no `_sidechain_frame` is present (e.g. this transition
    is not wired to a second layer yet, or the registry sweep/oracle tests
    call `apply()` without one) — callers should treat that as identity, the
    same "no key = pass through" convention used by IDENTITY_BY_DEFAULT
    sidechain effects (see backend/tests/test_all_effects.py).
    """
    key_frame = params.get("_sidechain_frame")
    if key_frame is None:
        return None
    key_rgb = key_frame[:, :, :3] if key_frame.shape[2] == 4 else key_frame
    h, w = frame.shape[:2]
    if key_rgb.shape[:2] != (h, w):
        import cv2

        key_rgb = cv2.resize(key_rgb, (w, h))
    return key_rgb.astype(np.float32)


def blend_with_mask(
    frame_rgb: np.ndarray, key_rgb_f32: np.ndarray, mask: np.ndarray
) -> np.ndarray:
    """Blend layer A (frame_rgb, uint8) toward layer B (key_rgb_f32) via mask.

    `mask` broadcasts against (H, W, 1) or (1, W, 1) / (H, 1, 1) — caller's
    reveal-mask shape determines the sweep axis (column, row, radial, ...).
    """
    rgb_f = frame_rgb.astype(np.float32)
    out = rgb_f * (1.0 - mask) + key_rgb_f32 * mask
    # np.rint before cast: astype(uint8) truncates toward zero, so a mask that
    # is mathematically 1.0 but lands at e.g. 0.999999 in float32 (progress=1.0
    # at the far edge of the sweep) would silently truncate 255.0 -> 254. Round
    # to nearest so progress=0/1 always resolve to an exact frame/key match.
    return np.clip(np.rint(out), 0, 255).astype(np.uint8)
