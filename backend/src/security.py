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

# P4.1 (qa-redteam M2): per-project operator count hard cap.
# Mirrored in frontend/src/shared/limits.ts:LIMITS.MAX_OPERATORS (= 64).
# The backend cap is authoritative; the frontend cap is a pre-flight guard.
MAX_OPERATORS_PER_PROJECT = 64  # qa-redteam M2

# P5b.21 (B9 tensor mod-routing): per-project cap on the TOTAL number of
# modulation edges (operator mappings) a loaded project may declare. DISTINCT
# from the per-operator mapping cap (LIMITS.MAX_MAPPINGS_PER_OPERATOR = 32) and
# from the macro-route fan-out cap (MAX_TOTAL_EDGES, frontend instruments): this
# is the project-wide SUM across all operators. A hand-edited / hostile project
# crossing the load trust boundary with a runaway mapping count (e.g. tens of
# thousands of axis-routed edges, each now carrying srcAxis/dstAxis/bindingRule)
# is REJECTED at the loader (project/schema.py), never buffered into the engine.
# Bound = MAX_OPERATORS_PER_PROJECT (64) × MAX_MAPPINGS_PER_OPERATOR (32) = 2048.
MAX_MOD_EDGES_TOTAL = 64 * 32  # 2048

# P5a.2 (INSTRUMENTS.md §10 P1-1): per-render voice cap. The voice spine keys
# the composite per-layer state cache by `voice:{voice_id}` so independent
# voices on the same clip keep independent stateful-effect state. The 4-voice
# polyphony limit is a real backend boundary here (not just UX): every active
# voice is a full per-layer chain run + cached state dict, so an unbounded
# voice_id count would grow the state cache without limit. Enforced in
# _handle_render_composite BEFORE the per-layer decode loop, mirroring INJ-3.
MAX_TOTAL_VOICES_PER_RENDER = 4

# B5.1 (INSTRUMENTS-BUILD-PLAN.md §B5): Sample Rack grouping (composite-tree)
# recursion caps. A pad may hold a BRANCH (a nested RackNode), making the render
# recursive ("one note fires an ensemble"). These are the recursion trust
# boundary — a hand-edited / hostile project carrying a deeply-nested or
# fan-out-heavy tree must be REJECTED (not OOM / infinite-recurse). Enforced
# fail-closed in engine/composite_tree.validate_composite_tree BEFORE any decode
# (enforce-before-decode, mirroring INJ-3 / MAX_TOTAL_VOICES_PER_RENDER), and
# re-checked in expand_group_layer during the recursive walk.
#
# MAX_BRANCH_DEPTH: levels of nested branches under the top-level rack (root =
# depth 0; one branch down = depth 1). Bounds the deepest branch; a leaf pad does
# NOT increment depth.
#
# MAX_BRANCH_VOICES_PER_RENDER: the tree-wide SUM of leaf-voice layers (all
# branches + leaves). SEPARATE from the flat MAX_TOTAL_VOICES_PER_RENDER (4) so
# the flat per-track polyphony cap is UNCHANGED — a flat rack still emits ≤4
# voices per pad exactly as today; only a grouped render uses this higher ceiling.
# MIRROR of frontend types.ts (MAX_BRANCH_DEPTH / MAX_BRANCH_VOICES_PER_RENDER).
MAX_BRANCH_DEPTH = 4
MAX_BRANCH_VOICES_PER_RENDER = 64

# B8.1 (INSTRUMENTS-BUILD-PLAN.md §B8): Granulator instrument grain cap.
# Each active grain is a descriptor computed per-frame; an uncapped density
# would grow quadratically with frame rate. Hard cap enforced in
# instruments/granulator_instrument.py BEFORE any descriptor allocation,
# mirroring the enforce-before-decode posture of INJ-3 / MAX_TOTAL_VOICES_PER_RENDER.
MAX_GRAINS = 256

# B6.1 (INSTRUMENTS-BUILD-PLAN.md §B6): Frame-Bank (wavetable) instrument caps.
# A Frame-Bank is an indexed BANK of frames a modulatable `position` (0..1) scans
# through. The MEMORY CRUX: 256 slots × 4K RGBA ≈ 8.5 GB if every frame is decoded
# resident — instant OOM freeze on a 16 GB Mac. Two SEPARATE bounds:
#
#   MAX_FRAMEBANK_SLOTS — caps how many slots a bank may DECLARE. Bounds the slot
#   list crossing the IPC trust boundary; a hand-edited / hostile project carrying
#   100k slots is REJECTED at the boundary (enforce-before-decode), never buffered.
#
#   FRAMEBANK_BYTE_BUDGET_{MIN,MAX} — the resident-DECODED-frame ceiling in BYTES
#   is clamped to this hard range. The model's `byteBudget` is a REQUEST; the
#   renderer (DecodedFrameCache) is the AUTHORITY — it evicts LRU / serves a
#   downscale-proxy to honor the clamped budget. The hard MAX (2 GB) is the true
#   OOM guard; the MIN (16 MB) keeps the cache big enough for at least a couple of
#   4K frames so blend always has its two adjacent frames + a downscale headroom.
#   This is a NEW bound — `_max_readers=10` caps open FILE HANDLES, not decoded RAM.
MAX_FRAMEBANK_SLOTS = 256
FRAMEBANK_BYTE_BUDGET_MIN = 16 * 1024 * 1024  # 16 MB
FRAMEBANK_BYTE_BUDGET_MAX = 2 * 1024 * 1024 * 1024  # 2 GB
FRAMEBANK_VALID_INTERP = frozenset({"nearest", "blend", "flow"})

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
        # P4.1: new types — visible but available: false; engine evaluates to 0.0
        "kentaroCluster",
        "sidechain",
        "gate",
        "midiEnvStutter",
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


