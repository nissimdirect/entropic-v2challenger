# DECISIONS PENDING — /marathon plan T1 batch (2026-07-03)

All open decisions from Wave-1 drafting, each with the drafter's code-grounded **recommended default**.
T1 protocol: the four product-visible ones are asked directly; everything else is covered by the
"accept all engineering defaults" question. To OVERRIDE any individual default: note the change+OD id.
After T1, verdicts are locked into each change's proposal.md as D-locked and packetize proceeds.


## layertap-matte-v1 (6)

- **[OD-1]** v1 `stage` scope: PRD §9.1 defaults `post`, but mask resolution (apply_masks_to_chain) runs before device-chain execution in both zmq_server.py (single-clip + composite) and export.py — `post` needs a real DAG restructure (v2 territory). Ship `pre` only for v1?
  - **DEFAULT:** Yes — v1 supports stage:'pre' only; schema still parses 'post' without crashing but the v1 evaluator always reads the pre-chain frame; no stage picker in v1 UI.

- **[OD-2]** How does a 'layer' tap access another track's frame when the compositor's per-layer loop has no cross-layer frame dict today, while honoring the banked 'render order never changes output' invariant (decision 10)?
  - **DEFAULT:** Add a pre-pass over the already-fully-known `raw_layers` list (zmq_server.py:1408, export.py equivalents) that decodes+transforms every layer's frame into a track_id-keyed dict BEFORE the existing per-layer loop, making tap-source availability order-independent within one composite render.

- **[OD-3]** PRD §9.4 read taxonomy includes motion/edges/colorkey/ai_person, but video_analyzer.py's extractors are scalar-only (no per-pixel field version exists), colorkey is PRD's own v2 item, and ai_person needs ai_matte cache generalization. Narrow v1 reads?
  - **DEFAULT:** Ship read ∈ {luma, R, G, B, alpha} only for v1 (zero new extraction infra needed); defer motion/edges/colorkey/ai_person; unknown-for-v1 read values fall back to 'luma' via the already-specified §9.1 trust-boundary rule.

- **[OD-4]** PRD §10.8 wants hover-audition to use a cached last-field, never a fresh render, but no per-track continuous frame cache exists anywhere in the codebase today. Build that cache now, or do on-demand decode?
  - **DEFAULT:** v1 hover-audition triggers one debounced (~150ms) on-demand decode+read IPC call per hover — a documented deviation from §10.8's ideal; the real continuous cache gets built in v1.5 when FieldKind needs live per-frame reads anyway.

- **[OD-5]** Should a mask-stack 'layer' node be allowed to reference its own clip's track (self-tap)?
  - **DEFAULT:** UI-level restriction only: the 'From layer…' picker excludes the clip's own track. Backend still degrades gracefully (no crash) if a hand-edited project sets track_id to the own track, since OD-1's pre-only stage makes self-tap well-defined, not circular.

