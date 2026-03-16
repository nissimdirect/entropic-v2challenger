# Session 2 Prompt: Pattern Infrastructure for Entropic v2 Challenger

> **Purpose:** Before fixing 170 individual bugs, build the systemic patterns that prevent entire *classes* of bugs by construction. This session creates utilities, conventions, and guards that the fix sessions (3-7) will consume.
>
> **Prerequisite:** Read `~/.claude/projects/-Users-nissimagent/memory/entropic-audit-learnings.md` for the 7 bug pattern classes this work addresses.

---

## Context

A ship gate audit of Entropic v2 Challenger (Electron + React + Python desktop video DAW) found ~170 issues across 15 stores and the Python backend. Analysis revealed these aren't 170 independent bugs — they're 7 systemic patterns repeated across the codebase:

1. **Trust Boundary Blindness** — data crosses IPC/file/param boundaries without exhaustive validation
2. **Derived State Drift** — Zustand mutations forget to recompute dependent values
3. **Closures Over Mutable Indices** — 12 undo closures capture array index instead of entity ID
4. **Asymmetric Cleanup (Orphan Problem)** — deleting entity A leaves dangling references in stores B, C, D
5. **The Zero/Empty/NaN Trinity** — numeric guards applied to first use of a variable but not all uses
6. **React Lifecycle Leaks** — key={index}, missing listener cleanup, stale closures, timer leaks
7. **Non-Atomic File Operations** — direct writeFile for user data, no temp+rename

The meta-lesson: most bugs exist because **the safe path isn't the easy path.** Developers reach for `writeFile()` because it's one line. They capture `index` because it's already in scope. They skip validation because `isFinite()` is tedious. The fix is making the safe path the *default* path — utilities that are easier to use correctly than to use incorrectly.

---

## What to Build (7 Patterns)

### Pattern 1: `sanitizeParam()` — Universal Numeric Sanitization

**Location:** `backend/src/engine/container.py` (enhance existing filter at line 53-57)

**Current code:**
```python
effect_params = {
    k: v
    for k, v in params.items()
    if not (isinstance(v, float) and (math.isnan(v) or math.isinf(v)))
}
```

**Problem:** Only catches Python `float`. Misses:
- String params that parse to NaN (`"NaN"`, `"Infinity"`)
- Numpy scalars (`np.float64('nan')`) — `isinstance(v, float)` is False for these
- Integer overflow edge cases
- Empty frame input (0x0 array)

**Build:**
```python
def sanitize_params(params: dict) -> dict:
    """Sanitize effect parameters at the trust boundary.

    Handles: Python float, numpy scalar, string-encoded NaN/Inf.
    Returns clean dict with invalid values dropped (effect uses its default).
    """
    clean = {}
    for k, v in params.items():
        # numpy scalar → Python native
        if hasattr(v, 'item'):
            v = v.item()
        # string → attempt float parse, reject NaN/Inf
        if isinstance(v, str):
            try:
                f = float(v)
                if not math.isfinite(f):
                    continue  # drop NaN/Inf strings
                v = f  # only convert if it was numeric — but wait, effect might want string params
            except ValueError:
                pass  # genuine string param, keep it
        # float/int finiteness check
        if isinstance(v, (float, int)) and not math.isfinite(v):
            continue
        clean[k] = v
    return clean
```

**Also build:** Empty frame guard before `effect_fn()` call:
```python
if frame.size == 0:
    return frame, state_in
```

**Test file:** `backend/tests/test_engine/test_container_nan.py` (new)
- NaN string param → dropped
- Inf/-Inf string param → dropped
- `np.float64('nan')` → dropped
- Normal string param like `"overlay"` → kept
- Normal float `0.5` → kept
- Empty frame (0x0) → returns empty frame without crash

**Success criteria:** Run `python3 -m pytest tests/test_engine/test_container_nan.py -v` — all pass. Full backend suite green.

---

### Pattern 2: `undoable()` — Safe Undo Helper

**Location:** `frontend/src/renderer/stores/undo.ts` (add to existing file)

**Current undo store** (`undo.ts`):
```typescript
execute: (entry) =>
    set((state) => {
      entry.forward()  // BUG: forward() inside set() — runs twice on re-render
      // ...
    }),
```

**Problems this pattern solves:**
- `forward()` called inside `set()` (double-execution risk)
- No enforced pattern for ID-based closures (12 bugs)
- Boilerplate for every undo-integrated action
- UUIDs generated inside forward closures (non-deterministic redo)

