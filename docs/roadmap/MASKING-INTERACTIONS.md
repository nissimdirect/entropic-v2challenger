# Creatrix Selection / Masking / Alpha — INTERACTION SPECIFICATION

**Date:** 2026-06-12 · **Status:** proposed · **Ground truth verified against `origin/main` @ `95e9b1b`**
**Companion docs:** `SELECTION-MASKING-SPEC.md` (data model, MK packets — this doc is its interaction
layer; terminology and MK.x IDs follow it) · `packets/masking.md` · `DESIGN-SPEC.md` ·
`layout-session/PLAN.md` §3.7 (tool-mode stack) · `packets/undo-history.md` (UH.4) ·
`ONBOARDING-SPEC.md` §6.

**Scope:** exactly how a user operates selections, mattes, mask routing, keying, and alpha — every
pointer gesture, every key, every pixel of feedback. Backend semantics live in
`SELECTION-MASKING-SPEC.md`; nothing here contradicts it (conflicts found during authoring are
resolved inline and flagged `⚖`).

**Naming:** "selection" = ephemeral marching-ants region (dies on deselect). "Mask" = persistent
`MatteNode` chip on the clip's mask stack. "Save Selection as Mask" is the promotion gesture between
them. Tool chips and mask names render lowercase mono (`marquee`, `mask_1`) per `DESIGN-SPEC.md:114`;
dialog/help prose is sentence-case Plex Sans (two-voice rule).

---

## §0 COMPLETE JOURNEYS (computer-use executable)

### CU preamble (applies to all journeys — run once)

```bash
cd frontend && npm start        # per repo CLAUDE.md; wait ~10 s for the Electron window
```

- `request_access(apps=["Electron"], reason="Masking UAT")` — dev bundle id `com.github.Electron`,
  tier **full** (click + type + key). Mechanics, status-bar anatomy, and the import-dialog
  `Cmd+Shift+G` path-typing trick: memory file `visual-uat-entropic.md`.
- Window ≥ 1440×900 (smaller pushes browser-tab contents below the fold — known issue in
  `visual-uat-entropic.md` §6). Verify status bar reads `Engine: Connected` before any journey.
- Test fixture for J1/J2: a clip with a large flat green region.
  `ffmpeg -y -f lavfi -i "testsrc=duration=5:size=1280x720:rate=30,drawbox=x=0:y=0:w=640:h=720:color=0x00FF00:t=fill" -pix_fmt yuv420p test-assets/green-half.mp4`
- Step grammar: every step names the element by its visible label. `SCRUB →` prefix means click the
  timeline ruler at the stated time before the step. `CHECKPOINT jN-NN:` is a screenshot pass
  criterion judgeable from the screenshot alone.

---

### J1 — FIRST CONTACT (discovery + first five minutes)

How a brand-new user finds the machinery at all.

**Discoverability surface (spec, not steps):** the tools live as chips in the browser's `tool` tab
(PR-A 5-tab browser, `PLAN.md` §3.5; MK.13). Four new chips append after the existing twelve:
`marquee` · `lasso` · `wand` · `key` — lowercase mono labels, hover-help via the delegated handler
(`PLAN.md` §3.9). **Hover-help copy (authoritative strings, sentence-case voice):**

| chip | hover-help string |
|---|---|
| `marquee` | `Drag a box around a region. Press Q again for ellipse. Shift adds, Alt subtracts.` |
| `lasso` | `Draw a freehand outline around anything. Press G again for click-to-place polygon. Enter closes it, Esc throws it away.` |
| `wand` | `Click a pixel to select everything like it that touches it. Tolerance lives in the inspector.` |
| `key` | `Click a color to select it across the whole clip, every frame. Shift-click to widen. Tolerance, softness, spill in the inspector.` |

**Onboarding hook (proposed amendment to `ONBOARDING-SPEC.md` §6):** the tour is capped at 5
callouts, so no sixth is added. Instead, amend the C3 device-chain copy (gated on MK.13 shipping):
> C3 · `device chain` · `Effects stack left to right. Drop a mask chip on one and it applies only inside the matte.`

**Steps:**

1. Launch per preamble. Click the button labeled `New Project` on the welcome screen.
2. Press `Cmd+I`. In the file dialog press `Cmd+Shift+G`, type the absolute path to
   `test-assets/green-half.mp4`, press Enter, click `Open`.
   **CHECKPOINT j1-01:** preview shows the test frame (left half flat green); one clip on track 1.
3. Click the browser tab labeled `tool`.
   **CHECKPOINT j1-02:** chip list includes `marquee`, `lasso`, `wand`, `key` after the existing
   tool chips; labels lowercase mono.
4. Hover the chip labeled `marquee` for 1 s.
   **CHECKPOINT j1-03:** hover-help card shows the exact `marquee` string from the table above.
5. Click the chip labeled `marquee` (or press `q`).
   **CHECKPOINT j1-04:** statusbar chip at right reads `tool: marquee`; cursor over the preview is a
   crosshair.
6. Drag in the preview from the upper-left quadrant to the center.
   **CHECKPOINT j1-05:** during drag, a 1px dashed MOD-violet rectangle with a faint violet wash
   grows with the pointer; on release it becomes animated marching ants; area outside dims to 65%.
7. Press `Backspace`.
   **CHECKPOINT j1-06:** the selected region is transparent — dark `surface-0` matte surround shows
   through (no checkerboard; the preview surround IS the transparency indicator, per §4.1); ants
   remain.
8. Press `Cmd+Z`.
   **CHECKPOINT j1-07:** the region's pixels are back; ants still present.
9. Press `Escape`.
   **CHECKPOINT j1-08:** ants gone; statusbar still reads `tool: marquee` (Escape priority §9:
   deselect comes before tool exit). Press `Escape` again → statusbar reads `tool: select`.

**Artifact:** none persisted — and that's the lesson: selections are ephemeral. **The user knows it
worked** because they watched pixels vanish and return entirely from the keyboard, inside 5 minutes.

---

### J2 — DELETE A COLOR THROUGHOUT THE CLIP (the literal headline ask)

