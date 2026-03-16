# Phase 12: Text + Subliminal + Static Images

> Text overlays, subliminal frame injection, static image support, CapCut-style text tools.
> **Goal:** Content creation parity — handle text, images, and multi-source compositing.
> **Sessions:** 3-4 (TBD — needs deep planning session)
> **Depends on:** Phase 11 (Export + Polish)
> **Status:** SPEC ONLY — implementation plan in separate session

---

## Feature Overview

### A. Text Overlay System (CapCut-style)
Full text rendering onto video frames with styling, positioning, and animation.

**Core capabilities:**
- Text layer on timeline (duration, position, z-order)
- Font selection (system fonts + bundled fonts)
- Font size, color, stroke, shadow, background box
- Text positioning: drag on canvas, anchor presets (center, corners, thirds)
- Text animation: fade in/out, scale, slide, typewriter, bounce
- Keyframeable properties: position, scale, rotation, opacity over time
- Text-on-path (curved text along bezier)
- Multiple text layers simultaneously

**CapCut reference features:**
- Style templates (preset text styles: "Bold Title", "Subtitle", "Callout")
- Text effects (glitch text, neon glow, 3D text illusion)
- Auto-captions (not for v1 — requires speech recognition)

### B. Subliminal Effect
New effect: `fx.subliminal` — inject alternate frames/images into the video stream.

**Mode 1: Flash Insert**
- Insert a specific image/frame for 1-3 frames at configurable intervals
- Parameters:
  - `source`: path to image or video asset
  - `flash_duration`: 1-3 frames (default: 1)
  - `interval`: frames between flashes (default: 60 = every 2 seconds at 30fps)
  - `opacity`: 0.0-1.0 (default: 1.0 = full replace)
  - `offset`: which frame to start flashing from

**Mode 2: Channel Embed**
- Blend a hidden image into a specific color channel at low opacity
- Only visible when that channel is isolated
- Parameters:
  - `source`: path to image or video asset
  - `channel`: R, G, B, or Alpha
  - `blend_strength`: 0.0-1.0 (default: 0.05 = barely visible)
  - `invert`: bool — embed as negative

**Mode 3: Second Video Source (User's expanded vision)**
- Interleave frames from a second video with various sampling strategies
- Parameters:
  - `source`: path to second video asset
  - `sample_mode`: "linear" (frame-for-frame), "clocked" (sync to same timecode), "sped_up" (2x, 4x rate), "granular_spray" (random frame clusters), "reverse", "ping_pong"
  - `mix_mode`: "replace" (full frame swap), "blend" (opacity mix), "channel" (per-channel), "alternate" (every Nth frame)
  - `density`: 0.0-1.0 — how often the secondary source appears
  - `grain_size`: for granular mode — how many consecutive frames to sample (1-30)
  - `grain_spread`: for granular mode — randomness of frame selection (0.0-1.0)
  - `speed_multiplier`: for sped_up mode (0.25x - 8x)

**Granular spray detail:** Like granular synthesis for audio but applied to video frames. Instead of sequential playback of the second source, it selects random "grains" (short sequences of N frames) from random positions in the source, creating a temporal scatter effect. The `grain_spread` controls how far apart the random positions can be (low = sequential-ish, high = chaotic spray from anywhere in the source).

### C. Static Image Support
Import and use still images as timeline assets alongside video.

**Core capabilities:**
- Import PNG, JPEG, TIFF, WebP, BMP as assets
- Image appears on timeline as a clip with user-defined duration (default: 5 seconds)
- Image converted to frames internally (same frame repeated for duration)
- Effects apply to images same as video frames
- Image as overlay layer (with transparency for PNG/WebP)
- Image resize/crop/position on canvas
- Image used as subliminal source (Mode 1 + 2 + 3)

---

## Acceptance Criteria (Draft — Refine in Planning Session)

### Text Overlay
1. Add text layer to timeline at playhead position
2. Text renders on video preview in real-time
3. Font, size, color, stroke configurable via panel
4. Text position draggable on preview canvas
5. Text duration adjustable via timeline clip handles
6. Text animation: at least fade, scale, slide presets
7. Multiple text layers stack correctly (z-order)
8. Text exports correctly in all export formats

### Subliminal Effect
9. Flash insert: single image flashes at specified interval
10. Channel embed: hidden image in R/G/B channel
11. Second video source: interleave with linear, clocked, sped_up modes
12. Granular spray: random frame clusters from second source
13. All subliminal modes work with both images and videos as source
14. Subliminal effect chains with other effects normally

### Static Images
15. Import PNG/JPEG/TIFF/WebP via file dialog or drag-and-drop
16. Image appears as timeline clip with configurable duration
17. Effects apply to static images (same as video frames)
18. Image transparency (alpha channel) preserved for PNG/WebP overlays
19. Image resize/position controls on canvas

---

## Architecture Notes (Preliminary)

### Text Rendering
- **Backend:** Pillow `ImageDraw.text()` or OpenCV `cv2.putText()` for basic text
  - Pillow preferred: supports TTF fonts, anti-aliasing, stroke, text-on-path
  - Render text to RGBA buffer → composite onto video frame
- **Frontend:** text editing in canvas overlay (contenteditable div or fabric.js)
- **Data model:** `TextLayer` type in timeline alongside video clips

### Subliminal Effect
- **Backend:** pure function `(frame, params, state_in) -> (result, state_out)`
  - state_in carries frame counter for interval tracking
  - state_in carries VideoReader handle for second video source (lazy-opened)
  - Granular spray: precompute grain positions on first call, cache in state
- **Integration:** registers as `fx.subliminal` in effect registry, works in chain like any effect

### Static Images
- **Backend:** `ingest` command already probes files — extend to detect image vs video
  - Image: `{ type: "image", width, height, format, has_alpha }`
  - Video: `{ type: "video", width, height, fps, duration, ... }` (existing)
- **Frontend:** timeline treats image clips as fixed-frame clips
  - `render_frame` for images: just return the decoded image (no seek needed)

---

## Open Questions (For Planning Session)

1. **Text editing UX:** In-canvas editing (like CapCut) or sidebar panel editor? Canvas is more intuitive but complex to implement in Electron.
2. **Font management:** Bundle fonts or use system fonts only? Licensing implications for bundled fonts.
3. **Text animation engine:** Keyframe-based (reuse automation system) or preset-based (simpler but less flexible)?
4. **Subliminal legality:** Should we add a "subliminal content" warning/consent in export? Some jurisdictions regulate subliminal content in broadcast.
5. **Granular spray randomness:** Seeded (deterministic per project) or truly random? Suggest seeded for consistency with existing determinism lock.
6. **Image duration default:** 5 seconds? Should it match the video FPS for frame-perfect timing?
7. **Multi-track compositing for text:** Text as a separate track type or as an effect on existing track? Separate track is cleaner but requires compositor.py changes.

---

## NOT in Phase 12

- No auto-captions (speech-to-text — post-launch, requires ML model)
- No 3D text (requires GPU shader pipeline)
- No text templates marketplace
- No video-in-video PiP (related but separate feature)
- No AI-generated text effects

---

## References

- CapCut text tools: text overlays, styles, animations, text-on-path
- After Effects text layers: keyframeable properties, per-character animation
- Existing effect contract: `(frame, params, state_in) -> (result, state_out)` — subliminal fits this
- Existing compositor: `backend/src/engine/compositor.py` — handles multi-track compositing
- Existing ingest: `backend/src/video/ingest.py` — extend for image detection
