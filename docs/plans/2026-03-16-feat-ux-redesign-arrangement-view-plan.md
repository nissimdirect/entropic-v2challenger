---
title: "feat: UX Redesign — Arrangement View + Device Chain"
type: feat
status: completed
date: 2026-03-16
phase: 12-16
brainstorm: docs/brainstorms/2026-03-16-ux-redesign-brainstorm.md
mockup: docs/mockups/ux-redesign-mock.html
---

# UX Redesign — Arrangement View + Ableton Device Chain

## Overview

Complete frontend restructure of Entropic Challenger to match Ableton Live's arrangement view paradigm. Replaces the current sidebar-rack + separate-param-panel layout with an Ableton-style horizontal device chain, restructured sidebar (browser-only), performance triggers as automation lanes, preview pop-out, and transport bar with overdub controls.

**Why:** The current UI is "engineer's UI" — functional but unguided. Users from Ableton/Resolume/NLE backgrounds expect specific conventions (J/K/L transport, device chain, inline params, overdub recording). This redesign aligns Entropic with the "Ableton for Video" positioning.

**Source:** Don Norman UX audit + competitor analysis (11 tools). Brainstorm + mockup approved by stakeholder.

## Data Model Decisions (Pre-Implementation)

These decisions resolve the 30 gaps identified in the spec-flow analysis.

### DeviceGroup Type

```typescript
// Add to shared/types.ts
interface DeviceGroup {
  id: string
  name: string
  children: EffectInstance[]    // OWNS the instances (not reference by ID) — CTO C1 amendment
  macroMappings: MacroMapping[] // user-mapped, NOT default
  mix: number                  // 0-1 group wet/dry
  isEnabled: boolean
  abState: {
    a: Record<string, Record<string, number>> | null  // effectId -> paramKey -> value
    b: Record<string, Record<string, number>> | null
    active: 'a' | 'b'
  } | null                     // null = A/B not activated
}

// effectChain becomes a union:
type ChainItem = EffectInstance | DeviceGroup
// effectChain: ChainItem[]

// DeviceGroup detection:
function isDeviceGroup(item: ChainItem): item is DeviceGroup {
  return 'children' in item && Array.isArray(item.children)
}

// Flatten for IPC and legacy consumers — CTO C2 amendment
function flattenChain(chain: ChainItem[]): EffectInstance[] {
  return chain.flatMap(item =>
    isDeviceGroup(item) ? item.children : [item]
  )
}
```

**CTO Amendment C1:** Groups OWN their children (not reference by ID). When grouped, effects MOVE from the top-level array into `group.children`. Flattening for IPC is `flatMap()`. No dual-location ambiguity.

**CTO Amendment C2:** `flattenChain()` helper introduced in Phase 13A (before groups exist) so all existing call sites that need a flat chain migrate to it early. Phase 14 then changes the type with minimal blast radius.

**Python IPC:** Frontend flattens groups before sending to backend. Groups are a UI concept only. Macro values resolved to individual param values before `render_frame`. No backend changes needed.

### A/B State

- **Per-device:** Add `abState` field to `EffectInstance` (same shape as DeviceGroup)
- **Persistence:** Saved with project file. Users invest time in A/B comparisons.
- **Undo:** A/B toggles are NOT undoable (comparison tool, not state mutation)
- **Project format:** Version bump. Old versions ignore unknown fields (forward-compatible)

### Trigger Lanes

- Reuse existing `AutomationLane` with `isTrigger: boolean` flag
- Trigger values clamped to 0 or 1 (square wave)
- Trigger recording: key-down writes point at value 1.0, key-up writes point at 0.0
- ADSR shaping: opt-in post-processing that smooths 0→1 transitions with envelope curve
- Overdub coalescing: entire recording pass = one undo entry

### Pop-Out Window

- Main process relays base64 frame data via IPC to pop-out renderer
- Throttle pop-out to 15fps if main window is at 30fps (reduce IPC load)
- Pop-out preload: read-only subset (frame display only, no `sendCommand`)
- Pop-out window bounds persisted in layout store
- Shows composited output (not per-track)

### Displaced Components