1. New project; import `test-assets/green-half.mp4` as in J1 steps 1–2.
2. Press `c` (or click the chip labeled `key` in the `tool` tab).
   **CHECKPOINT j2-01:** statusbar reads `tool: key`; cursor over preview is an eyedropper.
3. SCRUB → 0:00. Click the center of the green region in the preview.
   **CHECKPOINT j2-02:** marching ants outline the green region; the inspector (right panel) shows a
   `key` section: color swatch (green), sliders labeled `tolerance`, `softness`, `spill`, a hex
   type-in, and a button labeled `save as mask`.
4. Press `v` once to cycle preview view mode composite → matte (`v` cycles views while the `key`
   tool is active, §5/§8).
   **CHECKPOINT j2-03:** preview is grayscale matte — white where green was, black elsewhere;
   statusbar view chip reads `view: matte`.
5. Drag the `tolerance` slider in the inspector slowly right, then back until the matte is clean.
   **CHECKPOINT j2-04:** matte view updates live during the drag; white region edges firm up with no
   gray speckle in the black region.
6. SCRUB → 2:30, then SCRUB → 4:50.
   **CHECKPOINT j2-05:** matte stays correct at both times without re-picking — the key is
   procedural, re-evaluated per frame (§7: "apply across clip" is inherent).
7. Press `v` to cycle to rubylith, confirm the red wash covers exactly the non-selected area, then
   `v` again to return to composite. Nudge `spill` right until green fringing on edge pixels is gone.
   **CHECKPOINT j2-06:** composite view, edge pixels show no green halo.
8. Press `Backspace` (delete-inside).
   **CHECKPOINT j2-07:** green region is transparent; `surface-0` surround visible through it.
9. SCRUB → 1:00, 3:00, 4:50.
   **CHECKPOINT j2-08:** transparency present at every scrub point.
10. Press `Cmd+E`. In the export dialog select codec `prores_4444` (alpha-capable, MK.10), export to
    `~/Desktop/j2-keyed.mov`, click `Export`, wait for the completion toast.
11. Press `Cmd+I`, import any second video onto a new track; drag the track so `j2-keyed.mov` (import
    it too) sits on the track ABOVE it; SCRUB → 2:00.
    **CHECKPOINT j2-09:** the lower clip's pixels show through exactly where the green was, at every
    scrubbed frame.

**Artifact:** `~/Desktop/j2-keyed.mov` with a real alpha channel. **The user knows it worked** because
another clip is visible through the hole, inside the same app, on every frame.

---

### J3 — GLITCH THE BACKGROUND, KEEP THE FIGURE

Requires real footage with a person (RVM figure matte, MK.12).

1. New project; import performance footage (person against any background).
2. Click the clip on track 1 to select it. In the clip inspector, click the button labeled
   `generate figure matte`.
   **CHECKPOINT j3-01:** the button is replaced by a progress row (`figure matte… 42%`, AMBER text)
   with a `cancel` link; transport stays usable during the job.
3. Wait for completion (RVM local, ~15 fps at 480p — roughly clip duration ×2).
   **CHECKPOINT j3-02:** two mask chips appear in the clip's mask-stack row: thumbnails labeled
   `figure` and `background` (64×36 matte thumbnails, MOD tick).
4. In the browser `fx` tab, drag the effect named `pixel_sort` onto track 1's device chain.
   **CHECKPOINT j3-03:** `pixel_sort` device appears in the chain; whole frame is sorted.
5. Drag the mask chip labeled `background` from the clip's mask-stack row and drop it onto the
   `pixel_sort` device.
   **CHECKPOINT j3-04:** during hover the device shows a MOD wash; after drop the device shows a
   64×36 matte thumbnail chip + MOD tick, and the preview shows pixel-sort ONLY outside the figure —
   the person is clean.
6. Press `Space` to play for 3 s, then `Space` to pause.
   **CHECKPOINT j3-05:** during playback the figure stays clean while the background sorts,
   continuously, as the person moves (matte is per-frame).
7. In the browser `op` tab, drag the operator named `LFO` onto the inspector's `feather` slider of
   the `background` mask chip (chip selected → inspector shows `feather`, `grow/shrink`, `invert`).
   **CHECKPOINT j3-06:** the `feather` slider gains a mod-ring (ACID at 25% α, ≤8px — DESIGN-SPEC
   glow rule); the modulated mask chip itself gains the same mod-ring.
8. Press `Space`; let it play.
   **CHECKPOINT j3-07:** the boundary between clean figure and sorted background visibly breathes
   with the LFO during playback.

**Artifact:** a project where one matte routes one chain spatially and its edge is an instrument.
**The user knows it worked** because they can see the person untouched while everything else glitches
— and the edge moves to the LFO.

---

### J4 — CUT OUT AND RECOMPOSE

1. New project; import any footage. Press `g` for `lasso`.
   **CHECKPOINT j4-01:** statusbar reads `tool: lasso (freehand)`.
2. Draw a closed freehand outline around an object in the preview (drag, release near start point).
   **CHECKPOINT j4-02:** marching ants along the drawn outline (decimated polygon).
3. Press `Cmd+Shift+J` (cut to new track).
   **CHECKPOINT j4-03:** a new track appears above with a new clip carrying the region (its
   `maskRef`); the original clip shows transparency inside the lasso shape; ants cleared.
4. Click the new clip. Drag its bounding-box move zone in the preview to offset it ~200 px right;
   drag a corner handle to scale it ~120% (existing transform handles, `BoundingBoxOverlay.tsx`).
   **CHECKPOINT j4-04:** the cut-out region moves/scales independently; the hole in the original
   stays put.
5. In the clip inspector's matte transform row, click the keyframe diamond at 0:00; SCRUB → 2:00,
   drag the cut-out further; the diamond fills at 2:00 (keyframed matte transform, MK.11).
   **CHECKPOINT j4-05:** two filled keyframe diamonds visible on the matte transform lane.
6. Press `Space` and watch 0:00→2:00.
   **CHECKPOINT j4-06:** the cut-out interpolates between the two poses during playback.
7. Press `Cmd+E`, export the full timeline to `~/Desktop/j4-recomposed.mp4`.

**Artifact:** `j4-recomposed.mp4` — an object surgically removed, animated, and recomposited. **The
user knows it worked** because the exported file shows the object in two places over time and the
hole where it came from.

