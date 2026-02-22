"""Project file schema — serialize/deserialize .glitch project files."""

import json
import time
import uuid

CURRENT_VERSION = "2.0.0"

REQUIRED_KEYS = {
    "version",
    "id",
    "created",
    "modified",
    "author",
    "settings",
    "assets",
    "timeline",
}
REQUIRED_SETTINGS = {
    "resolution",
    "frameRate",
    "audioSampleRate",
    "masterVolume",
    "seed",
}


def new_project(
    author: str = "", resolution: tuple[int, int] = (1920, 1080), fps: int = 30
) -> dict:
    """Create a new empty project with defaults."""
    now = time.time()
    return {
        "version": CURRENT_VERSION,
        "id": str(uuid.uuid4()),
        "created": now,
        "modified": now,
        "author": author,
        "settings": {
            "resolution": list(resolution),
            "frameRate": fps,
            "audioSampleRate": 48000,
            "masterVolume": 1.0,
            "seed": 0,
        },
        "assets": {},
        "timeline": {
            "duration": 0.0,
            "tracks": [],
            "markers": [],
            "loopRegion": None,
        },
    }


def validate(project: dict) -> list[str]:
    """Validate a project dict. Returns list of error strings (empty = valid)."""
    errors = []

    missing = REQUIRED_KEYS - set(project.keys())
    if missing:
        errors.append(f"Missing top-level keys: {missing}")
        return errors  # Can't validate further

    if not isinstance(project["version"], str):
        errors.append("'version' must be a string")

    if not isinstance(project["id"], str):
        errors.append("'id' must be a string")

    settings = project.get("settings", {})
    if not isinstance(settings, dict):
        errors.append("'settings' must be a dict")
    else:
        missing_settings = REQUIRED_SETTINGS - set(settings.keys())
        if missing_settings:
            errors.append(f"Missing settings keys: {missing_settings}")

    if not isinstance(project.get("assets"), dict):
        errors.append("'assets' must be a dict")

    timeline = project.get("timeline")
    if not isinstance(timeline, dict):
        errors.append("'timeline' must be a dict")

    return errors


def serialize(project: dict) -> str:
    """Serialize project to JSON string."""
    project["modified"] = time.time()
    return json.dumps(project, indent=2)


def deserialize(data: str) -> dict:
    """Deserialize JSON string to project dict. Raises ValueError on invalid JSON or schema."""
    try:
        project = json.loads(data)
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON: {e}") from e

    errors = validate(project)
    if errors:
        raise ValueError(f"Invalid project: {'; '.join(errors)}")

    return project
