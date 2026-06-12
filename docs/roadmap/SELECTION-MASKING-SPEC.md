# Creatrix Selection / Masking / Alpha — Workstream Spec

**Date:** 2026-06-12 · **Author:** Fable (CDO/CTO pass) · **Status:** proposed (packets in `packets/masking.md`)
**Ground truth verified against:** `origin/main` @ `95e9b1b` on 2026-06-12 (every file:line anchor below
re-checked at that SHA; packets re-verify at pickup per EXECUTION-PLAN §1).
**Companions:** `EXECUTION-PLAN.md` §1 (packet contract) · `ROADMAP.md` §2.5/§3 · `PERF-MODEL.md` ·
`DESIGN-SPEC.md` · `packets/phase-6.md` (C2/C3 field params) · `packets/phase-tier3.md` (binding rules,
render taps) · `packets/parallel-track.md` (PD.5/PD.6 — **superseded by this spec**, see §12).

---

## 1. Thesis — spatial routing, not Photoshop cosplay

**Masks are the spatial routing primitive of the instrument.** C4 (band-isolated effects, merged #165)
made any effect apply through a *frequency band*; masks are its spatial twin on the X/Y axes of the
6-axis paradigm: **any device chain applies THROUGH a matte** — effect inside, dry outside, invertible.
The center of gravity is **region-isolated effect chains** (glitch the background, keep the figure
clean — or the inverse), not a parity checklist.

Photoshop parity (marquee / lasso / wand / color range / feather / booleans / delete / cut-to-layer) is
**the floor, Phase A** — it is how mattes get *made*. The mask-routing wrapper is what mattes are *for*,
and it ships immediately after the alpha plumbing (MK.3), not at the end.

Three consumption modes for one matte:

1. **Layer alpha** — matte multiplies the layer's per-pixel alpha pre-blend (delete-inside/outside →
   real transparency).
2. **Mask routing (headline)** — per-device or per-chain `maskRef`: effect output blends with input
   through the matte (`out = dry·(1−m) + wet·m`). The backend seam **already exists**:
   `EffectContainer` pipeline is literally `mask → process → mix`
   (`backend/src/engine/container.py:1`, `_mask` popped at `:58`, blend at `:130–133`) — and has
   **zero senders** today (grep `_mask` over `frontend/` + `zmq_server.py` → 0). MK.3 is plumbing +
   chain-level semantics, not invention.
3. **Mod source** — a procedural matte's mean coverage is a scalar mod source (T3.11 render-tap
   pattern: 64×64 proxy, single-tick delay, SG-5-gated for feedback).

**Keying is temporal selection / keying is performance.** A chroma/luma key is a *procedural matte*
re-evaluated per frame; its params (target hue, tolerance, softness, spill) are **lanes from day one**
— sidechainable, LFO-able, beat-gateable, riding the same machinery that already modulates `_mix`
(F-0516-9 synthetic target, `ModulationMatrix.tsx:20–31` + `pipeline.py:196–201` setdefault). "Delete
a specific color throughout the clip" is a color-range matte × delete-outside; the performance story
is the *same matte* modulated live.

## 2. Ground-truth audit (verified @ 95e9b1b — corrections to the planning assumptions)

