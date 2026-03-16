---
title: Ship Gate Audit — All Built Phases (0A–10)
status: active
created: 2026-03-15
type: audit
---

# Ship Gate Audit — Entropic v2 Challenger

> **Goal:** Run full Ship Gate (`/quality`, `/qa-redteam`, `/review`, UAT check) on every built phase before Phase 11 (Export+Polish).
> **Baseline:** 11,346 tests all green (10,455 backend + 891 frontend) as of 2026-03-15.
> **Approach:** Phase-by-phase in series. Each phase gets 4 checks. Findings tracked per-phase.
> **Sessions:** ~2-3 phases per session, multi-session.

---

## Phases to Audit (14 total)

| # | Phase | Key Files | Status |
|---|-------|-----------|--------|
| 1 | 0A — Skeleton | Electron+React+Vite, Python sidecar, ZMQ heartbeat, watchdog | [ ] |
| 2 | 0B — Pipeline Validation | Shared memory, frame test, PyAV, Effect Container, taxonomy | [ ] |
| 3 | 1 — Core Pipeline | Upload → effects → preview → export, first effects batch | [ ] |
| 4 | 2A — Parameter UX | Ghost Handle, rotary knobs, non-linear scaling | [ ] |
| 5 | 2B — Audio Sprint | PyAV decode, PortAudio, decoupled A/V clock | [ ] |
| 6 | 3 — Color Suite | Levels, Curves, HSL, Color Balance, Histogram | [x] CONDITIONAL |
| 7 | 4 — Timeline + Tracks | Multi-track, undo, history panel | [x] CONDITIONAL |
| 8 | 5 — Performance | Pad grid, ADSR envelopes, choke groups | [x] CONDITIONAL |
| 9 | 6A — Operators + Modulation | LFO, sidechain, DAG routing | [x] CONDITIONAL |
| 10 | 6B — Video Analyzer | Fusion, ghost handles, mod matrix | [x] PASS |
| 11 | 7 — Automation | Keyframes, Touch/Latch/Write, RDP decimation | [x] CONDITIONAL |
| 12 | 8 — Effects Expansion | 102 new effects (57 ports + 45 R&D) | [x] CONDITIONAL |
| 13 | 9 — MIDI | Notes, CC, Learn, Retro-Capture, settings | [x] CONDITIONAL |
| 14 | 10 — Freeze/Presets | Prefix-Chain Freeze, preset browser, taxonomy UI | [x] CONDITIONAL |
| 15 | 11.5 — Toast + Layout | Toast notifications, layout persistence, IPC trace | [x] PASS |

---

## Per-Phase Checklist

For each phase, run these 4 gates:

- [ ] `/quality` — domain-level gate (test coverage, correctness, state errors)
- [ ] `/qa-redteam` — security audit, attack surface, edge cases
- [ ] `/review` — multi-agent code review (architecture, patterns, performance, simplicity)
- [ ] UAT check — run automatable UAT items from existing plans; generate manual UAT checklist for user

### Finding Severity

| Level | Meaning | Action |
|-------|---------|--------|
| P0 | Crash, data loss, security vuln | Must fix before Phase 11 |
| P1 | Broken feature, wrong behavior | Should fix before Phase 11 |
| P2 | UX issue, minor bug | Fix during Phase 11 polish |
| P3 | Nice to have, style nit | Backlog |

---

## Findings Log

### Phase 0A — Skeleton
- Quality: **CONDITIONAL** — P1: listener leak (onEngineStatus), startup race (window close vs spawn), watchdog restart race. P2: execSync blocks main, appendFileSync blocking, missing util tests. P3: token regex fragile.
- Red Team: **PASS** — No Real Tigers. Hidden: add ALLOWED_COMMANDS allowlist to zmq-relay.ts, file:list pattern filter naive, PII stripping order-of-ops. Strong: contextIsolation+sandbox+CSP+auth tokens all correct.
- Review: **CONDITIONAL**
  - **Security-Sentinel:** No P0/P1. P2: (1) No command allowlist in zmq-relay IPC relay, (2) TOCTOU race in validate_upload symlink check. P3: token not redacted in TS logger, CSP allows unsafe-inline styles, grantPath/clearGrantedPaths exported without env guard.
  - **Architecture-Strategist:** H1: watchdog restart vs in-flight relay command race. H2: No restart backoff/limit (infinite crash loop). H3: SIGTERM without SIGKILL fallback (orphan Python). M1: circular dep watchdog↔zmq-relay. M2: persistent socket state inconsistency. M3: onEngineStatus listener leak. M4: file:read always UTF-8. M5: window-all-closed no ordering guarantees. M6: duplicate PII stripping in 3 files. L1-L6: execSync, dual dialog APIs, logger rotate on every write, stdout buffer leak, export poll not stopped on restart, support bundle Desktop-only.
- UAT: Manual-only (UAT-UIT-GUIDE Section 1, tests 1-9). Gap: no test for "close window immediately after launch."

### Phase 0B — Pipeline Validation
- Quality: **PASS** — P2: registry silent overwrite, SharedMemoryWriter double-close, _effect_timing thread safety. Architecture solid: container pattern, auto-disable, timing stats, NaN sanitization.
- Red Team: **PASS** — No Real Tigers. Hidden: video bomb via uncapped resolution in probe(), predictable shared memory path (race condition). Strong: timeout guard, auto-disable, Sentry fingerprinting.
- Review: **CONDITIONAL**
  - **Architecture-Strategist:** C1: `_effect_timing` dict not thread-safe (preview + export threads concurrent). C2: SharedMemoryWriter no idempotent close, constructor leaks fd on failure. C3: Timeout guard is post-hoc measurement, NOT preemptive — hung effects still block ZMQ server. H1: VideoReader leaks container on __init__ failure. H2: VideoReader.duration crashes on None duration (some MKV files). H3: Export auto-disabling effect silently disappears from preview. M1-M7: probe() missing PermissionError, encode_mjpeg no input validation, apply_chain abort discards ALL prior chain work, write_frame quality param dead code, _decode_with_seek may overshoot by 1 frame, validate_upload case-sensitive on case-insensitive FS, no mask shape validation.
- UAT: Covered by test_integration.py, test_ux_paths.py, test_effect_harness.py (automated). No manual UAT gaps.

### Phase 1 — Core Pipeline
- Quality: **CONDITIONAL** — P1: project_seed uses Date.now() (not deterministic per spec). P2: App.tsx 1285-line monolith, recursive render retry no guard, 5 unused vars.
- Red Team: **PASS** — No Real Tigers. Hidden: non-deterministic seed, base64 frame over IPC bandwidth.
- Review: Covered by 0A architecture review (shared codebase).
- UAT: UAT-UIT-GUIDE Sections 2-5 (import, effects, preview, export). Manual.

