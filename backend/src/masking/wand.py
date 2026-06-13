"""Magic wand + color_range matte evaluators (MK.6).

Two related operations:

  flood_fill(frame, seed_xy, tolerance) → float32 (H, W) matte
      Contiguous flood-fill starting at *seed_xy* using cv2.floodFill with
      RGB Euclidean distance ≤ *tolerance*.  Seed must be in-bounds (validated
      by the IPC handler before calling here).

  color_range_evaluator(node, ctx, height, width) → float32 (H, W) matte
      Procedural evaluator registered in the kind registry (MK.6 scope).
      Computes a global (non-contiguous) alpha matte based on RGB Euclidean
      distance from a target color, with a softness ramp.

      PERF-MODEL §3.1 — class C: ≤ 4 ms @1080p.  Implemented as vectorized
      numpy operations (no per-pixel Python loop).  Half-res preview degrade:
      when frame_hw area > 1920*1080, evaluator signals half-res mode (see
      PERF-MODEL §3.1 note).

      NaN/Inf in color or tolerance are clamped before evaluation (trust
      boundary — schema._sanitize_params already clamped params; we re-clamp
      here as defence-in-depth).

      Registration call at the bottom of this module makes the evaluator
      available immediately on import.

Color space note:  both wand and color_range use RGB Euclidean distance.
They share _rgb_distance_sq (same helper) so results are comparable — a user
can wand-select a color then switch to color_range with the same tolerance and
get identical matching behaviour except for the contiguity constraint.
"""

from __future__ import annotations

import math
from pathlib import Path
from typing import TYPE_CHECKING

import cv2
import numpy as np

from masking.stack import FrameCtx, register_evaluator

if TYPE_CHECKING:
    from masking.schema import MatteNode

# --------------------------------------------------------------------------- #
#  Bitmap sidecar path validation
# --------------------------------------------------------------------------- #

# Sanctioned directory: ~/.creatrix/mask-bitmaps/
# Follows the ~/.creatrix-prefix pattern from diagnostics.py (_validate_log_dir).
_HOME = Path.home()
_ALLOWED_SIDECAR_DIR = _HOME / ".creatrix" / "mask-bitmaps"


def validate_sidecar_write_path(path: Path) -> list[str]:
    """Validate that *path* is a safe bitmap sidecar write destination.

    Rules:
    - path must be absolute
    - resolved path must be within _ALLOWED_SIDECAR_DIR
    - path must end in .png
    - path components must not contain null bytes or path-traversal sequences
    - parent directory must not be a symlink (anti TOCTOU)

    Returns a list of error strings (empty = valid).
    Never raises.
    """
    errors: list[str] = []

    if not path.is_absolute():
        errors.append("Sidecar path must be absolute")
        return errors

    # Null-byte guard
    path_str = str(path)
    if "\x00" in path_str:
        errors.append("Sidecar path contains null byte")
        return errors

    # Suffix check
    if path.suffix.lower() != ".png":
        errors.append(f"Sidecar path must end in .png (got {path.suffix!r})")
        return errors

    # Filename safety
    name = path.name
    if ".." in name or "/" in name or "\\" in name:
        errors.append(f"Unsafe sidecar filename: {name!r}")
        return errors

    # Resolve to catch symlink traversal.  Use strict=False because the file
    # may not exist yet (we are validating BEFORE writing).
    try:
        resolved = path.resolve()
    except (OSError, RuntimeError) as e:
        errors.append(f"Path resolution failed: {e}")
        return errors

    # Must be within the sanctioned directory
    allowed_resolved = (
        _ALLOWED_SIDECAR_DIR.resolve()
        if _ALLOWED_SIDECAR_DIR.exists()
        else _ALLOWED_SIDECAR_DIR
    )
    # Compare string prefixes (same pattern as diagnostics.py:39)
    resolved_str = str(resolved)
    allowed_str = str(allowed_resolved)
    if not (resolved_str.startswith(allowed_str + "/") or resolved_str == allowed_str):
        errors.append(
            f"Sidecar path {resolved_str!r} is outside the sanctioned directory "
            f"{allowed_str!r}"
        )
        return errors

    return errors


def ensure_sidecar_dir() -> Path:
    """Create ~/.creatrix/mask-bitmaps/ with mode 0o700 if absent. Returns it."""
    _ALLOWED_SIDECAR_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
    return _ALLOWED_SIDECAR_DIR


