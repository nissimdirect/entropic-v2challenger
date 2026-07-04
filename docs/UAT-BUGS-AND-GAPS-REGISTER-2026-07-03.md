# UAT Bugs & Gaps Register — 2026-07-03 (handoff-ready)

**Purpose:** every bug found + every UAT gap, structured so another session can pick any item up
cold. Each has: severity, evidence/repro, owner-hint, and the fix or checkpoint to write.
Companion docs: `UAT-COVERAGE-MATRIX-2026-07-03.md` (145 PRs mapped, 44 gap checkpoints),
`UAT-RESULTS-2026-07-03.md` (live Stage-A verdicts), `UAT-COVERAGE-RECONCILIATION-2026-07-03.md`.

---

## PART 1 — BUGS (found in the live Stage-A pass + code audit)

| ID | Sev | Bug | Evidence / repro | Fix hint |
|---|---|---|---|---|
| **TOOL-RAIL** | P1 | Photoshop-style left tool rail never built. Icons exist (`tool-icons.tsx`, 14 Block tools, PR #347) but the ONLY consumer is `EffectBrowser.tsx` — no left rail. Code comment `EffectBrowser.tsx:148` says icons are "in the tool rail under F_CREATRIX_LAYOUT" — a rail that doesn't exist. | `grep -rln tool-icons frontend/src/renderer --include=*.tsx` → only EffectBrowser. `find frontend/src -iname '*rail*'` → none. B3 PRD §3 specs the rail; no L-packet built it. | Build `ToolRail.tsx` consuming `tool-icons.tsx` + `useLayoutStore.cursorTool/setCursorTool` + `MASK_TOOL_ENTRIES`; mount left of canvas under `F_CREATRIX_LAYOUT`; mockup: `challenger-b3-arrangement.html` `.rail` (groups TRNS/EDIT/MASK/MISC). Branch `feat/l-block-tool-rail` started. |
| **UAT-2** | P1 | Un-triggered Sampler occludes lower track. Add a Sampler (MIDI track, source=clip, no note fired) → it composites its clean source OVER the effected track below, hiding that track's effect. | CONFIRMED via discriminator: muting the MIDI track brought the lower track's chromatic aberration back AND render time dropped 75ms→25ms. | Decide intent: an instrument with no note should render nothing (transparent), not paint its source. Fix in the compositor voice path (only emit a voice layer when a note is active). |
| **E-1** | P1 | B3 left-column overlap: LAYER-panel "Fill"/"Rotate" sliders render ON TOP of the EFFECTS/PRESETS/INSTRUMENTS tab strip + category list (z-order/overflow when LAYER panel + browser coexist). | Zoom-confirmed live. | CSS: give the left column proper flex/overflow so the LAYER panel and browser don't overlap; likely `creatrix-layout.css` / `b3-layout.css`. |
| **E-2** | P2 | A slider also bleeds across the INSTRUMENTS "Wavetable" rack row — same overflow family as E-1. | Zoom-confirmed live. | Same fix as E-1. |
| **F-1** | P2 | `q` hotkey does NOT activate the marquee/mask tool when an effect is the active selection context (status stays "tool: select"). Clicking the tool-tab chip DOES work. | 3 attempts live; chip path works, `q` doesn't. | The `q` keybinding is likely gated by an effect-focus guard; allow tool hotkeys when an effect is selected (or document the precedence). |
| **F-2** | P2 | Mask draw produced no marquee/marching-ants via computer-use — synthetic drag AND manual mouse-down/move/up, after toggling both preview-overlay icons. Either MaskSelectOverlay ignores synthetic PointerEvents (CU limitation) or the draw is broken. | Live, 2 methods. MK.CU J1–J5 remain UNRUN. | Needs a human-pointer retry to disambiguate; if broken, fix MaskSelectOverlay pointer handling. |
| **UAT-1** | P3 | Cold-import frame-0 render race: on every fresh import, frame-0 fires during the sidecar socket handshake → "Frame render failed" toast + console `[Render] frame 0 error: Engine error: Socket is closed` (App.tsx:1741). Recovers fully. | Live, every launch. | Gate frame-0 render on socket-ready, or suppress the toast during startup. |
| **E-3** | P3 | Minimal iconography on main (transport = Unicode glyphs ▶ ■ ⟳, racks text-only) + sub-11px fonts live in `device-chain.css` (7–8px), below DESIGN-SPEC §9 floor. | Live + static scan. | Adopt the Block icons (via the rail) + raise device-chain font floor to 11px. |

> These 8 are NET-NEW this pass. The 5 audit-register bugs (#29/#30/B7/C15/E18) already have fixes
> merged (#411/#413/#414/#412) — verify-don't-refile.

## PART 2 — GAP CLUSTERS (44 uncovered feature PRs → these UAT areas need writing)

| Cluster | PRs | What to write |
|---|---|---|
| **Hardware-mapping suite** (biggest) | H1 #345, banks #351, MIDI-learn #356, hardening #296, +H2–H7 | A new UAT stage: focus-context → bank resolve → learn-surface → CC-records-automation → controller-identity persistence → velocity → bank paging. Only the MAP-button existence is in-plan today. |
| **New effects** | Copy Machine #368, 3D Spin #369, transitions #370, grid_moire | Render + preview==export parity rows (extend the proven Stage-A parity harness). |
| **GPU render/safety** | B8 GPU #295, P6.5 Metal field #273, P6.4 SG-1 #270 | GPU-vs-CPU parity + resource-leak/degrade checkpoints (Metal Macs). |
| **Per-instrument determinism/parity** | B8 determinism #294, rack export #236, scrub-by-LFO #231, frame-bank #246–250 | Per-instrument export==preview + seeded-determinism rows. |
| **Clip papercuts + trigger-lane** | rename, drag-move, edge-snap, .bak rotation, trigger vs continuous lane | Small UI-behavior checkpoints (see matrix GAP rows). |

**Full per-gap checkpoints (all 44, with steps + oracle): see `UAT-COVERAGE-MATRIX-2026-07-03.md` §GAP CHECKPOINTS.**

## PART 3 — NOT-YET-RUN live stages (display locked mid-session)
Stage B persistence, C2–C7 deep journeys, D chaos, F masking draw (blocked, see F-2), G restack,
H MK.12 U1–U10, I automation-editing, J modulation/LFO, K master isolation. Resume when the CU
display is unlocked. Overall verdict: **INCOMPLETE — not yet GO** (spine + parity + P1-B pass; UAT-2
must be resolved).
