# Work Packets — Parallel Track (v2 debt, schedulable any time, independent of tiers)

**Authored:** 2026-06-11 · **Base for all packets:** `origin/main` @ `d821ae8` (verified). Re-run each packet's PRECONDITIONS at pickup — they are the contract, not the SHA.
**Repo:** `~/Development/entropic-v2challenger` (GitHub: `nissimdirect/entropic-v2challenger`).
**Source:** `docs/roadmap/ROADMAP.md` §3 "Parallel track" + §2 "v2 debt" ledger + Gap register G6/G7/G8/G12.

**Conventions:** fresh worktree per packet (`git worktree add ~/Development/creatrix-pd<N>-wt -b <branch> origin/main`); backend tests `cd backend && python -m pytest -x -n auto --tb=short`; frontend `cd frontend && npx --no vitest run`; one PR per packet.

**Ground-truth corrections found while authoring (vs ROADMAP/memory):**
1. GitHub **issue #65 (hotkey epic) is CLOSED** (2026-05-15) although ROADMAP lists it 🔄 with 6 surfaces remaining — PD.8 includes reopening-or-superseding it.
2. The rename residue is further along than ROADMAP implies: `ENTROPIC_DIR` consts in BOTH `frontend/src/main/diagnostics-handlers.ts:12` and `file-handlers.ts:12` already point to `~/.creatrix`. The REAL residue is a **split-brain runtime dir**: `frontend/src/main/logger.ts:10` (`~/.entropic/logs`), `pop-out-window.ts:7/:94` (`~/.entropic`), `diagnostics-handlers.ts:215` (`~/.entropic/feedback`) still write to the OLD dir while backend (`diagnostics.py`, `main.py`) writes to `~/.creatrix` — and diagnostics path-validation only allows `~/.creatrix`, so the Electron main log is unreadable through the in-app diagnostics IPC. PD.10 fixes this.
3. Task #47 is marked completed in the task store (it was the *spec* task); the open implementation gap is **task #35** ("Audio track header lacks gain meter + dB readout", pending). ROADMAP's "phase 3 ❌" refers to #35's scope: per-track metering (current `AudioTrackMeter` shows a single master meter on every track — comment at `AudioTrack.tsx:136-141`).
4. `EXPERIMENTAL_AUDIO_TRACKS` is an **env-var read**, not a constant: `backend/src/zmq_server.py:51-54` (`_experimental_audio_tracks_enabled()`), consumed at `:96-98`. ROADMAP's ":52" is the docstring line.

---

## PD.1 — Audio-tracks bake kit (un-flag chain, step 1 of 3)

- **ID:** PD.1 · **branch:** `docs/audio-tracks-bake-kit` · **base:** `origin/main`
- **depends-on:** none
- **goal:** The 1-week user bake (PR-4 gate per `memory/entropic-audio-tracks.md`: "merge of #30–#35 + 1-week user-facing bake + zero audio regression reports") has never started because there's no bake harness. Deliverable: a bake kit the user can run today — launch script with the flag ON, a regression checklist, and a place to log findings.
- **PRECONDITIONS (mismatch → STOP):**
  ```
  cd ~/Development/entropic-v2challenger && git fetch origin
  git grep -n "_experimental_audio_tracks_enabled" origin/main -- backend/src/zmq_server.py   # expect def at :51, use at :98
  git grep -c "EXPERIMENTAL_AUDIO_TRACKS" origin/main -- backend/src/zmq_server.py            # ≥2 hits
  gh pr view 30 --json state -q .state && gh pr view 66 --json state -q .state                 # both MERGED
  ```
