# DEC-Q7-001 — Directory layout for Q7 spike + downstream Session 2 modules

**Status:** Decided 2026-06-03 · CTO-orchestrated
**Owner:** Q7 Vision session
**Scope:** Anchors directory locations for Q7 benchmark + L worker + SG-8 pressure monitor

## Question

Where do the Q7 benchmark scripts, the L backbone worker (Session 2 PR #9), and the SG-8 memory-pressure monitor (Session 2 PR #11) live in the v2challenger backend tree?

## Constraint discovered

`backend/src/memory/` already exists (verified 2026-06-03 in worktree at `2ad5399`). Contains `writer.py` — shared-memory mmap ring buffer for frame transport between the Python ZMQ sidecar and the Electron renderer (the v2 Challenger "C++ mmap shared memory" path locked at Rev 5). Cannot collide.

## Decision

| Module | Path | Rationale |
|---|---|---|
| Q7 benchmark harness | `backend/scripts/q7_benchmark/` | Matches existing `backend/scripts/` convention (`generate_oracles.py`, `extract_effect_metadata.py`, `test_health.py`). Standalone runnable. |
| L backbone worker (Session 2 PR #9) | `backend/src/inference/l_backbone.py` (+ `inference/` package) | New top-level concern; `inference/` is a clean name with no existing usage. Module per backbone (`dinov2.py`, `clip.py`, `clap.py`) + dispatcher (`l_backbone.py`). |
| SG-8 memory-pressure monitor (Session 2 PR #11) | `backend/src/safety/pressure/` (+ `safety/` package) | `safety.py` already exists at top level (single file with input validation + preflight checks). Promote to package; SG-8 lives in `safety/pressure/` subpackage. Companion: SG-3 latent sentinel can live at `safety/latent_sentinel.py`. |
| Q7 tests | `backend/tests/test_q7_benchmark/` | Matches existing `test_<thing>` convention. |
| Q7 plan docs | `docs/plans/q7/` | Per `/eng` skill Phase 2 convention. |
| Q7 decision docs | `docs/decisions/q7/` | Per "more granular documentation when there's uncertainty" directive (2026-06-03 user). |
| Q7 runbooks | `docs/runbooks/q7/` | Per "two handoff sessions" directive — runbooks survive session changes. |

## Considered alternatives

- **`backend/src/memory/pressure/`** — REJECTED. Collides with shmem semantics; `memory.writer` is buffer I/O, `memory.pressure` would be system RAM monitoring — overloaded namespace.
- **`backend/src/q7/`** — REJECTED. "Q7" is a benchmark/spike codename, not a permanent feature label. The work that ships under Q7 (L backbone + SG-3/4/8) keeps living after the benchmark closes. Use semantic names.
- **`backend/src/l_axis/`** — REJECTED. "L axis" is paradigm vocabulary; the implementation concern is inference. Semantic over thematic.
- **Promote `safety.py` to `safety/` package now** — ACCEPTED. Currently `backend/src/safety.py` is a single file. Touching it to add SG-8 means refactoring to a package. Decision: refactor to package in PR #11, not now. PR #1 only creates the dir + `__init__.py` stub.

## Side effects to track

- `backend/src/safety.py` import paths — any existing `from safety import ...` callers must keep working when `safety.py` → `safety/__init__.py` in PR #11. Verify in PR #11 via grep before refactor.
- `backend/src/inference/` creates a new top-level package. Nothing imports it today (verified via grep). Safe.
- Test discovery — pytest is configured with `pythonpath = ["src", "tests"]`; new packages auto-discover.

## Verification

Run when this PR closes:

```bash
cd ~/Development/entropic-q7-bench
test -d backend/scripts/q7_benchmark && echo "OK: q7_benchmark dir"
test ! -d backend/src/q7 && echo "OK: no q7 dir created in src"
grep -r "from memory.pressure\|import memory.pressure" backend/ && echo "FAIL: namespace collision" || echo "OK: no memory.pressure imports"
```

## Cross-references

- `docs/plans/q7/README.md` — master roadmap, references this decision
- `docs/plans/q7/PR-01-scaffold-plan.md` — applies this decision in scaffold
- Memory: `~/.claude/projects/-Users-nissimagent/memory/entropic.md` — confirms shmem semantics of `backend/src/memory/`
- CTO finding R2 (this orchestration session)