| # | Finding | Anchor | Consequence |
|---|---|---|---|
| GT-1 | **The pipeline is already RGBA end-to-end.** `apply_chain` contract: "Input RGBA frame (H, W, 4) uint8" ; compositor canvas is RGBA float32. | `pipeline.py:123`, `compositor.py:195` | Alpha *carriage* is done; this workstream builds alpha *honoring*. |
| GT-2 | **Per-pixel alpha is carried but never honored in compositing.** All 9 `BLEND_MODES` functions take `(base, layer, opacity)` with a **scalar** opacity; the alpha channel is blended *as if it were a color channel* — a layer's `a=0` pixels still paint their RGB over the base at full weight. | `compositor.py:19–79` | MK.2 = alpha-weighted blend. The fix is math inside 9 small functions + the canvas flatten, not an architecture change. |
| GT-3 | **`fx.chroma_key` and `fx.luma_key` already exist** (category `"key"`), write per-pixel alpha, and multiply with incoming alpha. **But because of GT-2 + GT-4 they are shipped-but-dark: visually near-no-ops in preview AND export today** (alpha written, then ignored/dropped). | `effects/fx/chroma_key.py`, `effects/fx/luma_key.py` | A real, currently-live bug this workstream fixes as a side effect of MK.2/MK.10. MK.8 refactors both onto a shared key-kernel and adds spill suppression. |
| GT-4 | **Export destroys alpha one line before the encoder.** `CODEC_REGISTRY` already has `prores_4444` with `pix_fmt: "yuva444p10le"` (`codecs.py:34–36`) — but `VideoWriter.write_frame` does `from_ndarray(frame_rgba[:, :, :3], format="rgb24")`. | `video/writer.py:44–46` | MK.10 is small: pix_fmt-aware frame handoff + round-trip proof. No new codec machinery needed for ProRes 4444. |
| GT-5 | **Decode already preserves alpha where the source carries it.** `VideoReader` decodes via `frame.to_ndarray(format="rgba")` (PyAV reformat keeps the alpha plane of `yuva*` sources, fills 255 otherwise); `.mov`/`.webm` are in the import allowlist (`App.tsx:189`). | `video/reader.py:49,:64` | MK.10's decode half is *verification tests*, not a build. |
| GT-6 | **The per-effect mask seam exists and is orphaned.** `EffectContainer.process`: `_mask` `(H, W)` float popped from params, dry/wet blended through it after `_mix`. Zero senders anywhere. | `container.py:58,:130–133` | MK.3's per-device path is: resolve matte → inject `_mask`. PD.6 had already spotted this seam. |
| GT-7 | **`_mix` is already a modulatable synthetic lane target** (F-0516-9): frontend prepends a synthetic `_mix` target per effect; `pipeline.py` defers via `setdefault` so routing-set values win. | `ModulationMatrix.tsx:20–31`, `pipeline.py:196–201` | The exact precedent for matte params as lanes (MK.8/MK.11) — no new routing system. |
| GT-8 | **P2.2c (composite-as-terminal-effect) HAS SHIPPED** — `_resolve_compositing` reads `{opacity, mode}` off the terminal `composite` chain entry; `apply_chain` strips it; trust-boundary clamps present. The planning brief's "DEPENDS P2.2c" is **already satisfied**. (ROADMAP §2's "3c ❌" row is stale — ledger-correction rides the PR that merges this spec, per ROADMAP §3 rule 8.) | `compositor.py:84–139`, `pipeline.py:140–148` | MK.2 extends shipped code; single-flight on `compositor.py` still applies. |
| GT-9 | **No pixel/region selection model exists in the frontend.** Selection state = `selectedTrackId`/`selectedClipIds` (`stores/timeline.ts:36–39`). `MarqueeOverlay.tsx` (UE.3, merged) is **timeline clip** selection — a different feature, untouched. Preview-canvas region select (PD.5) is unbuilt; `BoundingBoxOverlay.tsx`/`SnapGuides.tsx` hold the canvas→frame coordinate idiom to reuse. | greps @ 95e9b1b | MK.4 builds the preview selection surface; absorbs PD.5. |
| GT-10 | **figure-isolator is real and local-capable.** `~/Development/figure-isolator/backends/rvm_local.py` — RVM resnet50, CPU, 15.6 fps @480p, `output_format: "green"|"alpha"` (grayscale matte video); weights cached (103 MB torch hub). HANDOFF decided "standalone, NOT Entropic module" because bg-removal is preprocessing, not a per-frame effect. | `rvm_local.py:11–33`, HANDOFF.md | MK.12 ports it as an **offline matte-generation job** (job → cached matte video → procedural matte source) — which *respects* the original rationale (still preprocessing, now in-app). Cloud BiRefNet stays user-touch (§14). |
| GT-11 | **`LANE2D_MAX_RESOLUTION` (512×288) is for *parameter* fields only** (P6.2 schema, painted fields Tier 3). Mattes need full render resolution and get a **separate budget** (§3.3). | `packets/phase-6.md` P6.2 step 1 | No collision; the matte cache mirrors P6.3's `FIELD_CACHE_*` constants pattern with its own numbers. |
| GT-12 | Caps that bound this workstream: `MAX_CHAIN_DEPTH = 10` (`pipeline.py:24`), `MAX_COMPOSITE_LAYERS = 50` (`security.py:48`), `MAX_TOTAL_VOICES_PER_RENDER = 4` (P5a.2, merged), SG-8 pressure lib merged (`safety/pressure/budget.py`, live-gate wiring still ❌). | — | Matte caps in §3.3 compose with these; matte cache registers with SG-8. |

