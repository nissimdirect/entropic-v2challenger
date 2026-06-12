"""Project file schema — serialize/deserialize .glitch project files."""

import json
import re
import time
import uuid
from typing import TypeGuard

CURRENT_VERSION = "3.0.0"

# P2.2a (slice 3c, Decision D1 clean break): the v3 schema removed track-level
# opacity/blendMode in favour of a terminal CompositeEffect. There is NO migration
# code (single-tester app, clean-break policy). Projects whose major version is
# below 3 are rejected LOUDLY with this exact message — never crash, never a silent
# partial load. The error string is contractual; tests assert it verbatim.
MIN_SUPPORTED_MAJOR = 3
V2_UNSUPPORTED_MESSAGE = "v2 projects unsupported — start a new project"

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

# F-0514-12: structural hardening — mirrors the frontend validateProjectStructure
# walk(). Project files are user-supplied data and routinely shared (collab,
# presets, social), so deserialize is an attacker-controlled boundary. The
# frontend defends with a depth/array/forbidden-key walk; the backend was
# trusting the data after type-check only. These limits MUST stay consistent
# with the corresponding constants in `frontend/src/renderer/project-persistence.ts`.
MAX_JSON_DEPTH = 32
MAX_KEYS_PER_NODE = 1024
MAX_ARRAY_LENGTH = 10_000
MAX_VERSION_STRING_LENGTH = 16
# RT-4: case-INsensitive match so weaponized `.glitch` files can't bypass
# the prototype-pollution defense with `__PROTO__`, `Constructor`, etc.
# Python dicts don't have prototype pollution themselves, but if this data
# ever flows through a JS-side `lodash.merge` or `Object.assign` recursive
# helper, mixed-case bypass becomes a live risk. Cost is one line.
FORBIDDEN_KEY_PATTERN = re.compile(
    r"^(__proto__|constructor|prototype)$", re.IGNORECASE
)


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


def _walk_structure(node: object, depth: int, path: str) -> str | None:
    """Recursive defense-in-depth walk. Returns the first violation or None.

    Mirrors `walk` in frontend project-persistence.ts. Catches:
    - excessive nesting (RecursionError risk)
    - huge arrays (memory exhaustion)
    - object-key bloat (memory + downstream key-lookup pathologies)
    - forbidden keys (`__proto__`, `constructor`, `prototype`) — same surface
      JS prototype-pollution defends; harmless but a signal of weaponized file
    """
    if depth > MAX_JSON_DEPTH:
        return f"JSON nesting depth exceeds {MAX_JSON_DEPTH} at {path}"
    if isinstance(node, list):
        if len(node) > MAX_ARRAY_LENGTH:
            return f"Array length {len(node)} exceeds {MAX_ARRAY_LENGTH} at {path}"
        for i, item in enumerate(node):
            reason = _walk_structure(item, depth + 1, f"{path}[{i}]")
            if reason is not None:
                return reason
        return None
    if isinstance(node, dict):
        if len(node) > MAX_KEYS_PER_NODE:
            return f"Object key count {len(node)} exceeds {MAX_KEYS_PER_NODE} at {path}"
        for key in node:
            if isinstance(key, str) and FORBIDDEN_KEY_PATTERN.match(key):
                return f"Forbidden key {key!r} at {path}"
        for key, value in node.items():
            reason = _walk_structure(value, depth + 1, f"{path}.{key}")
            if reason is not None:
                return reason
    return None


def _major_version(version: object) -> int | None:
    """Parse the leading integer of a 'MAJOR.MINOR.PATCH' version string.

    Returns the major version as an int, or None when the value is not a string
    with a leading integer component (caller treats None as 'unparseable').
    """
    if not isinstance(version, str):
        return None
    head = version.split(".", 1)[0].strip()
    # Red-team RT-2: int("v2") raised and the gate was SKIPPED — a crafted
    # "v2.0.0" version string evaded the v2 clean-break rejection. The head
    # must be strictly ASCII digits; anything else is unparseable.
    if not head or any(c not in "0123456789" for c in head):
        return None
    try:
        return int(head)
    except ValueError:
        return None


def validate(project: dict) -> list[str]:
    """Validate a project dict. Returns list of error strings (empty = valid)."""
    errors = []

    # F-0514-12: structural defense BEFORE type-checks. A hostile file with
    # huge arrays or deep nesting would crash later checks before reaching
    # the user-facing error message.
    version = project.get("version") if isinstance(project, dict) else None
    if isinstance(version, str) and len(version) > MAX_VERSION_STRING_LENGTH:
        errors.append(f"'version' field exceeds {MAX_VERSION_STRING_LENGTH} chars")
        return errors

    structure_error = _walk_structure(project, 0, "$")
    if structure_error is not None:
        errors.append(structure_error)
        return errors

    # P2.2a (slice 3c, Decision D1): v3 clean break. A parseable major version
    # below 3 (e.g. the legacy "2.0.0" track-level-compositing schema) is rejected
    # LOUDLY with the contractual message — no migration, no silent partial load.
    # An unparseable/missing version falls through to the existing type/required
    # checks below (those produce their own clear errors).
    major = _major_version(version)
    if major is not None and major < MIN_SUPPORTED_MAJOR:
        errors.append(V2_UNSUPPORTED_MESSAGE)
    # Red-team RT-2 (second half): a version KEY that exists but cannot be
    # parsed ("v2.0.0", "x3.0.0") must REJECT — skipping the gate let forged
    # version strings carry pre-v3 shapes past the clean break.
    if major is None and isinstance(project.get("version"), str):
        errors.append(f"Invalid version format: {project['version'][:16]!r}")
        return errors

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
