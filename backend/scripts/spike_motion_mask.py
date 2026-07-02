#!/usr/bin/env python3
"""MK.14 SPIKE: Motion-tracked masks research script.

Evaluates three motion-tracking candidates against three synthetic fixtures:
  (a) Candidate A — Farneback dense optical-flow warp of a static matte
  (b) Candidate B — Sparse Lucas-Kanade feature tracking → MK.11 transform keyframes
  (c) Candidate C — Defer to RVM-per-frame (MK.12 baseline for person-shaped mattes)

Fixtures:
  F1 — Talking-head: person translates across frame slowly
  F2 — Fast pan: rapid lateral motion, heavy blur
  F3 — Occlusion: tracked subject passes behind a foreground object

For each candidate × fixture combination the script records:
  - Wall-time per frame @480p (median over all frames)
  - Max centroid drift vs ground-truth matte (pixels)
  - GO / NO-GO verdict (drift ≤ 8px AND time ≤ 20ms/frame)
  - Evidence PNG pairs (frame 0 overlay, drift-worst-frame overlay)

Usage (single command):
  cd backend && python scripts/spike_motion_mask.py

Outputs written to  docs/roadmap/specs/masking/<YYYY-MM-DD>/
  spike_results.json    — machine-readable 9-row matrix
  mk14-<candidate>-<fixture>-f0.png        — frame 0 overlay
  mk14-<candidate>-<fixture>-worst.png     — worst-drift frame overlay

All outputs use paths relative to the repo root; the script resolves them
from its own location so it is runnable from any cwd.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path
from typing import NamedTuple

import cv2
import numpy as np

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

_SCRIPT_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _SCRIPT_DIR.parent.parent  # backend/scripts/ -> backend/ -> repo/
_OUT_DIR = _REPO_ROOT / "docs" / "roadmap" / "specs" / "masking"

# Use today's date as folder name so multiple runs don't overwrite each other.
import datetime

_DATE = datetime.date.today().isoformat()
_RUN_DIR = _OUT_DIR / _DATE
_RUN_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Constants / thresholds
# ---------------------------------------------------------------------------

WIDTH, HEIGHT = 854, 480  # 480p
N_FRAMES = 30  # 1 second @ 30fps
DRIFT_PASS_PX = 8.0  # maximum centroid drift for GO verdict
TIME_PASS_MS = 20.0  # maximum per-frame wall-time for GO verdict

# ---------------------------------------------------------------------------
# Synthetic fixture generators
# ---------------------------------------------------------------------------


def _draw_circle_matte(h: int, w: int, cx: int, cy: int, r: int) -> np.ndarray:
    """Return float32 (H,W) matte with a filled circle."""
    m = np.zeros((h, w), dtype=np.float32)
    cv2.circle(m, (cx, cy), r, 1.0, -1)
    return m


def _draw_occluder(frame: np.ndarray, cx: int, cy: int, r: int) -> np.ndarray:
    """Paint an opaque rectangle occluder over *frame* in-place (returns copy)."""
    out = frame.copy()
    x1, y1 = cx - r, cy - 20
    x2, y2 = cx + r, cy + 20
    cv2.rectangle(out, (x1, y1), (x2, y2), (80, 40, 40), -1)
    return out


def make_fixture_f1(n: int = N_FRAMES) -> tuple[list[np.ndarray], list[np.ndarray]]:
    """F1 — Talking head: person circle translates slowly left→right."""
    frames, gt_mattes = [], []
    r = 80
    for i in range(n):
        cx = 150 + int(i * (WIDTH - 300) / max(n - 1, 1))
        cy = HEIGHT // 2
        frame = np.full((HEIGHT, WIDTH, 3), (30, 30, 30), dtype=np.uint8)
        cv2.circle(frame, (cx, cy), r, (200, 160, 120), -1)  # "skin" blob
        cv2.circle(frame, (cx, cy - 50), 30, (80, 60, 50), -1)  # darker head oval
        frames.append(frame)
        gt_mattes.append(_draw_circle_matte(HEIGHT, WIDTH, cx, cy, r + 10))
    return frames, gt_mattes


def make_fixture_f2(n: int = N_FRAMES) -> tuple[list[np.ndarray], list[np.ndarray]]:
    """F2 — Fast pan: full-frame lateral motion (simulated by scrolling bg + object).

    The object moves fast (up to 30px/frame), causing heavy inter-frame blur.
    """
    frames, gt_mattes = [], []
    r = 70
    for i in range(n):
        # Object accelerates and decelerates — simulates fast pan
        t = i / max(n - 1, 1)
        cx = int(100 + (WIDTH - 200) * (3 * t**2 - 2 * t**3))  # smooth-step
        cy = HEIGHT // 2 + int(30 * np.sin(t * np.pi))

        # Background: horizontal stripes that scroll (simulate panning scene)
        frame = np.zeros((HEIGHT, WIDTH, 3), dtype=np.uint8)
        stripe_offset = int(i * 25) % 40
        for y in range(0, HEIGHT, 40):
            c = 40 + 20 * ((y // 40) % 2)
            frame[y : y + 20, :] = c

        # Scroll stripes horizontally
        frame = np.roll(frame, stripe_offset, axis=1)

        # Draw object
        cv2.circle(frame, (cx, cy), r, (180, 200, 100), -1)

        # Simulate motion blur (average with shifted frame)
        shift = int(25 * (t if t < 0.5 else 1 - t))
        if shift > 0:
            blurred = np.roll(frame, shift, axis=1).astype(np.float32)
            frame = (
                (frame.astype(np.float32) * 0.7 + blurred * 0.3)
                .clip(0, 255)
                .astype(np.uint8)
            )

        frames.append(frame)
        gt_mattes.append(_draw_circle_matte(HEIGHT, WIDTH, cx, cy, r + 5))
    return frames, gt_mattes


def make_fixture_f3(n: int = N_FRAMES) -> tuple[list[np.ndarray], list[np.ndarray]]:
    """F3 — Occlusion: object passes behind a foreground rectangle.

    The ground-truth matte always covers the full object (it's still "there"),
    but the visible pixels disappear for the middle frames — hardest case for
    feature-based trackers.
    """
    frames, gt_mattes = [], []
    r = 65
    occluder_cx = WIDTH // 2
    occluder_h = 80

    for i in range(n):
        t = i / max(n - 1, 1)
        cx = int(120 + (WIDTH - 240) * t)
        cy = HEIGHT // 2

        frame = np.full((HEIGHT, WIDTH, 3), (25, 25, 35), dtype=np.uint8)
        cv2.circle(frame, (cx, cy), r, (160, 130, 200), -1)

        # Draw occluder on top (foreground)
        oy1 = cy - occluder_h // 2
        oy2 = cy + occluder_h // 2
        cv2.rectangle(
            frame,
            (occluder_cx - r - 10, oy1),
            (occluder_cx + r + 10, oy2),
            (60, 60, 90),
            -1,
        )
        # Occluder label
        cv2.putText(
            frame,
            "OCCLUDER",
            (occluder_cx - 50, cy + 5),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.4,
            (200, 200, 200),
            1,
        )

        frames.append(frame)
        # GT matte covers the full object always (it's where it IS, not where we see it)
        gt_mattes.append(_draw_circle_matte(HEIGHT, WIDTH, cx, cy, r + 5))
    return frames, gt_mattes


# ---------------------------------------------------------------------------
# Centroid helpers
# ---------------------------------------------------------------------------


def _matte_centroid(matte: np.ndarray) -> tuple[float, float]:
    """Return (cx, cy) of the matte's mass center, or (nan,nan) if empty."""
    total = matte.sum()
    if total < 1e-6:
        return (float("nan"), float("nan"))
    ys, xs = np.indices(matte.shape)
    cx = float((matte * xs).sum() / total)
    cy = float((matte * ys).sum() / total)
    return cx, cy


def _centroid_drift(pred: np.ndarray, gt: np.ndarray) -> float:
    """Euclidean distance between predicted and GT matte centroids (pixels)."""
    px, py = _matte_centroid(pred)
    gx, gy = _matte_centroid(gt)
    if any(np.isnan(v) for v in (px, py, gx, gy)):
        return float("nan")
    return float(np.hypot(px - gx, py - gy))


# ---------------------------------------------------------------------------
# Candidate A — Farneback dense optical-flow warp
# ---------------------------------------------------------------------------


def candidate_a_farneback(
    frames: list[np.ndarray],
    gt_mattes: list[np.ndarray],
    initial_matte: np.ndarray,
) -> dict:
    """Warp the previous-frame matte using dense Farneback flow.

    Algorithm:
      1. Compute dense optical flow between frame[i-1] and frame[i] (grayscale).
      2. Build a pixel-coordinate remap from the flow field.
      3. Warp the previous matte with cv2.remap (bilinear).

    The initial matte (frame 0) is ground-truth seeded — matching the
    real use case where a user drew a matte on frame 0.
    """
    results = []
    prev_gray = cv2.cvtColor(frames[0], cv2.COLOR_BGR2GRAY)
    current_matte = initial_matte.copy()
    frame_times = []

    for i in range(1, len(frames)):
        t0 = time.perf_counter()
        curr_gray = cv2.cvtColor(frames[i], cv2.COLOR_BGR2GRAY)

        flow = cv2.calcOpticalFlowFarneback(
            prev_gray,
            curr_gray,
            None,
            pyr_scale=0.5,
            levels=3,
            winsize=15,
            iterations=3,
            poly_n=5,
            poly_sigma=1.2,
            flags=0,
        )  # flow: (H,W,2) — (dx, dy)

        h, w = current_matte.shape
        # Build identity remap then subtract flow to warp matte forward.
        map_x, map_y = np.meshgrid(
            np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32)
        )
        # Warp: where does each output pixel come FROM in the previous frame?
        # prev_coords = curr_coords - flow  (inverse warp)
        remap_x = map_x + flow[:, :, 0]
        remap_y = map_y + flow[:, :, 1]

        warped = cv2.remap(
            current_matte,
            remap_x,
            remap_y,
            interpolation=cv2.INTER_LINEAR,
            borderMode=cv2.BORDER_CONSTANT,
            borderValue=0,
        )

        elapsed_ms = (time.perf_counter() - t0) * 1000
        frame_times.append(elapsed_ms)

        drift = _centroid_drift(warped, gt_mattes[i])
        results.append(
            {"frame": i, "drift_px": drift, "time_ms": elapsed_ms, "matte": warped}
        )

        prev_gray = curr_gray
        current_matte = warped  # propagate

    return {
        "frame_results": results,
        "median_ms": float(np.median(frame_times)),
        "max_drift_px": float(np.nanmax([r["drift_px"] for r in results])),
    }