**Build:**
```typescript
/**
 * Wrap a destructive action in undo/redo. Enforces:
 * - forward() runs OUTSIDE set() (no double-execution)
 * - Pre-generated IDs passed in (deterministic redo)
 * - Structured description for history panel
 */
export function undoable(
  description: string,
  forward: () => void,
  inverse: () => void,
): void {
  const entry: UndoEntry = {
    forward,
    inverse,
    description,
    timestamp: Date.now(),
  }
  // Execute forward FIRST, then push to stack
  entry.forward()
  useUndoStore.setState((state) => {
    let past = [...state.past, entry]
    if (past.length > MAX_UNDO_ENTRIES) {
      past = past.slice(past.length - MAX_UNDO_ENTRIES)
    }
    return { past, future: [], isDirty: true }
  })
}
```

**Also fix:** The existing `execute()` method — move `entry.forward()` before `set()`.

**Convention doc (add to CLAUDE.md or a CONVENTIONS.md):**
```
UNDO CLOSURES:
- Always use undoable(description, forward, inverse)
- Capture entity ID, never array index: const id = entity.id; ... find(e => e.id === id)
- Pre-generate UUIDs BEFORE the undoable() call: const newId = randomUUID()
- Cross-store cleanup goes INSIDE forward(), inverse must RESTORE cleaned data
```

**Test file:** `frontend/src/__tests__/stores/undo.test.ts` (add tests)
- `undoable()` executes forward once (not twice)
- undo calls inverse, redo calls forward again
- Pre-generated ID pattern: create with ID → undo → redo → same ID used

**Success criteria:** `npx vitest run src/__tests__/stores/undo.test.ts` — all pass.

---

### Pattern 3: `atomicWriteFile()` — Safe File Persistence

**Location:** `frontend/src/main/file-handlers.ts` (add utility, use in `file:write` handler)

**Current code:**
```typescript
await writeFile(resolved, data, 'utf8')  // direct overwrite — crash = corruption
```

**Build:**
```typescript
import { rename, writeFile, unlink } from 'fs/promises'

async function atomicWriteFile(filePath: string, data: string): Promise<void> {
  const tmpPath = filePath + '.tmp'
  try {
    await writeFile(tmpPath, data, 'utf8')
    await rename(tmpPath, filePath)  // atomic on same filesystem
  } catch (err) {
    // Clean up .tmp on failure
    try { await unlink(tmpPath) } catch { /* already gone */ }
    throw err
  }
}
```

**Also:**
- Add `.tmp` suffix to `isPathAllowed()` — if `filePath` is allowed, `filePath + '.tmp'` must also be allowed
- Add `lstatSync` symlink check in `isPathAllowed()` after `resolve()`
- Fix autosave edge case: if `projectPath` has no `/`, default to userData dir

**Test file:** `frontend/src/__tests__/main/file-handlers.test.ts` (add tests)
- Write file → content correct
- Write file twice (simulating save-over) → not corrupted
- `.tmp` file cleaned up after successful write
- Symlink path → denied

**Success criteria:** `npx vitest run src/__tests__/main/file-handlers.test.ts` — all pass.

---

### Pattern 4: `ALLOWED_COMMANDS` — IPC Command Allowlist

**Location:** `frontend/src/main/zmq-relay.ts`

**Current code:**
```typescript
// No filtering — all commands forwarded to Python
ipcMain.handle('send-command', async (_event, command) => { ... })
```

**Build:**
```typescript
/** Commands the renderer is allowed to send to the Python engine. */
const ALLOWED_COMMANDS = new Set([
  // Playback
  'render_frame', 'apply_chain', 'seek',
  // Ingest
  'ingest', 'list_effects',
  // Export
  'export_start', 'export_cancel', 'export_status',
  // Clock
  'clock_sync', 'clock_set_fps',
  // Freeze
  'freeze_effect', 'unfreeze_effect', 'flatten_chain',
  // Audio
  'audio_load', 'audio_play', 'audio_pause', 'audio_stop', 'audio_seek',
  // State
  'flush_state', 'reset_state',
  // Routing
  'check_dag',
  // Health
  'ping',
])

// In registerRelayHandlers():
ipcMain.handle('send-command', async (_event, command) => {
  const cmd = command.cmd as string
  if (!cmd || !ALLOWED_COMMANDS.has(cmd)) {
    return { id: command.id, ok: false, error: `Unknown command: ${cmd}` }
  }
  // ... existing logic
})
```

