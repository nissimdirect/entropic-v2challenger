# Phase 7 Work Packets — Tier 5 Latent (HARD-GATED on Q7 REAL verdict)

**Date:** 2026-06-11 · **Base:** `origin/main` @ `d821ae8` (PR #166) · **Repo:** `~/Development/entropic-v2challenger`
**Sources:** `docs/roadmap/specs/entropic-spec-5-l-backbone.md` (Q7/SG-4/SG-8) · `specs/entropic-spec-3-safety-gates.md` (SG-3 §3, SG-8 §5) · `plans/entropic-synth-paradigm-vision.md` (C5/C6/C8/D4/E1/E6) · `plans/entropic-creatrix-MASTER-SEQUENCE-2026-06-04.md` (Tier 5 table, §5 scaffold-PR decision)

---

## 0. Phase gate — read this first

**Nothing in this phase except P7.0 may start until P7.0 produces a REAL `TIER_5_GO`.**
A mock verdict exists at `~/.entropic/q7-report.MOCK.json` (`backend: "mock"`, TIER_5_GO @ p95=15.09ms). It was deliberately renamed `.MOCK.` and **is not acceptable as the gate** (master sequence §6/§11; `feedback_verb-ask-deliverable-is-the-result.md`).

### G-CHECK — the standard gate precondition (every packet P7.1+ runs this verbatim)

```bash
python3 - <<'EOF'
import json, pathlib, sys
p = pathlib.Path.home() / ".entropic" / "q7-report.json"
if not p.exists():
    sys.exit("STOP: REAL Q7 verdict file missing at ~/.entropic/q7-report.json. Run P7.0.")
d = json.loads(p.read_text())
if d.get("backend") == "mock":
    sys.exit("STOP: verdict file is from the MOCK backend. Not acceptable. Run P7.0.")
state = d.get("verdict", {}).get("state")
if state != "TIER_5_GO":
    sys.exit(f"STOP: verdict is {state!r}. Phase 7 is gated. See P7.0N (NO-GO branch).")
print(f"GATE OK: TIER_5_GO on backend={d['backend']} p95={d['verdict']['canonical_p95_ms']}ms")
EOF
```

### Standard repo preconditions (every code packet, after G-CHECK)

```bash
git -C ~/Development/entropic-v2challenger fetch origin
git -C ~/Development/entropic-v2challenger rev-parse --short origin/main   # expect d821ae8 or a descendant; if main moved, re-verify the packet's VERIFIED paths before starting
```

### Cherry-pick rule (applies to every packet that extracts a parked q7 draft)

The 22 parked q7 drafts (#117–#145) sit on a **stale merge-base** — raw-merging any of them falsely reverts later-merged main work (`feedback_cherry-pick-stale-scaffold-branches.md`). Mandatory procedure:

1. `git log --oneline origin/main..<draft-branch>` — enumerate the payload.
2. `git show --stat <sha>` per payload commit — confirm only the intended files.
3. `git worktree add ~/Development/<packet-wt> -b <packet-branch> origin/main` — fresh branch off origin/main.
4. `git cherry-pick <sha>...` only the enumerated payload commits. **Never `git merge` the draft branch.**
5. On conflict in a file that exists on main: keep main's version unless the packet says otherwise.

### Conventions

- Backend tests: `cd backend && python -m pytest -x -n auto --tb=short` (Q7 suite: `PYTHONPATH=scripts python -m pytest tests/test_q7_benchmark/ -q --confcutdir=tests/test_q7_benchmark -o addopts=""`)
- Frontend tests: `cd frontend && npx --no vitest run`
- Every packet ships as ONE PR; PR body pastes the EVIDENCE block; branch + SHA named in the "ready" message (Gate 18b).
- Common DO-NOT-TOUCH (all packets): `backend/src/zmq_server.py:52` `EXPERIMENTAL_AUDIO_TRACKS` flag · `frontend/src/renderer/stores/**` unless the packet names a store · `docs/roadmap/**` (owned by docs branch) · anything in another packet's scope.

### Discrepancy register (found while authoring; packets below already account for these)

| # | Discrepancy | Resolution used here |
|---|---|---|
| D1 | **The Q7 harness is NOT on `origin/main`** — `git ls-tree origin/main backend/scripts/q7_benchmark/` returns empty (verified 2026-06-11). ROADMAP Phase 7 text implies it's runnable from the main checkout; it is not. | Harness lives on the stacked q7 branch chain. The most complete runnable harness with **all three heads lit** (DINOv2 internal-PR#6, CLIP #13, CLAP #14) is branch `feat/q7-clap-lit` (GH **#132**), checked out at **`~/Development/entropic-q7-clap`**. `~/Development/entropic-q7-bench` (`feat/q7-l-backbone-benchmark`) is only the PR-#1 scaffold — `--measure` raises SystemExit there. P7.0 runs from `entropic-q7-clap`. |
| D2 | SPEC-5 §6.2 says models cache to `~/.creatrix/models/`; the actual loader code (`loaders/cache.py`) uses `~/.entropic/models/q7/<name>/<rev>/` (override: `ENTROPIC_Q7_CACHE_DIR`). | Code wins for P7.0. Path migration is rename-residue work (ROADMAP parallel track #5), not Phase 7. |
| D3 | SPEC-3 §3.3 sentinel constant `MAX_L2_NORM = 32.0`; draft #133 ships `DEFAULT_L2_CEILING = 10.0` (renormalize-to-1 semantics, 5 outcome categories — richer than spec). | Resolved in Phase-5b: P5b.3 keeps the draft API + `DEFAULT_L2_CEILING=10.0`; P5b.5 adds the per-backbone table named `MAX_L2_NORM_PER_BACKBONE`. P7.7a/c only verify. |
| D4 | SPEC-3/SPEC-5 name the enforcement point `backend/src/pipeline/render.py`. **No such path exists.** Real pipeline: `backend/src/engine/pipeline.py` (apply_chain) + `backend/src/engine/compositor.py`. | Packets use the real paths. |
| D5 | Master sequence row 5.2 calls SG-8 "❌ (q7 PR #129 draft)". In fact `monitor.py` + `registry.py` + `budget.py` + `degrade_order.py` are **already on main** (merged #161, `backend/src/safety/pressure/`, byte-identical to the draft) with **zero live callers**. GH #129 is superseded. | Phase-5b P5b.1/P5b.2 wire the merged lib (single owner); do not cherry-pick #129. P7.6 verifies and closes #129 as superseded. |
| D6 | Runbook `q7-measure.md` writes the report to `~/q7-report.json`; the roadmap gate convention is `~/.entropic/q7-report.json`. | P7.0 writes to `~/.entropic/q7-report.json` explicitly via `--out`. |
| D7 | requirements-q7-measure.txt targets Python 3.12 (DEC-Q7-002 floor); this machine's default `python3` is **3.14.3** (torch wheels not guaranteed). `python3.12` (3.12.12) is installed. | P7.0 pins `python3.12` in a venv. |
| D8 | Vision says D4 Latent Granulator needs latent **decode**, which SPEC-5 §8 marks "(deferred — we don't ship decode in v1)". D4 also depends on A1/B8 Granulator (Tier 4, not built). | D4 gets a feasibility spike only (P7.13); build packets deliberately not authored. |
| D9 | E6 depends on E5 Hardware Bridge (draft #145, Tier 3) which is outside Phase 7 and unmerged. | P7.14 carries an explicit external dependency precondition. |
| D10 | C6 lists dep "B4" (vision B4 = binding rules, Tier 3 — distinct from Creatrix-B4 sample rack). Full B4 is unbuilt; B4-lite (#148/#158) is the merged subset. | C6 spike (P7.10a) validates whether B4-lite mod-routing is sufficient; if not, C6 build blocks on Tier 3. |

### Dependency map

```
P7.0 (USER gate) ──┬─ TIER_5_GO ──> all packets below
                   └─ NO_GO/COND ─> P7.0N (ship FC-v3 without L)

P7.1 harness chain ─> P7.2 DINOv2+report ─> P7.3 CLIP+CLAP ─> P7.4 L-worker ─> P7.5 SG-4 saturation
P7.6 SG-8 VERIFY (impl = P5b.1–2; independent after gate)
P7.7a SG-3 VERIFY ─> P7.7b VERIFY ─> P7.7c VERIFY (impl = P5b.3/4/5)
P7.8 download UX (after P7.2)
P7.9 C5  spike→spec→build   (needs P7.4, P7.5, P7.7*)
P7.10 C6 spike→spec→build   (needs P7.7*, B4-lite check)
P7.11 C8 spike→spec+build   (needs P7.10)
P7.12 E1 spike→spec→build   (needs P7.4, P7.7*)
P7.13 D4 feasibility spike  (needs P7.12 spike; build deferred)
P7.14 E6 spike→spec+build   (needs P7.6; EXTERNAL: E5 #145 merged)
```

---

## P7.0 — RUN THE Q7 REAL BENCHMARK — **USER ACTION** — `RISK:HIGH` (outcome decides the phase)

- **ID:** P7.0 · **Branch:** none (no code lands) · **Base:** n/a · **Depends-on:** nothing
- **Goal:** Produce the REAL Tier-5 verdict file at `~/.entropic/q7-report.json` from a measured run on the user's M-series Mac. This is the deliverable G1 in the ROADMAP gap register — the verdict **file**, not more machinery.
- **Time:** ~30–45 min user time (first run; CLAP weights download dominates).

### Where the harness actually lives (VERIFIED 2026-06-11)

- **NOT on `origin/main`:** `git -C ~/Development/entropic-v2challenger ls-tree origin/main backend/scripts/q7_benchmark/` → empty.
- **NOT runnable from `~/Development/entropic-q7-bench`** (`feat/q7-l-backbone-benchmark`): that worktree is the internal-PR-#1 scaffold only; `--measure` raises SystemExit there.
- **RUN FROM:** **`~/Development/entropic-q7-clap`** — branch `feat/q7-clap-lit` (GH PR **#132**), the deepest bench-chain worktree with all three heads lit: loaders (int. #3), latency+throughput (int. #4), jitter+verdict (int. #5), DINOv2 (int. #6), markdown report (int. #7), L-worker (int. #9), CLIP (int. #13), CLAP (int. #14). Runbook: `~/Development/entropic-q7-clap/docs/runbooks/q7/q7-measure.md`.

### PRECONDITIONS (mismatch → STOP and report)

```bash
git -C ~/Development/entropic-q7-clap branch --show-current        # expect: feat/q7-clap-lit
git -C ~/Development/entropic-q7-clap log -1 --format='%h %s'      # expect: 687542f [q7] feat: PR #14 CLAP encode light-up …
uname -m                                                            # expect: arm64 (Apple silicon REQUIRED — DEC-Q7-014)
python3.12 --version                                                # expect: Python 3.12.x (3.14 torch wheels not guaranteed — D7)
df -h ~ | tail -1                                                   # need ≥ 5 GB free (CLAP weights + venv)
```

State to know going in (verified): DINOv2 (168 MB) and CLIP (1.7 GB) weights are **already cached** at `~/.entropic/models/q7/`; CLAP is not — first run downloads it. Mock verdict already quarantined as `~/.entropic/q7-report.MOCK.json`.

### STEPS

```bash
cd ~/Development/entropic-q7-clap
python3.12 -m venv .q7venv && source .q7venv/bin/activate
pip install -r backend/scripts/q7_benchmark/requirements-q7-measure.txt   # torch/transformers/mlx/laion-clap/matplotlib/psutil, ~2 GB

# Quit heavy apps first (Chrome/Docker/Logic) — thermal + memory pressure skew the verdict (runbook §CONDITIONAL).
cd backend/scripts
python3 -m q7_benchmark.runner \
  --measure \
  --n-iterations 100 \
  --saturation-threads 4 \
  --saturation-window 5.0 \
  --under-load-duration 30 \
  --out ~/.entropic/q7-report.json
python3 -m q7_benchmark.report validate ~/.entropic/q7-report.json
```

Render the human-readable verdict (optional but recommended): runbook §"Render the markdown report" → `~/q7-report.md` + charts.

### ACCEPTANCE GATES (the 8 thresholds — SPEC-5 §9.2)

| Metric | Target |
|---|---|
| DINOv2-small encode | < 50 ms |
| CLIP-ViT-B/32 image encode | < 200 ms |
| CLAP audio encode (1 s buffer) | < 100 ms |
| All 3 backbones resident | < 600 MB |
| Audio-thread frame-time 99p under queue saturation | < 5 ms |
| Sparse-encode (1:8 canonical) + slerp interpolation jitter p95 | < 50 ms (the verdict driver, DEC-Q7-007/009) |
| First-launch download, all 3 models | < 90 s @ 50 Mbps |
| Cold-load all 3 from disk cache | < 8 s |

Verdict states (in `verdict.state`): `TIER_5_GO` (canonical p95 < 50 ms) · `TIER_5_CONDITIONAL` (50–100 ms → re-run per runbook after cooldown/quit-apps; second CONDITIONAL = treat as the real number, user decides GO-cautious vs NO-GO) · `TIER_5_NO_GO` (≥ 100 ms → P7.0N). Advisory flags `HIGH_VARIANCE` / `DEGRADES_UNDER_LOAD` do not block GO but must be quoted in the evidence.

### ROLLBACK

None needed — the run writes one JSON file. If a run is invalidated (thermals, wrong machine), delete `~/.entropic/q7-report.json` and re-run. Never edit the JSON by hand.

### EVIDENCE

Paste into the Phase-7 tracking issue: full `verdict` object, `backend` field (must be `mlx` or `mps`, NOT `mock`), machine line (`sysctl -n machdep.cpu.brand_string hw.memsize`), and the per-head `encode_latency.p95_ms` numbers. The JSON file itself is the artifact; the next session re-reads it (runbook §"Sharing the result").

---

## P7.0N — NO-GO BRANCH: ship FC-v3 without L-axis (only if P7.0 ≠ GO)

- **ID:** P7.0N · **Branch:** `docs/p7-no-go-disposition` · **Base:** `origin/main` · **Depends-on:** P7.0 returned `TIER_5_NO_GO` (or accepted-CONDITIONAL-as-NO).
- **Goal:** Execute SPEC-5 §9.3 / §12 row-1 fallback: defer the L-axis to v1.1, keep FC-v3 (Tiers 0–4) as the ship target, and leave a clean re-entry path.
- **PRECONDITIONS:** inverse G-CHECK — verdict file exists, `backend != "mock"`, `state != "TIER_5_GO"`. Mismatch → STOP.
- **Scope (VERIFIED paths):** `docs/` in `entropic-v2challenger` + GH PR dispositions. No runtime code.
- **DO-NOT-TOUCH:** any `backend/src/**` or `frontend/src/**`; do not delete the q7 branches (they are the v1.1 re-entry).
- **Steps:**
  1. Write `docs/decisions/q7/DEC-Q7-VERDICT.md`: paste the real verdict JSON, state NO-GO, cite SPEC-5 §9.3 re-evaluation triggers (MLX 4/8-bit quantization lands; smaller DINOv2 variant; M5-class hardware).
  2. Comment-and-close the Tier-5-only parked PRs as `deferred-v1.1` **without deleting branches**: #127 (L-worker), #131 (CLIP), #132 (CLAP), #133 (SG-3), #138 (download UX), #129 (superseded by #161 regardless of verdict).
  3. Keep the benchmark harness PRs eligible for merge anyway (P7.1/P7.2 may still run at user discretion — the harness is how v1.1 re-tests the gate; record that choice in the DEC file).
  4. Update `docs/roadmap/ROADMAP.md` Phase 7 row (in the docs worktree/branch, coordinate with docs owner): mark Tier 5 deferred, FC-v3 is the target.
- **TEST PLAN:** docs-only; CI green; link-check the DEC file.
- **ACCEPTANCE GATES:** DEC file on main; all six PRs dispositioned with the standard comment; ROADMAP updated.
- **ROLLBACK:** revert the docs commit; reopen PRs.
- **EVIDENCE:** PR URL + list of closed PR numbers + DEC file path.

---

## P7.1 — Cherry-pick the benchmark harness chain to main (int. PRs #1+#3+#4+#5)

- **ID:** P7.1 · **Branch:** `feat/p7.1-q7-harness-core` · **Base:** `origin/main` · **Depends-on:** P7.0 GO (G-CHECK)
- **Goal:** The harness that produced the gate verdict becomes a merged, reproducible artifact on main: scaffold + model loaders + latency/throughput + jitter/verdict. (~3 h)
- **PRECONDITIONS:** G-CHECK; standard repo preconditions; then verify the source payload:

```bash
git -C ~/Development/entropic-q7-jitter log --oneline origin/main..feat/q7-jitter | wc -l   # expect: 14
git -C ~/Development/entropic-q7-jitter log --format='%h' origin/main..feat/q7-jitter | tail -1  # expect: 2ad5399
git -C ~/Development/entropic-v2challenger ls-tree origin/main Makefile                      # expect: EMPTY (Makefile is new in this payload)
```

- **Scope (VERIFIED paths, all NEW on main):** `backend/scripts/q7_benchmark/{__init__,runner,report,backends,mock,bench,stats,jitter,verdict,queue_sat,under_load}.py` · `backend/scripts/q7_benchmark/loaders/{__init__,_base,cache,clap,clip,dinov2}.py` + `models.toml` · `backend/scripts/q7_benchmark/schemas/q7-report.schema.json` (v0.3.0) · `backend/scripts/q7_benchmark/requirements-q7*.txt` · `backend/tests/test_q7_benchmark/**` · `docs/plans/q7/**`, `docs/decisions/q7/DEC-Q7-001..009`, `docs/runbooks/q7/q7-smoke.md` · `Makefile` (new) · `.github/workflows/q7-smoke.yml` (new — **flag in PR body: workflow addition; user merges via GitHub UI per standing rule on workflow-touching diffs**).
- **DO-NOT-TOUCH:** `backend/src/**` (nothing in this payload touches runtime src — verify with `git show --stat`), existing `.github/workflows/test.yml`.
- **Steps:** follow the Cherry-pick rule; payload = the 14 commits `2ad5399..b8fefdb` from `feat/q7-jitter`; `git cherry-pick 2ad5399^..b8fefdb` onto the fresh branch (all-new files — expect zero conflicts; any conflict = STOP, payload enumeration was wrong).
- **TEST PLAN:** `make q7-smoke` (mock run + schema validate) · `make q7-test` (the Q7 pytest marker suite, ~110 tests at this depth) · full backend suite untouched-check: `cd backend && python -m pytest -x -n auto --tb=short`.
- **ACCEPTANCE GATES:** q7-smoke green on the branch; CI green; `git ls-tree HEAD backend/scripts/q7_benchmark/` non-empty; no diff under `backend/src/`.
- **ROLLBACK:** `git revert -m1 <merge-sha>` — payload is pure-additive, revert is clean.
- **EVIDENCE:** PR body pastes payload enumeration (14 SHAs + `--stat` totals), q7-smoke output, test counts. Close GH #117/#119 (and the latency/jitter draft PRs if they exist as separate GH numbers) as "landed via P7.1" after merge.

---

## P7.2 — Cherry-pick DINOv2 light-up + markdown report (int. PRs #6+#7)

- **ID:** P7.2 · **Branch:** `feat/p7.2-q7-dinov2-report` · **Base:** `origin/main` (after P7.1 merges) · **Depends-on:** P7.1
- **Goal:** Real DINOv2 encode path + cache-invalidation + markdown verdict report land on main. (~2–3 h)
- **PRECONDITIONS:** G-CHECK; P7.1 merged (`git ls-tree origin/main backend/scripts/q7_benchmark/` non-empty); payload check:

```bash
git -C ~/Development/entropic-q7-report log --oneline -3   # expect tip: 17868ca PR #7 … then 62637f5 PR #6 … then b16b5d4 …
# CRITICAL overlap check (D5): these three files in commit 62637f5 are byte-identical to main (merged #161):
cd ~/Development/entropic-q7-report && for f in backend/src/safety/pressure/__init__.py backend/src/safety/pressure/budget.py backend/src/safety/pressure/degrade_order.py; do git diff origin/main 62637f5 -- $f | wc -l; done   # expect: 0 0 0 — if non-zero → STOP, reconcile with #161 first
```

- **Scope (VERIFIED paths):** from `62637f5`: `backend/scripts/q7_benchmark/loaders/dinov2.py` (real encode), `cache_invalidation.py`, `backend/src/safety/__init__.py` (+6 lines — verify matches main's existing import block; keep main's on conflict), tests (`test_dinov2_lit.py`, `test_pressure.py`, `test_cache_invalidation.py`, +updates). From `17868ca`: `markdown_report.py`, `charts.py`, `docs/runbooks/q7/q7-measure.md`, `docs/decisions/q7/DEC-Q7-014-intel-mac-unsupported.md`, `docs/plans/q7/PR-07-*.md`, 18 tests. Plus `b16b5d4` (DEC-Q7-010..013 docs).
- **DO-NOT-TOUCH:** `backend/src/safety/pressure/{monitor,registry}.py` (main's #161 is canonical); if the cherry-pick add/adds the three identical pressure files, resolve as main's version.
- **Steps:** cherry-pick `b16b5d4`, `62637f5`, `17868ca` in that order onto the fresh branch; resolve pressure-file add/adds to main's copies.
- **TEST PLAN:** `make q7-test` (expect ~163 Q7 tests at this depth per the #7 commit message) · backend full suite · render a markdown report from the REAL `~/.entropic/q7-report.json` and eyeball the verdict block.
- **ACCEPTANCE GATES:** all Q7 tests green; markdown report renders the real verdict; `git diff origin/main --stat -- backend/src/safety/pressure/monitor.py backend/src/safety/pressure/registry.py` is empty.
- **ROLLBACK:** revert merge commit; additive except `safety/__init__.py` (6-line import block).
- **EVIDENCE:** PR body: payload SHAs, diff-vs-#161 proof (the three zeros), test count, rendered report snippet.

---

## P7.3 — Cherry-pick CLIP + CLAP light-ups (GH #131 + #132)

- **ID:** P7.3 · **Branch:** `feat/p7.3-q7-clip-clap-lit` · **Base:** `origin/main` (after P7.2) · **Depends-on:** P7.2
- **Goal:** Real CLIP and CLAP encode paths on main — completes the 3-head harness parity with what P7.0 measured. (~2 h)
- **PRECONDITIONS:** G-CHECK; P7.2 merged; payload check:

```bash
git -C ~/Development/entropic-q7-clip show --stat --format='' ad7655d | tail -1   # 3 files: loaders/clip.py, requirements-q7.txt, test_clip_lit.py
git -C ~/Development/entropic-q7-clap show --stat --format='' 687542f | tail -1   # 2 files: loaders/clap.py, test_clap_lit.py
```

- **Scope (VERIFIED paths):** `backend/scripts/q7_benchmark/loaders/clip.py` (+125 net), `loaders/clap.py` (+130 net), `requirements-q7.txt` (+4, PIL), `backend/tests/test_q7_benchmark/test_clip_lit.py` (132), `test_clap_lit.py` (143).
- **DO-NOT-TOUCH:** `loaders/dinov2.py`, `cache.py`, everything else.
- **Steps:** cherry-pick `ad7655d` then `687542f`. Note: GH #131's branch also carries int. #8–#12 commits below it — those are NOT in this payload; only the two tip commits listed. Conflict risk: `loaders/clip.py`/`clap.py` were stub versions from P7.1's payload — the cherry-pick rewrites them; take the incoming hunks.
- **TEST PLAN:** `make q7-test`; if heavy deps installed locally (P7.0 venv), additionally run the two `_lit` suites non-mocked: `PYTHONPATH=scripts ../.q7venv/bin/python -m pytest tests/test_q7_benchmark/test_clip_lit.py tests/test_q7_benchmark/test_clap_lit.py -q` — otherwise note "CI smoke only" in evidence.
- **ACCEPTANCE GATES:** Q7 suite green; `make q7-smoke` still deterministic; no files outside the 5 listed.
- **ROLLBACK:** revert merge commit.
- **EVIDENCE:** payload SHAs + stat, test output. Close #131/#132 as landed.

---

## P7.4 — Cherry-pick the L-backbone worker, real impl (GH #127, int. #9)

- **ID:** P7.4 · **Branch:** `feat/p7.4-l-worker` · **Base:** `origin/main` (after P7.3) · **Depends-on:** P7.3
- **Goal:** The runtime L-worker process (SPEC-5 §2–3: ZMQ dispatcher, bounded queue, multi-head dispatch) lands on main as `backend/src/q7_worker/`. This is the production substrate every Tier-5 feature calls. (~3 h)
- **PRECONDITIONS:** G-CHECK; P7.3 merged; payload check:

```bash
git -C ~/Development/entropic-q7-l-worker show --stat --format='' 8ebb567 | tail -1
# expect 4 files: backend/src/q7_worker/__main__.py, dispatcher.py, tests/test_q7_worker.py (new, 337),
#                 tests/test_q7_benchmark/test_q7_worker_stub.py (DELETED — stub from int. #4)
git -C ~/Development/entropic-v2challenger ls-tree origin/main backend/src/q7_worker/   # expect EMPTY before this packet
```

- **Scope (VERIFIED paths):** `backend/src/q7_worker/__main__.py`, `backend/src/q7_worker/dispatcher.py`, `backend/tests/test_q7_worker.py`; deletes `backend/tests/test_q7_benchmark/test_q7_worker_stub.py` (which arrives via P7.1's int.-#4 payload — confirm it exists on the branch before cherry-picking, else drop the deletion hunk).
- **DO-NOT-TOUCH:** `backend/src/zmq_server.py` (worker is spawned standalone in this packet — sidecar wiring belongs to the C5 build, P7.9c); the int.-#8 SPEC-2 reconciliation commit `8697376` and chore `67e0fc0` on the same branch are **explicitly out of payload** (schema work superseded by merged #148/#158 — re-deriving it is its own decision, not Phase 7).
- **Steps:** cherry-pick `8ebb567` only. Smoke the worker standalone: `cd backend && PYTHONPATH=src python -m q7_worker --port 6099` + run the dispatcher tests against it (see `make q7-worker-stub` target semantics from the q7 Makefile, now on main via P7.1).
- **TEST PLAN:** `python -m pytest tests/test_q7_worker.py -q` (16 tests incl. subprocess UAT per the commit message) · full backend suite · SG-4 AST lint must stay green (merged #159 — the worker must not be imported from any audio-thread module; the lint enforces this).
- **ACCEPTANCE GATES:** worker boots, answers a round-trip request, dies cleanly; 16/16; SG-4 lint green; bounded-queue behavior covered by at least one test (queue overflow → fallback, SPEC-5 §4.1.5).
- **ROLLBACK:** revert merge commit; `backend/src/q7_worker/` is self-contained.
- **EVIDENCE:** test output, worker boot/round-trip log lines, payload enumeration showing #8/#chore excluded. Close #127 as landed.

---

## P7.5 — SG-4 runtime starvation tests (the §4.2 contract, real)

- **ID:** P7.5 · **Branch:** `feat/p7.5-sg4-starvation-tests` · **Base:** `origin/main` (after P7.4) · **Depends-on:** P7.4
- **Goal:** SG-4 merged only the AST import-lint (#159). SPEC-5 §4.2 defines four runtime contract tests that don't exist: RT-priority assertion, saturation-without-starvation (audio 99p < 5 ms), worker-crash survival, queue-overflow fallback. Write them against the real `q7_worker`. (~4 h)
- **PRECONDITIONS:** G-CHECK; P7.4 merged (`git ls-tree origin/main backend/src/q7_worker/` non-empty); `git grep -n "starve\|starvation" origin/main -- backend/tests/` → confirm empty (no duplicate work).
- **Scope (VERIFIED paths):** NEW `backend/tests/test_sg4_runtime_isolation.py`; may add a small priority helper to `backend/src/q7_worker/__main__.py` (QoS class set per SPEC-5 §4.1: worker at `QOS_CLASS_UTILITY`) if absent — grep first.
- **DO-NOT-TOUCH:** `backend/src/audio/**` render internals (measure, don't modify); the AST lint config from #159.
- **Steps:** (1) read `backend/src/audio/` to find the render-loop timing seam; (2) implement the four tests from SPEC-5 §4.2 verbatim (names: `test_audio_thread_runs_at_rt_priority`, `test_backbone_busy_does_not_starve_audio`, `test_backbone_crash_does_not_kill_audio`, `test_queue_overflow_drops_with_fallback`); (3) mark the saturation test with a `@pytest.mark.slow`/local-only marker if it needs ≥30 s wall time — CI gets a shortened window, the full window runs locally and its output goes in evidence.
- **TEST PLAN:** the four new tests green locally on Apple silicon; backend suite green; saturation test asserts 99p frame-time < 5 ms while 1000 requests flood the worker.
- **ACCEPTANCE GATES:** 4/4 green with real worker subprocess (not mocks) for crash + saturation cases; measured 99p value pasted in evidence and < 5 ms (matches the P7.0 report's `under_load`/saturation numbers as a cross-check).
- **ROLLBACK:** revert; tests + at-most-one helper function.
- **EVIDENCE:** pytest output + the measured 99p number + comparison line against the P7.0 report.

---

## P7.6 — SG-8 live wiring: VERIFY-ONLY (implementation owned by Phase-5b Track A, P5b.1–P5b.2)

- **ID:** P7.6 · **Branch:** none (verification stub, no code lands) · **Base:** n/a · **Depends-on:** P7.0 GO (independent of the P7.1–P7.5 chain)
- **Goal:** Verify that the SG-8 live wiring shipped by **P5b.1 (backend: monitor startup + feature registry + `pressure_status` REQ/REP poll handler — poll model; no push channel exists on main) and P5b.2 (frontend: memory status surface + `sg8-pressure` toasts)** landed on main, then mark the gate green. **No implementation steps here** — `packets/phase-5b.md` is the single owner of SG-8 wiring.
- **PRECONDITIONS (these greps ARE the packet):** G-CHECK; then:

```bash
git -C ~/Development/entropic-v2challenger grep -n "PressureMonitor" origin/main -- backend/src/zmq_server.py   # non-empty → P5b.1 landed; EMPTY → STOP: schedule/finish P5b.1, do NOT implement here
git -C ~/Development/entropic-v2challenger grep -n "pressure_status" origin/main -- backend/src/zmq_server.py   # non-empty → poll handler present (P5b.1)
git -C ~/Development/entropic-v2challenger grep -rn "sg8-pressure" origin/main -- frontend/src | head -2        # non-empty → P5b.2 landed; EMPTY → STOP: schedule/finish P5b.2
```

- **Steps:** all three greps non-empty → mark SG-8 GREEN in the Phase-7 tracking issue, close GH #129 with a comment ("superseded by #161 lib + P5b.1/P5b.2 wiring"), proceed (P7.9c later upgrades the backbone disable hooks to real unload calls).
- **EVIDENCE:** the three grep outputs + the #129 closing-comment link.

---

## P7.7a — SG-3 clause 1: VERIFY-ONLY (sentinel lib cherry-pick owned by P5b.3)

- **ID:** P7.7a · **Branch:** none (verification stub) · **Base:** n/a · **Depends-on:** P7.0 GO
- **Goal:** Verify **P5b.3** (cherry-pick of draft #133's `latent_sentinel.py` + 25 tests, `DEFAULT_L2_CEILING=10.0` kept per D3) landed on main. **No implementation here** — `packets/phase-5b.md` Track B owns SG-3.
- **PRECONDITIONS (these greps ARE the packet):** G-CHECK; then:

```bash
git -C ~/Development/entropic-v2challenger grep -n "check_and_clamp" origin/main -- backend/src/safety/latent_sentinel.py   # non-empty → P5b.3 landed; EMPTY → STOP: schedule/finish P5b.3, do NOT cherry-pick here
```

- **Steps:** grep non-empty → mark clause 1 green in the tracking issue, comment on #133 ("clause 1 landed via P5b.3"), proceed.
- **EVIDENCE:** grep output + #133 comment link.

## P7.7b — SG-3 clause 2: VERIFY-ONLY (pipeline NaN/Inf gate owned by P5b.4)

- **ID:** P7.7b · **Branch:** none (verification stub) · **Base:** n/a · **Depends-on:** P7.7a verified
- **Goal:** Verify **P5b.4** (render-output finite gate at the `engine/pipeline.py`/`compositor.py` choke point; lane abort rides the **render reply** — REQ/REP, no push channel; export fails loud on NaN) landed on main. **No implementation here.**
- **PRECONDITIONS (these greps ARE the packet):** G-CHECK; then:

```bash
git -C ~/Development/entropic-v2challenger grep -n "lane_aborted" origin/main -- backend/src/zmq_server.py   # non-empty → P5b.4 landed (abort on the render reply); EMPTY → STOP: schedule/finish P5b.4
git -C ~/Development/entropic-v2challenger grep -rn "test_export_fails_loud_on_nan_frame" origin/main -- backend/tests/ | head -1   # non-empty → P5b.4's export-NaN gate test present
```

- **Steps:** greps non-empty → mark clause 2 green, comment on #133, proceed.
- **EVIDENCE:** grep outputs.

## P7.7c — SG-3 clause 3: VERIFY-ONLY (frontend lane-mute UX owned by P5b.5)

- **ID:** P7.7c · **Branch:** none (verification stub) · **Base:** n/a · **Depends-on:** P7.7b verified
- **Goal:** Verify **P5b.5** (frontend toast `source: 'sg3-sentinel'` + lane mute badge + re-enable; `MAX_L2_NORM_PER_BACKBONE` per-backbone ceiling table) landed on main, then close out SG-3. **No implementation here.**
- **PRECONDITIONS (these greps ARE the packet):** G-CHECK; then:

```bash
git -C ~/Development/entropic-v2challenger grep -rn "sg3-sentinel" origin/main -- frontend/src | head -2                                  # non-empty → P5b.5 frontend landed; EMPTY → STOP: schedule/finish P5b.5
git -C ~/Development/entropic-v2challenger grep -n "MAX_L2_NORM_PER_BACKBONE" origin/main -- backend/src/safety/latent_sentinel.py        # non-empty → per-backbone ceiling table present (P5b.5)
```

- **Steps:** greps non-empty → mark SG-3 GREEN (all three clauses), close #133 fully with a comment naming the P5b.3/P5b.4/P5b.5 PRs, proceed to dependent packets (P7.9+ latent features).
- **EVIDENCE:** grep outputs + #133 closing-comment link.

---

## P7.8 — Model download UX (GH #138 + the missing dialog)

- **ID:** P7.8 · **Branch:** `feat/p7.8-model-download-ux` · **Base:** `origin/main` (after P7.2) · **Depends-on:** P7.2 (loader/cache paths on main)
- **Goal:** First-use L-axis model download with progress UI (SPEC-5 §6.2). Draft #138 ships the zustand store + IPC binder only; the `ModelDownloadDialog` from SPEC-5 §10 does not exist anywhere — build it here. (~4 h)
- **PRECONDITIONS:** G-CHECK; payload check:

```bash
git -C ~/Development/entropic-q7-download-ux show --stat --format='' cef60ee | tail -1   # 2 files: frontend/src/renderer/q7/downloadProgressStore.ts + its test (253 lines)
```

- **Scope (VERIFIED paths):** cherry-pick `cef60ee` → `frontend/src/renderer/q7/downloadProgressStore.ts` + test; NEW `frontend/src/renderer/components/perception/ModelDownloadDialog.tsx` (~120 lines per SPEC-5 §10); backend: confirm a download-progress emit exists in the loader path (`backend/scripts/q7_benchmark/loaders/cache.py` is script-side — production downloads belong to the worker/sidecar; if no production downloader exists yet, the dialog binds to the store with a stubbed IPC channel and the real producer is wired in P7.9c — state which case applied).
- **DO-NOT-TOUCH:** model cache layout (`~/.entropic/models/q7/...`, D2); checksum verification logic (SHA-256 pinning per SPEC-5 §6.3 — consume, don't reimplement).
- **Steps:** cherry-pick; note GH #138's branch carries int. #16–#19 (SG-1/A4/C4/A5) beneath it — **payload is `cef60ee` ONLY** (A4/C4/A5 already merged via #162/#165; SG-1 via #163). Build dialog: per-model rows (name, size: DINOv2 22 MB / CLIP 150 MB / CLAP ~600 MB-class download), progress bars, cancel, error+retry state.
- **TEST PLAN:** cherry-picked store tests (253-line suite) green; new dialog vitest with mock IPC: progress updates, cancel, error retry, completion dismiss; dead-flag check: every store action has a reader (feedback_dead-flag-never-read).
- **ACCEPTANCE GATES:** vitest green; dialog mounts and renders all three model rows from store state; no orphan store fields.
- **ROLLBACK:** revert; all additive.
- **EVIDENCE:** payload enumeration proving #16–#19 excluded, vitest output, dialog screenshot (storybook/dev mount acceptable). Close #138.

---

## P7.9 — C5 Latent-Trajectory Modulation (XL → spike / spec / build chain)

### P7.9a — C5 spike — `RISK:HIGH`

- **ID:** P7.9a · **Branch:** `spike/p7.9a-c5-latent-trajectory` (worktree-isolated, may be discarded) · **Base:** `origin/main` · **Depends-on:** P7.4 (worker), P7.7a (sentinel)
- **Goal:** Answer the three C5 unknowns with measured evidence before any spec is written: (1) reference-clip encode-at-add-time cost (N frames × DINOv2, optional CLIP); (2) simplex navigation math — interpolation between ≥3 target latents, slerp vs linear, does it produce *perceptibly distinct* modulation values; (3) feature-blend (cheap) vs re-encode (heavy) — measure both, pick the v1 path. (~4 h, throwaway code allowed)
- **PRECONDITIONS:** G-CHECK; P7.4 merged; P7.0's venv available for heavy deps.
- **Scope:** spike script under `backend/scripts/spikes/c5_trajectory_spike.py` (NEW dir is fine) using `q7_worker` + the real cached models. No production files.
- **DO-NOT-TOUCH:** anything outside `backend/scripts/spikes/`.
- **TEST PLAN / ACCEPTANCE GATES:** the spike REPORT is the artifact (verb-ask = result): a markdown block with measured encode costs per clip-second, simplex eval cost per frame (must beat the 16 ms frame budget by ≥10×, since it shares the budget), feature-blend vs re-encode comparison, and a GO/ADJUST recommendation. No report → packet failed regardless of code written.
- **ROLLBACK:** delete the spike worktree.
- **EVIDENCE:** spike report pasted in the tracking issue + numbers vs SPEC-5 §8 row C5 ("reference encoded once at add-time; trajectory eval is interpolation in simplex (fast)").

### P7.9b — C5 spec

- **ID:** P7.9b · **Branch:** `docs/p7.9b-c5-spec` · **Base:** `origin/main` · **Depends-on:** P7.9a report = GO
- **Goal:** Write `docs/specs/c5-latent-trajectory.md`: data model (trajectory = ordered target latents + weights), store shape, IPC commands, modulation-destination registration (reuse merged `applyCCModulations`/axis-binding pattern from #148/#157/#158 — read them first), sentinel call sites (every latent write → `check_and_clamp`), SG-8 registration, UI surface (minimal: add-reference-clip + simplex XY pad). **Deliverable includes the sliced build-packet list (P7.9c, P7.9d, …) each ≤4 h with verified paths** — this spec packet is what authorizes packets beyond P7.9c. (~3 h)
- **PRECONDITIONS:** G-CHECK; P7.9a report exists and says GO.
- **ACCEPTANCE GATES:** spec reviewed against the spike numbers; build-slice list present; every named path verified against main with `git ls-tree`.
- **EVIDENCE:** spec PR URL.

### P7.9c — C5 build, slice 1 (backend trajectory engine + worker wiring)

- **ID:** P7.9c · **Branch:** `feat/p7.9c-c5-engine` · **Base:** `origin/main` · **Depends-on:** P7.9b spec merged; P7.5, P7.7b
- **Goal:** First production slice per the P7.9b spec: trajectory data model + encode-on-add via `q7_worker` + per-frame simplex eval as a modulation source + sentinel-guarded writes + SG-8 real disable hooks (upgrading P7.6's stubs — grep for `TODO(P7.9c)`). UI slice lands in a later P7.9x packet defined by the spec. (≤4 h scoped by the spec; if the spec's slice exceeds 4 h, the spec must re-slice — that's an acceptance gate on P7.9b, not a license here)
- **PRECONDITIONS:** G-CHECK; spec merged; `git grep -n "TODO(P7.9c)" origin/main -- backend/src/` hits the SG-8 stub.
- **TEST PLAN:** unit tests per spec; sentinel negative test (runaway trajectory clamps); SG-4 lint stays green; backend suite green.
- **ACCEPTANCE GATES:** per spec; plus: first real L-axis modulation value demonstrably moves an effect param in a headless render test.
- **ROLLBACK:** feature flag per spec + revert.
- **EVIDENCE:** test output + headless render diff demo.

---

## P7.10 — C6 Frame-as-Self-Wavetable (XL → spike / spec / build chain)

### P7.10a — C6 spike — `RISK:HIGH`

- **ID:** P7.10a · **Branch:** `spike/p7.10a-c6-self-wavetable` · **Base:** `origin/main` · **Depends-on:** P7.7a; D10 check
- **Goal:** Validate the feedback topology before spec: rendered frame N's pixels/DCT/latent become modulation sources for frame N+1 (1-frame delay, vision C6). Unknowns: (1) where in `engine/pipeline.py` the rendered frame can be tapped without a copy that blows the frame budget; (2) runaway behavior — does sentinel L2-clamp alone keep a depth=1.0 feedback loop bounded for 100+ frames (SPEC-3 §3.5 runaway test, but in the real pipeline); (3) **D10**: is merged B4-lite axis-binding (#148/#158) a sufficient routing substrate, or does C6 need vision-B4 binding rules (Tier 3, unbuilt)? If (3) = needs-B4-full → C6 build chain BLOCKS on Tier 3; record and stop. (~4 h)
- **PRECONDITIONS:** G-CHECK; P7.7a merged; read `backend/src/modulation/video_analyzer.py` first (existing frame-derived mod source — closest prior art; the spike may be an extension of it rather than new machinery — read-existing-component-first).
- **Scope:** `backend/scripts/spikes/c6_feedback_spike.py`; throwaway.
- **ACCEPTANCE GATES:** report with: tap-point decision + measured per-frame cost, 100-frame runaway plot (bounded or not), D10 verdict, GO/BLOCKED recommendation.
- **EVIDENCE:** report + plot in tracking issue.

### P7.10b — C6 spec

- **ID:** P7.10b · **Branch:** `docs/p7.10b-c6-spec` · **Depends-on:** P7.10a = GO. Same contract as P7.9b: spec + sliced ≤4 h build-packet list (P7.10c…) with verified paths; sentinel call sites mandatory on every feedback write; explicit interaction note with C8 (C8 = "C6 with L" — spec both surfaces once, C8 inherits). (~3 h)

### P7.10c — C6 build, slice 1

- **ID:** P7.10c · **Branch:** `feat/p7.10c-c6-feedback-source` · **Depends-on:** P7.10b merged; P7.7b (pipeline gate live — feedback without the NaN gate is forbidden, SPEC-3 §3.2). First slice per spec: frame-tap + pixel/DCT source registration + clamp + tests. Sentinel negative test (NaN injected into the loop → lane aborts, loop dies cleanly) is a hard acceptance gate.

---

## P7.11 — C8 Feedback-Through-L (XL → spike / spec+build chain)

### P7.11a — C8 spike — `RISK:HIGH`

- **ID:** P7.11a · **Branch:** `spike/p7.11a-c8-feedback-through-l` · **Base:** `origin/main` · **Depends-on:** P7.10a = GO, P7.4
- **Goal:** C8 = C6's loop routed through the L encoder: render → DINOv2 encode → latent modulates frame N+1, per-axis feedback rate. Unknowns: (1) sparse-encode cadence in a *feedback* context — does every-Nth-frame encoding + slerp (SPEC-5 §3.2) destroy the feedback character or create it; (2) latency stack-up: frame render + async encode round-trip vs 16 ms budget at the P7.0-measured DINOv2 latency; (3) drift: does the latent walk leave distribution within 100 frames even with clamping (the SPEC-3 §3.1 failure mode, live). (~4 h)
- **PRECONDITIONS:** G-CHECK; P7.10a GO report; real DINOv2 cache present.
- **ACCEPTANCE GATES:** report: cadence recommendation, measured loop latency vs the P7.0 numbers, 100-frame drift trace, GO/ADJUST/KILL.
- **EVIDENCE:** report + drift trace.

### P7.11b — C8 spec + build slice 1

- **ID:** P7.11b · **Branch:** `feat/p7.11b-c8` · **Depends-on:** P7.11a = GO; P7.10c merged (C8 layers on C6's tap + routing). Because C8 is contractually "C6 with L" (vision §6), spec is a ≤2-page delta on the C6 spec, then build slice 1 in the same packet IF the combined estimate stays ≤4 h; otherwise split per P7.9b convention. Sentinel + SG-8 registration mandatory; per-axis feedback-rate param surfaced.

---

## P7.12 — E1 Resynthesis-Latent Mode (XL → spike / spec / build chain)

### P7.12a — E1 spike — `RISK:HIGH` (vision §9 explicitly: "spike before commit")

- **ID:** P7.12a · **Branch:** `spike/p7.12a-e1-vae` · **Base:** `origin/main` · **Depends-on:** P7.0 GO (heavy deps), P7.4 useful but not required
- **Goal:** Per-project autoencoder feasibility on the user's real hardware (M4 16 GB measured in P7.0). Unknowns: (1) training wall-time on representative project content — vision claims "<60 s is optimistic"; measure a tiny conv-VAE on ~500 frames at 3 sizes; (2) resident memory of the trained model vs the SG-8 budget row "E1 project-fit VAE ~100MB–1GB"; (3) inference latency post-training (must be frame-budget compatible); (4) MLX vs PyTorch-MPS for the training loop. (~4 h)
- **PRECONDITIONS:** G-CHECK; P7.0 venv; ≥10 GB free RAM headroom check (`vm_stat`).
- **Scope:** `backend/scripts/spikes/e1_vae_spike.py`; throwaway.
- **ACCEPTANCE GATES:** report: training-time table (frames × resolution × epochs), peak memory, inference ms, recommendation incl. whether "training is an export-style background job" (almost certainly) and what the UX contract must be. KILL is an acceptable verdict — E1 KILL also forecloses D4 (D8) and that conclusion must be stated explicitly.
- **EVIDENCE:** report + tables.

### P7.12b — E1 spec

- **ID:** P7.12b · **Branch:** `docs/p7.12b-e1-spec` · **Depends-on:** P7.12a = GO. Spec: training job lifecycle (background, cancellable — borrow SG-6 cancellation thinking but do NOT build SG-6, it's Tier 6), model storage per-project, latent-code routing as mod source, sentinel sites, SG-8 registration (priority 4 row), MLP-distill option deferred-or-not decision. Plus sliced build list. (~3 h)

### P7.12c — E1 build, slice 1

- **ID:** P7.12c · **Branch:** `feat/p7.12c-e1-training-job` · **Depends-on:** P7.12b merged; P7.7b. First slice per spec (likely: training job runner + persistence + progress events, no routing yet). Hard gate: training never runs on the audio thread or render thread (SG-4 lint + an explicit process/QoS assertion test).

---

## P7.13 — D4 Latent Granulator — feasibility spike ONLY — `RISK:HIGH`

- **ID:** P7.13 · **Branch:** `spike/p7.13-d4-decode-feasibility` · **Base:** `origin/main` · **Depends-on:** P7.12a = GO (D4 needs E1's decoder); EXTERNAL: A1/B8 Granulator (Tier 4) unbuilt
- **Goal:** D4's premise — "each grain = project rendered at latent (x,y,z) for 50 ms" — requires latent DECODE, which SPEC-5 §8 marks deferred (D8). This spike answers ONE question: can the E1 project-fit VAE's decoder produce a usable 50 ms grain (≥3 frames) within a granulator's scheduling budget? Measure decode latency + visual coherence on the P7.12a spike model. (~3 h)
- **PRECONDITIONS:** G-CHECK; P7.12a report = GO with a trained spike model available; confirm B8 status (`git grep -rn "granulator" origin/main -- backend/src/effects/ | head` — A5 *spectral* granulator (#165) is NOT A1/B8; do not confuse them).
- **Scope:** `backend/scripts/spikes/d4_decode_spike.py`; throwaway.
- **ACCEPTANCE GATES:** report with decode-ms per frame, subjective coherence note (attach 3 decoded frames), and a verdict: FEASIBLE-AFTER-E1+B8 / INFEASIBLE-DEFER-v1.1. **No D4 build packets exist in this phase by design** — if FEASIBLE, the D4 spec+build chain is authored in a Phase-7 addendum only after B8 (Tier 4) merges.
- **ROLLBACK:** delete spike worktree.
- **EVIDENCE:** report + decoded-frame attachments.

---

## P7.14 — E6 Live Performance Mode (XL → spike / spec+build chain)

### P7.14a — E6 spike — `RISK:HIGH`

- **ID:** P7.14a · **Branch:** `spike/p7.14a-e6-degradation` · **Base:** `origin/main` · **Depends-on:** P7.6 (SG-8 live); **EXTERNAL (D9): E5 Hardware Bridge (draft #145, Tier 3) is unmerged — full E6 build BLOCKS on it; the spike does not.**
- **Goal:** E6's core mechanism is graceful axis-aware degradation under a frame-rate floor ("drop F-depth before frames", vision E6) driven by SG-8 pressure events. Spike: (1) instrument the real render loop for sustained-fps measurement; (2) prototype a degradation ladder (reduce F-depth → reduce preview resolution → drop L-axis cadence → drop frames last) as a pure policy function over SG-8's `PressureEvent` + measured fps; (3) measure recovery hysteresis (no oscillation). (~4 h)
- **PRECONDITIONS:** G-CHECK; P7.6 merged (`git grep -n "PressureMonitor" origin/main -- backend/src/zmq_server.py` non-empty); confirm E5 status with `gh pr view 145 --json state` and record it.
- **Scope:** `backend/scripts/spikes/e6_degrade_spike.py` + a policy-function prototype; throwaway.
- **ACCEPTANCE GATES:** report: ladder definition, fps trace under synthetic load showing floor held, hysteresis behavior, and the E5-dependency statement (what subset of E6 — degradation + panic-recover — can ship without hardware bridge vs what waits).
- **EVIDENCE:** report + fps trace.

### P7.14b — E6 spec + build slice 1 (degradation core only)

- **ID:** P7.14b · **Branch:** `feat/p7.14b-e6-degrade-core` · **Depends-on:** P7.14a report; scope LIMITED to the E5-independent subset (frame-rate floor + axis-aware degradation + panic-recover + session preset save/load). Multi-output and hardware-bridge integration are explicitly out (wait for E5). Spec-then-slice per the P7.9b convention; degradation policy must be a pure, unit-testable function; SG-8 is the only pressure source (no second monitor).

---

## Packet count: 14 top-level (P7.0, P7.0N, P7.1–P7.8 = 10 infra, of which P7.6/P7.7a/P7.7b/P7.7c are VERIFY-ONLY stubs — implementation owned by Phase-5b P5b.1–P5b.5) + 6 feature chains decomposed into 14 sub-packets — 24 executable units, each ≤4 h, 6 marked `RISK:HIGH` (P7.0 outcome and the 5 XL spikes + D4).

## Standing notes for executors

1. **One packet = one PR = one worktree.** Name worktrees `~/Development/entropic-p7x-wt`; remove after merge (hygiene gap G13).
2. **Spikes produce reports, not code.** A spike PR with code but no measured report fails its acceptance gate (verb-ask-deliverable-is-the-result).
3. **Every latent write in every packet calls the sentinel** once P7.7a lands. Reviewers grep for `np.ndarray` latent assignments without `check_and_clamp` adjacency.
4. **Binary statuses only** in tracking: ✅ ❌ ⏸ (named blocker) — no partials (feedback_no-yellows-binary-verdicts).
5. When main moves past `d821ae8`, re-run each packet's VERIFIED-path checks before starting — paths were verified against that SHA on 2026-06-11.
