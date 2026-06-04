"""Tests for E5 Hardware MIDI Learn (PR #27)."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

BACKEND_SRC = Path(__file__).resolve().parents[2] / "src"
if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))

from midi import (
    MIDIBinding,
    MIDIEvent,
    MIDIMapping,
    MIDIMappingRegistry,
    MIDISource,
    SUPPORTED_TEMPLATES,
    global_midi_registry,
    load_template,
    reset_global_midi_registry_for_testing,
)
from midi.registry import MIDISourceKind


@pytest.fixture(autouse=True)
def _reset():
    reset_global_midi_registry_for_testing()
    yield
    reset_global_midi_registry_for_testing()


# ---- MIDISource validation ----


@pytest.mark.smoke
def test_source_valid_construction():
    s = MIDISource(kind=MIDISourceKind.CC, channel=0, number=64)
    assert s.key() == "cc:0:64"


@pytest.mark.smoke
def test_source_channel_out_of_range_raises():
    with pytest.raises(ValueError, match="channel"):
        MIDISource(kind=MIDISourceKind.CC, channel=16, number=0)


@pytest.mark.smoke
def test_source_number_out_of_range_raises():
    with pytest.raises(ValueError, match="number"):
        MIDISource(kind=MIDISourceKind.NOTE, channel=0, number=200)


# ---- MIDIBinding remap ----


@pytest.mark.smoke
def test_binding_remap_default_range():
    b = MIDIBinding(
        source=MIDISource(kind=MIDISourceKind.CC, channel=0, number=21),
        dst_param_path="x",
    )
    assert b.remap(0) == 0.0
    assert b.remap(127) == 1.0
    assert abs(b.remap(64) - 64 / 127) < 1e-6


@pytest.mark.smoke
def test_binding_remap_custom_range():
    b = MIDIBinding(
        source=MIDISource(kind=MIDISourceKind.CC, channel=0, number=21),
        dst_param_path="x",
        scale_min=-1.0,
        scale_max=1.0,
    )
    assert b.remap(0) == -1.0
    assert b.remap(127) == 1.0


@pytest.mark.smoke
def test_binding_remap_invert():
    b = MIDIBinding(
        source=MIDISource(kind=MIDISourceKind.CC, channel=0, number=21),
        dst_param_path="x",
        invert=True,
    )
    assert b.remap(0) == 1.0
    assert b.remap(127) == 0.0


@pytest.mark.smoke
def test_binding_remap_invalid_midi_value_raises():
    b = MIDIBinding(
        source=MIDISource(kind=MIDISourceKind.CC, channel=0, number=21),
        dst_param_path="x",
    )
    with pytest.raises(ValueError):
        b.remap(200)


# ---- Mapping serialization ----


@pytest.mark.smoke
def test_mapping_round_trip_through_dict():
    m = MIDIMapping(name="t", description="d")
    m.add(
        MIDIBinding(
            source=MIDISource(kind=MIDISourceKind.CC, channel=0, number=21),
            dst_param_path="track1.fx-blur.radius",
            scale_min=0.0,
            scale_max=2.0,
        )
    )
    d = m.to_dict()
    m2 = MIDIMapping.from_dict(d)
    assert m2.name == "t"
    assert len(m2.bindings) == 1
    b = m2.lookup(MIDISource(kind=MIDISourceKind.CC, channel=0, number=21))
    assert b is not None
    assert b.scale_max == 2.0


# ---- Registry ----


@pytest.mark.smoke
def test_registry_starts_with_default_mapping():
    r = MIDIMappingRegistry()
    assert r.active_mapping().name == "default"
    assert not r.is_learning()


@pytest.mark.smoke
def test_registry_add_remove_binding():
    r = MIDIMappingRegistry()
    src = MIDISource(kind=MIDISourceKind.CC, channel=0, number=21)
    r.add_binding(MIDIBinding(source=src, dst_param_path="x"))
    assert r.lookup(src) is not None
    assert r.remove_binding(src) is True
    assert r.lookup(src) is None


@pytest.mark.smoke
def test_registry_remove_missing_returns_false():
    r = MIDIMappingRegistry()
    src = MIDISource(kind=MIDISourceKind.CC, channel=0, number=21)
    assert r.remove_binding(src) is False


# ---- Learn ----


@pytest.mark.smoke
def test_learn_session_lifecycle():
    r = MIDIMappingRegistry()
    r.start_learn("track1.fx-blur.radius")
    assert r.is_learning()
    assert r.learning_for() == "track1.fx-blur.radius"


@pytest.mark.smoke
def test_learn_captures_first_event():
    r = MIDIMappingRegistry()
    r.start_learn("track1.fx-blur.radius")
    src = MIDISource(kind=MIDISourceKind.CC, channel=2, number=42)
    binding = r.handle_event(MIDIEvent(source=src, value=64))
    assert binding is not None
    assert binding.source == src
    assert binding.dst_param_path == "track1.fx-blur.radius"
    # Learn session ended
    assert not r.is_learning()


@pytest.mark.smoke
def test_learn_cancel():
    r = MIDIMappingRegistry()
    r.start_learn("p")
    assert r.cancel_learn() is True
    assert not r.is_learning()


@pytest.mark.smoke
def test_cancel_when_no_learn_returns_false():
    r = MIDIMappingRegistry()
    assert r.cancel_learn() is False


@pytest.mark.smoke
def test_handle_event_without_learn_returns_existing_binding():
    r = MIDIMappingRegistry()
    src = MIDISource(kind=MIDISourceKind.CC, channel=0, number=21)
    r.add_binding(MIDIBinding(source=src, dst_param_path="x"))
    binding = r.handle_event(MIDIEvent(source=src, value=10))
    assert binding is not None
    assert binding.dst_param_path == "x"


@pytest.mark.smoke
def test_handle_event_with_unmapped_source_returns_none():
    r = MIDIMappingRegistry()
    src = MIDISource(kind=MIDISourceKind.CC, channel=0, number=21)
    binding = r.handle_event(MIDIEvent(source=src, value=10))
    assert binding is None


# ---- Templates ----


@pytest.mark.smoke
def test_supported_templates_constant():
    assert SUPPORTED_TEMPLATES == (
        "launchpad_x",
        "launchpad_mini_mk3",
        "launchpad_pro_mk3",
    )


@pytest.mark.smoke
@pytest.mark.parametrize("template_name", list(SUPPORTED_TEMPLATES))
def test_each_template_loads(template_name):
    m = load_template(template_name)
    assert isinstance(m, MIDIMapping)
    assert len(m.bindings) >= 64  # at least 8x8 pad grid


@pytest.mark.smoke
def test_launchpad_x_has_8_top_knobs_and_64_pads():
    m = load_template("launchpad_x")
    # 8 CCs + 64 pads = 72 bindings
    assert len(m.bindings) == 72


@pytest.mark.smoke
def test_launchpad_mini_mk3_has_only_64_pads():
    m = load_template("launchpad_mini_mk3")
    assert len(m.bindings) == 64


@pytest.mark.smoke
def test_launchpad_pro_mk3_has_macros_scenes_pads():
    m = load_template("launchpad_pro_mk3")
    # 8 macros + 8 scenes + 64 pads = 80
    assert len(m.bindings) == 80


@pytest.mark.smoke
def test_template_unknown_raises():
    with pytest.raises(ValueError, match="unknown template"):
        load_template("not-a-real-template")


@pytest.mark.smoke
def test_template_pads_dispatch_to_perform_pads():
    m = load_template("launchpad_x")
    # Note 11 (bottom-left pad) should map to perform.pad1
    src = MIDISource(kind=MIDISourceKind.NOTE, channel=0, number=11)
    binding = m.lookup(src)
    assert binding is not None
    assert binding.dst_param_path == "perform.pad1"


@pytest.mark.smoke
def test_template_round_trip_through_dict():
    m1 = load_template("launchpad_x")
    d = m1.to_dict()
    m2 = MIDIMapping.from_dict(d)
    assert len(m2.bindings) == len(m1.bindings)


@pytest.mark.smoke
def test_global_registry_singleton():
    r1 = global_midi_registry()
    r2 = global_midi_registry()
    assert r1 is r2
