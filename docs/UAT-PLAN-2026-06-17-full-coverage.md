# Creatrix Full-Coverage CU-UAT Plan — 2026-06-17

**Goal:** Live computer-use acceptance pass over every functional area shipped in the
feature-complete campaign (tick-2: 130 PRs). Closes ROADMAP §0.2 decision **(d)**
("B4–B10 have no computer-use acceptance pass yet") and task #62.

**Method:** Launch app on this machine's main runtime → request computer-use access for
Electron → drive each flow via screenshots + clicks/keys → record PASS / FAIL / 🐛 per
scenario with screenshot evidence. Legal verdicts: ✅ PASS · ❌ FAIL · 🐛 BUG-FILED · ⏸ BLOCKED
(must name external blocker). No 🟡 — "code-verified but not clicked" = ❌ until clicked.

**Runtime invariant (Gate 18):** the running app's source path MUST be
`~/Development/entropic-v2challenger` at `origin/main` HEAD. Verify before declaring any
result. Zustand store-shape changes need kill+relaunch (HMR won't rehydrate).

**Evidence sink:** `~/Documents/creatrix-uat-media/2026-06-17/` (screenshots per scenario).
**Results doc (live-updated):** `docs/UAT-RESULTS-2026-06-17.md` (created in execution).

---

## Pre-flight (P0 — must pass before any area)

- [ ] PF.1 App launches from `~/Development/entropic-v2challenger` main; window paints; no error boundary.
- [ ] PF.2 Python sidecar connects (status indicator green; no persistent "Engine not connected").
- [ ] PF.3 Import a test clip (Cmd+I → `~/Documents/creatrix-uat-media/uat-testclip.mp4`); clip lands on timeline; preview shows first frame.
- [ ] PF.4 No poison autosave on launch (`~/Library/Application Support/Creatrix/.autosave.glitch` absent or clean).

---

## Area 1 — Core pipeline (REGRESSION — already passed once; re-confirm post-#318/#319)

- [ ] 1.1 Select clip → add effect from EffectBrowser → preview repaints, NO crash-loop (#318 regression guard).
- [ ] 1.2 Creatrix layout renders correctly under `F_CREATRIX_LAYOUT` flag-off legacy AND flag-on (#319 guard): left col, center preview, device chain visible, no collapse.
- [ ] 1.3 Export single frame PNG → file written, opens, matches preview.
- [ ] 1.4 Export MP4 (short range) → file written, plays, frame count correct.

## Area 2 — Sampler (B1)

Entry: InstrumentsBrowser → Sampler → SamplerDevice on a track.
- [ ] 2.1 Create sampler instrument on a track; SamplerDevice panel mounts.
- [ ] 2.2 Set source clip; trigger a voice (pad/key); preview repaints with sampled frame.
- [ ] 2.3 Modulation knobs (resolveSamplerModulations) move a visible parameter.
- [ ] 2.4 Persistence: save project → reload → sampler + source survive (regression: newProject must not silently drop samplers).

## Area 3 — Sample Rack + nesting (B4 / B5)

Entry: InstrumentsBrowser → Rack → RackDevice.
- [ ] 3.1 Create rack; add pad; set pad source; trigger pad → preview repaints (task #62 core).
- [ ] 3.2 Macros: RackDevice macro section maps a macro knob → pad param; turning macro changes output.
- [ ] 3.3 Pad-chain: select pad → DeviceChain retargets to that pad's insert chain; add effect to pad chain only.
- [ ] 3.4 Choke group: two pads same choke → triggering one cuts the other.
- [ ] 3.5 Pad delete: remove pad → events + macro routes cleaned (no orphan trigger).
- [ ] 3.6 B5 nesting: convert pad → branch (nested rack); drill-down nav enters; trigger nested pad → composites upward.
- [ ] 3.7 B5 nested delete: delete nested pad → no orphan events (bare-padId regression guard).

## Area 4 — Frame-Bank (B6 / B7)

Entry: InstrumentsBrowser → Wavetable/Frame-Bank → FrameBankDevice.
- [ ] 4.1 Create frame-bank; slot strip shows slots; load frames into slots.
- [ ] 4.2 Position knob scans across frames; preview morphs by position.
- [ ] 4.3 Interp modes: nearest / linear / flow (B7 optical-flow) each visibly differ.
- [ ] 4.4 Persistence: bank survives save→reload (regression: created bank must persist).
- [ ] 4.5 SG-8 pressure-degrade: under memory pressure, bank degrades gracefully (no crash).

## Area 5 — Granulator (B8)

Entry: InstrumentsBrowser → Granulator → GranulatorDevice.
- [ ] 5.1 Create granulator; grain-cloud viz renders in device panel.
- [ ] 5.2 Grain params (size, density, spread) change preview output.
- [ ] 5.3 Export parity: granulator-driven output renders in MP4 export the same as preview (#309 guard).

## Area 6 — Tensor Routing / Y-as-time (B9)

- [ ] 6.1 Slit-scan effect: enable on a clip → vertical/temporal smear visible.
- [ ] 6.2 OperatorMapping axis-extended binding: bind an axis (T/Y/X/C/F/L) → param responds.
- [ ] 6.3 Routing inspector UI shows live binding; finite-guard holds (no NaN/Inf blowup at extremes).

## Area 7 — Freeze FSM / live affordances (B10)

- [ ] 7.1 Freeze a performance track → bake runs → frozen clip plays back.
- [ ] 7.2 Unfreeze → returns to live; no state corruption.
- [ ] 7.3 Quantized launch: trigger aligns to next quantize boundary.
- [ ] 7.4 Retro-capture: capture recent performance into a clip.
- [ ] 7.5 MIDI Learn: bind a control to a hardware/virtual CC; rebind; display updates.

## Area 8 — Masking (MK.1–MK.14)

Entry: PreviewControls tool modes → MaskSelectOverlay / MaskStackPanel.
- [ ] 8.1 Marquee (rect/ellipse) select on preview → MatteNode created; marching-ants overlay shows.
- [ ] 8.2 Lasso (freehand + polygon) select → matte created.
- [ ] 8.3 Magic wand: click region → wand samples → matte by tolerance; failure shows toast.
- [ ] 8.4 Chroma/luma key → matte by color/luma.
- [ ] 8.5 Matte ops UI: invert / feather / delete / fill on a MatteNode.
- [ ] 8.6 Matte chips: MaskStackPanel shows real 64×36 thumbnails (mask_thumbnail IPC).
- [ ] 8.7 Cut/copy region → new track.
- [ ] 8.8 Mask routing: mask applied → composites into preview AND nested instruments AND export (#316 guard).
- [ ] 8.9 Alpha export: ProRes 4444 export carries alpha.

## Area 9 — Inspector + Routing Canvas (I1/I2/I3)

- [ ] 9.1 Inspector reflects selection across 8 states (none/clip/effect/marker/operator/tool/track/multi) — labels correct (the "inspector says what they are" fix).
- [ ] 9.2 Hover-help shows on device/param hover.
- [ ] 9.3 I3 inline-probe action menu opens + invokes.
- [ ] 9.4 Routing Canvas overlay (⌘⇧I) opens; graph projects; edge update round-trips.

## Area 10 — Modulation (PR-C operators + Kentaro Cluster)

- [ ] 10.1 Add an operator (PR-C family) to a param → modulates over time.
- [ ] 10.2 Kentaro Cluster: 8-LFO direct manipulation UI → visible modulation; "visualization IS the interface" holds.

## Area 11 — Export matrix + audio

- [ ] 11.1 Export formats: MP4 / GIF / image-sequence / ProRes each produce a valid file with correct extension (F-0512-23 derived filter; no double-ext F-0512-7).
- [ ] 11.2 Audio meter: playing a clip with audio shows live meter movement.
- [ ] 11.3 Audio tracks (if flag on): bake kit produces synced A/V.
- [ ] 11.4 Export progress: frame counter / ETA / output-path display during export (#313 forwarding guard).

## Area 12 — Chaos / human-error pass (CLAUDE.md RULE 2)

- [ ] 12.1 Input: empty project export; huge clip; rapid double-trigger of pads.
- [ ] 12.2 Timing: interrupt export mid-run (cancel); double-click effect-add.
- [ ] 12.3 State: reload mid-edit; open project from older format (legacy migration).
- [ ] 12.4 Sequence: delete track with live instrument; undo/redo across instrument + mask ops.
- [ ] 12.5 Boundary: max effects on a chain; zero-area marquee; position knob at 0 and max.

---

## Execution order (highest-value-first)

1. Pre-flight (PF.1–PF.4) — gate.
2. Area 1 (regression confirm #318/#319 hold live).
3. Area 3 Rack → Area 5 Granulator → Area 7 Freeze (the "Sampler→Rack→Granulator→Freeze" headline path, decision (d)).
4. Area 2 Sampler, Area 4 Frame-Bank (instrument ladder remainder).
5. Area 8 Masking, Area 9 Inspector, Area 6 Routing, Area 10 Modulation.
6. Area 11 Export matrix + audio.
7. Area 12 chaos pass.

**Bug protocol:** any 🐛 → capture screenshot + console + repro steps → file as task → if it
blocks the area, continue other areas (don't stop the whole pass). RISK:HIGH fixes go in a
branch + PR per campaign merge rules. Adjudicate every suspected bug with one independent
discriminating test before filing (CLAUDE.md Subagent Briefs §3).

**Done definition (Gate 20):** every checkbox above is ✅/❌/🐛/⏸ with evidence; the
results doc tallies full/passed/failed/blocked; no area silently skipped.
