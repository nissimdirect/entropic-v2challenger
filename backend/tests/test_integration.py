"""Integration test — full loop: ingest -> apply effect -> export -> re-decode -> verify."""

import os
import tempfile

import numpy as np

from video.ingest import probe
from video.reader import VideoReader
from video.writer import VideoWriter
from effects.fx.invert import apply as invert_apply


def test_full_pipeline_ingest_apply_export_verify(synthetic_video_path):
    """Full loop: ingest a video, apply invert, export, re-decode, verify frames changed."""
    # 1. Ingest — probe the synthetic video
    info = probe(synthetic_video_path)
    assert info["ok"] is True
    assert info["width"] == 1280
    assert info["height"] == 720

    # 2. Open reader and decode a frame
    reader = VideoReader(synthetic_video_path)
    assert reader.frame_count > 0
    original_frame = reader.decode_frame(0)
    assert original_frame.shape == (720, 1280, 4)  # RGBA
    assert original_frame.dtype == np.uint8

    # 3. Apply invert effect (guaranteed to change any non-127 pixels)
    processed_frame, state_out = invert_apply(
        original_frame,
        {},
        None,
        frame_index=0,
        seed=42,
        resolution=(1280, 720),
    )
    assert processed_frame.shape == original_frame.shape
    assert processed_frame.dtype == np.uint8
    # Verify the effect actually changed something in-memory
    assert not np.array_equal(processed_frame[:, :, :3], original_frame[:, :, :3]), (
        "invert should modify pixels"
    )

    # 4. Export to a new video file
    export_path = tempfile.mktemp(suffix=".mp4")
    try:
        writer = VideoWriter(export_path, 1280, 720, fps=30)
        # Write multiple processed frames
        for i in range(10):
            frame = reader.decode_frame(i)
            out, _ = invert_apply(
                frame,
                {},
                None,
                frame_index=i,
                seed=42,
                resolution=(1280, 720),
            )
            writer.write_frame(out)
        writer.close()

        # 5. Re-decode the exported video and verify it's a valid video
        assert os.path.exists(export_path)
        assert os.path.getsize(export_path) > 0

        exported_info = probe(export_path)
        assert exported_info["ok"] is True
        assert exported_info["width"] == 1280
        assert exported_info["height"] == 720

        exported_reader = VideoReader(export_path)
        exported_frame = exported_reader.decode_frame(0)
        assert exported_frame.shape == (720, 1280, 4)

        exported_reader.close()
    finally:
        reader.close()
        if os.path.exists(export_path):
            os.unlink(export_path)


def test_registry_has_all_10_effects():
    """Verify the registry contains all 10 effects."""
    from effects.registry import list_all

    effects = list_all()
    effect_ids = {e["id"] for e in effects}
    expected = {
        "fx.invert",
        "fx.hue_shift",
        "fx.noise",
        "fx.blur",
        "fx.posterize",
        "fx.pixelsort",
        "fx.edge_detect",
        "fx.vhs",
        "fx.wave_distort",
        "fx.channelshift",
    }
    assert expected == effect_ids, f"Missing effects: {expected - effect_ids}"


def test_all_effects_process_without_crash():
    """Smoke test: every registered effect can process a small frame without error."""
    from effects.registry import list_all, get

    frame = np.full((64, 64, 4), 128, dtype=np.uint8)
    frame[:, :, 3] = 255  # opaque alpha

    for effect_info in list_all():
        entry = get(effect_info["id"])
        assert entry is not None, f"Effect {effect_info['id']} not found in registry"

        # Use default params
        default_params = {}
        for pname, pdef in entry["params"].items():
            default_params[pname] = pdef["default"]

        result, state = entry["fn"](
            frame,
            default_params,
            None,
            frame_index=0,
            seed=42,
            resolution=(64, 64),
        )
        assert result.shape == frame.shape, (
            f"Effect {effect_info['id']} changed frame shape"
        )
        assert result.dtype == np.uint8, (
            f"Effect {effect_info['id']} changed frame dtype"
        )


def test_effect_determinism():
    """Same seed + same params = same output for effects that use randomness."""
    from effects.fx.noise import apply as noise_apply
    from effects.fx.vhs import apply as vhs_apply

    frame = np.full((64, 64, 4), 128, dtype=np.uint8)
    frame[:, :, 3] = 255

    for apply_fn, params in [
        (noise_apply, {"intensity": 0.5}),
        (vhs_apply, {"tracking": 0.5, "noise": 0.5, "chromatic": 0.3}),
    ]:
        result1, _ = apply_fn(
            frame, params, None, frame_index=0, seed=12345, resolution=(64, 64)
        )
        result2, _ = apply_fn(
            frame, params, None, frame_index=0, seed=12345, resolution=(64, 64)
        )
        np.testing.assert_array_equal(
            result1, result2, err_msg=f"Determinism failed for {apply_fn}"
        )
