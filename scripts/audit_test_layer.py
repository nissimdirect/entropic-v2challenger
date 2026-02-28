#!/usr/bin/env python3
"""
Test Layer Audit — Enforces P97 (Test at the Right Layer)

Scans all E2E spec files for // WHY E2E: justification comments.
Flags violations and reports pyramid ratio.

Usage:
    python3 scripts/audit_test_layer.py          # Full audit
    python3 scripts/audit_test_layer.py --ci     # CI mode (exit 1 on violations)
    python3 scripts/audit_test_layer.py --quick   # Just show violations

See: docs/solutions/2026-02-28-e2e-test-pyramid.md
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


def count_tests_in_file(filepath: Path) -> int:
    """Count test/it blocks in a file."""
    content = filepath.read_text(encoding="utf-8", errors="replace")
    if filepath.suffix == ".py":
        # pytest: def test_something(
        return len(re.findall(r"def test_\w+\(", content))
    # Playwright: test('...' or test.only('...
    # Vitest: it('...' or test('...
    matches = re.findall(r"""(?:test|it)\s*(?:\.only)?\s*\(""", content)
    return len(matches)


def has_why_e2e(filepath: Path) -> tuple[bool, list[str]]:
    """Check if a spec file has // WHY E2E: comments. Returns (has_comment, reasons)."""
    content = filepath.read_text(encoding="utf-8", errors="replace")
    reasons = re.findall(r"//\s*WHY E2E:\s*(.+)", content)
    return len(reasons) > 0, reasons


def has_migration_status(filepath: Path) -> bool:
    """Check if a spec file documents migration status."""
    content = filepath.read_text(encoding="utf-8", errors="replace")
    return "MIGRATION STATUS:" in content


def find_spec_files(root: Path) -> list[Path]:
    """Find all Playwright E2E spec files."""
    e2e_dir = root / "frontend" / "tests" / "e2e"
    if not e2e_dir.exists():
        return []
    return sorted(e2e_dir.rglob("*.spec.ts"))


def find_vitest_files(root: Path) -> list[Path]:
    """Find all Vitest test files."""
    test_dir = root / "frontend" / "src" / "__tests__"
    if not test_dir.exists():
        return []
    return sorted(
        list(test_dir.rglob("*.test.ts")) + list(test_dir.rglob("*.test.tsx"))
    )


def find_backend_tests(root: Path) -> list[Path]:
    """Find all backend pytest files."""
    test_dir = root / "backend" / "tests"
    if not test_dir.exists():
        return []
    return sorted(test_dir.rglob("test_*.py"))


def main():
    parser = argparse.ArgumentParser(description="Test Layer Audit (P97)")
    parser.add_argument(
        "--ci", action="store_true", help="CI mode: exit 1 on violations"
    )
    parser.add_argument("--quick", action="store_true", help="Only show violations")
    args = parser.parse_args()

    root = Path(__file__).parent.parent
    spec_files = find_spec_files(root)
    vitest_files = find_vitest_files(root)
    backend_files = find_backend_tests(root)

    # Count tests per layer
    e2e_tests = sum(count_tests_in_file(f) for f in spec_files)
    component_tests = sum(count_tests_in_file(f) for f in vitest_files)
    backend_tests = sum(count_tests_in_file(f) for f in backend_files)
    total = backend_tests + component_tests + e2e_tests

    # Check for WHY E2E violations
    violations: list[str] = []
    justified: list[str] = []

    for f in spec_files:
        has_why, reasons = has_why_e2e(f)
        test_count = count_tests_in_file(f)
        rel = f.relative_to(root)

        if has_why:
            justified.append(f"  {rel} ({test_count} tests) — {'; '.join(reasons[:2])}")
        else:
            violations.append(
                f"  {rel} ({test_count} tests) — MISSING // WHY E2E: justification"
            )

    if not args.quick:
        # Pyramid ratio
        if total > 0:
            b_pct = round(backend_tests / total * 100)
            c_pct = round(component_tests / total * 100)
            e_pct = round(e2e_tests / total * 100)
        else:
            b_pct = c_pct = e_pct = 0

        print("=" * 60)
        print("TEST LAYER AUDIT (P97)")
        print("=" * 60)
        print()
        print(f"Backend (pytest):     {backend_tests:>4} tests  ({b_pct}%)")
        print(f"Component (Vitest):   {component_tests:>4} tests  ({c_pct}%)")
        print(f"E2E (Playwright):     {e2e_tests:>4} tests  ({e_pct}%)")
        print(f"{'─' * 40}")
        print(f"Total:                {total:>4} tests")
        print()

        # Pyramid health
        target = "80/15/5"
        actual = f"{b_pct}/{c_pct}/{e_pct}"
        if e_pct > 15:
            print(f"Pyramid: {actual} (target: {target}) — INVERTED")
        elif e_pct > 10:
            print(f"Pyramid: {actual} (target: {target}) — WARNING: E2E heavy")
        else:
            print(f"Pyramid: {actual} (target: {target}) — HEALTHY")
        print()

    # Report violations
    if violations:
        print("VIOLATIONS (E2E specs missing // WHY E2E:):")
        for v in violations:
            print(v)
        print()

    if not args.quick and justified:
        print("JUSTIFIED E2E specs:")
        for j in justified:
            print(j)
        print()

    # Migration status check
    if not args.quick:
        needs_migration = []
        for f in spec_files:
            if not has_migration_status(f) and not has_why_e2e(f)[0]:
                needs_migration.append(str(f.relative_to(root)))
        if needs_migration:
            print("NEEDS MIGRATION STATUS annotation:")
            for n in needs_migration:
                print(f"  {n}")
            print()

    # Summary
    if violations:
        print(f"Result: {len(violations)} violation(s) found")
        if args.ci:
            sys.exit(1)
    else:
        print("Result: All E2E specs justified")

    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
