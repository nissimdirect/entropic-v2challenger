# Phase 10: Freeze/Flatten + Library

> Freeze chains to cache, flatten to bake. Preset browser for recall.
> **Goal:** Memory management + creative workflow for reuse.
> **Sessions:** 3-4
> **Depends on:** Phase 4 (timeline), Phase 6 (operators for freezing chains with modulation)
> **Architecture ref:** ARCHITECTURE.md §6.3 (Auto-Freeze), DATA-SCHEMAS.md §7 (Preset)

---

## Acceptance Criteria

### Freeze / Flatten
1. Freeze: cache the output of an effect chain prefix to disk (lossless PNG sequence or MJPEG)
2. Frozen effects show frosted glass overlay in UI
3. Frozen prefix skipped during render — reads from cache instead
4. Unfreeze: remove cache, re-render in real-time
5. Flatten: bake frozen output permanently into a new asset (destructive, not undoable via chain)
6. Flatten creates new video file in project directory
7. Auto-freeze: when RAM > 80%, toast suggests freezing; at > 90%, auto-freeze longest idle prefix
8. Freeze undo: can undo a freeze operation (separate disk buffer per ARCHITECTURE.md §7)
9. Freeze invalidation: editing any param in frozen prefix → auto-unfreeze + warning toast

### Library / Presets
10. Save single-effect preset: stores effect ID + all parameter values + modulation routes
11. Save chain preset: stores ordered list of effects with params + macro mappings
12. Preset browser: searchable, filterable by category/tag, favorites
13. Preset file format: `.glitchpreset` JSON (matches DATA-SCHEMAS.md §7)
14. Factory presets: ship with 50+ curated presets across key effects
15. User preset folder: `~/Documents/Entropic/Presets/`
16. Preset import/export: drag `.glitchpreset` file to import
17. Macro knobs: chain presets can define up to 8 macro knobs mapping to underlying params

---

## Deliverables

### Freeze System
```
frontend/src/renderer/components/effects/
└── FreezeOverlay.tsx      # Frosted glass overlay on frozen devices

frontend/src/renderer/stores/
└── freeze.ts              # Freeze state per track, cache paths, auto-freeze logic
```

```
backend/src/render/
├── freeze.py              # Render prefix chain to disk cache
├── flatten.py             # Bake to new video asset (PyAV encode)
└── cache_manager.py       # Disk cache: write, read, invalidate, size tracking
```

```python
class FreezeManager:
    def freeze_prefix(self, track_id: str, chain: list[EffectInstance],
                      asset: Asset, output_dir: str) -> str:
        """
        Render effect chain on asset, cache to disk.
        Returns: cache_id for future reads.
        """
        # Render each frame through chain
        # Write as MJPEG Q95 (matches mmap format)
        # Return cache reference
        ...

    def read_cached_frame(self, cache_id: str, frame_index: int) -> np.ndarray:
        """Read a single frame from freeze cache."""
        ...

    def invalidate(self, cache_id: str) -> None:
        """Remove cache (param changed in frozen prefix)."""
        ...
```

### Preset System
```
frontend/src/renderer/components/library/
├── PresetBrowser.tsx      # Search, filter, favorites
├── PresetCard.tsx         # Preview thumbnail + name + tags
├── PresetSaveDialog.tsx   # Name, tags, macro mapping editor
└── MacroKnob.tsx          # Macro knob component (maps to multiple params)
```

```
frontend/src/renderer/stores/
└── library.ts             # Preset list, favorites, user folder watch

frontend/src/shared/schemas/
└── preset.schema.json     # JSON Schema for .glitchpreset validation
```

### IPC Commands (additions)
```python
# New commands in zmq_server.py
"freeze_prefix":   # {track_id, chain, asset_id} → {cache_id, frame_count}
"read_freeze":     # {cache_id, frame_index} → frame via mmap
"flatten":         # {cache_id, output_path, codec} → {asset_path}
"invalidate_cache": # {cache_id} → ack
```

### Testing
- Freeze: chain of 3 effects → freeze → playback reads from cache (fast)
- Freeze: edit param in frozen prefix → auto-invalidate + toast
- Unfreeze: remove cache → re-renders in real-time
- Flatten: creates valid video file, loadable as new asset
- Auto-freeze: simulate high RAM → auto-freeze triggers
- Preset save: save effect + params → load → identical state
- Preset chain: save 3-effect chain + macros → load → chain recreated
- Macro: move macro knob → all mapped params change proportionally
- Preset browser: search by name, filter by tag

---

## NOT in Phase 10

- No cloud preset sharing (post-launch)
- No preset versioning (post-launch)
- No GPU-accelerated freeze rendering (post-launch optimization)
- No preset preview thumbnails auto-generated (Phase 11 polish)
