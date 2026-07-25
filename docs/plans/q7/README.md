# Q7 — Multi-Headed L Benchmark + SPEC-5 Backbone Spike

The L axis is the perceptual substrate for the vision direction — three pretrained backbones (DINOv2 vision, CLIP vision-text, CLAP audio-text) running behind a single inference queue, sparse-encoded with slerp interpolation at runtime. Q7 gates Tier 5 with a hard measurement (`<50ms` interpolation jitter on M-series Mac); per CTO finding, SG-3 (latent NaN sentinel), SG-4 (audio-thread isolation), and SG-8 (memory-pressure auto-disable) land alongside Q7, not late at E6. This roadmap covers **two handoff sessions, 12 PRs.** Session 1 = benchmark + measurement + design (7 PRs, ships SG-7 codec timeout as an early win). Session 2 = implementation gated on the Session 1 verdict (5 PRs).

## Anchor docs

| Doc | Purpose |
|---|---|
| `~/.claude/plans/entropic-synth-paradigm-vision.md` | Canonical vision; ~30 PRDs across 6 categories; Round 1 decisions locked |
| `~/.claude/plans/entropic-spec-5-l-backbone.md` | The spec Q7 is built against (multi-headed L worker + SG-4 + Q7 benchmark) |
| `~/.claude/plans/entropic-spec-3-safety-gates.md` | SG-1, SG-3, SG-5, SG-8 contracts |
| `~/.claude/plans/entropic-spec-7-post-pass.md` | SG-7 codec timeout body (PR #2) |
| `~/.claude/plans/entropic-spec-2-b4lite-schema.md` | Lowercase axis canon + 8-member BindingRule union |
| `~/.claude/projects/-Users-nissimagent/memory/entropic-synth-paradigm.md` | Project memory file — read first |

## Worktree

- **Path:** `~/Development/entropic-q7-bench`
- **Branch:** `feat/q7-l-backbone-benchmark` (off `origin/main` of `entropic-v2challenger`, commit `839345f`)
- **Coordination:** parallel Creatrix BUILD session is committing PR-zero Epic 1-5 in the main checkout. Q7 worktree is isolated. No surface collision (Q7 touches `backend/src/inference/`, `backend/src/safety/pressure/`, `backend/scripts/q7_benchmark/`, `.github/workflows/q7-smoke.yml` — none of these exist today).

---

## Session 1 — Benchmark + Design (7 PRs)

Two early green merges (#1, #2) before any hardware-dependent work. SG-7 promoted from Session 2 per CTO Q1 — independent of Q7 verdict, ships regardless.

| PR | Scope | Sonnet delegated | Opus driven | Test plan | Decision docs |
|---|---|---|---|---|---|
| **#1 Scaffold + CI smoke** | `backend/scripts/q7_benchmark/` skeleton, `requirements-q7.txt`, `Makefile`, `.github/workflows/q7-smoke.yml` (mock-model smoke on every push), `docs/plans/q7/` + `docs/decisions/q7/` + `docs/runbooks/q7/` dirs | YAML, requirements pinning, README boilerplate, Makefile targets | Directory layout; CI matrix; `q7-bench` subcommand vs separate CLI | Harness imports cleanly with `--mock`; JSON schema validates; CI green on push | DEC-Q7-001 dir layout · DEC-Q7-002 CI matrix |
| **#2 SG-7 codec timeout** | `backend/src/video/codec_timeout.py` + 5 callsite wraps (`video/ingest.py`, `video/writer.py`, `video/reader.py`, `audio/decoder.py`, `audio/streaming_decoder.py`) + 2 tests | Full module from SPEC-7 §5 body; callsite wraps via prepared sed | Threading model: `signal.SIGALRM` vs `threading.Timer` vs subprocess-based | Timeout fires on truncated file; healthy file passthrough; 5 callsites pass tests | DEC-Q7-003 codec timeout mechanism |
| **#3 Model loaders + backend detector** | DINOv2 ViT-S/14, CLIP ViT-B/32, CLAP HTSAT-base loaders; backend chain MLX → PyTorch MPS → CPU with health check | Loader bodies, fixture scaffolds, mock-weight tests | Backend fallback algorithm; SHA-256 pinning + HF model rotation fallback | Each model loads on real backend; mock backend returns synthetic embeddings of correct shape | DEC-Q7-004 backend fallback · DEC-Q7-005 model versions + SHA pinning |
| **#4 Latency + throughput benchmark + sidecar topology** | Per-model encode p50/p95/p99; queue saturation throughput; cold-load probe; JSON report writer; **sidecar topology decision** (one process + two ZMQ endpoints vs two processes — blocks PR #9) | Timing harness, JSON serialization | N iterations, warmup count, statistical methodology, topology decision | Latency benchmark runs in `--mock` and `--measure` modes; JSON schema validates | DEC-Q7-006 stats methodology · **DEC-Q7-008 sidecar topology (CRITICAL — blocks PR #9)** |
| **#5 Interpolation jitter (the Tier 5 gate)** | Sparse-encode + slerp at sparsity ratios 1:4, 1:8, 1:16, 1:32; verdict computation; "latency under load" scenario (10-effect chain loaded + Q7 measurement; flag if jitter degrades >2×) | Slerp impl, stats aggregation | Verdict interpretation (which percentile is the gate? which sparsity is canonical?) | Synthetic frame source; deterministic slerp output; jitter computation matches reference | DEC-Q7-007 jitter threshold (p95? p99? max?) · DEC-Q7-009 canonical sparsity |
| **#6 SG-8 design + degrade canonicalization + base-budget + download UX + cache invalidation** | Closes 3-partial-ordering conflict across BUILD-PLAN/SPEC-3/SPEC-5; memory base = `psutil` *available* not *total* (16GB M1 ≈ 10-11GB free); first-launch HF download UX (progress + SHA-256 verify + retry); latent cache: project-level `latentCacheVersion` metadata + silent re-compute on backbone version change | psutil wrapper, degrade state-machine scaffold | Canonical degrade order, budget thresholds, UX design | psutil ceiling probe deterministic; pressure thresholds trigger correctly; degrade order matches canonical | DEC-Q7-010 degrade order canonical · DEC-Q7-011 base memory budget · DEC-Q7-012 model download UX · DEC-Q7-013 latent cache invalidation |
| **#7 Report + runbook + verdict + Intel** | Markdown report writer with matplotlib charts; runbook for user execution on their Mac; Tier 5 GO/NO-GO commit landed in memory + ACTIVE-TASKS; Intel Mac documented as unsupported (one paragraph, no PR) | Markdown body, chart code | Verdict prose; recommendation | Report renders from golden JSON correctly | DEC-Q7-014 Intel Mac unsupported |

**Session 1 ship target:** at minimum PR #1 + PR #2 merged. PRs #3-7 depend on hardware access (user runs `--measure` on their M-series Mac, pastes back JSON). Verdict commit landed in memory file + ACTIVE-TASKS.

---

## Session 2 — Implementation (5 PRs, gated on Session 1 verdict)

| PR | Scope | Sonnet delegated | Opus driven | Test plan | Decision docs |
|---|---|---|---|---|---|
| **#8 SPEC-2 schema reconciliation** | Resolves P1-C (`Lane`→`AutomationLane`, `InterpolationMode` confirm) + P1-D (`domain='y'` renderer site pin) by reading current `frontend/src/renderer/store/types.ts:261` + lane-eval site (PR-B refactor location). Mechanical rename via prepared sed | Execute the rename | Scope verification; SPEC-2 update | `tsc` passes; no broken imports | DEC-Q7-015 SPEC-2 rename-or-annotate |
| **#9 L backbone worker process skeleton** (**CONDITIONAL on Q7 PASS**) | ZMQ IPC, shared queue, no UI wiring; lives at `backend/src/inference/l_backbone.py` (avoids `backend/src/memory/` namespace collision); topology per PR #4 decision | Worker boilerplate, IPC schema | Queue contract, lifecycle vs Electron | Worker spawns + accepts encode jobs + returns embeddings; queue saturation handled gracefully | DEC-Q7-016 worker lifecycle vs Electron |
| **#10 SG-4 audio-thread isolation contract** | Lint rule that fails CI if anything in `backend/src/audio/realtime/` imports L modules | Lint rule body, CI YAML, contract doc | Contract surface (what is "realtime audio"?) | Lint rule fires on intentional violation; passes on clean tree | DEC-Q7-017 realtime audio boundary |
| **#11 SG-8 contract implementation** | RAII pressure monitor + feature registry + CI test, extracted from PR #6 design notes. Located at `backend/src/safety/pressure/` (avoids `backend/src/memory/` namespace clash) | RAII wrapper + tests | SG-8 contract API per SPEC-3 §5 | Pressure simulator triggers degrade in canonical order; recovery re-enables features | (extracted from PR #6) |
| **#12 Demo trilogy renders** | Y-is-Time + painted-blur + audio-LFO-stripes wired to `entropic-cli` at `backend/src/cli.py`; uses SPEC-2 lowercase axis schema (locked) | Render command scripts, ffmpeg wrappers | Cinematic curation, demo selection | Each demo renders to mp4 without error; output frame hashes match golden | DEC-Q7-018 demo validation strategy |

**Session 2 ship target:** PR #8 + PR #11 + PR #12 merged (schema + SG-8 + demos). PRs #9 + #10 ship **conditional on Q7 PASS**.

---

## Architecture risks (CTO finding)

| ID | Risk | Mitigation | Owner PR |
|---|---|---|---|
| **R1** | Sidecar topology — two Python processes vs one process + two ZMQ endpoints | Decision doc + benchmark of IPC contention; lean ONE process for v1 | PR #4 (blocks PR #9) |
| **R2** | `backend/src/memory/` already exists — namespace collision with SG-8 work | Scope to `backend/src/safety/pressure/` for SG-8 and `backend/src/inference/l_backbone.py` for L worker | Verify in PR #1 |
| **R3** | Latency under load ≠ fresh-boot latency | Second benchmark scenario: 10-effect chain loaded + Q7 measurement; flag if jitter degrades >2× | PR #5 |
| **R4** | Benchmark drift — macOS / MLX / PyTorch MPS regressions | Schedule monthly benchmark CI on a known-good runner | Flagged in PR #7 verdict |
| **R5** | HF model availability — checkpoints rotate or repos go private | Vendor tarballs to controlled S3/GCS bucket as fallback | PR #3 model versioning |
| **R6** | `q7-bench` subcommand vs separate CLI entry | Add `q7-bench` subcommand to existing `entropic-cli` at `backend/src/cli.py` | PR #1 |

---

## What's NOT in this spike

- **SG-1 GPU resource lifetime contract** — deferred to Session 3+. Blocks Vision Tier 2 (C2/C3/A4 + B7/B8) but NOT Q7 Tier 5 gate. SPEC-3 §2 has the contract design; pair with first Tier 2 effect build.
- **Intel Mac support** — documented unsupported per Vision §11 ("Mac-first commit"). No PR. One paragraph in DEC-Q7-014.
- **L-axis modulation features** (C5 Latent-Trajectory, C6/C8 feedback, D4 Latent Granulator) — Tier 5 implementation work AFTER Q7 verdict passes.
- **Genoscope (A2)** — Tier 6 research, separate spike.
- **Per-project VAE training (E1)** — separate spike after Q7.
- **Plugin SDK (E7) + SG-9 sandbox** — Tier 7, out of scope.

---

## Test strategy

### Smoke tier (CI on every push, no GPU)

- Harness imports cleanly
- Mock backend returns synthetic results
- JSON schema validates
- All unit tests pass
- `q7-smoke.yml` workflow runs on every push to `feat/q7-l-backbone-benchmark`

### Integration tier (manual, requires Apple silicon)

- Real model loads (DINOv2 + CLIP + CLAP)
- Real measurements via `--measure`
- Verdict renders via `--report`

### Regression tier

- `--report` mode on golden JSON produces consistent output
- Snapshot tests for chart rendering

### Lessons applied

- **`docs/solutions/2026-02-28-ux-blind-qa-prevention.md`:** every backbone test must exercise the REAL worker IPC, not mock-in-isolation. Mock backends only legitimate for harness-level smoke. Integration tests use real ZMQ.
- **`docs/solutions/2026-02-28-e2e-test-pyramid.md`:** Vitest unit > component > Playwright E2E with justification. Q7 is backend-only so frontend pyramid doesn't apply, but the principle (test at the right layer) holds: harness logic → pytest unit; worker IPC → pytest integration with real subprocess; full Q7 flow → integration only with `--measure` flag.

---

## Push cadence (micro-loop)

### Per item (A1, A2, B1, …)

```
1. UNCERTAINTY?  → if any UNK in plan affects this item → write/extend decision doc first
2. SONNET?       → if item is mechanical → llm_delegate (one round-trip)
3. WRITE         → apply Sonnet output OR write directly (Opus only for non-mechanical)
4. SMOKE         → pytest -m smoke OR direct exec
5. COMMIT        → `[q7] <phase>: <one-line>` Conventional Commit
6. PUSH          → git push (or PR update)
7. VALIDATE      → read tool output, confirm expected
8. NEXT
```

### Per PR (every 3-6 items)

```
A. Open PR — `gh pr create --base main --draft` (or non-draft if green)
B. CI watch — Monitor armed on PR status
C. Green → request user merge nod (no standing auth on v2challenger) → squash merge → next PR off updated main
   Red → fix loop (Phase 6 in /eng)
```

---

## Cron orchestration

| Field | Value |
|---|---|
| Cron ID | `096c1c2f` |
| Cadence | `13 * * * *` (every hour at :13 local) |
| Expiry | 7 days (auto) |
| Action | Invokes `/cto` to check `git log --oneline -10`, `git status --short`, open PRs; reads latest unchecked item in `docs/plans/q7/PR-*-plan.md`; reports status + next step + blockers; resumes work; delegates mechanical work to Sonnet per Gate 17 |

Cancel via `CronDelete 096c1c2f` if interrupting.

---

## Sonnet delegation policy

| Delegated to Sonnet via `llm_delegate` | Opus retains |
|---|---|
| Loader boilerplate from a spec doc | Reading the spec to derive the contract |
| pytest test bodies from a fixture + assertion list | Choosing what to assert |
| README / runbook body from an outline | Outline + verdict prose |
| Mechanical file-by-file renames (via prepared sed) | Choosing the rename + verifying scope |
| JSON schema → dataclass codegen | JSON schema design |
| YAML CI scaffolds from a template | CI gate decisions (when to fail, what to skip) |
| Doc rendering (decision doc body from a bullet list of options + rationale) | The bullet list of options + the choice |
| Markdown chart code from a data shape | Chart selection + verdict prose |
| Threading / signal / subprocess boilerplate | Threading model choice |

**Trigger:** every batch ≥5 items or ≥2K chars of raw mechanical text → `mcp__llm-router__llm_delegate` with one-sentence task spec + return-format constraint. If router returns `routed_to: claude`, Opus handles directly.

---

## Coordination with parallel sessions

- **Creatrix BUILD session** is actively committing PR-zero Epic 1-5 (per-track effect chain) in the main checkout at `~/Development/entropic-v2challenger/`. Q7 worktree is OFF MAIN, touches different files (`backend/src/inference/`, `backend/src/safety/pressure/`, `backend/scripts/q7_benchmark/`) — no surface collision.
- **Demo renders (PR #12)** use SPEC-2 lowercase axis schema which is LOCKED (per ACTIVE-TASKS P1-A fix in 2026-06-03 session-close). When Creatrix PR-B lands with INJ-5, re-validate demo `.entropic.json` files (Sonnet-mechanical).
- **Vision-session SPEC-2 apply pass (P1-C, P1-D)** ships as PR #8 (Session 2). Was blocked in the 2026-06-03 evening session due to live-edit collision with Creatrix session.

---

## Ship criteria per session

| Session | Minimum ship | Stretch ship | Verdict |
|---|---|---|---|
| **Session 1** | PR #1 + PR #2 merged (scaffold + SG-7) | PR #3-7 merged + measurement-paste-back complete + verdict commit landed | Tier 5 GO/NO-GO determined |
| **Session 2** | PR #8 + PR #11 + PR #12 merged (schema + SG-8 + demos) | PR #9 + PR #10 merged (CONDITIONAL on Q7 PASS) | Tier 5 implementation ready OR L-axis deferred to v1.1 per Vision §11 |

---

## Handoff format

At end of each session, write to `~/Documents/Obsidian/handoffs/HANDOFF-YYYY-MM-DD-HH:MM-q7-<sessionname>.md` with:

- **Shipped PRs** (number, title, SHA, merged-at)
- **Open follow-ups** (queued items, blockers, who owns)
- **Decision docs landed** (DEC-Q7-NNN list with one-line summary)
- **Verdict commit SHA** (the commit that landed Tier 5 GO/NO-GO in `~/.claude/projects/-Users-nissimagent/memory/entropic-synth-paradigm.md`)
- **Next-session entry point** (cron prompt re-fires, but human-readable resume hint for `/today` and `/eng` skill)
- **Memory updates** (`MEMORY.md` index entries added/changed)
- **Operator tip applied** (latest 48h handoffs were read at session start — process gate per ACTIVE-TASKS queue item)

---

*Last updated 2026-06-03. Cron 096c1c2f armed for hourly /cto orchestration.*
