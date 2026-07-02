# Work Packets — Parallel Track (v2 debt, schedulable any time, independent of tiers)

**Authored:** 2026-06-11 · **Base for all packets:** `origin/main` @ `d821ae8` (verified). Re-run each packet's PRECONDITIONS at pickup — they are the contract, not the SHA.
**Repo:** `~/Development/entropic-v2challenger` (GitHub: `nissimdirect/entropic-v2challenger`).
**Source:** `docs/roadmap/ROADMAP.md` §3 "Parallel track" + §2 "v2 debt" ledger + Gap register G6/G7/G8/G12.

**Conventions:** fresh worktree per packet (`git worktree add ~/Development/creatrix-pd<N>-wt -b <branch> origin/main`); backend tests `cd backend && python -m pytest -x -n auto --tb=short`; frontend `cd frontend && npx --no vitest run`; one PR per packet. **Model tier:** stated per packet — default Sonnet; Opus where the packet deletes code, migrates user data, or touches the render path (PD.3, PD.6, PD.10). **Live-runtime rule (Gate 18):** every packet with a UI surface ends with a verification step in the RUNNING app, and the evidence names the runtime path (`ps aux | grep -i electron` → compare to the worktree you edited).
**Doc-location caveat (verified 2026-06-11):** `docs/roadmap/MISSING-FUNCTIONS-INVENTORY.md` does **NOT exist on origin/main** — it lives on the docs-consolidation branch only. PD.13/PD.14/PD.15 preconditions that read it use the local checkout (`test -f` first), not `git show origin/main:`.

**Ground-truth corrections found while authoring (vs ROADMAP/memory):**
1. GitHub **issue #65 (hotkey epic) is CLOSED** (2026-05-15) although ROADMAP lists it 🔄 with 6 surfaces remaining — PD.8 includes reopening-or-superseding it.
2. The rename residue is further along than ROADMAP implies: `ENTROPIC_DIR` consts in BOTH `frontend/src/main/diagnostics-handlers.ts:12` and `file-handlers.ts:12` already point to `~/.creatrix`. The REAL residue is a **split-brain runtime dir**: `frontend/src/main/logger.ts:10` (`~/.entropic/logs`), `pop-out-window.ts:7/:94` (`~/.entropic`), `diagnostics-handlers.ts:215` (`~/.entropic/feedback`) still write to the OLD dir while backend (`diagnostics.py`, `main.py`) writes to `~/.creatrix` — and diagnostics path-validation only allows `~/.creatrix`, so the Electron main log is unreadable through the in-app diagnostics IPC. PD.10 fixes this.
3. Task #47 is marked completed in the task store (it was the *spec* task); the open implementation gap is **task #35** ("Audio track header lacks gain meter + dB readout", pending). ROADMAP's "phase 3 ❌" refers to #35's scope: per-track metering (current `AudioTrackMeter` shows a single master meter on every track — comment at `AudioTrack.tsx:136-141`).
4. `EXPERIMENTAL_AUDIO_TRACKS` is an **env-var read**, not a constant: `backend/src/zmq_server.py:51-54` (`_experimental_audio_tracks_enabled()`), consumed at `:96-98`. ROADMAP's ":52" is the docstring line.

---

## PD.1 — Audio-tracks bake kit + bake-session instrumentation (un-flag chain, step 1 of 3)

- **ID:** PD.1 · **branch:** `feat/audio-tracks-bake-kit` · **base:** `origin/main`
- **depends-on:** none · **Model:** Sonnet · **Effort:** ~4h
- **goal:** The 1-week user bake (PR-4 gate per `memory/entropic-audio-tracks.md`: "merge of #30–#35 + 1-week user-facing bake + zero audio regression reports") has never started because there's no bake harness — and "did the bake happen?" must be **machine-checkable, not vibes**. Three sub-deliverables:
  - **PD.1a — bake-session logger (instrumentation):** new `backend/src/audio/bake_log.py` — the app appends one JSONL line per audio session to `~/.creatrix/audio-bake-log.jsonl`. Hooked at `MixerPlayer.start()`/`stop()` (`backend/src/audio/mixer_player.py:77`/`:106`, verified); error count read from the **already-existing** `callback_error_count` property (`mixer_player.py:62`/`:141-144`, verified — monotonic count of exceptions caught in `_callback`). Line schema (`schema: 1`): `{"schema": 1, "ts_start": "<iso8601>", "ts_end": "<iso8601>", "duration_s": <float>, "device": "<sounddevice device name>", "callback_errors": <int session delta>, "flag_on": <bool>}`. Logger MUST be fail-silent (an I/O error appending the log never raises into the audio path) and append-only (`open(..., "a")` + flush per line). Test override: `CREATRIX_BAKE_LOG=<path>` env.
  - **PD.1b — machine gate-check script:** new `scripts/check_bake_gate.py --log <path> [--since YYYY-MM-DD]`. PASS (exit 0, prints `BAKE GATE: PASS`) requires ALL, computed over `flag_on: true` sessions newer than `--since` when given: (1) **≥7 distinct local dates** with ≥1 session; (2) **Σ duration_s ≥ 7200** (≥2h cumulative); (3) **Σ callback_errors == 0**; (4) **zero malformed/unparseable lines** in the file (a tampered or truncated line = FAIL, not skip); (5) log file exists and is non-empty. Any failure → exit 1 + first failed criterion on stdout. This script IS PD.2's un-flag gate.
  - **PD.1c — kit:** new `docs/plans/2026-06-audio-tracks-bake-checklist.md` (≥10 checklist items, each with a pass/fail box: import video+audio, multi-track playback, gain/mute/solo, A/V sync under temporal effects, export with audio, crash watch via `~/.creatrix/crash_reports/`), new `scripts/launch-bake.sh` (`EXPERIMENTAL_AUDIO_TRACKS=true` + `cd frontend && npm start`), bake-findings log stub in the checklist doc.
- **PRECONDITIONS (mismatch → STOP):**
  ```
  cd ~/Development/entropic-v2challenger && git fetch origin
  git grep -n "_experimental_audio_tracks_enabled" origin/main -- backend/src/zmq_server.py   # expect def at :51, use at :98 (verified 2026-06-11)
  git grep -c "EXPERIMENTAL_AUDIO_TRACKS" origin/main -- backend/src/zmq_server.py            # expect 3 (verified)
  git grep -n "def start\|def stop\|callback_error_count" origin/main -- backend/src/audio/mixer_player.py  # expect start :77, stop :106, _callback_error_count :62, property :141 (verified)
  gh pr view 30 --json state -q .state && gh pr view 66 --json state -q .state                 # both MERGED
  ```
