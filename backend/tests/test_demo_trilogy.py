"""Tests for the demo trilogy runner (PR #12).

PR #12 ships the structural validator + CLI-invocation builder. The actual
render runs on the user's Mac with their own source assets via the runbook
(docs/runbooks/q7/q7-demo-trilogy.md) — that's the app-validation step.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

SCRIPTS_DIR = Path(__file__).resolve().parent.parent / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from demo_trilogy.runner import (
    KNOWN_DEMOS,
    DEMOS_DIR,
    DemoSpec,
    DemoValidationError,
    build_cli_invocation,
    list_demos,
    load_demo_config,
    validate_demo_config,
)


@pytest.mark.smoke
def test_known_demos_constant_has_three():
    assert KNOWN_DEMOS == ("y-is-time", "painted-blur", "audio-lfo-stripes")


@pytest.mark.smoke
@pytest.mark.parametrize("demo", list(KNOWN_DEMOS))
def test_each_demo_config_loads(demo: str):
    config = load_demo_config(demo)
    assert isinstance(config, dict)
    assert config["name"] in {
        "Y-is-Time",
        "Painted-Blur",
        "Audio-LFO-Stripes",
    }


@pytest.mark.smoke
def test_load_unknown_demo_raises():
    with pytest.raises(ValueError, match="unknown demo"):
        load_demo_config("not-a-real-demo")


@pytest.mark.smoke
@pytest.mark.parametrize("demo", list(KNOWN_DEMOS))
def test_each_demo_passes_validation(demo: str):
    config = load_demo_config(demo)
    spec = validate_demo_config(config)
    assert isinstance(spec, DemoSpec)
    assert spec.demo_order > 0
    assert spec.duration_frames > 0
    assert spec.viewing_time_seconds > 0


@pytest.mark.smoke
def test_validate_rejects_missing_keys():
    bad = {"version": "3.0.0"}  # missing tracks/lanes/etc
    with pytest.raises(DemoValidationError, match="missing"):
        validate_demo_config(bad)


@pytest.mark.smoke
def test_validate_rejects_v2_version():
    config = load_demo_config("y-is-time")
    bad = {**config, "version": "2.0.0"}
    with pytest.raises(DemoValidationError, match="v3"):
        validate_demo_config(bad)


@pytest.mark.smoke
def test_validate_rejects_no_video_track():
    config = load_demo_config("y-is-time")
    bad = {
        **config,
        "tracks": [{"type": "audio", "clips": [{"id": "a", "assetPath": "x"}]}],
    }
    with pytest.raises(DemoValidationError, match="video"):
        validate_demo_config(bad)


@pytest.mark.smoke
def test_validate_rejects_invalid_axis_domain():
    config = load_demo_config("y-is-time")
    bad_lanes = list(config["lanes"])
    bad_lanes[0] = {**bad_lanes[0], "domain": "invalid_axis"}
    bad = {**config, "lanes": bad_lanes}
    with pytest.raises(DemoValidationError, match="domain"):
        validate_demo_config(bad)


@pytest.mark.smoke
def test_validate_rejects_non_broadcast_binding_at_tier_1():
    config = load_demo_config("y-is-time")
    bad_lanes = list(config["lanes"])
    bad_lanes[0] = {**bad_lanes[0], "binding_rule": "painted"}
    bad = {**config, "lanes": bad_lanes}
    with pytest.raises(DemoValidationError, match="broadcast"):
        validate_demo_config(bad)


@pytest.mark.smoke
def test_list_demos_returns_ordered():
    demos = list_demos()
    assert len(demos) == 3
    orders = [d.demo_order for d in demos]
    assert orders == sorted(orders)
    assert orders[0] == 1
    assert orders[-1] == 3


@pytest.mark.smoke
def test_build_cli_invocation_shape(tmp_path):
    fake_source = tmp_path / "input.mp4"
    fake_source.write_bytes(b"x")
    fake_out = tmp_path / "out.mp4"
    cmd = build_cli_invocation("y-is-time", fake_source, fake_out)
    assert "src/cli.py" in cmd
    assert "apply" in cmd
    assert str(fake_source) in cmd
    assert str(fake_out) in cmd
    assert "--project" in cmd
    # Project config path follows --project
    project_idx = cmd.index("--project")
    assert cmd[project_idx + 1].endswith("y-is-time.entropic.json")


@pytest.mark.smoke
def test_build_cli_invocation_missing_source_raises(tmp_path):
    out_path = tmp_path / "out.mp4"
    nonexistent = tmp_path / "nope.mp4"
    with pytest.raises(FileNotFoundError, match="source"):
        build_cli_invocation("y-is-time", nonexistent, out_path)


@pytest.mark.smoke
def test_build_cli_invocation_unknown_demo_raises(tmp_path):
    source = tmp_path / "input.mp4"
    source.write_bytes(b"x")
    out = tmp_path / "out.mp4"
    # The validation happens before file checks
    with pytest.raises((FileNotFoundError, ValueError)):
        build_cli_invocation("totally-fake-demo", source, out)


@pytest.mark.smoke
def test_y_is_time_uses_domain_y():
    """The whole point of demo 1."""
    config = load_demo_config("y-is-time")
    lanes = config["lanes"]
    assert any(lane.get("domain") == "y" for lane in lanes)
    spec = validate_demo_config(config)
    assert "y" in spec.primitive.lower()


@pytest.mark.smoke
def test_painted_blur_demo_loads():
    spec = validate_demo_config(load_demo_config("painted-blur"))
    assert spec.demo_order == 2 or "blur" in spec.name.lower()


@pytest.mark.smoke
def test_audio_lfo_stripes_uses_audio_track():
    config = load_demo_config("audio-lfo-stripes")
    audio_tracks = [t for t in config["tracks"] if t.get("type") == "audio"]
    assert len(audio_tracks) >= 1, "audio-lfo-stripes must have audio track"