---

### J5 — SAVE / RELOAD / SURVIVE

1. Complete J3 steps 1–7 (figure matte + routed pixel_sort + LFO on feather).
2. Press `Cmd+S`, save as `j5-survive.json` (or project format default). Quit the app fully
   (`Cmd+Q`). Relaunch per preamble. Press `Cmd+O`, open `j5-survive.json`.
   **CHECKPOINT j5-01:** both mask chips (`figure`, `background`) present on the clip; `pixel_sort`
   still shows its matte thumbnail chip; the `feather` mod-ring still present; preview at 0:00 shows
   clean figure / sorted background WITHOUT regenerating the RVM matte (cached matte video reloads).
3. Press `Space` for 2 s.
   **CHECKPOINT j5-02:** identical behavior to pre-quit J3 checkpoint j3-07.
4. Press `Cmd+E`, codec `prores_4444`, export `~/Desktop/j5-alpha.mov`.
5. Verification (named steps, outside the app):
   a. `ffprobe -v error -show_entries stream=pix_fmt ~/Desktop/j5-alpha.mov` → must print
      `yuva444p10le` (alpha-carrying pix_fmt, MK.10).
   b. Open `~/Desktop/j5-alpha.mov` in QuickTime Player → plays without error.
   c. Reimport `j5-alpha.mov` into a fresh Creatrix project on a track above a solid-color clip →
      transparency (if any delete ops were used) shows the color through; routed-effect regions
      render baked.
   **CHECKPOINT j5-03:** ffprobe output string `yuva444p10le` captured; reimport composite visually
   correct.

**Artifact:** a project + export that both survive a full process death. **The user knows it worked**
because a cold relaunch reproduces the exact frame, and ffprobe — a third party — confirms the alpha.

---

## §1 Tool activation & mode model

**Where tools live.** Four chips appended to the PR-A browser `tool` tab (`PLAN.md:189`, MK.13):
`marquee`, `lasso`, `wand`, `key`. Until PR-A lands, MK.4–MK.6 ship the same four as a minimal
PreviewControls toggle row (sibling spec §9) — identical hotkeys and semantics, different shelf.

**Activation paths:** click the chip · press the bare-letter hotkey · (mask-edit mode adds `brush`/
`eraser`, §5). All bare letters route through the existing shortcut registry
(`frontend/src/renderer/utils/shortcuts.ts:5` contexts; `default-shortcuts.ts:60–72` tool category)
and are guarded by `isTextInputActive` (`PLAN.md` §3.7) — typing `q` in a rename field never switches
tools.

**Hotkeys (collision-audited in §8):**

| key | tool | why not the Photoshop letter |
|---|---|---|
| `q` | `marquee` (repeat-press or `Shift+Q` cycles rect ↔ ellipse) | PS `m` is `add_marker` (`default-shortcuts.ts:26`, F-0516-8) |
| `w` | `wand` | PS parity — `w` is free |
| `g` | `lasso` (repeat-press or `Shift+G` cycles freehand ↔ polygon) | PS `l` is JKL transport (`default-shortcuts.ts:10`) |
| `c` | `key` (chroma/color-range picker) | PS has no single key; `k` is JKL stop (`default-shortcuts.ts:11`); `c` = color |

**Variant cycling:** repeat-press cycles the variant; the statusbar chip names it:
`tool: marquee (ellipse)`, `tool: lasso (polygon)`. `Shift+<key>` also cycles (PS muscle memory; both
`shift+q` and `shift+g` are unbound).

**Tool-mode stack:** activating a selection tool pushes `cursorMode` onto the PR-A tool-mode stack
(`PLAN.md` §3.7); statusbar chip updates; modal open/close push/pop restores it. `v` (existing
`tool_select`, `default-shortcuts.ts:61`) or Escape (per §9) returns to `select` — **exception:
while the `key` tool is active, `v` cycles view modes instead (§5/§8 — keying is evaluated by
watching the matte run, J2); exit the key tool via Escape (§9 level 5).**

**Cursors:** `marquee`/`lasso`/`wand` = crosshair (wand adds a 4px center dot); `key` = eyedropper.
Custom cursors are 16×16 SVG, hotspot at the sample point.

**Modal, not spring-loaded — decision + rationale.** Selection tools are persistent modes (like
`razor`): they stay active until explicitly exited. Justification: the core workflows (J2, J3) demand
*scrubbing while a tool is active* — you verify a key by riding JKL/space across the clip with the
eyedropper still hot. Spring-loaded (hold-key) tools would make that impossible and contradict the
PR-A stack every other tool uses. Consequences while a selection tool is active:

- **Transport unaffected:** space/J/K/L/timeline ruler all work (space exception mid-gesture, §2).
- **Timeline unaffected:** clip drag/trim/marquee-select on the *timeline* behave normally —
  selection tools capture pointer events **only on the preview canvas**.
- **Preview transform suspended:** `BoundingBoxOverlay` handles hide while a selection tool is
  active (one pointer owner per surface; prevents grab fights). They return on exit to `select`.
- **Pan/zoom unaffected:** `Cmd+=`/`Cmd+-`/scroll are registry/wheel paths, untouched.
- **Perform-armed mode wins:** when the selected track is a performance track, bare keys feed pads
  (`App.tsx:695`); selection hotkeys are unreachable by existing design. Documented, not fought.

---

## §2 Per-tool gesture tables

**Global modifier resolution (the Photoshop shift-before/shift-during ambiguity, resolved):**
modifier state **at pointerdown** sets the boolean op; modifier state **during move** sets the
geometric constraint. Both can apply in one gesture (hold Shift throughout = add AND constrained).
This matches Photoshop's actual behavior and is now explicit:

- At `pointerdown`: `Shift` = add, `Alt` = subtract, `Shift+Alt` = intersect (sets `MatteNode.op`,
  sibling spec §5). No modifier = replace (clears prior selection).
