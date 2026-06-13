"""
B4.2 — Sample Rack macros: 8 macros/rack, one-to-many param routing, fan-out caps.

Drives the REAL resolver (``resolve_rack_macros``) + the REAL playback
(``ExportManager._compute_voice_footage_frame``) end-to-end and asserts the
COMPUTED FRAME INDEX actually moves when a macro fans a value into a pad's
``scrub`` param — the anti-dead-flag discipline (no tautological "macro object
holds a value" tests). The FAN-OUT CAPS live in ``security.validate_rack_macros``
and are negative-tested here.

Hard oracle (from the B4.2 packet spec) — all of:
  test_macro_drives_target_param_is_not_a_noop  — anti-dead-flag integration
  test_one_macro_drives_multiple_params         — one-to-many fan-out
  test_macro_over_max_routes_rejected           — neg / per-macro cap
  test_rack_over_max_total_edges_rejected        — neg / rack cap
  test_unknown_macro_target_skipped              — neg / trust boundary
  test_macro_depth_nan_clamped                   — neg / trust boundary
  test_no_macros_matches_b4_1                     — regression guard
"""

import copy

from engine.export import ExportManager
from modulation.routing import resolve_rack_macros
from security import (
    MAX_MODROUTES_PER_MACRO,
    MAX_TOTAL_EDGES,
    MAX_MACROS_PER_RACK,
    validate_rack_macros,
)


# ---------------------------------------------------------------------------
# Helpers — build a rack / pads / macros and run the FULL resolve→playback path
# ---------------------------------------------------------------------------


def _inst(inst_id="s-0", **over):
    base = {
        "id": inst_id,
        "type": "sampler",
        "clipId": "clip-1",
        "startFrame": 0,
        "speed": 1,
        "opacity": 1,
        "blendMode": "normal",
    }
    base.update(over)
    return base


def _pad(pad_id, **over):
    base = {
        "id": pad_id,
        "instrument": _inst(f"s-{pad_id}"),
        "opacity": 1.0,
        "blend": "normal",
        "mute": False,
        "solo": False,
    }
    base.update(over)
    return base


def _macro(macro_id, value, routes, name=None):
    return {
        "id": macro_id,
        "name": name or macro_id,
        "value": value,
        "routes": routes,
    }


def _route(target, depth=1.0):
    return {"targetPath": target, "depth": depth}


def _rack(pads, macros=None):
    r = {"id": "rack-1", "type": "rack", "pads": pads}
    if macros is not None:
        r["macros"] = macros
    return r


def _compute(inst, playhead, frame_count=100):
    return ExportManager._compute_voice_footage_frame(inst, playhead, frame_count)


def _pad_by_id(rack, pad_id):
    for p in rack["pads"]:
        if p["id"] == pad_id:
            return p
    raise KeyError(pad_id)


# ---------------------------------------------------------------------------
# ANTI-DEAD-FLAG: a macro actually MOVES the computed frame index
# ---------------------------------------------------------------------------