| Component | Current Location | New Location |
|-----------|-----------------|--------------|
| EffectRack | Sidebar | **Removed** — replaced by DeviceChain |
| ParamPanel | Below preview | **Removed** — replaced by DeviceChain inline params |
| PresetBrowser | Sidebar tab | **Sidebar section** (User Presets folder tree) |
| PerformancePanel | Grid row 3 | **Removed** — triggers become automation lanes. Pad config lives in an **in-app overlay panel** (View → Performance Triggers) — NOT a separate Electron window |
| HistoryPanel | Sidebar | **Removed from sidebar** — accessible via Edit → Undo History (modal) |
| AutomationToolbar | Above timeline | **Merged into transport bar** (record/overdub/mode buttons). Transport bar is a **custom React component below the native Electron menu bar** — does NOT replace native File/Edit/View menus |

---

## Implementation Phases

### Phase 12: Quick Wins + Transport Bar (1-2 sessions)

**Goal:** Ship the easy wins that don't require layout restructure. Builds confidence and establishes new conventions before the big refactor.

#### 12A: Keyboard Shortcuts + Transport

**Files to modify:**
- `frontend/src/renderer/utils/default-shortcuts.ts` — add J/K/L/I/O/Cmd+D actions
- `frontend/src/renderer/App.tsx` — register new shortcut handlers
- `frontend/src/renderer/styles/transport.css` — transport bar styling (already exists)

**Tasks:**
- [x] Add J/K/L transport keys (J=reverse, K=stop, L=forward, double-tap L=2x, triple=4x, max 8x)
- [x] Add I/O keys (set loop in/out at playhead) — already existed
- [x] Add Cmd+D (duplicate selected effect in chain)
- [x] Add overdub toggle to transport bar (⏺ record + OVR button)
- [ ] Move automation mode selector from AutomationToolbar into transport bar — deferred to Phase 13
- [x] Add timecode display in transport bar (HH:MM:SS.ff)
- [x] Add connection indicator dot in transport bar (green/red pulse)

**Acceptance criteria:**
- [x] J/K/L transport works with speed multiplier (1x/2x/4x/8x)
- [ ] K+L = frame-by-frame forward (standard NLE convention) — deferred (needs playback loop changes)
- [x] I/O set loop region at playhead position
- [x] Cmd+D duplicates selected effect with new UUID
- [x] Record/OVR buttons control `useAutomationStore` mode and armed state
- [x] All new shortcuts appear in ShortcutEditor (Preferences → Keyboard)

#### 12B: UX Polish

**Files to modify:**
- `frontend/src/renderer/styles/global.css` — resize grip dots, drop overlay
- `frontend/src/renderer/components/preview/PreviewCanvas.tsx` — always-active drop target
- `frontend/src/renderer/components/layout/HistoryPanel.tsx` — sidebar collapse arrow
- `frontend/src/renderer/components/effects/ParamPanel.tsx` — rename Ghost Handle
- `frontend/src/renderer/stores/toast.ts` — humanized error messages
- `frontend/src/main/zmq-relay.ts` — humanized IPC error strings

**Tasks:**
- [x] Add visible resize grip dots on timeline handle (three dots pattern, visible on hover)
- [ ] Make preview canvas an always-active drop target (dashed border on drag-over) — deferred (preview already accepts global drag)
- [x] Add sidebar collapse arrow icon (visible ▶/◀ toggle button)
- [x] Rename "Ghost Handle" → "Precision Slider" — code comments only, no user-facing strings found
- [x] Humanize error messages: "ZMQ timeout" → "Engine took too long — try removing the last effect"
- [x] Add chain depth indicator in EffectRack header ("4 / 10")

**Tests:**
- [x] Vitest: J/K/L shortcut registration and handler dispatch (11 tests)
- [x] Vitest: transport speed state machine (13 tests)
- [x] Vitest: Cmd+D dispatch
- [x] Vitest: I/O loop region (already covered by existing tests)
- [ ] Vitest: humanized error messages — deferred (zmq-relay runs in main process, not testable via Vitest component tests)

---

### Phase 13: Device Chain + Sidebar Refactor (3-4 sessions)

**Goal:** The core layout restructure. Replace ParamPanel + EffectRack with Ableton-style horizontal device chain. Refactor sidebar to browser-only.

**ROLLBACK CHECKPOINT:** Before starting Phase 13, create `git tag pre-ux-redesign`. If 13C (component removal) breaks the app, revert to this tag. Phase 13A builds DeviceChain ALONGSIDE existing ParamPanel (both visible temporarily) so there's a working intermediate state before the swap.

