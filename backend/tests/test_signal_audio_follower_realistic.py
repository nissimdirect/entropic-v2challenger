"""Audio-follower behaviour on REALISTIC broadband signals.

Why this file exists: `test_signal_audio_follower.py` exercises the follower with
pure sine tones, where a single FFT bin holds essentially all the energy. That
hides a saturation bug — on broadband (i.e. musical) material the band follower
returned a constant 1.000, a completely dead modulation control, and the onset
follower fired on every frame.

These tests state the contract a modulation source must satisfy to be usable:
it must DISCRIMINATE (different content → different values), RESPOND (more energy
in the band → higher value), and stay LIVE (never pinned at a constant).

Signals here are synthetic and seeded, so the suite is deterministic and needs no
audio fixtures.
"""

import numpy as np
import pytest

from modulation.audio_follower import evaluate_audio

SR = 48000
FRAME = 1600  # ~one video frame of audio at 30fps


def _rng(seed: int = 0) -> np.random.Generator:
    return np.random.default_rng(seed)


def pink_ish(n: int, seed: int = 0, tilt: float = 1.0) -> np.ndarray:
    """Broadband noise with a 1/f^tilt spectral slope — a stand-in for music,
    where low frequencies carry most of the energy and highs are quiet."""
    spec = np.fft.rfft(_rng(seed).standard_normal(n))
    freqs = np.fft.rfftfreq(n, d=1.0 / SR)
    weight = 1.0 / np.maximum(freqs, 20.0) ** tilt
    # Real recordings carry no useful energy below ~20Hz. Without this the 1/f
    # weighting piles almost everything into sub-audible bins and every audible
    # band reads near zero — an artefact of the generator, not of the follower.
    weight[freqs < 20.0] = 0.0
    out = np.fft.irfft(spec * weight, n=n).astype(np.float32)
    peak = float(np.abs(out).max())
    return (out / peak).astype(np.float32) if peak > 0 else out


def band_limited(n: int, low: float, high: float, seed: int = 0) -> np.ndarray:
    """Noise confined to [low, high] Hz — energy is genuinely in one band."""
    spec = np.fft.rfft(_rng(seed).standard_normal(n))
    freqs = np.fft.rfftfreq(n, d=1.0 / SR)
    spec[(freqs < low) | (freqs > high)] = 0
    out = np.fft.irfft(spec, n=n).astype(np.float32)
    peak = float(np.abs(out).max())
    return (out / peak).astype(np.float32) if peak > 0 else out


def band(pcm, low, high, **params) -> float:
    p = {"low_hz": low, "high_hz": high}
    p.update(params)
    return evaluate_audio(pcm, "frequency_band", p, SR)[0]


class TestBandFollowerIsNotPinned:
    """The saturation bug: on broadband material every band returned 1.000."""

    def test_mid_band_is_not_pinned_on_broadband_audio(self):
        pcm = pink_ish(FRAME)
        val = band(pcm, 500, 2000)
        assert val < 0.99, (
            f"mid band returned {val:.4f} on broadband audio — a control pinned at "
            "full scale is dead, it cannot modulate anything"
        )

    @pytest.mark.parametrize(
        "low,high", [(20, 60), (60, 250), (250, 500), (500, 2000), (2000, 4000)]
    )
    def test_no_band_pins_on_broadband_audio(self, low, high):
        val = band(pink_ish(FRAME), low, high)
        assert 0.0 <= val < 0.99, f"band [{low},{high}] pinned at {val:.4f}"

    def test_band_varies_across_changing_audio(self):
        """A control must move as the material changes, not sit at a constant."""
        vals = [band(pink_ish(FRAME, seed=s), 60, 250) for s in range(24)]
        assert np.std(vals) > 0.005, (
            f"band output std={np.std(vals):.5f} across varied audio — effectively constant"
        )


class TestBandFollowerDiscriminates:
    """Different spectral content must produce different values."""

    def test_bass_content_reads_higher_in_bass_band(self):
        bass = band_limited(FRAME, 60, 250, seed=1)
        assert band(bass, 60, 250) > band(bass, 2000, 4000) + 0.3

    def test_treble_content_reads_higher_in_treble_band(self):
        treble = band_limited(FRAME, 2000, 4000, seed=2)
        assert band(treble, 2000, 4000) > band(treble, 60, 250) + 0.3

    def test_two_bands_of_same_signal_differ(self):
        """The core failure: bass and mid both returned exactly 1.000."""
        pcm = pink_ish(FRAME)
        assert abs(band(pcm, 60, 250) - band(pcm, 500, 2000)) > 0.02


