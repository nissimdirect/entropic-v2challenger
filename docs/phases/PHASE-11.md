# Phase 11: Export + Polish

> Full export pipeline, render queue, multi-select, keyboard shortcuts, final QA.
> **Goal:** Ship-ready. Everything a user expects from a professional tool.
> **Sessions:** 3-4
> **Depends on:** All previous phases
> **Architecture ref:** ARCHITECTURE.md §11 (Build & Distribution)

---

## Acceptance Criteria

### Export
1. Export formats: MP4 (H.264, H.265), ProRes 422, ProRes 4444
2. Export resolution: source resolution, 720p, 1080p, 4K, custom
3. Export frame rate: source, 24, 25, 30, 60 fps
4. Export codec settings: bitrate (CBR/VBR), quality preset (fast/medium/slow)
5. Export region: full timeline, loop region, or custom in/out markers
6. Export with audio: mux audio back into exported video
7. Export progress: modal with progress bar, ETA, cancel button
8. Export to GIF: animated GIF with dithering and palette optimization
9. Image sequence export: PNG, TIFF, or JPEG frame sequences
10. Render queue: batch multiple export jobs, process sequentially

### Polish
11. Multi-clip selection: Shift+click range, Cmd+click toggle, marquee drag
12. Keyboard shortcut system: all actions mapped, user-customizable via settings
13. Default shortcuts match NLE conventions (JKL scrub, Cmd+Z undo, etc.)
14. Preferences panel: theme (dark only for v1), shortcuts, paths, performance settings
15. Welcome screen: recent projects, new project, open project
16. Drag-and-drop: drag video files onto app icon or into timeline directly
17. Window management: remember size/position, multi-monitor support
18. Tooltips everywhere: hover any control for name + shortcut + description
19. Loading states: spinner/skeleton for all async operations
20. Error states: friendly error messages with recovery suggestions (not stack traces)
21. About dialog: version, credits, links
22. Auto-update: check for updates on launch (electron-updater via GitHub Releases)

---

## Deliverables

### Export Pipeline
```
backend/src/export/
├── exporter.py            # Main export orchestrator
├── codecs.py              # Codec configuration (H.264, H.265, ProRes, GIF)
├── muxer.py               # Audio muxing (PyAV)
├── gif.py                 # GIF export with palette optimization
└── image_sequence.py      # Frame-by-frame image export
```

```python
class Exporter:
    def start(self, project: dict, settings: dict) -> str:
        """
        Start export job.
        Returns: job_id for status polling.
        Settings: {codec, resolution, fps, bitrate, region, audio}
        """
        ...

    def get_status(self, job_id: str) -> dict:
        """Returns: {progress: 0.0-1.0, eta_seconds, current_frame, total_frames, status}"""
        ...

    def cancel(self, job_id: str) -> None:
        ...
```

### Render Queue
```
frontend/src/renderer/components/export/
├── ExportDialog.tsx       # Settings form
├── ExportProgress.tsx     # Progress modal
└── RenderQueue.tsx        # Queue list with status per job
```

### Polish UI
```
frontend/src/renderer/components/layout/
├── WelcomeScreen.tsx      # Recent projects, new, open
├── Preferences.tsx        # Settings panels (tabs)
├── ShortcutEditor.tsx     # Keyboard shortcut customization
├── AboutDialog.tsx        # Version + credits
└── ErrorBoundary.tsx      # Global error catch with friendly message
```

```
frontend/src/renderer/components/common/
├── Tooltip.tsx            # Unified tooltip with name + shortcut
├── Spinner.tsx            # Loading indicator
├── Skeleton.tsx           # Content placeholder
└── ErrorMessage.tsx       # Friendly error with recovery action
```

### Keyboard Shortcut System
```
frontend/src/renderer/utils/
├── shortcuts.ts           # Shortcut registry, customization, conflict detection
└── default-shortcuts.ts   # Default mapping (NLE convention)
```

```typescript
const DEFAULT_SHORTCUTS: Record<string, string> = {
  // Transport
  'play_pause': 'Space',
  'stop': 'Escape',
  'scrub_forward': 'L',
  'scrub_backward': 'J',
  'frame_forward': 'K+L',       // or Right arrow
  'frame_backward': 'K+J',      // or Left arrow

  // Timeline
  'split_clip': 'Cmd+Shift+K',
  'delete_clip': 'Delete',
  'new_video_track': 'Cmd+T',
  'new_perf_track': 'Cmd+Shift+T',
  'add_marker': 'Cmd+M',

  // Edit
  'undo': 'Cmd+Z',
  'redo': 'Cmd+Shift+Z',
  'select_all': 'Cmd+A',
  'copy': 'Cmd+C',
  'paste': 'Cmd+V',
  'duplicate': 'Cmd+D',

  // View
  'toggle_automation': 'A',
  'zoom_in': 'Cmd+=',
  'zoom_out': 'Cmd+-',
  'zoom_fit': 'Cmd+0',
  'before_after': 'Backslash',   // Hold to compare

  // Project
  'save': 'Cmd+S',
  'save_as': 'Cmd+Shift+S',
  'open': 'Cmd+O',
  'new_project': 'Cmd+N',
  'export': 'Cmd+E',
};
```

### Auto-Update
```
frontend/src/main/
└── updater.ts             # electron-updater configuration, GitHub Releases
```

### Testing
- Export: H.264 at 1080p → valid MP4 file, playable in VLC
- Export: ProRes 422 → valid MOV, correct color space
- Export: GIF → valid animated GIF, < 50MB for 5s clip
- Export: image sequence → correct frame count as PNG files
- Export: cancel mid-render → partial file cleaned up
- Export: with audio → A/V in sync
- Render queue: 3 jobs → process in order → all complete
- Shortcuts: Cmd+Z → undo, Space → play/pause
- Shortcuts: user customizes "play_pause" to "Enter" → works
- Welcome screen: lists recent projects, click opens project
- Error boundary: force error → friendly message shown, no crash
- Multi-select: Shift+click 3 clips → all selected → move together
- Auto-update: mock update available → notification shown

---

## NOT in Phase 11

- No plugin SDK for third-party effects (post-launch)
- No collaborative editing (post-launch)
- No cloud sync for projects (post-launch)
- No mobile companion app (post-launch)
- No GPU rendering acceleration (post-launch optimization)
