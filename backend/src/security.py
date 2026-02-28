"""Security validation gates for Entropic v2."""

import json
import os
import re
from pathlib import Path

# SEC-5: Upload validation
MAX_UPLOAD_SIZE = 500 * 1024 * 1024  # 500 MB
ALLOWED_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm"}

# SEC-6: Frame count cap (300K = ~2.7 hours at 30fps)
MAX_FRAME_COUNT = 300_000

# SEC-7: Chain depth cap
MAX_CHAIN_DEPTH = 10


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


def validate_frame_count(count: int) -> list[str]:
    """Validate frame count against SEC-6 cap. Returns list of errors."""
    errors: list[str] = []
    if count > MAX_FRAME_COUNT:
        errors.append(f"Frame count {count} exceeds maximum {MAX_FRAME_COUNT} (SEC-6)")
    return errors


ALLOWED_OUTPUT_EXTENSIONS = {".mp4", ".mov", ".mkv", ".webm"}
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


def validate_chain_depth(chain: list) -> list[str]:
    """Validate effect chain depth against SEC-7 cap. Returns list of errors."""
    errors: list[str] = []
    if len(chain) > MAX_CHAIN_DEPTH:
        errors.append(
            f"Chain depth {len(chain)} exceeds maximum {MAX_CHAIN_DEPTH} (SEC-7)"
        )
    return errors


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
