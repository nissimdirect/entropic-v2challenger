# UAT Coverage Matrix — every 30-day feature PR mapped (authoritative, 6-worker pass)

**Ask:** "go through every PR and map it to UAT; if there's no UAT written, do it."
**Scope:** 145 `feat` PRs merged 2026-06-03→2026-07-03. **92 COVERED** (cited checkpoint that would fail if the feature broke) · **53 GAP** (checkpoint written below) · 0 n/a (test/docs).
**Method:** 6 parallel workers, real per-PR judgment (not keyword). Rebuilt from the workers' authoritative tables (superseded an earlier draft that used a nested/manual fill for 2 batches).
> **Coverage = plan-existence, not executed-evidence.** Only Stage A ran live (UAT-RESULTS-2026-07-03.md).
> **MODE:** CU = drive UI, judge from screen · CU+ORACLE = UI drive + external decode/probe · AUTOMATED = byte/memory/GPU, not screen-observable (hand to a build session).

## GAP CHECKPOINTS (53) — written UAT for uncovered PRs
| PR | feature | MODE | UAT checkpoint |
|---|---|---|---|
| 415 | AA.3-B audio-follower operator lane | CU+ORACLE | CU+ORACLE: add lane sourced from Audio-Follower on a track w/ quiet+loud audio, export range → PIL decode loud vs quiet frame, param tracks envelope + preview==export |
| 376 | H7 MIDImix bank paging + HUD | CU | CU: page BANK L/R → HUD shows new bank; move a control → drives newly-paged bank's param (not previous). HUD+binding must agree |
| 375 | H-UI hardware-mapping interface | CU | CU: click MAP → mappables highlight; click grid slot → click target param → move control → mapped param's live value changes |
| 373 | H6 velocity plumbing | CU+ORACLE | CU+ORACLE: trigger velocity pad at vel 20 vs 127 → high-vel produces measurably different output amplitude (decode/meter); identical = FAIL |
| 372 | A4 continuous-lane overdub toggle | CU | CU: arm track, Overdub ON, record 2 passes different values over same region → layers (not erase); Overdub OFF, 3rd pass → replaces. Same result in both = FAIL |
| 370 | transitions v2 effects | CU+ORACLE | CU+ORACLE: apply each of 3 transitions between clips → preview mid-transition animates; export, PIL mid-frame matches preview + differs from hard cut |
| 369 | 3D Extrude+Spin fx.extrude_spin | CU+ORACLE | CU+ORACLE: apply, sweep depth/rotation 2+ frames → preview; export frames match preview + non-identical to each other |
| 368 | Copy Machine fx.copy_machine | CU+ORACLE | CU+ORACLE: apply w/ non-default feedback/cell_size/glyph across seq frames → later frames show progressive degradation vs earlier + export==preview |
| 365 | persist controller bindings by device identity H5 | CU | CU: bind control, quit+relaunch w/ same controller → move control → param still responds without re-mapping |
| 361 | record hardware CC as automation H4 (F2 risk) | CU | CU: arm lane, move mapped CC while armed in bank A then B → each move captured as real breakpoints in the lane (not just live param). No breakpoints = the F2 regression |
| 356 | MIDI-learn → macros/instrument/transform/mask | CU | CU: arm Learn on rack macro, Sampler speed, TransformPanel field, MaskStack slider → send CC to each → binds; save/reload persists all 4 |
| 353 | Record clip-transform from bbox + numeric panel | CU | CU: arm (latch), play, drag bbox AND edit TransformPanel X/rotation → both record into lane; stopped → no lane point |
| 351 | Bank-relative hardware mapping + focus-follows | CU | CU: assign knob on Track A, focus Track B, move knob → drives B (focus-follows); legacy CC collision → bank wins w/ one-time warning |
| 347 | L0 Block tool-icon set | CU | CU (once rail built): all 14 icons render BLOCK style default+dark; cramped 1280x800 no clip |
| 345 | Focused-mapping-context selector + chip | CU | CU: select pad on A, select B w/o deselecting pad → chip stays scoped to A; cycle pad→effect→clip→track→none precedence |
| 296 | B10 MIDI Learn hardening (rate-limit+persist) | CU+ORACLE | CU: flood CC → UI responsive no runaway; echo within 80ms → no fader-fight; save/reload map byte-identical |
| 294 | B8 determinism + gate-compliance | AUTOMATED | AUTOMATED pytest: 2 unmodified exports byte-identical (sha256); edited export differs |
| 293 | B9 routing inspector UI (B9EdgeInspector) | CU | CU: create route, click edge → EdgeInspector opens (srcAxis/dstAxis/depth arc/bindingRule); change → modulation changes; save/reload survives |
| 285 | SG-5 per-export break cache + once-per-export warn | CU+ORACLE | CU+ORACLE: cyclic operator graph, export → completes w/ exactly ONE cycle warning (not per-frame); 2 exports byte-identical |
| 280 | SG-5 dynamic cycle detection (cycle_detection.py DFS) | CU | In OperatorRack, wire operators into a mapping cycle (A→B→A) → confirm a cycle-detected toast/block fires before render, and the flagged break-edge is deterministic (same cycle → same edge) across repeated attempts. |
| 278 | P6.11 Phase 6 integration+soak+ledger closeout | CU | Run field-param assignment + Y-domain automation lane + mounted probe + a routing-canvas edge together in one live session for 10+ min playback; watch RSS in Activity Monitor for growth/leak, confirm no crash. |
| 273 | P6.5 Metal/MLX per-pixel field codegen on GPU | CU+ORACLE | With MLX available, assign a field-param to an effect and render 10+ frames; independently decode via PIL and confirm GPU output is byte-identical (≤2/255) to a forced-CPU render of the same project. |
| 270 | P6.4 SG-1 real Metal (MLX) GPU binding + AST lint | CU | Trigger the 10,000-cycle allocate/destroy path on a GPU field effect live (repeatedly toggle it on/off) → confirm no RSS growth beyond +64MiB in Activity Monitor and no crash on Metal buffer teardown. |
| 267 | P4.6 browser op-tab + drag-to-add (completes Phase 4) | CU | Open EFFECTS browser → op tab → drag an LFO/Sidechain/Gate/MIDIEnvStutter operator onto a track header AND onto a param knob → confirm operator appears in OperatorRack and knob shows auto-mapping (depth 1.0) with the param visibly modulating on playback. |
| 264 | P4.5 operator topology graph (xyflow live edges) | CU | In OperatorRack, expand the "Topology" section → confirm operator→mapping→param edges render, edge thickness/color reflects depth/source, and animates live during playback (not static); collapse → graph unmounts (no lingering nodes). |
| 263 | P4.4 Kentaro Cluster UI (8-LFO editor + depth arcs) | CU | Add a Kentaro Cluster operator, open its 8-LFO editor, drag each sub-LFO's rate/depth/phase, map a sub-LFO to an effect param via sourceKey → confirm the depth arc updates live and the mapped param visibly modulates per-sub-LFO on playback. |
| 262 | P4.3 sidechain/gate/midiEnvStutter backend evaluators | CU | Add a Gate operator sourced from an LFO, sweep the source across the threshold → confirm the gated param snaps on/off with hysteresis (no flutter at the threshold boundary) in the live render. |
| 261 | P4.2 Kentaro Cluster 8-LFO backend + per-LFO routing | CU | Map two different sub-LFOs (via sourceKey) from one Kentaro Cluster to two different effect params → confirm each param oscillates independently per its own sub-LFO's rate/phase, not the cluster's master mix. |
| 254 | mask_thumbnail IPC + real 64×36 matte chips | CU | Mask a clip (rect/lasso/wand) → open its Device Chain → confirm the masked device shows a real 64×36 grayscale thumbnail (not "MSK/INV" text badge); toggle Invert → thumbnail visually inverts; on a procedural mask (chroma/luma), confirm graceful fallback to the text badge (no crash). |
| 250 | Frame-Bank flow optical-flow morph interp | CU+ORACLE | Load Frame-Bank, interp=flow, scan across two dissimilar frames → export+decode 3 frames w/ PIL; smooth motion-compensated blend (≠ linear crossfade), not a hard cut |
| 248 | Frame-Bank UI slot strip + position knob B6.3 | CU | Instantiate FrameBankDevice → slot strip populates → drag position knob → preview frame content changes (before/after screenshot) |
| 247 | Frame-Bank preview + SG-8 pressure-degrade B6.2 | CU | Scrub large Frame-Bank until SG-8 pressure → toast appears, preview keeps rendering degraded (not frozen), toast dismisses on recovery |
| 246 | Frame-Bank scan + byte-budget LRU B6.1 | CU | — |
| 239 | Pad-delete symmetric cleanup B4 | CU | — |
| 236 | Sample Rack export-path parity B4 | CU+ORACLE | Rack w/ pad chains+macros → preview → export → PIL pixel-match preview vs export at same timestamp (Gate 1, no rack-specific check exists) |
| 231 | Sampler scrub/speed as mod-dest B3.2 | CU | Bind LFO to sampler speed/scrub → play → oscillates per LFO (deterministic); export frames match preview at same timestamps |
| 225 | MK.9 cut/copy masked region to track | CU+ORACLE | Draw mask → Cmd+J/Cmd+Shift+J → new track has only masked pixels; source unaffected (copy) or region removed (cut); verify w/ PIL |
| 216 | PD.8 hotkey-discoverability surfaces (context-menu shortcut labels) | CU | Right-click an action bound to a shortcut (e.g. a clip → Split) → context menu item displays the correct live shortcut label from `shortcutRegistry` (e.g. "Split ⌘K"); change a binding in Preferences → the label updates without reload. |
| 213 | PD.1 audio-tracks bake kit + bake-session instrumentation | CU | Start playback of an audio track, then stop it → confirm `~/.creatrix/audio-bake-log.jsonl` gains exactly one new JSONL line with session start/stop timestamps and an error-delta field; force an audio error mid-session → the logged error delta is non-zero. |
| 203 | P5a.4 voice replay in export (deterministic backend export replay) | CU+ORACLE | Trigger sampler notes live via retro-capture on a MIDI track, then export the project (Cmd+E) → decode exported frames with PIL and confirm the rendered voice layers match the captured performance frame-for-frame (deterministic `evaluate_voices` replay), not just "export succeeds." |
| 199 | P3.4 inspector hover-help + hotkeys (<8ms perf gate) | CU | Hover an Inspector control for the packet's threshold duration → a help tooltip renders with the control's description text (not a blank/generic tooltip); press its documented hotkey → the bound action fires; confirm no dropped frames (devtools perf) during hover, i.e. the <8ms budget holds. |
| 196 | P3.3 polymorphic inspector — 8 states, info-only | CU | Select each of the 8 distinct inspector target types in sequence (none/clip/track/effect/operator/mask-node/marker/master) → the Inspector renders the correct info-only content for each, with no stale content bleeding over from the prior selection and no crash on rapid switching. |
| 194 | P5a.2 voiceId state keying + per-voice cleanup + caps | CU | Trigger more sampler voices simultaneously than `MAX_TOTAL_VOICES_PER_RENDER` → confirm surviving voices keep correct independent per-voice state (no cross-voice contamination after a steal) and hitting the cap produces a visible toast or graceful oldest-voice steal, never a silent drop or crash. |
| 186 | PUX.2 dialog accessibility — Escape/focus-trap/ARIA via useModalBehavior | CU | Open each modal (ShortcutEditor, SpeedDialog, Export, Preferences) → Tab repeatedly and confirm focus stays trapped inside the dialog; press Escape → dialog closes and focus returns to the triggering element; inspect DOM for `role="dialog"` / `aria-modal="true"` on each. |
| 185 | P2.1 BPM split — persisted bpm vs derived effectiveBpm | CU | Set project BPM to a custom value (e.g. 140), add an automation/LFO lane modulating a BPM-linked param → confirm displayed `effectiveBpm` diverges from persisted `bpm` during modulation; Save → reload → confirm the reloaded `bpm` field equals the original 140 (not the modulated effectiveBpm at save-time). |
| 183 | PUX.4 slider ARIA + menu keyboard model | CU | Explicitly declared OUT-OF-SCOPE ("Accessibility sweep... keyboard-only nav... revisit post-v1") |
| 181 | UE.7 clip rename + clip color | CU | Double-click a clip label → inline rename (unicode/200-char clamp); pick a color swatch via context menu → clip tints in timeline; save→reload → name+color survive |
| 180 | UE.3 marquee clip selection | CU | Drag a rubber-band rect over 3 clips → all select; shift-drag another rect → adds to selection; zero-area click → clears selection |
| 178 | drag track header to reorder + drop-zone | CU | Session 2 attempted this exact gesture (`useTrackDragReorder.ts`) and logged "no reorder committed" — inconclusive, not a pass |
| 177 | UE.1 snapping (clip-edge/playhead/marker + toggle) | CU | Drag a clip within 8px of a neighbor edge/playhead/marker → snaps; toggle "S" off → same drag no longer snaps |
| 170 | UE.4 Save As + numbered backups | CU | Only "title follows rename/Save-As" (G16) touches this; `.bak` rotation never mentioned |
| 157 | PR-B Commit-1 unify isTrigger+triggerMode into Interpolation | CU | No trigger-lane-specific checkpoint anywhere |
| 123 | Grid Moire — true interference moiré | CU | Add fx.grid_moire to a clip → moiré pattern visible; sweep freq_ratio/angle_offset/rotation_speed/scroll/warp/sharpness → each visibly changes it; export → frame matches preview |