**Convention:** Document that adding a new Python handler requires a corresponding entry in `ALLOWED_COMMANDS`. Add a comment at the Set definition.

**Test file:** `frontend/src/__tests__/main/zmq-relay.test.ts` (new file)
- Valid command → forwarded (mock ZMQ)
- `shutdown` command → rejected with error
- Unknown command → rejected
- Missing `cmd` field → rejected

**Success criteria:** `npx vitest run src/__tests__/main/zmq-relay.test.ts` — all pass.

---

### Pattern 5: `clampFinite()` + `guardNumeric()` — Numeric Safety Utilities

**Location (frontend):** `frontend/src/shared/numeric.ts` (new file)
**Location (backend):** `backend/src/engine/guards.py` (new file)

**Frontend:**
```typescript
/** Clamp a value to [min, max], returning fallback if NaN/Inf. */
export function clampFinite(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, value))
}

/** Assert a number is finite and positive. Throws if not. */
export function guardPositive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number, got ${value}`)
  }
  return value
}
```

**Backend:**
```python
def clamp_finite(value: float, lo: float, hi: float, fallback: float) -> float:
    """Clamp to [lo, hi], returning fallback if NaN/Inf."""
    if not math.isfinite(value):
        return fallback
    return max(lo, min(hi, value))

def guard_positive(value: float, name: str) -> float:
    """Assert positive finite. Raises ValueError if not."""
    if not math.isfinite(value) or value <= 0:
        raise ValueError(f"{name} must be positive finite, got {value}")
    return value
```

**Usage sites (immediate — fix the bugs while building the pattern):**
- `zmq_server.py` line 775: `guard_positive(fps, "fps")` in `_handle_clock_set_fps`
- `zmq_server.py` line 865: `if fps <= 0: fps = 30.0` fallback in `_get_audio_pcm_for_frame`
- `layout.ts` line 66: `clampFinite(height, 100, 800, 250)` in `setTimelineHeight`
- `automation-simplify.ts` line 7: `if (epsilon <= 0) return points`

**Test files:**
- `frontend/src/__tests__/utils/numeric.test.ts` (new)
- `backend/tests/test_engine/test_guards.py` (new)

**Success criteria:** Both test files pass. Grep for raw `isFinite` / `math.isfinite` in stores — should be replaced by utility calls at boundary points.

---

### Pattern 6: `STORE_RELATIONSHIPS` — Cross-Store Entity Map

**Location:** `frontend/src/shared/store-relationships.ts` (new file)

**Purpose:** Document which entities reference which, so deletion knows what to clean up. This is a *reference document* that cleanup code imports.

```typescript
/**
 * Cross-store entity relationships.
 * When deleting an entity, clean up all downstream references.
 *
 * Read direction: "Deleting [entity] requires cleanup in [stores]"
 */
export const STORE_RELATIONSHIPS = {
  /** Deleting an effect instance */
  effectInstance: {
    automationLanes: 'timeline.tracks[].automationLanes where paramPath starts with effect ID',
    operatorMappings: 'operators[].mappings where targetEffectId === effect ID',
    ccMappings: 'midi.ccMappings where effectId === effect ID',
    padMappings: 'performance.pads[].mappings where effectId === effect ID',
  },
  /** Deleting a track */
  track: {
    clips: 'track.clips (cascade — contained)',
    automationLanes: 'track.automationLanes (cascade — contained)',
  },
  /** Deleting an operator */
  operator: {
    fusionSources: 'operators[].parameters.sources where operatorId === operator ID (fusion type)',
  },
  /** Loading a new drum rack */
  drumRack: {
    midiNotes: 'midi.padMidiNotes — reconcile with new pad IDs',
    padStates: 'performance.padStates — reset to idle',
  },
} as const

/**
 * Resource limits — centralized so all stores reference the same constants.
 * Existing projects that exceed limits are clamped on load, not rejected.
 */
