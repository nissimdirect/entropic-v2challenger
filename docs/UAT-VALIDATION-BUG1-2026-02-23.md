---
title: UAT Validation Report — BUG-1 Fix
date: 2026-02-23
validator: claude-opus-4.6 (automated UAT)
commit: 6959404
status: PASS (with caveats)
confidence: 92%
---

# UAT Validation Report: BUG-1 Fix

## Executive Summary

**Verdict: PASS** | **Confidence: 92%**

The BUG-1 fix (camelCase/snake_case field mismatch) is **correctly implemented** and resolves the P0 blocking issue where effects had zero visual impact on the preview canvas. The serialization layer in `ipc-serialize.ts` correctly maps all three critical fields (`effectId` -> `effect_id`, `isEnabled` -> `enabled`, `parameters` -> `params`). Both `render_frame` and `export_start` code paths use `serializeEffectChain()`. The error overlay in `PreviewCanvas.tsx` properly surfaces render failures to the user.

**Why 92% and not 100%:** Two caveats discovered during validation (see Risk Assessment).

---

## 1. IPC Contract Validation

### 1.1 Serializer Review (`frontend/src/shared/ipc-serialize.ts`)

| Frontend Field | Serialized To | Backend Reads (`pipeline.py`) | Match? |
|----------------|--------------|-------------------------------|--------|
| `effectId` (string) | `effect_id` | `effect_instance.get("effect_id")` (line 53) | YES |
| `isEnabled` (boolean) | `enabled` | `effect_instance.get("enabled", True)` (line 50) | YES |
| `parameters` (Record) | `params` | `effect_instance.get("params", {})` (line 54) | YES |
| `mix` (number) | `mix` | **NOT READ by pipeline** (see caveat) | PARTIAL |

The serializer outputs exactly 4 keys: `effect_id`, `enabled`, `params`, `mix`. The backend pipeline reads the first 3 correctly. The `mix` field is a latent issue documented below.

### 1.2 Frontend-only fields correctly excluded

The serializer does NOT send: `id`, `isFrozen`, `modulations`, `mask`. These are frontend-only fields that the backend would silently ignore. Correct behavior.

### 1.3 All IPC call sites use serialization

| Call Site | File:Line | Uses `serializeEffectChain()`? |
|-----------|-----------|-------------------------------|
| `requestRenderFrame` | `App.tsx:138` | YES |
| `handleExport` | `App.tsx:250` | YES |

Both code paths that send effect chains to the backend are covered. No raw `effectChain` is sent anywhere.

### 1.4 Backend ZMQ handlers — field consistency audit

All ZMQ commands that accept a `chain` parameter:

| Handler | Backend Field Names | Consistent? |
|---------|-------------------|-------------|
| `_handle_render_frame` (line 123) | `chain`, `path`, `project_seed`, `frame_index`, `time` | YES — all snake_case |
| `_handle_apply_chain` (line 162) | `chain`, `path`, `frame_index`, `project_seed` | YES — all snake_case |
| `_handle_export_start` (line 191) | `chain`, `input_path`, `output_path`, `project_seed` | YES — all snake_case |

No camelCase/snake_case mismatches found in the top-level ZMQ command fields.

### 1.5 Contract verdict: **PASS**

---

## 2. Test Coverage Assessment

### 2.1 Frontend Tests — 88/88 PASS

```
 RUN  v3.2.4

 8 test files, 88 tests, ALL PASSED
 Duration: 1.45s
```

### 2.2 ipc-serialize.test.ts — 15 tests

| Test Group | Count | Assessment |
|------------|-------|------------|
| `serializeEffectInstance` field mapping | 4 | Covers all 3 renamed fields + mix preservation |
| Frontend-only field exclusion | 1 | Verifies `id`, `isFrozen`, `modulations`, `mask` are absent |
| Output key set validation | 1 | Asserts exactly `[effect_id, enabled, mix, params]` |
| `serializeEffectChain` | 4 | Empty chain, single, multi, order preservation |
| Backend contract validation | 5 | Required fields present, correct types, no camelCase leakage |

**Assessment:** The 15 tests are comprehensive for the serialization layer. They cover:
- Every field mapping (positive and negative)
- Type correctness (string, boolean, object)
- Chain semantics (empty, single, multi, ordering)
- Anti-regression (explicit check for the exact camelCase field names that caused BUG-1)

**One gap:** No test validates that `serializeEffectChain` handles effects with empty/missing `parameters` (i.e., `parameters: {}`). The backend handles this with defaults (`params.get("amount", 0.5)` etc.), so this is low risk.

### 2.3 Backend Tests — 345/345 PASS (6 skipped)

```
345 passed, 6 skipped in 65.00s
```

