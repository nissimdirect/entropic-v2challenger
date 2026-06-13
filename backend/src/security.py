"""Security validation gates for Entropic v2."""

import json
import os
import re
from pathlib import Path

# SEC-5: Upload validation
MAX_UPLOAD_SIZE = 500 * 1024 * 1024  # 500 MB
ALLOWED_EXTENSIONS = {
    ".mp4",
    ".mov",
    ".avi",
    ".mkv",
    ".webm",
    ".png",
    ".jpg",
    ".jpeg",
    ".tiff",
    ".tif",
    ".webp",
    ".bmp",
    ".heic",
    ".heif",
    # Additional video containers
    ".mxf",
    ".ts",
    # Audio-only formats (for audio import)
    ".wav",
    ".mp3",
    ".m4a",
    ".aif",
    ".aiff",
    ".ogg",
    ".flac",
}

# SEC-6: Frame count cap (300K = ~2.7 hours at 30fps)
MAX_FRAME_COUNT = 300_000

# SEC-7: Chain depth cap
MAX_CHAIN_DEPTH = 10

# INJ-3: Composite layer count cap. The "4-voice" limit is a UX convention; the
# security boundary must be backend-enforced — 50×4K RGBA layers ≈ 16 GB → an
# OOM freeze on a 16 GB Mac. Rejected at _handle_render_composite BEFORE the
# per-layer decode loop.
MAX_COMPOSITE_LAYERS = 50

# P5a.2 (INSTRUMENTS.md §10 P1-1): per-render voice cap. The voice spine keys
# the composite per-layer state cache by `voice:{voice_id}` so independent
# voices on the same clip keep independent stateful-effect state. The 4-voice
# polyphony limit is a real backend boundary here (not just UX): every active
# voice is a full per-layer chain run + cached state dict, so an unbounded
# voice_id count would grow the state cache without limit. Enforced in
# _handle_render_composite BEFORE the per-layer decode loop, mirroring INJ-3.
MAX_TOTAL_VOICES_PER_RENDER = 4

# P5a.4 (INSTRUMENTS.md §10 P1-2): cap the serialized performance event list an
# export may replay. A capture buffer of N events crosses the IPC trust boundary
# as one JSON payload; ~48 B/event × 10_000 ≈ 480 KB, comfortably one ZMQ
# message. Over-cap is REJECTED at export start (never truncated — truncation
# would silently drop trigger/release events and desync the replay). Enforced in
# _handle_export_start BEFORE the export thread is spawned, mirroring the
# enforce-before-decode posture of INJ-3 / MAX_TOTAL_VOICES_PER_RENDER.
MAX_CAPTURE_EVENTS = 10_000

# Voice ids cross the IPC trust boundary and are used directly as state-cache
# keys (`voice:{voice_id}`). Constrain to a conservative charset/length so a
# hand-edited / hostile project cannot inject path-traversal-ish or
# unbounded-length keys into the cache. Mirrors the numeric-trust-boundary rule
# for the string case.
# Colon is RESERVED: the handler prepends "voice:" as the namespace prefix, so a
# voice_id must not itself contain ":" (red-team HT-2 — prevents "voice:voice:x"
# ambiguity and any future split-on-colon key parsing).
VOICE_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
MAX_VOICE_ID_LENGTH = 128

# P2.3 (export parity): bound the per-frame automation-override map an export may
# replay. The frontend pre-resolves automation per output frame and ships a
# {frameIndex: {paramPath: value}} map across the IPC trust boundary. Cap the
# number of frame entries (one per source frame; a 300_000-frame project is the
# MAX_FRAME_COUNT ceiling, but the override map only carries frames that HAVE
# overrides) and the per-frame override count. Over-cap is REJECTED at export
# start (enforce-before-decode); malformed values (NaN/inf) are rejected, never
# silently coerced (numeric-trust-boundary rule).
MAX_AUTOMATION_FRAMES = MAX_FRAME_COUNT  # one entry per source frame, at most
MAX_AUTOMATION_OVERRIDES_PER_FRAME = 256


