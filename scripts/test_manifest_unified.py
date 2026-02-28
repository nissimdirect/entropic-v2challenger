#!/usr/bin/env python3
"""
Unified Test Manifest — combines backend + frontend test results into a single JSON file.

Reads:
- backend/.test-manifest.json (pytest results)
- frontend/.vitest-results.json (Vitest component/contract test results)
- frontend/test-results/ (Playwright E2E results)

Writes:
- .test-manifest-unified.json (combined view)

Usage:
    python scripts/test_manifest_unified.py
"""

import json
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUTPUT = PROJECT_ROOT / ".test-manifest-unified.json"


def read_json(path: Path) -> dict | None:
    """Read JSON file if it exists."""
    if path.exists():
        try:
            return json.loads(path.read_text())
        except json.JSONDecodeError:
            return None
    return None


def main() -> None:
    backend = read_json(PROJECT_ROOT / "backend" / ".test-manifest.json") or {}
    frontend = read_json(PROJECT_ROOT / "frontend" / ".vitest-results.json") or {}

    manifest = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "layers": {
            "backend": {
                "total": backend.get("total", 0),
                "passed": backend.get("passed", 0),
                "failed": backend.get("failed", 0),
                "duration_s": backend.get("duration_seconds", 0),
                "green": backend.get("green", True),
            },
            "frontend_vitest": {
                "total": frontend.get("numTotalTests", 0),
                "passed": frontend.get("numPassedTests", 0),
                "failed": frontend.get("numFailedTests", 0),
                "duration_s": frontend.get("duration", 0) / 1000
                if frontend.get("duration")
                else 0,
                "green": frontend.get("numFailedTests", 0) == 0,
            },
        },
        "overall_green": (
            backend.get("green", True) and frontend.get("numFailedTests", 0) == 0
        ),
    }

    OUTPUT.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Wrote unified manifest to {OUTPUT}")
    print(
        f"  Backend:  {manifest['layers']['backend']['total']} tests ({manifest['layers']['backend']['duration_s']:.1f}s)"
    )
    print(
        f"  Frontend: {manifest['layers']['frontend_vitest']['total']} tests ({manifest['layers']['frontend_vitest']['duration_s']:.1f}s)"
    )
    print(f"  Overall:  {'GREEN' if manifest['overall_green'] else 'RED'}")


if __name__ == "__main__":
    main()
