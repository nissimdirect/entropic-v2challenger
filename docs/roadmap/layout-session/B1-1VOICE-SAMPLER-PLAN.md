---
title: B1 — Read-only 1-voice Sampler (build-ready implementation plan)
version: 1.1
created: 2026-06-03
revised: 2026-06-03 (folded /review: 3 P1 + P2 fixes verified against code @ 6e0e3e9)
status: build-ready (gated on PR-A landing the `instruments` browser tab)
parent: INSTRUMENTS-BUILD-PLAN.md §3 B1
goal: prove instrument → voice → composite end-to-end with the minimum surface; kill the PR-A instruments-tab placeholder
backend_change: ~10 lines — composite-path frame_index guard (mirrors _handle_render_frame:512-526). NOT "none" (see §2, P1-fix).
estimate: 7–10h
---

# B1 — Read-only 1-voice Sampler

## 1. Objective & non-goals
**Objective:** dropping "Sampler" from the `instruments` browser tab loads one clip as a single
composited **voice** over the existing timeline output, with start / speed / opacity / blend controls.
Validates the video-sampler thesis against real rendering before any polyphony, FSM, or rack.

**Non-goals (deferred to B2/B3):** polyphony, voice lifecycle FSM, trigger modes, loop, scrub, slicing,
MIDI, ADSR, per-channel offset, axis-binding, its own track type, **voiceId state keying** (B2). B1 is
ONE voice, no envelope, no triggering — it renders continuously while loaded.

**B1 scope limits (made explicit after review):**
- **Requires ≥1 video clip on the timeline.** B1 composites the sampler voice OVER existing output; it
  does NOT render as sole content (that needs the Performance Track type → B2). If no base clip, the
  instruments entry is disabled with a tooltip.
- **Known limitation:** while a sampler is loaded, the base render is forced through the composite path,
  which does NOT thread per-base-layer `operators`/`automation_overrides` the way the single-clip
  `render_frame` fast path does (`App.tsx:858-859`). So base-clip operator/automation modulation pauses
  while the sampler is active. Acceptable for a proof build; **B2 resolves it** (instrument gets its own
  track instead of forcing the base into composite). Documented in AC#5 + tested, not silently shipped.

## 2. Dependencies & gates
- **IN-gate (DEP):** PR-A merged (provides the `instruments` browser tab + drag/double-click + inspector hover-help).
- **OUT-gate:** universal checklist (BUILD-PLAN §1) + acceptance criteria §7.
- **P1-fix — B1 OWNS a small backend guard (was falsely "none"):** the composite handler
  `_handle_render_composite` (`backend/src/zmq_server.py:728`) does bare `int(...)` with **no clamp**, and
  `reader._decode_with_seek` (`backend/src/video/reader.py:51-54`) will negative-seek. The single-clip
  path (`_handle_render_frame:512-526`) IS guarded; B1 forces the *un*guarded composite path, so B1 must
  add the same guard to the composite loop (reject `< 0`, clamp top with the 2-frame tail buffer). ~10
  lines. This also satisfies the §2.1 hand-off's `footageFrameIndex` clamp for all composite producers.

## 3. Verified integration facts (codebase @ 6e0e3e9)
- Frontend builds `cmd:'render_composite'` for multi-layer (`frontend/src/renderer/App.tsx:786-841`) and
  `cmd:'render_frame'` single-clip fast path (`App.tsx:843-862`). Composite chosen when
  `activeVideoClips.length > 1 || activeTextClips.length > 0 || activeVideoClips.length === 0`.
- Base composite `layers` are built from `activeVideoClips` (`App.tsx:787-806`), each with explicit
  `layer_type:'video'`.
- `_handle_render_composite` (`backend/src/zmq_server.py:704-808`) accepts `{asset_path, frame_index,
  transform, chain, opacity, blend_mode, layer_type}`; **derives `layer_id = asset:{asset_path}` itself
  (`:765`) and IGNORES any incoming `layer_id`.** Defaults: `layer_type='video'` (:721), `opacity` clamped
  (:729), `blend_mode='normal'` (:732).
- `compositor.render_composite` (`backend/src/engine/compositor.py:82`) iterates layers in array order,
  bottom-to-top → **append-last = top** (newest-on-top confirmed).
- Renders are driven by `useEffect`s with explicit dep arrays (`App.tsx:946-970`) + explicit
  `requestRenderFrame(currentFrame)` calls after store mutations. **`getState()` reads are NOT reactive.**
- `Track.type` includes `"performance"` (`frontend/src/shared/types.ts:60`) — reserved for B2.

## 4. Data model
```ts
// frontend/src/shared/types.ts  (ADD)
export interface SamplerInstrumentV1 {
  id: string;
  type: 'sampler';
  clipId: string;        // source asset id (resolves to assetPath + frameCount)
  startFrame: number;    // playhead start, clamped [0, frameCount-1]
  speed: number;         // 1=native, 0=freeze, <0=reverse; clamp [-8, 8]
  opacity: number;       // per-voice value, clamp [0,1] — set on the layer dict, NOT a Composite effect
  blendMode: BlendMode;  // existing union
}
```
`frameCount` is read from the resolved asset record at add time (the same probe data the timeline uses);
guard against a 0/undefined `frameCount` (freeze-on-frame-0 with a console warn, never NaN).

## 5. File-by-file changes

