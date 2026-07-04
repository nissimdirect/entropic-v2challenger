# Proposal — layertap-matte-v1

## Status

PLANNING ONLY. No build follows from this change. Source specs:
`~/.claude/plans/creatrix-layertap-routing-prd.md` (PRD, §3/§9/§10) and
`~/.claude/plans/creatrix-moire-generator-bdd.md` Features 6–9 (BDD). Ground-truth
corrections applied from `docs/plans/2026-07-field-mapping/UNIFICATION-2026-07-03.md`
§2/§3.

## Why

Creatrix has per-clip mask stacks (8 static/procedural node kinds), per-effect mask
assignment (MK.3), and a modulation matrix — but **no way to route one layer's
rendered output into another layer's mask**. The copy_machine effect's hard-B/W
output is the motivating case: "a perfect matte generator with nowhere to route"
(PRD §1). The PRD's full LayerTap primitive is a 3-surface routing system (mask
node / field param / matrix source); this change scopes ONLY the first and
smallest of those three, per the PRD's own ship sequence:

> "1. v1 — MatteNodeKind 'layer' + tap chip core states + hover-audition (smallest
> slice; per-effect distribution free via MK.3)." (PRD §7)

## What (v1 scope)

1. **`MatteNodeKind: 'layer'`** — a 9th mask-stack node kind. One track's rendered
   frame, reduced by a `read` selector, becomes another clip's matte-stack node —
   composable with existing nodes via the standard add/subtract/intersect ops,
   feather, grow/shrink (MK.1 semantics, unchanged).
2. **Tap chip core states** in the mask-stack UI (`MaskStackPanel.tsx`): live
   thumbnail, stage dot, read tag, mini-strip popover (gain/gamma/invert), press-
   and-hold solo, red-dashed error state + toast on source deletion (PRD §4
   decision 3).
3. **Hover-audition**: a new "From layer…" track picker (PRD §4 decision 2) that
   previews the resulting matte on hover, before the node is committed.
4. **Per-effect distribution "for free"**: once a `'layer'` node exists in a clip's
   mask stack, `DeviceCard.tsx`'s existing mask-assignment dropdown (MK.3) already
   lists it with zero new code — verified in code (see plan.md §Code Ground Truth).

## Non-goals (explicitly out of v1 — later slices per PRD §7)

- `FieldKind: 'layer'` (live per-pixel param drive on effect params) — v1.5.
- Matrix source `'layer_tap'` operator (scalar reduce → modulation matrix) — v2.
- `paint` source, `colorkey` read, `ai_person` read — v2 per PRD §7 ship sequence
  (colorkey explicitly listed under "v2"); `ai_person`/`motion` additionally
  blocked by code reality (see Open Decision OD-3).
- Route inspector / on-canvas transform gizmo / edge-policy UI (PRD §4 decision 8)
  — the wire schema carries `transform`/`edge_policy` fields (§9.1, quoted
  verbatim in plan.md) but v1 ships them at identity/`"black"` defaults, not
  user-editable. UI lands with FieldKind in v1.5.
- Matte tracks, promote-to-matte-track, DAG cloud, W-overview, route stepper,
  frame-delayed feedback edges, System Monitor, browser taxonomy, backspin/
  afterimage — unrelated PRD/BDD sections, not touched by this change.
- Group bus taps (PRD §4 decision 14/"Group-bus implications") — no group
  handling in v1; a `'layer'` node's `track_id` pointing at a group is treated
  as an unknown-track degrade (flat 0.5), not a bus tap.
- Standalone dual-surface browser effects (person-key/color-key as `fx.*`
  effects) — PRD §4 decision 5's "dual-surface rule" is v2-adjacent, not needed
  for the mask-stack consumer alone.

## Open Decisions

Each carries a recommended default per HARD RULE #2 — none are silently resolved.

