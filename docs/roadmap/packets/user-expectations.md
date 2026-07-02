# Work Packets — User-Expectation P1 Features (Phase-1-adjacent, schedulable early)

**Authored:** 2026-06-11 · **Base for all packets:** `origin/main` @ `d821ae8` (verified). Re-run each packet's PRECONDITIONS at pickup — they are the contract, not the SHA.
**Repo:** `~/Development/entropic-v2challenger` (GitHub: `nissimdirect/entropic-v2challenger`).
**Source:** `docs/roadmap/MISSING-FUNCTIONS-INVENTORY.md` §1 — **these packets close the P1 shortlist items #1–#6 + #8**. Item **#7 (clip crossfades/transitions) is NOT here** — its scheduling decision is `packets/parallel-track.md` **PD.13**.

**Conventions (match parallel-track.md):** fresh worktree per packet (`git worktree add ~/Development/creatrix-ue<N>-wt -b <branch> origin/main`); backend tests `cd backend && python -m pytest -x -n auto --tb=short`; frontend `cd frontend && npx --no vitest run`; one PR per packet; every packet **≤4h**, **Model: Sonnet**, **depends-on: P1.0 only** (binary-green baseline, defined at `docs/roadmap/EXECUTION-PLAN.md` §"P1.0 — Binary-green vitest baseline" — verified the section exists 2026-06-11; these are schedulable Phase-1-adjacent, in parallel with the Phase-1 merge packets, subject to the §1 single-flight rule on `stores/timeline.ts` / `zmq_server.py`). **Live-runtime rule (Gate 18):** every UE packet is user-facing UI — each one ends with a verification step in the RUNNING app, and the evidence names the runtime path (`ps aux | grep -i electron` → compare against the worktree you edited; Zustand store-shape changes require kill+relaunch, not HMR).

