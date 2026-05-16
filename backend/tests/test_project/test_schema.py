"""Tests for .glitch project file schema."""

import pytest

from project.schema import deserialize, new_project, serialize, validate

pytestmark = pytest.mark.smoke


def test_new_project_has_required_fields():
    p = new_project(author="test")
    assert p["version"] == "2.0.0"
    assert p["author"] == "test"
    assert p["settings"]["resolution"] == [1920, 1080]
    assert p["settings"]["frameRate"] == 30
    assert len(p["id"]) == 36  # UUID


def test_roundtrip_serialize_deserialize():
    p = new_project(author="roundtrip_test")
    json_str = serialize(p)
    restored = deserialize(json_str)
    assert restored["version"] == p["version"]
    assert restored["id"] == p["id"]
    assert restored["author"] == p["author"]
    assert restored["settings"] == p["settings"]
    assert restored["assets"] == p["assets"]


def test_validate_valid_project():
    p = new_project()
    errors = validate(p)
    assert errors == []


def test_validate_missing_keys():
    errors = validate({"version": "2.0.0"})
    assert len(errors) > 0
    assert "Missing top-level keys" in errors[0]


def test_validate_bad_settings():
    p = new_project()
    p["settings"] = "not a dict"
    errors = validate(p)
    assert any("settings" in e for e in errors)


def test_deserialize_invalid_json():
    with pytest.raises(ValueError, match="Invalid JSON"):
        deserialize("not json {{{")


def test_deserialize_missing_fields():
    with pytest.raises(ValueError, match="Invalid project"):
        deserialize('{"version": "2.0.0"}')


# F-0514-10 + F-0514-11: numeric range validation at the project boundary.


@pytest.mark.parametrize(
    "bad_fps",
    [0, -1, 241, 1000, float("nan"), float("inf"), float("-inf"), "30", None, True],
)
def test_validate_rejects_out_of_range_frame_rate(bad_fps):
    p = new_project()
    p["settings"]["frameRate"] = bad_fps
    errors = validate(p)
    assert any("frameRate" in e for e in errors), (
        f"expected frameRate error for {bad_fps!r}, got {errors}"
    )


@pytest.mark.parametrize("good_fps", [1, 24, 30, 60, 120, 240, 29.97])
def test_validate_accepts_in_range_frame_rate(good_fps):
    p = new_project()
    p["settings"]["frameRate"] = good_fps
    assert validate(p) == []


@pytest.mark.parametrize(
    "bad_sr",
    [0, 12345, -48000, 48000.5, "48000", None, True, float("nan")],
)
def test_validate_rejects_invalid_audio_sample_rate(bad_sr):
    p = new_project()
    p["settings"]["audioSampleRate"] = bad_sr
    errors = validate(p)
    assert any("audioSampleRate" in e for e in errors)


@pytest.mark.parametrize("good_sr", [8000, 22050, 44100, 48000, 96000])
def test_validate_accepts_standard_audio_sample_rates(good_sr):
    p = new_project()
    p["settings"]["audioSampleRate"] = good_sr
    assert validate(p) == []


@pytest.mark.parametrize(
    "bad_volume",
    [-0.1, 2.01, 10, float("nan"), float("inf"), "1.0", None, True],
)
def test_validate_rejects_invalid_master_volume(bad_volume):
    p = new_project()
    p["settings"]["masterVolume"] = bad_volume
    errors = validate(p)
    assert any("masterVolume" in e for e in errors)


@pytest.mark.parametrize(
    "bad_seed",
    [-1, 2**31, 2**63, 1.5, "0", None, True, float("nan")],
)
def test_validate_rejects_invalid_seed(bad_seed):
    p = new_project()
    p["settings"]["seed"] = bad_seed
    errors = validate(p)
    assert any("seed" in e for e in errors)


@pytest.mark.parametrize(
    "bad_resolution",
    [
        [0, 1080],
        [1920, 0],
        [-1, 1080],
        [9000, 1080],
        [1920],
        [1920, 1080, 30],
        "1920x1080",
        None,
        [1920.5, 1080],
    ],
)
def test_validate_rejects_invalid_resolution(bad_resolution):
    p = new_project()
    p["settings"]["resolution"] = bad_resolution
    errors = validate(p)
    assert any("resolution" in e.lower() for e in errors)


def test_deserialize_rejects_malformed_settings_with_clear_message():
    """User-facing: deserialize should raise with a clear error pointing at the bad field."""
    p = new_project()
    p["settings"]["frameRate"] = 99999
    bad_json = serialize(p)
    with pytest.raises(ValueError, match=r"frameRate.*240"):
        deserialize(bad_json)


# F-0514-12: structural defense — port of frontend walk() validation.


def test_validate_rejects_deeply_nested_json():
    """Hostile file with >32 levels of nesting must be rejected before type checks."""
    p: dict = new_project()
    cursor: dict = p
    for _ in range(40):
        cursor["nest"] = {}
        cursor = cursor["nest"]
    errors = validate(p)
    assert any("nesting depth" in e.lower() for e in errors)


def test_validate_rejects_huge_arrays():
    """Arrays larger than 10_000 entries must be rejected."""
    p = new_project()
    p["timeline"]["markers"] = list(range(10_001))
    errors = validate(p)
    assert any("array length" in e.lower() for e in errors)


