#!/usr/bin/env bash
# regen-baselines.sh — EMERGENCY local regeneration of the shell visual
# baselines (frontend/tests/e2e/visual/shell-baselines.spec.ts).
#
# ┌────────────────────────────────────────────────────────────────────────┐
# │  WARNING: CI-GENERATED BASELINES ARE CANONICAL.                        │
# │                                                                        │
# │  Baselines are born ON the CI runner (workflow_dispatch — USER-merge   │
# │  item) per FRONTEND-SDLC.md §3. A dev-Mac render is NOT the same       │
# │  compositor output as the CI runner. Use this script ONLY when CI      │
# │  generation is unavailable AND a baseline must exist right now, and    │
# │  say so explicitly in the PR that commits the result. Expect the next  │
# │  CI generation run to replace whatever this produced.                  │
# └────────────────────────────────────────────────────────────────────────┘
#
# What it does (one command, hermetic fixture — 1280×800, DPR 1):
#   1. Builds the Electron app (electron-vite build)
#   2. Runs the baseline spec with --update-snapshots, with
#      CREATRIX_REGEN_BASELINES=1 to bypass the no-baselines-yet self-skip
#
# Output: frontend/tests/e2e/visual/shell-baselines.spec.ts-snapshots/

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo ""
echo "!!  EMERGENCY LOCAL BASELINE REGEN  !!"
echo "!!  CI-generated baselines are canonical (FRONTEND-SDLC.md §3).  !!"
echo "!!  Dev-Mac baselines are a stopgap — declare this in your PR.   !!"
echo ""

cd "$REPO_ROOT/frontend"

echo "==> Building Electron app (electron-vite build)…"
npx electron-vite build

echo "==> Regenerating baselines (--update-snapshots)…"
CREATRIX_REGEN_BASELINES=1 npx playwright test \
  tests/e2e/visual/shell-baselines.spec.ts \
  --update-snapshots

echo ""
echo "Done. Snapshots written to:"
echo "  frontend/tests/e2e/visual/shell-baselines.spec.ts-snapshots/"
echo ""
echo "REMINDER: CI-generated baselines are canonical. Commit these only as a"
echo "declared emergency stopgap, and let the next CI generation run replace"
echo "them."
