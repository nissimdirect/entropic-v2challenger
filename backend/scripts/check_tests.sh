#!/usr/bin/env bash
# check_tests.sh — Skip-if-green test gate
#
# Exit 0 = tests can be skipped (green + no changes)
# Exit 1 = tests must run
#
# Usage: bash scripts/check_tests.sh

set -euo pipefail

MANIFEST=".test-manifest.json"

# 1. No manifest? Run tests.
if [ ! -f "$MANIFEST" ]; then
    echo "No test manifest found. Running tests."
    exit 1
fi

# 2. Parse manifest with python3
eval "$(python3 -c "
import json, sys
try:
    m = json.load(open('$MANIFEST'))
    print(f'GREEN={str(m.get(\"green\", False)).lower()}')
    print(f'BRANCH=\"{m.get(\"branch\", \"\")}\"')
    print(f'SHA=\"{m.get(\"commit_sha\", \"\")}\"')
    print(f'MAX_AGE={m.get(\"max_age_hours\", 24)}')
    print(f'TIMESTAMP=\"{m.get(\"timestamp\", \"\")}\"')
except Exception as e:
    print(f'echo \"Manifest parse error: {e}\"', file=sys.stderr)
    sys.exit(1)
")"

# 3. Not green? Run tests.
if [ "$GREEN" != "true" ]; then
    echo "Last test run was not green. Running tests."
    exit 1
fi

# 4. Branch mismatch? Run tests.
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
if [ "$BRANCH" != "$CURRENT_BRANCH" ]; then
    echo "Branch changed ($BRANCH -> $CURRENT_BRANCH). Running tests."
    exit 1
fi

# 5. Validate SHA format (security: prevent injection into git commands)
if ! echo "$SHA" | grep -qE '^[0-9a-f]{40}$'; then
    echo "Invalid SHA format in manifest. Running tests."
    exit 1
fi

# 6. Check manifest age
if [ -n "$TIMESTAMP" ]; then
    AGE_HOURS=$(python3 -c "
from datetime import datetime, timezone
try:
    ts = datetime.fromisoformat('$TIMESTAMP')
    age = (datetime.now(timezone.utc) - ts).total_seconds() / 3600
    print(f'{age:.1f}')
except:
    print('999')
")
    if python3 -c "exit(0 if float('$AGE_HOURS') > float('$MAX_AGE') else 1)"; then
        echo "Manifest is ${AGE_HOURS}h old (max ${MAX_AGE}h). Running tests."
        exit 1
    fi
fi

# 7. Check for source changes since last green SHA (includes unstaged changes)
CHANGES=$(git diff "$SHA" -- src/ tests/ 2>/dev/null || echo "DIFF_FAILED")
if [ "$CHANGES" = "DIFF_FAILED" ]; then
    echo "Could not diff against manifest SHA. Running tests."
    exit 1
fi

if [ -n "$CHANGES" ]; then
    echo "Source changes detected since $SHA. Running tests."
    exit 1
fi

# 8. All checks passed — skip tests
echo "Tests green at ${SHA:0:10}, no changes since. Skipping."
exit 0
