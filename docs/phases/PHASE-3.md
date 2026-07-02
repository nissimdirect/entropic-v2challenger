# Phase 3: Color Suite

> Levels, Curves, HSL, Color Balance — Photoshop-competitive color tools.
> **Goal:** Color correction tools that professionals take seriously.
> **Sessions:** 3-4
> **Depends on:** Phase 2A (parameter UX working)
> **Architecture ref:** ARCHITECTURE.md §9 (Taxonomy — `util.*` namespace)

---

## Acceptance Criteria

1. `util.levels` — 5-point control (black, shadow, midtone, highlight, white) with per-channel mode
2. `util.curves` — Bezier curve editor per channel (RGBA + Master), minimum 16 control points
3. `util.hsl_adjust` — Per-hue saturation/lightness (8 hue ranges: Red, Orange, Yellow, Green, Cyan, Blue, Purple, Magenta)
4. `util.color_balance` — Shadow/Midtone/Highlight color wheels
5. Histogram display (luminance + per-channel) updates in real-time as params change
6. All tools are non-destructive (`util.*` category) and stack with effects
7. Preview updates within 100ms for all color tools at 1080p
8. Before/after toggle (hold key to see original, release to see processed)
9. Auto-levels one-click (percentile clipping)

---

## Deliverables

### Effects (backend)
```
backend/src/effects/util/
├── levels.py             # 5-point levels + per-channel
├── curves.py             # Bezier LUT generation + per-channel
├── hsl_adjust.py         # Per-hue saturation/lightness
├── color_balance.py      # Shadow/mid/highlight color wheels
└── histogram.py          # Histogram computation (not an effect — utility)
```

### UI Components (frontend)
```
frontend/src/renderer/components/effects/color/
├── LevelsEditor.tsx      # Histogram backdrop + 5 draggable points
├── CurvesEditor.tsx      # Bezier curve canvas + channel selector
├── HSLEditor.tsx         # 8 hue sliders (sat + light each)
├── ColorBalanceEditor.tsx # 3 color wheels (shadow/mid/highlight)
├── Histogram.tsx         # Real-time histogram overlay
└── BeforeAfter.tsx       # Hold-to-compare overlay
```

### Testing
- Each tool: 4 mandatory tests (unit, determinism, boundary, state)
- Curves: identity curve (straight line) = no change
- Levels: black=0, white=255, mid=0.5 = no change
- HSL: all zeros = no change
- Histogram: matches known test image distribution
- Performance: all 4 tools chained < 50ms at 1080p

---

## NOT in Phase 3

- No scopes (vectorscope, waveform monitor) — post-launch
- No color grading LUTs (.cube import) — post-launch
- No color picker / eyedropper — Phase 11 polish
