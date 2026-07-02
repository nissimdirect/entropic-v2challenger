"""
B3.2 — sampler scrub + speed as modulation destinations (scrub-by-LFO).

Drives the REAL resolver (resolve_sampler_modulations) + the REAL playback
(ExportManager._compute_voice_footage_frame) end-to-end and asserts the COMPUTED
FRAME INDEX actually moves — the anti-dead-flag discipline (no tautological
"object holds scrub" tests).

Hard oracle (from B3.2 packet spec):
  test_sampler_scrub_modulation_is_not_a_noop     — anti-dead-flag integration
  test_sampler_speed_modulation_scales_playback
  test_no_sampler_modulation_matches_b3_1         — regression guard
  test_unknown_sampler_id_skipped                 — negative / trust boundary
  test_non_laneable_param_skipped                 — negative / trust boundary
"""

import copy

from engine.export import ExportManager
from modulation.routing import resolve_sampler_modulations


# ---------------------------------------------------------------------------
# Helpers — build operators / instruments and run the FULL resolve→playback path
# ---------------------------------------------------------------------------


def _op(op_id, mappings, *, enabled=True):
    return {"id": op_id, "is_enabled": enabled, "mappings": mappings}


def _map(target, *, depth=1.0, m_min=0.0, m_max=1.0, blend="add"):
    return {
        "target_param_key": target,
        "depth": depth,
        "min": m_min,
        "max": m_max,
        "blend_mode": blend,
    }


def compute(inst, playhead, frame_count=100):
    return ExportManager._compute_voice_footage_frame(inst, playhead, frame_count)


def resolve_then_compute(
    operator_values, operators, instruments, inst_id, playhead, frame_count=100
):
    """Drive the REAL resolver, then the REAL playback. Returns the frame index."""
    modulated = resolve_sampler_modulations(operator_values, operators, instruments)
    return compute(modulated[inst_id], playhead, frame_count)


# ---------------------------------------------------------------------------
# ANTI-DEAD-FLAG: scrub modulation actually moves the computed frame index
# ---------------------------------------------------------------------------


class TestSamplerScrubModulationIsNotANoop:
    """The whole point of B3.2: a sampler.<id>.scrub mapping MOVES the frame."""

    def test_sampler_scrub_modulation_is_not_a_noop(self):
        """Drive resolver + playback; assert the computed frame index moved off
        the un-modulated baseline to the scrub-driven position.

        Sampler: startFrame=0, speed=0 (frozen) → baseline frame is 0 for ANY
        playhead. Operator signal=1.0 → scrub=1.0 → frame = endFrame (range top).
        If scrub were a dead flag, the frame would stay 0. It must reach 99.
        """
        inst_id = "samp1"
        instruments = {
            inst_id: {
                "id": inst_id,
                "type": "sampler",
                "startFrame": 0,
                "endFrame": 99,
                "speed": 0,  # frozen — playhead cannot move the frame
            }
        }
        operators = [_op("lfo1", [_map(f"sampler.{inst_id}.scrub", m_min=0, m_max=1)])]

        # --- Baseline: NO operator value / NO modulation → frozen at frame 0.
        baseline = compute(instruments[inst_id], playhead=37, frame_count=100)
        assert baseline == 0, f"expected frozen baseline 0, got {baseline}"

        # --- Modulated: operator at full signal → scrub=1.0 → top of range (99).
        modulated_frame = resolve_then_compute(
            {"lfo1": 1.0}, operators, instruments, inst_id, playhead=37, frame_count=100
        )
        assert modulated_frame == 99, (
            f"scrub modulation is a NO-OP: frame stayed near baseline "
            f"({modulated_frame}), expected 99 (scrub=1.0 → range top)"
        )
        # And the move is unambiguous.
        assert modulated_frame != baseline

    def test_sampler_scrub_midpoint_lands_mid_range(self):
        """scrub=0.5 → middle of [startFrame, endFrame]."""
        inst_id = "s"
        instruments = {
            inst_id: {
                "id": inst_id,
                "type": "sampler",
                "startFrame": 0,
                "endFrame": 100,
                "speed": 0,
            }
        }
        operators = [_op("o", [_map(f"sampler.{inst_id}.scrub", m_min=0, m_max=1)])]
        # signal 0.5 → scrub 0.5 → frame = 0 + 0.5*(99-0) ... endFrame clamps to 99.
        frame = resolve_then_compute(
            {"o": 0.5}, operators, instruments, inst_id, 0, 100
        )
        assert frame == round(0 + 0.5 * (99 - 0)), f"got {frame}"

    def test_sampler_scrub_drives_within_loop_range(self):
        """When loop is enabled, scrub maps across [loopIn, loopOut], not the
        whole clip — the operator becomes the loop playhead."""
        inst_id = "s"
        instruments = {
            inst_id: {
                "id": inst_id,
                "type": "sampler",
                "startFrame": 0,
                "speed": 1,
                "loop": {"enabled": True, "in": 20, "out": 40, "dir": "fwd"},
            }
        }
        operators = [_op("o", [_map(f"sampler.{inst_id}.scrub", m_min=0, m_max=1)])]
        # scrub=0 → loopIn=20; scrub=1 → loopOut=40; scrub=0.5 → 30.
        assert (
            resolve_then_compute({"o": 0.0}, operators, instruments, inst_id, 5) == 20
        )
        assert (
            resolve_then_compute({"o": 1.0}, operators, instruments, inst_id, 5) == 40
        )
        assert (
            resolve_then_compute({"o": 0.5}, operators, instruments, inst_id, 5) == 30
        )


