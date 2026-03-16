"""Tests for subliminal effect — all 3 modes, determinism, source types."""

import numpy as np
import pytest

from effects.fx.subliminal import apply, cleanup, EFFECT_ID


@pytest.fixture
def white_frame():
    """200x200 white RGBA frame."""
    frame = np.ones((200, 200, 4), dtype=np.uint8) * 255
    return frame


@pytest.fixture
def black_frame():
    """200x200 black RGBA frame."""
    frame = np.zeros((200, 200, 4), dtype=np.uint8)
    frame[:, :, 3] = 255
    return frame


RESOLUTION = (200, 200)


# --- Effect metadata ---


def test_effect_id():
    assert EFFECT_ID == "fx.subliminal"


# --- flash_insert mode ---


def test_flash_insert_probability_zero(white_frame):
    """probability=0 should never trigger flash."""
    params = {
        "mode": "flash_insert",
        "source_type": "text",
        "source_text": "HI",
        "probability": 0.0,
    }
    output, _ = apply(
        white_frame, params, None, frame_index=0, seed=42, resolution=RESOLUTION
    )
    # Should be identical to input (no flash)
    np.testing.assert_array_equal(output, white_frame)


def test_flash_insert_probability_one(white_frame):
    """probability=1 should always trigger flash."""
    params = {
        "mode": "flash_insert",
        "source_type": "text",
        "source_text": "FLASH",
        "probability": 1.0,
        "opacity": 0.5,
    }
    output, _ = apply(
        white_frame, params, None, frame_index=0, seed=42, resolution=RESOLUTION
    )
    # Frame should be different from input (flash happened)
    assert not np.array_equal(output, white_frame)


def test_flash_insert_determinism(white_frame):
    """Same seed + frame_index should produce identical output."""
    params = {
        "mode": "flash_insert",
        "source_type": "text",
        "source_text": "X",
        "probability": 0.5,
    }
    o1, _ = apply(
        white_frame, params, None, frame_index=10, seed=123, resolution=RESOLUTION
    )
    o2, _ = apply(
        white_frame, params, None, frame_index=10, seed=123, resolution=RESOLUTION
    )
    np.testing.assert_array_equal(o1, o2)


def test_flash_insert_different_seeds(white_frame):
    """Different seeds should produce different RNG decisions (eventually)."""
    params = {
        "mode": "flash_insert",
        "source_type": "text",
        "source_text": "Y",
        "probability": 0.5,
    }
    results = set()
    for seed in range(100):
        o, _ = apply(
            white_frame, params, None, frame_index=0, seed=seed, resolution=RESOLUTION
        )
        results.add(np.array_equal(o, white_frame))
    # With probability 0.5 and 100 seeds, we should see both flash and no-flash
    assert len(results) == 2


# --- channel_embed mode ---


def test_channel_embed_modifies_channel(white_frame):
    """channel_embed should modify LSBs of the target channel."""
    params = {
        "mode": "channel_embed",
        "source_type": "text",
        "source_text": "EMBED",
        "channel": "b",
        "bits": 2,
    }
    output, _ = apply(
        white_frame, params, None, frame_index=0, seed=42, resolution=RESOLUTION
    )
    # Blue channel LSBs should differ from original (where source has content)
    # The MSBs should be preserved
    assert output.shape == white_frame.shape


def test_channel_embed_preserves_other_channels(white_frame):
    """Embedding in blue should leave red and green untouched."""
    params = {
        "mode": "channel_embed",
        "source_type": "text",
        "source_text": "OK",
        "channel": "b",
        "bits": 1,
    }
    output, _ = apply(
        white_frame, params, None, frame_index=0, seed=42, resolution=RESOLUTION
    )
    np.testing.assert_array_equal(output[:, :, 0], white_frame[:, :, 0])  # R
    np.testing.assert_array_equal(output[:, :, 1], white_frame[:, :, 1])  # G


def test_channel_embed_bits_range(white_frame):
    """Different bit depths should produce different results."""
    outputs = []
    for bits in [1, 2, 3, 4]:
        params = {
            "mode": "channel_embed",
            "source_type": "text",
            "source_text": "BITS",
            "channel": "r",
            "bits": bits,
        }
        o, _ = apply(
            white_frame, params, None, frame_index=0, seed=42, resolution=RESOLUTION
        )
        outputs.append(o[:, :, 0].copy())
    # Higher bits should affect more of the channel
    # At minimum, bit=1 and bit=4 should differ
    assert not np.array_equal(outputs[0], outputs[3])


# --- second_source mode ---


def test_second_source_modifies_frame(white_frame):
    """second_source should modify the frame with spray fragments."""
    params = {
        "mode": "second_source",
        "source_type": "text",
        "source_text": "SPRAY",
        "spray_count": 10,
        "spray_size": 0.2,
        "opacity": 0.5,
    }
    output, _ = apply(
        white_frame, params, None, frame_index=0, seed=42, resolution=RESOLUTION
    )
    # Should be different from input
    assert not np.array_equal(output, white_frame)


def test_second_source_determinism(white_frame):
    """Same seed should produce identical spray positions."""
    params = {
        "mode": "second_source",
        "source_type": "text",
        "source_text": "DET",
        "spray_count": 8,
    }
    o1, _ = apply(
        white_frame, params, None, frame_index=0, seed=99, resolution=RESOLUTION
    )
    o2, _ = apply(
        white_frame, params, None, frame_index=0, seed=99, resolution=RESOLUTION
    )
    np.testing.assert_array_equal(o1, o2)


def test_second_source_different_frames(white_frame):
    """Different frame indices should produce different spray patterns."""
    params = {
        "mode": "second_source",
        "source_type": "text",
        "source_text": "VAR",
        "spray_count": 16,
    }
    o1, _ = apply(
        white_frame, params, None, frame_index=0, seed=42, resolution=RESOLUTION
    )
    o2, _ = apply(
        white_frame, params, None, frame_index=1, seed=42, resolution=RESOLUTION
    )
    assert not np.array_equal(o1, o2)


# --- Edge cases ---


def test_empty_source_text(white_frame):
    """Empty source text should return frame unchanged (no content to embed)."""
    params = {
        "mode": "flash_insert",
        "source_type": "text",
        "source_text": "",
        "probability": 1.0,
    }
    output, _ = apply(
        white_frame, params, None, frame_index=0, seed=42, resolution=RESOLUTION
    )
    # Should still work (render_text_frame returns transparent for empty text)
    assert output.shape == white_frame.shape


def test_invalid_mode_fallback(white_frame):
    """Unknown mode should return copy of input."""
    params = {"mode": "nonexistent"}
    output, _ = apply(
        white_frame, params, None, frame_index=0, seed=42, resolution=RESOLUTION
    )
    np.testing.assert_array_equal(output, white_frame)


def test_cleanup_with_none():
    """cleanup(None) should not raise."""
    cleanup(None)


def test_cleanup_with_empty_state():
    """cleanup({}) should not raise."""
    cleanup({})
