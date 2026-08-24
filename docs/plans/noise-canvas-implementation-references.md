# Noise Canvas Implementation References

> **What this is:** pattern write-ups distilled from a deep-read of Rob Clouth's Noise Canvas
> (spectral paint editor; Electron + React + Zustand + R3F — near-identical stack to Creatrix).
> Each planned change below gets a one-line pointer here. Written 2026-08-23 from
> `~/Development/reference/noise-canvas-CANNIBALIZATION.md` (full analysis + provenance).
>
> **⚠️ LICENSE PROTOCOL (non-negotiable):** Noise Canvas is AGPL-3.0. Its clone is quarantined
> at `~/reference-agpl/noise-canvas` (see `DO-NOT-COPY.md` there). Implementers work from THIS
> document's prose and numeric requirements ONLY. Never open the clone during implementation,
> never launch a build agent with cwd under `~/reference-agpl/`, never transcribe shaders or
> code. Patterns and data-model shapes are free; expression is not.
>
> **⚠️ OPEN-OD PROTOCOL:** where a pattern touches a pending owner decision it is written as a
> **labelled OPTION for the owner's verdict** — nothing here answers an open OD. Locked
> decisions are never contradicted; if an implementer thinks one should be, that goes to the
> owner, not into code.

---

## history-panel-delta

**Pattern: delta-against-parent storage + periodic checkpoints + byte-budgeted caches.**
The reference app persists a branching undo tree where each node stores a compressed delta
against its parent when the changed footprint is under ~50% of the state, and forces a full
checkpoint snapshot every 20 deltas so replay chains stay bounded. Reconstruction walks back
to the nearest checkpoint and replays forward. All in-RAM caches are byte-budgeted LRUs
(reference used 256MB state / 128MB delta tiers), and the on-disk store is LRU-capped with
pinned exemptions (current node, saved node, favourites) purged-on-quit for everything else.
Redo returns to the **most recently visited child** (a `lastChildId` per node) — this single
rule is what makes a branching tree feel like ordinary undo/redo.

**Why it matters here:** Creatrix frames are expensive to recompute; full-snapshot-per-undo
explodes RAM/disk. Delta+checkpoint bounds both, and the checkpoint interval + byte budgets
are tunable constants the packet can size to measured frame cost.

**Requirements form (for the packet, tune constants to measurement):** (1) node stores delta
iff footprint < threshold, else full state; (2) forced full state every N deltas; (3) every
cache declares a byte ceiling + eviction order with pinned exemptions; (4) redo target =
last-visited child; (5) purge dialog states exact bytes freed and that current state is
untouched.

## fx-afterimage

**Pattern: feedback-blowup guard as a bounded-output requirement.** The reference app bakes a
hard magnitude ceiling with an optional soft-knee into its shared shader library so no
feedback chain can run away, regardless of parameter combination.

**Requirements form (numeric, NO shader code per license protocol):** every temporal-feedback
accumulator MUST clamp accumulated magnitude to a fixed ceiling before write-back; a soft-knee
below the ceiling is optional but the hard bound is not; verified by a test driving max-gain
feedback for ≥1000 frames asserting output stays finite and ≤ ceiling.

**Locked-verdict alignment (do not re-open):** OD-5 was RESOLVED in the T1 verdict block at
the end of proposal.md — defaults accepted: local ring cap 30, SG-8 global registration
DEFERRED. The bounded-output requirement above is strictly per-effect and sits entirely inside
that locked scope; it implies nothing about the deferred global budget.

## device-monitors-v1 · multiwindow-stage-a

**Pattern: live/static view freezing.** Only the hovered/active view runs a real render loop;
every other open view is frozen to a 2D-canvas snapshot bitmap and skips GPU work entirely
until re-activated, with a brief "unveil" transition state to avoid a flash on wake. This is
how the reference app keeps many open documents at the cost of ~one. Companion patterns:
scratch render-targets pooled once per renderer (not per panel) since only one panel is
active at a time, and demand-driven rendering (render on invalidation, not a continuous RAF
loop) so idle panels cost zero.

**Why it matters here:** the locked budget is 4 LRU-paused monitors (MVP). Freezing gives
"paused" monitors a crisp last-frame appearance for free and makes the LRU pause mechanism
concrete: pause = snapshot + drop from the render loop; resume = unveil + rejoin.

**⚠️ OD-1 (open — panel registry ownership, single-flight with system-monitor-v1): this
pattern is registry-agnostic and works under either ownership outcome. No option offered —
nothing here bears on that decision.**

