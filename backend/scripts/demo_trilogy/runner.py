"""Demo trilogy runner (PR #12).

Validates a `.entropic.json` demo config + builds the corresponding
`entropic-cli` invocation for rendering. Does NOT execute the CLI itself
— user runs `make q7-demo-render DEMO=y-is-time SOURCE=path/to/video.mp4`
on their Mac, with their own source assets, per the runbook at
`docs/runbooks/q7/q7-demo-trilogy.md`.

The .entropic.json format is the v3 Creatrix project shape. Demos use
SPEC-2 lowercase axis schema (DEC-Q7-015) — `domain: 'y'` etc. The
schema validator here enforces only the structural requirements; full
v3 validation happens in the engine on actual render.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

DEMOS_DIR = Path(__file__).resolve().parent
KNOWN_DEMOS = ("y-is-time", "painted-blur", "audio-lfo-stripes")


@dataclass(frozen=True)
class DemoSpec:
    name: str
    description: str
    primitive: str  # the paradigm primitive this demo reveals
    viewing_time_seconds: int
    demo_order: int
    bpm: int
    duration_frames: int
    raw_config: dict


class DemoValidationError(Exception):
    """Raised when a .entropic.json config fails structural validation."""


def load_demo_config(demo_name: str) -> dict:
    """Read one of the bundled demo configs from disk."""
    if demo_name not in KNOWN_DEMOS:
        raise ValueError(f"unknown demo {demo_name!r}; known: {sorted(KNOWN_DEMOS)}")
    path = DEMOS_DIR / f"{demo_name}.entropic.json"
    if not path.exists():
        raise FileNotFoundError(f"demo config missing: {path}")
    return json.loads(path.read_text())


def validate_demo_config(config: dict) -> DemoSpec:
    """Structural validation. Returns a DemoSpec on success."""
    required_top = {
        "version",
        "name",
        "description",
        "tracks",
        "lanes",
        "bpm",
        "demoMetadata",
    }
    missing = required_top - config.keys()
    if missing:
        raise DemoValidationError(f"missing top-level keys: {sorted(missing)}")

    version = str(config["version"])
    if not version.startswith("3."):
        raise DemoValidationError(f"demo config must be v3.x; got {version!r}")

    tracks = config["tracks"]
    if not isinstance(tracks, list) or not tracks:
        raise DemoValidationError("tracks must be a non-empty list")

    # First track is the video; must have at least one clip
    video_track = next((t for t in tracks if t.get("type") == "video"), None)
    if video_track is None:
        raise DemoValidationError("demo requires at least one video track")
    if not video_track.get("clips"):
        raise DemoValidationError("video track must have at least one clip")

    duration_frames = int(video_track["clips"][0].get("duration") or 0)
    if duration_frames <= 0:
        transport = config.get("transport") or {}
        duration_frames = int(transport.get("loopEnd") or 0)
    if duration_frames <= 0:
        raise DemoValidationError(
            "demo must specify either clips[0].duration or transport.loopEnd"
        )

    lanes = config["lanes"]
    if not isinstance(lanes, list):
        raise DemoValidationError("lanes must be a list")
    # Validate each lane's binding_rule + domain are SPEC-2 valid
    for lane in lanes:
        domain = lane.get("domain", "t")
        if domain not in ("t", "y", "x", "c", "f", "l"):
            raise DemoValidationError(
                f"lane domain must be one of t/y/x/c/f/l; got {domain!r}"
            )
        binding_rule = lane.get("binding_rule", "broadcast")
        if binding_rule != "broadcast":
            # Tier 1 demos use broadcast only (per DEC-Q7-009)
            raise DemoValidationError(
                f"Tier 1 demos require binding_rule='broadcast'; got {binding_rule!r}"
            )

    metadata = config["demoMetadata"]
    return DemoSpec(
        name=str(config["name"]),
        description=str(config["description"]),
        primitive=str(metadata.get("primitive", "")),
        viewing_time_seconds=int(metadata.get("viewingTimeSeconds", 30)),
        demo_order=int(config.get("demoOrder", 0)),
        bpm=int(config["bpm"]),
        duration_frames=duration_frames,
        raw_config=config,
    )


def build_cli_invocation(
    demo_name: str,
    source_path: Path,
    output_path: Path,
    *,
    python_executable: str = "python3",
) -> list[str]:
    """Build the `entropic-cli` command for rendering a demo.

    Returns a list suitable for `subprocess.run(...)`.

    The .entropic.json is consumed via a project-load path — entropic-cli
    can load a v3 project JSON via `apply <input> --project <json>`. PR
    #12 ships the invocation builder; the actual project-load path in
    entropic-cli may need light extension if it doesn't already support
    domain='y' lanes (will be confirmed when this PR runs end-to-end on
    user's Mac per the runbook).
    """
    config_path = DEMOS_DIR / f"{demo_name}.entropic.json"
    if not config_path.exists():
        raise FileNotFoundError(f"demo config missing: {config_path}")
    if not source_path.exists():
        raise FileNotFoundError(f"source asset missing: {source_path}")
    return [
        python_executable,
        "src/cli.py",
        "apply",
        str(source_path),
        "--project",
        str(config_path),
        "-o",
        str(output_path),
    ]


def list_demos() -> list[DemoSpec]:
    """Return DemoSpec for all known demos. Order matches demoOrder field."""
    specs = [validate_demo_config(load_demo_config(name)) for name in KNOWN_DEMOS]
    return sorted(specs, key=lambda s: s.demo_order)
