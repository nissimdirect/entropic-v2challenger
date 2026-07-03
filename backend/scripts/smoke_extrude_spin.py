#!/usr/bin/env python3
"""Golden smoke for fx.extrude_spin (spec oracle 2).

Renders 24 sequential frames (state threaded) and checks the three properties
that define the recipe:

  (a) frame-to-frame changes occur ONLY at print boundaries on the tempo curve
      (the mesh spins continuously but the screen is frozen between prints);
  (b) the degradation metric (high-frequency / edge energy) rises across the
      decay phase (generation loss accumulates);
  (c) feedback ON differs from feedback OFF (the previous print truly re-enters).

The recipe's default is 120 generations — a full decay ramp the user watches
over minutes. To exercise the *whole* decay phase inside a 24-frame smoke we set
``generations = 6`` so each print advances g substantially; the mechanism is
identical, only the ramp is compressed.

Run:  PYTHONPATH=src python3 scripts/smoke_extrude_spin.py
Exit code 0 iff all three assertions pass.
"""

import sys
import numpy as np
import cv2

sys.path.insert(0, "src")
from effects.fx import extrude_spin as m  # noqa: E402


def _logo(h: int = 200, w: int = 200) -> np.ndarray:
    """A deterministic 'logo': filled bar, disc, and a stroke on black RGBA."""
    img = np.zeros((h, w, 4), np.uint8)
    img[:, :, 3] = 255
    cv2.rectangle(img, (40, 60), (160, 90), (240, 240, 240), -1)
    cv2.circle(img, (100, 140), 35, (240, 240, 240), -1)
    cv2.line(img, (30, 30), (170, 30), (240, 240, 240), 6)
    return img


def _hf_energy(rgb: np.ndarray) -> float:
    """High-frequency / edge energy — the degradation proxy (rises with speckle)."""
    g = cv2.cvtColor(rgb[:, :, :3], cv2.COLOR_RGB2GRAY).astype(np.float32)
    return float(np.mean(np.abs(cv2.Laplacian(g, cv2.CV_32F))))


def main() -> int:
    frame = _logo()
    base = {k: v.get("default") for k, v in m.PARAMS.items()}
    base["generations"] = 6  # compress the decay ramp into the 24-frame window
    kw = dict(seed=42, resolution=(200, 200))
    mspf = base["ms_per_frame"]

    frames, pnos, per_print = [], [], {}
    state = None
    for fi in range(24):
        pno, gen, _ry, _rx, _ft = m._print_state_at(fi * mspf, base)
        out, state = m.apply(frame, base, state, frame_index=fi, **kw)
        frames.append(out)
        pnos.append(pno)
        per_print.setdefault(pno, (gen, _hf_energy(out)))

    # (a) diffs ONLY at print boundaries
    a_viol = 0
    for i in range(1, 24):
        changed = not np.array_equal(frames[i], frames[i - 1])
        boundary = pnos[i] != pnos[i - 1]
        if boundary != changed:
            a_viol += 1
    a_pass = a_viol == 0

    # (b) degradation metric rises across the decay phase
    ordered = sorted(per_print.items())
    gens = [g for _p, (g, _e) in ordered]
    hfs = [e for _p, (_g, e) in ordered]
    b_pass = hfs[-1] > hfs[0] * 1.5  # clear, not noise

    # (c) feedback on != off (final frame)
    state = None
    for fi in range(24):
        on, state = m.apply(
            frame,
            dict(base, feed_base=0.30, feed_ramp=0.18),
            state,
            frame_index=fi,
            **kw,
        )
    state = None
    for fi in range(24):
        off, state = m.apply(
            frame, dict(base, feed_base=0.0, feed_ramp=0.0), state, frame_index=fi, **kw
        )
    c_diff = int(np.abs(on.astype(int) - off.astype(int)).sum())
    c_pass = c_diff > 0

    print("=== fx.extrude_spin golden smoke (24 frames, generations=6) ===")
    print(f"printNo per frame: {pnos}")
    print(
        f"(a) print-boundary diffs only : boundary/change mismatches = {a_viol} -> {'PASS' if a_pass else 'FAIL'}"
    )
    print(
        f"(b) degradation rises         : per-print gen={gens} hf={[round(x, 2) for x in hfs]}"
    )
    print(
        f"    first_hf={hfs[0]:.2f} last_hf={hfs[-1]:.2f} (need last > 1.5x first) -> {'PASS' if b_pass else 'FAIL'}"
    )
    print(
        f"(c) feedback on != off        : |on-off| sum = {c_diff} -> {'PASS' if c_pass else 'FAIL'}"
    )
    ok = a_pass and b_pass and c_pass
    print(f"RESULT: {'ALL PASS' if ok else 'FAILURE'}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
