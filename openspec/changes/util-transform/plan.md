# Plan — util-transform

> Companion to `proposal.md`. Read OD-1..OD-4 there first — this plan builds against
> their recommended defaults. All file:line citations verified by direct Read/Grep
> this session (2026-07-03).

## File surface (code-cited)

### Backend — new effect
- **NEW** `backend/src/effects/util/transform.py` — `EFFECT_ID = "util.transform"`,
  `EFFECT_CATEGORY = "util"` (follows `backend/src/effects/util/levels.py:1-9` naming
  convention exactly: `util.levels`/`EFFECT_CATEGORY = "util"`).
  - `PARAMS`: `x`, `y` (float, unit `"px"`), `scale_x`, `scale_y` (float, unit `""`,
    default 1.0), `rotation` (float, unit `"deg"` — precedent:
    `backend/src/effects/fx/chroma_key.py:26,36` uses `"unit": "deg"`), `anchor_x`,
    `anchor_y` (float, unit `"px"`, default 0.0 — pixel offset from frame center,
    mirrors `ClipTransform.anchorX/anchorY` at `frontend/src/shared/types.ts:198-199`),
    `skew_x`, `skew_y` (float, unit `"deg"`, range ±60 per source spec line 36),
    `edge_policy` (choice, `options: ["constant", "extend", "tile", "mirror"]`,
    default `"mirror"` — matches the BDD scenario's example value at
    `creatrix-moire-generator-bdd.md:361`), `edge_level` (choice or float, only
    meaningful when `edge_policy == "constant"`: transparent/black/white/custom —
    follow the existing choice-param pattern used by `boundary_mode` at
    `backend/src/effects/fx/entropy_domain_warp.py:114-118`).
  - **Every numeric param declares `curve` + `unit`** — hard requirement, enforced at
    CI by `backend/tests/test_effects/test_calibration.py::test_numeric_params_have_unit`
    and `::test_numeric_params_have_curve` (verified live tests, read in full).
  - `apply()` builds ONE 2×3 affine matrix (`cv2.getRotationMatrix2D` alone cannot
    express skew — the matrix must be composed: translate-to-origin →
    scale+skew(shear) → rotate → translate-to-anchor → translate by x/y, in that
    order per the source spec's "transform → edge fill" pipeline note, source spec
    line 106) and calls `cv2.warpAffine` exactly once, per OD-1's alias table for
    `borderMode`. RGBA passed through together (source spec §0 rule 1) — no channel
    split, mirroring the whole-frame call pattern at
    `backend/src/effects/fx/copy_machine.py:337-348` (`_optics()`, which already
    combines `cv2.getRotationMatrix2D` + manual translate offset + `warpAffine` with
    `BORDER_CONSTANT`/`borderValue` — closest existing precedent, but that function
    has no skew and no edge_policy choice, so it is a reference pattern, not reusable
    code).
  - **Alpha-less input degrade:** if `frame.shape[2] != 4`, force `edge_policy`
    effective behavior to `constant`/black and emit a one-time toast via the existing
    toast store conventions (`stores/toast.ts` — rate-limited by `source`, per project
    `CLAUDE.md`); this is UI-adjacent, so the backend emits a structured warning field
    the frontend's IPC error/toast path already surfaces (verify exact plumbing at
    implementation time — no existing effect currently emits a param-warning field;
    if none exists, the minimal fallback is: log via existing sidecar logger and skip
    the toast, since inventing a new IPC channel is out of scope for this change).
- **NEW (OD-1 dependent)** `edge_policy` border-mapping helper. Location choice per
  OD-1's default: keep it a **private function inside `transform.py`** for v1
  (`_edge_policy_to_cv2(policy: str) -> tuple[int, tuple]`), NOT a new shared module —
  decision 29's "one edge-fill kernel shared by tap transforms and util.transform" is
  a **future-state target**, not a today-reuse, because LayerTap's tap-transform code
  does not exist yet (`layertap-matte-v1` is still `⬜` in
  `openspec/PLANNING-QUEUE.md`). Extracting a shared module now, before a second
  caller exists, would be speculative generality; when `layertap-matte-v1` is built,
  it imports `_edge_policy_to_cv2` from here (rename to public at that point) — note
  this explicitly as the extraction trigger so it isn't lost.
