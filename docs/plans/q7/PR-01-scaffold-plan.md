# PR #1 — Scaffold + CI Smoke

Lays down the Q7 benchmark directory structure, dependency manifest, mock-model CI smoke workflow, and project bookkeeping (Makefile targets, decision docs, runbooks). No model loads, no real measurements — this is the foundation PR that every later PR builds on. Ships as a fast green merge to prove the CI gate works.

## Uncertainty register

- [x] **UNK-01:** Is `backend/src/memory/` already used? → **Resolved:** yes, it's shared-memory mmap ring buffer for frame transport (`writer.py`). SG-8 cannot go there. Decision: `backend/src/safety/pressure/` for SG-8 + `backend/src/inference/l_backbone.py` for L worker. Logged in `../decisions/q7/DEC-Q7-001-dir-layout.md`.
- [x] **UNK-02:** Existing CI workflow shape? → **Resolved:** single `test.yml`. Q7-smoke gets its own `q7-smoke.yml` matching test.yml conventions.
- [x] **UNK-03:** Python version constraint? → **Resolved:** `>=3.12` per pyproject.toml. Q7 deps must be 3.12-compatible. MLX requires Apple silicon + Python 3.9+ — fine.
- [ ] **UNK-04:** Add Q7 deps to main `pyproject.toml` `[project.optional-dependencies] q7 = [...]` OR keep separate `requirements-q7.txt`? → Decision pending; recommend separate file for now (CI installs it; doesn't pollute main install).
- [ ] **UNK-05:** `q7-bench` subcommand on `entropic-cli` vs standalone `python -m q7_benchmark`? → Decision pending; lean toward standalone module entrypoint for now (zero coupling to CLI args; revisit at PR #7).

## Scope

### What to test
- [ ] `python -m q7_benchmark.runner --mock --report` exits 0 and writes JSON report
- [ ] Mock backend returns synthetic embeddings of declared shape (DINOv2 384, CLIP 512, CLAP 512)
- [ ] JSON report schema validates against `schemas/q7-report.schema.json`
- [ ] Makefile target `make q7-smoke` runs the mock benchmark
- [ ] CI workflow `q7-smoke.yml` runs on every push to `feat/q7-*` and PR to main
- [ ] Existing test suite still passes (no regressions to `backend/tests/`)

### Edge cases to verify
- [ ] Empty/missing model registry → mock backend defaults to all three heads
- [ ] Invalid sparsity ratio CLI arg → harness rejects with non-zero exit
- [ ] JSON output is deterministic in `--mock` mode (same input → same hash)
- [ ] Backend detector returns `mock` when no real backend available + `--mock` flag set
- [ ] Backend detector returns `mock` when no real backend available + `--mock` NOT set → exits with clear error
- [ ] Concurrent invocations don't trample each other's output (PID in filename)

### How to verify (reproduction commands)
- Smoke run: `cd backend && python -m q7_benchmark.runner --mock --report --out /tmp/q7-mock.json`
- Schema validation: `python -m q7_benchmark.report --validate /tmp/q7-mock.json`
- Determinism check: `make q7-smoke` twice; `diff` the two JSONs (mock mode is seeded)
- CI: push the branch; verify `q7-smoke` workflow runs and passes
- Working: report JSON present, schema-valid, contains `mode=mock` + all three head entries
- Broken: schema mismatch, missing head entry, non-zero exit, CI red

### Existing test patterns to follow
- Test framework: pytest (per `pyproject.toml`, smoke marker = `pytest -m smoke`)
- Example test files: `backend/tests/test_engine/` for backend logic; `backend/tests/oracles/` for the established pattern of CLI-invocation + result-check
- Pyramid layer: harness logic is unit-level → `pytest -m smoke` smoke tests are the right tier

## Checkboxed items

### A. Decision docs first
- [ ] **DEC-Q7-001** Dir layout: `backend/scripts/q7_benchmark/` (runner, report, mock, schemas) + `backend/src/safety/pressure/` (Session 2 SG-8) + `backend/src/inference/l_backbone.py` (Session 2 PR #9). Memory/ namespace verified at `backend/src/memory/writer.py` = shmem.
- [ ] **DEC-Q7-002** CI matrix: `ubuntu-latest` for smoke (no Metal, no MLX) + `macos-14` for hardware integration in PR #5+ (deferred). Run `python 3.12` only (the floor); 3.13 / 3.14 not gated on (memory says 3.14 in use, but tests run on 3.12 floor).

### B. Files to add
- [ ] `backend/scripts/q7_benchmark/__init__.py` — package marker, exposes `runner.main` and `report.main`
- [ ] `backend/scripts/q7_benchmark/runner.py` — CLI entrypoint (skeleton; full impl in PR #3+)
- [ ] `backend/scripts/q7_benchmark/report.py` — report writer + schema validator (skeleton)
- [ ] `backend/scripts/q7_benchmark/backends.py` — backend detector (skeleton; full impl in PR #3)
- [ ] `backend/scripts/q7_benchmark/mock.py` — mock backend (deterministic synthetic embeddings)
- [ ] `backend/scripts/q7_benchmark/schemas/q7-report.schema.json` — JSON Schema for report
- [ ] `backend/scripts/q7_benchmark/requirements-q7.txt` — pinned Q7-only deps
- [ ] `backend/scripts/q7_benchmark/README.md` — runbook stub (linked to `docs/runbooks/q7/`)
- [ ] `backend/tests/test_q7_benchmark/__init__.py`
- [ ] `backend/tests/test_q7_benchmark/test_smoke.py` — runs `--mock --report`, asserts JSON valid, deterministic, has all three heads
- [ ] `backend/tests/test_q7_benchmark/test_backend_detect.py` — mock backend resolves, errors when no backend
- [ ] `Makefile` updates — add `q7-smoke`, `q7-measure`, `q7-report` targets
- [ ] `.github/workflows/q7-smoke.yml` — runs `make q7-smoke` on every push + PR to main
- [ ] `docs/runbooks/q7/q7-smoke.md` — how to run smoke locally + what the mock backend does

### C. Validation
- [ ] `make q7-smoke` exits 0 locally
- [ ] `pytest backend/tests/test_q7_benchmark/ -m smoke -q` passes
- [ ] Existing `pytest backend/tests/` still passes (no regressions)
- [ ] `q7-smoke.yml` workflow runs green on the push that lands these files

### D. PR open + merge
- [ ] `gh pr create --base main --draft --title "[q7] PR #1: scaffold + CI smoke"`
- [ ] Wait for CI green
- [ ] Move to ready-for-review; request user merge nod (no standing auth on v2challenger)
- [ ] Squash merge; delete branch
- [ ] Rebase Q7 worktree on updated main for PR #2

## Risks for this PR (subset of master)

- **R2 confirmed:** memory/ namespace = shmem. Q7 work uses safety/ and inference/.
- **R6 still open:** `q7-bench` subcommand on entropic-cli vs standalone — defer to PR #7 (low-stakes UX choice).

## Estimated effort

- Decision docs + scaffold files + smoke tests: ~1-2h Opus + Sonnet delegation for boilerplate
- CI workflow + Makefile: ~30min
- PR open + CI cycle + merge: ~30min

## Test plan summary (TL;DR)

Smoke = `make q7-smoke` produces deterministic, schema-valid JSON with three mock head entries; CI runs `make q7-smoke` on every push; no regressions to existing 1814+ test suite.

## Next PR

PR #2 — SG-7 codec timeout (independent of Q7 verdict; ships regardless).
