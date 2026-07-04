# Change — util-transform

> Source spec: `~/.claude/plans/creatrix-transform-suite-spec.md` (STATUS: DRAFT 2026-07-03).
> Expands routing-PRD decision **29** (`creatrix-layertap-routing-prd.md:243-250`).
> Scope for THIS change, per orchestrator instruction: **`util.transform` affine device
> (v1) only** — `util.corner_pin` (perspective) and `util.mesh_warp` (grid warp) are
> separate devices in the same source spec and are explicit non-goals here.

## Open Decisions

> Real tensions surfaced by code-grounding. None are silently resolved. Each has a
> recommended default; the packet executor proceeds on the default unless the user
> overrides before packetize.

### OD-1 · Edge-policy vocabulary alias (constant/extend/tile/mirror ↔ clamp/wrap/mirror/black)
- **The collision:** decision 29 and the source spec specify `util.transform`'s
  `edge_policy` vocabulary as `constant (transparent/black/white/custom) · extend ·
  tile · mirror`. The **existing, shipped** vocabulary for the same concept — used by
  `boundary_mode`/`boundary` params across the Displace/field-warp family — is
  `clamp · wrap · mirror · black`, verified at `backend/src/effects/shared/displacement.py:16`
  (`remap_frame(..., boundary: str)`) and its ~13 callers (`fx/entropy_domain_warp.py:116`,
  `fx/pixel_bubbles.py:92`, `fx/pixel_flow_field.py:102`, `fx/pixel_melt.py:52`,
  `fx/edge_pixel_wind.py:82`, `fx/pixel_print_emulation.py:214`, `fx/pixel_superfluid.py:75`,
  and others sharing the same 4-option enum). **Note:** the task brief cites "UNIFICATION
  #88" for this collision; that exact finding number does not appear verbatim in
  `docs/plans/2026-07-field-mapping/UNIFICATION-2026-07-03.md` as read (checked; absent).
  The collision itself is independently re-verified directly against the code above, so
  the reconciliation below stands on that evidence regardless of the finding number.
