# 01 — FEATURE MAP, GAPS, HALF-BUILT, CONTRADICTIONS (phase 1 ★)

Source tree: `origin/main` @ 4dc01de. Mechanical data: `inventory/INVENTORY.md` (generated; regenerate with
`CX_TYPESCRIPT=<frontend>/node_modules/typescript node docs/spec/tools/inventory.mjs`; `node docs/spec/tools/merge-semantic.mjs`). Semantic data: `inventory/semantic/*.json` (5 readers).
**Every row below was verified by the orchestrator** (grep/Read on this tree) unless marked `[reader, unadjudicated]`.

Pre-presentation gate: `/plan-check` run `01-FEATURE-MAP-md-20261104-131334` (ledger 1071 rows) → 8 findings (3 high, 5 medium), all addressed in this revision; report at `~/.claude/state/plan-check/runs/01-FEATURE-MAP-md-20261104-131334/report.md`.

## §M — Mechanical findings (orchestrator-verified)

### M1 · Registry hotkey rows with no handler bound

`ShortcutRegistry.register` (`frontend/src/renderer/utils/shortcuts.ts:88`) binds handlers. These rows have none.
Absence command (recorded per ledger CX-f7a42c05): `grep -rn "'<action>'" frontend/src/renderer | grep -v __tests__ | grep -v default-shortcuts.ts` → 0 lines each,
and no raw keydown handler tests their keys (`inventory.json` hotkeys.rawKeyHandlers).

| action | keys | registry row | what the user actually has |
|---|---|---|---|
| tool_slip | `s` | default-shortcuts.ts:73 | **Tool exists** (`Clip.tsx:344`), reachable via TRIM group cycle `tool_razor` (`ToolRail.tsx:57`) → stale pre-D4a row, not a missing tool |
| tool_slide | `d` | default-shortcuts.ts:74 | **Tool exists** (`Clip.tsx:388`), same TRIM cycle → stale row |
| grid_up | `]` | default-shortcuts.ts:90 | no keyboard path found |
| grid_down | `[` | default-shortcuts.ts:91 | no keyboard path found |
| toggle_popout | `meta+shift+p` | default-shortcuts.ts:92 | no keyboard path found |
| tool_escape_select | `escape` | default-shortcuts.ts:93 | Escape handled at 17 local sites (modals, lanes, ContextMenu, Timeline.tsx:114 marquee-cancel); no global "Reset to Select Tool" |

Prior incident of this exact class: ledger CX-0333fcd2 (dead `loop_toggle` binding). Prevention → phase-3 keyboard spec ships a
vitest guard: every `DEFAULT_SHORTCUTS` action has a `register()` call, and every menu label shortcut maps to a registry row.

Inverse: handlers registered for `preferences` and `about` have no registry row (not rebindable, not listed in the shortcut editor).

### M2 · Menu-advertised shortcuts with no keyboard path (static evidence; runtime confirm in phase 3)

`main/menu.ts:16-19`: "Renderer owns all keyboard dispatch — menu items show shortcut labels but do NOT use the
accelerator field". So a menu label's `\tCmdOrCtrl+X` binds only if the renderer registry has the keys. Two don't. Save As is **runtime-confirmed by history**: ledger CX-e274dcd0 "Cmd+Shift+S Save As shortcut doesn't fire; menu item works" — still unfixed on 4dc01de.

| menu item | label shortcut | registry | at |
|---|---|---|---|
| File › Save As... | Cmd+Shift+S | none | main/menu.ts:33 |
| Select › Select All Clips | Cmd+A | none (project CLAUDE.md shortcut table lists Cmd+A = select all) | main/menu.ts:61 |

Action-name drift between the two dispatch vocabularies (menu `kebab-case` vs registry `snake_case`, different words):
`open-project` vs `open`; `show-feedback` vs `feedback_dialog`. One command, two names: input to the phase-3 command-registry spec.

### M3 · Orphan components (exported, never imported or mounted)