- **scope (VERIFIED paths):** new `docs/plans/2026-06-audio-tracks-bake-checklist.md` (checklist: import video+audio, multi-track playback, gain/mute/solo, A/V sync under temporal effects, export with audio, crash watch via `~/.creatrix/crash_reports/`), new `scripts/launch-bake.sh` (`EXPERIMENTAL_AUDIO_TRACKS=true cd frontend && npm start`), bake-findings log stub in the checklist doc.
- **DO-NOT-TOUCH:** any flag default; `zmq_server.py`; singleton-bed code.
- **steps:** (1) Write checklist from the audio-tracks PR stack scope (#30–#35 features). (2) Launch script. (3) Smoke it once yourself: launch with flag on, confirm AudioTrack UI appears, note runtime path (Live Runtime Check). (4) Hand to user with the 1-week clock start date recorded in the doc.
- **TEST PLAN:** `EXPERIMENTAL_AUDIO_TRACKS=true` launch shows audio-track UI (screenshot); `bash -n scripts/launch-bake.sh` parses; checklist has ≥10 concrete items each with a pass/fail box.
- **ACCEPTANCE GATES:** kit merged; user notified with start date; ⏸ the bake itself is a USER action — packet is done when the kit is in their hands, not when the bake ends.
- **ROLLBACK:** revert docs/script commit.
- **EVIDENCE:** PR + screenshot of flag-on session + the checklist doc.
- **Effort:** ~2h.

## PD.2 — Audio-tracks flag default-ON (un-flag chain, step 2 of 3)

- **ID:** PD.2 · **branch:** `feat/audio-tracks-default-on` · **base:** `origin/main`
- **depends-on:** PD.1 **+ completed 1-week bake with zero audio regressions (USER gate — STOP without it)**
- **goal:** Flip `_experimental_audio_tracks_enabled()` to default TRUE; `EXPERIMENTAL_AUDIO_TRACKS=false/0/no/off` becomes the escape hatch. Legacy singleton-bed code stays (deleted in PD.3).
- **PRECONDITIONS (mismatch → STOP):**
  ```
  grep -n "Bake started" docs/plans/2026-06-audio-tracks-bake-checklist.md     # start date ≥7 days ago
  grep -c "FAIL" docs/plans/2026-06-audio-tracks-bake-checklist.md             # expect 0 (zero regressions)
  git grep -n 'os.environ.get("EXPERIMENTAL_AUDIO_TRACKS"' origin/main -- backend/src/zmq_server.py   # :53
  ```
- **scope (VERIFIED paths):** `backend/src/zmq_server.py:51-54` (default flip + docstring), every backend test that sets/clears the env var (`git grep -rln "EXPERIMENTAL_AUDIO_TRACKS" origin/main -- backend/tests` at pickup), `docs/` flag references.
- **DO-NOT-TOUCH:** singleton-bed deletion (PD.3); frontend flag readers if any (`git grep -rn "EXPERIMENTAL_AUDIO_TRACKS" origin/main -- frontend/src` at pickup — wire symmetrically if found).
- **steps:** (1) Invert default. (2) Sweep tests: tests asserting legacy-default behavior now need the explicit `=false`. (3) Update CLAUDE.md/docs mentions. (4) Full suites.
- **TEST PLAN:** `cd backend && python -m pytest -x -n auto --tb=short` green; targeted: `python -m pytest tests/ -k "audio" -v` green both with env unset AND with `EXPERIMENTAL_AUDIO_TRACKS=false`.
- **ACCEPTANCE GATES:** default-on verified by a named test `test_audio_tracks_default_enabled`; escape hatch verified by `test_flag_false_restores_legacy_path`; zero regressions.
- **ROLLBACK:** single-line revert of the default; escape hatch usable immediately (`EXPERIMENTAL_AUDIO_TRACKS=false`).
- **EVIDENCE:** PR + both named tests in pytest output.
- **Effort:** ~2h.

## PD.3 — Flag removal + singleton-bed deletion (un-flag chain, step 3 of 3) ⚠ RISK:HIGH

- **ID:** PD.3 · **branch:** `chore/audio-tracks-unflag` · **base:** `origin/main`
- **depends-on:** PD.2 + ≥1 additional week of default-on use with zero regression reports
- **RISK:HIGH** — memory `entropic-audio-tracks.md` §"PR-4 point-of-no-return": deleting the singleton bed is irreversible without a revert war. Do NOT bundle with any feature.
- **goal:** Remove `_experimental_audio_tracks_enabled()` + both branch arms in `zmq_server.py`; delete the legacy singleton-bed audio path (legacy `AudioPlayer` usage at `zmq_server.py:85` "Audio playback engine — singleton bed (legacy path)" and the legacy branch in `backend/src/audio/clock.py:19`); multi-track is the only path.
- **PRECONDITIONS (mismatch → STOP):**
  ```
  git log -1 --format=%cI <PD.2-merge-sha>     # ≥7 days ago
  git grep -n "singleton bed" origin/main -- backend/src/zmq_server.py        # :85 present
  git grep -n "legacy singleton-bed" origin/main -- backend/src/audio/clock.py # :19 present
  git grep -rln "AudioPlayer" origin/main -- backend/src                       # enumerate ALL callers before deleting (Infra Change Gate: list them in PR body)
  ls ~/.claude/.locks/session-*.lock 2>/dev/null | wc -l                       # if >1 parallel session: coordinate before a deletion PR (Gate 18b)
  ```
- **scope:** `backend/src/zmq_server.py` (flag fn + both branch arms), `backend/src/audio/player.py` (legacy player — delete ONLY if `mixer_player.py` is the surviving engine and no other caller remains per the grep), `backend/src/audio/clock.py` (drop legacy clock-source arm), all tests pinning the legacy path (delete or port).
- **DO-NOT-TOUCH:** `mixer_player.py`, `project_clock.py`, `meter.py`, frontend.
- **steps:** (1) Map every caller of the legacy symbols (grep list → PR body). (2) Delete flag fn + dead arms. (3) Delete legacy player/clock arm. (4) Port any test that was the only coverage of shared behavior. (5) Full suite + 30-min manual playback/export smoke.
- **TEST PLAN:** full backend suite green; `git grep -rn "EXPERIMENTAL_AUDIO_TRACKS\|singleton bed" backend/` → 0 hits; manual: import video, play, export with audio — A/V sync intact (compare to a PD.1-era export).
- **ACCEPTANCE GATES:** zero references remain; suite green; manual smoke logged; caller map in PR body.
- **ROLLBACK:** `git revert` the squash-merge — possible but painful after follow-on PRs; hence the two time-gates above.
- **EVIDENCE:** PR + caller map + smoke notes.
- **Effort:** ~4h.

## PD.4 — Source-audio auto-extract (task #46) — "Extract Audio" on video clips

- **ID:** PD.4 · **branch:** `feat/extract-audio` · **base:** `origin/main`
- **depends-on:** PD.2 (needs the multi-track path live; PD.3 not required)
- **goal:** Task #46 verbatim: right-click video clip → "Extract Audio" → backend decodes the audio-only stream of the same source file → new `AudioTrack` with an `AudioClip` referencing the source in audio-only mode. **VERIFIED greenfield:** `git grep -riE "splitAudio|extractAudio|extract_audio|split_audio" origin/main -- '*.py' '*.ts' '*.tsx'` returns ZERO hits.
- **PRECONDITIONS (mismatch → STOP):**
  ```
  cd ~/Development/entropic-v2challenger && git grep -riE "splitAudio|extractAudio" origin/main | wc -l      # expect 0 — if >0, someone built it; re-scope
  git ls-tree origin/main frontend/src/renderer/components/timeline/ContextMenu.tsx                           # context-menu component exists
  git grep -n "elif cmd ==" origin/main -- backend/src/zmq_server.py | head -2                                # IPC dispatch pattern
  git grep -n "AudioClip\|AudioTrack" origin/main -- frontend/src/shared/types.ts | head -4                   # types exist (audio-tracks stack)
  ```
- **scope (VERIFIED paths):** `backend/src/zmq_server.py` (new `extract_audio` command: PyAV probe → has-audio check → return stream metadata; clip creation is frontend store work), `frontend/src/renderer/components/timeline/ContextMenu.tsx` + the clip context-menu wiring in `Clip.tsx`, timeline store action (`stores/timeline.ts`) creating AudioTrack+AudioClip wrapped in `undoable()`, tests both sides.
- **DO-NOT-TOUCH:** decode pipeline internals; export path; existing AudioClip playback.
- **steps:** (1) Backend: validate source has an audio stream (PyAV `container.streams.audio`), return duration/channels/sample-rate; reject cleanly when none (toast "No audio stream in this clip"). (2) Store action: new AudioTrack labeled "Source audio — <clipname>", AudioClip with same source path, audio-only mode, aligned to the video clip's timeline start. (3) Context-menu item (disabled state when no audio stream — probe lazily or on menu open). (4) Undo = removes track+clip atomically.
- **TEST PLAN:**
  ```
  cd backend && python -m pytest tests/ -k "extract_audio" -v    # named: test_extract_audio_returns_stream_meta, test_extract_audio_no_stream_rejected
  cd frontend && npx --no vitest run src/__tests__/components/timeline/   # named new: extract-audio creates aligned AudioClip, undo removes track, menu disabled without audio
  ```
  Manual: video-with-audio fixture from `test-fixtures/` → extract → play both tracks → sync.
- **ACCEPTANCE GATES:** clip start alignment exact (same timeline offset); no-audio video shows disabled item or clean toast (chaos test: try a silent .mp4 + an image clip); single undo entry.
- **ROLLBACK:** revert PR.
- **EVIDENCE:** PR + test outputs + manual sync note (name runtime path).
- **Effort:** ~4h.

## PD.5 — Region-select on preview, part 1: marquee selection overlay (task #45a)

- **ID:** PD.5 · **branch:** `feat/region-select-marquee` · **base:** `origin/main`
- **depends-on:** none
- **goal:** Marquee (rectangular) region selection on the preview canvas: drag draws a selection rect (canvas-space → frame-space coordinate mapping), Escape/click-off clears, selection state in a store, visible affordance (marching-ants or dim-outside). NO cut/paste yet (PD.6).
- **PRECONDITIONS (mismatch → STOP):**
  ```
  git -C ~/Development/entropic-v2challenger ls-tree --name-only origin/main frontend/src/renderer/components/preview/
  # expect: BoundingBoxOverlay.tsx, PopOutPreview.tsx, PreviewCanvas.tsx, PreviewControls.tsx, SnapGuides.tsx, useFrameDisplay.ts
  git grep -rn "marquee\|region.select\|lasso" origin/main -- frontend/src/renderer | wc -l   # expect 0 — greenfield (task #45 confirmed via grep at filing)
  ```
- **scope (VERIFIED paths):** new `frontend/src/renderer/components/preview/RegionSelectOverlay.tsx` (study `BoundingBoxOverlay.tsx` + `SnapGuides.tsx` FIRST — read-existing-component rule; reuse their coordinate mapping), preview store or layout store selection state (pick the store that owns preview interaction state — record choice in PR body), toggle in `PreviewControls.tsx`, component tests.
- **DO-NOT-TOUCH:** frame pipeline, backend, `useFrameDisplay.ts` internals, Clip/timeline.
- **steps:** **Research Gate:** read `BoundingBoxOverlay.tsx` interaction pattern (it already solved canvas-coord mapping + drag z-order for this exact canvas) and follow it — cite it in a code comment. (1) Overlay with pointer-down/move/up drag rect. (2) Canvas→frame coordinate transform (account for letterboxing/zoom the same way BoundingBoxOverlay does). (3) Selection state + clear paths (Esc, click-off, new-frame-load policy: keep selection). (4) Drag-end must suppress the synthetic click (`feedback_drag-end-suppresses-click.md`).
- **TEST PLAN:** `cd frontend && npx --no vitest run src/__tests__/components/` — named new tests: `region-select draws rect in frame coords`, `escape clears selection`, `drag-end does not trigger click-off deselect`, `selection survives frame advance`. Full frontend suite green.
- **ACCEPTANCE GATES:** rect coordinates verified against a known letterboxed geometry in a unit test (exact numbers, not snapshot); chaos pass: zero-area drag, drag starting outside canvas, rapid double-drag.
- **ROLLBACK:** revert PR — overlay is additive.
- **EVIDENCE:** PR + tests + screenshot of active marquee (name runtime path).
- **Effort:** ~4h.

## PD.6 — Region-select part 2: cut/paste-to-layer (task #45b)

- **ID:** PD.6 · **branch:** `feat/region-cut-paste-layer` · **base:** `origin/main` (after PD.5)
- **depends-on:** PD.5
- **goal:** With a region selected: Cut/Copy → paste as a new clip on another track, implemented as a per-clip mask/crop (task #45 filing notes the per-clip mask plumbing exists in `backend/src/engine/container.py` — VERIFY its actual mask capability at pickup before designing). Reference UX: Photoshop marquee + paste-as-layer.
- **PRECONDITIONS (mismatch → STOP):**
  ```
  git -C ~/Development/entropic-v2challenger grep -n "mask" origin/main -- backend/src/engine/container.py | head -5   # if 0 hits → the filing's claim is stale; downgrade to spike (write a 1-page design doc first) and STOP the build
  git grep -rn "RegionSelectOverlay" origin/main -- frontend/src/renderer | head -2                                     # PD.5 merged
  ```
- **scope (sketch — re-verify at pickup):** timeline store actions (cut = source clip + region → new clip with crop/mask params on target track), `backend/src/engine/container.py` mask application if param plumbing is missing, context-menu/hotkey entries (⌘X/⌘V scoped to active region — check collisions in `frontend/src/renderer/utils/default-shortcuts.ts`), tests.
- **DO-NOT-TOUCH:** export determinism work (open PR #160's territory — coordinate if it lands mid-packet); system clipboard (this is internal paste only, v1).
- **steps:** (1) Verify container.py mask reality → choose mask-param vs crop-param representation. (2) Store action with `undoable()`. (3) Paste targets the selected track or creates one. (4) Render path verification: masked clip composites correctly over base.
- **TEST PLAN:** backend: named `test_clip_mask_region_applied` (golden-frame compare via existing oracle pattern); frontend named: `cut creates masked clip on target track`, `paste without selection is a no-op toast`, `undo restores both clips`. Full suites green.
- **ACCEPTANCE GATES:** visual result verified by a real render (not just state assertions); single undo entry per cut and per paste.
- **ROLLBACK:** revert PR.
- **EVIDENCE:** PR + golden-frame test + before/after screenshot.
- **Effort:** ~4h. **RISK:HIGH** if container.py mask claim is stale (precondition downgrades it to a spike).

## PD.7 — Gain-meter phase 3: per-track metering (task #47 → implementation task #35)

- **ID:** PD.7 · **branch:** `feat/gain-meter-per-track` · **base:** `origin/main`
- **depends-on:** PD.2 (per-track levels only exist on the multi-track path / `mixer_player.py`)
- **goal:** Phases 1–2 shipped (#102 meter math `backend/src/audio/meter.py` + component `GainMeter.tsx`; #105 end-to-end wiring) but v1 shows a **single master meter on every audio track** (`AudioTrack.tsx:136-141`: "v1 shows a single master meter on every audio track — there's only one audio player in the v1 stack. Per-track metering follows"). Phase 3 = real per-track RMS/peak/clip readings: `audio_meter` IPC grows a `track_id` param, mixer exposes per-track tap, `AudioTrackMeter` shows its own track's level, plus dB readout next to the gain knob (task #35's literal ask).
- **PRECONDITIONS (mismatch → STOP):**
  ```
  git -C ~/Development/entropic-v2challenger grep -n "_handle_audio_meter" origin/main -- backend/src/zmq_server.py   # :1028
  git grep -n "AudioTrackMeter" origin/main -- frontend/src/renderer/components/timeline/AudioTrack.tsx               # :130/:141
  git ls-tree origin/main backend/src/audio/mixer_player.py backend/src/audio/meter.py                                 # both exist
  git ls-tree origin/main frontend/src/renderer/hooks/useAudioMeterPoll.ts                                             # poll hook exists
  ```
- **scope (VERIFIED paths):** `backend/src/zmq_server.py` `_handle_audio_meter` (accept optional `track_id`; default = master, backward compatible), `backend/src/audio/mixer_player.py` (per-track sample tap pre-master-sum, post-track-gain), `frontend/src/renderer/hooks/useAudioMeterPoll.ts` (poll per visible track — batch into ONE IPC call returning all tracks to avoid N×poll traffic), `frontend/src/renderer/components/timeline/AudioTrack.tsx` (`AudioTrackMeter` consumes own-track reading + numeric dB readout), `backend/tests/test_audio/test_meter.py` + `frontend/src/__tests__/hooks/useAudioMeterPoll.test.tsx` (both exist — extend).
- **DO-NOT-TOUCH:** `meter.py` math (phases 1–2, already correct); `GainMeter.tsx` visual component (reused as-is); SG-4 realtime isolation invariants (meter tap must NOT block the audio thread — copy-out buffer, no locks on the render path).
- **steps:** (1) Mixer per-track ring-buffer tap. (2) IPC: `audio_meter` returns `{master: {...}, tracks: {<id>: {rms_db, peak_db, clipped}}}`. (3) Hook fan-out. (4) dB readout text. (5) Perf check: poll cost with 8 tracks.
- **TEST PLAN:** backend named: `test_meter_per_track_independent_levels` (two tracks, one silent → silent track reads floor), `test_meter_master_unchanged_for_legacy_callers`, `test_track_tap_post_gain`; frontend named: `meter poll batches one ipc call`, `track meter shows own level not master`. Full suites green.
- **ACCEPTANCE GATES:** the named silent-track test proves per-track independence (the entire point of phase 3); legacy callers (no `track_id`) untouched; no added latency on audio thread (assert tap is lock-free copy).
- **ROLLBACK:** revert PR — IPC change is backward compatible by design.
- **EVIDENCE:** PR + test outputs + screenshot of two tracks metering differently.
- **Effort:** ~4h.

## PD.8 — Hotkey-discoverability surfaces (issue #65 epic remainder)

- **ID:** PD.8 · **branch:** `feat/hotkey-surfaces` · **base:** `origin/main`
- **depends-on:** none
- **goal:** The 6 unchecked surfaces from `docs/plans/2026-05-14-upcoming-ux-items.md` §1 (on origin/main, verified): (1) track-header context menu (Rename/Duplicate/Move/Delete/automation-lane adds), (2) automation-lane right-click (if any), (3) effects browser add-effect key surfacing, (4) device-chain right-click items (where implemented), (5) Preferences→Shortcuts tab cross-reference audit, (6) top-bar native menus consistency audit. Approach per the doc: `prettyShortcut(shortcutRegistry.getEffectiveKey('<action>'))` from `frontend/src/renderer/utils/pretty-shortcut.ts`, passed as the existing `shortcut?: string` prop on `ContextMenu.tsx` MenuItems (pattern established in PR #62).
- **PRECONDITIONS (mismatch → STOP):**
  ```
  git -C ~/Development/entropic-v2challenger grep -n "shortcut?:" origin/main -- frontend/src/renderer/components/timeline/ContextMenu.tsx   # prop exists
  git ls-tree origin/main frontend/src/renderer/utils/pretty-shortcut.ts frontend/src/renderer/utils/shortcuts.ts                            # both exist
  gh issue view 65 --json state -q .state    # NOTE: returns CLOSED — see step 5
  ```
- **scope (VERIFIED paths):** `ContextMenu.tsx` call-sites across `frontend/src/renderer/components/` (enumerate at pickup: `git grep -ln "ContextMenu" -- frontend/src/renderer/components`), `pretty-shortcut.ts` (read-only), per-surface menu definitions; tests per surface.
- **DO-NOT-TOUCH:** `shortcuts.ts` registry semantics; key BINDINGS themselves (display-only packet); Electron native menu accelerators except where the audit (surface 6) finds an inconsistency — file those as findings, fix only trivial ones.
- **steps:** (1) Enumerate every action per surface + its registry key. (2) Wire `shortcut` prop. (3) Surfaces 5–6 are AUDITS: produce a findings table in the PR body; fix one-liners, file the rest. (4) Exit criterion from the doc: "any action invocable with a keyboard shortcut shows that shortcut at the point of invocation." (5) Issue #65 is CLOSED on GitHub but ROADMAP says 6 surfaces remain — comment on #65 with this PR link and either reopen it until merge or note supersession; reconcile the ROADMAP row.
- **TEST PLAN:** `cd frontend && npx --no vitest run` — named new tests per wired surface: `track header menu shows ⌘-shortcuts`, `menu item without binding shows no shortcut text` (negative). Full suite green.
- **ACCEPTANCE GATES:** all 6 checkboxes in `2026-05-14-upcoming-ux-items.md` §1 flipped (update the doc in the same PR — docs-before-done); audit tables in PR body.
- **ROLLBACK:** revert PR — display-only.
- **EVIDENCE:** PR + screenshots of ≥2 menus showing shortcuts + updated plan doc.
- **Effort:** ~3h.

## PD.9 — Cross-modal v1.1 F1–F4 DECISION packet (Gap G6)

- **ID:** PD.9 · **branch:** `docs/dec-crossmodal-disposition` · **base:** `origin/main`
- **depends-on:** none — **USER decision required; this packet prepares + records it, it does not make it**
- **goal:** Resolve G6: the merged-but-never-built Cross-Modal v1.1 plan (`docs/plans/2026-05-04-cross-modal-features-plan.md` on origin/main, verified — F1 datamosh sequencer, F2 motion angle, F3 macro device, F4 chord modulator; plan PR #36) either (a) FOLDS into the synth-paradigm vision PRDs (F3 ≈ vision-B2/macros; F1/F2/F4 map per a crosswalk this packet writes) or (b) is FORMALLY SUPERSEDED with a recorded rationale. No third option, no silent drift.
- **PRECONDITIONS (mismatch → STOP):**
  ```
  git -C ~/Development/entropic-v2challenger show origin/main:docs/plans/2026-05-04-cross-modal-features-plan.md | head -5   # plan exists, revision v3
  grep -n "G6" docs/roadmap/ROADMAP.md                                                                                        # gap registered
  ```
- **scope:** new `docs/decisions/DEC-CM-001-crossmodal-disposition.md` containing: per-feature crosswalk table (F1–F4 → nearest vision PRD + overlap %, citing the v3 plan's ground-truth file:line table), cost-of-fold vs cost-of-supersede, a recommendation, and the user's verbatim choice. Update `docs/roadmap/ROADMAP.md` G6 row + `docs/plans/2026-05-04-cross-modal-features-plan.md` frontmatter `status:` field per outcome.
- **DO-NOT-TOUCH:** any implementation; vision doc PRD content (crosswalk references, doesn't edit).
- **steps:** (1) Build the crosswalk (the v3 plan's verified-claims table makes this mechanical). (2) Present options to user with recommendation. (3) Record choice; if FOLD → enumerate which vision PRDs absorb which F-feature requirements (those become notes in the vision doc's PRD rows, one-line each); if SUPERSEDE → mark plan status `superseded` with pointer.
- **TEST PLAN:** n/a (docs). Structural: decision doc has "Decision" section quoting the user; both referenced docs updated in same PR; no orphan "planned" status remains.
- **ACCEPTANCE GATES:** G6 closes in ROADMAP gap register; grep `status: planned` on the cross-modal plan returns 0 post-merge.
- **ROLLBACK:** revert docs commit.
- **EVIDENCE:** PR + quoted user decision.
- **Effort:** ~2h.

## PD.10 — Rename residue: split-brain `~/.entropic`/`~/.creatrix` + const + repo name ⚠ RISK:HIGH (user data)

- **ID:** PD.10 · **branch:** `chore/creatrix-rename-residue` · **base:** `origin/main`
- **depends-on:** none
- **goal:** Finish PR #120's rename. Three sub-deliverables: (1) **Runtime-dir unification** — frontend writers still on the old dir (`logger.ts:10` → `~/.entropic/logs`, `pop-out-window.ts:7/:94`, `diagnostics-handlers.ts:215` feedback dir) move to `~/.creatrix`, WITH a one-time idempotent migration (move-or-merge existing `~/.entropic/{logs,feedback,pop-out-state.json}` into `~/.creatrix/`) because diagnostics read-validation already only allows `~/.creatrix` — today the Electron main log is **unreadable via the in-app diagnostics IPC** (real bug, not cosmetics). (2) **Const rename** `ENTROPIC_DIR` → `CREATRIX_DIR` in `diagnostics-handlers.ts:12` + `file-handlers.ts:12` + stale `~/.entropic` comments (`file-handlers.ts:4/:23/:42`, `diagnostics-handlers.ts:17`). (3) **Repo rename** `gh repo rename creatrix` — USER-CONFIRMED step, executed last, with remote-URL updates for all ~40 worktrees.
- **PRECONDITIONS (mismatch → STOP):**
  ```
  cd ~/Development/entropic-v2challenger
  git grep -n "'.entropic'" origin/main -- frontend/src/main | grep -v __tests__    # expect: logger.ts:10, pop-out-window.ts:7,:94, diagnostics-handlers.ts:215
  git grep -n "const ENTROPIC_DIR" origin/main -- frontend/src/main                  # diagnostics-handlers.ts:12 + file-handlers.ts:12, both → '.creatrix'
  ls ~/.entropic/ 2>/dev/null && ls ~/.creatrix/ 2>/dev/null                         # inventory BOTH dirs before writing any migration (Gate 19 spirit: look before declaring)
  ```
- **scope (VERIFIED paths):** `frontend/src/main/logger.ts`, `frontend/src/main/pop-out-window.ts`, `frontend/src/main/diagnostics-handlers.ts`, `frontend/src/main/file-handlers.ts`, new migration fn in main-process bootstrap (idempotent, merge-don't-clobber, leaves a `~/.entropic/MOVED.txt` breadcrumb), repo `CLAUDE.md` diagnostics paths section (currently documents `~/.entropic/*` — update), affected `frontend/src/__tests__/helpers/` mocks. **Out of scope:** `backend/scripts/demo_trilogy/` default out-dir `~/.entropic/demos` (render artifacts; note as follow-up, don't move user's rendered MP4s silently), `q7-report.json` location (q7 branches own it).
- **DO-NOT-TOUCH:** backend paths (already `.creatrix`-consistent: `diagnostics.py`, `main.py`); project files; anything under `~/.entropic/demos/`.
- **steps:** (1) Migration fn (ordered FIRST so logger writes to the new dir on the same boot). (2) Path constants + comments. (3) Tests: migration idempotency, merge behavior when both dirs have files, diagnostics IPC can now read electron-main.log. (4) Update CLAUDE.md. (5) AFTER merge + user confirmation: `gh repo rename creatrix` (GitHub auto-redirects old remotes; still update origin URLs: `git remote set-url origin ...` in main checkout + document for worktrees). Directory rename `~/Development/entropic-v2challenger` → deferred/user-choice (breaks ~40 worktree links — list them via `git worktree list` first; recommend deferring until worktree prune from ROADMAP Phase 1 hygiene lands).
- **TEST PLAN:** `cd frontend && npx --no vitest run` — named new: `migration moves entropic dir contents once`, `migration is a no-op on second run`, `migration merges without clobbering newer creatrix files`, `diagnostics read allows electron-main.log` (the bug-fix proof). Manual: launch app with a seeded fake `~/.entropic`, verify merge + app logs land in `~/.creatrix/logs`.
- **ACCEPTANCE GATES:** `git grep -rn "'.entropic'" frontend/src/main` → 0 (excluding the migration fn's own source constant); in-app log viewer shows electron-main.log; user's real `~/.entropic` contents survive (verify file counts before/after).
- **ROLLBACK:** code revert restores old paths; migration left originals' breadcrumb — data not destroyed (merge copies, then leaves originals until a later cleanup; state this in PR body).
- **EVIDENCE:** PR + named tests + before/after `ls -la ~/.entropic ~/.creatrix` + (post-rename) `gh repo view -q .nameWithOwner`.
- **Effort:** ~4h.

## PD.11 — F-0514-8 dylib warning SPIKE: cv2-removal inventory + plan (packaging)

- **ID:** PD.11 · **branch:** `spike/drop-opencv-plan` · **base:** `origin/main`
- **depends-on:** none
- **goal:** The deferred real fix per `docs/plans/2026-05-15-mount-and-bug-sweep-plan.md:51`: both `opencv-python-headless` AND `av` bundle libavdevice (.61 vs .62) → `AVFFrameReceiver`/`AVFAudioReceiver` duplicate-class warning; verdict was "drop opencv entirely (PyAV already does video I/O; cv2 used only for color-space ops which numpy can replicate)". That's a claim, not an inventory. **Deliverable is a written migration plan with measured acceptance** — NOT "research opencv removal": `docs/decisions/DEC-PKG-001-drop-opencv.md` containing (a) the complete `import cv2`/`cv2.` call-site inventory (count + per-module function list), (b) numpy/PIL/scipy replacement for each cv2 function used, flagging any with no cheap equivalent (e.g. `cv2.resize` interpolation parity, optical-flow if used), (c) golden-frame risk list — which oracle-covered effects touch cv2 paths, (d) measured perf delta on ≥3 representative effects (cv2 vs replacement, ms/frame at 1080p), (e) GO/NO-GO recommendation + build-packet decomposition (≤4h each) if GO.
- **PRECONDITIONS (mismatch → STOP):**
  ```
  cd ~/Development/entropic-v2challenger && git grep -c "import cv2\|cv2\." origin/main -- backend/src    # record N; if 0 the premise is dead — just remove the dep and close
  git show origin/main:backend/pyproject.toml | grep opencv                                                # opencv-python-headless>=4.10 present
  git show origin/main:docs/plans/2026-05-15-mount-and-bug-sweep-plan.md | sed -n '51p'                    # deferral rationale present
  ```
- **scope:** the decision doc + a throwaway bench script under `backend/scripts/` (committed for reproducibility). **DO-NOT-TOUCH:** any production module, `pyproject.toml` (the BUILD packets do that, post-GO).
- **steps:** (1) Mechanical inventory (grep + per-call-site classification). (2) Prototype the 3 hottest replacements in the bench script. (3) Measure. (4) Write plan + decomposition.
- **TEST PLAN:** doc exists; inventory count in doc equals the precondition grep count (no silent omissions); ≥3 measured ms/frame comparisons present; every cv2 function used appears in the replacement table.
- **ACCEPTANCE GATES:** GO/NO-GO stated; if GO, build packets enumerated with the oracle-regression test strategy (existing `pytest -m oracle` markers are the safety net — name which oracle suites gate each build packet).
- **ROLLBACK:** delete doc + bench script.
- **EVIDENCE:** PR + measurement table.
- **Effort:** ~4h. (Build packets follow from the doc, not from here.)
- **PD.17 rider (one-liner): F-16 narrow-fix disposition.** ROADMAP G8 lists "F-16" among the open bugs with zero surviving spec in repo docs (`git grep -rn "F-16" origin/main -- docs/` hits only an unrelated "PF-16/17" string in V2-AUTOMATED-UAT-PLAN.md:1112 — verified 2026-06-11). Whoever picks up PD.11 also: locate F-16's original filing (`memory/entropic-uat-may14.md` / task store), then fix-or-close with a recorded one-line reason and update the G8 row; if unlocatable after that search, close it in G8 as "filing lost — unreproducible" (Gate 19 spirit: search before declaring dead).

## PD.12 — History-buffer Gap-2 + Gap-3 (per `docs/roadmap/plans/entropic-history-buffer-validation.md`)

- **ID:** PD.12 · **branch:** `chore/history-buffer-gaps` · **base:** `origin/main`
- **depends-on:** none (Gap-2's enforcement target is routing mutations from PR-B/#158 — if #158 is unmerged at pickup, ship the convention doc + the smoke test and leave a checklist note for #158 review)
- **goal:** The two outstanding XS items (Gap-1/Gap-4/Gap-5 deliberately deferred/closed per the doc): **Gap-2** — description-string convention for routing edits (the doc's 8-row template table: `Map {source} → {target} (×{depth})`, `Unmap …`, etc.) landed as a convention doc + a vitest that asserts existing/new routing mutations' `undoable()` descriptions match the templates; **Gap-3** — 500-entry undo memory smoke: build 500 entries with synthetic large captures, measure heap delta, assert < 50MB (doc's stated threshold).
- **PRECONDITIONS (mismatch → STOP):**
  ```
  cd ~/Development/entropic-v2challenger
  git grep -n "MAX_UNDO_ENTRIES" origin/main -- frontend/src/renderer/stores/undo.ts        # expect :12-13 = 500 (doc re-verified 2026-06-04)
  git ls-tree origin/main frontend/src/__tests__/stores/undo.test.ts                         # existing test file to extend
  git grep -rn "undoable(" origin/main -- frontend/src/renderer/stores | wc -l               # enumerate adopters (doc says operators/performance/timeline import it)
  ```
- **scope (VERIFIED paths):** new `docs/conventions/undo-descriptions.md` (the 8-template table verbatim from the validation doc), `frontend/src/__tests__/stores/undo.test.ts` (extend: memory smoke + description-format assertions for current `undoable()` call sites), optionally a tiny `formatUndoDescription()` helper in `stores/undo.ts` IF ≥3 call sites would use it (else skip — YAGNI; record the call).
- **DO-NOT-TOUCH:** `undo.ts` core mechanics (`execute`, transactions, caps — all verified correct per the doc's line-by-line pass); HistoryPanel.
- **steps:** (1) Convention doc. (2) Gap-3 smoke: 500 synthetic entries with ~100KB captures each, `performance.memory`-style heap measurement in vitest (or process.memoryUsage in node env), assert delta < 50MB. (3) Description assertions for the templates that have live call sites today; templates for not-yet-built actions (paint mask, bulk edits) marked "reserved" in the doc. (4) Add the convention to PR-B/#158's review checklist (comment on the PR).
- **TEST PLAN:** `cd frontend && npx --no vitest run src/__tests__/stores/undo.test.ts` — named new: `500 entries stay under 50MB heap delta`, `routing mutation descriptions match convention templates`. Full frontend suite green.
- **ACCEPTANCE GATES:** ROADMAP G12 flips 🟢→closed; both named tests green; #158 PR comment posted.
- **ROLLBACK:** revert PR — additive only.
- **EVIDENCE:** PR + vitest output with the measured heap delta number.
- **Effort:** ~2h.

## PD.13 — DECISION packet: 53 layer transitions — schedule or formally defer (closes the "designed, on no tier" gap)

- **ID:** PD.13 · **branch:** `docs/dec-transitions-disposition` · **base:** `origin/main`
- **depends-on:** none — **USER decision required; this packet prepares + records it**
- **goal:** `docs/addendums/LAYER-TRANSITIONS.md` designs **53 transition types** (MISSING-FUNCTIONS §1 item #7, P1 severity) yet they sit on **no roadmap tier**. Output = a decision record assigning transitions to a tier — **recommendation: post-B5**, because B5 grouping/composite-tree (Phase 5a) delivers the layer-composite machinery transitions render through — OR a formal defer-with-owner. No third option, no silent drift.
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  cd ~/Development/entropic-v2challenger && git fetch origin
  git -C ~/Development/entropic-v2challenger show origin/main:docs/addendums/LAYER-TRANSITIONS.md | head -5   # doc exists on origin/main (blob verified 2026-06-11)
  grep -n "PD.13" docs/roadmap/packets/user-expectations.md | head -1                                          # UE file points #7 here — cross-ref intact
  ```
- **scope:** new `docs/decisions/transitions-disposition.md` — the measurable artifact — containing: transition-count + category summary read from LAYER-TRANSITIONS.md, dependency analysis (what B5/composite-tree provides vs what transitions additionally need), cost band, the recommendation (post-B5 tier slot), and the user's verbatim choice; update `docs/roadmap/MISSING-FUNCTIONS-INVENTORY.md` item #7 row + ROADMAP Phase-5 note per outcome.
- **DO-NOT-TOUCH:** any implementation; LAYER-TRANSITIONS.md content (referenced, not edited).
- **steps:** (1) Read LAYER-TRANSITIONS.md on origin/main end-to-end. (2) Map prerequisites against the B-ladder (composite-tree = B5, P5a). (3) Present tier options + recommendation to user. (4) Record the decision; if scheduled → name the owning phase/packet stub; if deferred → named owner + revisit trigger.
- **TEST PLAN:** n/a (docs). Structural: `test -f docs/decisions/transitions-disposition.md` AND the file contains a "Decision" section quoting the user; inventory row #7 updated in the same PR.
- **ACCEPTANCE GATES:** decision file exists with a quoted user decision; zero "on no tier" residue — item #7 names either a tier or an owner.
- **ROLLBACK:** revert docs commit.
- **EVIDENCE:** PR + quoted user decision.
- **Effort:** ~2h. · **Model:** Sonnet.

## PD.14 — DECISION packet: MISSING-FUNCTIONS full disposition (all 26 §1 items)

- **ID:** PD.14 · **branch:** `docs/dec-missing-functions-disposition` · **base:** `origin/main`
- **depends-on:** none (PD.13 settles item #7 in parallel — don't duplicate its call)
- **goal:** Every one of the **26 items** in `docs/roadmap/MISSING-FUNCTIONS-INVENTORY.md` §1 gets exactly one disposition — **build-tier** (named tier/packet) / **defer-with-owner** (named owner + revisit trigger) / **cut** (with rationale, appended to the §4 do-not-re-propose table) — recorded **IN the inventory file** as a new "Disposition" table column. P1-shortlist items #1–#6+#8 default to their `packets/user-expectations.md` UE packets; #7 defaults to PD.13's outcome.
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  cd ~/Development/entropic-v2challenger && git fetch origin
  sed -n '/^## 1\. NEW Items/,/^## 2\./p' docs/roadmap/MISSING-FUNCTIONS-INVENTORY.md | grep -c "^| [0-9]"    # expect 26 (§1 table rows; a bare `grep -c "^| [0-9]"` over the whole file reads 27 — §2.8's "8x8 pad grid" row false-positives); drift → re-count before dispositioning
  test -f docs/roadmap/packets/user-expectations.md || { echo "STOP: UE packets missing — P1 defaults have no target"; exit 1; }
  ```
- **scope:** `docs/roadmap/MISSING-FUNCTIONS-INVENTORY.md` (add Disposition column to the §1 table; cuts also appended to §4), `docs/roadmap/ROADMAP.md` (one summary line in the parallel-track section), nothing else.
- **DO-NOT-TOUCH:** §4 existing cut rows (locked decisions); any implementation; the §2 category tables (the §1 shortlist is the disposition surface — §2 rows that are roadmap-covered already carry their IDs).
- **steps:** (1) Pre-fill defaults: #1–#6+#8 → UE.1–UE.7; #7 → PD.13. (2) For #9–#26: propose disposition per item with a one-line rationale (severity × effort × paradigm fit). (3) User pass on the proposals (binary accept/amend per row — no yellows). (4) Write the column; every row filled, zero blanks.
- **TEST PLAN:** n/a (docs). Structural: disposition column has 26/26 non-empty cells (`grep -c` quoted in evidence); every "cut" row also appears in §4; every "build-tier" row names an existing tier/packet doc.
- **ACCEPTANCE GATES:** 26/26 dispositioned; cross-refs resolve (named packets/tiers exist); user's amendments quoted in PR body.
- **ROLLBACK:** revert docs commit.
- **EVIDENCE:** PR + the 26/26 grep count + user quotes.
- **Effort:** ~2h. · **Model:** Sonnet.

## PD.15 — Wire-or-delete: internal orphans (MISSING-FUNCTIONS §3)

- **ID:** PD.15 · **branch:** `chore/pd15-orphan-wire-or-delete` · **base:** `origin/main`
- **depends-on:** none (UE.3 resolves the `rangeSelectClips` row independently — check its status at pickup)
- **goal:** Every §3 orphan gets a decision executed in this packet — wire it or delete it; nothing stays half-built. Per-orphan dispositions:
  - **Auto-update flow** (`preload/index.ts:135–141` `downloadUpdate()`/`installUpdate()`, `UpdateBanner.tsx` exists, zero invokers): DECIDE — finish wiring UpdateBanner into the app shell OR remove banner + preload APIs. Either way = code change + named test or deletion commit.
  - **`rangeSelectClips`**: **wired by UE.3** (`packets/user-expectations.md`) — reference it, do not duplicate; if UE.3 is merged at pickup, mark the row closed; ground truth: it was already shift-click-wired at `Clip.tsx:169`, so the "orphan" label was half-stale.
  - **Unmounted components** — `ParamSlider.tsx` (superseded by Slider/ParamPanel): delete; `ZoomScroll.tsx`: delete; **`MacroKnob.tsx`: do NOT delete** — note in-file as a **P5a B4-macros revival candidate** (`// REVIVAL CANDIDATE(P5a/B4): 8-macro rack knobs — see packets/phase-5a.md`) and record in the PR body.
  - **Dead preload APIs** `getPathForFile()` (:5), `isPopOutOpen()` (:153): delete unless a caller is found at pickup (`git grep` each).
  - **12 dead ZMQ handlers** (`zmq_server.py`): DECIDE — wire `effect_health` / `effect_stats` / `memory_status` into a **diagnostics-HUD stub** (frontend-only panel behind the existing diagnostics surface, the §3-noted "ready-made backends" path) OR delete them; **the remaining 9** (`shutdown`, `seek`, `apply_chain`, `render_text_frame`, `audio_position`, `audio_tracks_clear`, `export_status`, `check_dag` [test-only — keep if tests use it], `read_freeze`) → delete after a caller grep proves zero invokers each (Infra Change Gate: list the caller map in the PR body).
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  cd ~/Development/entropic-v2challenger && git fetch origin
  git grep -n "downloadUpdate\|installUpdate" origin/main -- frontend/src | wc -l        # >0 (preload + banner exist)
  git grep -rln "ParamSlider\|ZoomScroll" origin/main -- frontend/src/renderer | grep -v "components/effects/ParamSlider.tsx\|components/timeline/ZoomScroll.tsx" | wc -l   # expect 0 importers — else NOT orphans, STOP and re-audit
  git grep -n "effect_health\|effect_stats\|memory_status" origin/main -- backend/src/zmq_server.py | head -3   # handlers present
  ```
- **scope:** the files named per-orphan above + `frontend/src/preload/index.ts` + one new diagnostics-HUD stub component IF the wire option is chosen; tests per wired item; deletion commits per deleted item (one commit per orphan — surgical revert granularity).
- **DO-NOT-TOUCH:** `EXPERIMENTAL_AUDIO_TRACKS` machinery (PD.1–PD.3 own it); `zmq_server.py` dispatch beyond removing the dead handlers (single-flight rule); anything UE.3 owns.
- **steps:** (1) Caller-grep every orphan, paste the map. (2) Execute each disposition (one commit each). (3) Wired items get a named test; deleted items get the grep-proof in the commit body. (4) Update MISSING-FUNCTIONS §3 rows to "closed via PD.15" in the same PR.
- **TEST PLAN:** `cd frontend && npx --no vitest run` + `cd backend && python -m pytest -x -n auto --tb=short` — both green after deletions; per wired item a named test (e.g. `diagnostics hud renders effect_health stats` if the HUD path is chosen; `update banner appears when update available` if auto-update is wired).
- **ACCEPTANCE GATES:** zero §3 rows left undispositioned; caller map in PR body for every deletion; MacroKnob survives with the revival comment; suites green.
- **ROLLBACK:** revert per-orphan commits individually.
- **EVIDENCE:** PR + caller maps + test output + updated §3.
- **Effort:** ~4h. · **Model:** Sonnet.

## PD.16 — DECISION packet (extends PD.9 / Gap G6): POST-V1-ROADMAP Phases 12–19 fold-in vs supersede

- **ID:** PD.16 · **branch:** `docs/dec-postv1-roadmap-disposition` · **base:** `origin/main`
- **depends-on:** PD.9 recommended first (same G6 reconciliation muscle; PD.9 settles Cross-Modal F1–F4, this settles the OTHER stale roadmap) — not blocking
- **goal:** `docs/addendums/POST-V1-ROADMAP.md` Phases 12–19 (tempo, transitions, audio-reactive mods, beat effects, community — pre-paradigm) either FOLD into the synth-paradigm master sequence (per-phase crosswalk: Phase 14 ≈ C7/B2 etc.) or are FORMALLY SUPERSEDED. Output = a supersession note in the POST-V1-ROADMAP.md **header** + `docs/roadmap/INDEX.md` moves the doc to HISTORICAL if superseded.
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  cd ~/Development/entropic-v2challenger && git fetch origin
  git -C ~/Development/entropic-v2challenger show origin/main:docs/addendums/POST-V1-ROADMAP.md | head -5   # doc exists (blob verified 2026-06-11)
  grep -n "POST-V1-ROADMAP" docs/roadmap/INDEX.md | head -2                                                  # currently in NEEDS RECONCILIATION
  ```
- **scope:** `docs/addendums/POST-V1-ROADMAP.md` (header note only), `docs/roadmap/INDEX.md` (row move), new `docs/decisions/DEC-POSTV1-001-disposition.md` (per-phase crosswalk table Phases 12–19 → nearest vision PRD/tier + fold-or-supersede call + the user's verbatim choice), ROADMAP G6 row update (G6 closes only when BOTH PD.9 and PD.16 land — say which half this is).
- **DO-NOT-TOUCH:** POST-V1-ROADMAP body content; PD.13's transitions call (Phase-12 transitions overlap — PD.13 owns the transitions tier decision; this packet's crosswalk REFERENCES it).
- **steps:** (1) Crosswalk Phases 12–19 against the vision PRD list + master sequence. (2) Present fold-vs-supersede with recommendation. (3) Record choice; execute the header note + INDEX move; mark fold-in absorptions as one-line notes per absorbing PRD row.
- **TEST PLAN:** n/a (docs). Structural: header note present; INDEX row in the correct section; DEC file has a "Decision" section quoting the user; no phase 12–19 left unmapped in the crosswalk.
- **ACCEPTANCE GATES:** G6's POST-V1 half closes in the gap register; zero "needs reconciliation" residue for this doc.
- **ROLLBACK:** revert docs commit.
- **EVIDENCE:** PR + quoted user decision.
- **Effort:** ~2h. · **Model:** Sonnet.

---

## Suggested order + dependency notes

```
Independent, start any time:  PD.1, PD.5, PD.8, PD.9, PD.10, PD.11(+PD.17 rider), PD.12, PD.13, PD.14, PD.15, PD.16
User-gated chain:             PD.1 → [user 1-week bake ⏸] → PD.2 → PD.4, PD.7 → [1-week default-on ⏸] → PD.3 (RISK:HIGH)
Sequenced pair:               PD.5 → PD.6 (RISK if container.py mask claim stale)
Decision packets (user):      PD.9 (F1–F4 disposition), PD.10 step 5 (repo rename), PD.11 verdict (GO/NO-GO), PD.13 (transitions tier), PD.14 (26-item disposition), PD.16 (POST-V1 fold/supersede)
Cross-file:                   UE.3 (packets/user-expectations.md) closes PD.15's rangeSelectClips row; PD.13/PD.14 update MISSING-FUNCTIONS-INVENTORY.md — single-flight on that file
```

**Coordination hazards:** PD.4/PD.6/PD.7 touch `stores/timeline.ts` + `zmq_server.py` dispatch — don't run concurrently with each other or with open PR #157/#158/#160 merges without a rebase check (Gate 18b: multiple `parallel-session` locks exist in this repo's history).
