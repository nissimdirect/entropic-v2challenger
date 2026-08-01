# W2 Step-0 Reconciliation — the three owner rulings that gate the Rail v12 build

> Written 2026-08-01 after the v4.1 red-team review (14 findings) and three owner
> walks. This document exists because the W2 packet set is well-crafted but sits on
> unresolved design conflicts that only the owner can rule on. **Nothing in W2
> builds until the three rulings land.** Anchors verified at the W2-preflight
> refresh (#485); re-verify against main before dispatch (W1/W1.5 waves touched
> App.tsx heavily since).

## What W2 is

The browser-folders change (banked Rail v12, ratified D10): one leftmost icon rail —
container folders on top (effects/presets/instruments/media/…), tools at the bottom —
with exclusive-accordion drawers, one search, and the sidebar's three-tab switcher
deleted (P9). It is the owner's repeatedly-stated vision: *"one strip of icons on the
left… moves you through the entire tool selection process and effect selection
process in browser."*

## Facts that changed since the spec was banked

1. **Tools already render in two places** (red-team finding 7): ToolRail.tsx
   (shipped #433/#464, left of the preview) AND EffectBrowser's [tool] tab. P4 is
   therefore a DE-DUPLICATION (delete one of two live surfaces), not a relocation.
2. **The rail spec self-contradicts** (finding 8): the banked text says "NO wells
   (rejected)" three lines before mandating "container WELLS + tool-zone inset SLAB."
   P3's STOP will fire on this exact line unless the owner rules first.
3. **Cmd+B hides the whole sidebar** (finding 6): if the tool zone moves INTO the
   sidebar rail, Cmd+B hides all 14 cursor/mask tools — a daily-workflow break the
   plan never names. This is the largest unpriced consequence in the wave.
4. **PK.2 (wave-0 embeddable PresetBrowser) is unstarted** (finding 11): P6 hard-
   depends on it and P6's own fallback STOP fires by construction. PRESETS must
   either wait for PK.2 or leave the W2 scope as a fast-follow.
5. **The pin glyph**: the banked spec mandates "pin 📌"; the emoji→0 sweep (#475)
   is a completed campaign result. A vector pin substitutes; recorded as a deviation.
6. **NEW hard requirement from the 2026-07-31/08-01 walks** (owner, verbatim):
   *"This shit is so busy and it's hard to read those letters are low contrast and
   they're tiny… the sidebar became impossible to parse"* and earlier *"I kind of
   disagree with the looseness of how you've created this left side windowing
   thing."* W2 is no longer only a navigation restructure — it MUST ship a sidebar
   **density/contrast/type pass**: fewer simultaneous panels, a clear visual
   hierarchy for LAYER vs browser vs TRACK, and type that clears the D6 floor with
   real contrast (D7). Any W2 mock that does not visibly fix parseability fails the
   owner's stated bar ("if not, then it's not useful").

## The three rulings (one sitting, by eye at a REAL-DIMENSIONS mock)

### Ruling 1 — Does the tool zone enter the sidebar at all?
- **Option A (banked v12):** tools live in the sidebar rail's bottom zone.
  Consequence: Cmd+B hides them; mitigations exist (rail stays visible when the
  panel collapses — "rail survives Cmd+B" — but that deviates from the banked
  "hides as one unit" oracle) — a sub-ruling either way.
- **Option B:** containers unify in the sidebar rail; tools STAY in the shipped
  ToolRail left of the preview. Cheaper, no Cmd+B regression, keeps #464's flyouts;
  cost: two rails on screen (the owner's "one strip" vision is compromised).
- **Recommendation:** A, with the rail surviving Cmd+B (panel collapses, icon strip
  remains). It honors the one-strip vision and turns the Cmd+B hazard into a
  deliberate behavior change the owner approves — not an accident.

### Ruling 2 — Flyout or drawer for tool subgroups?
- **Flyout (as shipped, #464):** press-hold flyouts per tool group. Survives: all
  of it. Dies if drawer: ToolFlyout (~130 of 369 lines), its testids, one spec.
- **Drawer (banked v12):** each tool group opens a drawer like the containers —
  consistent interaction grammar, more clicks per tool switch. Cycling hotkeys
  survive either way (model-independent, verified).
- **Recommendation:** flyout — it's shipped, tested, and faster in-performance;
  consistency with container drawers matters less than tool-switch latency.

### Ruling 3 — Wells or no wells?
The banked text contradicts itself. This is a pure by-eye call at the mock:
container icons in inset wells (stronger grouping, busier chrome) vs flat icons
with a divider (calmer, relies on spacing). **Recommendation:** flat + divider,
given ruling-6's new "too busy" requirement — wells add chrome to a region the
owner just called unparseable.

## Sequencing after the rulings

1. Anchor re-verify vs current main (mechanical; W1.5 moved App.tsx again).
2. PRESETS: dispatch wave-0 PK.1→PK.2 first, or descope P6 to fast-follow (owner
   preference not needed — orchestrator picks by executor availability).
3. Then P1→P9 per the packet map, with the density/contrast requirement folded
   into every visual packet's oracle (type ≥ D6 scale, contrast per D7, and the
   panel-stack rule: at most ONE of LAYER/TRACK expanded alongside the browser).
4. A11y headroom: budget an a11y-clearing packet before P3's role="tree"
   (ratchet at ceiling; the tree WILL emit warnings).

## What dies, explicitly (so nothing dies silently)

Sidebar three-tab switcher (P9, no testids, free) · EffectBrowser [tool] tab body
(P4 de-dup, reachability checklist mandatory) · "Add Text Track" sidebar button
(folds into unified creation, OD-3) · Browse… button (rides P9 with the
test-helpers migration recipe preserved on PR #484) · flyout OR drawer code per
ruling 2.
