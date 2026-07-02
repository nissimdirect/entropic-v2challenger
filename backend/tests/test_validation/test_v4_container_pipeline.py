"""V4: Effect Container Pipeline — pixel-level verification with mask and mix."""

import numpy as np

from effects.fx.invert import apply as invert_apply
from engine.container import EffectContainer


def test_v4_checkerboard_mask_half_mix():
    """Load frame → EffectContainer with fx.invert, checkerboard mask, mix=0.5.
    PASS: pixel-level comparison matches expected output (tolerance +/-1)."""
    container = EffectContainer(invert_apply, "fx.invert")

    # Create a known input frame
    frame = np.zeros((100, 100, 4), dtype=np.uint8)
    frame[:, :, 0] = 200  # R
    frame[:, :, 1] = 100  # G
    frame[:, :, 2] = 50  # B
    frame[:, :, 3] = 255  # A

    # Checkerboard mask
    mask = np.zeros((100, 100), dtype=np.float32)
    mask[::2, ::2] = 1.0
    mask[1::2, 1::2] = 1.0

    output, _ = container.process(
        frame,
        {"_mask": mask, "_mix": 0.5},
        None,
        frame_index=0,
        project_seed=42,
        resolution=(100, 100),
    )

    # Masked pixels (mask=1.0): mix=0.5 blend of dry(200) and wet(55) = 127.5
    assert abs(int(output[0, 0, 0]) - 128) <= 1, f"Masked R: got {output[0, 0, 0]}"
    assert abs(int(output[0, 0, 1]) - 128) <= 1, f"Masked G: got {output[0, 0, 1]}"
    assert abs(int(output[0, 0, 2]) - 128) <= 1, f"Masked B: got {output[0, 0, 2]}"

    # Unmasked pixels (mask=0.0): should be original regardless of mix
    assert output[0, 1, 0] == 200, f"Unmasked R: got {output[0, 1, 0]}"
    assert output[0, 1, 1] == 100, f"Unmasked G: got {output[0, 1, 1]}"
    assert output[0, 1, 2] == 50, f"Unmasked B: got {output[0, 1, 2]}"


def test_v4_full_pipeline_with_video(synthetic_video_path):
    """Full pipeline: decode video frame → run through container → verify output."""
    from video.reader import VideoReader

    container = EffectContainer(invert_apply, "fx.invert")
    reader = VideoReader(synthetic_video_path)

    # Decode a frame
    frame = reader.decode_frame(75)  # Mid-video

    # Run through container with full mix
    output, _ = container.process(
        frame,
        {},
        None,
        frame_index=75,
        project_seed=42,
        resolution=(reader.width, reader.height),
    )

    # Verify inversion: RGB channels should be 255 - original
    np.testing.assert_array_equal(output[:, :, :3], 255 - frame[:, :, :3])
    # Alpha preserved
    np.testing.assert_array_equal(output[:, :, 3], frame[:, :, 3])

    reader.close()