**Ground-truth corrections found while authoring (vs MISSING-FUNCTIONS-INVENTORY; all re-verified against origin/main @ d821ae8 on 2026-06-11):**
1. Inventory item #3 claims `rangeSelectClips` is "not wired to any UI handler" — **stale**: it IS wired to shift-click (`frontend/src/renderer/components/timeline/Clip.tsx:169`; store action at `stores/timeline.ts:103` / `:1097`). What's missing is the **marquee drag-rectangle**, which UE.3 builds.
2. Grid snapping partially exists: `snapToGrid()` at `Clip.tsx:15`, applied on clip drag (`:183`) and trim (`:265`/`:291`) with metaKey bypass; quantize state lives in `stores/layout.ts:17–18` (`quantizeEnabled`/`quantizeDivision`, toggle at `:109`) — **NOT** `stores/timeline.ts`. UE.1 extends this, it does not greenfield it.
3. Save As is half-claimed: the native menu entry exists (`frontend/src/main/menu.ts:33`, Cmd+Shift+S → `save-as` action) but `App.tsx:1324` maps it to plain `saveProject()` — no new-path dialog, no rebind. UE.4 makes the menu item honest.
4. **Track locks do NOT exist** (`git grep -n "locked" origin/main -- frontend/src/shared/types.ts frontend/src/renderer/stores/timeline.ts` → 0 hits, verified 2026-06-11) — UE.2's locked-track edge case is therefore replaced with cross-track and last-clip negatives (see UE.2).
5. The project schema constant is **`PROJECT_VERSION`** (`project-persistence.ts:159`), not `CURRENT_VERSION` as some memory notes say; version validation (incl. `MAX_VERSION_STRING_LENGTH`) at `:69-:77`. UE.7's "no version bump" claim refers to `PROJECT_VERSION`.
6. Markers exist in the timeline store (`stores/timeline.ts:31` `markers: Marker[]`, cap `LIMITS.MAX_MARKERS` = 1000 in `frontend/src/shared/limits.ts:9`) — UE.1's marker-snap candidates have a real data source.

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
- **scope (VERIFIED paths):** `frontend/src/renderer/components/timeline/Clip.tsx` (extend the snap call sites :183/:265/:291 to consult a candidate list), new pure helper `frontend/src/renderer/utils/snap-candidates.ts` (grid lines + clip edges + playhead [`stores/timeline.ts:29` `playheadTime`, verified] + marker positions [`:31` `markers`, verified] → nearest within threshold; **threshold spec: 8 screen px at current zoom**, converted to timeline units inside the helper), `stores/layout.ts` (add `snapEnabled` boolean beside `quantizeEnabled`, persisted), a toolbar/statusbar toggle (smallest existing affordance surface — record choice in PR body), tests.
- **DO-NOT-TOUCH:** `moveClip`/`removeClip` store semantics (`stores/timeline.ts:572`/`:536` — snap resolves BEFORE the store call, store stays dumb); drag-reorder logic owned by open PR #109 (rebase check if it merges mid-packet); quantize-grid semantics (Cmd+U behavior unchanged).
- **steps:** (1) pure candidate function (unit-testable: inputs = clip edges/playhead/markers/grid + zoom, output = snapped position or null; must guard degenerate inputs — zero-width clips, NaN, negative zoom). (2) Wire into the three existing snap call sites. (3) Toggle + persistence. (4) metaKey bypass continues to skip ALL snapping (existing behavior generalizes).
- **TEST PLAN:** `cd frontend && npx --no vitest run src/__tests__/components/timeline/ src/__tests__/utils/` — named new tests: `snaps clip drag to grid boundary`, `snap disabled when toggle off` (NEGATIVE), `snaps to neighbouring clip edge within threshold`, `snaps to playhead and marker positions`, `metaKey bypasses snapping` (NEGATIVE), `zero-width clip yields no NaN snap candidate` (NEGATIVE — a clip with `duration: 0` as neighbour: helper returns a finite candidate or null, never NaN/Infinity). INTEGRATION (full chain): named `drag near neighbour edge commits snapped position to store` — synthetic pointer drag on `Clip` → snap helper resolves → `moveClip` receives the SNAPPED value → store state asserted with exact numbers. Full frontend suite green.
- **ACCEPTANCE GATES (quantified):** snap threshold = 8 screen px, zoom-aware, verified by a unit test with exact numbers at 2 zoom levels; toggle state survives reload (localStorage round-trip test); zero behavior change when toggle off AND quantize off (assert store calls receive raw positions); all 7 named tests green.
- **failure modes:** NaN propagation from degenerate clips (covered: zero-width negative); snap fighting quantize when both on (define precedence: candidate list INCLUDES grid lines, single nearest-wins pass — assert in the grid-boundary test); drag-reorder PR #109 collision (DO-NOT-TOUCH + rebase check).
- **ROLLBACK:** revert PR — helper is additive, call-site diffs are small.
- **EVIDENCE:** PR + named test output + short drag screen-capture in the RUNNING app (Live Runtime Check: name the runtime path; toggle is store-shape change → kill+relaunch, not HMR).

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
- **steps:** (1) Store action: compute affected clips (same track, `position` > deleted clip's position), shift by duration, single undo transaction. (2) Ripple trim: on out-point trim commit, shift downstream by the delta. (3) Context-menu + shortcut. (4) Chaos pass: ripple at track end, overlapping-adjacent clips, ripple with selection spanning tracks. **Track locks verified ABSENT** (header correction #4) — the "ripple across locked track" edge case cannot exist on this codebase; the cross-track and last-clip negatives below stand in for it. If locks land later, the lock-respect test rides that packet, not this one.
- **TEST PLAN:** `cd frontend && npx --no vitest run src/__tests__/stores/` — named new tests: `ripple delete shifts later clips left`, `non-ripple delete leaves gap` (NEGATIVE — default path unchanged), `ripple trim shifts downstream clips by trim delta`, `ripple delete undoes as single entry`, `ripple delete with cross-track selection shifts only same-track clips` (NEGATIVE — clips on other tracks byte-identical positions), `ripple delete of last clip on track shifts nothing and records one undo entry` (NEGATIVE — no downstream → no-op shift, still consistent history). INTEGRATION (full chain): named `ripple delete via context menu updates downstream positions and one history row` — ContextMenu item click → store action → positions + HistoryPanel row count asserted together. Full frontend suite green.
- **ACCEPTANCE GATES (quantified):** exactly 1 undo entry per ripple op (HistoryPanel row count asserted); 0 position changes on other tracks (named negative); 0 clips at negative position after any ripple (property asserted across the chaos cases); all 7 named tests green.
- **failure modes:** ripple shifting `AudioClip`s inconsistently with video clips on mixed selections (covered: track-type check in scope — if non-trivial, follow-up noted in PR, and the cross-track negative pins current behavior); undo splitting into N entries (covered: single-entry test); trim-delta sign error pulling clips INTO the trimmed clip (covered: exact-numbers trim test).
- **ROLLBACK:** revert PR.
- **EVIDENCE:** PR + named test output + ripple-delete screen-capture in the RUNNING app (Live Runtime Check: name the runtime path).

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
- **TEST PLAN:** `cd frontend && npx --no vitest run src/__tests__/components/timeline/` — named new tests: `marquee selects clips intersecting rect`, `shift-marquee adds to selection`, `marquee drag-end does not trigger click-off deselect` (NEGATIVE), `zero-area marquee click clears selection`, `drag starting on a clip body does not start marquee` (NEGATIVE — clip drag still wins; the two gestures never overlap), `escape mid-drag cancels marquee without selection change` (NEGATIVE). INTEGRATION (full chain): named `marquee pointer sequence commits selection to timeline store and clips render selected` — pointerdown on track background → move → up → store selection set asserted → selected-clip styling asserted in the same test. Full frontend suite green.
- **ACCEPTANCE GATES (quantified):** intersection verified with exact coordinates at 2 zoom levels (unit test, not snapshot); chaos pass: rapid double-drag safe; all 7 named tests green; `Clip.tsx:169` shift-click range select still green (existing test or new pin).
- **failure modes:** marquee swallowing clip-drag initiation (covered: clip-body negative); synthetic click clearing the fresh selection (covered: drag-end negative per `feedback_drag-end-suppresses-click.md`); coordinate drift between overlay rect and clip hit-test at non-default zoom (covered: 2-zoom-level exact test).
- **ROLLBACK:** revert PR — overlay is additive.
- **EVIDENCE:** PR + named tests + marquee screenshot in the RUNNING app (Live Runtime Check: name the runtime path).

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
- **TEST PLAN:** `cd frontend && npx --no vitest run src/__tests__/` — named new tests: `save as writes new path and rebinds project`, `backup rotation keeps exactly five backups`, `rotation failure does not block save` (NEGATIVE — fs copy throws → save still succeeds + warning toast), `bak path outside granted dir rejected` (NEGATIVE — trust boundary), `save as to unwritable path shows error toast and keeps old binding` (NEGATIVE — failed Save As must NOT rebind; Cmd+S still targets the ORIGINAL file). INTEGRATION (full chain, mocked main-process IPC): named `save as round trip: menu event → dialog path → write → rebind → title updates → reload from new path` — dispatch the `save-as` action, resolve the mocked dialog to a new path, assert write payload + store path rebind + window-title call, then load from the new path and assert deep-equal project state. Full frontend suite green.
- **ACCEPTANCE GATES (quantified):** after Save As, Cmd+S writes the NEW path (named test asserts the write target); exactly 5 backups after 7 saves (named test counts files); file-handler validation rejects `.bak.99` / `.bak.-1` / `.bak.05` / non-sibling paths (N must parse as integer 1–5 — all four rejects asserted); all 6 named tests green.
- **failure modes:** failed Save As leaving the store half-rebound (covered: unwritable-path negative); rotation racing autosave (rotation only runs on MANUAL save, autosave path untouched — assert autosave call sites unchanged); backup rotation deleting the only good copy on a corrupt save (rotation copies BEFORE overwrite, never after — order asserted in the rotation test).
- **ROLLBACK:** revert PR — backups are additive files, never deleted by rollback.
- **EVIDENCE:** PR + named tests + `ls` of a rotated backup set + Save As exercised in the RUNNING app with the title bar visibly updating (Live Runtime Check: name the runtime path).

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
- **DO-NOT-TOUCH:** decode pipeline; autosave; backend (probe is a frontend `fs` existence check through the existing safe IPC, not a new backend command — **verified 2026-06-11: no generic existence-check IPC exists today**; `file-handlers.ts:8` imports `existsSync` for internal validation only, so add ONE narrow `file:exists` handler in `file-handlers.ts` behind the same granted-path validation).
- **steps:** (1) Probe on load → list of `{clipId, kind, oldPath}`. (2) Dialog: one row per missing file, Locate/Skip, "missing" badge on skipped clips in the timeline. (3) Relink writes the new path into the store + clears `missing`; next save persists. (4) Relink validation: the located file must pass the same type gate as import (extension allowlist + the import path's probe) — a wrong-codec/wrong-type file is REJECTED with a toast and the clip stays flagged. (5) Chaos: relink while playback running, project with 0 missing files never shows the dialog.
- **TEST PLAN:** `cd frontend && npx --no vitest run src/__tests__/` — named new tests: `missing asset triggers relink dialog`, `relinked path persists`, `skip leaves clip flagged missing`, `relink to wrong-codec file rejected and missing flag retained` (NEGATIVE — locate a `.txt`/wrong-container file → toast, store path unchanged, `missing` still true), `all-present project never shows relink dialog` (NEGATIVE). INTEGRATION (full chain): named `relink round trip: load broken project → dialog → locate → store updated → save → reload clean` — seeded project with a moved asset; after relink+save, a fresh load shows 0 missing and no dialog, asserted in one test. Full frontend suite green.
- **ACCEPTANCE GATES (quantified):** all 6 named tests green; skipped-missing clip renders a visible badge, not a crash (component assertion); the new `file:exists` IPC rejects non-granted paths (trust-boundary assertion — reuse the file-handlers validation tests' pattern); 0 dialogs on clean projects.
- **failure modes:** probe storm on projects with hundreds of assets (probe is one batched pass on hydrate, not per-clip renders — assert single IPC batch); relink to a file that exists but can't decode (covered: wrong-codec negative — the import-path probe gates it); dialog reopening in a loop after Skip (skip is sticky for the session — assert dialog count stays 1).
- **ROLLBACK:** revert PR.
- **EVIDENCE:** PR + named tests + screenshot of the dialog over a seeded broken project in the RUNNING app (Live Runtime Check: seed `~/Movies/...` move, name the runtime path).

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
- **steps:** (1) Backend handler: validate time + output path (trust boundary: time must be a finite number within `[0, project_duration]` — **t beyond the last frame is REJECTED with `ok: false` + reason, never silently clamped** (the UI playhead can't exceed duration, so out-of-range input is by definition malformed IPC); reject paths outside granted dirs), render via the same code path preview uses, `Pillow`/PyAV PNG write (`Pillow>=11.0` already in `backend/pyproject.toml`, verified 2026-06-11). (2) Frontend: menu item → save dialog → IPC → success toast with "Reveal in Finder" action. (3) Chaos: export at t=0, at exactly t=duration, during playback, with an empty timeline (clean toast, no crash).
- **TEST PLAN:** backend: `cd backend && python -m pytest tests/ -k "export_frame" -x --tb=short` — named new: `test_export_frame_writes_png_at_playhead`, `test_export_frame_invalid_path_rejected` (NEGATIVE — traversal + non-granted dir), `test_export_frame_time_beyond_duration_rejected` (NEGATIVE — `t = duration + 1s` and `t = -1` and `t = NaN` → `ok: false`, no file written, server stays up), `test_export_frame_matches_preview_render` (INTEGRATION + the parity point: hash the rendered frame against the preview path's output for the same time — full chain proof that `export_frame` reuses, not forks, the preview render). Frontend: `cd frontend && npx --no vitest run src/__tests__/` — named: `export frame menu sends command with playhead time and chosen path` (mock IPC asserts command + payload — frontend half of the chain), `empty timeline export shows toast not crash` (NEGATIVE). Full suites green.
- **ACCEPTANCE GATES (quantified):** exported PNG hash-equals the preview render of the same frame (exact hash match, same encoder settings); 3/3 malformed-time inputs rejected with no file written; path validation rejects traversal; no new always-running process; all 6 named tests green.
- **failure modes:** float time landing between frames differently in preview vs export (covered: parity hash test pins identical time→frame mapping); export during playback contending for the decoder (chaos case — synchronous render must not corrupt the playing stream; assert playback continues); huge frame (8K source) blowing memory (render at project resolution, same as preview — no new path).
- **ROLLBACK:** revert PR — one handler + one menu item.
- **EVIDENCE:** PR + named tests + an exported PNG attached + export exercised in the RUNNING app (Live Runtime Check: name the runtime path).

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
- **DO-NOT-TOUCH:** track name/color machinery; `.glitch` schema version (**`PROJECT_VERSION`** at `project-persistence.ts:159` — verified 2026-06-11; the constant is NOT named `CURRENT_VERSION` — stays unbumped, fields are optional); text-clip `TextClipConfig.color` (different concept).
- **steps:** (1) Types + store actions; add `MAX_CLIP_NAME_LENGTH: 100` to `frontend/src/shared/limits.ts` (the existing LIMITS pattern, verified) — `renameClip` clamps at the trust boundary. (2) UI: double-click clip label → inline rename input (Enter commits, Esc cancels, `isTextInputActive` guard so timeline shortcuts don't fire mid-rename); context-menu "Rename" + "Color ▸" swatches. (3) Persistence: save/load round-trip incl. legacy project without the fields. (4) Chaos: rename during playback, paste a 512-char string into the rename input.
- **TEST PLAN:** `cd frontend && npx --no vitest run src/__tests__/` — named new tests: `clip rename persists`, `clip color renders in timeline`, `legacy project without clip name/color loads clean` (NEGATIVE — old fixture, no fields → no crash, no dialog), `rename input suppresses timeline shortcuts`, `empty rename falls back to asset name` (NEGATIVE — commit with "" → name cleared to default, never an empty label), `512-char rename clamps to MAX_CLIP_NAME_LENGTH` (NEGATIVE — paste 512 chars → stored name length exactly 100, no layout blowout). INTEGRATION (full chain): named `rename and recolor survive save and reload round trip` — rename via the inline input + pick a swatch → save → reload → both fields asserted on the loaded clip. Full frontend suite green.
- **ACCEPTANCE GATES (quantified):** round-trip test proves both fields survive save/load; legacy-load test green (old fixture untouched); swatch popover offers exactly the 8 DESIGN-SPEC hexes (named assertion comparing the full hex array); stored name length ≤100 for any input; selected-clip outline still readable on every swatch (contrast spot-check in PR screenshots — 8 screenshots or one strip); all 7 named tests green.
- **failure modes:** empty/whitespace-only names rendering invisible labels (covered: empty-rename negative); unbounded names breaking clip layout (covered: 512-char negative + limits.ts clamp); legacy loader choking on unknown fields after a revert (covered: verify loader ignores extras; if it doesn't, say so in PR body); rename input capturing Space/Delete meant for transport (covered: shortcut-suppression test).
- **ROLLBACK:** revert PR — fields are optional, saved projects with them still load after revert (unknown-field tolerance per the failure-mode check above).
- **EVIDENCE:** PR + named tests + screenshot of a colored, renamed clip row in the RUNNING app (Live Runtime Check: name the runtime path).

---

## Suggested order + coordination

```
All independent after P1.0:   UE.1, UE.2, UE.3, UE.4, UE.5, UE.6, UE.7
stores/timeline.ts hotspot:   UE.1 / UE.2 / UE.3 / UE.7 touch it — run at most two concurrently, rebase check between merges (§1 single-flight spirit)
zmq dispatch hotspot:         UE.6 queues behind any other in-flight zmq_server.py packet (PD.4, PD.7, P2.x)
Cross-references:             UE.3 ↔ PD.5 (same marquee pattern, different surface) · UE.3 closes PD.15's rangeSelectClips row · #7 transitions = PD.13 · full §1 disposition = PD.14
**task #45 (region-select preview) SUPERSEDED:** MK.4 (`packets/masking.md`) absorbs task #45a; MK.9 absorbs task #45b. Do not build PD.5 or PD.6 — the masking workstream owns this scope entirely.
```

---

## Thickness scorecard (pass 2026-06-11, anchors re-verified against origin/main @ d821ae8)

Rubric: ① anchors git-verified + greps in preconditions · ② full contract + model tier · ③ named tests w/ behavior titles + exact commands + live-runtime step · ④ gates quantified · ⑤ failure modes + ≥1 negative test · ⑥ full-chain integration test named · ⑦ depends-on resolves.

| Packet | ① | ② | ③ | ④ | ⑤ | ⑥ | ⑦ |
|---|---|---|---|---|---|---|---|
| UE.1 snapping | ✅ (snapToGrid :15, call sites :183/:265/:291, markers :31, playhead :29, LIMITS verified) | ✅ Sonnet | ✅ +live (kill+relaunch note) | ✅ 8px threshold, 2 zoom levels, 7 tests | ✅ 3 negatives incl. zero-width-clip NaN guard | ✅ `drag near neighbour edge commits snapped position to store` | ✅ P1.0 (EXECUTION-PLAN §P1.0) |
| UE.2 ripple | ✅ (removeClip/moveClip :536/:572; **track locks verified ABSENT** — lock edge case impossible, replaced) | ✅ Sonnet | ✅ +live | ✅ 1 undo entry, 0 cross-track moves, 0 negative positions, 7 tests | ✅ 3 negatives: cross-track, last-clip, non-ripple default | ✅ `ripple delete via context menu …` | ✅ P1.0 |
| UE.3 marquee | ✅ (rangeSelectClips :103/:1097/:169) | ✅ Sonnet | ✅ +live | ✅ 2 zoom levels, 7 tests | ✅ 3 negatives: clip-body start, drag-end click, esc-cancel | ✅ `marquee pointer sequence commits selection …` | ✅ P1.0 (coord with PD.5) |
| UE.4 save as | ✅ (menu.ts:33, App.tsx:1324, autosave allowlist :79) | ✅ Sonnet | ✅ +live | ✅ exactly 5 baks after 7 saves; 4 reject cases for N; 6 tests | ✅ 3 negatives: unwritable path keeps binding, rotation-fail, bak-path validation | ✅ `save as round trip: menu → dialog → write → rebind → title → reload` | ✅ P1.0 |
| UE.5 relink | ✅ (missing?: types.ts:95; **no existence IPC exists — verified**, one narrow handler spec'd) | ✅ Sonnet | ✅ +live (seeded broken project) | ✅ 6 tests, 0-dialog clean load, batched probe | ✅ 2 negatives: wrong-codec relink, all-present project | ✅ `relink round trip: load → locate → save → reload clean` | ✅ P1.0 (PUX.2 hook optional) |
| UE.6 still-frame | ✅ (export_frame grep 0, dispatch :246+, export.py, Pillow≥11 in pyproject verified) | ✅ Sonnet | ✅ +live | ✅ hash parity, 3/3 malformed-time rejects, 6 tests | ✅ 3 negatives: t beyond end / t=-1 / NaN rejected, bad path, empty timeline | ✅ `test_export_frame_matches_preview_render` (parity = chain proof) | ✅ P1.0 (zmq single-flight) |
| UE.7 rename/color | ✅ (Clip :168–183 has neither field; Track name/color :60-61; **PROJECT_VERSION :159 — constant name corrected**) | ✅ Sonnet | ✅ +live | ✅ exactly 8 hexes, name ≤100, 7 tests | ✅ 3 negatives: empty rename, 512-char clamp, legacy load | ✅ `rename and recolor survive save and reload round trip` | ✅ P1.0 |

**Known unfixables / by-design:** the "ripple across locked track" negative requested for UE.2 cannot exist — track locks are not in the codebase (grep 0, header correction #4); replaced with cross-track + last-clip negatives, and a note that the lock-respect test rides any future locks packet. P1.0 lives in `EXECUTION-PLAN.md` on the consolidation branch (not origin/main yet) — same caveat as the inventory file.