`EffectRack`, `EffectSearch`, `ParamPanel`, `ParamSlider` (removed in Phase 13C, App.tsx:11, App.tsx:4015, still on disk),
`MacroKnob`, `ZoomScroll`, `Waveform`. Detector false-positive fixed during adjudication: `TrackHeader` is mounted as a map value (Timeline.tsx:24).

**Contradiction with law:** RATIFIED D13 names `ParamPanel.tsx handleKnobChange` as a curve-visibility auto-reveal site.
ParamPanel is unmounted (App.tsx:4015). Verified: the contract holds on the live path (`stores/automation.ts:1012-1018` ← `DeviceCard.tsx:155`) — see L4.

### M4 · Store actions with no caller outside their store (59; candidate half-built)

Full list: `inventory.json` → `unreferencedActions`. Clusters that look like **backend/store-built, UI-unreachable** (the #1 recurring failure class, FRONTEND-SDLC §5):

| cluster | actions | spot-check |
|---|---|---|
| Browser folders | addFolder, removeFolder, renameFolder, addToFolder, removeFromFolder (stores/browser.ts) | `grep -rn "addFolder\|renameFolder" frontend/src \| grep -v stores/browser.ts` → 0 ✔ |
| Preferences persistence | loadPreferences, savePreferences (stores/settings.ts:41,51) | `grep -rn "loadPreferences\|savePreferences" frontend/src` → only stores/settings.ts ✔ |
| Audio clip editing | removeAudioClip(s), setClipGain, trimAudioClip, toggleAudioClipMute (stores/timeline.ts) | from inventory |
| MIDI CC banks/slots | addCCMapping, *CCBankBinding*, *CCSlotMapping*, setActiveBankIndex (stores/midi.ts) | from inventory |
| Rack pads | addRackPad, setRackPadSource, updateRackPad, removeRack (stores/instruments.ts) | from inventory |
| Export queue | addJob, updateJobStatus, cancelCurrent (stores/export.ts) | from inventory |
| Misc | moveMarker, setLooping, rippleTrimClipOut (timeline); exitBranch (project); forceOffPad (performance); openDrawer/markTourSeen (onboarding) | from inventory |

Caveat (stated, not hidden): "no external reference" is word-match over non-test source; dynamic access (`store[name]`) would be missed. Each cluster gets a code read in its phase-4 area spec before being called half-built.

### M5 · Planning-doc citation health

205 planning docs. Code citations that don't resolve: 59 point at files that have since **moved** (e.g. `components/export/ExportDialog.tsx` → `components/dialogs/ExportDialog.tsx`); ~290 read like planned-new files; ~490 unresolved otherwise; 123 runtime paths (excluded). Line-beyond-EOF: 0. Per-doc table: INVENTORY.md §Planning docs.
Implication for this pass: **no old doc is trusted for current behavior; every spec re-cites code.**

## §S — Semantic findings (5 readers → `inventory/SEMANTIC.md`, verdicts in `inventory/adjudications.json`)

Totals: 322 feature rows across 22 areas · 31 half-built · 48 contradictions · 79 open decisions · 49 superseded docs.
Reader trust: other 4 readers — 10 claims checked, 9 confirmed, 1 reclassified (contradiction → open decision R1); **`roadmap-packets-specs` 3 of 7 refuted** → its statuses are leads only.

### S1 · Contradictions with ratified law (verified)

| # | conflict | verified at |
|---|---|---|
| L1 | IBM Plex still specified, D5 says mono-only, Plex "formally dead" | `docs/roadmap/packets/ux-audit.md:341` (PUX.7); DESIGN-SPEC §3 body (reader: :75); ONBOARDING-SPEC.md:14 + MASKING-INTERACTIONS.md:17 (reader, unadjudicated) |
| L2 | 11px floor still specified, D6 = 12px | DESIGN-SPEC body (reader: :83, :181); ux-audit.md:84 PUX.1 (reader) |
| L3 | Mask tool letters: doc w=wand/g=lasso/c=key; code + D4a: lasso=W, wand via KEY group E | `MASKING-INTERACTIONS.md:236-239` vs `default-shortcuts.ts:100`, `ToolRail.tsx:61`, `default-shortcuts.ts:82` |
| L4 | D13 cites dead `ParamPanel.tsx handleKnobChange`; contract actually lives at the store choke point | `App.tsx:4015`; live: `stores/automation.ts:1012-1018` ← `DeviceCard.tsx:155` — **doc fix, behavior OK** |
| L5 | Build-order authority: `docs/roadmap/INDEX.md` authority list omits RATIFIED-FOUNDATIONS; ROADMAP/EXECUTION-PLAN never mention D9 gate | reader roadmap-core c15–17 (unadjudicated) |

**Fix path (ledger CX-495a4e99: reversals persist unless the stale spec is marked):** a docs-only supersede-header sweep — DESIGN-SPEC §3, ONBOARDING-SPEC, MASKING-INTERACTIONS hotkey table, ux-audit PUX.1/PUX.7, D13 cite, roadmap INDEX authority list — proposed as a follow-up commit on this branch (owner approval at ★1).

### S2 · Live bug surfaced by the pass (outside spec scope — owner call)

Modulation addressing: wire is TYPE-scoped (`shared/ipc-serialize.ts:45`), backend drops unknown ids silently (`backend/src/modulation/routing.py:310-311`), `LFOEditor.tsx:33` writes an instance UUID → **LFOEditor mappings do nothing.** Reader adds ModulationMatrix.tsx:123,131 and OperatorKentaroCluster.tsx:188,201 (unadjudicated). Recurrence of ledger CX-0efe52f5.
**Binding requirement on the A08 spec regardless of the owner's bug-fix call:** one identity key (type vs instance UUID) defined for every mapping writer (LFOEditor, ModulationMatrix, KentaroCluster, RoutingCanvas) and the wire, with an end-to-end oracle that a mapped param actually moves.

### S3 · Half-built (verified subset; full list SEMANTIC.md §Half-built)

| item | evidence |
|---|---|
| Browser folders: store CRUD, no UI | M4 |
| Preferences load/save: store, no caller | M4 |
| FreezeOverlay only inside orphan EffectRack (live chain shows freeze via menu only) | `EffectRack.tsx:169`, `DeviceChain.tsx:362` |
| Freeze/unfreeze not undoable | `App.tsx:2420-2452` |
| Runtime-conditional (painted/learned) mod edges: seam only | `backend/src/modulation/runtime_context.py:5-10` |
| Rail v12 (D10): only the tool strip exists; containers zone unbuilt | reader openspec-a + roadmap-core, consistent; `ToolRail.tsx:56` |
| 4 registry hotkeys with no keyboard path (+2 stale slip/slide rows); 2 menu shortcuts without keys | M1, M2 |
| 7 orphan components | M3 |

### S4 · Planned with zero code (reader-reported; orchestrator-checked only for browser-folders via M4 — each re-verified in its phase-4 spec)

layertap-matte-v1 · fx-backspin · fx-afterimage rework · system-monitor-v1 · util-transform · browser-folders · multiwindow-stage-a · history-panel deltas · sampler-clip-editor · device-monitors-v1 · chain-tap-preview · wave0-prerouted-presets · field-mapping K1+ · multicam (memory only; stitch CLI outside repo at `~/Development/cam-stitch`).

### S5 · Owner questions raised by phase 1 (→ phase-5 batches unless urgent)

1. Browser-folders banked verdict contradicts itself: "NO wells (rejected)" vs "container WELLS" (`openspec/changes/browser-folders/plan.md:12` vs `:16`).
2. R1 still open: subtool flyouts (as built) vs v12 drawers; rail position (`docs/frontend/RECONCILIATIONS.md` R1).
3. System-monitor meters: transport far-right (D13) vs statusbar (system-monitor-v1 proposal.md:66, reader).
4. Should freeze be undoable?
5. Remaining 79 open decisions + 48 contradictions in SEMANTIC.md — batched in phase 5.

### S6 · Coverage gap: an area with NO planning doc

**A15 Text tracks** — no reader found a single planning-doc feature row for it, yet it ships (Cmd+T `add_text_track`, `components/text/`). Its phase-4 spec is written from code alone (highest risk of undocumented behavior).
