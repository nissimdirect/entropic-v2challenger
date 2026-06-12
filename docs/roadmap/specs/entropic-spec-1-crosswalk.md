# SPEC-1 — Vision ↔ Build Crosswalk
*Written 2026-06-03 · part of spec pass before steamroll build*

> Maps every PRD in `entropic-synth-paradigm-vision.md` (this session) to every item in the Creatrix BUILD plan (`~/Development/entropic-layout-mockup/`) so the two sessions don't duplicate work. Resolves ownership, surfaces gaps, names actions.

---

## 1. Sessions in play

| Session | Locus | Output | Status |
|---|---|---|---|
| **This (Vision)** | `~/.claude/plans/entropic-synth-paradigm-vision.md` | 30 PRDs across A/B/C/D/E/I categories; 8-tier build sequence; 9 safety gates; 20 decisions locked | Round 1 closed; spec pass in flight |
| **Other (Creatrix)** | `~/Development/entropic-layout-mockup/` | PLAN.md v1.2 (5 PRs zero/A/B/C/D), INSTRUMENTS-BUILD-PLAN.md (B1–B10), B1-1VOICE-SAMPLER-PLAN.md, PR-INJECTIONS.md | Ready to start PR-zero on "go" |

Both target `~/Development/entropic-v2challenger/` → rename to `creatrix` in their PR-D.

---

## 2. Foundation infra — direct overlap