# P2.3: the operator types the signal engine understands. An export payload
# carrying an unknown operator type is a hand-edited / hostile project and is
# REJECTED at export start (the engine would silently evaluate it to 0.0; the
# packet's negative test requires a loud structured error instead).
VALID_OPERATOR_TYPES = frozenset(
    {
        "lfo",
        "envelope",
        "step_sequencer",
        "audio_follower",
        "video_analyzer",
        "fusion",
    }
)


def validate_upload(path: str) -> list[str]:
    """Validate an uploaded file path. Returns list of errors (empty = valid).

    Checks (SEC-5):
    - File exists
    - Not a symlink
    - Extension in whitelist
    - File size <= 500 MB
    - Filename is safe (no path traversal)
    """
    errors: list[str] = []
    p = Path(path)

    # Path traversal check — resolved path must be under user home
    resolved = str(p.resolve())
    if not resolved.startswith(str(Path.home())):
        errors.append("Path must be within user home directory")
        return errors

    # Existence
    if not p.exists():
        errors.append(f"File not found: {path}")
        return errors

    # Symlink check
    if p.is_symlink():
        errors.append("Symlinks are not allowed")
        return errors

    # Extension whitelist
    ext = p.suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        errors.append(
            f"Extension '{ext}' not allowed. Allowed: {sorted(ALLOWED_EXTENSIONS)}"
        )

    # File size
    size = p.stat().st_size
    if size > MAX_UPLOAD_SIZE:
        size_mb = size / (1024 * 1024)
        errors.append(
            f"File too large: {size_mb:.1f} MB (max {MAX_UPLOAD_SIZE // (1024 * 1024)} MB)"
        )

    # Filename safety — reject path traversal components
    name = p.name
    if ".." in name or "/" in name or "\\" in name or "\x00" in name:
        errors.append(f"Unsafe filename: {name}")

    return errors


def resolve_safe_path(path: str) -> tuple[Path | None, list[str]]:
    """Validate + resolve a path for trusted downstream use.

    Returns (resolved_path, errors). When errors are non-empty, resolved_path
    is None and the caller MUST refuse to use `path` at all. When errors is
    empty, resolved_path is the realpath-resolved Path that is safe to pass
    to downstream tools (avoids TOCTOU between validate and decode).
    """
    errors = validate_upload(path)
    if errors:
        return None, errors
    try:
        resolved = Path(path).resolve(strict=True)
    except (OSError, RuntimeError) as e:
        return None, [f"Path resolution failed: {e}"]
    return resolved, []


# Known audio file magic bytes (first 12 bytes). Extension is not enough —
# renamed MP4→.wav would bypass a pure extension check.
_AUDIO_MAGIC_PATTERNS: tuple[tuple[bytes, int], ...] = (
    (b"RIFF", 0),  # WAV
    (b"ID3", 0),  # MP3 with ID3 tag
    (b"OggS", 0),  # OGG
    (b"fLaC", 0),  # FLAC
    (b"FORM", 0),  # AIFF
    (b"ftyp", 4),  # M4A/AAC (after 4-byte size prefix)
)
# MP3 frame-sync (tag-less MP3): first byte 0xFF, second byte 0xE0..0xFF
# with additional constraints. Handled separately.


def is_audio_magic(path: str) -> bool:
    """Best-effort magic-byte check for audio files.

    Returns True if the file's first bytes match a known audio signature.
    False for unrecognized files — caller should fall back to PyAV's probe.
    """
    try:
        with open(path, "rb") as f:
            head = f.read(12)
    except (OSError, PermissionError):
        return False
    if len(head) < 4:
        return False
    for pattern, offset in _AUDIO_MAGIC_PATTERNS:
        end = offset + len(pattern)
        if len(head) >= end and head[offset:end] == pattern:
            return True
    # MP3 without ID3: frame-sync 0xFFE0..0xFFFF
    if head[0] == 0xFF and (head[1] & 0xE0) == 0xE0:
        return True
    return False


