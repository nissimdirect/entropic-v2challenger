---
title: Creatrix B3 Layout Redesign — PRD + Build Plan (arrangement-is-the-layers)
status: approved-mockup / not-yet-built
created: 2026-07-02
owner: design → /eng
mockups: ~/Development/entropic-layout-mockup/challengers/{challenger-b3-arrangement.html, icon-directions.html, design-system.html}
decisions: B3 v2 layout SIGNED OFF 2026-07-02; icon direction = BLOCK (dir 2) LOCKED 2026-07-02
memory: [[project_creatrix-ux-challengers]]
---

# Creatrix B3 Layout Redesign — PRD

## 1. Problem / why

Creatrix's chrome grew feature-by-feature (masking, instruments, operators, fields, freeze)
without a unifying spatial model. The mental model the user wants is **"Ableton for video
effects" × Photoshop**: the timeline arrangement doubles as the layer stack, each track is a
compositing layer with its own blend/opacity/mask, and effects/automation nest inside the track.
The current UI scatters these across a device chain + inspector + timeline with no single
"this layer" surface.

Prototyping (8 challengers, 2026-07-02) converged on **B3 — arrangement-is-the-layers**:
- The arrangement view **IS** the layers panel — no separate layers list. Row order = z-order
  (top row renders in front). Drag a row to restack.
- **Track = Layer** is the naming law (DS §0 vocabulary).
- Twirl ▾ on a track nests its effect chain + automation lanes **inside** the track (AE model).