## 3. Data model

### 3.1 Matte

A **matte is a single-channel float32 field at render resolution, range [0,1]** — 1 = selected/inside.
`1920×1080×4 B = 8,294,400 B ≈ 7.91 MiB` per resolved 1080p matte (8.3 MB decimal). It is the *truth*;
selections are UI gestures that produce mattes.

### 3.2 MatteNode and the per-clip mask stack

Per-clip `maskStack?: MatteNode[]` (optional, additive — **no `PROJECT_VERSION` bump**, UE.7 precedent),
boolean-combined top-to-bottom. Persisted in the `.glitch` project JSON; load-time validator drops
malformed nodes with a toast and clamps params (trust boundary, P6.6 pattern).

```
MatteNode {
  id: string                     // ^[A-Za-z0-9_-]{1,64}$
  kind: 'rect' | 'ellipse' | 'polygon' | 'bitmap'      // static shapes
      | 'chroma_key' | 'luma_key' | 'color_range'      // procedural (per-frame)
      | 'ai_matte'                                     // precomputed matte video (MK.12)
  params: Record<string, number | string>              // kind-specific, clamped on load
  op: 'add' | 'subtract' | 'intersect'                 // boolean combine with stack-so-far
  invert: boolean
  feather: number                // px, gaussian, [0, 100]
  growShrink: number             // px, morphological, [-50, 50]
  transform?: { t: KeyframedXYScale }   // MK.11: T/Y/X/scale keyframes; full shape morph = spike
  enabled: boolean
}
```

- **Static** nodes (`rect/ellipse/polygon/bitmap`) resolve once and cache; `bitmap` is a baked
  single-frame matte (magic wand output) stored as PNG sidecar in the project dir (path-validated
  like `.glitch.bak` siblings, UE.4 pattern).
- **Procedural** nodes re-evaluate per frame (keys, color range, ai_matte frame lookup) — this is
  what makes "delete a color throughout" temporal by construction.
- **MatteRef** (`{clip_id, ...}` or inline stack reference + `invert`) is the handle consumed by the
  three §1 modes.

### 3.3 Budget (separate from LANE2D and FIELD_CACHE — quantified)

Constants in `backend/src/masking/matte_source.py` (NEW module family `backend/src/masking/`):

| Constant | Value | Rationale |
|---|---|---|
| `MATTE_CACHE_MAX_ENTRIES` | 32 | static mattes only; procedural are recomputed |
| `MATTE_CACHE_MAX_BYTES` | 128 MiB | ≈16 concurrent 1080p mattes; **separate** from P6.3's 256 MiB FIELD_CACHE (decision §14-5 if the user prefers a shared pool) |
| `MAX_MATTE_NODES_PER_CLIP` | 8 | stack depth cap, validated at IPC trust boundary |
| `MAX_PROCEDURAL_MATTES_PER_RENDER` | 4 | mirrors `MAX_TOTAL_VOICES_PER_RENDER`; 5th+ keyed clip in one composite → refused with structured error |
| SG-8 registration | cache halves at pressure stage 5 (82%) | mirrors B6 frame-bank convention (ROADMAP G14 addendum) |

