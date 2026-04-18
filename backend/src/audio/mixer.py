"""Audio mixer for the multi-track subsystem.

Design:
- set_tracks(tracks) ingests the current timeline state (frontend sends this
  via audio_tracks_set ZMQ on every debounced mutation).
- mix(t_start_s, n_samples) returns a stereo float32 buffer containing the
  sum of all clips active in the window [t_start_s, t_start_s + n/rate),
  each with per-clip gain + fade envelope (including mandatory 5 ms de-click)
  + per-track gain + mute/solo gating, soft-clipped at -1.0 dBFS.
- One StreamingDecoder is kept per active-clip path; destroyed when the clip
  leaves the lookahead window.

Speaker-safety invariants (non-negotiable):
- Mandatory 5 ms de-click ramp at clip entry and exit (in addition to any
  user-configured fadeInSec/fadeOutSec). Prevents pops when a clip starts
  mid-waveform with fadeInSec=0.
- Output peak ceiling -1.0 dBFS via scalar soft-clip (tanh-based). True
  lookahead limiter is a follow-up.
"""

from __future__ import annotations

import logging
import math
import threading
from dataclasses import dataclass

import numpy as np

from audio.streaming_decoder import (
    PROJECT_CHANNELS,
    PROJECT_SAMPLE_RATE,
    StreamingDecoder,
)

log = logging.getLogger(__name__)

# --- Constants ---

MAX_ACTIVE_CLIPS = 16  # backend cap; frontend also enforces for UX
MIN_DECLICK_SEC = 0.005  # 5 ms — applied regardless of user fade settings
OUTPUT_PEAK_CEILING = 10 ** (-1.0 / 20)  # -1.0 dBFS ≈ 0.891
MIN_GAIN_DB = -60.0
MAX_GAIN_DB = 6.0


# --- Data model ---


@dataclass
class MixerClip:
    """Clip record used by the mixer, normalized from the frontend IPC payload."""

    clip_id: str
    track_id: str
    path: str
    in_sec: float
    out_sec: float
    start_sec: float
    gain_db: float
    fade_in_sec: float
    fade_out_sec: float
    muted: bool

    @property
    def duration_sec(self) -> float:
        return max(0.0, self.out_sec - self.in_sec)

    @property
    def end_sec(self) -> float:
        return self.start_sec + self.duration_sec


@dataclass
class MixerTrack:
    """Audio-track record used by the mixer."""

    track_id: str
    gain_db: float
    is_muted: bool
    is_soloed: bool
    clips: list[MixerClip]


def _finite(x: float) -> bool:
    try:
        return math.isfinite(float(x))
    except (TypeError, ValueError):
        return False


def _clamp_gain_db(x: float) -> float:
    if not _finite(x):
        return 0.0
    return max(MIN_GAIN_DB, min(MAX_GAIN_DB, float(x)))


def _clamp_nonneg(x: float) -> float:
    if not _finite(x) or x < 0:
        return 0.0
    return float(x)


def _db_to_linear(db: float) -> float:
    return 10.0 ** (db / 20.0)


# --- Payload normalization ---


def normalize_clip(raw: dict, track_id: str) -> MixerClip | None:
    """Build a MixerClip from an untrusted dict. Returns None if the clip
    is structurally unusable (missing id / path / zero-length)."""
    clip_id = raw.get("id")
    path = raw.get("path")
    if not isinstance(clip_id, str) or not isinstance(path, str):
        return None
    in_sec = _clamp_nonneg(raw.get("inSec", 0.0))
    out_sec = _clamp_nonneg(raw.get("outSec", 0.0))
    if out_sec <= in_sec:
        return None  # zero-length or inverted
    start_sec = _clamp_nonneg(raw.get("startSec", 0.0))
    clip_dur = out_sec - in_sec
    fade_in = max(0.0, min(clip_dur, _clamp_nonneg(raw.get("fadeInSec", 0.0))))
    fade_out = max(
        0.0, min(clip_dur - fade_in, _clamp_nonneg(raw.get("fadeOutSec", 0.0)))
    )
    return MixerClip(
        clip_id=clip_id,
        track_id=track_id,
        path=path,
        in_sec=in_sec,
        out_sec=out_sec,
        start_sec=start_sec,
        gain_db=_clamp_gain_db(raw.get("gainDb", 0.0)),
        fade_in_sec=fade_in,
        fade_out_sec=fade_out,
        muted=bool(raw.get("muted", False)),
    )


