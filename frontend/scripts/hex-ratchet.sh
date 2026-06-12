#!/usr/bin/env bash
# hex-ratchet.sh — PUX.1 design-token CI gate
#
# Counts hardcoded hex color literals in frontend/src/renderer/styles/*.css,
# excluding tokens.css (the ONLY legal home for raw hex values).
# Fails (exit 1) if the count exceeds the ceiling in .hex-ceiling.
#
# Usage:
#   cd frontend
#   bash scripts/hex-ratchet.sh
#
# Rules (DESIGN-SPEC §7 governance):
#   (a) Baseline set by PUX.1: ceiling = post-migration hex count.
#   (b) Every PR touching styles/ must keep count ≤ ceiling.
#       A new hardcoded hex with no headroom = red CI.
#   (c) Any PR that lowers the count MUST lower .hex-ceiling to the new
#       count in the same PR (the ratchet clicks, monotonically toward 0).
#   (d) tokens.css is excluded — primitives live there by design.
#
# Regex covers 3–8 hex digit values (including alpha variants like #0008).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# Allow test overrides via env vars
STYLES_DIR="${HEX_RATCHET_STYLES_DIR:-$FRONTEND_DIR/src/renderer/styles}"
CEILING_FILE="${HEX_RATCHET_CEILING_FILE:-$FRONTEND_DIR/.hex-ceiling}"

if [[ ! -f "$CEILING_FILE" ]]; then
  echo "ERROR: $CEILING_FILE not found — cannot run hex-ratchet." >&2
  exit 2
fi

CEILING=$(cat "$CEILING_FILE" | tr -d '[:space:]')

if ! [[ "$CEILING" =~ ^[0-9]+$ ]]; then
  echo "ERROR: .hex-ceiling must contain a single integer, got: '$CEILING'" >&2
  exit 2
fi

# grep exits 1 when no matches found; pipefail would abort — use { ... } || true.
COUNT=$(
  { grep -rohE '#[0-9a-fA-F]{3,8}' \
      "$STYLES_DIR" \
      --include='*.css' \
      --exclude='tokens.css' \
    || true; } \
  | wc -l | tr -d '[:space:]'
)
COUNT="${COUNT:-0}"

echo "hex-ratchet: $COUNT hardcoded hex(es) in styles/ (ceiling: $CEILING, tokens.css exempt)"

if [[ "$COUNT" -gt "$CEILING" ]]; then
  echo "FAIL: $COUNT > $CEILING — add new colors to tokens.css instead, or lower the ceiling if you removed hexes." >&2
  echo "      Run: grep -rohE '#[0-9a-fA-F]{3,8}' src/renderer/styles --include='*.css' --exclude=tokens.css" >&2
  exit 1
fi

echo "PASS: hex count within ceiling."
exit 0