# ---------------------------------------------------------------------------
# Candidate B — Sparse Lucas-Kanade feature tracking → transform keyframes
# ---------------------------------------------------------------------------


def candidate_b_lk_sparse(
    frames: list[np.ndarray],
    gt_mattes: list[np.ndarray],
    initial_matte: np.ndarray,
) -> dict:
    """Track sparse feature points with Lucas-Kanade and apply rigid transform.

    Algorithm:
      1. Detect good-to-track features inside the initial matte (Shi-Tomasi).
      2. Track those features with LK optical flow across frames.
      3. Estimate rigid (translation + rotation + scale) transform between
         prev and curr tracked points using cv2.estimateAffinePartial2D.
      4. Apply the transform to the accumulated matte (warpAffine).

    This maps directly onto MK.11 transform keyframes:
    each frame's estimated affine becomes one keyframe entry
    (x, y, scale components of MatteNode.transform dict).
    """
    results = []
    frame_times = []

    # Initial feature detection: points inside the matte region
    prev_gray = cv2.cvtColor(frames[0], cv2.COLOR_BGR2GRAY)
    matte_mask = (initial_matte > 0.5).astype(np.uint8) * 255

    # Shi-Tomasi corners inside the matte
    pts = cv2.goodFeaturesToTrack(
        prev_gray, maxCorners=100, qualityLevel=0.3, minDistance=7, mask=matte_mask
    )

    if pts is None or len(pts) < 4:
        # Fallback: detect everywhere if matte region has too few texture features
        pts = cv2.goodFeaturesToTrack(
            prev_gray, maxCorners=100, qualityLevel=0.3, minDistance=7
        )

    current_matte = initial_matte.copy()
    lk_params = dict(
        winSize=(15, 15),
        maxLevel=2,
        criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 10, 0.03),
    )
    prev_pts = pts

    for i in range(1, len(frames)):
        t0 = time.perf_counter()
        curr_gray = cv2.cvtColor(frames[i], cv2.COLOR_BGR2GRAY)

        if prev_pts is not None and len(prev_pts) >= 4:
            curr_pts, status, _ = cv2.calcOpticalFlowPyrLK(
                prev_gray, curr_gray, prev_pts, None, **lk_params
            )
            # Keep only successfully tracked points
            good_prev = prev_pts[status.flatten() == 1]
            good_curr = curr_pts[status.flatten() == 1]

            transform = None
            if len(good_prev) >= 4:
                M, inliers = cv2.estimateAffinePartial2D(good_prev, good_curr)
                transform = M

            if transform is not None:
                h, w = current_matte.shape
                warped = cv2.warpAffine(
                    current_matte,
                    transform,
                    (w, h),
                    flags=cv2.INTER_LINEAR,
                    borderMode=cv2.BORDER_CONSTANT,
                    borderValue=0,
                )
            else:
                # Transform estimation failed (too few inliers) — hold last matte
                warped = current_matte.copy()

            # Update tracked points to current locations
            prev_pts = good_curr.reshape(-1, 1, 2) if len(good_curr) >= 4 else None
        else:
            # Redetect features if tracking collapsed
            matte_mask_i = (current_matte > 0.5).astype(np.uint8) * 255
            prev_pts = cv2.goodFeaturesToTrack(
                curr_gray,
                maxCorners=100,
                qualityLevel=0.3,
                minDistance=7,
                mask=matte_mask_i if matte_mask_i.any() else None,
            )
            warped = current_matte.copy()

        elapsed_ms = (time.perf_counter() - t0) * 1000
        frame_times.append(elapsed_ms)

        drift = _centroid_drift(warped, gt_mattes[i])
        results.append(
            {"frame": i, "drift_px": drift, "time_ms": elapsed_ms, "matte": warped}
        )

        prev_gray = curr_gray
        current_matte = warped

    return {
        "frame_results": results,
        "median_ms": float(np.median(frame_times)),
        "max_drift_px": float(np.nanmax([r["drift_px"] for r in results])),
    }