**Drag library decision:** Use the existing drag pattern from EffectRack (manual pointer events + reorder callback) for horizontal reorder in DeviceChain. No new dependency (no dnd-kit). Match existing `onReorder(fromIndex, toIndex)` contract.

#### 13A: DeviceChain Component

**New files:**
- `frontend/src/renderer/components/device-chain/DeviceChain.tsx`
- `frontend/src/renderer/components/device-chain/DeviceCard.tsx`
- `frontend/src/renderer/components/device-chain/DeviceMix.tsx`
- `frontend/src/renderer/components/device-chain/RenderTimeBar.tsx`
- `frontend/src/renderer/styles/device-chain.css`

**Files to modify:**
- `frontend/src/renderer/App.tsx` — replace ParamPanel + EffectRack with DeviceChain. **CTO I1:** Extract `useTransport()` hook (J/K/L state, play/pause, overdub), `useFrameLoop()` hook (render request, clock sync), `useProjectLifecycle()` hook (save/load/autosave/crash recovery) during this restructure
- `frontend/src/renderer/styles/global.css` — new grid layout (5 rows: transport, sidebar+main, timeline, device-chain, status)
- `frontend/src/renderer/stores/layout.ts` — add `deviceChainHeight`, `deviceChainCollapsed`
- `frontend/src/renderer/stores/project.ts` — device selection logic + **add `flattenChain()` helper** (CTO C2: all existing flat-chain consumers migrate to this before Phase 14 type change)

**Tasks:**
- [ ] Create DeviceChain component — horizontal scrollable strip
- [ ] Create DeviceCard — single effect with inline params (knobs, sliders, dropdowns), ON toggle, mix slider
- [ ] Show total chain render time in DeviceChain header (from IPC `lastFrameMs`) — CTO C3: per-effect timing deferred (requires backend instrumentation)
- [ ] Arrow connectors (→) between devices
- [ ] Drag-to-reorder devices in the chain (horizontal)
- [ ] Click device to select (highlighted border), Tab to cycle
- [ ] Right-click context menu on device (remove, duplicate, save preset, add automation lane)
- [ ] Restructure App.tsx CSS grid to 5 rows: transport | sidebar+main | timeline | device-chain | status
- [ ] Add device chain height to layout store (default 200px, min 120px, max 400px, persisted)
- [ ] Add resize handle between timeline and device chain (with grip dots)

**Data flow:**
```
EffectBrowser → onAddEffect → projectStore.addEffect → DeviceChain rerenders
DeviceCard knob change → projectStore.updateParam → trigger render_frame
DeviceCard selected → projectStore.selectEffect (existing) → border highlight
```

**Acceptance criteria:**
- [ ] All effect params visible inline in device cards (knobs for float/int, dropdown for choice, checkbox for bool)
- [ ] Device chain scrolls horizontally when effects overflow
- [ ] Drag-to-reorder works (undoable)
- [ ] Total chain render time shows in DeviceChain header (CTO C3: per-effect deferred)
- [ ] Mix slider per device works identically to old ParamMix
- [ ] All existing Vitest param tests pass with new component selectors

#### 13B: Sidebar Refactor

**Files to modify:**
- `frontend/src/renderer/App.tsx` — remove EffectRack, HistoryPanel from sidebar
- `frontend/src/renderer/components/effects/EffectBrowser.tsx` — add favorites, user folders, collapsible categories, help panel
- `frontend/src/renderer/styles/global.css` — sidebar styling updates

**New files:**
- `frontend/src/renderer/components/effects/HelpPanel.tsx` — contextual help for hovered/selected effect
- `frontend/src/renderer/stores/browser.ts` — favorites (Set<string>), user folders (name + effect IDs), persisted to localStorage

**Tasks:**
- [ ] Remove EffectRack from sidebar (replaced by DeviceChain)
- [ ] Remove HistoryPanel from sidebar (moved to Edit → Undo History modal)
- [ ] Remove sidebarTab state (no more Effects/Presets tabs)
- [ ] Add favorites section — star icon on hover, stored in browser store
- [ ] Add user folders — right-click → "New Folder", drag effects into folders
- [ ] Add collapsible categories — triangle arrow expand/collapse (persist state)
- [ ] Add HelpPanel at sidebar bottom — shows description of hovered/selected effect (from registry metadata)
- [ ] Double-click effect in browser → append to device chain (in addition to drag)
- [ ] Drag device FROM chain TO sidebar user folder → save as preset