## NEW gaps surfaced by the authoritative pass (weren't in the first draft)
- **#372 A4 overdub** — only the button-renders was checked (A7a); additive-vs-replace behavior UNTESTED. CU checkpoint written.
- **#361 hardware CC → armed lane (H4)** — the audit's F2 risk (a knob move may be a transient never written to the lane); no coverage. CU checkpoint written. Folds into hardware issue #426.
- **#353 numeric-panel transform recording**, **#293 B9EdgeInspector**, **#285 SG-5 export warn** — flipped COVERED→GAP vs the first draft (workers found the specific surface untested).

## FULL PER-PR MATRIX (145)
| PR | feature | COVERED/GAP | stage / checkpoint |
|---|---|---|---|
| 415 | AA.3-B audio-follower operator lane | GAP | Stage J covers LFO only, no audio-follower |
| 407 | AA.3-A LFO operator lane | COVERED | Stage J J2 |
| 406 | M.3 Master-chain param automation | COVERED | Stage K K4 |
| 404 | AA.2 drawn modulation lanes | COVERED | Stage J J1 + C1 |
| 403 | M.2b master_chain render/export IPC | COVERED | Stage K K3 |
| 401 | AA.3a Insert Automation Shape | COVERED | Stage I I4 |
| 399 | AA.4b transform box + flatten/ramp | COVERED | Stage I I3 |
| 398 | F_CREATRIX_LAYOUT default ON | COVERED | Stage G UPDATE + A5 |
| 397 | clip thumbnail density scales w/ zoom | COVERED | Plan "thumbnails scale with zoom #397" |
| 396 | M.1 Master-Out Bus schema+render | COVERED | Stage K K1 |
| 394 | AA.6 per-control is-automated indicator | COVERED | Stage I I5 |
| 393 | AA.4 breakpoint selection | COVERED | Stage I I2 |
| 386 | AA.1 curved-segments polish | COVERED | Stage I I1 |
| 377 | B3 lean headers + LAYER panel + restack | COVERED | Stage G G1-G4 |
| 376 | H7 MIDImix bank paging + HUD | GAP | H1-H7 no stage |
| 375 | H-UI hardware-mapping interface | GAP | only button-existence (A7b) |
| 374 | T5 cursor-tool cull + split consolidation | COVERED | Stage A A7c |
| 373 | H6 velocity plumbing | GAP | H1-H7 no stage |
| 372 | A4 continuous-lane overdub toggle | GAP | A7a checks only button renders |
| 370 | transitions v2 effects | GAP | zero UAT (effects family) |
| 369 | 3D Extrude+Spin fx.extrude_spin | GAP | zero UAT |
| 368 | Copy Machine fx.copy_machine | GAP | zero UAT |
| 365 | persist controller bindings by device identity H5 | GAP | H1-H7 no stage |
| 361 | record hardware CC as automation H4 (F2 risk) | GAP | audit F2 = unverified risk, not coverage |
| 359 | T2 slip and slide edit tools | COVERED | Stage A A7c |
| 356 | MIDI-learn → macros/instrument/transform/mask | GAP | none |
| 353 | Record clip-transform from bbox + numeric panel | GAP | G1 covers only drag path, not numeric-field recording + latch/touch gating |
| 351 | Bank-relative hardware mapping + focus-follows | GAP | none |
| 350 | MK.12 AI subject matte + Split | COVERED | Stage H U1-U6 |
| 347 | L0 Block tool-icon set | GAP | PR body: "Not mounted anywhere (that's L2)"; no rail |
| 345 | Focused-mapping-context selector + chip | GAP | none |
| 344 | Clip-transform lanes addressing + eval + preview | COVERED | G1 + Stage X5 |
| 339 | Wire razor/ripple/marker/loop/range cursor tools | COVERED | Stage A7c |
| 309 | B8 Granulator export-path parity | COVERED | Stage C4 |
| 296 | B10 MIDI Learn hardening (rate-limit+persist) | GAP | none |
| 295 | B8 GPU grain-render pass (preview MLX) | COVERED | Stage C4 (preview vs export parity) |
| 294 | B8 determinism + gate-compliance | GAP | Stage B1 = params only, not render determinism |
| 293 | B9 routing inspector UI (B9EdgeInspector) | GAP | Stage C5 = route-create+cycle only, not EdgeInspector |
| 292 | B8 Granulator device panel + viz | COVERED | Stage C4 |
| 291 | B9 Y-as-time slit-scan | COVERED | Stage B1 (timeAxis=y persist; visual not verified) |
| 290 | B8 grain selection rules | COVERED | Stage C4 (onset mode) |
| 289 | B9 axis-extended OperatorMapping | COVERED | Stage B1 (axisBinding persist); UI picker = #293 gap |
| 288 | B8 grain render + 16ms degrade | COVERED | Stage C4 (SG-8 toast) |
| 287 | B8 grain engine core | COVERED | Stage D4 (MAX_GRAINS cap) |
| 286 | SG-3 lane-mute UX | COVERED | audit G18 |
| 285 | SG-5 per-export break cache + once-per-export warn | GAP | none |
| 284 | SG-3 NaN/Inf gate + lane_aborted | COVERED | audit G18 |
| 283 | SG-5 toposort cycle-break | COVERED | audit G18 |
| 282 | SG-8 frontend memory status + toasts | COVERED | Stage C4 |
| 281 | SG-3 latent NaN/Inf sentinel | COVERED | audit G18 |
| 280 | SG-5 dynamic cycle detection (cycle_detection.py DFS) | GAP | — (Stage C5's cycle pre-flight only exercises Routing Canvas, which audit finding F7 says SKIPS this check entirely) |
| 279 | SG-8 PressureMonitor + pressure_status live wiring | COVERED | — |
| 278 | P6.11 Phase 6 integration+soak+ledger closeout | GAP | — (soak test is backend pytest only, no CU-driven equivalent) |
| 277 | P6.10 Routing Canvas overlay (⌘⇧I) | COVERED | Stage C5 ("Routing Canvas (⌘⇧I): create a route by drag, trigger the cycle pre-flight warning") |
| 276 | P6.9 RoutingGraph authoritative graph-sync (backend) | COVERED | Stage C5 (drag-to-route in Routing Canvas round-trips through `routing_graph_get`/`routing_edge_update`, per #277's own PR body) |
| 274 | P6.8 Inspector Track (probes, mute/solo) | COVERED | Stage C5 ("Inspector Track shows the lane") + Audit G8 (singleton track, probe add/remove, persistence round-trip) |
| 273 | P6.5 Metal/MLX per-pixel field codegen on GPU | GAP | — (GPU path is transparent behind CPU-parity fallback; no checkpoint distinguishes GPU-specific render correctness) |
| 272 | P6.6 field-param UI + axis-lane render wiring | COVERED | Stage C5 (assign image as 2D field source) + Stage J3 (domain=Y/X spatial axis) |
| 271 | P6.7 probe registry wiring + ZMQ snapshot (backend) | COVERED | Audit G8 ("probe rows show live values during playback") |
| 270 | P6.4 SG-1 real Metal (MLX) GPU binding + AST lint | GAP | — |
| 268 | P6.1 CPU row-banded lane sampling (domain=y/x unlock) | COVERED | Stage J3 ("set a lane's domain to Y/X... value varies DOWN/ACROSS the frame") |
| 267 | P4.6 browser op-tab + drag-to-add (completes Phase 4) | GAP | — (PR body: "Live-UX Gate-18 check deferred to batched UAT") |
| 266 | P6.3 field sources (image/video → 2D luma field provider) | COVERED | Stage C5 (backend dependency of "assign image as 2D field source") |
| 265 | P6.2 field-param schema + frozen top-25 list | COVERED | Stage C5 (backend dependency of "assign image as 2D field source") |
| 264 | P4.5 operator topology graph (xyflow live edges) | GAP | — |
| 263 | P4.4 Kentaro Cluster UI (8-LFO editor + depth arcs) | GAP | — (PR body: "Live-CU UX check deferred to the batched UAT pass") |
| 262 | P4.3 sidechain/gate/midiEnvStutter backend evaluators | GAP | — |
| 261 | P4.2 Kentaro Cluster 8-LFO backend + per-LFO routing | GAP | — |
| 260 | P4.1 operator types + caps + render-budget guard | COVERED | Stage D4 ("64 operators (MAX cap) then add one more — error comprehensible?") |
| 258 | B10.3 retro-capture (rolling buffer → Performance track) | COVERED | Stage C2 ("capture via retro-capture") |
| 257 | B10.2 quantized launch (perf triggers snap to grid) | COVERED | Stage C2 ("quantized launch ON") |
| 256 | B10.1b Ableton-style perf-track freeze (real bake) | COVERED | — |
| 255 | B10.1 performance-track freeze↔voice FSM | COVERED | Stage C2 ("Watch for: FSM dead-ends... frozen clip playable after reload") |
| 254 | mask_thumbnail IPC + real 64×36 matte chips | GAP | — (Stage F.1 J1–J5 test drawing/routing/keying/export, not the DeviceCard thumbnail) |
| 252 | MK.13 tool-mode stack + marching-ants overlay + matte chips | COVERED | — |
| 250 | Frame-Bank flow optical-flow morph interp | GAP | — |
| 249 | Frame-Bank persistence B6.4 | COVERED | Stage B1 (frameBank timeAxis=y round-trip) |
| 248 | Frame-Bank UI slot strip + position knob B6.3 | GAP | — |
| 247 | Frame-Bank preview + SG-8 pressure-degrade B6.2 | GAP | — |
| 246 | Frame-Bank scan + byte-budget LRU B6.1 | GAP | — |
| 245 | Nested-rack preview trigger + eviction B5.3 | COVERED | Stage C3 |
| 244 | Nested-rack editing UI B5.2 | COVERED | Stage C3 |
| 243 | Recursive rack grouping B5.1 | COVERED | Stage C3 |
| 242 | Pad-chain UI B4 | COVERED | Stage C3 + B1 |
| 241 | Pad-chain engine B4 | COVERED | Stage C3 (preview half; export-parity not separate, see #236) |
| 240 | Choke groups B4 | COVERED | Stage C3 (choke actually cuts) + B1 |
| 239 | Pad-delete symmetric cleanup B4 | GAP | — |
| 238 | Macro-editor RackDevice B4 | COVERED |  |
| 237 | Rack editor + pad trigger B4 | COVERED | Stage C3 (trigger pads live) |
| 236 | Sample Rack export-path parity B4 | GAP | — |
| 235 | Sample Rack 8 macros routing B4.2 | COVERED | Stage C3 + B1 |
| 234 | Sample Rack model RackNode B4.1 | COVERED | Stage C3 |
| 233 | Sampler melodic mode B3.4 | COVERED | Stage C2 + B1 |
| 232 | Sampler RGB offset + glide B3.3 | COVERED | Stage B1 (persistence only, no render check) |
| 231 | Sampler scrub/speed as mod-dest B3.2 | GAP | — |
| 230 | Full Sampler loop engine B3.1 | COVERED | Stage C2 + B1 |
| 225 | MK.9 cut/copy masked region to track | GAP | — |
| 224 | MK.10 ProRes4444 alpha round-trip | COVERED | Stage F.1 J5 |
| 223 | MK.6 magic wand + color range | COVERED | Stage F.1 J1 |
| 222 | MK.7 matte-ops editing UI | COVERED | Stage F.1 J2 + B1 |
| 221 | MK.8 chroma/luma key + spill + key-params-as-lanes | COVERED | UAT-PLAN Stage F.1 J4 (key: chroma/luma matte, live-modulated key param) |
| 220 | MK.5 lasso (freehand+polygon) → polygon MatteNode | COVERED |  |
| 219 | MK.4 preview marquee → MatteNode + delete/fill | COVERED | UAT-PLAN Stage F.1 J1 + shipped-bindings table (⌫/⌥⌫ delete inside/outside) |
| 218 | MK.3 universal mask-routing wrapper [HEADLINE] | COVERED | UAT-PLAN Stage F.1 J3 (route: device chain applies THROUGH the matte) |
| 217 | MK.2 per-pixel alpha in composite path | COVERED | UAT-PLAN Stage C6 (masked composite export, ffprobe/PIL alpha probe) + F.1 J5 |
| 216 | PD.8 hotkey-discoverability surfaces (context-menu shortcut labels) | GAP | Right-click an action bound to a shortcut (e.g. a clip → Split) → context menu item displays the correct live shortcut label from `shortcutRegistry` (e.g. "Split ⌘K"); change a binding in Preferences → the label updates without reload. |
| 215 | MK.1 matte data model + budget + cache + persistence | COVERED | UAT-PLAN Stage B1 (project round-trip: masks rect+lasso+wand+key, feather/invert) |
| 213 | PD.1 audio-tracks bake kit + bake-session instrumentation | GAP | Start playback of an audio track, then stop it → confirm `~/.creatrix/audio-bake-log.jsonl` gains exactly one new JSONL line with session start/stop timestamps and an error-delta field; force an audio error mid-session → the logged error delta is non-zero. |
| 212 | P2.3 full export parity — operators+automation+sampler+multi-track | COVERED | UAT-COMPREHENSIVE-AUDIT Cross-cutting Gate 1 (Preview==Export parity, all payload categories) + UAT-PLAN Stage C1 |
| 203 | P5a.4 voice replay in export (deterministic backend export replay) | GAP | Trigger sampler notes live via retro-capture on a MIDI track, then export the project (Cmd+E) → decode exported frames with PIL and confirm the rendered voice layers match the captured performance frame-for-frame (deterministic `evaluate_voices` replay), not just "export succeeds." |
| 202 | P3.6 I3 inline-probe action menu | COVERED | UAT-COMPREHENSIVE-AUDIT G9 (Inline actions: InlineActionMenu renders per context, each action invokes, error path toasts, empty-entity list) |
| 200 | P3.5 Sampler entry (INJ-4) + Demos Drawer + onboarding | COVERED | UAT-COMPREHENSIVE-AUDIT G13 (Demos drawer + BootLine onboarding) + UAT-PLAN Stage C2 (sampler entry) |
| 199 | P3.4 inspector hover-help + hotkeys (<8ms perf gate) | GAP | Hover an Inspector control for the packet's threshold duration → a help tooltip renders with the control's description text (not a blank/generic tooltip); press its documented hotkey → the bound action fires; confirm no dropped frames (devtools perf) during hover, i.e. the <8ms budget holds. |
| 198 | P5a.3 voice wiring FSM → render payload, retire isPerformMode | COVERED | UAT-PLAN Stage C2 (Performance take: play notes, capture, freeze/unfreeze — watch for FSM dead-ends, frozen clip playable after reload) |
| 197 | P3.2 EffectBrowser 5-tab evolution + search | COVERED | UAT-RESULTS-2026-07-03 Stage A (live-verified: "Effects browser 5-tab + categories render ✅ — fx/op/composite/tool/instruments") |
| 196 | P3.3 polymorphic inspector — 8 states, info-only | GAP | Select each of the 8 distinct inspector target types in sequence (none/clip/track/effect/operator/mask-node/marker/master) → the Inspector renders the correct info-only content for each, with no stale content bleeding over from the prior selection and no crash on rapid switching. |
| 195 | P3.1 grid shell + 4 drag handles (F_CREATRIX_LAYOUT, flag-off default) | COVERED | UAT-PLAN Stage G (B3 layout CU pass — 4 resize handles, both flag states) |
| 194 | P5a.2 voiceId state keying + per-voice cleanup + caps | GAP | Trigger more sampler voices simultaneously than `MAX_TOTAL_VOICES_PER_RENDER` → confirm surviving voices keep correct independent per-voice state (no cross-voice contamination after a steal) and hitting the cap produces a visible toast or graceful oldest-voice steal, never a silent drop or crash. |
| 193 | P5a.1 trigger-event schema + pure voice FSM (frontend, unwired) | COVERED | UAT-PLAN Stage C2 (same journey as #198 — this FSM is what gets exercised once wired) |
| 191 | P2.2c composite-as-terminal-effect — render+backend rewire | COVERED | UAT-PLAN Stage G1/G3 (B3 restack → z-order render-diff; LAYER panel blend/opacity edits update preview) |
| 190 | P2.2b composite-as-terminal-effect — UI reads chain terminal | COVERED | UAT-PLAN Stage G1/G3 (LAYER panel reads/edits the composite chain terminal) |
| 189 | P2.2a composite-as-terminal-effect — schema+validator (v3 clean break) | COVERED | UAT-PLAN Stage B3 (legacy pre-v3 .glitch project load: no crash, drop-with-toast where designed) |
| 188 | PUX.5 hit targets & drag signifiers — automation nodes + clip trim handles | COVERED | UAT-COMPREHENSIVE-AUDIT CD3 (Hit targets: lane breakpoints/6px dot grab tolerance, clip trim edge vs body precedence) |
| 186 | PUX.2 dialog accessibility — Escape/focus-trap/ARIA via useModalBehavior | GAP | Open each modal (ShortcutEditor, SpeedDialog, Export, Preferences) → Tab repeatedly and confirm focus stays trapped inside the dialog; press Escape → dialog closes and focus returns to the triggering element; inspect DOM for `role="dialog"` / `aria-modal="true"` on each. |
| 185 | P2.1 BPM split — persisted bpm vs derived effectiveBpm | GAP | Set project BPM to a custom value (e.g. 140), add an automation/LFO lane modulating a BPM-linked param → confirm displayed `effectiveBpm` diverges from persisted `bpm` during modulation; Save → reload → confirm the reloaded `bpm` field equals the original 140 (not the modulated effectiveBpm at save-time). |
| 184 | PUX.3 focus-visible sweep | COVERED | UAT-COMPREHENSIVE-AUDIT-2026-07-03.md CD1 (Stage E checklist: focus-visible keyboard-tab score) |
| 183 | PUX.4 slider ARIA + menu keyboard model | GAP | Explicitly declared OUT-OF-SCOPE ("Accessibility sweep... keyboard-only nav... revisit post-v1") |
| 181 | UE.7 clip rename + clip color | GAP | none found |
| 180 | UE.3 marquee clip selection | GAP | none found (Stage-A/D "marquee" refs are mask/automation marquee, not clip) |
| 179 | PUX.1 design tokens + hex-ratchet | COVERED | UAT-RESULTS-2026-07-03.md Stage A (DevTools confirms `--cx-bg-app`/`--cx-text-1` tokens present in the running build, both sessions) |
| 178 | drag track header to reorder + drop-zone | GAP | Session 2 attempted this exact gesture (`useTrackDragReorder.ts`) and logged "no reorder committed" — inconclusive, not a pass |
| 177 | UE.1 snapping (clip-edge/playhead/marker + toggle) | GAP | E4/DN3.5 only cover quantize-grid snap and modifier-consistency, not clip-edge/playhead/marker snap |
| 176 | UE.2 ripple delete + ripple trim | COVERED | UAT-COMPREHENSIVE-AUDIT-2026-07-03.md CONFIRMED BUG #29 (ripple ops don't rebase clip-transform automation — cross-cutting gate 2) |
| 173 | UE.6 still-frame export | COVERED | UAT-PLAN-2026-07-02-live-cu.md N8 ("Export current frame as PNG" bails to Export dialog when Master has effects) |
| 172 | UE.5 media relink / missing-media dialog | COVERED | UAT-COMPREHENSIVE-AUDIT-2026-07-03.md G12 (missing-media badge state, relink coherence) |
| 170 | UE.4 Save As + numbered backups | GAP | Only "title follows rename/Save-As" (G16) touches this; `.bak` rotation never mentioned |
| 167 | B2-lite Performance/MIDI track + draggable Sampler | COVERED | UAT-RESULTS-2026-07-03.md Session 2 Stage A3 (MIDI track + Sampler drag/double-click instantiation, live-verified) |
| 158 | PR-B Commit-2 axis binding + domain selector | COVERED | UAT-PLAN-2026-07-02-live-cu.md Stage J3 / Completeness C7 (lane domain set to Y/X spatial vs T temporal) |
| 157 | PR-B Commit-1 unify isTrigger+triggerMode into Interpolation | GAP | No trigger-lane-specific checkpoint anywhere |
| 156 | persist B1 sampler in project save/load | COVERED | UAT-PLAN-2026-07-02-live-cu.md Stage B1 (sampler loop+glide+melodic+rgbOffset+endFrame named explicitly in maximal round-trip) |
| 155 | B1 mount sampler playable in-app | COVERED | UAT-RESULTS-2026-07-03.md Session 2 Stage A3 (sampler add + source-bind, no v2-unsupported rejection, live-verified) |
| 153 | B1 1-voice Sampler core | COVERED | UAT-RESULTS-2026-07-03.md Session 2 Stage A3 (same evidence — Source/Start/Speed/Opacity/Blend panel rendered) |
| 149 | sg-7 codec/decode timeout | COVERED | UAT-PLAN-2026-07-02-live-cu.md Stage D1 + UAT-RESULTS-2026-07-03.md chaos fixture kit (malformed ".txt-as-.mp4" built for exactly this hang scenario) |
| 148 | tier1 B1+B4-lite+C1+C7 schema + demo renderer + I3 shell | COVERED | UAT-COMPREHENSIVE-AUDIT-2026-07-03.md G9 (Inline actions menu invoke/error-path/empty-list — the I3 portion) |
| 123 | Grid Moire — true interference moiré | GAP | Add fx.grid_moire to a clip → moiré pattern visible; sweep freq_ratio/angle_offset/rotation_speed/scroll/warp/sharpness → each visibly changes it; export → frame matches preview |