- **Recommended default — alias table (`util.transform` vocabulary is the schema; Displace
  vocabulary is the internal/legacy synonym, not renamed):**

  | `util.transform` `edge_policy` | Displace-family `boundary_mode` equivalent | cv2 `warpAffine` `borderMode` |
  |---|---|---|
  | `constant` (+ level: transparent/black/white/custom) | `black` (fixed-black subset only — this schema's `constant` is a strict superset) | `cv2.BORDER_CONSTANT` + `borderValue` |
  | `extend` | `clamp` | `cv2.BORDER_REPLICATE` |
  | `tile` | `wrap` | `cv2.BORDER_WRAP` (risk — see below) |
  | `mirror` | `mirror` | `cv2.BORDER_REFLECT_101` |

  Do **not** rename the Displace family's existing `clamp/wrap/mirror/black` params —
  those are shipped, tested effects outside this change's scope. The alias is a naming
  reconciliation for humans/docs, not a code migration.
- **`tile` risk:** OpenCV's `BORDER_WRAP` is not fully/reliably supported by
  `warpAffine` in all builds (long-standing upstream inconsistency, not repo-specific).
  `backend/src/effects/shared/displacement.py:26-28` avoids the flag entirely for its
  own `wrap` case, computing wrapped coordinates manually (`raw_x % w`) before calling
  `cv2.remap`. **Default:** attempt `cv2.BORDER_WRAP` first inside the single
  `warpAffine` call (preserves the spec's "one warpAffine call, 0.81ms" perf claim);
  the packet's oracle (below) MUST include a `tile`-policy identity/pattern test that
  would catch silent misbehavior. If that test fails, fall back to computing the
  wrapped-coordinate grid manually and routing through `cv2.remap` **only for the
  `tile` case** (same pattern as `displacement.py`) — this is the only edge_policy
  value allowed to cost a second call.

### OD-2 · Gizmo: extend `BoundingBoxOverlay.tsx` in place vs. new component
- **Code-grounded fact:** "the clip transform gizmo" is
  `frontend/src/renderer/components/preview/BoundingBoxOverlay.tsx`, mounted once at
  `App.tsx:3913` and bound to the selected clip's `ClipTransform` (`x, y, scaleX,
  scaleY, rotation, anchorX, anchorY, flipH, flipV` — `shared/types.ts:192-202`).
  It implements move/scale(8 handles)/rotate drag modes (SVG z-order documented in its
  own header comment) but **has no skew handle and no Cmd-drag-for-skew mode** — those
  don't exist in the codebase in any form. Decision 29 / INDEX build-order item 3
  ("gizmo grammar the tap transform reuses") frames `util.transform` as the device that
  **builds** this grammar, not one that reuses a pre-existing skew-capable gizmo.
- **Recommended default:** extend `BoundingBoxOverlay.tsx` in place (add a `skew`
  drag-mode branch to the existing `DragMode` union, Cmd-modifier detection on
  edge-handle mousedown, Option-drag-from-center on the existing scale/rotate handlers)
  rather than forking a new component — this is what "the tap transform reuses" means
  literally (one component, two mount contexts: clip-transform binds `ClipTransform`,
  `util.transform` binds the effect's own param object via the same `onChange` shape).
  Mounting: `util.transform`'s gizmo instance is a **second, conditionally-rendered**
  `BoundingBoxOverlay` shown only when a `util.transform` device is the selected effect
  in the active chain — this mount wiring does not exist today (today's single mount
  is clip-transform-only) and is new plumbing in `App.tsx`.

### OD-3 · `DEPENDENT_PARAMS` sweep-skip registry — zero code presence
- **Code-grounded fact:** `DEPENDENT_PARAMS` is spec vocabulary only
  (`creatrix-backspin-afterimage-spec.md:6,21,51,98,132`) — grep across
  `backend/src` and `frontend/src` returns no hits. The calibration sweep that would
  need it (`backend/src/effects/_calibration.py:calibrate_all`, consumed by
  `backend/tests/test_effects/test_calibration.py`) sweeps every numeric param from
  `min` to `max` at a frame rendered with **all other params at default** — for
  `util.transform`'s `skew_x`/`skew_y` this is fine (skew from an otherwise-identity
  affine is visible at any level), but corner-pin-style "no-op at rest" params (not in
  this change's scope, but the same registry is needed by the sibling `fx-backspin`/
  `fx-afterimage` packets per the queue) would sweep against an identity frame and
  register a false "no visible effect" failure.
- **Recommended default:** `util.transform`'s v1 param set (x/y/scale_x/scale_y/
  rotation/anchor/skew_x/skew_y/edge_policy) has **no param that is a no-op at
  defaults relative to the others** — skew at any nonzero level is visible against
  the default identity frame, same for every other param. **No `DEPENDENT_PARAMS`
  entries are needed for this change.** Do not build the shared registry here; leave
  a one-line TODO comment at the calibration site so `fx-afterimage`/`fx-backspin`
  (which DO need it) build it when they land, per the queue's own ordering.

### OD-4 · Auto-simplify-on-record-stop: spec cites the wrong file
- **Code-grounded correction:** the source spec claims "VERIFIED: `utils/rdp-simplify.ts`
  already ships — AA.1 curved-segments used RDP re-fit" (line 94). This is **false as
  written**: `frontend/src/renderer/utils/rdp-simplify.ts` is used exclusively by the
  freehand-lasso mask tool (`MaskSelectOverlay.tsx`, `mk5-lasso.test.ts`,
  `mk13-mask-tool-ui.test.ts` — verified, no other importers). The actual
  curved-segment/automation RDP implementation is a **separate, independent** file:
  `frontend/src/renderer/utils/automation-simplify.ts` (`simplifyPoints`), consumed by
  the curve-segment lane UI (`components/automation/CurveSegment.tsx`,
  `AutomationNode.tsx`).
- **Recommended default:** when building §2.2's "auto-simplify on record-stop" for
  `util.transform`'s lanes, wire to `automation-simplify.ts`'s `simplifyPoints`, not
  `rdp-simplify.ts`. This is a documentation correction, not a design choice — no
  user input needed, but flagged because the source spec's citation is wrong and an
  implementer following it verbatim would import the wrong module.

## Why
Every existing deform effect in the 220-effect registry does per-pixel field warping
(`fx.domain_warp`, `fx.pixel_liquify` [a mode-variant of `fx.pixel_flow_field`, verified
at `registry.py:545` — not a standalone module], `fx.lens_distortion`, `fx.fisheye`,
`fx.pixel_timewarp`). None of them is a **geometric handle-based transform** — the
Photoshop free-transform gesture (drag a corner to scale, drag an edge to skew, rotate
from outside the box) that the user asked for ("warp skew all the things... respect
transparency"). `util.transform` fills that gap for the simplest case: whole-frame
affine (translate/scale/rotate/skew), one matrix, one `warpAffine` call. It is also the
**first build** of the shared edge-fill kernel that decision 29 says LayerTap's future
tap-transforms will reuse (LayerTap masking v1 itself, `layertap-matte-v1` in the
planning queue, is still unbuilt — `util.transform` is deliberately sequenced first
because it is "standalone, tiny" per `creatrix-routing-suite-INDEX.md:30`).

## What changes
1. **New backend effect `util.transform`** (`backend/src/effects/util/transform.py`),
   registered via the existing explicit-import pattern
   (`backend/src/effects/registry.py:185-191` import block, `:284-288`-style mods list
   — see plan.md for exact insertion points).
2. **Params (verbatim from source spec, v1 = affine only):** `x`, `y`, `scale_x`,
   `scale_y` (+ a linked-scale UI toggle, frontend-only — not a backend param), `rotation`,
   `anchor` (→ `anchor_x`/`anchor_y`, pixel offset from frame center, following the
   `ClipTransform.anchorX/anchorY` convention at `shared/types.ts:198-199`), `skew_x`,
   `skew_y` (±60°), `edge_policy` (see OD-1). One `cv2.warpAffine` call.
3. **RGBA travels together** (Rule 1 of the source spec, §0.1): the effect operates on
   all 4 channels through the same warp; alpha is never split out or dropped. On an
   alpha-less input frame, `constant: transparent` degrades to `constant: black` plus a
   one-time toast hint (existing toast-store rate-limiting applies —
   `stores/toast.ts`, per project `CLAUDE.md` Toast Conventions).
4. **Gizmo:** extend `BoundingBoxOverlay.tsx` with a skew drag-mode and the full
   Photoshop modifier grammar (decision 34/㊳, quoted verbatim below) — see OD-2 for the
   reuse-vs-fork resolution and new mount wiring.
5. **Modifier grammar — Photoshop-verbatim, banked, quoted from
   `creatrix-layertap-routing-prd.md:269-271` and `creatrix-transform-suite-spec.md:25-33`:**

   | modifier | effect |
   |---|---|
   | Shift-drag corner | proportional scale (aspect locked) |
   | Shift-drag rotate | snap to 15° increments |
   | Shift-drag move | constrain to dominant axis |
   | Option-drag | scale/skew from CENTER (anchor-mirrored) |
   | Cmd-drag edge | skew · **Cmd-drag corner = free distort** (corner_pin behavior inline — NOTE: free-distort math is corner_pin's homography, which is explicitly out of scope for v1 affine; see Non-Goals) |
   | double-click value/handle | reset that param (house convention) |

6. **Animation affordances (source spec §2, no new machinery required beyond what
   ships today):** every scalar param is an ordinary automation-lane target via the
   existing lane/operator/trigger stack; gesture recording uses the existing
   `recordPoint`/latch-touch path (verified real: `utils/transform-record.ts`,
   `utils/automation-record.ts`, `components/effects/ParamPanel.tsx`,
   `components/device-chain/DeviceCard.tsx` all call `recordPoint`). The "gesture
   group" collapsible lane-list treatment (≤8 touched scalars grouped visually) does
   **not** exist in code today (no `gestureGroup`/lane-collapse hits anywhere in
   `frontend/src/renderer/stores`) — `util.transform`'s ≤7 scalars (x/y/scale_x/
   scale_y/rotation/skew_x/skew_y) is the first consumer building it, per plan.md.
   Pose-morph (A/B poses + one `morph` scalar) reuses the `ABSwitch.tsx` A/B precedent
   (verified: `frontend/src/renderer/components/device-chain/ABSwitch.tsx`) but is a
   **v2 ergonomic win per the source spec (§2 item 4)** — not required for this
   change's v1 scope; note it as a deferred fast-follow, do not build it here.

## Non-Goals (explicit, per orchestrator instruction and the source spec's own device split)
- **`util.corner_pin`** (perspective, 4-point homography) — separate device in the
  source spec, separate future change.
- **`util.mesh_warp`** (N×M grid warp) — separate device, v2 per the source spec,
  separate future change. Its pose-keyframe recording model (>8 scalars) is explicitly
  a different mechanism from this change's gesture-group lanes and is not built here.
- **Painted liquify, noise warps, lens models** — `fx.pixel_liquify` (a mode-variant
  registration of `fx/pixel_flow_field.py`, see Why), `fx.domain_warp`/
  `fx.entropy_domain_warp`, `fx.lens_distortion`/`fx.fisheye` already exist and are
  untouched. The spec's note that `fx.pixel_liquify` "gains the shared edge_policy
  param as an upgrade" is **not part of this change's build** — it is context
  explaining why liquify isn't rebuilt, not a task here. If picked up later, note that
  `fx.pixel_liquify` is a registered *variant* of `pixel_flow_field.py`
  (`registry.py:545`), so editing its boundary vocabulary means editing the shared
  `pixel_flow_field.py` module and affects its sibling variants (`timewarp`, `vortex`)
  too — flag this precisely when that work is scoped.
- **Pose-morph A/B** (source spec §2 item 4) — deferred, see above.
- **DEPENDENT_PARAMS shared registry build-out** — see OD-3; not needed for this
  change's param set.

## Impact
- **New file:** `backend/src/effects/util/transform.py` (+ new shared edge-fill
  helper, location TBD per OD-1 — see plan.md file surface).
- **Modified:** `backend/src/effects/registry.py` (2 insertion points: import block,
  mods list), `frontend/src/renderer/components/preview/BoundingBoxOverlay.tsx`
  (new skew drag-mode + modifier grammar), `frontend/src/renderer/App.tsx` (second
  conditional gizmo mount).
- **New tests:** `backend/tests/test_effects/test_util/test_transform.py` (follows
  `test_util/test_levels.py` convention), gizmo state-machine unit tests (none exist
  today for `BoundingBoxOverlay` — new coverage, not a migration).
- **Risk:** MEDIUM. New backend effect is additive/low-risk (isolated module + 2-line
  registry insertion, calibration test is a build-time gate). The gizmo extension
  touches a shared, currently-working component (`BoundingBoxOverlay.tsx`) used by
  clip-transform today — regressions there affect an existing, shipped feature, so the
  gizmo work needs its own regression pass on clip-transform interactions, not just
  the new skew mode. See plan.md packet split.


## T1 Verdicts (LOCKED 2026-07-03, /marathon chunked T1 — do not re-open)
All Open Decisions above: **defaults ACCEPTED as written** (user: "Accept all 33 defaults"). Hotkey ODs additionally governed by the global verdict: menu-entry-only now, accelerator picked at build/UAT.
