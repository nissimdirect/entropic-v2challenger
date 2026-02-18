# Phase 7: Automation

> Timeline-locked parameter recording — draw, latch, touch, simplify.
> **Goal:** Any parameter can change over time on the timeline.
> **Sessions:** 3-4
> **Depends on:** Phase 4 (timeline), Phase 6 (operators for stacking)
> **Architecture ref:** DATA-SCHEMAS.md §4 (AutomationLane, AutomationPoint), SIGNAL-ARCHITECTURE.md §6 (Signal Order)

---

## Acceptance Criteria

1. Automation lanes visible per-track, per-effect, per-parameter
2. Show/hide lanes individually (eye icon)
3. Click on automation line → add node
4. Drag node → edit value (Y) and time (X)
5. Shift+drag → fine-tune node (10x precision)
6. Alt+click node → cycle curve mode (linear, ease-in, ease-out, S-curve)
7. Delete node (Delete key or right-click → Remove)
8. Draw mode: hold mouse and paint automation freehand
9. Latch mode: start playback, tweak param → writes automation in real-time, stops writing on stop
10. Touch mode: writes automation while knob is held, snaps back to existing curve on release
11. Read mode: automation plays back but doesn't record (default)
12. Simplify Curve button: Ramer-Douglas-Peucker algorithm reduces point count
13. Automation stacks WITH modulation (Signal Order: Base → Mod → Auto → Clamp)
14. Ghost Handle reflects final value after both modulation and automation
15. Copy/paste automation regions
16. Clear automation on selected parameter

---

## Deliverables

### Automation UI
```
frontend/src/renderer/components/automation/
├── AutomationLane.tsx     # Lane overlay on timeline track
├── AutomationNode.tsx     # Draggable node with curve handle
├── AutomationDraw.tsx     # Freehand draw overlay
├── AutomationToolbar.tsx  # Mode selector (Read/Latch/Touch/Draw), simplify button
└── CurveSegment.tsx       # SVG path between two nodes (linear/ease/S)
```

### Automation Engine (frontend — all in React/Zustand)
```
frontend/src/renderer/stores/
└── automation.ts          # AutomationLane[] per track, record/playback state

frontend/src/renderer/utils/
├── automation-evaluate.ts # Interpolate value at any time from AutomationPoint[]
├── automation-record.ts   # Write knob movements as points (Latch/Touch)
└── automation-simplify.ts # Ramer-Douglas-Peucker point reduction
```

```typescript
function evaluateAutomation(lane: AutomationLane, time: number): number | null {
  // Find surrounding points, interpolate based on curve type
  // Returns null if no automation data at this time (don't override)
  const points = lane.points;
  if (points.length === 0) return null;
  if (time <= points[0].time) return points[0].value;
  if (time >= points[points.length - 1].time) return points[points.length - 1].value;

  // Binary search for surrounding points
  // Interpolate based on curve value (-1 to 1)
  ...
}
```

### Signal Resolution (updated)
```typescript
// In the render loop, BEFORE sending params to Python:
function resolveParam(base: number, modValue: number | null, autoValue: number | null,
                      min: number, max: number): ResolvedParam {
  let value = base;
  const afterMod = modValue !== null ? value + modValue : value;
  const afterAuto = autoValue !== null ? autoValue : afterMod;  // Auto REPLACES, not adds
  const clamped = Math.max(min, Math.min(max, afterAuto));
  return { base, afterModulation: afterMod, afterAutomation: afterAuto, clamped };
}
```

**Note:** Automation REPLACES the current value at that time. Modulation OFFSETS from base. This matches DAW convention (Ableton, FL Studio).

### Testing
- Lane: add 3 nodes → playback interpolates correctly
- Curve: ease-in between nodes → value accelerates
- Latch: start playback, move knob → points written
- Touch: hold knob → writes, release → snaps back to existing curve
- Draw: paint freehand → points created at mouse resolution
- Simplify: 100 points with tolerance 0.01 → reduced to ~20 points
- Stacking: LFO + automation on same param → Ghost Handle shows combined
- Copy/paste: select region → paste at new position → identical curve

---

## NOT in Phase 7

- No per-node velocity/tension (advanced curve editing — post-launch)
- No automation grouping across multiple params (Phase 11 polish)
- No MIDI CC recording to automation (Phase 9)
- No automation on operator params (post-launch — operators are self-modulating)