## sampler-clip-editor

**Pattern: zoom/pan as pure UV remap.** The reference app never re-tiles or re-chunks its
texture on zoom — the full buffer stays GPU-resident and zoom/pan is coordinate math in the
display shader. For FrameStrip/timeline zoom: keep the strip's source frames resident and
express zoom/scroll as a sampling window, not a rebuild. Companion: asynchronous GPU readback
(fence + poll, never a blocking read) for thumbnail generation, which matches the already-
specced scrub rule (cached thumbs during drag, render on release — DIMENSIONAL-TRANSLATION
NFR-01).

## system-monitor-v1

**Pattern: demand-frameloop as a measurable line item.** Reference app renders only on
explicit invalidation; idle CPU/GPU drops to ~zero when nothing changes. Suggestion at the
informational level: the monitor is the natural place to MAKE that win visible (idle FPS /
render-invalidations-per-second), which also gives the freezing pattern above its oracle.

## field-mapping K1 (prd/PRD-mapping-framework.md)

**Pattern 1 — the parameter registry.** One declaration per parameter (kind, label,
description, range/step/unit, scale [log], marks, modulatable flag, allowed-source list)
drives EVERYTHING derived: the control widget (single component switching on kind — zero
per-parameter UI code), the tooltip, the auto-generated modulation submenu, preset
serialization, and doc deep-links. New parameter = one registry entry, not five files. This is
proposed as K1's canonical shape: a central registry with `modulatable` + `fieldSourcesAllowed`
per param, from which the ModulationMatrix, tooltips, and preset schema all derive. It is also
the natural home for the unit metadata `test_numeric_params_have_unit` wants.

**Pattern 2 — field precompute-to-texture, skipped when unrouted.** All modulation fields are
evaluated ONCE per frame into a texture (multi-target render), every consumer samples that
texture, and the pass is skipped entirely (bound to a zero placeholder) when nothing routes to
a field. Proposed as the FieldProvider distribution mechanism: fields render once, devices
sample cheaply, unrouted fields cost nothing.

**Pattern 3 — modulation amounts as a clamped crossfade.** Amounts sum and clamp at 1.0,
crossfading the base value out, so two maxed sources cannot exceed a parameter's legal range
BY CONSTRUCTION. UI: the parameter label carries a small dot when modulatable (colored when
actually modulated) as the only persistent chrome; the parameter menu shows the resulting live
range in real units; base control dims when fully modulated. Proposed for P2 UX.

**Reconciliation note:** any adoption must be read against `UNIFICATION-2026-07-03.md`
(notably the type-scoped `targetEffectId` wire finding) — the registry pattern is where that
addressing convention gets fixed once, not worked around per-device.

## field-mapping Wave-0 preset docs

**Pattern: preset hover-preview + color-as-identity.** Hovering a preset row shows a summary
of its full chain (devices + routing) BEFORE applying — no click-in-to-inspect. Each preset
gets an auto-assigned collision-avoiding identity color reused wherever the preset appears
(browser row, history badges). Both are additive UX for the pre-routed preset browser and
sit comfortably under the W2 sidebar density requirement (hover-preview adds zero standing
chrome). Checked against W2 step0-reconciliation §"What dies" — no collision.

---

## Rejected / not routed (so future sessions don't re-litigate)

- **Packed non-uniform spectrogram textures, CQT analysis, phase-preservation** — audio-DSP
  specific; routed to the PopChaos plugin track (Spike B memo), not Creatrix.
- **Instanced gather/scatter materials** — expression-proximity too high for a doc-level
  requirement; revisit only if history-panel-delta's measured IO becomes a bottleneck, and
  then as a fresh design.
- **Branching-history git-graph SVG layout specifics** — history-panel-delta already has its
  own UI spec; only the storage model + redo rule are routed.
- **Ableton Link / extension host patterns** — plugin track only.

## Amendment ledger (Phase-0 completion oracle)

| Target | Status |
|---|---|
| history-panel-delta | amended (pointer + packets ref row) |
| fx-afterimage | amended (pointer + packets ref row; OD-5 as options) |
| device-monitors-v1 | amended (pointer + packets ref row; OD-1 untouched) |
| multiwindow-stage-a | amended (pointer) |
| sampler-clip-editor | amended (pointer + packets ref row) |
| system-monitor-v1 | amended (pointer) |
| prd/PRD-mapping-framework.md | amended (pointer section) |
| Wave-0 preset docs (PRESET-CATALOG.md) | amended (pointer) |