### 3.4 Where mattes live in the render payload

`render_frame` / `render_composite` layers gain optional `mask_stack` (snake_case per IPC convention)
and per-effect `mask_ref`. Absent → byte-identical current behavior (additive, the P6.1 convention).
All numeric params cross the clamp boundary (`feedback_numeric-trust-boundary.md`).

## 4. Consumption modes (the §1 trio, concretely)

### 4.1 Layer alpha (delete-in/out, fill)

Resolved stack matte `m` multiplies the layer's alpha before the blend: `a' = a · m` (delete-outside)
or `a' = a · (1−m)` (delete-inside). "Fill with color" composites a solid through `m`. Requires MK.2
(GT-2) or the multiplication is invisible.

### 4.2 Mask routing — the universal wrapper (MK.3, the headline)

Mirrors C4's universal band wrapper, spatially:

- **Per-device:** `EffectInstance.maskRef?` → backend resolves the matte and injects `_mask` into the
  device's params; `container.py:130–133` does the rest **today** (GT-6). Cost: one float blend per
  masked device.
- **Per-chain:** `apply_chain` gains optional `chain_mask`; semantics are whole-chain wet/dry —
  snapshot input, run the chain, `out = in·(1−m) + chain(in)·m`. (Not equivalent to per-device on
  every stage; both ship, semantics documented.)
- Invertible at the ref (`maskRef.invert`).
- **Subject/background dual routing (MK.12):** one AI matte feeds two complementary chains. v1 needs
  **zero new engine machinery**: a "Split by matte" command duplicates the track (same source clip),
  assigns `maskRef` to one and the inverted ref to the twin — multi-track compositing (already shipped)
  does the rest. The music-video use case: glitch the background, keep the figure clean, or inverse.

### 4.3 Matte as mod source (MK.11, Phase B)

`mask_coverage(node_id)` = mean of the resolved matte on a 64×64 proxy → scalar source, previous-frame
value (single-tick delay) — exactly the T3.11 render-tap contract, and **gated on SG-5 merged** like
T3.11 (coverage → param that feeds the matte's own input is a feedback edge). Composes with
phase-tier3's `painted` binding rule (a matte IS a per-pixel field shaping a scalar — the B4-full
`painted` renderer can consume matte buffers when it lands; schema kept compatible).

## 5. Selection tools (UI-side producers; Phase A)

| Tool | Produces | Notes |
|---|---|---|
| Rect / ellipse marquee | static `rect`/`ellipse` node | preview-canvas drag; canvas→frame mapping per `BoundingBoxOverlay.tsx` idiom (Research-Gate citation in code); absorbs PD.5 |
| Lasso (freehand + polygon) | static `polygon` node | freehand = sampled polyline, RDP-simplified ≤ 256 vertices; polygon = click-to-place, double-click/Enter closes; Esc cancels |
| Magic wand | static `bitmap` node | contiguous flood-fill from seed pixel at current frame, `tolerance` in RGB distance; baked PNG sidecar |
| Select Color Range | procedural `color_range` node | **global** (non-contiguous) color distance + softness, re-evaluated every frame → "delete this color throughout" |
| Luma range | procedural `luma_key` node | threshold + softness, dark/bright mode |
| Chroma key picker | procedural `chroma_key` node | eyedropper target color + tolerance + softness + spill suppression |

Modifiers follow convention: **Shift = add, Alt/Option = subtract, Shift+Alt = intersect** (sets
`MatteNode.op` on the node being created). Matte ops: invert (per node), feather (gaussian px),
grow/shrink (morphological px) — all node fields, all lane-addressable in Phase B (keys: day one).

Operations on a selection: **delete-inside / delete-outside** (→ §4.1 transparency), **fill with
color**, **cut/copy to new track** (MK.9 — the clip-level absorption of task #45/PD.6: region becomes
a new clip on a new track carrying a `maskRef`, original optionally gets the inverse).

## 6. Keying = temporal selection = performance (MK.8)

