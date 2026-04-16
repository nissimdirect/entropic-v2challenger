# Entropic Playbook

> **Project-specific rules learned from past bugs.** Read by Gate 13 (self-critique) and /workflows:work per task.
> Populated by /reflect when learnings reference project-specific files/functions/modules.
> Max 50 rules. Prune stale entries via /session-close.
>
> **Format:** Each rule has Category, Rule (imperative), Why (what went wrong), Example (code pattern).

---

## PLAY-001: Validate at every trust boundary
- **Added:** 2026-03-16 (ship gate audit)
- **Category:** trust-boundary
- **Rule:** Every IPC handler, file load, and param ingestion point must have type + range + isFinite checks.
- **Why:** NaN strings, unfiltered IPC commands, unvalidated deserialized data, and symlink bypasses passed through unchecked. Internal code can trust internal state — boundary code cannot.
- **Example:** `ipcMain.handle('render_frame', (_, params) => { /* params.fps could be NaN, 0, or negative — must clamp */ })`

## PLAY-002: Recompute derived state after mutations
- **Added:** 2026-03-16 (ship gate audit)
- **Category:** state-management
- **Rule:** After any Zustand `set()` call, ask: "What other state depends on what I just changed?" Recompute it.
- **Why:** `splitClip` didn't recalc duration, resize left stale height, envelope split caused double-set. Zustand `set()` makes derived values look like regular fields.
- **Example:** `clipStore.set({ clips: newClips })` — must also update `totalDuration`, `clipCount`, any selector that reads `clips`.

## PLAY-003: Closures capture IDs, never indices
- **Added:** 2026-03-16 (ship gate audit, 12 instances)
- **Category:** state-management
- **Rule:** Undo closures MUST use `findById()` inside the closure, never `state[capturedIndex]`. Pre-generate UUIDs outside closures.
- **Why:** After reorder, `state[3]` points to a different item. 12 undo closures captured array index instead of entity ID — all produced corrupt undo.
- **Example:** BAD: `const undo = () => { store.set(s => { s.effects[idx] = old }) }` GOOD: `const undo = () => { store.set(s => { const i = s.effects.findIndex(e => e.id === id); s.effects[i] = old }) }`

## PLAY-004: Deletion is a distributed transaction
- **Added:** 2026-03-16 (ship gate audit)
- **Category:** cleanup
- **Rule:** When deleting an entity from any store, check ALL other stores for references. Cleanup goes INSIDE the undo forward closure so the inverse can restore.
- **Why:** Delete effect → orphan automation lanes, operator mappings, CC mappings. Delete rack → orphan MIDI notes. Multi-store architecture has undocumented cross-store references.
- **Example:** `effectStore.delete(id)` must also clean `automationStore.lanes`, `operatorStore.mappings`, `midiStore.ccMappings`, `selectionStore`.

## PLAY-005: Guard ALL uses of a numeric variable
- **Added:** 2026-03-16 (ship gate audit)
- **Category:** numeric
- **Rule:** Every numeric input from outside the module: `isFinite()` + range check + clamp. Grep ALL uses of the variable, not just the first.
- **Why:** fps=0 caused division by zero, NaN layout height, negative epsilon caused stack overflow, 10 IPC params were unclamped. Line 864 guarded fps, line 865 didn't.
- **Example:** BAD: `const fps = params.fps; /* used 3 lines later without check */` GOOD: `const fps = Math.max(1, Math.min(120, Number(params.fps) || 30));`

## PLAY-006: React keys must be stable identities
- **Added:** 2026-03-16 (ship gate audit, 6 components)
- **Category:** lifecycle
- **Rule:** React keys = entity ID or stable identifier. Never `key={index}`. Use AbortController for listeners. Refs for values read inside event handlers. Clear timers on unmount.
- **Why:** In a real-time DAW, rapid mount/unmount from scrubbing/playback makes lifecycle bugs become data corruption. Stale closures read old state, leaked timers fire after unmount.
- **Example:** BAD: `effects.map((e, i) => <Effect key={i} />)` GOOD: `effects.map(e => <Effect key={e.id} />)`

## PLAY-007: Atomic writes for user data
- **Added:** 2026-03-16 (ship gate audit)
- **Category:** file-ops
- **Rule:** Any file representing user data must use write-to-temp + atomic rename. Add cleanup in finally blocks for cancelled/errored operations.
- **Why:** Direct `writeFile` for project save = crash mid-write = corrupted user data. Orphan partial export files left on cancel with no cleanup.
- **Example:** BAD: `fs.writeFileSync(projectPath, data)` GOOD: `fs.writeFileSync(tmpPath, data); fs.renameSync(tmpPath, projectPath);` with `finally { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); }`

## PLAY-008: Retire orphaned components after UX redesigns
- **Added:** 2026-04-16 (PR #18 CI failure)
- **Category:** cleanup
- **Rule:** When a major UX redesign renames or replaces a DOM container, (a) delete the orphaned `.tsx` file OR move it into a `legacy/` folder, and (b) grep `tests/e2e/**` and `__tests__/**` for class selectors pointing at the replaced element and update them in the same commit as the UI change.
- **Why:** Phase 12-16 replaced `<DropZone>` (`.drop-zone`) with `FileDialog` inside `.app__upload`, but `DropZone.tsx` stayed on disk as dead code. `smoke.spec.ts` still targeted `.drop-zone`, so CI went red on every PR until a selector sweep. Dead components lie — they compile and pass unit tests that import them directly even when they're never rendered.
- **Example:** After replacing a component: `rg -l "\.drop-zone|DropZone" frontend/src frontend/tests` before committing. If the orphan must stay for future re-enable (e.g., `OperatorRack`), add a comment at its only live import site explaining why, so it isn't mistaken for live UI in tests.