### Phase 2A — Parameter UX
- Quality: **PASS** — paramScaling.ts thoroughly tested (round-trip for all 4 curves). ParamSlider clamps properly.
- Red Team: **PASS** — No attack surface (pure UI math).
- Review: Clean. No issues.
- UAT: UAT-UIT-GUIDE param interactions. Manual.

### Phase 2B — Audio Sprint
- Quality: **CONDITIONAL** — P1: audio callback reads shared state without lock (ARM memory ordering risk). P2: decode_audio loads full audio into RAM (660MB for 30min), stop() doesn't drain callback.
- Red Team: **PASS** — No external attack surface. Hidden: memory exhaustion on long audio.
- Review: Architecture is sound (audio master/video slave AVClock pattern).
- UAT: UAT-UIT-GUIDE Section 6 (audio playback). Manual.

### Phase 3 — Color Suite
- Quality: **CONDITIONAL** — Util effects solid. Fx effects have gaps. 3 agents (quality, security, architecture) confirmed findings.
  - **P1**: `color_filter.py:49-66` — Cool/warm presets apply `intensity` twice (in branch AND final blend). Sepia correctly applies only in blend. Fix: remove intensity from per-branch multipliers.
  - **P1**: `hsl_adjust.py:209` — `sat_factor` can go negative with out-of-spec saturation. No clamping before computation. Fix: add `saturation = max(-100, min(100, saturation))`.
  - **P1**: NaN string bypass in all 5 fx effects — Container filters float NaN but not `"NaN"` strings. `float("NaN")` passes `max()/min()` clamping, producing all-NaN frames. Fix: add `math.isfinite()` guards (matching util pattern).
  - **P1 (arch)**: `false_color.py` and `histogram_eq.py` hard-import cv2 at module level. If cv2 missing, entire effect registry crashes (all 170+ effects unavailable). `hsl_adjust.py` correctly uses try/except.
  - P2: `color_temperature.py` — Default is 30.0 (non-identity). Adding effect immediately warms image. No identity shortcut.
  - P2: Missing empty frame guard in all 5 fx effects (color_filter, color_invert, color_temperature, false_color, histogram_eq).
  - P2: `histogram_eq.py:41-45` — Blend operates on all 4 channels (alpha blend fragile, correct by accident).
  - P2: `levels.py:121-128` — Identity check uses exact float `gamma == 1.0`. Slider accumulation could fail check.
  - P3: `false_color.py:69` — Uses `np.mean` for grayscale instead of BT.601 luma weights.
  - P3: Category taxonomy inconsistent. P3: No dedicated unit tests for 5 fx effects. P3: Duplicate CHANNEL_MAP across 3 files.
- Red Team: **CONDITIONAL** — No Real Tigers (no eval/exec/injection). But NaN string bypass is systemic (P1). cv2 hard imports are SPOF (P1). Hidden: curves.py unbounded control points (mitigated by timeout guard).
- Review: **CONDITIONAL** — Effect contract compliant. H1: LUT rebuilt every frame (no caching). H4: Inconsistent alpha handling. M2: preserve_luma ratio spike for near-black pixels. M3: scipy import inside hot path.
- UAT: UAT-UIT-GUIDE Section 7. Automated: test_uat_phase3_color_suite.py (200+ tests). Manual: visual accuracy, chain composability, histogram display.

### Phase 4 — Timeline + Tracks
- Quality: **CONDITIONAL** — 4 P1s found by quality agent.
  - **P1**: `splitClip` (timeline.ts:277) doesn't call `recalcDuration(tracks)` — duration goes stale after split. All other clip mutations recalc.
  - **P1**: `handleResizeUp` (Timeline.tsx:46-51) — closure captures stale `height` from start of drag, re-sets layout store to pre-drag value on pointer-up. Undoes the resize.
  - **P1**: `execute()` (undo.ts:25) calls `entry.forward()` inside `set()` — side effect in Zustand updater. Concurrent mode can double-fire forward().
  - **P1**: `trimClipOut` (timeline.ts:230-236) — duration formula `newOutPoint - c.inPoint` is wrong for speed≠1. Should be `(newOutPoint - c.inPoint) / c.speed`. No test for speed≠1 trim.
  - P2: HistoryPanel key collision, Clip trim listener leak, tight-loop undo flicker, splitClip drops future fields, compositor no resolution validation — all confirmed by agents.
  - P2: `moveClip` allows negative position (store has no clamp, only UI does). `setPlayheadTime`/`setDuration` accept negatives.
  - P3: `moveClip` to non-existent trackId silently loses the clip. Compositor no resolution/opacity validation.
- Red Team: **CONDITIONAL** — Security agent found:
  - **P1**: No track count limit — unbounded `addTrack()` → UI freeze, OOM.
  - **P1**: No clip count limit per track — combined with splitClip, exponential growth possible.
  - **P1**: No compositor layer count limit — each layer is 8MB at 1080p. 100 layers = 800MB → Python OOM.
  - P2: No marker count limit. Negative position/time values accepted.
- Review: **CONDITIONAL** — Architecture agent found:
  - **CRITICAL (C1)**: **No undo integration for ANY of 18 timeline actions.** Every other store (operators, performance, automation) routes through `useUndoStore.execute()`. The timeline store — the most destructive surface in a DAW — has zero undo. User who accidentally splits/deletes a clip has NO recourse.
  - **HIGH (H1)**: splitClip clipB manually enumerates fields — future fields silently dropped.
  - **HIGH (H2)**: Compositor no resolution matching — crash on mismatched media sizes.
  - **HIGH (H3)**: HistoryPanel N-step jump should be a batch `jumpTo()` action on undo store.
- UAT: UAT-UIT-GUIDE Section 8. Manual: multi-track compositing, clip drag, trim, split, undo/redo jumps.

### Phase 5 — Performance
- Quality: **CONDITIONAL** — ADSR state machine is solid. 3 agents confirmed + found new issues.
  - **P0→P1**: `getEnvelopeValues` (performance.ts:379-387) — calls `set()` inside getter. All 3 agents flagged this. Quality agent confirmed: not infinite loop (one-shot per phase transition), but architecturally unsound. Multi-pad transitions overwrite each other (only last `set()` survives). Fix: split into pure read + separate `advancePadPhases()` action.
  - **P1**: `loadDrumRack` (performance.ts:353-363) — doesn't clear undo history. Old undo entries reference stale pad indices from previous rack. Quality agent confirmed.
  - **P1**: `PadGrid` (PadGrid.tsx:25-26) — hardcodes `frameIndex: 0` for mouse triggers. ADSR computes `elapsed = currentFrame - 0`, blowing past attack/decay instantly. Keyboard/MIDI paths correctly pass real frame index.
  - **P1**: Undo closures capture `padIndex` (integer) not `padId` — confirmed by all 3 agents. 5 actions affected.
  - P2: `loadDrumRack` missing field-level validation — crash on malformed project file (security agent).
  - P2: `PadCell` opacity reads stale `currentValue` — pads appear wrong during sustain (quality agent).
  - P2: `applyPadModulations` no fallback clamp when effectRegistry absent — unbounded values sent to backend.
  - P2: `handlePadTrigger` toggle race — rapid keydown reads stale snapshot.
  - P3: `PadEditor` uses `key={idx}` on mappings — React mis-diffs after removal. `PerformancePanel` hardcodes `fps=30`.
