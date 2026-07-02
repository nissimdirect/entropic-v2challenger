#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/../backend"

BASELINE="../.test-baseline.txt"
CURRENT="/tmp/entropic-current-results.txt"

# Run full non-perf suite, capture per-test status (sorted for deterministic diff)
python3 -m pytest tests/ -v --tb=no 2>&1 \
  | grep -E "(PASSED|FAILED|SKIPPED|ERROR|XFAIL)" \
  | sed 's/ *\[.*%\]//' \
  | sort > "$CURRENT"

if [ ! -f "$BASELINE" ]; then
    echo "No baseline found. Creating: $BASELINE"
    cp "$CURRENT" "$BASELINE"
    echo "Baseline created with $(wc -l < "$BASELINE" | tr -d ' ') tests."
    exit 0
fi

# Diff: removed tests (in baseline, not in current) = ERROR
# New tests (in current, not in baseline) = INFO
REMOVED=$(comm -23 "$BASELINE" "$CURRENT" | grep "PASSED\|FAILED" || true)
NEW=$(comm -13 "$BASELINE" "$CURRENT" | grep "PASSED\|FAILED" || true)
REGRESSIONS=$(comm -13 <(grep "PASSED" "$BASELINE" | sed 's/ PASSED//') \
                       <(grep "FAILED" "$CURRENT" | sed 's/ FAILED//') || true)

EXIT=0

if [ -n "$REGRESSIONS" ]; then
    echo "REGRESSIONS (was PASSED, now FAILED):"
    echo "$REGRESSIONS"
    EXIT=1
fi

if [ -n "$REMOVED" ]; then
    echo "REMOVED (in baseline, missing from current run):"
    echo "$REMOVED"
    EXIT=1
fi

if [ -n "$NEW" ]; then
    echo "NEW (not in baseline):"
    echo "$NEW"
fi

if [ "$EXIT" -eq 0 ]; then
    echo "Baseline matches. $(wc -l < "$BASELINE" | tr -d ' ') tests tracked."
fi

# --update-baseline flag: snapshot current as new baseline
if [ "${1:-}" = "--update-baseline" ]; then
    cp "$CURRENT" "$BASELINE"
    echo "Baseline updated."
fi

exit $EXIT