The 6 skipped tests are in:
- `test_all_effects.py` (2 skipped — likely platform-specific effects)
- `test_v7_nuitka.py` (4 skipped — Nuitka binary not present in dev environment)

### 2.4 TypeScript Type Check — PASS

```
npx tsc --noEmit → EXIT CODE: 0
```

Zero type errors across the entire frontend codebase.

### 2.5 `handleExport` serialization verification

**Confirmed at `App.tsx:250`:**
```typescript
chain: serializeEffectChain(effectChain),
```

The export path uses the same serializer. This was explicitly called out in the bug report as a second fix point. **PASS.**

### 2.6 Error overlay verification

**PreviewCanvas.tsx** now accepts a `renderError` prop and renders a visible error overlay:
- Red background (`rgba(239, 68, 68, 0.9)`) at the bottom of the canvas
- Shows "Effect error: {message}" text
- Only visible when `renderError` is non-null
- Positioned `absolute` with `pointerEvents: 'none'` (doesn't block canvas interaction)

**App.tsx** sets `renderError` in three cases:
1. `res.ok === false` (line 148-149): `setRenderError(res.error ?? 'Render failed')`
2. Exception during render (line 152-153): `setRenderError(err.message)`
3. Cleared on success (line 146): `setRenderError(null)`

**Assessment:** Covers all error paths from `render_frame`. **PASS.**

---

## 3. Gap Analysis (vs V2-AUTOMATED-UAT-PLAN.md)

### 3.1 IPC Contract Tests Section

| UAT Plan Test | Status | Evidence |
|--------------|--------|----------|
| #1: Effect chain field names | COVERED | `ipc-serialize.test.ts` — 15 tests validate field mapping |
| #2: Round-trip schema validation | PARTIALLY COVERED | Frontend-side schema validation exists (`validate.test.ts`), but no true round-trip test (serialize in TS -> deserialize in Python -> validate fields) |
| #3: Error visibility | COVERED | `PreviewCanvas.tsx` error overlay + `renderError` state in App.tsx |
| #4: Render failure recovery | NOT YET TESTED | No automated test verifies: first render fails -> second render with valid chain -> preview recovers |

### 3.2 Phase 1 Tests #21, #22

| Test | Status | Notes |
|------|--------|-------|
| #21: Effect-then-import recovery | NOT YET AUTOMATED | The fix partially addresses this (BUG-1 fix means the render won't fail due to field mismatch). But no E2E test exists yet. |
| #22: Render error visibility | COVERED BY CODE | PreviewCanvas error overlay exists. No E2E Playwright test yet (expected — E2E tests require Electron+sidecar). |

### 3.3 Other call sites that send EffectInstance data

Audit of all places that could send effect data to the backend:

| Location | Sends EffectInstance? | Uses serializer? |
|----------|----------------------|-----------------|
| `App.tsx:138` (render_frame) | Yes | YES |
| `App.tsx:250` (export_start) | Yes | YES |
| `App.tsx:181` (ingest) | No — no chain sent | N/A |
| `App.tsx:266` (export_cancel) | No — only job_id | N/A |
| `stores/effects.ts:20` (list_effects) | No — only reads | N/A |

**No unprotected call sites found.** Every path that sends effect chains uses `serializeEffectChain()`.

### 3.4 JSON Schema gap

The IPC command JSON schema (`ipc-command.schema.json`) defines chain items as `{ "type": "object" }` without field-level validation. This means the schema validator would accept both camelCase and snake_case payloads. Consider adding field-level schema for chain items (e.g., requiring `effect_id` as a string, `enabled` as boolean, `params` as object).

### 3.5 ipc-types.ts type drift

The `Command` type in `ipc-types.ts` (lines 16-22) still declares `chain: EffectInstance[]` (camelCase type), but the actual runtime values sent over the wire are `SerializedEffectInstance[]`. This type mismatch is harmless at runtime (the actual `sendCommand` call uses `Record<string, unknown>`), but it means the TypeScript types for IPC commands don't accurately describe the wire format. Low priority but should be updated for correctness.

---

## 4. Risk Assessment

### 4.1 NEW FINDING: `mix` field is silently ignored (P2 — Latent)

**Description:** The serializer sends `mix` as a top-level field on each effect dict. The backend pipeline (`pipeline.py:54`) reads `params` and passes it to `EffectContainer.process()`. The container looks for `_mix` (with underscore prefix) *inside* the params dict (line 36), not at the top level of the effect dict. The pipeline never reads or forwards the top-level `mix` field.

**Impact:** Mix sliders in the frontend will have no effect on the rendered output. All effects will render at 100% wet (full mix). This is invisible when `mix` is 1.0 (default), so it won't cause errors — it will just silently ignore user mix adjustments.

**Fix direction:** The pipeline should read `effect_instance.get("mix", 1.0)` and inject it into the params dict as `_mix` before passing to the container:
```python
params = effect_instance.get("params", {})
params["_mix"] = effect_instance.get("mix", 1.0)
```

**Severity:** P2 — not blocking (effects still apply), but mix functionality is broken.

### 4.2 Does BUG-1 fix resolve BUG-3?

**Partially.** BUG-3 ("No video loaded" after effect-then-import) was caused by:
1. First `render_frame` fails due to BUG-1 field mismatch -> `ok: false`
2. `frameDataUrl` never set -> preview shows "No video loaded"

With BUG-1 fixed, the field mismatch no longer causes the render to fail. **However**, BUG-3 has a secondary contributing factor: if the user adds effects before importing video, the render fails because there's no video path yet. The fix in `requestRenderFrame` (line 121: `if (!activeAssetPath.current) return`) prevents the crash, but after import, the subsequent render should now succeed because the chain is properly serialized.

**Verdict:** BUG-3's primary trigger (field mismatch causing render failure) is resolved. The effect-then-import sequence should now work. The error overlay provides visibility if any other error occurs. BUG-3 can be retested after BUG-1 fix is deployed.

### 4.3 Other camelCase/snake_case mismatches

**Audit of all ZMQ message fields:**

| Frontend sends | Backend reads | Match? |
|----------------|--------------|--------|
| `cmd` | `message.get("cmd")` | YES |
| `id` | `message.get("id")` | YES |
| `path` | `message.get("path")` | YES |
| `time` | `message.get("time", 0.0)` | YES |
| `frame_index` | `message.get("frame_index")` | YES |
| `chain` (array of serialized effects) | `message.get("chain", [])` | YES |
| `project_seed` | `message.get("project_seed", 0)` | YES |
| `input_path` | `message.get("input_path")` | YES |
| `output_path` | `message.get("output_path")` | YES |

**No other camelCase/snake_case mismatches found in the ZMQ command-level protocol.**

The `flush_state` command sends a `Project` object (which uses camelCase internally: `frameRate`, `audioSampleRate`, `masterVolume`, etc.), but the backend currently treats it as a stub (`return {"ok": True}`). When `flush_state` is implemented for real, the Project object will need a serializer similar to `serializeEffectChain`. This is a future risk, not a current bug.

### 4.4 Remaining risk: `ipc-types.ts` type accuracy

The TypeScript `Command` union type declares `chain: EffectInstance[]` but the runtime wire format is `SerializedEffectInstance[]`. Since `sendCommand` accepts `Record<string, unknown>`, this doesn't cause type errors. But it means a developer reading `ipc-types.ts` would get a misleading picture of the wire protocol. **Low risk, documentation issue only.**

---

## 5. Test Evidence

### Frontend (Vitest)
```
 RUN  v3.2.4
 8 test files, 88 tests, ALL PASSED
 Duration: 1.45s
```

### Backend (pytest)
```
345 passed, 6 skipped in 65.00s
Skipped: 2x platform effects, 4x Nuitka binary tests
```

### TypeScript
```
npx tsc --noEmit
EXIT CODE: 0
```

---

## 6. Recommended Next Actions

### Immediate (before next UAT handoff)

1. **Fix `mix` field passthrough** (P2): Update `pipeline.py` to read `effect_instance.get("mix", 1.0)` and inject as `params["_mix"]`. Add test. This is a separate bug from BUG-1 but was discovered during this validation.

2. **Add round-trip contract test**: Create a test that serializes an `EffectInstance` in TypeScript, writes the JSON to a fixture file, and has a Python test read and validate the field names match `pipeline.py`'s expectations. This catches future drift.

3. **Update `ipc-types.ts`**: Change `chain: EffectInstance[]` to `chain: SerializedEffectInstance[]` in the `render_frame`, `apply_chain`, `render_range`, and `export_start` command types. Import `SerializedEffectInstance` from `ipc-serialize.ts`.

### Before Beta (Era 2)

4. **Strengthen JSON schema for chain items**: Add field-level validation to `ipc-command.schema.json` so the chain items must have `effect_id` (string), `enabled` (boolean), `params` (object). This would catch BUG-1 class bugs at the schema validation layer.

5. **Add `flush_state` Project serializer**: When `flush_state` is implemented, the `Project` object has camelCase fields (`frameRate`, `audioSampleRate`, etc.) that will need a serializer similar to effect chain serialization.

6. **Retest BUG-3** after deploying BUG-1 fix: The primary trigger should be resolved. If the effect-then-import sequence still fails, the secondary cause needs separate investigation.

---

*Validated: 2026-02-23 | Commit: 6959404 | Validator: claude-opus-4.6 automated UAT*