- Red Team: **PASS** — Security agent: 0 P0/P1. XSS confirmed safe. ADSR NaN fully guarded. structuredClone fallback correct (with caveat: returns mutable ref). P2: loadDrumRack needs validation. P3: choke group accepts unbounded numbers, updatePad allows id override.
- Review: **CONDITIONAL** — Architecture agent confirmed CQS violation in getEnvelopeValues. Layer ordering violation (store imports from components). structuredClone per frame in hot path — should use targeted shallow copy.
- UAT: UAT-UIT-GUIDE Section 9. Manual: pad trigger, choke groups, ADSR visual, MIDI learn, retro-capture.

### Phase 6A — Operators + Modulation
- Quality: **CONDITIONAL** — Signal engine architecture is clean (6 operator types, processing chain, routing with cycle detection). All operators clamp output to 0.0-1.0 with NaN guards.
  - P2: `routing.py:24` — `copy.deepcopy(chain)` on every frame for modulation application. For chains with 10+ effects, this creates significant GC pressure at 30fps. Should use shallow clone + selective param copy.
  - P2: `engine.py:137` — Broad `except Exception` swallows all operator errors. Failed operators silently produce 0.0. No telemetry or user notification. A broken operator config causes modulation to vanish without explanation.
  - P2: `processor.py:53-59` — `_smooth` function depends on `_prev` state parameter, but `_prev` isn't persisted between frames (it's read from `params`, not from operator state). Smooth/slew rate limiting is effectively broken — it smooths within a single call but has no memory across frames.
  - P2: `routing.py:110-126` — `min` and `max` blend modes add their result to the accumulator: `result += min(values)`. If a param has both "add" and "min" contributions, the min result is added, which is semantically odd (min should constrain, not add).
  - P2: `video_analyzer.py:200` — Stores full 64x64x3 proxy copy in state every frame (12KB/frame). At 30fps that's 360KB/sec of state churn per video analyzer operator.
  - P2: `audio_follower.py:106` — Stores spectrum as Python list (for JSON serialization) then reconverts to numpy array every frame. Could store as bytes or use a more efficient format.
  - P3: `lfo.py:56,62` — `hashlib.md5` per frame for noise/random waveforms. At 60fps that's 60 MD5 calls/sec/LFO. Functional but a faster PRNG (numpy or xorshift) would be better.
  - P3: `operators.ts:60` — Module-level `nextOpId` counter not persisted. IDs like `op-${Date.now()}-${nextOpId++}` are unique in practice (Date.now component) but the counter resets on HMR.
  - P3: `engine.py:165` — Imports private function `_get_param_bounds` inside method body. Should import at module level.
- Red Team: **PASS** — No Real Tigers. DAG cycle detection prevents routing loops. Operator cap at 16. All signal values clamped to 0.0-1.0. No user-controlled string interpolation or eval. MD5 usage is for deterministic pseudo-random, not security.
  - Hidden: Fusion operator references other operators by ID. If a user crafts a fusion with a self-reference (source=own ID), it reads from `operator_values` which won't contain own value yet (evaluated in order) — returns 0.0. Not a crash, but confusing behavior. Consider: add self-reference guard.
- Review: **CONDITIONAL**
  - Architecture: Clean separation of evaluation (engine.py) → routing (routing.py) → processing (processor.py). DAG cycle check is BFS-based and correct. Operator types are extensible.
  - H1: `_smooth` broken across frames (no persistent state).
  - H2: `deepcopy` per frame is a performance concern for real-time preview.
  - M1: Automation overrides in `apply_modulation` import private function from routing module — coupling concern.
  - M2: `evaluate_all` processes operators in list order. Fusion operator reads from `values` dict which only contains already-evaluated operators. Operator evaluation order matters but isn't documented or enforced.
- UAT: UAT-UIT-GUIDE Sections 10-11 (operators, modulation). Manual: LFO waveform visual, modulation matrix add/remove, fusion blend modes, sidechain effects.

### Phase 6B — Video Analyzer UI
- Quality: **PASS** — Frontend UI for operators (ModulationMatrix, RoutingLines, 6 operator editors, OperatorRack). These are presentation components consuming the signal engine reviewed in 6A. Operator store already audited.
- Red Team: **PASS** — No additional attack surface beyond 6A. UI components render operator data, no user input parsing.
- Review: **PASS** — Clean component decomposition. Each operator type has dedicated editor. ModulationMatrix and RoutingLines are SVG-based visualization.
- UAT: UAT-UIT-GUIDE Sections 10-11. Manual: visual routing lines, mod matrix drag-to-connect, operator enable/disable toggle.

### Phase 7 — Automation
- Quality: **CONDITIONAL** — Automation store is well-structured, undo-integrated, with O(log n) binary search evaluation and RDP simplification. Good separation of concerns (store, evaluate, simplify, record).
  - P2: `automation.ts:57` — Module-level `nextLaneId` counter resets on HMR (same pattern as operators.ts).
  - P2: `automation.ts:59-70` — `insertPointSorted` is O(n) per insert. During Touch/Latch recording at 30fps for 60s (1800 points), this creates O(n^2) behavior. Should use binary search insertion.
  - P2: Paste operation (`pasteAtPlayhead`) doesn't check for overlapping points at same time values. Duplicate time entries could cause evaluation ambiguity.
  - P3: `automation-evaluate.ts:48` — Uses `a.curve` for easing without validating it's finite. NaN curve would produce NaN eased values.
- Red Team: **PASS** — No external attack surface. All automation is frontend state. Backend receives resolved parameter values, not raw automation data.
- Review: **PASS** — Architecture is clean. Automation lanes keyed by trackId, points always sorted by time. RDP simplification is correct implementation. Binary search evaluation is O(log n). Easing function handles curve=0 fast path.
- UAT: UAT-UIT-GUIDE Section 12. Manual: draw mode, Touch/Latch recording, simplify, copy/paste region, arm/disarm.