def test_validate_rejects_forbidden_keys_proto():
    """`__proto__` is a prototype-pollution signal; must be rejected."""
    p = new_project()
    p["assets"]["__proto__"] = {"id": "a", "path": "x", "meta": {}}
    errors = validate(p)
    assert any("__proto__" in e for e in errors)


def test_validate_rejects_forbidden_keys_constructor():
    p = new_project()
    p["timeline"]["constructor"] = {"id": "x"}
    errors = validate(p)
    assert any("constructor" in e for e in errors)


def test_validate_rejects_forbidden_keys_prototype_nested():
    p = new_project()
    p["timeline"]["tracks"] = [
        {"id": "t1", "name": "t", "clips": [], "prototype": "evil"}
    ]
    errors = validate(p)
    assert any("prototype" in e for e in errors)


# RT-4 (2026-05-16): FORBIDDEN_KEY_PATTERN is case-INsensitive — a malicious
# .glitch can't bypass the prototype-pollution defense with mixed casing.
@pytest.mark.parametrize(
    "bad_key",
    ["__PROTO__", "__Proto__", "Constructor", "CONSTRUCTOR", "Prototype", "PROTOTYPE"],
)
def test_validate_rejects_forbidden_keys_case_insensitive(bad_key):
    p = new_project()
    p["assets"][bad_key] = {"id": "x", "path": "x", "meta": {}}
    errors = validate(p)
    assert any(bad_key in e for e in errors), (
        f"expected {bad_key} to be rejected, got {errors}"
    )


def test_validate_accepts_keys_that_only_contain_forbidden_substrings():
    """Lookalikes that AREN'T exact forbidden names should pass — substring match would over-reject."""
    p = new_project()
    p["assets"]["my__proto__field"] = {"id": "ok", "path": "x", "meta": {}}
    p["assets"]["constructor_helper"] = {"id": "ok2", "path": "x", "meta": {}}
    assert validate(p) == []


def test_validate_rejects_object_key_explosion():
    """Objects with more than 1024 keys must be rejected (memory DoS guard)."""
    p = new_project()
    huge_assets = {
        f"a{i}": {"id": f"a{i}", "path": "x", "meta": {}} for i in range(1025)
    }
    p["assets"] = huge_assets
    errors = validate(p)
    assert any("key count" in e.lower() for e in errors)


def test_validate_rejects_overlong_version_string():
    """Version strings longer than 16 chars indicate hostile input."""
    p = new_project()
    p["version"] = "9.9.9-" + "x" * 50
    errors = validate(p)
    assert any("version" in e.lower() for e in errors)


def test_validate_accepts_normal_nesting_and_arrays():
    """Sanity: real-world depth + reasonable array sizes pass."""
    p = new_project()
    p["timeline"]["markers"] = list(range(100))
    p["timeline"]["tracks"] = [
        {"id": f"t{i}", "name": f"Track {i}", "clips": []} for i in range(50)
    ]
    assert validate(p) == []


# F-0514-19 (2026-05-16 synthesis carry-forward): autosave-corruption defense.
#
# Iter 22 had a P0 cold-start blank-canvas blocker. Recovery was move-to-backup
# of `~/Library/Application Support/Entropic/.autosave.glitch`. Root cause was
# never diagnosed — the autosave file had `version: "2.0.0"` + `bpm: 120` in
# settings, suspected (but not confirmed) to trip the walk defense.
#
# These tests lock in: legitimate-looking autosave variants — including the
# specific shape that came out of the iter22 backup — MUST pass validate(). If
# F-0514-19 recurs and bisects to a schema change, these will catch it.


def test_validate_accepts_autosave_with_bpm_in_settings():
    """The iter22 backup's actual shape: settings has bpm alongside seeded keys."""
    p = new_project()
    p["settings"]["bpm"] = 120
    assert validate(p) == []


def test_validate_accepts_project_with_unknown_top_level_keys():
    """Future versions may add fields. Walk defense MUST NOT reject unknown keys."""
    p = new_project()
    p["masterEffectChain"] = []
    p["drumRack"] = {"pads": []}
    p["operators"] = []
    p["automationLanes"] = {}
    p["midiMappings"] = {}
    p["deviceGroups"] = {}
    p["futureField"] = "agents may write this"
    assert validate(p) == []


def test_validate_accepts_project_with_settings_extras():
    """settings may pick up new fields between versions. Don't reject."""
    p = new_project()
    p["settings"]["futureSettingsField"] = "agents may write this too"
    p["settings"]["bpm"] = 120
    p["settings"]["customColor"] = "#ff00ff"
    assert validate(p) == []


def test_deserialize_accepts_iter22_style_autosave():
    """End-to-end: enriched project must round-trip through serialize/deserialize."""
    p = new_project()
    p["settings"]["bpm"] = 120
    p["masterEffectChain"] = []
    p["drumRack"] = {"pads": []}
    p["operators"] = []
    raw = serialize(p)
    restored = deserialize(raw)
    assert restored["settings"]["bpm"] == 120
    assert restored["operators"] == []


def test_validate_accepts_31_level_nesting_at_boundary():
    """Boundary: depth EXACTLY at MAX_JSON_DEPTH must pass; 33 levels rejected."""
    p = new_project()
    cursor: dict = p["assets"]
    for _ in range(30):
        cursor["x"] = {}
        cursor = cursor["x"]
    cursor["leaf"] = "ok"
    assert validate(p) == []
