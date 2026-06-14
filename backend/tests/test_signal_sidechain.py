"""Tests for the sidechain (amplitude follower) operator (P4.3).

v1 DESCOPE: sidechain keys off PROJECT audio only. ``source_track_id`` is a
reserved-but-unused field (per-track PCM plumbing is a P4-followup).
"""

import logging

import numpy as np

from modulation.engine import SignalEngine
from modulation.sidechain import evaluate_sidechain


def _sine(
    amp: float, n: int = 2048, freq: float = 220.0, sr: int = 44100
) -> np.ndarray:
    t = np.arange(n) / sr
    return (amp * np.sin(2 * np.pi * freq * t)).astype(np.float32)


def test_sidechain_follows_project_audio_amplitude_rms():
    """A louder PCM window yields a higher sidechain value (RMS follow)."""
    quiet, _ = evaluate_sidechain(_sine(0.1), {}, 44100, None)
    loud, _ = evaluate_sidechain(_sine(0.9), {}, 44100, None)
    assert 0.0 <= quiet <= 1.0
    assert 0.0 <= loud <= 1.0
    assert loud > quiet, "louder audio must produce a larger amplitude follow"


def test_sidechain_sensitivity_scales_output():
    """Higher sensitivity scales the followed value up (until it clamps)."""
    pcm = _sine(0.2)
    low, _ = evaluate_sidechain(pcm, {"sensitivity": 0.5}, 44100, None)
    high, _ = evaluate_sidechain(pcm, {"sensitivity": 3.0}, 44100, None)
    assert high > low, "higher sensitivity must scale the output up"


def test_sidechain_with_no_audio_pcm_outputs_zero():
    """No audio (None pcm) → 0.0, no crash."""
    value, _ = evaluate_sidechain(None, {"sensitivity": 1.4}, 44100, None)
    assert value == 0.0


def test_sidechain_source_track_id_set_falls_back_to_project_audio_and_logs_info_exactly_once(
    caplog,
):
    """Reserved source_track_id: identical output to no-track + EXACTLY one info log
    over 100 frames (rate-limited via state)."""
    pcm = _sine(0.5)
    baseline, _ = evaluate_sidechain(pcm, {"sensitivity": 1.4}, 44100, None)

    state = {}
    outputs = []
    with caplog.at_level(logging.INFO, logger="modulation.sidechain"):
        for _ in range(100):
            value, state = evaluate_sidechain(
                pcm, {"sensitivity": 1.4, "source_track_id": "track-7"}, 44100, state
            )
            outputs.append(value)

    # Identical output: reserved field does not change behavior (project-audio fallback).
    assert all(abs(o - baseline) < 1e-9 for o in outputs), (
        "source_track_id must not change the followed value (falls back to project audio)"
    )
    # Exactly one info log across 100 frames.
    info_logs = [
        r
        for r in caplog.records
        if r.name == "modulation.sidechain" and r.levelno == logging.INFO
    ]
    assert len(info_logs) == 1, f"expected exactly 1 info log, got {len(info_logs)}"


def test_sidechain_source_track_id_nonstring_garbage_ignored_without_crash():
    """A non-string source_track_id (e.g. a dict/list/number) is accepted and
    ignored without crashing — still follows project audio."""
    pcm = _sine(0.5)
    for garbage in ([1, 2, 3], {"x": 1}, 42, object()):
        value, _ = evaluate_sidechain(
            pcm, {"sensitivity": 1.4, "source_track_id": garbage}, 44100, None
        )
        assert 0.0 <= value <= 1.0


def test_sidechain_nan_inf_sensitivity_clamped_to_default():
    """NaN/Inf/bool/garbage sensitivity → default sensitivity (no crash)."""
    pcm = _sine(0.4)
    expected, _ = evaluate_sidechain(pcm, {"sensitivity": 1.4}, 44100, None)
    for bad in (float("nan"), float("inf"), float("-inf"), True, "loud", None):
        value, _ = evaluate_sidechain(pcm, {"sensitivity": bad}, 44100, None)
        assert abs(value - expected) < 1e-9, (
            f"sensitivity={bad!r} should fall back to default 1.4"
        )


def test_sidechain_via_evaluate_all_dispatch():
    """Partial-dispatch tripwire: sidechain must resolve through evaluate_all."""
    engine = SignalEngine()
    ops = [
        {
            "id": "sc-1",
            "type": "sidechain",
            "is_enabled": True,
            "parameters": {"sensitivity": 1.4},
        }
    ]
    values, _ = engine.evaluate_all(
        ops, frame_index=0, fps=30.0, audio_pcm=_sine(0.8), audio_sample_rate=44100
    )
    assert "sc-1" in values
    assert values["sc-1"] > 0.0, "sidechain should follow the loud project audio"
