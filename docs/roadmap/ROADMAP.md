# Creatrix — Roadmap to Feature-Complete

**Date:** 2026-06-11 · **Author:** Claude (5-agent sweep: repo state, plan docs, build docs, memory/session logs, oracle namesake)
**Subject:** Creatrix, the renamed Entropic (glitch video app). Repo: [nissimdirect/entropic-v2challenger](https://github.com/nissimdirect/entropic-v2challenger) at `~/Development/entropic-v2challenger/`.
**Note:** The *other* Creatrix (chaos-oracle PyGame app, `~/Development/creatrix/`) is covered in Appendix B only.

---

## 0. Ground truth snapshot (verified against origin 2026-06-11)

- **main:** `d821ae8` = [PR #166](https://github.com/nissimdirect/entropic-v2challenger/pull/166), merged 2026-06-05. **No merges in the last 6 days.**
- **Identity:** `package.json` → `creatrix` / `Creatrix` / **v3.0.0** (rename shipped as [PR #120](https://github.com/nissimdirect/entropic-v2challenger/pull/120)).
- **Scale:** ~214 effects (206 at the 2026-05-15 GO verdict, +8 spectral since), 1,814/1,818 vitest, 12K+ backend tests, 25h engine soak clean.
- **Merged since 2026-05-05:** ~75 PRs — May UAT/hardening campaign (#55–#107), PR-zero per-track chains ([#116](https://github.com/nissimdirect/entropic-v2challenger/pull/116)), rebrand ([#120](https://github.com/nissimdirect/entropic-v2challenger/pull/120)), INJ-1/2/3 ([#152](https://github.com/nissimdirect/entropic-v2challenger/pull/152)/[#150](https://github.com/nissimdirect/entropic-v2challenger/pull/150)/[#151](https://github.com/nissimdirect/entropic-v2challenger/pull/151)), Tier-1 schema de-stack ([#148](https://github.com/nissimdirect/entropic-v2challenger/pull/148)), B1 sampler ([#153](https://github.com/nissimdirect/entropic-v2challenger/pull/153)+[#155](https://github.com/nissimdirect/entropic-v2challenger/pull/155)), automation unification ([#157](https://github.com/nissimdirect/entropic-v2challenger/pull/157) *merged per plan docs; listed open on GH — verify*), safety gates SG-7/4/8/1 ([#149](https://github.com/nissimdirect/entropic-v2challenger/pull/149)/[#159](https://github.com/nissimdirect/entropic-v2challenger/pull/159)/[#161](https://github.com/nissimdirect/entropic-v2challenger/pull/161)/[#163](https://github.com/nissimdirect/entropic-v2challenger/pull/163)), spectral family A4/C4/A5 ([#162](https://github.com/nissimdirect/entropic-v2challenger/pull/162)/[#165](https://github.com/nissimdirect/entropic-v2challenger/pull/165)).
- **Open:** 39 PRs = 7 active (June) + 22 parked q7 drafts + 5 stale (May) + docs [#67](https://github.com/nissimdirect/entropic-v2challenger/pull/67).
- **Feature flags:** exactly one — `EXPERIMENTAL_AUDIO_TRACKS` (`backend/src/zmq_server.py:52`), **default OFF** even though the full audio chain merged ([#30](https://github.com/nissimdirect/entropic-v2challenger/pull/30)+[#66](https://github.com/nissimdirect/entropic-v2challenger/pull/66)).

**Canonical plan sources** (source-of-truth order per master sequence):
1. `~/.claude/plans/entropic-creatrix-MASTER-SEQUENCE-2026-06-04.md` — live truth for sequence + status
2. `~/.claude/plans/entropic-synth-paradigm-vision.md` — ~30 PRDs, Tiers 0–7, gates (some orderings overtaken by events)
3. Specs: `~/.claude/plans/entropic-spec-{1..7}-*.md` (crosswalk · B4-lite schema · safety gates · demo trilogy · L backbone/Q7 · .dna · spectral post-pass)
4. Build session: `~/Development/entropic-layout-mockup/{PLAN.md, INSTRUMENTS.md, INSTRUMENTS-BUILD-PLAN.md, B1-1VOICE-SAMPLER-PLAN.md, PR-INJECTIONS.md, DECISIONS.md}`
5. PR-B detail: `~/.claude/plans/entropic-PR-B-plan-2026-06-05.md` · B2-lite: `~/.claude/plans/entropic-B2-performance-track-sampler-2026-06-05.md`
6. Legacy v2 roadmap: `~/Development/entropic-v2challenger/docs/addendums/POST-V1-ROADMAP.md` (pre-paradigm — needs reconciliation, see Gap G6)

---

## 1. What "feature complete" means (two targets)

- **FC-v3 — "Playable instrument paradigm"** = Tiers 0–4 done: PR-A/B/C sweep, demo trilogy in-app, instrument ladder B1–B10, inspector surfaces, plus v2 debt cleared. **≈ 150–250h** of build remaining.
- **FC-vision — full synth-paradigm** = FC-v3 + Tiers 5–7 (latent L-axis features, `.dna` ecosystem, Genoscope, plugin SDK). **≈ +250–400h**, with Tier 5 hard-gated on the Q7 REAL benchmark verdict.

---

## 2. Status ledger — built ✅ / in flight 🔄 / not built ❌

Legend: ✅ = merged to `origin/main` · 🔄 = open PR, parked draft, or partially shipped · ❌ = not started (plan only). Every 🔄 names its PR.

### Sweep PRs (PLAN.md ladder)
| Item | Status |
|---|---|
| PR-zero per-track chains | ✅ [#116](https://github.com/nissimdirect/entropic-v2challenger/pull/116) |
| PR-A layout redesign | ❌ — attempt [#154](https://github.com/nissimdirect/entropic-v2challenger/pull/154) closed as waste; "evolve EffectBrowser in place" |
| PR-B data-model break | 🔄 — slice 1 automation-unify [#157](https://github.com/nissimdirect/entropic-v2challenger/pull/157), slice 2 axis-binding [#158](https://github.com/nissimdirect/entropic-v2challenger/pull/158), slice 3a export-determinism [#160](https://github.com/nissimdirect/entropic-v2challenger/pull/160) all open-active; **3b BPM split / 3c composite-as-effect / 3d export parity ❌** |
| PR-C operators + Kentaro | ❌ |
| PR-D rebrand → Creatrix v3.0.0 | ✅ [#120](https://github.com/nissimdirect/entropic-v2challenger/pull/120) (repo/dir names + `ENTROPIC_DIR` const residue ❌) |

### Injections
| INJ | Status |
|---|---|
| INJ-1 `Pad.mappings→modRoutes` | ✅ [#152](https://github.com/nissimdirect/entropic-v2challenger/pull/152) |
| INJ-2 toposort raises | ✅ [#150](https://github.com/nissimdirect/entropic-v2challenger/pull/150) |
| INJ-3 composite caps + frame_index guard | ✅ [#151](https://github.com/nissimdirect/entropic-v2challenger/pull/151) |
| INJ-4 Sampler browser entry | ❌ (gated on PR-A) |
| INJ-5 B4-lite schema | 🔄 — schema+validator ✅ [#148](https://github.com/nissimdirect/entropic-v2challenger/pull/148); store wiring in open [#158](https://github.com/nissimdirect/entropic-v2challenger/pull/158) |

### Safety gates
| Gate | Status |
|---|---|
| SG-1 GPU lifetime | ✅ [#163](https://github.com/nissimdirect/entropic-v2challenger/pull/163) — real Metal binding deferred to first Tier-2 GPU effect |
| SG-2 `.dna` budget | 🔄 draft [#139](https://github.com/nissimdirect/entropic-v2challenger/pull/139) |
| SG-3 latent NaN sentinel | 🔄 draft [#133](https://github.com/nissimdirect/entropic-v2challenger/pull/133) — clause-1 only, ~12–18h real work remains |
| SG-4 audio realtime isolation | ✅ [#159](https://github.com/nissimdirect/entropic-v2challenger/pull/159) (runtime-starvation tests ❌) |
| SG-5 dynamic cycle detection | 🔄 draft [#144](https://github.com/nissimdirect/entropic-v2challenger/pull/144) |
| SG-6 Genoscope cancellation | ❌ |
| SG-7 codec timeout | ✅ [#149](https://github.com/nissimdirect/entropic-v2challenger/pull/149) |
| SG-8 memory pressure | ✅ lib [#161](https://github.com/nissimdirect/entropic-v2challenger/pull/161) — live-gate wiring ❌ |
| SG-9 plugin quotas | ❌ · SG-H1/H2/H3 hygiene ❌ |

### Instruments (Creatrix B-ladder, Tier 4)
| Build | Status |
|---|---|
| B1 1-voice Sampler | ✅ core [#153](https://github.com/nissimdirect/entropic-v2challenger/pull/153) + mount [#155](https://github.com/nissimdirect/entropic-v2challenger/pull/155) · persistence 🔄 [#156](https://github.com/nissimdirect/entropic-v2challenger/pull/156) · UX correction 🔄 [#167](https://github.com/nissimdirect/entropic-v2challenger/pull/167) |
| B2 voice spine / Performance Track | 🔄 — B2-lite open [#167](https://github.com/nissimdirect/entropic-v2challenger/pull/167); full voice spine (polyphony/FSM) ❌ |
| B3 full sampler · B4 sample rack · B5 grouping | ❌ (plans ready) |
| B6 Frame-Bank · B7 RIFE morph · B8 Granulator · B9 tensor routing · B10 live affordances | ❌ (gated designs; B8 needs SG-3, B9 needs PR-C+SG-5) |

### Vision PRDs (synth paradigm)
| ID | Status |
|---|---|
| A4 Spectral Frame Warper | ✅ [#162](https://github.com/nissimdirect/entropic-v2challenger/pull/162) (wavelet/recursive-F deferred) |
| A5 Spectral Granulator | ✅ core [#165](https://github.com/nissimdirect/entropic-v2challenger/pull/165) (identity curve, multi-frame grains ❌) |
| C4 band-isolated effects | ✅ core [#165](https://github.com/nissimdirect/entropic-v2challenger/pull/165) (universal wrapper + band-picker UI ❌) |
| B1(vision) lane schema · C1 scanline-as-time backend · C7 audio-rate LFO · I3 shell | ✅ [#148](https://github.com/nissimdirect/entropic-v2challenger/pull/148) — **C1 live render unlock ❌ (deferred to C2/C3)** |
| A1 Granulator (=B8) · A2 Genoscope · A3 Frame-Bank (=B6) | ❌ |
| B2(vision) cross-modal matrix · B3(vision) mod-as-track · B4-full binding rules | ❌ |
| C2 frame-as-lane · C3 per-pixel fields · C5/C6/C8 latent · C9 | ❌ |
| D2 heterodyning · D3 wavetable-mask · D4 latent granulator | ❌ |
| E1 resynthesis · E6 live mode · E7 plugin SDK · E8 vibe-to-patch | ❌ |
| E2 `.dna` format | 🔄 draft [#139](https://github.com/nissimdirect/entropic-v2challenger/pull/139) |
| E5 Launchpad bridge | 🔄 draft [#145](https://github.com/nissimdirect/entropic-v2challenger/pull/145) |
| I1 Inspector Track | 🔄 draft [#140](https://github.com/nissimdirect/entropic-v2challenger/pull/140) · I2 Routing Canvas 🔄 backend draft [#142](https://github.com/nissimdirect/entropic-v2challenger/pull/142), UI ❌ · I3 full UI ❌ (gated on PR-A) |
| Q7 L-backbone benchmark | 🔄 machinery (27 parked drafts [#117–#145](https://github.com/nissimdirect/entropic-v2challenger/pulls)) · **REAL verdict ❌ USER-BLOCKED** (mock verdict only) |
| Demo trilogy | 🔄 MP4s ✅ rendered to `~/.entropic/demos/` · Demos Drawer / onboarding / D-PB paint ❌ (gated on PR-A) |

### v2 debt
| Item | Status |
|---|---|
| Audio tracks | ✅ merged [#30](https://github.com/nissimdirect/entropic-v2challenger/pull/30)+[#66](https://github.com/nissimdirect/entropic-v2challenger/pull/66) but flag default-OFF · bake ❌ · PR-4 un-flag + audio auto-extract (task #46) ❌ |
| Gain meter (task #47) | ✅ phases 1–2 [#102](https://github.com/nissimdirect/entropic-v2challenger/pull/102)/[#105](https://github.com/nissimdirect/entropic-v2challenger/pull/105) · phase 3 ❌ |
| Region-select preview (task #45) | ❌ |
| Hotkey discoverability ([issue #65](https://github.com/nissimdirect/entropic-v2challenger/issues/65)) | 🔄 — [#64](https://github.com/nissimdirect/entropic-v2challenger/pull/64)/[#68](https://github.com/nissimdirect/entropic-v2challenger/pull/68) done, 6 surfaces ❌ |
| Cross-modal v1.1 F1–F4 | ❌ — plan merged ([#36](https://github.com/nissimdirect/entropic-v2challenger/pull/36)), zero implementation |
| Bug fixes in stale open PRs | 🔄 [#101](https://github.com/nissimdirect/entropic-v2challenger/pull/101) Escape-deselect · [#103](https://github.com/nissimdirect/entropic-v2challenger/pull/103) hint badge · [#108](https://github.com/nissimdirect/entropic-v2challenger/pull/108) ZMQ mutex · [#109](https://github.com/nissimdirect/entropic-v2challenger/pull/109) timeline drag |

---

## 3. Phased roadmap

### Phase 1 — Drain the frontier (≈1–2 sessions)
The 7 active PRs are the live edge; nothing has merged since June 5.
- Merge the PR-B slice stack: [#157](https://github.com/nissimdirect/entropic-v2challenger/pull/157) (automation unify) → [#158](https://github.com/nissimdirect/entropic-v2challenger/pull/158) (B4-lite axis binding = INJ-5 wiring) → [#160](https://github.com/nissimdirect/entropic-v2challenger/pull/160) (export determinism 3a)
- [#156](https://github.com/nissimdirect/entropic-v2challenger/pull/156) B1 sampler persistence (coordinate with B2-lite breaking change), [#164](https://github.com/nissimdirect/entropic-v2challenger/pull/164) BPM persistence fix, [#167](https://github.com/nissimdirect/entropic-v2challenger/pull/167) B2-lite performance track, [#146](https://github.com/nissimdirect/entropic-v2challenger/pull/146) Grid Moire v2
- Disposition the 5 stale May PRs: [#101](https://github.com/nissimdirect/entropic-v2challenger/pull/101) (Escape-deselect bug fix — real open bug), [#103](https://github.com/nissimdirect/entropic-v2challenger/pull/103) (zero-default hint; check reverted files), [#108](https://github.com/nissimdirect/entropic-v2challenger/pull/108) (ZMQ REQ mutex), [#109](https://github.com/nissimdirect/entropic-v2challenger/pull/109) (timeline drag-reorder), [#67](https://github.com/nissimdirect/entropic-v2challenger/pull/67) (docs)
- Hygiene: prune ~15 stale post-squash worktrees + 4 empty scaffold worktrees (`effectgenome`, `apply-chain-state`, `pde-extract`, `seed-field-extract`); confirm cron `b3c47f1c` is dead.

### Phase 2 — Finish PR-B (≈8–14h remaining)
Per `~/.claude/plans/entropic-PR-B-plan-2026-06-05.md`: 3a ✅ (#160 once merged) · **3b BPM split** (`bpm` vs `effectiveBpm`, fixes BPM-never-hydrated) · **3c Composite-as-effect** — the 36-file v3 data-model break (terminal-effect validator, removes `Track.opacity`/`blendMode`; plan says fresh session + `/qa-redteam` required) · **3d full export parity** (operators/automation/sampler/multi-track in export).

### Phase 3 — PR-A layout redesign (9–12h plan estimate; the big unopened one)
`~/Development/entropic-layout-mockup/PLAN.md` §3. Approach reset after [#154](https://github.com/nissimdirect/entropic-v2challenger/pull/154) was closed as waste — **evolve `EffectBrowser.tsx` in place**, no parallel shell. Contents: CSS-grid layout shell + 4 drag handles, 5-tab browser (fx/op/composite/tool/instruments), polymorphic inspector (8 states), hover-help (WCAG 1.4.13, <8ms@200 targets gate), Ableton-style hotkeys, **INJ-4** (Sampler entry in instruments tab). Unlocks: Demos Drawer + first-launch onboarding (demo trilogy MP4s already rendered to `~/.entropic/demos/`, spec `~/.claude/plans/entropic-spec-4-demo-trilogy.md`), I3 inline-probe frontend, B2-lite drag UX. Also closes legacy UX debt F-0512-11 + effects-panel-height (`docs/plans/2026-05-14-upcoming-ux-items.md`).

### Phase 4 — PR-C operators (14–18h)
`PLAN.md` §5: operators surfaced in browser, `kentaroCluster | sidechain | gate | midiEnvStutter`, Kentaro 8-LFO cluster with react-xyflow topology graph (60fps@32-paths gate, bare-SVG fallback). Reference: `memory/reference_kentaro-suzuki-m4l.md`. Blocks B9.

### Phase 5 — Instrument ladder Tier 4 (≈90–150h, the bulk of FC-v3)
`~/Development/entropic-layout-mockup/INSTRUMENTS-BUILD-PLAN.md`. B1 ✅ core+mount; B2-lite in flight (#167).
**B2** voice spine/polyphony/FSM (10–14h, needs PR-B) → **B3** full sampler: loop/scrub/slice/melodic (8–10h) → **B4** sample rack + 8 macros (12–16h) → **B5** grouping/composite-tree (10–14h) → **B6** Frame-Bank wavetable (12–18h; SG-8 ✅ lib but needs live wiring) → **B7** RIFE optical-flow morph (15–25h; SG-1 ✅ but real Metal binding deferred) → **B8** Granulator — the headline (40–70h; needs **SG-3, unmerged**) → **B9** tensor mod-routing + Y-as-time (14–18h; needs PR-C + **SG-5, unmerged**) → **B10** live performance affordances (10–14h). Namespace footgun: vision-B4 (binding rules) ≠ Creatrix-B4 (sample rack).

### Phase 6 — Tier 2b field params + routing surfaces
**C2** Frame-as-Parameter-Lane (L) · **C3** Per-Pixel Parameter Fields w/ Metal codegen (L) — these two deliver the *actual* per-scanline render unlock that #158 deferred · **I2** Routing Canvas ⌘⇧I (L; backend graph in draft [#142](https://github.com/nissimdirect/entropic-v2challenger/pull/142)) · **I1** Inspector Track (M; draft [#140](https://github.com/nissimdirect/entropic-v2challenger/pull/140)) · cherry-pick **SG-5** ([#144](https://github.com/nissimdirect/entropic-v2challenger/pull/144)) and **E5** Launchpad bridge ([#145](https://github.com/nissimdirect/entropic-v2challenger/pull/145)) when their tiers open. **Cherry-pick only, never raw-merge** — stale merge-base hazard (`memory/feedback_cherry-pick-stale-scaffold-branches.md`).

### Phase 7 — Tier 5 latent (XL, **hard-gated on Q7 REAL verdict — user action**)
User must run the benchmark on their M-series Mac (`backend/scripts/q7_benchmark/`, ~500MB model download): `runner --measure --report`. Mock verdict exists (`~/.entropic/q7-report.json`, TIER_5_GO @ p95=15.09ms) but is explicitly not acceptable (spec `~/.claude/plans/entropic-spec-5-l-backbone.md` §9; 8 thresholds). If GO: cherry-pick SG-3 ([#133](https://github.com/nissimdirect/entropic-v2challenger/pull/133), needs ~12–18h real work), L-worker ([#127](https://github.com/nissimdirect/entropic-v2challenger/pull/127)), CLIP/CLAP ([#131](https://github.com/nissimdirect/entropic-v2challenger/pull/131)/[#132](https://github.com/nissimdirect/entropic-v2challenger/pull/132)), download UX ([#138](https://github.com/nissimdirect/entropic-v2challenger/pull/138)), SG-8 live wiring → then C5/C6/C8/D4/E1/E6. If NO-GO: ship FC-v3 without L-axis (documented fallback).

### Phase 8 — Tier 6: `.dna` + Genoscope (2XL)
**E2** `.dna` patch format + 5 CI lints + SG-2 budget descriptor (spec `~/.claude/plans/entropic-spec-6-dna-format.md`; draft [#139](https://github.com/nissimdirect/entropic-v2challenger/pull/139)) · **SG-6** cancellation · **A2 Genoscope + E8 vibe-to-patch** (research-class).

### Phase 9 — Tier 7: ecosystem (2XL)
**SG-9** plugin quotas + Ed25519 signing · **E7** Plugin SDK · hardware partnerships beyond Launchpad.

### Parallel track — v2 debt (independent of tiers, schedulable anytime)
1. **Audio tracks un-flag**: `EXPERIMENTAL_AUDIO_TRACKS` still default-OFF; PR-4 (flag removal + singleton-bed deletion + **source-audio auto-extract = task #46**) gated on a 1-week user bake that has never started (`memory/entropic-audio-tracks.md`).
2. **Feature-request tasks**: #45 region-select on preview, #46 audio extraction, #47 gain-meter phase 3 (phases 1–2 ✅ [#102](https://github.com/nissimdirect/entropic-v2challenger/pull/102)/[#105](https://github.com/nissimdirect/entropic-v2challenger/pull/105)).
3. **Hotkey discoverability epic** ([issue #65](https://github.com/nissimdirect/entropic-v2challenger/issues/65)): 6 unchecked surfaces in `docs/plans/2026-05-14-upcoming-ux-items.md`.
4. **Cross-modal v1.1 F1–F4 decision** (see Gap G6).
5. **Rename residue**: `gh repo rename`, dir rename, `ENTROPIC_DIR` const, memory slugs.
6. **F-0514-8** av/cv2 dylib warning (packaging, deferred to v1.1) · F-16 narrow-fix (in ROADMAP).

---

## 4. Gap register

| # | Gap | Severity | Evidence |
|---|---|---|---|
| **G1** | **Q7 REAL benchmark verdict never produced** — the only hard user blocker; gates all of Tier 5. 27 PRs of machinery exist; the deliverable (verdict file from a real run) doesn't. | 🔴 blocks Tier 5 | master sequence §6/§11; `memory/feedback_verb-ask-deliverable-is-the-result.md` |
| **G2** | **PR-A never opened.** One attempt (#154) closed as waste; "evolve EffectBrowser in place" direction set but no execution since. Blocks INJ-4, B1/B2-lite UX, demo Drawer, onboarding, I3 frontend. | 🔴 blocks Tiers 1/4 UX | `PLAN.md` §3; `memory/feedback_read-existing-component-before-parallel-build.md` |
| **G3** | **SG-3 (NaN sentinel) + SG-5 (dynamic cycle detection) unmerged** — drafts [#133](https://github.com/nissimdirect/entropic-v2challenger/pull/133)/[#144](https://github.com/nissimdirect/entropic-v2challenger/pull/144); block B8 Granulator (the headline instrument) and B9 tensor routing. SG-1 Metal binding + SG-8 live wiring also deferred. SG-6/SG-9/SG-H1-3 not started. | 🟠 | `entropic-spec-3-safety-gates.md`; INSTRUMENTS-BUILD-PLAN §5 |
| **G4** | **PR-B half-done**: 3b BPM split, 3c composite-as-effect (36-file break), 3d export parity remain; the per-scanline `domain='y'` render unlock was deferred out of #158 to C2/C3 — so Tier-1 "paradigm becomes felt" is schema-true but not yet *visible* in renders beyond the demo MP4s. | 🟠 | `entropic-PR-B-plan-2026-06-05.md` |
| **G5** | **22 parked q7 draft PRs** ([#117–#145](https://github.com/nissimdirect/entropic-v2challenger/pulls)) must each be cherry-picked when their tier opens; raw merge falsely reverts merged work. Unextracted: SG-3, SG-5, .dna, I1/I2/I3, CLIP/CLAP/L-worker/bench chain, download UX, E5, demo-trilogy runner. | 🟠 process hazard | `memory/feedback_cherry-pick-stale-scaffold-branches.md`; master sequence §13 |
| **G6** | **Two roadmaps never reconciled**: Cross-Modal v1.1 plan (F1 datamosh sequencer, F2 motion angle, F3 macro device, F4 chord modulator — merged plan [PR #36](https://github.com/nissimdirect/entropic-v2challenger/pull/36), never built) and `docs/addendums/POST-V1-ROADMAP.md` (Phases 12–19) both predate the synth-paradigm master sequence and are absent from it. Decide: fold in (F3 ≈ vision B2/macros; Phase 14 ≈ C7/B2), or formally supersede. | 🟠 scope ambiguity | `memory/entropic-cross-modal.md`; `docs/addendums/POST-V1-ROADMAP.md` |
| **G7** | **Audio tracks shipped but dark**: full chain merged (#30+#66) yet flag default-OFF, bake never started, PR-4 (un-flag + audio auto-extract) unscheduled. | 🟠 | `memory/entropic-audio-tracks.md`; `zmq_server.py:52` |
| **G8** | **Open bugs**: F-0514-5 Escape-deselect (fix waiting in open [#101](https://github.com/nissimdirect/entropic-v2challenger/pull/101)), F-0516-7 hint badge ([#103](https://github.com/nissimdirect/entropic-v2challenger/pull/103), files may have been reverted — rebase check), ZMQ REQ mutex ([#108](https://github.com/nissimdirect/entropic-v2challenger/pull/108)), F-0514-8 dylib warning, F-16. | 🟡 | `memory/entropic-uat-may14.md` |
| **G9** | **Demo trilogy not in-app**: MP4s rendered, but Demos Drawer / first-launch ritual / D-PB paint affordance all gated on PR-A; demo asset licensing unsourced. | 🟡 | `entropic-spec-4-demo-trilogy.md`; `~/.claude/plans/demo-trilogy-stubs/` |
| **G10** | **B2-lite supersedes #155 button UX** per user correction (drag sampler → MIDI track → drag video); #156 persistence must coordinate with #167's breaking change. | 🟡 | `entropic-B2-performance-track-sampler-2026-06-05.md` |
| **G11** | **External user-testing resolved "NONE"** (sole-tester) — contradicts vision §9/§11 founder-bias mitigation. Standing tension; revisit at Tier 4 milestone. | 🟡 strategic | master sequence §11 vs vision §11(f) |
| **G12** | **History-buffer polish**: Gap-2 description-string convention + Gap-3 500-entry memory smoke outstanding; Gap-1/Gap-4 deliberately deferred. | 🟢 | `~/.claude/plans/entropic-history-buffer-validation.md` |
| **G13** | **Hygiene**: ~19 prunable worktrees; cron `b3c47f1c` status unverified; effect-count drift across docs (treat 214 as live); `docs/decisions/q7/` has only 4 of ~17 DEC-Q7 records on main. | 🟢 | repo-state sweep |

---

## 5. Suggested execution order (next 5 moves)

1. **User runs Q7 REAL** (~30 min of user time, unblocks the single biggest gate) — can happen in parallel with everything.
2. **Phase 1 frontier drain** — merge the 7 active PRs, disposition the 5 stale ones.
3. **PR-B 3b+3c+3d** — closes the data-model break while context is fresh.
4. **PR-A in-place** — the everything-blocker for UX/demos/instruments tab.
5. **B2→B3→B4→B5** instrument core (with SG-3/SG-5 cherry-picks scheduled just-in-time before B8/B9).

---

## Appendix A — Source index

**GitHub:** [repo](https://github.com/nissimdirect/entropic-v2challenger) · [open PRs](https://github.com/nissimdirect/entropic-v2challenger/pulls) · [issue #65 hotkey epic](https://github.com/nissimdirect/entropic-v2challenger/issues/65)

**Planning docs (`~/.claude/plans/`):** `entropic-creatrix-MASTER-SEQUENCE-2026-06-04.md` · `entropic-synth-paradigm-vision.md` · `entropic-spec-1-crosswalk.md` … `entropic-spec-7-post-pass.md` · `entropic-PR-B-plan-2026-06-05.md` · `entropic-B2-performance-track-sampler-2026-06-05.md` · `entropic-history-buffer-validation.md` · `entropic-P2-schema-fork-finding.md` · `entropic-inspector-mockups.html` · `demo-trilogy-stubs/` · UAT history: `entropic-uat-COMPREHENSIVE-2026-05-16.md`, `entropic-uat-FINAL-SYNTHESIS-2026-05-15.md`, `entropic-uat-routes-2026-05-14.md`, `entropic-2026-05-17-non-cu-and-cu-queue.md`

**Build-session docs (`~/Development/entropic-layout-mockup/`):** `PLAN.md` (v1.2) · `DECISIONS.md` (28 locked) · `INSTRUMENTS.md` · `INSTRUMENTS-BUILD-PLAN.md` · `B1-1VOICE-SAMPLER-PLAN.md` · `PR-INJECTIONS.md` · `index.html` (lofi mockup)

**In-repo docs (`~/Development/entropic-v2challenger/docs/`):** `audits/2026-04-16-state-of-union.md` (canonical v2 state) · `addendums/POST-V1-ROADMAP.md` · `plans/2026-05-04-cross-modal-features-plan.md` · `plans/2026-05-14-upcoming-ux-items.md` · `PENDING-BUG-FIXES.md` · `V2-AUTOMATED-UAT-PLAN.md` · `UAT-UIT-GUIDE.md` · `RELEASE-CHECKLIST.md`

**Memory (`~/.claude/projects/-Users-nissimagent/memory/`):** `entropic.md` · `entropic-synth-paradigm.md` · `entropic-cross-modal.md` · `entropic-uat-may14.md` · `entropic-audio-tracks.md` · `project_creatrix-rename.md` · `project_entropic-layout-redesign-2026-05.md` · feedback files cited inline above

## Appendix B — The other Creatrix (chaos oracle)

`~/Development/creatrix/` (PyGame, 430-card deck) + `~/Development/creatrix-web/`. **Dormant since 2026-02-21.** Sole gap to feature-complete: **MUTATE mode** is hidden (commented out at `app.py:348/583-588` and `index.html:336/1019/1171`, "revisit 2026-02-16" — 4 months stale) because generation quality wasn't shippable (Markov layer hard-disabled at `mutation_engine.py:559`). Secondary: no README/tests, web/desktop engine drift risk (hand-ported JS), unclear deploy target. Options: LLM-backed mutation layer, curated pre-generated set, or formally ship draw-only and close.
