# 02 — CROSS-REFERENCE: every plan, up · down · across

Owner instruction (2026-11-06, verbatim): *"Cross-reference all the plans, build them all the way up and all the way down and all the way across. Make sure that there's no contradictions, surface any issues."*

Source tree `docs/spec-pass` (product code = origin/main 4dc01de). PLANNING ONLY — nothing here changes code or ratified law.
**Result: the plans are NOT contradiction-free.** 138 distinct contradictions (14 blocking against law), 123 gaps, 61 shared-resource conflicts, 58 supersede chains whose older doc carries no header, 79 open questions. **Coverage: 340 of 340 docs referenced by a reader** (tooling + this pass's own docs exempt). Each is listed with cites in the generated layer; this file is the adjudicated synthesis.

## Method

| layer | what | output |
|---|---|---|
| Mechanical (script) | `tools/crossref.mjs` over **340 docs** (every tracked .md outside code: law, openspec, roadmap, packets, plans, phases, decisions, UAT, research, spec-pass, repo root — phase 1 covered 205). Extracts: law-row cites (UP), code anchors + store/component refs (DOWN), 1084 hotkey claims over 102 keys joined to the code registry, 745 decision/packet id definitions (108 collide), 82 lines restating retired law values (ACROSS). | `inventory/crossref.json`, `inventory/CROSSREF.md` |
| Semantic (9 readers) | one reader per object cluster: lifecycle O01/O14/O15/O16 · timeline O02/O03/O09 · devices O04/O05/O10 · control O06/O07/O13 · tools-keys O08/O11 + global hotkey map · shell O12/O17 + visual law · governance (status truth, id namespaces, authority/build order, supersede chains) · **remainder + remainder2** (the 75 non-exempt docs the first seven never referenced, plus 1 overlap — phases, contracts, addendums, q7 decisions, UAT plans; each gets a `docVerdicts` row). Brief: `tools/crossref-brief.md`. | `inventory/crossref/*.json` → `tools/merge-crossref.mjs` → `inventory/CROSSREF-SEMANTIC.md` |
| Coverage oracle | `merge-crossref.mjs` lists every universe doc no reader output mentions → **0** (was 75 non-exempt after the first seven readers; two coverage readers closed it). | `CROSSREF-SEMANTIC.md` §Coverage oracle |
| Adjudication | ≥2 independent orchestrator checks per reader (grep/Read), recorded in `inventory/crossref-adjudications.json`. **22 checks across 9 readers, 22 confirmed, 0 refuted.** Two severities raised to blocking (live D6 oracles, X-shell-10/11). | this file |

Regenerate: `node docs/spec/tools/crossref.mjs && node docs/spec/tools/merge-crossref.mjs`.

## §1 · Live behavior bugs surfaced (outside spec scope — owner call: fix now under the freeze's bug-fix exception, or fold into the object spec)

| # | bug | evidence (orchestrator-checked unless marked) | object |
|---|---|---|---|
| B1 | **Per-track effect automation probably never reaches the renderer.** Lanes are keyed by instance uuid (`Track.tsx:113` `${effect.id}.${key}`); `evaluateAutomationOverrides.ts:200` emits that path as-is; `App.tsx:1748` sends it as `automation_overrides`; backend matches `f"{eid}.{param_key}"` where `eid` = effect TYPE (`backend/src/modulation/engine.py:701`, wire `shared/ipc-serialize.ts:45`). `modulateChain` (`App.tsx:194-218`) applies pads + CC only. The code concedes the gap in a comment (`evaluateAutomationOverrides.ts:238-242`). **Static only — NOT runtime-reproduced** (gate 6: reproduce before any fix). Same root cause as the known LFO/modulation bug → one identity key fixes both (X-control-4: the owner-locked UD-1 scope covers only `routing.py effect_map`). **Required oracle for any fix or spec:** render one frame with an instance-keyed lane at two values through all three seams — preview `render_frame`, `render_composite`, export — and assert the pixels differ; the same key rule must cover type-keyed master lanes (ledger CX-59d4837e) and modulation writers (CX-4edbfbb3, CX-0efe52f5). | ✔ static chain | O06 O07 |
| B2 | Close-gate **Save & Quit ignores `saveProject()`'s result** → cancelling the save dialog still quits (data loss). New/Open gate honors it. | `app/useCloseGate.ts:8-11` (self-documented + characterization test) | O01 |
| B3 | **D2 broken in render:** layers sent as `[...video, ...text, ...sampler, ...rack]` (`App.tsx:1674-1678`); compositor takes the list bottom-to-top (`backend/src/engine/compositor.py:301`) → text always above all video regardless of row order. | ✔ | O02 |
| B4 | `isDirty` is undo-derived → non-undoable edits (asset add/remove, relink, freeze, A/B) never mark the project dirty or autosave (`project-persistence.ts:1926`). | reader (lifecycle) | O01 |
| B5 | `getActiveTrackId()` has no track-type filter (`stores/project.ts:679`) → selecting Master/audio/text retargets export + freeze; likely double master chain on export. | reader, runtime unverified | O15 O14 |
| B6 | Freeze is cosmetic: renderer never calls `read_freeze` (only the relay allowlist `main/zmq-relay.ts:61`); no prefix invalidation on edit; not saved / not cleared on New/Open; keyed by array index. | ✔ (`read_freeze`) | O14 |
| B7 | Right-click on a track-chain knob resets the value AND opens the Automate menu (`Knob.tsx:149-152` no `stopPropagation`; wrapper `DeviceCard.tsx:418-430`); records a default point when armed. Tests miss it (fire on wrapper). | ✔ | O05 |
| B8 | Bare `p` arms perform mode but the armed-pad branch swallows bare keys (`App.tsx:1065-1100`) → `p` may not disarm. | reader, runtime unverified | O12 |
| B9 | Raw `Delete` branch (`App.tsx:1148`) skips the mask delete-inside priority that Backspace follows → deletes the clip while ants show. Held tool keys auto-repeat the group cycle (no `e.repeat` guard on registry path). | ✔ Space/Delete order (`App.tsx:1138-1150`) | O08 O11 |
| B11 | PERFORM badge renders inline `fontSize: 11` (`App.tsx:4324`) — below the D6 12px floor; inline style objects may be a blind spot of the type-floor ratchet (open). | ✔ | O12 |
| B10 | Loop: `isLooping` (whole duration) and `loopRegion` (wraps at out point, ignores `isLooping`) are two independent mechanisms; loop brace has no drag handlers (`LoopRegion.tsx`). | ✔ brace | O09 |

## §2 · Law vs reality — the 14 blocking contradictions

| id | law | contradiction | resolution needed |
|---|---|---|---|
| X-shell-5 | **D3** "right-dock LAYER panel" | LayerPanel mounted in the LEFT column (`App.tsx:3709,3774`; grid `creatrix-shell.css:50`). Not in any phase-1 finding. | owner: amend D3 wording or move panel |
| X-timeline-3 | **D2** row order = z-order | B3 above | bug fix |
| X-timeline-1 | **D12** "any lane bed … any track" | audio + inspector lanes mount no MarqueeOverlay (only `Track.tsx:709`, `MasterTrack.tsx:215`) | spec O09 |
| X-timeline-2 | **D12** lane-bed drag | visible automation-lane SVG (own 2-D marquee, `AutomationLane.tsx:290,416`) and Draw overlay cover the bed (static stacking analysis) | systems/selection + O06 |
| X-timeline-5 | **D12** loop brace "independently draggable" | no handlers | bug or law amend |
| X-timeline-6 | **D12** Cmd+L = selection→loop | in-app help says "Loop Toggle (Cmd+L)" (`help-registry.ts:53`) | doc fix |
| X-devices-1 | **D10** "ONE permanent rail" | browser-folders `plan.md:48` keeps Cmd+B hiding the panel that contains the rail; uat P9-5 / DoD-9 test it | owner |
| X-shell-1 | **D13** transport far-right reserved for CPU/MEM | system-monitor-v1 puts meters in statusbar (known; new: `MemoryStatus` is a fixed overlay at `App.tsx:4532`, plan cite stale) | owner (§S5.3 of 01) |
| X-tools-keys-1 | **D4a** (amended 2026-07-30: 6 groups — SELECT V · TRIM B · MASK-SHAPE Q · MASK-FREE W · KEY E · MARK/LOOP Shift+M; bare m = add_marker) | MASKING-INTERACTIONS old letters survive OUTSIDE the superseded §1 table (:99, :172, :500-506, :667); UAT docs use `l` (= transport_forward) for lasso | header sweep #2 |
| X-timeline-13 | **D4/D4a** wire icons, 6 groups | B3 PRD still locks BLOCK icons + 4-group order | header sweep #2 |
| X-shell-10 | **D6** (amended → Scale B+1: data 12/450, app floor 12px) | ui-foundation `plan.md` / `uat.md` executable oracles still assert 11px, no header | header sweep #2 (oracles must be re-pointed, not just headed) |
| X-remainder2-7 | **D6** 12px floor | live code: `App.tsx:4324` inline 11px (B11) | bug fix + ratchet check |
| X-remainder2-1 | **D13/D13.1** | `UAT-TEST-PLANS-FROM-BDD.md` TP-Z7 still tests R/L/T/D buttons on the automation bar; code has `automation-mode-select` (`App.tsx:3679`). Same plan also expects "Entropic" strings and asserts now-fixed keys are broken (X-remainder2-2/3) | owner: re-baseline or header that test plan |
| X-shell-11 | **D6** | DESIGN-SPEC rows 183/184/209/219/224 + MASKING-INTERACTIONS:302 specify 11px outside the §3 header | header sweep #2 |

Also law-adjacent (material): **D13** premise "lane-level painting still works" is false — `setMode` has one caller, the dropdown with no Draw option (`App.tsx:3676`); no lane pencil exists (X-control-7). **D13.1** take deletion has no UI (`removeLane` uncalled). **D3** "never the header" violated on the flag-OFF legacy header (`Track.tsx:592-618`, X-shell-6/X-timeline-10). **REAL-DIMENSIONS-ONLY** claims a mock-registry grep that does not exist; `ui-foundation-frame.html:117` still `width:1600px` (X-shell-13). **REAL-INVENTORY-ONLY** is cited as law but has no table row. **D4** row still says "8 groups" (D4a = 6).

## §3 · Across — plan ↔ plan conflicts (grouped; several readers found the same conflict independently)

**3a. Hotkeys** (26 keys with >1 meaning; registry `context` is inert because `setContext()` has no callers, so no doc's "context-scoped" binding is real today):

| key | claimants | ids |
|---|---|---|
| Cmd+Shift+I | Routing Canvas (shipped `default-shortcuts.ts:58`) vs mask Invert (MASKING-INTERACTIONS:377, masking.md:293) | X-tools-keys-2 = X-control-8 |
| Cmd+Shift+M | promote-selection-to-mask vs New MIDI Track (multiwindow proposal:56) vs … ; decisions 19/32 not in repo | X-tools-keys-3 |
| Cmd+Shift+T / Cmd+Shift+M | new performance track — INSTRUMENTS.md:260 + UX-SPEC.md:311 vs multiwindow; code binds neither | X-tools-keys-4 = X-shell-8 |
| Cmd+T | add text track (code) vs "new video track" (UX-SPEC) vs Free Transform (Dimensional Translation PRD) | X-timeline-8 = X-tools-keys-11 |
| Cmd+Shift+P | dead `toggle_popout` row (advertised in `help-registry.ts:78`) vs command-palette candidate | X-shell-9 = X-tools-keys-10 |
| Cmd+K / Cmd+Shift+K | split: code Cmd+K; UX-SPEC, PRD, UAT test 249 still Cmd+Shift+K | X-tools-keys-12 |
| Cmd+C/V | automation copy: docs Cmd+C/V, code Cmd+Shift+C/V; Edit-menu roles may eat Cmd+C/V (runtime open) | X-tools-keys-13 |
| Cmd+Y | history panel: plan.md:115 + PLANNING-QUEUE:24 promise it; T1 verdict + uat.md:41 say menu-only | X-lifecycle-1 = X-tools-keys-17 |
| p / Cmd+P, m / Cmd+M | old docs Cmd+P/Cmd+M; code bare p / bare m | X-shell-7, X-tools-keys-14/15 |
| Alt during drag | law D12 + selection pattern: snap bypass; preview tools: subtract / grow-from-center (`MaskSelectOverlay.tsx:496`) | X-tools-keys-16 |
| Space, Delete, Escape | mask doc mid-gesture semantics vs unconditional transport/delete | X-tools-keys-6/7 |
| freeze/unfreeze/flatten, save_effect_preset, save_chain_preset, group_with_previous | menus show shortcut chips for actions absent from the registry | lifecycle + devices gaps |

**3b. Right-click on a parameter** means four things by context: reset+Automate (track chain), reset only (pad chain), MIDI-learn arm (instruments), "Map to Macro" (planned T3.10) — X-devices-10, X-control-9. Needs one rule in systems/context-menus.

**3c. Signal precedence on one param — no law row, docs disagree.** Automation STACKS with modulation (`SIGNAL-ARCHITECTURE.md:189`, `PHASE-7.md:25`) vs REPLACES it (`UAT-UIT-GUIDE.md:892`, `engine.py:637`, AA.3). Runtime: pads → CC → operators → automation REPLACE → operator-lane REPLACE → clamp, so an LFO on an automated param does nothing. Ghost resolver orders CC after automation and is dead code (`resolveGhostValues.ts:51`; DeviceChain mounted without `modulatedValues`, `App.tsx:4222`) — X-control-1/2/6.

**3d. Ownership deadlocks.**
- Panel registry: device-monitors-v1 assumes system-monitor-v1 builds it, which defers to multiwindow-stage-a, which defers to Stage B. The cycle has no owner (X-shell-3 = X-devices-7).
- Docked System Monitor: there are 3 incompatible mechanisms (X-shell-4).
- Monitor OS window: there are 2 competing preload/entry/persistence designs (X-shell-2).
- Layout state has 7 persistence sources and no migration owner.

**3e. Freeze-undo.**
- system-monitor-v1 calls it a "locked default (a)", while STATE lists it as an open owner decision. Two changes (system-monitor-v1 and multiwindow-stage-a) both wrap freeze in `undoable()` (X-lifecycle-3, X-governance-22).
- Undoable freeze would consume an undo entry when the store silently no-ops while busy (`freeze.ts:50`, X-lifecycle-4).
- History-panel examples depend on undoable freeze (X-lifecycle-16).

**3f. Presets and macros.**
- There are 3 macro models: preset `MacroMapping`, `RackMacro` and T3.9 Macro.
- wave0 PK.1 "materializes" macros, while T3.9 leaves them untouched (X-devices-6).
- Preset drag has a source and no drop target, yet 2 plans say it works or must be kept (X-devices-5).
- User-saved items go to 2 destinations: `<Documents>/Creatrix/Presets` vs `~/.creatrix/user-library/` (X-devices-15).

**3g. Taps.** "One tap primitive, two consumers" is false: device-monitors uses a chain-prefix tap, while LayerTap uses an in-composite pre-pass (X-devices-8).

**3h. Modulation writers.** The pattern doc says all writers write instance ids. `RoutingCanvas.tsx:346` writes the TYPE id, so it is the one writer that currently works on the wire. Dangling-target cleanup exists (`crossStoreCleanup.ts:76`) but is instance-keyed, so it never prunes canvas mappings (X-control-3/5).

**3i. Contracts vs code (remainder readers).** The contract docs describe a system that was never built or has since moved:
- `IPC-PROTOCOL`, `TECH-STACK`, `SECURITY`, `PHASE-0B` and `BUILD-BLUEPRINT` ("start here") specify an mmap shared-memory frame ring. Code sends base64 MJPEG instead (`zmq_server.py:658`).
- The IPC command table lists `render_range` and `audio_analyze`, which don't exist, and omits about 45 live commands. The real contract is `ALLOWED_COMMANDS` (`main/zmq-relay.ts:39`) plus the dispatch at `zmq_server.py:386-591`, both test-enforced.
- `DATA-SCHEMAS` Track still carries `opacity`/`blendMode` (removed, `shared/types.ts:115-120`) and gives 2 track types where code has 6.
- `paramPath` has 4 incompatible forms across docs and code. This is the same root cause as B1.
- `SECURITY` says a 3,000-frame cap (code: 300,000, `security.py:39`), a 30 s decode timeout (code: 5 s) and an optional auth token (code: mandatory).
- The constitution says "exactly 6" preload methods and 8 stores. Code has about 40 bridge members, including renderer file write/delete, and 23 stores.
- The 2026-04-16 "canonical" state-of-union says OperatorRack is unmounted. It is mounted at `App.tsx:4124`.
- The addendums say tempo is off by default. Code always has `bpm` = 120.
- Q7 decisions DEC-003/010/011/017 and EFFECT-CONTRACT were verified clean against code. Only 2 of 10 SG-8 degrade stages have runtime hooks.

**Recommendation:** each contract doc gets a "superseded by code: <file>" header, and `docs/spec` regenerates the contract tables from code, since the allowlist and dispatch are already test-enforced.

## §4 · Status truth drifts (governance)

ROADMAP and EXECUTION-PLAN status lags main:
- MK.12 is shipped (c120a81, #350) but marked ❌.
- `phase-4.md`, `phase-5a.md` and `undo-history.md` headers are frozen pre-merge.
- wave0 PK.00 is ⬜ although #448/#449 merged.
- openspec 01–06 `tasks.md` are 0% ticked although PR-zero shipped (#116).
- `INDEX.md` disagrees with itself (:30 vs :35) and with ROADMAP on Q7.
- One UAT doc carries CONDITIONAL GO and GO with no supersede marker.
- Repo-root `CLAUDE.md:43` says "8 Zustand stores" (23 exist) and points at April UAT results.
- `CONTRIBUTING.md:92` says the law lives only in `~/.claude/plans`.

The 54 other lane-2 packet ledgers were spot-checked and are accurate (⬜, no code).

## §5 · ID namespace hazard (new, systemic)

108 ids are DEFINED in more than one doc:
- local `D1`–`D10` in 17 docs collide with law D1–D10;
- `PK.1` is defined in 12 docs;
- `OD-1`..`OD-5` are defined across 5 docs, and 8 sections of DECISIONS-PENDING.

Confirmed wrong-resolution risks:
- `EXECUTION-PLAN.md:243-245` "Decision D1/D4" means the PR-B plan's decisions.
- The MK12 PRD uses "D5" for two different non-law decisions.
- Law D4's own row says "ripple D5" (a glyph label).
- MASKING-INTERACTIONS defines its own D1–D13, which collide with law D9/D13.

**Proposed convention (for phase 5):** bare `D#`/`R#` are reserved for `docs/frontend` law. Everything else is qualified: `<change>/OD-2`, `<change>:PK.1`, `MI-D13`, `PRB-D4`. `coverage.mjs` (phase 3) can lint it.

## §6 · Gaps (100; full list CROSSREF-SEMANTIC.md §Gaps)

| kind | n | headline items |
|---|---|---|
| no-law | 19 | Load-bearing decisions with no RATIFIED row: tune-up D1 cursor tools, D3 clip/track lock, field-mapping apply-preset menu, history-panel OD-1, w15b OD-1 inspector rename, signal precedence (§3c), REAL-INVENTORY-ONLY row itself |
| no-test | 17 | Master delete guard; `knob.test.ts:104` is a tautology; `epic04-export-pertrack` test mirrors its own helper; device-chain right-click test bypasses Knob |
| unreachable | 15 | `RenderQueue` / `addJob`; marker drag (`moveMarker` uncalled); `rippleTrimClipOut`; chroma/luma key matte creation; slot-learned CC targets; Draw mode; take deletion; `onOpenDemo` stub; Preferences "Autosave folder" inert |
| no-plan (orphan code) | 15+ | **Text tracks (A15):** Cmd+T create, preview click places a 5 s clip, TextOverlay drag, TextPanel style, composites above video. Also the ruler vertical-drag zoom |
| no-owner | 14 | Panel registry; preset drop target; layout-state migration; Edit-menu role vs renderer Cmd+Z/C/V |
| double-owner | 11 | Undo memory-smoke test (UH.5 vs history-panel OD-2); freeze-undo; monitor window |
| no-code | 9 | multicam (memory only); LayerTap 'layer' node; mask invert/hide-ants/save-as-mask |

Trace matrix (233 rows): fully traced (law → plan → code → test) ranges from 0 of 11 (O12 performance) to 11 of 16 (O08 masks). Weakest objects are **O12, O07, O10, O14 and O17**; they should be specced with extra care in phase 4.

## §7 · Supersede headers still missing (58 chains)

Examples:
- ui-foundation `plan`/`uat`/`design-spec`: the 13-button strip and the 11px oracles.
- The original wave0 marathon brief vs the AMENDED brief.
- DECISIONS-PENDING narrowed LayerTap defaults vs the full scope in `layertap-matte-v1/proposal.md:170`.
- The change-05 design vs the composite-export design.
- `INDEX.md:55` vs the Tier-7 demotion.
- `AUTOMATION-ABLETON-SUITE.md` lists built packets as planned.
- MASKING-INTERACTIONS outside §1.
- The B3 PRD.

The full list is in CROSSREF-SEMANTIC.md §Supersede chains.

## §8 · What this means for the pass

1. Phase-3 systems specs must each resolve these:

   | system | must resolve |
   |---|---|
   | keyboard | §3a, plus the inert-context fact |
   | context-menus | §3b |
   | undo | §3e, B4 |
   | selection | X-timeline-1/2, X-tools-keys-8/16 |
   | docking | §3d |
   | tokens | X-shell-10/11/13 |

   The identity-key rule (B1 + modulation) becomes a cross-cutting rule in the O06/O07 specs.
2. Every §2 row and every §3 owner question enters the phase-5 decision batches with a recommendation.
3. 68 open questions are queued in CROSSREF-SEMANTIC.md §Open questions.
4. **Stale-ledger prevention** (third recurrence: ledger CX-53b87cec, CX-4144344e): phase-7 packets carry a CI check that every merged packet id has a ticked ledger row, or the ROADMAP/EXECUTION-PLAN status column is generated from `git log` instead of hand-edited.
5. **Second supersede-header sweep** (§2 header rows + §7's 58 chains + §3i contract docs), docs-only, this branch — owner approval required, same terms as the ★1 sweep ("headers only").

## Done when (oracles for this document)

| # | criterion | oracle |
|---|---|---|
| 1 | Every doc in the 340-doc universe is referenced by ≥1 reader, or listed as exempt | `node docs/spec/tools/merge-crossref.mjs` → `unreferencedDocs` = 0 (exempt: `.claude/commands`, `.specify/`, `docs/spec/`) |
| 2 | Every reader output is schema-valid | brief's `node -e` validator on each `inventory/crossref/*.json` exits 0 |
| 3 | Every reader had ≥1 independent orchestrator check | `inventory/crossref-adjudications.json` has a `readers.<cluster>` row for each file in `inventory/crossref/` |
| 4 | Every §2 blocking row cites both sides at file:line | manual review at ★ — no row without two cites |
| 5 | Generated layers are reproducible | rerun both scripts; `git diff --stat docs/spec/inventory` empty |