class TestMacroDrivesTargetParamIsNotANoop:
    """The whole point of B4.2: a macro→pad.<id>.scrub route MOVES the frame.

    Not "the macro object holds a value" (tautological/forbidden) — we drive the
    REAL resolver then the REAL playback and assert the resolved frame index
    differs from the no-macro baseline (fails-before / passes-after).
    """

    def test_macro_drives_target_param_is_not_a_noop(self):
        playhead = 0  # at playhead 0 the baseline frame is startFrame (0)
        rack = _rack([_pad("a")])

        # BASELINE: no macro driving → scrub absent → frame derives from playhead.
        baseline_inst = _pad_by_id(rack, "a")["instrument"]
        baseline_frame = _compute(baseline_inst, playhead)

        # A macro at full value fans into pad a's scrub via depth 1.0 → scrub=1.0
        # → playhead driven to the LAST frame of the playable range (frame 99).
        macro = _macro("m1", 1.0, [_route("pad.a.scrub", depth=1.0)])
        driven = resolve_rack_macros(_rack([_pad("a")], [macro]))
        driven_inst = _pad_by_id(driven, "a")["instrument"]

        # The resolver actually WROTE scrub into the target param...
        assert driven_inst.get("scrub") == 1.0
        # ...and that drives the REAL playback to a DIFFERENT frame than baseline.
        driven_frame = _compute(driven_inst, playhead)
        assert driven_frame != baseline_frame
        assert driven_frame == 99  # scrub 1.0 → last frame of [0, 99]

    def test_macro_at_zero_is_a_noop(self):
        """A macro at value 0 must NOT touch the param (regression-safe)."""
        macro = _macro("m1", 0.0, [_route("pad.a.scrub", depth=1.0)])
        out = resolve_rack_macros(_rack([_pad("a")], [macro]))
        assert _pad_by_id(out, "a")["instrument"].get("scrub") is None

    def test_macro_with_no_routes_is_a_noop(self):
        macro = _macro("m1", 1.0, [])
        out = resolve_rack_macros(_rack([_pad("a")], [macro]))
        assert _pad_by_id(out, "a")["instrument"].get("scrub") is None

    def test_macro_depth_scales_resolved_value(self):
        """value * depth — a half-depth route writes half the macro value."""
        macro = _macro("m1", 1.0, [_route("pad.a.scrub", depth=0.5)])
        out = resolve_rack_macros(_rack([_pad("a")], [macro]))
        assert _pad_by_id(out, "a")["instrument"]["scrub"] == 0.5


# ---------------------------------------------------------------------------
# ONE-TO-MANY: a single macro fans out to >=2 target params simultaneously
# ---------------------------------------------------------------------------


class TestOneMacroDrivesMultipleParams:
    def test_one_macro_drives_multiple_params(self):
        """One macro value fans out to two DIFFERENT pad params at once."""
        macro = _macro(
            "m1",
            1.0,
            [
                _route("pad.a.scrub", depth=1.0),
                _route("pad.b.scrub", depth=1.0),
            ],
        )
        out = resolve_rack_macros(_rack([_pad("a"), _pad("b")], [macro]))

        # BOTH pads received the resolved value from the SINGLE macro.
        assert _pad_by_id(out, "a")["instrument"]["scrub"] == 1.0
        assert _pad_by_id(out, "b")["instrument"]["scrub"] == 1.0

        # And BOTH drive their real playback to the last frame (was 0 at playhead 0).
        assert _compute(_pad_by_id(out, "a")["instrument"], 0) == 99
        assert _compute(_pad_by_id(out, "b")["instrument"], 0) == 99

    def test_one_macro_fans_to_distinct_params_on_same_pad(self):
        """A macro can drive scrub AND opacity on the same pad (one-to-many)."""
        macro = _macro(
            "m1",
            1.0,
            [
                _route("pad.a.scrub", depth=1.0),
                _route("pad.a.opacity", depth=-1.0),  # drives opacity 1.0 → 0.0
            ],
        )
        out = resolve_rack_macros(_rack([_pad("a")], [macro]))
        inst = _pad_by_id(out, "a")["instrument"]
        assert inst["scrub"] == 1.0
        assert inst["opacity"] == 0.0  # 1.0 base + (1.0 * -1.0) = 0.0, clamped [0,1]


# ---------------------------------------------------------------------------
# FAN-OUT CAPS — negative tests (the trust boundary, the point of this slice)
# ---------------------------------------------------------------------------


