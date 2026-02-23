---
title: Phase 2A — Parameter UX (Ghost Handle, Sensitivity, Scaling)
status: active
project: entropic-v2challenger
depends_on: Phase 1 (basic param panel working — ParamSlider, ParamChoice, ParamToggle, ParamMix)
sessions: 3
created: 2026-02-22
---

# Phase 2A: Parameter UX — Implementation Plan

## Context

Phase 1 delivers basic HTML sliders (`ParamSlider.tsx`) for all effect parameters. They work, but they feel like developer tools — not creative instruments. Phase 2A replaces those basic sliders with Ableton-quality rotary knobs featuring Ghost Handle (a semi-transparent ring showing the actual value after modulation), non-linear curve scaling for wide-range params, fine-tune mode, keyboard shortcuts, and proper units/tooltips.

**Goal:** Every parameter knob has a usable range from "barely noticeable" to "extreme." The interaction feels like Ableton's knobs — precise, expressive, and information-dense.

**Why now:** Phase 3 (Color Suite) adds 4 complex color tools with many parameters. If parameter UX is bad, color tools will be painful to use. Fix the knobs before adding more params.

---

## What Already Exists

### Frontend (Phase 1 delivers these)
- `frontend/src/renderer/components/effects/ParamSlider.tsx` — basic HTML range input, min/max/default
- `frontend/src/renderer/components/effects/ParamChoice.tsx` — dropdown for choice params
- `frontend/src/renderer/components/effects/ParamToggle.tsx` — boolean toggle
- `frontend/src/renderer/components/effects/ParamMix.tsx` — dry/wet slider
- `frontend/src/renderer/components/effects/ParamPanel.tsx` — container for selected effect's params
- `frontend/src/renderer/stores/project.ts` — Zustand store with `updateParam(effectId, paramKey, value)`
- `frontend/src/shared/types.ts` — `ParamDef` interface: `{type, min, max, default, label, description, options}`

### Backend
- `docs/EFFECT-CONTRACT.md` — PARAMS schema (Section 4): `{type, min, max, default, label, description}`
- `backend/src/effects/fx/*.py` — 10 effects, each with PARAMS dict (no `curve` or `unit` fields yet)
- `backend/src/effects/registry.py` — `list_all()` returns params to frontend

### Key Gaps
- No `curve` field in PARAMS schema (all params are linear)
- No `unit` field in PARAMS schema (no display units)
- No rotary knob component (only HTML sliders)
- No Ghost Handle concept
- No fine-tune or keyboard interaction
- No parameter calibration data

---

## Plan (3 Sessions)

### Session 1: Knob Component + Scaling Functions
> Build the rotary knob SVG component and scaling math. No backend changes yet.

- [x] **1.1** Create `frontend/src/renderer/components/common/Knob.tsx`
  - SVG-based rotary knob (270-degree arc, gap at bottom)
  - Props: `value: number`, `min: number`, `max: number`, `default: number`, `label: string`, `unit?: string`, `curve?: 'linear' | 'logarithmic' | 'exponential' | 's-curve'`, `ghostValue?: number`, `onChange: (value: number) => void`
  - Drag interaction: `onPointerDown` → capture → track vertical mouse movement → `onPointerMove` → compute delta → scale by curve → update value → `onPointerUp` → release
  - Render two arcs: solid arc (base value, `stroke="var(--knob-color)"`) and ghost arc (resolved value, same stroke at 30% opacity)
  - Pointer capture during drag for continuous adjustment
  - Display: current value centered below knob, unit suffix, label above

- [x] **1.2** Create `frontend/src/renderer/components/common/NumberInput.tsx`
  - Appears on double-click of a Knob (replaces the value display)
  - `<input type="text" inputMode="decimal">` with min, max, step props
  - Auto-select on mount, Enter to confirm, Escape to cancel
  - Focus trap: clicking outside (blur) also confirms

- [x] **1.3** Create `frontend/src/renderer/components/common/ParamLabel.tsx`
  - Renders: `{formattedValue}{unit}`
  - Formats value based on type: float to 2 decimals, int as integer
  - Tooltip on hover: shows `description` field from ParamDef

- [x] **1.4** Create `frontend/src/renderer/components/common/Slider.tsx`
  - Horizontal slider (alternative layout for some params, e.g., wide editors)
  - Same Ghost Handle support as Knob (two fill bars at different opacities)
  - Shares the same interaction model (Shift for fine-tune, double-click for NumberInput, right-click reset)