class TestBandFollowerResponds:
    def test_more_band_energy_gives_higher_value(self):
        """Monotonic in the quantity being measured."""
        base = band_limited(FRAME, 2000, 4000, seed=3)
        bass = band_limited(FRAME, 60, 250, seed=4)
        vals = [
            band((base + w * bass).astype(np.float32), 60, 250)
            for w in (0.0, 0.5, 1.0, 2.0)
        ]
        assert vals == sorted(vals), f"not monotonic in bass energy: {vals}"
        assert vals[-1] > vals[0] + 0.1

    def test_level_invariant(self):
        """Halving the volume must not halve a spectral-balance reading —
        otherwise the control tracks loudness rather than content."""
        pcm = pink_ish(FRAME)
        loud = band(pcm, 60, 250)
        quiet = band((pcm * 0.25).astype(np.float32), 60, 250)
        assert abs(loud - quiet) < 0.05


class TestBandFollowerContract:
    def test_always_in_unit_range(self):
        for seed in range(8):
            v = band(pink_ish(FRAME, seed=seed), 20, 20000)
            assert 0.0 <= v <= 1.0

    def test_silence_is_zero(self):
        assert band(np.zeros(FRAME, dtype=np.float32), 60, 250) == 0.0

    def test_disjoint_bands_do_not_exceed_full_scale(self):
        """Disjoint bands partition the spectrum; their readings should behave
        like shares of one whole, not each independently claim all of it."""
        pcm = pink_ish(FRAME)
        edges = [(20, 250), (250, 2000), (2000, 20000)]
        total = sum(band(pcm, lo, hi) for lo, hi in edges)
        assert total <= 1.35, (
            f"disjoint bands sum to {total:.3f} — not shares of a whole"
        )


class TestOnsetFollower:
    """Onset returned 1.000 every frame on real audio: no transient information."""

    def _run(self, frames, **params):
        p = {"threshold": 0.0}
        p.update(params)
        state, out = {}, []
        for f in frames:
            v, state = evaluate_audio(f, "onset", p, SR, state)
            out.append(v)
        return out

    def test_sustained_tone_does_not_fire_continuously(self):
        t = np.arange(FRAME * 12, dtype=np.float32) / SR
        tone = np.sin(2 * np.pi * 220 * t).astype(np.float32)
        frames = [tone[i * FRAME : (i + 1) * FRAME] for i in range(12)]
        vals = self._run(frames)[2:]
        assert max(vals) < 0.5, (
            f"steady tone produced onset values up to {max(vals):.3f} — "
            "a detector that always fires carries no information"
        )

    def test_transient_scores_above_steady_state(self):
        steady = [band_limited(FRAME, 200, 400, seed=5) for _ in range(4)]
        hit = (band_limited(FRAME, 200, 8000, seed=6) * 3.0).astype(np.float32)
        vals = self._run(steady + [hit] + steady)
        assert vals[4] > max(vals[1:4]) + 0.05, f"transient not distinguished: {vals}"

    def test_onset_is_level_invariant(self):
        """A quiet passage's transients must still register — the detector should
        respond to spectral CHANGE, not absolute loudness."""
        a = [band_limited(FRAME, 200, 400, seed=7) for _ in range(3)]
        hit = (band_limited(FRAME, 200, 8000, seed=8) * 3.0).astype(np.float32)
        loud = self._run(a + [hit])[-1]
        quiet = self._run(
            [(f * 0.1).astype(np.float32) for f in a] + [(hit * 0.1).astype(np.float32)]
        )[-1]
        assert abs(loud - quiet) < 0.25, (
            f"onset is level-dependent (loud={loud:.3f} quiet={quiet:.3f})"
        )

    def test_stays_in_unit_range(self):
        frames = [pink_ish(FRAME, seed=s) for s in range(6)]
        assert all(0.0 <= v <= 1.0 for v in self._run(frames))


class TestDefaultParamsAreUsable:
    """Most callers pass no params at all — `zmq_server`'s granulator falls back to
    `{}` when `onset_params` is absent, and operator lanes commonly omit tuning.
    The DEFAULTS therefore have to work on real material, not just tuned values.
    """

    def test_default_onset_is_silent_on_steady_material(self):
        steady = [band_limited(FRAME, 200, 400, seed=5) for _ in range(4)]
        state, vals = {}, []
        for f in steady:
            v, state = evaluate_audio(f, "onset", {}, SR, state)
            vals.append(v)
        assert max(vals) == 0.0, f"default onset fires on steady audio: {vals}"

    def test_default_onset_fires_on_a_transient(self):
        steady = [band_limited(FRAME, 200, 400, seed=5) for _ in range(4)]
        hit = (band_limited(FRAME, 200, 8000, seed=6) * 3.0).astype(np.float32)
        state, vals = {}, []
        for f in steady + [hit]:
            v, state = evaluate_audio(f, "onset", {}, SR, state)
            vals.append(v)
        assert vals[-1] > 0.5, f"default onset missed a transient: {vals}"

    def test_default_band_is_not_pinned(self):
        """The regression that started this: defaults must not read a constant."""
        vals = [band(pink_ish(FRAME, seed=s), 60, 250) for s in range(8)]
        assert max(vals) < 0.99, f"default band pinned: {vals}"
        assert np.std(vals) > 0.0, "default band is constant across varied audio"