def validate_frame_bank(inst: object) -> tuple[dict | None, list[str]]:
    """Validate + sanitize ONE Frame-Bank instrument at the render/IPC boundary.

    Trust boundary (B6.1): the frameBank dict arrives as part of the export
    `performance` payload and drives footage decode through the byte-budget cache.
    This enforces caps + numeric guards BEFORE any decode (enforce-before-decode),
    and RETURNS a sanitized copy so the renderer uses clamped values, never the
    raw request:

      - `position` is CLAMPED to [0,1] and finite-guarded (NaN/inf/2.0 → clamped).
        A non-numeric position falls back to 0.0 (never raises mid-decode).
      - `byteBudget` is CLAMPED to [FRAMEBANK_BYTE_BUDGET_MIN, MAX]. The model's
        value is a REQUEST; this is the hard OOM ceiling. Non-numeric / NaN / inf
        → the MIN (smallest safe budget). The renderer is the authority and honors
        the clamped budget via LRU eviction + downscale-proxy.
      - `interp` must be in FRAMEBANK_VALID_INTERP; unknown → REJECTED.
      - slots must be a non-empty list of <= MAX_FRAMEBANK_SLOTS entries, each a
        dict with a non-empty string `clipId` and a finite int `frameIndex` >= 0.
        Over-cap slot count, or any malformed slot ref, is REJECTED.

    Returns (sanitized_inst | None, errors). On any error the sanitized inst is
    None and the caller MUST refuse the render. On success the returned dict is a
    shallow copy with clamped position/byteBudget/interp + validated slots — safe
    to pass straight to engine.frame_bank.
    """
    errors: list[str] = []
    if not isinstance(inst, dict):
        return None, [f"frameBank must be an object (got {type(inst).__name__})"]

    slots = inst.get("slots")
    if not isinstance(slots, list) or len(slots) == 0:
        return None, ["frameBank.slots must be a non-empty list"]
    if len(slots) > MAX_FRAMEBANK_SLOTS:
        return None, [
            f"frameBank.slots length {len(slots)} exceeds maximum "
            f"{MAX_FRAMEBANK_SLOTS} (MAX_FRAMEBANK_SLOTS)"
        ]

    clean_slots: list[dict] = []
    for i, slot in enumerate(slots):
        if not isinstance(slot, dict):
            return None, [f"frameBank.slots[{i}] must be an object"]
        clip_id = slot.get("clipId")
        if not isinstance(clip_id, str) or not clip_id:
            return None, [
                f"frameBank.slots[{i}].clipId must be a non-empty string, "
                f"got {clip_id!r}"
            ]
        fidx = slot.get("frameIndex")
        if isinstance(fidx, bool) or not isinstance(fidx, int) or fidx < 0:
            return None, [
                f"frameBank.slots[{i}].frameIndex must be an int >= 0, got {fidx!r}"
            ]
        clean_slots.append({"clipId": clip_id, "frameIndex": fidx})

    interp = inst.get("interp", "blend")
    if interp not in FRAMEBANK_VALID_INTERP:
        return None, [
            f"frameBank.interp {interp!r} is unknown "
            f"(must be one of {sorted(FRAMEBANK_VALID_INTERP)})"
        ]

    # CLAMP position [0,1] + finite guard (non-numeric / NaN / inf → 0.0).
    raw_pos = inst.get("position", 0.0)
    if not _is_finite_number(raw_pos):
        position = 0.0
    else:
        position = max(0.0, min(1.0, float(raw_pos)))

    # CLAMP byteBudget to the hard [MIN, MAX] OOM range (non-finite → MIN).
    raw_budget = inst.get("byteBudget", FRAMEBANK_BYTE_BUDGET_MIN)
    if not _is_finite_number(raw_budget):
        byte_budget = FRAMEBANK_BYTE_BUDGET_MIN
    else:
        byte_budget = int(
            max(
                FRAMEBANK_BYTE_BUDGET_MIN,
                min(FRAMEBANK_BYTE_BUDGET_MAX, float(raw_budget)),
            )
        )

    # P5b.23 — timeAxis: lowercase only (P1-A axis canon). 'Y'/'X' are
    # rejected; 't'/'y'/'x' accepted; absent → default 't' (legacy path,
    # byte-identical to pre-B9 behavior). Stored explicitly in the sanitized
    # dict so the engine always has a concrete value to dispatch on.
    VALID_TIME_AXES = {"t", "y", "x"}
    raw_time_axis = inst.get("timeAxis")
    if raw_time_axis is None:
        time_axis: str = "t"
    elif isinstance(raw_time_axis, str) and raw_time_axis in VALID_TIME_AXES:
        time_axis = raw_time_axis
    else:
        return None, [
            f"frameBank.timeAxis {raw_time_axis!r} is invalid "
            f"(must be one of {sorted(VALID_TIME_AXES)}, lowercase only)"
        ]

    sanitized = dict(inst)
    sanitized["type"] = "frameBank"
    sanitized["slots"] = clean_slots
    sanitized["interp"] = interp
    sanitized["position"] = position
    sanitized["byteBudget"] = byte_budget
    sanitized["timeAxis"] = time_axis
    return sanitized, errors


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