- [x] **1.5** Create scaling utility `frontend/src/renderer/utils/paramScaling.ts`
  ```typescript
  export function normalizedToScaled(normalized: number, curve: string): number
  export function scaledToNormalized(scaled: number, curve: string): number
  // Curves:
  //   linear:      y = x
  //   logarithmic: y = log1p(x * 9) / log(10)
  //   exponential: y = (10^x - 1) / 9
  //   s-curve:     y = x^2 * (3 - 2*x)  (Hermite smoothstep)
  ```

- [x] **1.6** Interaction modifiers (built into Knob and Slider):
  - **Shift + drag** → 5x precision (delta * 0.001 instead of 0.005)
  - **Double-click** → open NumberInput for exact value entry
  - **Right-click** → reset to `default` value
  - **Arrow keys** (when focused) → adjust by 1% of range
  - **Shift + Arrow** → adjust by 10% of range

- [x] **1.7** CSS for knob components: added to `frontend/src/renderer/styles/global.css`
  - Knob SVG styles, ghost opacity, focus ring (focus-visible)
  - NumberInput overlay positioning, dark theme integration
  - Horizontal slider track/fill/ghost/thumb styles
  - Param panel scroll affordance with mask-image gradient

- [x] **1.8** Tests (frontend vitest — 34 new tests):
  - `frontend/src/__tests__/components/common/knob.test.ts` (15 tests)
    - Arc angle calculation at min/mid/max
    - Drag sensitivity (normal vs shift)
    - Ghost handle visibility logic
    - Value clamping and rounding
    - Keyboard adjustment (1% and 10%)
    - Curve integration with slider
  - `frontend/src/__tests__/utils/paramScaling.test.ts` (19 tests)
    - Linear: 0.5 → 0.5
    - Logarithmic: 0.5 → ~0.7404
    - Exponential: 0.5 → ~0.2403
    - S-curve: 0.5 → 0.5 (inflection point)
    - Round-trip: scaledToNormalized(normalizedToScaled(x)) ≈ x (all 4 curves)
    - valueToSlider / sliderToValue round-trips

### Session 2: Backend Schema Extension + Calibration
> Add `curve` and `unit` fields to PARAMS schema. Calibrate all effects.

- [x] **2.1** Extend PARAMS schema in `docs/EFFECT-CONTRACT.md` — add two new optional fields:
  ```python
  "threshold": {
      "type": "float",
      "min": 0.0,
      "max": 1.0,
      "default": 0.5,
      "curve": "linear",       # NEW: linear | logarithmic | exponential | s-curve
      "unit": "%",             # NEW: display unit string
      "label": "Threshold",
      "description": "Pixel sort brightness threshold",
  }
  ```

- [x] **2.2** Update `frontend/src/shared/types.ts` — extend `ParamDef` interface (done in Session 1 as prerequisite for Knob):
  ```typescript
  export interface ParamDef {
    type: "float" | "int" | "bool" | "choice";
    min?: number;
    max?: number;
    default: number | string | boolean;
    label: string;
    description?: string;
    options?: string[];
    curve?: "linear" | "logarithmic" | "exponential" | "s-curve";  // NEW
    unit?: string;  // NEW
  }
  ```

- [x] **2.3** Audit and update all 10 effect PARAMS dicts (add `curve` and `unit` to every param):
  - `backend/src/effects/fx/invert.py` — no params, no changes
  - `backend/src/effects/fx/hue_shift.py` — amount: `unit: "°"`, `curve: "linear"`
  - `backend/src/effects/fx/noise.py` — intensity: `unit: "%"`, `curve: "exponential"` (low values matter most)
  - `backend/src/effects/fx/blur.py` — radius: `unit: "px"`, `curve: "exponential"` (low blur values matter most)
  - `backend/src/effects/fx/posterize.py` — levels: `unit: ""`, `curve: "linear"`
  - `backend/src/effects/fx/pixelsort.py` — threshold: `unit: "%"`, `curve: "s-curve"`; direction: no curve; reverse: no curve
  - `backend/src/effects/fx/edge_detect.py` — method: no curve (choice)
  - `backend/src/effects/fx/vhs.py` — tracking: `unit: "%"`, `curve: "linear"`; noise: `unit: "%"`, `curve: "exponential"`; chromatic: `unit: "px"`, `curve: "logarithmic"`
  - `backend/src/effects/fx/wave_distort.py` — amplitude: `unit: "px"`, `curve: "exponential"`; frequency: `unit: "Hz"`, `curve: "logarithmic"`
  - `backend/src/effects/fx/channelshift.py` — r/g/b_offset: `unit: "px"`, `curve: "linear"`

