# MK.12 — AI Subject Matte (RVM) · PRD

**Status:** approved-to-build (user, 2026-07-02) · **Engineering packet:** `packets/masking.md` MK.12 (locked decisions D1–D7 in `SELECTION-MASKING-SPEC.md` §14 apply) · **Demo evidence:** `~/Desktop/d5-rvm-demo/` (2026-07-02)

## Stakeholder input (verbatim, immutable)

> "YES include RVM that would be incredible we need to figure out how it sits in the flow and all its
> params though -- walk through all the use cases and create a prd for it" — user, 2026-07-02

Earlier framing (D5 demo request): *"demo d5 first"* → demo delivered same day: RVM resnet50, local CPU,
1940s factory footage — subject stayed clean B&W while the background dissolved into false-color glitch.
User verdict: include.

## What it is

One click on a clip generates an **AI subject matte**: a per-frame grayscale alpha video (person = white)
baked offline by Robust Video Matting (local, no cloud, no footage leaves the machine), cached, and exposed
as an `ai_matte` node in the clip's existing matte stack. Everything downstream already exists: matte ops
(feather/grow/invert/boolean), device- and chain-level mask routing, cut/copy-to-track, alpha export.
MK.12 adds the matte *source* and one composite gesture — **Split by matte** — that turns a clip into
subject + background twin tracks with complementary mattes.

## Use cases (the walkthrough)

| # | Use case | Flow | Ships in |
|---|----------|------|----------|
| U1 | **The music-video shot** — background glitched, subject untouched (the demo) | clip → Generate AI matte → Split by matte → drop any device chain on the *background* twin | MK.12a |
| U2 | **Subject-only destruction** — glitch the person, background pristine | same, chain on the *subject* twin (or single-track: ai_matte node + per-device mask row, no split needed) | MK.12a |
| U3 | **Subject lift** — the person becomes an independent asset: move, scale, rotate on their own track; with WS4, *animate* the subject's transform | Split by matte → transform the subject twin (bounding box); transform-automation lanes apply per WS4 | MK.12a (+WS4) |
| U4 | **Reusable overlay export** — isolated subject with real alpha for use in other projects/tools | subject twin → export ProRes 4444 (MK.10 path, already honors matte alpha) | MK.12a |
| U5 | **Fixing AI misses** — RVM locks onto the dominant figure (demo: ignored the second woman); user corrects by stacking | ai_matte + lasso node (op=add) around the missed person, or wand (op=subtract) to remove a false grab — existing boolean stack, zero new code | MK.12a |
| U6 | **Hybrid keys** — AI matte intersected with chroma/luma keys for edge quality (hair against green) | ai_matte (op=add) then chroma_key node (op=intersect) in the same stack | MK.12a |
| U7 | **Subject-driven modulation** — subject size/position drives effect params ("the closer she gets, the harder it glitches") | `mask_coverage(ai_matte_node)` as a modulation source | MK.12c (needs MK.11's coverage tap) |
| U8 | **Multi-person scenes** — separate matte per person | v1 limitation (single dominant-subject bias, demo-confirmed). Mitigations now: U5 corrections; per-range bakes. Real fix: ROI-hinted bakes or cloud BiRefNet (both out of v1) | MK.12c / later |
| U9 | **Matte library / batch pre-bake** — queue mattes for a bin of clips overnight | job queue accepts N clips; cache makes them free afterward | MK.12b |
| U10 | **Subject inside instruments** — sampler/rack voices sourcing only the subject | out of scope v1 (needs matte-in-voice routing); the Split workaround covers most cases (trigger the subject twin's track) | not scheduled |

## How it sits in the flow

1. **Entry points:** clip context menu → "Generate AI matte (local)…" (primary, per packet); mask tool tab
   gains an "AI Subject" entry (MK.13 tab) that invokes the same command on the selected clip.
2. **Bake lifecycle:** async sidecar job (export-job pattern): progress toast with % + cancel. Measured
   reality (2026-07-02 demo): 3.4 fps at 640×480/ratio 0.5; earlier figure-isolator test: 15.6 fps at
   480p/ratio 0.25. Rule of thumb shown in the toast: **~2–10× clip duration** depending on quality param.
   First-ever run downloads 103 MB weights (progress surfaced; packet precondition).
3. **Cache:** `~/.creatrix/mattes/<content_hash>.mp4`, hash = source + frame range + bake params. Param
   change → new bake; same params → instant cache hit. 128 MiB pool, SG-8-independent eviction (D5).
4. **Result:** `ai_matte` MatteNode appended to the clip's stack — behaves like every other matte node
   (all MK.7 ops apply). Missing/evicted cache file → flat-0.5 + warning, never a crash (MK.3 semantics).
5. **Split by matte:** one click, one undo entry → twin track above (same source), subject twin carries
   `maskRef` to the ai_matte node, background twin the inverted ref. Track names: `<clip> · subject`,
   `<clip> · background`.
6. **Export parity:** free — all render paths already route through the single `apply_masks_to_chain` seam.

## Parameter surface

**Bake-time (job params — re-bake to change):**

| Param | Range | Default | Why |
|-------|-------|---------|-----|
| `quality` (downsample_ratio) | 0.1–1.0 presets: Fast 0.25 / Balanced 0.4 / Fine 0.6 | 0.25 | dominant speed/edge-quality trade; demo used 0.5 |
| `max_dimension` | 480–2160 | 1080 | OOM cap (packet); 4K sources downscaled for matting only |
| `frame_range` | in/out or whole clip | whole clip | partial bakes for long sources |

**Node-time (live, no re-bake — standard MK.7 ops):** op (add/subtract/intersect), invert, feather 0–100,
grow/shrink −50..+50, enabled. **MK.12b additions:** alpha `levels` (low/high cut + gamma on the matte —
tighten a mushy edge without re-baking), `temporal_smooth` (0–4 frame box filter on alpha — kills matte
flicker).

**Split-time:** none (deliberate — one gesture; all tuning lives on the node).

**Explicitly out (locked decisions):** cloud BiRefNet (D2 — stays out until per-project opt-in), model
picker (resnet50 only in v1; mobilenetv3 "draft" tier is a possible MK.12b preset), torch in the sidecar
process (D6 — separate venv subprocess).

## Performance & storage model

- Bake: CPU-bound, off the render thread (heartbeat guard in packet). 8 s clip ≈ 20–70 s bake.
- Matte storage: grayscale video, not PNGs — demo's 8 s/240-frame matte was **0.6 MB**. A 5-min clip
  ≈ 22 MB; the 128 MiB pool holds ~6 five-minute mattes before eviction.
- Live cost after bake: an ai_matte node costs one video-frame lookup + the standard masked-blend
  (task #44 perf economics apply — same as any matte).

## Phasing

- **MK.12a = the existing packet, unchanged** (bake job + ai_matte node + Split by matte + tests/gates).
- **MK.12b:** alpha levels + temporal smoothing node params · batch queue (U9) · "draft quality" preset.
- **MK.12c:** `mask_coverage` mod source for ai_matte (U7, after MK.11) · multi-subject exploration (U8:
  ROI-hinted bakes; cloud tier only on explicit user opt-in).

## Acceptance

MK.12a ships when the packet's 8 named tests + integration + CU visual gate pass (packet §gates), plus
PRD-level demo criterion: U1 reproduced **in-app** on the same factory clip used in the 2026-07-02 demo —
Generate → Split → glitch background → subject clean in preview AND in a ProRes 4444 export.