# ---------------------------------------------------------------------------
# SPEED modulation scales playback
# ---------------------------------------------------------------------------


class TestSamplerSpeedModulationScalesPlayback:
    """sampler.<id>.speed modulation scales the playback rate (frame step)."""

    def test_sampler_speed_modulation_scales_playback(self):
        """Base speed 1; operator adds +1 over [0,1] range → speed 2 → 2x step.

        At playhead=10, speed=1 → frame 10; modulated speed=2 → frame 20.
        """
        inst_id = "s"
        instruments = {
            inst_id: {"id": inst_id, "type": "sampler", "startFrame": 0, "speed": 1}
        }
        # min=0,max=1, signal=1, depth=1 → mapped=1 → speed += 1*(8 - -8)?  No:
        # bounds are (-8, 8); new = base + mod*(max-min) = 1 + 1*16 = 17 → clamp 8.
        # To land exactly on speed=2 we scale the mapping range: m_min=0, m_max
        # such that mod*(16) = 1 → use depth to control. Easiest: m_max small.
        # mod_value = mapped*depth = (0 + 1*(m_max-0))*depth. Want mod*16 = 1
        # → m_max*depth = 1/16. Use depth=1/16, m_max=1.
        operators = [
            _op("o", [_map(f"sampler.{inst_id}.speed", depth=1 / 16, m_min=0, m_max=1)])
        ]
        # baseline speed 1 → playhead 10 → frame 10.
        assert compute(instruments[inst_id], 10, 100) == 10
        # modulated speed 2 → frame 20.
        frame = resolve_then_compute(
            {"o": 1.0}, operators, instruments, inst_id, 10, 100
        )
        assert frame == 20, f"expected 20 (speed doubled), got {frame}"

    def test_sampler_speed_modulation_can_freeze(self):
        """Driving speed toward 0 via negative offset slows playback toward freeze."""
        inst_id = "s"
        instruments = {
            inst_id: {"id": inst_id, "type": "sampler", "startFrame": 5, "speed": 1}
        }
        # base 1 + mod*16; want speed≈0 → mod = -1/16. m_min=-1,m_max=0,signal=1
        # → mapped = -1+1*1 = 0 ... use m_min=-1, m_max=-1 → mapped=-1, depth=1/16.
        operators = [
            _op(
                "o",
                [_map(f"sampler.{inst_id}.speed", depth=1 / 16, m_min=-1, m_max=-1)],
            )
        ]
        frame = resolve_then_compute(
            {"o": 1.0}, operators, instruments, inst_id, 30, 100
        )
        # speed 0 → freeze at startFrame 5.
        assert frame == 5, f"expected freeze at startFrame 5, got {frame}"


# ---------------------------------------------------------------------------
# REGRESSION GUARD: no sampler modulation → byte-identical to B3.1
# ---------------------------------------------------------------------------


class TestNoSamplerModulationMatchesB31:
    """No operators / no matching mappings → instruments + playback unchanged."""

    def test_no_sampler_modulation_matches_b3_1(self):
        """Frame sequence with no sampler mapping == B3.1 sequence (loop + plain)."""
        inst_id = "s"
        plain = {"id": inst_id, "type": "sampler", "startFrame": 10, "speed": 1}
        looped = {
            "id": inst_id,
            "type": "sampler",
            "startFrame": 0,
            "speed": 1,
            "loop": {"enabled": True, "in": 0, "out": 9, "dir": "pingpong"},
        }
        for inst in (plain, looped):
            instruments = {inst_id: copy.deepcopy(inst)}
            # An operator exists but targets an EFFECT, not the sampler → no-op.
            operators = [_op("o", [_map("blur.radius")])]
            for ph in range(40):
                b31 = compute(inst, ph, 100)
                got = resolve_then_compute(
                    {"o": 1.0}, operators, instruments, inst_id, ph, 100
                )
                assert got == b31, f"regression at playhead {ph}: {got} != {b31}"

    def test_resolver_returns_same_reference_when_no_mappings(self):
        """No sampler mapping → resolver returns the SAME instruments object."""
        instruments = {"s": {"id": "s", "type": "sampler", "startFrame": 0, "speed": 1}}
        operators = [_op("o", [_map("blur.radius")])]
        out = resolve_sampler_modulations({"o": 1.0}, operators, instruments)
        assert out is instruments  # untouched, no deep copy

    def test_resolver_does_not_mutate_input(self):
        """Even with a matching mapping, the INPUT dict is never mutated."""
        instruments = {
            "s": {
                "id": "s",
                "type": "sampler",
                "startFrame": 0,
                "endFrame": 99,
                "speed": 0,
            }
        }
        before = copy.deepcopy(instruments)
        operators = [_op("o", [_map("sampler.s.scrub")])]
        resolve_sampler_modulations({"o": 1.0}, operators, instruments)
        assert instruments == before, "resolver mutated its input"


