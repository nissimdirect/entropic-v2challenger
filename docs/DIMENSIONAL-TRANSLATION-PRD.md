# Dimensional Translation: Product Requirements Document
## Resize, Scale, Position, Rotate, and Transform for Video/Photo Editors

**Version:** 2.1 (Post-Build Status Update)
**Date:** 2026-04-10
**Type:** Implementation-Ready PRD
**Target:** Entropic v2 Challenger
**CTO Status:** APPROVED — Phases 1-2 SHIPPED (2026-04-10), Phases 3-4 remaining

---

## Table of Contents

1. [Problem Statement & Personas](#1-problem-statement--personas)
2. [Success Metrics](#2-success-metrics)
3. [Terminology](#3-terminology)
4. [Design Decisions](#4-design-decisions)
5. [Competitor Analysis Summary](#5-competitor-analysis-summary)
6. [UX Principles (Don Norman)](#6-ux-principles)
7. [Use Cases](#7-use-cases)
8. [Functional Requirements](#8-functional-requirements)
9. [Non-Functional Requirements](#9-non-functional-requirements)
10. [Integration Rules](#10-integration-rules)
11. [Architecture Concerns](#11-architecture-concerns)
12. [Discoverability & Onboarding](#12-discoverability--onboarding)
13. [Implementation Phasing](#13-implementation-phasing)
14. [Validation Plan](#14-validation-plan)
15. [Competitor Detail (Reference)](#15-competitor-detail-reference)
16. [Sources](#16-sources)

---

## 1. Problem Statement & Personas

### Problem

A user has media (video/photo) on a canvas and needs to change its spatial properties — position, size, rotation, flip, opacity — to compose a final output. This is the most fundamental compositing operation in any video editor. Entropic v2 has a minimal TransformPanel (4 numeric inputs, 97 lines) but no direct manipulation, no canvas resolution, no multi-track compositing, and no keyframe animation for transforms.

### Personas

| Persona | JTBD | Must-Have Benefit |
|---------|------|-------------------|
| **Social Creator** (CapCut refugee) | Reformat one video for multiple platforms (16:9 → 9:16 → 1:1) | One-click reframe with aspect presets |
| **Glitch Artist** (core Entropic user) | Position and layer multiple clips for compositional effects | Multi-track PiP with per-layer transform + effects |
| **Music Visualizer** | Animate zoom/pan synchronized to audio beats | Transform keyframes tied to automation system |

### Competitive Differentiation

**Unique angle:** Transform controls built for glitch artists — other editors treat transform as utility. Entropic integrates transform with 170+ effects and audio-reactive automation (no competitor does this).

**Switching cost:** Projects with multi-layer compositions, automation keyframes, and effect chains cannot transfer to other editors.

---

## 2. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Activation** | 40% of DAU use transform within 7 days | Track `setClipTransform()` calls per user |
| **Engagement** | 3+ transform operations per session | Count distinct transform changes per session |
| **Retention** | Users who transform 2+ times have 1.5x 30-day retention | Cohort analysis |
| **Fit-to-Canvas** | 60% of oversized imports get fit within 30s | Track fit calls relative to imports |

---

## 3. Terminology

| Term | Definition |
|------|-----------|
| **Dimensional Translation** | Changing a media element's position, scale, rotation, or spatial geometry on a canvas |
| **Transform** | The composite of position, scale, rotation, and optionally skew/perspective applied to a media element |
| **Bounding Box** | A rectangular overlay with drag handles surrounding a selected element, enabling direct manipulation |
| **Anchor Point** | The origin point around which scale and rotation operations pivot (default: center of element) |
| **Constrained Scaling** | Scaling that preserves the original aspect ratio (proportional resize) |
| **Free Scaling** | Scaling that allows independent width/height adjustment (non-proportional resize) |
| **Direct Manipulation** | Interacting with on-canvas handles via mouse/trackpad to transform elements (vs. typing values) |
| **Properties Panel** | A UI panel showing numeric inputs for transform values |
| **Fit to Frame** | Scaling a media element to fit within canvas bounds preserving aspect ratio |
| **Fill Frame** | Scaling a media element to completely cover the canvas (may crop edges) |
| **Snap** | Automatic alignment to guides, grid, center, edges, or other elements during drag |
| **Safe Zones** | Overlay guides showing title-safe (80%) and action-safe (90%) areas |

---

## 4. Design Decisions

### DD-01: Coordinate System — Center-Origin

| Option | Used By |
|--------|---------|
| **Center-origin (0,0 = center)** | DaVinci Resolve |
| Top-left-origin (0,0 = top-left) | Photoshop, Premiere, AE, CapCut |

**Decision:** Center-origin. Position (0,0) = "centered" which is the default state for 90%+ of clips. Users think "move 50px right" not "position at pixel 1010."

**Entropic status:** Already uses center-origin (`types.ts:80-81`). No change needed.

### DD-02: Shift-Key Behavior — Proportional Default

| Option | Used By |
|--------|---------|
| Shift = CONSTRAIN | After Effects, old Photoshop |
| **Shift = UNCONSTRAIN** | Photoshop CC 2019+, CapCut, Resolve |

**Decision:** Default proportional. Shift to unconstrain. 4/5 competitors now default proportional. New product = no muscle memory to break.

**Mitigation:** Chain/link icon provides persistent visible toggle (Don Norman: constraint signifiers).

### DD-03: Scale 100% = Native Resolution

**Decision:** Universal industry standard. 100% = original size. "Fit to Canvas" button handles mismatch.

**Entropic status:** Already correct (`scale: 1.0` = native). No change needed.

### DD-04: Default Import — Auto-Fit (Non-Destructive)

**Decision:** Auto-fit oversized clips to canvas on import. Scale property adjusted, full resolution preserved. Configurable preference: "Fit to Canvas" (default) / "Fill Canvas" / "No Scaling."

**Entropic status:** Currently no auto-scaling. Must add to import handler in `App.tsx`.

### DD-05: Transform Before Effects

**Decision:** Transform applied BEFORE effect chain. Same as Premiere and Resolve. WYSIWYG.

**Entropic status:** Already correct. `_apply_clip_transform()` called before `apply_chain()` in both preview and export paths. No change needed.

### DD-06: Rotation Snap = 15 Degrees

**Decision:** 15° is a superset of 45° — includes 30, 45, 60, 90 as subsets.

### DD-07: Canvas Resolution

**Decision:** Explicitly settable. Presets: 16:9 (1920x1080, 3840x2160), 9:16 (1080x1920), 1:1 (1080x1080), 4:3, 4:5, 21:9, custom. Changing resolution mid-project does NOT auto-recalculate transforms.

**Entropic status:** No project canvas resolution exists. Preview adapts to source media. Export has its own resolution settings. **Must add** `canvasResolution` to project store.

---

## 5. Competitor Analysis Summary

### Consensus Patterns (Industry Standard — 4/5+ competitors)

1. **Bounding box with 8 handles** (4 corners + 4 midpoints) — universal
2. **Drag inside = reposition** — universal
3. **Corner handles = scale** — universal
4. **Hover outside corner = rotate** — 4/5
5. **Proportional scale as default** — 4/5 (all except After Effects)
6. **Anchor point at center** — universal default
7. **Numeric panel + direct manipulation** — universal (dual input)
8. **Undo/Redo during transform** — universal

### Cross-Competitor Comparison (Key Rows)

| Feature | Photoshop | Premiere | CapCut | Resolve | AE |
|---------|-----------|----------|--------|---------|-----|
| Activate | `Cmd+T` | Click Motion | Click clip | Overlay mode | `V` |
| Proportional default | YES | YES | YES | YES | NO |
| Aspect toggle | Link icon | Uniform Scale | None | Chain icon | Chain icon |
| Anchor point | 9-point grid | Pixel X,Y | None | Normalized | Pan Behind (`Y`) |
| Rotation snap | 15° | None | None | None | 45° |
| Fit-to-frame | None | Right-click | Presets | None | `Cmd+Opt+F` |
| Coordinate system | % + px | Pixels | Pixels | Normalized 0-1 | Pixels |

*(Full per-competitor breakdown in Section 15)*

---

## 6. UX Principles

Applied from Don Norman / NNGroup to transform interfaces:

| Principle | Application |
|-----------|-------------|
| **Signifiers** | Contrasting handle colors, cursor changes on hover, distinct corner vs midpoint handles |
| **Feedback** | Live preview during drag, dimension tooltips, snap indicator lines, ghost/outline of original |
| **Consistency** | All corners behave identically. Modifier keys mean the same thing everywhere |
| **Non-Destructive** | Transform as metadata, never baked. Full undo/redo. Reset per property + Reset All |
| **Constraint Signifiers** | Lock icon for proportional. Visual indicator when active. Tooltip on first use |
| **Mode Error Prevention** | Cursor signals operation type. Tooltips on handles. Every gesture has a menu equivalent |
| **Mapping** | Drag right = move right. Corner outward = larger. CW drag = CW rotation |

---

## 7. Use Cases

### 7.1 Positioning (UC-01 to UC-05)

| ID | Use Case | User Action |
|----|----------|-------------|
| UC-01 | Reposition clip | Drag inside bounding box, OR type X/Y |
| UC-02 | Center clip | Drag near center (snap), OR "Center" button, OR reset position |
| UC-03 | Position at edge/corner | Drag with snap, OR type boundary coords |
| UC-04 | Nudge | Arrow keys (1px), Shift+arrow (10px) |
| UC-05 | Position off-canvas | Drag beyond bounds, OR type coords beyond canvas |

### 7.2 Scaling (UC-10 to UC-18)

| ID | Use Case | User Action |
|----|----------|-------------|
| UC-10 | Scale proportionally | Drag corner (default), OR type scale % |
| UC-11 | Scale non-proportionally | Shift+drag corner, OR unlink W/H and type |
| UC-12 | Scale from center | Alt/Opt+drag |
| UC-13 | Scale from corner/edge | Drag without Alt/Opt |
| UC-14 | Scale to exact % | Type in Scale field |
| UC-15 | Scale single axis | Drag midpoint handle, OR type separate W/H |
| UC-16 | Fit to canvas | "Fit to Canvas" button or shortcut |
| UC-17 | Fill canvas | "Fill Canvas" button or shortcut |
| UC-18 | Scale to pixel dims | Type pixel values (unit toggle) |

### 7.3 Rotation (UC-20 to UC-25)

| ID | Use Case | User Action |
|----|----------|-------------|
| UC-20 | Free rotate | Drag outside bounding box |
| UC-21 | Snap rotate | Shift+drag (15° snaps) |
| UC-22 | Exact angle | Type degrees |
| UC-23 | 90° CW/CCW | Button or shortcut |
| UC-24 | 180° | Button or double-90 |
| UC-25 | Custom pivot | Move anchor point, then rotate |

### 7.4 Anchor Point (UC-30 to UC-33)

| ID | Use Case | User Action |
|----|----------|-------------|
| UC-30 | Move anchor | Drag crosshair, OR type X/Y |
| UC-31 | Reset to center | "Center Anchor" button |
| UC-32 | Set to corner | 9-point grid click, OR type coords |
| UC-33 | Move without shifting layer | Pan Behind behavior |

### 7.5 Flip (UC-40 to UC-41)

| ID | Use Case | User Action |
|----|----------|-------------|
| UC-40 | Flip horizontal | Flip H button |
| UC-41 | Flip vertical | Flip V button |

### 7.6 Fit/Fill (UC-50 to UC-54)

| ID | Use Case | User Action |
|----|----------|-------------|
| UC-50 | Fit to canvas (letterbox) | "Fit" button or shortcut |
| UC-51 | Fill canvas (crop) | "Fill" button or shortcut |
| UC-52 | Stretch to canvas | Unlock aspect + set to canvas W/H |
| UC-53 | Fit to width | "Fit Width" button |
| UC-54 | Fit to height | "Fit Height" button |

### 7.7 Snapping (UC-60 to UC-65)

| ID | Use Case | User Action |
|----|----------|-------------|
| UC-60 | Snap to center | Drag near center, auto-snap lines appear |
| UC-61 | Snap to edges | Drag near edge, snap line |
| UC-62 | Snap to guides | Drag near user guide |
| UC-63 | Snap to other clips | Drag near another clip (PiP) |
| UC-64 | Toggle snapping | Button or shortcut |
| UC-65 | Create guide | Drag from ruler |

### 7.8 Reset & Undo (UC-70 to UC-73)

| ID | Use Case | User Action |
|----|----------|-------------|
| UC-70 | Reset single property | Double-click label, OR per-property reset icon |
| UC-71 | Reset all transform | "Reset Transform" button |
| UC-72 | Undo | Cmd+Z |
| UC-73 | Redo | Cmd+Shift+Z |

### 7.9 Compound Operations (UC-80 to UC-83)

| ID | Use Case | User Action |
|----|----------|-------------|
| UC-80 | Picture-in-Picture | Scale to ~25%, position in corner, overlay track |
| UC-81 | Split screen | Scale each clip to 50% width, position adjacent |
| UC-82 | Zoom-and-pan (Ken Burns) | Start/end keyframes on scale + position |
| UC-83 | Rotate and reposition | Rotate, then reposition to compensate |

### 7.10 Multi-Clip (UC-90 to UC-94)

| ID | Use Case | User Action |
|----|----------|-------------|
| UC-90 | Select multiple clips | Cmd+click in timeline, OR marquee on canvas |
| UC-91 | Move group | Drag any selected clip — all move |
| UC-92 | Scale group | Drag group bounding box corner |
| UC-93 | Rotate group | Drag group rotation handle |
| UC-94 | Reset individual in group | Right-click → Reset Transform |

### 7.11 Keyframe Animation (UC-100 to UC-106)

| ID | Use Case | User Action |
|----|----------|-------------|
| UC-100 | Set keyframe | Click diamond next to property |
| UC-101 | Animate position | Set position keyframe, scrub, set new keyframe |
| UC-102 | Animate scale (Ken Burns) | Set scale keyframe, scrub, set new keyframe |
| UC-103 | Navigate keyframes | Keyframe nav arrows or shortcut |
| UC-104 | Delete keyframe | Click active diamond |
| UC-105 | Change interpolation | Right-click → linear/ease in/out/in-out |
| UC-106 | Copy/paste keyframes | Cmd+C → scrub → Cmd+V |

### 7.12 Resolution Mismatch (UC-110 to UC-113)

| ID | Use Case | Expected Behavior |
|----|----------|-------------------|
| UC-110 | Import 4K → 1080p project | Auto-fit (Scale ~50%). Non-destructive |
| UC-111 | Import 720p → 1080p project | Native size (Scale 100%), smaller than canvas |
| UC-112 | Import 9:16 → 16:9 project | Auto-fit to height (pillarboxed) |
| UC-113 | Change project resolution mid-edit | Transforms retain absolute values |

### 7.13 Edge Cases (UC-120 to UC-125)

| ID | Use Case | Expected Behavior |
|----|----------|-------------------|
| UC-120 | Scale to 0% | Clamp to 1%. Never invisible |
| UC-121 | Scale >1000% | Allow up to 10000%. Warn >400% |
| UC-122 | Clip fully off-canvas | Selectable via timeline. Directional indicator. "Reset Position" recovers |
| UC-123 | Rotated bounding box | Handles rotate with clip. Drag follows rotated axes |
| UC-124 | Anchor off-clip | Allowed — enables orbiting rotation |
| UC-125 | Panel edit during drag | Panel disabled during active drag |

---

## 8. Functional Requirements

**Status key:** DONE = exists in Entropic, PARTIAL = partly built, MISSING = must build, WRONG = exists but incorrect bounds/behavior

### 8.1 Transform Properties (Core)

| ID | Requirement | P | Status | Entropic Location | Gap |
|----|------------|---|--------|-------------------|-----|
| FR-01 | Position X,Y center-origin (0,0 = center) | P0 | DONE | `types.ts:80-81` | — |
| FR-02 | Scale as % (100% = native) | P0 | DONE | `types.ts` — scaleX/scaleY as multiplier, panel displays ×100 as % | — |
| FR-03 | Rotation in degrees (unlimited) | P0 | DONE | Backend clamp expanded to ±36000° | — |
| FR-04 | Anchor point (X,Y from clip center) | P1 | DONE | `anchorX`, `anchorY` in ClipTransform + backend rotation matrix | — |
| FR-05 | Flip Horizontal | P1 | DONE | `flipH` in model + `cv2.flip(frame, 1)` in backend | — |
| FR-06 | Flip Vertical | P1 | DONE | `flipV` in model + `cv2.flip(frame, 0)` in backend | — |
| FR-07 | Per-clip opacity 0-100% | P0 | DONE | `opacity?: number` on Clip interface, wired to compositor | — |
| FR-08 | Non-destructive metadata | P0 | DONE | Transform on Clip, never baked | — |

### 8.2 Properties Panel

| ID | Requirement | P | Status | Gap |
|----|------------|---|--------|-----|
| FR-10 | Position X,Y inputs | P0 | DONE | — |
| FR-11 | Scale (split W/H when unlocked) | P0 | DONE | W/H fields with lock toggle |
| FR-12 | Rotation input | P0 | DONE | Range expanded (unlimited) |
| FR-13 | Anchor point X,Y inputs | P1 | MISSING | Model exists, panel fields not yet added |
| FR-14 | Aspect ratio lock toggle (chain icon) | P0 | DONE | Chain icon in TransformPanel |
| FR-15 | Scrubby sliders | P1 | MISSING | Uses plain `<input type="number">` |
| FR-16 | Reset per property | P0 | DONE | Double-click label to reset |
| FR-17 | Reset All Transform | P0 | DONE | `TransformPanel.tsx:34-36` |
| FR-18 | Tab cycles fields | P1 | PARTIAL | HTML default works |
| FR-19 | Unit display (px, %, °) | P0 | DONE | px, %, ° labels on all fields |

### 8.3 Direct Manipulation (Canvas Handles)

| ID | Requirement | P | Status | Gap |
|----|------------|---|--------|-----|
| FR-20 | Bounding box with 8 handles | P0 | DONE | `BoundingBoxOverlay.tsx` — SVG overlay |
| FR-21 | Drag inside = reposition | P0 | DONE | Move mode with undo transaction |
| FR-22 | Drag corner = scale | P0 | DONE | All 4 corners implemented |
| FR-23 | Drag midpoint = single-axis | P1 | DONE | T/B/L/R midpoint handles |
| FR-24 | Hover outside corner = rotate | P0 | DONE | Rotation zone outside bounding box |
| FR-25 | Shift + drag = invert lock | P0 | DONE | Shift inverts aspectLocked state |
| FR-26 | Alt + drag = scale from center | P1 | MISSING | |
| FR-27 | Shift + rotate = snap 15° | P1 | DONE | 15° increments |
| FR-28 | Shift + drag = axis constrain | P1 | DONE | Horizontal or vertical only |
| FR-29 | Anchor crosshair on canvas | P1 | DONE | Red crosshair when anchor ≠ center |
| FR-30 | Arrow keys = nudge 1px | P1 | DONE | Keyboard handler in overlay |
| FR-31 | Shift+arrow = nudge 10px | P1 | DONE | 10px step with Shift |

### 8.4 Visual Feedback

| ID | Requirement | P | Status | Gap |
|----|------------|---|--------|-----|
| FR-40 | Live preview during drag | P0 | MISSING | Need CSS transform overlay (Rule 6) |
| FR-41 | Dimension tooltip during scale | P1 | MISSING | |
| FR-42 | Rotation angle tooltip | P1 | MISSING | |
| FR-43 | Position tooltip during drag | P2 | MISSING | |
| FR-44 | Snap indicator lines | P1 | DONE | `SnapGuides.tsx` — center + edge indicators |
| FR-45 | Panel ↔ canvas sync | P0 | DONE | Both panel and overlay call same `onChange`, bidirectional |

### 8.5 Fit/Fill

| ID | Requirement | P | Status | Gap |
|----|------------|---|--------|-----|
| FR-50 | Fit to Canvas | P0 | DONE | `TransformPanel.tsx:28-32` |
| FR-51 | Fill Canvas | P1 | DONE | Fill button in TransformPanel uses `max()` |
| FR-52 | Fit to Width | P2 | MISSING | |
| FR-53 | Fit to Height | P2 | MISSING | |
| FR-54 | Keyboard shortcut | P1 | MISSING | |
| FR-55 | Non-destructive | P0 | DONE | Sets Scale, never resamples |

### 8.6 Snapping

| ID | Requirement | P | Status | Gap |
|----|------------|---|--------|-----|
| FR-60 | Snap to center | P1 | MISSING | No snap system |
| FR-61 | Snap to edges | P1 | MISSING | |
| FR-62 | Snap toggle | P1 | MISSING | |
| FR-63 | Snap tolerance | P2 | MISSING | |
| FR-64 | User guides | P2 | MISSING | |
| FR-65 | Safe zones | P2 | MISSING | |

### 8.7 Undo/Redo

| ID | Requirement | P | Status | Gap |
|----|------------|---|--------|-----|
| FR-70 | All transforms undoable | P0 | DONE | `undoable()` wraps `setClipTransform()` |
| FR-71 | Integrates with undo system | P0 | DONE | Same stack as other edits |
| FR-72 | Drag coalesces to single entry | P0 | DONE | beginTransaction/commitTransaction in BoundingBoxOverlay |

### 8.8 Crop

| ID | Requirement | P | Status | Gap |
|----|------------|---|--------|-----|
| FR-80 | Crop L/R/T/B | P2 | MISSING | No crop in data model |
| FR-81 | Crop aspect presets | P2 | MISSING | |
| FR-82 | Free crop | P2 | MISSING | |

### 8.9 Multi-Clip Transform

| ID | Requirement | P | Status | Gap |
|----|------------|---|--------|-----|
| FR-90 | Multi-select via Cmd+click | P1 | DONE | `timeline.ts:869-954` |
| FR-91 | Group bounding box | P1 | MISSING | |
| FR-92 | Group reposition | P1 | MISSING | Need `transformSelectedClips()` |
| FR-93 | Group scale | P2 | MISSING | |
| FR-94 | Group rotate | P2 | MISSING | |
| FR-95 | Group anchor = geometric center | P2 | MISSING | |

### 8.10 Keyframe Animation

| ID | Requirement | P | Status | Gap |
|----|------------|---|--------|-----|
| FR-100 | Keyframe diamonds per property | P1 | MISSING | Automation system exists for effects, not transform |
| FR-101 | Stopwatch model | P1 | MISSING | |
| FR-102 | Interpolation (linear, ease) | P1 | DONE (in automation) | `evaluateAutomation()` + `applyEasing()` reusable |
| FR-103 | Keyframe nav arrows | P1 | MISSING | |
| FR-104 | Delete keyframe | P1 | DONE (in automation) | `removePoint()` exists |
| FR-105 | Copy/paste keyframes | P2 | MISSING | |
| FR-106 | Timeline indicators | P1 | MISSING | |
| FR-107 | Disable all keyframes (stopwatch off) | P1 | MISSING | |

### 8.11 Resolution Mismatch & Import

| ID | Requirement | P | Status | Gap |
|----|------------|---|--------|-----|
| FR-110 | Auto-fit oversized on import | P0 | DONE | `App.tsx:837` — auto-fit with `normalizeTransform`, uses canvas resolution |
| FR-111 | Undersized at native (no upscale) | P0 | DONE | Current behavior |
| FR-112 | Import preference (Fit/Fill/None) | P1 | MISSING | Add to settings |
| FR-113 | Scale 100% = native | P0 | DONE | `scale: 1.0` = native |

### 8.12 Effects Pipeline

| ID | Requirement | P | Status | Gap |
|----|------------|---|--------|-----|
| FR-120 | Transform BEFORE effects | P0 | DONE | Confirmed in preview + export |
| FR-121 | Bounding box = source dims | P0 | N/A | No bounding box yet |

### 8.13 Edge Cases & Bounds

| ID | Requirement | P | Status | Gap |
|----|------------|---|--------|-----|
| FR-130 | Min scale 1% | P0 | DONE | Backend clamps 0.01, panel min=1% |
| FR-131 | Max scale 10000% | P0 | DONE | Backend clamps 100.0 (10000%), panel max=10000% |
| FR-132 | Off-canvas selectable via timeline | P0 | DONE | Timeline click selects clip regardless |
| FR-133 | Rotated bounding box | P1 | N/A | |
| FR-134 | Anchor anywhere | P1 | N/A | |
| FR-135 | Panel disabled during drag | P0 | N/A | |

### 8.14 Canvas/Project Resolution

| ID | Requirement | P | Status | Gap |
|----|------------|---|--------|-----|
| FR-140 | Canvas resolution in project settings | P0 | DONE | `canvasResolution` in project store + persistence + hydration |
| FR-141 | Presets (16:9, 9:16, 1:1, 4:3, 4:5, 21:9) | P0 | MISSING | Store ready, UI panel not built |
| FR-142 | Custom resolution (arbitrary WxH) | P0 | MISSING | Store ready, UI panel not built |
| FR-143 | 4K presets | P1 | MISSING | |
| FR-144 | No auto-recalc on resolution change | P1 | N/A | |

### 8.15 Accessibility

| ID | Requirement | P | Status | Gap |
|----|------------|---|--------|-----|
| FR-150 | Keyboard-only transform | P1 | PARTIAL | Panel works, no nudge keys |
| FR-151 | Handle contrast 3:1 | P1 | N/A | |
| FR-152 | Screen reader ARIA | P2 | MISSING | |
| FR-153 | Not color-only | P1 | N/A | |

### Status Summary (Updated 2026-04-10 post-build + UAT)

| Status | Count | % |
|--------|-------|---|
| DONE | 54 | 62% |
| PARTIAL | 3 | 3% |
| MISSING | 20 | 23% |
| WRONG | 1 | 1% |
| N/A | 9 | 10% |
| **Total** | **87** | |

*Includes FRs + NFRs. WRONG=FR-40 (live preview during drag uses IPC, not CSS transform). Remaining MISSING items are mostly Phase 3 (keyframes) and Phase 4 (crop, guides, accessibility).*

---

## 9. Non-Functional Requirements

| ID | Requirement | P | Status | Notes |
|----|------------|---|--------|-------|
| NFR-01 | Preview ≥15fps during drag | P0 | MISSING | **Use CSS transform on cached frame during drag (60fps GPU), backend re-render on mouseup.** Current pipeline: IPC→Python→OpenCV→JPEG→base64→canvas = ~50-100ms/frame |
| NFR-02 | Panel ↔ canvas always in sync | P0 | DONE | Both panel and overlay share onChange callback |
| NFR-03 | Transforms persist save/load | P0 | DONE | Auto-serialized via `project-persistence.ts` |
| NFR-04 | No quality loss | P0 | DONE | All non-destructive. Rasterize at export only |
| NFR-05 | Shortcuts customizable | P1 | DONE | Shortcut system exists |
| NFR-06 | Platform modifier keys | P0 | DONE | Electron handles Cmd/Ctrl |
| NFR-07 | Handle hit targets ≥12px | P1 | N/A | |
| NFR-08 | Cursor changes on hover | P0 | N/A | |
| NFR-09 | Undo granularity (1 drag = 1 entry) | P0 | DONE | beginTransaction/commitTransaction in BoundingBoxOverlay |
| NFR-10 | Math expressions in fields | P2 | MISSING | |

---

## 10. Integration Rules

### Rule 1: All Compositing in Backend

Frames transport as JPEG over ZMQ (base64). **JPEG has no alpha.** Alpha is dropped during encoding (`PIL.Image.fromarray(frame[:,:,:3])`).

**Therefore:** Per-clip opacity, blend modes, and multi-layer compositing MUST happen in the Python backend compositor BEFORE JPEG encoding. Frontend receives a single opaque composited frame.

### Rule 2: Multi-Track Video Rendering Must Be Fixed

`App.tsx:520` uses `.find()` — returns only the FIRST active video clip. Backend compositor supports 32 layers but frontend never sends more than 1.

**Fix:** Change to `.filter()`. Collect ALL active clips across ALL unmuted video tracks. Build layers array with per-clip transform + opacity + track blend mode. Always use `render_composite`.

### Rule 3: Transform Before Effects (Preserved)

`_apply_clip_transform()` called before `apply_chain()` in both preview and export. This is correct per DD-05. Do not change.

### Rule 4: Three Coordinate Spaces

| Space | Origin | Units | Used In |
|-------|--------|-------|---------|
| DOM/CSS | Top-left of container | CSS pixels | Mouse events |
| Canvas | Top-left of canvas | Canvas pixels | drawImage() |
| Transform | Center of canvas | Media pixels | ClipTransform x,y |

**Conversion must go through a single utility** (`domToTransformCoords()`, `transformToDomCoords()`). Never inline.

### Rule 5: Drag = Transaction

One mouse drag (mousedown→mousemove×N→mouseup) = one undo transaction.

```
onMouseDown → beginTransaction("Reposition clip")
onMouseMove → setClipTransform(clipId, newTransform)
onMouseUp   → commitTransaction()
```

### Rule 6: CSS Transform for Drag Performance

During drag, apply CSS `transform: translate(dx,dy) scale(s) rotate(r)` on a cached frame image. Send final values to backend on mouseup only. This gives 60fps during drag vs. 10-20fps via IPC.

### Rule 7: Keyframe Extension

Existing `AutomationLane` uses `paramPath` strings like `"{effectId}.{paramKey}"`. Extend with convention `"clip:{clipId}.transform.{property}"`. The `evaluateAutomation()` function (binary search + easing) can be reused.

**Critical:** Transform values are absolute units (px, multiplier, degrees) — NOT normalized 0-1 like effect automation. Need denormalization step.

### Rule 8: Scale as Multiplier Internally

Store as multiplier (1.0 = native). Display as percentage in UI (×100). When split into scaleX/scaleY, both remain multipliers.

**Backend clamp update:** `0.01` → `100.0` (currently `4.0`).

### Rule 9: Bounding Box = SVG Overlay

SVG element positioned absolutely over PreviewCanvas. SVG provides anti-aliased handles, rotation transforms on overlay, path-based hit testing, resolution-independent rendering.

### Rule 10: Import Auto-Fit

On clip add-to-timeline: read clip native res from asset metadata, read project canvas res, if larger: `clip.transform.scale = min(canvasW/clipW, canvasH/clipH)`. If smaller: leave at 1.0.

---

## 11. Architecture Concerns

### CRITICAL: Single Video Track Rendering

`App.tsx:520` finds ONE video clip. Multi-track compositing backend exists but frontend only sends 1 layer. **Blocks PiP, split screen, multi-clip opacity, and per-clip blend modes.**

Fix: refactor `requestRenderFrame()` to collect ALL active clips and use `render_composite`.

### CRITICAL: No Canvas Resolution

No project-level canvas resolution. Without it, Position 0,0 = center of what? Fit = fit to what? Snap = snap to what edges?

Fix: add `canvasResolution: {width, height}` to project store. Default to first clip's res or 1920x1080.

### IMPORTANT: Per-Clip vs. Track Opacity

Two opacity layers needed. Effective opacity = `track.opacity × clip.opacity`. Both must be sent to backend compositor.

Track opacity exists in model (`types.ts:61`) but is hardcoded to 1.0 in the render call (`App.tsx:535`). Must wire.

### IMPORTANT: ClipTransform Expansion + Migration

Current: `{x, y, scale, rotation}`. Required: `{x, y, scaleX, scaleY, rotation, anchorX, anchorY, flipH, flipV}`.

Migration: `scale` → `scaleX = scaleY = scale`. Missing fields default to identity values.

### MODERATE: Aspect Lock State

Lock toggle is UI-only panel state (not persisted per-clip). When locked, setting scaleX also sets scaleY. When unlocked, independent. Default: locked.

---

## 12. Discoverability & Onboarding

**Progressive disclosure:**
1. On first clip select → TransformPanel appears in sidebar (already happens)
2. On first canvas click of selected clip → bounding box with tooltip: "Drag corners to resize, drag inside to move"
3. On first Shift+drag → tooltip: "Hold Shift to unlock aspect ratio"
4. After 5+ operations → shortcuts hint in panel footer

**Entry points:**
- Primary: Click clip in timeline → TransformPanel in sidebar
- Secondary: Click clip on canvas → bounding box handles
- Tertiary: Menu → Clip → Transform

---

## 13. Implementation Phasing

### Phase 1: Foundation — SHIPPED 2026-04-10

| Task | Files | Status |
|------|-------|--------|
| Expand ClipTransform (scaleX/Y, anchorX/Y, flipH/V) | `types.ts` | DONE |
| Add per-clip opacity to Clip | `types.ts` | DONE |
| Add canvas resolution to project store + persistence | `project.ts`, `project-persistence.ts` | DONE |
| Fix multi-track rendering (`.find()` → `.filter()`) | `App.tsx` | DONE |
| Wire track opacity + blend mode | `App.tsx` | DONE |
| Expand backend scale clamp (4.0 → 100.0) | `zmq_server.py` | DONE |
| Add flip H/V to backend | `zmq_server.py` | DONE |
| Add anchor point to backend rotation | `zmq_server.py` | DONE |
| Expand TransformPanel (lock, flips, units, reset) | `TransformPanel.tsx` | DONE |
| Auto-fit on import | `App.tsx` | DONE (pre-existing, updated for scaleX/Y) |
| CanvasResolutionPanel component | New | **NOT BUILT** — store ready, no UI |
| Project migration for old saves | `project-persistence.ts` | DONE (`normalizeTransform()`) |

### Phase 2: Direct Manipulation — SHIPPED 2026-04-10

| Task | Files | Status |
|------|-------|--------|
| Coordinate conversion utilities | `transform-coords.ts` | DONE |
| BoundingBoxOverlay (SVG, 8 handles, rotation) | `BoundingBoxOverlay.tsx` | DONE |
| CSS transform for drag performance | `PreviewCanvas.tsx` | **NOT BUILT** — sends to backend each mousemove |
| Drag undo coalescing (transactions) | Uses existing `beginTransaction()` | DONE |
| Arrow key nudge | Keyboard handler in overlay | DONE |
| Modifier keys (Shift, Alt) | Mouse handlers | DONE (Shift), Alt not yet |
| Snap guides (center, edges) | `SnapGuides.tsx` | DONE |
| Scrubby sliders | New: `ScrubbySlider.tsx` | **NOT BUILT** |

### Phase 3: Animation

Keyframes for transform properties.

| Task | Files | Size |
|------|-------|------|
| Extend automation for transform keyframes | `automation.ts` | M |
| TransformKeyframeRow in panel | New | M |
| Keyframe indicators on timeline clips | `Clip.tsx` | S |
| Evaluate transform keyframes during render | `App.tsx` render flow | M |
| Keyframe navigation | Panel + keyboard | S |

### Phase 4: Polish

Guides, crop, accessibility.

| Task | Files | Size |
|------|-------|------|
| CanvasResolutionPanel UI (presets + custom) | New component | M |
| CSS transform for drag performance (60fps) | `PreviewCanvas.tsx` | M |
| Scrubby sliders on numeric fields | New: `ScrubbySlider.tsx` | M |
| User-created guide lines | New | M |
| Safe zone overlay | New | S |
| Crop (L/R/T/B + presets) | `types.ts`, panel, backend | L |
| ARIA labels | `TransformPanel.tsx` | S |
| Math expressions in fields | `ScrubbySlider.tsx` | M |
| Multi-clip group transform | `timeline.ts`, `BoundingBoxOverlay.tsx` | L |
| Alt+drag scale from center | `BoundingBoxOverlay.tsx` | S |
| Anchor point inputs in TransformPanel | `TransformPanel.tsx` | S |

---

## 14. Validation Plan

| Phase | Activity | N | Timing |
|-------|----------|---|--------|
| Pre-build | Interview current Entropic users on composition workflows | 5 | Before Phase 1 |
| Alpha | Dogfood with internal projects (music videos, glitch art) | 3 projects | During Phase 2 |
| Beta | Discord community beta, track activation + support tickets | 20 users | 2 weeks post-Phase 2 |
| Post-launch | Cohort analysis, Sean Ellis survey | All users | 30 days post-release |

---

## 15. Competitor Detail (Reference)

### Adobe Photoshop

**Free Transform** (`Cmd+T`): Bounding box with 8 handles. Options Bar shows X, Y, W%, H%, Rotation, Skew (scrubby sliders). Link icon locks aspect. Since CC 2019: proportional by default, Shift = unconstrain (reversed from legacy — caused backlash, "Use Legacy Free Transform" preference exists).

**Key shortcuts:** Cmd+T (activate), Alt+drag (from center), Shift+drag outside (15° snap), Ctrl+drag corner (distort), Enter (accept), Esc (cancel).

**Unique:** Content-Aware Scale with alpha protection. Multiple undo within transform. Click-outside-to-confirm. Preserve Details 2.0 upscaling.

### Adobe Premiere Pro

**Effect Controls Panel**: Every clip has Motion effect (Position, Scale, Uniform Scale checkbox, Rotation with rev counter, Anchor Point, Anti-Flicker). Values scrub: Shift=faster, Ctrl=finer. Program Monitor: click Motion label to show 8 handles. Drag corner = free scale (non-proportional default), Shift = proportional.

**Fit/Fill confusion:** "Set to Frame Size" (non-destructive, adjusts Scale) vs. "Scale to Frame Size" (destructive, resamples). Renamed in v25 to "Fit to Frame" / "Fill Frame."

### CapCut

Simplest interface. Right panel: Position, Scale, Rotation, Opacity with keyframe diamonds. Preview: proportional corner handles, rotation handle above box. No modifier keys documented. Crop tool (`Cmd+R`) separate. Canvas presets for social platforms. Auto Reframe (AI subject tracking).

### DaVinci Resolve

Inspector: Zoom X/Y (multiplier, linked by chain), Position X/Y (normalized 0-1, center = 0), Rotation, Anchor Point (normalized), Pitch, Yaw, Flip toggles. Viewer overlay dropdown (Transform/Crop/Dynamic Zoom — one at a time). Dynamic Zoom: green/red rectangles with ease curves.

**Unique:** Normalized coordinates. Pitch/Yaw pseudo-3D. Fusion page has separate node-based transforms.

### Adobe After Effects

**Most keyboard-efficient**: A/P/S/R/T reveal properties. Shift+letter = additive. U = keyframed, UU = modified. Comp panel: Selection tool (V), drag corner = free scale (Shift = proportional — opposite of Photoshop). Pan Behind (Y) moves anchor without layer shift.

**Unique:** Expression-driven transforms (`wiggle(5,20)`, `time*90`). Fit shortcuts (Cmd+Opt+F, +H, +G). 3D layer toggle adds Z-axis to everything. F9 = Easy Ease.

---

## 16. Sources

### Competitor Documentation
- Photoshop Free Transform Essential Skills (photoshopessentials.com)
- Free Transform CC 2019 Changes (photoshopessentials.com)
- Shift Key Reversal (Scott Kelby)
- Content-Aware Scale, Resampling Options (Adobe Help)
- Premiere Pro Motion Effect (Adobe Help)
- Scale to Frame vs Set to Frame (PremierePro.net)
- Premiere Snap to Guides, Rotation/Anchors (Adobe Help, PremiumBeat)
- CapCut Keyframes, Aspect Ratio, Canvas Size (MacMyths, capcut.com)
- DaVinci Resolve Transform Manual (Blackmagic), Tutorial (Edits101), Inspector (BeginnersApproach)
- After Effects Layer Properties, Shortcuts, Anchor Point, Fit to Comp, Grids/Guides (Adobe Help, School of Motion, Ukramedia, Noble Desktop)

### UX Principles
- Don Norman — "The Design of Everyday Things" (7 principles)
- Nielsen Norman Group — Direct manipulation, affordances, feedback, consistency

### Product Strategy
- Sean Ellis (Dropbox, LogMeIn) — PMF, activation, onboarding
- Hila Qu (GitLab, Reforge) — Product-led growth metrics
- Nielsen Norman — Progressive disclosure, complex apps

---

*Combined PRD generated 2026-04-10. Implementation-ready for Entropic v2 Challenger.*
