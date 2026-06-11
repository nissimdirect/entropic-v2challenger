# Work Packets — User-Expectation P1 Features (Phase-1-adjacent, schedulable early)

**Authored:** 2026-06-11 · **Base for all packets:** `origin/main` @ `d821ae8` (verified). Re-run each packet's PRECONDITIONS at pickup — they are the contract, not the SHA.
**Repo:** `~/Development/entropic-v2challenger` (GitHub: `nissimdirect/entropic-v2challenger`).
**Source:** `docs/roadmap/MISSING-FUNCTIONS-INVENTORY.md` §1 — **these packets close the P1 shortlist items #1–#6 + #8**. Item **#7 (clip crossfades/transitions) is NOT here** — its scheduling decision is `packets/parallel-track.md` **PD.13**.

**Conventions (match parallel-track.md):** fresh worktree per packet (`git worktree add ~/Development/creatrix-ue<N>-wt -b <branch> origin/main`); backend tests `cd backend && python -m pytest -x -n auto --tb=short`; frontend `cd frontend && npx --no vitest run`; one PR per packet; every packet **≤4h**, **Model: Sonnet**, **depends-on: P1.0 only** (binary-green baseline — these are schedulable Phase-1-adjacent, in parallel with the Phase-1 merge packets, subject to the §1 single-flight rule on `stores/timeline.ts` / `zmq_server.py`).

**Ground-truth corrections found while authoring (vs MISSING-FUNCTIONS-INVENTORY):**
1. Inventory item #3 claims `rangeSelectClips` is "not wired to any UI handler" — **stale**: it IS wired to shift-click (`frontend/src/renderer/components/timeline/Clip.tsx:169`; store action at `stores/timeline.ts:103` / `:1097`). What's missing is the **marquee drag-rectangle**, which UE.3 builds.
2. Grid snapping partially exists: `snapToGrid()` at `Clip.tsx:15`, applied on clip drag (`:183`) and trim (`:265`/`:291`) with metaKey bypass; quantize state lives in `stores/layout.ts:17–18` (`quantizeEnabled`/`quantizeDivision`, toggle at `:109`) — **NOT** `stores/timeline.ts`. UE.1 extends this, it does not greenfield it.
3. Save As is half-claimed: the native menu entry exists (`frontend/src/main/menu.ts:33`, Cmd+Shift+S → `save-as` action) but `App.tsx:1324` maps it to plain `saveProject()` — no new-path dialog, no rebind. UE.4 makes the menu item honest.

---

## UE.1 — Timeline snapping: clip-edge / playhead / marker snap + toggle

