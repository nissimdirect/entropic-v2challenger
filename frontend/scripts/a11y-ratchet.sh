#!/usr/bin/env bash
# a11y-ratchet.sh — frontend-framework F3 gate: jsx-a11y accessibility ratchet
#                   (UC6, OD-4 verdict)
#
# Sibling of ui-ratchets.sh / hex-ratchet.sh. Runs eslint with the jsx-a11y
# recommended rule set (eslint.config.mjs — a11y rules ONLY, all severities
# forced to "warn"; scope src/renderer/components/**), counts TOTAL warnings
# from --format json, and fails (exit 1) if the count exceeds the ceiling in
# frontend/.a11y-ceiling.
#
# Rules (same governance as hex-ratchet.sh / ui-ratchets.sh, DESIGN-SPEC §7):
#   (a) Ceiling = measured warning count on main at gate introduction (230,
#       measured 2026-07-30 with eslint-plugin-jsx-a11y recommended).
#   (b) Any PR must keep the count ≤ the ceiling. Over = red CI (via the
#       vitest wrapper src/__tests__/a11y-ratchet.test.ts).
#   (c) A PR that lowers the count MUST lower the ceiling in .a11y-ceiling in
#       the same PR (the ratchet clicks, monotonically toward 0).
#   (d) At 0 the gate is a hard ban — never raise the ceiling.
#
# Determinism note: eslint runs with --no-inline-config, so eslint-disable
# comments neither suppress a11y warnings nor error on unknown rules (several
# components carry react-hooks disable comments for a plugin this config does
# not load). Nobody can disable-comment their way under the ceiling; the ONLY
# way down is fixing the markup (or a ceiling click per rule (c)).
#
# Usage:
#   cd frontend && bash scripts/a11y-ratchet.sh
#
# Test overrides (mirrors ui-ratchets.sh; used by a11y-ratchet.test.ts):
#   A11Y_RATCHET_SRC_DIR       lint target dir (default src/renderer/components;
#                              also widens the config's files glob to **/*.tsx
#                              so fixture trees outside the repo match)
#   A11Y_RATCHET_CEILING_FILE  ceiling file (default frontend/.a11y-ceiling)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC_DIR="${A11Y_RATCHET_SRC_DIR:-$FRONTEND_DIR/src/renderer/components}"
CEILING_FILE="${A11Y_RATCHET_CEILING_FILE:-$FRONTEND_DIR/.a11y-ceiling}"

if [[ ! -f "$CEILING_FILE" ]]; then
  echo "ERROR: $CEILING_FILE not found — cannot run a11y-ratchet." >&2
  exit 2
fi
if [[ ! -d "$SRC_DIR" ]]; then
  echo "ERROR: source dir $SRC_DIR not found." >&2
  exit 2
fi
# Canonicalize (resolve symlinks): eslint compares the lint target against its
# base path (the real cwd) as strings. On macOS, os.tmpdir() hands out
# /var/folders/... which is a symlink to /private/var/... — without pwd -P the
# prefixes never match and every fixture file is "ignored because outside of
# base path".
SRC_DIR="$(cd "$SRC_DIR" && pwd -P)"

CEILING="$(head -1 "$CEILING_FILE" | tr -d '[:space:]')"
if ! [[ "$CEILING" =~ ^[0-9]+$ ]]; then
  echo "ERROR: $CEILING_FILE must contain a single integer ceiling." >&2
  exit 2
fi

JSON_OUT="$(mktemp)"
ESLINT_ERR="$(mktemp)"
trap 'rm -f "$JSON_OUT" "$ESLINT_ERR"' EXIT

# Invoke the eslint bin directly with node — NOT via npm exec/npx, which
# resolve through npm_config_* environment variables and behave differently
# when this script runs inside a vitest/npx process tree (observed: npm exec
# broke fixture-mode runs under vitest while passing in a bare shell).
ESLINT_BIN="$FRONTEND_DIR/node_modules/eslint/bin/eslint.js"
if [[ ! -f "$ESLINT_BIN" ]]; then
  echo "ERROR: $ESLINT_BIN not found — run npm ci in frontend/ first." >&2
  exit 2
fi

# ESLint's base path is the CWD (verified empirically on eslint 9.39: targets
# outside the cwd are "ignored because outside of base path", and the config's
# `files` globs resolve against the cwd too). So: live mode runs from
# FRONTEND_DIR (globs match src/renderer/components/**); fixture mode runs
# from the fixture tree itself (the config widens its glob to **/*.tsx when
# A11Y_RATCHET_SRC_DIR is set, so fixture files in os.tmpdir() match).
if [[ -n "${A11Y_RATCHET_SRC_DIR:-}" ]]; then
  RUN_CWD="$SRC_DIR"
else
  RUN_CWD="$FRONTEND_DIR"
fi

# eslint exits 0 when only warnings are emitted; any non-zero here means
# errors (parse failure, config problem) — that is a broken gate, not debt.
set +e
(cd "$RUN_CWD" && node "$ESLINT_BIN" "$SRC_DIR" \
  --config "$FRONTEND_DIR/eslint.config.mjs" \
  --no-inline-config \
  --format json \
  --output-file "$JSON_OUT") 2> "$ESLINT_ERR"
ESLINT_EXIT=$?
set -e

if [[ "$ESLINT_EXIT" -ne 0 ]]; then
  echo "ERROR: eslint exited $ESLINT_EXIT (errors or config failure — all a11y rules are warnings, so this is a broken gate, not a11y debt):" >&2
  cat "$ESLINT_ERR" >&2
  node -e '
    const fs = require("fs");
    try {
      const r = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      for (const f of r) {
        for (const m of f.messages) {
          if (m.severity === 2) console.error(`  ${f.filePath}:${m.line} ${m.ruleId ?? "fatal"} ${m.message}`);
        }
      }
    } catch { /* no json produced */ }
  ' "$JSON_OUT" >&2 || true
  exit 2
fi

COUNT="$(node -e '
  const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  console.log(r.reduce((a, f) => a + f.warningCount, 0));
' "$JSON_OUT")"

if [[ "$COUNT" -gt "$CEILING" ]]; then
  echo "a11y-ratchet: $COUNT warnings (ceiling $CEILING) FAIL" >&2
  echo "FAIL: jsx-a11y warning count exceeded the ceiling. Fix the accessibility" >&2
  echo "      issue (run: npm exec --no -- eslint src/renderer/components --no-inline-config)" >&2
  echo "      or, if you removed warnings, click the ratchet: lower .a11y-ceiling" >&2
  echo "      in this same PR." >&2
  exit 1
fi

echo "a11y-ratchet: $COUNT warnings (ceiling $CEILING) PASS"
exit 0