def normalize_track(raw: dict) -> MixerTrack | None:
    track_id = raw.get("id")
    if not isinstance(track_id, str):
        return None
    if raw.get("type") != "audio":
        return None
    clips_raw = raw.get("audioClips") or []
    clips: list[MixerClip] = []
    if isinstance(clips_raw, list):
        for c in clips_raw:
            if not isinstance(c, dict):
                continue
            norm = normalize_clip(c, track_id)
            if norm is not None:
                clips.append(norm)
    return MixerTrack(
        track_id=track_id,
        gain_db=_clamp_gain_db(raw.get("gainDb", 0.0)),
        is_muted=bool(raw.get("isMuted", False)),
        is_soloed=bool(raw.get("isSoloed", False)),
        clips=clips,
    )


# --- Mixer ---


class AudioMixer:
    """Sums active clips into a stereo buffer.

    Thread-safe: set_tracks / mix / clear / close may be called from different
    threads (frontend sends state on one thread; audio callback reads on another).
    """

    def __init__(self, project_rate: int = PROJECT_SAMPLE_RATE) -> None:
        self._rate = int(project_rate)
        self._lock = threading.Lock()
        self._tracks: list[MixerTrack] = []
        # path → StreamingDecoder. Lazy created on first mix() referencing a path.
        self._decoders: dict[str, StreamingDecoder] = {}
        # Per-clip "has been entered" flag for de-click ramp-in on first sample.
        self._entered: set[str] = set()

    # --- State ingest ---

    def set_tracks(self, tracks_raw: list[dict]) -> None:
        """Replace the mixer state. Each entry is a Track dict from the frontend.

        Any field that fails finite/type validation is clamped or dropped per
        normalize_clip / normalize_track. This is the defense-in-depth trust
        boundary — frontend may have been compromised.
        """
        if not isinstance(tracks_raw, list):
            return
        normalized: list[MixerTrack] = []
        for t in tracks_raw:
            if not isinstance(t, dict):
                continue
            norm = normalize_track(t)
            if norm is not None:
                normalized.append(norm)
        with self._lock:
            self._tracks = normalized
            # Drop decoders for paths no longer referenced.
            referenced = {c.path for t in normalized for c in t.clips}
            for path in list(self._decoders.keys()):
                if path not in referenced:
                    try:
                        self._decoders[path].close()
                    except Exception:
                        pass
                    del self._decoders[path]

    def clear(self) -> None:
        """Remove all tracks and release all decoders."""
        with self._lock:
            self._tracks = []
            for d in self._decoders.values():
                try:
                    d.close()
                except Exception:
                    pass
            self._decoders.clear()
            self._entered.clear()

    def close(self) -> None:
        """Release resources. Idempotent."""
        self.clear()

    def has_tracks(self) -> bool:
        """True if at least one audio track holds at least one clip."""
        with self._lock:
            return any(len(t.clips) > 0 for t in self._tracks)

    # --- Introspection ---

    def get_active_clips(self, t: float) -> list[tuple[MixerTrack, MixerClip]]:
        """Return (track, clip) pairs that should produce sound at time t.

        Respects mute/solo semantics. Caps to MAX_ACTIVE_CLIPS; earlier clips
        in timeline order win if more than the cap are active.
        """
        with self._lock:
            any_solo = any(tr.is_soloed for tr in self._tracks if tr.clips)
            active: list[tuple[MixerTrack, MixerClip]] = []
            for tr in self._tracks:
                if tr.is_muted:
                    continue
                if any_solo and not tr.is_soloed:
                    continue
                for c in tr.clips:
                    if c.muted:
                        continue
                    if t >= c.start_sec and t < c.end_sec:
                        active.append((tr, c))
            # Stable cap by clip.start_sec then id
            active.sort(key=lambda x: (x[1].start_sec, x[1].clip_id))
            if len(active) > MAX_ACTIVE_CLIPS:
                log.warning(
                    "AudioMixer: %d active clips at t=%.3f — capping to %d",
                    len(active),
                    t,
                    MAX_ACTIVE_CLIPS,
                )
                active = active[:MAX_ACTIVE_CLIPS]
            return active

    # --- Mix ---

    def mix(self, t_start_s: float, n_samples: int) -> np.ndarray:
        """Return a stereo float32 buffer for the window [t_start_s, t_start_s + n/rate).

        Shape: (n_samples, 2).
        """
        n_samples = max(0, int(n_samples))
        if n_samples == 0:
            return np.zeros((0, PROJECT_CHANNELS), dtype=np.float32)
        if not _finite(t_start_s) or t_start_s < 0:
            t_start_s = 0.0

        active = self.get_active_clips(t_start_s)
        out = np.zeros((n_samples, PROJECT_CHANNELS), dtype=np.float32)

        for track, clip in active:
            self._add_clip(out, track, clip, t_start_s, n_samples)

        # Soft-clip at -1.0 dBFS using a tanh-based scalar limiter.
        self._soft_clip(out)
        return out

    def _add_clip(
        self,
        out: np.ndarray,
        track: MixerTrack,
        clip: MixerClip,
        t_start_s: float,
        n_samples: int,
    ) -> None:
        """Decode clip samples, apply envelope + gain, add into out."""
        with self._lock:
            decoder = self._decoders.get(clip.path)
            if decoder is None:
                try:
                    decoder = StreamingDecoder(clip.path, project_rate=self._rate)
                except Exception as e:
                    log.warning("AudioMixer: failed to open clip %s: %s", clip.path, e)
                    return
                self._decoders[clip.path] = decoder

        # Clip-relative offset: how far into the source file we need to read.
        source_offset = clip.in_sec + (t_start_s - clip.start_sec)
        # Samples that fall before the clip start get silence (the clip may be
        # partially inside the window if the caller is sweeping across boundaries).
        samples = decoder.read(max(0.0, source_offset), n_samples)
        if samples.shape != (n_samples, PROJECT_CHANNELS):
            return

        # Build envelope vector for the window
        env = self._envelope(clip, t_start_s, n_samples)
        # Apply clip gain + envelope (broadcast across stereo)
        gain_linear = _db_to_linear(clip.gain_db) * _db_to_linear(track.gain_db)
        samples = samples * env[:, np.newaxis] * gain_linear
        out += samples.astype(np.float32, copy=False)

    def _envelope(
        self, clip: MixerClip, t_start_s: float, n_samples: int
    ) -> np.ndarray:
        """Return a (n_samples,) envelope vector mapping [t_start, t_end) for the clip.

        Incorporates:
        - Zero outside [clip.start_sec, clip.end_sec)
        - User fade-in / fade-out (linear ramp)
        - Mandatory 5 ms de-click at clip boundaries (linear, additive min)
        """
        env = np.ones(n_samples, dtype=np.float32)
        rate = self._rate
        times = t_start_s + np.arange(n_samples) / rate
        local = times - clip.start_sec  # time relative to clip start
        dur = clip.duration_sec

        # Zero out samples outside the clip range
        out_of_range = (local < 0) | (local >= dur)
        env[out_of_range] = 0.0

        # Mandatory 5 ms de-click on entry
        declick = min(MIN_DECLICK_SEC, dur * 0.5)
        if declick > 0:
            ramp_mask = (local >= 0) & (local < declick)
            if np.any(ramp_mask):
                env[ramp_mask] *= (local[ramp_mask] / declick).astype(np.float32)

        # User fade-in (linear) — multiplies into env
        if clip.fade_in_sec > 0:
            fi_mask = (local >= 0) & (local < clip.fade_in_sec)
            if np.any(fi_mask):
                ramp = (local[fi_mask] / clip.fade_in_sec).astype(np.float32)
                env[fi_mask] *= np.clip(ramp, 0.0, 1.0)

        # User fade-out
        if clip.fade_out_sec > 0:
            fo_start = dur - clip.fade_out_sec
            fo_mask = (local >= fo_start) & (local < dur)
            if np.any(fo_mask):
                ramp = ((dur - local[fo_mask]) / clip.fade_out_sec).astype(np.float32)
                env[fo_mask] *= np.clip(ramp, 0.0, 1.0)

        # Mandatory 5 ms de-click on exit
        if declick > 0:
            tail_mask = (local >= dur - declick) & (local < dur)
            if np.any(tail_mask):
                env[tail_mask] *= ((dur - local[tail_mask]) / declick).astype(
                    np.float32
                )

        return env

    def _soft_clip(self, buf: np.ndarray) -> None:
        """In-place soft-clip to OUTPUT_PEAK_CEILING via a scalar limiter.

        Not a true lookahead limiter — a real one is a follow-up. This variant
        scans the buffer peak and, if it would exceed the ceiling, scales the
        whole buffer down to sit at the ceiling. Prevents speaker damage from
        overlapping loud clips without introducing tanh distortion on content
        that's already well below the ceiling.
        """
        peak = float(np.max(np.abs(buf)))
        if peak > OUTPUT_PEAK_CEILING:
            buf *= OUTPUT_PEAK_CEILING / peak
