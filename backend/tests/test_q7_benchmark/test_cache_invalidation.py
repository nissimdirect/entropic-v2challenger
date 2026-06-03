"""Tests for cache_invalidation.py — backbone version skew detection."""

from __future__ import annotations

import pytest

from q7_benchmark.cache_invalidation import (
    BackboneSkew,
    check_skew,
    needs_recompute,
)


@pytest.mark.smoke
def test_no_skew_when_versions_match():
    project = {"dinov2": "deadbeef0000", "clip": "feedbeef0000"}
    current = {"dinov2": "deadbeef0000", "clip": "feedbeef0000"}
    assert check_skew(project, current) == []


@pytest.mark.smoke
def test_skew_when_one_backbone_changes():
    project = {"dinov2": "deadbeef0000", "clip": "feedbeef0000"}
    current = {"dinov2": "deadbeef0000", "clip": "newrev_00000"}
    skews = check_skew(project, current)
    assert len(skews) == 1
    assert skews[0].name == "clip"
    assert skews[0].project_version == "feedbeef0000"
    assert skews[0].current_version == "newrev_00000"


@pytest.mark.smoke
def test_skew_for_multiple_backbones():
    project = {"dinov2": "old1234", "clip": "old5678", "clap": "old9012"}
    current = {"dinov2": "new1234", "clip": "old5678", "clap": "new9012"}
    skews = check_skew(project, current)
    assert {s.name for s in skews} == {"dinov2", "clap"}


@pytest.mark.smoke
def test_empty_project_versions_no_skew():
    """First-encode case: project has no cached versions yet."""
    assert check_skew(None, {"dinov2": "abc"}) == []
    assert check_skew({}, {"dinov2": "abc"}) == []


@pytest.mark.smoke
def test_backbone_removed_from_registry_no_skew():
    """User removed CLAP from models.toml — project's CLAP cache is fine."""
    project = {"dinov2": "abc", "clap": "xyz"}
    current = {"dinov2": "abc"}  # CLAP missing
    assert check_skew(project, current) == []


@pytest.mark.smoke
def test_needs_recompute_returns_true_on_skew():
    project = {"dinov2": "old"}
    current = {"dinov2": "new"}
    assert needs_recompute(project, current) is True


@pytest.mark.smoke
def test_needs_recompute_returns_false_when_locked():
    """Locked project skips recompute even with skew."""
    project = {"dinov2": "old"}
    current = {"dinov2": "new"}
    assert needs_recompute(project, current, backbone_versions_locked=True) is False


@pytest.mark.smoke
def test_needs_recompute_returns_false_when_no_skew():
    project = {"dinov2": "abc"}
    current = {"dinov2": "abc"}
    assert needs_recompute(project, current) is False


@pytest.mark.smoke
def test_backbone_skew_short_helper():
    s = BackboneSkew("dinov2", "abcdef123456789", "fedcba987654321")
    short = s.short
    assert "dinov2" in short
    assert "abcdef12" in short
    assert "fedcba98" in short


@pytest.mark.smoke
def test_backbone_skew_is_frozen():
    s = BackboneSkew("dinov2", "old", "new")
    with pytest.raises(Exception):  # FrozenInstanceError
        s.name = "clip"  # type: ignore[misc]
