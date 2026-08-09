"""Backend detector smoke tests.

These don't import torch / mlx — they only verify the detector contract:
- probe() returns a list of BackendInfo for all four backends
- detect_backend(allow_mock=True) returns at least 'mock' if no real backend
- detect_backend(allow_mock=False) raises BackendUnavailableError if no real backend

CI runs on ubuntu-latest where neither MLX nor MPS is available, so this
exercises the no-backend-available path.
"""

from __future__ import annotations

import pytest

from q7_benchmark.backends import (
    BackendInfo,
    BackendUnavailableError,
    detect_backend,
    probe,
)


@pytest.mark.smoke
def test_probe_returns_four_backends():
    results = probe()
    names = [b.name for b in results]
    assert names == ["mlx", "mps", "cpu", "mock"]
    assert all(isinstance(b, BackendInfo) for b in results)


@pytest.mark.smoke
def test_mock_always_available():
    [mlx, mps, cpu, mock] = probe()
    assert mock.available, "mock backend should always be available"


@pytest.mark.smoke
def test_detect_with_mock_returns_a_backend():
    info = detect_backend(allow_mock=True)
    assert info.available
    # If no real backend, must fall through to mock.
    assert info.name in {"mlx", "mps", "cpu", "mock"}


@pytest.mark.smoke
def test_detect_without_mock_on_no_backend_raises():
    """When run on a CI runner with no MLX and no torch, this should raise."""
    try:
        import torch  # noqa: F401
    except ImportError:
        # Confirmed no real backend; detector must raise.
        with pytest.raises(BackendUnavailableError):
            detect_backend(allow_mock=False)
    else:
        # torch is installed → CPU is "available" → detect returns cpu.
        # Skip the negative assertion in that environment.
        pytest.skip("torch installed; cpu backend is available")