**Acceptance criteria:**
- [ ] Favorites persist across sessions (localStorage)
- [ ] User folders persist across sessions
- [ ] Help panel shows description for any effect on hover (fallback: "No description available")
- [ ] Category collapse state persists
- [ ] Sidebar is ONLY browser — no rack, no history, no preset tab

#### 13C: Remove Old Components

**Files to remove/deprecate:**
- `frontend/src/renderer/components/effects/EffectRack.tsx` → delete
- `frontend/src/renderer/components/effects/ParamPanel.tsx` → delete
- `frontend/src/renderer/components/layout/HistoryPanel.tsx` → move to modal

**Tasks:**
- [ ] Delete EffectRack.tsx and all BEM classes in global.css (`.effect-rack*`)
- [ ] Delete ParamPanel.tsx and all BEM classes (`.param-panel*`)
- [ ] Convert HistoryPanel to a modal dialog (opened from Edit menu)
- [ ] Update all imports in App.tsx
- [ ] Update `STORE_RELATIONSHIPS` map if entity references changed
- [ ] Migrate affected Vitest tests to new component selectors (use data-testid for new components)

**Test migration plan:**
| Old Selector | New Selector |
|-------------|-------------|
| `.effect-rack__list` | `[data-testid="device-chain"]` |
| `.effect-card__name` | `[data-testid="device-card-name"]` |
| `.param-panel__knobs` | `[data-testid="device-params"]` |
| `.param-mix__input` | `[data-testid="device-mix"]` |

---

### Phase 14: A/B Switch + Device Groups (2-3 sessions)

**Goal:** Add A/B comparison switching and effect grouping with user-mapped macros.

#### 14A: A/B Switch

**New files:**
- `frontend/src/renderer/components/device-chain/ABSwitch.tsx`

**Files to modify:**
- `frontend/src/shared/types.ts` — add `abState` to `EffectInstance`
- `frontend/src/renderer/stores/project.ts` — `snapshotAB`, `toggleAB`, `copyToInactiveAB`
- `frontend/src/renderer/project-persistence.ts` — serialize/deserialize abState

**Tasks:**
- [ ] Add `ABSwitch` component — `[A|b]` / `[a|B]` toggle button
- [ ] Add `abState` to `EffectInstance` type (nullable, created on first A/B activation)
- [ ] Implement `toggleAB(effectId)` — swaps all param values between A and B snapshots. **Red Team RT-3:** All restored values must be clamped against current `ParamDef.min/max` from registry (numeric trust boundary rule)
- [ ] Implement `copyToInactiveAB(effectId)` — Shift+click copies current to inactive slot
- [ ] A/B state saved in project file (backward-compatible: old versions ignore field)
- [ ] A/B toggles excluded from undo stack (comparison tool)

**Acceptance criteria:**
- [ ] Click [AB] creates snapshot A from current, B becomes editable
- [ ] Toggling swaps params instantly (visual + render update)
- [ ] Shift+click resets comparison (copies current to inactive)
- [ ] A/B state persists in project save/load
- [ ] No undo entries from A/B toggling

#### 14B: DeviceGroup

**New files:**
- `frontend/src/renderer/components/device-chain/DeviceGroup.tsx`
- `frontend/src/renderer/components/device-chain/MacroStrip.tsx`

**Files to modify:**
- `frontend/src/shared/types.ts` — add `DeviceGroup` interface, `ChainItem` union type
- `frontend/src/renderer/stores/project.ts` — `groupEffects`, `ungroupEffects`, `addMacroMapping`, `removeMacroMapping`, `updateMacroValue`
- `frontend/src/renderer/stores/project.ts` — flatten chain before IPC (resolve macros → param values)
- `frontend/src/shared/store-relationships.ts` — add DeviceGroup entity relationships
- `frontend/src/renderer/project-persistence.ts` — serialize/deserialize groups