- [x] **2.4** Create calibration script `backend/src/effects/_calibration.py`
  - Iterate every registered effect
  - For each param: render at 0%, 25%, 50%, 75%, 100% of range
  - Compute pixel difference from original frame at each level
  - Output report: `{effect_id, param, level_pct, mean_pixel_diff}`
  - Goal: verify every param produces visible change across its range
  - Flag any param where <10% of range produces >90% of visual change (needs curve)

- [x] **2.5** Tests (backend pytest — 35 new tests, all passing):
  - `backend/tests/test_effects/test_calibration.py`
    - Every effect: all params at min → no crash
    - Every effect: all params at max → no crash
    - Every effect: default params → no crash
    - Verify every param that has `curve` field is a valid curve name

### Session 3: Wire Up + Scroll Affordance + Polish
> Replace ParamSlider with Knob in the UI. Add scroll affordance. Keyboard shortcuts.

- [x] **3.1** Update `frontend/src/renderer/components/effects/ParamPanel.tsx`
  - Replace `ParamSlider` usage with `Knob` for float/int params
  - Keep `ParamChoice` for choice params (dropdown)
  - Keep `ParamToggle` for bool params
  - Keep `ParamMix` but re-implement using `Slider` with Ghost Handle
  - Pass `curve` and `unit` from ParamDef to Knob/Slider
  - Add scroll affordance: CSS `mask-image: linear-gradient(black 85%, transparent)` on overflow container
  - Add `overflow-y: auto` with custom scrollbar (thin, dark)

- [x] **3.2** Implement keyboard focus management in ParamPanel:
  - Tab/Shift+Tab navigates between knobs
  - Focused knob has visible focus ring (CSS `:focus-visible`)
  - Arrow keys adjust focused param (1% of range per press)
  - Shift+Arrow keys adjust by 10% of range

- [x] **3.3** Ghost Handle placeholder wiring:
  - For now (no modulation system yet), `ghostValue` always equals `value`
  - When Phase 6 (Modulation) ships, `ghostValue` will be `resolvedValue` from the modulation engine
  - Add a comment in Knob.tsx: `// TODO Phase 6: Replace ghostValue with resolved modulation value`
  - The Ghost Handle arc renders but overlaps the base arc identically (invisible until modulation exists)

- [x] **3.4** Parameter tooltip implementation:
  - On hover over Knob/Slider for 500ms → show tooltip
  - Content: `{label}\n{description}\nRange: {min} – {max} {unit}\nDefault: {default}`
  - Position: above the knob, centered, arrow pointing down
  - CSS in `frontend/src/renderer/styles/tooltip.css`

- [x] **3.5** Tests (frontend vitest — 21 new tests):
  - `frontend/src/__tests__/components/effects/paramPanel.test.ts`
    - Float param renders as Knob (not slider)
    - Choice param renders as dropdown
    - Bool param renders as toggle
    - Scroll affordance gradient visible when content overflows
    - Keyboard Tab moves focus between knobs
    - Arrow key adjusts value by 1% of range

---

## Test Plan

### What to test
- [ ] Knob: drag updates value within min/max bounds
- [ ] Knob: Shift+drag gives 10x precision (1px = 0.1% instead of 1%)
- [ ] Knob: double-click opens NumberInput, Enter confirms, Escape cancels
- [ ] Knob: right-click resets to default
- [ ] Knob: Ghost Handle renders with 30% opacity arc
- [ ] Scaling: logarithmic maps 0.5 normalized → ~0.699 scaled
- [ ] Scaling: round-trip preserves value (normalizedToScaled ∘ scaledToNormalized ≈ identity)
- [ ] Calibration: every effect param produces visible change across full range
- [ ] ParamPanel: scroll affordance gradient visible on overflow
- [ ] Keyboard: Arrow keys adjust selected param, Shift+Arrow for coarse

