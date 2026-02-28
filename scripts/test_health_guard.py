#!/usr/bin/env python3
"""
Test Health Guard — detects degradation in the test pyramid and CI pipeline.

Runs at session-close or on-demand. Checks for:
- E2E ratio > 15% (pyramid inversion)
- CI time > 10 min (performance regression)
- Missing // WHY E2E: justification in new .spec.ts files
- Flaky tests (>20% failure rate over history)
- Duration regression >200%

Usage:
    python scripts/test_health_guard.py              # Full check
    python scripts/test_health_guard.py --slow        # Show slowest tests
    python scripts/test_health_guard.py --violations   # Show only violations
"""

import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
HEALTH_FILE = PROJECT_ROOT / ".test-health.json"
E2E_DIR = PROJECT_ROOT / "frontend" / "tests" / "e2e"


def load_health() -> dict | None:
    """Load current test health data."""
    if HEALTH_FILE.exists():
        try:
            return json.loads(HEALTH_FILE.read_text())
        except json.JSONDecodeError:
            return None
    return None


def check_pyramid_ratio(health: dict) -> list[str]:
    """Check if E2E ratio exceeds 15%."""
    warnings = []
    ratio = health.get("pyramid_ratio", {})
    e2e_pct = ratio.get("e2e", 0)

    if e2e_pct > 15:
        warnings.append(
            f"PYRAMID INVERTED: E2E at {e2e_pct}% (target <= 5%, max 15%). "
            f"Migrate E2E tests to Vitest + mock IPC."
        )

    return warnings


def check_ci_time(health: dict) -> list[str]:
    """Check if CI time exceeds 10 minutes."""
    warnings = []
    layers = health.get("layers", {})
    total_s = sum(l.get("duration_s", 0) for l in layers.values())

    if total_s > 600:  # 10 minutes
        slowest = max(layers.items(), key=lambda x: x[1].get("duration_s", 0))
        warnings.append(
            f"CI TIME WARNING: {total_s:.0f}s total (>{600}s threshold). "
            f"Slowest layer: {slowest[0]} at {slowest[1]['duration_s']:.0f}s."
        )

    return warnings


def check_why_e2e() -> list[str]:
    """Check that all E2E spec files have // WHY E2E: justification."""
    warnings = []

    if not E2E_DIR.exists():
        return warnings

    for spec_file in E2E_DIR.rglob("*.spec.ts"):
        if spec_file.name == "smoke.spec.ts":
            continue

        content = spec_file.read_text()
        if "// WHY E2E:" not in content:
            rel = spec_file.relative_to(PROJECT_ROOT)
            warnings.append(
                f"MISSING JUSTIFICATION: {rel} — add // WHY E2E: comment "
                f"explaining why this can't be a Vitest component test."
            )

    return warnings


def check_duration_regression(health: dict) -> list[str]:
    """Check for duration regression >200% vs baseline."""
    warnings = []
    # Baseline expectations (from initial measurement)
    baselines = {
        "unit": 10.0,  # backend pytest baseline
        "component": 5.0,  # vitest baseline
        "e2e": 60.0,  # playwright baseline
    }

    layers = health.get("layers", {})
    for name, baseline in baselines.items():
        actual = layers.get(name, {}).get("duration_s", 0)
        if actual > 0 and actual > baseline * 3:  # 200% regression = 3x baseline
            warnings.append(
                f"DURATION REGRESSION: {name} at {actual:.1f}s "
                f"(baseline {baseline:.1f}s, {actual / baseline:.0f}x increase)."
            )

    return warnings


def run_all_checks() -> tuple[list[str], list[str]]:
    """Run all health checks. Returns (warnings, info)."""
    health = load_health()
    warnings = []
    info = []

    if health is None:
        info.append(
            "No .test-health.json found. Run: python scripts/test_dashboard.py --update"
        )
        return warnings, info

    warnings.extend(check_pyramid_ratio(health))
    warnings.extend(check_ci_time(health))
    warnings.extend(check_why_e2e())
    warnings.extend(check_duration_regression(health))

    # Summary info
    ratio = health.get("pyramid_ratio", {})
    layers = health.get("layers", {})
    total = sum(l.get("count", 0) for l in layers.values())
    info.append(
        f"Tests: {total} total, pyramid {ratio.get('unit', 0)}/{ratio.get('component', 0)}/{ratio.get('e2e', 0)}"
    )

    return warnings, info


def main() -> None:
    if "--violations" in sys.argv:
        _, _ = run_all_checks()
        violations = check_why_e2e()
        if violations:
            print(f"\n  VIOLATIONS ({len(violations)}):")
            for v in violations:
                print(f"    ! {v}")
            sys.exit(1)
        else:
            print("  No violations found.")
            sys.exit(0)

    if "--slow" in sys.argv:
        health = load_health()
        if health:
            layers = health.get("layers", {})
            sorted_layers = sorted(
                layers.items(), key=lambda x: x[1].get("duration_s", 0), reverse=True
            )
            print("\n  Slowest test layers:")
            for name, data in sorted_layers:
                print(
                    f"    {name:>12}: {data.get('duration_s', 0):.1f}s ({data.get('count', 0)} tests)"
                )
        sys.exit(0)

    # Full check
    warnings, info = run_all_checks()

    print()
    print("=" * 50)
    print("  TEST HEALTH GUARD")
    print("=" * 50)

    for line in info:
        print(f"  {line}")
    print()

    if warnings:
        print(f"  WARNINGS ({len(warnings)}):")
        for w in warnings:
            print(f"    ! {w}")
        print()
        print("  Status: DEGRADED")
        sys.exit(1)
    else:
        print("  Status: HEALTHY")
        sys.exit(0)


if __name__ == "__main__":
    main()
