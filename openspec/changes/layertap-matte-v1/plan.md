# Plan — layertap-matte-v1

Companion to `proposal.md` (read first for WHY/WHAT/non-goals/Open Decisions
OD-1…OD-6). **T1 SCOPE OVERRIDE (locked 2026-07-03, see proposal.md "T1
Verdicts"):** OD-1 and OD-3's "smallest slice" defaults are OVERRIDDEN — v1
ships the FULL PRD §9 contract: `stage: pre AND post` (both meaningfully acted
on, not just accepted-and-ignored) and the FULL read taxonomy `luma | R | G | B
| alpha | motion | edges | colorkey | ai_person`. OD-2 (pre-pass over
`raw_layers`), OD-4 (debounced hover-audition), OD-5 (self-tap UI-excluded),
and OD-6 (budget cap = 4, unchanged) remain binding defaults as originally
written — this plan revision touches only the OD-1/OD-3-shaped sections below.
This is a ~2× file-surface / ~2× packet-count revision of the original
"pre-only, 5-read" plan; every citation below has been re-walked against the
current repo state as of this revision.

## Normative wire contracts (quoted verbatim from PRD §9 — do not re-derive)

### §9.1 Mask-stack node (consumer 1) — exact serialized form
```
{"id": "...", "kind": "layer", "params": {"track_id": "...", "stage": "post",
"read": "luma", "read_params": {}, "gain": 1.0, "gamma": 1.0, "invert": false,
"transform": {"x":0,"y":0,"scale_x":1,"scale_y":1,"rotation":0,"anchor_x":0,
"anchor_y":0}, "edge_policy": "black"}, "op": "add", "invert": false,
"feather": 0, "growShrink": 0, "enabled": true}
```
feather/grow/op/invert/enabled come from the NODE per MK.1 — the tap never
duplicates them. Per the T1 override, `stage` is now a REAL two-valued switch
(`"pre"` and `"post"` both drive distinct evaluator behavior — Packet 2 vs.
Packet 3); unknown/other stored values still degrade to `"pre"` (cheapest,
already-available data) rather than erroring. Per proposal.md non-goals,
`transform`/`edge_policy` are STILL carried at their schema defaults (identity
/ `"black"`) and not user-editable in v1 — no route-inspector gizmo ships; this
half of OD-1's original scope-narrowing is untouched by the T1 override, which
concerns `stage` semantics only, not the transform/edge-policy UI.

### §9.1 Trust boundaries (persistence validator, P6.6 pattern) — verbatim
> gain clamps to the existing FieldRef bounds (±4); gamma [0.2, 4]; unknown read
> → "luma" + one-time log; unknown kind → node dropped (existing behavior, BDD
> F2 malformed scenario); missing track_id → flat-0.5 rule. NO PROJECT_VERSION
> bump — purely additive (UE.7).

Per the T1 override, "unknown read" now means outside the FULL 9-value set
`{luma, R, G, B, alpha, motion, edges, colorkey, ai_person}` — the OD-3 5-value
narrowing no longer applies. gain/gamma/invert clamp and apply identically
AFTER any read (universal post-processing stage, unchanged from the original
plan — read type does not change how gain/gamma/invert are applied).

### §9.2 `stage` — binding definition (quoted; now IMPLEMENTED verbatim, not narrowed)
> **pre** = the source's decoded clip frame BEFORE its device chain.
> **post** = the source's frame AFTER `apply_chain` INCLUDING its chain_mask/mask
> stack — i.e. the track's finished contribution as it would enter the
> compositor.
> **v1 simplification (retained, NOT overridden by T1):** taps read the source
> in SOURCE pixel space — the source's own ClipTransform (canvas placement) is
> NOT applied to the tap; the tap's own `transform` is the tool for placement.
> This simplification applies identically to `pre` and `post` reads — `post`
> means "after this track's OWN device chain + mask stack," not "after this
> track's canvas transform."

### §9.4 Read formulas — pin the math (verbatim; v1 now implements ALL NINE per T1 override)
> `luma`/`R`/`G`/`B`/`edges` reuse the video-analyzer extractors at field
> resolution. [v1: luma/R/G/B are direct per-pixel ops — Packet 4. `edges` is a
> NEW field-resolution Sobel-shaped implementation — Packet 5; the existing
> `video_analyzer.py` extractor is scalar/proxy-only and is NOT reused as
> executable code, only as the gradient-formula reference — see code ground
> truth #13.]
> Alpha read on an alpha-less source = all-opaque → field 1.0 (defined, not
> error). [Packet 4.]
> `motion` = frame-to-frame delta against a persisted previous-frame tap state.
> [T1 override, verbatim requirement: keyed `tap_prev::<track_id>::<stage>`,
> half-resolution, seeded-deterministic, frame-0 (no prior state) → flat 0.5.
> Packet 5. This is genuinely NEW engine surface — no existing per-pixel motion
> field exists anywhere in the codebase, see code ground truth #13/#16.]
> `colorkey` = `1 − clamp(Δhue / softness, 0, 1)` where Δhue is the per-pixel
> circular hue distance to a target hue and softness defaults to **60°**. [T1
> override, verbatim formula. Packet 6 — reuses `key_kernels.py`'s existing
> `_hue_distance_deg` circular-distance primitive (code ground truth #17)
> rather than reimplementing hue math a second time.]
> `ai_person` = the `ai_matte` procedural-evaluator pathway, **verbatim,
> including the offline bake + content-addressed cache**, generalized from
> "this clip's own asset" to "an arbitrary tapped track's asset." [T1 override.
> Packet 7 — reuses `masking/ai_matte.py`'s reader cache / jail-check /
> flat-0.5-degrade code path unchanged; the NEW work is exclusively in
> triggering a bake against the SOURCE track's asset instead of the consuming
> clip's own asset (code ground truth #18).]

### §10.4 Resolution + alpha seams — verbatim
> **Resolution mismatch** (source ≠ dest): the tap field is resized to the
> CONSUMER's resolution at the consumer boundary (bilinear; contiguity mandate
> applies).
> **Alpha read on an alpha-less source** = all-opaque → field 1.0 (defined, not
> error).
> Per T1's `motion`/`edges` additions: a resolution mismatch on THESE reads is
> resolved by resizing the extracted FIELD (not the raw tapped frame) to the
> consumer's `(height, width)` at the same boundary — the half-res motion
> compute in Packet 5 is an internal precision/perf choice, invisible at this
> seam, which always resizes its OUTPUT to full consumer resolution before
> gain/gamma/invert are applied.

### §9.3 Fan-out — verbatim (binds Packet 2/3's cache design)
> Fan-out: tap buffers cached per (track_id, stage, frame_index) — computed
> once, shared by all consumers (perf harness asserts this).
> Per T1: this is now a REAL two-way key — `(track_id, "pre", frame_index)` and
> `(track_id, "post", frame_index)` are DISTINCT cache entries (a `'layer'` node
> can legitimately want either or both from the same source track in the same
> render); fan-out-once applies independently within each stage.

## Code ground truth (file:line citations backing every claim above and every packet below)

1. **9th-kind validator gap** — `backend/src/masking/schema.py:30-41` hardcodes
   `_VALID_KINDS` to the 8 existing kinds; `'layer'` is rejected there today
   (`MatteNode.from_dict` returns `None`, `schema.py:150-152`). Frontend mirror:
   `frontend/src/renderer/project-persistence.ts:156-159` (`VALID_MATTE_KINDS`)
   and the type union `frontend/src/shared/types.ts:231-239` (`MatteNodeKind`)
   have the same 8-kind list and need the identical additive 9th entry.
2. **Evaluator registry needs zero dispatch changes** — `backend/src/masking/
   stack.py:72` (`_EVALUATOR_REGISTRY: dict[str, EvaluatorFn] = {}`) and `:100-106`
   (`register_evaluator`) accept any kind string; `resolve_stack` (`:201-215`)
   looks up `_EVALUATOR_REGISTRY.get(node.kind)` generically — 3 procedural kinds
   already use this exact seam with zero `resolve_stack` edits. Confirmed:
   `'layer'` becomes a 4th registrant, no `stack.py` dispatch code changes.
3. **`'layer'` auto-counts against the procedural budget for free** —
   `stack.py:74` `_STATIC_KINDS = frozenset({"rect","ellipse","polygon",
   "bitmap"})` does not (and per OD-6, should not) include `'layer'`;
   `stack.py:193-199`'s `procedural_count = sum(1 for n in nodes if n.enabled and
   n.kind not in _STATIC_KINDS)` therefore already counts `'layer'` nodes with
   zero code change once it's a registered non-static kind. Unaffected by the
   T1 override (OD-6 not reopened): both a `pre` and a `post` tap node count as
   exactly one procedural matte each against the same cap of 4.
4. **Mask resolution happens BEFORE device-chain execution, in a different
   module — this is the CORE problem Packet 3 solves, not a reason to defer
   `post`** — single-clip path `backend/src/zmq_server.py:811-819` calls
   `apply_masks_to_chain` (from `masking/routing.py:256-311`), THEN
   `apply_chain` at `:834-843`. Composite path: the per-layer collection loop in
   `_handle_render_composite` (`zmq_server.py:1407-1710`) calls
   `apply_masks_to_chain` per layer at `:1688-1694` — still BEFORE any device
   chain runs. Device-chain execution for composite layers happens later,
   inside `engine/compositor.py::render_composite` (`:384-423`, the
   `apply_chain` call at `:411-419`) — a separate function in a separate
   module, invoked by the caller only AFTER all layers' masks are already
   resolved. Under the ORIGINAL (pre-only) plan this was a reason to defer
   `post` to v1.5. Under the T1 override, Packet 3 must instead give a tapped
   track's `post` frame an EARLY, out-of-band execution of exactly this
   `apply_chain` call (same call shape, same module) ahead of the main loop —
   see code ground truth #15/#16 for the state-consistency mechanics this
   requires.
5. **`raw_layers` is a fully materialized list before any decoding starts** —
   `zmq_server.py:1408` (`raw_layers = message.get("layers", [])`) then
   `zmq_server.py:1458` (`for layer_info in raw_layers:`) decodes one layer at a
   time inside the loop. This is what makes OD-2's pre-pass viable for `pre`
   (Packet 2) AND is the same materialized list Packet 3's `post` dependency
   graph walks — every layer's `track_id`/`chain`/`mask_stack` is known up
   front, before any frame or any device-chain execution exists.
6. **No `track_id` on the wire today** — the composite layer payload built by
   the frontend never sends a `track_id` field. Video layers:
   `frontend/src/renderer/App.tsx:1509-1522` (`layer_type`, `asset_path`,
   `frame_index`, `chain`, `clip_opacity`, optional `transform`/`mask_stack` —
   no `track_id`). Text layers: `App.tsx:1525-1542`, same gap. This is a new,
   additive wire-schema field this change must add (Packet 2) — the SAME field
   serves both `pre` (Packet 2) and `post` (Packet 3) lookups; no second wire
   field is needed for `post`.
7. **Export has its own, separate composite call site** — `backend/src/engine/
   export.py` imports `apply_masks_to_chain` (`:52`) and calls it independently
   at 3 sites (`:965-967`, `:1138-1140`, `:1731-1733`), most relevantly
   `_composite_export_frame` (`:1666-1733`). Preview's `zmq_server.py` fix and
   export's `export.py` fix are TWO call sites that must both change together
   — preview/export parity is a house landmine, not optional. This doubles
   under the T1 override: BOTH the `pre` pre-pass (Packet 2) AND the `post`
   dependency-ordered pass (Packet 3) need the identical treatment in both
   modules — 4 total wiring sites across the two packets, not 2.
8. **`mask_thumbnail` already degrades gracefully for procedural kinds** —
   `zmq_server.py:3641-3745` (`_handle_mask_thumbnail`) returns
   `{ok: true, thumbnail: null, kind: "procedural"}` for any kind not in its own
   local `_STATIC_KINDS` (`:3674`), which will include `'layer'` automatically.
   Frontend already falls back to a text badge on `thumbnail === null`
   (`DeviceCard.tsx:115-120`) — **`DeviceCard.tsx` needs zero changes for v1**;
   the PRD §7 claim "per-effect distribution free via MK.3" is verified true in
   code, not just asserted.
9. **Mask-stack node-assignment UI needs zero changes** — `DeviceCard.tsx:519-
   538`'s `<select>` iterates `maskNodes` generically by `id`, no kind-specific
   branching. A `'layer'`-kind node in the stack is selectable there today with
   no new code.
10. **No existing "add mask node" menu in `MaskStackPanel.tsx`** — the panel
    (`frontend/src/renderer/components/masking/MaskStackPanel.tsx`, 294 lines)
    only renders existing `NodeCard`s (`:124-234`) and a header
    (`:264-271`); there is no kind-picker "+" button anywhere in this file.
    New nodes are added out-of-band today: `MaskSelectOverlay.tsx` (canvas
    rect/ellipse/polygon draw, calls `addMatteNode` at `:280/360/455/670`) and
    `stores/aiMatte.ts` (`generateAiMatte`, clip-context-menu triggered,
    `addAiMatteNode` at `:59-71` builds the node then calls
    `useTimelineStore.getState().addMatteNode`). The "From layer…" entry point
    is genuinely new UI, modeled on the `aiMatte.ts` pattern (build node →
    `addMatteNode`), inserted into `MaskStackPanel.tsx`'s header area
    (after `:264-271`).
11. **`addMatteNode`'s undo description is generic** —
    `frontend/src/renderer/stores/timeline.ts:2882-2910`, the `undoable(...)`
    call at `:2893` is hardcoded `'Add matte node'` for every kind. House
    landmine ("specific `undoable()` description for every new user-visible
    op") — Packet 8 upgrades this to include `node.kind` (benefits all
    existing call sites too, not just the new one).
12. **No per-track "last rendered frame" cache exists** — grepped for
    `lastFrame`/`track_thumbnail`/`clip_thumbnail`/`_last_frame` project-wide;
    no generic per-track continuous frame cache exists outside an active
    composite render. This grounds OD-4 (unaffected by the T1 override).
13. **`video_analyzer.py` extractors are scalar-only, proxy-resolution — NOT
    reusable as executable code for `motion`/`edges` field reads** —
    `backend/src/modulation/video_analyzer.py:66-164`; every `analyze_*`
    function operates on a 64×64 proxy (`PROXY_SIZE = 64`, `:15`) and returns a
    single `float`. Under the ORIGINAL plan this grounded OD-3's exclusion of
    `motion`/`edges`. Under the T1 override, this citation instead grounds WHY
    Packet 5 must write NEW field-resolution code (a per-pixel delta / per-pixel
    Sobel-magnitude array, not a scalar mean) — it can reuse the FORMULA SHAPE
    (`_to_gray`'s BT.601 weights at `:52-63`; `analyze_motion`'s
    `np.abs(curr - prev)` delta at `:83`; `analyze_edges`'s `gx`/`gy` gradient
    shape at `:129-133`) but not the functions themselves, since none of them
    operate at field resolution or return a field.
14. **matte_source.py's LRU cache is the reuse target, not FieldProvider** —
    `backend/src/masking/matte_source.py:1-59` implements a keyed LRU cache
    (`(clip_id, node_id, height, width, params_hash)`, entry+byte budget, SG-8
    pressure hook at `_SG8_PRESSURE_THRESHOLD`) already live and battle-tested
    in the SAME package (`masking/`) as this change. UNIFICATION §3.2 confirms
    `FieldProvider` (the OTHER candidate cache) is **never instantiated in
    production**. Packet 2's `pre`-frame cache and Packet 3's `post`-frame cache
    both reuse matte_source.py's pattern (same eviction/budget shape, key
    tuples `(track_id, "pre", frame_index)` and `(track_id, "post",
    frame_index)` per the T1-updated §9.3) — TWO keyspaces in one mechanism,
    not a third architecture.
15. **`compositor.py::render_composite`'s `layer_states`/`new_states` dict is
    the state-consistency seam a `post` shadow-render MUST share, not
    duplicate** — `compositor.py:294` (`layer_states: dict[str, dict] | None`
    param), `:410` (`state_in = layer_states.get(layer_id)...`), `:420-421`
    (`new_states[layer_id] = state_out`). A stateful device (datamosh,
    reaction_mosh, frame_drop) threads its state through EXACTLY this
    `layer_id`-keyed dict, once per real layer per frame. If Packet 3's `post`
    pre-pass ran `apply_chain` a SECOND, independent time for a track that is
    ALSO an ordinary visible layer in the same composite (common case — a track
    tapped in `post` mode is very often also on-screen), a stateful device on
    that track would be invoked twice per frame against two different state
    slots, corrupting both the real render (state divergence from what the
    shadow computed) and the definition of "post" (the tap would reflect a
    different pseudo-random/stateful trajectory than what's actually
    displayed). **This is the load-bearing design constraint for Packet 3:**
    for any track that is BOTH tapped-in-`post` AND present as an ordinary
    layer in `raw_layers` this frame, the dependency-ordered pre-pass must
    compute that layer's `apply_chain` call ONCE, early (in dependency order,
    reusing/writing the SAME `layer_states[layer_id]` slot the main loop would
    have used), cache the result as its `post` frame, and the main loop's
    per-layer step for that track then SKIPS its own `apply_chain` call and
    reuses the cached `(frame, state_out)` pair. Only a track tapped-in-`post`
    that has NO corresponding ordinary layer this frame (muted / off-canvas /
    hidden track with only its clip existing) gets a genuine shadow-only
    render, keyed under its own dedicated state slot (see #16).
16. **`zmq_server.py`'s `_composite_states` surgical per-`layer_id` diff is the
    right place to key a shadow-only `post` render's persisted state, and
    export's job-local dict needs no such diff** — preview:
    `zmq_server.py:1155-1220` (`_get_composite_states` / the surrounding
    method), specifically the monotonic-frame reset at the "Scrub detection"
    block and the surgical per-id keep/drop at the "Layer-set change" block
    (same region). A shadow-only `post` tap's state key
    (`tap_post::<track_id>`, distinct from any real `layer_id` so it can never
    collide) participates in the SAME scrub-reset / surgical-diff machinery —
    scrubbing cold-starts it exactly like any other stateful layer, which is
    the correct behavior (T1's "frame-0 → flat 0.5" language for `motion`
    generalizes to "any stateful `post` shadow-render cold-starts on scrub,"
    not a `motion`-only rule). Export: `export.py:721` region — export already
    keeps composite state in a LOCAL dict (no server singleton, per the
    comment there), because an export job's frame sequence is monotonic by
    construction (no scrub) — a shadow-only `post` state key in that same local
    dict needs no reset logic at all, it simply persists frame-to-frame for the
    job's lifetime.
17. **`key_kernels.py::_hue_distance_deg` is the exact primitive Packet 6's
    `colorkey` read reuses** — `backend/src/masking/key_kernels.py:155-163`:
    takes an OpenCV H channel (0–180) and a target hue in degrees, returns a
    float32 (H, W) field of circular hue distance in DEGREES (0–360 space),
    already used by the shipped `chroma_key`/`luma_key` kernels. Packet 6 calls
    this SAME function (not a reimplementation) on the tapped frame's
    `cv2.cvtColor(..., COLOR_RGB2HSV)` H channel, then applies the T1-specified
    `1 − clamp(Δhue / softness, 0, 1)` — a DIFFERENT reduction than
    `chroma_alpha`'s existing hard-edged `hue_mask & sat_mask` (`key_kernels.py`
    `_chroma_key_mask`, :122-152), which is why this is a new small function in
    `stack.py`, not a call into `chroma_alpha` itself (the tap needs a smooth
    per-pixel gradient field, not a binary keyed mask). Existing `chroma_key`
    node evaluator default for the target hue param, reused here for
    `colorkey`'s `read_params.hue` default (T1's override text specifies only
    the softness default of 60°, not the hue default — the hue default is
    filled from this established repo convention rather than invented):
    `key_kernels.py:315` (`p.get("hue", 120.0)`, i.e. green).
18. **`ai_matte.py::evaluate_ai_matte` is the exact pathway Packet 7's
    `ai_person` read reuses verbatim; the frontend bake-trigger is the only
    genuinely new surface** — `backend/src/masking/ai_matte.py:679-763`
    (`evaluate_ai_matte`): reads `node.params.matte_path`/`start_frame`
    (`:698-699`), jail-checks the path (`is_valid_matte_path`, `:701` region),
    opens via the small reader LRU (`_get_matte_reader`, `:604-651`),
    wrap-clamps the frame index, decodes, normalizes to float32 [0,1], resizes
    if needed. Packet 7's `evaluate_layer_tap`'s `ai_person` branch calls this
    SAME function (or a thin wrapper with identical body) against the LAYER
    NODE's own `matte_path`/`start_frame` params — no new bake/cache/jail code.
    The genuinely new work is on the FRONTEND: `frontend/src/renderer/
    stores/aiMatte.ts`'s `generateAiMatte(clipId)` (`:77-94`) resolves the
    asset to bake from BY WALKING TRACKS TO FIND `clipId`'s OWN clip (`:82-85`)
    — it has no notion of "bake against a DIFFERENT track's asset for a tap
    node." Packet 7 adds a sibling function (e.g.
    `generateAiMattePreviewForTrack(sourceTrackId)`) that resolves the SOURCE
    track's current clip/asset instead, issues the SAME `mask_ai_generate` /
    `mask_ai_status` IPC round-trip (`:96-120`'s shape, reused verbatim) and,
    on completion, writes `matte_path`/`start_frame` onto the 'layer' tap
    node's params (via `updateMatteNode`) instead of calling `addAiMatteNode`
    (which would add a competing `ai_matte`-kind node — not what a tap needs).
19. **`compositor.py`'s `apply_chain(..., project_seed, ...)` signature is
    already deterministic per render — Packet 3/5's "seeded-deterministic"
    requirement is satisfied by forwarding the SAME `project_seed` the caller
    already has, not by adding new seed plumbing** — `compositor.py:411-419`
    and `zmq_server.py`'s two call sites both already pass a single
    `project_seed` value threaded from the top-level message
    (`_handle_render_composite`'s `project_seed = message.get("project_seed",
    0)`, `zmq_server.py:1409`). Packet 3's `post` shadow-render must pass this
    IDENTICAL value into its early `apply_chain` call (not re-derive or default
    it) so a stateful/seeded device on the tapped track produces the exact same
    output whether it's reached via the shadow pass or the ordinary per-layer
    loop — this is a "thread the existing value through," not new
    infrastructure. `motion`'s frame-to-frame delta (Packet 5) itself consumes
    no RNG at all (pure decode-and-subtract), so it is deterministic for free;
    the "seeded-deterministic" requirement in the T1 override text is actually
    about the SOURCE frames motion is computed FROM (which may be `post` frames
    off a seeded chain) staying reproducible, which #19's project_seed
    threading already guarantees.
20. **No cycle-detection utility exists for the masking package; the nearest
    precedent is the modulation graph's DFS, which Packet 3's `post` dependency
    resolver mirrors in SHAPE, not by direct reuse (different graph model)** —
    `backend/src/safety/cycle_detection.py:62-109` (`detect_cycles`): builds an
    adjacency list, runs a recursive DFS with a `visited` set and an
    `in_stack` position map, and on revisiting a node already `in_stack`
    reports the cycle with a deterministic break recommendation
    (`suggested_break_edge_id = min(cycle_edge_ids)`, `:97`). This operates on
    `RoutingGraph`/`GraphEdge` (the operator/modulation-lane graph) — NOT
    directly reusable for a track-to-track `post`-tap dependency graph (a
    different node/edge type). Packet 3 implements its OWN small DFS over a
    `dict[track_id, set[track_id]]` adjacency (an edge exists wherever track A's
    mask_stack contains a `post`-stage `'layer'` node pointing at track B) using
    the SAME shape (`visited` + `in_stack`, deterministic lex-smallest-id break
    on cycle) so the break behavior is reproducible across runs, mirroring this
    file's philosophy without importing its graph-specific types.
21. **`composite_tree.py::expand_group_layer` is a 3rd/4th `apply_masks_to_chain`
    call site never wired for tap-frame availability** — its `leaf_ctx`
    (`composite_tree.py:243`, `FrameCtx(frame=frame, frame_index=frame_index,
    clip_id=str(layer_id))`, for leaf voices inside a Sample Rack branch) and
    `branch_ctx` (`:287-289`, `FrameCtx(frame=sub_frame,
    frame_index=frame_index, clip_id=f"group:{group_id}")`, for the branch
    chain itself) are both built with no `extra=` kwarg, so `FrameCtx.extra`
    defaults to `{}` (`stack.py:62`) and `ctx.extra.get('tap_frames_pre'/
    'tap_frames_post')` is always `None` there — even after Packet 2/3 land —
    because these two call sites are invoked from `_handle_render_composite`'s
    GROUP-layer expansion path and never receive the top-level
    `pre_frames_by_track_id`/`post`-pass dicts Packet 2/3 build. Per code
    ground truth #9, a `'layer'` node is assignable via MK.3's generic mask
    dropdown with zero DeviceCard changes, meaning a user CAN add a `'layer'`
    tap node to a Sample-Rack leaf/branch's own `mask_stack` today — that tap
    will silently and permanently resolve to flat 0.5 (indistinguishable from
    the legitimate "missing track_id" degrade) unless Packet 2/3 explicitly
    thread their tap-frame dicts into this file too.

## Packet plan

### Packet 1 — Schema: 9th kind + full param surface + evaluator registration
**Risk:** LOW. **Files:**
- `backend/src/masking/schema.py` — add `"layer"` to `_VALID_KINDS` (line ~30-41).
- `backend/src/masking/stack.py` — new `evaluate_layer_tap(node, ctx, height,
  width)` function + `register_evaluator("layer", evaluate_layer_tap)` call
  (module-level, alongside the pattern MK.6/MK.8/MK.12 use elsewhere). For
  Packet 1 alone (before Packets 2/3 land the cache/dependency machinery),
  this evaluator ALWAYS returns flat 0.5 (`np.full((height,width), 0.5,
  dtype=np.float32)`) regardless of `stage`/`read` — Packet 1 ships the
  schema+dispatch seam in a state that degrades safely; Packets 2–7 wire the
  real reads and stages incrementally.
- `frontend/src/shared/types.ts:231-239` — add `'layer'` to `MatteNodeKind`;
  `frontend/src/shared/types.ts:265` — widen `MatteNode.params`'s type to admit
  the nested `read_params` object shape (see below).
- `frontend/src/renderer/project-persistence.ts:156-159` — add `'layer'` to
  `VALID_MATTE_KINDS`; `frontend/src/renderer/project-persistence.ts:225-244`
  (`validateMatteNode`'s params sanitize loop) — add the new `read_params`
  dict-value branch mirroring the backend's `_sanitize_params` extension (see
  below).
- `LayerTapParams` shape validation (full T1-scope surface, not the OD-3-
  narrowed one): `track_id` (string, non-empty — missing → per §9.1 "missing
  track_id → flat-0.5 rule", not a rejected node), `stage` (string, both
  `"pre"`/`"post"` acted on per the T1 override; anything else degrades to
  `"pre"`), `read` (string, all 9 values acted on; anything else → `"luma"` +
  one-time log per §9.1), `gain` (float, clamp ±4 — reuse the existing FieldRef
  clamp helper: `frontend/src/shared/field-param.ts`'s `clampGain`, already
  imported by `DeviceCard.tsx:2`), `gamma` (float, clamp [0.2, 4] — new helper,
  mirrors `clampGain`'s shape), `invert` (bool), `read_params` (object,
  read-specific — `schema.py`'s `_sanitize_params` (`:75-91`) has NO existing
  dict-value handling today; per its own comment at `:90` it currently drops
  every dict/bool/list/None-valued param entirely, so a nested `read_params:
  {hue: 200, softness: 45}` value would silently vanish (key absent) rather
  than round-trip. Packet 1 must EXTEND `_sanitize_params` with a new branch:
  `elif k == "read_params" and isinstance(v, dict): clean[k] = {rk: (0.0 if
  isinstance(rv, (int, float)) and not math.isfinite(rv) else rv) for rk, rv
  in v.items() if isinstance(rk, str) and isinstance(rv, (int, float, str))}`
  — container-type-checked, numeric-leaf-sanitized, non-numeric/non-string
  leaves dropped. The frontend mirror needs the SAME new branch in
  `validateMatteNode`'s params loop (`project-persistence.ts:225-244`, which
  today has the identical gap — its own comment at `:243` reads "any other
  type → dropped," which includes objects), and `MatteNode.params`'s type
  (`types.ts:265`, currently `Record<string, number | string | number[] |
  number[][]>` with no object member) must be widened to `Record<string,
  number | string | number[] | number[][] | Record<string, number | string>>`
  to admit the nested shape. The two read-specific shapes this container must
  tolerate are colorkey's `{hue, softness}` (Packet 6 clamps `hue` to [0,360) mod-wrap and
  `softness` to [0.1, 180] with 60° as the UI default, not a schema-enforced
  default) and ai_person's `{matte_path, start_frame}` (Packet 7 re-validates
  `matte_path` through the SAME jail check `ai_matte.py` already uses before
  every read — no new trust boundary invented, the existing one is called an
  extra time from a new call site).
**Oracle:** `backend/tests/test_masking_layer_tap_schema.py` (new) —
`MatteNode.from_dict({..., "kind": "layer", "params": {...}})` accepts a
well-formed node for both `stage` values; missing `track_id` still parses
(node exists, flat-0.5 is an evaluator-time behavior per §9.1, not a
schema-time rejection); gain/gamma out-of-range clamp; unknown `read`/`stage`
values stored as-is at schema layer (schema does not reject them — the
evaluator degrades them per §9.1's "unknown read → luma" being an
evaluation-time fallback, not a validator rejection); `read_params` round-trips
for both the colorkey and ai_person shapes without raising.
`resolve_stack([layer_node], ctx, (h,w))` returns a flat-0.5 (h,w) array
without raising, for every `stage`/`read` combination (pre-Packet-2/3
baseline).

### Packet 2 — Pre-stage cross-layer frame cache + compositor wiring
**Risk:** HIGH — touches the shared `apply_masks_to_chain` seam and both
preview and export call sites; must preserve the "absent mask_stack →
byte-identical" rollback guarantee (`masking/routing.py:288-292`) for every
project without a `'layer'` node.
**Files:**
- `backend/src/masking/matte_source.py` — extend with a second, separately
  keyed LRU pool (same module, same eviction/SG-8 pattern, per code-ground-
  truth #14) OR a small sibling module `backend/src/masking/tap_cache.py` that
  imports and reuses `matte_source.py`'s `_evict_to_fit`/`_insert` shape rather
  than duplicating it (implementer's call at Packet time; either way, ONE
  cache mechanism shared with Packet 3's `post` keyspace, not a new
  architecture per stage). Key: `(track_id, "pre", frame_index)` per §9.3.
- `backend/src/zmq_server.py`, `_handle_render_composite` (`:1407-1710`) — add
  the OD-2 pre-pass: before the existing `for layer_info in raw_layers:` loop
  (`:1458`), iterate `raw_layers` once to decode+transform (NOT device-chain)
  every layer's frame into `pre_frames_by_track_id: dict[str, np.ndarray]`,
  keyed by the NEW `track_id` field (Packet 2 frontend change, below). The main
  loop then (a) reuses these frames instead of re-decoding where a track_id
  match exists, and (b) passes `pre_frames_by_track_id` into each layer's
  `FrameCtx.extra['tap_frames_pre']` before calling `apply_masks_to_chain`
  (`:1688-1694`) so `evaluate_layer_tap` can resolve
  `ctx.extra['tap_frames_pre'].get(node.params['track_id'])` when
  `stage == 'pre'`. (Packet 3 adds the sibling `'tap_frames_post'` key onto the
  SAME `ctx.extra` dict — one context object, two stage keyspaces.)
- `backend/src/zmq_server.py`, single-clip path (`:792-819`) — `mask_ctx` here
  gets `extra={}` (no tap-frame keys, or empty dicts) since no other track
  exists in this render; `evaluate_layer_tap` must treat a missing
  `'tap_frames_pre'`/`'tap_frames_post'` key the same as an unresolvable
  `track_id` (flat 0.5) — no new special case, same code path as "unknown
  track_id" (§9.1 "missing track_id → flat-0.5 rule" already covers this).
- `backend/src/engine/export.py`, `_composite_export_frame` (`:1666-1733`) and
  its sibling composite call sites (`:957-967`, `:1131-1140`) — apply the SAME
  `pre` pre-pass (preview/export parity, code-ground-truth #7). This is 2 call
  sites, not 1; both must land in this packet together.
- `backend/src/engine/composite_tree.py`, `expand_group_layer`'s `leaf_ctx`
  (`:243`) and `branch_ctx` (`:287-289`) — these are a 3rd/4th
  `apply_masks_to_chain` call site (code ground truth #21) reachable whenever a
  composite render expands a GROUP layer (Sample Rack branches); both `FrameCtx`
  constructions must gain `extra={'tap_frames_pre': pre_frames_by_track_id}`
  (threaded down from `_handle_render_composite`'s top-level pre-pass dict) so a
  `'layer'` tap node inside a rack leaf/branch `mask_stack` resolves like any
  other consumer instead of permanently degrading to flat 0.5.
- `backend/src/masking/stack.py` — flesh out `evaluate_layer_tap`'s `stage ==
  'pre'` branch (stubbed in Packet 1) to: look up the frame via
  `ctx.extra['tap_frames_pre']`; missing → flat 0.5 (log once per §9.1); hand
  off to the shared per-read dispatch table (Packets 4–7 populate the actual
  read implementations; for Packet 2 alone, ANY read on a resolved `pre` frame
  falls through to a temporary "return the raw luma of the tapped frame"
  behavior so this packet's oracle can assert real (non-placeholder) `pre`
  wiring before the full read taxonomy exists — Packet 4 replaces this
  temporary fallback).
- `frontend/src/renderer/App.tsx` — video-layer serialization (`:1509-1522`)
  gains `track_id: track.id`; text-layer serialization (`:1525-1542`) gains
  `track_id: <owning track id>` (the text clip's track — confirm the variable
  in scope at that call site, likely `track.id` from the same `activeTextClips`
  iteration context). Instrument/rack layers (`buildRackLayers.ts`,
  `buildSamplerLayer.ts`, `buildGranulatorLayer.ts`) are NOT touched in v1 —
  `'layer'` tap SOURCES are restricted to video/text track layers for v1 (not
  called out in proposal.md non-goals explicitly — adding here: instrument
  voice layers as tap sources are deferred, no PRD requirement names them for
  v1).
**Oracle:** `backend/tests/test_layer_tap_composite.py` (new; shared file with
Packet 3's `post` cases, same module) —
(a) 2-layer `render_composite` call, layer B's `mask_stack` has a `'layer'`
node tapping track A's `track_id`, `stage: 'pre'`, temporary-luma read; assert
B's output differs from an unmasked render and correlates with A's actual
pre-chain luma (not a placeholder value).
(b) missing/unknown `track_id` → flat 0.5, no exception raised, render
completes.
(c) **fan-out**: one source track tapped by 2+ consumer layers (both `pre`) in
the same composite frame — instrument the cache with a hit/miss counter,
assert the source frame is decoded/resolved exactly ONCE (§9.3).
(d) **rollback guarantee**: a project with zero `'layer'` nodes renders
byte-identical to pre-change output (no `tap_frames_pre` computation triggered
at all when no consumer references it — cheap early-out, mirroring
`masking/routing.py:202-205`'s existing "no entry references a mask" early-out
pattern).
(e) **Sample Rack / group-layer consumer** (code ground truth #21): a `'layer'`
node inside a Sample-Rack leaf voice's or branch's `mask_stack`, `stage: 'pre'`,
tapping a top-level track — assert the tap resolves to a real (non-0.5,
non-placeholder) value via `composite_tree.py::expand_group_layer`'s `leaf_ctx`/
`branch_ctx`, not a silent flat-0.5 degrade.

### Packet 3 — Post-stage cross-layer dependency pass + cycle guard
**Risk:** VERY HIGH — this is the packet the T1 override actually added; it
touches per-layer state propagation (compositor.py `layer_states`), not just
frame decode, and introduces a genuinely new failure class (dependency
cycles) that `pre`-only taps never had.
**Depends on:** Packet 2 (shares `ctx.extra`, the tap cache module, and the
`track_id` wire field).
**Files:**
- `backend/src/masking/stack.py` — `evaluate_layer_tap`'s `stage == 'post'`
  branch: look up `ctx.extra['tap_frames_post'].get(track_id)`; missing → flat
  0.5 (same convention as `pre`).
- `backend/src/zmq_server.py`, `_handle_render_composite` — after the OD-2
  `pre` pre-pass and BEFORE the main per-layer loop, add a second pre-pass:
  1. **Early-out** (rollback guarantee): scan `raw_layers`' mask_stacks; if no
     `'layer'` node anywhere has `stage == 'post'`, skip this entire pass —
     `ctx.extra['tap_frames_post']` stays `{}` for every layer, zero extra
     cost, byte-identical to Packet 2's behavior alone.
  2. **Dependency graph**: build `dict[track_id, set[track_id]]` — an edge
     `A → B` exists wherever track A's `mask_stack` contains a `'layer'` node
     with `stage == 'post'` and `params.track_id == B`. Only tracks that are
     (a) tapped-in-`post` by someone, or (b) needed transitively to resolve
     one, are nodes in this graph.
  3. **Cycle guard** (code ground truth #20): DFS with `visited`/`in_stack`; on
     a cycle, deterministically break it by treating the LEX-SMALLEST
     `track_id` in the cycle's incoming `post` edge as unresolvable for THIS
     render (flat 0.5 for that one edge only — never raises, never crashes the
     frame, mirrors this codebase's universal degrade convention).
  4. **Resolve in dependency order.** For each track needing a `post` frame,
     in topological order: if that track ALSO has an ordinary layer entry in
     `raw_layers` this frame (the common case), execute THAT layer's own
     `apply_masks_to_chain` + `apply_chain` call HERE, early, writing into
     BOTH `tap_frames_post[track_id]` AND `layer_states[layer_id]` (the
     SAME state slot the main loop would have written) — see code ground
     truth #15. The main loop's later per-layer step for this track_id then
     detects "already resolved this frame" and reuses the cached
     `(frame, state_out)` pair instead of calling `apply_chain` a second time
     (no double-invocation of stateful/seeded devices). If the tapped track
     has NO ordinary layer entry this frame (muted/hidden/off-canvas), render
     a shadow-only copy keyed under `tap_post::<track_id>` in
     `_composite_states` (code ground truth #16) — this state key participates
     in the SAME scrub-reset / surgical-diff machinery as any other layer.
  5. `apply_chain`'s `project_seed` argument (code ground truth #19) is the
     SAME value already threaded through this render — never re-derived.
- `backend/src/zmq_server.py`, single-clip path — untouched; a single-clip
  render has no other tracks, so `stage: 'post'` taps resolve via the existing
  "no `tap_frames_post` key → flat 0.5" fallback, identically to `pre`.
- `backend/src/engine/export.py` — the SAME dependency-graph/cycle-guard/
  resolve-in-order logic (shared helper function, not a reimplementation) at
  all 3 `apply_masks_to_chain` call sites (`:965-967`, `:1138-1140`,
  `:1731-1733`), with the state slot for shadow-only renders living in
  export's existing job-LOCAL dict (code ground truth #16 — no scrub-reset
  logic needed there, frames are monotonic by construction).
- New shared helper (implementer's call on exact location — `masking/
  stack.py` or a new `masking/tap_dependency.py`): `resolve_post_tap_order
  (raw_layers) -> (order, cycle_breaks)` — pure function over the layer list,
  unit-testable in isolation from the ZMQ/export call sites (this is what
  Packet 3's dependency/cycle oracle below exercises directly, without needing
  a full composite render per case).
- `backend/src/engine/composite_tree.py`, `expand_group_layer`'s `leaf_ctx`
  (`:243`) and `branch_ctx` (`:287-289`) — the sibling `'tap_frames_post'` key
  (code ground truth #21) must land on the SAME `FrameCtx.extra` dict Packet 2
  wired `'tap_frames_pre'` onto, so a `'layer'` node inside a Sample-Rack leaf/
  branch `mask_stack` with `stage: 'post'` resolves via the shared dependency-
  ordered pass instead of degrading to flat 0.5.
**Oracle:** `backend/tests/test_layer_tap_composite.py` (post-stage cases,
same file as Packet 2) —
(a) 2-layer composite, layer B taps track A `stage: 'post'`; assert B's tap
reflects A's frame AFTER A's own chain/mask stack ran (construct A with a
device that visibly transforms the frame — e.g. an invert or solid-color
paint — and assert B's tap matches the POST-chain pixel values, not the
pre-chain ones already covered by Packet 2's oracle (a)).
(b) **stateful-device single-invocation**: A carries a stateful device
(datamosh or an equivalent test double with an internal counter in
`state_out`); B taps A in `post` mode; run 3 consecutive frames; assert the
device's internal state counter advances by exactly 1 per frame (not 2) —
proves code ground truth #15's single-execution-and-share design, not a
double-invocation.
(c) **cycle guard**: construct A `post`-taps B and B `post`-taps A; assert the
render completes without raising, exactly one of the two edges degrades to
flat 0.5 (deterministic: same cycle → same broken edge across repeated runs of
the identical project), and the OTHER edge still resolves to a real (non-0.5)
value.
(d) **preview/export parity for a `post` tap** (explicit T1-required
addition): build the identical 2-layer `post`-tap setup (case (a)'s
construction) through both `zmq_server._handle_render_composite` and
`export.py::_composite_export_frame` for the same frame index; assert
byte-identical output on BOTH the composited frame and B's resolved matte
value.
(e) **rollback guarantee**: a project with zero `post`-stage `'layer'` nodes
(some may still have `pre`-stage nodes) never triggers the dependency-graph
build at all (assert via a call-count instrumentation on the graph-builder
function, not just output equality) — the `pre`-only path from Packet 2 stays
byte-identical and equally cheap whether or not this packet's code exists in
the binary.
(f) **Sample Rack / group-layer consumer** (code ground truth #21): a `'layer'`
node inside a Sample-Rack leaf voice's or branch's `mask_stack`, `stage:
'post'`, tapping a top-level track — assert the tap resolves through
`composite_tree.py::expand_group_layer`'s dependency-ordered pass to the
tapped track's POST-chain value, not a silent flat-0.5 degrade.
- Unit test on the shared helper directly:
  `backend/tests/test_layer_tap_post_order.py` (new) — `resolve_post_tap_order`
  given a synthetic layer list: (i) linear chain A←B←C resolves in the order
  A, B, C (dependencies before dependents); (ii) diamond (B and C both tap A)
  resolves A exactly once; (iii) self-tap (OD-5's backend-graceful case, a
  track `post`-tapping itself) treated as a 1-node cycle, degrades to flat 0.5,
  never infinite-loops; (iv) the 2-cycle case from oracle (c), asserting the
  SAME lex-smallest-id break decision as the composite-level oracle (this unit
  test is what actually pins the determinism claim; the composite oracle
  merely confirms it end-to-end).

### Packet 4 — Read taxonomy: luma · R · G · B · alpha (direct per-pixel ops)
**Risk:** MED. **Depends on:** Packet 2 (needs a resolved `pre` frame) — these
reads are IDENTICAL regardless of `stage`, so they also complete Packet 3's
`post` path the moment Packet 3 lands (no read-specific `post` work).
**Files:**
- `backend/src/masking/stack.py` — replace Packet 2's temporary "raw luma"
  fallback with the real per-read dispatch: `luma` (BT.601/709 weighted sum,
  matching `video_analyzer.py::_to_gray`'s weights per code ground truth #13,
  but at full field resolution — **cv2/numpy, float-hoisted once,
  C-contiguous**, house landmine citing the 4.7× measured mandate from PR
  #416 / PRD §4 decision 24), `R`/`G`/`B` (direct channel slice), `alpha`
  (alpha channel if present, else all-ones field — §10.4's "alpha-less source
  → field 1.0" case, implemented here). All five: resize to `(height, width)`
  bilinear if source resolution differs (§10.4, `cv2.INTER_LINEAR` matching
  `masking/routing.py:99-101`'s existing resize pattern); apply
  `gain`/`gamma`/`invert` (same math shape as `FieldRef`'s gain/invert,
  `effects/field_params.py` precedent — read-only reference, this change does
  NOT touch `field_params.py` per non-goals); clip to [0,1].
**Oracle:** extends `backend/tests/test_layer_tap_composite.py` +
`masking/stack.py`'s unit tests — real read extraction for each of the 5
reads against a synthetic frame with known per-channel/alpha/luma values, for
BOTH `stage` values (reuses Packet 2/3's `pre`/`post` fixtures, swapping only
the `read` param).

### Packet 5 — Read taxonomy: motion · edges (field-resolution, stateful)
**Risk:** HIGH — new field-resolution numerics AND new per-tap persisted
state (motion needs a previous-frame reference); the only read pair with a
temporal dependency.
**Depends on:** Packet 3 (state-slot machinery — motion's `tap_prev` state
reuses the SAME `_composite_states`/export-job-local-dict pattern Packet 3
built for `post` shadow state, code ground truth #16) and Packet 4 (shares the
resize/gain/gamma/invert tail).
**Files:**
- `backend/src/masking/stack.py` — `edges`: per-pixel Sobel-magnitude field at
  full (or tap-internal half) resolution, reusing `video_analyzer.py`'s
  `gx`/`gy` gradient FORMULA shape (code ground truth #13) as a per-pixel
  array (not reduced to a scalar mean) — `magnitude = sqrt(gx**2 + gy**2)`
  per-pixel, then the same resize/clip tail as Packet 4.
  `motion`: per-pixel `abs(curr_gray - prev_gray)` where `prev_gray` comes from
  a state dict keyed `tap_prev::<track_id>::<stage>` (T1 override, verbatim
  key shape) at HALF the tap's working resolution (perf: motion is the most
  expensive read, matching the "half-res" requirement literally — downsample
  the luma-converted frame by half before diffing, then upsample the delta
  field back to consumer resolution at the standard §10.4 boundary). Frame 0
  (or any frame where `tap_prev::<track_id>::<stage>` is absent — first frame
  of a render, OR the state was just cold-started by a scrub per Packet 3's
  code ground truth #16) → flat 0.5 (T1-specified; NOTE this is a deliberate
  divergence from `video_analyzer.analyze_motion`'s existing "no prior → 0.0"
  scalar convention — a field read uses the neutral §10.4 gap value, 0.5, not
  the scalar analyzer's 0.0, since 0.0 would read as "solid black matte" to a
  mask-stack consumer rather than "no signal yet"). State write: after
  computing the delta, the CURRENT half-res gray frame is stored back into the
  same state key for next frame's diff — this write happens once per
  `(track_id, stage)` pair per render frame regardless of fan-out (multiple
  consumers reading `motion` off the same tapped track/stage share one state
  slot and one computed field, per §9.3).
- `backend/src/zmq_server.py` / `export.py` — thread the `tap_prev::*` state
  keys through the SAME state-slot mechanism Packet 3 introduced (server
  `_composite_states` with scrub-reset; export's job-local dict with no
  reset) — no new persistence mechanism, an additional key namespace in an
  existing dict.
**Oracle:** extends `backend/tests/test_layer_tap_composite.py` +
`masking/stack.py` unit tests —
(a) `edges` against a synthetic frame with a known hard edge (half black/half
white) → assert the edge-region pixels score higher than the flat regions.
(b) `motion` **frame-0**: first frame of a render (no prior `tap_prev` state)
→ assert the returned field is uniformly 0.5 (not 0.0), for both `stage`
values.
(c) `motion` **determinism**: render the SAME 3-frame sequence twice (same
project, same seed, same scrub-free playback) → assert BYTE-IDENTICAL motion
fields on frame 2 and 3 across the two runs (pins code ground truth #19's
determinism claim for a temporally-stateful read specifically, since this is
the one read where reproducibility is not "obviously" free).
(d) `motion` **delta correctness**: two consecutive synthetic frames with a
KNOWN pixel-region change → assert the motion field is elevated exactly in
the changed region on frame 2, and flat 0.5 on frame 1 (frame-0 case).
(e) `motion` **fan-out shares state**: two consumers both read `motion` off
the same `(track_id, stage)` in the same render frame → assert the tap-prev
state is written exactly once per frame (instrumented counter), not once per
consumer.

### Packet 6 — Read taxonomy: colorkey (Δhue / softness)
**Risk:** MED. **Depends on:** Packet 4 (shares resize/gain/gamma/invert
tail); independent of Packet 5.
**Files:**
- `backend/src/masking/stack.py` — `colorkey` branch: convert the resolved tap
  frame (`pre` or `post`, whichever `stage` requested) to HSV via
  `cv2.cvtColor(..., cv2.COLOR_RGB2HSV)`, compute Δhue via
  `key_kernels._hue_distance_deg` (code ground truth #17 — imported and
  called, not reimplemented) against `read_params.hue` (default 120.0,
  reusing the existing `chroma_key` node convention per #17), then
  `field = 1.0 - clip(delta_hue / softness, 0.0, 1.0)` where `softness` comes
  from `read_params.softness` (T1-specified default **60°**; clamp to a
  sane floor, e.g. `max(0.1, softness)`, to avoid a divide-by-zero on a
  hand-edited or malformed project file — never raises). Then the standard
  resize/gain/gamma/invert/clip tail from Packet 4.
- `backend/src/masking/schema.py` — no NEW top-level param, but confirm
  `read_params.hue`/`read_params.softness` numeric sanitization (NaN/Inf → the
  documented defaults) happens at the SAME generic numeric-param layer
  Packet 1 already wired for `read_params`, not a colorkey-specific validator.
**Oracle:** extends `backend/tests/test_layer_tap_composite.py` +
`masking/stack.py` unit tests — synthetic frame with a known solid color at a
known hue → assert the field is ≈1.0 at that hue and falls off monotonically
as `read_params.hue` is moved away from it; assert `softness` widening
broadens the falloff (higher field value at a fixed Δhue as softness
increases); assert the T1-specified default (`read_params: {}` → hue 120°/
softness 60°) matches an explicit `{hue: 120, softness: 60}` call
byte-for-byte (pins the "default 60°" requirement precisely, not just
"some default").

### Packet 7 — Read taxonomy: ai_person (ai_matte pathway, generalized)
**Risk:** MED-HIGH — backend reuse is low-risk (verbatim pathway per code
ground truth #18), but the frontend bake-trigger flow is genuinely new
surface with its own async/toast/cache lifecycle.
**Depends on:** Packet 4 (shares resize/clip tail — ai_person's alpha output
does not need gain/gamma/invert skipped, same tail as every other read);
independent of Packets 5/6.
**Files:**
- `backend/src/masking/stack.py` — `ai_person` branch: delegate to
  `masking.ai_matte.evaluate_ai_matte`-equivalent logic (import and call
  directly, or extract a small shared body if the `node`/`ctx` shapes need
  adapting — implementer's call, but ZERO duplication of the jail-check /
  reader-cache / wrap-clamp logic per code ground truth #18) against the
  LAYER node's own `read_params.matte_path`/`read_params.start_frame` (note:
  these live under `read_params`, not top-level `params`, to keep them
  scoped to the `ai_person` read specifically — distinct from an `ai_matte`-
  kind node's top-level `matte_path`).
- `frontend/src/renderer/stores/aiMatte.ts` — new
  `generateAiMattePreviewForTrack(sourceTrackId, consumerClipId, nodeId)`
  sibling to `generateAiMatte` (`:77-94`): resolves `sourceTrackId`'s current
  clip/asset (NOT `consumerClipId`'s — the whole point of the tap), issues the
  SAME `mask_ai_generate` → `mask_ai_status` → toast/poll round-trip
  (`:96-120`'s IPC shape, reused verbatim), and on completion calls
  `useTimelineStore.getState().updateMatteNode(consumerClipId, nodeId, {
  read_params: { matte_path, start_frame: 0 } })` instead of
  `addAiMatteNode` (which would add a competing `ai_matte`-kind node — wrong
  shape for a tap's `read_params`).
- `frontend/src/renderer/components/masking/MaskStackPanel.tsx` — the
  `read === 'ai_person'` case in the tap chip (Packet 8) triggers this new
  function instead of relying on a synchronous read; until the bake completes
  the field falls back to flat 0.5 (already the backend's built-in "missing
  matte_path" degrade per code ground truth #18 — no new frontend loading-
  state UI is required beyond the existing progress toast).
**Oracle:**
- Backend: `backend/tests/test_layer_tap_composite.py` — a `'layer'` node with
  `read: 'ai_person'` and a valid pre-baked `read_params.matte_path` resolves
  through `evaluate_layer_tap` to the same values `evaluate_ai_matte` would
  return for an equivalent `ai_matte`-kind node on the same file (byte-
  identical call-through, proving "verbatim pathway" rather than a parallel
  reimplementation); missing/jail-rejected `matte_path` → flat 0.5, no
  exception (mirrors `ai_matte.py`'s existing contract exactly).
- Frontend: extends `frontend/src/__tests__/MaskStackPanel.layertap.test.tsx`
  (Packet 8's file) — selecting `read: 'ai_person'` in the tap chip calls
  `generateAiMattePreviewForTrack` with the TAPPED track's id, not the
  consuming clip's id (the one bug this flow is most likely to regress into,
  given `generateAiMatte`'s existing clipId-only shape); on mock-IPC success,
  assert `updateMatteNode` was called with `read_params.matte_path` set (not
  `addMatteNode` with a new `ai_matte` node).

### Packet 8 — MaskStackPanel UI: tap chip (stage + full read dropdown) + hover-audition IPC
**Risk:** MED-HIGH. **Depends on:** Packets 2–7 (the evaluator needs to be
real, across both stages and all 9 reads, for the audition/thumbnail path to
return non-placeholder data); layout/interaction work can start against
Packet 1's flat-0.5 stub in parallel, with integration assertions marked
`xfail`/skipped until the dependency packets land (repo convention for
stub-dependent tests).
**Files:**
- `frontend/src/renderer/components/masking/MaskStackPanel.tsx` — extend
  `NodeCard` (`:52-238`) with a `node.kind === 'layer'` branch rendering: 16px
  live thumbnail (fetched via the hover-audition IPC below), a stage TOGGLE
  (`pre`/`post` — no longer a display-only dot per the original OD-1-scoped
  plan; per PRD decision 3 "hollow=pre, filled=post," now a REAL toggle since
  v1 supports both), a read DROPDOWN offering all 9 values (not 5), read-
  specific sub-controls shown conditionally (`colorkey` → hue/softness number
  inputs wired to `read_params`; `ai_person` → a "Generate matte" button
  wired to Packet 7's `generateAiMattePreviewForTrack`; all others → no extra
  controls beyond the shared gain/gamma/invert mini-strip), mini-strip popover
  (gain/gamma/invert number inputs + selects wired through `updateMatteNode`,
  reusing the panel's existing `clampFeather`/`clampGrowShrink` helper SHAPE —
  new `clampGain`/`clampGamma` per Packet 1's bounds), press-and-hold → solo
  (state toggle + reuse the hover-audition IPC at full clip resolution instead
  of thumbnail resolution).
- `MaskStackPanel.tsx` header area (after `:264-271`) — new "+ From layer…"
  control opening a track picker (list `useTimelineStore` tracks, `id`+`name`,
  excluding the clip's own track per OD-5). Hover a candidate → debounced
  hover-audition IPC call → live thumbnail in the picker (defaults to
  previewing `stage: 'pre'`/`read: 'luma'` regardless of what the eventual
  node will use, since the picker commits before read/stage are chosen).
  Commit → construct `{id: randomUUID(), kind: 'layer', params: {track_id,
  stage: 'pre', read: 'luma', read_params: {}, gain: 1.0, gamma: 1.0, invert:
  false, transform: IDENTITY_TRANSFORM_SNAKE_CASE, edge_policy: 'black'}, op:
  'add', invert: false, feather: 0, growShrink: 0, enabled: true}` (§9.1 shape
  verbatim; `pre`/`luma` remain the NEW-NODE defaults even though both stages
  and all 9 reads are now supported — the picker's job is "pick a source,"
  the chip's stage-toggle/read-dropdown is where the user then chooses
  `post`/other reads) → `useTimelineStore.getState().addMatteNode(clipId,
  node)`.
- `backend/src/zmq_server.py` — extend `_handle_mask_thumbnail` (`:3641-3745`)
  to special-case `kind == "layer"` (decode the candidate track's current-
  playhead frame per OD-4, resolve the REQUESTED `stage`/`read` — now a real
  parameter on the thumbnail request, since both stages/all reads need
  auditioning — apply it, downscale, encode; mirrors the existing static-kind
  rasterize-then-PNG-encode shape at `:3726-3745`) OR add a small new sibling
  handler `layer_tap_preview` if reusing `_handle_mask_thumbnail`'s
  clip_id-keyed cache assumptions proves awkward (implementer's call; either
  way the response shape stays `{ok, thumbnail: base64|null}`). Debounce
  (~150ms) lives client-side in the picker/chip components — no new backend
  rate-limiting needed (OD-4: single decode, not a full chain render; NOTE a
  `post`-stage audition request IS a full chain render for the candidate
  track per §9.2's definition — this is intentionally more expensive than a
  `pre` audition and stays debounced client-side rather than gaining separate
  backend throttling, since OD-4's "bounded per-hover cost" was never a hard
  perf budget, just a design deviation from the ideal continuous cache).
- `frontend/src/renderer/stores/timeline.ts:2893` — change the hardcoded
  `'Add matte node'` undo description to include the kind, e.g.
  `` `Add ${node.kind} matte` `` (benefits all existing call sites: rect/
  ellipse/polygon/ai_matte too — additive string change, zero behavior
  change to the undo/redo mechanics themselves).
- Track-deletion cross-store cleanup (PLAY-004 "deletion is a distributed
  transaction") — find `removeTrack` in `timeline.ts` and confirm the chip's
  red-dashed "source deleted" state is a DERIVED check, `!tracks.some(t =>
  t.id === node.params.track_id)`, not a stored flag (satisfies PLAY-002 by
  construction — nothing to recompute, it's computed live every render). The
  backend already degrades gracefully at render time (flat 0.5, no crash) for
  BOTH stages.
**Oracle:** `frontend/src/__tests__/MaskStackPanel.layertap.test.tsx` (new,
Vitest component test, mock IPC per repo convention) —
(a) render a clip with a `'layer'`-kind node in `maskStack` (one `pre`, one
`post` fixture); assert chip DOM (stage-toggle state, read-dropdown value,
mini-strip inputs, and the colorkey/ai_person conditional sub-controls when
those reads are selected) renders without crashing for all 9 read values ×
both stages.
(b) click "+ From layer…", verify own track excluded from the list, select
another track, commit → assert `addMatteNode` called with a node matching the
§9.1 shape (kind/params keys present, stage='pre', read='luma' NEW-NODE
defaults, numeric defaults).
(c) toggle the stage control on an existing node → assert `updateMatteNode`
called with `params.stage` flipped, and the thumbnail re-fetch is triggered
with the new stage (not stale).
(d) render with a `track_id` that doesn't match any live track → assert the
red-dashed class is present (derived-check path, no store mutation asserted),
for both stages.
(e) undo-description assertion: after the add flow, assert the undo stack's
top entry description contains `"layer"` (not the generic `"Add matte
node"`).
(f) `ai_person` sub-control click calls `generateAiMattePreviewForTrack` with
the tapped track's id (Packet 7's regression-prone case, re-asserted here at
the chip-integration level, not just the store-function level).

## Test Plan

### Backend (pytest)
- Unit: `masking/schema.py` — `'layer'` kind accepted for both `stage` values
  and the full 9-value `read` enum, params clamped per §9.1 (Packet 1).
- Unit: `masking/stack.py::evaluate_layer_tap` — flat-0.5 stub behavior for
  every stage/read combination (Packet 1); real read extraction for luma/R/G/
  B/alpha against a synthetic frame with known per-channel/alpha/luma values
  (Packet 4); edges/motion field-resolution correctness incl. motion
  determinism + frame-0 (Packet 5); colorkey Δhue/softness incl. the 60°
  default (Packet 6); ai_person delegation-equivalence to `evaluate_ai_matte`
  (Packet 7).
- Unit: `masking/tap_dependency.py` (or wherever `resolve_post_tap_order`
  lands) — linear chain, diamond fan-out, self-tap cycle, 2-cycle
  deterministic break (Packet 3).
- Integration: `test_layer_tap_composite.py` — pre-stage cross-layer read,
  missing-source degrade, fan-out-once, pre-stage rollback byte-identity
  (Packet 2); post-stage cross-layer read (after-chain values), stateful-
  device single-invocation, cycle-guard degrade + determinism, **post-stage
  preview/export parity**, post-stage rollback byte-identity (Packet 3); all 9
  reads × both stages (Packets 4–7).
- Integration: hover-audition IPC contract, including a `post`-stage audition
  request that runs a real chain (Packet 8).
- Regression: run the FULL existing `masking/` and `zmq_server`/composite test
  suites (`cd backend && python -m pytest -x -n auto --tb=short`) to confirm
  the pre-pass AND the post-pass additions don't change output for any
  project without a `'layer'` node (the rollback guarantee is only credible if
  the existing suite stays green for BOTH new passes, not just the new
  tests).

### Frontend (Vitest component + unit)
- Unit: `project-persistence.ts` load-time validator — `'layer'` kind
  round-trips (accepted, params sanitized) for both stages and all 9 reads,
  matching the backend schema test shape (Packet 1).
- Component: `MaskStackPanel.layertap.test.tsx` — the oracle cases listed
  under Packet 8, including the stage-toggle and per-read conditional UI
  (mock IPC per repo convention: `window.entropic.sendCommand` stubbed, no
  real backend).
- Component: `DeviceCard.tsx` regression only (no new test needed per code-
  ground-truth #8/#9 — assert the EXISTING `DeviceCard` test suite still
  passes unmodified with a `'layer'`-kind node present in `maskNodes`, for
  both stages, proving the "zero changes needed" claim rather than just
  asserting it).
- Run: `cd frontend && npx --no vitest run` (project-local, per repo
  CLAUDE.md convention — NOT bare `npx vitest`, which picks up E2E specs).

### BDD scenario coverage (from `creatrix-moire-generator-bdd.md` Feature 7/8, scoped to the T1-expanded v1)
The following scenarios are IN v1 scope per the T1 override and map to the
oracles above; `paint` source, the transform gizmo, promote-to-matte-track,
and `util.transform` remain explicitly OUT per proposal.md's untouched
non-goals (T1 overrode OD-1/OD-3 only, not those non-goals):
- "Full-color source is the normal case" → Packet 2 oracle (a) (`pre`) and
  Packet 3 oracle (a) (`post`).
- "The read taxonomy" → NO LONGER narrowed by OD-3; all 9 reads are in scope
  and tested (Packets 4/5/6/7's oracles).
- "New track-level source type" (hover + commit + MK.3 per-effect
  assignability) → Packet 8 oracles (a)/(b) + code-ground-truth #8/#9 for the
  "assignable via MK.3" half.
- Feature 8 "Error containment" (source track deleted → flat 0.5 + red-dashed
  chip + toast) → Packet 8 oracle (d) for the chip, for both stages; toast
  wiring is a small addition to the same derived-check path (fire once via
  the existing toast store's rate-limited `addToast`, source-keyed, per repo
  Toast Conventions in root `CLAUDE.md`) — implementer adds this alongside
  (d), no separate packet.
- Any Feature 7/8 scenario specifically about `stage: post` behavior (source's
  finished contribution, mask-stack-inclusive) → Packet 3's oracles (a)-(d),
  now directly testable where the original plan could only assert them as
  "deferred."

## Sequencing

Packet 1 → {Packet 2, then Packet 3} (hard dependency: Packet 3 shares Packet
2's `ctx.extra`/tap-cache/`track_id` wire plumbing and cannot start its
dependency-graph work meaningfully before Packet 2's `pre` pass exists,
even though `post` is architecturally independent of `pre`'s DATA). Packets
4/6/7 (luma-family, colorkey, ai_person) can proceed in parallel once Packet 2
lands, since none of them need Packet 3's state machinery. Packet 5 (motion/
edges) additionally needs Packet 3 for its persisted-state slot mechanism
before its `post`-stage cases are meaningful (its `pre`-stage cases can land
against Packet 2 alone, with `post` cases marked `xfail` until Packet 3
lands). Packet 8 (UI) can start layout/interaction work against Packet 1's
stub in parallel with all of the above, but its oracles only pass meaningfully
once Packets 2–7 are ALL in — land the full read taxonomy + both stages
before merging Packet 8's integration assertions as "real" (interim: mark
stub-dependent assertions `xfail`/skip per repo convention).