### Phase 8 — Effects Expansion
- Quality: **CONDITIONAL** — Sample review of 3/102 effects (datamosh, pixelsort, reaction_diffusion). Core effect contract followed. Stateful effects properly use state_in/state_out. Stateless effects return None.
  - **P1 (systemic)**: NaN string bypass affects ~102 new effects. Most fx effects use `max()/min()` clamping without `math.isfinite()` guard. Same vulnerability as Phase 3 fx effects.
  - P2: `datamosh.py` stores 3 full-resolution arrays in state (prev_frame + displacement_field + reference_frame). At 1080p: ~24MB state per datamosh instance. Multiple datamosh effects in chain = OOM risk.
  - P2: `reaction_diffusion.py` — `steps_per_frame=20` runs 20 `convolve2d` calls at 1080p per frame. Combined with pipeline timeout guard, this may auto-disable at high resolutions.
  - P2: `datamosh.py` — Hard cv2 import (same SPOF as false_color/histogram_eq). optical flow computation is heavy (~50ms at 720p).
  - P3: Inconsistent NaN handling — pixelsort.py uses `max()/min()` only. datamosh.py uses `max()/min()`. None of the sampled effects use `math.isfinite()`.
- Red Team: **CONDITIONAL** — NaN string bypass is systemic across 102 effects (P1). No injection vectors. Compute-heavy effects (reaction_diffusion, datamosh, strange_attractor) are mitigated by pipeline timeout guard.
- Review: **CONDITIONAL** — Effect contract compliance is good. Category taxonomy continues to diverge (destruction, glitch, emergent, etc. — no enum validation). Shared utilities (`effects/shared/displacement.py`) are well-factored.
- UAT: Sample-based. Full UAT impractical for 102 effects. Automated: per-effect tests in test_effects/test_fx/. Manual: visually verify 5-10 representative effects.

### Phase 9 — MIDI
- Quality: **CONDITIONAL** — MIDI store is well-structured. Proper MIDI message parsing (status byte + channel filter). Learn mode with note steal. CC routing with normalized 0-1 values. Thorough validation in loadMIDIMappings.
  - P2: `midi.ts:86-96` — Learn mode calls `perfStore.updatePad()` which goes through undo system. Learning a MIDI note is an undoable action, which may confuse users (Ctrl+Z silently unassigns MIDI mapping).
  - P2: Already identified: 3 TypeScript errors in test files (tsconfig.node.json missing patterns for applyCCModulations, resolveGhostValues, MIDIDevice mock).
  - P3: `midi.ts:125-127` — One-shot mode pads get released on note-off, but one-shot semantics typically mean "trigger once, ignore release." This is handled in handlePadTrigger but the MIDI handler also sends release for one-shot pads.
- Red Team: **PASS** — No external attack surface. Web MIDI API is renderer-only. MIDI data is Uint8Array (binary), no parsing vulnerabilities. CC values clamped to 0-127 / normalized to 0-1. loadMIDIMappings validates all input fields.
- Review: **PASS** — Clean separation between MIDI input handling and performance store. handleMIDIMessage correctly dispatches note-on/off/CC. Learn mode consumes messages (returns early), preventing normal routing during learn.
- UAT: UAT-UIT-GUIDE Section 13. Manual: MIDI learn, CC mapping, channel filter, pad trigger via MIDI, note steal.

### Phase 10 — Freeze/Presets
- Quality: **CONDITIONAL** — Freeze store has proper operation state machine (idle/freezing/unfreezing/flattening). Library store has generation counter race guard. Backend FreezeManager is thread-safe.
  - P2: `library.ts:102` — Preset filename is `${preset.id}${PRESET_EXT}`. No validation that preset.id is a safe filename. Path traversal characters in preset.id (e.g., `../../`) could write outside preset directory.
  - P2: `freeze.py:91-98` — Freeze renders all frames synchronously on the ZMQ server thread. For 1800 frames (1min@30fps), this blocks the entire sidecar for minutes. No progress feedback to frontend. App appears frozen.
  - P2: `freeze.py:145` — `shutil.rmtree(ignore_errors=True)` silently ignores permission errors. Cache metadata deleted but files remain (disk leak).
  - P2: Already identified: 2 TypeScript errors in test files (tsconfig.node.json missing freeze.ts, library.ts).
  - P3: `library.ts:71` — `JSON.parse(content)` on preset files. Malformed JSON silently skipped (correct), but no size limit on file read. A 1GB file named .glitchpreset would be read entirely into memory.
- Red Team: **CONDITIONAL** — P2: Preset ID path traversal risk (library.ts:102). Freeze blocking ZMQ is a DoS concern (intentional user action, not external). Cache hash uses sha256 (good). Backend thread-safe.
- Review: **CONDITIONAL**
  - Architecture: FreezeManager idempotency via chain hash is smart. Generation counter in library.ts prevents stale load races. Freeze store operation guard prevents concurrent ops.
  - H1: Synchronous freeze blocks ZMQ — should spawn a thread or use async rendering.
  - M1: No preset ID sanitization.
- UAT: UAT-UIT-GUIDE Section 14. Manual: freeze/unfreeze/flatten cycle, preset save/load/delete/favorite, preset search/filter.

### Phase 11.5 — Toast + Layout (new)
- Quality: **PASS** — Toast store has clean rate limiting (2s dedup by source), auto-dismiss by level, max 5 visible with overflow eviction. Layout store has proper localStorage persistence with field-level validation.
  - P3: `toast.ts:75` — `setTimeout` auto-dismiss closure holds toast ID. If `clearAll()` fires before timeout, the dismissToast call is a harmless no-op (filter finds nothing). Not a bug.
  - P3: `layout.ts:57` — `persistLayout({ ...get(), sidebarCollapsed: next })` spreads entire state including functions into JSON.stringify. Functions stripped by JSON but wasteful. Should spread only 3 layout fields.
  - P3: `layout.ts:30` — Timeline height bounds (120-800) are only validated on load, not in `setTimelineHeight`. Timeline.tsx validates separately with `Math.max(120, ...)`. No single source of truth.
- Red Team: **PASS** — No attack surface. Toast messages rendered as React text nodes (XSS safe per CLAUDE.md convention). localStorage is same-origin only. No user-controlled paths.
- Review: **PASS** — Clean, minimal stores. Toast rate limiting prevents alert storms. Layout persistence is best-effort (try/catch on localStorage). Focus mode toggle is elegant (collapse both or expand both).
- UAT: Manual: toast notification display on engine events, dismiss, overflow eviction, layout persistence across reload, focus mode toggle, sidebar collapse, timeline resize.

---

## Cross-Phase Issues (discovered during audit)

### TypeScript Errors (LSP-detected, active in codebase)

| File | Error | Severity | Phase |
|------|-------|----------|-------|
| App.tsx:1208 | Property 'effectId' does not exist on preset save type | **P1** (TS error) | 10 |
| App.tsx:53 | 'Toast' imported but never read | P3 | 10 |
| App.tsx:162-170 | 5 unused variable declarations (renderSeqRef, sidebarCollapsed, etc.) | P2 | Mixed |
| cc-modulation.test.ts:2 | applyCCModulations.ts not in tsconfig.node.json file list | **P1** (TS error) | 9 |
| resolveGhostValues-cc.test.ts:2 | resolveGhostValues.ts not in tsconfig.node.json file list | **P1** (TS error) | 9 |
| midi-settings.test.ts:32 | Missing 'state' property in MIDIDevice mock | **P1** (TS error) | 9 |
| freeze-ui.test.ts:14 | freeze.ts not in tsconfig.node.json file list | **P1** (TS error) | 10 |
| preset-browser.test.ts:21 | library.ts not in tsconfig.node.json file list | **P1** (TS error) | 10 |

