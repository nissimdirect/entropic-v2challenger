---
title: Creatrix arrangement-view redesign — implementation plan
version: 1.2
revised: 2026-06-02
revision_chain:
  - v1.0: initial draft
  - v1.1: incorporated CTO + best-practices findings (5 critical fixes)
  - v1.2: incorporated qa-redteam Real Tigers + /review findings + "no user base" descope
context:
  user_base: NONE — single tester (the user). No external users, no production data, no backwards-compat obligations.
  implications: |
    - Schema migration code is dead weight (just start clean on v3)
    - Backup/rollback for user data is unnecessary
    - Downgrade compatibility is unnecessary
    - Feature flags can be aggressive (or skipped entirely)
    - "Breaking change" has no cost — we delete our test files and rebuild
inputs:
  - DECISIONS.md (28 decisions, all resolved)
  - IMG_2369.HEIC (user drawing)
  - index.html (lofi mockup v0.2)
  - reference_kentaro-suzuki-m4l.md (operator inspiration)
  - CTO review (architecture-strategist + best-practices, 2026-06-02)
  - qa-redteam (security-sentinel + data-integrity-guardian, 2026-06-02)
  - /review (document refinement, 2026-06-02)
status: ready-for-implementation
target_repo: entropic-v2challenger → rename to creatrix in PR-D
---

# Creatrix arrangement-view redesign — implementation plan (v1.2)

## 0. TL;DR

Five sequential PRs. **No-user-base context** lets us skip all migration / backup / downgrade-compat code. Two real bug classes from qa-redteam (export snapshot, modulation cycle detection) baked into the plan.

- **PR-zero — Per-track effect chain migration (no flag).** Promote `projectStore.effectChain` global → per-track `Track.effectChain`. Pure refactor; resolves F-0514-16 freeze-store rewire. **3-5 days.** Blocking dependency for everything else.
- **PR-A — Layout shell + 5-tab browser + polymorphic inspector (info-only).** UI/visual only. Behind `F_CREATRIX_LAYOUT`. Hover delegation perf-gated before merge.
- **PR-B — Composite-as-effect + automation unification + BPM in transport + export snapshot + cycle detection.** Data-model break. **No migration code** — v3 starts clean. **No flag** (no user base = no fallback needed; if it breaks we revert the PR).
- **PR-C — Operators surfaced in browser, starting with Kentaro Cluster.** Additive. react-xyflow prototype-gated before merge.
- **PR-D — Entropic → Creatrix rename + v3.0 bump.** Pure metadata. No userData migration (we have nothing to preserve).

