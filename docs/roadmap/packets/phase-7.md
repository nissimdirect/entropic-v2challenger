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
- **Model tier per packet class:** cherry-pick + verify-only packets (P7.0N, P7.1–P7.4, P7.6, P7.7a–c) = `sonnet` — anchors are pre-verified here, the work is mechanical with STOP-on-mismatch. Test-authoring/build packets (P7.5, P7.8, P7.9c, P7.10c, P7.11b, P7.12c, P7.14b) = `sonnet`, escalate to `opus` after one failed iteration. Spikes + specs (P7.9a/b, P7.10a/b, P7.11a, P7.12a/b, P7.13, P7.14a) = `opus` (judgment over measured evidence). P7.0 is a USER action; the supporting session is `sonnet`.
- Every packet ships as ONE PR; PR body pastes the EVIDENCE block; branch + SHA named in the "ready" message (Gate 18b).
- **Spec-packet test-plan gate:** every spec packet's acceptance gates include: the spec contains a "Test plan" section with named test titles per build slice (grep-checkable: `grep -c "it('\|def test_" <spec> ≥ N`, where N = number of build slices). A spec without grep-able named tests fails its own acceptance gate.
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

- **ID:** P7.0 · **Branch:** none (no code lands) · **Base:** n/a · **Depends-on:** nothing · **Model:** n/a (USER action; supporting session `sonnet`)
- **Goal:** Produce the REAL Tier-5 verdict file at `~/.entropic/q7-report.json` from a measured run on the user's M-series Mac. This is the deliverable G1 in the ROADMAP gap register — the verdict **file**, not more machinery.
- **Time:** ~30–45 min user time (first run; CLAP weights download dominates).
- **Known runbook drift (VERIFIED 2026-06-11):** the runbook's "finer control" example passes `--canonical-sparsity 8` — **that flag does not exist**; the runner's argparse flag is `--sparsity` (choices 4/8/16/32, default 8 per DEC-Q7-009). Copying the runbook line verbatim fails with `unrecognized arguments: --canonical-sparsity`. The STEPS below omit it (default already 8). Runbook also writes to `~/q7-report.json` (D6) — STEPS override with `--out`.

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

**Step 1 — venv, pinned to python3.12 (D7).** Verified on this machine: `python3.12` = 3.12.12 at `/opt/homebrew/bin/python3.12`; default `python3` is 3.14.3 — do NOT use it.

```bash
cd ~/Development/entropic-q7-clap
python3.12 -m venv .q7venv
source .q7venv/bin/activate
python --version                       # MUST print: Python 3.12.x — if 3.14.x, the venv was built wrong: deactivate; rm -rf .q7venv; redo this step
python -m pip install --upgrade pip
python -m pip install -r backend/scripts/q7_benchmark/requirements-q7-measure.txt
# Expected tail shape: "Successfully installed ... laion-clap-1.1.6 ... mlx-0.2x ... torch-2.x ..." (~2 GB, 1–3 min on fast connection)
python -c "import torch, transformers, laion_clap, mlx.core, matplotlib, psutil; print('deps OK')"
# MUST print: deps OK   (any ImportError → Troubleshooting row 1)
```

**Step 2 — negative check of the gate machinery (before the run).** Run the §0 G-CHECK verbatim now: it MUST exit non-zero with `STOP: REAL Q7 verdict file missing…` (no `~/.entropic/q7-report.json` exists yet — verified: only `q7-report.MOCK.json` is present). Also note: `python -m q7_benchmark.report validate ~/.entropic/q7-report.MOCK.json` prints `OK: … schema_version=0.3.0` — the mock IS schema-valid, which is exactly why schema validation alone is NOT the gate; only the G-CHECK's `backend != "mock"` rejection is.

**Step 3 — run.** Quit heavy apps first (Chrome/Docker/Logic) — thermal + memory pressure skew the verdict (runbook §CONDITIONAL).

```bash
cd ~/Development/entropic-q7-clap/backend/scripts
python -m q7_benchmark.runner \
  --measure \
  --n-iterations 100 \
  --saturation-threads 4 \
  --saturation-window 5.0 \
  --under-load-duration 30 \
  --out ~/.entropic/q7-report.json
echo "exit=$?"                          # MUST print: exit=0
```

Expected console shape (VERIFIED against `runner.py` main): **with `--out` the runner is SILENT on stdout on success** — it writes the file and exits 0. Long silence ≠ hang. Wall-clock budget: DINOv2 (168 MB) + CLIP (1.7 GB) weights are already cached at `~/.entropic/models/q7/` (verified); the CLAP HTSAT download (~600 MB-class) dominates the first run, then ~25–70 s of measurement (runbook §First-run timing: 100 iters ×3 heads ~5–15 s, saturation 5 s, under-load 30 s). Failure shapes: exit 1 + stderr `error: --measure produced no real data — every backbone failed` → Troubleshooting row 3; immediate `error: <backend message>` SystemExit → backend detection failed (not arm64, or torch/mlx import broken).

**Step 4 — validate + read the verdict.**

```bash
python -m q7_benchmark.report validate ~/.entropic/q7-report.json
# MUST print exactly: OK: /Users/<you>/.entropic/q7-report.json schema_version=0.3.0   (exit 0)
# Failure shape:      INVALID: <reason>   (exit 1) → run is void; re-run Step 3
python - <<'EOF'
import json, pathlib
d = json.loads((pathlib.Path.home() / ".entropic" / "q7-report.json").read_text())
print("backend:", d["backend"], "| state:", d["verdict"]["state"],
      "| canonical_p95_ms:", d["verdict"]["canonical_p95_ms"], "| flags:", d["verdict"]["flags"])
EOF
# Shape: backend: mlx | state: TIER_5_GO | canonical_p95_ms: <float> | flags: []  — backend MUST NOT be "mock"
```

Render the human-readable verdict (optional but recommended): runbook §"Render the markdown report", **substituting `$HOME/.entropic/q7-report.json` for the runbook's `$HOME/q7-report.json`** (D6) → expected last line `Wrote ~/q7-report.md + ~/q7-charts/*.png`.

### TROUBLESHOOTING — the 3 likeliest failures