**Root cause for tsconfig errors:** New stores/components from Phases 9-10 not added to `tsconfig.node.json` include patterns. These files work at runtime (Vite resolves them) but fail strict TS project checking.

### NaN String Bypass in EffectContainer (Systemic — Phase 3+)

`container.py:53-57` strips `float` NaN/Inf from params, but NOT string representations (`"NaN"`, `"inf"`). If frontend sends `"NaN"` as a string param, `float("NaN")` passes through `max()/min()` clamping (NaN comparisons return False in Python), producing all-NaN frames → silent black output.

**Scope (CONFIRMED):** **100 out of 129 fx effects** use the vulnerable `max(min(float(params.get(...))))` pattern — **264 vulnerable param reads total** — with **zero** `math.isfinite()` guards. All 5 util effects with params correctly use `math.isfinite` (11 guarded reads). The fx effects pattern was never hardened.

**Fix (two layers):**
1. Per-effect: Add `math.isfinite()` guard to every fx effect (matches util pattern)
2. Systemic: Harden container filter to also catch string NaN/Inf before passing to effects

### cv2 Hard Import SPOF (Phase 3)

`false_color.py` and `histogram_eq.py` do bare `import cv2` at module level. If cv2 is missing, the entire effect registry crashes — all 170+ effects become unavailable. `hsl_adjust.py` correctly uses `try/except ImportError`. Fix: add try/except with pure-numpy fallbacks or graceful skip.

### Undo Index-by-Value Pattern (Phases 4, 5, 6A)

All stores that integrate with undo (`performance.ts`, `operators.ts`) capture array **index** in undo closures rather than item **ID**. If the array is reordered between execute and undo, the closure operates on the wrong item. Affects:
- `performance.ts` — updatePad, addPadMapping, removePadMapping, setChokeGroup, setPadKeyBinding
- `operators.ts` — removeOperator, updateOperator, setOperatorEnabled, addMapping, removeMapping, updateMapping

**Fix:** Closures should capture `itemId`, then re-find the index via `findIndex(x => x.id === itemId)` at undo time.

### Smooth/Slew Processor Broken (Phase 6A)

`processor.py:_smooth()` reads `_prev` from `params` dict, but `params` is the static operator config — it never receives the previous frame's signal value. Smooth processing is effectively a no-op across frames (single-call smoothing only). The `state` dict should carry `_prev` across calls, but `process_signal()` doesn't accept/return state.

### getEnvelopeValues Side-Effect (Phase 5)

`performance.ts:getEnvelopeValues()` calls `set()` to update pad phase transitions, making it a write operation disguised as a getter. Any React component that subscribes to `padStates` and calls this method during render risks an infinite re-render loop.

---

## UAT Gaps (needs manual testing by user)

### Phase 0A
- [ ] Close window immediately after launch (before sidecar ready) — test for orphan process
- [ ] UAT-UIT-GUIDE Section 1, tests 1-9 (app launch, engine connection, watchdog recovery)

### Phase 3 — Color Suite
- [ ] UAT-UIT-GUIDE Section 7 (color effects) — visual accuracy in preview
- [ ] Chain 3+ color effects and verify composability (no color banding, clipping)
- [ ] Test histogram display updates in real-time during color adjustments

### Phase 4 — Timeline + Tracks
- [ ] UAT-UIT-GUIDE Section 8 (timeline operations)
- [ ] Rapid undo/redo (50+ steps) — check for flicker/freeze
- [ ] Split clip while clip is playing — verify playback continuity
- [ ] Drag clip between tracks while another operation is undone
- [ ] Multi-track compositing: stack 3+ tracks with blend modes, verify visual output

### Phase 5 — Performance
- [ ] UAT-UIT-GUIDE Section 9 (performance mode)
- [ ] Rapid pad triggering (keyboard mashing) — check for stuck pads
- [ ] Choke group: trigger pad A, immediately trigger pad B in same group — verify A stops
- [ ] Toggle mode: trigger/toggle/one-shot all behave correctly
- [ ] Leave perform mode and verify all pads are silenced (panic)

### Phase 6A — Operators + Modulation
- [ ] UAT-UIT-GUIDE Sections 10-11 (operators, modulation)
- [ ] Add LFO → verify sine wave modulates target param in real-time
- [ ] Add Fusion operator referencing 2 LFOs — verify weighted average
- [ ] Disable operator → verify modulation stops, param returns to base value
- [ ] Test DAG cycle rejection: try to route operator A → B → A

### Phase 7 — Automation
- [ ] UAT-UIT-GUIDE Section 12 (automation)
- [ ] Draw mode: click to add points, drag to move, verify curve rendering
- [ ] Touch/Latch recording at 30fps for 30+ seconds — check for UI lag
- [ ] Simplify lane → verify shape preserved, point count reduced
- [ ] Copy/paste automation region across tracks

### Phase 8 — Effects Expansion
- [ ] Sample 5-10 effects: add to chain, adjust params, verify visual output
- [ ] Chain 3+ stateful effects (datamosh + reaction_diffusion + temporal_blend) — check state preservation
- [ ] Test auto-disable: create an effect that times out repeatedly → verify it gets disabled

### Phase 9 — MIDI
- [ ] Connect MIDI controller, verify device appears in MIDISettings
- [ ] MIDI Learn: assign note to pad, assign CC to param
- [ ] Channel filter: filter to channel 1, verify messages on channel 2 ignored
- [ ] Rapid MIDI note-on/off → verify no stuck pads

### Phase 10 — Freeze/Presets
- [ ] Freeze a chain prefix → verify frozen effects skip recomputation
- [ ] Unfreeze → verify effects recompute live
- [ ] Save preset → verify file appears in preset directory
- [ ] Load preset → verify chain is restored
- [ ] Delete preset → verify file removed and preset disappears from browser

### Phase 11.5 — Toast + Layout
- [ ] Trigger engine disconnect → verify toast appears with warning level
- [ ] Verify toasts auto-dismiss (info 4s, warning 6s, error 8s)
- [ ] Toggle sidebar (Cmd+B), reload → verify collapsed state persists
- [ ] Resize timeline, reload → verify height persists
- [ ] Focus mode (F key) → verify both panels collapse/expand

---

## FINAL AUDIT SUMMARY

### Completion: 15/15 phases audited

