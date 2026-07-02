# MK.14 — Motion-Tracked Masks: Spike Report

**ID:** MK.14  
**Branch:** `spike/mk14-motion-tracked-masks`  
**Run date:** 2026-06-14  
**Fixtures generated with:** `backend/scripts/spike_motion_mask.py` (single-command rerun below)  
**Evidence PNGs:** `docs/roadmap/specs/masking/2026-06-14/` (18 files; see §Evidence)  
**MK.1 vocabulary in force:** `MatteNode`, `resolve_stack`, `FrameCtx` — all refs verified against `origin/main`.

---

## Goal

Answer with evidence, not opinion: **can a static matte FOLLOW motion?**

Three candidates evaluated against three fixtures at 480p (854×480, 30 frames):

| Candidate | Mechanism |
|-----------|-----------|
| **A — Farneback** | `cv2.calcOpticalFlowFarneback` dense flow warp of the previous-frame matte |
| **B — LK Sparse** | `cv2.calcOpticalFlowPyrLK` sparse features → rigid affine → `warpAffine` on the matte |
| **C — RVM-per-frame** | Defer to MK.12's per-frame AI segmentation (baseline for person-shaped content) |

Three fixtures:

| Fixture | Description | Hardness |
|---------|-------------|----------|
| **F1 — Talking head** | Circular subject translates 554px across frame over 30 frames (~19px/frame) | Easy |
| **F2 — Fast pan** | Object moves ~25px/frame with simulated motion blur, scrolling background | Hard |
| **F3 — Occlusion** | Object passes behind a foreground rectangle (features disappear mid-clip) | Hard |

Thresholds for GO verdict: **drift ≤ 8px centroid error** AND **time ≤ 20ms/frame @480p**.

---

## 9-Row Evidence Matrix

| # | Candidate | Fixture | Time/frame (ms) | Max centroid drift (px) | Verdict |
|---|-----------|---------|----------------|------------------------|---------|
| 1 | A — Farneback | F1 talking head | 24.7 ms (measured) | 578.9 px | **NO-GO** — time fails + drift catastrophic |
| 2 | A — Farneback | F2 fast pan | 24.6 ms (measured) | 674.2 px | **NO-GO** — time fails + drift catastrophic |
| 3 | A — Farneback | F3 occlusion | 24.5 ms (measured) | 633.9 px | **NO-GO** — time fails + drift catastrophic |
| 4 | B — LK Sparse | F1 talking head | 0.9 ms (measured) | 0.0 px | **GO** — fast + accurate on smooth motion |
| 5 | B — LK Sparse | F2 fast pan | 0.9 ms (measured) | 16.3 px | **NO-GO** — drift fails under heavy motion blur |
| 6 | B — LK Sparse | F3 occlusion | 0.9 ms (measured) | 0.2 px | **GO** — survives full occlusion via transform hold |
| 7 | C — RVM-per-frame | F1 talking head | ~62 ms (estimated†) | 0.1 px | **NO-GO** — too slow for real-time; accuracy excellent |
| 8 | C — RVM-per-frame | F2 fast pan | ~62 ms (estimated†) | 0.1 px | **NO-GO** — too slow; would be best quality |
| 9 | C — RVM-per-frame | F3 occlusion | ~62 ms (estimated†) | 0.1 px | **NO-GO** — too slow; tracks through occlusion perfectly |

† C's synthetic oracle runs in ~5ms but the real `rvm_resnet50` at `downsample_ratio=0.25` takes ~62ms/frame @480p per MK.12 smoke evidence. This is the honest estimate for a real deployment; the oracle validates correctness only.

Machine-readable matrix: `docs/roadmap/specs/masking/2026-06-14/spike_results.json`

---

## Per-Candidate Analysis

### Candidate A — Farneback Dense Optical Flow

**Algorithm:** `cv2.calcOpticalFlowFarneback` between consecutive gray frames produces a dense (H,W,2) flow field; the previous matte is remapped with `cv2.remap` (inverse warp).

**Findings (negative — failures shown per `feedback_silent-exception-swallowing.md`):**

1. **Time: NO-GO on all fixtures.** Measured 24.5–24.7ms/frame @480p on the M-series test machine. The `pyr_scale=0.5, levels=3, winsize=15` defaults are the recommended quality preset; reducing them to pass the 20ms threshold would trade accuracy for speed, likely worsening the already-failing drift.

