"""MK.12 — RVM matte runner (SEPARATE subprocess; the ONLY place torch loads).

Ported from ``figure-isolator/backends/rvm_local.py`` (RVM resnet50, CPU,
``output_format="alpha"``). Run as ``python -m masking.rvm_runner ...`` by
``AiMatteManager._run_bake`` so torch never enters the sidecar process (locked
decision D6 — the sidecar stays lean; the import-guard proof).

Writes a GRAYSCALE alpha video (person = white). Prints one ``PROGRESS <n>/<total>``
line per frame to stdout so the parent can drive a progress toast, and
``DONE <path>`` on success. All heavy imports (torch, cv2) are INSIDE ``main`` so
``-m masking.rvm_runner`` with no model still imports cleanly for tooling.

The RVM recurrent state (``rec = [None]*4``) is threaded across frames EXACTLY as
the figure-isolator source does — mismatching it corrupts temporal coherence
(the packet's named failure mode).
"""

from __future__ import annotations

import argparse
import sys


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="masking.rvm_runner")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--downsample-ratio", type=float, default=0.25)
    parser.add_argument("--max-dimension", type=int, default=1080)
    parser.add_argument("--start-frame", type=int, default=0)
    parser.add_argument("--end-frame", type=int, default=-1)
    args = parser.parse_args(argv)

    # Heavy imports live here so a bad env fails loudly in the CHILD (mapped to
    # a structured parent error), never at sidecar import time.
    import cv2
    import numpy as np
    import torch

    print("Loading RVM model (resnet50)...", file=sys.stderr, flush=True)
    model = torch.hub.load(
        "PeterL1n/RobustVideoMatting", "resnet50", trust_repo=True
    ).eval()
    torch.set_num_threads(max(1, torch.get_num_threads()))

    cap = cv2.VideoCapture(args.input)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    start = max(0, int(args.start_frame))
    end = int(args.end_frame)
    if end < 0 or end >= total:
        end = total - 1 if total > 0 else end
    span = (end - start + 1) if (total > 0 and end >= start) else total

    out_w, out_h = w, h
    max_dim = int(args.max_dimension)
    if max_dim > 0 and max(w, h) > max_dim:
        scale = max_dim / max(w, h)
        out_w = int(w * scale) // 2 * 2
        out_h = int(h * scale) // 2 * 2

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    # isColor=False → single-channel grayscale matte video.
    writer = cv2.VideoWriter(args.output, fourcc, fps, (out_w, out_h), False)

    rec = [None] * 4  # RVM recurrent state — threaded across frames (fidelity).
    n = 0
    written = 0
    with torch.no_grad():
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            idx = n
            n += 1
            if idx < start:
                continue
            if end >= start and idx > end:
                break

            if (out_w, out_h) != (w, h):
                frame = cv2.resize(frame, (out_w, out_h))

            src = (
                torch.from_numpy(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
                .permute(2, 0, 1)
                .unsqueeze(0)
                .float()
                / 255.0
            )
            fgr, pha, *rec = model(src, *rec, args.downsample_ratio)
            alpha = (pha[0, 0].numpy() * 255).astype(np.uint8)
            writer.write(alpha)
            written += 1
            print(f"PROGRESS {written}/{max(1, span)}", flush=True)

    cap.release()
    writer.release()

    if written == 0:
        print("ERROR: no frames matted", file=sys.stderr, flush=True)
        return 2
    print(f"DONE {args.output}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