- During `pointermove`: `Shift` = constrain (square/circle for marquee; 45° segments for polygon),
  `Alt` = grow from center (marquee only), `Space` (held) = reposition the in-progress shape without
  resizing; release space resumes sizing. **Space conflict resolution:** `App.tsx:749` maps space
  directly to play/pause *before* the registry; therefore the gesture layer sets a global
  `gestureInProgress` flag at pointerdown that the App keydown handler checks first — space only
  repositions while a selection drag is physically held; at all other times it stays play/pause.

**Pointer discipline (applies to every tool):** `setPointerCapture` on the overlay at pointerdown
(release outside the window still delivers pointerup — §11.4); set `isDragging` ref at first move
beyond 4px and clear it in `requestAnimationFrame` after pointerup, exactly the
`BoundingBoxOverlay.tsx:53,136,187` pattern, so the synthesized click after a drag never triggers
click-to-deselect (`feedback_drag-end-suppresses-click.md` — this bug class bit twice).

### marquee (rect / ellipse)

| event | behavior | feedback (DESIGN-SPEC tokens) |
|---|---|---|
| pointerdown | anchor corner (or center w/ Alt-during) | crosshair; 1px dashed `--cx-mod` rubber band starts |
| pointermove | size the rect/ellipse; Shift constrains square/circle; Space repositions | live outline + `rgba(143,125,255,.12)` MOD wash fill; W×H px readout chip near cursor (11px mono) |
| pointerup ≥4px | commit → static `rect`/`ellipse` MatteNode (boolean op per down-modifiers) | wash fades 140ms; marching ants start; outside dims to 65% |
| pointerup <4px (click) | deselect all (PS parity) — suppressed if `isDragging` was set | ants clear |
| double-click | inside selection: no-op (reserved) | — |
| Enter | commit (no-op for marquee — already committed at up) | — |
| Escape | mid-drag: cancel gesture, selection unchanged | rubber band vanishes |

**Matte produced:** static `rect`/`ellipse` node at current-frame coordinates (clip-media space).

### lasso (freehand / polygon)

| event | freehand | polygon |
|---|---|---|
| pointerdown | start sampling polyline | place vertex (first click starts path) |
| pointermove | append samples (RDP-decimated ≤256 verts on commit) | elastic segment from last vertex; Shift constrains 45° |
| pointerup | close path start→end, commit MatteNode | — (click-driven, not drag) |
| click on first vertex (≤8px) | — | closes path, commits; first vertex highlights MOD bright `#A693FF` when snappable |
| double-click | — | closes path (also Enter — never the *only* path, §11.5) |
| Backspace mid-path | — | removes last placed vertex |
| Enter | n/a | close + commit |
| Escape | mid-drag: cancel | discard in-progress path |

Feedback: in-progress path 1px solid `--cx-mod`; committed = ants. **Matte produced:** static
`polygon` node.

### wand

| event | behavior | feedback |
|---|---|---|
| click | flood-fill from seed pixel at **current frame**, tolerance from inspector (RGB distance); seed is stored so later tolerance edits re-run from it | 80ms compute flash on the region; then ants |
| Shift+click | add second region (op=add) | ants extend |
| Alt+click | subtract region | ants shrink |
| click on alpha=0 pixel | no selection; AMBER toast (§11.2) | toast `wand: empty region (transparent pixel)` |
| Escape | clear in-flight compute | — |

**Matte produced:** static `bitmap` node (baked PNG sidecar, sibling §5).

### key (chroma / color range)

| event | behavior | feedback |
|---|---|---|
| click | pick target color at pixel → creates procedural `chroma_key`/`color_range` node | ants on matched region; inspector shows key section (§7) |
| Shift+click | add sample → widens the match range (Resolve qualifier convention) | ants grow; swatch shows blended target |
| Alt+click | remove sample / narrow range | ants shrink |
| drag | sample-averaging stroke (Resolve eyedropper-drag) | 1px MOD trail; on release range = stroke average |
| double-click on swatch (inspector) | open hex type-in focus | — |
| Escape | per §9 (gesture → deselect → tool) | — |

**Matte produced:** procedural node — re-evaluated every frame; this is what makes J2 step 6 free.

---

## §3 Selection lifecycle

**Marching ants — authoritative style.** 1px dashed outline, dash 4px/gap 4px, animated via
`stroke-dashoffset` at a 500ms cycle (compositor-only). **Color: `--cx-mod` violet over a 1px
`#0B0B10` ink underlay** (dual-stroke guarantees contrast on any footage, light or dark — footage is
content and uncontrollable). ⚖ The planning brief suggested ACID ants; resolved to MOD because
DESIGN-SPEC:14 assigns selection semantics to MOD violet and the sibling spec §9 already specs MOD
ants — ACID would collide with *life/play/modulation* semantics. Polygon decimated ≤256 vertices
(RDP). Outside-region dim to 65% as the secondary affordance (sibling §9). Ants honor
`prefers-reduced-motion` (§12).

**Hide extras:** `Cmd+Shift+H` toggles ants + dim without dropping the selection (statusbar shows
`ants: hidden` chip while toggled). ⚖ Photoshop's `Cmd+H` is macOS app-Hide — Electron never reliably
receives it; same reason F-0516-8 moved marker off `Cmd+M` (`default-shortcuts.ts:24–25`).

**Persistence across frames:** static nodes (marquee/lasso/wand) hold their shape on every frame —
scrubbing does not move them. Procedural nodes (key/color-range/luma) re-evaluate per frame — ants
follow the content. The inspector labels the node `static` / `per-frame` so the difference is legible.

**Deselect:** `Cmd+Shift+A` (Premiere/GIMP deselect-all convention). ⚖ Photoshop `Cmd+D` is
`duplicate_effect` (`default-shortcuts.ts:17`) — existing muscle memory keeps duplicate. Escape also
deselects at its stack position (§9). Click-with-marquee on empty area deselects (§2).

**Invert:** `Cmd+Shift+I` (PS parity; unbound today — bare `i` is loop-in, `Cmd+I` import).

**Feather — decision: inspector property, non-destructive.** Per AE mask-feather precedent: `feather`
(gaussian px) and `grow/shrink` (morphological px) are fields on the selected MatteNode shown in the
inspector — scrubbable slider + type-in, lane-addressable (keys day one, rest Phase B, sibling §5).
No feather dialog exists.