- **[OD-6]** Now that 'layer' auto-counts against MAX_PROCEDURAL_MATTES_PER_RENDER=4 (confirmed zero-code-change side effect of stack.py's existing _STATIC_KINDS exemption), is 4 still the right shared cap given layer taps are heavier (cross-track frame read + resize) than existing procedural kinds?
  - **DEFAULT:** Leave MAX_PROCEDURAL_MATTES_PER_RENDER=4 unchanged for v1; PRD §4 decision 14 defers exact recalibration to perf-plan Phase 4, and no measurement exists yet to justify a different number — revisit after Packet 2's fan-out/perf oracle produces real per-tap timing.


## util-transform (4)

- **[OD-1]** Edge-policy vocabulary alias: util.transform's constant/extend/tile/mirror vs the shipped Displace-family clamp/wrap/mirror/black (backend/src/effects/shared/displacement.py:16 + ~13 fx/*.py callers). Also: cv2.BORDER_WRAP reliability risk for the 'tile' policy inside a single warpAffine call.
  - **DEFAULT:** Alias table (constant→black-superset/BORDER_CONSTANT, extend→clamp/BORDER_REPLICATE, tile→wrap/BORDER_WRAP-with-manual-remap-fallback, mirror→mirror/BORDER_REFLECT_101). Do not rename the shipped Displace params. Attempt BORDER_WRAP first for 'tile'; fall back to displacement.py's manual modulo-remap pattern only if P2's probe test fails.

- **[OD-2]** Gizmo: extend the existing BoundingBoxOverlay.tsx (App.tsx:3913, bound to ClipTransform, no skew support today) in place, or fork a new component for util.transform's affine params?
  - **DEFAULT:** Extend in place; widen its prop type to a shared AffineTransformLike interface (ClipTransform stays a strict subtype without skew). Second conditional mount added to App.tsx bound to the selected util.transform device.

- **[OD-3]** DEPENDENT_PARAMS sweep-skip registry (spec vocabulary only, zero code presence anywhere) — build it now for util.transform?
  - **DEFAULT:** No — util.transform's v1 params (x/y/scale_x/scale_y/rotation/anchor/skew_x/skew_y) have no no-op-at-default param, so no entries are needed. Leave a TODO at the calibration site for fx-afterimage/fx-backspin (which do need it) to build the shared registry when they land.

- **[OD-4]** Auto-simplify-on-record-stop: source spec cites utils/rdp-simplify.ts as already shipping this for curved-segment lanes — is that the right file to wire to?
  - **DEFAULT:** No — code-grounding shows rdp-simplify.ts serves only the freehand-lasso mask tool. The actual curved-segment RDP implementation is the separate utils/automation-simplify.ts (simplifyPoints). Wire to automation-simplify.ts; this is a documentation correction, not a design choice.


## fx-afterimage (5)

- **[OD-1]** fx.afterimage already exists in backend/src/effects/fx/afterimage.py with a totally unrelated opponent-process ghost model (adaptation_rate/strength). Replace in place under the same effect_id, or fork a new id (e.g. fx.echo_trail)?
  - **DEFAULT:** Replace in place, same EFFECT_ID='fx.afterimage', category misc->temporal. No frontend refs, no fixtures reference the old params (grep-confirmed empty); project.md explicitly says clean breaks are free / no backwards-compat obligation.

- **[OD-2]** The existing auto-oracle (backend/tests/oracles/test_afterimage_oracle.py) asserts a first-frame L1 diff >= 2.0, but the new banked echo-line semantics require byte-identical passthrough at frame_index=0 (no ring/echo history yet). This will make the oracle fail once the new model ships.
  - **DEFAULT:** Rewrite the oracle to use the already-existing nth_frame_l1_distance(n=10) helper (backend/tests/oracles/conftest.py:132) instead of the first-frame-only per_pixel_l1_distance.

- **[OD-3]** mode choice list includes both 'max' and 'lighten', which are mathematically identical operations (np.maximum) under the spec's pinned single-buffer-recursive (not N-copies) implementation. Is this an intentional duplicate, or should the enum be collapsed?
  - **DEFAULT:** Keep both names verbatim (spec pins them), both call the same np.maximum kernel; document the aliasing inline so a future reviewer doesn't 'fix' it into two different formulas. Do not collapse the enum.

- **[OD-4]** The per-frame recursive echo-line update equation is prose-only in the source spec (no pseudocode). Does `mode` govern only the outer current-vs-echo composite, or also the internal recursive accumulation step?
  - **DEFAULT:** mode governs ONLY the outer composite (current vs echo_line); the internal recursive update is a fixed weighted sum (opacity*tap + feedback*transform(echo_line)), independent of mode -- consistent with the diminish formula opacity*feedback^n making no reference to mode. Implementer must verify against all 8 named oracles before considering done.

- **[OD-5]** Routing memory claims backspin rings + afterimage echo lines + copy_machine rings + tap_prev buffers share ONE SG-8-governed global temporal-buffer budget. Verified: this shared budget does not exist in code -- copy_machine's ring (the only existing effects/fx/* temporal ring) uses a purely local hard cap with zero interaction with backend/src/safety/pressure/registry.py's FeatureRegistry (which is only consumed by granulator GPU/instrument code today).
  - **DEFAULT:** fx.afterimage follows the copy_machine precedent: local hard cap only (ring <=30 frames per spec). Defer real SG-8 FeatureRegistry registration across all three effects to a later-wave ticket, consistent with UNIFICATION-2026-07-03.md's own explicit deferral of this exact item.


## fx-backspin (3)

- **[OD-1]** How does stop_mode=tempo get real BPM/FPS into fx.backspin's per-frame apply(), given apply_chain (backend/src/engine/pipeline.py:120) only passes frame_index/seed/resolution to effects today and BPM currently only reaches the separate operator/Signal-Engine path (zmq_server.py:739-751)?
  - **DEFAULT:** (b) Backend-resolves: inject new synthetic params _fps/_bpm via the existing _mix/_mask container-plumbing convention (registry.py:10-20, container.py:58-59), popped only by fx.backspin. Stays live-tempo-correct; contained additive diff, same shape as the UD-1 precedent already accepted for the field-mapping campaign.

- **[OD-2]** What shape should the ADSR spin-velocity curve editor take, given routing PRD Decision 18 asks for 'an ADSR-style curve editor with a preset bank' but the only ADSR UI in the repo (operators/EnvelopeEditor.tsx) is 4 plain numeric inputs bound to a different store/entity (Operator, not EffectInstance) and there is no draggable/visual curve component anywhere to reuse or fork?
  - **DEFAULT:** v1 = preset-bank-only: curve_a/d/s/r ship as 4 plain numeric params rendered via the already-generic ParamPanel.tsx -> Knob.tsx path, preset via the generic ParamChoice.tsx -- no new component, matching EnvelopeEditor.tsx's actual (non-visual) precedent. A draggable curve overlay is a later-wave item, not built here.

- **[OD-3]** How should the preset-choice-cascades-into-4-sibling-params UI behavior (and the reverse: editing any curve_* flips preset to 'custom') be implemented, given no effect in the codebase has this bidirectional param relationship and ParamDef has no schema hook for it?
  - **DEFAULT:** Effect-specific cascade logic scoped to fx.backspin at the single param-write call site (DeviceChain.tsx:297-302 handleUpdateParam), wrapped in the already-live-but-unused undo.ts:127-186 beginTransaction/commitTransaction API so the whole cascade lands as ONE Ledger row. Do not add a generic ParamDef.cascades schema field for a single-user feature.


## system-monitor-v1 (5)

- **[OD-1]** _effect_timing is TYPE-keyed global (UNIFICATION #70) — how to re-scope for per-instance/track rows?
  - **DEFAULT:** Add optional timing_scope kwarg to apply_chain/record_timing; single-clip preview path passes None (byte-identical); composite path passes its existing per-layer layer_id (zmq_server.py:1407-1473). Small, additive, no dependency on wave0's D-1 instance-UUID work.

- **[OD-2]** PRD's proposed hotkey Cmd+Shift+A collides with live binding meta+shift+a = mask_deselect_all (default-shortcuts.ts:86, context:'normal')
  - **DEFAULT:** Reassign to an unused meta+shift+* combo (meta+shift+{g,h,q,r,u,w,x,y} all free); recommend Cmd+Shift+U as a placeholder pending user's final mnemonic pick — do not ship Cmd+Shift+A.

- **[OD-3]** PRD wants Monitor docked 'right of the inspector' but no generic panel-slot registry exists in layout.ts (only 4 fixed named sizes)
  - **DEFAULT:** Add one new named slot (e.g. monitorPanelW) following the existing clampFinite + persistCreatrixLayout pattern — not the deferred generic panel registry (that's the separate multiwindow-stage-a epic).

- **[OD-4]** Source docs claim Monitor freeze reuses 'the same undoable command' as timeline/toast freeze, but freezePrefix/unfreezePrefix (App.tsx:2427-2468) have zero History Ledger integration today
  - **DEFAULT:** Wrap the existing freeze/unfreeze call sites in undoable() as part of this change (small, one call site, existing 4-file regression suite is the guard) rather than shipping a new user-visible freeze button with no Ledger row.

- **[residual-scope-gap]** Export-mode panel switch (frame-budget bar → realtime-factor readout during export) has no packet in the current plan
  - **DEFAULT:** Fold into Packet 5 (System Monitor panel) since is_export is already threaded through apply_chain (pipeline.py:132) — only new panel-side branching logic needed, no new IPC plumbing.


## multiwindow-stage-a (5)

- **[OD-1]** Per-window bundle strategy: separate Vite entry (pop-out precedent) vs the PRD's literal '?panel= route in the main bundle' suggestion?
  - **DEFAULT:** Separate entry (preload/monitor.ts + renderer/monitor.html + monitor-entry.tsx), mirroring pop-out's rollupOptions wiring in electron.vite.config.ts:14-29 — App.tsx is 4492 lines, a route-flag there is not cheap.

- **[OD-2]** Does this change also need to build get_perf_stats (backend) + the real Activity-Monitor table, or ship against a stub?
  - **DEFAULT:** Stub only. creatrix-routing-suite-INDEX.md build order lists 'System Monitor v1' (item 5) as a separate, earlier item than 'Multiwindow Stage A' (item 6); get_perf_stats has zero code presence and isn't in zmq-relay.ts's ALLOWED_COMMANDS. Stage A proves the window mechanics with an already-allowlisted command (freeze_prefix).

- **[OD-3]** What hotkey opens the System Monitor, given the PRD's proposed Cmd+Shift+A already belongs to mask_deselect_all (default-shortcuts.ts:86)?
  - **DEFAULT:** No new global hotkey in this change — View menu entry only, no accelerator; hotkey allocation deferred to System Monitor v1's own menu placement.

- **[OD-4]** Does the shared persistent ZMQ REQ socket (zmq-relay.ts, one socket, no visible queue/mutex) need explicit request serialization before Stage A adds a second concurrent poller?
  - **DEFAULT:** Yes — add a FIFO promise-chain wrapper around sendZmqCommand in Packet 1 as defense-in-depth; could not be verified live since the app can't be run as part of this planning task.

- **[OD-5]** Does Stage A's monitor panel ship a freeze button at all, given freeze.ts has zero undo wiring today (contradicts LayerTap PRD §10.1's 'same undoable command' claim)?
  - **DEFAULT:** If a freeze affordance ships in the stub (OD-2), it must route through a new undoable()-wrapped wrapper executed in the main renderer via the panel:dispatch/panel:command contract — never a direct sendCommand from the monitor's own process. If OD-2 resolves to stats-only, this moves entirely to the System Monitor v1 change.


## browser-folders (6)

- **[OD-1]** Delete BOTH the outer App.tsx sidebarTab (effects/presets/instruments) AND the inner EffectBrowser activeTab (fx/op/composite/tool/instruments, which duplicates INSTRUMENTS) in one packet, or descope to retiring the outer switcher first?
  - **DEFAULT:** Delete both in one motion (folded into Packet P9, sequenced last); if descoped, both INSTRUMENTS entry points must still die in the same packet to avoid a visible duplicate.

- **[OD-2]** Dead UserFolder CRUD in browser.ts (localStorage, zero callers) — reuse or delete?
  - **DEFAULT:** Delete (Packet P1) — USER LIBRARY (file-backed, ~/.creatrix/user-library/) supersedes it; keeping both would mean two competing 'save a named folder of stuff' concepts.

- **[OD-3]** Dead favorites/isFavorite/toggleFavorite Set in browser.ts (zero callers, distinct from library.ts's live preset-favorites) — reuse or delete?
  - **DEFAULT:** Reuse (Packet P7) — spec §2/§3 already describe exactly this shape (star on hover, right-click Add to Favorites); this is first-wiring, not new state.

- **[OD-4]** Does the new 'Add to Favorites' action get a History Ledger row per Hard Rule 5's undoable() convention?
  - **DEFAULT:** No — treat as a UI preference (like sidebarCollapsed), consistent with the existing preset-favorites precedent (library.ts.toggleFavorite is also not undoable today).

- **[OD-5]** GENERATORS folder lists moire/routing-graph/text in the spec, but only moire is a real registry effect (routing graph is decision-only/zero-code, text is a track-creation button, not a drag row) — how to ship the folder?
  - **DEFAULT:** Ship with the one real leaf (moire) + the Add-Text-Track button rendered as a plain action inside the drawer (not a drag row); omit or disable a routing-graph placeholder until it ships as a real effect.

- **[OD-6]** UTILITIES folder mixes 5 shipped util.* effects with the unbuilt Transform Suite (transform/corner_pin/mesh_warp) — stub the unbuilt rows or omit them?
  - **DEFAULT:** Ship with only the 5 real 'util'-category effects now; add Transform Suite rows when that separate change lands.


## history-panel-delta (5)

- **[OD-1]** No panel registry/multiwindow dock infra exists in code — how should the 'dockable home' requirement be satisfied now?
  - **DEFAULT:** Ship interim floating-panel with localStorage-persisted open/position state; defer true registry-based docking to the not-yet-built multiwindow-stage-b change.

- **[OD-2]** No frontend memory/heap-perf test precedent exists — what methodology and threshold for the 500-entry memory smoke test?
  - **DEFAULT:** Opt-in RUN_PERF=1 tier mirroring backend/tests/perf/test_routing_budget.py, run via node --expose-gc, generous starting MB budget (e.g. 50MB) until a real baseline exists.

- **[OD-3]** How should transaction expandable rows expose child data given UndoEntry has no children field today?
  - **DEFAULT:** Add optional UndoEntry.childDescriptions: string[] (lightweight, additive, session-only) rather than full child UndoEntry[], since jump targets remain whole transactions per spec.

- **[OD-4]** Source spec assumes undo()/redo() already toast on failing inverse, but code shows only execute()/undoable() do — fix now or defer?
  - **DEFAULT:** Fix in this change (footer/jump-progress feature directly depends on it); narrow try/catch+boolean-return diff in undo.ts, sequence-checked against Wave-0 Packet 0a which also touches undo.ts.

- **[OD-5]** Row op-class icons need per-entry classification but UndoEntry has no opClass field, and adding one means touching every undoable() call site (Ledger rule's job, out of scope here) — how to classify now?
  - **DEFAULT:** Heuristic classifier over entry.description keyed on the Ledger table's own keyword vocabulary (Route/Freeze/Paint/transform/etc.); revisit with an explicit opClass field once Wave-0 Packet 0a lands.