def validate_frame_count(count: int) -> list[str]:
    """Validate frame count against SEC-6 cap. Returns list of errors."""
    errors: list[str] = []
    if count > MAX_FRAME_COUNT:
        errors.append(f"Frame count {count} exceeds maximum {MAX_FRAME_COUNT} (SEC-6)")
    return errors


ALLOWED_OUTPUT_EXTENSIONS = {".mp4", ".mov", ".mkv", ".webm", ".gif", ".png"}
BLOCKED_OUTPUT_PREFIXES = (
    "/System",
    "/Library",
    "/usr",
    "/bin",
    "/sbin",
    "/etc",
    "/private/var",
    "/private/etc",
)


def validate_output_path(path: str) -> list[str]:
    """Validate an export output path. Returns list of errors (empty = valid).

    Checks:
    - Path is absolute
    - Not a system directory
    - Extension in whitelist
    - Parent directory exists and is writable
    - Filename is safe (no traversal)
    """
    errors: list[str] = []
    p = Path(path)

    if not p.is_absolute():
        errors.append("Output path must be absolute")
        return errors

    resolved = str(p.resolve())
    for prefix in BLOCKED_OUTPUT_PREFIXES:
        if resolved.startswith(prefix):
            errors.append(f"Cannot write to system directory: {prefix}")
            return errors

    ext = p.suffix.lower()
    if ext not in ALLOWED_OUTPUT_EXTENSIONS:
        errors.append(f"Output extension '{ext}' not allowed.")

    parent = p.parent
    if not parent.exists():
        errors.append(f"Output directory does not exist: {parent}")
    elif not os.access(str(parent), os.W_OK):
        errors.append(f"Output directory is not writable: {parent}")

    name = p.name
    if ".." in name or "/" in name or "\\" in name or "\x00" in name:
        errors.append(f"Unsafe output filename: {name}")

    return errors


def validate_output_directory(path: str) -> list[str]:
    """Validate an export output directory (e.g. for image sequences). Returns list of errors.

    Unlike validate_output_path, this does NOT require a file extension.
    Checks:
    - Path is absolute
    - Not a system directory (BLOCKED_OUTPUT_PREFIXES)
    - Under the user's home directory
    """
    errors: list[str] = []
    p = Path(path)

    if not p.is_absolute():
        errors.append("Output path must be absolute")
        return errors

    resolved = str(p.resolve())

    # Must be under user home
    if not resolved.startswith(str(Path.home())):
        errors.append("Output directory must be within user home directory")
        return errors

    for prefix in BLOCKED_OUTPUT_PREFIXES:
        if resolved.startswith(prefix):
            errors.append(f"Cannot write to system directory: {prefix}")
            return errors

    return errors


# P2.2c: the terminal composite is compositing metadata, not a processed
# effect — the pipeline strips it before its own depth check (pipeline.py:147).
# SEC-7 must count the same way, or a full 10-effect chain + terminal composite
# (length 11) is falsely rejected at the IPC boundary, silently capping users
# at 9 real effects. (red-team RT-1)
_COMPOSITE_EFFECT_ID = "composite"


def _effective_depth(chain: list) -> int:
    if (
        chain
        and isinstance(chain[-1], dict)
        and chain[-1].get("effect_id") == _COMPOSITE_EFFECT_ID
    ):
        return len(chain) - 1
    return len(chain)


def validate_chain_depth(chain: list) -> list[str]:
    """Validate effect chain depth against SEC-7 cap. Returns list of errors."""
    errors: list[str] = []
    depth = _effective_depth(chain)
    if depth > MAX_CHAIN_DEPTH:
        errors.append(f"Chain depth {depth} exceeds maximum {MAX_CHAIN_DEPTH} (SEC-7)")
    return errors


def validate_composite_layer_count(count: int) -> list[str]:
    """Validate composite layer count against the INJ-3 cap. Returns errors."""
    errors: list[str] = []
    if count > MAX_COMPOSITE_LAYERS:
        errors.append(
            f"Composite layer count {count} exceeds maximum "
            f"{MAX_COMPOSITE_LAYERS} (INJ-3)"
        )
    return errors


