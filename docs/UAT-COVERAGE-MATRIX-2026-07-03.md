# UAT Coverage Matrix — every 30-day feature PR mapped, gaps get written checkpoints

**Ask:** "go through every PR and map it to UAT; if there's no UAT written for it, do it."
**Scope:** all 145 `feat` PRs merged 2026-06-03 → 2026-07-03 (the 269-PR set minus fix/docs/test/chore, which regress via their feature's checkpoint).
**Result:** 101 COVERED (a checkpoint exists that would fail if the feature broke — cited), **44 GAP** (no checkpoint existed → one is WRITTEN below).
**Method:** 6 parallel workers, real per-PR judgment (NOT keyword match). Every COVERED row cites a stage/section; every GAP row carries a concrete tester checkpoint + oracle.

> **Coverage = plan-existence, not executed-evidence.** Only Stage A has been RUN live (see UAT-RESULTS-2026-07-03.md). "COVERED" means the checkpoint is written in the plan/audit, not that it passed on the running app.

## GAP CHECKPOINTS

**Execution mode (answering "are these CU/UI?"): 34 = CU (drive UI, judge from screen) · 5 = CU+ORACLE (drive UI in-app, then an external decode/probe confirms pass) · 5 = AUTOMATED (byte-identical/memory/GPU/pixel-content — NOT screen-observable, belongs in pytest/vitest, hand to a build session not the CU tester).**
 — the 44 UAT tests written this pass (add to the plan)

| PR | feature | MODE | UAT checkpoint (steps + oracle) |
|---|---|---|---|
| 415 | AA.3-B audio-follower operator lane | **CU+ORACLE** | IN-APP (CU): add an audio-follower lane sourced from a track's audio, play → the target param visibly reacts to audio level (screenshot mid-loud vs mid-quiet shows different param value). VERIFY (external): export, decode 2 frames at loud vs quiet moments, confirm the driven param differs. |
| 376 | H7 MIDImix bank paging + bank HUD | CU | 1. Page banks via BANK L/R; confirm the bank HUD shows the new bank index/name. 2. Move a control after paging. Oracle: the HUD indicator matches the active bank AND the moved control now drives the newly-paged bank's mapped param, not the previous bank's — if paging changes the HUD but not which param actually responds (or vice versa), FAIL. |
| 375 | H-UI Ableton-style hardware-mapping interface | CU | 1. Click MAP to open the overlay; confirm mappable targets highlight. 2. Click a MIDImix grid slot, then click a target param to bind. 3. Move the bound control. Oracle: the mapped param's live value changes (visible in UI and in a render) — if slot-click→param-click produces no live binding (overlay is decorative only), FAIL. |
| 373 | H6 velocity plumbing for velocity pads | CU | 1. Trigger a velocity-sensitive pad at low velocity (e.g. 20) then again at high velocity (e.g. 127), same pad/note. 2. Compare the rendered output level/ADSR-driven parameter between the two. Oracle: high-velocity trigger produces a measurably different output amplitude than low-velocity for the same pad; identical output regardless of velocity = FAIL. |
| 372 | A4 continuous-lane overdub toggle | CU | 1. Arm a track, enable Overdub, record two passes over the same lane region with different values. 2. Toggle Overdub OFF, record a third pass over the same region. Oracle: with Overdub ON the second pass layers onto (does not erase) the first; with Overdub OFF the third pass replaces prior values outright — if both toggle states produce identical (replace-only) results, FAIL. |
| 370 | transitions v2 effects (column_cascade, column_cascade_reverse, row_waterfall) | **CU+ORACLE** | IN-APP (CU): add each transition effect (column_cascade etc.) to a clip → preview shows the transition animating across the clip (screenshot at 25%/50%/75% differ). VERIFY (external): export, decode 3 frames, confirm progressive transition (not static). |
| 369 | 3D Extrude+Spin (fx.extrude_spin) | CU | 1. Apply fx.extrude_spin, sweep depth/rotation across 2+ frames; render preview and export the same frames. Oracle: exported frames match preview frames at the sampled points (parity) AND the frames are visibly non-identical to each other (the 3D transform is actually animating, not a no-op); either failing = FAIL. |
| 368 | Copy Machine (fx.copy_machine) multi-gen degradation | CU | 1. Apply fx.copy_machine with non-default feedback_amount/cell_size/glyph_set across several sequential frames. 2. Render preview and export the same range. Oracle: later frames show visibly progressive degradation vs earlier frames (multi-generation artifact accumulates) AND export matches preview; flat/no-degradation output or preview≠export = FAIL. |
| 365 | persist controller bindings by device identity (H5) | CU | 1. Bind a control to a param, fully quit and relaunch with the SAME controller identity connected. 2. Move the control post-relaunch. Oracle: the param still responds to that control without re-mapping (binding survived restart); if a binding requires re-mapping after relaunch, FAIL. |
| 361 | record hardware CC moves as automation (bank/context-aware, H4) | CU | 1. Arm an automation lane, then move a MIDI CC control mapped to that param (not the mouse) while armed, in bank A. 2. Repeat in bank B (different context). Oracle: each CC move is captured as real breakpoints in the lane (inspect lane after stopping) in both banks — if the hardware move affects the live param but leaves no breakpoints in the armed lane, FAIL (this is exactly the F2 regression). |
| 356 | MIDI-learn extend to macros/instrument/transform/mask | CU | Right-click a macro knob, an instrument param, a transform field, and a mask param → each enters learn → move a hardware CC → binding sticks and the CC drives that param; verify all 4 param classes bind |
| 351 | bank-relative hardware mapping (focus-follows resolve) | CU | Map a MIDImix bank slot to a param in context A, switch focus context, confirm the same physical knob resolves to context B's param (bank-relative, not absolute); page BANK L/R and confirm slot re-resolves |
| 347 | L0 Block tool-icon set (14 tools) | CU | **THE tool-rail gap.** Icons exist (tool-icons.tsx) but no left rail. Checkpoint (needs rail built first): left tool rail shows all 14 Block icons grouped TRNS/EDIT/MASK/MISC; clicking each activates the tool (statusbar `tool:` updates); active tool shows acid-wash state |
| 345 | H1 focus-mapping-context selector + focus chip | CU | Select a track/device → statusbar focus chip names the current mapping context; change focus → chip updates; hardware maps resolve against the chip's context |
| 296 | B10 MIDI-learn hardening (rate-limit + persistence) | CU | Bind hardware CCs, save project, reload → bindings restored (persistence round-trip); spam a CC → rate-limit holds (no event flood); a second bind to the same CC steals cleanly with feedback |
| 295 | B8 GPU grain-render pass (MLX) | **CU+ORACLE** | IN-APP (CU): enable GPU grain pass on a granulator (Metal Mac) → preview renders grains (screenshot). VERIFY (external, automated): PIL-compare a GPU frame vs the CPU-geometry baseline within tolerance. |
| 294 | B8 determinism + gate-compliance | **AUTOMATED** | NOT CU — automated test (pytest): render the same granulator section twice with a fixed seed → assert exported frames byte-identical + within the 16ms budget. Belongs in backend determinism suite, not the CU pass. |
| 291 | B9 Y-as-time slit-scan footage | CU | On a B9 instrument set timeAxis=y → a vertical slit of footage maps across time; scrub and confirm the slit-scan effect (column-over-time) is visible and matches on export |
| 273 | P6.5 Metal codegen per-pixel field on GPU | **CU+ORACLE** | IN-APP (CU): apply a field-capable effect via the GPU path (Metal Mac) → preview shows the field render (screenshot). VERIFY (external, automated): PIL-compare GPU vs CPU field render within tolerance + probe for GPU resource leak. |
| 270 | P6.4 SG-1 Metal binding + GPU-pattern AST lint | CU | Trigger a GPU-bound effect and force a GPU fault/unavailable path → app degrades gracefully with a message (no crash); confirm SG-1 resource-lifetime contract holds (no leaked GPU resource after the effect is removed) |
| 250 | Frame-Bank flow optical-flow morph interp | **AUTOMATED** | NOT CU — automated/perceptual: optical-flow morph QUALITY is not screen-judgeable reliably. Automated: decode flow-interp frames vs a linear-crossfade baseline, assert motion-compensated (SSIM/flow metric). CU can only confirm 'flow mode renders something', not correctness. |
| 248 | Frame-Bank UI slot strip + position knob B6.3 | CU | Instantiate FrameBankDevice → slot strip populates → drag position knob → preview frame content changes (before/after screenshot) |
| 247 | Frame-Bank preview + SG-8 pressure-degrade B6.2 | CU | Scrub large Frame-Bank until SG-8 pressure → toast appears, preview keeps rendering degraded (not frozen), toast dismisses on recovery |
| 246 | Frame-Bank scan + byte-budget LRU B6.1 | **AUTOMATED** | NOT CU — automated test: load a Frame-Bank over the byte cap, scan all positions, assert memory stays under the LRU cap (memory probe). Not screen-observable. Backend perf/memory suite. |
| 239 | Pad-delete symmetric cleanup B4 | CU | Rack w/ 3+ pads, one in choke group + route/automation bound → delete it → no dangling ids, choke membership+routes cleaned, others unaffected, no crash |
| 236 | Sample Rack export-path parity B4 | **CU+ORACLE** | IN-APP (CU): build a Sample Rack (pad chains + macros), preview at time T (screenshot). VERIFY (external): export, PIL-compare the exported frame at T vs the preview screenshot — Cross-Cutting Gate 1 (parity). |
| 231 | Sampler scrub/speed as mod-dest B3.2 | CU | Bind LFO to sampler speed/scrub → play → oscillates per LFO (deterministic); export frames match preview at same timestamps |
| 225 | MK.9 cut/copy masked region to track | **AUTOMATED** | NOT CU (oracle part): CU can draw a mask + Cmd+J/Cmd+Shift+J and SEE a new track appear (that part IS CU). But 'new track contains ONLY the masked pixels' needs a PIL pixel-content check → automated. Split: CU checks track-created + source-unaffected visually; automated checks pixel content. |
| 216 | PD.8 hotkey-discoverability surfaces (context-menu shortcut labels) | CU | Right-click an action bound to a shortcut (e.g. a clip → Split) → context menu item displays the correct live shortcut label from `shortcutRegistry` (e.g. "Split ⌘K"); change a binding in Preferences → the label updates without reload. |
| 213 | PD.1 audio-tracks bake kit + bake-session instrumentation | CU | Start playback of an audio track, then stop it → confirm `~/.creatrix/audio-bake-log.jsonl` gains exactly one new JSONL line with session start/stop timestamps and an error-delta field; force an audio error mid-session → the logged error delta is non-zero. |
| 203 | P5a.4 voice replay in export (deterministic backend export replay) | **AUTOMATED** | NOT CU — automated: deterministic backend voice-replay export is a pytest parity check (export==replay), not a screen action. |
| 199 | P3.4 inspector hover-help + hotkeys (<8ms perf gate) | CU | Hover an Inspector control for the packet's threshold duration → a help tooltip renders with the control's description text (not a blank/generic tooltip); press its documented hotkey → the bound action fires; confirm no dropped frames (devtools perf) during hover, i.e. the <8ms budget holds. |
| 196 | P3.3 polymorphic inspector — 8 states, info-only | CU | Select each of the 8 distinct inspector target types in sequence (none/clip/track/effect/operator/mask-node/marker/master) → the Inspector renders the correct info-only content for each, with no stale content bleeding over from the prior selection and no crash on rapid switching. |
| 194 | P5a.2 voiceId state keying + per-voice cleanup + caps | CU | Trigger more sampler voices simultaneously than `MAX_TOTAL_VOICES_PER_RENDER` → confirm surviving voices keep correct independent per-voice state (no cross-voice contamination after a steal) and hitting the cap produces a visible toast or graceful oldest-voice steal, never a silent drop or crash. |
| 186 | PUX.2 dialog accessibility — Escape/focus-trap/ARIA via useModalBehavior | CU | Open each modal (ShortcutEditor, SpeedDialog, Export, Preferences) → Tab repeatedly and confirm focus stays trapped inside the dialog; press Escape → dialog closes and focus returns to the triggering element; inspect DOM for `role="dialog"` / `aria-modal="true"` on each. |
| 185 | P2.1 BPM split — persisted bpm vs derived effectiveBpm | CU | Set project BPM to a custom value (e.g. 140), add an automation/LFO lane modulating a BPM-linked param → confirm displayed `effectiveBpm` diverges from persisted `bpm` during modulation; Save → reload → confirm the reloaded `bpm` field equals the original 140 (not the modulated effectiveBpm at save-time). |
| 183 | PUX.4 slider ARIA + menu keyboard model | CU | Tab to a slider via keyboard → arrow keys adjust value, `aria-valuenow`/`aria-label` present; open a menu via keyboard, arrow through items, Enter activates, Esc closes |
| 181 | UE.7 clip rename + clip color | CU | Double-click a clip label → inline rename (unicode/200-char clamp); pick a color swatch via context menu → clip tints in timeline; save→reload → name+color survive |
| 180 | UE.3 marquee clip selection | CU | Drag a rubber-band rect over 3 clips → all select; shift-drag another rect → adds to selection; zero-area click → clears selection |
| 178 | drag track header to reorder + drop-zone | CU | Drag a track header past a neighbor → order visibly swaps AND persists on reload; one undo entry reverts it |
| 177 | UE.1 snapping (clip-edge/playhead/marker + toggle) | CU | Drag a clip within 8px of a neighbor edge/playhead/marker → snaps; toggle "S" off → same drag no longer snaps |
| 170 | UE.4 Save As + numbered backups | CU | File→Save As → new path, title/Cmd+S rebind; overwrite-save 6× → exactly 5 rotated `.bak.1..5` files |
| 157 | PR-B Commit-1 unify isTrigger+triggerMode into Interpolation | CU | Add a Trigger lane (+ Trigger) vs a normal lane (+ Lane) on the same param → each keeps its own mode independently across R/L/T/D switching and save/reload |
| 123 | Grid Moire — true interference moiré | CU | Add fx.grid_moire to a clip → moiré pattern visible; sweep freq_ratio/angle_offset/rotation_speed/scroll/warp/sharpness → each visibly changes it; export → frame matches preview |

## GAP CLUSTERS (the 44 gaps collapse to a few missing UAT areas)
- **Hardware-mapping suite (H1–H7, MIDI-learn extend, bank-relative, controller identity)** — NO dedicated UAT stage; only the MAP-button existence is in-plan. Biggest cluster.
- **New effects (Copy Machine #368, 3D Extrude+Spin #369, transitions #370, grid_moire)** — zero UAT; need render + preview==export parity rows (Stage-A harness extends to these).
- **GPU render/safety (B8 GPU grain #295, P6.5 Metal field #273, P6.4 SG-1 #270)** — no GPU parity/leak checkpoint.
- **Determinism + export-parity per-instrument (B8 determinism #294, rack export #236, scrub-by-LFO #231, frame-bank #246–250)** — parity gate exists globally (proven live) but no per-instrument rows.
- **The Block tool RAIL (#347)** — icons built, rail never built; UAT can't check a rail that doesn't exist. Build rail → add checkpoint.
- **Clip papercuts (rename, drag-move, edge-snap, .bak rotation) + trigger-lane** — small uncovered UI behaviors.

## FULL PER-PR MATRIX (145 feature PRs)

| PR | feature | COVERED/GAP | stage / citation | checkpoint (if GAP) |
|---|---|---|---|---|
| 415 | AA.3-B audio-follower operator lane | GAP | UAT-PLAN-2026-07-02-live-cu.md Stage J only covers LFO source (J2); no audio-follower checkpoint in any doc | 1. Add an automation lane, set its source to an Audio-Follower operator bound to a track with quiet and loud audio sections. 2. Render/export a range spanning both. Oracle: decode exported frames (PIL) at a loud vs quiet frame — the automated param value must track the audio envelope (differ between the two), and the export value must match the preview value at the same frame; if the param is constant regardless of audio level, or preview≠export, FAIL. |
| 407 | AA.3-A LFO operator lane | COVERED | UAT-PLAN Stage J, checkpoint J2 ("LFO operator lanes... rate/depth/phase/waveform... Confirm DETERMINISTIC... preview==export... Try all waveforms") | — |
| 406 | M.3 Master-chain param automation | COVERED | UAT-PLAN Stage K, checkpoint K4 ("Master automation (M.3): arm the Master track, automate a master effect param → varies in preview AND export"; contamination regression spot-check) | — |
| 404 | AA.2 drawn modulation lanes | COVERED | UAT-PLAN Stage J checkpoint J1 + Completeness Pass C1 ("Absolute lane + modulation lane on the SAME param → modulation superimposes on absolute") | — |
| 403 | M.2b master_chain into render/export IPC | COVERED | UAT-PLAN Stage K, checkpoint K3 (explicitly names "M.2b forced it onto the composite path"; single-clip preview==export test) | — |
| 401 | AA.3a Insert Automation Shape | COVERED | UAT-PLAN Stage I, checkpoint I4 ("Insert Shape (AA.3a): Shape picker... bakes REAL editable breakpoints... Honors quantize") | — |
| 399 | AA.4b transform box + flatten/ramp | COVERED | UAT-PLAN Stage I, checkpoint I3 ("Transform box (AA.4b): drag edge to scale, drag side to skew/tilt, Flatten/Ramp, each ONE undo step") | — |
| 398 | F_CREATRIX_LAYOUT default ON (#20) | COVERED | UAT-PLAN Stage G "UPDATE" section (default-ON verification vs legacy escape hatch) + Stage A A5/feature-flag addendum (re-baseline on flip, name flag state per verdict) | — |
| 397 | clip thumbnail density scales with zoom | COVERED | UAT-PLAN "Also new: clip thumbnails scale with zoom (#397)" section (poster-frame count changes with zoom, capped at 12, perf check) | — |
| 396 | M.1 Master-Out Bus schema + render foundation | COVERED | UAT-PLAN Stage K, checkpoint K1 ("Exists + guards: exactly one Master track, undeletable/no-clips, instrument drop rejected w/ toast") | — |
| 394 | AA.6 per-control is-automated indicator | COVERED | UAT-PLAN Stage I, checkpoint I5 ("Is-automated LED (AA.6): green dot on knob with active lane, appears/disappears as lanes added/removed") | — |
| 393 | AA.4 breakpoint selection (marquee/move/copy-paste) | COVERED | UAT-PLAN Stage I, checkpoint I2 ("marquee-drag over breakpoints → select; drag to move; copy/paste; quantize snap") | — |
| 386 | AA.1 curved-segments polish | COVERED | UAT-PLAN Stage I, checkpoint I1 ("Alt+drag → tension; Alt+double-click → straighten; eased ramp renders, not linear") | — |
| 377 | B3 lean headers + LAYER panel + restack (L2+L3) | COVERED | UAT-PLAN Stage G, checkpoints G1–G4 (restack z-order render-diff, lean header contents, LAYER panel edit→preview→persist, twirl nesting) | — |
| 376 | H7 MIDImix bank paging + bank HUD | GAP | UAT-COVERAGE-RECONCILIATION-2026-07-03.md explicitly: "H1–H7 suite has NO UAT stage... only the MAP button (A7b) is in-plan" | 1. Page banks via BANK L/R; confirm the bank HUD shows the new bank index/name. 2. Move a control after paging. Oracle: the HUD indicator matches the active bank AND the moved control now drives the newly-paged bank's mapped param, not the previous bank's — if paging changes the HUD but not which param actually responds (or vice versa), FAIL. |
| 375 | H-UI Ableton-style hardware-mapping interface | GAP | Only button-existence checked (UAT-RESULTS A7b: "MAP button present"); RECONCILIATION groups H-UI under the no-dedicated-stage hardware gap; UAT-PLAN line 234–235 literally reads "Stage — new, add" (never added) | 1. Click MAP to open the overlay; confirm mappable targets highlight. 2. Click a MIDImix grid slot, then click a target param to bind. 3. Move the bound control. Oracle: the mapped param's live value changes (visible in UI and in a render) — if slot-click→param-click produces no live binding (overlay is decorative only), FAIL. |
| 374 | T5 cursor-tool cull + split-shortcut consolidation | COVERED | UAT-PLAN Stage A, checkpoint A7c + zero-trust addendum correction ("range-select tool REMOVED... A7c now = razor/ripple/marker/loop by click+hotkey, PLUS assert range is gone") | — |
| 373 | H6 velocity plumbing for velocity pads | GAP | RECONCILIATION doc lists H6 velocity under the H1–H7 "no dedicated stage" gap; no velocity-specific row in any of the 4 docs | 1. Trigger a velocity-sensitive pad at low velocity (e.g. 20) then again at high velocity (e.g. 127), same pad/note. 2. Compare the rendered output level/ADSR-driven parameter between the two. Oracle: high-velocity trigger produces a measurably different output amplitude than low-velocity for the same pad; identical output regardless of velocity = FAIL. |
| 372 | A4 continuous-lane overdub toggle | GAP | UAT-RESULTS A7a only verifies the "Overdub" button renders; no checkpoint exercises additive-vs-replace behavior in any doc | 1. Arm a track, enable Overdub, record two passes over the same lane region with different values. 2. Toggle Overdub OFF, record a third pass over the same region. Oracle: with Overdub ON the second pass layers onto (does not erase) the first; with Overdub OFF the third pass replaces prior values outright — if both toggle states produce identical (replace-only) results, FAIL. |
| 370 | transitions v2 effects (column_cascade, column_cascade_reverse, row_waterfall) | GAP | RECONCILIATION doc explicitly: "New effects — Copy Machine (#368), 3D Extrude+Spin (#369), Transitions v2 (#370): merged, zero UAT-plan/audit checkpoints" | 1. Apply each of the 3 transitions between two clips; render preview and export the same range. Oracle: decode a mid-transition frame from both preview and export (PIL diff) — they must match, and the transition frame must differ non-trivially from a hard cut (non-zero diff vs pre/post clips); a hard-cut or preview≠export result = FAIL. |
| 369 | 3D Extrude+Spin (fx.extrude_spin) | GAP | RECONCILIATION doc: listed with zero UAT-plan/audit checkpoints (same effects-family gap as above) | 1. Apply fx.extrude_spin, sweep depth/rotation across 2+ frames; render preview and export the same frames. Oracle: exported frames match preview frames at the sampled points (parity) AND the frames are visibly non-identical to each other (the 3D transform is actually animating, not a no-op); either failing = FAIL. |
| 368 | Copy Machine (fx.copy_machine) multi-gen degradation | GAP | RECONCILIATION doc: listed with zero UAT-plan/audit checkpoints; UAT-RESULTS pre-CU findings note only a sidecar test failure ("not a UAT-surface bug"), no UAT checkpoint | 1. Apply fx.copy_machine with non-default feedback_amount/cell_size/glyph_set across several sequential frames. 2. Render preview and export the same range. Oracle: later frames show visibly progressive degradation vs earlier frames (multi-generation artifact accumulates) AND export matches preview; flat/no-degradation output or preview≠export = FAIL. |
| 365 | persist controller bindings by device identity (H5) | GAP | RECONCILIATION doc: "controller identity" listed under the H1–H7 "no dedicated stage" hardware gap | 1. Bind a control to a param, fully quit and relaunch with the SAME controller identity connected. 2. Move the control post-relaunch. Oracle: the param still responds to that control without re-mapping (binding survived restart); if a binding requires re-mapping after relaunch, FAIL. |
| 361 | record hardware CC moves as automation (bank/context-aware, H4) | GAP | UAT-COMPREHENSIVE-AUDIT flags this exact mechanism as an unverified risk (F2: "a MIDI-bank hardware knob move is a transient overlay, never a store write → may NOT be captured into an armed automation lane") — a flagged risk is explicitly NOT coverage per the reconciliation rules; no stage exercises it | 1. Arm an automation lane, then move a MIDI CC control mapped to that param (not the mouse) while armed, in bank A. 2. Repeat in bank B (different context). Oracle: each CC move is captured as real breakpoints in the lane (inspect lane after stopping) in both banks — if the hardware move affects the live param but leaves no breakpoints in the armed lane, FAIL (this is exactly the F2 regression). |
| 359 | T2 slip and slide edit tools | COVERED | UAT-PLAN Stage A, checkpoint A7c zero-trust addendum ("PLUS slip (`s`) / slide (`d`) from T2 #359") | — |
| 356 | MIDI-learn extend to macros/instrument/transform/mask | GAP | — | Right-click a macro knob, an instrument param, a transform field, and a mask param → each enters learn → move a hardware CC → binding sticks and the CC drives that param; verify all 4 param classes bind |
| 353 | record clip-transform lanes from bbox+numeric panel | COVERED | Stage I (automation editing) + audit #29 | |
| 351 | bank-relative hardware mapping (focus-follows resolve) | GAP | — | Map a MIDImix bank slot to a param in context A, switch focus context, confirm the same physical knob resolves to context B's param (bank-relative, not absolute); page BANK L/R and confirm slot re-resolves |
| 350 | MK.12 AI subject matte + Split by matte | COVERED | Stage H (U1–U10) | |
| 347 | L0 Block tool-icon set (14 tools) | GAP | — | **THE tool-rail gap.** Icons exist (tool-icons.tsx) but no left rail. Checkpoint (needs rail built first): left tool rail shows all 14 Block icons grouped TRNS/EDIT/MASK/MISC; clicking each activates the tool (statusbar `tool:` updates); active tool shows acid-wash state |
| 345 | H1 focus-mapping-context selector + focus chip | GAP | — | Select a track/device → statusbar focus chip names the current mapping context; change focus → chip updates; hardware maps resolve against the chip's context |
| 344 | clip-transform lanes addressing + per-frame eval | COVERED | Stage I | |
| 339 | wire razor/ripple/marker/loop/range cursor tools | COVERED | Stage A A7c | |
| 309 | B8 Granulator export-path parity | COVERED | Stage C4 (export granulated section, preview vs export) | |
| 296 | B10 MIDI-learn hardening (rate-limit + persistence) | GAP | — | Bind hardware CCs, save project, reload → bindings restored (persistence round-trip); spam a CC → rate-limit holds (no event flood); a second bind to the same CC steals cleanly with feedback |
| 295 | B8 GPU grain-render pass (MLX) | GAP | — | On a Metal-capable Mac, enable GPU grain pass → preview renders; export and PIL-compare a GPU-rendered frame vs the CPU-geometry baseline (byte-identical-or-within-tolerance per the GPU-pass design) |
| 294 | B8 determinism + gate-compliance | GAP | — | Render the same granulator section twice with the same seed → exported frames byte-identical (determinism); confirm export stays within the 16ms budget gate |
| 293 | B9 routing inspector UI (topology + axis picker) | COVERED | Stage C5 (Routing Canvas) | |
| 292 | B8 Granulator device panel + grain-cloud viz | COVERED | Stage C4 | |
| 291 | B9 Y-as-time slit-scan footage | GAP | — | On a B9 instrument set timeAxis=y → a vertical slit of footage maps across time; scrub and confirm the slit-scan effect (column-over-time) is visible and matches on export |
| 290 | B8 grain selection rules (random/onset) | COVERED | Stage C4 (onset selection mode) | |
| 289 | B9 axis-extended OperatorMapping + binding rules | COVERED | Stage C5 | |
| 288 | B8 grain render + 16ms budget degrade | COVERED | Stage C4 (push density until SG-8 pressure toast) | |
| 287 | B8 grain engine core (seeded, capped) | COVERED | Stage C4 | |
| 286 | SG-3 P5b.5 frontend lane-mute UX | COVERED | audit cross-cutting gate 5 | |
| 285 | SG-5 P5b.8 per-export break cache | COVERED | audit gate 5 + Gate 1 parity | |
| 284 | SG-3 P5b.4 render NaN/Inf gate | COVERED | audit gate 5 | |
| 283 | SG-5 P5b.7 toposort cycle-break | COVERED | Stage C5 (cycle pre-flight warning) | |
| 282 | SG-8 P5b.2 frontend memory status + toasts | COVERED | Stage C4 (SG-8 pressure toast + dismiss on recovery, #298) | |
| 281 | SG-3 P5b.3 latent NaN/Inf sentinel | COVERED | audit gate 5 | |
| 280 | SG-5 P5b.6 dynamic cycle detection | COVERED | Stage C5 | |
| 279 | SG-8 P5b.1 backend live wiring | COVERED | Stage C4 (SG-8) | |
| 278 | P6.11 Phase 6 closeout (test/docs) | n/a | test/docs PR | |
| 277 | P6.10 Routing Canvas overlay ⌘⇧I | COVERED | Stage C5 | |
| 276 | P6.9 graph-sync RoutingGraph | COVERED | Stage C5 | |
| 274 | P6.8 Inspector Track in timeline | COVERED | audit G8 (inspector tracks) | |
| 273 | P6.5 Metal codegen per-pixel field on GPU | GAP | — | On a Metal Mac, apply a field-capable effect using the GPU codegen path → preview renders correct field; PIL-compare GPU output vs CPU field render (parity within tolerance); confirm no GPU-orphan resource leak (probe) |
| 272 | P6.6 field-param UI + axis-lane wiring | COVERED | Stage C5 (field-param control) | |
| 271 | P6.7 probe registry wiring | COVERED | audit G8 | |
| 270 | P6.4 SG-1 Metal binding + GPU-pattern AST lint | GAP | — | Trigger a GPU-bound effect and force a GPU fault/unavailable path → app degrades gracefully with a message (no crash); confirm SG-1 resource-lifetime contract holds (no leaked GPU resource after the effect is removed) |
| 268 | P6.1 CPU row-banded lane sampling (y/x) | COVERED | Stage C5 (field domain=y/x live render) | |
| 267 | P4.6 browser op-tab + drag-to-add | COVERED | Stage J (operators) + e2e browser-op-tab-drag | |
| 266 | P6.3 field sources (image/video → 2D field) | COVERED | Stage C5 (assign image as 2D field source) | |
| 265 | P6.2 field-param schema + top-25 | COVERED | Stage C5 | |
| 264 | P4.5 operator topology graph (xyflow) | COVERED | Stage C5 / Stage J | |
| 263 | P4.4 Kentaro Cluster UI (editor + depth arcs) | COVERED | Stage J (modulation+LFO) | |
| 262 | P4.3 sidechain+gate+midiEnvStutter backend | COVERED | Stage J | |
| 261 | P4.2 Kentaro 8-LFO backend | COVERED | Stage J | |
| 260 | P4.1 operator types + caps + budget guard | COVERED | Stage J + Stage D (caps degrade) | |
| 258 | B10.3 retro-capture rolling buffer | COVERED | Stage C2 (retro-capture) | |
| 257 | B10.2 quantized launch | COVERED | Stage C2 (quantized launch ON) | |
| 256 | B10.1b perf-track freeze real bake | COVERED | Stage C2 (freeze FSM) | |
| 255 | B10.1 freeze↔voice FSM | COVERED | Stage C2 | |
| 254 | mask_thumbnail IPC + matte chips (MK.13) | COVERED | Stage F (matte chips) | |
| 252 | MK.13 tool-mode stack + marching ants | COVERED | Stage F J1 (marching ants) — NOTE MK.13 mode-BANNER unshipped (F.2) | |
| 250 | Frame-Bank flow optical-flow morph interp | GAP | — | Load Frame-Bank, interp=flow, scan across two dissimilar frames → export+decode 3 frames w/ PIL; smooth motion-compensated blend (≠ linear crossfade), not a hard cut |
| 249 | Frame-Bank persistence B6.4 | COVERED | Stage B1 (frameBank timeAxis=y round-trip) | |
| 248 | Frame-Bank UI slot strip + position knob B6.3 | GAP | — | Instantiate FrameBankDevice → slot strip populates → drag position knob → preview frame content changes (before/after screenshot) |
| 247 | Frame-Bank preview + SG-8 pressure-degrade B6.2 | GAP | — | Scrub large Frame-Bank until SG-8 pressure → toast appears, preview keeps rendering degraded (not frozen), toast dismisses on recovery |
| 246 | Frame-Bank scan + byte-budget LRU B6.1 | GAP | — | Load Frame-Bank over byte cap → scan all positions → each distinct+correct AND memory under LRU cap (sidecar probe) |
| 245 | Nested-rack preview trigger + eviction B5.3 | COVERED | Stage C3 | |
| 244 | Nested-rack editing UI B5.2 | COVERED | Stage C3 | |
| 243 | Recursive rack grouping B5.1 | COVERED | Stage C3 | |
| 242 | Pad-chain UI B4 | COVERED | Stage C3 + B1 | |
| 241 | Pad-chain engine B4 | COVERED | Stage C3 (preview half; export-parity not separate, see #236) | |
| 240 | Choke groups B4 | COVERED | Stage C3 (choke actually cuts) + B1 | |
| 239 | Pad-delete symmetric cleanup B4 | GAP | — | Rack w/ 3+ pads, one in choke group + route/automation bound → delete it → no dangling ids, choke membership+routes cleaned, others unaffected, no crash |
| 238 | Macro-editor RackDevice B4 | COVERED | Stage C3 (macro knob → 2 params) | |
| 237 | Rack editor + pad trigger B4 | COVERED | Stage C3 (trigger pads live) | |
| 236 | Sample Rack export-path parity B4 | GAP | — | Rack w/ pad chains+macros → preview → export → PIL pixel-match preview vs export at same timestamp (Gate 1, no rack-specific check exists) |
| 235 | Sample Rack 8 macros routing B4.2 | COVERED | Stage C3 + B1 | |
| 234 | Sample Rack model RackNode B4.1 | COVERED | Stage C3 | |
| 233 | Sampler melodic mode B3.4 | COVERED | Stage C2 + B1 | |
| 232 | Sampler RGB offset + glide B3.3 | COVERED | Stage B1 (persistence only, no render check) | |
| 231 | Sampler scrub/speed as mod-dest B3.2 | GAP | — | Bind LFO to sampler speed/scrub → play → oscillates per LFO (deterministic); export frames match preview at same timestamps |
| 230 | Full Sampler loop engine B3.1 | COVERED | Stage C2 + B1 | |
| 225 | MK.9 cut/copy masked region to track | GAP | — | Draw mask → Cmd+J/Cmd+Shift+J → new track has only masked pixels; source unaffected (copy) or region removed (cut); verify w/ PIL |
| 224 | MK.10 ProRes4444 alpha round-trip | COVERED | Stage F.1 J5 | |
| 223 | MK.6 magic wand + color range | COVERED | Stage F.1 J1 | |
| 222 | MK.7 matte-ops editing UI | COVERED | Stage F.1 J2 + B1 | |
| 221 | MK.8 chroma/luma key + spill + key-params-as-lanes | COVERED | UAT-PLAN Stage F.1 J4 (key: chroma/luma matte, live-modulated key param) | |
| 220 | MK.5 lasso (freehand+polygon) → polygon MatteNode | COVERED | UAT-PLAN Stage F.1 J1 (draw: marquee/lasso/wand → MatteNode) | |
| 219 | MK.4 preview marquee → MatteNode + delete/fill | COVERED | UAT-PLAN Stage F.1 J1 + shipped-bindings table (⌫/⌥⌫ delete inside/outside) | |
| 218 | MK.3 universal mask-routing wrapper [HEADLINE] | COVERED | UAT-PLAN Stage F.1 J3 (route: device chain applies THROUGH the matte) | |
| 217 | MK.2 per-pixel alpha in composite path | COVERED | UAT-PLAN Stage C6 (masked composite export, ffprobe/PIL alpha probe) + F.1 J5 | |
| 216 | PD.8 hotkey-discoverability surfaces (context-menu shortcut labels) | GAP | | Right-click an action bound to a shortcut (e.g. a clip → Split) → context menu item displays the correct live shortcut label from `shortcutRegistry` (e.g. "Split ⌘K"); change a binding in Preferences → the label updates without reload. |
| 215 | MK.1 matte data model + budget + cache + persistence | COVERED | UAT-PLAN Stage B1 (project round-trip: masks rect+lasso+wand+key, feather/invert) | |
| 213 | PD.1 audio-tracks bake kit + bake-session instrumentation | GAP | | Start playback of an audio track, then stop it → confirm `~/.creatrix/audio-bake-log.jsonl` gains exactly one new JSONL line with session start/stop timestamps and an error-delta field; force an audio error mid-session → the logged error delta is non-zero. |
| 212 | P2.3 full export parity — operators+automation+sampler+multi-track | COVERED | UAT-COMPREHENSIVE-AUDIT Cross-cutting Gate 1 (Preview==Export parity, all payload categories) + UAT-PLAN Stage C1 | |
| 203 | P5a.4 voice replay in export (deterministic backend export replay) | GAP | | Trigger sampler notes live via retro-capture on a MIDI track, then export the project (Cmd+E) → decode exported frames with PIL and confirm the rendered voice layers match the captured performance frame-for-frame (deterministic `evaluate_voices` replay), not just "export succeeds." |
| 202 | P3.6 I3 inline-probe action menu | COVERED | UAT-COMPREHENSIVE-AUDIT G9 (Inline actions: InlineActionMenu renders per context, each action invokes, error path toasts, empty-entity list) | |
| 200 | P3.5 Sampler entry (INJ-4) + Demos Drawer + onboarding | COVERED | UAT-COMPREHENSIVE-AUDIT G13 (Demos drawer + BootLine onboarding) + UAT-PLAN Stage C2 (sampler entry) | |
| 199 | P3.4 inspector hover-help + hotkeys (<8ms perf gate) | GAP | | Hover an Inspector control for the packet's threshold duration → a help tooltip renders with the control's description text (not a blank/generic tooltip); press its documented hotkey → the bound action fires; confirm no dropped frames (devtools perf) during hover, i.e. the <8ms budget holds. |
| 198 | P5a.3 voice wiring FSM → render payload, retire isPerformMode | COVERED | UAT-PLAN Stage C2 (Performance take: play notes, capture, freeze/unfreeze — watch for FSM dead-ends, frozen clip playable after reload) | |
| 197 | P3.2 EffectBrowser 5-tab evolution + search | COVERED | UAT-RESULTS-2026-07-03 Stage A (live-verified: "Effects browser 5-tab + categories render ✅ — fx/op/composite/tool/instruments") | |
| 196 | P3.3 polymorphic inspector — 8 states, info-only | GAP | | Select each of the 8 distinct inspector target types in sequence (none/clip/track/effect/operator/mask-node/marker/master) → the Inspector renders the correct info-only content for each, with no stale content bleeding over from the prior selection and no crash on rapid switching. |
| 195 | P3.1 grid shell + 4 drag handles (F_CREATRIX_LAYOUT, flag-off default) | COVERED | UAT-PLAN Stage G (B3 layout CU pass — 4 resize handles, both flag states) | |
| 194 | P5a.2 voiceId state keying + per-voice cleanup + caps | GAP | | Trigger more sampler voices simultaneously than `MAX_TOTAL_VOICES_PER_RENDER` → confirm surviving voices keep correct independent per-voice state (no cross-voice contamination after a steal) and hitting the cap produces a visible toast or graceful oldest-voice steal, never a silent drop or crash. |
| 193 | P5a.1 trigger-event schema + pure voice FSM (frontend, unwired) | COVERED | UAT-PLAN Stage C2 (same journey as #198 — this FSM is what gets exercised once wired) | |
| 191 | P2.2c composite-as-terminal-effect — render+backend rewire | COVERED | UAT-PLAN Stage G1/G3 (B3 restack → z-order render-diff; LAYER panel blend/opacity edits update preview) | |
| 190 | P2.2b composite-as-terminal-effect — UI reads chain terminal | COVERED | UAT-PLAN Stage G1/G3 (LAYER panel reads/edits the composite chain terminal) | |
| 189 | P2.2a composite-as-terminal-effect — schema+validator (v3 clean break) | COVERED | UAT-PLAN Stage B3 (legacy pre-v3 .glitch project load: no crash, drop-with-toast where designed) | |
| 188 | PUX.5 hit targets & drag signifiers — automation nodes + clip trim handles | COVERED | UAT-COMPREHENSIVE-AUDIT CD3 (Hit targets: lane breakpoints/6px dot grab tolerance, clip trim edge vs body precedence) | |
| 186 | PUX.2 dialog accessibility — Escape/focus-trap/ARIA via useModalBehavior | GAP | | Open each modal (ShortcutEditor, SpeedDialog, Export, Preferences) → Tab repeatedly and confirm focus stays trapped inside the dialog; press Escape → dialog closes and focus returns to the triggering element; inspect DOM for `role="dialog"` / `aria-modal="true"` on each. |
| 185 | P2.1 BPM split — persisted bpm vs derived effectiveBpm | GAP | | Set project BPM to a custom value (e.g. 140), add an automation/LFO lane modulating a BPM-linked param → confirm displayed `effectiveBpm` diverges from persisted `bpm` during modulation; Save → reload → confirm the reloaded `bpm` field equals the original 140 (not the modulated effectiveBpm at save-time). |
| 184 | PUX.3 focus-visible sweep | COVERED | UAT-COMPREHENSIVE-AUDIT-2026-07-03.md CD1 (Stage E checklist: focus-visible keyboard-tab score) | |
| 183 | PUX.4 slider ARIA + menu keyboard model | GAP | Explicitly declared OUT-OF-SCOPE ("Accessibility sweep... keyboard-only nav... revisit post-v1") | Tab to a slider via keyboard → arrow keys adjust value, `aria-valuenow`/`aria-label` present; open a menu via keyboard, arrow through items, Enter activates, Esc closes |
| 181 | UE.7 clip rename + clip color | GAP | none found | Double-click a clip label → inline rename (unicode/200-char clamp); pick a color swatch via context menu → clip tints in timeline; save→reload → name+color survive |
| 180 | UE.3 marquee clip selection | GAP | none found (Stage-A/D "marquee" refs are mask/automation marquee, not clip) | Drag a rubber-band rect over 3 clips → all select; shift-drag another rect → adds to selection; zero-area click → clears selection |
| 179 | PUX.1 design tokens + hex-ratchet | COVERED | UAT-RESULTS-2026-07-03.md Stage A (DevTools confirms `--cx-bg-app`/`--cx-text-1` tokens present in the running build, both sessions) | |
| 178 | drag track header to reorder + drop-zone | GAP | Session 2 attempted this exact gesture (`useTrackDragReorder.ts`) and logged "no reorder committed" — inconclusive, not a pass | Drag a track header past a neighbor → order visibly swaps AND persists on reload; one undo entry reverts it |
| 177 | UE.1 snapping (clip-edge/playhead/marker + toggle) | GAP | E4/DN3.5 only cover quantize-grid snap and modifier-consistency, not clip-edge/playhead/marker snap | Drag a clip within 8px of a neighbor edge/playhead/marker → snaps; toggle "S" off → same drag no longer snaps |
| 176 | UE.2 ripple delete + ripple trim | COVERED | UAT-COMPREHENSIVE-AUDIT-2026-07-03.md CONFIRMED BUG #29 (ripple ops don't rebase clip-transform automation — cross-cutting gate 2) | |
| 173 | UE.6 still-frame export | COVERED | UAT-PLAN-2026-07-02-live-cu.md N8 ("Export current frame as PNG" bails to Export dialog when Master has effects) | |
| 172 | UE.5 media relink / missing-media dialog | COVERED | UAT-COMPREHENSIVE-AUDIT-2026-07-03.md G12 (missing-media badge state, relink coherence) | |
| 170 | UE.4 Save As + numbered backups | GAP | Only "title follows rename/Save-As" (G16) touches this; `.bak` rotation never mentioned | File→Save As → new path, title/Cmd+S rebind; overwrite-save 6× → exactly 5 rotated `.bak.1..5` files |
| 167 | B2-lite Performance/MIDI track + draggable Sampler | COVERED | UAT-RESULTS-2026-07-03.md Session 2 Stage A3 (MIDI track + Sampler drag/double-click instantiation, live-verified) | |
| 158 | PR-B Commit-2 axis binding + domain selector | COVERED | UAT-PLAN-2026-07-02-live-cu.md Stage J3 / Completeness C7 (lane domain set to Y/X spatial vs T temporal) | |
| 157 | PR-B Commit-1 unify isTrigger+triggerMode into Interpolation | GAP | No trigger-lane-specific checkpoint anywhere | Add a Trigger lane (+ Trigger) vs a normal lane (+ Lane) on the same param → each keeps its own mode independently across R/L/T/D switching and save/reload |
| 156 | persist B1 sampler in project save/load | COVERED | UAT-PLAN-2026-07-02-live-cu.md Stage B1 (sampler loop+glide+melodic+rgbOffset+endFrame named explicitly in maximal round-trip) | |
| 155 | B1 mount sampler playable in-app | COVERED | UAT-RESULTS-2026-07-03.md Session 2 Stage A3 (sampler add + source-bind, no v2-unsupported rejection, live-verified) | |
| 153 | B1 1-voice Sampler core | COVERED | UAT-RESULTS-2026-07-03.md Session 2 Stage A3 (same evidence — Source/Start/Speed/Opacity/Blend panel rendered) | |
| 149 | sg-7 codec/decode timeout | COVERED | UAT-PLAN-2026-07-02-live-cu.md Stage D1 + UAT-RESULTS-2026-07-03.md chaos fixture kit (malformed ".txt-as-.mp4" built for exactly this hang scenario) | |
| 148 | tier1 B1+B4-lite+C1+C7 schema + demo renderer + I3 shell | COVERED | UAT-COMPREHENSIVE-AUDIT-2026-07-03.md G9 (Inline actions menu invoke/error-path/empty-list — the I3 portion) | |
| 123 | Grid Moire — true interference moiré | GAP | Zero mentions in any UAT doc (same class as the reconciliation doc's Copy Machine/3D-Spin GAP) | Add fx.grid_moire to a clip → moiré pattern visible; sweep freq_ratio/angle_offset/rotation_speed/scroll/warp/sharpness → each visibly changes it; export → frame matches preview |