- **ID:** UE.1 · **branch:** `feat/ue1-timeline-snapping` · **base:** `origin/main` · **depends-on:** P1.0
- **Model:** Sonnet · **Effort:** ~4h
- **goal:** Inventory #1: dragging a clip snaps its edges to grid lines, other clips' edges, the playhead, and markers — with a visible snap toggle (and the existing metaKey bypass preserved). Grid snap already exists (`snapToGrid`, Clip.tsx:15); this packet adds edge/playhead/marker candidates + the toggle.
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  cd ~/Development/entropic-v2challenger && git fetch origin
  git grep -n "function snapToGrid" origin/main -- frontend/src/renderer/components/timeline/Clip.tsx   # expect :15 — else { echo "STOP: snap baseline moved"; exit 1; }
  git grep -n "quantizeEnabled" origin/main -- frontend/src/renderer/stores/layout.ts | head -2          # expect :17 + :71 — grid state lives HERE, not timeline.ts
  git grep -rn "snapToClipEdges\|snapCandidates" origin/main -- frontend/src | wc -l                     # expect 0 (greenfield for edge-snap) — else re-scope
  ```
- **scope (VERIFIED paths):** `frontend/src/renderer/components/timeline/Clip.tsx` (extend the snap call sites :183/:265/:291 to consult a candidate list), new pure helper `frontend/src/renderer/utils/snap-candidates.ts` (grid lines + clip edges + playhead + marker positions → nearest within threshold px-at-zoom), `stores/layout.ts` (add `snapEnabled` boolean beside `quantizeEnabled`, persisted), a toolbar/statusbar toggle (smallest existing affordance surface — record choice in PR body), tests.
- **DO-NOT-TOUCH:** `moveClip`/`removeClip` store semantics (`stores/timeline.ts:572`/`:536` — snap resolves BEFORE the store call, store stays dumb); drag-reorder logic owned by open PR #109 (rebase check if it merges mid-packet); quantize-grid semantics (Cmd+U behavior unchanged).
- **steps:** (1) pure candidate function (unit-testable: inputs = clip edges/playhead/markers/grid + zoom, output = snapped position or null). (2) Wire into the three existing snap call sites. (3) Toggle + persistence. (4) metaKey bypass continues to skip ALL snapping (existing behavior generalizes).
- **TEST PLAN:** `cd frontend && npx --no vitest run src/__tests__/components/timeline/ src/__tests__/utils/` — named new tests: `snaps clip drag to grid boundary`, `snap disabled when toggle off`, `snaps to neighbouring clip edge within threshold`, `metaKey bypasses snapping`. Full frontend suite green.
- **ACCEPTANCE GATES:** snap threshold expressed in screen px (zoom-aware), verified by a unit test with exact numbers; toggle state survives reload (localStorage round-trip test); zero behavior change when toggle off AND quantize off.
- **ROLLBACK:** revert PR — helper is additive, call-site diffs are small.
- **EVIDENCE:** PR + named test output + short drag screen-capture (name runtime path per Gate 18).

## UE.2 — Ripple delete + ripple trim

- **ID:** UE.2 · **branch:** `feat/ue2-ripple-edit` · **base:** `origin/main` · **depends-on:** P1.0
- **Model:** Sonnet · **Effort:** ~4h
- **goal:** Inventory #2: deleting a clip with ripple ON closes the gap (later clips on the track shift left by the deleted duration); ripple trim shifts downstream clips when an out-point trim shortens a clip. Plain delete/trim (gap-leaving) stays the default; ripple is a modifier or toggle (record UX choice in PR body — match NLE convention: Shift+Delete or a ripple toolbar mode).
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  cd ~/Development/entropic-v2challenger && git fetch origin
  git grep -rn "ripple" origin/main -- frontend/src | wc -l                                  # expect 0 — greenfield; else re-scope
  git grep -n "removeClip:\|moveClip:" origin/main -- frontend/src/renderer/stores/timeline.ts | head -4   # expect decl :63/:64, impl :536/:572
  ```