def validate_voice_layers(layers: list) -> list[str]:
    """Validate voice_id-bearing composite layers (P5a.2, INSTRUMENTS.md §10 P1-1).

    A "voice layer" is any layer dict carrying a non-None ``voice_id``. Layers
    without a ``voice_id`` are the legacy / B1 / PR #167 shape and are ignored
    here entirely (back-compat: those frontends send no voice_id).

    Returns a list of error strings (empty == valid). Rejects, BEFORE any
    decode runs:
    - more than ``MAX_TOTAL_VOICES_PER_RENDER`` voice-keyed layers
    - a ``voice_id`` that is not a str, or doesn't match ``VOICE_ID_PATTERN``
      (path-traversal-ish chars, oversize strings, empty strings)
    - a ``voice_id`` that appears on more than one layer in the same render
      (duplicate keys would collide in the per-voice state cache)

    Only the first failure of each kind is reported (fail-closed; the caller
    rejects the whole render on any non-empty result).
    """
    errors: list[str] = []
    if not isinstance(layers, list):
        # The caller already type-checks `layers`, but stay defensive — this is
        # a trust boundary.
        return ["layers must be a list"]

    seen: set[str] = set()
    voice_count = 0
    for layer in layers:
        if not isinstance(layer, dict):
            continue
        voice_id = layer.get("voice_id")
        if voice_id is None:
            continue  # legacy / non-voice layer — not this validator's concern

        voice_count += 1

        if not isinstance(voice_id, str):
            errors.append(f"voice_id must be a string (got {type(voice_id).__name__})")
            continue
        if not VOICE_ID_PATTERN.match(voice_id):
            # Truncate in the message so a 4KB hostile id can't bloat the log.
            shown = voice_id[:32] + ("…" if len(voice_id) > 32 else "")
            errors.append(
                f"voice_id {shown!r} is malformed (must match "
                f"[A-Za-z0-9:_-]{{1,{MAX_VOICE_ID_LENGTH}}})"
            )
            continue
        if voice_id in seen:
            errors.append(
                f"duplicate voice_id {voice_id!r} in one render "
                "(would collide in the per-voice state cache)"
            )
            continue
        seen.add(voice_id)

    if voice_count > MAX_TOTAL_VOICES_PER_RENDER:
        errors.append(
            f"Voice count {voice_count} exceeds maximum "
            f"{MAX_TOTAL_VOICES_PER_RENDER} (MAX_TOTAL_VOICES_PER_RENDER)"
        )

    return errors


