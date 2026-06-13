# Creatrix — Roadmap to Feature-Complete

**Date:** 2026-06-11 · **Author:** Claude (5-agent sweep: repo state, plan docs, build docs, memory/session logs, oracle namesake)
**Subject:** Creatrix, the renamed Entropic (glitch video app). Repo: [nissimdirect/entropic-v2challenger](https://github.com/nissimdirect/entropic-v2challenger) at `~/Development/entropic-v2challenger/`.
**Note:** The *other* Creatrix (chaos-oracle PyGame app, `~/Development/creatrix/`) is covered in Appendix B only.

---

## 0. Ground truth snapshot (verified against origin 2026-06-11)

- **main:** `d821ae8` = [PR #166](https://github.com/nissimdirect/entropic-v2challenger/pull/166), merged 2026-06-05. **No merges in the last 6 days.**
- **Identity:** `package.json` → `creatrix` / `Creatrix` / **v3.0.0** (rename shipped as [PR #120](https://github.com/nissimdirect/entropic-v2challenger/pull/120)).
- **Scale:** ~214 effects (206 at the 2026-05-15 GO verdict, +8 spectral since), 1,981/1,985 vitest (P1.0 green baseline: `cd frontend && npx --no vitest run` → 1,981 passed | 4 skipped | exit 0; run 2026-06-11), 12K+ backend tests, 25h engine soak clean.
- **Merged since 2026-05-05:** ~75 PRs — May UAT/hardening campaign (#55–#107), PR-zero per-track chains ([#116](https://github.com/nissimdirect/entropic-v2challenger/pull/116)), rebrand ([#120](https://github.com/nissimdirect/entropic-v2challenger/pull/120)), INJ-1/2/3 ([#152](https://github.com/nissimdirect/entropic-v2challenger/pull/152)/[#150](https://github.com/nissimdirect/entropic-v2challenger/pull/150)/[#151](https://github.com/nissimdirect/entropic-v2challenger/pull/151)), Tier-1 schema de-stack ([#148](https://github.com/nissimdirect/entropic-v2challenger/pull/148)), B1 sampler ([#153](https://github.com/nissimdirect/entropic-v2challenger/pull/153)+[#155](https://github.com/nissimdirect/entropic-v2challenger/pull/155)) (note: #157 automation-unify is OPEN despite plan docs claiming merged — verified via gh 2026-06-11; it merges in Phase 1), safety gates SG-7/4/8/1 ([#149](https://github.com/nissimdirect/entropic-v2challenger/pull/149)/[#159](https://github.com/nissimdirect/entropic-v2challenger/pull/159)/[#161](https://github.com/nissimdirect/entropic-v2challenger/pull/161)/[#163](https://github.com/nissimdirect/entropic-v2challenger/pull/163)), spectral family A4/C4/A5 ([#162](https://github.com/nissimdirect/entropic-v2challenger/pull/162)/[#165](https://github.com/nissimdirect/entropic-v2challenger/pull/165)).
- **Open:** **22 parked q7 drafts** (#117–#145, gh-verified 2026-06-11; the rest of that range already had content cherry-picked to main via #149/#159/#161/#162/#163/#165 and closed) + 7 active (June: #146/#156/#157/#158/#160/#164/#167) + 4 stale May (#101/#103/#108/#109) + docs [#67](https://github.com/nissimdirect/entropic-v2challenger/pull/67) + this consolidation's #168.
- **Feature flags:** exactly one — env-var read `_experimental_audio_tracks_enabled()` at `backend/src/zmq_server.py:51–54`, **default OFF** even though the full audio chain merged ([#30](https://github.com/nissimdirect/entropic-v2challenger/pull/30)+[#66](https://github.com/nissimdirect/entropic-v2challenger/pull/66)).

## 0.1 Campaign tick 1 snapshot (2026-06-12, orchestrated run)

**Phase 1 DRAINED + UE.1–UE.7 SHIPPED in one orchestrated session (16 PRs merged, 4 closed-with-reason).**

- **main:** `d0983b0` (+18 squash merges since `4d19f31`). Frontend baseline: **2,114+ passed | 4 skipped** (`cd frontend && npx --no vitest run`).
- **Merged 2026-06-11/12:** PR-B stack [#157](https://github.com/nissimdirect/entropic-v2challenger/pull/157)/[#158](https://github.com/nissimdirect/entropic-v2challenger/pull/158)/[#160](https://github.com/nissimdirect/entropic-v2challenger/pull/160) · Grid Moire v2 [#146](https://github.com/nissimdirect/entropic-v2challenger/pull/146) · BPM persistence [#164](https://github.com/nissimdirect/entropic-v2challenger/pull/164) · B1 sampler persistence [#156](https://github.com/nissimdirect/entropic-v2challenger/pull/156) · B2-lite [#167](https://github.com/nissimdirect/entropic-v2challenger/pull/167) (G10 resolved: track-keyed `instruments`, legacy drop-with-toast) · UE.4 [#170](https://github.com/nissimdirect/entropic-v2challenger/pull/170) · UE.6 [#173](https://github.com/nissimdirect/entropic-v2challenger/pull/173) · UE.5 [#172](https://github.com/nissimdirect/entropic-v2challenger/pull/172) · UE.2 [#176](https://github.com/nissimdirect/entropic-v2challenger/pull/176) · UE.1 [#177](https://github.com/nissimdirect/entropic-v2challenger/pull/177) · UE.3 [#180](https://github.com/nissimdirect/entropic-v2challenger/pull/180) · #109-fresh drag-reorder [#178](https://github.com/nissimdirect/entropic-v2challenger/pull/178) · torn-edges docs [#174](https://github.com/nissimdirect/entropic-v2challenger/pull/174) · F-0514-5 Escape fix [#175](https://github.com/nissimdirect/entropic-v2challenger/pull/175). UE.7 [#181](https://github.com/nissimdirect/entropic-v2challenger/pull/181) (`d5d8076`) and PUX.1 [#179](https://github.com/nissimdirect/entropic-v2challenger/pull/179) (`d0983b0`) merged — **18 PRs total; campaign tick-1 scope complete. Live Signal is live: 905→9 hardcoded hexes, ratchet ceiling 9 enforced via vitest.**
- **Closed with reason:** #103 (superseded by #100), #108 (subsumed — mutex commit 5ef6e1c excluded from #178, re-pick directly if ever needed), #101→#175, #67→#174, #109→#178.
- **Live smoke (rule 9) after 5th feature merge:** PASS — no campaign regression. `smoke.spec.ts` green on main; `full-journey.spec.ts` failure **bisected to pre-campaign d821ae8** (stale `.effect-rack__item` selectors; the visible chain is DeviceChain since June 3). Evidence: `~/Development/creatrix-smoke-wt/test-evidence/01-03*.png`.

**Masking (MK) workstream integrated 2026-06-12 — Phase 2.5 slot, supersedes PD.5/task#45.**

**Standing-red main CI (pre-campaign, discovered during P1.1 — §3 gate amended):**
1. **sidecar job red on EVERY main run since ≤8dc96cd:** runner image dropped ffmpeg; 127 oracle errors `FileNotFoundError: 'ffmpeg'`. Fix = [PR #171](https://github.com/nissimdirect/entropic-v2challenger/pull/171) (one-line workflow change, **USER MERGE REQUIRED** — workflow-change-guard). PR-level CI path-filters sidecar to "skipped", which is why PRs looked green while main stayed red.
2. **full-e2e step (main-push-only) red since ≤8dc96cd:** stale selectors (`.effect-rack__item`, phase-0a title expectations). Fix candidate: selector migration effect-rack→device-chain in `full-journey.spec.ts` + `effect-chain.spec.ts` (new packet).
3. **Amended merge gate (rule 8 correction):** PR CI green + main `smoke` job green; sidecar + full-e2e tracked as the standing-red items above until their fixes land.

**New findings filed:**
- 3 effects render NO visible change at defaults (pre-existing, bisected to main): `fx.cellular_pixel_sort`, `fx.reaction_mosh` (suspect #166's pde_steps 3→1), `fx.temporal_dispersion` — PFX.2-class follow-ups.
- Latent bug fixed in #167: `newProject` called the no-arg legacy `removeSampler()` (silent no-op) — samplers survived New Project.
- Transient "Frame render failed" toast at app startup before engine connect (seen in smoke evidence; frame renders fine after) — minor, worth a startup-race look.
- PUX.1's hex-ratchet caught its first real catch pre-merge: #178 introduced 3 new `#4ade80` (drop-zone styles) — tokenized during the #179 rebase, ceiling held at 9.

**Process amendments (EXECUTION-PLAN contract riders):**
- **Rule 12 — stacked PRs:** a PR whose base is another PR's branch reads CONFLICTING after the base squash-merges; retarget to main (`gh pr edit N --base main`) and nudge CI with an empty commit (base-edit alone does not trigger `synchronize`). #158/#160 both hit this.
- **Rule 13 — force-push prohibition workaround:** local hooks block ALL force-pushes; the rebase steps in merge packets are executed as merge-equivalence instead (merge main into the PR branch, resolve to the rebase-verified tree, prove `git rev-parse HEAD^{tree}` equality, fast-forward push). Tree-hash equality is the evidence standard.
- **Rule 14 — executor merge authority:** packet executors NEVER merge any PR, including unblocking dependencies (one executor merged #178 to unblock itself — outcome harmless, instruction tightened).

**Canonical plan sources** (source-of-truth order per master sequence):
1. `~/.claude/plans/entropic-creatrix-MASTER-SEQUENCE-2026-06-04.md` — live truth for sequence + status
2. `~/.claude/plans/entropic-synth-paradigm-vision.md` — ~30 PRDs, Tiers 0–7, gates (some orderings overtaken by events)
3. Specs: `~/.claude/plans/entropic-spec-{1..7}-*.md` (crosswalk · B4-lite schema · safety gates · demo trilogy · L backbone/Q7 · .dna · spectral post-pass)
4. Build session: `~/Development/entropic-layout-mockup/{PLAN.md, INSTRUMENTS.md, INSTRUMENTS-BUILD-PLAN.md, B1-1VOICE-SAMPLER-PLAN.md, PR-INJECTIONS.md, DECISIONS.md}`
5. PR-B detail: `~/.claude/plans/entropic-PR-B-plan-2026-06-05.md` · B2-lite: `~/.claude/plans/entropic-B2-performance-track-sampler-2026-06-05.md`
6. Legacy v2 roadmap: `~/Development/entropic-v2challenger/docs/addendums/POST-V1-ROADMAP.md` (pre-paradigm — needs reconciliation, see Gap G6)

---

## 1. What "feature complete" means (two targets)

- **FC-v3 — "Playable instrument paradigm"** = Tiers 0–4 done: PR-A/B/C sweep, demo trilogy in-app, instrument ladder B1–B10, inspector surfaces, plus v2 debt cleared. **≈ 160–320h** of build remaining (itemized: PR-B 8–14 + PR-A 9–12 + PR-C 14–18 + instruments 131–199, before inspector surfaces, demo drawer, and v2 debt — CTO-reviewed sums).
- **FC-vision — full synth-paradigm** = FC-v3 + Tiers 5–7 (latent L-axis features, `.dna` ecosystem, Genoscope, plugin SDK). **order-of-magnitude only: +250h floor** (Tier 6/7 items are unsized research-class), with Tier 5 hard-gated on the Q7 REAL benchmark verdict. CTO recommendation: treat FC-v3 as the real ship target; gate Tier 7 (plugin SDK/quotas/signing) on "a second user exists", not just tier order — building plugin signing for an audience of one repeats the over-build the project rejected when it dropped migrations. Decision is the user's.

---

## 2. Status ledger — built ✅ / in flight 🔄 / not built ❌

Legend: ✅ = merged to `origin/main` · 🔄 = open PR, parked draft, or partially shipped · ❌ = not started (plan only). Every 🔄 names its PR.

### Sweep PRs (PLAN.md ladder)
| Item | Status |
|---|---|
| PR-zero per-track chains | ✅ [#116](https://github.com/nissimdirect/entropic-v2challenger/pull/116) |
| PR-A layout redesign | ❌ — attempt [#154](https://github.com/nissimdirect/entropic-v2challenger/pull/154) closed as waste; "evolve EffectBrowser in place" |
| PR-B data-model break | 🔄 — slices 1/2/3a ✅ MERGED 2026-06-11 ([#157](https://github.com/nissimdirect/entropic-v2challenger/pull/157)/[#158](https://github.com/nissimdirect/entropic-v2challenger/pull/158)/[#160](https://github.com/nissimdirect/entropic-v2challenger/pull/160)); **3b BPM split / 3c composite-as-effect / 3d export parity ❌** (Phase 2) |
| PR-C operators + Kentaro | ❌ |
| PR-D rebrand → Creatrix v3.0.0 | ✅ [#120](https://github.com/nissimdirect/entropic-v2challenger/pull/120) — residue ❌ incl. a REAL BUG: split-brain runtime dir (`logger.ts`/`pop-out-window.ts` still write `~/.entropic` while backend + diagnostics path-validation use `~/.creatrix` — electron-main.log unreadable via in-app diagnostics IPC); plus `ENTROPIC_DIR` const + repo/dir names. PD.10 fixes with one-time migration |

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
| B1 1-voice Sampler | ✅ core [#153](https://github.com/nissimdirect/entropic-v2challenger/pull/153) + mount [#155](https://github.com/nissimdirect/entropic-v2challenger/pull/155) + persistence ✅ [#156](https://github.com/nissimdirect/entropic-v2challenger/pull/156) (B1 global shape superseded same-day by #167's track-keyed `instruments`; legacy saves drop-with-toast) |
| B2 voice spine / Performance Track | 🔄 — B2-lite ✅ MERGED [#167](https://github.com/nissimdirect/entropic-v2challenger/pull/167) 2026-06-12; full voice spine (polyphony/FSM) ❌ |
| B3 full sampler · B4 sample rack · B5 grouping | B3 ✅ (loop/scrub/rgb/glide/melodic, [#233](https://github.com/nissimdirect/entropic-v2challenger/pull/233) + predecessors) · B4.1 channel summing ✅ [#234](https://github.com/nissimdirect/entropic-v2challenger/pull/234) · B4.2 macros ✅ [#235](https://github.com/nissimdirect/entropic-v2challenger/pull/235) · B4-export parity ✅ [#236](https://github.com/nissimdirect/entropic-v2challenger/pull/236) · B4-editor (creation + RackDevice + pad trigger) 🔄 · B5 ❌ |
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
| Q7 L-backbone benchmark | 🔄 machinery (22 parked drafts [#117–#145](https://github.com/nissimdirect/entropic-v2challenger/pulls), gh-verified 2026-06-11) · **REAL verdict ❌ USER-BLOCKED** (mock verdict only) |
| Demo trilogy | 🔄 MP4s ✅ rendered to `~/.entropic/demos/` · Demos Drawer / onboarding / D-PB paint ❌ (gated on PR-A) |

### Selection / Masking / Alpha (MK — docs/roadmap/packets/masking.md, merged #204/#205)

**Masking (MK) workstream integrated 2026-06-12 — Phase 2.5 slot, supersedes PD.5/task#45.**

| Item | Status | Notes |
|---|---|---|
| **MK.3 — Universal mask-routing wrapper (per-device + per-chain)** | ❌ **HEADLINE** | C4's spatial twin; orphaned `container.py:58/:130–133` seam activated; per-device `maskRef` + per-chain `chain_mask`; invertible. Opus. |
| MK.1 — Matte data model, budget, cache, persistence | ❌ | Start-now parallel-safe (no engine deps); greenfield `backend/src/masking/`; schema both sides of IPC; SG-8 registered |
| MK.2 — Per-pixel alpha in compositor path **[RISK:HIGH]** | ❌ | Single-flight owner of `compositor.py`; HARD-DEPENDS on P2.2c — **already satisfied** (SPEC GT-8: `_resolve_compositing` verified on main); extends shipped code |
| MK.4 — Rect/ellipse marquee on preview → MatteNode + delete/fill | ❌ | **Supersedes PD.5** (task #45a); depends MK.1 + MK.2 |
| MK.5 — Lasso: freehand + polygon | ❌ | Depends MK.4 |
| MK.6 — Magic wand + Select Color Range | ❌ | Depends MK.4 |
| MK.7 — Matte ops UI: invert / feather / grow-shrink / boolean editing | ❌ | Depends MK.1 |
| MK.8 — Chroma + luma key as procedural mattes, spill suppression, key params as LANES | ❌ | Depends MK.1 |
| MK.9 — Cut / copy region to new track | ❌ | **Supersedes PD.6** (task #45b); depends MK.4 |
| MK.10 — Alpha decode + export round-trip (ProRes 4444; WebM/VP9 optional) | ❌ | Depends MK.2 |
| MK.CU — CU regression suite J1–J5 (Phase A exit gate; reruns at Phase B exit) | ❌ | Gate: MK.1–MK.10 merged; joins rule-9 live-smoke rotation |
| MK.11 — Phase B: mask params as lanes + matte-as-mod-source + keyframed transforms | ❌ specced | Phase B — Tier-3/Phase-6 era; mod-source half **hard-gated on SG-5** |
| MK.12 — Subject/background dual-chain routing via local RVM | ❌ specced | Phase B — **MK.12 tool UI gate (PR-A tool-tab surfaces) NOW SATISFIED** (PR-A complete on main); buildable once Phase A merges |
| MK.13 — Tool-mode stack in browser tool tab + marching-ants overlay + mask chips | ❌ specced | Phase B — gates on PR-A; **unblocked** |
| MK.14 — SPIKE: motion-tracked masks (research deliverable) | ❌ specced | Phase B — depends MK.1 only |

### v2 debt
| Item | Status |
|---|---|
| Audio tracks | ✅ merged [#30](https://github.com/nissimdirect/entropic-v2challenger/pull/30)+[#66](https://github.com/nissimdirect/entropic-v2challenger/pull/66) but flag default-OFF · bake ❌ · PR-4 un-flag + audio auto-extract (task #46) ❌ |
| Gain meter | phases 1–2 ✅ [#102](https://github.com/nissimdirect/entropic-v2challenger/pull/102)/[#105](https://github.com/nissimdirect/entropic-v2challenger/pull/105); task #47 CLOSED (spec task); open implementation = task #35 (per-track metering + dB readout; current AudioTrackMeter shows master on every track) ❌ |
| Region-select preview (task #45) | ❌ **SUPERSEDED by MK.4/MK.9** — absorbed into masking workstream Phase A (see MK section above) |
| Hotkey discoverability | [issue #65](https://github.com/nissimdirect/entropic-v2challenger/issues/65) CLOSED 2026-05-15 with 6 surfaces unshipped — PD.8 reopens-or-supersedes; the WORK remains 🔄 ([#64](https://github.com/nissimdirect/entropic-v2challenger/pull/64)/[#68](https://github.com/nissimdirect/entropic-v2challenger/pull/68) done) |
| Cross-modal v1.1 F1–F4 | ❌ — plan merged ([#36](https://github.com/nissimdirect/entropic-v2challenger/pull/36)), zero implementation |
| Bug fixes in stale open PRs | ✅ ALL DISPOSITIONED 2026-06-12 — #101→merged [#175](https://github.com/nissimdirect/entropic-v2challenger/pull/175) · #103 closed (superseded by #100) · #108 closed (mutex commit 5ef6e1c excluded from #178; re-pick directly if relay races recur) · #109→merged [#178](https://github.com/nissimdirect/entropic-v2challenger/pull/178) |

---

## 2.5 Locked decisions (user-approved 2026-06-11)

1. **Cross-modal F1–F4 (resolves G6/PD.9):** F1 datamosh sequencer + F4 chord modulator SUPERSEDED by B8/B9 (do not build; F1 may be revived as a standalone demo only on explicit user ask). F2 motion-angle mod source FOLDS INTO Phase 4 (operator family). F3 macro device FOLDS INTO Tier 3 (vision-B2/B4-full).
2. **53 transitions (resolves PD.13):** SCHEDULED post-B5 as a content sprint (own packet file; first 3 establish the pattern, remainder = batch Haiku/Sonnet work).
3. **Tier 7 DEMOTED to if-ever**, gated on "a second user exists." `.dna` (Tier 6) survives but SIMPLIFIED: JSON + schema lints only; Ed25519 signing + SG-9 quotas dropped until distribution is real.
4. **Q7 stays parked** (user: "benchmark run is later"). Tier 5 mechanically closed via the G-CHECK.
5. **PR #168 merges before campaign start** (done). PUX-before-PR-A ordering CONFIRMED (tokens land first, visual change is early). 3c no-migration CONFIRMED — no existing project files matter.

## 3. Campaign safety protocol (MANDATORY for autonomous orchestration)

Adopted from the 2026-06-11 /review pass (CTO: CONDITIONAL GO · Red Team: 9 tigers). These are mechanical gates, not advice — the orchestrator executes them.

1. **Tick preamble (step 0 of EVERY orchestration cycle):** re-read the user's original ask + this section; run `gh pr list --repo nissimdirect/entropic-v2challenger --state open --json number,title` and `git log origin/main --oneline -10`; `diff -q` each repo `docs/roadmap/` file against its local original (`~/.claude/plans/`, `~/Development/entropic-layout-mockup/`) — divergence → STOP and resync before building. The §0 snapshot is advisory; never build from it without re-derivation.
2. **Exit criteria are artifacts:** every packet/phase completion = a named artifact with a measurable property (file exists, test passes with named behavior, UI renders). Never "N PRs opened" (Q7-incident rule, `feedback_verb-ask-deliverable-is-the-result.md`).
3. **Main always releasable:** a phase may stop ONLY at green, shippable main. That is the safe-stop definition for every phase.
4. **Q7 gate is a file-property test.** The canonical gate is `packets/phase-7.md` G-CHECK, quoted verbatim:
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
   The mock was renamed `q7-report.MOCK.json` with `mock:true` embedded (2026-06-11) — an agent finding only the MOCK file must treat the gate as CLOSED.
5. **One agent = one fresh worktree**, pruned after merge. Existing-worktree pruning requires the 6-check audit first.
6. **PR-A constraint travels with the task** — every PR-A packet embeds verbatim: "Modify EffectBrowser.tsx and existing components IN PLACE. Creating a new parallel shell/browser/panel component is an automatic FAIL (PR #154 precedent)."
7. **Audio un-flag requires bake evidence:** no agent flips `EXPERIMENTAL_AUDIO_TRACKS` default without the 1-week user-facing bake being documented.
8. **Ledger correction protocol:** any agent that finds this doc wrong (vs live GitHub/repo) fixes the doc in the same PR as its work and notes the correction in the PR body.
9. **Model routing (work savvier, not harder):** Fable = orchestration, packet generation, RISK:HIGH packets, adversarial merge review only. Sonnet = default packet executor. Haiku = mechanical packets (renames, doc syncs, test-only packets, worktree hygiene). Batch text work (classifying findings, summarizing logs, format conversion) → `mcp__llm-router__llm_delegate` / Gemini, never a frontier model. Every packet carries its model tier; executors may escalate one tier with a one-line justification, never silently.

## 4. Phased roadmap

### Phase 1 — Drain the frontier (≈1–2 sessions) — ✅ DRAINED 2026-06-12 (P1.0–P1.5 complete; P1.6 awaiting user confirmation on the deletion list; P1.7 blocked on the parallel session's dirty checkout). UE.1–UE.7 (Phase-1-adjacent) ALL shipped same session; PUX.1 in final merge. See §0.1.
The 7 active PRs are the live edge; nothing has merged since June 5.
- Merge the PR-B slice stack: [#157](https://github.com/nissimdirect/entropic-v2challenger/pull/157) (automation unify) → [#158](https://github.com/nissimdirect/entropic-v2challenger/pull/158) (B4-lite axis binding = INJ-5 wiring) → [#160](https://github.com/nissimdirect/entropic-v2challenger/pull/160) (export determinism 3a)
- [#156](https://github.com/nissimdirect/entropic-v2challenger/pull/156) B1 sampler persistence (coordinate with B2-lite breaking change), [#164](https://github.com/nissimdirect/entropic-v2challenger/pull/164) BPM persistence fix, [#167](https://github.com/nissimdirect/entropic-v2challenger/pull/167) B2-lite performance track, [#146](https://github.com/nissimdirect/entropic-v2challenger/pull/146) Grid Moire v2
- Disposition the 5 stale May PRs: [#101](https://github.com/nissimdirect/entropic-v2challenger/pull/101) (Escape-deselect bug fix — real open bug), [#103](https://github.com/nissimdirect/entropic-v2challenger/pull/103) (zero-default hint; check reverted files), [#108](https://github.com/nissimdirect/entropic-v2challenger/pull/108) (ZMQ REQ mutex), [#109](https://github.com/nissimdirect/entropic-v2challenger/pull/109) (timeline drag-reorder), [#67](https://github.com/nissimdirect/entropic-v2challenger/pull/67) (docs)
- **Binary-green baseline:** fix or skip-with-comment the 4 failing vitest tests so the campaign starts from green; record the exact command + expected count in this doc.
- **Canonical checkout:** return `~/Development/entropic-v2challenger` to `main` (currently parked on `docs/torn-edges-solutions` — the multi-session branch-switch hazard).
- Hygiene: live worktree count is **58** (not ~19) — prune only with the per-worktree 6-check no-source-declared-dead audit; cron `b3c47f1c` confirmed absent from crontab (2026-06-11) — no action.

### Phase 2 — Finish PR-B (≈8–14h remaining)
Per `~/.claude/plans/entropic-PR-B-plan-2026-06-05.md`: 3a ✅ (#160 once merged) · **3b BPM split** (`bpm` vs `effectiveBpm`, fixes BPM-never-hydrated) · **3c Composite-as-effect** — the 36-file v3 data-model break (terminal-effect validator, removes `Track.opacity`/`blendMode`; plan says fresh session + `/qa-redteam` required; **must land as ONE atomic PR including a legacy-project load test** — no half-landed state may persist on main) · **3d full export parity** (operators/automation/sampler/multi-track in export).

### Phase 3 — PR-A layout redesign (9–12h plan estimate; the big unopened one)
`~/Development/entropic-layout-mockup/PLAN.md` §3. Approach reset after [#154](https://github.com/nissimdirect/entropic-v2challenger/pull/154) was closed as waste — **evolve `EffectBrowser.tsx` in place**, no parallel shell. Contents: CSS-grid layout shell + 4 drag handles, 5-tab browser (fx/op/composite/tool/instruments), polymorphic inspector (8 states), hover-help (WCAG 1.4.13, <8ms@200 targets gate), Ableton-style hotkeys, **INJ-4** (Sampler entry in instruments tab). Unlocks: Demos Drawer + first-launch onboarding (demo trilogy MP4s already rendered to `~/.entropic/demos/`, spec `~/.claude/plans/entropic-spec-4-demo-trilogy.md`), I3 inline-probe frontend, B2-lite drag UX. Also closes legacy UX debt F-0512-11 + effects-panel-height (`docs/plans/2026-05-14-upcoming-ux-items.md`).

### Phase 4 — PR-C operators (14–18h)
`PLAN.md` §5: operators surfaced in browser, `kentaroCluster | sidechain | gate | midiEnvStutter`, Kentaro 8-LFO cluster with react-xyflow topology graph (60fps@32-paths gate, bare-SVG fallback). Reference: `memory/reference_kentaro-suzuki-m4l.md`. Blocks B9 only — CTO note: PR-C may slide to just-before-B9 (with the SG-5 cherry-pick) to deliver B2–B8 value ~2 sessions sooner.

### Phase 4.5 — Tier 3 (stub; JIT-expand at phase boundary)
vision-B2 cross-modal matrix · vision-B3 mod-as-track · B4-full binding rules · SG-H2 FD-management · E5 Launchpad bridge cherry-pick ([#145](https://github.com/nissimdirect/entropic-v2challenger/pull/145), branch `feat/q7-e5-midi-learn`). No packets exist yet by design — see the **Tier-3 stub row in `EXECUTION-PLAN.md` §5**; P5b.24/P6.10/P7.14 dependencies resolve there.

### Phase 2.5 — Masking Phase A (MK.1–MK.9 + MK.CU)
Per `packets/masking.md` + `SELECTION-MASKING-SPEC.md` (§14 decisions D1–D7 LOCKED). Ground truth: alpha already carried end-to-end (SPEC GT-1), keys shipped-but-dark (SPEC GT-3) — Phase A is largely activation. Masking enters the execution queue directly after Phase 2 completes.

**Sequencing rules (ground-truth verified, SPEC §2):**
- **MK.1** (matte model, `backend/src/masking/` greenfield) — start-now **parallel-safe**; no engine deps; can run concurrent with Phase 2 cleanup.
- **MK.2** (per-pixel alpha compositor) — single-flight owner of `backend/src/engine/compositor.py` (SPEC §0); **HARD-DEPENDS on P2.2c** (composite-as-terminal-effect) — **already satisfied**: `_resolve_compositing` verified live on main at `compositor.py:102` (SPEC GT-8 ledger-correction; ROADMAP §2's "3c ❌" row is stale — the code shipped in the P2.2c-equivalent merge). MK.2 extends live code; single-flight on `compositor.py` still applies.
- **MK.3** (universal mask-routing wrapper — the **HEADLINE**) — depends MK.1; single-flight on `backend/src/zmq_server.py` dispatch. `container.py:58/:130–133` seam orphaned and ready; this is C4's spatial twin.
- **MK.4/MK.9** — **absorb PD.5/PD.6** (task #45a/45b); do not double-build.
- **MK.12 (Phase A subset: split-by-matte)** — the PR-A tool-tab gate is **NOW SATISFIED** (PR-A complete on main); buildable once Phase A merges; full RVM figure-matte port slots in Phase B.
- **MK.CU** (J1–J5 computer-use regression suite) — Phase A exit gate; activates once MK.1–MK.10 are merged; joins the §3 rule-9 live-smoke rotation thereafter.

**Phase B (MK.11–MK.14 + full MK.12)** — mask-params-as-lanes, keyframed matte transforms, full RVM figure matte, tool-mode banner — slots with the **Tier-3 / Phase-6 era**. MK.11 mod-source half **hard-gated on SG-5**.

### Phase 5 — Instrument ladder Tier 4 (≈131–199h itemized, the bulk of FC-v3)
`~/Development/entropic-layout-mockup/INSTRUMENTS-BUILD-PLAN.md`. B1 ✅ core+mount; B2-lite in flight (#167).
**B2** voice spine/polyphony/FSM (10–14h, needs PR-B) → **B3** full sampler: loop/scrub/slice/melodic (8–10h) → **B4** sample rack + 8 macros (12–16h) → **B5** grouping/composite-tree (10–14h) → **B6** Frame-Bank wavetable (12–18h; SG-8 ✅ lib but needs live wiring) → **B7** RIFE optical-flow morph (15–25h; SG-1 ✅ but real Metal binding deferred) → **B8** Granulator — the headline (40–70h; needs **SG-3, unmerged**) → **B9** tensor mod-routing + Y-as-time (14–18h; needs PR-C + **SG-5, unmerged**) → **B10** live performance affordances (10–14h). Namespace footgun: vision-B4 (binding rules) ≠ Creatrix-B4 (sample rack).
**D2/D3/C9 disposition:** D2 heterodyning / D3 wavetable-mask + C9: JIT-expand with the Tier-4 ladder; stubs live in `EXECUTION-PLAN.md` §5 — not lost, just not pre-authored.

### Phase 6 — Tier 2b field params + routing surfaces
**C2** Frame-as-Parameter-Lane (L) · **C3** Per-Pixel Parameter Fields w/ Metal codegen (L) — these two deliver the *actual* per-scanline render unlock that #158 deferred · **I2** Routing Canvas ⌘⇧I (L; backend graph in draft [#142](https://github.com/nissimdirect/entropic-v2challenger/pull/142), cherry-picked via Phase-5b P5b.6) · **I1** Inspector Track (M; draft [#140](https://github.com/nissimdirect/entropic-v2challenger/pull/140)). **SG-5 owned by Phase-5b Track C (P5b.6–8, startable now); Phase 6 keeps only E5 ([#145](https://github.com/nissimdirect/entropic-v2challenger/pull/145)) deferred-to-tier.** **Cherry-pick only, never raw-merge** — stale merge-base hazard (`memory/feedback_cherry-pick-stale-scaffold-branches.md`).

### Phase 7 — Tier 5 latent (XL, **hard-gated on Q7 REAL verdict — user action**)
**Correction (2026-06-11 ground-truth check): the benchmark harness is NOT on main** — `backend/scripts/q7_benchmark/` exists only in the parked q7 drafts (22 open, gh-verified). **The runnable 3-head harness lives at `~/Development/entropic-q7-clap` (branch `feat/q7-clap-lit`, PR [#132](https://github.com/nissimdirect/entropic-v2challenger/pull/132)); `entropic-q7-bench` is scaffold-only.** P7.0: the user runs it from that worktree FIRST (~30–45 min, python3.12 venv, CLAP download); harness extraction to main (P7.1–P7.3) happens after GO. Mock verdict exists but is quarantined as `~/.entropic/q7-report.MOCK.json` and is explicitly not acceptable (spec `~/.claude/plans/entropic-spec-5-l-backbone.md` §9; 8 thresholds). If GO: cherry-pick L-worker ([#127](https://github.com/nissimdirect/entropic-v2challenger/pull/127)), CLIP/CLAP ([#131](https://github.com/nissimdirect/entropic-v2challenger/pull/131)/[#132](https://github.com/nissimdirect/entropic-v2challenger/pull/132)), download UX ([#138](https://github.com/nissimdirect/entropic-v2challenger/pull/138)) → then C5/C6/C8/D4/E1/E6. **SG-3/SG-8 wiring owned by Phase-5b Tracks A/B (P5b.1–P5b.5), schedulable pre-verdict; Phase 7 verifies green** (P7.6/P7.7a–c are verify-only stubs). If NO-GO: ship FC-v3 without L-axis (documented fallback).

### Phase 8 — Tier 6: `.dna` + Genoscope (2XL)
**E2** `.dna` patch format + 5 CI lints + SG-2 budget descriptor (spec `~/.claude/plans/entropic-spec-6-dna-format.md`; draft [#139](https://github.com/nissimdirect/entropic-v2challenger/pull/139)) · **SG-6** cancellation · **A2 Genoscope + E8 vibe-to-patch** (research-class).

### Phase 9 — Tier 7: ecosystem (2XL)
**SG-9** plugin quotas + Ed25519 signing · **E7** Plugin SDK · hardware partnerships beyond Launchpad.

### Parallel track — v2 debt (independent of tiers, schedulable anytime)
1. **Audio tracks un-flag**: `EXPERIMENTAL_AUDIO_TRACKS` still default-OFF; PR-4 (flag removal + singleton-bed deletion + **source-audio auto-extract = task #46**) gated on a 1-week user bake that has never started (`memory/entropic-audio-tracks.md`).
2. **Feature-request tasks**: #45 region-select on preview, #46 audio extraction, #35 per-track metering + dB readout (supersedes #47, which is CLOSED as a spec task; phases 1–2 ✅ [#102](https://github.com/nissimdirect/entropic-v2challenger/pull/102)/[#105](https://github.com/nissimdirect/entropic-v2challenger/pull/105)).
3. **Hotkey discoverability epic** ([issue #65](https://github.com/nissimdirect/entropic-v2challenger/issues/65)): 6 unchecked surfaces in `docs/plans/2026-05-14-upcoming-ux-items.md`.
4. **Cross-modal v1.1 F1–F4 decision** (see Gap G6).
5. **Split-brain runtime dir (REAL BUG)**: `logger.ts`/`pop-out-window.ts` still write `~/.entropic` while backend + diagnostics path-validation use `~/.creatrix` — electron-main.log unreadable via in-app diagnostics IPC; PD.10 fixes with one-time migration. Remaining rename residue: `gh repo rename`, dir rename, `ENTROPIC_DIR` const, memory slugs.
6. **F-0514-8** av/cv2 dylib warning (packaging, deferred to v1.1) · F-16 narrow-fix (disposition = PD.17 rider on PD.11, `packets/parallel-track.md`).
7. **User-expectation P1 features** (MISSING-FUNCTIONS §1 items #1–#6+#8: snapping, ripple edit, marquee select, Save As + backups, media relink, still-frame export, clip rename/color) — `packets/user-expectations.md` **UE.1–UE.7**, schedulable Phase-1-adjacent (depend on P1.0 only). Item #7 transitions tier decision = **PD.13**; full 26-item §1 disposition = **PD.14**; internal-orphan wire-or-delete = **PD.15**; POST-V1-ROADMAP fold/supersede = **PD.16** (extends PD.9/G6).

---

## 5. Gap register

| # | Gap | Severity | Evidence |
|---|---|---|---|
| **G1** | **Q7 REAL benchmark verdict never produced** — the only hard user blocker; gates all of Tier 5. 22 parked draft PRs of machinery exist; the deliverable (verdict file from a real run) doesn't. | 🔴 blocks Tier 5 | master sequence §6/§11; `memory/feedback_verb-ask-deliverable-is-the-result.md` |
| **G2** | **PR-A never opened.** One attempt (#154) closed as waste; "evolve EffectBrowser in place" direction set but no execution since. Blocks INJ-4, B1/B2-lite UX, demo Drawer, onboarding, I3 frontend. | 🔴 blocks Tiers 1/4 UX | `PLAN.md` §3; `memory/feedback_read-existing-component-before-parallel-build.md` |
| **G3** | **SG-3 (NaN sentinel) + SG-5 (dynamic cycle detection) unmerged** — drafts [#133](https://github.com/nissimdirect/entropic-v2challenger/pull/133)/[#144](https://github.com/nissimdirect/entropic-v2challenger/pull/144); block B8 Granulator (the headline instrument) and B9 tensor routing. SG-1 Metal binding + SG-8 live wiring also deferred. SG-6/SG-9/SG-H1-3 not started. **SG-H disposition:** SG-H1 (probe recording-to-disk policy) rides along with the I1 probes — P6.8 files its issue rather than improvising disk writes; SG-H2 (FD-management) = packet stub in the EXECUTION-PLAN §5 Tier-3 row; SG-H3 (echo-suppression seam) ships in P5b.25. SG-4's residue (runtime-starvation tests) = P7.5, moot on Q7 NO-GO via P7.0N. | 🟠 | `entropic-spec-3-safety-gates.md`; INSTRUMENTS-BUILD-PLAN §5; `packets/{phase-5b,phase-6,phase-7}.md` |
| **G4** | **PR-B half-done**: 3b BPM split, 3c composite-as-effect (36-file break), 3d export parity remain; the per-scanline `domain='y'` render unlock was deferred out of #158 to C2/C3 — so Tier-1 "paradigm becomes felt" is schema-true but not yet *visible* in renders beyond the demo MP4s. | 🟠 | `entropic-PR-B-plan-2026-06-05.md` |
| **G5** | **22 parked q7 draft PRs** ([#117–#145](https://github.com/nissimdirect/entropic-v2challenger/pulls), gh-verified 2026-06-11) are **reference implementations, not turnkey payloads** — main has absorbed schema changes (#148/#152, spectral family) they predate. Re-derive against current main; run a viability probe (merge-base distance + conflict count) before scheduling; raw merge falsely reverts merged work. Unextracted: SG-3, SG-5, .dna, I1/I2/I3, CLIP/CLAP/L-worker/bench chain, download UX, E5, demo-trilogy runner. | 🟠 process hazard | `memory/feedback_cherry-pick-stale-scaffold-branches.md`; master sequence §13 |
| **G6** | **Two roadmaps never reconciled**: Cross-Modal v1.1 plan (F1 datamosh sequencer, F2 motion angle, F3 macro device, F4 chord modulator — merged plan [PR #36](https://github.com/nissimdirect/entropic-v2challenger/pull/36), never built) and `docs/addendums/POST-V1-ROADMAP.md` (Phases 12–19) both predate the synth-paradigm master sequence and are absent from it. Decide: fold in (F3 ≈ vision B2/macros; Phase 14 ≈ C7/B2), or formally supersede. | 🟠 scope ambiguity | `memory/entropic-cross-modal.md`; `docs/addendums/POST-V1-ROADMAP.md` |
| **G7** | **Audio tracks shipped but dark**: full chain merged (#30+#66) yet flag default-OFF, bake never started, PR-4 (un-flag + audio auto-extract) unscheduled. | 🟠 | `memory/entropic-audio-tracks.md`; env-var read `_experimental_audio_tracks_enabled()` at `zmq_server.py:51–54` |
| **G8** | **Open bugs**: F-0514-5 Escape-deselect (fix waiting in open [#101](https://github.com/nissimdirect/entropic-v2challenger/pull/101)), F-0516-7 hint badge ([#103](https://github.com/nissimdirect/entropic-v2challenger/pull/103), files may have been reverted — rebase check), ZMQ REQ mutex ([#108](https://github.com/nissimdirect/entropic-v2challenger/pull/108)), F-0514-8 dylib warning, F-16. | 🟡 | `memory/entropic-uat-may14.md` |
| **G9** | **Demo trilogy not in-app**: MP4s rendered, but Demos Drawer / first-launch ritual / D-PB paint affordance all gated on PR-A; demo asset licensing unsourced. | 🟡 | `entropic-spec-4-demo-trilogy.md`; `~/.claude/plans/demo-trilogy-stubs/` |
| **G10** | **B2-lite supersedes #155 button UX** per user correction (drag sampler → MIDI track → drag video); #156 persistence must coordinate with #167's breaking change. | 🟡 | `entropic-B2-performance-track-sampler-2026-06-05.md` |
| **G11** | **External user-testing resolved "NONE"** (sole-tester) — contradicts vision §9/§11 founder-bias mitigation. Standing tension; revisit at Tier 4 milestone. | 🟡 strategic | master sequence §11 vs vision §11(f) |
| **G12** | **History-buffer polish**: Gap-2 description-string convention + Gap-3 500-entry memory smoke outstanding; Gap-1/Gap-4 deliberately deferred. | 🟢 | `~/.claude/plans/entropic-history-buffer-validation.md` |
| **G13** | **Hygiene**: **58 worktrees live** (prune only with per-worktree 6-check audit); cron `b3c47f1c` confirmed dead; effect-count drift across docs (treat 214 as live); `docs/decisions/q7/` has only 4 of ~17 DEC-Q7 records on main. | 🟢 | repo-state sweep |
| **G14** | **Unnamed prerequisites**: Tier-5 total model disk/download budget unquantified (CLIP+CLAP+DINOv2 = multi-GB; only Q7's 500MB counted); B7 RIFE model weights acquisition/licensing unaddressed → **now pinned to exit-bearing steps in `packets/phase-5b.md` P5b.13 (steps 5–6); memory slice pinned in the G14 addendum below**; PR-A hover-help <8ms@200 gate needs a perf harness that does not exist yet; CI capacity for re-derived draft branches. | 🟡 | CTO review 2026-06-11 |

### G14 addendum — memory budget (pinned 2026-06-11)

All RAM math uses one denominator: **`SESSION_BUDGET_BYTES`** = session-start `psutil.virtual_memory().available` (`backend/src/safety/pressure/budget.py`, merged #161; override `ENTROPIC_Q7_BUDGET_MB`; never re-read mid-session, DEC-Q7-011). On the 16 GB Apple-silicon target that is ~10–11 GiB — never the marketing 16 GB. (budget.py's docstring says "M1"; the anchor is psutil-derived, so M4-correct.)

- **B6 Frame-Bank** — per-bank cap `min(2 GiB, 0.20 × SESSION_BUDGET_BYTES)`, halved at SG-8 stage 5 (82%); unbounded hazard: 256 slots × 4K RGBA ≈ **8.5 GiB**. Pinned in `packets/phase-5b.md` P5b.9 PINNED DESIGN (formula, decoded-frame LRU + pinned playing slots, enforce-before-decode).
- **B7 RIFE** — fp32 `rife49.pth` load + 1920-cap inference peak RSS MUST be measured before service work; **STOP if headroom (budget − app − sidecar − model peak) < 4 GiB** (P5b.13 step 5, exit-bearing script). Weights licensing = P5b.13 step 6 (exit-bearing). Pressure sheds the ONNX session at stage 6 (P5b.14).
- **B8 GPU pass** — texture pool registered to SG-8 stage 6 (85%) release; GPU-handle leak gate == 0 (P5b.28).
- **Still open under G14:** Tier-5 total model disk/download budget (CLIP+CLAP+DINOv2 multi-GB); PR-A perf harness; CI capacity.

---

## 6. Suggested execution order (next 5 moves)

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