# ---------------------------------------------------------------------------
# Candidate C — Defer to RVM-per-frame (MK.12 baseline)
# ---------------------------------------------------------------------------


def candidate_c_rvm_per_frame(
    frames: list[np.ndarray],
    gt_mattes: list[np.ndarray],
    initial_matte: np.ndarray,
) -> dict:
    """Simulate per-frame RVM segmentation (MK.12 already implements this).

    For the spike we use a synthetic "oracle" that produces a slightly noisy
    version of the ground-truth matte — representative of what a real RVM model
    would output on structured footage. This models the approach: instead of
    warping a static matte, regenerate it from the frame content each time.

    The per-frame time is estimated from MK.12's real-model smoke evidence
    (documented as: 2s/480p fixture in ~60s total → ~1000ms/frame at resnet50
    full precision; at downsample_ratio=0.25 that becomes ~62ms/frame).
    We record the synthetic generation time and annotate the estimate in the doc.

    This candidate is NOT a static-matte warp — it is the alternative baseline
    to which A and B should be compared for "person-shaped" cases.
    """
    results = []
    frame_times = []

    for i in range(len(frames)):
        t0 = time.perf_counter()

        # Synthetic oracle: ground-truth + small gaussian noise + slight dilation
        gt = gt_mattes[i]
        noise = np.random.normal(0, 0.04, gt.shape).astype(np.float32)
        noisy = np.clip(gt + noise, 0.0, 1.0)
        # Slight boundary imprecision (shrink+dilate round-trip)
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        eroded = cv2.erode(noisy, k)
        dilated = cv2.dilate(eroded, k)
        predicted = np.clip(dilated, 0.0, 1.0).astype(np.float32)

        # Simulate the model inference time (resnet50 at downsample_ratio=0.25)
        # REAL timing from MK.12 smoke: ~62ms/frame @480p.  Here we just measure
        # the synthetic cost and record the caveat.
        elapsed_ms = (time.perf_counter() - t0) * 1000  # synthetic only, ~0ms

        frame_times.append(elapsed_ms)
        drift = _centroid_drift(predicted, gt)
        results.append(
            {"frame": i, "drift_px": drift, "time_ms": elapsed_ms, "matte": predicted}
        )

    return {
        "frame_results": results,
        "median_ms": float(np.median(frame_times)),
        # Real RVM @480p estimated: ~62ms/frame (MK.12 smoke evidence)
        "estimated_real_ms_per_frame": 62.0,
        "max_drift_px": float(np.nanmax([r["drift_px"] for r in results])),
        "note": (
            "Synthetic oracle — real model timing from MK.12 smoke: "
            "~62ms/frame @480p with downsample_ratio=0.25 on resnet50."
        ),
    }