def validate_capture_events(events: object) -> list[str]:
    """Validate a serialized performance event list for export replay (P5a.4).

    Trust boundary: the event list arrives as an IPC payload and is replayed by
    ``evaluate_voices`` to reconstruct voice layers. This validator enforces the
    structural / size bounds BEFORE the export thread spawns (enforce-before-
    decode); the per-event field ranges are additionally re-checked inside
    ``evaluate_voices`` (which silently drops malformed events, mirroring
    ``voiceFSM.ts`` ``isValidEvent``). Here we REJECT the whole export — a
    hand-edited / hostile project must not start a partial render.

    Rejects:
    - a non-list ``events``
    - more than ``MAX_CAPTURE_EVENTS`` events (reject, never truncate)
    - any event that is not a dict, or whose replay-key fields are malformed:
      non-finite / non-integer / negative ``frameIndex`` or ``eventIndex``,
      out-of-range ``note`` / ``velocity`` (0–127), unknown ``kind``.

    Only the first malformed event is reported (fail-closed). Returns a list of
    error strings (empty == valid).
    """
    errors: list[str] = []
    if not isinstance(events, list):
        return ["performance.events must be a list"]

    if len(events) > MAX_CAPTURE_EVENTS:
        errors.append(
            f"Event list length {len(events)} exceeds maximum "
            f"{MAX_CAPTURE_EVENTS} (MAX_CAPTURE_EVENTS)"
        )
        return errors

    valid_kinds = {"trigger", "release", "choke", "panic"}
    for i, ev in enumerate(events):
        if not isinstance(ev, dict):
            errors.append(f"event[{i}] must be a dict (got {type(ev).__name__})")
            return errors
        fi = ev.get("frameIndex")
        ei = ev.get("eventIndex")
        note = ev.get("note")
        vel = ev.get("velocity")
        kind = ev.get("kind")
        # bool is an int subclass — exclude it explicitly so True/False can't
        # masquerade as a frame index.
        if isinstance(fi, bool) or not isinstance(fi, int) or fi < 0:
            errors.append(f"event[{i}].frameIndex must be an int >= 0, got {fi!r}")
            return errors
        if isinstance(ei, bool) or not isinstance(ei, int) or ei < 0:
            errors.append(f"event[{i}].eventIndex must be an int >= 0, got {ei!r}")
            return errors
        if not _is_finite_int_in_range(note, 0, 127):
            errors.append(f"event[{i}].note must be in [0,127], got {note!r}")
            return errors
        if not _is_finite_int_in_range(vel, 0, 127):
            errors.append(f"event[{i}].velocity must be in [0,127], got {vel!r}")
            return errors
        if kind not in valid_kinds:
            errors.append(f"event[{i}].kind {kind!r} is unknown")
            return errors
        # red-team HT-1: trigger/release/choke index voice state by instrumentId
        # via a direct subscript in evaluate_voices — a missing/non-string id
        # raises KeyError mid-replay (export dies with an unactionable error).
        # Reject at the boundary where the message is useful. (panic is global,
        # no instrumentId required.)
        if kind in ("trigger", "release", "choke"):
            iid = ev.get("instrumentId")
            if not isinstance(iid, str) or not iid:
                errors.append(
                    f"event[{i}].instrumentId must be a non-empty string for "
                    f"kind {kind!r}, got {iid!r}"
                )
                return errors

    return errors


def _is_finite_number(x: object) -> bool:
    """True iff x is a finite real number (not bool, not NaN/inf)."""
    if isinstance(x, bool):
        return False
    if isinstance(x, int):
        return True
    if isinstance(x, float):
        return x == x and x not in (float("inf"), float("-inf"))
    return False