| Phase | Verdict |
|-------|---------|
| 0A Skeleton | CONDITIONAL |
| 0B Pipeline | CONDITIONAL |
| 1 Core Pipeline | CONDITIONAL |
| 2A Parameter UX | PASS |
| 2B Audio Sprint | CONDITIONAL |
| 3 Color Suite | CONDITIONAL |
| 4 Timeline+Tracks | CONDITIONAL |
| 5 Performance | CONDITIONAL |
| 6A Operators+Mod | CONDITIONAL |
| 6B Video Analyzer | PASS |
| 7 Automation | CONDITIONAL |
| 8 Effects Expansion | CONDITIONAL |
| 9 MIDI | CONDITIONAL |
| 10 Freeze/Presets | CONDITIONAL |
| 11.5 Toast+Layout | PASS |

**2 PASS / 13 CONDITIONAL / 0 FAIL** (6B downgraded from PASS, 11.5 downgraded from PASS after agent review)

**Audit methodology:** 19 specialized agents (quality-reviewer, security-sentinel, architecture-strategist) across all phases. Each agent read the actual source files and produced independent findings. Total agent compute: ~1.6M tokens, ~25 minutes wall clock.

### AGENT-VERIFIED Prioritized Fix List

**CRITICAL — Must fix before Phase 11:**

| # | Issue | Phase | Found By | Fix |
|---|-------|-------|----------|-----|
| 1 | **NO UNDO for 18 timeline actions** — split, trim, delete, move clips all irreversible | 4 | arch-agent | Wire all timeline mutations through undo store (established pattern exists) |
| 2 | **NaN string bypass** — 100/129 fx effects, 264 params, 0 guards | 3,8 | sec-agent | Harden container.py NaN filter (1 file systemic fix) |
| 3 | **cv2 hard import SPOF** — 38/129 effects crash entire registry if cv2 missing | 3,8 | sec+arch agents | Add try/except at module level or document as hard dep |
| 4 | **getEnvelopeValues set() in getter** — CQS violation, multi-pad overwrite | 5 | all 3 agents | Split into pure read + advancePadPhases() action |
| 5 | **No resource limits** — unbounded tracks, clips, markers, layers, operators, automation points | 4,6B,7 | sec-agents | Add MAX_TRACKS, MAX_CLIPS, MAX_OPERATORS, MAX_POINTS_PER_LANE |
| 6 | **Smooth processor broken** — no cross-frame state, feature is no-op | 6A | quality+arch | Thread state through process_signal() |
| 7 | **PadGrid hardcodes frameIndex:0** — ADSR wrong for mouse triggers | 5 | quality+arch | Pass real frame index from engine store |
| 8 | **splitClip missing recalcDuration** — duration stale after split | 4 | quality-agent | Add recalcDuration to return |
| 9 | **trimClipOut wrong for speed≠1** — formula ignores speed | 4 | quality-agent | Divide by c.speed |
| 10 | **execute() calls forward() inside set()** — concurrent mode double-fire | 4 | quality-agent | Move forward() call before set() |
| 11 | **Undo closures capture index not ID** — 15+ actions across 4 stores | 4,5,6A,6B | all agents | findIndex by ID at execution time |
| 12 | **loadDrumRack doesn't clear undo** — stale undo corrupts new rack | 5 | quality-agent | Add useUndoStore.clear() |
| 13 | **Missing validate_upload on freeze asset_path** — defense-in-depth gap | 10 | sec-agent | Add validate_upload() call |
| 14 | **Orphan automation lanes on track delete** — stale overrides persist | 7 | sec-agent | Cross-store cleanup on removeTrack |
| 15 | **NaN/Inf points accepted in automation** — corrupts binary search | 7 | sec-agent | Add isValidPoint() gate |
| 16 | **5 TypeScript errors** — tsconfig.node.json missing Phase 9/10 files | 9,10 | session 1 | Add include patterns |
| 17 | **color_filter double-blend** — intensity applied twice for cool/warm | 3 | quality-agent | Remove intensity from branch |
| 18 | **hsl_adjust negative sat** — no clamping before computation | 3 | quality-agent | 1 line clamp |
| 19 | **MIDI setChannelFilter/addCCMapping no validation** | 9 | quality-agent | Match loadMIDIMappings validation |
| 20 | **generation_loss.py BytesIO leak** — memory leak in generation loop | 8 | quality-agent | Use context manager |

**HIGH — Should fix during Phase 11 polish:**

| # | Issue | Phase |
|---|-------|-------|
| 21 | Compositor no resolution matching — crash on mismatched media | 4 |
| 22 | Freeze blocks ZMQ synchronously — app unresponsive during freeze | 10 |
| 23 | deepcopy(chain) per frame — GC pressure at 30fps | 6A |
| 24 | curve field serialized but never consumed by backend (ghost feature) | 6A |
| 25 | Fusion evaluation order implicit — no topo sort | 6A |
| 26 | No point count limit per automation lane — OOM during recording | 7 |
| 27 | FusionEditor/LFOEditor key={i} — stale closure on removal | 6B |
| 28 | Audio follower onset stores unbounded spectrum in state | 6A |
| 29 | Paste creates duplicate/negative-time automation points | 7 |
| 30 | RDP negative epsilon → stack overflow | 7 |
| 31 | Toast timer leak on clearAll | 11.5 |
| 32 | setTimelineHeight unbounded at store level | 11.5 |
| 33 | handleResizeUp persists stale height | 4 |
| 34 | Shallow preset validation (nested fields) | 10 |
| 35 | No file size limit on preset read | 10 |
| 36 | useMIDI.ts Zustand subscription leak on hot-plug | 9 |
| 37 | loadDrumRack missing field validation | 5 |
| 38 | EnvelopeEditor trigger stuck on pointer cancel | 6B |
| 39 | isVisible coupled with automation evaluation bypass | 7 |
| 40 | Empty frame guard missing in all 129 fx effects | systemic |

**Recommended fix order:** Items 1-2 are the biggest impact. Item 1 (timeline undo) is the single most important finding — it's a DAW without undo on its most destructive surface. Item 2 (NaN filter) fixes 264 vulnerabilities with 1 file change.

---

## DEEP PATTERN SCAN — Codebase-Wide Systemic Issues

**Methodology:** 6 parallel scans (1 store audit agent, 4 domain agents, 15 targeted greps) covering 36 systemic patterns across ~300 files. All findings verified against actual source code with file:line references.

### Scan A: Store Architecture (15 stores audited)

**Undo/redo gaps — 29 user-facing destructive actions with NO undo:**
- `timeline.ts`: 18 actions (addTrack, removeTrack, reorderTrack, setTrackOpacity, setTrackBlendMode, toggleMute, toggleSolo, renameTrack, addClip, removeClip, moveClip, trimClipIn, trimClipOut, splitClip, setClipSpeed, addMarker, removeMarker, moveMarker + setLoopRegion, clearLoopRegion)
- `project.ts`: 8 actions (addAsset, removeAsset, addEffect, removeEffect, reorderEffect, updateParam, setMix, toggleEffect)
- `midi.ts`: 3 actions (addCCMapping, removeCCMapping, clearCCMappings)