- **scope (VERIFIED paths):** `backend/src/audio/bake_log.py` (new), `backend/src/audio/mixer_player.py` (two hook lines in `start()`/`stop()` only), `scripts/check_bake_gate.py` (new), `scripts/launch-bake.sh` (new — `scripts/` exists at repo root, verified), `docs/plans/2026-06-audio-tracks-bake-checklist.md` (new), `backend/tests/test_audio/test_bake_log.py` (new).
- **DO-NOT-TOUCH:** any flag default; flag logic in `zmq_server.py`; singleton-bed code; `mixer_player.py` beyond the two hook calls (no callback changes — read `callback_error_count`, don't touch its accounting).
- **steps:** (1) `bake_log.py` writer + the two MixerPlayer hooks. (2) Gate-check script. (3) Checklist from the audio-tracks PR stack scope (#30–#35 features). (4) Launch script. (5) Smoke it once yourself: launch with flag on, play audio ≥60s, stop, `cat ~/.creatrix/audio-bake-log.jsonl` shows the new line (Live Runtime Check — name the runtime path). (6) Hand to user with the 1-week clock start date recorded in the doc.
- **TEST PLAN:** `cd backend && python -m pytest tests/ -k "bake" -v` — named new tests in `test_bake_log.py`:
  - `test_bake_logger_appends_one_line_per_session` (two start/stop cycles → exactly 2 valid JSONL lines)
  - `test_bake_logger_records_callback_error_count` (inject a callback error via the counter → line carries the delta)
  - `test_bake_logger_write_failure_does_not_raise` (NEGATIVE — log path unwritable → session start/stop still succeeds)
  - `test_bake_gate_passes_on_seven_days_two_hours_zero_errors` (synthetic 7-day/2h log → exit 0)
  - `test_bake_gate_fails_on_missing_log` (NEGATIVE — no file → exit 1, "log missing")
  - `test_bake_gate_fails_on_tampered_line` (NEGATIVE — one truncated/garbage line in an otherwise-passing log → exit 1)
  - `test_bake_gate_fails_under_seven_distinct_days` (NEGATIVE — 6 days → exit 1)
  - `test_bake_gate_fails_on_nonzero_callback_errors` (NEGATIVE — one session with `callback_errors: 1` → exit 1)
  - `test_bake_session_end_to_end_logs_and_gate_reads` (INTEGRATION, full chain: mocked-sounddevice `MixerPlayer.start()` → `stop()` → line lands in `CREATRIX_BAKE_LOG` tmpfile → `check_bake_gate.py` parses it and fails with "under 7 days" — proving writer→file→gate agree on schema)
  Plus: `bash -n scripts/launch-bake.sh` parses; full backend suite green (`cd backend && python -m pytest -x -n auto --tb=short`).
- **ACCEPTANCE GATES (quantified):** all 9 named tests green; checklist has ≥10 items with pass/fail boxes; live-runtime smoke shows ≥1 real JSONL line with `flag_on: true` and `callback_errors: 0`; `python scripts/check_bake_gate.py --log ~/.creatrix/audio-bake-log.jsonl` exits 1 with "under 7 days" on day one (correct early-fail); user notified with start date written into the checklist doc. ⏸ the bake itself is a USER action — packet is done when the kit + instrumentation are merged, not when the bake ends.
- **failure modes:** logger I/O failure (covered: fail-silent test); clock skew/DST making two sessions share a date (distinct-date counting uses local dates — acceptable: it can only undercount, never overcount); user edits the log by hand (tamper test fails the gate; the gate also cross-checks against `~/.creatrix/crash_reports/` count in the checklist).
- **ROLLBACK:** revert PR — logger hooks are 2 lines, additive.
- **EVIDENCE:** PR + pytest output naming all 9 tests + `cat` of a real log line + screenshot of flag-on session (runtime path named).

## PD.2 — Audio-tracks flag default-ON (un-flag chain, step 2 of 3)

- **ID:** PD.2 · **branch:** `feat/audio-tracks-default-on` · **base:** `origin/main`
- **depends-on:** PD.1 **+ machine-checkable bake gate PASS (USER bake — STOP without it; the gate script is the arbiter, not a checklist read)**
- **Model:** Sonnet · **Effort:** ~2h
- **goal:** Flip `_experimental_audio_tracks_enabled()` to default TRUE; `EXPERIMENTAL_AUDIO_TRACKS=false/0/no/off` becomes the escape hatch. Legacy singleton-bed code stays (deleted in PD.3).
- **PRECONDITIONS (mismatch → STOP):**
  ```
  python scripts/check_bake_gate.py --log ~/.creatrix/audio-bake-log.jsonl && echo GATE-PASS   # MACHINE GATE: exit 0 = ≥7 distinct days AND Σ duration ≥2h AND zero callback_errors AND zero malformed lines — anything else STOPS this packet
  grep -c "FAIL" docs/plans/2026-06-audio-tracks-bake-checklist.md                              # expect 0 (secondary, human-observed regressions)
  git grep -n 'os.environ.get("EXPERIMENTAL_AUDIO_TRACKS"' origin/main -- backend/src/zmq_server.py   # :53 (verified 2026-06-11)
  ```
- **scope (VERIFIED paths):** `backend/src/zmq_server.py:51-54` (default flip + docstring), every backend test that sets/clears the env var (`git grep -rln "EXPERIMENTAL_AUDIO_TRACKS" origin/main -- backend/tests` at pickup), `docs/` flag references.
- **DO-NOT-TOUCH:** singleton-bed deletion (PD.3); `bake_log.py` (keeps logging post-flip — PD.3's second gate reads it); frontend flag readers if any (`git grep -rn "EXPERIMENTAL_AUDIO_TRACKS" origin/main -- frontend/src` at pickup — wire symmetrically if found).
- **steps:** (1) Invert default. (2) Sweep tests: tests asserting legacy-default behavior now need the explicit `=false`. (3) Update CLAUDE.md/docs mentions. (4) Full suites.
- **TEST PLAN:** `cd backend && python -m pytest -x -n auto --tb=short` green; targeted: `cd backend && python -m pytest tests/ -k "audio" -v` green both with env unset AND with `EXPERIMENTAL_AUDIO_TRACKS=false`. Named: `test_audio_tracks_default_enabled` (env unset → multi-track path), `test_flag_false_restores_legacy_path` (escape hatch), `test_flag_garbage_value_falls_back_to_default_on` (NEGATIVE — `EXPERIMENTAL_AUDIO_TRACKS=banana` → default-on, never crash).
- **ACCEPTANCE GATES (quantified):** all 3 named tests green; full backend suite green with 0 new failures vs the pre-flip baseline (`scripts/check-regression.sh` if applicable); gate-script PASS output pasted into the PR body (the un-flag audit trail).
- **failure modes:** bake log shows errors but checklist says PASS (machine gate wins — STOP); a test silently depended on legacy default (covered by the explicit-`=false` sweep in step 2); garbage env value (covered by the negative test).
- **ROLLBACK:** single-line revert of the default; escape hatch usable immediately (`EXPERIMENTAL_AUDIO_TRACKS=false`).
- **EVIDENCE:** PR + all 3 named tests in pytest output + gate-script PASS transcript.

## PD.3 — Flag removal + singleton-bed deletion (un-flag chain, step 3 of 3) ⚠ RISK:HIGH

- **ID:** PD.3 · **branch:** `chore/audio-tracks-unflag` · **base:** `origin/main`
- **depends-on:** PD.2 + machine-checkable second bake window (gate script with `--since`, below)
- **Model:** Opus (irreversible deletion — highest-judgment tier) · **Effort:** ~4h
- **RISK:HIGH** — memory `entropic-audio-tracks.md` §"PR-4 point-of-no-return": deleting the singleton bed is irreversible without a revert war. Do NOT bundle with any feature.
- **goal:** Remove `_experimental_audio_tracks_enabled()` + both branch arms in `zmq_server.py`; delete the legacy singleton-bed audio path (legacy `AudioPlayer` usage at `zmq_server.py:85` "Audio playback engine — singleton bed (legacy path)" and the legacy branch in `backend/src/audio/clock.py:19`); multi-track is the only path. `bake_log.py` STAYS (cheap, useful telemetry); `check_bake_gate.py` is retired to historical (note in its docstring, don't delete).
- **PRECONDITIONS (mismatch → STOP):**
  ```
  git log -1 --format=%cI <PD.2-merge-sha>                                     # ≥7 days ago
  python scripts/check_bake_gate.py --log ~/.creatrix/audio-bake-log.jsonl --since <PD.2-merge-date>   # MACHINE GATE: exit 0 = ≥7 distinct default-on days, ≥2h, zero callback_errors SINCE the flip
  git grep -n "singleton bed" origin/main -- backend/src/zmq_server.py        # :85 present (verified 2026-06-11)
  git grep -n "legacy singleton-bed" origin/main -- backend/src/audio/clock.py # :19 present (verified 2026-06-11)
  git grep -rln "AudioPlayer" origin/main -- backend/src                       # enumerate ALL callers before deleting (Infra Change Gate: list them in PR body)
  ls ~/.claude/.locks/session-*.lock 2>/dev/null | wc -l                       # if >1 parallel session: coordinate before a deletion PR (Gate 18b)
  ```
- **scope:** `backend/src/zmq_server.py` (flag fn + both branch arms), `backend/src/audio/player.py` (legacy player — delete ONLY if `mixer_player.py` is the surviving engine and no other caller remains per the grep), `backend/src/audio/clock.py` (drop legacy clock-source arm), all tests pinning the legacy path (delete or port).
- **DO-NOT-TOUCH:** `mixer_player.py` (except keeping the PD.1 bake hooks), `project_clock.py`, `meter.py`, `bake_log.py`, frontend.
- **steps:** (1) Map every caller of the legacy symbols (grep list → PR body). (2) Delete flag fn + dead arms. (3) Delete legacy player/clock arm. (4) Port any test that was the only coverage of shared behavior. (5) Full suite + 30-min manual playback/export smoke in the RUNNING app (Live Runtime Check — name the runtime path).
- **TEST PLAN:** full backend suite green (`cd backend && python -m pytest -x -n auto --tb=short`); `git grep -rn "EXPERIMENTAL_AUDIO_TRACKS\|singleton bed" backend/` → 0 hits; named new: `test_env_flag_ignored_after_removal` (NEGATIVE — `EXPERIMENTAL_AUDIO_TRACKS=false` env set → multi-track path anyway, no crash, no legacy import attempt). Manual INTEGRATION: import video, play, export with audio — A/V sync intact (compare byte-level/duration to a PD.1-era export of the same fixture).
- **ACCEPTANCE GATES (quantified):** 0 grep hits for the flag or "singleton bed" under `backend/`; backend suite green with 0 fewer passing tests than baseline minus the intentionally-deleted legacy-path tests (count both in PR body); the named negative test green; caller map (every `AudioPlayer` reference + disposition) in PR body; 30-min smoke logged with runtime path.
- **failure modes:** a hidden caller of `AudioPlayer` outside `backend/src` (covered: repo-wide grep in step 1, not just backend/src); a test that was the only coverage of shared decode behavior dies with the legacy path (covered: step 4 port audit, count in gates); env var set in user's shell after removal (covered: named negative test).
- **ROLLBACK:** `git revert` the squash-merge — possible but painful after follow-on PRs; hence the two time-gates above.
- **EVIDENCE:** PR + caller map + gate-script `--since` PASS transcript + named-test output + smoke notes (runtime path named).

## PD.4 — Source-audio auto-extract (task #46) — "Extract Audio" on video clips

- **ID:** PD.4 · **branch:** `feat/extract-audio` · **base:** `origin/main`
- **depends-on:** PD.2 (needs the multi-track path live; PD.3 not required) · **Model:** Sonnet · **Effort:** ~4h
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
  cd backend && python -m pytest tests/ -k "extract_audio" -v    # named: test_extract_audio_returns_stream_meta, test_extract_audio_no_stream_rejected (NEGATIVE)
  cd frontend && npx --no vitest run src/__tests__/components/timeline/   # named new: `extract audio creates aligned AudioClip`, `undo removes extracted track and clip atomically`, `extract menu item disabled for clip without audio stream` (NEGATIVE)
  ```
  INTEGRATION (full chain, frontend with mocked IPC): named `extract audio end to end: context menu → ipc command → store creates track and clip at video clip position` — asserts the IPC payload (`cmd: "extract_audio"`, source path) AND the resulting store state in one test. Manual: video-with-audio fixture from `test-fixtures/` → extract → play both tracks → sync (Live Runtime Check — name the runtime path).
- **ACCEPTANCE GATES (quantified):** `audioClip.position === videoClip.position` exactly (0 offset, asserted with exact numbers in the named alignment test); no-audio video shows disabled item or clean toast (chaos: a silent .mp4 + an image clip → both named negatives); exactly 1 undo entry per extract (HistoryPanel row count asserted); both suites green.
- **failure modes:** source file moved between menu-open probe and extract (backend returns `ok: false` + toast, no zombie track — add this as an explicit error-path assertion in `test_extract_audio_no_stream_rejected`'s sibling); PyAV container without audio metadata (covered: negative test).
- **ROLLBACK:** revert PR.
- **EVIDENCE:** PR + test outputs + manual sync note (runtime path named).

## PD.5 — Region-select on preview, part 1: marquee selection overlay (task #45a)

> **SUPERSEDED by MK.4** (packets/masking.md, merged #204) — do not execute; the masking workstream owns this scope.

- **ID:** PD.5 · **branch:** `feat/region-select-marquee` · **base:** `origin/main`
- **depends-on:** none · **Model:** Sonnet · **Effort:** ~4h
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
- **TEST PLAN:** `cd frontend && npx --no vitest run src/__tests__/components/` — named new tests: `region-select draws rect in frame coords`, `escape clears selection`, `drag-end does not trigger click-off deselect` (NEGATIVE), `selection survives frame advance`, `zero-area drag creates no selection` (NEGATIVE). INTEGRATION (full chain): named `marquee pointer sequence commits frame-space selection to store and overlay renders it` — synthetic pointerdown/move/up → store selection state → overlay re-render asserted in one test. Full frontend suite green.
- **ACCEPTANCE GATES (quantified):** rect coordinates verified against a known letterboxed geometry in a unit test (exact numbers, not snapshot — e.g. 1920×1080 frame in a 800×450 canvas with 25px letterbox → asserted frame coords); chaos pass: zero-area drag (named negative), drag starting outside canvas, rapid double-drag; all 6 named tests green.
- **failure modes:** letterbox math drift vs `BoundingBoxOverlay` (covered: shared/copied transform + exact-numbers test); synthetic click after drag-end deselecting (covered: named negative per `feedback_drag-end-suppresses-click.md`).
- **ROLLBACK:** revert PR — overlay is additive.
- **EVIDENCE:** PR + tests + screenshot of active marquee in the RUNNING app (runtime path named — Gate 18).

## PD.6 — Region-select part 2: cut/paste-to-layer (task #45b)

> **SUPERSEDED by MK.9** (packets/masking.md, merged #204) — do not execute; the masking workstream owns this scope.

- **ID:** PD.6 · **branch:** `feat/region-cut-paste-layer` · **base:** `origin/main` (after PD.5)
- **depends-on:** PD.5 · **Model:** Opus (render-path correctness) · **Effort:** ~4h
- **goal:** With a region selected: Cut/Copy → paste as a new clip on another track, implemented as a per-clip mask/crop. The filing's claim is now **VERIFIED TRUE 2026-06-11**: `backend/src/engine/container.py` is the "Effect container — wraps pure effect functions with mask + mix pipeline" (`:1`), pipeline `mask → process → mix` (`:26`), `_mask` param popped at `:58`, mask blend applied at `:128-130`. Reference UX: Photoshop marquee + paste-as-layer.
- **PRECONDITIONS (mismatch → STOP):**
  ```
  git -C ~/Development/entropic-v2challenger grep -n "mask" origin/main -- backend/src/engine/container.py | head -5   # expect :1 docstring, :26 pipeline, :58 `_mask` pop, :128-130 blend (verified 2026-06-11) — if 0 hits → claim went stale, downgrade to spike + STOP
  git grep -rn "RegionSelectOverlay" origin/main -- frontend/src/renderer | head -2                                     # PD.5 merged
  ```
- **scope (sketch — re-verify at pickup):** timeline store actions (cut = source clip + region → new clip with crop/mask params on target track), `backend/src/engine/container.py` mask application if param plumbing is missing, context-menu/hotkey entries (⌘X/⌘V scoped to active region — check collisions in `frontend/src/renderer/utils/default-shortcuts.ts`), tests.
- **DO-NOT-TOUCH:** export determinism work (open PR #160's territory — coordinate if it lands mid-packet); system clipboard (this is internal paste only, v1).
- **steps:** (1) Verify container.py mask reality → choose mask-param vs crop-param representation. (2) Store action with `undoable()`. (3) Paste targets the selected track or creates one. (4) Render path verification: masked clip composites correctly over base.
- **TEST PLAN:** backend: `cd backend && python -m pytest tests/ -k "mask_region" -v` — named `test_clip_mask_region_applied` (golden-frame compare via existing oracle pattern: render a masked clip over a base, compare against committed reference frame). Frontend: `cd frontend && npx --no vitest run src/__tests__/stores/ src/__tests__/components/timeline/` — named: `cut creates masked clip on target track`, `paste without selection is a no-op toast` (NEGATIVE), `undo restores both clips`. INTEGRATION (full chain): the golden-frame test IS the chain proof — selection rect → store mask params → container.py mask blend → rendered pixels. Full suites green.
- **ACCEPTANCE GATES (quantified):** golden-frame diff ≤ existing oracle tolerance (use the oracle suite's threshold, cite it in the test); exactly 1 undo entry per cut and 1 per paste (HistoryPanel row counts asserted); the named negative green.
- **failure modes:** mask coords flipped/transposed vs frame orientation (covered: golden frame catches it); paste with stale selection after the source clip was deleted (add assertion: paste no-ops with toast — extend the named negative); #160 export-determinism collision (DO-NOT-TOUCH + rebase check).
- **ROLLBACK:** revert PR.
- **EVIDENCE:** PR + golden-frame test + before/after screenshot in the RUNNING app (runtime path named).
- **RISK:HIGH** only if container.py mask plumbing regresses before pickup (precondition re-checks; verified present 2026-06-11).

## PD.7 — Gain-meter phase 3: per-track metering (task #47 → implementation task #35)

- **ID:** PD.7 · **branch:** `feat/gain-meter-per-track` · **base:** `origin/main`
- **depends-on:** PD.2 (per-track levels only exist on the multi-track path / `mixer_player.py`) · **Model:** Sonnet · **Effort:** ~4h
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
- **TEST PLAN:** backend `cd backend && python -m pytest tests/ -k "meter" -v` — named: `test_meter_per_track_independent_levels` (two tracks, one silent → silent track reads floor), `test_meter_master_unchanged_for_legacy_callers`, `test_track_tap_post_gain`, `test_meter_unknown_track_id_returns_error_not_crash` (NEGATIVE — bogus/stale `track_id` → `ok: false`, server stays up). Frontend `cd frontend && npx --no vitest run src/__tests__/hooks/ src/__tests__/components/timeline/` — named: `meter poll batches one ipc call`, `track meter shows own level not master`. INTEGRATION (full chain): named backend test `test_audio_meter_ipc_returns_per_track_dict` driving the real `_handle_audio_meter` → mixer tap → response shape `{master, tracks:{id:{rms_db, peak_db, clipped}}}` end to end. Full suites green.
- **ACCEPTANCE GATES (quantified):** silent track reads ≤ −60 dBFS while the loud track reads within 3 dB of its known RMS (exact fixture numbers in the named test); legacy callers (no `track_id`) byte-identical response shape; tap adds 0 locks on the render path (code-review assertion + a comment citing SG-4) and 1 buffer copy per block; batched poll for 8 tracks = exactly 1 IPC call (asserted in the named frontend test); all 7 named tests green.
- **failure modes:** track removed between poll and response (covered: named negative); meter tap blocking the audio callback (covered: lock-free copy gate); N×poll traffic regression (covered: batch-assertion test).
- **ROLLBACK:** revert PR — IPC change is backward compatible by design.
- **EVIDENCE:** PR + test outputs + screenshot of two tracks metering differently in the RUNNING app (runtime path named).

## PD.8 — Hotkey-discoverability surfaces (issue #65 epic remainder)

- **ID:** PD.8 · **branch:** `feat/hotkey-surfaces` · **base:** `origin/main`
- **depends-on:** none · **Model:** Sonnet · **Effort:** ~3h
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
- **TEST PLAN:** `cd frontend && npx --no vitest run` — named new tests per wired surface: `track header menu shows shortcut text from registry`, `menu item without binding shows no shortcut text` (NEGATIVE), `rebound shortcut updates menu display` (INTEGRATION, full chain: registry rebind → `prettyShortcut` → ContextMenu `shortcut` prop renders the new key — proves the display is live, not hardcoded). Full suite green.
- **ACCEPTANCE GATES (quantified):** 6/6 checkboxes in `2026-05-14-upcoming-ux-items.md` §1 flipped (update the doc in the same PR — docs-before-done; doc verified on origin/main 2026-06-11); audit findings tables (surfaces 5–6) in PR body with a row per action audited; all 3 named tests green.
- **failure modes:** hardcoded shortcut strings drifting from the registry after a user rebind (covered: the integration test); an action with no registry key (covered: the named negative — renders no text, never `undefined`).
- **ROLLBACK:** revert PR — display-only.
- **EVIDENCE:** PR + screenshots of ≥2 menus showing shortcuts in the RUNNING app (runtime path named — Gate 18) + updated plan doc.

## PD.9 [DECISION RECORDED 2026-06-11: F1/F4 superseded by B8/B9 · F2 → Phase 4 operators · F3 → Tier 3 — packet now = write the supersession notes into the plan docs] — Cross-modal v1.1 F1–F4 DECISION packet (Gap G6)

- **ID:** PD.9 · **branch:** `docs/dec-crossmodal-disposition` · **base:** `origin/main`
- **depends-on:** none — **USER decision required; this packet prepares + records it, it does not make it**
- **goal:** Resolve G6: the merged-but-never-built Cross-Modal v1.1 plan (`docs/plans/2026-05-04-cross-modal-features-plan.md` on origin/main, verified — F1 datamosh sequencer, F2 motion angle, F3 macro device, F4 chord modulator; plan PR #36) either (a) FOLDS into the synth-paradigm vision PRDs (F3 ≈ vision-B2/macros; F1/F2/F4 map per a crosswalk this packet writes) or (b) is FORMALLY SUPERSEDED with a recorded rationale. No third option, no silent drift.
- **PRECONDITIONS (mismatch → STOP):**
  ```
  git -C ~/Development/entropic-v2challenger show origin/main:docs/plans/2026-05-04-cross-modal-features-plan.md | head -5   # plan exists, revision v3
  grep -n "G6" docs/roadmap/ROADMAP.md                                                                                        # gap registered
  ```
- **scope:** new `docs/decisions/DEC-CM-001-crossmodal-disposition.md` with **grep-checkable structure** — required named sections: `## Crosswalk` (table with exactly 4 data rows, one per F1–F4: feature → nearest vision PRD + overlap % + citation of the v3 plan's ground-truth file:line table), `## Cost Comparison` (fold vs supersede), `## Recommendation`, `## Decision` (the user's verbatim choice, quoted). Update `docs/roadmap/ROADMAP.md` G6 row + `docs/plans/2026-05-04-cross-modal-features-plan.md` frontmatter `status:` field per outcome.
- **DO-NOT-TOUCH:** any implementation; vision doc PRD content (crosswalk references, doesn't edit).
- **steps:** (1) Build the crosswalk (the v3 plan's verified-claims table makes this mechanical). (2) Present options to user with recommendation. (3) Record choice; if FOLD → enumerate which vision PRDs absorb which F-feature requirements (those become notes in the vision doc's PRD rows, one-line each); if SUPERSEDE → mark plan status `superseded` with pointer.
- **TEST PLAN:** n/a code. Structural greps (run before merge, paste output in PR body):
  ```
  grep -c '^| F[1-4]' docs/decisions/DEC-CM-001-crossmodal-disposition.md      # expect 4 (crosswalk rows)
  grep -cE '^## (Crosswalk|Cost Comparison|Recommendation|Decision)$' docs/decisions/DEC-CM-001-crossmodal-disposition.md   # expect 4 (all sections present)
  grep -A2 '^## Decision' docs/decisions/DEC-CM-001-crossmodal-disposition.md  # non-empty user quote
  grep -c 'status: planned' docs/plans/2026-05-04-cross-modal-features-plan.md # expect 0 post-merge (NEGATIVE check — no orphan status)
  ```
- **ACCEPTANCE GATES (quantified):** 4/4 crosswalk rows; 4/4 named sections; G6 row updated in ROADMAP gap register (this is the Cross-Modal half — PD.16 is the other); `status: planned` grep = 0.
- **failure modes:** decision recorded without user quote (covered: the `## Decision` grep); a fold absorption noted in the DEC doc but missing from the vision doc rows (covered: list each absorption with its target row in the PR body).
- **ROLLBACK:** revert docs commit.
- **EVIDENCE:** PR + quoted user decision + structural grep transcript.
- **Effort:** ~2h. · **Model:** Sonnet.

## PD.10 — Rename residue: split-brain `~/.entropic`/`~/.creatrix` + const + repo name ⚠ RISK:HIGH (user data)

- **ID:** PD.10 · **branch:** `chore/creatrix-rename-residue` · **base:** `origin/main`
- **depends-on:** none · **Model:** Opus (user-data migration) · **Effort:** ~5h
- **goal:** Finish PR #120's rename. Three sub-deliverables: (1) **Runtime-dir unification** — frontend writers still on the old dir (`logger.ts:10` → `~/.entropic/logs`, `pop-out-window.ts:7/:94`, `diagnostics-handlers.ts:215` feedback dir — all verified 2026-06-11) move to `~/.creatrix`, WITH the quantified one-time migration below, because diagnostics read-validation already only allows `~/.creatrix` (`diagnostics-handlers.ts:22-23` `allowedPrefix`, verified) — today the Electron main log is **unreadable via the in-app diagnostics IPC** (real bug, not cosmetics). (2) **Const rename** `ENTROPIC_DIR` → `CREATRIX_DIR` in **three** files (verified 2026-06-11): `diagnostics-handlers.ts:12`, `file-handlers.ts:12`, **`support-bundle.ts:12`** (missed by earlier audits) + stale `~/.entropic` comments (`file-handlers.ts:4/:23/:42`, `diagnostics-handlers.ts:17`). (3) **Repo rename** `gh repo rename creatrix` — USER-CONFIRMED step, executed last, with remote-URL updates for all ~40 worktrees.
- **MIGRATION SPEC (quantified):**
  - **File globs moved (copy-if-absent, never move-delete):**
    | source | target |
    |---|---|
    | `~/.entropic/logs/*` | `~/.creatrix/logs/` |
    | `~/.entropic/feedback/**` | `~/.creatrix/feedback/` |
    | `~/.entropic/pop-out-state.json` | `~/.creatrix/pop-out-state.json` |
    | `~/.entropic/recent-projects.json` | `~/.creatrix/recent-projects.json` |
    | `~/.entropic/window-state.json` | `~/.creatrix/window-state.json` |
    | `~/.entropic/telemetry_consent` | `~/.creatrix/telemetry_consent` |
  - **Explicitly NEVER touched:** `~/.entropic/demos/` (user render artifacts), `~/.entropic/projects/` (user project data — manual follow-up only), `~/.entropic/models/`, `~/.entropic/crash_reports/` (backend already writes new ones to `~/.creatrix`; old dumps stay put, note in CLAUDE.md), `test.glitch`, `q7-report.MOCK.json` (q7 branches own it). Real-machine inventory 2026-06-11: `~/.entropic/` = {crash_reports, demos, logs, models, pop-out-state.json, projects, q7-report.MOCK.json, recent-projects.json, telemetry_consent, test.glitch, window-state.json}; `~/.creatrix/` = {logs, telemetry_consent, window-state.json} — so logs/, telemetry_consent, window-state.json are LIVE COLLISIONS the policy must handle.
  - **Collision policy:** per-file, **never overwrite an existing target**. Target exists → skip + record `{source, target, reason: "target-exists"}` in the migration log lines (written through the NEW logger). The stale `~/.entropic` duplicates whose writers already moved (window-state.json, telemetry_consent — verified: `git grep "'.entropic'" frontend/src/main` shows no writer for them) are therefore skipped, by design.
  - **Dry-run mode:** `CREATRIX_MIGRATE_DRY_RUN=1` env → logs the full copy plan, writes ZERO files (used in the manual verification step first).
  - **Idempotency / interrupt safety (two-phase):** copy-if-absent per file → after a fully successful pass, write `~/.entropic/MOVED.txt` breadcrumb LAST. Breadcrumb present → migration skipped entirely on boot. Interrupted mid-copy → no breadcrumb → next boot re-runs; already-copied files are skipped by copy-if-absent; no duplicates, no data loss. Originals are NEVER deleted by this packet.
- **PRECONDITIONS (mismatch → STOP):**
  ```
  cd ~/Development/entropic-v2challenger
  git grep -n "'.entropic'" origin/main -- frontend/src/main | grep -v __tests__    # expect EXACTLY 4: logger.ts:10, pop-out-window.ts:7,:94, diagnostics-handlers.ts:215 (verified 2026-06-11)
  git grep -n "const ENTROPIC_DIR" origin/main -- frontend/src/main                  # expect EXACTLY 3: diagnostics-handlers.ts:12, file-handlers.ts:12, support-bundle.ts:12 — all → '.creatrix' (verified 2026-06-11)
  git grep -n "allowedPrefix" origin/main -- frontend/src/main/diagnostics-handlers.ts  # :22-23 — the read-validation that makes the old log unreadable (the bug)
  ls ~/.entropic/ 2>/dev/null && ls ~/.creatrix/ 2>/dev/null                         # inventory BOTH dirs before writing any migration (Gate 19 spirit: look before declaring)
  ```
- **scope (VERIFIED paths):** `frontend/src/main/logger.ts`, `frontend/src/main/pop-out-window.ts`, `frontend/src/main/diagnostics-handlers.ts`, `frontend/src/main/file-handlers.ts`, `frontend/src/main/support-bundle.ts`, new `frontend/src/main/migrate-runtime-dir.ts` called from main-process bootstrap, repo `CLAUDE.md` diagnostics paths section (currently documents `~/.entropic/*` — update), affected `frontend/src/__tests__/helpers/` mocks. **Out of scope:** `backend/scripts/demo_trilogy/` default out-dir `~/.entropic/demos` (docs at `DEMOS-RENDERED.md:9`, verified; note as follow-up, don't move user's rendered MP4s silently).
- **DO-NOT-TOUCH:** backend paths (already `.creatrix`-consistent: `diagnostics.py`, `main.py`); project files; anything under `~/.entropic/{demos,projects,models,crash_reports}/`.
- **steps:** (1) Migration fn (ordered FIRST in bootstrap so logger writes to the new dir on the same boot). (2) Path constants + comments (3 files). (3) Tests (below). (4) Update CLAUDE.md. (5) Manual: dry-run first against the real dirs, paste plan into PR; then real run. (6) AFTER merge + user confirmation: `gh repo rename creatrix` (GitHub auto-redirects old remotes; still update origin URLs: `git remote set-url origin ...` in main checkout + document for worktrees). Directory rename `~/Development/entropic-v2challenger` → deferred/user-choice (breaks ~40 worktree links — list them via `git worktree list` first; recommend deferring until worktree prune from ROADMAP Phase 1 hygiene lands).
- **TEST PLAN:** `cd frontend && npx --no vitest run src/__tests__/` — named new (vitest, fs in tmpdir):
  - `migration copies entropic dir contents once` (seeded fake `~/.entropic` → all 6 globs land)
  - `migration is a no-op when breadcrumb present`
  - `migration skips files whose target already exists` (NEGATIVE — seed BOTH dirs with same-named, different-content files → `.creatrix` content byte-unchanged, skip recorded)
  - `interrupted migration completes on second run without duplicates` (NEGATIVE — pre-copy half the files, no breadcrumb → second run copies only the rest; final file count exact, originals intact)
  - `dry-run mode writes nothing` (NEGATIVE — `CREATRIX_MIGRATE_DRY_RUN=1` → target dir mtime/file-count unchanged, plan logged)
  - `diagnostics read allows electron-main.log` (INTEGRATION, the bug-fix proof — full chain: logger writes to `~/.creatrix/logs` → diagnostics IPC path validation accepts it → content readable)
  Full frontend suite green. Manual (Live Runtime Check): launch the app with a seeded fake `~/.entropic` (HOME override), verify merge + app logs land in `~/.creatrix/logs`, open the in-app log viewer — name the runtime path.
- **ACCEPTANCE GATES (quantified):** `git grep -rn "'.entropic'" frontend/src/main` → 0 hits (excluding the migration fn's own source constant); `git grep -n "const ENTROPIC_DIR" frontend/src/main` → 0 (all 3 renamed); in-app log viewer shows electron-main.log; `find ~/.entropic -type f | wc -l` identical before/after the real run (originals retained — paste both counts in PR); every glob-listed source has a target or a recorded skip; all 6 named tests green.
- **failure modes:** partial copy on crash (covered: interrupt test + breadcrumb-last ordering); clobbering newer `.creatrix` files (covered: never-overwrite policy + collision test); disk-full mid-migration (copy-if-absent makes retry safe; logger fail-silent); user runs an old build after migration (old build writes to `~/.entropic` again — harmless, originals were never deleted; next new-build boot re-skips via breadcrumb, note in PR).
- **ROLLBACK:** code revert restores old paths; originals never deleted — data loss impossible by construction (copy-only + breadcrumb; state this in PR body).
- **EVIDENCE:** PR + named tests + dry-run plan transcript + before/after `find ~/.entropic -type f | wc -l` + `ls -la ~/.creatrix` + (post-rename) `gh repo view -q .nameWithOwner`.

## PD.11 — F-0514-8 dylib warning SPIKE: cv2-removal inventory + plan (packaging)

- **ID:** PD.11 · **branch:** `spike/drop-opencv-plan` · **base:** `origin/main`
- **depends-on:** none
- **goal:** The deferred real fix per `docs/plans/2026-05-15-mount-and-bug-sweep-plan.md:51`: both `opencv-python-headless` AND `av` bundle libavdevice (.61 vs .62) → `AVFFrameReceiver`/`AVFAudioReceiver` duplicate-class warning; verdict was "drop opencv entirely (PyAV already does video I/O; cv2 used only for color-space ops which numpy can replicate)". That's a claim, not an inventory. **Deliverable is a written migration plan with measured acceptance** — NOT "research opencv removal": `docs/decisions/DEC-PKG-001-drop-opencv.md` containing (a) the complete `import cv2`/`cv2.` call-site inventory (count + per-module function list), (b) numpy/PIL/scipy replacement for each cv2 function used, flagging any with no cheap equivalent (e.g. `cv2.resize` interpolation parity, optical-flow if used), (c) golden-frame risk list — which oracle-covered effects touch cv2 paths, (d) measured perf delta on ≥3 representative effects (cv2 vs replacement, ms/frame at 1080p), (e) GO/NO-GO recommendation + build-packet decomposition (≤4h each) if GO.
- **PRECONDITIONS (mismatch → STOP):**
  ```
  cd ~/Development/entropic-v2challenger && git grep -c "import cv2\|cv2\." origin/main -- backend/src | awk -F: '{s+=$3; n++} END {print s" matches across "n" modules"}'   # recorded 2026-06-11: 262 matches across 57 modules — re-grep at pickup; if 0 the premise is dead, just remove the dep and close
  git show origin/main:backend/pyproject.toml | grep opencv                                                # opencv-python-headless>=4.10 present (verified 2026-06-11)
  git show origin/main:docs/plans/2026-05-15-mount-and-bug-sweep-plan.md | sed -n '51p'                    # deferral rationale present
  ```
- **scope:** `docs/decisions/DEC-PKG-001-drop-opencv.md` with **grep-checkable structure** — required named sections: `## Inventory` (one table row per module — currently 57; total call-site count must equal the precondition grep total), `## Replacement Map` (one row per distinct cv2 function used, with numpy/PIL/scipy equivalent or `NO-CHEAP-EQUIVALENT` flag), `## Oracle Risk` (which `pytest -m oracle`-covered effects touch cv2 paths), `## Bench Results` (≥3 rows: effect, cv2 ms/frame @1080p, replacement ms/frame, delta %), `## Verdict` (exactly one line matching `^Verdict: (GO|NO-GO)$`) + build-packet decomposition (≤4h each) if GO. Plus a bench script under `backend/scripts/` (committed for reproducibility; must exit non-zero with a clear message if its fixture is missing — its own negative case).
- **DO-NOT-TOUCH:** any production module, `pyproject.toml` (the BUILD packets do that, post-GO).
- **steps:** (1) Mechanical inventory (grep + per-call-site classification). (2) Prototype the 3 hottest replacements in the bench script. (3) Measure. (4) Write plan + decomposition.
- **TEST PLAN:** structural greps (paste output in PR body):
  ```
  grep -cE '^## (Inventory|Replacement Map|Oracle Risk|Bench Results|Verdict)' docs/decisions/DEC-PKG-001-drop-opencv.md   # expect 5
  grep -cE '^Verdict: (GO|NO-GO)$' docs/decisions/DEC-PKG-001-drop-opencv.md                                                # expect exactly 1
  ```
  Inventory row count == module count from the precondition grep (currently 57 — no silent omissions); ≥3 measured ms/frame rows; every distinct cv2 function used appears in the Replacement Map; bench script run transcript attached; bench script without fixture exits non-zero (NEGATIVE — run it once against a bogus path).
- **ACCEPTANCE GATES (quantified):** 5/5 named sections; exactly 1 Verdict line; inventory total == grep total (262 at authoring); ≥3 bench rows; if GO, every build packet names the oracle suite(s) gating it (`pytest -m oracle` markers are the safety net).
- **failure modes:** inventory undercount via grep-pattern miss (covered: count cross-check gate); bench measuring debug builds or cold caches (bench script must report warm-run medians of ≥10 frames — state in script header); a cv2 function with no cheap equivalent silently dropped (covered: `NO-CHEAP-EQUIVALENT` flag is a legal cell, omission is not).
- **ROLLBACK:** delete doc + bench script.
- **EVIDENCE:** PR + measurement table + structural grep transcript.
- **Effort:** ~4h. · **Model:** Sonnet. (Build packets follow from the doc, not from here.)
- **PD.17 rider (one-liner): F-16 narrow-fix disposition.** ROADMAP G8 lists "F-16" among the open bugs with zero surviving spec in repo docs (`git grep -rn "F-16" origin/main -- docs/` hits only an unrelated "PF-16/17" string in V2-AUTOMATED-UAT-PLAN.md:1112 — verified 2026-06-11). Whoever picks up PD.11 also: locate F-16's original filing (`memory/entropic-uat-may14.md` / task store), then fix-or-close with a recorded one-line reason and update the G8 row; if unlocatable after that search, close it in G8 as "filing lost — unreproducible" (Gate 19 spirit: search before declaring dead). **Evidence:** the search transcript (both lookups, hit-or-empty) + the updated G8 row in the same PR; structural check: `grep -c "F-16" docs/roadmap/ROADMAP.md` ≥1 post-merge with a disposition verb in the row.

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
- **TEST PLAN:** `cd frontend && npx --no vitest run src/__tests__/stores/undo.test.ts` — named new: `500 entries stay under 50MB heap delta` (assert measured `process.memoryUsage().heapUsed` delta < 52_428_800 bytes; print the number), `routing mutation descriptions match convention templates`, `description not matching any template fails the convention assertion` (NEGATIVE — fixture with a malformed description proves the regex actually rejects). Full frontend suite green.
- **ACCEPTANCE GATES (quantified):** heap delta < 50MB with the measured number printed in test output; 100% of current `undoable()` routing call sites covered by the description assertions (count them in the PR body vs the precondition `wc -l`); ROADMAP G12 flips 🟢→closed; all 3 named tests green; #158 PR comment posted.
- **failure modes:** GC nondeterminism flaking the heap test (covered: force `global.gc?.()` before both measurements and use a generous threshold vs the doc's 50MB); template regex too loose to ever fail (covered: the named negative).
- **ROLLBACK:** revert PR — additive only.
- **EVIDENCE:** PR + vitest output with the measured heap delta number.
- **Effort:** ~2h. · **Model:** Sonnet.

## PD.13 [DECISION RECORDED 2026-06-11: schedule post-B5 as content sprint — packet now = apply disposition + author the transitions packet file] — DECISION packet: 53 layer transitions — schedule or formally defer (closes the "designed, on no tier" gap)

- **ID:** PD.13 · **branch:** `docs/dec-transitions-disposition` · **base:** `origin/main`
- **depends-on:** none — **USER decision required; this packet prepares + records it**
- **goal:** `docs/addendums/LAYER-TRANSITIONS.md` designs **53 transition types** (MISSING-FUNCTIONS §1 item #7, P1 severity) yet they sit on **no roadmap tier**. Output = a decision record assigning transitions to a tier — **recommendation: post-B5**, because B5 grouping/composite-tree (Phase 5a) delivers the layer-composite machinery transitions render through — OR a formal defer-with-owner. No third option, no silent drift.
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  cd ~/Development/entropic-v2challenger && git fetch origin
  git show origin/main:docs/addendums/LAYER-TRANSITIONS.md | head -5                                           # doc exists on origin/main (blob verified 2026-06-11)
  git show origin/main:docs/addendums/LAYER-TRANSITIONS.md | grep -c '^### '                                   # expect 11 sections; the 5 count-annotated reveal categories (15+9+11+11+7) sum to 53 (verified 2026-06-11)
  grep -n "PD.13" docs/roadmap/packets/user-expectations.md | head -1                                          # UE file points #7 here — cross-ref intact (NOTE: inventory + UE file live on the consolidation branch, not origin/main)
  ```
- **scope:** new `docs/decisions/transitions-disposition.md` — the measurable artifact — with **grep-checkable structure**, required named sections: `## Inventory Summary` (table with exactly 11 data rows mirroring LAYER-TRANSITIONS.md's `###` sections, each with its transition count; the 5 reveal categories must sum to 53), `## Dependency Analysis` (what B5/composite-tree P5a.13–15 provides vs what transitions additionally need), `## Options` (≥2 rows with cost band each), `## Recommendation` (post-B5 tier slot), `## Decision` (the user's verbatim choice, quoted); update `docs/roadmap/MISSING-FUNCTIONS-INVENTORY.md` item #7 row + ROADMAP Phase-5 note per outcome.
- **DO-NOT-TOUCH:** any implementation; LAYER-TRANSITIONS.md content (referenced, not edited).
- **steps:** (1) Read LAYER-TRANSITIONS.md on origin/main end-to-end. (2) Map prerequisites against the B-ladder (composite-tree = B5 = P5a.13–P5a.15 per `packets/phase-5a.md`, verified). (3) Present tier options + recommendation to user. (4) Record the decision; if scheduled → name the owning phase/packet stub; if deferred → named owner + revisit trigger.
- **TEST PLAN:** n/a code. Structural greps (paste output in PR body):
  ```
  test -f docs/decisions/transitions-disposition.md && echo EXISTS
  grep -cE '^## (Inventory Summary|Dependency Analysis|Options|Recommendation|Decision)$' docs/decisions/transitions-disposition.md   # expect 5
  grep -c '^| ' docs/decisions/transitions-disposition.md | head -1     # Inventory Summary table ≥13 lines (11 data + header + separator)
  grep -A2 '^## Decision' docs/decisions/transitions-disposition.md     # non-empty user quote
  grep -n "PD.13" docs/roadmap/MISSING-FUNCTIONS-INVENTORY.md           # item #7 row updated in same PR (NEGATIVE check: zero hits = the row was not updated → FAIL)
  ```
- **ACCEPTANCE GATES (quantified):** 5/5 named sections; 11/11 inventory rows with counts summing to 53 for the reveal categories; decision file quotes the user verbatim; zero "on no tier" residue — item #7 names either a tier or an owner.
- **failure modes:** decision recorded without the user's verbatim words (covered: `## Decision` grep); inventory row #7 forgotten (covered: the negative cross-ref grep); category counts drifting from LAYER-TRANSITIONS.md (covered: 53-sum gate).
- **ROLLBACK:** revert docs commit.
- **EVIDENCE:** PR + quoted user decision + structural grep transcript.
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
- **scope:** `docs/roadmap/MISSING-FUNCTIONS-INVENTORY.md` (add Disposition column to the §1 table; cuts also appended to §4), `docs/roadmap/ROADMAP.md` (one summary line in the parallel-track section), nothing else. **NOTE (verified 2026-06-11):** the inventory file does NOT exist on origin/main — it lives on the docs-consolidation branch; all greps below run on the local checkout.
- **Disposition cell format (grep-checkable):** every §1 cell matches exactly one of `build:<packet-or-tier id>` (id must exist in a `packets/*.md` or ROADMAP tier), `defer:<owner>@<revisit trigger>`, `cut:<one-line rationale>` (and the item is appended to §4).
- **DO-NOT-TOUCH:** §4 existing cut rows (locked decisions); any implementation; the §2 category tables (the §1 shortlist is the disposition surface — §2 rows that are roadmap-covered already carry their IDs).
- **steps:** (1) Pre-fill defaults: #1–#6+#8 → UE.1–UE.7; #7 → PD.13. (2) For #9–#26: propose disposition per item with a one-line rationale (severity × effort × paradigm fit). (3) User pass on the proposals (binary accept/amend per row — no yellows). (4) Write the column; every row filled, zero blanks.
- **TEST PLAN:** n/a code. Structural greps (paste output in PR body):
  ```
  sed -n '/^## 1\. NEW Items/,/^## 2\./p' docs/roadmap/MISSING-FUNCTIONS-INVENTORY.md | grep -Ec '\| *(build|defer|cut):'   # expect 26 (every row dispositioned)
  sed -n '/^## 1\. NEW Items/,/^## 2\./p' docs/roadmap/MISSING-FUNCTIONS-INVENTORY.md | grep -Ec '\|\s*\|\s*$'              # expect 0 (NEGATIVE — no empty trailing cells)
  for id in $(sed -n '/^## 1\./,/^## 2\./p' docs/roadmap/MISSING-FUNCTIONS-INVENTORY.md | grep -oE 'build:[A-Za-z0-9.]+' | cut -d: -f2 | sort -u); do grep -rq "$id" docs/roadmap/packets/ docs/roadmap/ROADMAP.md || echo "DANGLING: $id"; done   # expect no output (every build target resolves)
  ```
  Every `cut:` item also appears in §4 (`grep` each cut id in §4 — count match).
- **ACCEPTANCE GATES (quantified):** 26/26 dispositioned with format-conformant cells; 0 dangling build targets; every cut mirrored in §4; user's amendments quoted in PR body.
- **failure modes:** a disposition cell that's prose instead of the machine format (covered: format grep counts only conformant cells — 25/26 fails the gate); a `build:` pointing at a packet that gets renamed later (covered: resolve-loop is re-runnable; PD.14's row in any future rename packet must re-run it).
- **ROLLBACK:** revert docs commit.
- **EVIDENCE:** PR + the 26/26 grep count + dangling-check transcript + user quotes.
- **Effort:** ~2h. · **Model:** Sonnet.

## PD.15 — Wire-or-delete: internal orphans (MISSING-FUNCTIONS §3)

- **ID:** PD.15 · **branch:** `chore/pd15-orphan-wire-or-delete` · **base:** `origin/main`
- **depends-on:** none (UE.3 resolves the `rangeSelectClips` row independently — check its status at pickup)
- **goal:** Every §3 orphan gets a decision executed in this packet — wire it or delete it; nothing stays half-built. **§3 has 20 line-items total: 18 are dispositioned HERE; 2 are referenced out** (`rangeSelectClips` → UE.3; `EXPERIMENTAL_AUDIO_TRACKS` → PD.1–PD.3). Per-orphan dispositions:
  - **Auto-update flow** (`preload/index.ts:135–141` `downloadUpdate()`/`installUpdate()` — verified 2026-06-11, `UpdateBanner.tsx` exists, zero invokers): DECIDE — finish wiring UpdateBanner into the app shell OR remove banner + preload APIs. Either way = code change + named test or deletion commit. [1 item]
  - **`rangeSelectClips`**: **wired by UE.3** (`packets/user-expectations.md`) — reference it, do not duplicate; if UE.3 is merged at pickup, mark the row closed; ground truth: it was already shift-click-wired at `Clip.tsx:169`, so the "orphan" label was half-stale. [referenced out] **`EXPERIMENTAL_AUDIO_TRACKS`** row → PD.1–PD.3 own it. [referenced out]
  - **Unmounted components** — `components/effects/ParamSlider.tsx` (superseded by Slider/ParamPanel): delete; `components/timeline/ZoomScroll.tsx`: delete; **`components/library/MacroKnob.tsx`** (path verified 2026-06-11 — the §3 row's location is correct, earlier drafts said effects/): **do NOT delete** — note in-file as a **P5a B4-macros revival candidate** (`// REVIVAL CANDIDATE(P5a/B4): 8-macro rack knobs — see packets/phase-5a.md`) and record in the PR body. **Test-importer caveat (verified):** `ParamSlider`/`ZoomScroll` are imported by `frontend/src/__tests__/components/timeline-ui.test.tsx`, `MacroKnob` by `macro-knob.test.ts` — deletions must prune the dead test imports in the same commit; `macro-knob.test.ts` STAYS (component kept). [3 items]
  - **Dead preload APIs** `getPathForFile()` (:5), `isPopOutOpen()` (:153): delete unless a caller is found at pickup (`git grep` each — note `getPathForFile` IS referenced by `audio-drop-zone.test.tsx` + `ipc-schema.test.ts` mocks: update those contracts in the same commit). [2 items]
  - **12 dead ZMQ handlers** (`zmq_server.py` — line numbers drifted since §3 was written: now `shutdown` :246, `seek` :267, `check_dag` :386, `read_freeze` :393, verified 2026-06-11; re-grep all 12 at pickup): DECIDE — wire `effect_health` / `effect_stats` / `memory_status` into a **diagnostics-HUD stub** (frontend-only panel behind the existing diagnostics surface, the §3-noted "ready-made backends" path) OR delete them; **the remaining 9** (`shutdown`, `seek`, `apply_chain`, `render_text_frame`, `audio_position`, `audio_tracks_clear`, `export_status`, `check_dag` [test-only — keep if tests use it], `read_freeze`) → delete after a caller grep proves zero invokers each (Infra Change Gate: list the caller map in the PR body). [12 items]
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  cd ~/Development/entropic-v2challenger && git fetch origin
  git grep -n "downloadUpdate\|installUpdate" origin/main -- frontend/src | wc -l        # >0 (preload + banner exist)
  git grep -rln "ParamSlider\|ZoomScroll" origin/main -- frontend/src/renderer | grep -v "components/effects/ParamSlider.tsx\|components/timeline/ZoomScroll.tsx" | wc -l   # expect 0 importers — else NOT orphans, STOP and re-audit
  git grep -n "effect_health\|effect_stats\|memory_status" origin/main -- backend/src/zmq_server.py | head -3   # handlers present
  ```
- **scope:** the files named per-orphan above + `frontend/src/preload/index.ts` + one new diagnostics-HUD stub component IF the wire option is chosen; tests per wired item; deletion commits per deleted item (one commit per orphan — surgical revert granularity).
- **DO-NOT-TOUCH:** `EXPERIMENTAL_AUDIO_TRACKS` machinery (PD.1–PD.3 own it); `zmq_server.py` dispatch beyond removing the dead handlers (single-flight rule); anything UE.3 owns.
- **steps:** (1) Caller-grep every orphan, paste the map. (2) Execute each disposition (one commit each). (3) Wired items get a named test; deleted items get the grep-proof in the commit body. (4) Update MISSING-FUNCTIONS §3 in the same PR: append ` → closed via PD.15 (wired|deleted|kept:revival-candidate)` to each of the 18 owned line-items; the 2 referenced-out items get ` → UE.3` / ` → PD.1–PD.3` markers.
- **TEST PLAN:** `cd frontend && npx --no vitest run` + `cd backend && python -m pytest -x -n auto --tb=short` — both green after deletions. Per wired item a named test (e.g. `diagnostics hud renders effect_health stats` if the HUD path is chosen; `update banner appears when update available` if auto-update is wired). Named NEGATIVE: `test_removed_zmq_command_returns_unknown_command_error` (backend — send a deleted command, e.g. `seek`, post-deletion → clean `ok: false` unknown-command response, server stays up, no crash). **Decision-artifact structural grep** (the §3 update IS the decision record):
  ```
  sed -n '/^## 3/,/^## 4/p' docs/roadmap/MISSING-FUNCTIONS-INVENTORY.md | grep -c 'closed via PD.15'   # expect 18
  sed -n '/^## 3/,/^## 4/p' docs/roadmap/MISSING-FUNCTIONS-INVENTORY.md | grep -cE '→ (UE\.3|PD\.1)'    # expect 2 (referenced-out rows marked)
  ```
- **ACCEPTANCE GATES (quantified):** 18/18 owned items carry a `closed via PD.15` marker with one of exactly three verbs (wired/deleted/kept:revival-candidate); 2/2 referenced-out items marked; caller map in PR body for every deletion (12 handler greps + 2 preload greps minimum); MacroKnob survives with the revival comment; the named negative green; both suites green.
- **failure modes:** deleting a handler a test still calls (covered: `check_dag` keep-if-test-used rule + full backend suite); deleting a component whose only importer is a test (covered: test-importer caveat — prune imports same commit); frontend retry loop hammering a removed command (covered: the unknown-command negative proves clean rejection).
- **ROLLBACK:** revert per-orphan commits individually.
- **EVIDENCE:** PR + caller maps + test output + the two §3 grep counts.
- **Effort:** ~4h. · **Model:** Sonnet.

## PD.16 [Per locked decision 3, POST-V1 items map: transitions→PD.13 sprint, audio-reactive mods→C7/B2-vision, rest supersede] — DECISION packet (extends PD.9 / Gap G6): POST-V1-ROADMAP Phases 12–19 fold-in vs supersede

- **ID:** PD.16 · **branch:** `docs/dec-postv1-roadmap-disposition` · **base:** `origin/main`
- **depends-on:** PD.9 recommended first (same G6 reconciliation muscle; PD.9 settles Cross-Modal F1–F4, this settles the OTHER stale roadmap) — not blocking
- **goal:** `docs/addendums/POST-V1-ROADMAP.md` Phases 12–19 (tempo, transitions, audio-reactive mods, beat effects, community — pre-paradigm) either FOLD into the synth-paradigm master sequence (per-phase crosswalk: Phase 14 ≈ C7/B2 etc.) or are FORMALLY SUPERSEDED. Output = a supersession note in the POST-V1-ROADMAP.md **header** + `docs/roadmap/INDEX.md` moves the doc to HISTORICAL if superseded.
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  cd ~/Development/entropic-v2challenger && git fetch origin
  git show origin/main:docs/addendums/POST-V1-ROADMAP.md | head -5                            # doc exists (blob verified 2026-06-11)
  git show origin/main:docs/addendums/POST-V1-ROADMAP.md | grep -cE '^## Phase 1[2-9]'        # expect 8 (Phases 12–19 at :43/:62/:79/:92/:106/:117/:131/:142, verified 2026-06-11)
  grep -n "POST-V1-ROADMAP" docs/roadmap/INDEX.md | head -2                                    # currently in NEEDS RECONCILIATION (consolidation-branch file)
  ```
- **scope:** `docs/addendums/POST-V1-ROADMAP.md` (header note only), `docs/roadmap/INDEX.md` (row move), new `docs/decisions/DEC-POSTV1-001-disposition.md` with **grep-checkable structure** — required named sections: `## Crosswalk` (table with exactly 8 data rows, one per Phase 12–19: phase → nearest vision PRD/tier + fold-or-supersede call), `## Recommendation`, `## Decision` (the user's verbatim choice, quoted); ROADMAP G6 row update (G6 closes only when BOTH PD.9 and PD.16 land — say which half this is).
- **DO-NOT-TOUCH:** POST-V1-ROADMAP body content; PD.13's transitions call (Phase-13 "Full Transition Library" overlap — PD.13 owns the transitions tier decision; this packet's crosswalk row for it REFERENCES PD.13's outcome, never re-decides).
- **steps:** (1) Crosswalk Phases 12–19 against the vision PRD list + master sequence. (2) Present fold-vs-supersede with recommendation. (3) Record choice; execute the header note + INDEX move; mark fold-in absorptions as one-line notes per absorbing PRD row.
- **TEST PLAN:** n/a code. Structural greps (paste output in PR body):
  ```
  grep -cE '^\| *Phase 1[2-9]' docs/decisions/DEC-POSTV1-001-disposition.md   # expect 8 (no phase unmapped)
  grep -cE '^## (Crosswalk|Recommendation|Decision)$' docs/decisions/DEC-POSTV1-001-disposition.md   # expect 3
  grep -A2 '^## Decision' docs/decisions/DEC-POSTV1-001-disposition.md        # non-empty user quote
  git show origin/main:docs/addendums/POST-V1-ROADMAP.md | grep -c "superseded\|folded" ; grep -c "superseded\|folded" docs/addendums/POST-V1-ROADMAP.md   # header note landed locally (first count is the pre-state, NEGATIVE baseline 0)
  ```
- **ACCEPTANCE GATES (quantified):** 8/8 crosswalk rows; 3/3 named sections; header note present; INDEX row in the correct section; G6's POST-V1 half closes in the gap register; zero "needs reconciliation" residue for this doc.
- **failure modes:** Phase-13 transitions decided twice and divergently (covered: DO-NOT-TOUCH — crosswalk row must literally read "per PD.13"); decision without verbatim quote (covered: `## Decision` grep).
- **ROLLBACK:** revert docs commit.
- **EVIDENCE:** PR + quoted user decision + structural grep transcript.
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

---

## Thickness scorecard (pass 2026-06-11, anchors re-verified against origin/main @ d821ae8)

Rubric: ① anchors git-verified + greps in preconditions · ② full contract + model tier · ③ named tests w/ behavior titles + exact commands (+ live-runtime for UI) · ④ gates quantified · ⑤ failure modes + ≥1 negative test · ⑥ full-chain integration test (feature packets) · ⑦ depends-on resolves.

| Packet | ① | ② | ③ | ④ | ⑤ | ⑥ | ⑦ | Notes |
|---|---|---|---|---|---|---|---|---|
| PD.1 | ✅ | ✅ | ✅ | ✅ | ✅ (4 negatives) | ✅ end-to-end logger→gate | ✅ none | Bake gate now machine-checkable; `callback_error_count` pre-exists (mixer_player.py:62/:141) |
| PD.2 | ✅ | ✅ | ✅ | ✅ | ✅ (garbage-env) | ✅ via flag-path tests | ✅ PD.1 + gate script | Gate = `check_bake_gate.py` exit 0, not checklist vibes |
| PD.3 | ✅ | ✅ Opus | ✅ | ✅ | ✅ (env-ignored) | ✅ manual A/V smoke vs PD.1 export | ✅ PD.2 + `--since` gate | ⏸ both time-gates are USER bake windows by design |
| PD.4 | ✅ | ✅ | ✅ | ✅ | ✅ (no-stream) | ✅ menu→IPC→store named test | ✅ PD.2 | |
| PD.5 | ✅ | ✅ | ✅ +live | ✅ | ✅ (zero-area, drag-end) | ✅ pointer→store→render | ✅ none | |
| PD.6 | ✅ mask claim VERIFIED | ✅ Opus | ✅ | ✅ | ✅ (paste-no-selection) | ✅ golden-frame chain | ✅ PD.5 | RISK downgraded: container.py mask real (:58/:128) |
| PD.7 | ✅ | ✅ | ✅ | ✅ dB numbers | ✅ (unknown track_id) | ✅ IPC→tap→shape test | ✅ PD.2 | |
| PD.8 | ✅ | ✅ | ✅ +live | ✅ 6/6 | ✅ (no-binding) | ✅ rebind→display test | ✅ none | |
| PD.9 | ✅ | ✅ | ✅ structural greps | ✅ 4 rows/4 sections | ✅ (status:planned=0) | n/a docs | ✅ none | Decision already recorded; packet executes it |
| PD.10 | ✅ +support-bundle.ts:12 found | ✅ Opus | ✅ +live | ✅ counts | ✅ (3 negatives) | ✅ diagnostics-read chain | ✅ none | Migration quantified: 6 globs, never-overwrite, dry-run, 2-phase breadcrumb |
| PD.11 | ✅ 262/57 recorded | ✅ | ✅ structural | ✅ 5 sections/1 verdict | ✅ (bench-no-fixture) | n/a spike | ✅ none | |
| PD.12 | ✅ | ✅ | ✅ | ✅ <50MB printed | ✅ (malformed desc) | n/a (test-only packet) | ✅ none (#158 fallback stated) | |
| PD.13 | ✅ 11 sections, 53=15+9+11+11+7 | ✅ | ✅ structural | ✅ 11 rows/5 sections | ✅ (missing-row grep) | n/a docs | ✅ B5=P5a.13–15 resolves | |
| PD.14 | ✅ 26 rows re-verified | ✅ | ✅ structural | ✅ 26/26 + 0 dangling | ✅ (empty-cell grep) | n/a docs | ✅ UE/PD.13 resolve | Inventory is consolidation-branch-only (noted in header) |
| PD.15 | ✅ paths + line drift fixed | ✅ | ✅ | ✅ 18/18 + 2/2 | ✅ (unknown-command) | ✅ per wired item | ✅ UE.3 ref | MacroKnob = `components/library/`; test-importer caveat added |
| PD.16 | ✅ 8 phases verified | ✅ | ✅ structural | ✅ 8/8 rows | ✅ (header-note baseline) | n/a docs | ✅ PD.9 non-blocking | |
| PD.17 (rider) | ✅ grep verified | rider | n/a | ✅ G8 row grep | ✅ Gate-19 search | n/a | ✅ rides PD.11 | |

**Known unfixables / by-design ⏸:** PD.2/PD.3 bake windows are USER actions — the gate script makes them verifiable but not skippable; PD.3 `<PD.2-merge-sha>`/`--since` dates are fill-in-at-pickup placeholders by nature; `docs/roadmap/MISSING-FUNCTIONS-INVENTORY.md` cannot be anchored to origin/main until the consolidation branch merges.