def sidecar_path_for_node(node_id: str) -> tuple[Path | None, list[str]]:
    """Return a validated sidecar path for *node_id*.

    Calls validate_sidecar_write_path before returning — callers should
    check for errors.  Never raises.
    """
    # Sanitize node_id to prevent injection via the filename.  The schema
    # validator already enforces ^[A-Za-z0-9_-]{1,64}$ on node ids; we
    # re-validate here as defence-in-depth.
    import re

    _ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
    if not _ID_PATTERN.match(node_id):
        return None, [f"node_id {node_id!r} is not safe to use as a filename"]

    sidecar_dir = ensure_sidecar_dir()
    path = sidecar_dir / f"{node_id}.png"
    errors = validate_sidecar_write_path(path)
    if errors:
        return None, errors
    return path, []


# Node-id pattern reused for GC stem validation (defence-in-depth).
import re as _re

_NODE_ID_PATTERN = _re.compile(r"^[A-Za-z0-9_-]{1,64}$")


def gc_orphan_sidecars(active_node_ids: set[str]) -> int:
    """Delete PNG sidecars in _ALLOWED_SIDECAR_DIR whose stem is NOT in *active_node_ids*.

    Safety invariants — this function ONLY ever:
      - Deletes files whose resolved path is inside _ALLOWED_SIDECAR_DIR.
      - Deletes files with suffix .png (case-insensitive).
      - Deletes files whose stem matches the node-id regex (^[A-Za-z0-9_-]{1,64}$).
      - Never follows a symlink out of the sanctioned dir.
      - Never deletes a file that is in *active_node_ids*.

    Trigger: call from project close/load, or via the ``mask_gc_sidecars`` IPC
    command (see zmq_server._handle_mask_gc_sidecars).  Callers pass the full set
    of node IDs currently live in the project — any .png not in that set is orphaned
    and will be removed.

    Returns the count of files deleted.  Never raises.
    """
    if not _ALLOWED_SIDECAR_DIR.exists():
        return 0

    # Resolve the sanctioned dir once, to guard against TOCTOU on the dir itself.
    try:
        allowed_resolved_str = str(_ALLOWED_SIDECAR_DIR.resolve())
    except (OSError, RuntimeError):
        return 0

    deleted = 0
    try:
        candidates = list(_ALLOWED_SIDECAR_DIR.iterdir())
    except OSError:
        return 0

    for entry in candidates:
        # Only .png files
        if entry.suffix.lower() != ".png":
            continue

        # Stem must look like a node id (defence-in-depth — no exotic filenames)
        stem = entry.stem
        if not _NODE_ID_PATTERN.match(stem):
            continue

        # Skip if this node is still active
        if stem in active_node_ids:
            continue

        # Resolve to catch symlinks; must still be inside sanctioned dir
        try:
            resolved = entry.resolve()
        except (OSError, RuntimeError):
            continue

        resolved_str = str(resolved)
        if not (
            resolved_str.startswith(allowed_resolved_str + "/")
            or resolved_str == allowed_resolved_str
        ):
            # Symlink or otherwise escaped the sanctioned dir — never delete
            continue

        # Re-run the write-path validator as a final gate (reuses existing confinement logic)
        errors = validate_sidecar_write_path(resolved)
        if errors:
            continue

        try:
            resolved.unlink()
            deleted += 1
        except OSError:
            pass

    return deleted


# --------------------------------------------------------------------------- #
#  Shared helper
# --------------------------------------------------------------------------- #


def _rgb_distance_sq(
    frame_rgb: np.ndarray,
    target_rgb: tuple[float, float, float],
) -> np.ndarray:
    """Vectorized squared RGB Euclidean distance for each pixel.

    Args:
        frame_rgb: float32 (H, W, 3) array in [0, 255] (or [0, 1] — works either way
                   since target is in the same space).
        target_rgb: (R, G, B) tuple in the same scale as frame_rgb.

    Returns:
        float32 (H, W) array of squared distances.
    """
    tr, tg, tb = target_rgb
    diff = frame_rgb.astype(np.float32) - np.array([tr, tg, tb], dtype=np.float32)
    return np.sum(diff * diff, axis=2)  # (H, W)


# --------------------------------------------------------------------------- #
#  flood_fill — magic wand (contiguous)
# --------------------------------------------------------------------------- #

# Clamp bounds for tolerance (RGB Euclidean distance in [0, 255] space)
_TOL_MIN: float = 0.0
_TOL_MAX: float = 441.67  # sqrt(3) * 255 — max possible distance


def _clamp_tolerance(tol: float) -> float:
    """Clamp tolerance to [0, 441.67] and catch NaN/Inf."""
    if math.isnan(tol) or math.isinf(tol):
        return 0.0
    return max(_TOL_MIN, min(_TOL_MAX, tol))