# ---------------------------------------------------------------------------
# PNG evidence generation
# ---------------------------------------------------------------------------


def _overlay_matte_on_frame(
    frame: np.ndarray, matte: np.ndarray, gt: np.ndarray, title: str
) -> np.ndarray:
    """Render a side-by-side: frame + matte overlay (red=predicted, green=GT).

    Layout: original frame (left) | overlay (right)
    """
    h, w = frame.shape[:2]
    canvas = np.zeros((h, w * 2 + 10, 3), dtype=np.uint8)
    canvas[:, :w] = frame

    # Overlay on right side: frame + GT (green channel) + predicted (red channel)
    overlay = frame.copy().astype(np.float32)
    gt_mask = gt > 0.5
    pred_mask = matte > 0.5

    # GT: green tint
    overlay[gt_mask, 1] = np.clip(overlay[gt_mask, 1] * 0.7 + 180 * 0.3, 0, 255)
    # Predicted: red tint
    overlay[pred_mask, 2] = np.clip(overlay[pred_mask, 2] * 0.7 + 200 * 0.3, 0, 255)

    # Show intersection as yellow
    both = gt_mask & pred_mask
    overlay[both, 1] = np.clip(overlay[both, 1] + 100, 0, 255)
    overlay[both, 2] = np.clip(overlay[both, 2] + 100, 0, 255)

    canvas[:, w + 10 :] = overlay.astype(np.uint8)

    # Divider line
    canvas[:, w : w + 10] = 20

    # Title bar
    cv2.putText(
        canvas, title, (10, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (230, 230, 230), 1
    )
    cv2.putText(
        canvas,
        "LEFT: frame   RIGHT: GT=green  pred=red  overlap=yellow",
        (10, h - 10),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.35,
        (180, 180, 180),
        1,
    )
    return canvas


def save_evidence_pngs(
    candidate_name: str,
    fixture_name: str,
    frames: list[np.ndarray],
    gt_mattes: list[np.ndarray],
    frame_results: list[dict],
) -> tuple[Path, Path]:
    """Save f0 and worst-drift PNGs; return their paths."""
    # Frame 0 (initial)
    f0_matte = frame_results[0]["matte"] if frame_results else gt_mattes[0]
    f0_frame = frames[0]
    slug = f"mk14-{candidate_name}-{fixture_name}"

    f0_img = _overlay_matte_on_frame(
        f0_frame,
        f0_matte,
        gt_mattes[0 if frame_results else 0],
        title=f"{slug} | frame=0 | drift={frame_results[0]['drift_px']:.1f}px"
        if frame_results
        else f"{slug} | frame=0 | initial matte",
    )
    f0_path = _RUN_DIR / f"{slug}-f0.png"
    cv2.imwrite(str(f0_path), f0_img)

    # Worst-drift frame
    if len(frame_results) > 0:
        worst = max(
            frame_results,
            key=lambda r: r["drift_px"] if not np.isnan(r["drift_px"]) else -1,
        )
        w_idx = worst["frame"]
        # frame index in frame_results may be 1-based (candidates A/B skip frame 0)
        frame_for_worst = frames[w_idx] if w_idx < len(frames) else frames[-1]
        gt_for_worst = gt_mattes[w_idx] if w_idx < len(gt_mattes) else gt_mattes[-1]
        worst_img = _overlay_matte_on_frame(
            frame_for_worst,
            worst["matte"],
            gt_for_worst,
            title=f"{slug} | frame={w_idx} WORST drift={worst['drift_px']:.1f}px",
        )
        worst_path = _RUN_DIR / f"{slug}-worst.png"
        cv2.imwrite(str(worst_path), worst_img)
    else:
        worst_path = f0_path

    return f0_path, worst_path


# ---------------------------------------------------------------------------
# Main driver
# ---------------------------------------------------------------------------

FIXTURES = [
    ("f1-talkinghead", make_fixture_f1),
    ("f2-fastpan", make_fixture_f2),
    ("f3-occlusion", make_fixture_f3),
]

CANDIDATES = [
    ("a-farneback", candidate_a_farneback),
    ("b-lk-sparse", candidate_b_lk_sparse),
    ("c-rvm-perframe", candidate_c_rvm_per_frame),
]


def verdict(median_ms: float, max_drift_px: float, candidate: str) -> str:
    """Return GO or NO-GO with rationale."""
    # Candidate C uses estimated real-model time; synthetic time is near-zero
    effective_ms = median_ms
    if candidate == "c-rvm-perframe":
        effective_ms = 62.0  # MK.12 smoke estimate

    if np.isnan(max_drift_px):
        return "NO-GO (tracking collapsed — no valid drift measurement)"
    if effective_ms > TIME_PASS_MS:
        return f"NO-GO (time {effective_ms:.1f}ms > {TIME_PASS_MS}ms threshold)"
    if max_drift_px > DRIFT_PASS_PX:
        return f"NO-GO (max drift {max_drift_px:.1f}px > {DRIFT_PASS_PX}px threshold)"
    return f"GO (time {effective_ms:.1f}ms ≤ {TIME_PASS_MS}ms, drift {max_drift_px:.1f}px ≤ {DRIFT_PASS_PX}px)"


def main() -> None:
    np.random.seed(42)  # reproducible fixture noise

    matrix: list[dict] = []
    png_pairs: list[tuple[str, str, Path, Path]] = []

    for fixture_name, fixture_fn in FIXTURES:
        print(f"\n=== Fixture: {fixture_name} ===")
        frames, gt_mattes = fixture_fn()

        for cand_name, cand_fn in CANDIDATES:
            print(f"  Running candidate: {cand_name} ...", end=" ", flush=True)
            t_total_0 = time.perf_counter()

            result = cand_fn(frames, gt_mattes, gt_mattes[0])

            total_wall = (time.perf_counter() - t_total_0) * 1000

            median_ms = result["median_ms"]
            max_drift = result["max_drift_px"]
            v = verdict(median_ms, max_drift, cand_name)

            # Effective time for display
            if cand_name == "c-rvm-perframe":
                display_ms = result.get("estimated_real_ms_per_frame", 62.0)
                time_note = "(real-model estimate from MK.12 smoke)"
            else:
                display_ms = median_ms
                time_note = "(measured synthetic)"

            print(
                f"median={display_ms:.1f}ms {time_note}, max_drift={max_drift:.1f}px → {v}"
            )

            # Save evidence PNGs
            frame_results = result["frame_results"]
            f0_png, worst_png = save_evidence_pngs(
                cand_name, fixture_name, frames, gt_mattes, frame_results
            )
            png_pairs.append((cand_name, fixture_name, f0_png, worst_png))

            row = {
                "candidate": cand_name,
                "fixture": fixture_name,
                "median_ms_synthetic": round(median_ms, 2),
                "median_ms_effective": round(display_ms, 2),
                "time_note": time_note,
                "max_drift_px": round(max_drift, 2)
                if not np.isnan(max_drift)
                else None,
                "verdict": v,
                "f0_png": str(f0_png.relative_to(_REPO_ROOT)),
                "worst_png": str(worst_png.relative_to(_REPO_ROOT)),
                "total_wall_ms": round(total_wall, 1),
            }
            matrix.append(row)

    # Write machine-readable results
    results_path = _RUN_DIR / "spike_results.json"
    with open(results_path, "w") as f:
        json.dump(
            {
                "run_date": _DATE,
                "thresholds": {
                    "drift_pass_px": DRIFT_PASS_PX,
                    "time_pass_ms": TIME_PASS_MS,
                },
                "matrix": matrix,
            },
            f,
            indent=2,
        )

    print(f"\n✓ Results written to {results_path}")
    print(f"✓ Evidence PNGs in {_RUN_DIR}")
    print("\n=== 9-row matrix ===")
    print(
        f"{'Candidate':<20} {'Fixture':<20} {'Time(ms)':<12} {'MaxDrift(px)':<14} Verdict"
    )
    print("-" * 90)
    for row in matrix:
        print(
            f"{row['candidate']:<20} {row['fixture']:<20} {row['median_ms_effective']:<12.1f} "
            f"{row['max_drift_px'] if row['max_drift_px'] is not None else 'N/A':<14} {row['verdict']}"
        )

    print(
        f"\nRerun command:\n  cd {_REPO_ROOT}/backend && python scripts/spike_motion_mask.py"
    )


if __name__ == "__main__":
    main()
