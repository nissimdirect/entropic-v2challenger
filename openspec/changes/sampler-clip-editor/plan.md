# Plan — sampler-clip-editor

> Normative sections are §-anchored; packets point here. Proposal: `proposal.md` (ODs 1-4).

## §1 Component: `FrameStrip` (new, shared)

`frontend/src/renderer/components/shared/FrameStrip.tsx` — props-driven, sampler-agnostic
(second consumer: fx-backspin stop_frame selector):

```
FrameStrip {
  clipId: string
  frameCount: number
  fps: number
  region?: { in: number; out: number }        // omit = no region UI (backspin picker mode)
  loop?: SamplerLoopConfig                    // renders loop bracket + dir/crossfade chips
  grid?: { mode: 'off'|'clip'|'bpm'; division: number; anchor: number }
  playheadFrame?: number                      // live position marker (FrameBank marker idiom)
  onRegionChange / onLoopChange / onScrub / onCommitScrub
}
```

- Thumbnails: request via existing `thumbnails` IPC; density = `thumbnailCount(clipPxWidth)`
  (reuse `thumbnail-density.ts` unmodified at default zoom); zoomed range → OD-3(a) params.
- Region select: drag across strip = set in/out; edge handles resize; drag body = move
  region. All pointer math clamped + NaN-guarded (mirror `launch-quantize.ts` guard style).
- Grid: `mode 'bpm'` → snap candidate = nearest boundary of the `quantizeFrame` grid
  formula, offset by anchor; `mode 'clip'` → anchor + k·(regionOrClipLen/division).
  Anchor = region.in, fallback 0 (OD-1). Local division chip overrides global; global
  `quantizeEnabled` (Cmd+U) toggles snap by default.
  ⚠ VERIFIED CONSTRAINT (2026-07-18): `quantizeFrame` snaps CEIL-ONLY ("next division
  boundary", `launch-quantize.ts:63`) — correct for pad-launch, WRONG for edge snapping
  (an IN handle dragged leftward could never settle on the boundary it approaches).
  Add an additive `snapFrameNearest(frame, division, bpm, fps)` sibling in the same file
  reusing the fpd formula + guards with `Math.round`; launch path byte-untouched
  (regression test both directions around a boundary).
- Hover-scrub: pointer position → frame → `onScrub(frame)` with CACHED thumb shown inline;
  `onCommitScrub` on rest(150ms)/release → ONE real render (NFR-01 pattern). No IPC in
  pointermove.
- Live marker: reuse the FrameBank marker idiom (`FrameBankDevice.tsx:135-150`,
  `framebank-strip__marker`).
- All styling `--cx-*` tokens; **hex-ratchet applies** (CI fails on new raw hex).

## §2 SamplerDevice integration

`SamplerDevice.tsx`: mount FrameStrip above the existing rows; surface the dropped B3.1
controls — loop on/off, dir (fwd/rev/pingpong), crossfade frames — as compact controls under
the strip (region handles ARE loop in/out when loop is on; loop-off = region is trim only
via startFrame/endFrame). Numeric Start field stays (accessibility + precision; two-way
bound to region.in). MIDI-learn context menus (`instrumentLearnContextMenu`) preserved on
every new control.

## §3 Grid state

`stores/layout.ts`: add `samplerGridMode: 'off'|'clip'|'bpm'` + `samplerGridDivision:
number|null` (null = follow global `quantizeDivision`). Persisted with the existing layout
persistence. No new store.

## §4 Drag-from-timeline

- `Clip.tsx`: `draggable` when NOT in a resize/trim pointer interaction; `dataTransfer` type
  `application/x-creatrix-clip-source` payload `{assetId, inFrame, outFrame}` (the clip's
  current trim — locked verdict 4).
- Drop targets: `SamplerDevice` root + rack pad cells → `setSource(trackId, assetId)` +
  region = payload trim. MUST NOT trigger `.app` global media-import handlers (App.tsx:3636)
  — discriminate on the custom MIME type in `handleGlobalDragOver/Drop` (early-return) AND
  stopPropagation at the accepting target; add a regression test that a clip-source drag
  over empty app space does NOT open the import path.
- `InstrumentsBrowser` instrument-type drag (`text/x-instrument-type` or current key —
  verify at build) unchanged; add a collision test (both payloads over a track header).

## §5 Right-click Crop (OD-2a)

- Backend: new `crop_clip` command — validate `{asset_path, in_frame, out_frame}` at the
  handler (path inside granted dirs; 0 ≤ in < out ≤ frameCount; finite ints; reject
  malformed with `ok:false`, never clamp silently — UE.6 precedent). Decode source frames
  [in,out], encode via the STANDARD export encode settings (the export path's fixed
  codec/profile — NOT source-matching; deterministic output beats codec fidelity, and the
  determinism test in §7 depends on it). Write atomically: encode to `<name>.part`, rename
  on success, delete `.part` on any failure (no half-written assets ever registered).
  Return new asset path.
- Frontend: context-menu on the region → confirm dialog (names the new asset) → IPC → ingest
  result → replace sampler source with new asset, region resets to full. Undoable as a
  compound transaction (asset add + source swap).
- Single-flight: `zmq_server.py` dispatch table — coordinate with any in-flight zmq packet.

## §6 Frame-Bank + rack pad thumbnails (T1 tier)

- `FrameBankDevice.tsx`: slots render the actual frame thumbnail (finishes
  `INSTRUMENTS-BUILD-PLAN.md:258` as specced) — one `thumbnails` request per unique
  clipId at slot granularity, cached.
- `RackDevice.tsx` pad cells: 1 static thumb of the pad's source under the label.
- Both: lazy, cached by (assetId, frameIndex-bucket), no live rendering (that's
  device-monitors-v1).

## §7 Tests (oracles — the merge gate)

- Vitest: FrameStrip region math (snap both modes, anchor fallback, clamps, NaN); loop
  controls write-through to store; drag payload discriminator (clip-source over app root
  no-ops); persistence round-trip of new fields (rides #322 exhaustiveness guard).
- Parity: extend the standing sampler parity tables — region-trimmed + looped playback
  frontend `computeSamplerVoice` == backend `export.py` (NO new playback math, so this is a
  regression fence, not new coverage).
- Backend pytest: `crop_clip` — valid crop produces decodable file with exactly
  out-in+1 frames; 3 negative cases (traversal path, in≥out, non-finite); double-crop
  determinism (same input → byte-identical or hash-stable output, matching export policy).
- Playwright `_electron` OS-pointer e2e: drag-select a region on the strip; drag a timeline
  clip onto the sampler → source + preselected region (the two interactions CU cannot fire).

## §8 File surface (single-flight declaration)

NEW: `shared/FrameStrip.tsx` + test · MODIFIED: `SamplerDevice.tsx`, `FrameBankDevice.tsx`,
`RackDevice.tsx`, `Clip.tsx`, `App.tsx` (drag discriminator only), `stores/layout.ts`,
`project-persistence.ts`, `zmq_server.py` (+`video/ingest.py` OD-3a), styles (tokens only).
Cross-change: does NOT touch `stores/operators.ts` / `modulation/routing.py` (wave0 rebase
rule N/A). `zmq_server.py` edits serialize with device-monitors-v1 P2 if concurrent.