| Vision PRD | Creatrix item | Owner | Overlap | Action |
|---|---|---|---|---|
| **B1 Universal Automatability** (schema for `domain`/`direction`/`binding_rule`/`interp_mode`/`loop_mode` per lane) | PR-B: unifies automation, drops `isTrigger`, single `InterpolationMode = 'smooth' \| 'step' \| 'gate' \| 'oneShot'` | Creatrix owns the call-site refactor; Vision owns the schema additions | PARTIAL — PR-B unifies the existing automation shape but does NOT add our axis-binding fields | **SPEC-2** injects B4-lite into PR-B before lock |
| **B4-lite** (mod-edge schema `(src, src_axis, dst, dst_axis, binding_rule, depth)` with broadcast-only impl + writer-side validator) | Not in Creatrix plan | **This session** | GAP — Creatrix has `OperatorMapping` but not the cross-axis tensor schema | **SPEC-2** is the deliverable; ship as PR injection before PR-B locks |
| **B4 full (5 binding rules)** | B9 Tensor + Y-as-time (later) | Creatrix B9 | OK — converges at B9 | Confirm B9 implements `sampleAt/scanOver/integrate/painted` on top of the B4-lite schema |
| **B2 Cross-Modal Mod Matrix** (whole-audio analysis → param routing) | Their B10 has Sidechain op + Audio Amplitude op (PR-C). No formal "matrix" routing surface. | Creatrix partial; Vision owns the matrix framing | OVERLAP w/ sources, GAP on systemic matrix | Defer matrix-as-product-surface to Tier 3; B9 + PR-C operators cover the primitives |
| **B3 Modulation-as-Track-Type** | Not in Creatrix plan; `Track.type='performance'` reserved (B2 of theirs uses it) | **This session** | GAP — Performance Track is a track-type; Mod-Track-Type is a separate concept | Defer to Tier 3+; depends on B4 full ship |
| **PR-zero per-track effect chain migration** (Creatrix-only foundational refactor) | Vision assumes per-track chains | Creatrix | Vision had no PRD for this; Creatrix surfaced it as blocking | **No action — let PR-zero ship first; everything else waits on it** |
| **PR-B Composite-as-effect + BPM split + DFS cycle detection + export snapshot** (Creatrix-only) | Vision assumed cycle detection exists (PR #37 toposort) | Creatrix | PR-B upgrades toposort to RAISE (vs warn+fallback) — improves SG-5 foundation | **No action — Vision SG-5 builds on this** |

---

## 3. Inspector + routing surfaces

| Vision PRD | Creatrix item | Owner | Overlap | Action |
|---|---|---|---|---|
| **I1 Inspector Track** (1st-class track, recordable probes) | PR-A polymorphic Inspector is INFO-ONLY (no probes, no actions) | **This session** | GAP — Creatrix Inspector is a read-only side panel; I1 is a probe surface | New PRD; ships post-PR-A as additive Tier 3 work |
| **I2 Routing Canvas (⌘⇧I)** | PR-C "topology graph in device-chain tile" (Kentaro Cluster routing viz) is mini-version | Partial overlap | PARTIAL — PR-C ships a per-operator graph view; I2 is project-wide | Reuse PR-C's react-xyflow infra; expand to project-wide overlay in Tier 2 |
| **I3 Inline Probe + Action Menu** | PR-A inspector hover-help + PR-B automation expand inline | OVERLAP on surface, GAP on actions | PARTIAL — Creatrix has hover-help; doesn't have right-click→map menu | Add right-click action menu in same PR as B4-lite schema injection |

**Decision:** ship Creatrix's PR-A inspector AS Tier 1; treat I1/I2/I3 as additive extensions Tier 2+. Vision's "all three" plan still holds — Creatrix PR-A is one of the three (the info side, partial I3 hover-help).

---

## 4. Instruments

| Vision PRD | Creatrix item | Owner | Overlap | Action |
|---|---|---|---|---|
| **A1 Granulator-for-Video** (6-axis grain T/Y/X/C/F/L) | **B8 Granulator** (full design exists, gated SG-1+SG-3+SG-8) | Creatrix | DIRECT MATCH | Confirm B8 spec covers all 6 axes per vision; adopt their gate model |
| **A2 Genoscope** | Not in Creatrix plan | **This session** | GAP — research tier; Vision Tier 6 | Defer; not blocking near-term |
| **A3 Frame-Bank Oscillator** | **B6 Frame-Bank** (full design, gated SG-8 + SG-1 if flow-morph) | Creatrix | DIRECT MATCH | Adopt B6 design |
| **A4 Spectral Frame Warper** | Not in Creatrix plan | **This session** | GAP — Vision Tier 2 deliverable | Spec as new build (call it B5.5 or new PRD); ships in Tier 2 (Vision) parallel with Creatrix PR-A/B |
| **A5 Spectral Granulator** | Not in Creatrix plan (B8 is plain granulator) | **This session** | GAP — Tier 2/4 spec | Spec as variant of A1/B8 |
| **— (Creatrix-only)** | **B1 1-voice Sampler** (placeholder-killer, 7-10h) | Creatrix | NEW — Vision didn't have a Sampler PRD | Adopt as foundation for any source-based instrument; aligns with their "instruments tab" entry |
| **— (Creatrix-only)** | **B2 Voice spine + Performance Track + FSM + polyphony** | Creatrix | NEW — Vision didn't surface voice/polyphony as paradigm work | Adopt — foundation for every triggerable instrument |
| **— (Creatrix-only)** | **B3 Full Sampler** + **B4 Sample Rack + 8 macros** + **B5 Grouping / composite-tree** | Creatrix | NEW — Vision didn't have rack/macro shape | Adopt; Vision E5 hardware bridge maps to these macro destinations |
| **— (Creatrix-only)** | **B7 Optical-flow / RIFE** | Creatrix | NEW — Vision had "fractional positions when granulator ships" but no model port | Adopt — covers fractional-T support |

---

## 5. Wavetable-axes paradigm

| Vision PRD | Creatrix item | Owner | Overlap | Action |
|---|---|---|---|---|
| **C1 Scanline-as-Time** | **B9 Y-as-time** ("the cheap, felt, shippable primitive") | Creatrix B9 | DIRECT MATCH | Adopt B9's per-instrument `timeAxis: 'T'\|'Y'\|'X'` switch |
| **C2 Frame-as-Parameter-Lane** | Not in Creatrix plan | **This session** | GAP — Tier 2 vision deliverable | Spec as new build; pairs with C3 |
| **C3 Per-Pixel Parameter Fields** | B9 mentions "destinations may be scalar OR field" but flagged off | Partial overlap | PARTIAL — schema reserved, not implemented | Adopt B9's flagged-off field-dst as Tier 2 unlock |
| **C4 Spectral-Band-Isolated Effects** | Not in Creatrix plan | **This session** | GAP — Tier 2/4 vision | Spec as wrapper; pairs with A4 |
| **C5 Latent-Trajectory Modulation** | B9 supports L-axis edge in schema; latent backbones not loaded by Creatrix | Partial — Vision owns L-backbone, Creatrix owns routing | DEPENDS on SPEC-5 | Vision Tier 5 deliverable |
| **C6 Frame-as-Self-Wavetable** | B8 grain selection can read project frame (`selection: 'random' \| 'latentSimilarity' \| 'onset' \| 'scenePayload'`) | Partial | OVERLAP on self-feedback via grain selection | Adopt B8 framing; document as the v1 C6 surface |
| **C7 Audio-LFO at Video Resolution** | Free once B9 ships Y-as-time + audio-rate LFO | Creatrix B9 + LFO operator | OK | Demo-only; no separate build |
| **C8 Feedback-Through-L** | Not in Creatrix plan | **This session** | GAP — Vision Tier 5 | Defer; depends on Q7 backbone + B8 |
| **C9 Wavetable-Frames-as-Clips** | B6 Frame-Bank slots support `clipId` not just `stillId` | Creatrix B6 | DIRECT MATCH (subset of B6) | Adopt as B6 mode |

---

## 6. Latent tier + Genoscope + ecosystem

| Vision PRD | Creatrix item | Owner | Overlap | Action |
|---|---|---|---|---|
| **Q7 Multi-headed L backbone** (DINOv2 + CLIP + CLAP) | Not in Creatrix plan AT ALL | **This session** | **HARD GAP** | **SPEC-5** is the deliverable; SG-4 process isolation depends on it |
| **E1 Resynthesis-Latent Mode** | Not in Creatrix plan | **This session** | GAP — Tier 5 | Defer |
| **C5/C6/C8/D4 (latent-touching)** | Schema-reserved in B9, no backbone | Partial — Creatrix routing, Vision backbone | DEPENDS on SPEC-5 | Block until Q7 spike done |
| **A2 Genoscope** | Not in Creatrix plan | **This session** | GAP — Tier 6 | Defer; needs DINOv2 + GA infra |
| **E2 `.dna` Patch Format** | Not in Creatrix plan | **This session** | GAP | **SPEC-6** is the deliverable |
| **E3 Patch Gallery** | Out of scope (Vision decision) | — | — | — |
| **E4 Latent Recommendation** | Out of scope (Vision decision) | — | — | — |
| **E8 Vibe-to-Patch** | Out of scope (depends on A2) | — | — | — |

---

## 7. Hardware + live + demos

| Vision PRD | Creatrix item | Owner | Overlap | Action |
|---|---|---|---|---|
| **E5 Hardware Bridge (Novation Launchpad)** | **B10 Live affordances** (MIDI Learn, rate limit, panic, retro-capture) | Partial — B10 has MIDI Learn but no Launchpad template | Vision E5 fills the Launchpad-specific layer | Spec Launchpad template after B10 lands |
| **E6 Live Performance Mode** | **B10 Live affordances** ships partial (no frame-rate floor, no axis-aware degradation, no multi-output) | Creatrix B10 partial; Vision E6 is the full version | PARTIAL | Vision E6 is Tier 5 — strictly after B10 ships |
| **Demo trilogy (Y-is-Time + painted-blur + audio-LFO)** | Not in Creatrix plan | **This session** | GAP — Vision Tier 1 deliverable | **SPEC-4** is the deliverable |
| **E7 Plugin SDK** | Not in Creatrix plan | — | — | Out of scope until Tier 7 |

---

## 8. Safety gates

| Vision SG | Creatrix has it? | Owner | Action |
|---|---|---|---|
| **SG-1 GPU resource lifetime** | Listed in Creatrix as gate but UNBUILT | Either session | **SPEC-3** is the deliverable; SG-1 blocks B7 + B8 + Vision Tier 2 (C2/C3) |
| **SG-2 `.dna` resource budget** | Not in Creatrix plan | This session | Covered by **SPEC-6** |
| **SG-3 Latent NaN sentinel** | Listed in Creatrix as gate but UNBUILT | Either session | **SPEC-3** deliverable |
| **SG-4 Multi-headed L process isolation** | Not in Creatrix plan | This session | Covered by **SPEC-5** |
| **SG-5 Dynamic cycle detection** | Creatrix PR-B upgrades toposort; SG-5 = deterministic cycle-break ordering + per-tick snapshot | Either session | **SPEC-3** deliverable; B9 hard-blocked otherwise |
| **SG-6 Genoscope cancellation** | Not in Creatrix plan | Out of scope until Tier 6 | — |
| **SG-7 Codec timeout** | Listed in Creatrix as gate but UNBUILT | Either session | Lightweight; ship anytime |
| **SG-8 Memory-pressure auto-disable** | Listed in Creatrix as gate but UNBUILT | Either session | **SPEC-3** deliverable; B6/B8/B10 all hard-blocked |
| **SG-9 Plugin resource quota + signing** | Not in plan | — | Out of scope until Tier 7 |

---

## 9. PR-injections required (from PR-INJECTIONS.md)

These must land BEFORE Creatrix PR-A/PR-B lock. Coordinated, not duplicated.

| # | Injection | Goes into | Why critical for Vision |
|---|---|---|---|
| INJ-1 | Rename `Pad.mappings → Pad.modRoutes` | PR-B | Avoids collision before B4-lite schema lands |
| INJ-2 | Fix `_topological_sort` to raise + walk all edges | PR-B | SG-5 foundation; B9 depends |
| INJ-3 | `MAX_COMPOSITE_LAYERS` + composite `frame_index` guard | PR-A/B | Tier-aware safety (SG-8 precursor) |
| INJ-4 | Real "Sampler" entry in instruments tab | PR-A | B1 build entry point |
| **INJ-5 (NEW from Vision)** | **B4-lite schema fields** (`domain`/`direction`/`binding_rule`) on `Lane` + mod-edge schema + writer-side validator rejecting non-`broadcast` | PR-B | **Vision Tier 1 unlock** — without this, no axis-binding ever, no C1 demo, no I3 actions |

**SPEC-2 is the deliverable that defines INJ-5.**

---

## 10. Net ownership matrix

| Owner | Scope | Deliverables |
|---|---|---|
| **Creatrix session** | PR-zero, PR-A, PR-B (+ INJ-1/2/3/4/5), PR-C, PR-D, B1–B10 instrument builds | Their PLAN.md v1.2 + INSTRUMENTS-BUILD-PLAN.md cover this fully |
| **This session** | SPEC-1 (this doc), SPEC-2 (B4-lite schema → INJ-5), SPEC-3 (SG-1/3/5/8 contracts), SPEC-4 (demo trilogy), SPEC-5 (multi-headed L backbone), SPEC-6 (`.dna` format + CI lint), plus Tier 2 spectral PRDs (A4/C4/A5) not in their plan | This spec pass |
| **Either (coordinate)** | SG-7 codec timeout (lightweight), some Tier 2 work | Pick by capacity |
| **Out of scope** | E3 Gallery, E4 Recommendation, E7 Plugin SDK, E8 Vibe-to-Patch, A2 Genoscope (research tier), LLM co-editor, DAW sync, Eurorack | — |

---

## 11. Gaps filled (spec pass complete 2026-06-03)

| Spec | Status | File |
|---|---|---|
| **SPEC-1** Vision↔Build crosswalk | ✅ | `entropic-spec-1-crosswalk.md` (this) |
| **SPEC-2** B4-lite schema injection (INJ-5) | ✅ | `entropic-spec-2-b4lite-schema.md` (filed in Creatrix `PR-INJECTIONS.md`) |
| **SPEC-3** Safety gates SG-1/3/5/8 | ✅ | `entropic-spec-3-safety-gates.md` |
| **SPEC-4** Demo trilogy | ✅ | `entropic-spec-4-demo-trilogy.md` + stubs at `demo-trilogy-stubs/` |
| **SPEC-5** Multi-headed L backbone + SG-4 | ✅ | `entropic-spec-5-l-backbone.md` |
| **SPEC-6** `.dna` format + no-regression CI lint | ✅ | `entropic-spec-6-dna-format.md` |
| **SPEC-7** Post-pass items (A4/C4/A5/SG-7) | ✅ | `entropic-spec-7-post-pass.md` |
| **History buffer validation** | ✅ | `entropic-history-buffer-validation.md` (existing v2 impl SUFFICIENT) |

---

## 12. Coordination protocol

- This session writes SPEC-2 (B4-lite schema) BEFORE Creatrix locks PR-B → relay as INJ-5
- This session writes SPEC-3 (SG-1/3/5/8) in parallel with their PR-zero — gates aren't blocking PR-zero/A/B/C/D, only B6+
- SPEC-5 (multi-headed L) coordinates with their PR-C operator infra (L-axis edges already schema-reserved in B9) — but L-backbone loading is purely Vision territory
- SPEC-6 (`.dna`) is independent — ship anytime, separate review pass
- Creatrix session "filed issues" against PR-A/B for INJ-1/2/3/4 via PR-INJECTIONS.md → this session adds INJ-5 the same way

---

## 13. Next spec

**SPEC-2 — B4-lite schema injection (INJ-5).** Concrete TS schema additions for `Lane` + mod-edge + writer-side validator. Designed to drop into Creatrix PR-B as a single additive commit. Should be ~3-page spec doc, no implementation. Includes:

- TS types diff (before/after for `Lane`, new `ModEdge`)
- Writer-side validator pseudocode
- Backward-compat rules (existing lanes default to `domain:'t', direction:1, binding_rule:'broadcast'`)
- CI test list
- File-by-file change inventory (matches Creatrix PLAN.md §4.10 style)
- Coordination note to Creatrix session

Next cron firing should pick this up.