### Edge cases
- [ ] Drag to extreme values (way beyond min/max) → clamped correctly
- [ ] NumberInput: type value below min → clamped to min on confirm
- [ ] NumberInput: type non-numeric text → ignored, value unchanged
- [ ] Zero-range param (min == max) → knob is disabled, no interaction
- [ ] Very wide range (0 to 10000) with exponential curve → low end still usable
- [ ] Very narrow range (0.0 to 0.01) → fine-tune mode still gives sub-step precision
- [ ] Ghost Handle with value == ghostValue → arcs overlap, no visual artifact
- [ ] Multiple rapid value changes (fast mouse movement) → no render lag or stale values

### How to verify
- Backend: `cd backend && python -m pytest tests/ -x --tb=short`
- Frontend: `cd frontend && npx vitest run`
- Manual: `cd frontend && npx electron-vite dev` → load video → add effect → interact with knobs
- Calibration: `cd backend && python -m effects._calibration` → review report
- Expected new test count: ~30 (15 knob/slider + 8 scaling + 5 calibration + 5 paramPanel)

---

## Files to Create

### Frontend
```
frontend/src/renderer/components/common/Knob.tsx
frontend/src/renderer/components/common/Slider.tsx
frontend/src/renderer/components/common/NumberInput.tsx
frontend/src/renderer/components/common/ParamLabel.tsx
frontend/src/renderer/utils/paramScaling.ts
frontend/src/renderer/styles/knob.css
frontend/src/renderer/styles/tooltip.css
frontend/src/__tests__/components/common/knob.test.ts
frontend/src/__tests__/utils/paramScaling.test.ts
frontend/src/__tests__/components/effects/paramPanel.test.ts
```

### Backend
```
backend/src/effects/_calibration.py
backend/tests/test_effects/test_calibration.py
```

## Files to Modify

```
frontend/src/shared/types.ts                           — Add curve, unit to ParamDef
frontend/src/renderer/components/effects/ParamPanel.tsx — Replace ParamSlider with Knob
frontend/src/renderer/components/effects/ParamMix.tsx   — Re-implement with Slider + Ghost Handle
docs/EFFECT-CONTRACT.md                                — Add curve, unit to PARAMS schema (Section 4)
backend/src/effects/fx/hue_shift.py                    — Add curve, unit to PARAMS
backend/src/effects/fx/noise.py                        — Add curve, unit to PARAMS
backend/src/effects/fx/blur.py                         — Add curve, unit to PARAMS
backend/src/effects/fx/posterize.py                    — Add curve, unit to PARAMS
backend/src/effects/fx/pixelsort.py                    — Add curve, unit to PARAMS
backend/src/effects/fx/edge_detect.py                  — Add unit to PARAMS
backend/src/effects/fx/vhs.py                          — Add curve, unit to PARAMS
backend/src/effects/fx/wave_distort.py                 — Add curve, unit to PARAMS
backend/src/effects/fx/channelshift.py                 — Add curve, unit to PARAMS
```

---

## NOT in Scope (Explicitly Excluded)

- No modulation/automation (Ghost Handle shows placeholder until Phase 6/7)
- No preset saving (Phase 10)
- No per-effect custom UI (all params use generic Knob/Slider)
- No MIDI learn (Phase 8)
- No parameter locking or grouping
- No undo for parameter changes (Phase 4)

---

## Codebase Context

### Existing Patterns (must follow exactly)

**Zustand store pattern:**
```typescript
// All param updates go through the project store
const { updateParam } = useProjectStore()
updateParam(effectId, paramKey, newValue)
// This triggers: debounce → sendCommand({cmd: "render_frame", ...}) → preview update
```

**Effect PARAMS pattern (current — no curve/unit):**
```python
PARAMS = {
    "amount": {
        "type": "float",
        "min": 0.0,
        "max": 360.0,
        "default": 180.0,
        "label": "Amount",
    },
}
```

**Effect PARAMS pattern (after this phase — with curve/unit):**
```python
PARAMS = {
    "amount": {
        "type": "float",
        "min": 0.0,
        "max": 360.0,
        "default": 180.0,
        "label": "Amount",
        "curve": "linear",
        "unit": "°",
        "description": "Hue rotation in degrees",
    },
}
```

**CSS pattern:** Vanilla CSS in `frontend/src/renderer/styles/`, dark theme (`#1a1a1a` bg, `#e5e5e5` text), JetBrains Mono for values.

**Component pattern:** Functional React with hooks, no class components, no CSS-in-JS.
