"""Backend detector — MLX > PyTorch MPS > PyTorch CPU > mock.

Skeleton for PR #1. Real backend instantiation lives in PR #3.
PR #1 ships only the detect() function + names; importing real backends is
deferred so this module is safe to import in any environment.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass


class BackendUnavailableError(RuntimeError):
    """No real backend available (and --mock not requested)."""


@dataclass(frozen=True)
class BackendInfo:
    name: str
    available: bool
    detail: str


def _try_mlx() -> BackendInfo:
    if sys.platform != "darwin":
        return BackendInfo("mlx", False, "MLX requires macOS")
    try:
        import mlx.core  # type: ignore[import-not-found]  # noqa: F401
    except ImportError:
        return BackendInfo("mlx", False, "mlx package not installed")
    return BackendInfo("mlx", True, "MLX available")


def _try_mps() -> BackendInfo:
    try:
        import torch  # type: ignore[import-not-found]
    except ImportError:
        return BackendInfo("mps", False, "torch package not installed")
    if not torch.backends.mps.is_available():  # type: ignore[attr-defined]
        return BackendInfo("mps", False, "torch.backends.mps not available")
    return BackendInfo(
        "mps", True, f"PyTorch MPS available (torch {torch.__version__})"
    )


def _try_cpu() -> BackendInfo:
    try:
        import torch  # type: ignore[import-not-found]
    except ImportError:
        return BackendInfo(
            "cpu", False, "torch package not installed (cpu requires torch)"
        )
    return BackendInfo(
        "cpu", True, f"PyTorch CPU available (torch {torch.__version__})"
    )


def _mock() -> BackendInfo:
    return BackendInfo("mock", True, "deterministic synthetic backend")


def probe() -> list[BackendInfo]:
    """Return a list of all backends with availability + detail."""
    return [_try_mlx(), _try_mps(), _try_cpu(), _mock()]


def detect_backend(*, allow_mock: bool) -> BackendInfo:
    """Pick the highest-priority available backend.

    Order: MLX > MPS > CPU > mock (only if allow_mock=True).
    Raises BackendUnavailableError if no real backend is available and
    allow_mock=False.
    """
    for info in (_try_mlx(), _try_mps(), _try_cpu()):
        if info.available:
            return info
    if allow_mock:
        return _mock()
    detail = "; ".join(f"{i.name}: {i.detail}" for i in probe())
    raise BackendUnavailableError(
        f"no real backend available ({detail}). "
        "Run with --mock for CI smoke, or install mlx / torch."
    )
