# UAT Plan ↔ 30-Day Build Reconciliation — 2026-07-03

**Ask:** "check the UAT plan against everything we built the last 30 days."
**Method:** enumerated all **269 PRs merged to `main` 2026-06-03 → 2026-07-03** (145 `feat`, 57 `fix`,
36 `docs`, rest test/chore/perf). Grouped the 145 feature PRs by scope, mapped each family to the
UAT plan (`UAT-PLAN-2026-07-02-live-cu.md` Stages A–K) + comprehensive audit (6 subsystems, G1–G20).
Verdict key: ✅ covered · ⚠️ partial · ❌ built-but-NO-UAT-coverage · 🔴 in-plan/PRD but NOT built.

---

## 🔴 HEADLINE GAP — the Photoshop-style left tool rail was never built

**This is the "missing icons on the side" the user reported.**
- The B3 layout redesign PRD (`docs/plans/2026-07-02-b3-layout-redesign-prd.md`, **SIGNED OFF 2026-07-02**,
  icon direction = BLOCK dir-2 LOCKED) specs "**all of it with the Block tool rail on the left**" — a
  Photoshop-style vertical tool palette.
- **L0 icon SET = BUILT** (PR #347 `feat(design): L0 — Block-style tool-icon set, 14 tools`) →
  `frontend/src/renderer/assets/tool-icons.tsx` (+ test). The 14 Block icons EXIST.
- **The left RAIL that displays them = NEVER BUILT.** `tool-icons.tsx`'s ONLY consumer is
  `EffectBrowser.tsx` — the icons appear as small glyphs inside the browser's "tool" sub-tab list, NOT
  as a dedicated vertical rail on the left edge. No `ToolRail`/`icons.svg`/`<Icon>`-rail component exists.
- **B3 packets that DID ship:** L1 design docs (#346), L2 lean header + L3 LAYER panel + L4 arrangement
  restack (#377), L0 icon set (#347), flag-on (#398). **The rail surface was never a packet that ran.**
- **UAT consequence:** Stage E (design audit) should have caught this; the live pass DID flag "missing
  icons / no side rail" (finding E-3) but the plan never had a "tool rail present + all 14 tools on the
  left" checkpoint because the rail was assumed shipped. **Recommend: build the rail (consume
  tool-icons.tsx as a left palette), add a UAT checkpoint for it.**

---

## Coverage matrix — 30-day feature families → UAT stage

| Feature family (count) | Representative PRs | UAT stage | Verdict |
|---|---|---|---|
| instruments (38) — sampler B3, rack, granulator B8, frame-bank, freeze, MIDI-learn | P5b.* #287–#295, B3.* | Stage C (C2/C3/C4) + P1-B | ✅ covered (spine + P1-B live-verified; deep journeys pending) |
| automation (17) — AA.1 curves, AA.2 drawn lanes, AA.3 LFO/audio-follower, AA.4 select/move, AA.4b transform-box, AA.6 indicator, A4 overdub | #386 #404 #407 #415 #393 #399 #394 #372 | Stage I | ⚠️ stage exists, NOT yet driven live |
| masking (13) — MK.1–13, MK.12 AI matte | #350 + MK.* | Stage F (J1–J5) + H | ⚠️ tools activate but draw UNCONFIRMED via CU (F-2); MK.13 banner unshipped |
| timeline (11) — cursor tools, T2 slip/slide, T3 lock, T5 cull | #339 #359 #374 | Stage A/D | ✅ A7c covered (range-cut noted); lock/slip pending |
| performance/hardware (8) — H-UI, H1 context, H2 banks, H6 velocity, H7 paging, controller identity | #375 #345 #351 #373 #376 #365 #361 | **no dedicated stage** | ❌ ONLY the MAP button (A7b) is in-plan; H1–H7 suite has NO UAT stage (plan line 234 says "Stage — new, add" — never added) |
| effects (7) — **Copy Machine #368, 3D Extrude+Spin #369, transitions v2 #370** | #368 #369 #370 | **none** | ❌ ZERO UAT-plan/audit mentions — built, no coverage |
| ux (6), inspector (6) | — | Stage E / audit G8 | ⚠️ partial |
| masking-AI / MK.12 (in masking) | #350 | Stage H (U1–U10) | ⚠️ stage exists, not driven |
| export/master (4+2) — M.1/M.2/M.3 Master-Out Bus | #396 #402 #403 #406 | Stage K | ⚠️ bus present (live-confirmed), isolation not driven |
| safety (4) — SG-3/5 gates | #283–#286 | audit cross-cutting gate 5 | ⚠️ not driven |
| layout (2) + design (1) — B3, L0 icons | #377 #398 #347 | Stage G + E | 🔴 rail gap (above); LayerPanel ✅ |

---

## Confirmed GAPS (ranked)

**A. In-plan / signed-off PRD but NOT built**
1. 🔴 **Block left tool rail** — icons built (#347), rail surface never built. THE user-visible gap. (above)

**B. Built but NO UAT coverage (need plan additions)**
2. ❌ **New effects — Copy Machine (#368), 3D Extrude+Spin (#369), Transitions v2 (#370)**: merged, zero
   UAT-plan/audit checkpoints. Need render + preview==export parity rows (the Stage-A parity harness
   already proven — extend it to these).
3. ❌ **Hardware mapping suite H1–H7** (#345/#351/#361/#365/#373/#375/#376): only the MAP-button existence
   (A7b) is in-plan. The full flow — focus-context → bank resolve → learn-surface → CC-records-automation
   → controller-identity persistence → velocity → bank paging — has no UAT stage. Plan line 234 explicitly
   says "Stage — new, add" and it was never added.

**C. In-plan stages NOT yet driven live (this session was budget/display-bounded)**
4. ⚠️ Stage B persistence, C2–C7 deep journeys, D chaos, F masking draw (blocked — see F-2), G restack,
   H MK.12 U1–U10, I automation-editing, J modulation/LFO, K master isolation.

**D. PRD-only, not yet built (expected — brand new)**
5. field-mapping Wave 0 (`docs/plans/2026-07-field-mapping/` — physarum, self-steering-distortion PRDs):
   PRDs only, no components yet. Correctly NOT in the UAT plan.

---

## What the live pass DID verify (2026-07-03, before display lock)
Stage A + core pipeline spine + P1-B + **preview==export parity gate = PASS** (see
`UAT-RESULTS-2026-07-03.md`). Bugs found: UAT-1 (frame-0 socket race), UAT-2 (un-triggered sampler
occludes lower track — confirmed), E-1/E-3 (LAYER-panel slider/tab overlap + no tool rail), F-1/F-2
(`q` masking hotkey blocked; mask draw unconfirmed via CU).

## Recommendation
1. **Build the left tool rail** (consume `tool-icons.tsx`) — closes the headline user-visible gap.
2. **Add UAT stages** for the new effects (parity rows) and the hardware H1–H7 suite.
3. Resume the live A–K pass (display currently locked) with the rail + new stages folded in.
