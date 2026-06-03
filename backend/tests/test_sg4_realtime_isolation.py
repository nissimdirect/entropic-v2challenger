"""SG-4 realtime-audio isolation contract enforcement (DEC-Q7-017).

Scans the AST of every realtime-audio file and asserts that no forbidden
L-module imports appear anywhere in the import graph (direct or transitive
through project-local modules).

Runs in CI on every PR. A regression — someone adding `import torch` to
`audio/mixer.py` — fails this test deterministically before it can hit
the audio playback thread.

Per [[feedback_sdlc-verify-in-app-not-just-code]]: this is a structural
lint, not a runtime UAT. The PR body documents what app-level scenarios
it protects against; the test itself runs in pure-Python.
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

import pytest

BACKEND_SRC = Path(__file__).resolve().parents[1] / "src"

# Files that run on the realtime audio path (per DEC-Q7-017 §1).
REALTIME_AUDIO_FILES: tuple[str, ...] = (
    "audio/clock.py",
    "audio/project_clock.py",
    "audio/mixer.py",
    "audio/mixer_player.py",
    "audio/player.py",
    "audio/meter.py",
)

# Modules that must NEVER appear in the import graph of a realtime file.
# Matching is exact-or-prefix: 'torch' matches 'torch', 'torch.nn', etc.
FORBIDDEN_PREFIXES: tuple[str, ...] = (
    "q7_worker",
    "q7_benchmark.loaders",
    "q7_benchmark.bench",
    "q7_benchmark.jitter",
    "q7_benchmark.queue_sat",
    "q7_benchmark.under_load",
    "torch",
    "transformers",
    "huggingface_hub",
    "mlx",
    "laion_clap",
    "clap_module",
)

# Project-local module prefixes — these are scanned recursively to catch
# transitive forbidden imports.
LOCAL_PREFIXES: tuple[str, ...] = (
    "audio.",
    "engine.",
    "effects.",
    "memory.",
    "modulation.",
    "project.",
    "safety.",
    "video.",
)


def _module_to_path(module: str) -> Path | None:
    """Resolve a project-local module name to its .py path on disk."""
    parts = module.split(".")
    candidate = BACKEND_SRC.joinpath(*parts).with_suffix(".py")
    if candidate.exists():
        return candidate
    # Maybe it's a package
    candidate_pkg = BACKEND_SRC.joinpath(*parts, "__init__.py")
    if candidate_pkg.exists():
        return candidate_pkg
    return None


def _extract_imports(source: str) -> set[str]:
    """Return the set of top-level imported module names from one file."""
    out: set[str] = set()
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return out
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                out.add(alias.name)
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                out.add(node.module)
            # Also catch `from . import X` style — not relevant for forbidden check
    return out


def _is_forbidden(module: str) -> bool:
    """Match exact + prefix."""
    for fb in FORBIDDEN_PREFIXES:
        if module == fb or module.startswith(fb + "."):
            return True
    return False


def _is_local(module: str) -> bool:
    return (
        any(module.startswith(p) for p in LOCAL_PREFIXES)
        or _module_to_path(module) is not None
    )


def collect_import_graph(start: Path, max_depth: int = 6) -> set[str]:
    """BFS the import graph from `start` through project-local files.

    Returns the cumulative set of imported module names (including
    transitive). Stops descending into non-local modules (we still record
    that they were imported, but don't recurse).
    """
    seen_files: set[Path] = set()
    cumulative: set[str] = set()
    frontier: list[tuple[Path, int]] = [(start, 0)]

    while frontier:
        path, depth = frontier.pop()
        if path in seen_files or depth > max_depth:
            continue
        seen_files.add(path)
        try:
            source = path.read_text()
        except OSError:
            continue
        imports = _extract_imports(source)
        cumulative |= imports

        # Recurse into project-local imports
        for module in imports:
            if _is_local(module):
                child_path = _module_to_path(module)
                if child_path is not None:
                    frontier.append((child_path, depth + 1))

    return cumulative


@pytest.mark.smoke
def test_backend_src_exists():
    """Sentinel: confirm we resolved BACKEND_SRC correctly."""
    assert BACKEND_SRC.exists(), f"BACKEND_SRC missing: {BACKEND_SRC}"
    assert (BACKEND_SRC / "audio").is_dir(), "audio/ subdir not found"


@pytest.mark.smoke
@pytest.mark.parametrize("rel", REALTIME_AUDIO_FILES)
def test_realtime_audio_file_exists(rel: str):
    """Sentinel: every file in our realtime list must exist on disk."""
    path = BACKEND_SRC / rel
    assert path.exists(), (
        f"DEC-Q7-017 references {rel} as realtime, but file not found at {path}. "
        "Either the file moved (update DEC-Q7-017 + this test's REALTIME_AUDIO_FILES) "
        "or it was deleted (drop from the list)."
    )


@pytest.mark.smoke
@pytest.mark.parametrize("rel", REALTIME_AUDIO_FILES)
def test_realtime_audio_has_no_l_imports(rel: str):
    """Core SG-4 contract: realtime file imports nothing forbidden."""
    path = BACKEND_SRC / rel
    graph = collect_import_graph(path)
    forbidden = {m for m in graph if _is_forbidden(m)}
    assert not forbidden, (
        f"SG-4 VIOLATION in {rel}: forbidden imports found: {sorted(forbidden)}. "
        "Per DEC-Q7-017, realtime audio code MUST NOT import L modules. "
        "Move the L-touching code out of the realtime path or refactor."
    )


@pytest.mark.smoke
def test_intentional_forbidden_detection():
    """Sanity: the forbidden-detection logic actually triggers on a fake source."""
    # Simulate a source that imports torch
    fake_path = BACKEND_SRC / "audio" / "_test_synthetic_violation.py"
    try:
        fake_path.write_text(
            "import torch\nfrom q7_worker.dispatcher import Dispatcher\n"
        )
        graph = _extract_imports(fake_path.read_text())
        forbidden = {m for m in graph if _is_forbidden(m)}
        assert "torch" in forbidden
        assert "q7_worker.dispatcher" in forbidden
    finally:
        if fake_path.exists():
            fake_path.unlink()


@pytest.mark.smoke
def test_forbidden_prefix_matches_exact_and_dotted():
    assert _is_forbidden("torch")
    assert _is_forbidden("torch.nn")
    assert _is_forbidden("torch.backends.mps")
    assert _is_forbidden("q7_worker")
    assert _is_forbidden("q7_worker.dispatcher")
    assert _is_forbidden("q7_benchmark.loaders")
    assert _is_forbidden("q7_benchmark.loaders.dinov2")
    # Non-matches
    assert not _is_forbidden("q7_benchmark.report")  # report is fine
    assert not _is_forbidden("q7_benchmark.mock")
    assert not _is_forbidden("numpy")
    assert not _is_forbidden("av")  # PyAV is fine


@pytest.mark.smoke
def test_local_detection():
    """Project-local modules are detected so we recurse correctly."""
    assert _is_local("audio.mixer") or _module_to_path("audio.mixer") is not None
    assert not _is_local("torch.nn")
    assert not _is_local("numpy")