**Index-based undo closures — 12 closures that will corrupt on reorder:**
- `operators.ts`: 7 (removeOperator, updateOperator, setOperatorEnabled, addMapping, removeMapping, updateMapping, reorderOperators)
- `performance.ts`: 5 (updatePad, addPadMapping, removePadMapping, setPadKeyBinding, setChokeGroup)

**Other store issues:**
- 1 CQS violation: `performance.ts:365` getEnvelopeValues calls set()
- 1 side-effect in set(): `undo.ts:25` forward() inside set() updater
- 2 ID-override risks: `operators.ts:113`, `performance.ts:168` — Partial<T> spread can overwrite .id
- 4 module-level counters: audio.ts:43, automation.ts:57, operators.ts:60, toast.ts:34
- 5 cross-store dependencies: automation→undo, operators→undo, performance→undo, midi→performance (inc. direct setState bypass), engine→toast

### Scan B: Backend IPC (zmq_server.py — 1148 lines)

**1 missing validate_upload:** `_handle_freeze_prefix` (line 927) — asset_path not validated

**10 unclamped IPC params:**
1. seek `time` (line 318) — no bounds
2. render_composite `frame_index` per layer (line 544) — no bounds
3. render_composite `opacity` per layer (line 545) — no clamp to [0,1]
4. audio_decode `start_s` (line 590) — no clamp
5. audio_decode `duration_s` (line 591) — no clamp
6. audio_seek `time` (line 706) — no clamp
7. audio_volume `volume` (line 722) — no clamp
8. clock_set_fps `fps` (line 775) — **no zero guard → division-by-zero downstream**
9. flatten `fps` (line 1003) — no clamp, no type check
10. render_composite `resolution` (line 520) — no min/max (could be [0,0])

**2 division-by-zero bugs:**
1. `_get_audio_pcm_for_frame` (line 865): `frame_index / fps` unguarded (fps=0 crashes)
2. `_handle_clock_set_fps` (line 775): accepts fps=0, poisoning all downstream audio calculations

**8 synchronous blocking handlers** (freeze_prefix and flatten are worst — minutes of blocking)

### Scan C: React Patterns (all components audited)

**Listener leak bugs (HIGH):**
- `Clip.tsx:80-81,104-105` — document listeners not cleaned up on unmount during trim
- `AutomationNode.tsx:75-76` — window listeners not cleaned up on unmount during drag

**Stale closure bugs (MEDIUM):**
- `Clip.tsx:70-74,95-98` — stale `zoom` captured in trim handler closure (zoom change during trim = wrong dt)
- `AutomationNode.tsx:57-65` — stale conversion functions during drag if zoom changes

**Pointer cleanup gaps:**
- `PadCell.tsx:37-38` — **missing onMouseLeave: pad stays triggered if mouse dragged off pad**
- `Clip.tsx`, `Knob.tsx`, `Slider.tsx`, `Timeline.tsx`, `Playhead.tsx` — all missing onPointerCancel
- `AutomationDraw.tsx` — missing touch events entirely

**key={index} on mutable lists (6 confirmed bugs):**
- `PadEditor.tsx:246` (mappings), `MIDISettings.tsx:74` (CC mappings), `FusionEditor.tsx:84` (sources), `PresetSaveDialog.tsx:135` (macros), `LFOEditor.tsx:93` (mappings), `ParamChoice.tsx:17` (choices)
- 2 acceptable (fixed-length): `MIDISettings.tsx:50` (channels), `StepSequencerEditor.tsx:46` (steps)

**Unvalidated select→store (10 instances):**
- FusionEditor:67 (blend_mode), VideoAnalyzerEditor:29 (method), LFOEditor:48 (waveform), AudioFollowerEditor:31 (method), PadEditor:263/283 (effectId/paramKey), MIDISettings:27 (deviceId), FusionEditor:112 (operatorId), ParamChoice:17 (choice value)
- 2 NaN injection: `PadEditor.tsx:166` (chokeGroup Number()), `MIDISettings.tsx:44` (channel Number())

**setTimeout without cleanup:** `ParamTooltip.tsx:29-32`, `FeedbackDialog.tsx:22-26`

### Scan D: Cross-System Integrity

**1 ghost field:** `curve` in OperatorMapping — serialized at `operators.ts:295`, never read by any Python file in backend/src/modulation/

**7 orphan reference paths on deletion:**
1. Track delete → automation lanes keyed by trackId survive
2. Track delete → freeze state keyed by trackId survives (cache never invalidated)
3. Effect remove → operator mappings targeting deleted effectId survive
4. Effect remove → automation lanes with deleted effectId in paramPath survive
5. Effect remove → CC mappings targeting deleted effectId survive
6. Operator delete → fusion source references to deleted operatorId survive
7. Drum rack load with new pad IDs → MIDI note assignments orphaned

### Scan E: Deserialization Safety

**5 crash-on-load paths (zero validation):**
1. `project-persistence.ts:136-138` — Assets hydrated with no field validation (missing `meta` → crash)
2. `project-persistence.ts:148-162` — Tracks/clips with no field validation (missing `clips` array → TypeError)
3. `operators.ts:274-276` — `loadOperators` does ZERO validation (missing `processing` → crash on serialize)
4. `automation.ts:449` — `loadAutomation` does ZERO validation (non-array `points` → crash in binary search)
5. `performance.ts:353-363` — `loadDrumRack` validates ADSR only (missing `mappings` → crash on iteration)

**2 sorted invariant violations:**
1. `automation.ts:449` — `loadAutomation` doesn't sort points → binary search returns wrong values
2. `automation.ts:328` — `setPoints` doesn't enforce sort → same issue

**Contrast: `midi.ts:loadMIDIMappings` is the ONLY properly validated loader** (type checks, bounds checks, array cap)

### Scan F: Hard Dependencies (Tier 1 greps)

**35 effects hard-import cv2** at module level — if cv2 missing, entire registry fails to load (all 170+ effects unavailable)
**4 effects hard-import scipy** (reaction_diffusion, cellular_automata, blur, dct_utils)

### Grand Total: Deep Scan Findings