**Total: 38-53 hrs + 3-5 days PR-zero.** (Down from v1.1's 70-90 hrs — descope saved ~30 hrs.)

---

## 0.1 What changed from v1.1

| Section | v1.1 | v1.2 |
|---|---|---|
| User base assumption | implicit "production" | **explicit: no user base, single tester** |
| v2→v3 migration code | 50-line migration + atomicity + backup | **DROPPED.** v3 schema only. Old `.glitch` won't load; delete test files. |
| `isTrigger` shim | "one-release backward compat" | **DROPPED.** Break field cleanly. Replace 84 test fixtures in one mechanical pass. |
| `~/.entropic/` → `~/.creatrix/` userData copy | one-shot copy code | **DROPPED.** Nothing to preserve. Just rename hardcoded paths. |
| Feature flags | `F_CREATRIX_LAYOUT` + `F_CREATRIX_DATA_V3` | **`F_CREATRIX_LAYOUT` only.** PR-B unflagged (just revert if broken). |
| Flag removal "after 4+ weeks bake" | yes | **dropped** (no users to keep on old shape) |
| Export snapshot semantics | undefined | **specified** — deep-clone at job start, time-aligned hash test, modulated fixture |
| Modulation cycle detection | one-hop denylist only | **full DFS in `_topological_sort`** extending to all new operator types |
| Preset bundle hardening | "validate types, cap size" (one row) | **deferred** to follow-up PR before first third-party preset import |
| Composite validator timing | unclear | **at transaction commit**, not every mutation |
| react-xyflow vs vis-network | "either" | **react-xyflow only** (vis-network unmaintained) |
| BPM modulation | `project.bpm` (single field) | **split: `bpm` baseline + `effectiveBpm` derived** |
| Total estimate | 70-90 hrs + 3-5d | **38-53 hrs + 3-5d** |
| Prototype gates | none | **2 added** (hover delegation perf, react-xyflow stress) |

---

## 1. Architectural shifts (cross-cutting)

### 1.1 Composite as effect (was: Blend)

Renamed Blend → **Composite** (Nuke convention). Composite is a **terminal per-layer property**, NOT a mid-chain entry. Each track has at most ONE Composite at the END of its chain. The compositor reads it; without one, default `mode: normal, opacity: 1.0`.

**Why Model A:** `apply_chain` is single-frame; compositing needs two frames (current + underlying). Model A respects existing `compositor.py:127-167` architecture and matches Nuke Merge / AE / Resolve compositing.

### 1.2 Automation unification (lanes ≡ triggers) — clean break

Single `InterpolationMode = 'smooth' | 'step' | 'gate' | 'oneShot'`. Drop `isTrigger`, drop `TriggerMode`, drop `addTriggerLane`. Replace 84 test fixture call sites in one mechanical sed pass. The exclusivity gate at `automation.ts:111-154` migrates to `mode === 'gate' || mode === 'oneShot'` check.

**Why no shim:** No user base → no value in preserving the old call shape for a release.

### 1.3 Polymorphic inspector

Single shell, mounts per-state child with `key={selection.type}`. `<InspectorHoverHelp>` lives OUTSIDE state subtree so sticky-window timing doesn't reset. Info-only — no actionable controls.

### 1.4 Operators surfaced in browser

Reuses existing `Operator` type at `types.ts:386-428` and existing `OperatorMapping` (not new `ModulationRoute`). Existing operator types: `'lfo' | 'envelope' | 'video_analyzer' | 'audio_follower' | 'step_sequencer' | 'fusion'`. PR-C extends union with `'kentaroCluster' | 'sidechain' | 'gate' | 'midiEnvStutter'`. Code lives in existing `frontend/src/renderer/components/operators/` (plural — directory exists).

### 1.5 Project rename + v3.0

In-place rename. v3.0 signals breaking shape. No userData migration (nothing to preserve). 3-5 hrs.

---

## 2. PR-zero — Per-track effect chain migration (foundational)

### 2.1 Why this exists

`projectStore.effectChain` is global today (`stores/project.ts:13,57`). `Track.effectChain` is vestigial save/load shim used only at boundaries (`App.tsx:800`, `timeline.ts:890`). Freeze store flags this as F-0514-16: "v2 collapsed effectChain onto the project store; UI call sites use this constant; store shape stays track-keyed to keep tests passing."

Every layout PR assumes per-track chains. They don't exist. PR-zero fixes the foundation.

### 2.2 Scope

- Move `projectStore.effectChain` → `Track.effectChain` in storage shape. Persist to disk.
- Rewire `useFreezeStore` per F-0514-16 (per-track freeze info, currently global).
- `DeviceChain` reads `selectedTrack.effectChain`.
- `EffectRack` adapts to per-track context.
- `ParamPanel` reads selected-effect from selected-track's chain.
- `apply_chain` backend: receive `track_id` in IPC, scope chain lookup per-track.
- All `addEffect / removeEffect / reorderEffect / updateParam` actions take `trackId` as first arg.

### 2.3 Write semantics — explicit (qa-redteam C1 fix)

Per-track effect chains **persist to disk** in PR-zero. v2 `.glitch` files won't load cleanly after this lands — but **there are no v2 projects to load** (no user base). Test fixtures regenerated in one pass.

### 2.4 Test plan (expanded per /review finding)

- All existing chain tests pass unmodified (single-track fixtures)
- 2-track project: V1 has Pixel Sort, V2 has Datamosh. Switch selectedTrack, verify chain swap. Add effect to V1, verify V2 unchanged.
- 3-track project with mixed effect types per track
- Freeze store per-track isolation: freeze V1, verify V2 still live. Unfreeze V1, verify state propagates correctly.
- Persistence round-trip: save 2-track project, reload, verify per-track chains restored
- IPC round-trip: backend receives correct `track_id`, applies correct chain, returns correct frame
- E2E (Playwright): load fixture project → per-track chains render correctly → modify V1, verify V2 untouched

### 2.5 Estimate

3-5 days. No flag. Pure refactor. Ships first.

---

## 3. PR-A — Layout shell + 5-tab browser + polymorphic inspector

### 3.1 Prototype gate (BEFORE locking PR-A spec)

**Run a 30-min prototype:**
- Hover delegation perf: render 200 mock `data-help-id` targets, rapid mouse-sweep, measure delegated `onMouseOver` handler frame time. Target: < 8ms per frame at 60fps mouse rate. If fails: investigate alternatives (debounce, intersection observer, etc.) before committing to delegation pattern in PR-A spec.

Document result inline before PR-A merge.

### 3.2 CSS grid

```css
.app {
  display: grid;
  grid-template-columns: var(--left-col-w) 1fr;
  grid-template-rows: var(--transport-h) 1fr var(--statusbar-h);
}
.left-col   { grid-row: 2; grid-column: 1; display: grid;
              grid-template-rows: 1fr var(--inspector-h); }
.right-col  { grid-row: 2; grid-column: 2; display: grid;
              grid-template-rows: var(--preview-h) 1fr var(--device-chain-h); }
.transport  { grid-row: 1; grid-column: 1 / -1; }
.statusbar  { grid-row: 3; grid-column: 1 / -1; }
```

Vars (defaults, persisted to localStorage):
- `--left-col-w: 260px` · min 200 · max 33vw
- `--inspector-h: 150px` · min 100 · max 50% left-col
- `--preview-h: 38%` · min 100px · max 70% right-col
- `--device-chain-h: 180px` · min 100 · max 60% right-col

### 3.3 Resize handles — fat-target (6px visible, 16px hit zone)

Per Apple HIG + Fitts' Law. 4 handles: left-col right edge, preview bottom, device-chain top, inspector top. Visible bar is 6px; surrounding `pointer-events: auto` zone extends 5px each side.

### 3.4 Pop-out preview collapse

When `previewPoppedOut`: in-app band collapses to 28px strip `▭ preview in window · [↩ re-dock]`. Freed space → timeline.

### 3.5 Browser — 5 tabs

```
search [          ] [×]
[fx] [op] [composite] [tool] [instruments]
```

- Global search with X clear, Esc clears + blurs
- Tab click switches category; only one active

#### Tab contents

**fx (~200 destructive video effects):** existing taxonomy.

**op (~14):** LFO · Env Follower · S&H · Random · Add · Multiply · Clamp · Curve · Audio Amplitude · MIDI CC · Playhead Time · Sidechain · Gate · MIDI Envelope Stutter · **Kentaro Cluster**.

**composite (~36 modes):** 8 folders (Darken / Lighten / Contrast / Comparative / HSL / GIMP additions / Glitch originals / Alpha). Full list in v1.1 PLAN preserved.

**tool (~13):** Select · Razor · Slip · Slide · Ripple Delete · Marker · Loop In/Out · Range Select · Loop toggle · Quantize toggle · Grid up/down · Pop-out preview. Ableton-parity hotkeys, guarded against text inputs (§3.7).

**instruments (placeholder only in this PR-A):**
- Folder "RACKS" with draggable entries: Drum Rack · Sampler · Wavetable
- Drop adds an instrument-type effect to chain (basic empty shell)
- **NO preset import / bundle handling in PR-A.** Per qa-redteam Real Tiger 1, preset bundle hardening (zip extraction, path traversal, magic-byte checks, quotas) requires its own design pass. Defer to a separate PR before any third-party preset import is allowed.
- USER folder exists but rejects all bundle imports with toast: "Preset import requires PR-AAA (hardening). Use the bundled racks for now."

#### Per-tab USER section (Q5/6)

Each tab has a "USER" folder at TOP. Right-click device → "Save as preset" lands in its category's USER folder. **In PR-A, save-as-preset writes a flat JSON file to `~/.creatrix/presets/<tab>/<name>.json` — no sample bundling, no zip.** Sample-bundling defers to the same hardening PR.

### 3.6 Drag + double-click

Drag payload encodes category + id:
```json
{"kind": "fx" | "op" | "composite" | "instruments", "id": "fx.pixelsort"}
```

**dataTransfer security (qa-redteam H1):** add session-bound nonce to drag-source `setData('application/x-creatrix-nonce', sessionNonce)`. Drop validator requires nonce match (rejects external drags by construction). Plus payload validation: `kind` enum check, `id` regex against `^builtin:` or `^user:` namespace (qa-redteam H2 — no shadow collisions).

Double-click adds to currently-selected track's chain.

### 3.7 Bare-letter tool shortcuts — guarded (qa-redteam H5 + CTO C3)

Expanded text-input guard:
```ts
function isTextInputActive(): boolean {
  const el = document.activeElement
  if (!el || el === document.body) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true
  if ((el as HTMLElement).isContentEditable) return true
  if (el.getAttribute('role') === 'textbox') return true
  if (el.hasAttribute('data-no-shortcut')) return true
  return false
}
```

**Tool-mode stack** (qa-redteam H5): push/pop `cursorMode` on modal open/close. Esc resets to `select`. Modal-dismiss restores prior cursor mode.

**Statusbar tool-mode indicator:** chip at right of statusbar shows current cursor tool (`tool: razor`). Without this, accidental tool changes are silent.

Hotkey table unchanged from v1.1 §3.6 (all 12 new shortcuts conflict-checked).

### 3.8 Polymorphic inspector — implementation

```ts
function Inspector() {
  const selection = useSelectionStore(s => s.current)
  return (
    <div className="inspector">
      <InspectorBody key={selection.type} selection={selection} />
      <InspectorHoverHelp />
    </div>
  )
}
```

`InspectorHoverHelp` lives OUTSIDE `<InspectorBody>` — survives selection changes.

### 3.9 Hover-help — delegated handler

Single `onMouseOver` at inspector root. Walks up from `event.target` to find `[data-help-id]`. Zero per-target React listeners. Per-state inspector components wrapped in `React.memo`.

### 3.10 Hover-help behavior

- Settle delay: **300ms** (Material baseline)
- Fade in: 200ms opacity
- Sticky after mouseleave: **400ms** (≥ WCAG 1.4.13 pointer-travel)
- **Esc dismisses immediately** (WCAG 1.4.13)
- **Sticky allows hover-into-tooltip** (WCAG 1.4.13)
- **Collapsible slot** (Ableton Info View pattern) — disclosure triangle, persisted as `creatrix.inspector.hoverHelpCollapsed`
- Right-click inspector → "Hide hover help" (global disable)
- **Focus events also update help** (keyboard accessibility) — focusin/focusout = mouseenter/mouseleave equivalents

### 3.11 Selector contract for inspector

Decouple PR-A inspector from PR-B data shape via typed selectors:

```ts
// src/renderer/selectors/trackStats.ts
interface TrackStats {
  effectCount: number
  lastFrameMs: number
  smoothAutomationCount: number
  gateAutomationCount: number
  oneShotAutomationCount: number
  hasComposite: boolean
  // ... etc
}

export function getTrackStats(trackId: string): TrackStats { ... }
```

**Dependency note:** `getTrackStats` reads `useTimelineStore.getState().tracks.find(t => t.id === trackId)?.effectChain.length` — depends on PR-zero per-track chains being in place. Document this dependency at the top of PR-A.

Inspector reads ONLY through selectors. PR-B refactors store shape underneath without touching inspector code.

### 3.12 8 polymorphic states

Content unchanged from v1.1 §3.11. All info-only. (Full table in v1.1 PLAN — preserve in solutions doc when shipped.)

### 3.13 Interactions table (inlined, no longer "unchanged from v1.0")

| Action | Selection change | Inspector content | Side effects |
|---|---|---|---|
| Click empty timeline | → none | project info | clear selection |
| Click clip | → clip [id] | clip info | timeline selection |
| Cmd-click clip | → multi-clip append | selection summary | — |
| Shift-click clip | → multi-clip range | selection summary | range select |
| Click track header | → track [id] | track info | selects track |
| Click effect in chain | → effect [trackId, effectId] | effect info | device-chain highlight |
| Click operator badge | → operator [id] | operator info | — |
| Click marker | → marker [id] | marker info | scroll into view |
| Hover any knob | (no change) | hover slot updates after 300ms | — |
| Drag knob | (no change) | hover slot shows live value | param update |
| Drag browser item onto chain | → effect [new id] | effect info | item added (transaction-wrapped) |
| Double-click browser item | → effect [new id] | effect info | added to selected track |
| Click tool in browser | (no change) | hover slot shows tool help | cursorMode update; statusbar updates |
| Esc | → none | project info | clear selection + cursorMode→select + dismiss help |
| Cmd+A | → multi-clip (all in track) | selection summary | — |
| Cmd+D | duplicates effect | unchanged | existing behavior |
| Backspace | deletes selection | → none | existing behavior |
| Right-click in any region | (no change) | unchanged | context menu opens |

### 3.14 File-by-file change inventory (PR-A)

Same as v1.1 §3.12, MINUS:
- Bundle import / extraction (deferred to hardening PR)
- v2 schema-aware selector code (no v2 schema to handle)

Net file count: ~30 new/modified. ~2900 lines added.

**PR-A est: 9-12 hrs** (down from v1.1's 10-14 due to bundle-import descope).

---

## 4. PR-B — Composite + automation unification + BPM + cycle detection + export snapshot

### 4.1 Composite effect type

```ts
interface CompositeEffect extends EffectBase {
  type: 'composite'
  params: { opacity: number; mode: BlendMode }
}

type BlendMode = /* 36 modes — full list in v1.1 §4.1 */
```

**Validator timing (qa-redteam Hidden Tiger 3 + /review):** runs at **transaction commit**, NOT every store mutation. Intermediate states during track-duplicate, drag-reorder, and multi-step undo are allowed. Validator rules: at most ONE Composite per chain; must be at END if present.

Wrap all multi-step ops in `useUndoStore.beginTransaction(...)`:
- Drag Composite onto track
- Track-duplicate-with-chain
- Automation-mode-change (may drop incompatible points)
- Composite-mode-change (no chain effect, but pairs with opacity change)

### 4.2 Track schema change — clean break (no migration)

Before:
```ts
interface Track { opacity: number; blendMode: BlendMode; ... }
```

After:
```ts
interface Track { /* opacity and blendMode REMOVED */ effectChain: Effect[]; ... }
```

**No migration code.** Old `.glitch` files won't load (deserializer rejects missing required fields per shape change). We delete test fixtures and create fresh v3 ones. This is the "no user base" optimization.

### 4.3 Schema version bump

`CURRENT_VERSION = "3.0.0"`. Loader rejects v < 3.0.0 with clear error: "v2 projects unsupported — start a new project." Test fixtures regenerated in v3 shape.

### 4.4 Export pipeline — snapshot-at-job-start (qa-redteam Real Tiger 4)

**Spec:**
1. Export takes **deep-clone snapshot** of `projectStore + timelineStore + effectStore + automationStore + operatorStore` at job start.
2. UI shows status: "Exporting from snapshot @ T=X. Live edits will apply to next render."
3. Live edits during export update the live stores but DO NOT touch the export worker's snapshot.
4. Test: render 90-frame project with sine LFO @ 1Hz on a Composite's opacity; export at 30fps and at 60fps; verify **time-aligned** frames hash-match (not index-aligned). Frame at t=1.5s in 30fps export == frame at t=1.5s in 60fps export.
5. Add modulated-fixture as part of standard regression.

**Files:** `backend/src/engine/export.py` (~80 lines for snapshot logic) + new E2E test `frontend/src/__tests__/e2e/export-snapshot.spec.ts` (~100 lines).

### 4.5 Modulation cycle detection — full DFS (qa-redteam Real Tiger 5)

`backend/src/modulation/engine.py:20-77` `_topological_sort` currently checks ONLY Fusion-type. Extend to ALL operator-to-operator references via `mappings[].targetParamPath`:

```python
def _topological_sort(operators: list[Operator]) -> list[Operator]:
    # Build dependency graph: operator → set of operators it depends on
    deps = {}
    for op in operators:
        deps[op.id] = set()
        for mapping in op.mappings:
            # Existing Fusion source check
            if op.type == 'fusion':
                for source in op.parameters.get('sources', []):
                    deps[op.id].add(source['operator_id'])
            # NEW: any mapping that targets another operator's parameter
            target_op = find_operator_by_param_path(mapping.target_param_path, operators)
            if target_op and target_op.id != op.id:
                deps[op.id].add(target_op.id)

    # DFS cycle detection
    visited = set()
    rec_stack = set()

    def has_cycle(node):
        visited.add(node)
        rec_stack.add(node)
        for neighbor in deps.get(node, set()):
            if neighbor not in visited:
                if has_cycle(neighbor):
                    return True
            elif neighbor in rec_stack:
                return True
        rec_stack.remove(node)
        return False

    for op_id in deps:
        if op_id not in visited:
            if has_cycle(op_id):
                raise ModulationCycleError(...)

    return topological_order(deps)
```

Plus **render-graph cycle check**: a Composite-opacity routed from an operator that reads from a track whose render output depends on that Composite = cycle. Detect at routing time (when mapping created), not at frame eval.

**Files:** `backend/src/modulation/engine.py` (~80 lines change), new tests `backend/tests/modulation/test_cycle_detection.py` (~150 lines covering: direct cycle, indirect 2-hop, indirect 3-hop, BPM-via-LFO-chain, render-graph cycle).

### 4.6 Automation unification — clean break

Schema:
```ts
type InterpolationMode = 'smooth' | 'step' | 'gate' | 'oneShot'
interface Lane {
  id: string; trackId: string; effectId: string | 'mixer';
  paramPath: string; mode: InterpolationMode;
  color: string; points: Point[];
}
interface Point { time: number; value: number; duration?: number }
```

**No `isTrigger` shim.** 84 test fixture call sites mechanically replaced. Exclusivity gate at `automation.ts:111-154` migrates to `mode === 'gate' || mode === 'oneShot'` check. Exclusivity rule unchanged (one gate-mode lane per param).

Store API:
```ts
addLane(trackId, effectId, paramKey, color, mode: InterpolationMode = 'smooth')
// addTriggerLane → REMOVED (not aliased — fix all call sites)
```

Timeline renders per mode:
- `smooth` → bezier
- `step` → horizontal segments + vertical jumps
- `gate` → discrete bars at point.time with `duration` width
- `oneShot` → single triangle markers, no value carry

### 4.7 Track context menu

| Item | Behavior |
|---|---|
| Duplicate Track | unchanged |
| Rename Track | unchanged |
| Move Up / Down | unchanged |
| Show Automations | toggle inline expand ▼ |
| Add Automation… | tree picker (effect → param), default mode `smooth` |
| Freeze ▶ | submenu: Freeze full chain · Freeze up to here |
| Flatten | render full chain → new video, replace clips. Single mode (full-track only); destructive; undoable via transaction wrap |
| Delete Track | unchanged |

### 4.8 BPM in transport + as automation target

**Baseline vs effective split (qa-redteam Hidden Tiger 1):**
- `project.bpm: number` — baseline value, user-writable via click-to-edit in transport, persisted to disk
- `project.effectiveBpm: number` — derived per-frame from `bpm + modulation`, NEVER persisted, read by engine
- User editing `bpm` during modulated playback: baseline shifts but effective continues following curve relative to new baseline
- Save persists `bpm` only (the user's intent), never `effectiveBpm`

**Modulation routing:** new sink type `'projectParam'` in `ModulationTarget` discriminant. `applyProjectModulations()` runs alongside `applyEffectModulations()` per frame; writes to `effectiveBpm`. Existing `applyCCModulations` factored into `applyEffectModulations` (chain) + new `applyProjectModulations` (project store).

**Cycle prevention** uses the §4.5 DFS, which catches any LFO chain that eventually feeds BPM.

### 4.9 Track-header automation surface — inline expand

Click ▼ → track row expands to show lanes inline below clips:
```
[Pixel Sort > Threshold ▼]   [waveform preview ────╱──╲────]   0.42  [smooth ▼]
```

Lane preview: offscreen `<canvas>` per lane, cached, redrawn ONLY on points change. NOT on scroll/zoom (CSS transform).

Tree picker for `+ add automation`: effect → param hierarchy, plus "Mixer" group for project-level targets (`bpm`).

### 4.10 File-by-file change inventory (PR-B) — REDUCED

| File | Change | Lines |
|---|---|---|
| `frontend/src/shared/types.ts` | remove `Track.opacity`/`blendMode`, add `CompositeEffect`, `InterpolationMode`, `ModulationTarget` discriminant | ~80 |
| `frontend/src/renderer/stores/automation.ts` | merge `addLane`/`addTriggerLane` (no alias), `TriggerMode` → `InterpolationMode` | ~80 |
| `frontend/src/renderer/stores/timeline.ts` | drop opacity/blendMode setters, Composite-terminal validator at commit | ~80 |
| `frontend/src/renderer/stores/project.ts` | add `effectiveBpm`, ensure not persisted | ~30 |
| `backend/src/project/schema.py` | bump `CURRENT_VERSION = "3.0.0"`, reject v2 with clear error | ~15 |
| `backend/src/effects/registry.py` | register `composite` effect with 36 modes | ~80 |
| `backend/src/engine/compositor.py` | read Composite from chain terminal instead of `track.opacity/blendMode` | ~60 |
| `backend/src/engine/pipeline.py` | skip terminal Composite in main chain | ~30 |
| `backend/src/engine/export.py` | snapshot at job start; respect Composite from snapshot | ~80 |
| `backend/src/effects/composite/blend_modes.py` | 36 mode implementations | ~500 |
| `backend/src/modulation/engine.py` | full DFS cycle detection extending to all operator types + render-graph | ~80 |
| `frontend/src/renderer/components/timeline/Track.tsx` | drop opacity slider + blend dropdown; ▼ expand; inline automation render | ~180 |
| `frontend/src/renderer/components/timeline/AutomationLane.tsx` | branch on `InterpolationMode`; offscreen canvas cache | ~120 |
| `frontend/src/renderer/components/timeline/AddAutomationPicker.tsx` | new tree picker | ~140 |
| `frontend/src/renderer/components/transport/TransportBar.tsx` | BPM click-to-edit | ~40 |
| `frontend/src/renderer/components/performance/applyEffectModulations.ts` | factor out (renamed) | ~40 |
| `frontend/src/renderer/components/performance/applyProjectModulations.ts` | new (writes to `effectiveBpm`) | ~50 |
| Test fixtures `__tests__/fixtures/projects/*.glitch` | regenerate in v3 shape | ~30 (one-time pass) |
| Test fixtures using `addTriggerLane` | mechanical replace across 84 sites | ~84 |
| Tests | per-blend-mode hash (~36) + automation regression + Composite validator commit-time + BPM split + cycle detection (5 cycle types) + export snapshot E2E + render-graph cycle | ~700 |

**PR-B est: 12-18 hrs** (down from v1.1's 20-28 — major savings from drop migration, drop shim, drop atomicity code).

---

## 5. PR-C — Operators surfaced + Kentaro Cluster

### 5.1 Prototype gate (BEFORE locking PR-C spec)

**Run a 30-min prototype:**
- react-xyflow 32-path stress: render 32 SVG paths in react-xyflow, animate transforms at 60fps, measure frame time. Target: < 8ms per frame. If fails: fall back to bare SVG with `requestAnimationFrame` batching (no react-xyflow dep).

Document result inline before PR-C merge.

### 5.2 Reuse existing operator types

`frontend/src/shared/types.ts:386-428` already has `Operator` + `OperatorMapping`. PR-C extends `OperatorType` union: `'kentaroCluster' | 'sidechain' | 'gate' | 'midiEnvStutter'`. Reuses `mappings` field (NOT new `routes`). Lives in existing `frontend/src/renderer/components/operators/` (plural).

### 5.3 Kentaro Cluster spec

- **8 LFOs max** (configurable 2–8)
- **32 mappings max per cluster** (hard cap — DoS prevention)
- **`MAX_OPERATORS_PER_PROJECT = 64`** new constant in `backend/src/security.py` (qa-redteam M2)
- Render-budget guard at `engine.py` warns + degrades if modulation eval > 16ms per frame
- Per-LFO: shape · rate · depth · phase · target mapping
- Shared: master rate · master depth · BPM-sync · phase reset
- **Stretch dropped** (per /review): no per-LFO sketch mode in this PR. Defer to follow-up.

### 5.4 UI implementation

- **Topology graph in device-chain tile:** SVG with ≤32 `<path>` elements. Animate ONLY transform attributes (no path-d recompute). Library: **react-xyflow** (committed — vis-network dropped per qa-redteam L1). Falls back to bare SVG if prototype gate (§5.1) fails.
- **Inspector view:** direct-manipulation surface — drag waveform overlays to sculpt all LFOs at once. Reference: Madrona Labs Aalto (set-vs-effective animated controls). CLAUDE.md Rule 1.5 citation lives in operator file header.
- **Per-destination depth-arc:** colored arc around target knob, color-matched to source LFO. Reference: Bitwig modulator system.

### 5.5 Other operators

| Op | Behavior |
|---|---|
| Sidechain | Source track's audio amplitude → modulation value |
| Gate | Outputs gate when input > threshold |
| MIDI Envelope Stutter | Re-triggers envelope on MIDI input |

### 5.6 Browser surface

`op` tab folders:
- MODULATION: LFO · Env Follower · S&H · Random · **Kentaro Cluster** · **MIDI Envelope Stutter**
- MATH: Add · Multiply · Clamp · Curve
- INPUTS: Audio Amplitude · MIDI CC · Playhead Time · **Sidechain**
- GATING: **Gate**

Drag onto track header → adds to track's operator set. Drag onto param knob → adds + auto-creates mapping at default depth 1.0.

### 5.7 File-by-file change inventory (PR-C)

| File | Change | Lines |
|---|---|---|
| `frontend/src/shared/types.ts` | extend `OperatorType` union | ~10 |
| `frontend/src/renderer/components/operators/` (existing dir) | add OperatorTile, OperatorKentaroCluster, OperatorTopologyGraph, OperatorDepthArc | ~780 |
| `backend/src/pipeline/operators/kentaro_cluster.py` | 8-LFO computation, BPM sync, per-LFO output | ~150 |
| `backend/src/pipeline/operators/sidechain.py` | new | ~80 |
| `backend/src/pipeline/operators/gate.py` | new | ~60 |
| `backend/src/pipeline/operators/midi_env_stutter.py` | new | ~100 |
| `backend/src/pipeline/apply_modulations.py` | wire new operators | ~50 |
| `backend/src/security.py` | add `MAX_OPERATORS_PER_PROJECT = 64`, render-budget guard | ~30 |
| Tests | per-op value + Kentaro 8-LFO independence + 32-mapping cap + topology snapshot + E2E modulation routing | ~700 |

**PR-C est: 14-18 hrs** (unchanged from v1.1).

---

## 6. PR-D — Rename + v3.0

### 6.1 Scope — minimal (no userData migration)

No `~/.entropic/` → `~/.creatrix/` copy (nothing to preserve). Just rename hardcoded paths:

| Path / file | Action |
|---|---|
| `~/.entropic/crash_reports/`, `logs/sidecar.log`, `logs/electron-main.log`, `logs/sidecar_fault.log` | Rename hardcoded path in crash reporter + loggers |
| `frontend/package.json` | `name`, `productName`, `version: 3.0.0` |
| `frontend/electron-builder.yml` | `appId`, `productName` |
| `frontend/src/main/menu.ts`, `index.ts` | every "Entropic" string |
| `frontend/src/renderer/components/about/AboutDialog.tsx` | product strings |
| `docs/**/*.md` | sed + per-file audit (keep historical refs in changelogs) |
| `README.md` | rewrite product positioning |
| `~/.claude/projects/.../memory/entropic*.md` | rename slugs + content (separate from repo PR) |
| GitHub repo | `gh repo rename creatrix` |
| Hooks / scripts referencing `~/.entropic` | grep + sed |

### 6.2 Estimate

**3-5 hrs** (down from v1.1's 6-8 — userData migration dropped).

---

## 7. Cross-cutting concerns

1. **Undo/redo:** new operations wrap in `useUndoStore.beginTransaction`. Drag-add, Composite-on-track, automation mode change, track-duplicate.
2. **Project file format:** v3 only. No backward compat. v2 fixtures regenerated.
3. **Pop-out preview:** doesn't render inspector. Reads `useLayoutStore.popOutCollapsed`.
4. **Audio tracks:** do NOT get Composite (no visual layer). Validator rejects Composite-on-audio-track in both `addEffect` and `reorderEffect` paths (qa-redteam M6 — both choke points covered).
5. **MIDI mapping persistence:** unchanged. Snapshot test pins wire shape (qa-redteam L2).
6. **DeviceGroup:** Composite cannot be grouped (terminal-only; group flatten would invalidate position). Validator rejects.
7. **Performance pad `Pad.mappings`** vs **`Operator.mappings`** name conflict: resolve in PR-B `types.ts` rename — `Pad.padBindings`, keep `Operator.mappings` (qa-redteam L4).
8. **Right-click hover-help:** only DOM-rendered menus (timeline ContextMenu). Native Electron menus skip.
9. **Focus events update hover help** (keyboard accessibility) — same code path as mouseenter, wired in `useHoverDelegation` hook.
10. **JSON parse hardening (qa-redteam M1):** schema.py loader caps raw size < 50MB before parse; caps `len(tracks) < 256`, `len(effectChain) < MAX_CHAIN_DEPTH=10` (reuse existing `security.py:43` constant).
11. **DOM XSS guard (qa-redteam M5):** hover-help body strictly plaintext (NO `dangerouslySetInnerHTML`). Preset names truncated to 64 chars on save; control chars stripped.

---

## 8. Security considerations

| # | Surface | Risk | Mitigation |
|---|---|---|---|
| S1 | dataTransfer payload | Spoofed cross-source | Session-bound nonce + JSON validation + namespace check |
| S2 | Preset bundle imports | DEFERRED to follow-up PR before any third-party import | Hardening spec lives in a separate design doc when needed |
| S3 | BPM input | Out-of-range | Existing clamp `Math.max(1, Math.min(300, Math.round(bpm)))` |
| S4 | Search input | XSS via reflection | React auto-escape; no `dangerouslySetInnerHTML` audit |
| S5 | Schema load failure | Crash on malformed v3 | try/catch with user-friendly error + offer "start fresh" |
| S6 | DoS via operators | Project saturation | `MAX_OPERATORS_PER_PROJECT = 64`; render-budget guard |
| S7 | Modulation cycles | Infinite loop / 0.0 / crash | Full DFS cycle detection in `_topological_sort` |
| S8 | JSON bomb | Stack overflow on parse | Size cap + depth cap (reuse `MAX_CHAIN_DEPTH`) |

---

## 9. Test plan

### PR-zero
- Single-track fixture tests pass unmodified
- 2-track + 3-track multi-chain isolation
- Per-track freeze isolation
- Persistence round-trip (per-track chains survive save/reload)
- IPC: backend receives correct `track_id`
- E2E: 2-track fixture renders correctly

### PR-A
- Inspector × 8 states (unit + integration)
- Browser tabs/search/drag with payload validation + nonce + X clear + Esc clear
- Resize handles: drag, persistence, **16px hit zone validated**
- Hover delegation: settle delay, sticky, fade, Esc dismisses (WCAG), collapsible, focus events
- Selector contract: returns expected shape (PR-A reads post-PR-zero data)
- **Perf gate:** 100 chain entries + rapid mouse-sweep, < 8ms frame time
- Tool-mode stack: open modal → close → cursor restored; Esc → reset to select
- Statusbar tool-mode chip updates on every cursor change
- E2E: full inspector swap on selection change, hover slot survives change

### PR-B
- Per-blend-mode hash test (36 modes)
- 84 `addTriggerLane` fixture sites pass after mechanical replace
- Composite-terminal validator: at commit only, intermediate states allowed mid-transaction
- v3 schema loads, v2 schema rejected with clear error
- BPM split: editing `bpm` shifts effective; modulation writes only `effectiveBpm`; save persists only `bpm`
- **Export snapshot E2E:** sine LFO @ 1Hz on opacity; 30fps export vs 60fps export, **time-aligned** frames hash-match
- **Cycle detection (5 types):** direct, 2-hop, 3-hop, BPM-via-chain, render-graph cycle
- Audio track Composite rejection: both `addEffect` and `reorderEffect` paths
- JSON size cap: 51MB file rejected; 256-track file rejected; 11-deep chain rejected
- Composite-in-DeviceGroup rejected
- Transaction wraps: Composite drag undoes in one step

### PR-C
- Per-operator value tests (LFO sine, Sidechain follows source, Gate threshold, Stutter retriggers)
- Kentaro: 8 LFOs independent, master rate scales, BPM sync locks phase
- 32-mapping cap: 32nd accepted, 33rd rejected
- `MAX_OPERATORS_PER_PROJECT = 64`: 64 accepted, 65 rejected
- Render-budget guard: synthetic 20ms eval triggers degradation
- Topology graph snapshot, transform-only animation verified
- **Prototype gate result documented** before merge

### Layer per Gate 5
- Logic → Vitest unit
- Component → Vitest component
- Process / OS → Playwright `_electron` (pop-out, export snapshot, IPC round-trip)

---

## 10. Risk + rollback

| PR | Risk | Rollback |
|---|---|---|
| PR-zero | Per-track migration breaks UI integration | Revert PR; no flag |
| PR-A | UI redesign | Flag `F_CREATRIX_LAYOUT` off → old UI |
| PR-B | Composite + automation + cycle detection — highest backend risk | Revert PR (no flag, no user base = no fallback needed) |
| PR-C | Additive operators | Hide new operators from browser; old ones unchanged |
| PR-D | Rename (metadata) | Revert PR |

---

## 11. Build sequence

1. **PR-zero** (per-track chain) — 3-5d. Ships first. No flag.
2. **PR-A prototype gate** — 30 min. Hover delegation perf @ 200 targets.
3. **PR-A** (layout + browser + inspector) — 9-12h. Flag `F_CREATRIX_LAYOUT`. Selector contract decouples from PR-B shape.
4. **PR-B** (Composite + automation + BPM + cycle detection + export snapshot) — 12-18h. No flag (revert if broken).
5. **PR-C prototype gate** — 30 min. react-xyflow 32-path stress.
6. **PR-C** (operators + Kentaro Cluster) — 14-18h. Behind `F_CREATRIX_LAYOUT` (PR-A flag).
7. **PR-D** (rename + v3.0) — 3-5h. After other PRs settle (no formal bake; user picks when).

**Total: 38-53 hrs + 3-5 days PR-zero.**

---

## 12. Open follow-ups (out of scope for this 5-PR sweep)

- **Preset bundle hardening PR** (qa-redteam Real Tiger 1) — required before first third-party preset import
- Sample explorer / drum rack internals — placeholder ships in PR-A
- Lane editor (full-height point editing) — PR-B ships preview only
- Flatten "up to effect N" — single-mode only
- Operators beyond Kentaro Cluster — LFO-PNoise, LFO-Morf, LFO-RRND, MOD-ATRG
- Per-LFO sketch mode for Kentaro Cluster — dropped from PR-C scope
- Hover-help content authoring — separate documentation PR
- Removal of `F_CREATRIX_LAYOUT` flag — whenever user feels confident

---

## 13. Untested assumptions (validate before each gate)

- **react-xyflow 32-path @ 60fps** — prototype before PR-C lock (§5.1)
- **Hover delegation perf @ 200 effects < 8ms** — prototype before PR-A lock (§3.1)
- **Composite-as-terminal exactly matches `compositor.py:127-167`** — backend smoke test in PR-B Phase 1
- **`applyProjectModulations` cleanly extends existing `applyCCModulations`** — implementer to validate first hour of PR-B work; report back if larger refactor needed

---

## 14. Approval needed

This is v1.2: CTO + qa-redteam + /review findings folded in, "no user base" descope applied. Estimate compressed from 70-90 → 38-53 hrs.

Read PLAN.md, push back on anything off, say "go" and I'll start **PR-zero** in a fresh worktree off origin/main.
