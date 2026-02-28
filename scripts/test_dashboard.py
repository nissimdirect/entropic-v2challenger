#!/usr/bin/env python3
"""
Test Dashboard — captures test health data and displays terminal summary.

Writes .test-health.json after every test run with:
- Layer counts, durations, green/red status
- Pyramid ratio (unit/component/e2e percentages)
- Violations list, trend detection, CI cost estimate

Usage:
    python scripts/test_dashboard.py              # Show dashboard
    python scripts/test_dashboard.py --update     # Update .test-health.json from latest results
    python scripts/test_dashboard.py --oneliner   # One-line summary for session-close
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
HEALTH_FILE = PROJECT_ROOT / ".test-health.json"
BACKEND_MANIFEST = PROJECT_ROOT / "backend" / ".test-manifest.json"
FRONTEND_RESULTS = PROJECT_ROOT / "frontend" / "test-results"
E2E_RESULTS = PROJECT_ROOT / "frontend" / "playwright-report"


def read_backend_results() -> dict:
    """Read backend test manifest if it exists."""
    if BACKEND_MANIFEST.exists():
        data = json.loads(BACKEND_MANIFEST.read_text())
        return {
            "count": data.get("total", 0),
            "duration_s": data.get("duration_seconds", 0),
            "green": data.get("green", False),
            "passed": data.get("passed", 0),
            "failed": data.get("failed", 0),
        }
    return {"count": 0, "duration_s": 0, "green": True, "passed": 0, "failed": 0}


def read_frontend_results() -> dict:
    """Read Vitest results (component + contract tests)."""
    # Look for vitest output in multiple locations
    vitest_json = PROJECT_ROOT / "frontend" / ".vitest-results.json"
    if vitest_json.exists():
        data = json.loads(vitest_json.read_text())
        return {
            "count": data.get("numTotalTests", 0),
            "duration_s": data.get("duration", 0) / 1000,
            "green": data.get("numFailedTests", 0) == 0,
            "passed": data.get("numPassedTests", 0),
            "failed": data.get("numFailedTests", 0),
        }
    return {"count": 0, "duration_s": 0, "green": True, "passed": 0, "failed": 0}


def read_e2e_results() -> dict:
    """Read Playwright E2E results."""
    # Look for Playwright JSON report
    pw_json = PROJECT_ROOT / "frontend" / "test-results" / "results.json"
    if pw_json.exists():
        data = json.loads(pw_json.read_text())
        suites = data.get("suites", [])
        total = passed = failed = 0
        duration = data.get("stats", {}).get("duration", 0)
        for suite in suites:
            for spec in suite.get("specs", []):
                total += 1
                if spec.get("ok"):
                    passed += 1
                else:
                    failed += 1
        return {
            "count": total,
            "duration_s": duration / 1000 if duration else 0,
            "green": failed == 0,
            "passed": passed,
            "failed": failed,
        }
    return {"count": 0, "duration_s": 0, "green": True, "passed": 0, "failed": 0}


def compute_pyramid_ratio(
    unit_count: int, component_count: int, e2e_count: int
) -> dict:
    """Compute pyramid ratio as percentages."""
    total = unit_count + component_count + e2e_count
    if total == 0:
        return {"unit": 0, "component": 0, "e2e": 0}
    return {
        "unit": round(unit_count / total * 100),
        "component": round(component_count / total * 100),
        "e2e": round(e2e_count / total * 100),
    }


def detect_violations() -> list[str]:
    """Check for test layer violations."""
    violations = []
    e2e_dir = PROJECT_ROOT / "frontend" / "tests" / "e2e"

    if e2e_dir.exists():
        for spec_file in e2e_dir.rglob("*.spec.ts"):
            if spec_file.name == "smoke.spec.ts":
                continue
            content = spec_file.read_text()
            if "// WHY E2E:" not in content:
                violations.append(
                    f"Missing // WHY E2E: justification in {spec_file.relative_to(PROJECT_ROOT)}"
                )

    return violations


def detect_trend() -> str:
    """Compare current health to previous to detect trend."""
    if not HEALTH_FILE.exists():
        return "baseline"
    try:
        json.loads(HEALTH_FILE.read_text())  # Validate existing health file
        return "flat"  # Will be enhanced once we have history
    except (json.JSONDecodeError, KeyError):
        return "unknown"


def estimate_ci_cost(total_duration_s: float) -> float:
    """Estimate CI cost in USD based on GitHub Actions macOS pricing."""
    # macOS runners: $0.08/min
    minutes = total_duration_s / 60
    return round(minutes * 0.08, 2)


def update_health() -> dict:
    """Collect test results and write .test-health.json."""
    backend = read_backend_results()
    component = read_frontend_results()
    e2e = read_e2e_results()

    total_duration = backend["duration_s"] + component["duration_s"] + e2e["duration_s"]
    ratio = compute_pyramid_ratio(backend["count"], component["count"], e2e["count"])
    violations = detect_violations()
    trend = detect_trend()

    health = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "layers": {
            "unit": backend,
            "component": component,
            "e2e": e2e,
        },
        "pyramid_ratio": ratio,
        "violations": violations,
        "trend": trend,
        "ci_cost_usd": estimate_ci_cost(total_duration),
    }

    HEALTH_FILE.write_text(json.dumps(health, indent=2) + "\n")
    return health


def display_dashboard(health: dict) -> None:
    """Print ASCII dashboard to terminal."""
    layers = health["layers"]
    ratio = health["pyramid_ratio"]
    violations = health["violations"]

    total_tests = sum(l["count"] for l in layers.values())
    total_duration = sum(l["duration_s"] for l in layers.values())
    all_green = all(l["green"] for l in layers.values())

    status = "GREEN" if all_green else "RED"

    print()
    print("=" * 60)
    print(f"  TEST HEALTH DASHBOARD — {status}")
    print("=" * 60)
    print()

    for name, data in layers.items():
        icon = "+" if data["green"] else "X"
        print(
            f"  [{icon}] {name:>12}: {data['count']:>4} tests  ({data['duration_s']:.1f}s)"
        )

    print(f"  {'':>16}{'─' * 30}")
    print(f"  {'Total':>16}: {total_tests:>4} tests  ({total_duration:.1f}s)")
    print()

    print(
        f"  Pyramid: {ratio['unit']}% unit / {ratio['component']}% component / {ratio['e2e']}% e2e"
    )
    target_ok = ratio["e2e"] <= 15
    print(f"  Target:  80% / 15% / 5%  {'OK' if target_ok else 'INVERTED'}")
    print()

    print(f"  CI Cost: ~${health['ci_cost_usd']}")
    print(f"  Trend:   {health['trend']}")
    print()

    if violations:
        print(f"  VIOLATIONS ({len(violations)}):")
        for v in violations[:5]:
            print(f"    - {v}")
        if len(violations) > 5:
            print(f"    ... and {len(violations) - 5} more")
    else:
        print("  No violations found.")

    print()
    print("=" * 60)


def oneliner(health: dict) -> str:
    """One-line summary for session-close."""
    layers = health["layers"]
    total = sum(l["count"] for l in layers.values())
    duration = sum(l["duration_s"] for l in layers.values())
    ratio = health["pyramid_ratio"]
    cost = health["ci_cost_usd"]
    status = "GREEN" if all(l["green"] for l in layers.values()) else "RED"
    return f"CI Health: {total} tests, {duration:.1f}s, ${cost}, pyramid {ratio['unit']}/{ratio['component']}/{ratio['e2e']}, {status}"


def main() -> None:
    if "--update" in sys.argv:
        health = update_health()
        print(f"Updated {HEALTH_FILE}")
        display_dashboard(health)
    elif "--oneliner" in sys.argv:
        if HEALTH_FILE.exists():
            health = json.loads(HEALTH_FILE.read_text())
        else:
            health = update_health()
        print(oneliner(health))
    else:
        if HEALTH_FILE.exists():
            health = json.loads(HEALTH_FILE.read_text())
        else:
            health = update_health()
        display_dashboard(health)


if __name__ == "__main__":
    main()
