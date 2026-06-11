# Creatrix Execution Plan — One-Shottable Work Packets

**Date:** 2026-06-11 · **Repo:** `~/Development/entropic-v2challenger` (origin/main @ `d821ae8`)
**Companion to:** `docs/roadmap/ROADMAP.md` (phases + ledger). This file turns phases into packets.
**Anchor audit:** every file:line anchor below re-verified against `origin/main` @ `d821ae8` on
2026-06-11 (thickness pass); per-packet verdicts in the scorecard at the end of this file. One stale
anchor found and fixed (P3.1 35vh cap — see packet).

**Rule of expansion:** Phases 1–3 are fully specified below against origin/main as of 2026-06-11.
Phases 4–9 get stubs only — at each phase boundary the orchestrator **regenerates packets just-in-time
from live main** using the §1 contract + the cited plan doc, because file paths and line anchors rot.
Never execute a stub directly.

---

## 1. The Work Packet Contract

Every packet below has these fields. An executor (Sonnet-class agent) runs them top to bottom with
**zero improvisation**.

| Field | Meaning |
|---|---|
| **ID / branch / base** | Packet ID · branch to create · base ref (always `origin/main` unless stated) |
| **Depends-on** | Packets that must be MERGED first (or named artifact gates with an existence precondition) |
| **Goal** | One sentence |
| **Preconditions** | Exact grep/read commands run FIRST, each with expected output. **Any mismatch → STOP, report to orchestrator, do not improvise.** |
| **Scope** | Checklist of verified file paths the packet may touch |
| **DO-NOT-TOUCH** | Files/areas that must show zero diff |
| **Steps** | Implementation order |
| **Test plan** | Exact commands + new test files with the behavior keyword in the test title. **Every packet includes ≥1 negative test** (rejection/error path proven, not just the happy path) |
| **Acceptance gates** | CI green + specific QUANTIFIED assertions (counts, thresholds, ratios — never "works") (+ perf gates where defined, derived from `docs/roadmap/PERF-MODEL.md`) |
| **Failure modes** | The known ways this packet goes wrong + the prescribed reaction for each (STOP conditions, revert-first rules) |
| **Rollback** | Always: revert the PR. **No migrations, ever** (single-tester app, clean-break policy per PLAN.md v1.2) |
| **Evidence** | Commands + output pasted into the PR body |
| **Model** | Tier per ROADMAP §3 rule 9: Sonnet default · Haiku for mechanical · Opus/Fable for RISK:HIGH (+ `/qa-redteam` before merge) |

**Standard test commands** (verified against repo + `.github/workflows/test.yml`, workflow
"Entropic v2 Tests", jobs `smoke` / `sidecar` / `electron-e2e` / `test-health-comment`):

```bash
# Backend full:   cd backend && python -m pytest -x -n auto --tb=short
# Backend smoke:  cd backend && python -m pytest tests/ -m smoke --tb=short -q
# Frontend unit:  cd frontend && npx --no vitest run        # MUST use --no (project-local vitest)
# E2E smoke:      cd frontend && npx playwright test tests/e2e/smoke.spec.ts
```
Backend markers (verified in `backend/pyproject.toml`): `perf`, `smoke`, `oracle`, `metal`
(`perf` is deselected by default via `addopts = "-m 'not perf' ..."` — run explicitly with `-m perf`).