- Shared kernel module `backend/src/masking/key_kernels.py`: chroma (HSV target/tolerance/softness +
  **spill suppression** — desaturate toward luma within spill radius of the key hue), luma, color-range.
- The existing `fx.chroma_key` / `fx.luma_key` effects (GT-3) are **refactored to call the same
  kernels** (single source of truth; both gain spill/quality improvements; their inline-alpha behavior
  is preserved and becomes *visible* once MK.2 lands).
- **Key params are lanes from day one:** matte node params addressable as synthetic targets
  `mask.<node_id>.<param>` riding the F-0516-9 `_mix` mechanism (GT-7) — render payload carries the
  per-frame resolved values; no new routing system.

## 7. Alpha end-to-end (MK.2 + MK.10)

1. **Decode** — already preserves alpha (GT-5); MK.10 adds verification tests (ProRes 4444 fixture →
   nonuniform alpha plane asserted) rather than code.
2. **Composite** — MK.2: per-pixel weight `w = layer_alpha · scalar_opacity` applied in all 9 blend
   modes (`out = f_mode(base, layer)` weighted by `w` per pixel; `normal` = alpha-over); output alpha
   = standard over-composite. **Straight (unpremultiplied) alpha** is used, matching the existing
   float32 channel convention — premultiply was considered and rejected for v1 (flagged §13-3): the
   golden no-regression gate ("fully-opaque inputs are byte-identical to current output") is trivial
   under straight alpha. Preview flattens the final RGBA canvas onto opaque `surface-0` (`#0B0B10`)
   before `encode_mjpeg` (checkerboard toggle = §14-4).
3. **Export** — MK.10: `VideoWriter` becomes pix_fmt-aware (alpha-capable pix_fmt → hand PyAV the
   full RGBA plane; RGB codecs byte-identical). ProRes 4444 round-trip integration test: keyed clip →
   export → reimport → alpha intact (gates §11). WebM/VP9-alpha (`libvpx-vp9` + `yuva420p`) specced as
   a registry entry behind `validate_codec_availability` — ship-or-defer is §14-3.

## 8. Paradigm differentiator (tight, ships after parity)

Mask params (feather, tolerance, growShrink, transform x/y/scale, key hue/softness/spill) are **lanes**
— modulatable like everything else (keys day one per §6; the rest in MK.11). A procedural matte is
registrable as a **mod source** (mean coverage → scalar, §4.3). Keyframed matte transforms (T/Y/X/scale
interpolation between keyframes) ship in MK.11; **full shape morphing is explicitly a spike** (MK.14
adjacency), not a promise. Composition with phase-tier3: `painted` binding rule consumes matte buffers;
T3.11 tap registry hosts `mask_coverage`.

## 9. UI (DESIGN-SPEC voice)