**Boolean affordances:** (a) modifiers at pointerdown (§2); (b) inspector op row on each MatteNode —
three chips `add` / `subtract` / `intersect`, active chip ACID text on wash; (c) the mask-stack list
evaluates top-to-bottom.

---

## §4 Selection → action map

| action | trigger | semantics + feedback |
|---|---|---|
| delete-inside | `Backspace` (and Fn-`Delete`, `App.tsx:759`) with an active selection | layer alpha `a·(1−m)` (sibling §4.1); preview shows `surface-0` surround through the hole; one undo step |
| delete-outside | `Alt+Backspace` | `a·m`. ⚖ PS uses Alt+Delete for fill-foreground; we diverge — Creatrix has no fg color, and delete-outside needs a key for the J2 class of work. `Shift+Backspace` was unavailable (ripple delete, `default-shortcuts.ts:20`) |
| fill | inspector button `fill…` → color popover | composites solid through `m`; no default shortcut (bindable in ShortcutEditor) |
| copy to new track | `Cmd+J` (PS layer-via-copy parity; unbound today) | new track above, new clip carrying region as `maskRef` (MK.9); original untouched |
| cut to new track | `Cmd+Shift+J` | same + original gets inverse-matte delete-inside |
| save selection as mask | inspector button `save as mask` + `Cmd+Shift+M` | **the promotion gesture**: selection becomes a persistent `mask_n` chip on the clip's mask stack; ants clear; the new chip pulses once (180ms MOD wash) so the eye follows the promotion |

**Priority rule for Backspace** (single authoritative order, wired where `delete_selected` dispatches
and at `App.tsx:759`): ① active matte selection → delete-inside · ② selected clips → delete clips ·
③ selected effect → remove effect. An active selection therefore shadows clip deletion — Escape or
`Cmd+Shift+A` first if you meant the clip (§11.1 toast disambiguates).

---

## §5 Mask lifecycle & mask edit mode

**Chips.** Persistent masks render as chips in the clip's mask-stack row (clip header badge shows
count; sibling §9): 64×36 matte thumbnail, MOD tick, lowercase mono auto-name `mask_1`, `mask_2`, …
(counter never reuses, §11.7). RVM chips are named `figure` / `background` (§6).

| gesture on chip | result |
|---|---|
| click | select → inspector shows `feather` / `grow/shrink` / `invert` / op / rename / `fill…` / enable |
| double-click | **enter mask edit mode** |
| drag onto device | assign `maskRef` (§6) |
| Space (focused) | toggle enable/disable — disabled chip label goes AMBER (bypass convention, DESIGN-SPEC:89) |
| Delete/Backspace (focused) | delete mask — confirm dialog if any device references it (`mask_2 routes 3 devices — delete anyway?`, destructive button RED fill) |
| rename (inspector field or double-click label) | inline edit; collision → auto-suffix (§11.7) |

**Mask edit mode.** Pushed onto the tool-mode stack (statusbar: `mask edit: mask_1`); the shortcut
registry switches to a new `mask-edit` context (the registry's `context` field,
`shortcuts.ts:5`, gains one value — same mechanism that isolates perform mode):

- **View modes:** `v` cycles `composite → matte → rubylith` (Resolve qualifier viewer precedent);
  statusbar chip `view: matte`. The same cycle is also live while the `key` tool is active in
  normal context (§1 exception, §8 — J2's workflow; ships with MK.8's view-mode surface). **Rubylith = 50% `#C13B40` red wash over masked-out area.** ⚖
  DESIGN-SPEC:15 reserves RED for record/destructive/error *chrome* — resolved via DESIGN-SPEC:99's
  chrome/content separation: rubylith tints the *footage* (content area), not chrome, exactly like
  effect palettes; and rubylith has been industry-red since film masking. View modes persist during
  playback (you key by watching the matte run, J2/J3); marching ants do not (§10).
- **Paint:** `b` = brush, `e` = eraser, `x` = swap brush/eraser, `[` / `]` = size down/up (these four
  override `razor`/`split_at_playhead_e`/`ripple` and grid `[`/`]` ONLY inside the `mask-edit`
  context — in normal context grid keys are untouched). Brush cursor = circle outline at brush size,
  1px MOD. **One stroke = one undo transaction** (UH.4, `packets/undo-history.md:140`).
  ⚠ **Scheduling:** no MK packet builds paint in the current set (MK.7 is sliders/reorder only) —
  open decision, sibling spec §14-10. No journey depends on it.
- **Exit — decision:** `Enter` and `Escape` both exit (strokes are already committed per-stroke, so
  there is nothing to cancel — Escape is exit, not revert; revert is `Cmd+Z`). Click-away (clicking
  the timeline, another clip, or another chip) also exits. Exiting pops the tool stack and restores
  the prior cursor mode + shortcut context.

**Per-assignment invert** lives on the *assignment* (device mask slot, §6), not the mask — one matte
can route one chain normally and another inverted.

---

## §6 Routing interactions (the headline)

**Drag-assign:** drag a mask chip from the mask-stack row onto a device in the chain. Drop target
shows MOD wash (`rgba(143,125,255,.12)`) while hovered; on drop the device gains a 64×36 matte
thumbnail chip + MOD tick (sibling §9 — supersedes the brief's bare "3px corner tick": the thumbnail
*contains* the tick and tells you *which* matte, not just "masked"). Drag payload rides the PR-A
nonce-validated dataTransfer convention (`PLAN.md` §3.6). Drop on empty chain area = chain-level
assignment.

**Inspector slot:** every device inspector gains a `mask` row — dropdown `none / mask_1 … / figure /
background` + `invert` checkbox (per-assignment, §5). Chain header gets the identical row for
chain-level masking. This is the keyboard path for routing (§12).

**Masked-device indicator:** the thumbnail chip on the device, always visible; hover shows
`masked by mask_1 (inverted)`. Clicking the device's chip selects that mask (jump-to-source).

**Figure/background auto-matte flow (MK.12):** clip inspector button `generate figure matte` →
in-place progress row (`figure matte… NN%`, AMBER, `cancel` link; transport stays live; job is
offline preprocessing per figure-isolator HANDOFF rationale) → on completion two chips `figure` and
`background` (complementary mattes from one RVM pass) appear with a one-pulse MOD wash. Re-running
replaces both after a confirm if either is routed. Failure → RED error toast with `retry` action.