# P5b.21 (B9): canonical axis set, mirrors modulation.schema.LaneDomain + the
# frontend ALL_AXES.
_VALID_AXES_FOR_MOD: frozenset[str] = frozenset({"t", "y", "x", "c", "f", "l"})


def validate_operator_mod_edges(operators: object) -> list[str]:
    """Authoritative B9 mod-routing validator at the RENDER/IPC trust boundary.

    This is the LIVE-PATH counterpart of project.schema._validate_operator_mod_edges
    (which only runs on the .glitch/.dna deserialize path). Production operators
    reach the renderer via the `render`/`export` IPC messages, NOT via deserialize,
    so this function is what actually defends the running app (review Tiger 1b/4).

    Rejects (first offender only, fail-closed; absence of operators / axis fields
    is valid — legacy projects carry no axis fields and default t/t/broadcast):
    - ``operators`` not a list (when present)
    - total mapping count across ALL operators > MAX_MOD_EDGES_TOTAL (Tiger 4)
    - a mapping ``bindingRule``/``binding_rule`` (when present) that is not a
      string in the currently-accepted set (4 implemented rules + the 4 research
      rules ONLY when EXPERIMENTAL_AXIS_BINDINGS is on)
    - a malformed ``srcAxis``/``dstAxis`` (non-string or not in {t,y,x,c,f,l})
    - a non-finite ``depth``

    Returns a list of error strings (empty == valid). ``None`` operators pass.
    """
    if operators is None:
        return []
    if not isinstance(operators, list):
        return ["operators must be a list"]

    # Flag-aware accept-set (lazily imported to avoid an import cycle).
    try:
        from modulation.schema import accepted_binding_rules

        accepted = {r.value for r in accepted_binding_rules()}
    except Exception:
        accepted = {"broadcast", "sampleAt", "scanOver", "integrate"}

    total_edges = 0
    for oi, op in enumerate(operators):
        if not isinstance(op, dict):
            continue
        mappings = op.get("mappings", [])
        if not isinstance(mappings, list):
            return [f"operators[{oi}].mappings must be a list"]
        total_edges += len(mappings)
        if total_edges > MAX_MOD_EDGES_TOTAL:
            return [
                f"total modulation edges {total_edges} exceeds maximum "
                f"{MAX_MOD_EDGES_TOTAL} (MAX_MOD_EDGES_TOTAL)"
            ]
        for mi, m in enumerate(mappings):
            if not isinstance(m, dict):
                continue
            where = f"operators[{oi}].mappings[{mi}]"

            # bindingRule (camelCase) or binding_rule (snake_case) — accept both
            # since the live IPC payload is snake_case while .glitch is camelCase.
            rule = m.get("bindingRule", m.get("binding_rule"))
            if rule is not None:
                if not isinstance(rule, str):
                    return [
                        f"{where}.bindingRule must be a string, got "
                        f"{type(rule).__name__}"
                    ]
                if rule not in accepted:
                    return [
                        f"{where}.bindingRule {rule!r} is not accepted "
                        f"(accepted: {sorted(accepted)})"
                    ]

            for cc_key, sc_key in (("srcAxis", "src_axis"), ("dstAxis", "dst_axis")):
                axis = m.get(cc_key, m.get(sc_key))
                if axis is None:
                    continue
                if not isinstance(axis, str):
                    return [
                        f"{where}.{cc_key} must be a string, got {type(axis).__name__}"
                    ]
                if axis not in _VALID_AXES_FOR_MOD:
                    return [
                        f"{where}.{cc_key} {axis!r} is not a valid axis "
                        f"(expected one of {sorted(_VALID_AXES_FOR_MOD)})"
                    ]

            depth = m.get("depth")
            if depth is not None and not _is_finite_number(depth):
                return [f"{where}.depth must be a finite number, got {depth!r}"]

    return []


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

        # P5b.21 (B9): the export path is also a render trust boundary — reject
        # flag-off/unknown binding rules, malformed axes, non-finite depths, and
        # the project-wide MAX_MOD_EDGES_TOTAL cap on the operator mappings.
        mod_errors = validate_operator_mod_edges(operators)
        if mod_errors:
            return mod_errors

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