| # | Symptom | Likely cause | Fix |
|---|---|---|---|
| 1 | `pip install` resolver error / wheel build failure on `torch` or `laion-clap`; or `deps OK` probe raises ImportError | venv created with python3.14 (`python3 -m venv` instead of `python3.12 -m venv`) — torch wheels not guaranteed on 3.14 (D7) | `deactivate; rm -rf .q7venv` in the worktree root; redo Step 1 verbatim; confirm `python --version` = 3.12.x INSIDE the venv before `pip install` |
| 2 | First run hangs or dies mid-CLAP-download; or a re-run fails loading CLAP (truncated/corrupt weights, SHA mismatch) | ~600 MB-class HTSAT download interrupted; partial files left in cache | `rm -rf ~/.entropic/models/q7/clap/` and re-run Step 3 (DINOv2/CLIP caches are separate dirs — leave them). If HF is slow/blocked: `export HF_ENDPOINT=https://hf-mirror.com` (runbook table) |
| 3 | exit 1 + `error: --measure produced no real data — every backbone failed` (per-head `BACKEND_NOT_LIT` in the report) | Wrong worktree (`entropic-q7-bench` is the PR-#1 scaffold — only `entropic-q7-clap` has all 3 heads lit) OR venv not active (system python has no torch) | `git -C ~/Development/entropic-q7-clap branch --show-current` → must be `feat/q7-clap-lit`; `which python` → must end `.q7venv/bin/python`; re-run Step 3 from `~/Development/entropic-q7-clap/backend/scripts` |

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

- **ID:** P7.0N · **Branch:** `docs/p7-no-go-disposition` · **Base:** `origin/main` · **Depends-on:** P7.0 returned `TIER_5_NO_GO` (or accepted-CONDITIONAL-as-NO) · **Model:** `sonnet` · **Time:** ~1.5 h
- **Goal:** Execute SPEC-5 §9.3 / §12 row-1 fallback: defer the L-axis to v1.1, keep FC-v3 (Tiers 0–4) as the ship target, and leave a clean re-entry path.
- **PRECONDITIONS (exit-bearing — run verbatim; any STOP → do not proceed):**

```bash
python3 - <<'EOF'
import json, pathlib, sys
p = pathlib.Path.home() / ".entropic" / "q7-report.json"
if not p.exists():
    sys.exit("STOP: no verdict file — P7.0 has not run; P7.0N is not authorized.")
d = json.loads(p.read_text())
if d.get("backend") == "mock":
    sys.exit("STOP: mock verdict — P7.0N may not run off a mock. Run P7.0.")
state = d.get("verdict", {}).get("state")
if state == "TIER_5_GO":
    sys.exit("STOP: verdict is TIER_5_GO — P7.0N must NOT run; proceed to P7.1+.")
print(f"NO-GO BRANCH AUTHORIZED: state={state} backend={d['backend']}")
EOF
```

- **Scope (VERIFIED paths):** `docs/decisions/q7/` (dir exists on the q7 branches; new on main is fine) + `docs/roadmap/ROADMAP.md` in `entropic-v2challenger` + GH PR dispositions. No runtime code.
- **DO-NOT-TOUCH:** any `backend/src/**` or `frontend/src/**`; do not delete the q7 branches (they are the v1.1 re-entry); never pass `--delete-branch` to `gh pr close`.
- **Steps:**
  1. Write `docs/decisions/q7/DEC-Q7-VERDICT.md` with these grep-checkable sections (`## Verdict JSON` — full report pasted, `## Decision`, `## Re-evaluation triggers` — the SPEC-5 §9.3 three: MLX 4/8-bit quantization lands; smaller DINOv2 variant ships; M5-class hardware, `## Disposition table` — one row per PR below, `## Harness disposition` — whether P7.1/P7.2 merge anyway at user discretion; the harness is how v1.1 re-tests the gate).
  2. Disposition the Tier-5-only parked PRs (all six VERIFIED OPEN 2026-06-11) **without deleting branches**:
     ```bash
     for pr in 127 131 132 133 138; do
       gh pr comment $pr --body "Deferred to v1.1 per docs/decisions/q7/DEC-Q7-VERDICT.md (Q7 real verdict: NO-GO). Branch retained as the v1.1 re-entry path — do NOT delete."
       gh pr close $pr      # gh pr close does NOT delete the branch
     done
     gh pr comment 129 --body "Superseded by merged #161 (backend/src/safety/pressure/ landed byte-identical) — closing regardless of the Q7 verdict. See phase-7.md D5."
     gh pr close 129
     ```
  3. Update `docs/roadmap/ROADMAP.md` Phase 7 row (coordinate with docs owner — `docs/roadmap/**` is owned by the docs branch per §0): mark Tier 5 deferred, FC-v3 is the ship target.
- **FAILURE MODES:** (a) accidental `--delete-branch` → re-entry path destroyed — forbidden above, and recovery is `git push origin <sha>:refs/heads/<branch>` from the still-extant worktrees; (b) closing a PR not in the list (e.g. #117/#119 harness PRs) — the loop is the only close authority, harness PRs stay open; (c) running P7.0N off a CONDITIONAL the user has NOT explicitly accepted as NO — the DEC file's `## Decision` section must quote the user's acceptance.
- **TEST PLAN:** docs-only; CI green on the PR. Grep gates: `grep -c "^## " docs/decisions/q7/DEC-Q7-VERDICT.md` ≥ 5; `grep -n "TIER_5_" docs/decisions/q7/DEC-Q7-VERDICT.md` non-empty. **Negative check:** after the DEC lands, run the §0 G-CHECK — it MUST still exit non-zero (`STOP: verdict is 'TIER_5_NO_GO'…`), proving Phase 7 stays mechanically gated.
- **ACCEPTANCE GATES (quantified):** DEC file on main with ≥5 required sections; exactly 6 PRs CLOSED-not-deleted — for each: `gh pr view <n> --json state --jq .state` = `CLOSED` AND `git ls-remote origin refs/heads/<headRefName>` non-empty; ROADMAP Phase-7 row updated.
- **ROLLBACK:** revert the docs commit; `gh pr reopen` each of the six.
- **EVIDENCE:** PR URL + the 6 close-comment links + DEC file path + the two grep-gate outputs + the negative G-CHECK output.

---

## P7.1 — Cherry-pick the benchmark harness chain to main (int. PRs #1+#3+#4+#5)

- **ID:** P7.1 · **Branch:** `feat/p7.1-q7-harness-core` · **Base:** `origin/main` · **Depends-on:** P7.0 GO (G-CHECK) · **Model:** `sonnet`
- **Goal:** The harness that produced the gate verdict becomes a merged, reproducible artifact on main: scaffold + model loaders + latency/throughput + jitter/verdict. (~3 h)
- **PRECONDITIONS:** G-CHECK; standard repo preconditions; then verify the source payload:

```bash
git -C ~/Development/entropic-q7-jitter log --oneline origin/main..feat/q7-jitter | wc -l   # expect: 14
git -C ~/Development/entropic-q7-jitter log --format='%h' origin/main..feat/q7-jitter | tail -1  # expect: 2ad5399
git -C ~/Development/entropic-v2challenger ls-tree origin/main Makefile                      # expect: EMPTY (Makefile is new in this payload)
```

- **Scope (VERIFIED paths, all NEW on main):** `backend/scripts/q7_benchmark/{__init__,runner,report,backends,mock,bench,stats,jitter,verdict,queue_sat,under_load}.py` · `backend/scripts/q7_benchmark/loaders/{__init__,_base,cache,clap,clip,dinov2}.py` + `models.toml` · `backend/scripts/q7_benchmark/schemas/q7-report.schema.json` (v0.3.0) · `backend/scripts/q7_benchmark/requirements-q7*.txt` · `backend/tests/test_q7_benchmark/**` · `docs/plans/q7/**`, `docs/decisions/q7/DEC-Q7-001..009`, `docs/runbooks/q7/q7-smoke.md` · `Makefile` (new) · `.github/workflows/q7-smoke.yml` (new — **flag in PR body: workflow addition; user merges via GitHub UI per standing rule on workflow-touching diffs**).
- **DO-NOT-TOUCH:** `backend/src/**` (nothing in this payload touches runtime src — verify with `git show --stat`), existing `.github/workflows/test.yml`.
- **Steps:** follow the Cherry-pick rule; payload = the 14 commits `2ad5399..b8fefdb` from `feat/q7-jitter` (counts VERIFIED 2026-06-11: `git log --oneline origin/main..feat/q7-jitter | wc -l` = 14; oldest = `2ad5399`, tip = `b8fefdb`); `git cherry-pick 2ad5399^..b8fefdb` onto the fresh branch (all-new files — expect zero conflicts; any conflict = STOP, payload enumeration was wrong).
- **FAILURE MODES:** (a) cherry-pick conflict → STOP per rule (means main moved or enumeration wrong — never hand-resolve); (b) `make q7-smoke` prints `INVALID: <reason>` instead of OK → schema drift between payload and validator, STOP and re-enumerate; (c) the workflow file `.github/workflows/q7-smoke.yml` lands in the diff → the PR cannot be agent-merged (standing workflow-guard rule); user merges via GitHub UI.
- **TEST PLAN:** `make q7-smoke` — expected final line **`OK: q7-smoke passed (mock mode, deterministic, schema-valid)`** (VERIFIED in the payload Makefile) · `make q7-test` — the payload suite carries **110 test functions** (VERIFIED: `grep -rh "def test_" backend/tests/test_q7_benchmark/ | wc -l` = 110 at this depth) · negative/boundary spot-check by name (grep-the-test-file-before-claiming-coverage): `PYTHONPATH=scripts python -m pytest tests/test_q7_benchmark/test_verdict.py -q -k "raises or no_go"` → expect **3 passed** (`test_verdict_negative_p95_raises`, `test_verdict_no_go_at_100`, `test_verdict_no_go_far_over`) · full backend suite untouched-check: `cd backend && python -m pytest -x -n auto --tb=short`.
- **ACCEPTANCE GATES (quantified):** q7-smoke green with the exact OK line; 110/110 Q7 tests; CI green; `git ls-tree HEAD backend/scripts/q7_benchmark/` non-empty; `git diff origin/main --stat -- backend/src/` EMPTY; 0 cherry-pick conflicts.
- **ROLLBACK:** `git revert -m1 <merge-sha>` — payload is pure-additive, revert is clean.
- **EVIDENCE:** PR body pastes payload enumeration (14 SHAs + `--stat` totals), q7-smoke output, the 110-count, the 3-passed negative-test line. Close GH **#117 + #119 + #121 (int. #4 latency/throughput) + #122 (int. #5 jitter/verdict)** — all four VERIFIED OPEN 2026-06-11 — as "landed via P7.1" after merge.

---

## P7.2 — Cherry-pick DINOv2 light-up + markdown report (int. PRs #6+#7)

- **ID:** P7.2 · **Branch:** `feat/p7.2-q7-dinov2-report` · **Base:** `origin/main` (after P7.1 merges) · **Depends-on:** P7.1 · **Model:** `sonnet`
- **Goal:** Real DINOv2 encode path + cache-invalidation + markdown verdict report land on main. (~2–3 h)
- **PRECONDITIONS:** G-CHECK; P7.1 merged (`git ls-tree origin/main backend/scripts/q7_benchmark/` non-empty); payload check:

```bash
git -C ~/Development/entropic-q7-report log --oneline -3   # expect tip: 17868ca PR #7 … then 62637f5 PR #6 … then b16b5d4 …
# CRITICAL overlap check (D5): these three files in commit 62637f5 are byte-identical to main (merged #161):
cd ~/Development/entropic-q7-report && for f in backend/src/safety/pressure/__init__.py backend/src/safety/pressure/budget.py backend/src/safety/pressure/degrade_order.py; do git diff origin/main 62637f5 -- $f | wc -l; done   # expect: 0 0 0 — if non-zero → STOP, reconcile with #161 first
```

- **Scope (VERIFIED paths):** from `62637f5`: `backend/scripts/q7_benchmark/loaders/dinov2.py` (real encode), `cache_invalidation.py`, `backend/src/safety/__init__.py` (+6 lines — verify matches main's existing import block; keep main's on conflict), tests (`test_dinov2_lit.py`, `test_pressure.py`, `test_cache_invalidation.py`, +updates). From `17868ca`: `markdown_report.py`, `charts.py`, `docs/runbooks/q7/q7-measure.md`, `docs/decisions/q7/DEC-Q7-014-intel-mac-unsupported.md`, `docs/plans/q7/PR-07-*.md`, 18 tests. Plus `b16b5d4` (DEC-Q7-010..013 docs).
- **DO-NOT-TOUCH:** `backend/src/safety/pressure/{monitor,registry}.py` (main's #161 is canonical); if the cherry-pick add/adds the three identical pressure files, resolve as main's version.
- **Steps:** cherry-pick `b16b5d4`, `62637f5`, `17868ca` in that order onto the fresh branch (tip order VERIFIED 2026-06-11 via `git log --oneline -4` in `~/Development/entropic-q7-report`); resolve pressure-file add/adds to main's copies.
- **FAILURE MODES:** (a) pressure-file add/add conflict resolves to the DRAFT's copy instead of main's → silently forks #161; the acceptance diff-empty gate below catches it — resolve to main, always; (b) `safety/__init__.py` conflict — keep main's import block, add only the draft's new lines; (c) markdown render raises on the real JSON (matplotlib only in the measure venv, not CI) → run the render step inside P7.0's `.q7venv`, and note CI renders nothing (mock smoke only).
- **TEST PLAN:** `make q7-test` — expect **~163 Q7 tests** at this depth (per the `17868ca` commit message "18 new tests, 163 total") · named tests to spot-check by grep before claiming coverage: positive `test_dinov2_real_encode_returns_384_dim`, `test_dinov2_real_encode_second_call_skips_cold_load`; **negative** `test_dinov2_loader_without_torch_raises_clear_error`, `test_preprocess_rejects_invalid_channel_count` (all four VERIFIED present in the payload's `test_dinov2_lit.py`) · backend full suite · render a markdown report from the REAL `~/.entropic/q7-report.json` (runbook snippet with the D6 path substitution, inside `.q7venv`) — expected last line `Wrote ~/q7-report.md + ~/q7-charts/*.png`; eyeball the verdict block.
- **ACCEPTANCE GATES (quantified):** ~163 Q7 tests green (exact count pasted); the 4 named tests present and green; markdown report renders the real verdict; `git diff origin/main --stat -- backend/src/safety/pressure/monitor.py backend/src/safety/pressure/registry.py` is EMPTY (0 lines).
- **ROLLBACK:** revert merge commit; additive except `safety/__init__.py` (6-line import block).
- **EVIDENCE:** PR body: payload SHAs, diff-vs-#161 proof (the three zeros), test count, rendered report snippet. Close GH **#124 (int. #6) + #125 (int. #7)** — both VERIFIED OPEN — as "landed via P7.2" after merge.

---

## P7.3 — Cherry-pick CLIP + CLAP light-ups (GH #131 + #132)

- **ID:** P7.3 · **Branch:** `feat/p7.3-q7-clip-clap-lit` · **Base:** `origin/main` (after P7.2) · **Depends-on:** P7.2 · **Model:** `sonnet`
- **Goal:** Real CLIP and CLAP encode paths on main — completes the 3-head harness parity with what P7.0 measured. (~2 h)
- **PRECONDITIONS:** G-CHECK; P7.2 merged; payload check:

```bash
git -C ~/Development/entropic-q7-clip show --stat --format='' ad7655d | tail -1   # 3 files: loaders/clip.py, requirements-q7.txt, test_clip_lit.py
git -C ~/Development/entropic-q7-clap show --stat --format='' 687542f | tail -1   # 2 files: loaders/clap.py, test_clap_lit.py
```

- **Scope (VERIFIED paths):** `backend/scripts/q7_benchmark/loaders/clip.py` (+125 net), `loaders/clap.py` (+130 net), `requirements-q7.txt` (+4, PIL), `backend/tests/test_q7_benchmark/test_clip_lit.py` (132), `test_clap_lit.py` (143).
- **DO-NOT-TOUCH:** `loaders/dinov2.py`, `cache.py`, everything else.
- **Steps:** cherry-pick `ad7655d` then `687542f` (both tip SHAs VERIFIED 2026-06-11 in their worktrees). Note: GH #131's branch also carries int. #8–#12 commits below it — those are NOT in this payload; only the two tip commits listed. Conflict risk: `loaders/clip.py`/`clap.py` were stub versions from P7.1's payload — the cherry-pick rewrites them; take the incoming hunks.
- **FAILURE MODES:** (a) taking MAIN's hunks on the stub-overwrite conflict → loaders stay stubs, the `_lit` suites fail with `BACKEND_NOT_LIT` — take incoming; (b) the `_lit` suites silently skip in CI (no torch) and green CI gets misread as real-encode coverage — the evidence MUST state which of the two cases below applied (dont-claim-untested-coverage).
- **TEST PLAN:** `make q7-test` · named tests to spot-check by grep: **CLIP (8 tests, VERIFIED in `test_clip_lit.py`)** — positive `test_clip_real_encode_image_returns_512_dim`, `test_clip_real_text_and_image_share_space`; **negative** `test_clip_payload_dict_missing_image_and_text_raises`, `test_clip_loader_without_torch_raises_clear_error` · **CLAP (10 tests, VERIFIED in `test_clap_lit.py`)** — positive `test_clap_real_encode_audio_returns_512_dim`; **negative** `test_clap_real_rejects_wrong_sample_rate`, `test_clap_real_rejects_too_short_audio` · if heavy deps installed locally (P7.0 venv), run the two `_lit` suites non-mocked: `PYTHONPATH=scripts ../.q7venv/bin/python -m pytest tests/test_q7_benchmark/test_clip_lit.py tests/test_q7_benchmark/test_clap_lit.py -q` → expect **18 passed**; otherwise note "CI smoke only" in evidence.
- **ACCEPTANCE GATES (quantified):** Q7 suite green (count pasted); 8+10 `_lit` tests collected; `make q7-smoke` still prints its exact OK line; `git diff origin/main --stat` shows ONLY the 5 listed files.
- **ROLLBACK:** revert merge commit.
- **EVIDENCE:** payload SHAs + stat, test output (18-passed line or the "CI smoke only" statement). Close #131/#132 (both VERIFIED OPEN) as landed.

---

## P7.4 — Cherry-pick the L-backbone worker, real impl (GH #127, int. #9)

- **ID:** P7.4 · **Branch:** `feat/p7.4-l-worker` · **Base:** `origin/main` (after P7.3) · **Depends-on:** P7.3 · **Model:** `sonnet`
- **Goal:** The runtime L-worker process (SPEC-5 §2–3: ZMQ REP dispatcher, multi-head dispatch; the worker is a single REQ/REP socket — "bounded queue" semantics live client-side and are contract-tested in P7.5) lands on main as `backend/src/q7_worker/`. This is the production substrate every Tier-5 feature calls. (~3 h)
- **PRECONDITIONS:** G-CHECK; P7.3 merged; payload check:

```bash
git -C ~/Development/entropic-q7-l-worker show --stat --format='' 8ebb567 | tail -1
# expect 4 files: backend/src/q7_worker/__main__.py, dispatcher.py, tests/test_q7_worker.py (new, 337),
#                 tests/test_q7_benchmark/test_q7_worker_stub.py (DELETED — stub from int. #4)
git -C ~/Development/entropic-v2challenger ls-tree origin/main backend/src/q7_worker/   # expect EMPTY before this packet
```

- **Scope (VERIFIED paths):** `backend/src/q7_worker/__main__.py`, `backend/src/q7_worker/dispatcher.py`, `backend/tests/test_q7_worker.py`; deletes `backend/tests/test_q7_benchmark/test_q7_worker_stub.py` (which arrives via P7.1's int.-#4 payload — confirm it exists on the branch before cherry-picking, else drop the deletion hunk).
- **DO-NOT-TOUCH:** `backend/src/zmq_server.py` (worker is spawned standalone in this packet — sidecar wiring belongs to the C5 build, P7.9c); the int.-#8 SPEC-2 reconciliation commit `8697376` and chore `67e0fc0` on the same branch are **explicitly out of payload** (schema work superseded by merged #148/#158 — re-deriving it is its own decision, not Phase 7).
- **Steps:** cherry-pick `8ebb567` only (tip SHA VERIFIED; the two commits beneath it — `67e0fc0` chore, `8697376` int. #8 — are explicitly out of payload). Optional manual smoke: `cd backend && PYTHONPATH=src python -m q7_worker --port 6099 --once` (the `--once` flag — process one request and exit — is built for tests; VERIFIED in `__main__.py`); on SIGTERM the worker writes `q7_worker: signal 15 received, shutting down` to stderr.
- **FAILURE MODES:** (a) the stub deletion hunk (`test_q7_worker_stub.py`) conflicts because P7.1's payload didn't carry the stub — drop the deletion hunk, note in PR body; (b) subprocess tests hang on a leaked worker (port 6099 already bound) — `lsof -ti :6099 | xargs kill` and re-run; (c) accidental inclusion of `8697376` (SPEC-2 schema rework, superseded by merged #148/#158) — the `git show --stat` enumeration in evidence is the guard.
- **TEST PLAN:** `python -m pytest tests/test_q7_worker.py -q` — **17 test functions** (VERIFIED by grep; the PR title says 16 — grep is ground truth, paste the collected count). Named **negative** tests (all VERIFIED present): `test_dispatcher_unknown_model_returns_error`, `test_dispatcher_payload_decode_failure_returns_error`, `test_worker_subprocess_unknown_cmd_returns_error`. Round-trip + lifecycle proof: `test_worker_subprocess_responds_to_ping`, `test_worker_subprocess_shutdown_exits_clean`, `test_worker_subprocess_encode_real_dinov2_round_trip` (`@pytest.mark.slow`, skipif-no-torch — VERIFIED; run it locally in the P7.0 venv where torch exists and `~/.entropic/models/q7/dinov2/` is cached, so it passes instead of skipping; paste the pass, not a skip). Then full backend suite · SG-4 AST lint must stay green (merged #159, lives at `backend/tests/test_sg4_realtime_isolation.py` VERIFIED on main — the worker must not be imported from any audio-thread module).
- **ACCEPTANCE GATES (quantified):** 17/17 (or the collected count, pasted); worker answers ping and exits clean via the two named subprocess tests (not manual logs); SG-4 lint green. **Queue-overflow note (VERIFIED):** the payload contains ZERO queue/overflow/HWM coverage (`grep -n "queue\|overflow\|bounded\|hwm" backend/tests/test_q7_worker.py` → empty) — the SPEC-5 §4.1.5 overflow→fallback contract is NOT this packet's gate; it is owned by P7.5's `test_queue_overflow_drops_with_fallback`. Do not claim it here.
- **ROLLBACK:** revert merge commit; `backend/src/q7_worker/` is self-contained.
- **EVIDENCE:** pytest output incl. the three negative-test names, payload enumeration showing `8697376`/`67e0fc0` excluded. Close #127 (VERIFIED OPEN) as landed.

---

## P7.5 — SG-4 runtime starvation tests (the §4.2 contract, real)

- **ID:** P7.5 · **Branch:** `feat/p7.5-sg4-starvation-tests` · **Base:** `origin/main` (after P7.4) · **Depends-on:** P7.4 · **Model:** `sonnet` (escalate `opus` if the timing seam fights back)
- **Goal:** SG-4 merged only the AST import-lint (#159). SPEC-5 §4.2 names three runtime contract tests that don't exist, plus the §4.1(5) queue-overflow contract: RT-priority assertion, saturation-without-starvation (audio 99p < 5 ms), worker-crash survival, queue-overflow fallback. Write them against the real `q7_worker`. (~4 h)
- **PRECONDITIONS (exit-bearing):** G-CHECK; then:

```bash
REPO=~/Development/entropic-v2challenger
git -C $REPO ls-tree origin/main backend/src/q7_worker/ | grep -q dispatcher.py || { echo "STOP: P7.4 not merged"; exit 1; }
git -C $REPO grep -qn "starvation" origin/main -- backend/tests/ && { echo "STOP: starvation tests already exist — no duplicate work"; exit 1; }
git -C $REPO ls-tree origin/main backend/tests/test_sg4_realtime_isolation.py | grep -q . || { echo "STOP: #159 lint missing — repo state unexpected"; exit 1; }
echo "P7.5 PRECONDITIONS OK"
```

- **Scope (VERIFIED paths):** NEW `backend/tests/test_sg4_runtime_starvation.py` — deliberately NOT `test_sg4_runtime_isolation.py`: main already has `backend/tests/test_sg4_realtime_isolation.py` (the #159 AST lint, VERIFIED), and a one-word-apart sibling (`realtime`/`runtime`) is a collision trap for humans and globs. May add a small priority helper to `backend/src/q7_worker/__main__.py` (QoS class set per SPEC-5 §4.1: worker at `QOS_CLASS_UTILITY`, audio thread asserts `QOS_CLASS_USER_INTERACTIVE`-or-higher) if absent — grep first.
- **DO-NOT-TOUCH:** `backend/src/audio/**` render internals (measure, don't modify); the AST lint file/config from #159.
- **Steps:** (1) read `backend/src/audio/` (VERIFIED on main: `clock.py`, `decoder.py`, `meter.py`, `mixer.py`, …) to find the render-loop timing seam; (2) implement the three SPEC-5 §4.2 tests verbatim plus the §4.1(5) overflow test — names: `test_audio_thread_runs_at_rt_priority`, `test_backbone_busy_does_not_starve_audio`, `test_backbone_crash_does_not_kill_audio`, `test_queue_overflow_drops_with_fallback`; (3) the crash test kills the worker subprocess with SIGKILL **mid-inference** (not between requests) and asserts the audio-side loop's frame-times are unaffected AND the dispatcher caller gets an error/fallback, not a hang; (4) the overflow test floods the client seam past its bound and asserts requests beyond the bound return fallback within a deadline (< 100 ms) instead of queueing unboundedly; (5) mark saturation + crash tests `@pytest.mark.slow` (marker already in repo use, VERIFIED in `test_q7_worker.py`) — CI gets a 5 s shortened window, the full ≥30 s window runs locally and its output goes in evidence.
- **FAILURE MODES covered by the tests themselves (this packet IS the negative-test packet):** worker crash mid-inference (SIGKILL), queue saturation (1000-request flood), priority inversion. Packet-level failure mode: the 99p assertion is flaky on a thermally-loaded machine — the test must sample ≥ 1000 frames and the evidence must name the machine state (apps quit, per P7.0 conventions).
- **TEST PLAN:** `cd backend && python -m pytest tests/test_sg4_runtime_starvation.py -q` (4 named tests above) — green locally on Apple silicon with full windows; backend suite green; saturation test asserts **99p frame-time < 5 ms while 1000 requests flood the worker over ≥30 s**.
- **ACCEPTANCE GATES (quantified):** 4/4 green with a real worker subprocess (not mocks) for crash + saturation + overflow cases; measured 99p value pasted in evidence and < 5 ms; delta vs the P7.0 report's `under_load`/saturation numbers quoted (cross-check — divergence > 2× → investigate before merging); overflow fallback deadline < 100 ms asserted in-test.
- **ROLLBACK:** revert; tests + at-most-one helper function.
- **EVIDENCE:** pytest output + the measured 99p number + the comparison line against the P7.0 report + machine-state note.

---

## P7.6 — SG-8 live wiring: VERIFY-ONLY (implementation owned by Phase-5b Track A, P5b.1–P5b.2)

- **ID:** P7.6 · **Branch:** none (verification stub, no code lands) · **Base:** n/a · **Depends-on:** P7.0 GO (independent of the P7.1–P7.5 chain) · **Model:** `sonnet` · **Time:** ~15 min
- **Goal:** Verify that the SG-8 live wiring shipped by **P5b.1 (backend: monitor startup + feature registry + `pressure_status` REQ/REP poll handler — poll model; no push channel exists on main) and P5b.2 (frontend: memory status surface + `sg8-pressure` toasts)** landed on main, then mark the gate green. **No implementation steps here** — `packets/phase-5b.md` is the single owner of SG-8 wiring (its §"Track A" names these exact artifacts — cross-checked 2026-06-11).
- **Scope:** read-only greps + one tracking-issue update + one PR disposition. · **DO-NOT-TOUCH:** any file in either repo tree.
- **PRECONDITIONS (this exit-bearing script IS the packet — run verbatim; exit≠0 → the stub FAILS, report which STOP fired):**

```bash
set -u; REPO=~/Development/entropic-v2challenger
# Positive control — merged #161 lib must be greppable (proves the grep machinery + paths, guards a silent false-PASS):
git -C $REPO grep -qn "class PressureMonitor" origin/main -- backend/src/safety/pressure/monitor.py \
  || { echo "CONTROL FAILED: #161 lib not found on main — repo state unexpected, STOP"; exit 2; }
# P5b.1 artifacts (monitor startup wiring + poll handler + its named test file):
git -C $REPO grep -qn "PressureMonitor" origin/main -- backend/src/zmq_server.py \
  || { echo "STOP: P5b.1 monitor startup not on main — schedule/finish P5b.1; do NOT implement here"; exit 1; }
git -C $REPO grep -qn "pressure_status" origin/main -- backend/src/zmq_server.py \
  || { echo "STOP: P5b.1 pressure_status poll handler not on main"; exit 1; }
git -C $REPO ls-tree origin/main backend/tests/test_safety/test_pressure_wiring.py | grep -q . \
  || { echo "STOP: P5b.1 merged without its named test file test_pressure_wiring.py — bounce to P5b.1's owner"; exit 1; }
# P5b.2 artifacts (frontend toast source + its named test file):
git -C $REPO grep -rqn "sg8-pressure" origin/main -- frontend/src \
  || { echo "STOP: P5b.2 sg8-pressure toast not on main — schedule/finish P5b.2"; exit 1; }
git -C $REPO ls-tree origin/main frontend/src/__tests__/components/statusbar/memory-status.test.tsx | grep -q . \
  || { echo "STOP: P5b.2 merged without its named test file memory-status.test.tsx — bounce to P5b.2's owner"; exit 1; }
echo "SG-8 VERIFY PASS: P5b.1 + P5b.2 artifacts present on origin/main"
```

(Status 2026-06-11: the control passes; all four P5b greps correctly STOP — P5b.1/P5b.2 not yet merged. The stub PASSes only after Phase-5b Track A ships.)

- **Steps:** script prints `SG-8 VERIFY PASS` → mark SG-8 GREEN in the Phase-7 tracking issue, close GH #129 (VERIFIED OPEN) via `gh pr comment 129 --body "Superseded by #161 lib + P5b.1/P5b.2 wiring (artifacts verified on main by P7.6)." && gh pr close 129`, proceed (P7.9c later upgrades the backbone disable hooks to real unload calls).
- **ROLLBACK:** n/a (read-only; reopen #129 if closed in error).
- **EVIDENCE:** the full script output (PASS line or the exact STOP line) + the #129 closing-comment link.

---

## P7.7a — SG-3 clause 1: VERIFY-ONLY (sentinel lib cherry-pick owned by P5b.3)

- **ID:** P7.7a · **Branch:** none (verification stub) · **Base:** n/a · **Depends-on:** P7.0 GO · **Model:** `sonnet` · **Time:** ~10 min
- **Goal:** Verify **P5b.3** (cherry-pick of draft #133's `latent_sentinel.py` + 25 tests from `8853d63` on `feat/q7-sg3-sentinel`, `DEFAULT_L2_CEILING=10.0` kept per D3) landed on main. **No implementation here** — `packets/phase-5b.md` Track B owns SG-3.
- **Scope:** read-only greps + tracking-issue update + #133 comment. · **DO-NOT-TOUCH:** any file.
- **PRECONDITIONS (this exit-bearing script IS the packet):** G-CHECK; then:

```bash
set -u; REPO=~/Development/entropic-v2challenger
# Positive control (proves grep machinery against a known-on-main safety path):
git -C $REPO ls-tree origin/main backend/src/safety/__init__.py | grep -q . \
  || { echo "CONTROL FAILED: backend/src/safety/ missing — repo state unexpected, STOP"; exit 2; }
git -C $REPO grep -qn "check_and_clamp" origin/main -- backend/src/safety/latent_sentinel.py \
  || { echo "STOP: P5b.3 sentinel not on main — schedule/finish P5b.3; do NOT cherry-pick here"; exit 1; }
git -C $REPO grep -qn "DEFAULT_L2_CEILING" origin/main -- backend/src/safety/latent_sentinel.py \
  || { echo "STOP: sentinel present but DEFAULT_L2_CEILING missing — D3 resolution violated, bounce to P5b.3's owner"; exit 1; }
git -C $REPO ls-tree origin/main backend/tests/test_q7_benchmark/test_latent_sentinel.py | grep -q . \
  || { echo "STOP: P5b.3 merged without its 25-test file — bounce to P5b.3's owner"; exit 1; }
echo "SG-3 CLAUSE-1 VERIFY PASS"
```

- **Steps:** script prints PASS → mark clause 1 green in the tracking issue, `gh pr comment 133 --body "Clause 1 landed via P5b.3 (verified on main by P7.7a)."`, proceed.
- **ROLLBACK:** n/a (read-only).
- **EVIDENCE:** full script output + #133 comment link.

## P7.7b — SG-3 clause 2: VERIFY-ONLY (pipeline NaN/Inf gate owned by P5b.4)

- **ID:** P7.7b · **Branch:** none (verification stub) · **Base:** n/a · **Depends-on:** P7.7a verified · **Model:** `sonnet` · **Time:** ~10 min
- **Goal:** Verify **P5b.4** (render-output finite gate at the `engine/pipeline.py`/`compositor.py` choke point; lane abort rides the **render reply** — REQ/REP, no push channel; export fails loud on NaN) landed on main. **No implementation here.**
- **Scope:** read-only greps + tracking-issue update. · **DO-NOT-TOUCH:** any file.
- **PRECONDITIONS (this exit-bearing script IS the packet):** G-CHECK; then:

```bash
set -u; REPO=~/Development/entropic-v2challenger
# Positive control — the enforcement-point files P5b.4 edits must exist (they do today, VERIFIED — guards path drift):
git -C $REPO ls-tree origin/main backend/src/engine/pipeline.py backend/src/engine/compositor.py | grep -c . | grep -q '^2$' \
  || { echo "CONTROL FAILED: pipeline/compositor paths moved — re-survey before verifying, STOP"; exit 2; }
git -C $REPO grep -qn "lane_aborted" origin/main -- backend/src/zmq_server.py \
  || { echo "STOP: P5b.4 lane_aborted reply field not on main — schedule/finish P5b.4"; exit 1; }
git -C $REPO grep -rqn "test_export_fails_loud_on_nan_frame" origin/main -- backend/tests/ \
  || { echo "STOP: P5b.4's named export-NaN test missing (its TEST PLAN names it in tests/test_safety/test_sg3_output_gate.py) — bounce to P5b.4's owner"; exit 1; }
git -C $REPO grep -rqn "test_nan_frame_blocked_and_last_good_served" origin/main -- backend/tests/ \
  || { echo "STOP: P5b.4's named last-good-served test missing — bounce to P5b.4's owner"; exit 1; }
echo "SG-3 CLAUSE-2 VERIFY PASS"
```

- **Steps:** script prints PASS → mark clause 2 green, comment on #133, proceed.
- **ROLLBACK:** n/a (read-only).
- **EVIDENCE:** full script output.

## P7.7c — SG-3 clause 3: VERIFY-ONLY (frontend lane-mute UX owned by P5b.5)

- **ID:** P7.7c · **Branch:** none (verification stub) · **Base:** n/a · **Depends-on:** P7.7b verified · **Model:** `sonnet` · **Time:** ~10 min
- **Goal:** Verify **P5b.5** (frontend toast `source: 'sg3-sentinel'` + lane mute badge + re-enable; `MAX_L2_NORM_PER_BACKBONE` per-backbone ceiling table) landed on main, then close out SG-3. **No implementation here.** (Artifact names cross-checked against phase-5b.md P5b.5's Scope + TEST PLAN, 2026-06-11.)
- **Scope:** read-only greps + tracking-issue update + #133 close. · **DO-NOT-TOUCH:** any file.
- **PRECONDITIONS (this exit-bearing script IS the packet):** G-CHECK; then:

```bash
set -u; REPO=~/Development/entropic-v2challenger
# Positive control — toast store must exist (P5b.5 consumes it; VERIFIED today):
git -C $REPO ls-tree origin/main frontend/src/renderer/stores/toast.ts | grep -q . \
  || { echo "CONTROL FAILED: stores/toast.ts moved — re-survey, STOP"; exit 2; }
git -C $REPO grep -rqn "sg3-sentinel" origin/main -- frontend/src \
  || { echo "STOP: P5b.5 frontend toast source not on main — schedule/finish P5b.5"; exit 1; }
git -C $REPO grep -qn "MAX_L2_NORM_PER_BACKBONE" origin/main -- backend/src/safety/latent_sentinel.py \
  || { echo "STOP: per-backbone ceiling table missing — bounce to P5b.5's owner"; exit 1; }
git -C $REPO grep -rlqn "sg3-lane-mute" origin/main -- frontend/src/__tests__/ \
  || { echo "STOP: P5b.5 merged without its NAMED test file sg3-lane-mute.test.tsx ('toast on lane_aborted', 'lane shows muted state', 're-enable clears mute', 'malformed payload ignored safely') — bounce to P5b.5's owner"; exit 1; }
git -C $REPO grep -rqn "test_per_backbone_ceiling_override" origin/main -- backend/tests/ \
  || { echo "STOP: P5b.5's named backend ceiling test missing — bounce to P5b.5's owner"; exit 1; }
echo "SG-3 CLAUSE-3 VERIFY PASS — SG-3 fully green"
```

- **Steps:** script prints PASS → mark SG-3 GREEN (all three clauses), close #133 fully with a comment naming the P5b.3/P5b.4/P5b.5 PRs, proceed to dependent packets (P7.9+ latent features).
- **ROLLBACK:** n/a (read-only; reopen #133 if closed in error).
- **EVIDENCE:** full script output + #133 closing-comment link.

---

## P7.8 — Model download UX (GH #138 + the missing dialog)

- **ID:** P7.8 · **Branch:** `feat/p7.8-model-download-ux` · **Base:** `origin/main` (after P7.2) · **Depends-on:** P7.2 (loader/cache paths on main) · **Model:** `sonnet`
- **Goal:** First-use L-axis model download with progress UI (SPEC-5 §6.2: progress per model, cancel, SHA-256 verified on download + on load; §6.2's "3× retry with exponential backoff 1s/2s/4s" is backend-owned — the store reflects the current `attempt`, VERIFIED in the payload's store header comment). Draft #138 ships the zustand store + IPC binder only; the `ModelDownloadDialog` from SPEC-5 §10 (~120 lines, `components/perception/`) does not exist anywhere — build it here. (~4 h)
- **PRECONDITIONS:** G-CHECK; payload check (exit-bearing):

```bash
git -C ~/Development/entropic-q7-download-ux show --stat --format='' cef60ee | grep -q "downloadProgressStore.ts" \
  || { echo "STOP: payload SHA cef60ee does not carry the store — re-enumerate"; exit 1; }
# Expected --stat (VERIFIED 2026-06-11): exactly 2 files — frontend/src/__tests__/q7/downloadProgressStore.test.ts (+253)
# and frontend/src/renderer/q7/downloadProgressStore.ts (+155); 408 insertions total.
```

- **Scope (VERIFIED paths):** cherry-pick `cef60ee` → `frontend/src/renderer/q7/downloadProgressStore.ts` + test; NEW `frontend/src/renderer/components/perception/ModelDownloadDialog.tsx` (~120 lines per SPEC-5 §10); backend: confirm a download-progress emit exists in the loader path (`backend/scripts/q7_benchmark/loaders/cache.py` is script-side — production downloads belong to the worker/sidecar; if no production downloader exists yet, the dialog binds to the store with a stubbed IPC channel and the real producer is wired in P7.9c — state which case applied).
- **DO-NOT-TOUCH:** model cache layout (`~/.entropic/models/q7/...`, D2); checksum verification logic (SHA-256 pinning per SPEC-5 §6.3 — consume, don't reimplement).
- **Steps:** cherry-pick; note GH #138's branch carries int. #16–#19 (SG-1/A4/C4/A5) beneath it — **payload is `cef60ee` ONLY** (A4/C4/A5 already merged via #162/#165; SG-1 via #163). Build dialog: per-model rows (name, size: DINOv2 22 MB / CLIP 150 MB / CLAP ~600 MB-class download), progress bars, cancel, error+retry state.
- **FAILURE MODES (each pinned by a named test below):** download interrupted mid-model (network drop at byte N) → store reflects backend retry via `attempt` 2/3, row shows retrying not stuck; SHA-256 mismatch after download → `verifying` → `error` with retry affordance (never `complete`); user cancels mid-download → `q7-download-cancel` IPC fired once, row → `cancelled`, no zombie progress events mutate a cancelled row.
- **TEST PLAN:** cherry-picked store suite green — **24 `it()` blocks** (VERIFIED by grep; statuses covered: `idle/downloading/verifying/complete/error/cancelled`): `cd frontend && npx --no vitest run src/__tests__/q7/downloadProgressStore.test.ts`. NEW named test file `frontend/src/__tests__/components/perception/model-download-dialog.test.tsx` with mock IPC, it() titles: "progress updates render per model row", "cancel aborts the active download and fires q7-download-cancel exactly once", "interrupted download shows attempt 2 of 3, not stuck progress", "sha mismatch surfaces error state with retry, never complete", "error state retry resets bytes and re-enters downloading", "completion dismisses the dialog", "progress event for a cancelled row is ignored". Run: `cd frontend && npx --no vitest run src/__tests__/components/perception/model-download-dialog.test.tsx` then the full suite. **Integration test (store↔dialog, not unit-only):** one test drives the REAL store (no store mock — mock only the IPC boundary) through `downloading → verifying → complete` for all three models and asserts the dialog's rendered rows track it. Dead-flag check: every store action has a reader (feedback_dead-flag-never-read) — `grep -n "set\|update\|cancel" downloadProgressStore.ts` actions each greppable in the dialog or binder.
- **ACCEPTANCE GATES (quantified):** 24/24 store tests + ≥7 dialog tests green; dialog mounts and renders all three model rows from store state (DINOv2 / CLIP / CLAP with sizes); the integration test passes against the real store; 0 orphan store fields.
- **ROLLBACK:** revert; all additive.
- **EVIDENCE:** payload enumeration proving #16–#19 excluded, vitest output (24 + ≥7 counts), dialog screenshot (storybook/dev mount acceptable), and the statement of which backend-producer case applied (real producer vs stubbed IPC channel pending P7.9c). Close #138 (VERIFIED OPEN).

---

## P7.9 — C5 Latent-Trajectory Modulation (XL → spike / spec / build chain)

### P7.9a — C5 spike — `RISK:HIGH`

- **ID:** P7.9a · **Branch:** `spike/p7.9a-c5-latent-trajectory` (worktree-isolated, may be discarded) · **Base:** `origin/main` · **Depends-on:** P7.4 (worker), P7.7a (sentinel)
- **Goal:** Answer the three C5 unknowns with measured evidence before any spec is written: (1) reference-clip encode-at-add-time cost (N frames × DINOv2, optional CLIP); (2) simplex navigation math — interpolation between ≥3 target latents, slerp vs linear, does it produce *perceptibly distinct* modulation values; (3) feature-blend (cheap) vs re-encode (heavy) — measure both, pick the v1 path. (~4 h, throwaway code allowed)
- **PRECONDITIONS:** G-CHECK; P7.4 merged; P7.0's venv available for heavy deps.
- **Scope:** spike script under `backend/scripts/spikes/c5_trajectory_spike.py` (NEW dir is fine) using `q7_worker` + the real cached models. No production files.
- **DO-NOT-TOUCH:** anything outside `backend/scripts/spikes/`.
- **TEST PLAN / ACCEPTANCE GATES:** the spike REPORT is the artifact (verb-ask = result): a markdown block with measured encode costs per clip-second, simplex eval cost per frame (must beat the 16 ms frame budget by ≥10× — i.e. **≤ 1.6 ms/frame measured**, since it shares the budget), feature-blend vs re-encode comparison, and a GO/ADJUST recommendation. No report → packet failed regardless of code written. **Grep-checkable deliverable:** report committed on the spike branch at `backend/scripts/spikes/REPORT-p7.9a-c5.md`; gates quoted in the tracking issue: `grep -cE '[0-9]+(\.[0-9]+) ?ms' REPORT-p7.9a-c5.md` ≥ 6 (≥6 measured numbers across the 3 unknowns) AND `grep -cE '^VERDICT: (GO|ADJUST)$' REPORT-p7.9a-c5.md` = 1.
- **ROLLBACK:** delete the spike worktree.
- **EVIDENCE:** spike report pasted in the tracking issue + numbers vs SPEC-5 §8 row C5 ("reference encoded once at add-time; trajectory eval is interpolation in simplex (fast)").

### P7.9b — C5 spec

- **ID:** P7.9b · **Branch:** `docs/p7.9b-c5-spec` · **Base:** `origin/main` · **Depends-on:** P7.9a report = GO
- **Goal:** Write `docs/specs/c5-latent-trajectory.md`: data model (trajectory = ordered target latents + weights), store shape, IPC commands, modulation-destination registration (reuse merged `applyCCModulations`/axis-binding pattern from #148/#157/#158 — read them first), sentinel call sites (every latent write → `check_and_clamp`), SG-8 registration, UI surface (minimal: add-reference-clip + simplex XY pad). **Deliverable includes the sliced build-packet list (P7.9c, P7.9d, …) each ≤4 h with verified paths** — this spec packet is what authorizes packets beyond P7.9c. (~3 h)
- **PRECONDITIONS:** G-CHECK; P7.9a report exists and says GO.
- **ACCEPTANCE GATES:** spec reviewed against the spike numbers; build-slice list present; every named path verified against main with `git ls-tree`; **structural test-plan gate (§0 conventions):** the spec contains a "Test plan" section with named test titles per build slice — `grep -c "it('\|def test_" docs/specs/c5-latent-trajectory.md` ≥ number of build slices, output quoted in the PR.
- **EVIDENCE:** spec PR URL + the structural grep count.

### P7.9c — C5 build, slice 1 (backend trajectory engine + worker wiring)

- **ID:** P7.9c · **Branch:** `feat/p7.9c-c5-engine` · **Base:** `origin/main` · **Depends-on:** P7.9b spec merged; P7.5, P7.7b
- **Goal:** First production slice per the P7.9b spec: trajectory data model + encode-on-add via `q7_worker` + per-frame simplex eval as a modulation source + sentinel-guarded writes + SG-8 real disable hooks (upgrading P7.6's stubs — grep for `TODO(P7.9c)`). UI slice lands in a later P7.9x packet defined by the spec. (≤4 h scoped by the spec; if the spec's slice exceeds 4 h, the spec must re-slice — that's an acceptance gate on P7.9b, not a license here)
- **PRECONDITIONS:** G-CHECK; spec merged; `git grep -n "TODO(P7.9c)" origin/main -- backend/src/` hits the SG-8 stub.
- **TEST PLAN:** unit tests per spec; NEW named test file `backend/tests/test_c5_trajectory.py` with at minimum `test_runaway_trajectory_clamped_by_sentinel` (the sentinel negative case) and `test_l_axis_value_moves_effect_param_headless` (the headless render proof). Run: `cd backend && python -m pytest tests/test_c5_trajectory.py -x --tb=short` then the full suite; SG-4 lint stays green.
- **ACCEPTANCE GATES:** per spec; plus: both named tests green — the first real L-axis modulation value demonstrably moves an effect param in a headless render test.
- **ROLLBACK:** feature flag per spec + revert.
- **EVIDENCE:** test output + headless render diff demo.

---

## P7.10 — C6 Frame-as-Self-Wavetable (XL → spike / spec / build chain)

### P7.10a — C6 spike — `RISK:HIGH`

- **ID:** P7.10a · **Branch:** `spike/p7.10a-c6-self-wavetable` · **Base:** `origin/main` · **Depends-on:** P7.7a; D10 check
- **Goal:** Validate the feedback topology before spec: rendered frame N's pixels/DCT/latent become modulation sources for frame N+1 (1-frame delay, vision C6). Unknowns: (1) where in `engine/pipeline.py` the rendered frame can be tapped without a copy that blows the frame budget; (2) runaway behavior — does sentinel L2-clamp alone keep a depth=1.0 feedback loop bounded for 100+ frames (SPEC-3 §3.5 runaway test, but in the real pipeline); (3) **D10**: is merged B4-lite axis-binding (#148/#158) a sufficient routing substrate, or does C6 need vision-B4 binding rules (Tier 3, unbuilt)? If (3) = needs-B4-full → C6 build chain BLOCKS on Tier 3; record and stop. (~4 h)
- **PRECONDITIONS:** G-CHECK; P7.7a merged; read `backend/src/modulation/video_analyzer.py` first (existing frame-derived mod source — closest prior art; the spike may be an extension of it rather than new machinery — read-existing-component-first).
- **Scope:** `backend/scripts/spikes/c6_feedback_spike.py`; throwaway.
- **ACCEPTANCE GATES:** report with: tap-point decision + measured per-frame cost (number in ms vs the 16 ms budget), **100-frame** runaway plot (bounded or not, at depth=1.0), D10 verdict, GO/BLOCKED recommendation. **Grep-checkable deliverable:** `backend/scripts/spikes/REPORT-p7.10a-c6.md` on the spike branch; `grep -cE '^VERDICT: (GO|BLOCKED)$'` = 1 AND `grep -cE '^D10: (B4-LITE-SUFFICIENT|NEEDS-B4-FULL)$'` = 1 AND `grep -cE '[0-9]+(\.[0-9]+) ?ms'` ≥ 2 AND the plot file exists (`ls backend/scripts/spikes/p7.10a-runaway-100f.png`).
- **EVIDENCE:** report + plot in tracking issue, grep-gate outputs quoted.

### P7.10b — C6 spec

- **ID:** P7.10b · **Branch:** `docs/p7.10b-c6-spec` · **Depends-on:** P7.10a = GO. Same contract as P7.9b: spec + sliced ≤4 h build-packet list (P7.10c…) with verified paths; sentinel call sites mandatory on every feedback write; explicit interaction note with C8 (C8 = "C6 with L" — spec both surfaces once, C8 inherits). **Acceptance includes the §0 structural test-plan gate:** `grep -c "it('\|def test_" <c6 spec>` ≥ number of build slices, quoted in the PR. (~3 h)

### P7.10c — C6 build, slice 1

- **ID:** P7.10c · **Branch:** `feat/p7.10c-c6-feedback-source` · **Depends-on:** P7.10b merged; P7.7b (pipeline gate live — feedback without the NaN gate is forbidden, SPEC-3 §3.2). First slice per spec: frame-tap + pixel/DCT source registration + clamp + tests.
- **TEST PLAN:** NEW named test file `backend/tests/test_c6_feedback_source.py` with at minimum `test_nan_injected_into_loop_aborts_lane_and_loop_dies_cleanly` (the sentinel negative case — hard acceptance gate) and `test_frame_tap_cost_under_budget` (pins the P7.10a-measured tap cost against the frame budget). Run: `cd backend && python -m pytest tests/test_c6_feedback_source.py -x --tb=short` then the full suite.

---

## P7.11 — C8 Feedback-Through-L (XL → spike / spec+build chain)

### P7.11a — C8 spike — `RISK:HIGH`

- **ID:** P7.11a · **Branch:** `spike/p7.11a-c8-feedback-through-l` · **Base:** `origin/main` · **Depends-on:** P7.10a = GO, P7.4
- **Goal:** C8 = C6's loop routed through the L encoder: render → DINOv2 encode → latent modulates frame N+1, per-axis feedback rate. Unknowns: (1) sparse-encode cadence in a *feedback* context — does every-Nth-frame encoding + slerp (SPEC-5 §3.2) destroy the feedback character or create it; (2) latency stack-up: frame render + async encode round-trip vs 16 ms budget at the P7.0-measured DINOv2 latency; (3) drift: does the latent walk leave distribution within 100 frames even with clamping (the SPEC-3 §3.1 failure mode, live). (~4 h)
- **PRECONDITIONS:** G-CHECK; P7.10a GO report; real DINOv2 cache present.
- **ACCEPTANCE GATES:** report: cadence recommendation, measured loop latency vs the P7.0 numbers, **100-frame** drift trace, GO/ADJUST/KILL. **Grep-checkable deliverable:** `backend/scripts/spikes/REPORT-p7.11a-c8.md` on the spike branch; `grep -cE '^VERDICT: (GO|ADJUST|KILL)$'` = 1 AND `grep -cE '^CADENCE: 1:(2|4|8|16)$'` = 1 AND `grep -cE '[0-9]+(\.[0-9]+) ?ms'` ≥ 3 (loop latency, encode round-trip, frame render) AND drift-trace artifact exists (`ls backend/scripts/spikes/p7.11a-drift-100f.csv` or `.png`).
- **EVIDENCE:** report + drift trace, grep-gate outputs quoted.

### P7.11b — C8 spec + build slice 1

- **ID:** P7.11b · **Branch:** `feat/p7.11b-c8` · **Depends-on:** P7.11a = GO; P7.10c merged (C8 layers on C6's tap + routing). Because C8 is contractually "C6 with L" (vision §6), spec is a ≤2-page delta on the C6 spec, then build slice 1 in the same packet IF the combined estimate stays ≤4 h; otherwise split per P7.9b convention. Sentinel + SG-8 registration mandatory; per-axis feedback-rate param surfaced.
- **SPEC gate (structural, §0 conventions):** the C8 spec delta contains a "Test plan" section with named titles — `grep -c "it('\|def test_" <c8 spec delta>` ≥ 1 per slice, quoted in the PR.
- **BUILD TEST PLAN:** NEW named test file `backend/tests/test_c8_feedback_through_l.py` with at minimum `test_feedback_through_l_drift_bounded_100_frames` (the P7.11a drift trace, pinned as a regression test) and `test_sparse_encode_cadence_matches_spike_recommendation` (the cadence the spike recommended, asserted in code). Run: `cd backend && python -m pytest tests/test_c8_feedback_through_l.py -x --tb=short` then the full suite.

---

## P7.12 — E1 Resynthesis-Latent Mode (XL → spike / spec / build chain)

### P7.12a — E1 spike — `RISK:HIGH` (vision §9 explicitly: "spike before commit")

- **ID:** P7.12a · **Branch:** `spike/p7.12a-e1-vae` · **Base:** `origin/main` · **Depends-on:** P7.0 GO (heavy deps), P7.4 useful but not required
- **Goal:** Per-project autoencoder feasibility on the user's real hardware (M4 16 GB measured in P7.0). Unknowns: (1) training wall-time on representative project content — vision claims "<60 s is optimistic"; measure a tiny conv-VAE on ~500 frames at 3 sizes; (2) resident memory of the trained model vs the SG-8 budget row "E1 project-fit VAE ~100MB–1GB"; (3) inference latency post-training (must be frame-budget compatible); (4) MLX vs PyTorch-MPS for the training loop. (~4 h)
- **PRECONDITIONS:** G-CHECK; P7.0 venv; ≥10 GB free RAM headroom check (`vm_stat`).
- **Scope:** `backend/scripts/spikes/e1_vae_spike.py`; throwaway.
- **ACCEPTANCE GATES:** report: training-time table (frames × resolution × epochs — **≥ 3 size rows** as scoped in the Goal), peak memory (MB, vs the SG-8 budget row "E1 ~100MB–1GB"), inference ms (vs the 16 ms frame budget), recommendation incl. whether "training is an export-style background job" (almost certainly) and what the UX contract must be. KILL is an acceptable verdict — E1 KILL also forecloses D4 (D8) and that conclusion must be stated explicitly. **Grep-checkable deliverable:** `backend/scripts/spikes/REPORT-p7.12a-e1.md` on the spike branch; `grep -cE '^VERDICT: (GO|KILL)$'` = 1 AND `grep -cE '^D4-FORECLOSED: (yes|no)$'` = 1 AND `grep -cE '^\|.*\|'` ≥ 5 (the training table) AND `grep -cE '[0-9]+ ?(MB|GB)'` ≥ 1.
- **EVIDENCE:** report + tables, grep-gate outputs quoted.

### P7.12b — E1 spec

- **ID:** P7.12b · **Branch:** `docs/p7.12b-e1-spec` · **Depends-on:** P7.12a = GO. Spec: training job lifecycle (background, cancellable — borrow SG-6 cancellation thinking but do NOT build SG-6, it's Tier 6), model storage per-project, latent-code routing as mod source, sentinel sites, SG-8 registration (priority 4 row), MLP-distill option deferred-or-not decision. Plus sliced build list. **Acceptance includes the §0 structural test-plan gate:** `grep -c "it('\|def test_" <e1 spec>` ≥ number of build slices, quoted in the PR. (~3 h)

### P7.12c — E1 build, slice 1

- **ID:** P7.12c · **Branch:** `feat/p7.12c-e1-training-job` · **Depends-on:** P7.12b merged; P7.7b. First slice per spec (likely: training job runner + persistence + progress events, no routing yet).
- **TEST PLAN:** NEW named test file `backend/tests/test_e1_training_job.py` with at minimum `test_training_never_on_audio_or_render_thread_qos_asserted` (the hard gate — SG-4 lint PLUS an explicit process/QoS assertion), `test_training_job_cancellable_mid_epoch`, and `test_progress_events_emitted`. Run: `cd backend && python -m pytest tests/test_e1_training_job.py -x --tb=short` then the full suite; SG-4 lint green.

---

## P7.13 — D4 Latent Granulator — feasibility spike ONLY — `RISK:HIGH`

- **ID:** P7.13 · **Branch:** `spike/p7.13-d4-decode-feasibility` · **Base:** `origin/main` · **Depends-on:** P7.12a = GO (D4 needs E1's decoder); EXTERNAL: A1/B8 Granulator (Tier 4) unbuilt
- **Goal:** D4's premise — "each grain = project rendered at latent (x,y,z) for 50 ms" — requires latent DECODE, which SPEC-5 §8 marks deferred (D8). This spike answers ONE question: can the E1 project-fit VAE's decoder produce a usable 50 ms grain (≥3 frames) within a granulator's scheduling budget? Measure decode latency + visual coherence on the P7.12a spike model. (~3 h)
- **PRECONDITIONS:** G-CHECK; P7.12a report = GO with a trained spike model available; confirm B8 status (`git grep -rn "granulator" origin/main -- backend/src/effects/ | head` — A5 *spectral* granulator (#165) is NOT A1/B8; do not confuse them).
- **Scope:** `backend/scripts/spikes/d4_decode_spike.py`; throwaway.
- **ACCEPTANCE GATES:** report with decode-ms per frame (a 50 ms grain needs **≥3 frames decoded inside the granulator scheduling budget** — state the budget number used), subjective coherence note (attach 3 decoded frames), and a verdict: FEASIBLE-AFTER-E1+B8 / INFEASIBLE-DEFER-v1.1. **Grep-checkable deliverable:** `backend/scripts/spikes/REPORT-p7.13-d4.md` on the spike branch; `grep -cE '^VERDICT: (FEASIBLE-AFTER-E1\+B8|INFEASIBLE-DEFER-v1\.1)$'` = 1 AND `grep -cE '[0-9]+(\.[0-9]+) ?ms'` ≥ 1 AND `ls backend/scripts/spikes/p7.13-frames/*.png | wc -l` ≥ 3. **No D4 build packets exist in this phase by design** — if FEASIBLE, the D4 spec+build chain is authored in a Phase-7 addendum only after B8 (Tier 4) merges.
- **ROLLBACK:** delete spike worktree.
- **EVIDENCE:** report + decoded-frame attachments.

---

## P7.14 — E6 Live Performance Mode (XL → spike / spec+build chain)

### P7.14a — E6 spike — `RISK:HIGH`

- **ID:** P7.14a · **Branch:** `spike/p7.14a-e6-degradation` · **Base:** `origin/main` · **Depends-on:** P7.6 VERIFY PASS (P7.6 is a stub — nothing merges; the real dependency is P5b.1/P5b.2 on main, which P7.6's script proves); **EXTERNAL (D9): E5 Hardware Bridge (draft #145, Tier 3, VERIFIED OPEN) is unmerged — full E6 build BLOCKS on it; the spike does not.**
- **Goal:** E6's core mechanism is graceful axis-aware degradation under a frame-rate floor ("drop F-depth before frames", vision E6) driven by SG-8 pressure events. Spike: (1) instrument the real render loop for sustained-fps measurement; (2) prototype a degradation ladder (reduce F-depth → reduce preview resolution → drop L-axis cadence → drop frames last) as a pure policy function over SG-8's `PressureEvent` + measured fps; (3) measure recovery hysteresis (no oscillation). (~4 h)
- **PRECONDITIONS:** G-CHECK; P7.6 VERIFY PASS (its script's `git grep -qn "PressureMonitor" origin/main -- backend/src/zmq_server.py` leg non-empty); confirm E5 status with `gh pr view 145 --json state` and record it.
- **Scope:** `backend/scripts/spikes/e6_degrade_spike.py` + a policy-function prototype; throwaway.
- **ACCEPTANCE GATES:** report: ladder definition, fps trace under synthetic load showing the floor held (state the floor number, e.g. 30 fps, and the sustained-load duration ≥ 60 s), hysteresis behavior (0 oscillations across a load step-down/step-up cycle), and the E5-dependency statement (what subset of E6 — degradation + panic-recover — can ship without hardware bridge vs what waits). **Grep-checkable deliverable:** `backend/scripts/spikes/REPORT-p7.14a-e6.md` on the spike branch; `grep -cE '^LADDER: '` = 1 AND `grep -cE '^E5-SUBSET: '` = 1 AND `grep -cE '[0-9]+ ?fps'` ≥ 2 AND fps-trace artifact exists (`ls backend/scripts/spikes/p7.14a-fps-trace.csv` or `.png`).
- **EVIDENCE:** report + fps trace, grep-gate outputs quoted.

### P7.14b — E6 spec + build slice 1 (degradation core only)

- **ID:** P7.14b · **Branch:** `feat/p7.14b-e6-degrade-core` · **Depends-on:** P7.14a report; scope LIMITED to the E5-independent subset (frame-rate floor + axis-aware degradation + panic-recover + session preset save/load). Multi-output and hardware-bridge integration are explicitly out (wait for E5). Spec-then-slice per the P7.9b convention (incl. the §0 structural test-plan gate on the spec half); degradation policy must be a pure, unit-testable function; SG-8 is the only pressure source (no second monitor).
- **TEST PLAN:** NEW named test file `backend/tests/test_e6_degrade_policy.py` with at minimum `test_ladder_drops_f_depth_before_frames` (the vision-E6 ordering contract), `test_recovery_hysteresis_no_oscillation` (the P7.14a hysteresis behavior, pinned), and `test_frame_rate_floor_held_under_synthetic_load`. Run: `cd backend && python -m pytest tests/test_e6_degrade_policy.py -x --tb=short` then the full suite.

---

## Packet count: 14 top-level (P7.0, P7.0N, P7.1–P7.8 = 10 infra, of which P7.6/P7.7a/P7.7b/P7.7c are VERIFY-ONLY stubs — implementation owned by Phase-5b P5b.1–P5b.5) + 6 feature chains decomposed into 14 sub-packets — 24 executable units, each ≤4 h, 6 marked `RISK:HIGH` (P7.0 outcome and the 5 XL spikes + D4).

## Standing notes for executors

1. **One packet = one PR = one worktree.** Name worktrees `~/Development/entropic-p7x-wt`; remove after merge (hygiene gap G13).
2. **Spikes produce reports, not code.** A spike PR with code but no measured report fails its acceptance gate (verb-ask-deliverable-is-the-result).
3. **Every latent write in every packet calls the sentinel** once P7.7a lands. Reviewers grep for `np.ndarray` latent assignments without `check_and_clamp` adjacency.
4. **Binary statuses only** in tracking: ✅ ❌ ⏸ (named blocker) — no partials (feedback_no-yellows-binary-verdicts).
5. When main moves past `d821ae8`, re-run each packet's VERIFIED-path checks before starting — paths were verified against that SHA on 2026-06-11.

---

## Thickness-pass scorecard (2026-06-11, verified against `origin/main` @ `d821ae8` + the named draft worktrees)

Legend: ✅ = satisfied · ❌ = not satisfied (reason noted) · — = not applicable to packet type. Rubric: **R1** anchors verified (git grep/show/ls-tree against origin/main; cherry-pick payloads against named worktrees/SHAs) · **R2** full field contract + model tier · **R3** named tests, behavior-keyword titles, exact commands · **R4** gates quantified · **R5** failure modes + ≥1 negative test · **R6** integration test (feature packets) · **R7** depends-on resolves.

| Packet | R1 | R2 | R3 | R4 | R5 | R6 | R7 | Verification notes |
|---|---|---|---|---|---|---|---|---|
| P7.0 | ✅ | ✅ | — | ✅ | ✅ | — | ✅ | `python3.12` = 3.12.12 ✓; `entropic-q7-clap` tip = `687542f` ✓; DINOv2 168 MB + CLIP 1.7 GB cached, CLAP absent ✓; mock quarantined ✓; 193 GB free ✓; runner argparse + silent-on-`--out` + exit-1 shape read from source ✓; runbook `--canonical-sparsity` drift caught (real flag: `--sparsity`) |
| P7.0N | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | All six PRs (#127/#129/#131/#132/#133/#138) VERIFIED OPEN via `gh pr list`; inverse G-CHECK exit-bearing; negative check = G-CHECK still STOPs post-disposition |
| P7.1 | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | 14 commits `2ad5399..b8fefdb` ✓; 110 `def test_` in payload ✓; Makefile absent from main ✓; negatives `test_verdict_negative_p95_raises` + 2 `no_go` ✓; GH #121/#122 found and added to close list |
| P7.2 | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | Tips `17868ca`/`62637f5`/`b16b5d4` ✓; pressure lib on main (5 files) ✓; 4 named dinov2 tests incl. 2 negatives ✓; close list extended with #124/#125 (VERIFIED OPEN) |
| P7.3 | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | `ad7655d` (8 tests) + `687542f` (10 tests) ✓; negatives `test_clip_payload_dict_missing_image_and_text_raises`, `test_clap_real_rejects_wrong_sample_rate`, `test_clap_real_rejects_too_short_audio` ✓ |
| P7.4 | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | `8ebb567` ✓; **17** `def test_` (PR title says 16 — grep wins) ✓; payload has ZERO queue/overflow coverage (verified) → original bounded-queue gate was unsatisfiable; ownership reassigned to P7.5 in text; 3 named negatives ✓; real-dinov2 round-trip is `slow`+skipif-torch ✓ |
| P7.5 | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | `backend/src/audio/` on main ✓; `test_sg4_realtime_isolation.py` (#159) on main ✓ → NEW file renamed `test_sg4_runtime_starvation.py` to kill the realtime/runtime collision; no existing starvation tests ✓; this packet IS the negative-test packet (SIGKILL mid-inference, 1000-req flood, <100 ms fallback deadline) |
| P7.6 | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | Exit-bearing script + positive control (`class PressureMonitor` in monitor.py:53 ✓); P5b.1/P5b.2 artifact names cross-checked against phase-5b.md (incl. `test_pressure_wiring.py`, `memory-status.test.tsx`); today all 4 P5b legs correctly STOP (P5b unmerged) |
| P7.7a | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | Exit-bearing + control (`safety/__init__.py` on main ✓); added `DEFAULT_L2_CEILING` D3-compliance leg + 25-test-file presence leg |
| P7.7b | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | Control: pipeline.py + compositor.py both on main ✓; both named P5b.4 tests (`test_export_fails_loud_on_nan_frame`, `test_nan_frame_blocked_and_last_good_served`) cross-checked against phase-5b.md TEST PLAN |
| P7.7c | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | Control: `frontend/src/renderer/stores/toast.ts` on main ✓; `sg3-lane-mute.test.tsx` + `test_per_backbone_ceiling_override` names match phase-5b.md P5b.5 verbatim |
| P7.8 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `cef60ee` = exactly 2 files, 408 insertions ✓; store test has **24** `it()` ✓; statuses incl. `verifying`/`cancelled` verified in store source → SHA-mismatch + cancel + interrupt negatives are real; integration test (real store, mock IPC only) added |
| P7.9a/10a/11a/12a/13/14a (spikes) | ✅ | — (by design) | — | ✅ | — | — | ✅* | Left structurally as-is per scope; each gained a grep-checkable REPORT path + verdict-line regex (=1) + measured-number floor; P7.14a depends-on fixed ("P7.6 merged" → "P7.6 VERIFY PASS"); E5 #145 VERIFIED OPEN |
| P7.9b/c, 10b/c, 11b, 12b/c, 14b (Q7-gated chains) | ⏸ | — | ✅ (named tests pre-existing) | ✅ | ⏸ | ⏸ | ⏸* | Untouched by design (Q7-gated); see unfixables for the one depends-on flaw found |

### Unfixables (found, not fixable inside this file)

1. **P7.9c's `TODO(P7.9c)` precondition has no planter.** The grep `git grep -n "TODO(P7.9c)" origin/main -- backend/src/` expects an SG-8 stub marker, but phase-5b.md P5b.1 (which owns the SG-8 wiring) nowhere instructs planting that TODO. Fix belongs in `packets/phase-5b.md` P5b.1 Steps (add "mark backbone disable hooks `TODO(P7.9c)`") — out of this pass's edit scope.
2. **Runbook drift lives on the q7 branch, not here.** `q7-measure.md` (in `entropic-q7-clap`) still says `--canonical-sparsity` (flag doesn't exist), writes to `~/q7-report.json`, and claims CLIP/CLAP "lit in PR #9" (actually #13/#14). P7.0 now warns inline; the runbook itself gets corrected when P7.2 cherry-picks it (add a fixup commit there).
3. **PR #127's title says "16 tests"; the file carries 17.** Source-of-truth divergence in a GitHub PR title — not editable from docs; P7.4 instructs pasting the collected count.
4. **The gate artifact `~/.entropic/q7-report.json` is an unversioned home-dir file.** Nothing in docs can make it tamper-evident; G-CHECK's `backend != "mock"` + the quarantined `.MOCK.` rename is the strongest available control.
5. **P7.6/P7.7 stubs can never fire today** — P5b.1–P5b.5 are unmerged (verified: all four artifact greps empty on `d821ae8`). Not a defect (they're designed to STOP), but sequencing means Phase-7 sessions hitting these stubs before Phase-5b ships will report STOP, correctly.
