"""Render AudioMixer output to a temp WAV for export muxing.

Call flow during export (flag ON + mixer has tracks):

    with render_mix_to_temp_wav(mixer, duration_s, cancel_cb) as wav_path:
        ExportManager._mux_audio(wav_path, output_path, 0, end_frame, fps)
    # wav_path deleted automatically when context exits

Design decisions:
- PCM s16 LE output — cheap, universally compatible, no extra deps beyond
  stdlib `wave`. Float32 support would require libsndfile; not worth the
  carry-over complexity when downstream mux is a packet copy anyway.
- Temp file created with mode 0o600 in the user's temp dir (echoes the
  H-2 mmap fix — we explicitly do NOT use /tmp when /tmp might be
  world-readable).
- Cancellation is cooperative: caller passes cancel_cb(); if it returns
  True mid-render, the partial WAV is finalized + cleaned up and the
  context yields None. Caller checks for None.
"""

from __future__ import annotations

import contextlib
import logging
import os
import stat
import tempfile
import wave
from collections.abc import Callable, Iterator
from pathlib import Path

import numpy as np

from audio.mixer import AudioMixer
from audio.streaming_decoder import PROJECT_CHANNELS, PROJECT_SAMPLE_RATE

log = logging.getLogger(__name__)

RENDER_CHUNK_SAMPLES = 4096  # per mix() call; ~85 ms at 48 kHz
MAX_RENDER_DURATION_S = 3600  # 1 hour cap — prevents runaway export
TEMP_FILE_MODE = 0o600


def _safe_tempdir() -> Path:
    """Return a user-owned temp dir. Prefer $HOME/.cache/entropic/exports over /tmp."""
    home_temp = Path.home() / ".cache" / "entropic" / "exports"
    try:
        home_temp.mkdir(parents=True, exist_ok=True)
        return home_temp
    except OSError:
        return Path(tempfile.gettempdir())


def render_mix_to_wav(
    mixer: AudioMixer,
    duration_s: float,
    dest_path: str | Path,
    *,
    sample_rate: int = PROJECT_SAMPLE_RATE,
    cancel_cb: Callable[[], bool] | None = None,
    progress_cb: Callable[[float], None] | None = None,
) -> bool:
    """Render `duration_s` seconds of mixer output to a PCM s16 stereo WAV.

    Returns True on complete render, False on cancel / error.

    Uses float32 output from mixer.mix() → clips to [-1, 1] → scales to int16.
    """
    if not isinstance(duration_s, (int, float)):
        return False
    if duration_s <= 0:
        return False
    if duration_s > MAX_RENDER_DURATION_S:
        log.warning(
            "render_mix_to_wav: duration %.1fs exceeds cap %.1fs — clamping",
            duration_s,
            MAX_RENDER_DURATION_S,
        )
        duration_s = MAX_RENDER_DURATION_S

    total_samples = int(duration_s * sample_rate)
    written = 0
    dest = Path(dest_path)

    try:
        with wave.open(str(dest), "wb") as w:
            w.setnchannels(PROJECT_CHANNELS)
            w.setsampwidth(2)  # 16-bit
            w.setframerate(sample_rate)

            while written < total_samples:
                if cancel_cb is not None and cancel_cb():
                    log.info(
                        "render_mix_to_wav: cancelled at %d/%d samples",
                        written,
                        total_samples,
                    )
                    return False

                remaining = total_samples - written
                block = min(RENDER_CHUNK_SAMPLES, remaining)
                t_start_s = written / sample_rate
                float_samples = mixer.mix(t_start_s, block)  # shape (block, 2) float32

                # Safety net — even though mixer soft-clips, clamp strictly
                # before int16 scaling to avoid wrap.
                float_samples = np.clip(float_samples, -1.0, 1.0)
                int_samples = (float_samples * 32767).astype(np.int16)
                w.writeframesraw(int_samples.tobytes())

                written += block
                if progress_cb is not None and total_samples > 0:
                    progress_cb(written / total_samples)

        return True

    except Exception:
        log.exception("render_mix_to_wav failed")
        return False


@contextlib.contextmanager
def render_mix_to_temp_wav(
    mixer: AudioMixer,
    duration_s: float,
    *,
    sample_rate: int = PROJECT_SAMPLE_RATE,
    cancel_cb: Callable[[], bool] | None = None,
    progress_cb: Callable[[float], None] | None = None,
) -> Iterator[str | None]:
    """Context manager: render mix to a temp WAV, yield path, delete on exit.

    Yields None if the render was cancelled or failed — callers MUST check
    for None before using the path.

    The file is created with mode 0o600 in a user-owned temp directory.
    Cleanup happens regardless of whether the `with` block raises.
    """
    temp_dir = _safe_tempdir()
    fd, tmp_path = tempfile.mkstemp(suffix=".wav", prefix="mix_", dir=str(temp_dir))
    # Close the fd immediately; wave.open reopens via path.
    os.close(fd)

    try:
        # Explicit chmod — mkstemp already creates 0600 on Unix but be paranoid
        # given the speaker-safety / data-leak concerns here.
        try:
            os.chmod(tmp_path, TEMP_FILE_MODE)
        except OSError:
            pass

        ok = render_mix_to_wav(
            mixer,
            duration_s,
            tmp_path,
            sample_rate=sample_rate,
            cancel_cb=cancel_cb,
            progress_cb=progress_cb,
        )
        yield tmp_path if ok else None

    finally:
        # Cleanup — best effort.
        try:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
        except OSError as e:
            log.warning("render_mix_to_temp_wav: failed to delete %s: %s", tmp_path, e)


def temp_file_is_private(path: str | Path) -> bool:
    """Return True if the given file is 0o600. Test utility."""
    try:
        mode = stat.S_IMODE(Path(path).stat().st_mode)
        return mode == TEMP_FILE_MODE
    except OSError:
        return False
