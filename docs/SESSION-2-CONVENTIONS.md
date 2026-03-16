# Session 2 Pattern Conventions — Validation Checklist

**Use this to verify Sessions 3-7 work matches the patterns built in Session 2.**

---

## 1. Numeric Guards

### Python (trust boundary — IPC from frontend)

**Module:** `backend/src/engine/guards.py`

```python
from engine.guards import sanitize_params, clamp_finite, guard_positive
```

| Function | Use when | Example |
|----------|----------|---------|
| `sanitize_params(params)` | Effect params from IPC | Already wired in `container.py` |
| `clamp_finite(value, lo, hi, fallback)` | Any float from IPC that has a valid range | `clamp_finite(float(x), 0.0, 1.0, 1.0)` |
| `guard_positive(value, "name")` | Divisors, rates, fps — must be >0 | `guard_positive(float(fps), "fps")` — raises `ValueError` |

**Convention:** NO raw `float()` on IPC input. Every `float(message.get(...))` must be wrapped.
**Check:** `grep -n '= float(' backend/src/zmq_server.py` should return 0 results.

### TypeScript (renderer/store layer)

**Module:** `frontend/src/shared/numeric.ts`

```typescript
import { clampFinite, guardPositive } from '../../shared/numeric'
```

| Function | Use when | Example |
|----------|----------|---------|
| `clampFinite(value, min, max, fallback)` | Store setters with numeric bounds | `clampFinite(h, 100, 800, 250)` |
| `guardPositive(value, "name")` | Values that must be >0 | Throws `RangeError` |

**Convention:** Use `clampFinite` for any store setter that accepts user-provided numbers (height, zoom, speed, etc.).

---

## 2. Undo

**Module:** `frontend/src/renderer/stores/undo.ts`

```typescript
import { undoable } from './undo'
```

### Rules

1. **Use `undoable(description, forward, inverse)` for ALL destructive actions** — not `useUndoStore.getState().execute()`
2. **Pre-generate IDs BEFORE** the `undoable()` call:
   ```typescript
   const newId = randomUUID()  // BEFORE undoable
   undoable('Add track', () => addTrack(newId), () => removeTrack(newId))
   ```
3. **Capture entity by ID, never array index:**
   ```typescript
   // GOOD: find by ID
   inverse: () => { set(s => ({ items: s.items.filter(i => i.id !== targetId) })) }
   // BAD: splice by index
   inverse: () => { set(s => { s.items.splice(idx, 1) }) }
   ```
4. **Cross-store cleanup goes INSIDE `forward()`; inverse must RESTORE:**
   ```typescript
   undoable('Delete effect',
     () => {
       removeEffect(id)
       removeAutomationLanes(id)   // cleanup
       removeOperatorMappings(id)  // cleanup
     },
     () => {
       restoreEffect(savedEffect)
       restoreAutomationLanes(savedLanes)
       restoreOperatorMappings(savedMappings)
     }
   )
   ```
5. **`forward()` throwing is safe** — entry still pushed to stack, toast fired. But write `forward()` to be atomic when possible.

### Check

```bash
# Should be migrating TOWARD 0:
grep -c 'getState().execute(' frontend/src/renderer/stores/*.ts
# Should be growing:
grep -c 'undoable(' frontend/src/renderer/stores/*.ts
```

---

## 3. Cross-Store Deletion

**Module:** `frontend/src/shared/store-relationships.ts`

Consult `STORE_RELATIONSHIPS` when deleting entities. Every deletion must clean up downstream references:

| Deleting | Must also clean |
|----------|----------------|
| Effect instance | automationLanes, operatorMappings, ccMappings, padMappings |
| Track | clips (cascade), automationLanes (cascade) |
| Operator | fusionSources |
| Drum rack (load new) | midiNotes (reconcile), padStates (reset) |

**Check:** Every `removeEffect`/`deleteTrack`/`removeOperator` function should have cleanup calls matching this table.

---

## 4. Resource Limits

**Module:** `frontend/src/shared/limits.ts` (SINGLE source of truth)

```typescript
import { LIMITS } from '../../shared/limits'
```