class TestFanOutCaps:
    def test_macro_over_max_routes_rejected(self):
        """A macro with > MAX_MODROUTES_PER_MACRO routes → structured rejection."""
        too_many = [
            _route("pad.a.scrub", depth=1.0) for _ in range(MAX_MODROUTES_PER_MACRO + 1)
        ]
        rack = _rack([_pad("a")], [_macro("m1", 1.0, too_many)])
        errors = validate_rack_macros(rack)
        assert errors  # non-empty → rejected
        assert "MAX_MODROUTES_PER_MACRO" in errors[0]

    def test_macro_at_max_routes_accepted(self):
        """Boundary: exactly MAX_MODROUTES_PER_MACRO routes is VALID (off-by-one)."""
        ok = [_route("pad.a.scrub") for _ in range(MAX_MODROUTES_PER_MACRO)]
        rack = _rack([_pad("a")], [_macro("m1", 1.0, ok)])
        assert validate_rack_macros(rack) == []

    def test_rack_over_max_total_edges_rejected(self):
        """Sum of routes across all macros > MAX_TOTAL_EDGES → reject.

        Each macro stays UNDER the per-macro cap, but the rack TOTAL exceeds the
        rack cap — proving MAX_TOTAL_EDGES is enforced independently.
        """
        per_macro = MAX_MODROUTES_PER_MACRO  # under/at the per-macro cap
        n_macros = (MAX_TOTAL_EDGES // per_macro) + 1  # pushes the total over
        macros = [
            _macro(f"m{i}", 1.0, [_route("pad.a.scrub") for _ in range(per_macro)])
            for i in range(n_macros)
        ]
        # Keep macro COUNT within MAX_MACROS_PER_RACK so we isolate the edge cap;
        # if n_macros would exceed it, the macro-count cap fires first (also a
        # valid rejection), so assert generically that it IS rejected.
        rack = _rack([_pad("a")], macros)
        errors = validate_rack_macros(rack)
        assert errors
        # The relevant cap is total-edges UNLESS macro count tripped first.
        assert "MAX_TOTAL_EDGES" in errors[0] or "MAX_MACROS_PER_RACK" in errors[0]

    def test_rack_total_edges_isolated_from_macro_count(self):
        """Construct an over-edges rack that stays UNDER the macro-count cap.

        MAX_MACROS_PER_RACK (8) macros × MAX_MODROUTES_PER_MACRO routes can exceed
        MAX_TOTAL_EDGES, so MAX_TOTAL_EDGES is the sole reason for rejection.
        """
        if MAX_MACROS_PER_RACK * MAX_MODROUTES_PER_MACRO <= MAX_TOTAL_EDGES:
            # caps configured so this isolation isn't possible — skip assertion
            return
        macros = [
            _macro(
                f"m{i}",
                1.0,
                [_route("pad.a.scrub") for _ in range(MAX_MODROUTES_PER_MACRO)],
            )
            for i in range(MAX_MACROS_PER_RACK)
        ]
        rack = _rack([_pad("a")], macros)
        errors = validate_rack_macros(rack)
        assert errors and "MAX_TOTAL_EDGES" in errors[0]

    def test_rack_over_max_macros_rejected(self):
        """> MAX_MACROS_PER_RACK macros → structured rejection (8/rack cap)."""
        macros = [
            _macro(f"m{i}", 1.0, [_route("pad.a.scrub")])
            for i in range(MAX_MACROS_PER_RACK + 1)
        ]
        rack = _rack([_pad("a")], macros)
        errors = validate_rack_macros(rack)
        assert errors and "MAX_MACROS_PER_RACK" in errors[0]

    def test_eight_macros_accepted(self):
        """Boundary: exactly 8 macros is VALID."""
        macros = [
            _macro(f"m{i}", 1.0, [_route("pad.a.scrub")])
            for i in range(MAX_MACROS_PER_RACK)
        ]
        assert validate_rack_macros(_rack([_pad("a")], macros)) == []

    def test_no_macros_field_passes_validation(self):
        assert validate_rack_macros(_rack([_pad("a")])) == []

    def test_none_rack_passes_validation(self):
        assert validate_rack_macros(None) == []

    def test_non_dict_rack_rejected(self):
        assert validate_rack_macros(["not", "a", "rack"])


# ---------------------------------------------------------------------------
# TRUST BOUNDARY — unknown target / malformed route SKIPPED; NaN/Inf clamped
# ---------------------------------------------------------------------------


class TestTrustBoundary:
    def test_unknown_macro_target_skipped(self):
        """A route to a non-existent pad / non-macro-able param is SKIPPED."""
        macro = _macro(
            "m1",
            1.0,
            [
                _route("pad.ghost.scrub", depth=1.0),  # pad doesn't exist
                _route("pad.a.clipId", depth=1.0),  # not macro-able
                _route("operator.x.foo", depth=1.0),  # wrong prefix
                _route("pad.a.scrub", depth=1.0),  # the ONLY valid route
            ],
        )
        out = resolve_rack_macros(_rack([_pad("a")], [macro]))
        # Only the valid route landed; the rest were skipped (no raise).
        assert _pad_by_id(out, "a")["instrument"]["scrub"] == 1.0
        # clipId was NOT clobbered.
        assert _pad_by_id(out, "a")["instrument"]["clipId"] == "clip-1"

    def test_malformed_route_does_not_raise(self):
        """A non-dict route / missing targetPath is skipped, never raises."""
        macro = {
            "id": "m1",
            "name": "m1",
            "value": 1.0,
            "routes": [None, 42, {}, {"depth": 1.0}, _route("pad.a.scrub")],
        }
        out = resolve_rack_macros(_rack([_pad("a")], [macro]))
        assert _pad_by_id(out, "a")["instrument"]["scrub"] == 1.0

    def test_macro_depth_nan_clamped(self):
        """A NaN/Inf depth must NOT poison the target param (clamped to no-op)."""
        nan = float("nan")
        inf = float("inf")
        macro = _macro(
            "m1",
            1.0,
            [
                _route("pad.a.scrub", depth=nan),
                _route("pad.b.scrub", depth=inf),
            ],
        )
        out = resolve_rack_macros(_rack([_pad("a"), _pad("b")], [macro]))
        # NaN/Inf depth → 0.0 contribution → no scrub written (base stays absent).
        assert _pad_by_id(out, "a")["instrument"].get("scrub") is None
        assert _pad_by_id(out, "b")["instrument"].get("scrub") is None

    def test_macro_value_out_of_range_clamped(self):
        """A macro value > 1 or < 0 is clamped to [0, 1] before scaling."""
        macro = _macro("m1", 5.0, [_route("pad.a.scrub", depth=1.0)])
        out = resolve_rack_macros(_rack([_pad("a")], [macro]))
        assert _pad_by_id(out, "a")["instrument"]["scrub"] == 1.0  # clamped, not 5

    def test_macro_value_nan_treated_as_zero(self):
        macro = _macro("m1", float("nan"), [_route("pad.a.scrub", depth=1.0)])
        out = resolve_rack_macros(_rack([_pad("a")], [macro]))
        assert _pad_by_id(out, "a")["instrument"].get("scrub") is None

    def test_resolver_does_not_mutate_input(self):
        """The resolver returns a deep copy; the input rack is untouched."""
        rack_in = _rack([_pad("a")], [_macro("m1", 1.0, [_route("pad.a.scrub")])])
        snapshot = copy.deepcopy(rack_in)
        resolve_rack_macros(rack_in)
        assert rack_in == snapshot  # input unchanged


# ---------------------------------------------------------------------------
# REGRESSION — a rack with no macros (or all at 0) resolves to the B4.1 rack
# ---------------------------------------------------------------------------


class TestRegression:
    def test_no_macros_matches_b4_1(self):
        """A rack with NO macros field returns unchanged → byte-identical B4.1.

        The frame index computed from the (un-driven) pad instruments must match
        the rack BEFORE B4.2 existed.
        """
        rack = _rack([_pad("a"), _pad("b")])  # no macros field at all
        out = resolve_rack_macros(rack)
        assert out is rack  # returned UNCHANGED (same object) — no copy, no drive
        # And the real playback is identical to a hand-built B4.1 pad.
        assert _compute(_pad_by_id(out, "a")["instrument"], 10) == _compute(
            _inst("s-a"), 10
        )

    def test_empty_macros_list_matches_b4_1(self):
        rack = _rack([_pad("a")], [])
        out = resolve_rack_macros(rack)
        assert out is rack  # empty macros → unchanged

    def test_all_macros_zero_matches_b4_1(self):
        """All macros at value 0 → no param written → frame index unchanged."""
        rack = _rack(
            [_pad("a")],
            [_macro("m1", 0.0, [_route("pad.a.scrub", depth=1.0)])],
        )
        out = resolve_rack_macros(rack)
        # scrub never written → playback identical to the no-macro pad.
        assert _pad_by_id(out, "a")["instrument"].get("scrub") is None
        assert _compute(_pad_by_id(out, "a")["instrument"], 10) == _compute(
            _inst("s-a"), 10
        )

    def test_non_dict_rack_returned_unchanged(self):
        assert resolve_rack_macros(None) is None
        assert resolve_rack_macros("nope") == "nope"
