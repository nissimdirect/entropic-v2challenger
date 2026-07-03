"""10-frame temporal smoke for fx.copy_machine.

Oracle 3: with `generation` ramping 0->120 across a clip (feedback off,
stateless), later frames must diverge from the input MORE than early frames —
i.e. degradation increases as the video plays.
"""

import numpy as np

from effects.fx import copy_machine


def _moving_clip(n: int = 10, h: int = 40, w: int = 40) -> list[np.ndarray]:
    """Synthetic moving clip: a dark square slides across a light background."""
    frames = []
    for i in range(n):
        f = np.zeros((h, w, 4), dtype=np.uint8)
        f[:, :, :3] = 200
        x0 = 2 + i * 2
        f[10:30, x0 : x0 + 16, :3] = 20
        f[:, :, 3] = 255
        frames.append(f)
    return frames


def _l1_to_input(out, inp):
    return float(
        np.mean(np.abs(out[:, :, :3].astype(np.int16) - inp[:, :, :3].astype(np.int16)))
    )


def test_degradation_increases_over_time():
    frames = _moving_clip(10)
    n = len(frames)
    divergence = []
    for i, frame in enumerate(frames):
        generation = 120.0 * i / (n - 1)  # ramp 0 -> 120
        out, _ = copy_machine.apply(
            frame,
            {"machine": "toner", "generation": generation, "feedback": False},
            None,
            frame_index=i,
            seed=11,
            resolution=(frame.shape[1], frame.shape[0]),
        )
        divergence.append(_l1_to_input(out, frame))

    # frame 0 (generation 0) is identity => ~0 divergence
    assert divergence[0] < 1.0, (
        f"generation=0 was not identity (L1={divergence[0]:.2f})"
    )
    # frame 9 (generation 120) must be more degraded than frame 1 (low generation)
    assert divergence[9] > divergence[1], (
        f"degradation did not increase over time: "
        f"frame1={divergence[1]:.2f} frame9={divergence[9]:.2f}"
    )
    # and the ramp should be broadly monotonic in the aggregate (last third > first third)
    early = float(np.mean(divergence[1:4]))
    late = float(np.mean(divergence[7:10]))
    assert late > early, (
        f"late-clip degradation ({late:.2f}) not above early ({early:.2f})"
    )


def test_feedback_clip_accumulates_over_time():
    """Sanity: in feedback mode over a moving clip, output keeps diverging from source."""
    frames = _moving_clip(10)
    st = None
    div = []
    for i, frame in enumerate(frames):
        out, st = copy_machine.apply(
            frame,
            {"machine": "toner", "generation": 1, "feedback": True},
            st,
            frame_index=i,
            seed=5,
            resolution=(frame.shape[1], frame.shape[0]),
        )
        div.append(_l1_to_input(out, frame))
    assert float(np.mean(div[7:10])) > 3.0, (
        "feedback clip produced no sustained degradation"
    )