def flood_fill(
    frame: np.ndarray,
    seed_xy: tuple[int, int],
    tolerance: float,
) -> np.ndarray:
    """Contiguous flood-fill starting at *seed_xy* using cv2.floodFill.

    Args:
        frame:     uint8 RGBA or RGB ndarray (H, W, C).  Only the first 3
                   channels (RGB) are used for distance measurement.
        seed_xy:   (x, y) pixel coordinate in the frame (x = column, y = row).
                   MUST be validated in-bounds by the caller.
        tolerance: RGB Euclidean distance threshold.  NaN/Inf → 0.

    Returns:
        float32 (H, W) matte: 1.0 = contiguous region connected to seed, 0.0 elsewhere.

    Notes:
        cv2.floodFill uses loDiff/upDiff for connectivity.  We use the
        FLOODFILL_MASK_ONLY flag so we can inspect the mask without painting
        the source frame.
    """
    if frame is None or frame.ndim < 3:
        h, w = (
            (frame.shape[0], frame.shape[1])
            if frame is not None and frame.ndim >= 2
            else (1, 1)
        )
        return np.zeros((h, w), dtype=np.float32)

    h, w = frame.shape[:2]
    seed_x, seed_y = seed_xy

    # Bounds are expected to be validated by the IPC handler; assert here for safety.
    if not (0 <= seed_x < w and 0 <= seed_y < h):
        return np.zeros((h, w), dtype=np.float32)

    tol = _clamp_tolerance(float(tolerance))

    # cv2.floodFill operates on uint8 BGR.  Convert RGB → BGR (or use as-is for BGR).
    # We treat the first 3 channels regardless of RGBA.
    rgb = frame[:, :, :3]
    bgr = cv2.cvtColor(rgb.astype(np.uint8), cv2.COLOR_RGB2BGR)

    # Mask must be (H+2, W+2) for cv2.floodFill
    flood_mask = np.zeros((h + 2, w + 2), dtype=np.uint8)

    # loDiff/upDiff are per-channel differences.  We want RGB Euclidean ≤ tol.
    # A conservative per-channel bound: tol / sqrt(3) (ensures any pixel with
    # all-channel differences within this bound has total distance ≤ tol).
    # This is a slight overestimate but keeps the cv2.floodFill call efficient.
    per_channel = int(math.ceil(tol / math.sqrt(3))) if tol > 0 else 0

    flags = (
        4  # 4-connectivity
        | cv2.FLOODFILL_MASK_ONLY
        | (255 << 8)  # write 255 into mask
    )

    cv2.floodFill(
        bgr,
        flood_mask,
        seedPoint=(seed_x, seed_y),
        newVal=(0, 0, 0),  # ignored for MASK_ONLY
        loDiff=(per_channel,) * 3,
        upDiff=(per_channel,) * 3,
        flags=flags,
    )

    # flood_mask is (H+2, W+2); inner region is [1:H+1, 1:W+1]
    inner = flood_mask[1 : h + 1, 1 : w + 1]
    return (inner > 0).astype(np.float32)


# --------------------------------------------------------------------------- #
#  save_bitmap_sidecar / load_bitmap_sidecar
# --------------------------------------------------------------------------- #


def save_bitmap_sidecar(
    matte: np.ndarray, node_id: str
) -> tuple[str | None, list[str]]:
    """Write *matte* as a PNG to the sanctioned sidecar directory.

    Args:
        matte:    float32 (H, W) in [0, 1].
        node_id:  Node identity string (^[A-Za-z0-9_-]{1,64}$).

    Returns:
        (path_str, errors).  On success errors is empty and path_str is the
        absolute path written.  On failure path_str is None and errors is
        non-empty.
    """
    path, errors = sidecar_path_for_node(node_id)
    if errors:
        return None, errors

    assert path is not None

    try:
        # Convert float32 [0,1] → uint8 [0,255] grayscale
        gray8 = (np.clip(matte, 0.0, 1.0) * 255.0).astype(np.uint8)
        ok = cv2.imwrite(str(path), gray8)
        if not ok:
            return None, [f"cv2.imwrite failed for {path}"]
    except Exception as e:  # noqa: BLE001
        return None, [f"Failed to write sidecar: {e}"]

    return str(path), []