### New
- **`frontend/src/renderer/stores/instruments.ts`** — minimal Zustand store
  `{ instrument: SamplerInstrumentV1 | null; addSampler(clipId); updateSampler(patch); removeSampler() }`.
  (Single-instrument for B1; B2 generalizes to a Performance-Track-bound collection.)
- **`frontend/src/renderer/components/instruments/computeSamplerVoice.ts`** — PURE function:
  ```ts
  export function computeSamplerVoice(
    inst: SamplerInstrumentV1, assetPath: string, playheadFrame: number, frameCount: number,
  ): CompositeLayer {
    const raw = inst.startFrame + Math.round(inst.speed * playheadFrame);
    const footageFrameIndex = clampInt(raw, 0, Math.max(0, frameCount - 1));
    return {
      asset_path: assetPath,
      frame_index: footageFrameIndex,
      layer_type: 'video',
      chain: [],
      opacity: clamp01(finite(inst.opacity, 1)),
      blend_mode: inst.blendMode,
      // NOTE: do NOT emit layer_id — the backend derives `asset:{path}` (zmq_server.py:765) and ignores
      // incoming layer_id. voiceId-keyed state lands in B2 (a backend keying change). For B1's single
      // voice over a DISTINCT base clip the asset-keys differ → benign.
    };
  }
  ```
- **`frontend/src/renderer/components/instruments/SamplerDevice.tsx`** — device tile: start (NumberInput),
  speed (knob, incl. negative/zero), opacity (slider), blend (dropdown). Clamp on change. **Every onChange
  calls `updateSampler(patch)` THEN `requestRenderFrame(currentFrame)`** (renders are not reactive to store
  writes — this is the wiring that makes controls live). Hover-help via PR-A `data-help-id`.

### Modified
- **`frontend/src/shared/types.ts`** — add `SamplerInstrumentV1`.
- **`frontend/src/renderer/App.tsx`** (render effect, ~780-841):
  - Subscribe the instrument **reactively**: `const samplerInst = useInstrumentsStore(s => s.instrument)`
    at component scope, and add it to the render effect dependency array (so add/remove re-renders).
  - When `samplerInst` is non-null **and a base clip exists**, route to the **render_composite** branch
    and **append** `computeSamplerVoice(samplerInst, assetPath, currentFrame, frameCount)` to the `layers`
    array (last = top). If no base clip, do nothing (entry is disabled per §1).
  - No change to the single-clip path when no instrument is loaded.
- **`frontend/src/renderer/components/browser/InstrumentsTab.tsx`** (PR-A file) — register a real "Sampler"
  entry (disabled w/ tooltip when no base clip); drag/double-click → `addSampler(selectedClipId)`,
  select the device, `requestRenderFrame(currentFrame)`.

### Backend (NOT none — the P1 guard)
- **`backend/src/zmq_server.py` `_handle_render_composite` (~:728):** guard `frame_index` per layer —
  reject `< 0`, clamp to `[0, frame_count-1 (+2 tail buffer)]`, mirroring `_handle_render_frame:512-526`.
  ~10 lines. Closes the negative-seek hole for ALL composite producers, not just B1.

## 6. Test plan (layered, per Gate 5)
- **Vitest unit — `computeSamplerVoice.test.ts`:** startFrame offset; speed (0=freeze→constant, neg=reverse,
  >1=skip); clamp at bounds (no negative/overflow); opacity/finite guards; `frameCount=0` → freeze-frame-0 not NaN;
  **no `layer_id` emitted**.
- **pytest — composite frame_index guard:** negative `frame_index` rejected/clamped; huge index clamped to tail
  (mirror the `_handle_render_frame` guard test).
- **Vitest component — `SamplerDevice.test.tsx`:** each control updates store AND calls `requestRenderFrame`;
  out-of-range input clamps; speed accepts negative.
- **Playwright E2E — `instruments-sampler-b1.spec.ts`:** clip on timeline → drag Sampler → output differs from
  base by L1; change start/speed/opacity → output changes (proves reactive wiring); opacity=0 → base only;
  **remove sampler → first frame is pixel-identical to the pre-add frame** (removal symmetry); entry disabled
  when no base clip.

## 7. Acceptance criteria
1. Drop "Sampler" (base clip present) → one extra composited voice over output.
2. start / speed (reverse, freeze) / opacity / blend each **visibly** affect the render (reactive wiring proven).
3. `frame_index` clamped at BOTH frontend and the new backend composite guard — no PyAV negative-seek.
4. Removing the sampler returns the **first subsequent frame pixel-identical** to the pre-add frame.
5. No regression in render paths **except** the documented base-clip operator/automation pause while a
   sampler is active (§1 limitation) — asserted by a test, resolved in B2.
6. No `layer_id` is emitted (backend derives `asset:{path}`); voiceId keying is explicitly B2 work.

## 8. Risk & rollback
- **Risk: low–medium.** Frontend additive + a ~10-line backend guard. The guard reduces risk (closes an
  existing unguarded surface).
- **Rollback:** revert the PR; instruments entry disappears; the backend guard is safe to keep (pure hardening).
- **Forward-compat:** B1 uses a pure `computeSamplerVoice` and the existing `asset:{path}` keying. B2
  generalizes to N voices and introduces `voice:{voiceId}` backend keying (§B2 / INSTRUMENTS.md §10 P1-1) —
  B1 deliberately does NOT pretend to do that.

## 9. Next
On approval → `/workflows:plan` formalizes this into the PR queue as B1, mergeable the moment PR-A lands.
