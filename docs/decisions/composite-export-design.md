# Composite-export design — the missing foundation under P5a.4

**Status:** Decided 2026-06-12 · **Spike:** P5a.4a (docs-only design authority for RISK:HIGH P5a.4)
**Owner:** P5a.4a → consumed by P5a.4 (`feat/p5a4-export-voice-replay`)
**Scope:** How does Entropic export a multi-layer / multi-voice composite to a video file, given that `ExportManager` is single-input only on `origin/main`? This record is the decision P5a.4 implements; P5a.4's amendment (2026-06-11) names it the design authority. To diverge, amend this doc in the same PR with a DEC note.

> **Ground-truth note (drift recorded):** The packet's anchors were written against pre-slice-3c
> line numbers. The slice-3c merge (#191, P2.2c composite-as-terminal-effect) moved `render_composite`
> from `compositor.py:~82` to **`compositor.py:161`** and added `_resolve_compositing` at
> **`compositor.py:102`**. The void this spike fills is intact: `ExportManager.start` is still
> single-input at `export.py:169`, and `docs/decisions/composite-export-design.md` did not exist before
> this file. All `file:line` refs below are re-verified against HEAD `bcef510` (origin/main, 2026-06-12).

---

## Context

The export engine on `origin/main` is **single-input only**. Every consumer assumes one source clip,
decoded by one reader, run through one effect `chain`:

- `ExportManager.start(input_path, output_path, chain, project_seed, settings, text_layers)` —
  `backend/src/engine/export.py:169`. The signature carries a single `input_path: str`
  (`export.py:171`) and a single `chain: list[dict]` (`export.py:173`). There is **no** `layers`,
  `events`, `performance`, or `composite` parameter.
- `ExportManager._run_export(...)` — `backend/src/engine/export.py:311`. Opens **one** reader
  (`ImageReader`/`VideoReader`, `export.py:324-327`), derives one `resolution = (source_w, source_h)`
  (`export.py:347`), and for each frame calls `apply_chain(frame, chain, project_seed, src_idx, resolution, states)`
  exactly once (`export.py:416`). Text layers are alpha-composited on top afterward
  (`_composite_text_layers`, `export.py:489`), which is the *only* multi-source mixing the export
  path does today — and it is bespoke text-only blending, not the layer compositor.
- The GIF path `_export_gif` (`export.py:532`) and image-sequence path `_export_image_sequence`
  (`export.py:590`) both build their `frame_gen()` from the same single `reader.decode_frame(src_idx)` +
  single `apply_chain` shape (`export.py:548-560`, `export.py:605-617`).
- Audio mux `_mux_audio` (`export.py:647`) pulls audio from the single `input_path`.

By contrast, the **preview/live** compositor already exists and is the v3 source of truth:

- `render_composite(layers, resolution, project_seed=0, layer_states=None)` —
  `backend/src/engine/compositor.py:161`. Takes a **list of layer dicts** (bottom-to-top), applies
  each layer's `chain` via `apply_chain` (`compositor.py:231-235`), resolves opacity/blend mode from the
  terminal `composite` effect via `_resolve_compositing` (`compositor.py:102`, `compositor.py:220`),
  multiplies per-clip opacity via `_clip_opacity` (`compositor.py:143`, `compositor.py:227`), and blends
  onto a float32 canvas (`compositor.py:215`, `compositor.py:258`). It optionally threads per-layer
  effect state when `layer_states` is provided, returning `(frame, new_layer_states)`
  (`compositor.py:236-237`, `compositor.py:262`).
- The IPC entrypoint `_handle_render_composite` (`backend/src/zmq_server.py:891`) decodes each layer's
  asset, enforces the layer cap (`validate_composite_layer_count`, `zmq_server.py:899`), rejects negative
  `frame_index` and v2 compositing shapes, builds a stable `layer_id` (`asset:{path}` / `text:{id}`,
  `zmq_server.py:984-987`), computes a `layer_signature` + `anchor_frame` (`zmq_server.py:1015-1019`),
  fetches per-layer state via `_get_composite_states` (`zmq_server.py:806`), calls `render_composite`
  (`zmq_server.py:1023`), then writes states back via `_save_composite_states` (`zmq_server.py:838`).
- Per-layer state cache mechanics: `_get_composite_states` (`zmq_server.py:806`) is keyed
  `(layer_signature, frame_index - 1)` and **cold-resets the whole dict** on any signature change or
  non-monotonic frame (`zmq_server.py:833-836`); `_save_composite_states` (`zmq_server.py:838`) stamps the
  new key. This is the same caching pattern the export must thread per-frame.

There is also a **single-frame** composite-export precedent already on main:

- `_handle_export_frame` (`zmq_server.py:627`) writes one composited **PNG** by calling
  `_render_composited_frame` (`zmq_server.py:493`). Note: `_render_composited_frame` is *single-clip*
  despite its name — it opens one reader and runs one `apply_chain` (`zmq_server.py:528-577`); it is the
  render core of `_handle_render_frame`, **not** the multi-layer compositor. So no multi-layer *video*
  export path exists; the void is real.

Caps and budgets the design must respect (all on main, all trust-boundary enforced):

- `MAX_COMPOSITE_LAYERS = 50` (`backend/src/security.py:48`), enforced by
  `validate_composite_layer_count` (`security.py:279`) at the top of `_handle_render_composite`
  (`zmq_server.py:899`) before any decode.
- `MAX_CHAIN_DEPTH = 10` (`security.py:42`), enforced per layer by `validate_chain_depth`.
- `SESSION_BUDGET_BYTES` (`backend/src/safety/pressure/budget.py:41`) — session-start
  `psutil.virtual_memory().available`, the single RAM denominator (DEC-Q7-011; ROADMAP G14 addendum).
- Determinism primitive: `derive_seed(project_seed, effect_id, frame_index, user_seed)`
  (`backend/src/engine/determinism.py:7`) — pure SHA-256 of the context key; no wall-clock, no counters.
- Transport: `encode_mjpeg` (`backend/src/engine/cache.py:11`) drops alpha (RGB only) for preview;
  export instead writes via `VideoWriter` (lossy codec) or PNG/GIF.

P5a.4's job is to feed `render_composite` a **per-frame layer list reconstructed from the serialized
performance event list** (`evaluate_voices` mirror of `voiceFSM.ts`), keyed `voice:{voiceId}` where
`voiceId = voice:{instrumentId}:{triggerFrame}:{eventIndex}` (P5a.2 contract; packet line 96/297). This
doc decides *how* that feeding happens.

---

## Options

### O1 — Per-frame `render_composite` reuse inside `_run_export` (RECOMMENDED)

`ExportManager.start` gains an optional `performance: {events, instruments, assets}` payload. When
present, `_run_export` takes a composite branch: for each output `frame_index`, call
`evaluate_voices(events, frame_index, opts)` to get the active voices, build the per-voice layer dicts
(decode each voice's asset frame + attach its `chain` + `voice_id`), then call the **already-merged**
`render_composite(layers, resolution, project_seed, layer_states)` with per-voice state threaded across
frames, exactly as `_handle_render_composite` does in preview. Encode each composited frame through the
existing `VideoWriter`/GIF/image-sequence sinks.

- **Pros:** Reuses the v3 compositor verbatim — opacity/blend resolution, the float32 canvas, the
  `_resolve_compositing` terminal-composite contract, and the `layer_states` threading are all the
  *same code path* preview uses, so preview and export cannot drift. Streaming: one composited frame in
  RAM at a time (plus N decoded layer frames for that frame only). Sits inside the export loop that
  already owns the writer, FPS conversion (`_compute_frame_indices`, `export.py:276`), cancel, and
  progress. Determinism is inherited from `derive_seed` + the same `apply_chain` order.
- **Cons:** `_run_export` grows a branch; the per-frame layer-build (decode each voice's footage frame)
  adds a second decode dimension. Per-voice readers must be cached across frames to avoid re-opening on
  every frame (mitigation: a `{asset_path: reader}` map for the export's lifetime, closed in `finally`).
- **Risk:** LOW. No new compositor code; the blast radius is one new branch in `_run_export` plus a pure
  `evaluate_voices` module. Honors the P5a.4 DO-NOT-TOUCH REUSE mandate literally.

### O2 — Headless re-render through the preview composite handler (`export_frame`-style loop)

Drive export by calling the IPC composite path per frame — loop the frontend (or a backend shim) over
`render_composite`/`_handle_render_composite` once per frame, collecting frames and muxing them outside
`ExportManager`, mirroring how `_handle_export_frame` (`zmq_server.py:627`) writes a single PNG today.

- **Pros:** Maximal reuse of the *handler*, not just the function — validation, layer-cap, and v2-shape
  rejection in `_handle_render_composite` come for free. The single-frame precedent already exists.
- **Cons:** Couples export to the ZMQ request/response envelope — every frame becomes an IPC round trip
  (or a re-entrant handler call) with base64/JPEG transport (`encode_mjpeg` drops alpha, `cache.py:13`),
  which is *lossy* and *RGB-only* — unacceptable for a video master. It also bypasses `ExportManager`'s
  FPS conversion, cancel, progress, and audio mux, which would have to be re-implemented. The composite
  state cache (`_get_composite_states`) is a per-server singleton keyed by signature; running an export
  loop through it would fight live-preview cache occupancy.
- **Risk:** MEDIUM-HIGH. Transport quality loss + duplicated export plumbing + cache contention.

### O3 — Two-pass bake-then-composite

Pass 1: render each voice/layer's full effect chain to its own intermediate clip on disk (one
`apply_chain` stream per layer). Pass 2: composite the N baked clips frame-by-frame via a thinned
`render_composite` (compositing only, chains already applied) into the final master.

- **Pros:** Each pass is simple and independently testable; pass 1 reuses the existing single-input
  `_run_export` shape per layer; peak *live* layer count is decoupled from disk.
- **Cons:** N intermediate files × full resolution × full duration = large disk + 2× decode/encode work.
  Voices are **transient** (born/stolen/released per the FSM) — "one clip per layer" doesn't map to a
  performance where layers appear and vanish per frame; you'd bake mostly-empty clips or invent a
  clip-segmentation pass. Determinism now spans an intermediate codec round-trip (lossy unless lossless
  intermediates, doubling disk again). Re-implements compositing-only logic, partially forking
  `render_composite` (violates REUSE).
- **Risk:** MEDIUM. Disk blowup + voice-transience impedance mismatch + partial compositor fork.

### O4 — Frontend-driven canvas export (out of scope, listed for completeness)

Composite in the renderer (frontend) and ship finished frames to a backend muxer.

- **Pros:** Reuses the live preview pixels the user already sees.
- **Cons:** Browser/WebGL compositing is **not byte-identical** to the Python float32 compositor — it
  would *guarantee* the determinism gate fails. Moves the security boundary (layer cap, path validation)
  into the renderer. Directly contradicts the global rule "determinism gates run the EXPORT path, never
  the live preview path."
- **Risk:** HIGH. Rejected on determinism grounds alone.

---

## Recommendation

**Adopt O1 — per-frame `render_composite` reuse inside `_run_export`.** It is the only option that
(a) reuses the merged compositor verbatim so preview and export cannot drift, (b) keeps a lossless
RGBA pixel path into `VideoWriter` (no `encode_mjpeg` round-trip), (c) inherits FPS conversion, cancel,
progress, and audio mux from the existing `_run_export`, and (d) threads per-voice `layer_states`
exactly as preview does. O1 **fits P5a.4's ~4h budget**: the new surface is one pure module
(`voice_replay.py`, a line-for-line port of `voiceFSM.ts`) plus one branch in `_run_export` that builds
layer dicts and loops `render_composite` — no new compositor code, no new transport, no new sink. If the
encoder integration plus the FSM port together exceed ~4h, **split per the packet's own escape hatch:
ship `voice_replay.py` + golden-vector replay-correctness tests as P5a.4, and file the
`_run_export` composite-branch encoder integration as P5a.4b** — do not half-integrate.

---

## Render-path reuse vs re-render

**Stance: REUSE `render_composite` — uphold P5a.4's DO-NOT-TOUCH mandate; do not fork it.**

The packet's DO-NOT-TOUCH is explicit: "export must REUSE `render_composite`, not fork it"
(phase-5a.md P5a.4 DO-NOT-TOUCH). This doc upholds that, and the codebase makes reuse the cheap path:
`render_composite` (`compositor.py:161`) is already a pure `(layers, resolution, project_seed,
layer_states) -> (frame, new_states)` function with no IPC/server coupling — it is directly callable
from `_run_export`. The opacity/blend contract (`_resolve_compositing`, `compositor.py:102`), the
per-clip opacity multiply (`_clip_opacity`, `compositor.py:143`), and the state-threading return shape
(`compositor.py:236`, `compositor.py:262`) are exactly what export needs.

What export does **not** reuse is the *handler* `_handle_render_composite` (`zmq_server.py:891`) — that
is preview-transport plumbing (base64/JPEG, the singleton state cache, the ZMQ envelope). Export
re-implements the thin layer-assembly around `render_composite` (decode footage per voice, attach chain,
set `voice_id`, thread a *local* `layer_states` dict), reusing the **validation logic** by calling the
same `security.py` validators (`validate_composite_layer_count`, `validate_chain_depth`) rather than
duplicating their constants. The state cache key must be `voice:{voiceId}` (not preview's
`asset:{path}`), matching the P5a.2 contract — that is a different *key*, not a different *function*.

This section does **not** overturn the REUSE mandate. The only place a fork would be tempting is O3's
compositing-only second pass; O1 avoids it entirely.

---

## Memory strategy

**Model: streaming, one composited frame at a time; peak RSS bounded by the per-frame working set, not
by the export length.**

For a worst-case composite of `N = MAX_COMPOSITE_LAYERS = 50` (`security.py:48`) layers at resolution
`W × H`, the peak working set during a single frame's composite is:

- Decoded layer frames: `N × W × H × 4 bytes` (RGBA uint8). At 4K (3840×2160): `50 × 3840 × 2160 × 4`
  ≈ **1.58 GiB** if all 50 are held simultaneously.
- The float32 canvas inside `render_composite`: `W × H × 4 × 4 bytes` ≈ **127 MiB** at 4K
  (`compositor.py:215`, single canvas reused across layers).
- Per-layer `apply_chain` transients (effect-dependent; bounded by `MAX_CHAIN_DEPTH = 10`).

**Streaming refinement (the design O1 ships):** `render_composite` already blends layers one at a time
into the canvas (`compositor.py:215-258`), so layers do **not** all need to be resident at once *if* the
export builds the layer list lazily — but the current `render_composite` signature takes the full
`layers` list up front, so the honest peak for the merged function is "all N decoded frames for this
frame." Two bounds keep this safe:

1. **Voice cap << layer cap.** A performance export's N is the active-voice count, governed by the FSM
   voice cap (4 in B2; P5a.2's `MAX_TOTAL_VOICES_PER_RENDER`), not 50. Real peak ≈ `4 × W × H × 4`
   ≈ **127 MiB** at 4K + canvas. The 50-layer worst case is the *security* ceiling (hostile/hand-edited
   project), not the expected path — but the export MUST survive it without OOM, hence the cap check.
2. **Enforce-before-decode.** Mirror `_handle_render_composite`'s order (`zmq_server.py:899`): validate
   layer/voice count *before* decoding any footage, so a 50×4K hostile payload is rejected, never
   buffered. The export branch calls `validate_composite_layer_count` (and the P5a.4 per-frame
   `validate_voice_layers` budget) before the decode loop.

**Relation to SG-8 / G14:** All RAM math uses the one denominator `SESSION_BUDGET_BYTES`
(`budget.py:41`; ROADMAP G14 addendum, "All RAM math uses one denominator"). On a 16 GiB target that is
~10–11 GiB available. The expected per-frame peak (~127 MiB working set + readers) is a small fraction;
the hostile 50×4K peak (~1.7 GiB) is still under budget but is the reason the cap is a hard reject, not a
soft warn. Export does **not** add a new memory pool — it streams through the writer and never holds more
than the current frame's layers + one encoded frame. This is consistent with the G14 addendum's
"enforce-before-decode" principle stated for B6 Frame-Bank (P5b.9). No relation to SG-8 stage-shedding is
required because export does not hold a growing buffer; if a future B6 frame-bank export raises the live
peak, that integration (not P5a.4) must register with SG-8.

---

## Determinism contract

**Requirement: two exports of the same project produce byte-identical files** (`shasum -a 256` equal) —
asserted on the EXPORT path, never the preview path (global rule). The contract:

- **Seed handling.** All randomness flows through `derive_seed(project_seed, effect_id, frame_index,
  user_seed)` (`determinism.py:7`) — pure SHA-256, no wall-clock, no process state. The export passes the
  project's `project_seed` into `render_composite` (`compositor.py:161` `project_seed` param), which
  forwards it to each layer's `apply_chain` (`compositor.py:231-235`). Same seed + same frame_index +
  same chain → same pixels.
- **Per-voice state threading, keyed `voice:{voiceId}`.** The export threads `layer_states` across
  frames exactly as preview does, but keyed by `voiceId = voice:{instrumentId}:{triggerFrame}:{eventIndex}`
  (P5a.2 contract; phase-5a.md line 96/297) — a *deterministic* key with no counters. Because `voiceId`
  is derived purely from `(instrumentId, triggerFrame, eventIndex)`, replaying the same event list
  yields the same voiceIds in the same order, so stateful effects (datamosh, frame_drop) accumulate
  identically across runs. Stolen voices drop their state surgically (survivors keep theirs) — P5a.2's
  cleanup contract; the export inherits it by reusing the same key scheme.
- **No hidden incremental state.** `evaluate_voices(events, frame_index, opts)` is a pure replay of the
  event list ≤ frame_index (mirrors `voiceFSM.ts` `evaluateVoices`, phase-5a.md line 97) — no counters,
  no wall-clock, no `performance.now()`. Glide/ADSR derive their per-frame value from
  `(triggerFrame, frameIndex)`, never from accumulated mutation (P5a.6 rule, generalized here).
- **Excluded from the hash gate.** Following the **B7 `interp:'flow'` precedent** (phase-5b.md P5b.15):
  optical-flow interpolated frames are platform-non-deterministic and are **excluded from the export
  hash gate** — marked non-deterministic, asserted for *correctness* not *byte-identity*. P5a.4 does not
  ship flow, so for B2 the entire composite output is in-gate. The contract reserves the same exclusion
  mechanism: any future layer whose effect is provably non-byte-deterministic across platforms (GPU
  passes, B7 flow) is tagged out of the hash gate and gated on structural/perceptual equality instead.
  Audio mux is also out of the *pixel* hash gate (it operates on the muxed container, asserted
  separately).
- **FPS alignment.** Same events at 30fps vs 60fps must land triggers on the same timeline *seconds*
  (P5a.4 acceptance gate; INSTRUMENTS-BUILD-PLAN B2 OUT-gate). `evaluate_voices` keys on `frame_index`,
  and `_compute_frame_indices` (`export.py:276`) maps output frames to source frames by time, so the
  replay must compute trigger frames from `(time_s × fps)` consistently — the byte-identity gate at a
  fixed fps plus the cross-fps time-alignment test together pin this.

---

## Test obligations

P5a.4 must ship these named tests to honor this design (the packet already enumerates most; this section
binds them to the decisions above):

- **`backend/tests/test_voice_replay.py`:**
  - "python replay matches TS golden vectors exactly" — pins `evaluate_voices` to a committed JSON
    fixture dumped from the vitest `voiceFSM.test.ts` suite (Render-path-reuse: same semantics, two
    languages).
  - "export twice produces byte-identical files (sha256)" — the core Determinism-contract gate, on the
    EXPORT path.
  - "edit-after-capture: changing pad modRoutes after capture does not change export output" — events
    carry no `modRoutes` (P1-2 condition 3); proves the replay reads only the serialized event list.
  - "malformed event list rejected at export start (fuzz: NaN frameIndex, velocity 999, unknown kind)" —
    trust-boundary rejection, no crash (Memory-strategy enforce-before-decode posture).
  - "oldest-steal at cap reproduces identically across replays" — deterministic voiceId + steal order.
  - "stateful effect per-voice state threads across exported frames" — proves `voice:{voiceId}` keying
    threads datamosh/frame_drop state across the export loop.
  - "event list of 10,001 events rejected at export start (MAX_CAPTURE_EVENTS, negative)" — the new
    `security.py` cap; reject, never truncate.
- **Schema (`backend/src/project/schema.py` tests):**
  - "project load rejects event referencing unknown instrumentId" — referential integrity on FILE LOAD
    (§10 P1-2).
- **Cross-fps:** "same events at 30fps and 60fps land triggers on the same timeline seconds" —
  Determinism-contract FPS alignment.
- **Memory:** a test (or documented soak) that a 50-layer (`MAX_COMPOSITE_LAYERS`) export payload is
  rejected/capped before decode, never buffered — upholds the Memory-strategy enforce-before-decode
  bound. (If implemented as a cap-rejection unit test rather than an RSS soak, state that in the PR.)

These are the obligations; P5a.4's TEST PLAN block is the canonical command list. Any divergence from
this design (e.g. choosing O2/O3) requires amending this doc with a DEC note in the same PR.