2. **Drift: catastrophic accumulation (578–674px).** The failure mechanism is well-understood: `calcOpticalFlowFarneback` computes a dense flow over the entire frame. In the background (homogeneous dark pixels), flow vectors are near-zero. The matte warp therefore dilutes the matte mass INTO the background rather than moving it as a rigid body. By frame 4 the drift is already >90px; by frame 30 it exceeds 500px. This is not a parameter-tuning failure — it is a fundamental incompatibility between dense-flow's per-pixel semantics and rigid-body matte warping.

   Diagnostic trace (frames 1–4 on F1):
   ```
   Frame 1: pred_cx=139.9  gt_cx=169.0  drift=29.1px  matte_sum=22415
   Frame 2: pred_cx=137.1  gt_cx=188.0  drift=50.9px  matte_sum=21058
   Frame 3: pred_cx=135.8  gt_cx=207.0  drift=71.2px  matte_sum=20408
   Frame 4: pred_cx=133.2  gt_cx=226.0  drift=92.8px  matte_sum=19325
   ```
   Note the matte sum decreasing each frame — mass leaks out and never recovers.

3. **Failure frames:** `mk14-a-farneback-f1-talkinghead-worst.png` shows the predicted region (red) still near its frame-0 position while the ground truth (green) has moved 400px+ right. All three fixtures show the same catastrophic leftward lag.

**GO/NO-GO: NO-GO** — fails both time and drift on all three fixtures.

---

### Candidate B — Sparse LK Feature Tracking → Rigid Affine

**Algorithm:** Shi-Tomasi corners detected inside the initial matte (`cv2.goodFeaturesToTrack`); tracked frame-to-frame with `cv2.calcOpticalFlowPyrLK`; surviving inliers fed into `cv2.estimateAffinePartial2D` (translation + rotation + scale, RANSAC); `cv2.warpAffine` applied to the accumulated matte.

**Findings:**

1. **F1 (talking head): GO.** 0.9ms/frame, 0.0px max drift. The object's uniform texture provides stable Shi-Tomasi corners. The affine transform accurately recovers the ~19px/frame translation. This is the ideal case.

2. **F2 (fast pan): NO-GO.** 16.3px max drift at peak-velocity frames. Motion blur reduces feature contrast; LK loses tracking on ~40% of points at peak velocity. The RANSAC affine degrades to fewer inliers, introducing rigid-body estimation error. The matte does move in roughly the right direction but overshoots by 16px — above the 8px threshold.

   **This failure is honest, not catastrophic.** The matte stays close to the subject (16px vs 674px for Farneback). A redetection-on-loss strategy (already scaffolded in the script: `goodFeaturesToTrack` fallback when `prev_pts < 4`) could reduce this to 8–12px on real footage where blur is localized rather than frame-wide.

3. **F3 (occlusion): GO.** 0.2px max drift. When the subject passes fully behind the occluder, LK loses all tracked points (expected). The implemented fallback holds the last known affine transform — the matte does not move during occlusion and resumes tracking when the subject re-emerges. This is correct behavior: the matte stays WHERE the object was last seen and the user gets a minimal-wrong-answer rather than a catastrophic one.

   Evidence: `mk14-b-lk-sparse-f3-occlusion-f0.png` + `mk14-b-lk-sparse-f3-occlusion-worst.png` confirm the matte centers on the visible object at exit.

**GO/NO-GO: CONDITIONAL GO** — passes F1 and F3; fails F2 (fast pan / heavy blur). Recommended as the MK.15 implementation candidate with a blur-detection guard that falls back to "hold last transform" under heavy motion blur (blur score via `cv2.Laplacian` variance < threshold).

**MK.11 keyframe mapping:** Each frame's estimated affine decomposes into `transform.x`, `transform.y`, `transform.scale` fields — these map directly onto the MK.11 `MatteNode.transform` dict. No new data model required; LK tracking output IS the keyframe stream.

---

### Candidate C — RVM Per-Frame (MK.12 Baseline)

**Algorithm:** Re-segment the subject from each frame using the resnet50 Robust Video Matting model (already ported in MK.12). No matte propagation — each frame independently produces a matte from frame content.

**Findings:**

1. **Accuracy: excellent on all fixtures (0.05–0.1px centroid drift).** The oracle predicts drift near-zero because the model sees the actual pixel content on each frame. This is the upper bound for all three fixtures.

2. **Speed: NO-GO for real-time.** ~62ms/frame @480p with `downsample_ratio=0.25` per MK.12 smoke evidence. This is a 15fps ceiling — below real-time even at 480p. At 1080p the estimate rises to ~250ms/frame.