**Tasks:**
- [ ] Add `DeviceGroup` type to types.ts (id, name, childIds, macroMappings, mix, isEnabled, abState)
- [ ] Add `ChainItem = EffectInstance | DeviceGroup` union type
- [ ] Convert `effectChain: EffectInstance[]` → `effectChain: ChainItem[]`
- [ ] Implement `groupEffects(effectIds: string[])` — creates group, moves effects into it (undoable)
- [ ] Implement `ungroupEffects(groupId: string)` — dissolves group, restores individual positions (undoable)
- [ ] **CTO I3:** Change `MacroMapping.effectIndex` → `MacroMapping.effectId: string` (index-based breaks on reorder; update MacroKnob.tsx + library.ts)
- [ ] Implement macro mapping: right-click param in grouped device → "Map to Macro" → name dialog
- [ ] MacroStrip component — renders only mapped macros (not default empty)
- [ ] Group A/B — swaps ALL child effect params simultaneously
- [ ] Group [SHOW] toggle — expand/collapse inner devices
- [ ] Group mix slider
- [ ] Flatten chain before IPC: resolve macro values → individual param values, expand groups to flat chain
- [ ] Update cross-store cleanup: deleting a group deletes all inner effects' automation lanes, operator mappings, etc.
- [ ] **Red Team RT-2:** Add `validateProjectGroups()` to project load — enforce: max group depth = 1 (no nesting), min children = 1, all child IDs exist, no circular refs, abState effectIds match children. On validation failure: dissolve invalid groups to flat chain + toast warning
- [ ] **Red Team HT-1:** Macro resolution must route through `updateParam()` clamping logic — never write raw resolved values to store

**Acceptance criteria:**
- [ ] Shift-click to multi-select devices in chain, right-click → "Group"
- [ ] Group appears with double border, group name editable (click to rename)
- [ ] Macro mapping works: right-click param → "Map to Macro" → label → slider appears in MacroStrip
- [ ] Dragging a macro slider updates the mapped param(s) in real-time
- [ ] Group A/B swaps all inner device params
- [ ] Ungrouping restores individual devices at their positions (undoable)
- [ ] Python receives flattened chain (no group awareness needed in backend)

#### 14C: Group Presets

**Files to modify:**
- `frontend/src/renderer/stores/library.ts` — save/load group presets
- `frontend/src/shared/types.ts` — extend `Preset` type with `chainData.groups`
- `frontend/src/renderer/components/library/PresetSaveDialog.tsx` — group preset mode

**Tasks:**
- [ ] Save group preset — stores all inner device params + macro mappings + group name
- [ ] Load group preset — regenerates new UUIDs for all effects, re-wires macro mappings to new IDs
- [ ] Drag group from chain to sidebar User Presets → saves as group preset
- [ ] Drag group preset from sidebar to chain → loads as new group

**Acceptance criteria:**
- [ ] Group preset save/load round-trips correctly (all params, macros, mix)
- [ ] Loading a preset generates fresh UUIDs (no ID collisions)
- [ ] Group presets appear in User Presets sidebar section

---

### Phase 15: Performance Triggers as Automation (2-3 sessions)

**Goal:** Replace the separate PerformancePanel with trigger automation lanes in the timeline. Square-wave pulses, overdub recording, exclusive param ownership.

#### 15A: Trigger Lane Type

**Files to modify:**
- `frontend/src/shared/types.ts` — add `isTrigger: boolean` to `AutomationLane`, add `TriggerMode` type
- `frontend/src/renderer/stores/automation.ts` — `addTriggerLane`, trigger-specific recording logic
- `frontend/src/renderer/components/timeline/AutomationLane.tsx` — render square-wave visual
- `frontend/src/renderer/styles/automation.css` — trigger lane styling (colored blocks)

**Tasks:**
- [ ] Add `isTrigger` flag to `AutomationLane` type
- [ ] Add `triggerMode: 'toggle' | 'gate' | 'one-shot'` to trigger lanes
- [ ] Add `triggerADSR: ADSREnvelope` to trigger lanes (default: 0/0/1/0 = square)
- [ ] Render trigger lanes as colored rectangular blocks (value 1 = block, value 0 = gap)
- [ ] Color-code trigger blocks by pad color
- [ ] Add TRIG badge on trigger track headers, AUTO badge on continuous automation headers
- [ ] Exclusive param ownership: when mapping a param to a trigger, check no other trigger already owns it. Show error toast if conflict.

**Acceptance criteria:**
- [ ] Trigger lanes render as square-wave blocks (not smooth curves)
- [ ] Toggle mode: each press flips between 1 and 0
- [ ] Gate mode: key-down = 1, key-up = 0
- [ ] One-shot mode: key-down = 1 for fixed duration, then auto-0
- [ ] ADSR shaping opt-in: if ADSR has non-zero attack/release, smooth the transitions
- [ ] Param ownership enforced (toast on conflict)