- **scope (VERIFIED paths):** `frontend/src/renderer/stores/timeline.ts` (new `rippleRemoveClip(clipId)` + ripple-aware trim path, both wrapped in `undoable()` as ONE undo entry), keyboard/menu wiring in the existing shortcut layer + clip ContextMenu ("Ripple Delete" item), tests.
- **DO-NOT-TOUCH:** `removeClip`/`moveClip` existing semantics (ripple composes them or sits beside them — never changes their contract; other packets depend on it); audio-track clip logic (`AudioClip` shifting rides the same action ONLY if the track-type check is trivial, else note as follow-up); export/persistence.
- **steps:** (1) Store action: compute affected clips (same track, `position` > deleted clip's position), shift by duration, single undo transaction. (2) Ripple trim: on out-point trim commit, shift downstream by the delta. (3) Context-menu + shortcut. (4) Chaos pass: ripple at track end, overlapping-adjacent clips, ripple with selection spanning tracks.
- **TEST PLAN:** `cd frontend && npx --no vitest run src/__tests__/stores/` — named new tests: `ripple delete shifts later clips left`, `non-ripple delete leaves gap`, `ripple trim shifts downstream clips by trim delta`, `ripple delete undoes as single entry`. Full frontend suite green.
- **ACCEPTANCE GATES:** single undo entry per ripple op (HistoryPanel shows one row); clips on OTHER tracks unmoved (named assertion); no clip ends at negative position.
- **ROLLBACK:** revert PR.
- **EVIDENCE:** PR + named test output.

## UE.3 — Marquee (rubber-band) clip selection in the timeline

- **ID:** UE.3 · **branch:** `feat/ue3-marquee-select` · **base:** `origin/main` · **depends-on:** P1.0
- **Model:** Sonnet · **Effort:** ~3h
- **goal:** Inventory #3, ground-truth corrected: `rangeSelectClips` already exists AND is wired to shift-click (`Clip.tsx:169`); the missing piece is a **drag-rectangle on the timeline background** that selects every clip intersecting the rect. Shift-marquee adds to the existing selection. This packet is referenced by **PD.15** (the orphan inventory) — landing it removes `rangeSelectClips`'s "half-built" status for good.
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  cd ~/Development/entropic-v2challenger && git fetch origin
  git grep -n "rangeSelectClips" origin/main -- frontend/src/renderer/stores/timeline.ts | head -2    # expect :103 (type) + :1097 (impl) — else { echo "STOP: store action moved"; exit 1; }
  git grep -n "rangeSelectClips" origin/main -- frontend/src/renderer/components/timeline/Clip.tsx     # expect :169 (shift-click wiring exists — do NOT duplicate it)
  git grep -rn "marquee" origin/main -- frontend/src | wc -l                                            # expect 0 — greenfield
  ```
- **scope (VERIFIED paths):** new `frontend/src/renderer/components/timeline/MarqueeOverlay.tsx` (**Research Gate / read-existing-component rule:** read `preview/BoundingBoxOverlay.tsx` + `preview/SnapGuides.tsx` first for the established drag-rect/coordinate idiom and cite in a code comment; note PD.5 builds the analogous preview-canvas marquee — same pattern, different surface, coordinate at pickup if PD.5 is in flight), timeline background pointer handlers, selection update via the existing multi-select state in `stores/timeline.ts` (use the clip-selection set; `rangeSelectClips` covers ordered ranges — rect-intersection may set the selection directly; record choice), tests.
- **DO-NOT-TOUCH:** `Clip.tsx` shift-click range select (:169 — keep working); clip drag initiation (marquee starts ONLY on track background, never on a clip body); `stores/timeline.ts` selection-state shape.
- **steps:** (1) Pointer-down on empty track area starts rect; move draws it; up commits selection. (2) Rect↔clip intersection in timeline coordinates (zoom-aware). (3) Shift held at pointer-up → union with prior selection. (4) Drag-end suppresses the synthetic click so click-off-deselect doesn't immediately clear it (`feedback_drag-end-suppresses-click.md`). (5) Escape mid-drag cancels.
- **TEST PLAN:** `cd frontend && npx --no vitest run src/__tests__/components/timeline/` — named new tests: `marquee selects clips intersecting rect`, `shift-marquee adds to selection`, `marquee drag-end does not trigger click-off deselect`, `zero-area marquee click clears selection`. Full frontend suite green.
- **ACCEPTANCE GATES:** intersection verified with exact coordinates at two zoom levels (unit test, not snapshot); chaos pass: drag starting on a clip does NOT marquee; rapid double-drag safe.
- **ROLLBACK:** revert PR — overlay is additive.
- **EVIDENCE:** PR + named tests + marquee screenshot (name runtime path).

## UE.4 — Save As + numbered project backups

- **ID:** UE.4 · **branch:** `feat/ue4-save-as-backups` · **base:** `origin/main` · **depends-on:** P1.0
- **Model:** Sonnet · **Effort:** ~4h
- **goal:** Inventory #4: (a) make the existing Save As menu item real — `menu.ts:33` sends `save-as` but `App.tsx:1324` just calls `saveProject()`; implement native save-dialog → write to the new path → **rebind** the project to it (subsequent Cmd+S targets the new file); (b) rolling numbered backups — on every successful manual save, rotate `<name>.glitch.bak.1..5` beside the project file (autosave currently overwrites with zero history).
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  cd ~/Development/entropic-v2challenger && git fetch origin
  git grep -n "save-as" origin/main -- frontend/src/main/menu.ts frontend/src/renderer/App.tsx   # expect menu.ts:33 + App.tsx:1324 ('save-as': saveProject()) — the bug this packet fixes
  git grep -n "autosave.glitch" origin/main -- frontend/src/main/file-handlers.ts | head -2       # path-validation allows the autosave sibling (:26/:79) — backups need the same allowance pattern
  git ls-tree --name-only origin/main frontend/src/renderer/project-persistence.ts                 # exists
  ```
- **scope (VERIFIED paths):** `frontend/src/renderer/App.tsx` (`save-as` case → real flow), `frontend/src/renderer/project-persistence.ts` (current-path rebind + backup rotation call), `frontend/src/main/file-handlers.ts` (extend the path-validation allowlist to `.glitch.bak.N` siblings of granted paths — follow the `.autosave.glitch` pattern at `:79`; **trust boundary:** validate N is an integer 1–5, reject anything else), `frontend/src/main/menu.ts` (label only if needed), tests both layers.
- **DO-NOT-TOUCH:** autosave cadence/logic (30s, crash-recovery contract); `.glitch` schema; backend.
- **steps:** (1) Save As: dialog (default = current name + " copy"), write, rebind store's project path, window title updates. (2) Backup rotation: before overwriting an existing `.glitch` on manual save, shift `.bak.4→.bak.5` … `.bak.1→.bak.2`, copy current → `.bak.1`; cap N=5; rotation failure must NOT block the save (log + toast warning). (3) Chaos: Save As to a read-only dir (clean error toast), Save As over an existing project file (confirm), unicode filename.
- **TEST PLAN:** `cd frontend && npx --no vitest run src/__tests__/` — named new tests: `save as writes new path and rebinds project`, `backup rotation keeps N=5`, `rotation failure does not block save`, `bak path outside granted dir rejected`. Full frontend suite green.
- **ACCEPTANCE GATES:** after Save As, Cmd+S writes the NEW path (named test); exactly 5 backups after 7 saves (named test); file-handler validation rejects `.bak.99` / `.bak.-1` / non-sibling paths.
- **ROLLBACK:** revert PR — backups are additive files, never deleted by rollback.
- **EVIDENCE:** PR + named tests + `ls` of a rotated backup set.

## UE.5 — Media relink / missing-media dialog

- **ID:** UE.5 · **branch:** `feat/ue5-media-relink` · **base:** `origin/main` · **depends-on:** P1.0
- **Model:** Sonnet · **Effort:** ~4h
- **goal:** Inventory #5: opening a project whose media files moved currently breaks silently (audio clips get a `missing?: boolean` flag, `frontend/src/shared/types.ts:95`, with no UI; video clips get nothing). Build: on project load, probe every referenced asset path; missing ones populate a relink dialog (per-file "Locate…" with native open-dialog, "Skip" leaves it flagged); relinked paths persist into the project on next save.
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  cd ~/Development/entropic-v2challenger && git fetch origin
  git grep -n "missing?: boolean" origin/main -- frontend/src/shared/types.ts        # expect :95 (AudioClip) — the only missing-flag today
  git grep -rn "relink" origin/main -- frontend/src backend/src | wc -l               # expect 0 — greenfield
  git ls-tree --name-only origin/main frontend/src/renderer/components/dialogs/       # dialog dir exists (CrashRecoveryDialog pattern to follow)
  ```
- **scope (VERIFIED paths):** new `frontend/src/renderer/components/dialogs/RelinkDialog.tsx` (follow `CrashRecoveryDialog.tsx` conventions; if PUX.2's `useModalBehavior` hook is merged at pickup, consume it — check `git grep -n "useModalBehavior" origin/main -- frontend/src`), project-load probe in `frontend/src/renderer/project-persistence.ts` (existence check per asset/AudioClip path on hydrate), extend `missing` flagging to video/image assets (types + store), main-process path validation for the relinked file (same granted-path flow as import), tests.
- **DO-NOT-TOUCH:** decode pipeline; autosave; backend (probe is a frontend `fs` existence check through the existing safe IPC, not a new backend command — verify an existence-check IPC exists, else add ONE narrow handler in `file-handlers.ts`).
- **steps:** (1) Probe on load → list of `{clipId, kind, oldPath}`. (2) Dialog: one row per missing file, Locate/Skip, "missing" badge on skipped clips in the timeline. (3) Relink writes the new path into the store + clears `missing`; next save persists. (4) Chaos: relink to a file of the wrong type (reject with toast), relink while playback running, project with 0 missing files never shows the dialog.
- **TEST PLAN:** `cd frontend && npx --no vitest run src/__tests__/` — named new tests: `missing asset triggers relink dialog`, `relinked path persists`, `skip leaves clip flagged missing`, `wrong-type relink rejected`. Full frontend suite green.
- **ACCEPTANCE GATES:** load of an all-present project shows no dialog (named negative test); relinked project saves + reloads clean (round-trip test); skipped-missing clip renders a visible badge, not a crash.
- **ROLLBACK:** revert PR.
- **EVIDENCE:** PR + named tests + screenshot of the dialog over a seeded broken project.

## UE.6 — Still-frame export (current frame → PNG)

- **ID:** UE.6 · **branch:** `feat/ue6-still-frame-export` · **base:** `origin/main` · **depends-on:** P1.0
- **Model:** Sonnet · **Effort:** ~3h
- **goal:** Inventory #6: one action exports the current playhead frame — full effect chain applied, exactly what preview shows — as a PNG via native save dialog. Image-sequence export exists; single-frame does not (`git grep -rn "export_frame" origin/main` → 0, verified).
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  cd ~/Development/entropic-v2challenger && git fetch origin
  git grep -rn "export_frame\|exportFrame" origin/main -- backend/src frontend/src | wc -l   # expect 0 — greenfield
  git grep -n "elif cmd ==" origin/main -- backend/src/zmq_server.py | head -2                # IPC dispatch pattern present (:246+)
  git ls-tree --name-only origin/main backend/src/engine/export.py                            # render/encode machinery exists to reuse
  ```
- **scope (VERIFIED paths):** `backend/src/zmq_server.py` (new `export_frame` command: render the composited frame at the given time through the existing preview render path, encode PNG, write to a validated output path — **single-flight rule: coordinate with any other in-flight zmq dispatch packet**), `frontend/src/renderer/App.tsx` / export menu surface ("Export Current Frame…" item + Cmd-less default), native save dialog via existing main-process handlers, tests both layers.
- **DO-NOT-TOUCH:** `backend/src/engine/export.py` job-queue internals (this is a synchronous one-frame render, not an export job); determinism seed plumbing (#160's territory); preview pipeline internals (call it, don't fork it).
- **steps:** (1) Backend handler: validate time + output path (trust boundary: clamp frame index, reject paths outside granted dirs), render via the same code path preview uses, `PIL`/PyAV PNG write. (2) Frontend: menu item → save dialog → IPC → success toast with "Reveal in Finder" action. (3) Chaos: export at t=0, t=end, during playback, with an empty timeline (clean toast, no crash).
- **TEST PLAN:** backend: `cd backend && python -m pytest tests/ -k "export_frame" -x --tb=short` — named new: `test_export_frame_writes_png_at_playhead`, `test_export_frame_invalid_path_rejected`, `test_export_frame_matches_preview_render` (hash the rendered frame against the preview path's output for the same time). Frontend: `cd frontend && npx --no vitest run src/__tests__/` — named: `export frame writes png at playhead` (mock IPC asserts command + payload), `empty timeline export shows toast not crash`. Full suites green.
- **ACCEPTANCE GATES:** exported PNG hash-matches the preview render of the same frame (the parity point of the feature); path validation rejects traversal; no new always-running process.
- **ROLLBACK:** revert PR — one handler + one menu item.
- **EVIDENCE:** PR + named tests + an exported PNG attached.

## UE.7 — Clip rename + clip color (8-swatch equal-luminance palette)

- **ID:** UE.7 · **branch:** `feat/ue7-clip-rename-color` · **base:** `origin/main` · **depends-on:** P1.0
- **Model:** Sonnet · **Effort:** ~3h
- **goal:** Inventory #8: clips gain optional `name` + `color`. Rename via context menu / double-click label; color via an 8-swatch picker using the **DESIGN-SPEC §8 equal-luminance palette** (≈oklch 0.65 0.09): terracotta `#C07A6A` · ochre `#B99655` · olive `#97A659` · sage `#6FA98A` · teal `#5FA8A8` · slate `#6E93BE` · lavender `#9B86C9` · mauve `#B878A8`. Tracks already have name/color (`types.ts:60–61`); clips have neither (`Clip` interface at `types.ts:168–183`, verified).
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  cd ~/Development/entropic-v2challenger && git fetch origin
  git show origin/main:frontend/src/shared/types.ts | sed -n '168,183p' | grep -c "name\|color"   # expect 0 — Clip has neither field; else re-scope
  git ls-tree origin/main frontend/src/renderer/components/timeline/ContextMenu.tsx                # context-menu component exists
  ```
- **scope (VERIFIED paths):** `frontend/src/shared/types.ts` (`Clip.name?: string`, `Clip.color?: string` — optional, old projects load unchanged: **this is additive, NOT a schema break**; no version bump), `frontend/src/renderer/stores/timeline.ts` (`renameClip`, `setClipColor`, both `undoable()`), `frontend/src/renderer/components/timeline/Clip.tsx` (render name label when set; color tints the clip body — keep selection/disabled states legible), ContextMenu items + swatch popover (8 swatches only, no free color picker — palette discipline per DESIGN-SPEC §8), persistence round-trip, tests.
- **DO-NOT-TOUCH:** track name/color machinery; `.glitch` schema version (`CURRENT_VERSION` stays — fields are optional); text-clip `TextClipConfig.color` (different concept).
- **steps:** (1) Types + store actions. (2) UI: double-click clip label → inline rename input (Enter commits, Esc cancels, `isTextInputActive` guard so timeline shortcuts don't fire mid-rename); context-menu "Rename" + "Color ▸" swatches. (3) Persistence: save/load round-trip incl. legacy project without the fields. (4) Chaos: empty name (clears to default = asset name), 200-char name (clamp), rename during playback.
- **TEST PLAN:** `cd frontend && npx --no vitest run src/__tests__/` — named new tests: `clip rename persists`, `clip color renders in timeline`, `legacy project without clip name/color loads clean`, `rename input suppresses timeline shortcuts`. Full frontend suite green.
- **ACCEPTANCE GATES:** round-trip test proves both fields survive save/load; legacy-load test green (old fixture untouched); swatch popover offers exactly the 8 DESIGN-SPEC hexes (named assertion); selected-clip outline still readable on every swatch (contrast spot-check in PR screenshots).
- **ROLLBACK:** revert PR — fields are optional, saved projects with them still load after revert (unknown-field tolerance: verify loader ignores extras; if it doesn't, say so in PR body).
- **EVIDENCE:** PR + named tests + screenshot of a colored, renamed clip row.

---

## Suggested order + coordination

```
All independent after P1.0:   UE.1, UE.2, UE.3, UE.4, UE.5, UE.6, UE.7
stores/timeline.ts hotspot:   UE.1 / UE.2 / UE.3 / UE.7 touch it — run at most two concurrently, rebase check between merges (§1 single-flight spirit)
zmq dispatch hotspot:         UE.6 queues behind any other in-flight zmq_server.py packet (PD.4, PD.7, P2.x)
Cross-references:             UE.3 ↔ PD.5 (same marquee pattern, different surface) · UE.3 closes PD.15's rangeSelectClips row · #7 transitions = PD.13 · full §1 disposition = PD.14
```
