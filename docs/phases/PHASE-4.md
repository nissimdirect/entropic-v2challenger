# Phase 4: Timeline + Tracks

> Multi-track timeline, undo/redo, project save/load.
> **Goal:** The DAW spine — everything hangs off the timeline.
> **Sessions:** 4-5
> **Depends on:** Phase 3 (color tools as proof of util.* pattern)
> **Architecture ref:** ARCHITECTURE.md §7 (Undo), DATA-SCHEMAS.md §1-2 (Project, Timeline)

---

## Acceptance Criteria

1. Timeline panel with time ruler, playhead, and zoom/scroll
2. Multiple video tracks (add, delete, reorder)
3. Clips: drag from asset panel to track, trim in/out, split (Cmd+Shift+K), move
4. Track opacity slider (0-100%)
5. Track blend modes (normal, add, multiply, screen, overlay, difference, exclusion, darken, lighten)
6. Per-track effect chain (independent from other tracks)
7. Undo/redo (Cmd+Z / Cmd+Shift+Z) for ALL operations — unlimited
8. History panel (Photoshop-style): click any entry to jump to that state
9. Project save as `.glitch` file (JSON, matches DATA-SCHEMAS.md)
10. Project load — restores full state (assets, timeline, effects, params)
11. "New Project" clears everything
12. Autosave every 60 seconds (non-blocking)
13. Loop region (set in/out, playback loops)
14. Markers (Cmd+M to add at playhead)
15. Security: project file validation on load (SEC-12)

---

## Deliverables

### Timeline UI
```
frontend/src/renderer/components/timeline/
├── Timeline.tsx          # Container: ruler + tracks + playhead
├── TimeRuler.tsx         # Time markings, zoom level, click-to-seek
├── Playhead.tsx          # Vertical line, draggable
├── Track.tsx             # Track header (name, color, mute, solo, opacity, blend)
├── Clip.tsx              # Clip on track (thumbnail, trim handles, drag)
├── LoopRegion.tsx        # Highlight region for loop playback
├── Marker.tsx            # Marker flag on ruler
└── ZoomScroll.tsx        # Horizontal zoom + scroll bar
```

### Undo System
```
frontend/src/renderer/stores/
└── undo.ts               # Zustand store for undo/redo

frontend/src/renderer/components/layout/
└── HistoryPanel.tsx       # Photoshop-style vertical list
```

**Implementation (from ARCHITECTURE.md §7):**
```typescript
type UndoEntry =
  | { type: 'command'; action: string; data: any; inverse: any; timestamp: number }
  | { type: 'param_diff'; path: string; oldValue: any; newValue: any; timestamp: number };

// 500 entries in RAM (configurable to 2000)
// 50MB RAM safety cap
// Overflow: oldest entries serialized to disk as JSON lines
// Critical actions (delete track, clear all) are never pruned
```

### Project File
```
frontend/src/renderer/stores/
└── project.ts            # Save/load .glitch files

frontend/src/shared/
└── schemas/
    └── project.schema.json  # JSON Schema for validation
```

### Zustand Stores (new/updated)
```
frontend/src/renderer/stores/
├── timeline.ts           # Tracks, clips, playhead position, loop region, markers
├── project.ts            # Asset management, project metadata, save/load
└── undo.ts               # History stack, undo/redo actions
```

### Testing
- Timeline: add 3 tracks, reorder → correct z-order
- Clip: trim in-point, verify exported frames match
- Undo: 10 operations → undo all 10 → state matches original
- Undo: overflow to disk at 500+ entries → can still undo
- History panel: click entry #5 → state jumps to that point
- Project save/load roundtrip: save → close → load → identical state
- Project validation: malformed JSON → rejected with error (SEC-12)

---

## NOT in Phase 4

- No performance track (Phase 9)
- No automation lanes (Phase 7)
- No freeze/flatten (Phase 10)
- No multi-clip selection (Phase 11 polish)