User correction that produced B3 **v2** (this PRD's baseline): *"too much info to squeeze into a
track header — maybe a panel that links to it on the right; just not the layer order, it belongs
to one layer."* → deep per-layer controls move OUT of the header INTO a right-dock LAYER panel.

## 2. Scope — what this builds

**IN:**
1. **Lean track headers** (~214px): name · eye (visibility) · color chip · compact `blend·opacity`
   readout chip · M/S · twirl. The chip is a glanceable readout + click-to-focus the LAYER panel.
2. **LAYER inspector panel** (right dock, above EFFECTS) — contextual to the *selected* track only:
   full blend-mode grid, opacity + fill, blending options (luma range / matte / knockout),
   transform (rotate/scale/position). Reflects selection; never lists layer order.
3. **Arrangement = layer stack**: row order = z-order; drag-to-restack; twirl nests fx + automation.
4. **BLOCK iconography**: `icons.svg` sprite, 14 tools, heavy 2.7px stroke + squared joins + solid
   fills, 24×24 currentColor. Rules: 2px safe-zone, state color from the button not the icon,
   keyboard badge bottom-right, group order TRNS/EDIT/MASK/MISC.
5. **Design System v1.2** ported to `docs/roadmap/DESIGN-SPEC.md` (extends Live Signal v1.1):
   §0 vocabulary (Track=Layer law), §5 iconography (Block), §6 components incl. track-header
   anatomy + LAYER-panel anatomy, §7 interaction states.

**OUT (explicitly not this PRD):**
- No change to the render/compositing backend — the layer model already maps to shipped
  per-track opacity/blend + masking; this is a UI reorganization, not a new engine.
- No new effects, instruments, or operators.
- Session-view / clip-launch grid (challenger A) — rejected in favor of arrangement-only.
- Separate floating Layers panel (challenger B2) — rejected ("oof this is worse").
- Opacity-draggable-in-header — deferred; the chip opens the LAYER panel (revisit post-build).

## 3. Feature-complete definition

A user can: see every track as a z-ordered layer, drag to restack, read each layer's blend/opacity
at a glance in the header, select a layer and edit its full blend/opacity/blending-options/transform
in the right LAYER panel, twirl a track to reveal + edit its nested effects and automation, and do
all of it with the Block tool rail on the left — with zero regression to existing timeline/masking/
instrument functionality.

## 4. Build plan (phased, each phase its own PR, gated on the campaign merge rules)

**Precondition:** this is behind a feature flag `F_CREATRIX_LAYOUT` (already exists per audit) so it
ships dark and flips on only after CU-UAT of the new layout.

- **L0 — Block icon sprite** · S · no deps. Generate `frontend/src/renderer/assets/icons.svg`
  from the mockup's ICONS map in Block style; a React `<Icon name>` reading the sprite; vitest
  snapshot per tool; hex-ratchet safe (currentColor only). Cheapest, unblocks the rail.
- **L1 — Design System v1.2 docs PR** · S · no deps. Port `design-system.html` →
  `docs/roadmap/DESIGN-SPEC.md` v1.2 (+ update INDEX.md). Docs-only. Canonical reference for L2–L4.
- **L2 — Lean track header** · M · dep L0. Reduce the header to the 214px lean form; move the
  blend-picker/opacity/blending-options controls OUT (they land in L3). Compact bchip readout +
  click-to-select. Vitest: header renders lean; chip reflects store blend/opacity; M/S wired.
- **L3 — LAYER inspector panel** · M · dep L2. New right-dock panel bound to `selectedTrackId`;
  reads/writes the SAME store fields the old header controls did (no new backend). Blend grid,
  opacity/fill, blending options (luma/matte/knockout — reuse existing masking store), transform.
  Vitest: panel reflects selection; edits round-trip to store + persist (guard against the F2
  persistence-drop class — round-trip test mandatory).
- **L4 — Arrangement-as-layers polish** · M · dep L2. Row-order = z-order drag-restack wired to
  the compositing order the backend already consumes; twirl nests fx + automation lanes; z-order
  badge. Vitest + one E2E journey (restack changes composite order, verified by render diff).
- **L5 — CU-UAT of the new layout** · gated on L2–L4 + flag ON in a throwaway project. Folds into
  the session's live UAT pass (Stage E design audit uses DESIGN-SPEC v1.2 as the oracle).

**Sequencing:** L0 ∥ L1 (parallel, no overlap) → L2 → {L3, L4 parallel} → L5. Single-flight on
`global.css` and any header component. Every phase: §6 verify + merge on smoke+e2e green (post-
campaign gate). RISK:MEDIUM on L3/L4 (touch the render-payload-adjacent compositing order — the
P1-B seam class; qa-redteam L4).

## 5. Test plan (before code)

- L0: sprite snapshot + `<Icon>` renders each of 14 names + no raw hex.
- L2/L3: vitest component tests with mock IPC (header lean; panel reflects+writes selection);
  **persistence round-trip** test per L3 field (mirrors F2's exhaustiveness guard — a layer's
  blend/opacity/matte/transform must survive save→reload).
- L4: vitest for restack→order; ONE real E2E (restack two layers → composite order changes,
  render-diff asserts front/back swap). This is a legit real-Electron test (keep-set for the
  pyramid task #2).
- L5: CU journey — build a 3-layer comp, restack, edit each layer via the panel, twirl+edit fx,
  export, reload → everything intact.

## 6. Risks

- **Compositing-order coupling (L4):** restack must map to the exact order the backend compositor
  consumes; get it wrong and z-order silently inverts. Mitigate: render-diff E2E, qa-redteam.
- **Persistence drop (L3):** the F2 class — new panel-edited fields must be in the save whitelist.
  Mitigate: round-trip test is a merge gate.
- **Flag divergence:** `F_CREATRIX_LAYOUT` off vs on must both stay shippable (live-runtime rule).
- **Scope creep into engine:** this is UI only. Any "we need a new blend mode / matte type" is a
  separate PRD.

## 7. Open (non-blocking)
- Opacity draggable directly in the header chip? (deferred; revisit after L3 lands.)
- Does the LAYER panel replace or coexist with the existing effect-PROPERTIES panel? (proposal:
  coexist — LAYER = the track, PROPERTIES = the selected effect within it.)
