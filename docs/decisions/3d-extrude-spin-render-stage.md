# ADR — 3D EXTRUDE + SPIN render stage: sidecar (Option B), software-rasterized

**Date:** 2026-07-02
**Status:** Accepted
**Context:** Implementing the "3D EXTRUDE + SPIN" recipe (spec: `~/.claude/plans/creatrix-3d-extrude-spin-spec.md`, prototype: `popchaos-site/challengers/round4/s-3d.html`). The spec leaves one decision to the builder: does the 3D render stage live in **(A)** the Electron renderer via offscreen three.js, or **(B)** the Python sidecar?

## Decision

**Option B — Python sidecar, implemented as a registered effect (`fx.extrude_spin`), software-rasterized in numpy/OpenCV. No moderngl/GL context.**

## Evidence

1. **The export path is Python-only; the renderer never participates in a render.**
   `backend/src/engine/export.py` builds every exported frame headlessly: it imports `effects.registry`, `engine.pipeline.apply_chain`, and `engine.compositor.render_composite`, decodes source frames with `av`/`cv2`, runs the effect chain per frame, and encodes. There is no path by which a renderer-process canvas could be composited into an export. The spec requires the result to be "a rendered layer composited into the timeline like any other clip" and "deterministic per (seed, frame_index)" — an offscreen three.js canvas in the renderer can drive a *live preview* but can never reach the exporter. **This disqualifies Option A** for anything beyond preview, and shipping preview-only would break preview/export parity (Effect Contract §2.2).

2. **No renderer-side generation stage exists to hook.**
   `frontend/package.json` has no `three`, `@react-three/*`, `regl`, `pixi.js`, `babylonjs`, or `gl-matrix` dependency. There is no existing WebGL/visualizer generation surface in `frontend/src/` — the renderer is a React/DOM UI that displays MJPEG frames produced by the sidecar (`decode -> apply_chain -> encode_mjpeg -> base64 -> <img>`). Option A would mean introducing three.js *and* a renderer-side generation pipeline that has no other consumer.

3. **The effect ABI already provides exactly what this recipe needs.**
   Effects are pure functions `apply(frame, params, state_in, *, frame_index, seed, resolution) -> (out, state_out)` (`docs/EFFECT-CONTRACT.md`). This maps 1:1 onto the recipe: `frame` is the 2D source (logo / frozen layer frame), `frame_index`+`seed` give the spec's determinism, and `state_in`/`state_out` carry the true-feedback loop (previous print re-enters the next print) — the same mechanism `fx.temporal_blend` already uses for feedback trails.

## The moderngl / shader-port cost (why software, not GL)

Choosing B "by the book" means moderngl/pyrender — a GL context in Python. The existing sidecar stack (`backend/pyproject.toml`) is numpy / opencv-python-headless / scipy / Pillow / av, with **zero** GL. Adding moderngl imposes an EGL/offscreen-context dependency that is fragile in headless CI (Linux runners have no display; the effect must import and run on every `pytest` box and on the user's Apple Silicon). The Effect Contract also forbids process-spawning and hidden global state (§2.3), which a GL context strains.

So we pay the shader-port cost in a different currency: **the GLSL is ported to vectorized numpy/OpenCV** rather than run on a GPU.
- The six "machines" (toner / bayer / halftone / sobel / ascii / random) are per-pixel threshold / ordered-dither / dot-screen / edge / glyph-cell ops — all straightforward vectorized numpy (Sobel via `cv2.Sobel`, Bayer via a tiled 4×4 threshold matrix, halftone via a rotated sin grid, ascii via a 5×5 glyph-bit lookup, toner via seeded noise + threshold).
- The 3D construction + spin is **software-rasterized**: construction emits 3D primitives (extruded contour slices / voxel cubes / point cloud / stacked planes), a rotation matrix applies the angle-dependent spin, perspective projection maps to 2D, and `cv2.fillConvexPoly` / point splatting rasterizes with z-depth shading for the MeshStandard look.

Cost booked: no GPU acceleration (acceptable — export is already a background job, and per-frame cost is bounded by primitive count which we cap), and the software rasterizer approximates three.js `ExtrudeGeometry` bevels rather than reproducing them exactly. The tuned constants (extrude depth 16u, voxel step 7px, spin 0.00055 rad/ms, edge accel 1.15, tempo curve `140 − 70t² − 25t⁸`, feed `0.30 + 0.18g`) are ported verbatim from the prototype.

## Consequences

- One new file `backend/src/effects/fx/extrude_spin.py` + registry wiring (`registry.py` explicit-import, per `docs/solutions/2026-05-14-effect-registry-explicit-import.md`).
- Works in preview and export identically, deterministic per (seed, frame_index), no new runtime dependency, CI stays green on non-GPU runners.
- v1 limitation (documented in-effect): the full accumulated generation-loss feedback requires sequential playback (state threading). A random-access / scrubbed frame (`state_in is None`) starts the feedback chain fresh — same behavior class as other temporal effects. Determinism per (seed, frame_index, state_in) still holds.
- v2 candidates unchanged (tubes, SDF raymarch, geometry-level voxel degradation, per-frame video re-tracing) and would only strengthen the case for keeping this server-side.