| Constant | Value | Used in |
|----------|-------|---------|
| `MAX_TRACKS` | 64 | timeline.ts |
| `MAX_CLIPS_PER_TRACK` | 500 | timeline.ts |
| `MAX_OPERATORS` | 16 | operators.ts |
| `MAX_MARKERS` | 1000 | timeline.ts |
| `MAX_POINTS_PER_LANE` | 50,000 | automation.ts |
| `MAX_COMPOSITOR_LAYERS` | 32 | (enforce in compositor) |
| `MAX_EFFECTS_PER_CHAIN` | 10 | project.ts, EffectBrowser.tsx |

**Convention:** NEVER hardcode limits. Import from `shared/limits.ts`.
**Check:** `grep -rn 'const MAX_' frontend/src/renderer/stores/ frontend/src/renderer/components/` — only `MAX_VISIBLE` (toast) and `MAX_UNDO_ENTRIES` (undo) should be local. Everything else should come from LIMITS.

---

## 5. Atomic File Writes

**Module:** `frontend/src/main/file-handlers.ts` (private `atomicWriteFile`)

All file writes go through the `file:write` IPC handler which uses `atomicWriteFile` internally (fsync + unique `.tmp.PID.TIMESTAMP` + rename).

**Convention:** Don't add new `writeFile`/`writeFileSync` calls in main process code. Use the IPC handler.
**Check:** `grep -rn 'writeFile\|writeFileSync' frontend/src/main/ | grep -v 'fh.writeFile\|atomicWrite\|test'` — only `support-bundle.ts` and `diagnostics-handlers.ts` should appear (known exceptions, low-risk sync writes).

---

## 6. IPC Command Allowlist

**Module:** `frontend/src/main/zmq-relay.ts` — `ALLOWED_COMMANDS` Set

When adding a new Python handler, you MUST also add the command to `ALLOWED_COMMANDS` in `zmq-relay.ts`. Otherwise the frontend will reject it with "Unknown command".

**Check:** Every `_handle_*` method in `zmq_server.py` should have a matching entry in `ALLOWED_COMMANDS`.

---

## 7. React Event Listeners

**Module:** `frontend/src/renderer/hooks/useStableListener.ts`

```typescript
import { useStableListener } from '../hooks/useStableListener'

useStableListener(document, 'keydown', handler, enabled)
useStableListener(window, 'resize', handler)
```

**Convention:** No raw `document.addEventListener` / `window.addEventListener` in components. Use `useStableListener` instead.
- Handler always sees latest closure values (stable ref internally)
- Cleanup is automatic on unmount
- `options` objects are safe to pass inline (stabilized via ref)

**Check (migration manifest):**
```bash
grep -rn 'addEventListener\|removeEventListener' frontend/src/renderer/components/ | grep -v node_modules
```
Sites still using raw listeners need migration.

---

## 8. Toast Conventions

```typescript
import { useToastStore } from './toast'

useToastStore.getState().addToast({
  level: 'error',     // 'info' | 'warning' | 'error' | 'state'
  message: 'text',
  source: 'storeName', // required for error toasts (enables rate limiting)
})
```

**Convention:** Field is `level`, not `type`. Source is required for errors.

---

## Validation Script

Run this to check Session 3+ work against conventions:

```bash
cd ~/Development/entropic-v2challenger

echo "=== Raw float() in zmq_server (should be 0) ==="
grep -cn '= float(' backend/src/zmq_server.py

echo "=== execute() calls remaining (migrating toward 0) ==="
grep -c 'getState().execute(' frontend/src/renderer/stores/*.ts 2>/dev/null | grep -v ':0$'

echo "=== Hardcoded MAX_ in stores (only toast/undo allowed) ==="
grep -n 'const MAX_' frontend/src/renderer/stores/*.ts | grep -v 'MAX_VISIBLE\|MAX_UNDO'

echo "=== Raw addEventListener in components ==="
grep -rn 'addEventListener' frontend/src/renderer/components/ | grep -v node_modules

echo "=== writeFile outside atomicWriteFile ==="
grep -rn 'writeFile\|writeFileSync' frontend/src/main/ | grep -v 'fh.writeFile\|atomicWrite\|test\|support-bundle\|diagnostics'

echo "=== Toast using 'type' instead of 'level' ==="
grep -rn "type: 'error'\|type: 'warning'\|type: 'info'" frontend/src/renderer/stores/*.ts
```
