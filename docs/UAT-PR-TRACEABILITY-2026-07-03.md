# UAT ↔ PR Traceability — 30 Days of Merges (2026-06-03 → 2026-07-03)

**Generated:** 2026-07-03 · **Method:** 61-agent code-grounded audit (workflow `wf_a48c2961-22a`). Every non-exempt PR's claims were extracted and verified against CURRENT main (`existence ≠ wired` rule — a claim counts only with a consumer, file:line cited). Every flagged gap was independently re-verified by a skeptic agent instructed to refute it.
**Rule for future UAT rows:** every validation MUST name its PR and cite the code evidence read BEFORE validating. "Looks OK" without a file:line is not a pass.

**CU-executable rows for every item below:** `docs/UAT-CU-ADDENDUM-2026-07-03.md` (traced by PR #, house CU format).

**Totals:** 269 PRs · 183 OK_WIRED · 64 exempt (docs/ci/test/chore) · 22 flagged → **16 upheld** / 6 refuted · **63 PRs unmapped in UAT** · 2 without tests.


## 1. UPHELD GAPS (16) — built-but-not-there / not-wired / superseded


### PR #123 — feat(effects): Grid Moire — true interference moiré  `[GAP_MISSING]`
- **MISSING**: fx.grid_moire reworked into real two-grating interference generator with freq_ratio/angle_offset/rotation_speed/scroll/drift/warp/sharpness params
  - evidence: PR #146 (merged 2026-06-12, git log: 3bd1d3d) explicitly states this PR's v1 'renders near-black at high interference (moire=gridA*gridB, mean ~0.06)' and replaces it wholesale; current main backend/src/effects/fx/grid_moire.py:1-13 docstring/params (mesh A/B, liquify) match #146's redesign, not #123's freq_ratio/angle_offset/drift/warp param set — none of those param names exist in the current file.
- **Skeptic (upheld):** Genuine hunt performed: checked git log --all for superseding/renamed commits, read current grid_moire.py source for param names, checked both test files (test_grid_moire_real.py and tests/oracles/test_grid_moire_oracle.py) for surviving #123 assertions, and searched all UAT docs/evidence dirs repo-wide. No refutation found — PR #123's specific interference-generator implementation and its param s
- **Proposed UAT checkpoint:** Add a UAT row: apply fx.grid_moire generator effect with default params, expect a visible moiré interference pattern (not near-black) on the preview — grep of full UAT corpus for 'moire'/'grid_moire'/'interference' returned zero hits.

### PR #172 — feat(project): UE.5 media relink / missing-media dialog  `[GAP_MISSING]`
- **PARTIAL**: Skipped/missing clip shows a 'missing' badge in the timeline
  - evidence: Only implemented for audio clips: frontend/src/renderer/components/timeline/AudioClipView.tsx:156/164/179/187 render `audio-clip--missing` class and 'MISSING' label keyed on `clip.missing`. No equivalent found in frontend/src/renderer/components/timeline/Clip.tsx (video/image clip component) — grep for 'missing' in Clip.tsx returned zero hits. PR body itself flags this as an acknowledged gap ('Ambiguities' item 1: visual badge for video/image clips not implemented, filed as follow-up).
- **Skeptic (upheld):** Auditor's PARTIAL/GAP classification on claim 4 (missing badge for video/image clips) is correct and matches the PR's own acknowledged "Ambiguities" note. No wiring, no test, no superseding commit found. Store-layer plumbing (timeline.ts) is fully wired for video/image missing flags, but the presentation layer (Clip.tsx) never reads clip.missing — this is a real, narrow, already-self-disclosed gap

### PR #176 — feat(timeline): UE.2 ripple delete + ripple trim  `[GAP_UNWIRED]`
- **UNWIRED**: rippleTrimClipOut(clipId, newOutPoint) shortens clip and shifts downstream clips, exposed to users via trim-handle interaction
  - evidence: frontend/src/renderer/stores/timeline.ts:215/1579 defines the action, but repo-wide grep (`grep -rn rippleTrimClipOut frontend/src/`) shows it is called ONLY from test files (stores/ripple.test.ts, stores/clip-transform-lane-rebase.test.ts, stores/clip-track-lock.test.ts) — no App.tsx, Clip.tsx, context-menu, or shortcut call site invokes it. Users have no way to trigger ripple-trim on current main.
- **Skeptic (upheld):** Genuine hunt performed: searched all branches/commits for 'ripple' keyword, inspected the plausible superseding PR (#339) in full, and re-verified trim-handle pointer-down handlers directly. All evidence corroborates original auditor finding — rippleTrimClipOut is implemented and tested at the store level but has no UI/keyboard/context-menu entry point on current main.

### PR #185 — P2.1 — BPM split (bpm vs effectiveBpm)  `[GAP_UNWIRED]`
- **UNWIRED**: applyProjectModulations.ts evaluates automation lanes with paramPath='projectParam.bpm' and writes effectiveBpm
  - evidence: frontend/src/renderer/components/performance/applyProjectModulations.ts:29 exports applyProjectModulations, but no call site found outside the file itself and tests (grep for 'applyProjectModulations(' across frontend/src/renderer excluding the def file and __tests__ returned zero hits) — function is not invoked by the per-frame tick loop or any UI
- **UNVERIFIED**: Transport BPM display / quantize grid reads effectiveBpm via Timeline prop
  - evidence: frontend/src/renderer/components/timeline/Timeline.tsx quantize grid code at :289-290 uses a 'bpm' prop, not confirmed to be effectiveBpm at the call site passing that prop into Timeline; App.tsx:2240 reads useProjectStore(s=>s.bpm) which PR body itself labels 'baseline-UI read...NOT playback timing' — the effectiveBpm wiring into Timeline's bpm prop was not traced to source
- **Skeptic (upheld):** Partial refutation only: one auditor sub-claim (Timeline bpm-prop UNVERIFIED) is resolved WIRED via App.tsx:4035. But the flagged GAP_UNWIRED verdict for the PR as a whole is correct — the actual modulation-lane-to-BPM feature has no runtime wiring; only the persisted/derived field split and downstream consumption of the (always-manually-set) effectiveBpm exist. UAT proposed by auditor (map LFO to
- **Proposed UAT checkpoint:** UAT: Map a modulation source (e.g. LFO or automation lane) to Mixer→BPM, start playback, confirm the effective tempo shifts audibly/visually while the saved project file's persisted bpm field stays at its original baseline value after save.

### PR #219 — feat(masking): MK.4 preview marquee -> MatteNode + delete/fill (supersedes PD.5)  `[GAP_UNWIRED]`
- **UNWIRED**: Fill mode: replace masked region with a design-spec swatch color (maskMode='fill' + maskFillColor)
  - evidence: store action exists at frontend/src/renderer/stores/timeline.ts:2984 setClipMaskMode() and supports mode 'fill' (line 377), and is unit-tested in frontend/src/__tests__/stores/mk4-matte-actions.test.ts:234-265, but grep across frontend/src/renderer/App.tsx and frontend/src/renderer/components/** on current main finds zero call sites passing 'fill' to setClipMaskMode -- no UI button/hotkey/menu item invokes it, so the fill feature is store-only and unreachable from the app
- **Skeptic (upheld):** Could not refute the gap. Store action setClipMaskMode('fill', ...) exists and is unit-tested (mk4-matte-actions.test.ts) but is genuinely unreachable from the UI — no button, hotkey, menu item, or later PR wires it, and no renderer/export code consumes maskFillColor. Auditor's GAP_UNWIRED verdict for the 'fill' sub-claim stands; the marquee-creates-MatteNode and delete-inside/outside claims are c

### PR #227 — MK.6.p3 Wand failure toast + orphan sidecar GC  `[GAP_UNWIRED]`
- **UNWIRED**: Frontend calls mask_gc_sidecars on node-delete, passing the live node-id set
  - evidence: No call site found: `grep -rn mask_gc_sidecars frontend/src/` (excluding tests) returns only frontend/src/main/zmq-relay.ts:88, which is the IPC command allowlist, not a caller. removeMatteNode impl at frontend/src/renderer/stores/timeline.ts:2914 does not invoke mask_gc_sidecars or any gc helper. The GC exists and is IPC-reachable but nothing in the app triggers it automatically — orphan sidecars from node deletion are never garbage-collected in practice.
- **Skeptic (upheld):** Genuine hunt performed: searched all frontend/src for the two function names, read the full removeMatteNode implementation, checked wand.py's own documented alternate trigger (project close/load) for any hook, and checked git log --all for any later PR that might supersede #227's wiring. All came up empty. The toast (claim 1) and backend GC function + IPC route (claim 2) are genuinely wired; only 

### PR #230 — feat(instruments): B3.1 Full Sampler loop engine — in/out, fwd/rev/pingpong, crossfade  `[GAP_MISSING]`
- **MISSING**: Crossfade blend at the loop seam (SamplerLoopConfig.crossfade, computeLoopCrossfadeWeight / ExportManager._compute_voice_crossfade_weight)
  - evidence: backend/src/engine/export.py:1601 defines _compute_voice_crossfade_weight but grep of the whole backend/ tree shows zero call sites outside its own test (backend/tests/test_sampler_loop.py:39); frontend computeLoopCrossfadeWeight (computeSamplerVoice.ts:357) likewise has no caller outside __tests__. The weight is computed nowhere in the actual render/composite path — no pixel blending ever happens at the seam despite the PR claiming a working crossfade feature.
- **Skeptic (upheld):** Auditor's WIRED claims for loop config, dir branching, and the disabled-path regression guard are all independently confirmed correct by the same grep pass. Only the crossfade-blend claim is a genuine gap: the math exists and is unit-tested in isolation on both sides of the mirror, but is never invoked from any actual render/export/composite pathway, so no pixel blending occurs at the loop seam de

### PR #235 — feat(instruments): B4.2 Sample Rack macros — 8 macros, one-to-many routing, fan-out caps  `[GAP_MISSING]`
- **MISSING**: Backend modulation/routing.resolve_rack_macros mirrors the sampler-modulation resolver and writes resolved macro values before render
  - evidence: PR body claims 'backend/src/modulation/routing.py::resolve_rack_macros'; grep of current main backend/src/modulation/routing.py and the whole backend/ tree for 'resolve_rack_macros' returns zero hits. `gh pr diff 235` shows the PR's underlying commits DID add backend/src/modulation/routing.py (+165 lines) and backend/tests/test_rack_macros.py (+393 lines) in an initial commit, but the PR's final merged file list (`gh pr view 235 --json files`) only contains security.py/App.tsx/resolveRackMacros.ts/types.ts/instruments.ts — routing.py and test_rack_macros.py are ABSENT from the merged diff, and backend/tests/test_rack_macros.py does not exist on disk. The backend implementation was stripped by a follow-up commit ('fix(instruments): B4.2 enforce macro fan-out caps on the LIVE frontend path') before merge; only the frontend-side resolver ships.
- **MISSING**: Backend security.py fan-out caps (MAX_MACROS_PER_RACK=8, MAX_MODROUTES_PER_MACRO=32, MAX_TOTAL_EDGES=256) + validate_rack_macros enforced fail-closed at the backend load/IPC trust boundary
  - evidence: grep of backend/src/security.py and all of backend/ for MAX_MACROS_PER_RACK, MAX_MODROUTES_PER_MACRO, and validate_rack_macros returns zero hits; these constants/function exist ONLY in frontend/src/renderer/components/instruments/types.ts:458-459 and frontend/src/renderer/components/instruments/resolveRackMacros.ts — i.e. the 'trust boundary' the PR title/body centers on is client-side only, not backend-enforced as claimed. Note: backend/src/engine/export.py:1706-1707 explicitly documents that the backend does NOT re-resolve macros at all ('there is no per-frame macro automation, so the backend does NOT re-resolve macros'), meaning a hand-edited/hostile project file sent straight to the backend render path bypasses the caps entirely.
- **Skeptic (upheld):** This is a case where the gap is real but the auditor's framing slightly understates the full story: the backend implementation wasn't accidentally dropped in merge cleanup — it was deliberately deleted by a qa-redteam-driven commit (60943e2) because it was literally dead code with zero callers (no IPC path ever fed a raw rack to it), and the team consciously chose to enforce caps at the frontend l

### PR #239 — B4-pad-delete — removeRackPad with symmetric cleanup  `[UNVERIFIED]`
- **PARTIAL**: removeRackPad(trackId,padId) prunes pad + macro routes targeting it
  - evidence: flat removeRackPad still defined at frontend/src/renderer/stores/instruments.ts:1021, but superseded as the RackDevice call site by path-aware removeRackPadAt (instruments.ts:1137, called from RackDevice.tsx:196) shipped in later PR #244 (B5.2 nested racks, commit 44e12f9). removeRackPad remains but is no longer wired into RackDevice's delete button.
- **Skeptic (upheld):** Partial refutation only: the underlying macro-route-pruning logic is shared (applyPadRemove) between the tested flat function and the live path-aware function, reducing real-world risk. But there is no test that exercises the actual live call path (removeRackPadAt) with a macro-route assertion, and no UAT checkpoint exists — so the auditor's PARTIAL/UNVERIFIED characterization stands. Recommend a 
- **Proposed UAT checkpoint:** UAT: In Sample Rack editor, add 2 pads (one triggered + one with a macro route), delete the triggered pad, then confirm its trigger-event and macro route are gone while the surviving pad's events/routes are untouched and no crash occurs.

### PR #255 — feat(instruments): B10.1 — performance-track freeze↔voice FSM (queue-by-frameIndex, failure branch, double-bake guard)  `[GAP_UNWIRED]`
- **PARTIAL**: Bake produces user-audible/visible frozen playback at time of this PR's merge
  - evidence: PR body explicitly defers 'Backend performance voice-timeline bake' to B10.1b; bake is only an injectable stub (setBakeFn) in this PR — no App.tsx render-loop consumer of a frozen clip exists yet at PR #255's merge point (that consumer, frozenLayers in App.tsx:1299, was added by the SUPERSEDING PR #256). So at PR #255 alone, freezing a track had no user-visible frozen-clip playback.
- **Skeptic (upheld):** Auditor's own PARTIAL claim is accurate and is corroborated by the PR body and git history, not just plausible. FSM/queue-cap wiring (RackDevice.tsx:77-79,178-179) and the 12-test suite are genuinely WIRED/covered for #255's actual scope (FSM correctness against an injected stub), so those two claims are not gaps. The gap is specifically: at PR #255's merge point alone, there is no user-visible fr

### PR #270 — feat(safety): P6.4 — SG-1 real Metal binding (MLX) + GPU-pattern AST lint  `[GAP_UNWIRED]`
- **UNWIRED**: lint_gpu_patterns.py AST-lints for raw mlx.core allocations outside the wrapper, clean on current tree
  - evidence: backend/scripts/lint_gpu_patterns.py exists but `grep -rn lint_gpu_patterns .github/workflows/` returns no matches — not wired into any CI job. PR body explicitly flags this as 'user-action' follow-up ('CI hook for the lint = add python scripts/lint_gpu_patterns.py to the smoke job ... user-merge-only'), so the lint currently only runs if a human invokes it manually; it is not an enforced gate.
- **Skeptic (upheld):** The other two claims (MLXGPUResource wiring at granulator_gpu.py/field_codegen.py call sites, and pyproject.toml metal extra) were not independently re-verified line-by-line here since the auditor marked them WIRED and the task was to hunt only for refutation of the UNWIRED claim; no evidence found to refute it. Tests exist (test_gpu_resources.py) but they test the MLX wrapper itself, not the CI-e
- **Proposed UAT checkpoint:** UAT/CI checkpoint: add `python backend/scripts/lint_gpu_patterns.py` to the CI smoke job and confirm it runs on every PR touching backend/src, failing the build on any raw MLX/Metal allocation outside mlx_resources.py.

### PR #272 — feat(P6.6): frontend field params + axis-lane render wiring  `[GAP_UNWIRED]`
- **MISSING**: Field-capable params actually populated by backend so control is live (not inert)
  - evidence: PR body itself states list_effects returned empty fieldParams for all effects at merge time (registry.field_capable never populated from FIELD_TOP25); this gap was only closed by the SEPARATE follow-up PR #275 (backend/src/effects/registry.py:76-101), i.e. PR 272 alone shipped an inert control on main until #275 merged
- **Skeptic (upheld):** Auditor's GAP_UNWIRED classification is correct. Tests cited (axis-lanes-payload, field-param-control, resolveGhostValues-field, project-load-field-validation) are frontend unit/component tests that mock or bypass live backend list_effects response — they do not exercise the real backend registry, so they would pass even with the registry gap present, meaning the "covered:yes" test claim does not 

### PR #329 — fix(ipc): bidirectional allowlist contract + resolve 3 orphaned handlers (F5)  `[GAP_UNWIRED]`
- **UNWIRED**: mask_gc_sidecars IPC command wired into ALLOWED_COMMANDS to fix orphan bug
  - evidence: frontend/src/main/zmq-relay.ts:88 'mask_gc_sidecars' added to ALLOWED_COMMANDS, but grep -rn mask_gc_sidecars frontend/src/renderer returns 0 matches on current main — no caller invokes it on node-delete as claimed needed by #227; PR's own body explicitly flags this as a 'Follow-up (not built here)'. UAT doc docs/UAT-COMPREHENSIVE-AUDIT-2026-07-03.md:104 (G10) lists 'mask_gc_sidecars actually GCs orphaned matte sidecars' as an open checkpoint, not confirmed done
- **Skeptic (upheld):** PR #329 (and its predecessor #227) added mask_gc_sidecars to the backend dispatch table and the frontend allowlist, correctly making it a reachable/non-orphaned command, but no code path anywhere (UI event, store action, or backend lifecycle hook) actually invokes it. It is allowlisted-but-dead: orphaned matte sidecar files will not be GC'd in production until a real caller is added. PR body's own

### PR #333 — test(backend): registry isolation — fix xdist cross-test pollution killing test_all_effects_process_without_crash (F4b)  `[GAP_MISSING]`
- **MISSING**: Directory-local autouse fixture in backend/tests/test_effects/conftest.py snapshots/restores effects._REGISTRY around every test in tests/test_effects/
  - evidence: File backend/tests/test_effects/conftest.py does not exist on current main (ls backend/tests/test_effects/ shows no conftest.py). Superseded by PR #349 (commit 7ce59e3, 'F4b-2 — root-level registry snapshot/restore fixture'), which promoted an equivalent-but-broader autouse fixture to backend/tests/conftest.py:19-33 (scope='function', autouse=True, snapshots/restores _REGISTRY). The underlying bug fix is present on main, just not via the file this PR shipped.
- **Skeptic (upheld):** Could not refute the gap — the auditor's account is accurate on all counts. PR #333's shipped artifact (directory-local conftest.py fixture) is confirmed deleted from main; the underlying fix persists only via the broader, later PR #349 fixture. This is a legitimate 'superseded-but-not-what-was-shipped' gap: the behavior/bug-fix survives, but the specific file/wiring PR #333 claims to have added i
- **Proposed UAT checkpoint:** n/a — internal test-infra fix, no user-observable behavior; verify via `pytest -n auto` full suite shows zero registry-pollution-caused TypeErrors in test_integration.py::test_all_effects_process_without_crash.

### PR #351 — feat(performance): bank-relative hardware mapping — model, focus-follows resolver, MIDImix profile (H2)  `[GAP_UNWIRED]`
- **UNVERIFIED**: deriveDefaultAssignment.ts provides context-kind default row assignment
  - evidence: file shipped per PR file list; no direct grep run confirming a call site consuming deriveDefaultAssignment on current main (not checked)
- **MISSING**: controllerProfiles.ts MIDImix factory CC map applied via applyControllerProfile store action, reachable from UI
  - evidence: On the code as merged by #351, applyControllerProfile existed only in stores/midi.ts with no UI call site — confirmed by docs/UAT-COMPREHENSIVE-AUDIT-2026-07-03.md:28 'E18 (#31) P0-gap: MIDImix factory CC map ... is ORPHANED — zero UI call sites; can't be loaded'. This was later fixed by PR #412 (frontend/src/renderer/components/performance/MIDIMapOverlay.tsx:216, commit 3702a72 'fix(midi): wire orphaned MIDImix factory profile into UI (E18) (#412)'), which postdates and supersedes this PR's gap.
- **UNVERIFIED**: H2 caps enforced (MAX_CC_BANK_BINDINGS=64, MAX_BANK_ASSIGNMENT_CONTEXTS=128)
  - evidence: declared in bankTypes.ts per PR body; not independently grepped for enforcement site in stores/midi.ts CRUD actions
- **Skeptic (upheld):** Gap upheld but narrow: 3 of 5 auditor sub-claims resolve to fully WIRED (2 upgraded from UNVERIFIED to confirmed WIRED after direct grep). Only the MIDImix-factory-profile-to-UI wiring (applyControllerProfile orphaned) is a genuine unwired gap in #351 as merged — confirmed by absence in the merge commit diff and independently corroborated by the project's own UAT audit doc. That gap was later clos
- **Proposed UAT checkpoint:** UAT should add: bind a CC to a bank slot for the focused effect context, switch focus (select a different clip/track), confirm the SAME physical CC now drives the new context's bound target (focus-follows) with no stale binding from the previous context.

### PR #393 — feat(automation): AA.4 breakpoint selection — marquee-select, move, copy/paste  `[GAP_UNWIRED]`
- **UNWIRED**: copySelectedPoints — copy the current point selection to clipboard for later paste (round-trip with pasteAtPlayhead)
  - evidence: frontend/src/renderer/stores/automation.ts:1155-1171 defines copySelectedPoints and sets clipboard, but grep across frontend/src (excluding tests) shows zero call sites outside frontend/src/__tests__/stores/automation-selection.test.ts:289,308,317 — no keyboard shortcut or UI control invokes it; PR body itself states 'wiring copy/paste to a keyboard shortcut ... is deferred; the store action is ready', so the shipped feature is store-only with no end-user trigger
- **Skeptic (upheld):** The PR does ship a working keyboard-triggered copy/paste for automation (region-based), which could cause a superficial "copy/paste works" impression during manual testing — but it is a functionally distinct mechanism (whole-region duplicate) from the PR's claimed selection-based copySelectedPoints/pasteAtPlayhead round-trip. The store-level round-trip is real and tested (automation-selection.test


## 2. REFUTED FLAGS (6) — first-pass alarms the skeptic disproved (do not re-file)

- **PR #161** SG-8: memory-pressure auto-disable library + canonical degrade order — refuted: Auditor correctly noted PR #161's own body said degrade callbacks and MemoryStatus.tsx were deferred at merge time, but missed that superseding PRs completed the wiring on current main:

1. Real degrade callbacks ARE registered against the canonical stages: `backend/src/instruments/granulator_instru
- **PR #163** SG-1: GPU resource lifetime contract (finalizer + real leak test, cherry-picked clean) — refuted: Auditor's grep window (backend/src, "outside safety module + its own test file") was too narrow / point-in-time. `git log --all --oneline` shows PR #163 was followed by superseding/consuming work already merged to main's history: commit 8b421dd/dff8d89 "P6.4 — SG-1 real Metal binding (MLX) + forbidd
- **PR #178** feat(timeline): drag track header to reorder + drop-zone (fresh cherry-pick of #109) — refuted: Auditor's grep for literal strings "edgeScroll/edge-scroll/EDGE_SCROLL" missed the actual implementation, which uses different identifier names. Both pieces of cherry-picked commit 3c544c0/920707f ("edge-scroll on clip drag + snap-around-overlap") are present on current main:

1. Edge-scroll: fronte
- **PR #179** feat(ux): PUX.1 Live Signal design tokens + hex-ratchet — refuted: Auditor's literal claim ("no `hex-ratchet` step in .github/workflows/**") is textually correct — `grep -n hex .github/workflows/test.yml .github/workflows/perf-nightly.yml` returns zero matches — but the underlying gap (enforcement is missing/inadequate) is refuted. `.github/workflows/test.yml` line
- **PR #234** feat(instruments): B4.1 Sample Rack — RackNode model + per-pad channel summing — refuted: The auditor correctly read PR #234's own body (which deferred export parity to "a later B4 slice") but failed to check whether that later slice actually landed on main. It did, one day later: PR #236 "feat(instruments): B4-export — render Sample Racks in export path (preview/export parity)" (commit 
- **PR #402** feat(video): Master track UI + export-parity/persistence redteam guards (M.2) — refuted: git log --all --oneline confirms both PRs merged to main same day: 71020d8 "M.2 Master-Out Bus — UI + 2 redteam guards (#402)" and f722bb3 "feat(video): M.2b — wire master_chain into render/export IPC payloads (#403)". The auditor's own evidence block already states the MISSING sub-claim ("Master ef


## 3. UAT-UNMAPPED PRs (63) — proposed checkpoints (patch these into the UAT plan)

- **#123** (feature) feat(effects): Grid Moire — true interference moiré
  - ☐ Add a UAT row: apply fx.grid_moire generator effect with default params, expect a visible moiré interference pattern (not near-black) on the preview — grep of full UAT corpus for 'moire'/'grid_moire'/'interference' returned zero hits.
- **#146** (fix) fix(generator): Grid Moire v2 — fix black-render + two independent liquify meshes
  - ☐ Add UAT row: apply fx.grid_moire with two independent liquify meshes, verify visible (non-black) interference beat pattern updates live and each mesh's liquify/rotation animates independently — no existing doc in the corpus mentions grid_moire/moire/interference.
- **#149** (fix) feat(sg-7): codec/decode timeout — de-stacked off main (demo-safety prereq)
  - ☐ Add UAT row: import a truncated/malformed video file and confirm the sidecar returns a decode-timeout error within ~5s per frame instead of hanging indefinitely.
- **#151** (fix) fix(zmq): INJ-3 — composite layer cap + frame_index guard
  - ☐ Backend: send render_composite with >50 layers and separately with a layer frame_index=-1; expect ok:false with a descriptive error and no OOM/crash, verified via sidecar test harness (not exercised in any UAT doc — grep for 'INJ-3', 'MAX_COMPOSITE_LAYERS', 'composite layer cap' across all UAT corpus files returned zero hits).
- **#152** (refactor) refactor(performance): INJ-1 — rename Pad.mappings → Pad.modRoutes (v3 schema break)
  - ☐ Open Performance tab, assign a mod route to a pad, save/reload project, confirm the pad's modulation routing persists and applies live (grep of 'modRoutes' and 'Pad.mappings' across UAT corpus returned zero hits).
- **#153** (feature) feat(instruments): B1 1-voice Sampler core (store + pure compute + device)
  - ☐ N/A for core-only PR (no user-visible surface until #155); once mounted: Instruments tab > Add Sampler > verify speed/start/opacity/blend controls affect preview (grep for 'Sampler'/'sampler' across UAT corpus returned zero hits).
- **#155** (feature) feat(instruments): B1 mount — sampler playable in-app (render path + Instruments tab)
  - ☐ Import a clip, open Instruments sidebar tab, Add Sampler from current clip, verify Speed/Start/Opacity/Blend controls visibly affect the live preview and Remove clears the layer (grep for 'InstrumentsPanel', 'Add Sampler', 'sampler' across UAT corpus returned zero hits).
- **#156** (feature) feat(instruments): persist B1 sampler in project save/load
  - ☐ Add a sampler, tweak speed/opacity, Save, then Reload/Open the project, verify sampler settings round-trip exactly (grep for 'instrument' persistence / '#156' across UAT corpus returned zero hits).
- **#157** (refactor) feat(automation): PR-B Commit-1 — unify isTrigger+triggerMode into InterpolationMode
  - ☐ Add a smooth automation lane and a gate trigger lane on a track; verify both render/evaluate correctly and timeline badges distinguish them, and that a step-mode lane holds values without interpolation (grep for 'isTriggerLane', 'InterpolationMode', 'trigger lane' across UAT corpus found no PR-157-specific mapping).
- **#158** (feature) feat(automation): PR-B Commit-2 — B4-lite axis binding + domain selector
  - ☐ Arm a track with an effect, add a lane, set Domain: Y, pick a param; verify axisBinding.domain='y' persists across save/reload and confirm no render change occurs yet (expected, per PR scoping) — grep for 'axisBinding', 'Domain selector', 'B4-lite' across UAT corpus returned zero hits.
- **#162** (feature) A4 Spectral Frame Warper — 6 registered effects (clean extract, no SG-1 needed)
  - ☐ In the effect browser/rack UI, search/filter for 'spectral' and confirm all 6 new fx.spectral_* effects (shift, comb, smear, formant, parity, inversion) appear, can be dragged onto a track, and visibly alter frame output when previewed.
- **#163** (feature) SG-1: GPU resource lifetime contract (finalizer + real leak test, cherry-picked clean)
  - ☐ Not user-observable until a GPU-backed effect ships; proposed checkpoint once such an effect exists: run a GPU-texture-allocating effect in a loop and confirm no unbounded RSS growth (leak) and no crash on destroy-then-use.
- **#166** (perf) perf(fx): reaction_mosh default PDE steps 3→1 (render-budget safe)
  - ☐ Render a reaction_mosh clip at 1080p with default params and confirm render time stays within the 500ms/frame budget (no explicit UAT row found for reaction_mosh or pde_steps_per_frame in docs/UAT-*.md).
- **#170** (feature) feat(project): UE.4 Save As + numbered project backups
  - ☐ File > Save As on an open project prompts a native save dialog defaulting to '<name> copy.glitch'; after saving, the title bar reflects the new file and subsequent Cmd+S writes to the new path with up to 5 rotating .bak backups of the prior file (no explicit 'Save As' or 'backup' UAT row found in docs/UAT-PLAN-2026-07-02-live-cu.md or docs/UAT-COMPREHENSIVE-AUDIT-2026-07-03.md).
- **#175** (fix) fix(selection): Escape clears clip selection in perform mode (F-0514-5) — fresh cherry-pick of #101
  - ☐ Arm a performance track, select a clip (TransformPanel/handles visible), enter perform mode and press Escape: selection and TransformPanel should clear on the first Escape without triggering panicAll; a second Escape (no selection) should panicAll.
- **#180** (feature) UE.3 — Marquee (rubber-band) clip selection in the timeline
  - ☐ UAT: On the timeline, drag a rectangle across empty track background over 2+ clips → both clips become selected (highlighted); Escape mid-drag cancels with no selection change; drag starting on a clip body does not start a marquee.
- **#181** (feature) UE.7 — Clip rename + clip color (8-swatch palette)
  - ☐ UAT: Double-click a clip label to rename it, type a name, confirm it persists after save/reload; right-click a clip → pick a swatch color → clip tint updates in the timeline and survives reload.
- **#183** (feature) PUX.4 — Control & menu semantics (ARIA on Knob/Slider/ContextMenu)
  - ☐ UAT: Tab to a Knob or Slider control, confirm a screen reader/AT would announce role=slider with current value; open a right-click context menu, use ArrowDown/ArrowUp/Home/End/Enter to navigate and activate items via keyboard only.
- **#184** (fix) PUX.3 — Focus-visible coverage across all outline:none sites
  - ☐ UAT: Tab through every slider/knob/input control in the app using keyboard only; confirm every focused control shows a visible focus ring (no invisible keyboard-focus stops).
- **#185** (feature) P2.1 — BPM split (bpm vs effectiveBpm)
  - ☐ UAT: Map a modulation source (e.g. LFO or automation lane) to Mixer→BPM, start playback, confirm the effective tempo shifts audibly/visually while the saved project file's persisted bpm field stays at its original baseline value after save.
- **#186** (feature) PUX.2 — Dialog accessibility (Escape, focus trap, ARIA-modal via useModalBehavior)
  - ☐ UAT: Open each of the 10 dialogs (About, Preferences, Export, Preset Save, Feedback, Telemetry Consent, Relink, Crash Recovery, Unsaved Changes, Speed) with keyboard only; press Escape to confirm correct close/cancel action fires, and press Tab repeatedly to confirm focus never escapes to the background app.
- **#188** (fix) PUX.5 — 8-row hit-target enlargement (AutomationNode, trim handles, toggle, buttons, sliders, dropdown)
  - ☐ UAT: click/drag within 2-4px of an automation node edge, clip trim handle edge, device toggle, track button, and blend dropdown border (not dead-center) — the interaction should register (drag/click) rather than miss, confirming the enlarged hit target is functional, not just visual.
- **#189** (feature) P2.2a — Composite-as-terminal-effect: schema + validator (v3 clean break)
  - ☐ UAT: open a pre-v3 (.glitch v2.0.0) project file and confirm the app shows the exact toast/dialog text 'v2 projects unsupported — start a new project' with no crash and no partial/silent load.
- **#190** (feature) P2.2b — Composite store + components (UI drag-onto-track creation flow, Track.tsx affordance)
  - ☐ UAT: on a video/text track with no composite effect yet, click the Track.tsx composite-creation affordance (or drag a Composite tile onto the track) and verify a single undo-step creates the terminal composite and opacity/blend controls become live.
- **#194** (feature) P5a.2 — Backend voiceId state keying + per-voice cleanup + voice caps
  - ☐ Trigger 2 simultaneous sampler voices on the same clip with datamosh effect stack; verify state does not cross-contaminate and stealing one voice does not reset the surviving voice's effect state.
- **#199** (feature) P3.4 — Hover-help + hotkeys, with measurable perf gate
  - ☐ Hover over an inspector control with a registered help-id; a tooltip should appear (and stay while hovering into it for ~400ms), Escape dismisses it, and keyboard focus on the same control shows the identical help text.
- **#201** (fix) fix(ux): style the P3.2 category tabs + de-debug add-track button
  - ☐ UAT: Open the Effects browser; verify the 5 tabs (fx/op/composite/tool/instruments) render as a fitted segmented control with a solid ACID-colored active tab and a solid (non-dashed) '+ Add Text Track' button below.
- **#203** (feature) P5a.4 — Deterministic backend export replay of performance voices
  - ☐ UAT: Arm a performance track, record a multi-voice pad performance, export the timeline to an image sequence twice, and confirm both exports are byte-identical (sha256 match) and every voice/note is present in the rendered frames.
- **#206** (fix) fix(a11y): bump 8 readable-text hint labels from --cx-text-disabled to --cx-text-3 for WCAG AA
  - ☐ UAT: With no video loaded, open Preview/Effect Rack/Preferences/Timeline empty states and visually confirm hint text ('No video loaded', drag-drop hints, etc.) is clearly legible (not washed-out/disabled-looking) against the dark background.
- **#213** (feature) feat(audio): PD.1 audio-tracks bake kit + bake-session instrumentation
  - ☐ Run the app with EXPERIMENTAL_AUDIO_TRACKS=true via scripts/launch-bake.sh, play audio for >=60s, stop, then confirm ~/.creatrix/audio-bake-log.jsonl gained one new line with flag_on:true and callback_errors:0; running scripts/check_bake_gate.py against it should FAIL with 'under 7 days' on day one and PASS once 7 distinct days / 7200s cumulative / 0 errors are logged.
- **#216** (feature) feat(ux): PD.8 hotkey-discoverability surfaces — show shortcuts at point of invocation
  - ☐ Right-click a device in the device-chain rack; observe menu items for Freeze up to/Unfreeze/Flatten to video/Save effect preset/Save chain preset each show current bound shortcut text (or none if unbound), matching Preferences->Shortcuts once bound.
- **#231** (feature) feat(instruments): B3.2 sampler scrub + speed as modulation destinations (scrub-by-LFO)
  - ☐ Map an LFO to sampler.<id>.scrub in the Modulation Matrix on a live sampler track; play the timeline and observe the sampler's footage frame sweep across its playable range in sync with the LFO, both in preview and in an exported clip.
- **#239** (feature) B4-pad-delete — removeRackPad with symmetric cleanup
  - ☐ UAT: In Sample Rack editor, add 2 pads (one triggered + one with a macro route), delete the triggered pad, then confirm its trigger-event and macro route are gone while the surviving pad's events/routes are untouched and no crash occurs.
- **#254** (feature) feat(masking): mask_thumbnail IPC + real 64×36 matte chips (completes MK.13)
  - ☐ Mask a device with a static (rect/ellipse) matte -> DeviceCard shows a real 64x36 grayscale thumbnail image (not MSK/INV text) reflecting the matte shape; masking with a procedural key (chroma/luma/color/AI) keeps the text badge and issues no crash.
- **#264** (feature) feat(operators): P4.5 — Operator topology graph (xyflow)
  - ☐ UAT: open Operator Rack, expand 'Topology' section, drag an LFO operator onto an effect param, confirm the topology graph renders a live-animated edge between the operator node and the mapped effect node, and collapsing the section removes the graph from the DOM.
- **#265** (feature) feat(effects): P6.2 — field-param schema + frozen top-25 list
  - ☐ UAT: attempt to apply a `__field__` value to a param not in FIELD_TOP25 via the pipeline API and confirm it raises a ValueError naming the effect/param and pointing at gen_field_top25.py --check.
- **#266** (feature) feat(effects): P6.3 — field sources (image/video -> 2D luma field provider)
  - ☐ UAT: assign an image as a field source on a field-capable param, render a frame, and confirm the effect output visibly varies per-pixel according to the image luma (not a flat scalar).
- **#267** (feature) feat(operators): P4.6 — browser op-tab + drag-to-add (completes Phase 4)
  - ☐ UAT: drag 'Kentaro' operator from the browser op-tab onto a device param knob and confirm the preview visibly modulates in real time (per the PR's own 28/30-frame Playwright evidence, this should be reproduced manually).
- **#268** (feature) feat(render): P6.1 — CPU row-banded lane sampling (domain=y/x live-render unlock)
  - ☐ UAT: set an effect param's axisBinding.domain to 'y' with a multi-band curve, render, and confirm visibly distinct horizontal bands in the output frame; confirm removing the binding restores the prior single-value render exactly.
- **#270** (feature) feat(safety): P6.4 — SG-1 real Metal binding (MLX) + GPU-pattern AST lint
  - ☐ UAT/CI checkpoint: add `python backend/scripts/lint_gpu_patterns.py` to the CI smoke job and confirm it runs on every PR touching backend/src, failing the build on any raw MLX/Metal allocation outside mlx_resources.py.
- **#273** (feature) feat(effects): P6.5 — C3 Metal codegen, per-pixel field application on GPU
  - ☐ Add UAT row: 'Assign a field to a pointwise top-25 param on a Metal-capable Mac, render a frame; verify GPU-rendered output is byte-identical (max_abs_diff=0) to the CPU fallback path for the same field assignment.'
- **#280** (feature) feat(safety): P5b.6 — SG-5 dynamic cycle detection (cherry-pick #144)
  - ☐ In Routing Canvas, drag-connect an edge that would close a and b into a cycle; verify the connection is blocked or auto-broken (lex-smallest edge) with user-visible feedback, matching the OperatorRack cycle pre-flight behavior.
- **#283** (feature) feat(sg5): P5b.7 — runtime-aware topological sort / deterministic cycle break
  - ☐ In the Routing Canvas / Modulation Matrix, create a modulation cycle (a→b→a); verify the render does not silently fall back to declaration order but instead deterministically breaks the lex-smallest edge and the UI reflects which connection was dropped.
- **#285** (feature) feat(sg5): P5b.8 — per-export-job break cache + once-per-export warning + 16ms gate
  - ☐ Export a project containing a modulation-graph cycle; confirm the export completes with a single toast/status field cycle_warning (not one per frame) and preview/export ordering is byte-identical to the live-render path.
- **#295** (perf) feat(instruments): P5b.28 B8 GPU grain-render pass (preview-only, MLX instanced quads)
  - ☐ Add UAT row: 'Enable granulator on a track with density near 200 grains; preview should render without visible latency spike (GPU path engages) and exported MP4 frame must pixel-match the preview frame (CPU export path), confirming no drift between GPU-preview and CPU-export granulator rendering.'
- **#296** (feature) feat(automation): P5b.25 B10 MIDI Learn hardening (CC rate-limit + echo-suppression + persistence round-trip)
  - ☐ Add UAT row under MIDI Learn area: 'Rapidly twist a hardware CC knob for 2 seconds; store write rate should visibly cap (no UI jank/lag) and the mapped parameter should track smoothly without runaway store writes; motorized-fader echo (if hardware supports feedback) should not cause value oscillation.'
- **#297** (fix) fix(automation): SG-5 runtime-conditional-edge seam guard — degrade to static sort on malformed/raising RuntimeContext
  - ☐ Add UAT row: 'With a runtime-conditional modulation edge in a malformed/erroring state, confirm the render frame does not crash and the timeline continues playing (degrades silently to static ordering, logged once, not spamming console).'
- **#300** (fix) fix(automation): finite-guard operator mapping min/max at the live render validator (audit #14)
  - ☐ UAT: hand-edit a saved project's operator mapping to min=NaN or max=Infinity, reload/render — expect the load/render to be rejected with a 'must be a finite number' validation error rather than silently accepted.
- **#302** (fix) fix(automation): clearCCMappings cancels pending flush timers + document dormant SG-H3 echo seam (audit #16/#15)
  - ☐ UAT: rapidly send a burst of MIDI CC messages, immediately click 'Clear CC Mappings' mid-burst, then wait past the flush-timer window — confirm no stale CC value reappears in ccValues/UI after clearing.
- **#304** (fix) fix(safety): SG-3 last-good defensive copy + SG-8 stop() no thread-orphan (audit lows #2/#8)
  - ☐ UAT: force SG-8 monitor thread to hang past its stop timeout — confirm a 'monitor thread did not stop' warning is logged and the app does not crash or double-stop; separately, force a NaN frame followed by an in-place buffer mutation and confirm the last-good frame served is unaffected by the mutation.
- **#305** (fix) fix(instruments): call removeGranulator on track delete + serialize granulator render_path (audit lows #10/#11)
  - ☐ UAT: create a track with a granulator instrument, delete the track, inspect the instruments store — confirm no orphaned granulator/frameBank entry remains for the deleted track id.
- **#308** (fix) fix(automation): drop fictitious mappings edges from ordering/cycle graph — audit medium #4
  - ☐ Build an operator chain where two operators are connected only via a mapping (not parameters.sources), and confirm the routing/cycle UI does NOT flag a false cycle warning and does NOT reorder evaluation based on that mapping alone.
- **#332** (fix) fix(effects): FieldProvider dead-source warning dedup — once per source, not per frame (F7a)
  - ☐ Render 60+ frames referencing one dead image/video source at 60fps; confirm exactly one dead-source warning is logged (not one per frame), and that killing/restoring the source produces one new warning per failure streak.
- **#333** (test) test(backend): registry isolation — fix xdist cross-test pollution killing test_all_effects_process_without_crash (F4b)
  - ☐ n/a — internal test-infra fix, no user-observable behavior; verify via `pytest -n auto` full suite shows zero registry-pollution-caused TypeErrors in test_integration.py::test_all_effects_process_without_crash.
- **#335** (fix) fix(audio): bake-log test isolation + provenance + gate noise filter (F6)
  - ☐ Run the full backend pytest suite, then inspect ~/.creatrix/audio-bake-log.jsonl and confirm zero new bytes were written (isolation holds); separately, launch the packaged app, play audio for >=5s, and confirm the resulting log line has app_mode=='packaged' (or 'dev' in dev launch) rather than 'test' or missing.
- **#345** (feature) feat(performance): focused-mapping-context selector + statusbar focus chip (H1)
  - ☐ Select a rack pad on Track A while Track B is the active/armed track: statusbar focus chip must show 'none' or Track B's own focus (not steal Track A's pad) — select an effect on the armed track and confirm chip switches to '◎ effect · <name>'; select a clip and confirm chip shows '◎ clip · <filename>'; deselect everything and confirm chip disappears.
- **#347** (feature) feat(design): L0 — Block-style tool-icon set (14 tools, currentColor)
  - ☐ Open the effects/tools panel 'tool' tab: each of the 14 cursor tools and mask tools should render a Block-style SVG icon (stroke-width 2.7, square caps, currentColor) to the left of its label, and the active tool's icon+label should be visually distinguished (active badge).
- **#351** (feature) feat(performance): bank-relative hardware mapping — model, focus-follows resolver, MIDImix profile (H2)
  - ☐ UAT should add: bind a CC to a bank slot for the focused effect context, switch focus (select a different clip/track), confirm the SAME physical CC now drives the new context's bound target (focus-follows) with no stale binding from the previous context.
- **#363** (fix) fix(effects): PFX.2a — cellular_pixel_sort visible at defaults
  - ☐ UAT: with a fresh cellular_pixel_sort effect at default params on natural (non-noise) footage, play 20+ frames and confirm frame-to-frame diff stays visibly above threshold throughout (not just the first few frames) rather than decaying to a static image.
- **#365** (feature) feat(performance): persist controller bindings by device identity across sessions (H5)
  - ☐ UAT: learn CC bindings on a physical/virtual MIDI controller, disconnect it, reconnect the same controller (or relaunch the app) and confirm the previously learned bank-slot mappings are automatically restored without re-learning, while a different/unknown controller shows no bindings.
- **#370** (feature) 3 layer-transition effects (Column Cascade, Column Cascade Reverse, Row Waterfall)
  - ☐ Apply transition_column_cascade/reverse/row_waterfall as a fx.* effect on a clip's tail, scrub frame_index across the clip duration and confirm columns/rows reveal progressively and reach fully-revealed state at duration_frames, matching the documented single-frame-contract semantics (not yet true A/B layer transitions).
- **#376** (feature) Bank paging (BankPagingHUD) on top of H2 bank-relative CC resolver
  - ☐ Grepped docs/UAT-UIT-GUIDE.md, UAT-PLAN-2026-07-02-live-cu.md, UAT-PLAN-2026-06-17-full-coverage.md, UAT-COMPREHENSIVE-AUDIT-2026-07-03.md, UAT-RESULTS-2026-07-03.md/2026-06-17.md, HANDOFF-CU-UAT-2026-07-03.md, MASTER-UAT-AND-BUILD-PLAN, V2-AUTOMATED-UAT-PLAN, UAT-TEST-PLANS-FROM-BDD for 'bank pag', 'activeBankIndex', 'BANK L/R' -- zero hits. Proposed checkpoint: with an Akai MIDImix connected and at least one CC bound, click the BankPagingHUD right-arrow next to the MAP status-bar chip; the HUD label increments 'Bank N/MAX', and turning the same physical knob now resolves to a different mapped parameter than before paging (verify via MIDI Map overlay slot highlight).
- **#418** (fix) fix(effects+automation): recover orphaned pulse-lane commits (rewind/reverse_at + bool trigger targets)
  - ☐ Add to UAT-UIT-GUIDE.md effects/automation section: 'Add fx.copy_machine to a clip, open Track automation menu, set Rewind as a trigger-lane target, place a trigger point -> expect frame playback to visibly reverse through the copy_machine output ring while the trigger is active, and re-arm when generation drops back below reverse_at.'


## 4. NO TEST COVERAGE (2)

- **#123** feat(effects): Grid Moire — true interference moiré — backend/tests/test_grid_moire_real.py was fully rewritten by #146 (128 additions/101 deletions per PR diff) — the #123 test assertions no longer exist on main.
- **#206** fix(a11y): bump 8 readable-text hint labels from --cx-text-disabled to --cx-text-3 for WCAG AA — PR body cites manual Playwright Electron screenshots for visual inspection only; no automated contrast-ratio test file found under frontend/src/__tests__/**.


## 5. Full matrix (all 269)

| PR | class | verdict | tests | UAT |
|---|---|---|---|---|
| #116 | feature | OK_WIRED | yes | yes — docs/UAT-UIT-GUIDE.md section 7.8 'Per-Track Effect Chains',… |
| #120 | feature | OK_WIRED | yes | yes — docs/UAT-COMPREHENSIVE-AUDIT-2026-07-03.md lines 93/103/132 … |
| #123 | feature | GAP_MISSING | no | no |
| #146 | fix | OK_WIRED | yes | no |
| #148 | feature | OK_WIRED | yes | partial — docs/UAT-PLAN-2026-06-17-full-coverage.md line 103 '9.3 I3 i… |
| #149 | fix | OK_WIRED | yes | no |
| #150 | fix | OK_WIRED | yes | partial — docs/UAT-COMPREHENSIVE-AUDIT-2026-07-03.md line 140 mentions… |
| #151 | fix | OK_WIRED | yes | no |
| #152 | refactor | OK_WIRED | yes | no |
| #153 | feature | OK_WIRED | yes | no |
| #155 | feature | OK_WIRED | yes | no |
| #156 | feature | OK_WIRED | yes | no |
| #157 | refactor | OK_WIRED | yes | no |
| #158 | feature | OK_WIRED | yes | no |
| #159 | ci | EXEMPT | n/a | n/a |
| #160 | fix | OK_WIRED | yes | partial — docs/UAT-PLAN-2026-07-02-live-cu.md:88 covers 'export MP4 → … |
| #161 | feature | GAP_UNWIRED | yes | partial — docs/UAT-PLAN-2026-07-02-live-cu.md:97 'push density until S… |
| #162 | feature | OK_WIRED | yes | no |
| #163 | feature | GAP_MISSING | yes | no |
| #164 | fix | OK_WIRED | yes | yes — docs/UAT-RESULTS-2026-04-09.md:678 'BPM preserved in save — … |
| #165 | feature | OK_WIRED | yes | partial — docs/UAT-PLAN-2026-07-02-live-cu.md:16 mentions 'granulator … |
| #166 | perf | OK_WIRED | yes | no |
| #167 | feature | OK_WIRED | yes | yes — docs/UAT-COMPREHENSIVE-AUDIT-2026-07-03.md rows ~90/122/209-… |
| #168 | docs | EXEMPT | n/a | n/a |
| #169 | chore | EXEMPT | n/a | n/a |
| #170 | feature | OK_WIRED | yes | no |
| #171 | ci | EXEMPT | n/a | n/a |
| #172 | feature | GAP_MISSING | partial | yes — docs/UAT-COMPREHENSIVE-AUDIT-2026-07-03.md line 12 'Import/L… |
| #173 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-07-02-live-cu.md row N8 (line 330): "Expo… |
| #174 | docs | EXEMPT | n/a | n/a |
| #175 | fix | OK_WIRED | yes | no — docs/UAT-UIT-GUIDE.md rows 24/208 cover Escape=Stop in norma… |
| #176 | feature | GAP_UNWIRED | partial | partial — docs/UAT-PLAN-2026-07-02-live-cu.md row A7c (line 67): rippl… |
| #177 | feature | OK_WIRED | yes | yes — docs/UAT-COMPREHENSIVE-AUDIT-2026-07-03.md line 68: "clip-dr… |
| #178 | feature | GAP_UNWIRED | partial | partial — docs/UAT-PLAN-2026-07-02-live-cu.md line 162 (G1): 'drag a t… |
| #179 | feature | GAP_MISSING | yes | yes — docs/UAT-COMPREHENSIVE-AUDIT-2026-07-03.md line 228: 'CD5 — … |
| #180 | feature | OK_WIRED | yes | no |
| #181 | feature | OK_WIRED | yes | no |
| #182 | docs | EXEMPT | n/a | n/a |
| #183 | feature | OK_WIRED | yes | no |
| #184 | fix | OK_WIRED | yes | no |
| #185 | feature | GAP_UNWIRED | yes | no |
| #186 | feature | OK_WIRED | yes | no |
| #187 | fix | OK_WIRED | yes | yes — docs/UAT-COMPREHENSIVE-AUDIT-2026-07-03.md:228-230 CD5 'Toke… |
| #188 | fix | OK_WIRED | yes | no |
| #189 | feature | OK_WIRED | yes | no |
| #190 | feature | OK_WIRED | yes | no |
| #191 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-07-02-live-cu.md:280-290 Stage K 'Master-… |
| #192 | docs | EXEMPT | n/a | n/a |
| #193 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-07-02-live-cu.md:92-95 Stage C3 'Rack bui… |
| #194 | feature | OK_WIRED | yes | no |
| #195 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-07-02-live-cu.md row A5 '#319 regression:… |
| #196 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-07-02-live-cu.md line 130 'inspector stat… |
| #197 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-07-02-live-cu.md line 210 'sub-tabs fx · … |
| #198 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-07-02-live-cu.md row A3 (line 61) 'P1-B f… |
| #199 | feature | OK_WIRED | yes | no |
| #200 | feature | OK_WIRED | yes | yes — docs/UAT-COMPREHENSIVE-AUDIT-2026-07-03.md line 118-119 'G13… |
| #201 | fix | OK_WIRED | partial | no |
| #202 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-06-17-full-coverage.md:103 — '9.3 I3 inli… |
| #203 | feature | OK_WIRED | yes | no |
| #204 | docs | EXEMPT | n/a | n/a |
| #205 | docs | EXEMPT | n/a | n/a |
| #206 | fix | OK_WIRED | no | no |
| #207 | test | EXEMPT | n/a | n/a |
| #208 | docs | EXEMPT | n/a | n/a |
| #209 | docs | EXEMPT | n/a | n/a |
| #210 | test | EXEMPT | n/a | n/a |
| #211 | fix | OK_WIRED | n/a | partial — docs/UAT-PLAN-2026-07-02-live-cu.md:132 instructs graders to… |
| #212 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-06-17-full-coverage.md:272 'Draw it; conf… |
| #213 | feature | OK_WIRED | yes | no |
| #214 | chore | EXEMPT | n/a | n/a — docs/UAT-COMPREHENSIVE-AUDIT-2026-07-03.md:106 references 'm… |
| #215 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-06-17-full-coverage.md Area 8 (line 86) c… |
| #216 | feature | OK_WIRED | yes | no |
| #217 | feature | OK_WIRED | yes | yes — docs/UAT-RESULTS-2026-06-17.md line 105-108 Area 8 Masking v… |
| #218 | feature | OK_WIRED | yes | yes — docs/UAT-RESULTS-2026-06-17.md Area 8 Masking (line 105-108)… |
| #219 | feature | GAP_UNWIRED | partial | partial — docs/UAT-PLAN-2026-06-17-full-coverage.md line 89 '8.1 Marqu… |
| #220 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-06-17-full-coverage.md line 90 '8.2 Lasso… |
| #221 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-06-17-full-coverage.md line 92 '8.4 Chrom… |
| #222 | feature | OK_WIRED | yes | yes — docs/UAT-RESULTS-2026-06-17.md lines 107-133 (Area covering … |
| #223 | feature | OK_WIRED | yes | yes — docs/UAT-RESULTS-2026-07-03.md lines 38-45 (key-map drift no… |
| #224 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-06-17-full-coverage.md line 97 '8.9 Alpha… |
| #225 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-06-17-full-coverage.md line 95 '8.7 Cut/c… |
| #226 | test | EXEMPT | n/a | n/a |
| #227 | fix | GAP_UNWIRED | partial | partial — docs/UAT-COMPREHENSIVE-AUDIT-2026-07-03.md lines 103-107 (G1… |
| #228 | test | EXEMPT | n/a | n/a |
| #229 | docs | EXEMPT | n/a | n/a |
| #230 | feature | GAP_MISSING | partial | partial — docs/UAT-PLAN-2026-07-02-live-cu.md line 74, item B1: 'Maxim… |
| #231 | feature | OK_WIRED | yes | no |
| #232 | feature | OK_WIRED | yes | partial — docs/UAT-PLAN-2026-07-02-live-cu.md line 74 item B1 covers p… |
| #233 | feature | OK_WIRED | yes | partial — docs/UAT-PLAN-2026-07-02-live-cu.md line 90 'C2 Performance … |
| #234 | feature | GAP_MISSING | partial | partial — docs/UAT-RESULTS-2026-06-17.md line 149 'Sample Rack | ✅ mou… |
| #235 | feature | GAP_MISSING | partial | partial — docs/UAT-PLAN-2026-07-02-live-cu.md line 93 'C3 Rack builder… |
| #236 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-07-02-live-cu.md row B1: 'rack (pad chain… |
| #237 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-06-17-full-coverage.md Area 3 'Sample Rac… |
| #238 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-06-17-full-coverage.md row 3.2 'Macros: R… |
| #239 | feature | UNVERIFIED | yes | no |
| #240 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-07-02-live-cu.md row C3 'Rack builder: Sa… |
| #241 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-07-02-live-cu.md row B1 'rack (pad chain … |
| #242 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-07-02-live-cu.md row C3 'per-pad chains' … |
| #243 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-06-17-full-coverage.md line 53: '3.6 B5 n… |
| #244 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-06-17-full-coverage.md line 53 (3.6 B5 ne… |
| #245 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-06-17-full-coverage.md line 53: '...trigg… |
| #246 | feature | OK_WIRED | yes | yes — docs/UAT-RESULTS-2026-06-17.md lines 81-83, 150: 'Area 4 — F… |
| #247 | feature | OK_WIRED | yes | partial — docs/UAT-RESULTS-2026-06-17.md line 81-83 confirms FrameBank… |
| #248 | feature | OK_WIRED | yes | yes — docs/UAT-RESULTS-2026-06-17.md lines 81-83,150: 'Area 4 — Fr… |
| #249 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-07-02-live-cu.md line 74 (row B1): 'Maxim… |
| #250 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-06-17-full-coverage.md row 4.3: 'Interp m… |
| #251 | docs | EXEMPT | n/a | n/a |
| #252 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-06-17-full-coverage.md row 8.1: 'Marquee … |
| #253 | fix | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-06-17-full-coverage.md row 3.7: 'B5 neste… |
| #254 | feature | OK_WIRED | yes | no |
| #255 | feature | GAP_UNWIRED | yes | yes — docs/UAT-PLAN-2026-07-02-live-cu.md lines 91-92: '...freeze … |
| #256 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-07-02-live-cu.md lines 91-92: freeze the … |
| #257 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-06-17-full-coverage.md:82 row 7.3 'Quanti… |
| #258 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-06-17-full-coverage.md:83 row 7.4 'Retro-… |
| #259 | docs | EXEMPT | n/a | n/a |
| #260 | feature | OK_WIRED | yes | partial — docs/UAT-PLAN-2026-07-02-live-cu.md:118 'D4 Boundary errors:… |
| #261 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-06-17-full-coverage.md:109 row 10.2 'Kent… |
| #262 | feature | OK_WIRED | yes | partial — docs/V2-AUTOMATED-UAT-PLAN.md:428,446 sidechain audio UAT ro… |
| #263 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-06-17-full-coverage.md:109 row 10.2 'Kent… |
| #264 | feature | OK_WIRED | yes | no |
| #265 | feature | OK_WIRED | yes | no |
| #266 | feature | OK_WIRED | yes | no |
| #267 | feature | OK_WIRED | yes | no |
| #268 | feature | OK_WIRED | yes | no |
| #269 | docs | EXEMPT | n/a | n/a |
| #270 | feature | GAP_UNWIRED | yes | no |
| #271 | feature | OK_WIRED | yes | yes — docs/UAT-UIT-GUIDE.md Section 25.3 'Inspector Track (I1)' ro… |
| #272 | feature | GAP_UNWIRED | yes | yes — docs/UAT-UIT-GUIDE.md Section 25.1 'Field Assignment' rows 1… |
| #273 | feature | OK_WIRED | yes | no |
| #274 | feature | OK_WIRED | yes | yes — docs/UAT-UIT-GUIDE.md Section 25.3 rows 14-18; also docs/UAT… |
| #275 | fix | OK_WIRED | yes | yes — docs/UAT-UIT-GUIDE.md Section 25.1 row 1 'Assign image as fi… |
| #276 | feature | OK_WIRED | yes | yes — docs/UAT-UIT-GUIDE.md Section 25.4 'Routing Canvas (I2)' row… |
| #277 | feature | OK_WIRED | yes | yes — docs/UAT-UIT-GUIDE.md Section 25.4 rows 19-27 (open/close, e… |
| #278 | test | EXEMPT | n/a | yes — docs/UAT-UIT-GUIDE.md Section 25 (line 1498-1500): 'Added P6… |
| #279 | feature | OK_WIRED | yes | partial — docs/UAT-PLAN-2026-06-17-full-coverage.md line 63: '4.5 SG-8… |
| #280 | feature | OK_WIRED | yes | no |
| #281 | feature | OK_WIRED | yes | partial — docs/UAT-COMPREHENSIVE-AUDIT-2026-07-03.md line 139: 'SG-3 N… |
| #282 | feature | OK_WIRED | yes | partial — docs/UAT-PLAN-2026-06-17-full-coverage.md line 63: '4.5 SG-8… |
| #283 | feature | OK_WIRED | yes | no |
| #284 | feature | OK_WIRED | yes | yes — docs/UAT-COMPREHENSIVE-AUDIT-2026-07-03.md line 139: 'SG-3 N… |
| #285 | feature | OK_WIRED | yes | no |
| #286 | feature | OK_WIRED | yes | partial — docs/UAT-PLAN-2026-07-02-live-cu.md:306 (#26 sg3-aborted lan… |
| #287 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-06-17-full-coverage.md:65-70 Area 5 — Gra… |
| #288 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-07-02-live-cu.md:96 C4 Grain sculpting: s… |
| #289 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-06-17-full-coverage.md:72-75 Area 6 — Ten… |
| #290 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-07-02-live-cu.md:96 C4 Grain sculpting ex… |
| #291 | feature | OK_WIRED | yes | partial — docs/UAT-PLAN-2026-07-02-live-cu.md:74 B1 maximal-project ro… |
| #292 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-06-17-full-coverage.md Area 5 'Granulator… |
| #293 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-06-17-full-coverage.md Area 6 'Tensor Rou… |
| #294 | test | EXEMPT | n/a | n/a |
| #295 | perf | OK_WIRED | yes | no |
| #296 | feature | OK_WIRED | yes | no |
| #297 | fix | OK_WIRED | yes | no |
| #298 | fix | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-07-02-live-cu.md line 98: 'recovery (#298… |
| #299 | fix | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-06-17-full-coverage.md Area 5 (lines 65-7… |
| #300 | fix | OK_WIRED | yes | no |
| #301 | fix | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-07-02-live-cu.md line 74 (B1 round-trip t… |
| #302 | fix | OK_WIRED | yes | no |
| #303 | fix | OK_WIRED | yes | yes — docs/UAT-COMPREHENSIVE-AUDIT-2026-07-03.md line 139: 'SG-3 N… |
| #304 | fix | OK_WIRED | yes | no |
| #305 | fix | OK_WIRED | yes | no |
| #306 | fix | OK_WIRED | yes | partial — docs/UAT-COMPREHENSIVE-AUDIT-2026-07-03.md line 139-141 (G18… |
| #307 | fix | OK_WIRED | yes | partial — docs/UAT-COMPREHENSIVE-AUDIT-2026-07-03.md line 139 (G18) sa… |
| #308 | fix | OK_WIRED | yes | no |
| #309 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-06-17-full-coverage.md line 65-70, Area 5… |
| #310 | test | EXEMPT | n/a | n/a |
| #311 | docs | EXEMPT | n/a | n/a |
| #312 | docs | EXEMPT | n/a | n/a |
| #313 | fix | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-06-17-full-coverage.md:116 — '11.4 Export… |
| #314 | fix | OK_WIRED | yes | partial — docs/UAT-PLAN-2026-06-17-full-coverage.md:123 — '12.4 Sequen… |
| #315 | fix | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-07-02-live-cu.md:74 — 'B1 Maximal project… |
| #316 | fix | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-06-17-full-coverage.md:96 — '8.8 Mask rou… |
| #317 | fix | OK_WIRED | yes | partial — docs/UAT-PLAN-2026-06-17-full-coverage.md:91 — '8.3 Magic wa… |
| #318 | fix | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-07-02-live-cu.md:62 — 'A4 | #318 regressi… |
| #319 | fix | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-07-02-live-cu.md:63 — 'A5 | #319 regressi… |
| #320 | docs | EXEMPT | n/a | n/a |
| #321 | docs | EXEMPT | n/a | n/a |
| #322 | fix | OK_WIRED | yes | partial — docs/UAT-PLAN-2026-07-02-live-cu.md:74 (Stage B1: 'Maximal p… |
| #323 | fix | OK_WIRED | yes | partial — docs/UAT-PLAN-2026-07-02-live-cu.md:17 ('P1-B is fixed (#323… |
| #324 | test | EXEMPT | n/a | n/a |
| #325 | docs | EXEMPT | n/a | n/a |
| #326 | fix | OK_WIRED | yes | partial — docs/UAT-PLAN-2026-07-02-live-cu.md:64 (Stage A6 row: 'The 4… |
| #327 | docs | EXEMPT | n/a | n/a |
| #328 | docs | EXEMPT | n/a | n/a |
| #329 | fix | GAP_UNWIRED | yes | partial — docs/UAT-COMPREHENSIVE-AUDIT-2026-07-03.md:104 G10 'Disk hyg… |
| #332 | fix | OK_WIRED | yes | no |
| #333 | test | GAP_MISSING | yes | no |
| #334 | test | EXEMPT | n/a | n/a |
| #335 | fix | OK_WIRED | yes | no |
| #336 | fix | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-07-02-live-cu.md line 22 (Stage A.7 intro… |
| #337 | fix | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-07-02-live-cu.md line 23 ('#337 Color-Inv… |
| #338 | fix | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-07-02-live-cu.md line 24 ('#338 device ed… |
| #339 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-07-02-live-cu.md lines 24-26 ('#339 razor… |
| #340 | test | EXEMPT | n/a | n/a |
| #341 | docs | EXEMPT | n/a | n/a |
| #342 | docs | EXEMPT | n/a | n/a |
| #343 | docs | EXEMPT | n/a | n/a |
| #344 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-07-02-live-cu.md row X5 ('Move a CLIP tha… |
| #345 | feature | OK_WIRED | yes | no |
| #346 | docs | EXEMPT | n/a | n/a |
| #347 | feature | OK_WIRED | yes | no |
| #348 | ci | EXEMPT | n/a | n/a |
| #349 | test | EXEMPT | n/a | n/a |
| #350 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-07-02-live-cu.md:28 'MK.12 subject-matte … |
| #351 | feature | GAP_UNWIRED | yes | no |
| #352 | test | EXEMPT | n/a | n/a |
| #353 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-07-02-live-cu.md:351 'X5 | Move a CLIP th… |
| #354 | fix | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-07-02-live-cu.md:363 'C4 | Clip-transform… |
| #356 | feature | OK_WIRED | yes | yes — docs/UAT-UIT-GUIDE.md:1276 'MIDI learn (pad) | Right-click p… |
| #358 | docs | EXEMPT | n/a | n/a |
| #359 | feature | OK_WIRED | yes | yes — docs/UAT-RESULTS-2026-07-03.md:43-44 ('slip(`s`)/slide(`d`) … |
| #360 | test | EXEMPT | n/a | n/a |
| #361 | feature | OK_WIRED | yes | yes — docs/UAT-COMPREHENSIVE-AUDIT-2026-07-03.md:33 (F2, P0-verify… |
| #362 | test | EXEMPT | n/a | n/a |
| #363 | fix | OK_WIRED | yes | no |
| #364 | test | EXEMPT | n/a | n/a |
| #365 | feature | OK_WIRED | yes | no |
| #366 | docs | EXEMPT | n/a | n/a |
| #368 | feature | OK_WIRED | yes | partial — docs/UAT-RESULTS-2026-07-03.md:59-60 'Sidecar red = fx.copy_… |
| #369 | feature | OK_WIRED | yes | partial — docs/UAT-RESULTS-2026-07-03.md:62 'Same class as the fx.extr… |
| #370 | feature | OK_WIRED | yes | no |
| #371 | test | EXEMPT | n/a | n/a |
| #372 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-07-02-live-cu.md:217-218 'Automation tool… |
| #373 | fix | OK_WIRED | yes | partial — docs/UAT-UIT-GUIDE.md:518 row 6 'MIDI-reactive mod | Map MID… |
| #374 | refactor | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-07-02-live-cu.md:409 'A7c correction: the… |
| #375 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-07-02-live-cu.md:232-233 'Hardware-map UI… |
| #376 | feature | OK_WIRED | yes | no |
| #377 | feature | OK_WIRED | yes | partial — docs/UAT-FEATURE-FLAG-AUDIT-2026-07-03.md and docs/UAT-RESUL… |
| #378 | test | EXEMPT | n/a | n/a |
| #379 | test | EXEMPT | n/a | n/a |
| #380 | docs | EXEMPT | n/a | n/a |
| #381 | docs | EXEMPT | n/a | n/a |
| #382 | docs | EXEMPT | n/a | n/a |
| #384 | docs | EXEMPT | n/a | n/a |
| #385 | fix | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-07-02-live-cu.md row X5 (line 351): 'Move… |
| #386 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-07-02-live-cu.md line 252, checkpoint I1:… |
| #388 | docs | EXEMPT | n/a | n/a |
| #389 | docs | EXEMPT | n/a | n/a |
| #390 | fix | OK_WIRED | yes | yes — docs/UAT-COMPREHENSIVE-AUDIT-2026-07-03.md:195 (row DN4.4) c… |
| #391 | docs | EXEMPT | n/a | n/a |
| #392 | docs | EXEMPT | n/a | n/a |
| #393 | feature | GAP_UNWIRED | yes | partial — docs/UAT-PLAN-2026-07-02-live-cu.md:254-255 (Stage I, row 'I… |
| #394 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-07-02-live-cu.md:262 (Stage I, row 'I5 Is… |
| #395 | fix | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-07-02-live-cu.md:298 explicitly reference… |
| #396 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-07-02-live-cu.md:280-292 Stage K 'Master-… |
| #397 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-07-02-live-cu.md:300 '## Also new: clip t… |
| #398 | feature | OK_WIRED | yes | yes — docs/HANDOFF-CU-UAT-2026-07-03.md:17 'B3 layout is DEFAULT-O… |
| #399 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-07-02-live-cu.md:256 'I3 Transform box (A… |
| #400 | test | EXEMPT | n/a | n/a |
| #401 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-07-02-live-cu.md:259 'I4 Insert Shape (AA… |
| #402 | feature | GAP_MISSING | yes | partial — docs/UAT-PLAN-2026-07-02-live-cu.md:280-290 Stage K 'Master-… |
| #403 | feature | OK_WIRED | yes | partial — docs/UAT-PLAN-2026-07-02-live-cu.md:288 'M.2b forced it onto… |
| #404 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-07-02-live-cu.md stage J1 (line 270-271) … |
| #405 | chore | EXEMPT | n/a | n/a |
| #406 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-07-02-live-cu.md stage K4 (line 290) 'Mas… |
| #407 | feature | OK_WIRED | yes | yes — docs/UAT-PLAN-2026-07-02-live-cu.md stage J2 (lines 273-277)… |
| #408 | fix | OK_WIRED | yes | yes — docs/UAT-RESULTS-2026-07-03.md lines 59-61 'Sidecar red = fx… |
| #409 | docs | EXEMPT | n/a | n/a |
| #410 | docs | EXEMPT | n/a | n/a |
| #411 | fix | OK_WIRED | yes | yes — docs/UAT-COMPREHENSIVE-AUDIT-2026-07-03.md row #29 (line 24)… |
| #412 | fix | OK_WIRED | yes | yes — docs/UAT-COMPREHENSIVE-AUDIT-2026-07-03.md row E18 (#31, lin… |
| #413 | fix | OK_WIRED | yes | yes — docs/UAT-COMPREHENSIVE-AUDIT-2026-07-03.md row #30 (line 25)… |
| #414 | fix | OK_WIRED | yes | yes — docs/UAT-COMPREHENSIVE-AUDIT-2026-07-03.md row C15 (#31, lin… |
| #415 | feature | OK_WIRED | yes | yes — docs/UAT-UIT-GUIDE.md section 14.4 row 313 'Add Audio Follow… |
| #416 | test | EXEMPT | n/a | n/a |
| #417 | docs | EXEMPT | n/a | n/a |
| #418 | fix | OK_WIRED | yes | no |
| #419 | docs | EXEMPT | n/a | n/a |
| #420 | docs | EXEMPT | n/a | n/a |