export const LIMITS = {
  MAX_TRACKS: 64,
  MAX_CLIPS_PER_TRACK: 500,
  MAX_OPERATORS: 16,
  MAX_MARKERS: 1000,
  MAX_POINTS_PER_LANE: 50_000,
  MAX_COMPOSITOR_LAYERS: 32,
  MAX_EFFECTS_PER_CHAIN: 10,  // already enforced, but centralize
} as const
```

**No tests needed** — this is a type-safe constant. But document: "When adding a new entity type with cross-store references, add it here."

---

### Pattern 7: `useStableListener()` — React Event Listener with Cleanup

**Location:** `frontend/src/renderer/hooks/useStableListener.ts` (new file)

**Problem:** Multiple components attach `document.addEventListener` without cleanup, and read stale closure values.

```typescript
import { useEffect, useRef, useCallback } from 'react'

/**
 * Attach a document-level event listener with automatic cleanup.
 * The handler always sees the latest closure values via ref.
 *
 * Replaces raw document.addEventListener in Clip.tsx, AutomationNode.tsx, etc.
 */
export function useStableListener<K extends keyof DocumentEventMap>(
  eventName: K,
  handler: (event: DocumentEventMap[K]) => void,
  enabled: boolean = true,
): void {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!enabled) return

    const listener = (event: DocumentEventMap[K]) => handlerRef.current(event)
    document.addEventListener(eventName, listener)
    return () => document.removeEventListener(eventName, listener)
  }, [eventName, enabled])
}
```

**Usage:** Replace all `document.addEventListener('mousemove/mouseup', ...)` in Clip.tsx and AutomationNode.tsx with this hook. The ref pattern ensures the handler always reads current zoom, position, etc. — no stale closures.

**Test file:** `frontend/src/__tests__/hooks/useStableListener.test.ts` (new)
- Listener fires on document event
- Cleanup removes listener on unmount
- Handler ref updates without re-registering listener

---

## Execution Order

```
1. Pattern 5 (clampFinite/guardNumeric) — smallest, no dependencies, immediate use
2. Pattern 1 (sanitizeParam) — backend, uses guardNumeric pattern
3. Pattern 3 (atomicWriteFile) — frontend main process, standalone
4. Pattern 4 (ALLOWED_COMMANDS) — frontend main process, standalone
5. Pattern 2 (undoable) — depends on understanding current undo store
6. Pattern 6 (STORE_RELATIONSHIPS) — reference doc, informs Pattern 2 usage
7. Pattern 7 (useStableListener) — React hook, standalone
```

**Patterns 1-5 have tests.** Write failing tests first, then implement, then verify full suite.

## Validation Protocol (EVERY pattern)

1. Read the existing code at the stated location
2. Write a failing test that demonstrates the current vulnerability
3. Implement the pattern (minimal, no over-engineering)
4. Run the failing test — now passes
5. Run full suite: `cd backend && python3 -m pytest -x -n auto` + `cd frontend && npx vitest run`
6. After all 7 patterns: `git diff` — review, confirm only intended files modified

## What This Session Does NOT Do

- Does NOT fix all 170 individual bugs (that's sessions 3-7)
- Does NOT wire undo into timeline/project/operators (that's Phase 5)
- Does NOT add deserialization validation (that's Phase 4)
- Does NOT fix React components (that's Phase 8)

This session builds the **tools and conventions** those sessions will use.

---

## Files Created/Modified (Expected)

| Action | File |
|--------|------|
| New | `backend/src/engine/guards.py` |
| New | `backend/tests/test_engine/test_container_nan.py` |
| New | `backend/tests/test_engine/test_guards.py` |
| Modified | `backend/src/engine/container.py` (use sanitize_params + empty frame guard) |
| Modified | `backend/src/zmq_server.py` (use guard_positive for fps) |
| New | `frontend/src/shared/numeric.ts` |
| New | `frontend/src/shared/store-relationships.ts` |
| New | `frontend/src/renderer/hooks/useStableListener.ts` |
| New | `frontend/src/__tests__/main/zmq-relay.test.ts` |
| New | `frontend/src/__tests__/utils/numeric.test.ts` |
| New | `frontend/src/__tests__/hooks/useStableListener.test.ts` |
| Modified | `frontend/src/main/file-handlers.ts` (atomicWriteFile + symlink check + .tmp allowlist) |
| Modified | `frontend/src/main/zmq-relay.ts` (ALLOWED_COMMANDS) |
| Modified | `frontend/src/renderer/stores/undo.ts` (fix execute + add undoable helper) |
| Modified | `frontend/src/__tests__/main/file-handlers.test.ts` (add atomic write tests) |
| Modified | `frontend/src/__tests__/stores/undo.test.ts` (add undoable tests) |

**Total: 11 new files, 6 modified files, ~25 new tests**
