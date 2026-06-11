# Creatrix Documentation Index — Canonical Map

**Created:** 2026-06-11. This directory (`docs/roadmap/`) is the consolidated home for all Creatrix planning documentation that previously lived scattered across `~/.claude/plans/` and `~/Development/entropic-layout-mockup/`. Files here were **copied** (not moved) on 2026-06-11. **This repo copy is CANONICAL.** Local originals (`~/.claude/plans/`, `~/Development/entropic-layout-mockup/`) become pointer stubs at next session-close; until then the orchestration tick preamble (ROADMAP.md §3 rule 1) runs `diff -q` against them and HALTS on divergence — divergence is resolved by a human-visible resync commit, never silently.

## Authority order (when docs disagree)

1. The user's verbatim ask
2. **`ROADMAP.md`** (this dir) — current state ledger (built/in-flight/not-built), phased plan, gap register
3. **`plans/entropic-creatrix-MASTER-SEQUENCE-2026-06-04.md`** — tier/PR sequencing detail
4. **`plans/entropic-synth-paradigm-vision.md`** + `specs/entropic-spec-{1..7}-*.md` — PRD and contract detail
5. `layout-session/` docs — sweep-PR and instrument implementation detail
6. Everything under "Historical" below

## LIVE documents

| Doc | Role |
|---|---|
| `ROADMAP.md` | **Start here.** Status ledger + phased roadmap to feature-complete + gap register (G1–G13) |
| `plans/entropic-creatrix-MASTER-SEQUENCE-2026-06-04.md` | Single source of truth for build order: Tiers 0–7, P0–P9 chain, scaffold-PR disposition |
| `plans/entropic-synth-paradigm-vision.md` | The ~30 PRDs (A/B/C/D/E/I), 6-axis paradigm, Round-1 locked decisions, cuts list |
| `specs/entropic-spec-1-crosswalk.md` | Vision ↔ build-plan ownership matrix; read before touching any PRD |
| `specs/entropic-spec-2-b4lite-schema.md` | B4-lite Lane/ModEdge schema (shipped via PR #148/#158) |
| `specs/entropic-spec-3-safety-gates.md` | SG-1/3/5/8 contracts, APIs, CI tests |
| `specs/entropic-spec-4-demo-trilogy.md` | Y-is-Time · Painted-Blur · Audio-LFO-Stripes + onboarding (MP4s rendered; in-app pending PR-A) |
| `specs/entropic-spec-5-l-backbone.md` | Multi-headed L worker + Q7 benchmark gate (8 thresholds; REAL run pending — user) |
| `specs/entropic-spec-6-dna-format.md` | `.dna` format, no-regression policy, 5 CI lints (draft PR #139) |
| `specs/entropic-spec-7-post-pass.md` | A4/C4/A5 spectral family (shipped #162/#165) + SG-7 (shipped #149) |
| `layout-session/PLAN.md` | Sweep-PR ladder v1.2 (PR-zero ✅ / PR-A ❌ / PR-B 🔄 / PR-C ❌ / PR-D ✅) |
| `layout-session/DECISIONS.md` | 28 locked layout decisions |
| `layout-session/INSTRUMENTS.md` + `layout-session/INSTRUMENTS-BUILD-PLAN.md` | B1–B10 instrument ladder, SG gating |
| `layout-session/B1-1VOICE-SAMPLER-PLAN.md` | B1 detail (shipped #153/#155; UX superseded by B2-lite plan) |
| `layout-session/PR-INJECTIONS.md` | INJ-1..5 ledger (1/2/3 ✅, 4 gated on PR-A, 5 🔄 #158) |
| `plans/entropic-PR-B-plan-2026-06-05.md` | PR-B slices: 3a ✅ #160 · 3b/3c/3d remaining |
| `plans/entropic-B2-performance-track-sampler-2026-06-05.md` | B2-lite (PR #167) — supersedes #155's button UX |
| `plans/entropic-history-buffer-validation.md` | Undo/history validation; gaps 2–3 outstanding |
| `plans/entropic-P2-schema-fork-finding.md` | Resolved: backend adopts camelCase + 8-member BindingRule |
| `../PENDING-BUG-FIXES.md` | Security-audit reconciliation (M-1 ZMQ size limit still open) |
| `../V2-AUTOMATED-UAT-PLAN.md` + `../UAT-UIT-GUIDE.md` | Living UAT reference (automated + manual) |
| `../plans/2026-05-14-upcoming-ux-items.md` | Hotkey epic (6 unchecked) + layout items — items 2–3 absorbed by PR-A scope |

## NEEDS RECONCILIATION (predates synth paradigm; not yet folded into master sequence)

| Doc | Issue |
|---|---|
| `../addendums/POST-V1-ROADMAP.md` | Phases 12–19 (tempo, transitions, audio-reactive mods, beat effects, community) overlap vision PRDs; decide fold-in vs supersede (Gap G6) |
| `../plans/2026-05-04-cross-modal-features-plan.md` | v1.1 F1–F4 (datamosh sequencer, motion angle, macro device, chord modulator) — plan merged as PR #36, never built (Gap G6) |

## HISTORICAL (superseded or completed — do not plan from these)

| Doc | Status |
|---|---|
| `../MASTER-UAT-AND-BUILD-PLAN-2026-04-10.md` | Superseded by `../audits/2026-04-16-state-of-union.md` |
| `../audits/2026-04-16-state-of-union.md` | Accurate as of 2026-04-16 (v2 era); superseded by `ROADMAP.md` for current state |
| `../phases/PHASE-0A..12` | v2 build history, complete |
| `../plans/sprint-2B-*.md`, dated phase/effect plans | Executed |
| `~/.claude/plans/entropic-uat-{routes,COMPREHENSIVE,FINAL-SYNTHESIS}*.md`, `entropic-2026-05-17-non-cu-and-cu-queue.md` (local) | May UAT campaign, closed 298/304 ✅ (residue: tasks #45/#46/#47, PRs #101/#103) |
| `~/.claude/plans/calm-conjuring-sunrise.md` (local) | Audio-tracks plan — shipped #30/#66; PR-4 remains (see ROADMAP parallel track) |

## Architecture & contracts (unchanged, still authoritative)

`../PRD.md` · `../UX-SPEC.md` · `../ARCHITECTURE.md` · `../SIGNAL-ARCHITECTURE.md` · `../DATA-SCHEMAS.md` · `../IPC-PROTOCOL.md` · `../EFFECT-CONTRACT.md` · `../EFFECTS-INVENTORY.md` · `../SECURITY.md` · `../TECH-STACK.md` · `../FILE-STRUCTURE.md` · `../addendums/{COMPETITIVE-MOAT-ANALYSIS,MUSICIAN-NATIVE-FEATURES,LAYER-TRANSITIONS,COMMUNITY-ECOSYSTEM}.md` · decision records in `../decisions/q7/` (note: only 4 of ~17 DEC-Q7 records are on main; the rest live in parked q7 draft branches — extract with their tiers)