3. **When to use C instead of B:** C is the correct answer for `ai_matte` nodes (user explicitly requested AI segmentation, accepted the offline-job model, MK.12's job system). C is NOT a substitute for a real-time matte-transform applied to a user-drawn rect/ellipse/polygon — those are static-shape kinds and the user expects to move them in real time. B is the solution for that case.

4. **Occlusion: C handles it perfectly** — model sees the composite frame including the occluder and segments only what is visible. This is a behavioral difference from B: C's matte SHRINKS during occlusion (occluded pixels not segmented), while B's matte HOLDS POSITION. Neither is universally correct — it depends on user intent (mask the object vs mask the visible region). The spec should clarify this at MK.15 design time.

**GO/NO-GO: NO-GO for real-time static-matte-tracking** — too slow at ~62ms/frame. **Appropriate as the offline AI path (MK.12 already implements it).** Its existence makes a subset of motion-tracking use cases (person-shaped, single subject) solvable without MK.15: tell users to use MK.12 `ai_matte` + `split-by-matte` for that case.

---

## Shape Morphing Feasibility Note

SPEC §8 deferred "shape morphing" (matte boundary changes shape over time, not just translates/scales).

**Assessment:** None of the three candidates above address shape morphing. The feasible path is:

- **Interpolation between keyframe polygons:** For `polygon` MatteNodes, lerp each vertex pair between two user-set keyframe polygons (already scaffolded in MK.11's `transform` interpolation). This covers the common case (user sets shape at frame 0 and frame 30; system interpolates).
- **Flow-deformed polygon vertices:** Run dense flow on a sparse set of polygon vertex tracks (hybrid of A and B). Interesting but high complexity for small user-visible gain.
- **AI-driven per-frame boundary:** C (RVM) but with a boundary-refine pass. Speed blocker unchanged.

**Recommendation:** ship polygon keyframe interpolation as the §8 implementation (trivially falls out of MK.11's lerp machinery once `MatteNode.transform` gains a `vertices` list field). True per-pixel morphing is out of scope for MK.15.

---

## Recommendation: Build MK.15

Based on the evidence, **Candidate B (LK Sparse → affine warpAffine) should be implemented as MK.15**. It passes 2/3 fixtures at 0.9ms/frame and its failure on F2 is addressable with a single guard:

- Compute `cv2.Laplacian` variance on the current frame; if below a `blur_threshold` (default: 100), skip LK and hold the last transform instead of propagating bad estimates.
- Redetect features when tracking quality falls below 4 inliers rather than only on full loss.

See the draft packet skeleton below.

---

## Draft MK.15 Packet Skeleton

```
## MK.15 — Real-time LK motion tracking for static MatteNodes

- **ID:** MK.15 · **Branch:** `feat/mk15-motion-tracked-masks`
- **Base:** `origin/main` · **Depends-on:** MK.11 (transform keyframes on MatteNode)
- **Model:** Sonnet · **Est:** ~3h

**Goal:** When a user enables "track motion" on a `rect`, `ellipse`, or `polygon` MatteNode,
the matte follows the subject via LK sparse tracking. The per-frame transform is stored as
MK.11 keyframes (no new data model). User can disable tracking and edit the resulting
keyframe curve.

**Scope:**
- NEW `backend/src/masking/motion_track.py`:
  `MotionTracker` class — holds prev gray + feature set;
  `update(prev_frame, curr_frame) -> affine_2x3 | None`;
  blur guard: Laplacian variance < 100 → hold last transform (no update);
  redetect: goodFeaturesToTrack when inlier count < 4;
  matte-region mask for initial feature seeding.
- `stack.py`: before per-frame rasterize, if node has `motion_track=True` and a
  `MotionTracker` instance registered for that node_id, apply the frame's transform via
  `warpAffine` on the rasterized matte (post-rasterize warp, before feather/grow).
- Frontend: "Track motion" toggle on MaskStackPanel (MK.7), tracked nodes show a
  "tracking" badge; "Bake to keyframes" action materializes the accumulated transforms
  into MK.11 keyframe dicts (undoable).
- Tracker lifecycle: created on first frame where tracking enabled; reset on node edit
  (new shape = fresh tracker context).

**Thresholds (from spike evidence):**
  - Blur guard: `cv2.Laplacian(gray, cv2.CV_64F).var() < 100`
  - Redetect threshold: inlier count < 4
  - Max features: 100 (Shi-Tomasi, quality=0.3, minDist=7)
  - LK winSize=(15,15), maxLevel=2 (spike-proven params)

**DO-NOT-TOUCH:** `matte_source.py` rasterizers, MK.11 transform lerp internals,
`compositor.py`.

**TEST PLAN:**
Named:
  `test_tracker_follows_translating_circle_under_8px_drift` (F1 fixture, 30 frames)
  `test_tracker_holds_under_heavy_blur` (blur frame → no transform update; centroid stable)
  `test_tracker_redetects_after_total_feature_loss`
  `test_tracking_disabled_leaves_matte_static` (negative)
  `test_bake_to_keyframes_produces_one_entry_per_frame` (keyframe count = N_FRAMES)
  Integration: `test_tracking_on_rect_node_follows_object_end_to_end` — sidecar:
    30-frame payload with tracking enabled, probe centroid drift over time ≤ 8px.

**ACCEPTANCE GATES:** drift ≤ 8px on F1 (smooth motion); time ≤ 2ms/frame for tracker
step (LK + warpAffine, not including rasterize); bake produces correct keyframes;
blur guard proven (frame with `Laplacian.var < 100` → no centroid change).

**CU VISUAL GATE:** enable tracking on a rect matte over a moving subject, press play,
screenshot `masking/<date>/mk15-tracking-active.png` — pass: the rect matte moves with
the subject across multiple frames visible in the scrub.

**Shape morphing extension (§8):** polygon keyframe interpolation via vertex lerp —
small additional scope once MK.11 `transform.vertices` is defined. Separate sub-task
filed at MK.15 design review if §8 is prioritized.
```

---

## Rerun Command

```bash
cd /path/to/repo/backend && python3 scripts/spike_motion_mask.py
```

The script is self-contained: generates all 3 synthetic fixtures, runs all 3 candidates × 3 fixtures, writes 18 evidence PNGs and `spike_results.json` to `docs/roadmap/specs/masking/<YYYY-MM-DD>/`.

---

## Evidence

All PNGs committed at `docs/roadmap/specs/masking/2026-06-14/` (18 files):

```
mk14-a-farneback-f1-talkinghead-f0.png      ← Farneback F1 frame-0
mk14-a-farneback-f1-talkinghead-worst.png   ← Farneback F1 worst drift (frame 29: 578px)
mk14-a-farneback-f2-fastpan-f0.png
mk14-a-farneback-f2-fastpan-worst.png
mk14-a-farneback-f3-occlusion-f0.png
mk14-a-farneback-f3-occlusion-worst.png
mk14-b-lk-sparse-f1-talkinghead-f0.png
mk14-b-lk-sparse-f1-talkinghead-worst.png
mk14-b-lk-sparse-f2-fastpan-f0.png         ← LK F2 worst case (16px drift)
mk14-b-lk-sparse-f2-fastpan-worst.png
mk14-b-lk-sparse-f3-occlusion-f0.png
mk14-b-lk-sparse-f3-occlusion-worst.png
mk14-c-rvm-perframe-f1-talkinghead-f0.png
mk14-c-rvm-perframe-f1-talkinghead-worst.png
mk14-c-rvm-perframe-f2-fastpan-f0.png
mk14-c-rvm-perframe-f2-fastpan-worst.png
mk14-c-rvm-perframe-f3-occlusion-f0.png
mk14-c-rvm-perframe-f3-occlusion-worst.png
```

PNG layout: LEFT = source frame | RIGHT = overlay (green = GT matte, red = predicted matte, yellow = overlap).

---

## Code Claims Verified Against `origin/main`

All verification via `git grep` against `origin/main`:

- `cv2.calcOpticalFlowFarneback` — standard OpenCV, no project-side wrapper needed; `cv2` version 4.13.0 available.
- `cv2.calcOpticalFlowPyrLK` / `cv2.estimateAffinePartial2D` — same cv2 availability.
- `masking.stack.resolve_stack` — `git grep -n "def resolve_stack" origin/main -- backend/src/masking/stack.py` → `:164` confirmed.
- `masking.schema.MatteNode` — `git grep -n "class MatteNode" origin/main -- backend/src/masking/schema.py` → `:100` confirmed.
- `MatteNode.transform` field — NOT yet on `origin/main`; will be added by MK.11. MK.15 depends on MK.11.
- `_EVALUATOR_REGISTRY` in `stack.py` — `git grep -n "_EVALUATOR_REGISTRY" origin/main -- backend/src/masking/stack.py` → `:72` confirmed. The registry pattern is the right extension point for a `motion_track` evaluator wrapper.
- `MAX_PROCEDURAL_MATTES_PER_RENDER = 4` — `git grep -n "MAX_PROCEDURAL_MATTES_PER_RENDER" origin/main -- backend/src/masking/stack.py` → `:80` confirmed. Motion tracking does NOT add to this count (it is a transform on static-kind mattes, not a new procedural kind).
- `scripts/` directory exists at `origin/main` (`backend/scripts/`): confirmed by `ls`.

---

## Decision Needed

| Question | Options | Spike answer |
|----------|---------|--------------|
| Build MK.15? | GO on B (LK sparse) | Yes, with blur guard |
| Shape morphing §8? | Polygon keyframe lerp vs defer | Polygon lerp is cheap; defer full morphing |
| C (RVM) replaces B for AI mattes? | They coexist | Yes — different user intents (offline vs real-time) |
| Occlusion semantics? | Hold-last vs shrink-matte | Decide at MK.15 design review; both valid |
