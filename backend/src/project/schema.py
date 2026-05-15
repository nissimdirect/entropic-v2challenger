"""Project file schema — serialize/deserialize .glitch project files."""

import json
import time
import uuid
from typing import TypeGuard

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

# F-0514-10 + F-0514-11: numeric range guards at validation layer.
# Type-only checks let pathological values through (NaN/Infinity/negative fps),
# which corrupted downstream rendering, ZMQ clocks, and audio mixers in UAT 2026-05-14.
FRAMERATE_MIN = 1
FRAMERATE_MAX = 240
RESOLUTION_MIN = 1
RESOLUTION_MAX = 8192
MASTER_VOLUME_MIN = 0.0
MASTER_VOLUME_MAX = 2.0
SEED_MIN = 0
SEED_MAX = 2**31 - 1
VALID_SAMPLE_RATES = {8000, 11025, 16000, 22050, 32000, 44100, 48000, 88200, 96000}


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
        else:
            errors.extend(_validate_settings_ranges(settings))

    if not isinstance(project.get("assets"), dict):
        errors.append("'assets' must be a dict")

    timeline = project.get("timeline")
    if not isinstance(timeline, dict):
        errors.append("'timeline' must be a dict")

    return errors


def _is_finite_number(x: object) -> TypeGuard[int | float]:
    """True for int or finite float (rejects NaN, +inf, -inf, bool-as-int)."""
    if isinstance(x, bool):
        return False
    if isinstance(x, int):
        return True
    if isinstance(x, float):
        return x == x and x not in (float("inf"), float("-inf"))
    return False


def _validate_settings_ranges(settings: dict) -> list[str]:
    """Range-check numeric settings. Per-field error so UI can pinpoint malformed input."""
    errors: list[str] = []

    fps = settings.get("frameRate")
    if not _is_finite_number(fps) or not (FRAMERATE_MIN <= fps <= FRAMERATE_MAX):
        errors.append(
            f"'frameRate' must be a finite number in [{FRAMERATE_MIN}, {FRAMERATE_MAX}], got {fps!r}"
        )

    sr = settings.get("audioSampleRate")
    if not isinstance(sr, int) or isinstance(sr, bool) or sr not in VALID_SAMPLE_RATES:
        errors.append(
            f"'audioSampleRate' must be one of {sorted(VALID_SAMPLE_RATES)}, got {sr!r}"
        )

    mv = settings.get("masterVolume")
    if not _is_finite_number(mv) or not (MASTER_VOLUME_MIN <= mv <= MASTER_VOLUME_MAX):
        errors.append(
            f"'masterVolume' must be a finite number in [{MASTER_VOLUME_MIN}, {MASTER_VOLUME_MAX}], got {mv!r}"
        )

    seed = settings.get("seed")
    if (
        not isinstance(seed, int)
        or isinstance(seed, bool)
        or not (SEED_MIN <= seed <= SEED_MAX)
    ):
        errors.append(
            f"'seed' must be an integer in [{SEED_MIN}, {SEED_MAX}], got {seed!r}"
        )

    res = settings.get("resolution")
    if not isinstance(res, list) or len(res) != 2:
        errors.append(f"'resolution' must be a [width, height] pair, got {res!r}")
    else:
        for axis, value in zip(("width", "height"), res):
            if not isinstance(value, int) or isinstance(value, bool):
                errors.append(f"'resolution.{axis}' must be an integer, got {value!r}")
            elif not (RESOLUTION_MIN <= value <= RESOLUTION_MAX):
                errors.append(
                    f"'resolution.{axis}' must be in [{RESOLUTION_MIN}, {RESOLUTION_MAX}], got {value}"
                )

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
