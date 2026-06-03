"""Q7 PR #1 smoke tests — harness end-to-end with mock backend.

These run in CI on every push (no GPU, no model load). They prove:
- Harness imports cleanly
- --mock mode produces a schema-valid JSON report
- Output is deterministic (same seed + sparsity → byte-identical JSON)
- Report has all three head entries
- Schema validator catches missing keys + invalid values
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

# parents: [0] test_q7_benchmark, [1] tests, [2] backend, [3] repo root
BACKEND_DIR = Path(__file__).resolve().parents[2]
SCRIPTS_DIR = BACKEND_DIR / "scripts"


@pytest.fixture
def run_q7():
    """Run the q7-benchmark CLI as a subprocess. Returns (returncode, stdout, stderr)."""

    def _run(*args: str) -> tuple[int, str, str]:
        proc = subprocess.run(
            [sys.executable, "-m", "q7_benchmark.runner", *args],
            cwd=SCRIPTS_DIR,
            capture_output=True,
            text=True,
            timeout=30,
        )
        return proc.returncode, proc.stdout, proc.stderr

    return _run


@pytest.mark.smoke
def test_mock_runs_and_writes_report(run_q7, tmp_path):
    out = tmp_path / "report.json"
    rc, stdout, stderr = run_q7("--mock", "--out", str(out))
    assert rc == 0, f"mock run failed: {stderr}"
    assert out.exists(), "report file not written"
    report = json.loads(out.read_text())
    assert report["mode"] == "mock"
    assert report["backend"] == "mock"
    assert "measurement" in report


@pytest.mark.smoke
def test_mock_report_schema_valid(run_q7, tmp_path):
    out = tmp_path / "report.json"
    rc, _, stderr = run_q7("--mock", "--out", str(out))
    assert rc == 0, stderr

    from q7_benchmark.report import validate_report

    report = json.loads(out.read_text())
    validate_report(report)  # raises ReportSchemaError on bad shape


@pytest.mark.smoke
def test_mock_has_all_three_heads(run_q7, tmp_path):
    out = tmp_path / "report.json"
    rc, _, _ = run_q7("--mock", "--out", str(out))
    assert rc == 0
    report = json.loads(out.read_text())
    heads = report["measurement"]["heads"]
    assert set(heads.keys()) == {"dinov2", "clip", "clap"}
    for name, h in heads.items():
        assert h["embed_dim"] > 0, f"{name} embed_dim missing"
        assert h["encode_latency"]["p50_ms"] > 0, f"{name} p50_ms missing"


@pytest.mark.smoke
def test_mock_is_deterministic(run_q7, tmp_path):
    """Same seed + sparsity → byte-identical JSON. Caught accidental nondeterminism."""
    a = tmp_path / "a.json"
    b = tmp_path / "b.json"
    rc1, _, _ = run_q7("--mock", "--seed", "7", "--sparsity", "8", "--out", str(a))
    rc2, _, _ = run_q7("--mock", "--seed", "7", "--sparsity", "8", "--out", str(b))
    assert rc1 == 0 and rc2 == 0
    assert a.read_bytes() == b.read_bytes(), "mock mode is not deterministic"


@pytest.mark.smoke
def test_mock_different_seed_different_output(run_q7, tmp_path):
    """Sanity: different seed gives different output (mock isn't constant)."""
    a = tmp_path / "a.json"
    b = tmp_path / "b.json"
    run_q7("--mock", "--seed", "1", "--out", str(a))
    run_q7("--mock", "--seed", "2", "--out", str(b))
    # Reports differ in measurement contents; generated_at also differs.
    assert (
        json.loads(a.read_text())["measurement"]
        != json.loads(b.read_text())["measurement"]
    )


@pytest.mark.smoke
def test_measure_without_mock_errors(run_q7, tmp_path):
    """Sanity: --measure without backend support should error (not crash)."""
    rc, _, stderr = run_q7("--measure", "--out", str(tmp_path / "r.json"))
    assert rc != 0, "expected non-zero exit"


@pytest.mark.smoke
def test_no_args_errors(run_q7):
    """Sanity: must pass --mock or --measure; bare invocation errors."""
    rc, _, stderr = run_q7()
    assert rc != 0
    assert "mock" in stderr.lower() or "measure" in stderr.lower()


@pytest.mark.smoke
def test_mock_and_measure_mutually_exclusive(run_q7):
    rc, _, stderr = run_q7("--mock", "--measure")
    assert rc != 0
    assert "exclusive" in stderr.lower() or "mock" in stderr.lower()


@pytest.mark.smoke
def test_schema_validator_rejects_bad_report(tmp_path):
    """Schema validator catches obvious shape drift."""
    from q7_benchmark.report import ReportSchemaError, validate_report

    bad = {"schema_version": "0.0.0", "mode": "mock"}  # missing required keys
    with pytest.raises(ReportSchemaError):
        validate_report(bad)
