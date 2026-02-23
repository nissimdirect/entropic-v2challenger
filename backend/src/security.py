"""Security validation gates for Entropic v2."""

import os
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