---

## §7 Keying flow

1. `c` → eyedropper cursor (§1).
2. Click picks the target color; Shift-click adds samples; drag averages (§2 key table).
3. Inspector key section: color swatch + hex type-in · `tolerance` · `softness` · `spill` sliders —
   all scrubbable, type-in on click, **mod-ring (ACID 25% α) when a lane modulates them** — key
   params are lanes from day one (sibling §6; the `_mix` synthetic-lane precedent, GT-7).
4. **Live view while adjusting — decision:** dragging `tolerance` or `softness` temporarily flips the
   preview to the current non-composite view if one is active, and additionally offers *auto-peek*:
   while the pointer is down on either slider the preview shows `matte`; on release it returns to the
   prior view (Resolve highlight precedent). Auto-peek is a preference toggle, default ON.
5. **"Apply across clip" is inherent and stated in UI copy:** the key is a procedural matte
   re-evaluated every frame — the inspector section header reads `key — per-frame` and the
   hover-help says `Keys apply across the whole clip automatically.` There is no "apply" button.
6. Zero-coverage guard: §11.3.

---

## §8 Keyboard map + FULL collision audit

Registry ground truth: `frontend/src/renderer/utils/default-shortcuts.ts` @ 95e9b1b (line refs
below); menu accelerators: `App.tsx:1585` (`select-all-clips` = Cmd+A via native menu); direct
handlers: `App.tsx:736` (Escape), `:749` (Space), `:759` (Delete).

