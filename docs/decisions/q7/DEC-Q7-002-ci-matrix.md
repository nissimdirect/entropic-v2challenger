# DEC-Q7-002 — CI matrix for Q7 smoke workflow

**Status:** Decided 2026-06-03
**Owner:** Q7 Vision session

## Question

What runners and Python versions does the `q7-smoke.yml` GitHub Actions workflow target?

## Constraint

- Existing `.github/workflows/test.yml` runs against current main; pattern reuse is preferred
- Q7 smoke must run **without Apple silicon** (CI runners don't expose Metal/MLX) → mock backend only
- Q7 measurement (PR #5+) requires Apple silicon and runs MANUALLY on the user's M-series Mac, not in CI

## Decision

| Tier | Runner | Python | Trigger | Scope |
|---|---|---|---|---|
| Smoke | `ubuntu-latest` | `3.12` (floor) | every push to `feat/q7-*`, every PR to `main`, manual `workflow_dispatch` | `make q7-smoke` — mock backend only |
| Integration | `macos-14` (Apple silicon) | `3.12` | DEFERRED to PR #5 | Real model load + benchmark |
| Hardware drift CI | `macos-14` (Apple silicon) | `3.12` | DEFERRED to post-Session-2 | Monthly cron re-run vs known-good golden |

**Q7-smoke workflow caches:** `~/.cache/pip` keyed on `requirements-q7.txt` hash; no model cache (mock backend doesn't load models).

**Failure policy:** smoke must pass for PR to merge. Hardware integration runs manually; failures don't block merge but block Tier 5 verdict commit.

## Considered alternatives

- **Run smoke on macOS too** — REJECTED. Slower runners (3-5× cost), no value (mock backend doesn't exercise Mac-specific code paths). Use Ubuntu for smoke.
- **Add Python 3.13 / 3.14 to matrix** — REJECTED for now. Memory file mentions Python 3.14 in use, but Q7 floor is 3.12 per pyproject.toml. Add later if package deps justify.
- **Self-hosted macOS runner** — REJECTED. Adds infra ops burden (GitHub-hosted macos-14 is sufficient for occasional integration runs; we don't need every-push macOS CI).
- **Run integration in this same workflow on schedule** — DEFERRED. Set up the cron in PR #7 after we know the actual benchmark timing.

## Workflow shape (target for PR #1)

```yaml
name: q7-smoke
on:
  push:
    branches: [feat/q7-**]
  pull_request:
    branches: [main]
    paths:
      - 'backend/scripts/q7_benchmark/**'
      - 'backend/tests/test_q7_benchmark/**'
      - '.github/workflows/q7-smoke.yml'
  workflow_dispatch:

jobs:
  smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
          cache: pip
          cache-dependency-path: backend/scripts/q7_benchmark/requirements-q7.txt
      - run: pip install -r backend/scripts/q7_benchmark/requirements-q7.txt
      - run: make q7-smoke
      - run: pytest backend/tests/test_q7_benchmark/ -m smoke -q
```

## Verification

Push the branch with `q7-smoke.yml` and `make q7-smoke` target; check Actions tab; workflow runs green.

## Cross-references

- `docs/plans/q7/PR-01-scaffold-plan.md`
- `docs/decisions/q7/DEC-Q7-001-dir-layout.md`
- Existing `.github/workflows/test.yml` as reference for conventions