### OD-1 · `stage` scope for v1 — `pre` only, not `pre|post`
**Tension:** PRD §9.1's wire schema defaults `"stage": "post"` and §9.2 defines
`post` as "the source's frame AFTER `apply_chain` INCLUDING its chain_mask/mask
stack." Code reality (verified, see plan.md §Code Ground Truth #2): mask
resolution (`apply_masks_to_chain`) runs *before* any layer's device chain
executes (`zmq_server.py`'s per-layer collection loop, lines ~1641–1694), while
device-chain execution happens later, inside `render_composite`
(`compositor.py:384-423`) — a different function, different module, later in the
pipeline. Building `post` for v1 means running a tapped track's *entire*
`apply_chain` a second time ahead of schedule, or restructuring the compositor
into a real two-phase DAG — squarely the PRD's own v2 "DAG ownership" work
(§9.3), not "smallest slice."
**Recommended default:** v1 supports `stage: "pre"` only (the source's decoded +
clip-transformed frame, before its own device chain — data that already exists
earlier in the same per-layer loop). The picker/schema accept only `"pre"` in
v1; `"post"` is rejected at the frontend validator with a fallback to `"pre"`
(additive — the backend schema still parses `"post"` without crashing, per the
unknown-value degrade convention, but the v1 evaluator does not special-case
it — it always reads the pre-chain frame regardless of the stored value until
v1.5 implements the true post-chain path). Document this explicitly in the UI
(no stage picker in v1 — “pre” is implicit).

### OD-2 · Cross-layer frame availability — pre-pass over `render_composite`'s already-known `layers` list, order-independent
**Tension:** PRD §4 decision 10 banks "track reorder never changes output (render
order = DAG, not visual order — deliberate anti-AE-TrkMat)." A naive single-pass
implementation (resolve masks in the same sequential loop that decodes frames)
would make tap-source availability depend on which tracks were decoded earlier
in that pass — violating the banked invariant.
**Recommended default:** Because `_handle_render_composite`'s `raw_layers` (and
`export.py`'s equivalent) is a **fully materialized list known before any
decoding starts** (verified, see plan.md #3), v1 adds a cheap **pre-pass**: decode
+ transform (no device chain) every layer's frame into a
`pre_frames_by_track_id` dict *before* the existing per-layer loop runs, then
reuse those already-decoded frames in the main loop instead of re-decoding.
This makes `stage: "pre"` reads order-independent for all layers within a single
composite render, honoring decision 10 without a full DAG. A track absent from
the CURRENT render's `layers` list (nothing on it under the playhead, or the
single-clip `render_frame` fast path with no `layers` at all) degrades to the
existing "source gap → flat 0.5" rule (PRD §10.4) — not a new case.