| Category | Count | Highest Severity |
|----------|-------|-----------------|
| Undo/redo gaps | 29 actions | CRITICAL |
| Index-based undo closures | 12 closures | HIGH |
| Orphan references on delete | 7 paths | HIGH |
| Deserialization crashes | 5 load paths | HIGH |
| Unclamped IPC params | 10 params | HIGH |
| Division-by-zero | 2 bugs | HIGH |
| NaN string bypass | 264 params / 100 effects | HIGH |
| Listener leaks on unmount | 2 components | HIGH |
| key={index} on mutable lists | 6 components | MEDIUM |
| Stale closures during drag | 2 components | MEDIUM |
| Pointer cleanup gaps | 6 components | MEDIUM |
| Unvalidated select→store | 10 instances | MEDIUM |
| cv2/scipy hard imports (SPOF) | 39 files | MEDIUM |
| Ghost field (curve) | 1 field | MEDIUM |
| Sorted invariant violations | 2 paths | MEDIUM |
| Module-level counters | 4 stores | LOW |
| ID-override via spread | 2 stores | LOW |
| setTimeout without cleanup | 2 components | LOW |
| **TOTAL** | **~160 individual issues** | |

---

## GAP AUDIT — Previously Uncovered Areas

**Methodology:** 1 security-sentinel agent on main process + IPC + export + save path; targeted greps for error boundaries, deps, E2E coverage; manual analysis of save path.

### Main Process & Electron Security

**Overall posture: STRONG.** contextIsolation=true, nodeIntegration=false, sandbox=true, CSP present, navigation blocked, download blocked, ZMQ token auth, localhost-only binding, PII stripping on both sides, telemetry consent-gated.

**Findings:**

| # | Severity | Finding | File:Line |
|---|----------|---------|-----------|
| G1 | **HIGH** | **No atomic write on project save** — direct overwrite, crash during save = corrupted file, no recovery | project-persistence.ts:215, file-handlers.ts:128 |
| G2 | **HIGH** | **No IPC command allowlist** — zmq-relay.ts forwards ANY command from renderer to Python. Renderer can send `shutdown`, `flush_state`, or any future command. Token auto-injected. | zmq-relay.ts:140 |
| G3 | **MEDIUM** | **Symlink bypass of isPathAllowed** — resolve() doesn't follow symlinks. Symlink inside `~/.entropic/` pointing to `/etc/shadow` passes check. Python side checks symlinks, Electron side does not. | file-handlers.ts:27-66 |
| G4 | **MEDIUM** | **~/Documents/Entropic/ auto-allowed without dialog** — compromised renderer can read/write/delete anything in this tree silently | file-handlers.ts:44-48 |
| G5 | **MEDIUM** | **TOCTOU in validate_upload** — gap between is_symlink() check and file open. Theoretical in desktop context. | security.py:40-45 |
| G6 | **LOW** | **IPC serializer is 4-field mapper only** — no type validation on params values. Malformed .glitch file passes non-numeric params to effects → Python crash | ipc-serialize.ts:25-31 |
| G7 | **LOW** | **Export leaves partial file on cancel/error** — no os.unlink() cleanup in finally block | export.py:112-140 |
| G8 | **LOW** | **CSP allows unsafe-inline for styles** — known React tradeoff, not exploitable without separate HTML injection | index.ts:74 |

### Save Path Analysis

- `saveProject()` — direct overwrite via `writeFile`, no write-to-temp-then-rename
- `startAutosave()` — same non-atomic pattern. Also: if `projectPath` has no `/`, autosave goes to `/.autosave.glitch` (filesystem root)
- `newProject()` — no dirty check, silently discards unsaved work
- `loadProject()` — comment says "prompt if dirty" but code says `// deferred`

### Export Pipeline — GOOD NEWS

`ExportManager.start()` spawns a `daemon=True` thread — **confirmed NOT blocking ZMQ**. Export is the only long-running operation that's properly async. Freeze and flatten are not.

### NPM Dependency Audit

5 vulnerabilities:
- **HIGH:** `minimatch` ReDoS (via transitive dep)
- **HIGH:** `minimatch` (second instance)
- **MODERATE:** `yauzl` off-by-one (via extract-zip → electron)
- **MODERATE:** `extract-zip` (via yauzl)
- **MODERATE:** `electron` (via extract-zip)

Fix: `npm audit fix` for non-breaking, `npm audit fix --force` for all (would downgrade electron to 0.4.1 — NOT viable, need to wait for upstream fix or pin yauzl >=3.2.1).

### Python Dependencies — Clean

All current versions: numpy 2.4.2, opencv 4.13.0, scipy 1.17.0, pyzmq 27.1.0, pillow 11.3.0, sentry-sdk 2.53.0. No known CVEs at these versions.

### Error Boundaries — PRESENT

`SentryErrorBoundary` at App.tsx:63-91 wraps entire app. Catches errors, reports to Sentry, renders crash message. No white-screen on component throw.

### E2E Test Coverage

14 test files, ~141 test cases. **8 of 15 phases have zero E2E tests:**
- Missing: Phase 2A/2B, 3, 5, 6A/6B, 7, 8, 9, 10
- Covered: Phase 0A (launch/watchdog), 1 (core pipeline), 4 (timeline), 11.5 (observability)
- Regression suite: 4 files covering cross-phase concerns (chaos, security gates, UX contracts, edge cases)

---

## COMPLETE AUDIT STATISTICS

| Metric | Value |
|--------|-------|
| Phases audited | 15/15 |
| Specialized agents spawned | 25 (19 phase + 6 deep scan) |
| Grep scans executed | 23 |
| Files read by agents | ~300+ |
| Total agent tokens consumed | ~2.5M |
| Unique findings | **~170** |
| P0/Critical | 0 |
| P1/High (must-fix) | ~25 |
| P2/Medium (should-fix) | ~55 |
| P3/Low (backlog) | ~40 |
| Systemic patterns | ~50 |
| Tests passing | 11,346 (10,455 backend + 891 frontend) |
| E2E gap phases | 8/15 |

### THE TOP 10 — If You Fix Nothing Else, Fix These

| # | Issue | Impact | Effort |
|---|-------|--------|--------|
| 1 | **No undo/redo for 29 actions** (timeline + project + MIDI) | Users can't undo clip/track/effect operations | Large |
| 2 | **No atomic write on save** | Crash during save = corrupted project, total data loss | Small (write-to-temp-then-rename) |
| 3 | **NaN string bypass in 100/129 effects** (264 params) | Silent black frames from string "NaN" params | Small (1 file container.py) |
| 4 | **No IPC command allowlist** | Compromised renderer can shutdown sidecar | Small (add Set in zmq-relay.ts) |
| 5 | **7 orphan reference paths on delete** | Delete track/effect → leaked automation, freeze, operator data | Medium (cross-store cleanup) |
| 6 | **5 crash-on-load paths** (zero validation) | Malformed .glitch file crashes app on open | Medium (add validation) |
| 7 | **fps=0 division-by-zero** | clock_set_fps(0) poisons all audio calculations | Small (1 line guard) |
| 8 | **12 index-based undo closures** | Undo after reorder corrupts wrong item | Medium (change to ID lookup) |
| 9 | **Symlink bypass of isPathAllowed** | Read/write files outside sandbox via symlink | Small (add lstat check) |
| 10 | **Smooth processor broken** | Slew rate feature is a no-op | Medium (thread state through processor) |
