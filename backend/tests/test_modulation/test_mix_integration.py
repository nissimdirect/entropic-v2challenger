"""End-to-end test: operator → routing → container → pixel output for `_mix`.

Architecture-review follow-up to PR #91 (F-0516-9): the matrix UI plus
backend routing for `_mix` modulation were tested separately, but no
test exercised the full pipeline (operator signal → resolve_routings
→ apply_chain → container.process pops `_mix` → blended output).

A serialization or naming bug at `targetParamKey: "_mix"` would slip
through both isolated test halves. This test verifies a real pixel
delta between mix=0 (full dry) and mix=1 (full wet) when an operator
mapping drives the _mix value.

No Electron / Playwright required — runs purely against the Python
pipeline. ~50ms per case.
"""

from __future__ import annotations

import numpy as np
import pytest

from engine.pipeline import apply_chain
from modulation.routing import resolve_routings

pytestmark = pytest.mark.smoke


def _solid_frame(rgb: tuple[int, int, int], h: int = 64, w: int = 64) -> np.ndarray:
    """Build a small solid-color RGBA frame for fast pipeline checks."""
    frame = np.zeros((h, w, 4), dtype=np.uint8)
    frame[..., 0] = rgb[0]
    frame[..., 1] = rgb[1]
    frame[..., 2] = rgb[2]
    frame[..., 3] = 255
    return frame


def _make_invert_chain(mix: float) -> list[dict]:
    """A single-effect chain using fx.invert (deterministic, fast)."""
    return [
        {
            "effect_id": "fx.invert",
            "enabled": True,
            "params": {},  # invert has no required params
            "mix": float(mix),
        }
    ]


def _operator(op_id: str, mapping_target_param: str) -> dict:
    return {
        "id": op_id,
        "is_enabled": True,
        "mappings": [
            {
                "target_effect_id": "fx.invert",
                "target_param_key": mapping_target_param,
                "depth": 1.0,
                "min": 0.0,
                "max": 1.0,
                "blend_mode": "add",
            }
        ],
    }


class TestMixModulationIntegration:
    def test_dry_chain_passes_input_through(self):
        """Sanity: invert at mix=0 returns the source frame untouched."""
        frame = _solid_frame((200, 100, 50))
        chain = _make_invert_chain(0.0)
        out, _ = apply_chain(
            frame.copy(),
            chain,
            project_seed=42,
            frame_index=0,
            resolution=(64, 64),
        )
        assert np.array_equal(out[..., :3], frame[..., :3])

    def test_wet_chain_inverts_input(self):
        """Sanity: invert at mix=1 inverts the source frame."""
        frame = _solid_frame((200, 100, 50))
        chain = _make_invert_chain(1.0)
        out, _ = apply_chain(
            frame.copy(),
            chain,
            project_seed=42,
            frame_index=0,
            resolution=(64, 64),
        )
        # Inverted: 255-200=55, 255-100=155, 255-50=205
        assert int(out[0, 0, 0]) == 55
        assert int(out[0, 0, 1]) == 155
        assert int(out[0, 0, 2]) == 205

    def test_operator_modulates_mix_visibly(self):
        """LFO at signal=1.0 mapped to _mix takes a mix-0 chain to full wet.

        This is the load-bearing test for F-0516-9: the matrix lists `_mix`
        as a target, the operator's mapping uses paramKey='_mix', and the
        backend routing + pipeline cooperate to push the signal through
        to the actual blend.
        """
        frame = _solid_frame((200, 100, 50))
        # Start with mix=0 (full dry). Without modulation, output == input.
        chain = _make_invert_chain(0.0)
        operators = [_operator("lfo-1", "_mix")]
        # Signal at 1.0 → routing adds (1.0 * (1-0)) * 1.0 = 1.0 to base mix.
        modulated_chain = resolve_routings({"lfo-1": 1.0}, operators, chain)

        out, _ = apply_chain(
            frame.copy(),
            modulated_chain,
            project_seed=42,
            frame_index=0,
            resolution=(64, 64),
        )
        # Modulation pushed mix to 1.0 → output should be inverted.
        assert int(out[0, 0, 0]) == 55, (
            f"Mix modulation failed — got R={out[0, 0, 0]}, expected 55. "
            f"Modulated params: {modulated_chain[0]['params']}"
        )

    def test_operator_at_zero_signal_leaves_mix_at_base(self):
        """Signal=0 contributes 0 to mix delta — chain stays dry."""
        frame = _solid_frame((200, 100, 50))
        chain = _make_invert_chain(0.0)
        operators = [_operator("lfo-1", "_mix")]
        modulated_chain = resolve_routings({"lfo-1": 0.0}, operators, chain)

        out, _ = apply_chain(
            frame.copy(),
            modulated_chain,
            project_seed=42,
            frame_index=0,
            resolution=(64, 64),
        )
        assert np.array_equal(out[..., :3], frame[..., :3])

    def test_mix_modulation_at_half_signal_blends_proportionally(self):
        """Signal=0.5 → mix=0.5 → output is halfway between dry and wet."""
        frame = _solid_frame((200, 100, 50))
        chain = _make_invert_chain(0.0)
        operators = [_operator("lfo-1", "_mix")]
        modulated_chain = resolve_routings({"lfo-1": 0.5}, operators, chain)

        out, _ = apply_chain(
            frame.copy(),
            modulated_chain,
            project_seed=42,
            frame_index=0,
            resolution=(64, 64),
        )
        # Dry R=200, Wet R=55. At mix=0.5: 200 + 0.5*(55-200) = 127.5 → 127/128.
        assert 125 <= int(out[0, 0, 0]) <= 130, (
            f"Half-mix R channel out of range: {out[0, 0, 0]} (expected ~127)"
        )

    def test_pixel_delta_between_dry_and_wet_modulation(self):
        """Architecture-review acceptance: a real pixel-mean diff between
        mix=0 and mix=1 driven by modulation. This is the test that would
        have caught a wire-up bug at any of the three layers."""
        frame = _solid_frame((200, 100, 50))
        chain = _make_invert_chain(0.0)
        operators = [_operator("lfo-1", "_mix")]

        dry_chain = resolve_routings({"lfo-1": 0.0}, operators, chain)
        wet_chain = resolve_routings({"lfo-1": 1.0}, operators, chain)

        dry_out, _ = apply_chain(
            frame.copy(), dry_chain, project_seed=42, frame_index=0, resolution=(64, 64)
        )
        wet_out, _ = apply_chain(
            frame.copy(), wet_chain, project_seed=42, frame_index=0, resolution=(64, 64)
        )

        # Mean pixel diff across the frame, RGB only.
        diff = np.mean(
            np.abs(
                dry_out[..., :3].astype(np.int32) - wet_out[..., :3].astype(np.int32)
            )
        )
        # Hard guard: dry-vs-wet on invert MUST produce a significant
        # pixel difference. Threshold chosen to be unmistakable (>> noise).
        assert diff > 50, (
            f"Modulation did not produce a visible delta — mean pixel diff = {diff}. "
            f"Likely wire-up regression at the operator → routing → container path."
        )