def validate_export_modulation(
    operators: object, automation_by_frame: object
) -> list[str]:
    """Validate the P2.3 export-parity modulation payloads at export start.

    Trust boundary: both arrive as IPC payloads and drive per-frame modulation in
    the export loop (``SignalEngine.evaluate_all`` + ``apply_modulation``). This
    enforces structural + numeric bounds BEFORE the export thread spawns
    (enforce-before-decode), so a hand-edited / hostile project fails LOUDLY with
    a structured error and leaves no partial file — never a silent partial render.

    Rejects (first offender only, fail-closed):
    - ``operators`` not a list (when present)
    - more than ``MAX_OPERATORS`` operators
    - an operator that is not a dict, lacks a string ``id``, or carries an
      unknown ``type`` (not in ``VALID_OPERATOR_TYPES``)
    - ``automation_by_frame`` not a dict (when present)
    - more than ``MAX_AUTOMATION_FRAMES`` frame entries
    - a frame key that is not a non-negative integer (or its string form)
    - a per-frame map that is not a dict, exceeds
      ``MAX_AUTOMATION_OVERRIDES_PER_FRAME`` entries, or carries a non-finite
      (NaN/inf) override value

    Returns a list of error strings (empty == valid). ``None`` payloads pass.
    """
    # Imported lazily to avoid a security.py -> modulation import cycle.
    from modulation.engine import MAX_OPERATORS

    errors: list[str] = []

    if operators is not None:
        if not isinstance(operators, list):
            return ["operators must be a list"]
        if len(operators) > MAX_OPERATORS:
            return [
                f"operator list length {len(operators)} exceeds maximum "
                f"{MAX_OPERATORS} (MAX_OPERATORS)"
            ]
        for i, op in enumerate(operators):
            if not isinstance(op, dict):
                return [f"operator[{i}] must be a dict (got {type(op).__name__})"]
            op_id = op.get("id")
            if not isinstance(op_id, str) or not op_id:
                return [f"operator[{i}].id must be a non-empty string, got {op_id!r}"]
            op_type = op.get("type")
            if op_type not in VALID_OPERATOR_TYPES:
                return [f"operator[{i}].type {op_type!r} is unknown"]

    if automation_by_frame is not None:
        if not isinstance(automation_by_frame, dict):
            return ["automation_by_frame must be an object"]
        if len(automation_by_frame) > MAX_AUTOMATION_FRAMES:
            return [
                f"automation_by_frame has {len(automation_by_frame)} frame entries, "
                f"exceeds maximum {MAX_AUTOMATION_FRAMES} (MAX_AUTOMATION_FRAMES)"
            ]
        for fkey, fmap in automation_by_frame.items():
            # Frame keys cross JSON as strings; accept int or digit-string >= 0.
            if isinstance(fkey, bool) or not (
                (isinstance(fkey, int) and fkey >= 0)
                or (isinstance(fkey, str) and fkey.isdigit())
            ):
                return [
                    f"automation_by_frame key {fkey!r} must be a non-negative "
                    f"integer frame index"
                ]
            if not isinstance(fmap, dict):
                return [
                    f"automation_by_frame[{fkey!r}] must be an object "
                    f"(got {type(fmap).__name__})"
                ]
            if len(fmap) > MAX_AUTOMATION_OVERRIDES_PER_FRAME:
                return [
                    f"automation_by_frame[{fkey!r}] has {len(fmap)} overrides, "
                    f"exceeds maximum {MAX_AUTOMATION_OVERRIDES_PER_FRAME}"
                ]
            for pkey, pval in fmap.items():
                if not isinstance(pkey, str) or not pkey:
                    return [
                        f"automation_by_frame[{fkey!r}] key {pkey!r} must be a "
                        f"non-empty 'effectId.paramKey' string"
                    ]
                if not _is_finite_number(pval):
                    return [
                        f"automation_by_frame[{fkey!r}][{pkey!r}] must be a finite "
                        f"number, got {pval!r}"
                    ]

    return errors


def _is_finite_int_in_range(x: object, lo: int, hi: int) -> bool:
    """True iff x is a finite real number (not bool, not NaN/inf) within [lo, hi]."""
    if isinstance(x, bool):
        return False
    if isinstance(x, int):
        return lo <= x <= hi
    if isinstance(x, float):
        if x != x or x in (float("inf"), float("-inf")):
            return False
        return lo <= x <= hi
    return False


# --- PII stripping for Sentry and crash dumps ---

_HOME = os.path.expanduser("~")
_USERNAME = os.path.basename(_HOME)
_PATH_PATTERN = re.compile(r"/Users/[^/\s]+|/home/[^/\s]+|C:\\Users\\[^\\\s]+")
_SENSITIVE_KEYS = {"_token", "token", "auth", "key", "secret", "password", "dsn"}


def _scrub_dict(d: dict):
    """Redact values for keys that look sensitive."""
    for key in list(d.keys()):
        if any(s in key.lower() for s in _SENSITIVE_KEYS):
            d[key] = "<REDACTED>"


def strip_pii(event: dict, hint: dict) -> dict:
    """Sentry before_send hook. Strips file paths and auth tokens.

    Also usable for crash dump sanitization.
    """
    event_str = json.dumps(event)
    # Replace OS username and home path
    event_str = event_str.replace(_HOME, "<HOME>")
    event_str = event_str.replace(_USERNAME, "<USER>")
    event_str = _PATH_PATTERN.sub("<REDACTED_PATH>", event_str)
    event = json.loads(event_str)

    # Strip sensitive keys from extra/context/tags
    _scrub_dict(event.get("extra", {}))
    for ctx in event.get("contexts", {}).values():
        if isinstance(ctx, dict):
            _scrub_dict(ctx)
    return event