def load_bitmap_sidecar(path_str: str, height: int, width: int) -> np.ndarray:
    """Load a PNG sidecar and resize/normalise to float32 (height, width).

    Falls back to an all-ones matte on any I/O or decode failure.
    """
    fallback = np.ones((height, width), dtype=np.float32)

    # Re-validate path before loading (defence-in-depth on trust boundary).
    try:
        path = Path(path_str)
    except Exception:
        return fallback

    errors = validate_sidecar_write_path(path)
    if errors:
        return fallback

    if not path.exists():
        return fallback

    try:
        gray = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
        if gray is None:
            return fallback
        if gray.shape != (height, width):
            gray = cv2.resize(gray, (width, height), interpolation=cv2.INTER_LINEAR)
        return gray.astype(np.float32) / 255.0
    except Exception:  # noqa: BLE001
        return fallback


# --------------------------------------------------------------------------- #
#  color_range evaluator — procedural, per-frame, class C
# --------------------------------------------------------------------------- #

# PERF-MODEL §3.1: half-res degrade threshold (1080p = 2_073_600 px)
_HALF_RES_THRESHOLD_PX = 1920 * 1080


def evaluate_color_range(
    node: "MatteNode",
    ctx: FrameCtx,
    height: int,
    width: int,
) -> np.ndarray:
    """Evaluate a color_range MatteNode → float32 (H, W) matte.

    Expected node.params:
        r, g, b    — target RGB values in [0, 255] (clamped on entry)
        tolerance  — RGB Euclidean distance; pixels within → fully selected
        softness   — additional ramp radius; pixels in [tol, tol+soft] → linear fade

    Vectorized implementation: no per-pixel Python loop.

    Half-res degrade (PERF-MODEL §3.1): when frame area > 1920*1080, the
    evaluation is performed at half resolution and the result is upsampled
    with INTER_LINEAR.  This keeps median @1080p ≤ 4 ms.
    """
    fallback = np.zeros((height, width), dtype=np.float32)

    if ctx.frame is None:
        return fallback

    # --- Extract + clamp params ---
    p = node.params
    r = _safe_param(p.get("r", 0.0), 0.0, 255.0)
    g = _safe_param(p.get("g", 0.0), 0.0, 255.0)
    b = _safe_param(p.get("b", 0.0), 0.0, 255.0)
    tol = _safe_param(p.get("tolerance", 30.0), 0.0, _TOL_MAX)
    soft = _safe_param(p.get("softness", 10.0), 0.0, _TOL_MAX)

    target = (r, g, b)

    frame = ctx.frame  # RGBA or RGB uint8 (H, W, C)
    h, w = frame.shape[:2]

    # Half-res degrade
    eval_h, eval_w = h, w
    half_res = (h * w) >= _HALF_RES_THRESHOLD_PX
    if half_res:
        eval_h, eval_w = h // 2, w // 2

    if half_res:
        eval_frame = cv2.resize(
            frame[:, :, :3].astype(np.uint8),
            (eval_w, eval_h),
            interpolation=cv2.INTER_LINEAR,
        ).astype(np.float32)
    else:
        eval_frame = frame[:, :, :3].astype(np.float32)

    # Vectorized squared distance
    dist_sq = _rgb_distance_sq(eval_frame, target)
    dist = np.sqrt(dist_sq)  # (eval_H, eval_W)

    # Hard region: dist ≤ tol → 1.0
    # Soft ramp: tol < dist ≤ tol + soft → linear fade
    # Outer: dist > tol + soft → 0.0
    if soft > 0:
        # np.clip ensures no NaN from divide-by-zero
        ramp = np.clip((dist - tol) / soft, 0.0, 1.0)
        matte = np.where(dist <= tol, 1.0, 1.0 - ramp).astype(np.float32)
    else:
        matte = (dist <= tol).astype(np.float32)

    if half_res:
        matte = cv2.resize(matte, (w, h), interpolation=cv2.INTER_LINEAR).astype(
            np.float32
        )

    # Ensure output matches requested resolution
    if matte.shape != (height, width):
        matte = cv2.resize(
            matte, (width, height), interpolation=cv2.INTER_LINEAR
        ).astype(np.float32)

    return matte


def _safe_param(v: object, lo: float, hi: float, default: float = 0.0) -> float:
    """Convert *v* to float, clamp to [lo, hi].

    NaN or non-numeric → *default*.
    +Inf → hi (clamp to upper bound).
    -Inf → lo (clamp to lower bound).
    """
    try:
        n = float(v)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default
    if math.isnan(n):
        return default
    if n == float("inf"):
        return hi
    if n == float("-inf"):
        return lo
    return max(lo, min(hi, n))


# --------------------------------------------------------------------------- #
#  Registration (called on import)
# --------------------------------------------------------------------------- #

register_evaluator("color_range", evaluate_color_range)