**Orchestration rules:**
1. One packet = one agent = one worktree (`isolation: "worktree"`). Never two packets in one worktree.
2. Packet size target **≤ 4h**. Anything bigger gets decomposed before dispatch.
3. Parked q7 drafts (#117–#145) are **cherry-pick-only, NEVER raw-merge** — stale merge-base falsely
   reverts merged work (`feedback_cherry-pick-stale-scaffold-branches.md`).
4. **No parallel reimplementation** of existing components — evolve in place (PR #154 was closed as
   waste for violating this; `feedback_read-existing-component-before-parallel-build.md`).
5. Model routing: **Sonnet default**. Packets marked **RISK:HIGH** go to Opus/Fable and get a
   `/qa-redteam` pass before merge.
6. Merge order is the packet numbering unless a depends-on says otherwise.
7. **Single-flight on shared hotspots:** no two packets touching `frontend/src/renderer/styles/global.css`
   may be in flight simultaneously; same for `backend/src/zmq_server.py` dispatch — at most one in-flight,
   others queue.
8. **CI capacity (Gap G14):** packet PRs + re-derived draft branches share one CI pool — keep ≤3 packet PRs awaiting CI at any time; doc-only packets note `[skip-e2e]` intent in the PR body where the workflow permits.
9. **LIVE-SMOKE CADENCE (standing rule):** after **every 5 merged feature packets** (merge/verify and
   doc-only packets don't count toward the 5), the orchestrator runs a live smoke before dispatching the
   next packet: launch the app per repo CLAUDE.md (`cd frontend && npm start`, then Gate 18 — `ps aux |
   grep -i electron` to name the live runtime path), and run the **5 core flows**: ① import a video →
   ② add an effect to its chain → ③ scrub the preview → ④ automate one param → ⑤ export a 2-second clip.
   **Screenshot each flow** (5 shots minimum); file the shots + the runtime path as evidence in the PR
   body of the 5th packet (or a dedicated smoke-report comment on it). Any flow broken → STOP the
   campaign, bisect the last 5 merges, fix-or-revert before any new packet dispatches. Protocol detail
   (screenshot inventory, contrast/signifier checks, computer-use setup) lives in
   `packets/ux-audit.md` **PUX.6** — this rule is the recurring lightweight version of that pass.

---

## 2. Phase 1 — Drain the frontier (merge/verify packets)

These are verification packets, not build packets: rebase, test, verify the claimed behavior, merge.

### P1.0 — Binary-green vitest baseline (runs FIRST, before any merge packet)
- **Branch:** `chore/p1.0-vitest-green-baseline` · **Base:** origin/main · **Depends-on:** — (first packet of the campaign)
- **Goal:** The campaign starts from a binary-green frontend suite: identify the 4 failing vitest tests (ROADMAP §0: 1,814/1,818), fix or skip-with-reason, and record the green baseline in ROADMAP §0.
- **Preconditions:**
  - `cd frontend && npx --no vitest run 2>&1 | tail -30` → expect exactly 4 failures. 0 failures → already green: record command + count in ROADMAP §0 and close. >4 failures → `{ echo "STOP: new regressions beyond the known baseline"; exit 1; }`.
- **Steps:** (1) enumerate the 4 failing files + test titles from the run output; (2) per test: fix if root cause is ≤30 min, else `it.skip` with a comment naming the tracking reason (`// SKIP(P1.0): <reason> — tracked in <issue/packet id>`); (3) record in ROADMAP §0: the exact command (`cd frontend && npx --no vitest run`) + the expected pass count after this packet.
- **Test plan:** `cd frontend && npx --no vitest run` → exit code 0; `grep -rn "SKIP(P1.0)" frontend/src/__tests__/` → one hit per skipped test, each naming its reason. **Negative gate:** `grep -rn "it\.skip" frontend/src/__tests__/ | grep -v "SKIP(P1.0)" | grep -v <pre-existing skips enumerated in step 1>` → 0 new hits (an `it.skip` without the tracking comment FAILS this packet).
- **Acceptance gates:** vitest exits 0; total test count still 1,818 (no tests deleted); zero unexplained skips (every new `it.skip` carries the `SKIP(P1.0)` comment); ROADMAP §0 records command + expected pass count.
- **Failure modes:** a "failing" test is actually flaky (passes on rerun) → mark with the existing reruns config evidence, do NOT skip it, note flakiness in ROADMAP §0. Root cause touches production code beyond 30 min → skip-with-reason and file the fix as its own packet; never half-fix prod code inside a baseline packet.
- **Rollback:** revert PR. · **Evidence:** before/after vitest summary lines + the skip-comment grep output.
- **Model:** Sonnet.

### P1.1 — Merge the PR-B slice stack #157 → #158 → #160
- **Branch:** none (operates on existing PR branches) · **Depends-on:** P1.0 (green baseline to diff against)
- **Goal:** Land automation unification, B4-lite axis binding, and export-determinism in strict order.
- **Preconditions (anchors verified 2026-06-11):**
  - `git grep -n "isTrigger" origin/main -- frontend/src/renderer/stores/automation.ts | head -3` → hits at :93/:116/:135 (verified; a 4th at :373 — i.e. #157 NOT yet merged). If zero hits → #157 already merged, skip to #158.
  - `gh pr view 157 158 160 --json state` → all `OPEN`.
- **Steps (per PR, in order 157, 158, 160):** rebase on current main → run frontend unit + backend smoke → verify the claimed behavior → merge (squash) → **wait for CI on main (all 3 jobs)** → repeat for next.
  - **#157 claimed behavior:** `InterpolationMode = 'smooth'|'step'|'gate'|'oneShot'` replaces `isTrigger`/`triggerMode`; `addTriggerLane` removed; mode `'step'` holds left point. Verify: `git grep -c "isTrigger" frontend/src/` on the PR branch → 0 in prod code; grep `InterpolationMode` in `frontend/src/shared/types.ts` → present.
  - **#158 claimed behavior:** `AutomationLane.axisBinding?: LaneAxisBinding` + `setLaneAxisBinding` with Tier-1 validator (accepts only `broadcast` + domains `t|y|x`); reuses `frontend/src/shared/axis-binding.ts` (verified on main). Verify validator rejection test exists and passes — grep #158's added test file(s) for the literal keyword `reject` (`git diff origin/main...pr-head --name-only | grep __tests__`, then `grep -n "reject" <each file>`); zero hits → bounce the PR. NOTE: this is schema spine only — the `domain='y'` render unlock is deferred to C2/C3 by design; do not flag its absence as a defect.
  - **#160 claimed behavior:** export uses real `projectStore.seed` instead of hardcoded `project_seed: 42`. Verify: grep `42` near `project_seed` in export path → gone; determinism test green.
- **Test plan:** per PR: `cd frontend && npx --no vitest run` (count vs P1.0 baseline) + `cd backend && python -m pytest tests/ -m smoke --tb=short -q`. The behavior-verification greps above ARE the named-behavior checks; each must be pasted in evidence. **Negative tests (required to exist in the PRs, bounce if absent):** #157 — a test proving an unknown/legacy `isTrigger` field in a loaded project is handled (defaulted to `'smooth'`, not crashed); #158 — the validator rejection test (`reject` keyword, see above).
- **DO-NOT-TOUCH:** anything outside each PR's own diff (rebase conflicts only).
- **Acceptance gates:** CI green (`smoke` + `sidecar` + `electron-e2e`) after EACH merge before starting the next; full frontend suite pass count ≥ the P1.0 recorded baseline (≥1,814) + each PR's own added tests; the three behavior greps return their expected outputs.
- **Failure modes:**
  - **Merge conflict mid-stack** (#157 merged, #158 rebase conflicts): STOP after the clean merge — never force-resolve #158 to "keep momentum", and never merge #160 ahead of #158 (strict order is the contract). Report the conflicting hunks to the orchestrator; main stays releasable (rule: a phase may stop ONLY at green main — a half-merged stack with #157 alone IS green and releasable).
  - **CI red after merge:** revert the just-merged squash commit FIRST (`gh pr` revert or `git revert <sha>` via PR), then diagnose on a branch. Never fix-forward on red main (ROADMAP §3 rule 3).
  - **Rebase divergence** (PR branch shares hunks with merged work, diff falsely shows reverts): check merge-base distance + per-commit `git show --stat` (`feedback_cherry-pick-stale-scaffold-branches.md`) before assuming the PR is bad.
- **Rollback:** revert the offending squash merge(s) in reverse order; the stack is 3 independent revert points.
- **Evidence:** per-PR: rebase log, test summary lines, behavior-verification grep output, CI run links.
- **Model:** Sonnet.

### P1.2 — Merge #164 BPM persistence fix
- **Branch:** none (operates on PR #164) · **Depends-on:** P1.1 (rebase target stability) · **Goal:** BPM survives save/reload.
- **Preconditions (anchor verified 2026-06-11):**
  - `git grep -n "bpm" origin/main -- frontend/src/renderer/project-persistence.ts` → single hit `:135  bpm: 120,` (verified — write-default, never hydrated — the bug). If more hits → already fixed, close packet.
- **Scope:** PR #164's own diff only (rebase conflicts excepted). · **DO-NOT-TOUCH:** `frontend/src/renderer/stores/project.ts` `setBpm` clamp (verified `[1,300]` at :292–294 — the fix is hydration, not the clamp).
- **Steps:** rebase #164, run `cd frontend && npx --no vitest run`, verify a test exists whose title contains "bpm" + "hydrat" or "round-trip" in `frontend/src/__tests__/stores/project-persistence.test.ts`, merge.
- **Test plan:** `cd frontend && npx --no vitest run src/__tests__/stores/` then full suite. **Negative test (must exist in the PR, bounce if absent):** loading a save with a MISSING or non-finite `bpm` field falls back to 120 — no `NaN` reaches the store (the `setBpm` finite-guard at project.ts:293 is the backstop; the load path must not bypass it).
- **Acceptance gates:** save→load round-trip test proves non-default BPM (e.g. 93) restores; full suite ≥ baseline.
- **Failure modes:** rebase divergence with #157/#158's automation changes (both touch persistence-adjacent files) → re-verify the single-hit precondition on the REBASED branch, not just origin/main; CI red after merge → revert first (P1.1 rule).
- **Rollback:** revert the squash merge. · **Evidence:** test titles + round-trip test output + grep of the hydration site.
- **Model:** Sonnet.
- **Note for orchestrator:** MUST merge before P2.1 (BPM split builds on hydrated `bpm`).

### P1.3 — Merge #156 (B1 sampler persistence) then #167 (B2-lite performance track)
- **Branch:** none (operates on PR branches) · **Depends-on:** P1.1
- **Goal:** Land sampler persistence, then the B2-lite track-bound model on top.
- **Preconditions (anchors verified 2026-06-11):**
  - `git ls-tree --name-only origin/main frontend/src/renderer/stores/ | grep instruments` → `instruments.ts` exists (verified; global single-instrument shape with `addSampler/updateSampler/removeSampler` at :22–24).
  - `git grep -n "addTrack" origin/main -- frontend/src/renderer/stores/timeline.ts | head -2` → `:43` signature `type?: 'video' | 'text'` (verified; #167 extends to `'performance'`; `Track.type` union at `frontend/src/shared/types.ts:59` already includes `"performance"` — verified).
- **Steps:** merge #156 first (global-sampler persistence) → CI green → rebase #167 on the result — **#167 changes `useInstrumentsStore` from one global instrument to `Record<trackId, SamplerInstrumentV1>`, a breaking change to #156's persistence shape** (G10). Resolve in #167, never by re-editing main. Verify #167 behaviors per `docs/roadmap/plans/entropic-B2-performance-track-sampler-2026-06-05.md` test plan: Cmd+Shift+T creates performance track; drag Sampler from instruments tab onto it; drop video sets `clipId`; two tracks own independent samplers; persistence round-trip.
- **DO-NOT-TOUCH:** `frontend/src/renderer/components/effects/EffectBrowser.tsx` beyond the drag-payload reuse #167 already contains.
- **Test plan / verification method (do not merge without it):** grep #167's added test files (`git diff origin/main...pr-head --name-only | grep __tests__`) for it() titles containing "performance track", "drag", "clipId", "round-trip"; run `cd frontend && npx --no vitest run <those files>` then the full suite. **Negative test (must exist, bounce if absent):** a project saved with #156's GLOBAL single-sampler shape loads after #167 without crash — either migrated into a track-keyed entry or dropped with a clear toast, never a throw (this is the G10 seam; clean-break policy permits "dropped with toast" but NOT "crash").
- **Live-runtime (Gate 18):** after #167 merges, a live drag smoke — `ps aux | grep -i electron` to name the runtime path in the evidence; drag Sampler → performance track → drop video; confirm `clipId` set.
- **Acceptance gates:** CI green after each merge; `buildSamplerLayer` multi-track test green (`frontend/src/__tests__/components/instruments/buildSamplerLayer.test.ts`); the 4 behavior-keyword greps each return ≥1 hit.
- **Failure modes:** rebase divergence — #167 predates #156's merge; after rebasing, re-run the FULL #167 test list, not just conflicts' files. CI red after merge → revert first. #167's store rewrite conflicts with a parallel P5a.1 worktree (phase-5a marks `instruments.ts` a merge-conflict magnet) → single-flight: no P5a packet dispatches until P1.3 closes.
- **Rollback:** revert #167 first, then #156 if needed (reverse order — #167 builds on #156's shape).
- **Evidence:** behavior-grep hits, vitest output, runtime path + drag-smoke screenshot.
- **Model:** Sonnet (escalate to Opus with one-line justification if the G10 conflict resolution exceeds trivial).

### P1.4 — Merge #146 Grid Moire v2
- **Branch:** none (operates on PR #146) · **Depends-on:** — (independent) · **Goal:** Fix black-render + two independent liquify meshes.
- **Ownership:** P1.4 is the SOLE owner of merging #146. `packets/effects-quality.md` PFX.2 is follow-ups only and hard-gates on this merge.
- **Preconditions:** `gh pr view 146 --json state` → OPEN.
- **Steps:** rebase, run backend full suite, verify the generator no longer renders black (claimed fix — confirm a regression test asserts non-zero frame variance for grid_moire), merge.
- **Test plan:** `cd backend && python -m pytest -x -n auto --tb=short`; `python -m pytest -m oracle -q` (count before vs after). **Negative test (must exist in the PR, bounce if absent):** the variance regression test must FAIL on a black frame — verify by reading the assertion (variance > threshold, threshold > 0), not just that it passes.
- **Acceptance gates:** CI green; oracle suite count unchanged (`python -m pytest -m oracle --collect-only -q | tail -1` before == after); variance test green with a stated threshold.
- **Failure modes:** rebase divergence with the spectral-family merges (#162/#165 touched the effects registry after #146 branched) → conflict in `registry.py` is expected, resolve toward main's registry and re-run full backend; CI red after merge → revert first.
- **Rollback:** revert squash merge. · **Evidence:** pytest summary, variance-test assertion quoted, oracle count before/after.
- **Model:** Sonnet.

### P1.5 — Disposition the 5 stale May PRs (#101, #103, #108, #109, #67)
- **Branch:** none · **Depends-on:** P1.1–P1.4 (rebase last) · **Goal:** Each stale PR is merged, updated, or closed-with-reason. No PR left in limbo.
- **Preconditions:** `gh pr view 101 103 108 109 67 --json state,mergeable` — record each.
- **Per-PR verdicts to verify:**
  - **#101** Escape-deselect in perform mode (F-0514-5) — real open bug; rebase + merge. Verify the R.4 integration test title names "Escape" + "perform".
  - **#103** zero-default hint badge (F-0516-7) — **check for reverted files first** (`git diff origin/main...pr-head --stat`; flag any file whose diff deletes post-May work) per ROADMAP G8. This IS this packet's named negative check: a stale branch that silently reverts merged work must be caught BEFORE merge, not after.
  - **#108** ZMQ REQ-socket mutex — rebase; run `cd backend && python -m pytest tests/ -k zmq --tb=short` + the sidecar CI job.
  - **#109** timeline drag-reorder — rebase; conflicts likely with #167's track-type change; verify drag-end doesn't fire click-deselect (`feedback_drag-end-suppresses-click.md`). Verification method: grep #109's diff for a vitest title containing "drag-end" AND "deselect" (`git diff origin/main...pr-head | grep -E "it\(.*(drag-end|deselect)"`); run `cd frontend && npx --no vitest run src/__tests__/components/timeline/`; if no such test exists, bounce the PR.
  - **#67** docs — merge or fold into #168 and close.
  - **#168** (this consolidation's docs PR, not stale-May but dispositioned here): merge it once all packet docs land — EXECUTION-PLAN, packets/* (incl. `user-expectations.md`), ROADMAP, INDEX — it is the canonical-docs flip; do not merge piecemeal.
- **Test plan:** per-PR commands as listed above; full frontend + backend smoke after each merge.
- **Acceptance gates:** exactly 0 of {#101,#103,#108,#109,#67} open afterward; each close has a one-line reason comment; #168 merged or explicitly queued with the named remaining doc; suite counts ≥ baseline after every merge.
- **Failure modes:** **rebase divergence is the headline risk here** — all five branches are ≥3 weeks stale; for EACH: check `git merge-base origin/main pr-head` distance and per-commit `git show --stat` before trusting the diff (stale-scaffold hazard); a diff that deletes post-May files → cherry-pick the isolated payload onto a fresh branch instead of raw-merging. CI red after any merge → revert first.
- **Rollback:** revert the individual squash merge.
- **Evidence:** per-PR: state record, merge-base distance, verdict + action + test output.
- **Model:** Sonnet.

### P1.6 — Hygiene: prune worktrees + verify cron
- **Branch:** none (no PR; local operation) · **Depends-on:** P1.1–P1.5 merged (their worktrees become prunable) · **Goal:** Worktree count down from 58 to active-only.
- **Preconditions (verified 2026-06-11):** `git -C ~/Development/entropic-v2challenger worktree list | wc -l` → currently **58** (verified; ROADMAP says "~19 prunable" — undercount; treat 58 as ground truth).
- **Steps:** for each worktree whose branch is merged or whose PR is closed: **run the Gate-19 6-check audit before removal** (git log --all on the path, stash list, reflog, fsck, sibling dirs) — never delete a worktree holding unmerged unique commits. `git worktree remove <path>` only after audit. Keep: main checkout, `entropic-v2-uat`, any worktree of a still-open PR, q7 draft worktrees (parked, not stale). Verify cron `b3c47f1c`: `crontab -l | grep b3c47f1c` → already returns 0 hits (verified 2026-06-11; record as confirmed-dead).
- **DO-NOT-TOUCH:** never `rm -rf`; only `git worktree remove` (refuses dirty trees by default).
- **Test plan / negative check:** before ANY removal, run the audit on ONE worktree known to hold unique commits (e.g. a parked q7 worktree) and paste the audit output showing it is correctly classified KEEP — proves the audit discriminates, not rubber-stamps. A removal attempted on a dirty tree must be shown REFUSED by `git worktree remove` (don't `--force`).
- **Acceptance gates (quantified):** end count ≤ 30 (= main checkout 1 + `entropic-v2-uat` 1 + 22 parked q7 + open-PR worktrees + ≤5 slack); exact end count recorded; every removal has a one-line audit verdict; zero `--force` removals.
- **Failure modes:** a worktree's branch shows merged but holds uncommitted files → STOP on that worktree, identify the owning session via `~/.claude/.locks/session-*.lock` (parallel-session hazard), skip it, continue with the rest.
- **Rollback:** worktrees are re-creatable from their branches (`git worktree add <path> <branch>`); the 6-check audit guarantees no unique commits were lost.
- **Evidence:** before/after `git worktree list` output; per-removal audit one-liner; the KEEP-classification proof.
- **Model:** Haiku (mechanical, per ROADMAP §3 rule 9) — escalate to Sonnet if any audit is ambiguous.

### P1.7 — Return the canonical checkout to main
- **Branch:** none (operates on the main checkout; no PR unless a doc correction falls out) · **Depends-on:** P1.1–P1.6 (frontier drained)
- **Goal:** `~/Development/entropic-v2challenger` (currently parked on `docs/torn-edges-solutions` — the multi-session branch-switch hazard, ROADMAP Phase 1) returns to `main`.
- **Preconditions:**
  - `git -C ~/Development/entropic-v2challenger status --porcelain` → MUST be empty; non-empty → `{ echo "STOP: dirty canonical checkout — stash-first rule; identify the owning session via ~/.claude/.locks/session-*.lock before touching anything"; exit 1; }`.
  - `git -C ~/Development/entropic-v2challenger branch --show-current` → record the current branch in the report.
- **Steps:** `git -C ~/Development/entropic-v2challenger checkout main && git -C ~/Development/entropic-v2challenger pull`.
- **Test plan / Acceptance:** `git -C ~/Development/entropic-v2challenger branch --show-current` → `main`; `git -C ~/Development/entropic-v2challenger log -1 --oneline` matches `origin/main`.
- **Failure modes:** another live session is mid-work on `docs/torn-edges-solutions` (lock file present) → STOP, do not checkout under it; checkout succeeds but `pull` fast-forward fails (diverged local main) → STOP and report, never reset.
- **Rollback:** `git -C ~/Development/entropic-v2challenger checkout docs/torn-edges-solutions`.
- **Evidence (Gate 18b):** the completion report names the branch AND the SHA (`git log -1 --format='%h %s'`) — never "done" without both.
- **Model:** Haiku-eligible (mechanical).

---

## 3. Phase 2 — Finish PR-B (slices 3b / 3c / 3d)

Source: `docs/roadmap/plans/entropic-PR-B-plan-2026-06-05.md`. Hard constraints: NO migration code ·
NO feature flag · v3 clean break · validator at transaction commit · Composite terminal-only ·
audio tracks never get Composite.

### P2.1 — Slice 3b: BPM split (`bpm` vs `effectiveBpm`)
- **Branch:** `feat/prb-3b-bpm-split` · **Base:** origin/main · **Depends-on:** P1.1 (#157/#158), P1.2 (#164)
- **Goal:** Split persisted baseline `bpm` from derived per-frame `effectiveBpm`, add `projectParam` modulation sink + Mixer/BPM automation target.
- **Preconditions (anchors verified 2026-06-11):**
  - `git grep -n "effectiveBpm" origin/main -- frontend/` → **zero hits** (verified — not yet built). Hits → STOP.
  - `git grep -n "bpm: number" origin/main -- frontend/src/renderer/stores/project.ts` → `:43` (verified); `setBpm` finite-guard + clamp `[1,300]` at :292–294 (verified).
  - `git ls-tree --name-only origin/main frontend/src/renderer/components/transport/` → contains ONLY `VolumeControl.tsx`, `Waveform.tsx`, `useWaveform.ts` (verified). **There is no `TransportBar.tsx`** (PLAN.md §4 names one — known doc discrepancy). BPM UI lives in `frontend/src/renderer/components/timeline/Timeline.tsx` (props `bpm` / `onBpmChange` at :20–21 — verified) wired from `App.tsx` (`setBpm`).
  - `git ls-tree --name-only origin/main frontend/src/renderer/components/performance/ | grep apply` → `applyCCModulations.ts`, `applyPadModulations.ts` exist (verified).
- **Scope:**
  - [ ] `frontend/src/renderer/stores/project.ts` — add `effectiveBpm` (derived, NEVER persisted)
  - [ ] `frontend/src/renderer/project-persistence.ts` — persist `bpm` only; assert `effectiveBpm` absent from saved JSON
  - [ ] `frontend/src/shared/types.ts` — `'projectParam'` sink on the modulation-target discriminant
  - [ ] `frontend/src/renderer/components/performance/applyCCModulations.ts` — factor: chain-targeted eval stays; new `applyProjectModulations.ts` (same dir) writes `effectiveBpm`
  - [ ] `frontend/src/renderer/components/timeline/Timeline.tsx` + `App.tsx` — BPM click-to-edit wiring
  - [ ] Automation picker — add "Mixer → BPM" target (picker lives in the automation components dir: `frontend/src/renderer/components/automation/`)
- **DO-NOT-TOUCH:** `backend/src/modulation/engine.py` (cycle detection is INJ-2-complete; BPM-via-LFO cycles already raise — `ModulationCycleError` verified at engine.py:20), `Track.opacity`/`blendMode` (that's 3c), `EffectBrowser.tsx`.
- **Steps:** types → store → factor modulation apply → UI → persistence → tests.
- **Test plan:** new `frontend/src/__tests__/stores/project-bpm-split.test.ts` — titles must include: "editing bpm shifts effectiveBpm baseline", "modulation writes only effectiveBpm", "save persists bpm only", "load hydrates bpm". **Negative tests (named):** "modulation source writing NaN leaves effectiveBpm at baseline" (clampFinite boundary) · "saved JSON never contains effectiveBpm key" (serialize + literal grep of the JSON string). **Integration test (named):** "bpm edit propagates: setBpm → effectiveBpm baseline → playback timing read" — exercises the full chain store → derived value → the playback-timing read site in one test. Run `cd frontend && npx --no vitest run`.
- **Live-runtime (Gate 18):** click-to-edit BPM in the running app (name the runtime path), set 93, save, relaunch (Zustand store-shape change → kill + relaunch per `feedback_zustand-hmr-needs-restart.md`), confirm 93 restored.
- **Acceptance gates:** all 4+2+1 named tests green; full suite ≥ baseline; engine reads `effectiveBpm` everywhere playback timing is computed — grep proof quantified: `git grep -n "\.bpm\b" frontend/src/renderer/` output enumerated, every hit classified (baseline-UI read | persistence | the one setBpm site), zero unclassified playback-path reads.
- **Failure modes:** a hidden reader of raw `bpm` in the playback path survives (the grep sweep is the catch — Trace Path gate); modulation graph writes `effectiveBpm` from a source derived from `effectiveBpm` (cycle) → must raise via existing INJ-2 toposort, add a test if not covered; CI red after merge → revert first.
- **Rollback:** revert PR. · **Evidence:** vitest summary + the named test titles + the classified grep sweep.
- **Model:** Sonnet.

### P2.2 — Slice 3c: Composite-as-terminal-effect — **RISK:HIGH**
36-file / 108-hit data-model break (removes `Track.opacity`/`blendMode`). **Requires fresh session,
Opus/Fable executor, `/qa-redteam` gate before merge** (per PR-B plan). Decomposed into 3 sub-packets,
merged in order. v3 clean break: old `.glitch` files stop loading (Decision D1, user-accepted).
Ship the **9 existing blend modes** (Decision D4) — verified 2026-06-11: `BLEND_MODES` dict at
`backend/src/engine/compositor.py:69` has exactly 9 (`normal add multiply screen overlay difference
exclusion darken lighten`); the 36-mode list in PLAN.md is a later additive PR.

**Legacy-project negative test (applies to ALL THREE sub-packets):** each sub-packet's suite must
include at least one test where a **v2-era `.glitch` fixture** (kept in the repo as
`*-v2-legacy.glitch`, never regenerated) hits the new code and **fails loudly with the exact error
string "v2 projects unsupported — start a new project" — never a crash, never a silent partial load.**
P2.2a proves it at the schema validator, P2.2b at the UI load path (error surface = toast/dialog, app
stays usable), P2.2c at the render handler (render request referencing v2 shapes → structured error
reply, not a sidecar exception).

#### P2.2a — Schema + validator (frontend types/stores break)
- **Branch:** `feat/prb-3c-composite-schema` · **Depends-on:** P2.1
- **Preconditions (anchors verified 2026-06-11):**
  - `git grep -n "opacity: number;" origin/main -- frontend/src/shared/types.ts` → `:64` (inside `Track` — verified); `blendMode: BlendMode;` → `:65` (verified). Absent → already broken out, STOP.
  - `git grep -n "CURRENT_VERSION" origin/main -- backend/src/project/schema.py` → `:9  CURRENT_VERSION = "2.0.0"` (verified).
- **Scope:** `frontend/src/shared/types.ts` (remove `Track.opacity`/`blendMode`, add `CompositeEffect` with `params: {opacity, mode}`) · `frontend/src/renderer/stores/timeline.ts` (drop opacity/blendMode setters; terminal-only validator running at **transaction commit** via `useUndoStore.beginTransaction` (verified at undo.ts:105), not per mutation; reject on audio tracks in BOTH `addEffect` and `reorderEffect`; reject inside DeviceGroup) · `backend/src/project/schema.py` (`CURRENT_VERSION = "3.0.0"`, reject v<3 with "v2 projects unsupported — start a new project") · regenerate `.glitch` test fixtures in v3 shape (EXCEPT the preserved `*-v2-legacy.glitch` fixture).
- **DO-NOT-TOUCH:** `backend/src/engine/compositor.py` render math, `zmq_server.py` (P2.2c), export (P2.3).
- **Test plan:** new `frontend/src/__tests__/stores/composite-terminal-validator.test.ts` — titles: "rejects composite mid-chain", "rejects composite on audio track via addEffect", "rejects composite on audio track via reorderEffect", "rejects composite inside DeviceGroup", "allows intermediate states mid-transaction". Backend: **negative test** "v2 legacy fixture rejected with 'v2 projects unsupported' message, no traceback" in the project schema suite (`cd backend && python -m pytest tests/ -k schema -x --tb=short`). Run `cd frontend && npx --no vitest run` + backend full.
- **Acceptance gates (quantified):** all 5 named validator tests + the v2-rejection test green; the error string matches EXACTLY (grep the test assertion); full vitest green ≥ baseline; `git grep -c "opacity: number;" frontend/src/shared/types.ts` → reduced by exactly 1 (the Track field; the layer/other `:203` hit survives).
- **Failure modes:** the 36-file sweep leaves a stale `track.opacity` reader compiling against the removed field → TypeScript build is the gate, `cd frontend && npx --no tsc --noEmit` must pass; transaction-commit validator fires per-mutation by accident → the "allows intermediate states mid-transaction" test is the catch.
- **Rollback:** revert PR (see P2.2 combined rollback below). · **Evidence:** test output + error-string grep + tsc output.
- **Model:** Opus/Fable (RISK:HIGH) + `/qa-redteam` before merge.

#### P2.2b — Store + components (UI reads chain terminal)
- **Branch:** `feat/prb-3c-composite-ui` · **Depends-on:** P2.2a
- **Preconditions:** `git ls-tree --name-only origin/main frontend/src/renderer/components/timeline/ | grep Track.tsx` → exists.
- **Scope:** `frontend/src/renderer/components/timeline/Track.tsx` (drop opacity slider + blend dropdown; read from chain terminal) · `frontend/src/renderer/components/timeline/TransformPanel.tsx` + any component reading `track.opacity`/`track.blendMode` (executor: `git grep -rn "\.opacity\b\|\.blendMode\b" frontend/src/renderer/components/` and sweep every hit) · drag-Composite-onto-track wrapped in one undo transaction.
- **Test plan:** component test "composite drag undoes in one transaction"; **negative test:** "opening the v2 legacy fixture surfaces the unsupported-version error in the UI (toast/dialog) and the app remains interactive" (no white-screen, ErrorBoundary not triggered); sweep proof in PR body: zero remaining `track.opacity` / `track.blendMode` reads in prod code.
- **Live-runtime (Gate 18):** flag the runtime path; drag a Composite onto a track live; single Cmd+Z removes it entirely.
- **Acceptance gates:** vitest green ≥ baseline; grep sweep output pasted showing 0 prod hits; the legacy-load UI test green.
- **Failure modes:** a component crash on tracks lacking the removed fields in test fixtures → fixture regeneration incomplete (back to P2.2a); undo transaction wraps only part of the drag (orphaned terminal state) → the one-transaction test is the catch.
- **Rollback:** revert PR. · **Evidence:** vitest output + sweep grep + live undo screen capture.
- **Model:** Opus/Fable (RISK:HIGH) + `/qa-redteam` before merge.

#### P2.2c — Render + backend rewire
- **Branch:** `feat/prb-3c-composite-render` · **Depends-on:** P2.2b
- **Preconditions (anchors verified 2026-06-11):**
  - `git grep -n "_handle_render_composite" origin/main -- backend/src/zmq_server.py` → `:707` (def — verified) — INJ-3 caps (`MAX_COMPOSITE_LAYERS=50`, `backend/src/security.py:48` — verified) + frame_index clamp already present; KEEP them.
  - `git grep -n "BLEND_MODES" origin/main -- backend/src/engine/compositor.py` → `:69` (verified, exactly 9 modes).
- **Scope:** `backend/src/effects/registry.py` (register `composite` effect, 9 modes) · `backend/src/engine/compositor.py` (read opacity/mode from chain terminal instead of `layer_info["opacity"]`/`["blend_mode"]` track fields) · `backend/src/engine/pipeline.py` (skip terminal Composite in main `apply_chain` — Decision D3: pipeline detects the special effect and feeds the layer list) · `backend/src/zmq_server.py` `_handle_render_composite` builds terminal composite · `frontend/src/renderer/App.tsx` render call sites.
- **Test plan:** backend per-blend-mode hash-stability test (exactly 9 modes, one hash each) in `backend/tests/` composite suite; INJ-3 edge cases stay green (0 layers, >50 layers rejected, negative frame_index clamped); render-graph cycle case (Composite-opacity ← operator ← track depending on that Composite) raises `ModulationCycleError` (verified `backend/src/modulation/engine.py:20`); **negative test:** a render request carrying v2-era track-level `opacity`/`blend_mode` fields (no terminal composite) → structured error reply with the unsupported-version message, sidecar stays alive (heartbeat continues). **Integration test (named):** "frontend chain with terminal composite renders end-to-end via IPC" — E2E or sidecar-level test exercising store → payload → `_handle_render_composite` → frame bytes.
- **Acceptance gates (quantified):** `cd backend && python -m pytest -x -n auto --tb=short` green; E2E smoke green; 9/9 blend-mode hash tests green; `/qa-redteam` findings resolved before merge; zero sidecar restarts during the negative-test run (watchdog log clean).
- **Failure modes:** pipeline double-applies the terminal composite (once in apply_chain, once in compositor) → the hash-stability tests catch it (hashes change); CI red after merge → revert first; single-flight rule 7 applies (`zmq_server.py` dispatch — confirm no other packet in flight).
- **Rollback (all of P2.2):** revert the three PRs in reverse order (c → b → a); no data to migrate back.
- **Evidence:** pytest output incl. the 9 hashes, cycle-test output, sidecar log excerpt for the negative test.
- **Model:** Opus/Fable (RISK:HIGH) + `/qa-redteam` before merge.

### P2.3 — Slice 3d: Full export parity
- **Branch:** `feat/prb-3d-export-parity` · **Base:** origin/main · **Depends-on:** P2.2c **+ P5a.4a design-doc gate (see preconditions)**
- **Goal:** Export runs operators + automation + sampler + multi-track through the modulation engine so export == preview (today export drops all three).
- **Design anchor:** this packet implements the export-side composite/replay architecture decided in
  **`docs/decisions/composite-export-design.md`** — authored by **P5a.4a** (`packets/phase-5a.md`,
  the P5a.4 design split; phase-5a's overflow split is filed there as P5a.4b — the DESIGN decision
  packet is P5a.4a). That doc decides: snapshot serialization shape, backend voice/layer replay
  contract, and which engine (`export.py` single-input vs composite-replay) owns multi-track frames.
  **Do not improvise these decisions here** — `ExportManager.start` is single-input today (verified
  signature at `backend/src/engine/export.py:169`), and P5a.4 builds the composite-replay export this
  packet extends.
- **Preconditions (anchors verified 2026-06-11):**
  - `test -f ~/Development/entropic-v2challenger/docs/decisions/composite-export-design.md || { echo "STOP: composite-export design doc not on main — P5a.4a has not landed; do not improvise the export architecture"; exit 1; }` (verified 2026-06-11: NOT present yet — this packet is GATED until P5a.4a merges).
  - `git ls-tree --name-only origin/main backend/src/engine/ | grep export.py` → `export.py` exists (verified; also `audio_export.py`, `gif_export.py` — leave both).
  - `git grep -n "def sample_lane" origin/main -- backend/src/modulation/lane_reader.py` → `:92` (verified).
- **Scope:** `backend/src/engine/export.py` (snapshot at job start: deep-clone of project/timeline/effect/automation/operator state passed in the export job payload; run modulation per frame — per the design doc's chosen shape) · frontend export store/IPC payload (`frontend/src/renderer/stores/export.ts`) to send operators + automation + sampler layers · status string "Exporting from snapshot @ T=X".
- **DO-NOT-TOUCH:** preview render path (must remain the reference), determinism seed plumbing from #160.
- **Test plan:** time-aligned determinism: 90-frame project, 1Hz sine LFO on Composite opacity, export at 30fps AND 60fps → frame at t=1.5s hash-matches across rates (test title: "export time-aligned frames hash-match across frame rates"). Live-edit-during-export test: snapshot unaffected (title: "edits after export start do not change exported frames"). **Negative tests (named):** "export start rejects a malformed snapshot payload (NaN automation point / unknown operator type) with a structured error, no partial file left on disk" · "export job with v2-era payload shapes rejected" (P2.2 seam). **Integration test:** E2E via Playwright `_electron` in `frontend/tests/e2e/` — start export from the UI, assert progress + completed file.
- **Acceptance gates (quantified):** double-export determinism: two exports of the modulated fixture are **sha256-identical**; export-vs-preview parity on the modulated fixture: per-pixel max abs delta ≤ 2/255 on ≥3 sampled frames (preview path is MJPEG q95 — byte-equality across paths is the wrong gate; document the sampled frame indices); full backend + frontend suites green ≥ baseline.
- **Failure modes:** parity gate fails only on frames with stateful effects → state threading bug (per-frame replay must thread `layer_states` exactly like preview — see design doc); export duration blows up (per-frame modulation eval) → measure with the PERF-MODEL.md throughput target (PERF.1 harness exposes export fps) before merging, do not ship a 10× export slowdown silently; CI red after merge → revert first.
- **Rollback:** revert PR; the export payload additions are optional on the wire — old export requests still work.
- **Evidence:** sha256 pair, parity deltas table, named test titles green, E2E output.
- **Model:** Sonnet (escalate to Opus if the design doc demands architecture beyond its written contract — that itself is a STOP-and-report).

---

## 3.5 UX-audit packets (PUX) — land HERE, between Phase 2 and Phase 3

Source: `docs/roadmap/packets/ux-audit.md`. Sequencing: **PUX.1 → (PUX.2 ∥ PUX.3 ∥ PUX.4) → PUX.5 land here**,
so PR-A (Phase 3) builds on tokens + a11y primitives instead of retrofitting them. PUX.6 (live visual pass)
runs after PUX.1–5 merge and before P3.1 starts. Consequence: **P3.1's preconditions gain
`test -f frontend/src/renderer/styles/tokens.css || echo STOP`** (PUX.1 must have landed). The §1 rule-7
single-flight constraint applies: PUX packets touching `global.css` queue behind each other.

---

## 4. Phase 3 — PR-A decomposed (layout redesign, in place)

Source: `docs/roadmap/layout-session/PLAN.md` §3 (9–12h monolith) → 5 packets. Governing constraint:
**evolve `frontend/src/renderer/components/effects/EffectBrowser.tsx` IN PLACE** — PR #154 built a
parallel CreatrixShell/BrowserPanel and was closed as waste. Any packet that creates a parallel
browser/layout component is an automatic FAIL.

**Constraint embedding (ROADMAP §3 rule 6):** every P3.x packet below carries the constraint
**verbatim** so it travels with the dispatched task:

> Modify EffectBrowser.tsx and existing components IN PLACE. Creating a new parallel
> shell/browser/panel component is an automatic FAIL (PR #154 precedent).

**Known doc discrepancies (verified 2026-06-11, executors must respect ground truth):**
- PLAN.md §3.8 references `useSelectionStore` — **does not exist on main** (verified: 0 hits). Selection lives in
  `useTimelineStore` (`selectedTrackId`, `frontend/src/renderer/stores/timeline.ts:36` — verified) and the
  effects store. P3.3 builds the selection abstraction or reads existing stores; precondition flags this.
- PLAN.md names `components/timeline/AutomationLane.tsx` — actual path is
  `frontend/src/renderer/components/automation/AutomationLane.tsx`.
- Flag naming: repo convention is kebab-case flags in `frontend/src/shared/feature-flags.ts`
  (localStorage `entropic-disable-*` / env `VITE_ENTROPIC_DISABLE_*`). `F_CREATRIX_LAYOUT` should be
  implemented inside this existing module, following its pattern — not a new flag system.
- **STALE ANCHOR FIXED (this pass):** the "effects-panel 35vh cap at `global.css:1111`" claim is
  outdated — F-0512-36 + F-0514-4 already tightened it to `max-height: min(28vh, 320px)` on
  `.transform-panel` (verified at `global.css:1121`, comment block :1115–1120, disable override
  `body[data-disable-f-0512-36]` at :1126). P3.1 below carries the corrected requirement.

### P3.1 — Layout grid shell + 4 drag handles (behind `F_CREATRIX_LAYOUT`)
- **Branch:** `feat/pra-1-layout-shell` · **Depends-on:** Phase 2 complete (PR-B shape settled)
- **Constraint (verbatim):** Modify EffectBrowser.tsx and existing components IN PLACE. Creating a new parallel shell/browser/panel component is an automatic FAIL (PR #154 precedent).
- **Goal:** CSS-grid app shell (transport / left-col / right-col / statusbar) with 4 persisted resize handles, flag-gated; old layout untouched when flag off.
- **Preconditions (anchors verified 2026-06-11):**
  - `test -f frontend/src/renderer/styles/tokens.css || echo STOP` → tokens.css must exist (PUX.1 landed; see §3.5; verified absent on main today — that's expected pre-PUX.1).
  - `git grep -n "F_CREATRIX_LAYOUT\|creatrix-layout" origin/main -- frontend/` → zero hits (verified — not built).
  - `git ls-tree --name-only origin/main frontend/src/renderer/stores/ | grep layout` → `layout.ts` exists (verified; extend it; do not create a second layout store).
  - Read `frontend/src/shared/feature-flags.ts` (verified exists) for the flag pattern.
  - `git grep -n "max-height: min(28vh, 320px)" origin/main -- frontend/src/renderer/styles/global.css` → 1 hit ~:1121 (the F-0512-36 transform-panel cap — corrected anchor, see discrepancy note above).
- **Scope:** flag in `feature-flags.ts` · grid CSS per PLAN.md §3.2 (vars `--left-col-w: 260px` min 200/max 33vw · `--inspector-h: 150px` · `--preview-h: 38%` · `--device-chain-h: 180px`, persisted to localStorage via `stores/layout.ts`) · 4 fat-target handles (6px visible / 16px hit zone, PLAN §3.3) · pop-out preview collapse to 28px strip (PLAN §3.4) · legacy UX-debt closure rides along: **F-0512-11** left-column width + track↔preview alignment (`docs/plans/2026-05-14-upcoming-ux-items.md` #2 — the grid shell's left-col var IS the fix; verify alignment in the flag-on E2E) · **transform-panel height-cap retirement** (F-0512-36: the `min(28vh, 320px)` cap at `global.css:1121` AND its `body[data-disable-f-0512-36]` override at :1126 are superseded by the grid rows; neither may survive into the flag-ON layout — flag-OFF keeps both untouched).
- **DO-NOT-TOUCH:** `EffectBrowser.tsx` (P3.2), inspector content (P3.3), root `grid-template-rows` of the OLD layout (`feedback_test-layout-changes.md`).
- **Test plan:** component tests: "resize handle persists width to localStorage", "16px hit zone receives pointer events", "flag off renders legacy layout". **Negative test (named):** "corrupted localStorage layout values (NaN, negative, 10000px) clamp to declared min/max on load — never propagate to CSS vars" (numeric trust boundary, `feedback_numeric-trust-boundary.md`). **Integration:** E2E smoke with flag ON and OFF (`cd frontend && npx playwright test tests/e2e/smoke.spec.ts` under both flag states — state the env/localStorage toggle used).
- **Live-runtime (Gate 18):** launch, name the runtime path, flip the flag, drag all 4 handles, relaunch, confirm persisted sizes; screenshot flag-on + flag-off.
- **Acceptance gates (quantified):** both flag states green in E2E smoke; localStorage round-trip proven; all 4 handles individually tested; 0 diffs to old-layout CSS rules when flag off (`git diff` on the legacy selectors reviewed).
- **Failure modes:** grid shell shifts children of the OLD layout (the `feedback_test-layout-changes.md` hazard) → the flag-off E2E is the catch; handle drag fires click-deselect (`feedback_drag-end-suppresses-click.md`) → add the isDragging guard from that feedback.
- **Rollback:** revert PR; flag-off is the live default so user impact is nil even pre-revert.
- **Evidence:** vitest + both E2E outputs, runtime path, screenshots.
- **Model:** Sonnet.

### P3.2 — Browser 5-tab evolution of EffectBrowser.tsx (IN PLACE)
- **Branch:** `feat/pra-2-browser-tabs` · **Depends-on:** P3.1
- **Constraint (verbatim):** Modify EffectBrowser.tsx and existing components IN PLACE. Creating a new parallel shell/browser/panel component is an automatic FAIL (PR #154 precedent).
- **Goal:** `EffectBrowser.tsx` grows tabs `[fx] [op] [composite] [tool] [instruments]` + global search, keeping the existing drag idiom.
- **Preconditions (anchors verified 2026-06-11):**
  - `git grep -n "handleDragStart" origin/main -- frontend/src/renderer/components/effects/EffectBrowser.tsx` → `:159` (verified); `EFFECT_DRAG_TYPE = 'application/x-entropic-effect-id'` at `:13` (verified).
  - `git ls-tree --name-only origin/main frontend/src/renderer/stores/ | grep browser` → `browser.ts` exists (verified; tab/search state goes here).
- **Scope:** `EffectBrowser.tsx` (tabs, search with X clear + Esc clears-and-blurs) · drag payload upgraded to `{kind, id}` JSON with session nonce + `kind` enum check + id namespace regex (PLAN §3.6, qa-redteam H1/H2) · tool tab with cursor-mode stack + statusbar chip (PLAN §3.7 `isTextInputActive` guard verbatim) · per-tab USER folder writing flat JSON to `~/.creatrix/presets/<tab>/<name>.json` — **no zip/bundle import; USER import rejects with toast** (hardening deferred, qa-redteam Real Tiger 1).
- **DO-NOT-TOUCH:** **no new sibling browser component** (cite PR #154 closure in PR body); `DeviceChain` drop-target contract (payload stays backward-readable for existing fx drags); instruments tab content beyond a stub list (P3.5 owns it).
- **Test plan:** named tests: "drag payload rejected without session nonce" (negative) · "tab switch filters categories" · "Esc clears search and blurs" · "bare-letter shortcut suppressed while input focused" · "tool mode restored after modal close". **Additional negative tests (named):** "legacy plain-string fx drag payload still accepted by DeviceChain (back-compat)" · "USER import of a zip/bundle rejects with toast, no file written". Run `cd frontend && npx --no vitest run`.
- **Live-runtime (Gate 18):** name the runtime path; drag one item from EACH of the 5 tabs to its legal target; confirm the existing fx-drag muscle path unchanged.
- **Acceptance gates (quantified):** vitest green ≥ baseline; existing fx drag-to-chain E2E still green; diff shows EffectBrowser.tsx modified, **zero new top-level browser components** (`git diff origin/main...HEAD --stat | grep -c "components/.*Browser\|components/.*Shell\|components/.*Panel"` → only pre-existing files); 5/5 tabs each have ≥1 test.
- **Failure modes:** payload upgrade breaks the DeviceChain drop contract → the back-compat negative test is the catch; search/shortcut focus war (`isTextInputActive`) regresses bare-letter hotkeys → the suppression test is the catch.
- **Rollback:** revert PR. · **Evidence:** vitest output, the zero-new-components grep, drag screenshots.
- **Model:** Sonnet.

### P3.3 — Polymorphic inspector (8 states, info-only)
- **Branch:** `feat/pra-3-inspector` · **Depends-on:** P3.1
- **Constraint (verbatim):** Modify EffectBrowser.tsx and existing components IN PLACE. Creating a new parallel shell/browser/panel component is an automatic FAIL (PR #154 precedent).
- **Goal:** Single inspector shell mounting per-state child (`key={selection.type}`), info-only, reading through typed selectors.
- **Preconditions (anchors verified 2026-06-11):**
  - `git grep -rn "useSelectionStore" origin/main -- frontend/` → **zero hits (verified) — PLAN.md §3.8 is aspirational here.** Executor builds a selection selector over `useTimelineStore.selectedTrackId` (`stores/timeline.ts:36` — verified) + effect/operator/marker selection state found by `git grep -n "selected" frontend/src/renderer/stores/*.ts`. If a selection store has appeared since, use it.
- **Scope:** new `frontend/src/renderer/selectors/trackStats.ts` (`getTrackStats(trackId)` reading per-track `effectChain` — per-track chains verified present: `Track.effectChain` at `types.ts:67`) · inspector shell + 8 state children per PLAN §3.12 (none/clip/multi/track/effect/operator/marker/tool) · `InspectorHoverHelp` mounted OUTSIDE the state subtree.
- **DO-NOT-TOUCH:** store shapes (inspector is read-only through selectors — that's the PR-B decoupling contract, PLAN §3.11); no actionable controls (info-only).
- **Test plan:** unit per state (8 titles "inspector renders <state> info"); integration "hover slot survives selection change"; "selection change remounts body via key". **Negative tests (named):** "unknown/unmapped selection type renders the none state — no crash, no blank shell" · "selector returns stable empty TrackStats for a deleted trackId (stale selection)". Run `cd frontend && npx --no vitest run src/__tests__/components/inspector/` then full.
- **Acceptance gates (quantified):** 8/8 state tests green + 2 negative + 2 integration; selector contract test pins the `TrackStats` shape; zero store writes from inspector code (`git grep -n "setState\|set(" <new inspector files>` → 0 hits in evidence).
- **Failure modes:** selection state is split across stores and the selector misses one source (marker/operator) → the per-state tests enumerate all 8 entries, each must render from a REAL selection fixture, not a mock union; stale-selection crash after track delete → the negative test is the catch.
- **Rollback:** revert PR; inspector is additive UI inside the flag-gated shell.
- **Evidence:** vitest output, the zero-write grep, 8-state screenshot strip (live, runtime path named).
- **Model:** Sonnet.

### P3.4 — Hover-help + hotkeys, with measurable perf gate
- **Branch:** `feat/pra-4-hover-hotkeys` · **Depends-on:** P3.3
- **Constraint (verbatim):** Modify EffectBrowser.tsx and existing components IN PLACE. Creating a new parallel shell/browser/panel component is an automatic FAIL (PR #154 precedent).
- **Goal:** Delegated hover-help (WCAG 1.4.13) + Ableton-style tool hotkeys, with the <8ms perf gate enforced as a test BEFORE merge.
- **Preconditions:** P3.3 merged (`InspectorHoverHelp` exists); read PLAN §3.9–3.10 for timings (300ms settle, 200ms fade, 400ms sticky, Esc dismiss, focusin parity).
- **Scope:** `useHoverDelegation` hook — single `onMouseOver` at inspector root walking to `[data-help-id]`, zero per-target listeners · collapsible slot persisted as `creatrix.inspector.hoverHelpCollapsed` · hotkey table from PLAN §3.7 (12 shortcuts, conflict-checked) wired through the existing shortcut layer (`frontend/src/__tests__/utils/shortcuts.test.ts` shows the pattern).
- **PERF GATE (merge-blocking, mechanized; derives from `docs/roadmap/PERF-MODEL.md` — UI-thread events must never eat the frontend's frame headroom):** new `frontend/src/__tests__/components/hover-delegation-perf.test.ts` titled "hover delegation stays under 8ms per event at 200 targets": render 200 `[data-help-id]` nodes, dispatch 60 synthetic mouseover events, assert mean handler time < 8ms (use `performance.now()` around the delegated handler; CI variance margin: fail only if mean ≥ 8ms across 3 runs). Result documented in PR body per PLAN §3.1.
- **DO-NOT-TOUCH:** native Electron menus (hover-help only on DOM menus); `dangerouslySetInnerHTML` anywhere (help body is plaintext — qa-redteam M5).
- **Test plan:** `cd frontend && npx --no vitest run src/__tests__/components/hover-delegation-perf.test.ts` then full suite. WCAG behaviors each have a named test: "Escape dismisses tooltip" · "tooltip stays while hovering into it (sticky 400ms)" · "focusin shows the same help as hover (parity)". **Negative tests (named):** "help body containing `<img onerror=...>` markup renders as inert plaintext" (M5) · "hotkey with a registered conflict refuses registration and logs the collision (12-entry table conflict-check)".
- **Acceptance gates (quantified):** perf test green in CI (mean < 8ms across 3 runs at 200 targets); 12/12 hotkeys conflict-checked; 3/3 WCAG behavior tests + 2 negative green.
- **Failure modes:** perf gate flaky on CI runners → the 3-run mean rule is the variance control; if still flaky, gate on the median and record runner specs — never delete the gate; hotkeys fire inside text inputs → reuse the `isTextInputActive` guard (P3.2), add a regression test.
- **Rollback:** revert PR. · **Evidence:** perf numbers table (3 runs), vitest output, hotkey conflict-check output.
- **Model:** Sonnet.

### P3.5 — INJ-4: Sampler browser entry + Demos Drawer + first-launch onboarding
- **Branch:** `feat/pra-5-instruments-demos` · **Depends-on:** P3.2 (tabs exist), P1.3 (#167 sampler flow merged)
- **Constraint (verbatim):** Modify EffectBrowser.tsx and existing components IN PLACE. Creating a new parallel shell/browser/panel component is an automatic FAIL (PR #154 precedent).
- **Goal:** Real draggable "Sampler" entry in the instruments tab (INJ-4) + Demos Drawer playing the rendered trilogy + first-launch onboarding pointing at it.
- **Copy + flow source of truth:** **`docs/roadmap/ONBOARDING-SPEC.md`** — every user-facing string,
  the flow order, skip/reduced-motion behavior, and the grep-checkable acceptance list live THERE; this
  packet implements its §2–§5 + §7 (boot line · drawer · cards · open-one · dismiss-forever). The
  annotated 5-callout tour (§6) and the D-PB paint affordance belong to **P3.7** (see split rule below).
- **Preconditions (anchors verified 2026-06-11):**
  - `ls ~/.entropic/demos/` → `audio-lfo-stripes.mp4  painted-blur.mp4  y-is-time.mp4` (verified present 2026-06-11). Missing → STOP; demos must be re-rendered (`backend/scripts/demo_trilogy/` verified exists on main), do not stub with placeholders.
  - `git grep -n "RACKS" origin/main -- frontend/src/renderer/components/instruments/InstrumentsPanel.tsx` → expected present after #167 (B2-lite ships the RACKS list; verified 0 hits on main today — consistent with #167 still open); if absent at execution time, #167 unmerged → STOP.
  - Note: runtime demo dir is `~/.entropic/demos/` on disk today, but `ENTROPIC_DIR` const in `frontend/src/main/diagnostics-handlers.ts:12` already points to `~/.creatrix` (verified) — executor must resolve the demos path from ONE constant, not hardcode both.
- **Scope:** instruments tab entry: Sampler draggable/double-clickable, disabled-with-tooltip when no base clip on timeline (INJ-4 spec: entry only — B1/B2 logic already merged, do NOT reimplement) · Demos Drawer component listing the 3 MP4s with inline playback · first-launch onboarding flag (localStorage keys per ONBOARDING-SPEC §7) opening the drawer once · **D-PB paint affordance** (the painted-blur demo's "paint it yourself" call-to-action per spec-4) — **split rule:** if it pushes the packet past the 4h cap, split it out as the **P3.7 follow-up packet** (which also owns the §6 tour) and say so in the PR body · spec: `docs/roadmap/specs/entropic-spec-4-demo-trilogy.md`.
- **DO-NOT-TOUCH:** `buildSamplerLayer.ts`, `SamplerDevice.tsx`, instruments store internals (consume #167's API only).
- **Test plan:** named tests: "sampler entry disabled with tooltip when timeline empty" · "drag payload kind=instruments id=sampler" · "demos drawer lists three demo videos" · "onboarding opens drawer on first launch only". **Negative tests (named):** "missing demo MP4 on disk renders the card's error state — drawer opens, no crash, no blank card" · "second launch with dismissed flag set never opens the drawer". Plus the ONBOARDING-SPEC §8 grep checklist run verbatim. `cd frontend && npx --no vitest run`.
- **Live-runtime (Gate 18):** wipe the localStorage onboarding keys, relaunch (name the runtime path), observe boot line → drawer → open `y_is_time` → playback; screenshot each step.
- **Acceptance gates (quantified):** vitest green ≥ baseline; 4 named + 2 negative tests green; ONBOARDING-SPEC §8 checklist all-green (every grep returns its expected count); flag-off state unaffected; manual/CU smoke of the drag flow.
- **Failure modes:** demos path hardcoded twice (the `~/.entropic` vs `~/.creatrix` split-brain — ROADMAP parallel-track bug 5) → the ONE-constant precondition is the guard, grep evidence required; autoplay under `prefers-reduced-motion` → ONBOARDING-SPEC §5 path must be tested.
- **Rollback:** revert PR; onboarding keys in localStorage are inert without the code.
- **Evidence:** standard outputs **+ demo-asset licensing check** (G9 "demo asset licensing unsourced"): confirm the 3 MP4s' source footage is user-owned or license-clear and state the answer in the PR body **+ the live-runtime screenshot sequence**.
- **Model:** Sonnet.

### P3.6 — I3 inline-probe frontend (cherry-pick #143 backend payload + inspector wiring)
- **Branch:** `feat/pra-6-i3-inline-probe` · **Depends-on:** P3.3 (inspector shell merged)
- **Constraint (verbatim):** Modify EffectBrowser.tsx and existing components IN PLACE. Creating a new parallel shell/browser/panel component is an automatic FAIL (PR #154 precedent).
- **Goal:** The I3 inline-probe action menu becomes reachable: cherry-pick the parked #143 backend payload onto a fresh branch and wire its actions into the PR-A inspector (right-click a param → inline action menu).
- **Preconditions (anchors verified 2026-06-11):**
  - P3.3 merged: `git grep -rn "trackStats" origin/main -- frontend/src/renderer/selectors/ | head -1` → non-empty (PR-A inspector landed); EMPTY → `{ echo "STOP: P3.3 inspector not on main"; exit 1; }`.
  - Payload check (re-verified 2026-06-11): `git -C ~/Development/entropic-q7-i3 show --stat --format='%h %s' bc0ea0b | head -5` → `bc0ea0b [q7] feat: PR #25 I3 Inline Probe action menu (19 tests)`, exactly 2 files: `backend/src/inspector/inline_actions.py` (+241) and `backend/tests/test_q7_benchmark/test_inline_actions.py` (+257) — verified byte-for-byte. Branch `feat/q7-i3-inline-probe` (GH #143), worktree `~/Development/entropic-q7-i3`.
- **Steps:** cherry-pick `bc0ea0b` onto a fresh branch per the §1.3 rule (never raw-merge #143); then build the frontend menu component inside the inspector's param rows, calling the cherry-picked backend actions over the existing IPC dispatch.
- **Test plan:** named vitest `frontend/src/__tests__/components/inspector/inline-probe-menu.test.tsx` — titles must include "inline action menu opens on right-click param", plus "menu action dispatches to backend inline_actions", "Escape closes menu". **Negative tests (named):** "backend dispatch failure (error reply / timeout) surfaces a toast and closes the menu — no hung overlay, no crash" · "right-click on a non-param row does not open the menu". Backend: the cherry-picked `test_inline_actions.py` suite green. Run: `cd frontend && npx --no vitest run src/__tests__/components/inspector/` and `cd backend && python -m pytest tests/test_q7_benchmark/test_inline_actions.py -x --tb=short`.
- **Acceptance gates (quantified):** both suites green (the cherry-picked suite = 19 tests, all green); 3 named + 2 negative frontend tests green; #143 closed as "landed via P3.6" with the cherry-picked SHA named.
- **Failure modes:** cherry-pick conflicts (main moved since the q7 snapshot — schema #148/#152 absorbed) → resolve toward main, then the 19-test suite is the regression net; conflicts exceed trivial → STOP and report (G5: q7 drafts are reference implementations, re-derive if needed).
- **Rollback:** revert PR. · **Evidence:** payload enumeration + both test outputs + the cherry-pick SHA.
- **Model:** Sonnet.

---

## 5. Phase 4–9 + parallel track — packet stubs (JIT expansion)

> At each phase boundary, the orchestrator regenerates packets from **live main** using the §1
> contract + the cited plan doc. Stubs are pointers, not instructions. **JIT expansion must produce
> the FULL §1 contract per packet** — including model tier, ≥1 negative test, quantified gates, and
> failure modes — and re-verify every anchor cited in the stub's row (the notes column records the
> 2026-06-11 verification; it will be stale by expansion time). The §1 rule-9 live-smoke cadence
> keeps counting across phase boundaries.

| Stub | One line | Detail plan | Expansion notes |
|---|---|---|---|
| P4.x PR-C operators + Kentaro | Surface ops in browser; `kentaroCluster\|sidechain\|gate\|midiEnvStutter`; react-xyflow topology w/ 60fps@32-paths gate + bare-SVG fallback | `layout-session/PLAN.md` §5 | **Path discrepancy:** PLAN cites `backend/src/pipeline/operators/*.py` — no `backend/src/pipeline/` exists (re-verified 2026-06-11: 0 entries); operators live in `backend/src/modulation/` (verified: lfo.py, envelope.py, audio_follower.py, fusion.py, processor.py…). Re-anchor at expansion. Prototype gate §5.1 runs first. Perf gates derive from `PERF-MODEL.md` (operators row). |
| P5.x Instrument ladder B2→B10 | Voice spine, full sampler, rack, grouping, Frame-Bank, RIFE morph, Granulator, tensor routing, live affordances | `~/Development/entropic-layout-mockup/INSTRUMENTS-BUILD-PLAN.md` | B8 needs SG-3 cherry-pick (#133, +12–18h real work), B9 needs PR-C + SG-5 (#144). Cherry-pick rule §1.3 applies. **P5a.4a authors `docs/decisions/composite-export-design.md` — P2.3 gates on it** (see P2.3). Undo coverage for new instrument ops lands via `packets/undo-history.md` UH.2/UH.3. |
| P6.x Field params + routing surfaces | C2 frame-as-lane, C3 per-pixel fields (the deferred `domain='y'` render unlock), I1/I2 from drafts #140/#142 | ROADMAP Phase 6; `entropic-spec-2-b4lite-schema.md` | `sample_lane` (`backend/src/modulation/lane_reader.py:92` — re-verified 2026-06-11) is merged but wired nowhere live — C2/C3 wire it. Painted-field undo design (UH.4, `packets/undo-history.md`) expands WITH C3, not after. |
| **Tier-3 stub** (between Phase 6 and 7) | vision-B2 cross-modal matrix · vision-B3 mod-as-track · B4-full binding rules · SG-H2 FD-management · E5 Launchpad cherry-pick (#145, branch `feat/q7-e5-midi-learn` — NOTE: the `entropic-q7-e5` worktree currently sits on `feat/tier1-b1-b4lite-c1-c7`, NOT #145's branch; re-verify with `git -C ~/Development/entropic-v2challenger worktree list` at expansion) | vision §6 Tier 3; `entropic-spec-1-crosswalk.md` | JIT-expand at phase boundary per §1 contract; P5b.24/P6.10/P7.14 deps resolve here. |
| P7.x Tier 5 latent | **HARD-GATED on Q7 REAL verdict (user runs benchmark)** | `entropic-spec-5-l-backbone.md` §9 | **Discrepancy:** ROADMAP cites `backend/scripts/q7_benchmark/` — NOT on origin/main; the machinery lives only in parked drafts #117–#145 (22 drafts verified open, gh 2026-06-11). The runnable 3-head harness is at `~/Development/entropic-q7-clap` (PR #132); user runs it FIRST, harness extraction follows GO. SG-4 runtime-starvation tests (ROADMAP G3/SG-4 residue) = P7.5; on NO-GO, P7.0N closes them as moot. |
| P8.x `.dna` + Genoscope | E2 format + CI lints (draft #139), SG-6, A2/E8 | `entropic-spec-6-dna-format.md` | Research-class; re-spec at boundary. |
| P9.x Ecosystem | SG-9 quotas + Ed25519 signing, E7 plugin SDK | ROADMAP Phase 9 | Farthest out. Demoted to if-ever (ROADMAP §2.5 decision 3). |
| PT.1 Audio tracks un-flag | 1-week user bake → PR-4 removes `EXPERIMENTAL_AUDIO_TRACKS` (`backend/src/zmq_server.py:51–54`, re-verified 2026-06-11) + auto-extract (task #46) | `memory/entropic-audio-tracks.md` | Bake is a USER action; packet only after bake. |
| PT.2 Feature tasks #45/#35 | Region-select preview; per-track metering + dB readout (task #35; #47 closed as spec task) | `memory/entropic-uat-may14.md` | Independent, schedulable anytime. |
| PT.3 Hotkey epic | 6 unchecked surfaces | issue #65; `docs/plans/2026-05-14-upcoming-ux-items.md` | Pairs naturally with P3.4. |
| PT.4 Rename residue | `gh repo rename`, dir rename, `ENTROPIC_DIR` const name (already points to `~/.creatrix` — name-only residue), memory slugs | ROADMAP §3 parallel-track 5 | Low risk; do after PR-A settles. |
| PT.5 Cross-modal v1.1 decision | F1–F4 fold-in vs supersede (Gap G6) | `docs/plans/2026-05-04-cross-modal-features-plan.md` | Decision packet, not build packet. RESOLVED by ROADMAP §2.5 decision 1 — expansion = doc-sync only. |
| **UH.x Undo/history** | Coverage audit + voice-FSM/mod-edge/rack-op undo + painted-field history + 500-entry memory smoke | **`packets/undo-history.md`** (authored 2026-06-11, full contracts — not a stub) | UH.1/UH.5 schedulable Phase-1-adjacent; UH.2/UH.3 track P5a; UH.4 tracks C3. |
| **PERF.x Frame-budget** | Measurement harness + CI perf smoke against the global budget | **`docs/roadmap/PERF-MODEL.md`** (authored 2026-06-11, full contracts — not a stub) | PERF.1 schedulable now; PERF.2 after PERF.1 baseline commits. Every effect/instrument packet's perf gate derives from this doc. |

---

## 6. Verification protocol for the orchestrator

Per-packet, **never batch** — batch-then-verify produced the 170-finding audit
(`memory/feedback_per-task-verification.md`; per-task verification is the corrective).

After an agent returns a packet:

1. **Run the packet's test commands yourself** in the agent's worktree — do not trust the agent's
   pasted output. Frontend: `npx --no vitest run`. Backend: `python -m pytest -x -n auto --tb=short`.
2. **Adversarially review the diff**: correctness first, then reuse/simplification — did the agent
   reinvent something that exists (`git grep` the new function names against main)? Is every new file
   justified? (Gate: rule §1.4, the #154 lesson.)
3. **Check DO-NOT-TOUCH**: `git diff origin/main...HEAD --stat` must show zero hits in the packet's
   forbidden paths. Any hit → bounce the packet back, do not hand-fix.
4. **Check the named behavior tests exist**: grep the new test files for the literal behavior keywords
   the packet specified (`feedback_grep-the-test-file-before-claiming-coverage.md`). **This includes
   the packet's negative tests** — a packet with only happy-path tests bounces.
5. **Check preconditions were actually run**: the PR body must contain the precondition command
   outputs. Missing → bounce.
6. **THEN merge** (squash), wait for CI — **all three jobs (`smoke` + `sidecar` + `electron-e2e`)
   green on the merge commit, not just the PR head** — and only then dispatch the next dependent packet.
7. On any precondition-mismatch STOP report: re-verify ground truth yourself, amend this file, and
   re-issue the packet — never let the executor improvise around a stale anchor.
8. **CI red after merge (standing reaction):** revert the merge commit FIRST, diagnose on a branch
   second. Main stays releasable at all times (ROADMAP §3 rule 3). Fix-forward on red main is
   forbidden regardless of how small the fix looks. Log the revert + root cause in the packet's PR
   thread so the re-issued packet inherits the lesson.
9. **Merge conflict mid-stack (standing reaction):** when a dependent packet/PR no longer applies
   cleanly after an upstream merge, STOP the stack at the last green merge — never force-resolve to
   keep momentum, never reorder a strict-order stack. Check merge-base distance + per-commit
   `git show --stat` before judging the diff (stale-base hazard, §1 rule 3).
10. **Live-smoke cadence bookkeeping:** maintain a running count of merged FEATURE packets; at every
    5th, run the §1 rule-9 live smoke BEFORE dispatching packet 6. Record the count + last-smoke SHA
    in the orchestration log so a session handoff doesn't lose the cadence.

---

## 7. Thickness-pass scorecard (2026-06-11)

Rubric: **(1)** anchors verified against origin/main @ `d821ae8` · **(2)** full contract incl. model
tier · **(3)** named tests w/ behavior-keyword titles + exact commands (+ Gate-18 live-runtime steps
for UI packets) · **(4)** gates quantified · **(5)** failure modes + ≥1 negative test (incl.
merge-conflict-mid-stack / rebase-divergence / CI-red-after-merge coverage) · **(6)** integration
tests for feature packets · **(7)** depends-on resolve. ✅ = satisfied in this revision · n/a = not
applicable to packet type (merge/verify and hygiene packets have no integration-test requirement;
doc/stub rows are pointers).

| Packet | (1) anchors | (2) contract+model | (3) tests+cmds | (4) quantified | (5) fail modes+neg | (6) integration | (7) deps |
|---|---|---|---|---|---|---|---|
| P1.0 | ✅ (run-time counts) | ✅ Sonnet | ✅ | ✅ (4→0 fails, 1,818 kept) | ✅ skip-without-comment gate | n/a | ✅ — |
| P1.1 | ✅ :93/:116/:135 (+:373 noted) | ✅ Sonnet | ✅ | ✅ ≥1,814 + CI 3-job | ✅ conflict-mid-stack · CI-red · divergence | n/a (verify packet) | ✅ P1.0 |
| P1.2 | ✅ :135 single hit | ✅ Sonnet | ✅ | ✅ | ✅ missing-bpm negative · divergence | n/a | ✅ P1.1 |
| P1.3 | ✅ store/:43/types:59 | ✅ Sonnet | ✅ + Gate 18 | ✅ | ✅ G10 legacy-shape negative · divergence | n/a | ✅ P1.1 |
| P1.4 | ✅ PR-state only | ✅ Sonnet | ✅ | ✅ oracle count pinned | ✅ black-frame negative · divergence | n/a | ✅ — |
| P1.5 | ✅ PR-state only | ✅ Sonnet | ✅ | ✅ 0-of-5 open | ✅ #103 reverted-files negative · divergence | n/a | ✅ P1.1–P1.4 |
| P1.6 | ✅ 58 worktrees re-verified | ✅ Haiku | ✅ | ✅ ≤30 end count | ✅ KEEP-classification negative | n/a | ✅ P1.1–P1.5 |
| P1.7 | ✅ | ✅ Haiku | ✅ | ✅ SHA-named (18b) | ✅ lock-file STOP | n/a | ✅ P1.1–P1.6 |
| P2.1 | ✅ :43/:292–294/:20–21 | ✅ Sonnet | ✅ + Gate 18 | ✅ classified grep sweep | ✅ NaN-mod · no-effectiveBpm-in-JSON | ✅ bpm→timing chain test | ✅ P1.1+P1.2 |
| P2.2a | ✅ :64/:65/:9 | ✅ Opus/Fable | ✅ | ✅ 5+1 named, tsc gate | ✅ v2-legacy loud-fail (schema) | ✅ (validator @ commit) | ✅ P2.1 |
| P2.2b | ✅ | ✅ Opus/Fable | ✅ + Gate 18 | ✅ 0-hit sweep | ✅ v2-legacy loud-fail (UI) | ✅ one-transaction undo | ✅ P2.2a |
| P2.2c | ✅ :707/:69 (9 modes) | ✅ Opus/Fable | ✅ | ✅ 9/9 hashes, 0 restarts | ✅ v2-legacy loud-fail (render) | ✅ E2E IPC composite | ✅ P2.2b |
| P2.3 | ✅ :169/:92 · **re-anchored to composite-export-design.md w/ existence gate** | ✅ Sonnet | ✅ | ✅ sha256 + ≤2/255 parity | ✅ malformed-snapshot · live-edit | ✅ Playwright export E2E | ✅ P2.2c + **P5a.4a gate** |
| §3.5 PUX | pointer (owned by ux-audit.md) | — | — | — | — | — | ✅ |
| P3.1 | ✅ **stale 35vh anchor FIXED → :1121 min(28vh,320px)** | ✅ Sonnet | ✅ + Gate 18 | ✅ both flag states | ✅ corrupt-localStorage negative | ✅ flag-on/off E2E | ✅ Phase 2 + PUX.1 gate |
| P3.2 | ✅ :13/:159 · **#154 verbatim added** | ✅ Sonnet | ✅ + Gate 18 | ✅ 0-new-components grep | ✅ nonce-reject · legacy-payload · zip-reject | ✅ fx-drag E2E | ✅ P3.1 |
| P3.3 | ✅ 0-hit selection store · :36/:67 · verbatim added | ✅ Sonnet | ✅ | ✅ 8/8 + 0-write grep | ✅ unknown-type · stale-selection | ✅ hover-slot/remount | ✅ P3.1 |
| P3.4 | ✅ · verbatim added | ✅ Sonnet | ✅ | ✅ <8ms 3-run mean, 12/12 | ✅ XSS-plaintext · hotkey-conflict | ✅ focus-parity | ✅ P3.3 |
| P3.5 | ✅ 3 MP4s · ENTROPIC_DIR:12 · RACKS=0 noted · verbatim added | ✅ Sonnet | ✅ + Gate 18 | ✅ §8 checklist counts | ✅ missing-MP4 · dismissed-flag | ✅ onboarding flow live | ✅ P3.2+P1.3; tour/D-PB → P3.7 |
| P3.6 | ✅ bc0ea0b 2-file payload re-verified | ✅ Sonnet | ✅ | ✅ 19+5 tests | ✅ dispatch-failure · non-param-row | ✅ IPC dispatch test | ✅ P3.3 |
| §1 rules | — | contract +Model+Failure-modes fields | — | rule 9 quantified (every 5, 5 flows, 5 shots) | rules 3/8/9 cover the 3 modes | — | — |
| §5 stubs | ✅ rows re-verified (pipeline/ absent, flag :51–54, lane_reader :92, q7-e5 drift) | JIT must emit full contract (noted) | — | — | — | — | ✅ UH/PERF rows added |
| §6 protocol | — | — | — | ✅ 3-job gate, cadence bookkeeping | ✅ steps 8–10 (CI-red, mid-stack, cadence) | — | — |
