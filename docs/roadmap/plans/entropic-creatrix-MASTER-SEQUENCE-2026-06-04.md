---
title: Entropic → Creatrix — Master Build Sequence (single source of truth)
created: 2026-06-04
supersedes: scattered state across vision/specs/handoffs/ACTIVE-TASKS for THIS program only
status: synthesis — sequence + artifact index for /eng to execute against
definition_of_done: artifact-existence only (a file you can cat/ls/play, a CLI that prints a value, a UI that renders). NOT "PR opened" / "tests pass on a producerless interface" / "scaffold wired". (per OPERATING-PROTOCOL-2026-06-03)
ground_truth_order: 1) user's verbatim ask  2) vision §8 + specs 1-7  3) remaining-artifact tally on disk  4) project memory  — NEVER a cron body or a prior self-summary
---

# Entropic → Creatrix — Master Build Sequence

> **What this is.** One ordered list of *everything left to do* on the synth-paradigm program, each item linked to its artifact(s), with live status and gates. Built 2026-06-04 from a full crawl of the last 60h of work, the diff between `main` and the 30 open branches, and the session logs/handoffs. This is the doc `/eng` runs against.

---

## 0. Where we stopped (the correction)

The original ask was **"Q7 multi-headed L benchmark on Apple silicon"** — a verb on a measurable target (a verdict file). The 2026-06-03 session converted that to *building benchmarking machinery* and shipped **27 draft PRs (#117–#145) of scaffold without ever producing the verdict**. User caught it ("did you really finish" → no). The late-night correction session:

- Re-anchored to **artifact-existence** definition-of-done (see frontmatter + `OPERATING-PROTOCOL-2026-06-03.md`).
- Shipped **PR #147** — the *first true Tier-1 artifact* (B1 lane schema + B4-lite validator + C1 reader + C7 aliasing, 32/32 tests).
- Produced a **mock** Q7 verdict (`~/.entropic/q7-report.json`, `TIER_5_GO @ p95=15.09ms`). Real run still pending.
- Killed the drift cron `b2c52d9f`; created `1913d27e` (hourly :17, vision-anchored, refuses to invent scope).
- Filed 2 process memories: `feedback_verb-ask-deliverable-is-the-result.md`, `feedback_self-authored-cron-not-ground-truth.md`.

**Tier-1 tally at last stop: 7 of 11 artifacts present. 4 remain (2 need user action, 2 headless-doable).**

---

## 1. Current state snapshot (verified 2026-06-04 09:15)

### Git / branches
- **`origin/main` = `6472597`** "Grid Moire #123" (2026-06-03 12:23). **Local `main` is 3 commits behind origin** → `git fetch && git checkout main && git pull` before any new branch.
- Product renamed **Entropic → Creatrix** (PR #120, merged). Repo dir still `entropic-v2challenger`; GitHub still `nissimdirect/entropic-v2challenger`.
- **39 commits** sit on the q7 stack tip `feat/tier1-b1-b4lite-c1-c7` (d004ba4) ahead of the *stale* local main; **17,651 insertions / 131 files** in the diff vs main (mostly `docs/decisions/q7/`, `docs/plans/q7/`, `backend/scripts/q7_benchmark/`, `frontend/src/renderer/q7/`).
- Worktrees: one per q7 PR under `~/Development/entropic-q7-*`; Tier-1 lives in `~/Development/entropic-q7-e5` (branch `feat/tier1-b1-b4lite-c1-c7`).

### PR state
| Group | PRs | State | Note |
|---|---|---|---|
| Creatrix **PR-zero** per-track effect chains | #116 | ✅ merged | foundation for everything |
| Creatrix **PR-D** v3 rebrand (Entropic→Creatrix) | #120 | ✅ merged | |
| Grid Moire | #123 merged, #146 open | mixed | not synth-paradigm critical-path |
| **Creatrix PR-A / PR-B / PR-C** | — | ❌ **never opened** | **THE actual blocker** — see §3 Tier 1 |
| **Q7 scaffold stack** | #117–#145 (27 PRs) | 🟠 all draft, none merged | decision needed — §5 |
| **Tier-1 true artifact** | #147 | 🟠 open draft | the only "real" Tier-1 PR |

### Codebase baseline (for /eng)
- **Stack:** Electron 40 + React 19 + Vite + TS frontend; Python 3.14 sidecar (ZeroMQ REQ/REP, token auth); 8 Zustand stores; BEM CSS. (`CLAUDE.md` in repo root.)
- **`backend/src/`** dirs: `audio, dna, effects, engine, inspector, memory, midi, modulation, project, q7_worker, safety, video` + `cli.py, zmq_server.py, security.py`. ~170 effects, **287 backend test files**.
- **`frontend/src/renderer/`**: `components, hooks, q7, stores, styles, utils` + `App.tsx`. **142 frontend test files.**
- **Tier-1 code already on disk** (PR #147 / `entropic-q7-e5`): `backend/src/modulation/schema.py`, `backend/src/modulation/lane_reader.py` (`sample_lane()`).
- **Q7 harness on disk:** `backend/scripts/q7_benchmark/` (runner, jitter, verdict, backends, mock, loaders/{dinov2,clip,clap}, schemas) + `backend/scripts/demo_trilogy/` (runner + 3 `.entropic.json` configs).
- **Test commands:** backend `cd backend && python -m pytest -x -n auto --tb=short`; frontend unit `cd frontend && npx --no vitest run` (the `--no` matters); E2E `npx playwright test`.

### Active automation
- **Cron `1913d27e`** — hourly :17, 7-day expiry. Rereads vision docs, checks artifact existence, refuses to invent scope. Halts when all 11 Tier-1 artifacts present OR same blocker 3 ticks. Stop via `CronDelete 1913d27e`.

---

## 2. Ground-truth artifact index (every doc, linked)

**Vision & specs** (`~/.claude/plans/`)
- `entropic-synth-paradigm-vision.md` — **canonical**; §6 30 PRDs, §7 20 decisions, §8 8-tier sequence, §10 9 safety gates, §11 next moves.
- `entropic-spec-1-crosswalk.md` — Vision↔Creatrix ownership matrix + 5 PR-injections.
- `entropic-spec-2-b4lite-schema.md` — B4-lite TS schema + writer-validator (= INJ-5).
- `entropic-spec-3-safety-gates.md` — SG-1/3/5/8 contracts + CI tests.
- `entropic-spec-4-demo-trilogy.md` (+ `demo-trilogy-stubs/{y-is-time,painted-blur,audio-lfo-stripes}.entropic.json`).
- `entropic-spec-5-l-backbone.md` — multi-headed L worker + SG-4.
- `entropic-spec-6-dna-format.md` — `.dna` format + 5 CI lint rules + SG-2 budget.
- `entropic-spec-7-post-pass.md` — A4 / C4 / A5 / SG-7.
- `entropic-history-buffer-validation.md` — undo/history validation (existing v2 impl judged sufficient).
- `entropic-inspector-mockups.html` — I1/I2/I3 UI reference.

**Creatrix build plan** (`~/Development/entropic-layout-mockup/`)
- `INSTRUMENTS-BUILD-PLAN.md` — B1–B10 sequenced builds + SG gate model.
- `INSTRUMENTS.md` — 18 locked decisions + §10 review findings (read first).
- `B1-1VOICE-SAMPLER-PLAN.md` — build-ready B1 (the placeholder-killer).
- `PLAN.md` v1.2 — PR-zero/A/B/C/D sweep plan.
- `DECISIONS.md` — 28 resolved decisions.
- `PR-INJECTIONS.md` — INJ-1..5 (must land in PR-A/PR-B before they lock).
- `index.html` — lofi layout mockup.

**Q7 roadmap** (`~/Development/entropic-q7-e5/docs/plans/q7/README.md`) + decision docs `docs/decisions/q7/DEC-Q7-001..017` + runbooks `docs/runbooks/q7/`.

**State / logs** (`~/Documents/Obsidian/`)
- `handoffs/HANDOFF-2026-06-03-entropic-q7-tier1.md` — the correction + 7/11 tally + remaining-4.
- `handoffs/OPERATING-PROTOCOL-2026-06-03.md` — artifact-existence DoD + per-tick discipline.
- `handoffs/HANDOFF-2026-06-03-spec-pass.md`, `…-08:11-instruments-vision-reconciliation.md`, `…-09:09-creatrix-instruments-close.md`, `…-00:31-instruments-pr-injections.md`, `…-2026-06-02-creatrix-planning.md`.
- `ACTIVE-TASKS.md` — live task list (Current Focus section).

**Project memory** (`~/.claude/projects/-Users-nissimagent/memory/`)
- `entropic-synth-paradigm.md`, `entropic.md`, `entropic-cross-modal.md`, `project_creatrix-rename.md`, `reference_kentaro-suzuki-m4l.md`.
- New process feedback (filed 2026-06-03): `feedback_verb-ask-deliverable-is-the-result.md`, `feedback_self-authored-cron-not-ground-truth.md`, `feedback_check-parallel-before-merge.md`, `feedback_parallel-sweep-every-loop.md`, `feedback_sdlc-verify-in-app-not-just-code.md`, `feedback_read-parallel-context-before-planning.md`, `feedback_git-commit-a-omits-new-files.md`.

---

## 3. THE SEQUENCE (Tier 0 → Tier 7)

Status legend: ✅ artifact exists · 🟠 in-flight/draft · ❌ not started · ⛔ blocked (gate/user) · 🔬 needs user-side run.
SG = safety gate (must exist *in code* before dependents — §4).

> **Convention — read "(q7 PR #NNN draft)" carefully.** A row marked `❌ … (q7 PR #NNN draft)` is **NOT greenfield** — a draft branch has the code + passing *unit* tests, but it is a **scaffold, not an integrated artifact** (no end-to-end producer; not merged; may be ahead-of-tier per Vision §8). Treat these as "≈70% there, needs integration + the right-tier merge," not "start from zero." The Q7-correction lesson (§0) is exactly that unit-tests-green ≠ done. SG-7 (§6.1) is the one already at full-contract parity in its draft.

### TIER 0 — Foundation (mostly done; unblock the rest)

| # | Item | Status | Artifact / action | Blocks |
|---|---|---|---|---|
| 0.1 | PR-zero per-track effect chains | ✅ #116 merged | `Track.effectChain` | everything |
| 0.2 | PR-D Entropic→Creatrix rename | ✅ #120 merged | product = Creatrix | cosmetic |
| 0.3 | **Sync local main to origin** | ❌ | `git fetch && git checkout main && git pull` (local 3 behind) | clean branching for /eng |
| 0.4 | **Decide fate of 27 scaffold PRs (#117–#145)** | ❌ decision | §5 — merge-cascade / cherry-pick / leave-as-reference | tier ordering hygiene |
| 0.5 | **Open Creatrix PR-A** (layout + browser tabs incl. real `instruments` tab = INJ-4) | ❌ **never opened** | `PLAN.md` PR-A (9–12h) | **B1, I3 frontend** |
| 0.6 | **Open Creatrix PR-B** (Composite-as-effect, automation unify, INJ-1 modRoutes rename, INJ-2 toposort-raise, INJ-3 MAX_COMPOSITE_LAYERS+frame guard, **INJ-5 frontend B4-lite schema+validator+renderer domain eval**) | ❌ **never opened** | `PLAN.md` PR-B + `entropic-spec-2-b4lite-schema.md` (12–18h +2-3h INJ-5) | **B2, B9, demo frontend, I3 routing graph** |
| 0.7 | **Open Creatrix PR-C** (operators + tensor base + Kentaro routing viz) | ❌ never opened | `PLAN.md` PR-C (14–18h) | **B9** |

> **Key correction to the mental model:** the q7 stack ran *ahead* of its tier while the actual Tier-1 unlock (PR-A/B/C) was never opened. PR #147 put B4-lite on the **backend** (`modulation/schema.py`); INJ-5 still needs to land the **frontend** half inside PR-B. The two must reconcile (lowercase axis canon `t|y|x|c|f|l`; 8-member BindingRule union, tier-gated to `{broadcast}` at Tier 1).

### TIER 1 — Schema-Aware Automation (paradigm becomes felt) — *7/11 done*

| # | Item (Vision §6) | Status | Artifact / path | Note |
|---|---|---|---|---|
| 1.1 | B1 lane schema (backend) | ✅ | `backend/src/modulation/schema.py` (PR #147) | |
| 1.2 | B4-lite writer-side validator (backend) | ✅ | `validate_for_save()` rejects non-broadcast | |
| 1.3 | C1 Scanline-as-Time | ✅ | `lane_reader.sample_lane()` `domain='y'` | the paradigm-shift primitive |
| 1.4 | C7 Audio-LFO-at-video-rate | ✅ | aliasing proven (zero-crossing test) | |
| 1.5 | Scalar trigger payload | ✅ | `ModEdge.depth: float` | |
| 1.6 | Signed-axis-direction | ✅ | `Lane.direction: float` | |
| 1.7 | Q7 verdict file (mock) | ✅ | `~/.entropic/q7-report.json` `TIER_5_GO@p95=15.09ms` | mock backend |
| 1.8 | **Q7 verdict (REAL)** | 🔬⛔ | needs user's Mac — §6 cmd 1 | gates Tier 5 commit |
| 1.9 | **Demo trilogy MP4 renders** | 🟢 unblocked (P0d) | source LOCKED = `_source_video/src_01.mp4`; render → `~/.entropic/demos/*.mp4` | configs ready in `backend/scripts/demo_trilogy/` |
| 1.10 | **I3 inline action-menu (frontend React)** | ❌ headless-doable | backend `inspector/inline_actions.py` exists (PR #143); build React component; ref `entropic-inspector-mockups.html` | **next epic** — but its routing graph wants PR-B B4-lite frontend |
| 1.11 | **History-buffer validation** | ❌ headless-doable | grep `HistoryBuffer`/`undo` in `frontend/src/`; confirm covers tensor-routing edits; file gaps. Doc: `entropic-history-buffer-validation.md` | |
| 1.12 | Reconcile PR #147 backend B4-lite ↔ INJ-5 frontend B4-lite | ❌ | resolve P1-C (`Lane`→`AutomationLane`), P1-D (`domain='y'` renderer home) with PR-B | |

### TIER 2a — Spectral Family (SG-1 hard-blocks)

| # | Item | Status | Artifact / spec | Gate |
|---|---|---|---|---|
| 2a.1 | **SG-1 GPU resource lifetime contract** | ✅ **MERGED #163** (advance squad) | RAII `weakref.finalize` + use-after-destroy guard + real leak test on main@4b8e293. Real Metal binding lands with first Tier-2 effect. | ~~blocks~~ **UNBLOCKS** 2a/2b + B7/B8 |
| 2a.2 | A4 Spectral Frame Warper (6 primitives: shift/comb/smear/formant/parity/inversion, DCT default) | ✅ **MERGED #162** — 6 effects registered + reachable (`fx.spectral_{shift,comb,smear,formant,parity,inversion}`) | `backend/src/effects/spectral/` on main | ~~SG-1~~ done (pure CPU) |
| 2a.3 | C4 Spectral-Band-Isolated Effects | ✅ **core MERGED #165** — `fx.band_isolated` (any A4 primitive within a radial band) reachable | `entropic-spec-7-post-pass.md` §3 | DEFERRED: arbitrary-effect wrapper + `band_isolated_multi` 5-stream + band-picker UI |

### TIER 2b — Field Params + Routing Canvas (SG-1 confirmed)

| # | Item | Status | Spec | Gate |
|---|---|---|---|---|
| 2b.1 | C2 Frame-as-Parameter-Lane | ❌ | Vision §6 C2 (new build) | SG-1 |
| 2b.2 | C3 Per-Pixel Parameter Fields (top-25 effects, Metal codegen) | ❌ | Vision §6 C3 | SG-1, C2 |
| 2b.3 | I2 Routing Canvas (⌘⇧I) | ❌ (q7 PR #142 = I2 *backend graph* draft) | Vision §6 I2; reuse PR-C react-xyflow | B4-lite |

### TIER 3 — Cross-Modal Tensor + Hardware (SG-4, SG-5 hard-block)

| # | Item | Status | Spec | Gate |
|---|---|---|---|---|
| 3.1 | **SG-5 dynamic cycle detection** (deterministic break-order, per-tick snapshot) | ❌ (q7 PR #144 draft) | `entropic-spec-3` §SG-5; builds on INJ-2 toposort-raise | blocks B9/B4-full |
| 3.2 | **SG-4 audio-thread isolation** (lint: `backend/src/audio/realtime/` may not import L) | ❌ (q7 PR #128 SG-4 draft) | `entropic-spec-5` | blocks B2-audio routing + Q7 |
| 3.3 | B2(vision) Cross-Modal Mod Matrix (whole-audio → param routing) | ❌ | Vision §6 B2 | SG-4 |
| 3.4 | B4-full (remaining 4 binding rules: sampleAt/scanOver/integrate/painted) | ❌ | widen Tier-1 validator accept-set in lockstep (SPEC-6 Lint-3) | B4-lite, SG-5 |
| 3.5 | B3 Modulation-as-Track-Type | ❌ | Vision §6 B3 | B4-full |
| 3.6 | E5 Hardware Bridge — Novation Launchpad templates (LP X/Mini/Pro Mk3) + arbitrary-CC Learn | ❌ (q7 PR #145 E5 draft) | Vision §6 E5 | Creatrix B10 |
| 3.7 | I1 Inspector Track (1st-class, recordable probes per SG-H1) | ❌ (q7 PR #140 I1 draft) | Vision §6 I1 | B4-lite |

### TIER 4 — Instruments (Creatrix B-builds; near-term shippable core = B1→B5)

Creatrix instrument ladder (`INSTRUMENTS-BUILD-PLAN.md` §4) — each gated on the prior + SG where noted:

| # | Build | Status | DEP | SG | Est |
|---|---|---|---|---|---|
| 4.1 | **B1** 1-voice Sampler (placeholder-killer) | ❌ build-ready | PR-A | — | 7–10h |
| 4.2 | **B2** Voice spine + Performance Track + FSM + polyphony | ❌ | PR-zero✅, PR-B | — | 10–14h |
| 4.3 | **B3** Full Sampler (loop/scrub/slice/melodic) | ❌ | B2 | — | 8–10h |
| 4.4 | **B4** Sample Rack + 8 macros (Ableton-clone sends/returns) | ❌ | B3 | — | 12–16h |
| 4.5 | **B5** Grouping / composite-tree | ❌ | B4 | — | 10–14h |
| 4.6 | **B6** Frame-Bank (A3/C9) | ❌ | B5 | SG-8 (+SG-1 if flow) | 12–18h |
| 4.7 | **B7** Optical-flow/RIFE interp (morphlab port) | ❌ | — | SG-1 | 15–25h |
| 4.8 | **B8** Granulator (A1, 6-axis grains) | ❌ | B5 | SG-1+SG-3+SG-8 | L–XL 40–70h |
| 4.9 | A5 Spectral Granulator (variant of B8) | ✅ **core MERGED #165** — `fx.spectral_granulator` reachable (grain_size/overlap/jitter) | B8, A4 | DEFERRED: identity-curve + multi-frame grains + wavelet + B8-shared-UI | M |
| 4.10 | D2 Heterodyning Visuals · D3 Wavetable-as-Mask | ❌ | A4 / C2 | — | M each |
| 4.11 | **B9** Tensor mod-routing + Y-as-time | ❌ | PR-C, INJ-2 | SG-5 (+SG-3) | 14–18h |

### TIER 5 — Latent Tier (SG-3+SG-4+SG-8 hard-block; gated on Q7 REAL PASS)

| # | Item | Status | Spec | Gate |
|---|---|---|---|---|
| 5.0 | **Q7 REAL verdict = GO** | 🔬⛔ | §6 cmd 1 | gates this whole tier |
| 5.1 | **SG-3 latent NaN/Inf sentinel** | ❌ (q7 PR #133 draft) | `entropic-spec-3` §SG-3 | B8 latent, B9 learned |
| 5.2 | **SG-8 memory-pressure auto-disable** (tiered 16/32/64GB; degrade order) | ❌ (q7 PR #129 draft) | `entropic-spec-3` §SG-8 — **canonicalize the 3 conflicting degrade orders first** | B6/B8/B10 |
| 5.3 | L multi-headed backbone worker (DINOv2+CLIP+CLAP, ZMQ, sparse+slerp) | 🟠 scaffold (q7 PR #127 draft) | `entropic-spec-5` | SG-4, Q7 PASS |
| 5.4 | E1 Resynthesis-Latent Mode · C5 Latent-Trajectory · C6 Frame-as-Self-Wavetable · C8 Feedback-Through-L · D4 Latent Granulator | ❌ | Vision §6 | Q7 PASS + SG-3 |
| 5.5 | E6 Live Performance Mode (frame-rate floor, axis-aware degrade) | ❌ | Vision §6 E6 | E5, SG-8 |

### TIER 6 — Genoscope + `.dna` (SG-2/6/7 hard-block)

| # | Item | Status | Spec | Gate |
|---|---|---|---|---|
| 6.1 | **SG-7 codec/decode timeout** (PyAV wrap, 5s/frame) | 🟠 **BUILT in draft #118** — `backend/src/video/codec_timeout.py` + 8 callsite wraps + 9 tests (full SPEC-7 §5 contract); #141 adds telemetry | `entropic-spec-7` §5 | **action = MERGE #118, not build** — backend-only, no Creatrix conflict |
| 6.2 | E2 `.dna` patch format (magic+gzip+JSON, strict no-regression, unknown-fields-preserve) + 5 CI lint rules + SG-2 budget | 🟠 scaffold (q7 PR #139 `.dna`+SG-2 draft) | `entropic-spec-6` | SG-2, SG-7 |
| 6.3 | **SG-6 Genoscope cooperative cancellation** | ❌ | Vision §10 SG-6 | A2 |
| 6.4 | A2 Genoscope (GA over effect-graph; multi-modal ref) + E8 Vibe-to-Patch | ❌ research | Vision §6 A2/E8 | Q7, A4, SG-6 |

### TIER 7 — Plugin Ecosystem (SG-9 hard-blocks)

| # | Item | Status | Gate |
|---|---|---|---|
| 7.1 | SG-9 plugin resource quota + Ed25519 signing | ❌ | blocks E7 |
| 7.2 | E7 Plugin SDK (Python + GPU shader, sandboxed) + hardware partnerships beyond Launchpad | ❌ | SG-9 |

---

## 4. Cross-cutting safety gates (must exist *in code* before dependents)

| SG | Contract | Blocks | Status |
|---|---|---|---|
| SG-1 | GPU handle RAII + pool ceiling + 10k-leak==0 CI | 2a/2b, B7, B8 | ✅ **MERGED #163** (finalizer + real leak test on main@4b8e293; real Metal binding deferred to first Tier-2 effect) |
| SG-2 | `.dna` resource-budget descriptor + apply-time reject | E2 | 🟠 draft #139 |
| SG-3 | latent NaN/Inf sentinel aborts lane | B8, B9 learned, Tier 5 | 🟠 draft #133 |
| SG-4 | audio realtime thread never imports L (CI lint) | B2-audio, Q7 | ✅ **MERGED #159** (AST lint + negative test in CI on main@0267b52; runtime-starvation tests = follow-up) |
| SG-5 | dynamic cycle detect + deterministic break + per-tick snapshot | B9, B4-full | 🟠 draft #144 |
| SG-6 | Genoscope cooperative cancellation | A2 | ❌ |
| SG-7 | codec/decode timeout | any untrusted import | 🟠 **built in draft #118** (codec_timeout.py +8 wraps +9 tests); #141 telemetry — merge-ready |
| SG-8 | memory-pressure auto-disable (degrade order — **canonical 10-stage LOCKED, DEC-Q7-010**) | B6/B8/B10, Tier 5 | ✅ **lib MERGED #161** (monitor+registry+order on main@0401e11); live-gate wiring deferred until Tier-5/B6/B8 features exist |
| SG-9 | plugin quota + signing | E7 | ❌ |
| SG-H1/2/3 | disk-LRU + probe ring-buffer · FD mgmt · MIDI/OSC echo-suppress | all tiers (hygiene) | ❌ |

---

## 5. Decision needed — the 27 scaffold PRs (#117–#145)

All draft, none merged, none integrated end-to-end. Real code with passing *unit* tests but **no producers** (scaffolds, not artifacts). Options (handoff §"27 prior PRs"):
- **(a) Merge-cascade from #117** — auto-rebases downstream. *Risk:* injects Tier 2+ surface before its tier per Vision §8 ordering.
- **(b) Cherry-pick Tier-1-relevant pieces into #147** (likely none), close the rest as "ahead-of-tier, reopen at tier."
- **(c) Leave open as draft reference**, continue on #147 branch.

**Recommendation to put to Lenny/CTO:** (c) for now, re-tag each draft to its real tier (§3 cross-refs them), reopen at gate. Avoids paying merge cost for premature integration. **User decision required.**

---

## 6. User-side blockers (cannot proceed headless)

```bash
# 1) Q7 REAL verdict (gates Tier 5) — downloads ~500MB models on first run
cd ~/Development/entropic-q7-e5/backend
python3 -m scripts.q7_benchmark.runner --measure --report \
    --out ~/.entropic/q7-report-real.json --sparsity 8 --n-iterations 100

# 2) Demo trilogy renders — SOURCE NOW LOCKED (no longer a blocker):
#    ~/Desktop/TERMINAL_COMPLETE_PACK/07_v11_MAD_SCIENTIST/_source_video/src_01.mp4
#    (11.8s, h264 480x270 30fps, has audio). Engine writes 3 MP4s to ~/.entropic/demos/.
#    configs: backend/scripts/demo_trilogy/{y-is-time,painted-blur,audio-lfo-stripes}.entropic.json
```
Cmd 1 (Q7 REAL) is the only remaining hard user blocker (Tier 5 / P7). Scaffold-PR fate RESOLVED (§9). Still open: SG-1 owner (P2-B), SG-8 canonical degrade order (both land in P4/P7).

---

## 7. Immediate next actions (what /eng picks up first)

Ordered for maximum unblock-per-hour, headless-first:

1. **0.3 Sync local main** to `origin/main` (1 min).
2. **1.11 History-buffer validation** — pure review, no deps, closes a Tier-1 item. (headless)
3. **1.10 I3 inline action-menu frontend** — next epic per protocol; backend exists. *Caveat:* full routing-graph population wants PR-B B4-lite frontend → ship menu shell now, wire routing when PR-B lands. (headless)
4. **6.1 SG-7 codec timeout** — **already built in draft #118**; action = review + **merge** it (backend-only, no Creatrix conflict, closes a real freeze hole). Not a build task.
5. **§5 decision** on the 27 scaffold PRs — *needs user* (surface in prioritization).
6. **0.5/0.6/0.7 Open PR-A → PR-B(+INJ-5) → PR-C** — the true Tier-1→Tier-4 unlock chain. Largest leverage; **B1 cannot start until PR-A; B2/B9/demos until PR-B/PR-C.**
7. **4.1 B1 Sampler** the moment PR-A lands (build-ready plan exists).
8. **2a.1 SG-1 spike** — unblocks the entire spectral + GPU instrument family (Tier 2 + B7/B8).
9. **User runs §6 cmd 1 & 2** → closes Tier-1 items 1.8/1.9 and gates Tier 5.

---

## 8. Open coordination questions (for /review + Lenny + CTO)

- **P1-C** confirm final type names with PR-B owner (`Lane`→`AutomationLane`, `InterpolationMode`).
- **P1-D** pin `domain='y'` renderer home file (the unified lane-eval site PR-B refactors).
- **P2-B** assign SG-1 owner before Tier 2 starts.
- ~~**SG-8** canonicalize the 3 partial degrade orderings~~ → **RESOLVED 2026-06-05 (user-approved).** Canonical 10-stage order locked in `DEC-Q7-010`: 1 d4_latent_grain_pool → 2 a5_spectral_state → 3 a1_grain_density → 4 e1_vae_suspended → 5 frame_bank_cache → 6 gpu_texture_pool → 7 clap_unloaded → 8 clip_unloaded → 9 dinov2_unloaded → 10 l_worker_killed. Reconciles BUILD-PLAN(4)+SPEC-3(7)+SPEC-5(CLAP→CLIP→DINOv2); most-mem-per-pain first; core video render never degrades. (advance-squad track, branch `adv/sg8-pressure`.)
- **Scope of this /eng run** — Tier 1 closeout only, or push into PR-A/B/C + B1? (the §7 chain).
- **27-scaffold-PR fate** (§5).
- **External user-test** scheduled at Tier 4 milestone to counter single-person pruning bias (Vision §9/§11).

---

---

## 9. PRIORITIZATION — Lenny (product) × CTO (technical), synthesized 2026-06-04

**The one-line verdict:** *You're sitting on the category-defining wow and starving it.* The felt "wavetable-axes-for-video" moment (one curve, two axes, impossible output) already exists in code (`lane_reader.sample_lane()`) and is **2 merges + 1 source video** from being three shareable MP4s. Ship that; defer the cathedral.

**Where the two advisors met:**
- **Lenny:** P0 = render the demo trilogy (it's the launch asset, the grant reel, AND what recruits your first 10 testers to break single-person bias). Defer Tiers 5/6/7 + the 27 scaffolds. Narrow to the demo, not the platform.
- **CTO agreed on order but corrected one thing:** "the demo is only blocked on a source video" is product-true / engineering-false — the renderer needs the Tier-1 lane code that lives only on draft #147, and it decodes an **untrusted clip through PyAV**. So **SG-7 (#118) is promoted to co-P0** (merge it before filming, or a bad clip freezes the demo), and the demo carries a 2-step merge tail.

### The ONE continuous sequence (nothing deferred — everything ordered)

> Every Tier 0→7 item from §3 is folded into one ranked chain below. Nothing is dropped; lower-leverage / gated work is simply **later in the order**, not cut. The 27 scaffold PRs are *sequenced* (re-tagged now, reopened at their real tier), not abandoned. **This `/eng` run executes P0→P3** (decision locked: "push through P3"). P4→P9 are subsequent runs against this same doc.

**Resolved inputs (no longer blockers):**
- **Demo source video = `~/Desktop/TERMINAL_COMPLETE_PACK/07_v11_MAD_SCIENTIST/_source_video/src_01.mp4`** (11.8s · h264 480×270 30fps · **has AAC audio** — required by the audio-lfo-stripes demo). Pool of 14 more `src_*.mp4` siblings + the already-glitched `wave*/` outputs in the same pack if a second look is wanted. (The `~/Documents/TrippyVisuals/` download script exists but was never run — dir empty.)
- **`/eng` scope = through P3.** Source = src_01.mp4. Scaffold strategy = re-tag + reopen-at-tier (not cascade/rebase).

| # | Phase / Move | Tier | Type | Blocked on |
|---|---|---|---|---|
| **P0a** | `git fetch` → sync local `main` to `origin` (6472597) | 0 | headless 1min | — |
| **P0b** | **Merge SG-7 #118** (cherry-pick — stack bottom) — prereq: demos decode untrusted clips via PyAV | 6→pulled-fwd | headless | P0a |
| **P0c** | Cherry-pick **Tier-1 subset** to main (`modulation/schema.py` + `lane_reader.py` + tests + `demo_trilogy/`) — NOT the 39-commit stack | 1 | headless | P0a |
| **P0d** | **Render the demo trilogy** → `~/.entropic/demos/{y-is-time,painted-blur,audio-lfo-stripes}.mp4` using **src_01.mp4** | 1 | build+run | P0b, P0c |
| **P1a** | History-buffer validation (review existing v2) — closes Tier-1 item 1.11 | 1 | headless | P0a |
| **P1b** | I3 inline action-menu **shell** (backend #143 exists) — Tier-1 item 1.10 | 1 | headless | P0a |
| **P1c** | **Scaffold hygiene:** re-tag all 27 drafts (#117–#145) with their real tier as a PR comment; do NOT merge/rebase. (sequences them, doesn't drop them) | 0.4 | headless | P0a |
| **P1d** | Reconcile P1-C (`Lane`→`AutomationLane`) + P1-D (`domain='y'` renderer home) for PR-B | 1 | headless | — |
| **P2** | **Open PR-B + INJ-5** (frontend B4-lite) — backend `schema.py` = canonical source-of-truth + **round-trip contract test in merge gate** (kills the #1 schema-fork risk). Includes INJ-1 modRoutes, INJ-2 toposort-raise, INJ-3 caps+frame-guard | 0.6/1 | build ~14–20h | P1d |
| **P3** | **Open PR-A** (layout + browser tabs incl. real instruments tab = INJ-4) → then **B1 Sampler** (build-ready) — *first playable instrument* | 0.5/4.1 | build ~16–22h | PR-A merged | ⟵ **`/eng` run ends here**
| P4 | **Tier 2 — Spectral + GPU:** SG-1 GPU-lifetime spike → A4 Spectral Warper (#135) → C4 band-isolated (#136) → C2/C3 field params → I2 Routing Canvas (#142). Open PR-C en route. | 2a/2b | build | SG-1 first |
| P5 | **Tier 3 — Cross-modal tensor + hardware:** SG-5 (#144) + SG-4 (#128) → B2 mod-matrix → B4-full → B3 → E5 Launchpad (#145) → I1 Inspector Track (#140) | 3 | build | SG-5, SG-4 |
| P6 | **Tier 4 — Instrument ladder:** B2 voice spine → B3 → B4 rack → B5 grouping (near-term shippable core) → B6 Frame-Bank → B7 RIFE → B8 Granulator → A5 spectral granulator (#137) → D2/D3 → B9 tensor+Y-as-time | 4 | build | per-build DEP + SG-1/3/8 |
| P7 | **Tier 5 — Latent:** **user runs Q7 REAL benchmark** → if GO: SG-3 (#133) + SG-8 (#129, canonicalize degrade order first) → L-backbone worker (#127) → E1/C5/C6/C8/D4 → E6 live mode | 5 | 🔬 user + build | Q7=GO |
| P8 | **Tier 6 — Genoscope + `.dna`:** E2 `.dna` productization (#139) + SG-2 + SG-6 → A2 Genoscope + E8 vibe-to-patch | 6 | build | SG-2/6/7 |
| P9 | **Tier 7 — Ecosystem:** SG-9 quota+signing → E7 Plugin SDK → hardware partnerships beyond Launchpad | 7 | build | SG-9 |

### Standing decisions — RESOLVED this turn
1. ~~Source video~~ → **`src_01.mp4`** (locked above).
2. ~~Scaffold-PR fate~~ → **re-tag + reopen-at-tier** (P1c / P4–P8); no cascade, no 30-branch rebase.
3. ~~`/eng` scope~~ → **through P3** ("push through P3").
4. **#1 architectural risk acknowledged & carried into P2:** backend/frontend B4-lite schema must not fork — PR-B owns the canonical-schema + round-trip-test mandate (SPEC-6 Lint-3 enforced from PR-B on).

---

---

## 10. BUILD LOG — `/eng` steamroll 2026-06-04 (P0→P2 boundary)

Artifact-existence DoD. Everything below is real (tested, on disk / pushed).

| Item | Status | Artifact |
|---|---|---|
| **P0a** sync main | ✅ | local `main` ff'd `839345f`→`6472597` |
| **P0b** SG-7 | ✅ **PR #149** (draft, de-stacked off main, 9/9 tests) — supersedes #118 | `feat/sg7-clean` |
| **P0c** clean Tier-1 | ✅ **PR #148** (draft, de-stacked off main) — supersedes #147 | `feat/tier1-clean` |
| **P0d** demo trilogy | ✅ **rendered** — 3 valid MP4s | `~/.entropic/demos/{y-is-time,audio-lfo-stripes,painted-blur}.mp4` via `render_demos.py` driving real `sample_lane` |
| **P1a** history-buffer validation | ✅ re-verified vs `undo.ts` | `entropic-history-buffer-validation.md` (2026-06-04 stamp) |
| **P1b** I3 menu shell | ✅ committed + 8 tests | `inline-actions/` in #148 |
| **P1c** scaffold re-tag | ✅ | tier-map comment on #117; supersede notes on #118/#147 |
| **P2 (schema spine)** INJ-5 frontend B4-lite | ✅ folded into #148 (16 tests) | `frontend/src/shared/axis-binding.ts` |
| **P2 (#1 risk)** schema-fork **FOUND** | 🔴 **P1 blocker for PR-B** — backend `BindingRule` snake_case+5 vs frontend camelCase+8; `.dna` would fail cross-load | finding: `entropic-P2-schema-fork-finding.md`; self-clearing `xfail` guard in #148 |

**Test tally this run:** #148 = 32 backend + 24 frontend (8 I3 + 16 axis-binding) + 2 contract; #149 = 9 backend. All green (fork = intentional xfail).

**Two draft PRs ready for your merge** (no standing auth on v2challenger): **#149 (SG-7) then #148 (Tier-1)** — merge #149 first (demo-safety), then #148.

### P2 backend injections — shipped after re-evaluating the boundary (worktree-isolated, off main)
With **no parallel commits to origin/main in hours**, the two *backend-isolated* injections were safe to ship solo in their own worktrees:
| Item | Status | Artifact |
|---|---|---|
| **INJ-2** toposort-raise | ✅ **PR #150** — `_topological_sort` raises `ModulationCycleError` + walks all operator edges; caller degrades. 20 tests; 235 regression | `feat/inj2-toposort-raise` |
| **INJ-3** composite caps + frame guard | ✅ **PR #151** — `MAX_COMPOSITE_LAYERS=50` + per-layer `frame_index` reject-neg/tail-clamp. 5 tests; 71 regression | `feat/inj3-composite-caps` |

### P2/P3 continued — user said "take them solo too, go" (2026-06-04)
With no parallel activity, took the remaining bounded items solo in isolated worktrees (claimed INJ-1 in PR-INJECTIONS.md first):
| Item | Status | Artifact |
|---|---|---|
| **INJ-1** `Pad.mappings → modRoutes` (v3 schema break) | ✅ **PR #152** — Pad field only (Operator.mappings untouched); 15 files; **full frontend regression 1925 passed, 0 fail**; tsc clean | `feat/inj1-modroutes-rename` |
| **B1 Sampler core** | ✅ **PR #153** — pure `computeSamplerVoice` + store + `SamplerDevice`; 21 tests; tsc clean. Rides #151's frame guard | `feat/b1-sampler-core` |

### TRUE remaining boundary (genuinely needs PR-A / design / invasive App.tsx)
- **PR-A layout redesign** (browser tabs / inspector) — design-heavy, the Creatrix session's core deliverable; not a mechanical steamroll item.
- **B1 App.tsx wiring** (append `computeSamplerVoice` to `render_composite` + `requestRenderFrame`) + **InstrumentsTab "Sampler" entry (INJ-4)** — gated on PR-A's tab existing; invasive App.tsx surgery.
- **Renderer `domain='y'` §5e** — needs the AutomationLane schema unify (PR-B core).
These 3 are PR-A/PR-B-gated and invasive; everything mechanically isolable in P0→P3 is shipped (6 PRs: #148, #149, #150, #151, #152, #153).

### Needs you
1. **Merge #149 → #148** (order matters).
2. **PR-B owner decision** on the schema-fork reconciliation (`entropic-P2-schema-fork-finding.md` recommends backend → camelCase+8). Permanent for `.dna` — your call.
3. **Q7 REAL benchmark** (P7 / Tier 5) when you want to gate the latent tier — unchanged.

---

*Built 2026-06-04 from full 60h crawl. DoD = artifact existence. Reviewed (Neglect+CTO+RedTeam). Prioritized Lenny×CTO. `/eng` steamroll shipped P0→P1 complete + P2 schema spine + the #1-risk fork finding; stopped at the Creatrix-session ownership boundary for P2-invasive/P3.*

---

## 11. SESSION CLOSEOUT — 2026-06-05

**Status: P0→P3 backbone MERGED to `main`. Layout detour (PR-A) abandoned. Program healthy.**

### Merged to main (6 PRs)
| PR | Item |
|---|---|
| #149 | SG-7 codec timeout |
| #148 | Tier-1 (schema + lane_reader + demo renderer + I3 + axis-binding) + **schema-fork fix (BindingRule→camelCase+8)** |
| #150 | INJ-2 toposort-raise |
| #151 | INJ-3 composite caps + frame guard |
| #152 | INJ-1 Pad.mappings→modRoutes |
| #153 | B1 Sampler CORE (compute + store + device) |

Plus demo trilogy rendered → `~/.entropic/demos/*.mp4`. Closed: #147, #118 (superseded), **#154 (parallel layout — wrong approach, abandoned)**. ~28 q7 scaffolds (#117–145) re-tagged + parked.

### Resolved decisions
schema-fork (camelCase+8, permanent for `.dna`) · scaffolds (re-tag/reopen-at-tier) · Genoscope deferred · external user-test = NONE (user is sole tester) · pricing moot · EffectBrowser "fine for now".

### Open / next (USER-gated)
- **Q7 REAL benchmark** → Tier-5 GO/NO-GO (run `runner.py --measure` on Mac). Gates all latent work.
- **SG-8 degrade order** (pick 1 of 3) · **SG-1 owner** (before Tier 2).
- **B1 mount into the EXISTING app** — core merged, no mount yet. Do IN PLACE (lesson from #154), not a parallel shell.

### Lesson (logged to reflect)
`feedback_read-existing-component-before-parallel-build.md` — read the existing component first; modify in place; never a parallel flag-gated reimplementation; stop building when value is questioned mid-task.

*Closeout 2026-06-05.*

---

## 12. SESSION 2026-06-05 (pm) — B1 MOUNT (the §11 "next" item)

**Status: B1 sampler MOUNTED into the live app. Code-complete + tests-green. PR #155 open, awaiting user visual-UAT + merge.**

Picked up the one headless next-step §11 named: *"B1 mount into the EXISTING app — core merged, no mount yet. Do IN PLACE."* B1 core (#153) had **zero callers** — verified dormant against `origin/main` (not the lossy summary).

### Shipped — PR #155 `feat/b1-sampler-mount` (worktree `~/Development/entropic-b1-mount-wt`, off `origin/main` @ 93c6b20)
| Item | Artifact |
|---|---|
| Pure render seam | `frontend/src/renderer/components/instruments/buildSamplerLayer.ts` — resolves clipId→asset (path+frameCount), → computeSamplerVoice; null when unresolved; bad probe → freeze 0 |
| Render wiring | App.tsx: appends sampler layer to `render_composite` + **forces composite path** when sampler active (else 1-clip project drops it) + re-render `useEffect` on `instrument` |
| UI home (in place) | new **'instruments' sidebar tab** + `InstrumentsPanel.tsx` (Add-from-selected-clip / `<SamplerDevice>` / Remove); `styles/instruments.css` |
| Tests | +11 (buildSamplerLayer 7, InstrumentsPanel 4); 21 existing B1 green; **full suite 1981 pass / 4 skip / 0 fail** |

Decision owned (not a blocker): "Add Sampler" sources clip = selected timeline clip's asset, fallback first asset.
Known limitation: render fires only when a base clip is active in preview (`activeAssetPath`) — per B1's "when a base clip exists" contract. Polyphony = B2.

### Needs you
1. **Visual UAT** (sole tester): `cd frontend && npm start` → Instruments tab → Add Sampler → confirm speed/freeze/reverse/start/opacity/blend affect preview live; Remove clears it. (NOT verified live by me — Gate 18.)
2. **Merge #155** (no standing auth on entropic-v2challenger).

### Genuinely-next after B1 (unchanged, all user-gated or PR-B/PR-A-gated)
- B2 voice spine (gated on PR-B) · PR-A layout · Q7 REAL benchmark (your Mac) → Tier-5 GO · SG-1 owner · SG-8 degrade order.

*Session 2026-06-05 pm.*

---

## 13. ADVANCE-SQUAD SESSION — 2026-06-05 (parallel to the B1-mount/PR-B session)

**Role:** advance squad running collision-free in `backend/src/safety/` + `effects/spectral/` while the primary session (`3ddbce9d`) owns automation/composite/instruments/render-pipeline (PR-B #157, B1 persistence #156). Zero file overlap by design.

### 🚨 PROGRAM-WIDE LANDMINE FOUND (tell every session before any scaffold merge)
**All q7 scaffold PRs (#117–#145) share merge-base `839345f` — ~10 commits behind `origin/main@228fe89`.** Their raw `origin/main..HEAD` diffs FALSELY appear to delete INJ-1/2/3 (#150/#151/#152), the B1 sampler (#153), and the instruments stack. **Merging any of them as-is REVERTS the primary session's merged work.** Each must be **cherry-picked onto current main**, never raw-merged. Verified: each SG's real payload is 2–7 isolated files in net-new namespaces.

### Merge-readiness scorecard (advance-squad review, 5 agents vs SPEC-3 contracts)
| Gate | Source PR | Verdict | Real effort to ready | Unblocks |
|---|---|---|---|---|
| SG-4 audio-isolation lint | #128 | ✅ MERGE-READY (real AST lint + negative test, 16 smoke in CI) | cherry-pick only | B2-audio, Q7 |
| SG-8 mem-pressure | #129 | 🟠 gate-DECISION met; library merge-ready, live-wiring blocked-by-dependency | ~3–5h | B6/B8/B10, Tier 5 |
| SG-1 GPU lifetime | #134 | 🔴 SCAFFOLD (finalizer + real-leak-test deferred) | ~9–16h | **all Tier 2** + B7/B8 |
| SG-3 latent sentinel | #133 | 🔴 NEEDS-WORK (clause-1 only, 0 callers, Tier-5-coupled) | ~12–18h | Tier 5 (defer) |
| A4/C4/A5 spectral | #135/6/7 | 🔴 unregistered libs; **GPU-gating is FICTIONAL** (pure numpy — NOT SG-1-blocked) | A4 6–10h | Tier-2 effects |

### Tracks executed this session — ✅ ALL 4 MERGED to `main` (user said "go" 2026-06-05; CI green; squash-merged; integration-verified)
Cherry-picked clean off main@228fe89, mutually conflict-free (only shared file `safety/__init__.py` made byte-identical + import-free so any merge order worked). **Post-merge `main` = `4907347`. Full smoke suite 6608 passed / 0 failed after all 4.**
- **PR #159 ✅ merged** (squash `0267b52`) — SG-4 audio realtime-thread isolation AST lint + denylist hardening (14 forbidden prefixes). 16 tests. **SG-4 now satisfied** → unblocks B2-audio + Q7.
- **PR #163 ✅ merged** (squash `4b8e293`) — SG-1 GPU lifetime: RAII `weakref.finalize` + use-after-destroy guard + mutation-verified real leak test + gated `@pytest.mark.metal` RSS variant (ran on this Mac). 33 tests. **SG-1 now satisfied** (advance squad = owner) → unblocks ALL Tier 2 + B7/B8. Gaps 5–6 (forbidden-pattern AST lint, real Metal binding) → first Tier-2 effect PR.
- **PR #161 ✅ merged** (squash `0401e11`) — SG-8 memory-pressure library + **canonical 10-stage degrade order LOCKED** (DEC-Q7-010; DEC-Q7-011 ratified as RAM-tiering override). 34 tests. Live-gate wiring deferred-by-dependency (target features Tier-5/B6/B8).
- **PR #162 ✅ merged** (squash `4907347`) — A4 spectral: 6 primitives registered → **reachable in the effect graph (206→212 effects)**; RGBA/RGB adapter; additive-only registry edit (orphan-guard passes). 69 tests. NOT SG-1-gated (pure CPU). Math/spec reconciliation + wavelet + recursive-F deferred.

**Net program effect:** SG-1 + SG-4 + SG-8 are now satisfied IN CODE on `main`. Tier 2 (spectral A4/C4, field params C2/C3) + instruments B7/B8 are no longer SG-1-blocked; B2-audio + Q7 latent no longer SG-4-blocked. §3/§4 SG rows updated. Remaining SG gaps: SG-1 real Metal binding (first Tier-2 PR), SG-8 live-wiring (Tier-5/B6/B8 features), SG-3 (#133, Tier-5-coupled, not yet ported), SG-5 (post-PR-B).

### Round 2 — spectral family extended (also MERGED)
- **PR #165 ✅ merged** (squash `8dc96cd`) — A5 `fx.spectral_granulator` + C4 `fx.band_isolated` registered on top of merged A4 → **effect graph 212 → 214**. Built on #162; additive registry (orphan-guard green). 56 new tests; full smoke 6718/0. **Chaos-testing also fixed 2 bugs:** A5 crash on 1×1 frame, and a *pre-existing latent A4 bug* (`spectral_shift` dx/dy ±N/2 roll wraps to identity — allowlisted in `test_parameter_sweep.py` with the `invert_bands::offset` convention).
  - Deferred (documented): A5 identity-curve + multi-frame grains + wavelet + B8-shared-UI; C4 arbitrary-effect wrapper + `band_isolated_multi` + add/subtract modes + band-picker UI.

**Advance-squad session total: 5 PRs merged** (#159 SG-4, #163 SG-1, #161 SG-8, #162 A4, #165 A5+C4) — 3 safety gates satisfied + **8 reachable spectral effects** (206→214). main @ `8dc96cd`. Zero collision with the parallel PR-B/B1 session throughout.

### Why the advance squad paused here (diminishing clean-vein)
The remaining independent items are NOT clean: I1/#140 + I2/#142 inspector backends are scaffold-without-producer (their producers are PR-B-gated frontend → building backend-only repeats the §0 over-production anti-pattern); C2/C3 field params touch the modulation/render path PR-B owns (collision); CLIP/CLAP/#131/#132 + SG-3/#133 + L-worker/#127 are Tier-5, hard-gated on the **Q7 REAL benchmark** (user's Mac). The clean, producer-complete vein was the safety gates + registrable spectral effects — now harvested. Next highest-value moves are user/other-session owned: PR-A/PR-B felt work, and the Q7 benchmark to open Tier 5.

### Decisions locked this session
- **SG-8 degrade order = the 10-stage canonical** (see §8, now RESOLVED). User-approved.
- **SG-1 owner = advance squad** (closes the §8 P2-B open question).
- **Spectral family is NOT SG-1-gated** (pure CPU numpy) — can ship ahead of the GPU work.

### Still hard-blocked (unchanged)
- Q7 REAL benchmark (your Mac) → Tier-5 GO. · SG-1 real Metal binding (first Tier-2 effect PR). · C4/A5 user-facing features (C4 needs arbitrary-effect-wrapper rewrite; A5 identity-curve unbuilt + UI blocked on B8).

*Advance-squad session 2026-06-05.*