| proposed key | action (new) | current binding @ 95e9b1b | resolution |
|---|---|---|---|
| `q` | tool: marquee | unbound | clean ✓ |
| `w` | tool: wand | unbound | clean ✓ (PS parity) |
| `g` | tool: lasso | unbound | clean ✓ |
| `c` | tool: key | unbound (Cmd+Shift+C is automation copy — no clash) | clean ✓ |
| `m` | — NOT used | `add_marker` (`:26`, F-0516-8/#82) | ⚖ marquee moved to `q` |
| `l` / `k` / `j` | — NOT used | JKL transport (`:10–12`) | ⚖ lasso→`g`, key→`c`; JKL untouchable (scrub-while-keying is the workflow) |
| `Shift+Q` / `Shift+G` | variant cycle | unbound (`shift+m` is tool_marker `:66` — no clash) | clean ✓ |
| `v` (normal, non-key tools) | exit to select | `tool_select` (`:61`) | same meaning — reuse, no new binding |
| `v` (mask-edit ctx OR `key` tool active) | cycle view modes | `tool_select` in normal ctx | context-scoped override (`mask-edit` context; key-tool exception per §1 — Escape exits the key tool) ✓ |
| `b` / `e` (mask-edit ctx) | brush / eraser | `tool_razor` (`:62`) / `split_at_playhead_e` (`:39`) | context-scoped override only; normal ctx untouched |
| `x` (mask-edit ctx) | swap brush/eraser | `tool_ripple_delete` (`:65`) | context-scoped override only |
| `[` `]` (mask-edit ctx) | brush size | grid division (`:69–70`) | context-scoped override only |
| `Cmd+Shift+A` | deselect | unbound | ⚖ PS `Cmd+D` taken by `duplicate_effect` (`:17`); Premiere/GIMP deselect convention adopted |
| `Cmd+Shift+I` | invert selection | unbound (bare `i` loop-in `:28`; `Cmd+I` import) | clean ✓ (PS parity) |
| `Cmd+Shift+H` | hide ants | unbound; `Cmd+H` = macOS Hide-app | ⚖ macOS-reserved avoided per F-0516-8 precedent |
| `Cmd+J` | copy to new track | unbound (bare `j` transport) | clean ✓ (PS parity) |
| `Cmd+Shift+J` | cut to new track | unbound | clean ✓ |
| `Cmd+Shift+M` | save selection as mask | unbound | clean ✓ |
| `Backspace` | delete-inside (priority ①, §4) | `delete_selected` (`:18`) + `App.tsx:759` | priority chain, not rebind |
| `Alt+Backspace` | delete-outside | unbound (`shift+backspace` ripple `:20` avoided) | ⚖ diverges from PS fill — §4 |
| `Space` (mid-gesture) | reposition shape | play/pause direct (`App.tsx:749`) | gestureInProgress flag checked first (§2) |
| arrows | nudge selection 1px (Shift=10px) | clip-transform nudge (`BoundingBoxOverlay.tsx:194–204`) | selection-active wins; bbox handles are hidden while a selection tool is active anyway (§1) |
| `Enter` | close polygon / exit mask edit / chip primary | unbound globally | clean ✓ |
| `Escape` | §9 stack | `App.tsx:736` + `tool_escape_select` (`:72`) | unified dispatcher (§9) |

All new bindings register through the ShortcutRegistry → visible and rebindable in the Preferences
Shortcuts surface (`components/layout/ShortcutEditor.tsx`), categories `tool` / `mask`.

---

## §9 Escape priority stack — one authoritative order

**Finding (must be fixed by MK.4 — the packet that introduces selection-tool Escape semantics;
J1's j1-08 tests this in Phase A, so it cannot wait for MK.13):** today Escape is handled *directly* in `App.tsx:736–747`
(clear clip selection, else `entropic:stop`) **before** the registry is consulted (`App.tsx:756`),
which makes the registry's `tool_escape_select` binding (`default-shortcuts.ts:72`) unreachable from
the global path. The masking work replaces this split with ONE prioritized dispatcher; each press
consumes exactly one level:

1. **Cancel in-progress gesture** (marquee drag, lasso path, polygon-in-progress, eyedropper drag) —
   committed state untouched.
2. **Open modal/dialog/menu closes** (existing focus-trap layer, PUX.2 — fires before the global
   handler by construction; listed for completeness).
3. **Exit mask edit mode** (§5 — exit, not revert).
4. **Deselect active selection** (ants clear; = `Cmd+Shift+A`).
5. **Exit selection tool to `select`** (pop tool-mode stack; absorbs `tool_escape_select`).
6. **Clear clip selection** (PR #101 / F-0514-5 behavior, `App.tsx:736–746` — preserved).
7. **Transport stop** (`entropic:stop` event, `App.tsx:747` — preserved as the floor).

Perform-armed tracks keep their own Escape path (clear-selection-then-panic, `App.tsx:696–708`) —
selection tools are unreachable there (§1), so the two stacks never interleave.

---

## §10 Timeline interplay

- **Split (`Cmd+K` `split_at_playhead` `:38` / `Cmd+Shift+K` `split_clip` `:23`):** both halves get a
  **deep copy** of the mask stack; names preserved; device `maskRef`s remap to each half's copies.
  Mattes live in clip-*media* space, so each half's mattes stay glued to the pixels they covered.
- **Trim:** matte anchored to media, not to clip in/out — trimming reveals/hides matte regions
  exactly as it reveals/hides pixels. Keyframed matte transforms (MK.11) ride media time.
- **Clip copy/duplicate:** carries the full mask stack + assignments (deep copy, same as split).
- **Playback — decision:** marching ants + outside-dim **hide during playback** (selection chrome
  off the canvas; DESIGN-SPEC's matte-surround purity), reappearing on pause. Matte/rubylith **view
  modes persist during playback** — keying is evaluated by watching the matte run (J2/J3). Mask
  chips and device thumbnails are panel chrome and never hide.
- **Modulated matte indicator:** a chip whose params are lane-modulated gets the standard mod-ring
  (ACID 25% α ≤8px — the only permitted glow, DESIGN-SPEC:73), same as knobs; ring activity follows
  the lane.

---

## §11 Edge cases & chaos (Gate-2 human-error testing)

1. **Backspace with empty selection:** falls through the §4 priority chain to clip delete. If
   *nothing* is selected at any level: info toast (`surface-4`, MOD tick, DESIGN-SPEC:94)
   `nothing selected to delete`.
2. **Wand on alpha=0 pixel:** no node created; AMBER toast `wand: empty region (transparent pixel)`.
3. **Zero-coverage key:** committing a key whose matte covers <0.1% of the sampled frame → AMBER
   toast `key matches 0.0% of frame — widen tolerance?`; the node still exists (the user may scrub
   to a frame where it bites).
4. **Drag released outside the window:** `setPointerCapture` guarantees pointerup delivery → gesture
   commits normally (never an orphaned rubber band). Window blur mid-gesture (Cmd+Tab) cancels the
   gesture (level-1 Escape semantics).
5. **Double-click speed:** polygon close never depends on double-click timing alone — Enter and
   click-first-vertex are co-equal paths (§2).
6. **Rapid tool switching mid-gesture:** switching tools (hotkey or chip) cancels the in-progress
   gesture first (same code path as Escape level 1); no half-built nodes.
7. **Two masks same name:** impossible via auto-name (monotonic counter per clip, never reused —
   including after delete). Rename collision → inline AMBER hint + auto-suffix `_2` on commit.
8. **Undo mid-mask-edit:** `Cmd+Z` steps stroke transactions (UH.4) without exiting the mode; undo
   past the mode's first stroke keeps the mode open on the pre-edit matte.
9. **Delete a routed mask:** confirm dialog naming the count of routed devices (§5); confirming
   sets those `maskRef`s to `none` (devices go unmasked, never dangle).
10. **Project-load with missing matte sidecar/AI matte cache:** chip renders with AMBER label +
    hover `matte data missing — regenerate`; routing treats it as full-coverage (no-op) rather than
    black (never silently blanks a chain). RVM chips offer `regenerate` in the inspector.
11. **Selection tool active, user drags in the timeline:** normal timeline behavior — capture is
    preview-only (§1). No mode required to edit clips.
12. **Held-key repeat:** tool hotkeys ignore `e.repeat` (same guard perform pads use,
    `App.tsx:714`) — holding `q` doesn't strobe rect↔ellipse… it cycles once.

---

## §12 Accessibility (Gate 6)

Keyboard-only path for **every** operation:

| operation | keyboard path |
|---|---|
| activate tool / variant | `q`/`w`/`g`/`c`, repeat-press variant cycle |
| create rect/ellipse | marquee active → `Shift+Enter` drops a default centered 25%-frame selection → arrows move (1px; Shift=10px), `Alt+arrows` resize, Enter commits |
| polygon | not keyboard-creatable v1 — equivalent outcome via rect + inspector grow/feather; flagged as known gap in MK.13 a11y row |
| wand / key sampling | `Shift+Enter` samples at frame center; hex type-in field for key target color; tolerance/softness/spill are focusable sliders (arrows adjust, type-in on Enter) |
| boolean ops | inspector op chips, Tab-reachable |
| deselect / invert / hide / promote | `Cmd+Shift+A` / `Cmd+Shift+I` / `Cmd+Shift+H` / `Cmd+Shift+M` |
| delete in/out, copy/cut to track | `Backspace` / `Alt+Backspace` / `Cmd+J` / `Cmd+Shift+J` |
| mask chips | chips in Tab order; focused chip: Enter = mask edit, Space = enable toggle, Delete = delete, F2/double-click-equivalent = rename |
| routing | per-device inspector `mask` dropdown + `invert` checkbox (§6) — fully focusable; drag is the pointer shortcut, never the only path |
| mask edit paint | brush size `[`/`]`; pointer required for strokes v1 (paint is inherently spatial); matte still fully editable via feather/grow/invert/booleans from the keyboard |
| view modes | `v` cycle in mask edit; statusbar chip announces (`aria-live="polite"`) |

Focus indicators: `outline: 2px solid var(--cx-acid); outline-offset: 1px` on every interactive
element (DESIGN-SPEC:74); never removed without replacement. Statusbar tool/view chips mirror to an
`aria-live` region. **Reduced motion:** `prefers-reduced-motion` → marching ants do not animate —
static dual-stroke outline at 50% opacity + the 65% outside-dim carries the affordance; all
pulse/wash feedback drops to instant state changes (DESIGN-SPEC:79).

---

## §13 UAT — journey/checkpoint → packet mapping

J1–J5 (§0) ARE the UAT scenarios — steps are CU-executable, checkpoints are the pass criteria. This
table is the coverage contract for the MK.CU regression-suite packet (`packets/masking.md`).
**Phase split:** MK.CU's Phase A run executes only the checkpoints whose packets are in MK.1–MK.10
(J1 via the PreviewControls shelf variant — j1-02/j1-03 tool-tab checkpoints deferred; J2 full;
J4 steps 1–4 & 7). Rows owned by MK.11/MK.12/MK.13 (all of J3 and J5, J4 steps 5–6, J1 steps 3–4)
run at the Phase B exit rerun — see MK.CU's gates in `packets/masking.md`.

| MK packet | covered by | gate checkpoint(s) |
|---|---|---|
| MK.2 alpha-weighted compositing | J2 step 11 | j2-09 |
| MK.3 maskRef routing (headline) | J3 steps 5–6 | j3-04, j3-05 |
| MK.4 preview selection surface (marquee) | J1 steps 5–9 | j1-04 … j1-08 |
| MK.5/MK.6 lasso · wand · ops | J4 steps 1–3; §11.2 wand toast | j4-01, j4-02 |
| MK.7 matte ops surface (feather/grow/invert inspector) | J3 step 7 (the inspector rows the LFO drops onto) | j3-06 |
| MK.8 keying + spill + key-params-as-lanes | J2 steps 2–7 | j2-01 … j2-06 |
| MK.9 cut/copy to new track | J4 step 3 | j4-03 |
| MK.10 alpha export/decode round-trip | J2 step 10–11; J5 step 5 | j2-09, j5-03 (ffprobe `yuva444p10le`) |
| MK.11 matte transforms keyframed + mask lanes | J4 steps 5–6; J3 steps 7–8 | j4-05, j4-06, j3-06, j3-07 |
| MK.12 RVM figure/background | J3 steps 2–3; J5 reload | j3-01, j3-02, j5-01 |
| MK.13 tools-tab integration + hover-help + shortcuts | J1 steps 3–5 | j1-02, j1-03, j1-04 |
| persistence (matte model, MK.1) | J5 steps 1–3 | j5-01, j5-02 |
| Escape stack §9 | J1 step 9 | j1-08 |
| delete-inside §4 | J1 step 7; J2 steps 8–9 | j1-06, j2-07, j2-08 |

**The two headline stories** are J2 ("key out the green throughout the clip and delete it" —
checkpoints j2-01…j2-09) and J3 ("pixel-sort only the background while the figure stays clean" —
j3-01…j3-07), end-to-end above.

---

## Appendix — decisions ledger (quick reference)

| # | decision | section |
|---|---|---|
| D1 | tools are modal, not spring-loaded; transport stays live | §1 |
| D2 | hotkeys q/w/g/c; PS letters m/l/k/b/e unavailable (cited) | §1, §8 |
| D3 | shift-at-down = boolean, shift-during = constrain | §2 |
| D4 | space repositions only while a gesture is held; otherwise play/pause | §2 |
| D5 | ants = MOD dual-stroke, 500ms, ≤256 verts; not ACID | §3 |
| D6 | deselect = Cmd+Shift+A (Cmd+D stays duplicate) | §3 |
| D7 | feather/grow = inspector properties, non-destructive (AE precedent) | §3 |
| D8 | delete-outside = Alt+Backspace (diverges from PS fill) | §4 |
| D9 | mask edit exits via Enter, Escape, and click-away — all commit | §5 |
| D10 | rubylith RED justified by chrome/content separation | §5 |
| D11 | masked-device indicator = thumbnail chip (supersedes bare corner tick) | §6 |
| D12 | key auto-peek matte while slider held (pref, default ON) | §7 |
| D13 | Escape = single 7-level dispatcher; App.tsx split retired | §9 |
| D14 | ants hide during playback; view modes persist | §10 |
| D15 | new overlay named PreviewSelectionOverlay (MarqueeOverlay.tsx is timeline clip selection) | §1, GT-9 |

---

## §14 CDO adoption addendum (2026-06-12) — OVERRIDES conflicting text above

Behavior-level adoptions from the DESIGN-SPEC §10 heuristic review. Where these conflict with §1–§12, THIS section wins; packets implement these forms.

1. **Per-delete toast (F2):** every delete operation toasts the op + coverage: `deleted inside selection — 31% · ⌘Z` / `deleted outside selection — 69% · ⌘Z` (info tier, source `mask-delete`). The mode banner shows the hint pair `⌫ inside · ⌥⌫ outside` whenever a selection exists.
2. **Hole-punch guard (F3):** while ants are hidden (`⌘⇧H`), the first Backspace press RE-SHOWS the ants (no deletion); a second press deletes. The banner's 6px MOD selection-dot is exempt from ants-hiding.
3. **Mask-slot discoverability (F4):** every device inspector ALWAYS shows a `mask: none` row (not hover-gated). During any mask-chip drag, all valid drop targets show the persistent dot-grid treatment (DESIGN-SPEC §10.4), not hover-only.
4. **Compute feedback (F5):** procedural matte evaluation exceeding 100ms shows a `computing…` chip in the mode banner; while PERF-MODEL half-res degrade is active, a `preview: half-res` chip shows; the 5th-concurrent-procedural-matte refusal is an AMBER toast naming the clip.
5. **View-cycle key (F7):** view cycling in mask-edit is **`Shift+V`** (not bare `v`); bare `v` keeps its app-wide "back to select" meaning in every context. Banner echoes `view: composite|matte|rubylith` on every cycle.
6. **Zero-coverage-at-frame (F8):** deleting via a procedural matte on a frame with 0% coverage fires an AMBER toast (`no matte coverage at this frame — scrub or adjust tolerance`), never a silent no-op.
7. **Chip sizing (F10):** in-chain mask chips are 24×16; 64×36 thumbnails reserved for the inspector mask-stack row, per DESIGN-SPEC §10.3.
8. **RVM cancel semantics (F12):** cancel restores the generate button, discards partial matte cache, fires an info toast (`figure matte cancelled — nothing saved`).
9. **Mode banner is a hard dependency (F1):** MK.13's acceptance gates include the DESIGN-SPEC §10.2 mode banner; tools may not ship behind a statusbar-chip-only indicator.
