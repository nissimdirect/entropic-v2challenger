#!/usr/bin/env bash
# component-inventory.sh — GENERATED component inventory (framework F1)
#
# Emits a TSV of every renderer component with its test status. This replaces
# the two hand-maintained inventories that rotted (COMPONENT-TEST-MATRIX.md,
# COMPONENT-ACCEPTANCE-CRITERIA.md — see their supersede headers): generated
# output can't drift, it just re-runs.
#
# Informational — always exits 0. Usage:
#   cd frontend && bash scripts/component-inventory.sh          # full TSV
#   cd frontend && bash scripts/component-inventory.sh --untested  # gaps only
#
# Columns: component-path <TAB> has-named-test(yes/no)
# "Named test" = a file under src/__tests__/ whose name contains the
# component's basename (COMPONENT-SPEC §2 naming rule for new tests —
# historical ticket-named tests won't match; that's the point: this surfaces
# what you can't FIND a test for by name).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPONENTS_DIR="$FRONTEND_DIR/src/renderer/components"
TESTS_DIR="$FRONTEND_DIR/src/__tests__"

ONLY_UNTESTED="${1:-}"

TEST_NAMES="$(find "$TESTS_DIR" -type f \( -name '*.test.ts' -o -name '*.test.tsx' \) -exec basename {} \; | tr '[:upper:]' '[:lower:]')"

total=0
untested=0

while IFS= read -r comp; do
  total=$((total + 1))
  base="$(basename "$comp" .tsx | tr '[:upper:]' '[:lower:]')"
  # Prefix match (foo. / foo-), not substring — macro-knob is not Knob's test.
  if echo "$TEST_NAMES" | grep -qE "^${base}[.-]"; then
    has="yes"
  else
    has="no"
    untested=$((untested + 1))
  fi
  rel="${comp#"$COMPONENTS_DIR"/}"
  if [[ "$ONLY_UNTESTED" == "--untested" && "$has" == "yes" ]]; then
    continue
  fi
  printf '%s\t%s\n' "$rel" "$has"
done < <(find "$COMPONENTS_DIR" -name '*.tsx' | sort)

echo "# $total components, $untested without a name-matched test" >&2
exit 0
