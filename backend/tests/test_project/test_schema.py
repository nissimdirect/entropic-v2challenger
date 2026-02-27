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
