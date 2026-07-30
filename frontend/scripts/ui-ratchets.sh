#!/usr/bin/env bash
# ui-ratchets.sh — frontend-framework F0 gate #1: the debt-counter family
#
# Sibling of hex-ratchet.sh (which owns styles/*.css hex and stays untouched).
# Counts SEVEN violation families that hex-ratchet's glob cannot see, and fails
# (exit 1) if any count exceeds its ceiling in frontend/.ui-ratchet-ceilings.
#
# Families (regex documented per counter below):
#   css_hex_outside_styles  raw hex in ANY renderer .css OUTSIDE styles/
#                           (closes the component-local-CSS escape hole;
#                           ceiling 0 = hard ban from day one)
#   tsx_hex                 6/8-digit hex literals in .tsx (3/4-digit skipped
#                           deliberately: too many anchor/id false positives)
#   tsx_inline_style        style={{ occurrences in .tsx
#   css_font_below_floor    font-size px values below the type floor in ALL
#                           renderer .css (floor = 12px per RATIFIED-FOUNDATIONS
#                           D6 "Scale B+1", user-ratified 2026-07-29)
#   tsx_raw_range           <input type="range"> uses (adopt common/Slider)
#   tsx_native_select       <select> opens (adopt the Select primitive)
#   css_raw_rgba            raw rgba( in ANY renderer .css EXCLUDING
#                           styles/tokens.css (primitive rgba values live in
#                           tokens.css only — use the --cx-*-alpha families)
#
# Rules (same governance as hex-ratchet.sh, DESIGN-SPEC §7):
#   (a) Ceilings = measured counts on main at gate introduction.
#   (b) Any PR must keep every count ≤ its ceiling. Over = red CI.
#   (c) A PR that lowers a count MUST lower its ceiling in the same PR
#       (the ratchet clicks, monotonically toward 0).
#   (d) A counter at 0 is a hard ban — never raise a ceiling.
#
# Usage:
#   cd frontend && bash scripts/ui-ratchets.sh
#
# Test overrides (mirrors hex-ratchet.sh):
#   UI_RATCHET_SRC_DIR       renderer source root (default src/renderer)
#   UI_RATCHET_CEILING_FILE  ceilings file (default .ui-ratchet-ceilings)
#   UI_RATCHET_TYPE_FLOOR    px floor for css_font_below_floor (default 12)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC_DIR="${UI_RATCHET_SRC_DIR:-$FRONTEND_DIR/src/renderer}"
CEILING_FILE="${UI_RATCHET_CEILING_FILE:-$FRONTEND_DIR/.ui-ratchet-ceilings}"
TYPE_FLOOR="${UI_RATCHET_TYPE_FLOOR:-12}"

if [[ ! -f "$CEILING_FILE" ]]; then
  echo "ERROR: $CEILING_FILE not found — cannot run ui-ratchets." >&2
  exit 2
fi
if [[ ! -d "$SRC_DIR" ]]; then
  echo "ERROR: source dir $SRC_DIR not found." >&2
  exit 2
fi

# grep exits 1 on zero matches; pipefail would abort — wrap with || true.
count_css_hex_outside_styles() {
  { find "$SRC_DIR" -name '*.css' -not -path "$SRC_DIR/styles/*" -print0 \
    | xargs -0 grep -ohE '#[0-9a-fA-F]{3,8}' 2>/dev/null || true; } | wc -l
}
count_tsx_hex() {
  { grep -rohE '#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?\b' "$SRC_DIR" --include='*.tsx' || true; } | wc -l
}
count_tsx_inline_style() {
  { grep -roh 'style={{' "$SRC_DIR" --include='*.tsx' || true; } | wc -l
}
count_css_font_below_floor() {
  # Both greps need || true: the second exits 1 on empty input and pipefail
  # would kill the script silently mid-run (caught by the fixture tests).
  { grep -rohE 'font-size:[[:space:]]*[0-9.]+px' "$SRC_DIR" --include='*.css' || true; } \
    | { grep -oE '[0-9.]+' || true; } | awk -v floor="$TYPE_FLOOR" '$1 < floor' | wc -l
}
count_tsx_raw_range() {
  { grep -roh 'type="range"' "$SRC_DIR" --include='*.tsx' || true; } | wc -l
}
count_tsx_native_select() {
  # '<select' does not match '</select>' (the slash breaks the literal).
  # components/common/Select.tsx is EXCLUDED by path: it is the one legal
  # wrapper (the Select primitive, COMPONENT-SPEC §3) and necessarily
  # contains the single sanctioned native <select>. Counting it would park
  # the counter one above the true adoptable debt forever. Every other
  # .tsx still counts toward the 56 → 0 ratchet.
  { find "$SRC_DIR" -name '*.tsx' \
      -not -path "$SRC_DIR/components/common/Select.tsx" -print0 \
    | xargs -0 grep -oh '<select' 2>/dev/null || true; } | wc -l
}
count_css_raw_rgba() {
  # tokens.css is the ONLY legal home for primitive rgba values (the
  # --cx-*-alpha families) — everything else counts as debt.
  { find "$SRC_DIR" -name '*.css' -not -path "$SRC_DIR/styles/tokens.css" -print0 \
    | xargs -0 grep -oh 'rgba(' 2>/dev/null || true; } | wc -l
}

FAILED=0

check() {
  local key="$1"
  local count
  count="$("count_$key" | tr -d '[:space:]')"
  count="${count:-0}"
  local ceiling
  ceiling="$(grep -E "^${key}=" "$CEILING_FILE" | head -1 | cut -d= -f2 | tr -d '[:space:]')"
  if ! [[ "$ceiling" =~ ^[0-9]+$ ]]; then
    echo "ERROR: no integer ceiling for '$key' in $CEILING_FILE" >&2
    exit 2
  fi
  if [[ "$count" -gt "$ceiling" ]]; then
    echo "ui-ratchet $key: $count (ceiling $ceiling) FAIL" >&2
    FAILED=1
  else
    echo "ui-ratchet $key: $count (ceiling $ceiling) PASS"
  fi
}

check css_hex_outside_styles
check tsx_hex
check tsx_inline_style
check css_font_below_floor
check tsx_raw_range
check tsx_native_select
check css_raw_rgba

if [[ "$FAILED" -eq 1 ]]; then
  echo "FAIL: a debt counter exceeded its ceiling. Use tokens/primitives instead," >&2
  echo "      or if you removed violations, click the ratchet: lower the ceiling" >&2
  echo "      in .ui-ratchet-ceilings in this same PR." >&2
  exit 1
fi

echo "PASS: all ui-ratchet counters within ceilings."
exit 0