### OD-3 · Read taxonomy for v1 — `luma · R · G · B · alpha` only
**Tension:** PRD §9.4 taxonomy includes `motion`/`edges`/`colorkey`/`ai_person`.
Code reality (verified, `backend/src/modulation/video_analyzer.py:66-164`): every
extractor (`analyze_luminance`, `analyze_motion`, `analyze_edges`) operates on a
64×64 **proxy** and returns a **scalar**, not a per-pixel field — there is no
"field resolution" version to reuse as §9.4 claims for `motion`/`edges`.
UNIFICATION §3 item 4 independently flags `motion` as blocked (real per-pixel
optical flow lives in Branch A's Farneback utility, not cross-referenced here).
`colorkey` is explicitly a PRD §7 "v2" item. `ai_person` needs the `ai_matte`
bake/cache path (`masking/ai_matte.py`) generalized from "this clip's own asset"
to "an arbitrary tapped track's asset" — real integration work, not v1-sized.
**Recommended default:** v1 ships `read ∈ {luma, R, G, B, alpha}` — each is a
direct per-pixel array op on the tapped frame (BT.601/709 weighted sum, channel
slice, alpha channel or 1.0-fallback per §10.4) requiring no new extraction
infrastructure. `motion`/`edges`/`colorkey`/`ai_person` are deferred; the read
dropdown in v1 UI only offers the five. The backend schema still accepts the
full §9.4 enum value set (additive, forward-compatible) but an unrecognized-for-
v1 read value falls back to `"luma"` + one-time log, per §9.1's existing
"unknown read → luma" trust-boundary rule (no new rule needed — this makes the
already-specified fallback carry the extra weight).

### OD-4 · Hover-audition data source — debounced fresh decode, not a continuous per-track cache
**Tension:** PRD §10.8 wants audition to render from "the tap's CACHED last field
at proxy res — hovering never triggers a fresh source-chain render." No such
cache exists today (verified — no per-track "last rendered frame" mechanism
exists outside an active composite/preview render; `render_frame`'s single-clip
fast path never touches non-active tracks at all). Building a continuous
background per-track frame cache (decode every track every tick, whether tapped
or not) is real, ongoing infra cost disproportionate to "smallest slice."
**Recommended default:** v1's hover-audition triggers one on-demand IPC call per
hover (debounced ~150ms) that decodes the candidate track's clip at the current
playhead frame, applies the selected read, downscales to thumbnail resolution,
and returns it — a single cheap decode, not a full chain render. This is an
explicit, documented deviation from §10.8's ideal; v1.5's FieldKind work (which
needs live per-pixel reads every frame regardless) is the natural point to build
the real continuous cache described in OD-2's pre-pass mechanism, and hover-
audition switches to reading it then.

### OD-5 · Self-tap (`track_id` == the consuming clip's own track)
**Tension:** Not addressed by the PRD's cycle-detection language (which targets
cross-track same-frame cycles via the DAG, a v2 mechanism). Under OD-1
(`pre`-only), a self-tap is well-defined (reading your own pre-chain frame while
computing your own mask is not circular — no infinite loop), but it is also
pointless (already achievable via `luma_key`/`chroma_key` procedural kinds on
the same clip) and confusing in the picker.
**Recommended default:** the "From layer…" picker excludes the clip's own track
from the candidate list in v1 (UI-level restriction only). A hand-edited project
file with `track_id` == own track still renders correctly (no crash, no special
case needed — OD-1 makes it a harmless no-op-shaped read) if one somehow exists.

### OD-6 · `MAX_PROCEDURAL_MATTES_PER_RENDER` budget — unchanged at 4
**Tension:** UNIFICATION §3 item 6 flags that the new kind "auto-counts against
MAX_PROCEDURAL_MATTES_PER_RENDER=4 (decide intent)" since `'layer'` is
automatically non-static (`masking/stack.py:74`'s `_STATIC_KINDS` frozenset does
not include it) and therefore already counted by the existing
`procedural_count` computation (`stack.py:193-199`) with **zero code change**.
The open question is only whether 4 is still the right shared cap once a
heavier-than-average kind (cross-track frame read + resize) joins the pool.
**Recommended default:** leave `MAX_PROCEDURAL_MATTES_PER_RENDER = 4` unchanged
for v1 (PRD §4 decision 14 defers exact budget recalibration to "perf plan Phase
4"; no measurement exists yet to justify a different number). Revisit once
Packet 2's perf oracle (plan.md) produces real per-tap timing.


## T1 Verdicts (LOCKED 2026-07-03 — SCOPE OVERRIDE, do not re-open)
- **OD-1 + OD-3 OVERRIDDEN by user: v1 ships the FULL §9 contract** — `stage: pre AND post` (mechanism = OD-2's track_id-keyed frame pre-pass over raw_layers, applied symmetrically in zmq_server.py composite + export.py; post = after apply_chain incl. mask stack per §9.2) and the FULL read taxonomy `luma|R|G|B|alpha|motion|edges|colorkey|ai_person` (§9.4 formulas verbatim; motion via tap_prev::<track>::<stage> half-res state; ai_person = ai_matte pathway verbatim incl. bake cache; colorkey = Δhue/softness 60°). Plan.md MUST be revised to this scope (~2-3× original estimate) before packetize.
- OD-2, OD-4, OD-5, OD-6: defaults ACCEPTED (pre-pass mechanism; debounced hover-audition deviation documented; self-tap UI-excluded/backend-graceful; cap=4 unchanged pending perf Phase 4).