- **Tool-mode stack in PR-A's tool tab** (`EXECUTION-PLAN.md` P3.2: `[fx] [op] [composite] [tool]
  [instruments]`, cursor-mode stack + statusbar chip already specced): marquee / ellipse / lasso /
  polygon / wand / key-picker modes. MK.13 depends on P3.2 merged; MK.4–MK.6 ship a minimal
  PreviewControls toggle + overlay so Phase A is usable before PR-A lands.
- **Marching ants:** decimated polygon outline (≤256 vertices, RDP), dashed 1px **MOD violet**
  (`--cx-mod` — selection is MOD per DESIGN-SPEC §1), `stroke-dashoffset` CSS animation
  (compositor-only, honors `prefers-reduced-motion`), GPU-cheap. Dim-outside preview at 35% as the
  alternate affordance.
- **Mask chips in the device chain:** a masked device shows a small matte thumbnail chip (64×36 proxy,
  MOD tick); clip header shows a mask-stack badge with count. Lowercase mono labels (`mask`, `feather`,
  `tolerance`) per DESIGN-SPEC §8.
- All overlays respect the existing canvas letterbox math (`BoundingBoxOverlay.tsx`) and the
  drag-end-suppresses-click rule (`feedback_drag-end-suppresses-click.md`).

## 10. Perf model compliance (PERF-MODEL §3)

| Op | Class | Budget @1080p (M4) | Degrade |
|---|---|---|---|
| Alpha-weighted blend delta (MK.2, per layer) | within stage-4 composite budget | composite stage stays ≤ 3.0 ms total @4 layers (≤ +0.25 ms/layer over current) | — (measured, gated) |
| Matte multiply onto layer alpha | **A** | ≤ 0.3 ms | — |
| Mask-routing wrapper blend (per masked device) | **B** | ≤ 1.0 ms | — |
| Static matte resolve, cache hit | — | < 1 ms (P6.3 convention) | — |
| Procedural key matte eval (chroma/color-range) | **C** | ≤ 4 ms/frame per keyed clip, ≤ 4 concurrent (§3.3) | half-res eval + bilinear upsample in preview (test-asserted, the PERF-MODEL class-C contract) |
| Feather (gaussian) at radius > 25 px | **C** rider on the node | included in the 4 ms node budget | radius clamped in preview degrade |
| `mask_coverage` tap | — | < 1 ms (64×64 proxy, T3.11 class) | — |

Whole-frame: the §1.1 canonical scene + 2 masked devices + 1 keyed clip must keep end-to-end p95
≤ 33.3 ms once PERF.1 exists; until then each packet carries its own scripted measurement (the
EXECUTION-PLAN evidence standard).

## 11. Quantified workstream gates (the packet gates derive from these)

- **No-regression golden:** render with zero mask features used → **byte-identical** to pre-MK.2 main
  (the GT-2 fix must not move opaque pixels).
- **Alpha round-trip:** keyed clip → ProRes 4444 export → reimport → alpha plane mean |Δ| ≤ 2/255 and
  SSIM ≥ 0.97 on ≥3 sampled frames (10-bit yuva → 8-bit round trip tolerance).
- **Routing correctness:** masked-device render with `m ≡ 1` byte-equals unmasked render; `m ≡ 0`
  byte-equals dry frame (the two degenerate proofs, per packet).
- **Budget:** matte cache `bytes ≤ 134,217,728` asserted via `cache_stats()`; 5th procedural matte in
  one render → structured error, sidecar alive.
- **Perf:** per-op budgets of §10, median-of-20, test-asserted at CI scale (360p) + scripted 1080p
  evidence numbers in PR bodies.
- **CU visual tier (two-tier test policy):** every UI-touching packet also carries a **computer-use
  visual gate** — launch the real app, perform the headline interaction, screenshot, pass criterion
  judgeable from the screenshot alone (mechanics per memory `visual-uat-entropic.md`; screenshots
  `masking/<date>/<packet>-<step>.png`; element-anchored steps, never raw coordinates). Backend-only
  packets name their downstream CU coverage. The consolidated J1–J5 journey suite (**MK.CU**,
  journeys defined in `docs/roadmap/MASKING-INTERACTIONS.md` §0 — authored concurrently, referenced
  not duplicated) is the Phase A exit gate, reruns at Phase B exit, and joins the campaign rule-9
  live smoke once masking merges. J5's verification = the exported ProRes 4444 opened in QuickTime
  via CU with alpha visibly rendering (the SSIM gate's screenshot twin).

## 12. Supersessions & absorptions (explicit)

| Prior item | Disposition |
|---|---|
| **Task #45 region-select preview** (ROADMAP parallel track #2) | **Absorbed**: #45a → MK.4, #45b → MK.9. |
| **PD.5 marquee overlay** (`packets/parallel-track.md`) | **Superseded by MK.4** — same overlay, but the product is a *MatteNode*, not a one-off selection rect. PD.5's verified anchors (preview component list, coordinate idiom) are inherited. |
| **PD.6 cut/paste-to-layer** | **Superseded by MK.9** — PD.6's container.py `_mask` discovery is GT-6 and now serves the whole workstream; cut-to-track becomes maskRef-carrying clip, not a crop param. |
| **UE.3 timeline clip marquee** (merged #180) | **Not touched** — different feature (clip selection). The naming stays disjoint: timeline = "marquee select (clips)", preview = "select tools (pixels)". |
| `parallel-track.md` PD.5/PD.6 rows | Marked superseded in the same PR that merges this spec (ledger-correction protocol, ROADMAP §3 rule 8). |

## 13. Conflicts with the planning brief (flagged per instruction)

1. **"MK.2 DEPENDS P2.2c" is stale** — P2.2c shipped (GT-8). MK.2 extends live code; the single-flight
   rule on `compositor.py` is the surviving constraint.
2. **Alpha plumbing is narrower than briefed** — pipeline already RGBA (GT-1), keys already exist
   (GT-3), decode already works (GT-5). The real gaps: blend math (GT-2), writer slice (GT-4),
   preview flatten. Budget estimates shrank accordingly.
3. **Straight alpha, not premultiplied** (§7-2) — deviation from the brief's "premultiplied alpha"
   wording, chosen so the byte-identical no-regression gate is provable. If compounded-blend artifacts
   on soft edges prove objectionable, premultiply is an MK.2-follow-up flag, not a redesign.
4. **figure-isolator HANDOFF decided "standalone, NOT Entropic module"** — MK.12 partially reverses
   this (ports the RVM backend in-app as an offline job). The original rationale (preprocessing ≠
   per-frame effect) is respected: it stays a job, never a chain device. User sign-off implicit in
   the directive; noted for the record.
5. **`fx.chroma_key`/`fx.luma_key` duplication risk** — brief implies greenfield keying; ground truth
   has two shipped key effects. Resolution: shared kernels (§6), effects preserved (no removal, no
   parallel reimplementation — PR #154 lesson).

## 14. Open decisions (genuinely the user's call)

1. **Destructive bake vs always-procedural.** Recommendation: always-procedural; "flatten" exists only
   as an export-time choice. A destructive "Bake mask to clip alpha" command is cheap to add later but
   irreversible by nature — wants explicit user blessing.
2. **Cloud AI mattes (fal.ai BiRefNet).** Better quality than local RVM, but uploads the user's footage
   and needs an API key. **Local RVM ships (MK.12); cloud stays out until the user opts in.**
3. **WebM/VP9 alpha export** — ship in MK.10 alongside ProRes 4444, or defer? (Adds a second
   alpha-codec test surface; libvpx availability guard exists.)
4. **Preview transparency rendering** — flatten to `surface-0` black (DESIGN-SPEC §1: "preview canvas
   sits in the darkest neutral band") vs industry checkerboard, vs a toggle. v1 default: surface-0;
   checkerboard toggle is a 1-line follow-up if wanted.
5. **Matte cache budget** — new 128 MiB pool (specced) vs carving the matte pool out of P6.3's 256 MiB
   FIELD_CACHE for one shared ceiling. Separate pools are simpler; shared is tighter on 16 GB.
6. **Torch in the sidecar** — MK.12's RVM needs `torch` (~2 GB install) as an optional extra
   (`[masking-ai]`, mirroring P6.4's `metal` extra) vs a separate venv subprocess. Specced as optional
   extra; flag if sidecar bloat is unacceptable.

## 15. Phasing summary

**Phase A — parity floor + the headline (MK.1–MK.10 + MK.CU):** matte model/budget/persistence →
per-pixel alpha composite → **mask-routing wrapper** → marquee → lasso → wand + color-range → matte
ops → chroma/luma keys (params as lanes day one) → cut/copy-to-track → alpha export round-trip →
**MK.CU** (the J1–J5 computer-use journey suite — the Phase A exit gate).

**Phase B — paradigm + AI (MK.11–MK.14):** mask lanes for all params + matte-as-mod-source + keyframed
transforms → subject/background dual-chain via local RVM → marching-ants/tool-tab UI (gated PR-A) →
motion-tracked masks spike → MK.CU rerun (Phase B exit).

Packet detail, contracts, and the dependency graph: `packets/masking.md`.
