# Phase 2A: Parameter UX

> Ghost Handle, sensitivity, scaling — making parameters feel like Ableton.
> **Goal:** Every parameter is intuitive to use across its full range.
> **Sessions:** 2-3
> **Depends on:** Phase 1 (basic param panel working)

---

## Acceptance Criteria

1. Ghost Handle visible on every parameter knob (semi-transparent ring shows actual value after modulation)
2. Log/exp/S-curve scaling for wide-range params (via `curve` field in PARAMS schema)
3. Fine-tune mode: hold Shift while dragging for 10x precision
4. Double-click knob → type exact value
5. Right-click knob → reset to default
6. Param sensitivity: every param has a usable range from "barely noticeable" to "extreme"
7. Parameter tooltips showing name, current value, unit, and description
8. Keyboard shortcuts: arrow keys adjust selected param by 1%, Shift+arrow by 10%
9. All params display their unit (dB, Hz, %, px, ms)
10. No hidden params — scroll affordance with gradient fade on overflow (prevents U1)

---

## Deliverables

### Knob Component
```
frontend/src/renderer/components/common/
├── Knob.tsx              # Rotary knob with Ghost Handle
├── Slider.tsx            # Horizontal slider (alternative for some params)
├── NumberInput.tsx        # Exact value entry on double-click
└── ParamLabel.tsx        # Name + value + unit display
```

**Ghost Handle implementation:**
```tsx
// Knob renders two arcs:
// 1. Solid arc: base value (what user set)
// 2. Ghost arc: actual value (after modulation + automation), 30% opacity
<svg>
  <arc class="base" value={baseValue} stroke="white" />
  <arc class="ghost" value={resolvedValue} stroke="white" opacity={0.3} />
</svg>
```

### Curve Scaling

Add `curve` field to PARAMS schema in EFFECT-CONTRACT.md:

```python
PARAMS = {
    "threshold": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "curve": "linear",  # NEW: linear | logarithmic | exponential | s-curve
        "label": "Threshold",
        "unit": "%",
        "description": "Pixel sort brightness threshold",
    },
}
```

**Scaling functions (frontend):**
```typescript
function applyScaling(normalized: number, curve: string): number {
  switch (curve) {
    case 'logarithmic': return Math.log1p(normalized * 9) / Math.log(10);
    case 'exponential': return (Math.pow(10, normalized) - 1) / 9;
    case 's-curve': return normalized * normalized * (3 - 2 * normalized);
    default: return normalized; // linear
  }
}
```

### Calibration Pass

Review every effect's params for:
1. Does the full 0-100% slider range produce visible changes?
2. Is the "sweet spot" in the middle of the range (not jammed at one end)?
3. Are units correct and displayed?

```
backend/src/effects/
└── _calibration.py       # Script to test every param at 0%, 25%, 50%, 75%, 100%
```

### Scroll Affordance
```
frontend/src/renderer/components/effects/
└── ParamPanel.tsx        # Add gradient fade at bottom when scrollable
                          # CSS: mask-image: linear-gradient(black 80%, transparent)
```

---

## Testing

### Frontend (Vitest)
- Knob: drag updates value within min/max
- Knob: Shift+drag gives 10x precision (0.1% per pixel instead of 1%)
- Knob: double-click opens NumberInput
- Knob: right-click resets to default
- Scaling: logarithmic maps correctly (0.5 normalized → ~0.7 output)
- Ghost Handle: renders at different opacity from base

### Backend (pytest)
- Calibration script: all 10+ effects, all params, no crashes at any boundary

---

## NOT in Phase 2A

- No modulation/automation (Ghost Handle shows placeholder until Phase 6/7)
- No preset saving (Phase 10)
- No per-effect custom UI (all params use generic knob/slider)