# ---------------------------------------------------------------------------
# NEGATIVE / TRUST BOUNDARY
# ---------------------------------------------------------------------------


class TestUnknownSamplerIdSkipped:
    """A target whose id isn't a live sampler is SKIPPED — never raises."""

    def test_unknown_sampler_id_skipped(self):
        instruments = {
            "real": {
                "id": "real",
                "type": "sampler",
                "startFrame": 0,
                "endFrame": 99,
                "speed": 0,
            }
        }
        # Target a sampler id that does NOT exist.
        operators = [_op("o", [_map("sampler.ghost.scrub")])]
        out = resolve_sampler_modulations({"o": 1.0}, operators, instruments)
        # Nothing matched → same reference, real sampler still frozen.
        assert out is instruments
        assert compute(out["real"], 50, 100) == 0

    def test_unknown_sampler_id_does_not_raise(self):
        instruments = {"real": {"id": "real", "type": "sampler", "startFrame": 0}}
        operators = [_op("o", [_map("sampler.nope.speed")])]
        # Must not raise.
        resolve_sampler_modulations({"o": 1.0}, operators, instruments)


class TestNonLaneableParamSkipped:
    """A target whose param isn't scrub/speed is SKIPPED — never raises."""

    def test_non_laneable_param_skipped(self):
        instruments = {
            "s": {
                "id": "s",
                "type": "sampler",
                "startFrame": 0,
                "endFrame": 99,
                "speed": 0,
                "opacity": 1.0,
            }
        }
        before = copy.deepcopy(instruments)
        # opacity / clipId / loop are NOT lane-able.
        operators = [
            _op(
                "o",
                [
                    _map("sampler.s.opacity"),
                    _map("sampler.s.clipId"),
                    _map("sampler.s.loop"),
                ],
            )
        ]
        out = resolve_sampler_modulations({"o": 1.0}, operators, instruments)
        # No lane-able param matched → same reference, nothing changed.
        assert out is instruments
        assert instruments == before

    def test_mixed_laneable_and_nonlaneable(self):
        """A laneable scrub still applies even when a sibling non-laneable param
        is also mapped (the non-laneable one is just skipped)."""
        inst_id = "s"
        instruments = {
            inst_id: {
                "id": inst_id,
                "type": "sampler",
                "startFrame": 0,
                "endFrame": 99,
                "speed": 0,
            }
        }
        operators = [
            _op(
                "o",
                [
                    _map("sampler.s.opacity"),  # skipped
                    _map(f"sampler.{inst_id}.scrub"),  # applied
                ],
            )
        ]
        frame = resolve_then_compute(
            {"o": 1.0}, operators, instruments, inst_id, 0, 100
        )
        assert frame == 99  # scrub=1 → range top

    def test_disabled_operator_skipped(self):
        """A disabled operator's mappings are ignored."""
        inst_id = "s"
        instruments = {
            inst_id: {
                "id": inst_id,
                "type": "sampler",
                "startFrame": 0,
                "endFrame": 99,
                "speed": 0,
            }
        }
        operators = [_op("o", [_map(f"sampler.{inst_id}.scrub")], enabled=False)]
        out = resolve_sampler_modulations({"o": 1.0}, operators, instruments)
        assert out is instruments
        assert compute(out[inst_id], 50, 100) == 0  # still frozen

    def test_non_sampler_prefix_skipped(self):
        """A `mask.` / effect target never routes into the sampler resolver."""
        instruments = {"s": {"id": "s", "type": "sampler", "startFrame": 0}}
        operators = [_op("o", [_map("mask.node1.hue"), _map("blur.radius")])]
        out = resolve_sampler_modulations({"o": 1.0}, operators, instruments)
        assert out is instruments