#### 15B: Trigger Recording (Overdub)

**Files to modify:**
- `frontend/src/renderer/utils/retro-capture.ts` — update `captureToAutomation` to generate square-wave points
- `frontend/src/renderer/stores/automation.ts` — overdub recording mode for triggers
- `frontend/src/renderer/App.tsx` — wire pad triggers to automation recording during playback

**Tasks:**
- [ ] During overdub: key-down writes point at value 1.0 at current time, key-up writes 0.0
- [ ] Implement `useUndoStore.beginTransaction(description)` / `commitTransaction()` pattern — CTO I2: between begin/commit, mutations buffered; commit creates one undo entry whose inverse replays all buffered inverses in reverse (~30 lines in undo.ts)
- [ ] Coalesce entire overdub pass as single undo entry via transaction pattern
- [ ] Retro-capture CAPTURE button: convert 60s buffer events to trigger automation points
- [ ] Merge new trigger points with existing lane data during overdub (don't replace)
- [ ] ARM button per track in timeline header (red when armed, matches mockup)

**Acceptance criteria:**
- [ ] Arm track → press record + play → press pad keys → square-wave points written to lane
- [ ] Stop recording → all recorded points form one undo entry
- [ ] CAPTURE button converts retro-buffer to trigger automation
- [ ] Multiple overdub passes layer without destroying previous data
- [ ] Undo reverts entire overdub pass, not individual points

#### 15C: Remove PerformancePanel

**Files to modify/remove:**
- `frontend/src/renderer/components/performance/PerformancePanel.tsx` — convert to floating config panel
- `frontend/src/renderer/App.tsx` — remove grid row 3 (performance)

**Tasks:**
- [ ] Remove PerformancePanel from main grid layout
- [ ] Create floating "Performance Trigger Config" panel (View → Performance Triggers)
- [ ] Config panel: pad assignments, trigger modes, ADSR, choke groups, MIDI mappings
- [ ] Move PadEditor into the config panel
- [ ] Pad triggering still works via keyboard/MIDI — just the config UI moves
- [ ] Update grid: 5 rows → transport | sidebar+main | timeline | device-chain | status

**Acceptance criteria:**
- [ ] No drum pad grid in main layout
- [ ] Pad triggers work via keyboard during playback (write to automation lanes)
- [ ] Config panel accessible from View menu
- [ ] All pad settings (mode, ADSR, choke, MIDI) configurable in floating panel
- [ ] Choke groups still work (triggering one releases others)

---

### Phase 16: Preview Pop-Out + Final Polish (1-2 sessions)

**Goal:** Pop-out preview window and visual hierarchy polish.

#### 16A: Preview Pop-Out

**New files:**
- `frontend/src/main/pop-out-window.ts` — secondary BrowserWindow creation
- `frontend/src/preload/pop-out.ts` — read-only preload (frame display only)
- `frontend/src/renderer/components/preview/PopOutPreview.tsx` — minimal renderer

**Files to modify:**
- `frontend/src/main/index.ts` — register pop-out IPC handlers
- `frontend/src/renderer/components/preview/PreviewCanvas.tsx` — add pop-out button
- `frontend/src/renderer/stores/layout.ts` — `isPopOutOpen`, `popOutBounds`
- `frontend/src/renderer/App.tsx` — send frame data to pop-out via IPC

**Tasks:**
- [ ] Create pop-out BrowserWindow in main process (no menu bar, resizable, always-on-top option)
- [ ] Read-only preload: exposes only `onFrameUpdate(callback)` and `onClose(callback)`, no `sendCommand`
- [ ] Main process relays frame data (base64 JPEG) to pop-out renderer via IPC
- [ ] Throttle pop-out to 15fps when main is at 30fps (configurable in preferences)
- [ ] Pop-out button (↗) on preview canvas top-right
- [ ] Pop-out window bounds persisted in layout store (position + size)
- [ ] Closing pop-out returns preview to main window
- [ ] App quit cleans up pop-out window
- [ ] Pop-out shows composited output (same as main preview)

**Security:**
- [ ] Pop-out preload has `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- [ ] No `sendCommand` exposed — read-only display surface
- [ ] CSP headers injected same as main window
- [ ] **Red Team RT-1:** Pop-out preload must expose ONLY `ipcRenderer.on('frame-update')` — NOT `ipcRenderer.invoke()` or `ipcRenderer.send()`. Add E2E test verifying pop-out cannot issue commands to Python sidecar
- [ ] **Red Team HT-4:** Track pop-out window ref in main process. On close, call `win.destroy()` (not just `close()`). On re-open, verify `isDestroyed()` before creating new window. Prevent memory leak from rapid open/close

**Acceptance criteria:**
- [ ] Click ↗ → new window opens with live preview
- [ ] Drag to second monitor → frames continue rendering
- [ ] Close pop-out → preview returns to inline
- [ ] Resize pop-out → video scales (object-fit: contain)
- [ ] App quit with pop-out open → clean shutdown, no orphan processes
- [ ] E2E test: pop-out window cannot send IPC commands (RT-1 verification)
- [ ] Rapid open/close 10x: no leaked BrowserWindow instances (HT-4 verification)

#### 16B: Visual Hierarchy (Mockup Validation)

**Files to modify:**
- `frontend/src/renderer/styles/global.css` — zone backgrounds, borders
- `frontend/src/renderer/styles/device-chain.css` — device chain accent border

**Tasks:**
- [ ] Apply three-zone backgrounds: sidebar (#1a1a22), preview (#0a0a0e), timeline (#141418), device chain (#18181e)
- [ ] Sidebar left border accent (3px violet or TBD color)
- [ ] Device chain top border accent (1px violet or TBD color)
- [ ] Resize grip dots visible on hover (three dots pattern)
- [ ] Timeline track ARM button styling (red when armed, pulsing glow)

**Note:** Final color choices deferred — Signal Bruise direction needs design review. Zone backgrounds are the structural change; accent colors can be swapped later.

**Acceptance criteria:**
- [ ] Three distinct visual zones visible in the layout
- [ ] Panels are visually distinguishable without reading text
- [ ] Grip dots appear on resize handles on hover

---

## Test Plan

### What to test

**Phase 12:**
- [ ] J/K/L transport keys dispatch correct actions (play/reverse/stop/speed multiplier)
- [ ] I/O set loop region correctly
- [ ] Cmd+D duplicates with new UUID and preserves params
- [ ] Preview canvas accepts drag-and-drop video files
- [ ] Humanized error messages map correctly from error codes

**Phase 13:**
- [ ] DeviceChain renders all effects in horizontal strip
- [ ] DeviceCard shows inline params (knobs, sliders, dropdowns)
- [ ] Drag-to-reorder in DeviceChain works and is undoable
- [ ] RenderTimeBar updates from IPC timing data
- [ ] Sidebar favorites add/remove persists to localStorage
- [ ] HelpPanel shows description on hover/select
- [ ] All old EffectRack/ParamPanel tests migrated to DeviceChain selectors

**Phase 14:**
- [ ] A/B toggle swaps params and triggers re-render
- [ ] A/B state persists in project save/load
- [ ] DeviceGroup creation from multi-select + context menu
- [ ] Macro mapping creates slider that controls target param
- [ ] Group ungroup restores individual positions (undoable)
- [ ] Chain flattening for IPC resolves macros correctly
- [ ] Group preset save/load with UUID regeneration

**Phase 15:**
- [ ] Trigger lanes render as square-wave blocks
- [ ] Toggle/gate/one-shot modes produce correct automation patterns
- [ ] Overdub recording writes points at correct times
- [ ] Overdub undo reverts entire pass (not individual points)
- [ ] Retro-capture CAPTURE generates correct trigger automation
- [ ] Exclusive param ownership prevents duplicate mapping (toast on conflict)
- [ ] Choke groups work in automation context

**Phase 16:**
- [ ] Pop-out window opens, receives frames, closes cleanly
- [ ] Pop-out bounds persisted across sessions
- [ ] Pop-out throttle works (15fps when main at 30fps)
- [ ] Pop-out security: no sendCommand exposed
- [ ] Visual zones have distinct backgrounds

### Edge cases to verify
- [ ] Empty chain: DeviceChain shows placeholder ("Add effects from browser")
- [ ] Max chain depth (10): adding 11th effect blocked with toast
- [ ] Group with single effect: allowed? (UX decision — recommend: require minimum 2)
- [ ] A/B on grouped device: does it conflict with group A/B?
- [ ] Trigger lane on deleted effect: lane removed via cross-store cleanup
- [ ] Pop-out during export: pop-out shows export progress frames
- [ ] Rapid A/B toggling: no undo stack flooding (excluded from undo)
- [ ] Project load with groups: backward-compatible (old projects have no groups)
- [ ] Sidebar collapse with DeviceChain: layout reflows correctly

### How to verify
- Frontend unit: `cd frontend && npx vitest run`
- Frontend E2E: `cd frontend && npx playwright test`
- Backend: `cd backend && python -m pytest -x -n auto --tb=short`
- Manual: launch app, import video, build chain, group, A/B, overdub, pop-out

### Existing test patterns to follow
- Component tests: `frontend/src/__tests__/components/` (Vitest + happy-dom)
- Store tests: `frontend/src/__tests__/stores/` (Vitest)
- E2E: `frontend/tests/e2e/` (Playwright _electron)
- Use `data-testid` attributes on new components (decouple from BEM classes)
- Use `setupMockEntropic()` helper for IPC mocking

---

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| App.tsx refactor breaks existing functionality | High | High | Ship Phase 12 (quick wins) first to validate shortcut system. Phase 13 is the big bang — test exhaustively before merging |
| 1,016 Vitest tests break on selector changes | High | Medium | Use data-testid on new components. Create selector mapping document. Migrate tests in Phase 13C |
| Pop-out window frame relay adds latency | Medium | Medium | Throttle to 15fps. Measure latency in Phase 16 spike. Fallback: MessagePort if IPC is too slow |
| DeviceGroup data model change breaks project save/load | Medium | High | Version bump in project format. Add migration function for old → new format |
| Undo complexity with groups + A/B + overdub | Medium | High | A/B excluded from undo. Overdub coalesced. Group create/ungroup are single undo entries |
| Cross-store orphans after group deletion | Medium | High | Consult STORE_RELATIONSHIPS map. Cleanup goes INSIDE undo forward closure |

---

## CTO Amendments Applied

| # | Type | Change | Phase |
|---|------|--------|-------|
| C1 | CRITICAL | `children: EffectInstance[]` not `childIds: string[]` — groups own instances | 14B |
| C2 | CRITICAL | `flattenChain()` helper added in 13A, all flat-chain consumers migrate before 14 | 13A→14B |
| C3 | CRITICAL | Per-effect render timing deferred — show total chain time only | 13A |
| I1 | IMPORTANT | Extract hooks from App.tsx (useTransport, useFrameLoop, useProjectLifecycle) | 13A |
| I2 | IMPORTANT | Undo transaction pattern (beginTransaction/commitTransaction) for overdub | 15B |
| I3 | IMPORTANT | `MacroMapping.effectIndex` → `effectId` (index breaks on reorder) | 14B |

---

## Dependencies & Prerequisites

- All 12 original phases complete (0A–11) ✅
- Ship gate audit complete ✅
- Brainstorm approved ✅
- HTML mockup approved ✅
- No backend changes needed (groups flattened before IPC)
- No Electron version upgrade needed (BrowserWindow pop-out uses existing APIs)

---

## Phase Summary

| Phase | Name | Sessions | Key Deliverable |
|-------|------|----------|-----------------|
| 12 | Quick Wins + Transport | 1-2 | J/K/L, overdub controls, help panel, humanized errors |
| 13 | Device Chain + Sidebar | 3-4 | Ableton-style device chain, browser-only sidebar, old components removed |
| 14 | A/B + Groups | 2-3 | A/B comparison, DeviceGroup with macros, group presets |
| 15 | Performance Triggers | 2-3 | Trigger automation lanes, overdub recording, PerformancePanel removed |
| 16 | Pop-Out + Polish | 1-2 | Preview pop-out window, visual hierarchy zones |

**Total estimated: 9-14 sessions**

---

## References

- Brainstorm: `docs/brainstorms/2026-03-16-ux-redesign-brainstorm.md`
- Mockup: `docs/mockups/ux-redesign-mock.html`
- Competitor research: `~/Documents/Obsidian/projects/ENTROPIC-COMPETITOR-UX-RESEARCH.md`
- Audit learnings: `~/.claude/projects/-Users-nissimagent/memory/entropic-audit-learnings.md`
- Store relationships: `frontend/src/shared/store-relationships.ts`
- Cross-store limits: `frontend/src/shared/limits.ts`