- **MODIFIED** `backend/src/effects/registry.py`:
  - Insertion point 1 — `effects.util` import block, `:185-191`:
    ```python
    from effects.util import (
        levels,
        curves,
        hsl_adjust,
        color_balance,
        auto_levels,
        transform,   # NEW
    )
    ```
  - Insertion point 2 — mods list, `:284-288` (same block the util imports feed):
    add `transform,` alongside `auto_levels,` at `:288`.
  - No other registry changes — `register()` at `registry.py:38` auto-validates the
    reserved `_`-prefix rule (`:22-34`); `util.transform`'s param names (`x`, `y`,
    `scale_x`, ... `edge_policy`) don't collide with `KNOWN_SYNTHETIC_KEYS =
    {"_mix", "_mask"}`.

### Frontend — gizmo extension
- **MODIFIED** `frontend/src/renderer/components/preview/BoundingBoxOverlay.tsx`:
  - `DragMode` union (`:26` — `'move' | 'scale-tl' | ... | 'rotate' | null`) gains
    `'skew-t' | 'skew-b' | 'skew-l' | 'skew-r'` (Cmd-drag on an edge handle).
  - Modifier detection: existing pointer-event handlers (drag-start on each handle)
    gain `e.metaKey`/`e.ctrlKey` (per-platform Cmd) branching to switch a plain
    edge-drag into skew mode. `e.shiftKey` branching for axis-constrained move,
    aspect-locked corner scale, and 15°-snap rotate ALREADY EXISTS today
    (verified: lines 76-77, 91, 123 of the current file) — PK.3 must not
    re-implement these three rows, only add regression coverage for them. Only
    Option-drag-from-center, Cmd/Ctrl-drag-edge skew, and double-click-to-reset
    are new (verified: no `altKey`, `onDoubleClick`, or `dblclick` hits in the
    file).
  - Double-click-to-reset: verify whether any existing double-click handler exists on
    handles (grep found none in this component) — new handler, resets that field to
    its default (component prop, not a hardcoded identity, since `util.transform`'s
    defaults differ from `ClipTransform`'s identity).
  - Props: the component is generic over `ClipTransform` shape today (`transform:
    ClipTransform`, `:29`). `util.transform`'s param object is NOT a `ClipTransform`
    (different field names: `scale_x` vs `scaleX`, plus `skew_x`/`skew_y` which
    `ClipTransform` has no slot for). **Decision:** either (a) widen the prop type to
    a shared `AffineTransformLike` interface both `ClipTransform` and
    `util.transform`'s param shape satisfy via an adapter at each call site, or
    (b) keep `BoundingBoxOverlay` bound to `ClipTransform` and adapt `util.transform`'s
    params to/from a throwaway `ClipTransform`-shaped object at the mount site (lossy:
    no skew slot). **Recommended:** (a) — add `skewX`/`skewY` as optional fields to a
    new shared interface, keep `ClipTransform` a strict subtype (skew undefined for
    clip transforms, which never show skew handles). This is new type surface, not
    covered by any existing decision — flag to the user if they want it named
    differently before the packet lands.
- **MODIFIED** `frontend/src/renderer/App.tsx`: second conditional `BoundingBoxOverlay`
  mount (today: one unconditional mount at `:3913` bound to the selected clip). New
  mount renders only when `useProjectStore.getState().selectedEffectId` resolves to a
  `util.transform` device in the active chain (selector pattern: reuse
  `getActiveEffectChain()` — verified to exist per `openspec/changes/
  01-per-track-chain-model/proposal.md:19`, confirm still present at implementation
  time since that epic may have landed/renamed it).
- **NEW** `frontend/src/renderer/utils/affine-gesture-group.ts` (or co-located in
  `transform-record.ts` — implementer's call): the "gesture group" collapsible
  lane-list treatment for ≤8 touched scalars (source spec §2.1). Verified **zero**
  existing code for lane grouping/collapse (`grep -rn "gestureGroup\|laneGroup" —
  no hits`), so this is new UI + store state, not a reuse. Scope strictly to grouping
  the 7 `util.transform` scalars (`x, y, scale_x, scale_y, rotation, skew_x, skew_y`)
  recorded in one gesture; do not attempt the general N-effect lane-grouping system.
- **Auto-simplify wiring (OD-4):** call `simplifyPoints` from
  `frontend/src/renderer/utils/automation-simplify.ts` (NOT `rdp-simplify.ts` — see
  OD-4) on record-stop for `util.transform`'s lanes, default ON with a tolerance
  preference (new preference key, follow existing preference-store pattern — locate
  at implementation time, not grepped here as out of this plan's critical path).

## Packet candidates

| # | Name | Files | Risk | Oracle |
|---|---|---|---|---|
| P1 | **backend effect + registry wiring** | `backend/src/effects/util/transform.py` (new), `backend/src/effects/registry.py` (2 insertions) | LOW | `cd backend && python -m pytest tests/test_effects/test_util/test_transform.py tests/test_effects/test_calibration.py -x --tb=short` — new test file follows `test_util/test_levels.py` convention (`pytestmark = pytest.mark.smoke`); calibration test is the CI gate that would otherwise fail silently on a missing `curve`/`unit`. Additional oracle: identity-at-defaults byte-parity (`np.testing.assert_array_equal` at all-default params, per source spec §4 "Identity-at-defaults byte-parity per device") and the BDD scenario verbatim from `creatrix-moire-generator-bdd.md:359-367` as a scripted test (x=300, scale=0.7, edge_policy=mirror → pixels moved+mirrored, alpha travels). |
| P2 | **edge_policy exactness + `tile` risk resolution** | same `transform.py` file (extends P1's helper) | MED | Per-policy exact-output test for all 4 `edge_policy` values against golden/expected arrays (source spec §4: "each edge_policy exact"), PLUS the OD-1 `tile`-specific probe: render a small test pattern with `edge_policy=tile`, assert the vacated area shows the wrapped-source pixels (not black/replicated) — this is the test that decides whether OD-1's `BORDER_WRAP`-first strategy holds or the manual-`remap` fallback (mirroring `displacement.py:26-28`) is needed. Ship whichever passes; document the outcome in this file's OD-1 section as a follow-up note (not required to re-run this plan). |
| P3 | **gizmo skew extension + modifier grammar** | `frontend/src/renderer/components/preview/BoundingBoxOverlay.tsx`, shared transform-type interface (new or extended in `shared/types.ts`) | MED-HIGH | Vitest component tests: (a) existing clip-transform interactions still pass — **regression suite first**, since this is a shared, shipped component (no existing dedicated test file for `BoundingBoxOverlay` was found — new test file `frontend/src/__tests__/components/preview/bounding-box-overlay.test.tsx` must cover the PRE-EXISTING move/scale/rotate modes before adding skew coverage, so a regression is caught even though none existed before); (b) new skew drag-mode + all 6 modifier-grammar rows from the table in proposal.md, one test per row; (c) double-click reset. Run: `cd frontend && npx --no vitest run src/__tests__/components/preview/bounding-box-overlay.test.tsx`. |
| P4 | **App.tsx second gizmo mount + chain-selection wiring** | `frontend/src/renderer/App.tsx` | MED | Vitest: selecting a `util.transform` device in the chain renders the second gizmo bound to its params (not the clip's); deselecting/selecting a non-transform effect unmounts it (Wiring-Check entry/exit path per house convention). Manual verification note: this packet is UI-integration-shaped: recommend a live-runtime check per house Gate 18 before declaring done (out of scope for THIS planning session — flag for the build session). |
| P5 | **gesture-group lane recording + auto-simplify wiring** | new `affine-gesture-group.ts` (or extension of `transform-record.ts`), `automation-simplify.ts` call site | MED | Vitest: recording a gesture touching N≤7 scalars produces one visually-grouped set of lanes (assert on the grouping data structure, not pixels); auto-simplify-on-stop reduces point count using `simplifyPoints` (assert reduced point count within tolerance, per source spec §2.2). This packet is the one place OD-3/OD-4's corrections matter operationally — implementer must import `automation-simplify.ts`, not `rdp-simplify.ts`. |

**Suggested order:** P1 → P2 (same file, sequential) → P3 (independent, can run parallel
to P1/P2) → P4 (depends on P3's extended prop type) → P5 (depends on P1's params
existing as lane targets + P4's mount for gesture recording context). Cross-reference
`openspec/PLANNING-QUEUE.md`'s single-flight note: this change's `registry.py` edit is
additive-only (2 insertion points, no reordering of existing imports) so it does not
collide with the Wave-0 lane's `modulation/routing.py` work (different file).

## Test Plan

### Backend (pytest, `backend/tests/test_effects/test_util/test_transform.py`)
- `pytestmark = pytest.mark.smoke` (follows `test_util/test_levels.py:7` convention —
  no I/O, no ZMQ, no filesystem).
- `test_identity_defaults_unchanged` — all-default params → `np.testing.assert_array_equal`
  (source spec §4 "Identity-at-defaults byte-parity per device").
- `test_alpha_travels` — RGBA input with non-uniform alpha channel, non-identity
  transform → assert alpha channel is warped identically to RGB (moved/scaled/rotated
  together), never dropped or defaulted to opaque.
- `test_edge_policy_constant_transparent` / `_black` / `_white` / `_custom` — vacated
  area matches the selected level exactly (source spec §4 "each edge_policy exact").
- `test_edge_policy_extend`, `test_edge_policy_tile`, `test_edge_policy_mirror` — same,
  per OD-1's alias table; `test_edge_policy_tile` is the OD-1 `BORDER_WRAP` probe (P2).
- `test_skew_against_golden_matrix` — construct the expected 2×3 matrix by hand for a
  known `(skew_x, skew_y, rotation, scale)` combination, assert `transform.py`'s
  internal matrix construction matches within float tolerance (source spec §4 "skew/
  perspective against golden matrices" — perspective n/a here, skew only).
- `test_determinism` — same params + same frame twice → byte-identical output (source
  spec §4 "determinism").
- `test_bdd_scenario_edge_kernel` — scripted version of
  `creatrix-moire-generator-bdd.md:359-367` (x=300, scale=0.7, edge_policy=mirror).
- Calibration (existing suite, no new file): `test_numeric_params_have_unit`,
  `test_numeric_params_have_curve`, `test_effect_at_defaults[util.transform]` (the
  parametrized boundary sweep at `test_calibration.py` auto-picks up the new
  registry entry — no test-file edit needed, verified by reading
  `_all_effect_ids()`'s implementation, which calls `list_all()`).

### Frontend component (Vitest, mock IPC per house Gate 5)
- `bounding-box-overlay.test.tsx` (new file, P3): pre-existing move/scale/rotate
  regression coverage FIRST, then skew drag-mode, then all 6 modifier-grammar rows,
  then double-click reset. Mock `onChange` callback, assert call arguments per drag
  simulation (React Testing Library `fireEvent.mouseDown/mouseMove/mouseUp` on the SVG
  handle elements, following whatever pattern `transform-coords.test.ts` /
  `transform-record.test.ts` already establish for coordinate-math assertions —
  read those two files at implementation time for the house's coordinate-simulation
  idiom before writing new drag-simulation code).
- Gesture-group + auto-simplify unit tests (P5): pure logic, no DOM — Vitest unit
  tests against the new grouping data structure and the `simplifyPoints` call site,
  no mock IPC needed (matches house Gate 5's "logic/validation → Vitest unit test"
  tier).
- App.tsx mount-wiring test (P4): component test with mock IPC/mock stores, asserting
  the Wiring-Check entry/exit criteria (mount on select, unmount on deselect/reselect
  a different effect type).

### Backend/frontend integration surface not covered by this plan
- No E2E (Playwright `_electron`) test is proposed for this change — the source
  spec's oracle list (§4) is entirely backend-numeric + frontend-component-shaped;
  nothing here is "process lifecycle/OS integration" per house Gate 5's layer-selection
  rule, so a Playwright layer would be over-testing. If the build session's Wiring
  Check (P4) surfaces a real cross-process concern (e.g., IPC round-trip for the new
  param schema), add a single E2E smoke test then — not planned here.

## Open items carried forward to the build session (not blocking packetize)
- OD-1's `tile`/`BORDER_WRAP` outcome (resolved empirically in P2, documented after
  the fact — not a pre-build decision).
- OD-2's shared-type naming for the widened `BoundingBoxOverlay` prop (`AffineTransformLike`
  is a placeholder name in this plan, not a banked decision).
- Toast/warning plumbing for the alpha-less-frame degrade note in the backend file
  surface section above — no existing effect emits a param-level warning field; the
  build session should confirm whether to invent one or accept log-only for v1.
