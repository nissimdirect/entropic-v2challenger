---
title: Phase 5a work packets — Instruments (B2 voice spine → B3 full sampler → B4 sample rack → B5 grouping)
created: 2026-06-11
status: packets — ready for one-shot execution
sources: layout-session/INSTRUMENTS-BUILD-PLAN.md (B2–B5) · layout-session/INSTRUMENTS.md §5/§10 · plans/entropic-B2-performance-track-sampler-2026-06-05.md (B2-lite, PR #167)
ground_truth_verified_at: origin/main d821ae8 (2026-06-11); PR #167 OPEN at d0ca10e (feat/b2-performance-track)
repo: ~/Development/entropic-v2challenger (nissimdirect/entropic-v2challenger)
---

# Phase 5a — Instrument build packets (P5a.1 – P5a.15)

> **Packet contract:** every packet is one-shottable in ≤4h, bases on `origin/main`, and STOPS
> if any PRECONDITION grep mismatches (the codebase moved — re-verify before writing code).
> Every packet carries **Est** and **Model** lines — **Sonnet** by default; **RISK:HIGH packets
> run on Opus/Fable** (safety protocol: high-blast-radius work gets the stronger model).
> Universal OUT-gates (all packets): tests green at the right layer; every numeric crossing IPC
> clamped + finite-guarded; no backend cap left as a frontend-only convention; determinism gates
> run the EXPORT path, never the live preview path.

## Ground truth this file was verified against (2026-06-11)

| Fact | Where (origin/main) |
|---|---|
| B1 sampler shipped (PRs #153/#155): types, pure voice math, layer builder, store, device UI | `frontend/src/renderer/components/instruments/{types.ts, computeSamplerVoice.ts, buildSamplerLayer.ts, SamplerDevice.tsx, InstrumentsPanel.tsx, index.ts}` + `frontend/src/renderer/stores/instruments.ts` |
| B1 tests | `frontend/src/__tests__/components/instruments/{buildSamplerLayer,computeSamplerVoice}.test.ts`, `sampler-device.test.tsx`, `InstrumentsPanel.test.tsx`, `frontend/src/__tests__/stores/instruments.test.ts` |
| Composite render handler + per-layer state cache | `backend/src/zmq_server.py`: `_get_composite_states` (~:669), `_save_composite_states` (~:698), `_handle_render_composite` (~:707), `layer_id = f"asset:{...}"` (~:793) |
| Whole-cache cold-start on any layer-set change | `zmq_server.py` ~:694-696 (`if self._composite_state_key != expected_key: self._composite_states = {}`) |
| `render_composite(layers, resolution, project_seed, layer_states)` | `backend/src/engine/compositor.py:82` |
| Backend caps that ALREADY exist | `backend/src/security.py`: `MAX_COMPOSITE_LAYERS = 50` (:48), `MAX_CHAIN_DEPTH = 10` (:42), `validate_composite_layer_count` (~:263); negative `frame_index` rejected + 2-frame tail clamp in `_handle_render_composite` (INJ-3) |
| Project schema validator | `backend/src/project/schema.py`: `validate()` (:123), `_validate_settings_ranges` (:182) |
| `Track.type` includes `"performance"` | `frontend/src/shared/types.ts:57-79` |
| `Pad.modRoutes` rename ALREADY shipped | `frontend/src/shared/types.ts:344` |
| Modal perform mode (to retire) | `isPerformMode` in `frontend/src/renderer/App.tsx` (6 refs: :188,:420,:600,:676,:2454,:2559), `components/performance/{PadGrid.tsx, PerformancePanel.tsx}`, `stores/performance.ts`, + 4 test files (`__tests__/components/performance/keyboard-trigger.test.ts`, `__tests__/integration/keyboard-shortcuts.test.ts`, `__tests__/stores/performance-persistence.test.ts`, `__tests__/stores/performance.test.ts`) |
| Capture events still embed `performance.now()` + `modRoutes` (P1-2 violation, live) | `frontend/src/renderer/components/performance/padActions.ts` (`pushEvent({timestamp: performance.now(), …, modRoutes: pad.modRoutes})`), `frontend/src/renderer/utils/retro-capture.ts:8` |
| Pure one-to-many modulation precedent | `frontend/src/renderer/components/performance/applyCCModulations.ts` |
| Numeric guard helper | `frontend/src/shared/numeric.ts` (`clampFinite`) |
| Export engine is SINGLE-INPUT (no composite/multi-layer export today) | `backend/src/engine/export.py`: `ExportManager.start(input_path, output_path, chain, project_seed, settings, text_layers)` (:169), `_run_export` (:311) |
| Per-channel offset can ride the per-voice chain | `backend/src/effects/fx/channelshift.py` exists |
| `loadDrumRack` is flat (no branch recursion) | `frontend/src/renderer/stores/performance.ts:318-320` (`rack.pads.map`) |
| `panicAll` exists | `frontend/src/renderer/stores/performance.ts:66,:155` |
| PR #167 (B2-lite, OPEN — do NOT duplicate) | track-bound store `instruments: Record<trackId, SamplerInstrumentV1>` (`addSampler/setSource/updateSampler/removeSampler/getSampler`), `InstrumentsBrowser.tsx` (replaces `InstrumentsPanel.tsx`), performance-track creation in `stores/timeline.ts`, perf-track rendering in `Timeline.tsx`/`Track.tsx`, drag-drop wiring in `App.tsx`, track-keyed persistence in `project-persistence.ts`, `styles/instruments.css` |

**Dependency spine:** PR #167 → P5a.1‖P5a.2 → P5a.3 → P5a.4 → (B3: P5a.5→P5a.6, P5a.7, P5a.8) → (B4: P5a.9→P5a.10→P5a.11, P5a.12) → (B5: P5a.13→P5a.14→P5a.15).
P5a.1 and P5a.2 are independent of each other and can run in parallel worktrees.
**P5a.4 additionally requires P5a.4a** (composite-export design spike — docs-only, zero code dependencies, startable NOW in parallel with P5a.1–P5a.3; appended 2026-06-11).

**Test commands (canonical, from repo CLAUDE.md):**
- Frontend: `cd frontend && npx --no vitest run` (MUST use `--no`)
- Backend: `cd backend && python -m pytest -x -n auto --tb=short`

---

# ── B2: Voice spine (4 packets) ──

## P5a.1 — Trigger-event schema + pure voice FSM (frontend, no wiring)

- **ID:** P5a.1 · **branch:** `feat/p5a1-voice-fsm` · **base:** `origin/main` · **depends-on:** none (pure module; PR #167 NOT required) · **Est:** ~4h · **Model:** Sonnet
- **Goal:** Ship the deterministic voice-lifecycle FSM (idle→attack→sustain→release→idle, 4-voice oldest-steal, choke, panic) as a pure, event-driven module plus the capture-event schema that replaces `performance.now()`/embedded-`modRoutes` events.

### Voice FSM — canonical state machine (executors implement THIS table, no improvisation)

States: `idle` (= the voice is ABSENT from the voices array — idle is non-membership, not a stored phase), `attack`, `sustain`, `release`. The ADSR `decay` segment (`shared/types.ts:329-334` — attack/decay/release in FRAMES; sustain is a 0–1 LEVEL, not frames) is evaluated INSIDE `envelopeValue` as the 1→sustainLevel ramp of the attack→sustain span — decay is an envelope segment, NOT an FSM state. (The legacy 5-member `ADSRPhase` at `types.ts:327` stays untouched for `PadRuntimeState`.)

| # | From | Event / condition | To | Behavior |
|---|---|---|---|---|
| T1 | idle | `trigger`, active voices < voiceCap | attack | new Voice appended; `voiceId = voice:{instrumentId}:{triggerFrame}:{eventIndex}` |
| T2 | idle | `trigger`, active voices == voiceCap | attack | steal victim per policy below (T7), THEN T1 — net count stays == cap |
| T3 | attack | elapsed ≥ attack + decay frames | sustain | envelopeValue: 0→1 over `attack` frames, 1→sustainLevel over `decay` frames |
| T4 | attack | `release` event for this voice | release | release ramps from the CURRENT envelope value, not from sustainLevel |
| T5 | sustain | `release` event for this voice | release | ramp sustainLevel→0 over `release` frames |
| T6 | release | elapsed ≥ release frames | idle | voice removed from array |
| T7 | attack/sustain/release | stolen (a T2 trigger picked this voice) | idle | immediate removal, NO release tail |
| T8 | attack/sustain/release | `choke` (sibling trigger in same chokeGroup) | idle | atomic — all group siblings idle in the SAME frameIndex |
| T9 | attack/sustain/release | `panic` event kind | idle | all voices of all instruments |

**Illegal transitions (MUST be dropped silently, never thrown — each gets a negative test):** idle→sustain; idle→release (a `release` whose target matches no active voice is a no-op); release→attack and release→sustain (retriggering a releasing voice allocates a NEW voice via T1/T2 — never resurrects the old one); sustain→attack.

**Steal policy (fully deterministic, zero RNG):** victim = active voice with the LOWEST `triggerFrame`; tie-break = LOWEST `eventIndex`. `eventIndex` is unique and monotonic per capture buffer, so the pair `(triggerFrame, eventIndex)` totally orders voices — there is no third tie-break and no nondeterminism anywhere in the FSM.

### PRECONDITIONS (mismatch → STOP)
```bash
cd ~/Development/entropic-v2challenger
git grep -n "performance.now()" frontend/src/renderer/components/performance/padActions.ts
# EXPECT: 2 hits (timestamp: performance.now() in trigger + release pushEvent)
git grep -n "modRoutes: pad.modRoutes" frontend/src/renderer/components/performance/padActions.ts
# EXPECT: 2 hits
ls frontend/src/renderer/components/instruments/voiceFSM.ts 2>/dev/null
# EXPECT: no such file (this packet creates it)
git grep -n "PadRuntimeState" frontend/src/shared/types.ts
# EXPECT: 1 interface hit (~:354) with phase/triggerFrame/releaseFrame fields
```

### Scope (verified paths)
- [ ] NEW `frontend/src/renderer/components/instruments/voiceFSM.ts` — pure module:
  - `interface TriggerEvent { frameIndex: number; eventIndex: number; note: number; velocity: number; kind: 'trigger' | 'release'; instrumentId: string }` — **NO timestamp, NO embedded modRoutes** (INSTRUMENTS.md §10 P1-2).
  - `interface Voice { voiceId: string; instrumentId: string; note: number; velocity: number; triggerFrame: number; eventIndex: number; phase: 'attack' | 'sustain' | 'release'; footagePos: number }`
  - `evaluateVoices(events: TriggerEvent[], frameIndex: number, opts: {voiceCap: number; adsr: ADSREnvelope}): Voice[]` — pure function of (events, frameIndex); replays the full event list ≤ frameIndex; steal = oldest (lowest triggerFrame, tie-break eventIndex); z-order = ascending triggerFrame (newest on top = last in array); `voiceId = \`voice:${instrumentId}:${triggerFrame}:${eventIndex}\`` (deterministic, no counters).
  - `applyChoke(voices, chokeGroups)` and a `panic` event kind that idles all voices.
- [ ] NEW `frontend/src/__tests__/components/instruments/voiceFSM.test.ts`
- [ ] MODIFY `frontend/src/renderer/components/performance/padActions.ts` — `pushEvent` payload drops `modRoutes` snapshot; adds `eventIndex` (monotonic per capture buffer); keep `timestamp` ONLY for the rolling-buffer trim in `retro-capture.ts` (document: timestamp is buffer hygiene, NEVER replay input).
- [ ] MODIFY `frontend/src/renderer/utils/retro-capture.ts` — event type gains `frameIndex`/`eventIndex` as the replay key; `modRoutes` removed from the event shape.

### DO-NOT-TOUCH
- `frontend/src/renderer/stores/instruments.ts` (PR #167 rewrites it — merge-conflict magnet)
- `frontend/src/renderer/App.tsx` render path (wiring is P5a.3)
- `backend/**` (backend keying is P5a.2)
- `frontend/src/renderer/stores/performance.ts` `isPerformMode` (retirement is in P5a.3)

### Implementation steps
1. Write `voiceFSM.ts` types + `evaluateVoices` (replay-from-events; no internal mutable state).
2. ADSR phase evaluation reuses the frame-based `ADSREnvelope` already on `Pad` (`shared/types.ts` attack/decay/sustain/release in frames) — compute per-voice opacity envelope value as `envelopeValue(voice, frameIndex)` exported separately.
3. Update `padActions.ts` + `retro-capture.ts` event shapes; fix the 2 existing callers (`App.tsx:59` import site compiles unchanged — only the pushed payload changes) and any test fixtures.
4. Tests (below), lint, run full frontend suite.

### TEST PLAN
```bash
cd ~/Development/entropic-v2challenger/frontend
npx --no vitest run src/__tests__/components/instruments/voiceFSM.test.ts
npx --no vitest run   # full suite — no regressions
```
Named new tests (behavior keywords in `it()` titles):
- `voiceFSM.test.ts`: "fifth trigger steals the oldest voice at cap=4" · "steal tie-breaks by eventIndex when triggerFrames equal" · "z-order is ascending triggerFrame (newest on top)" · "choke group idles siblings atomically" · "panic idles all voices" · "same events + same frameIndex → identical voices (determinism)" · "evaluation is pure: calling twice does not mutate inputs" · "release transitions sustain→release→idle by ADSR frames" · "malformed event (NaN frameIndex / negative velocity) is dropped, not thrown" · "release for an unknown/idle voiceId is a no-op (illegal transition dropped, negative)" · "retrigger during release allocates a NEW voice, never resurrects (release→attack forbidden, negative)" · "transition-table conformance: every legal row T1–T9 exercised; every listed illegal pair dropped"

### ACCEPTANCE GATES
- `evaluateVoices` is referentially transparent (property test: two calls, deep-equal output, inputs unmutated).
- Replay determinism quantified: a 50-event log evaluated 100 times → 100 deep-equal voice arrays.
- No `performance.now()` remains in any **replayable** event payload: `git grep -n "performance.now" frontend/src/renderer/components/performance/ frontend/src/renderer/utils/retro-capture.ts` shows only the buffer-trim usage with a comment marking it non-replay.
- Full vitest suite green.

### ROLLBACK
Pure-add + 2-file event-shape change: `git revert <merge-sha>` is clean. No persistence/schema change, no IPC change.

### EVIDENCE for PR body
- vitest output for `voiceFSM.test.ts` (all named tests listed green) + full-suite count.
- `git grep -c "performance.now" frontend/src/renderer/components/performance/padActions.ts` → `0`.

---

## P5a.2 — Backend voiceId state keying + per-voice cleanup + voice caps · **RISK:HIGH**

- **ID:** P5a.2 · **branch:** `feat/p5a2-voiceid-state-keying` · **base:** `origin/main` · **depends-on:** none (backward-compatible backend change; parallel-safe with P5a.1) · **Est:** ~4h · **Model:** Opus/Fable (RISK:HIGH)
- **Goal:** Re-key the composite per-layer state cache from `asset:{path}` to `voice:{voiceId}` (when provided), make stolen-voice cleanup surgical (survivors keep their state), and land `MAX_TOTAL_VOICES_PER_RENDER` + voiceId validation in `security.py` — INSTRUMENTS.md §10 P1-1, the top review fix.

### PRECONDITIONS (mismatch → STOP)
```bash
cd ~/Development/entropic-v2challenger
git grep -n 'layer_id = f"asset:' backend/src/zmq_server.py
# EXPECT: exactly 1 hit (~:793)
git grep -n "self._composite_states = {}" backend/src/zmq_server.py
# EXPECT: 2 hits (lazy-init + whole-cache reset in _get_composite_states)
git grep -n "MAX_TOTAL_VOICES_PER_RENDER" backend/src/security.py
# EXPECT: 0 hits (this packet adds it)
git grep -n "def render_composite" backend/src/engine/compositor.py
# EXPECT: 1 hit at :82, layer_states keyed by layer_id
```

### Scope (verified paths)
- [ ] `backend/src/zmq_server.py` `_handle_render_composite`: accept optional `voice_id` per layer dict; when present and valid → `layer_id = f"voice:{voice_id}"`, else fall back to today's `asset:{path}` (back-compat: PR #167 / B1 frontends send no voice_id and must behave byte-identically).
- [ ] `backend/src/zmq_server.py` `_get_composite_states`: replace the all-or-nothing reset with **per-layer-id diffing** — on signature change, keep state entries whose layer_id is still present, drop only departed ids; still full-reset on non-monotonic frame jump (scrub).
- [ ] `backend/src/security.py`: `MAX_TOTAL_VOICES_PER_RENDER = 4` + `validate_voice_layers(layers) -> list[str]` (count of voice_id-bearing layers ≤ cap; voice_id matches `^[A-Za-z0-9:_-]{1,128}$`); called in `_handle_render_composite` BEFORE the decode loop (mirrors `validate_composite_layer_count` / INJ-3 placement).
- [ ] NEW `backend/tests/test_voice_state_keying.py`
- [ ] MODIFY `backend/tests/test_security.py` (or the existing security test file found via `git grep -l "validate_composite_layer_count" backend/tests/`) — cap tests.

### DO-NOT-TOUCH
- `backend/src/engine/compositor.py` (`render_composite` already keys by whatever `layer_id` it's handed — no change needed; if you find yourself editing it, STOP and re-read)
- `frontend/**` (P5a.3 sends voice_id)
- `backend/src/engine/export.py` (P5a.4)

### Implementation steps
1. Add security constants + validator with unit tests first.
2. Thread `voice_id` through `_handle_render_composite`'s layer loop into `layer_id`.
3. Rewrite `_get_composite_states` diffing (keep `(signature, frame-1)` monotonic check for scrub resets; on signature change intersect old state keys with new signature's ids).
4. Run determinism check: two-voice same-asset render twice with stateful effect (`datamosh`) in each chain → per-voice states independent.

### TEST PLAN
```bash
cd ~/Development/entropic-v2challenger/backend
python -m pytest tests/test_voice_state_keying.py -x --tb=short
python -m pytest -x -n auto --tb=short   # full backend — no regressions
```
Named new tests:
- "two voices on the same clip do not cross-contaminate stateful effect state (datamosh)" · "stealing one voice drops only that voice's cache entry, survivors keep state" · "layer set without voice_id keys by asset path (back-compat)" · "non-monotonic frame jump resets all state (scrub)" · "fifth voice_id layer rejected before decode (MAX_TOTAL_VOICES_PER_RENDER)" · "malformed voice_id (path traversal chars / 4KB string / non-string) rejected" · "duplicate voice_id in one render rejected" · "voice-steal under load: 100 sequential trigger/steal render cycles leave ≤ MAX_TOTAL_VOICES_PER_RENDER voice-keyed cache entries (no unbounded state growth, negative)"

### ACCEPTANCE GATES
- All existing composite tests pass UNCHANGED (back-compat is the gate — `git grep -l "render_composite" backend/tests/` files all green).
- Cap enforced server-side before decode (test proves rejection happens with an unreadable asset path, i.e. decode never ran).
- Survivor-state test asserts identity (`is`-level or value equality) of the kept state dict across a steal.

### ROLLBACK
Single revert. The `voice_id` field is optional on the wire — no frontend sends it until P5a.3, so reverting cannot strand a client.

### EVIDENCE for PR body
- pytest output (named tests green + full-suite count).
- Dependency map per Infra-Change Gate: callers of `_get_composite_states`/`_save_composite_states` = `_handle_render_composite` only (grep output pasted).

---

## P5a.3 — Wire FSM into the render path + retire `isPerformMode` (extends PR #167)

- **ID:** P5a.3 · **branch:** `feat/p5a3-performance-track-voices` · **base:** `origin/main` **after PR #167 merges** · **depends-on:** PR #167 (merged), P5a.1, P5a.2 · **Est:** ~4h · **Model:** Sonnet
- **Goal:** Performance-track pad triggers flow through `evaluateVoices` into multi-voice composite layers (`voice_id` per layer, per-voice ADSR opacity, newest-on-top), and the modal `isPerformMode` flag is retired in favor of track-bound performance state.

### PRECONDITIONS (mismatch → STOP)
```bash
cd ~/Development/entropic-v2challenger
gh pr view 167 --repo nissimdirect/entropic-v2challenger --json state -q .state
# EXPECT: MERGED  (if OPEN → STOP, this packet extends its store/UI)
git grep -n "instruments: Record" frontend/src/renderer/stores/instruments.ts
# EXPECT: 1 hit — track-keyed store from #167
git grep -n "evaluateVoices" frontend/src/renderer/components/instruments/voiceFSM.ts
# EXPECT: 1 export (P5a.1 landed)
git grep -n "validate_voice_layers" backend/src/security.py
# EXPECT: 1 def (P5a.2 landed)
git grep -c "isPerformMode" frontend/src/renderer/App.tsx
# EXPECT: 6 (if drifted, re-enumerate before editing)
```

### Scope (verified paths)
- [ ] `frontend/src/renderer/components/instruments/buildSamplerLayer.ts` — generalize: `buildVoiceLayers(instrument, voices, assets, frame, fps): SamplerVoiceLayer[]` — one layer per active voice; `frame_index` from per-voice `footagePos` via `computeSamplerVoice` math; `opacity = inst.opacity * envelopeValue(voice, frame)`; emits `voice_id: voice.voiceId` on each layer dict.
- [ ] `frontend/src/renderer/components/instruments/types.ts` — `SamplerVoiceLayer` gains optional `voice_id: string`.
- [ ] `frontend/src/renderer/App.tsx` — render effect: for each performance track with a sampler, feed that track's trigger events (pad triggers routed to the track) through `evaluateVoices` and append `buildVoiceLayers(...)` (replaces the single-layer-per-track append from #167).
- [ ] `frontend/src/renderer/stores/performance.ts` — `triggerPad`/`releasePad` append `TriggerEvent`s to the owning performance track's event log (new `trackEvents: Record<trackId, TriggerEvent[]>`); **retire `isPerformMode`/`setPerformMode`** — pads are armed whenever a performance track is selected.
- [ ] `frontend/src/renderer/App.tsx` `isPerformMode` refs (:188,:420,:600,:676,:2454,:2559) → selected-track-type checks; `Cmd+P` toggle becomes select/deselect-performance-track or is removed.
- [ ] `frontend/src/renderer/components/performance/PerformancePanel.tsx`, `PadGrid.tsx` — read selected performance track, not the modal flag.
- [ ] `frontend/src/renderer/styles/global.css` — any `perform-mode` classes renamed/removed (grep first: `git grep -n "perform" frontend/src/renderer/styles/global.css`).
- [ ] Update 4 test files: `__tests__/components/performance/keyboard-trigger.test.ts`, `__tests__/integration/keyboard-shortcuts.test.ts`, `__tests__/stores/performance-persistence.test.ts`, `__tests__/stores/performance.test.ts`.
- [ ] NEW `frontend/src/__tests__/components/instruments/buildVoiceLayers.test.ts`.

### DO-NOT-TOUCH
- `backend/**` (P5a.2 already landed the contract; export is P5a.4)
- `frontend/src/renderer/stores/freeze.ts` (freeze↔voice coupling is B10, NOT Phase 5a)
- `InstrumentsBrowser.tsx` drag/drop from #167 (works; don't refactor)

### Implementation steps
1. Store: per-track event log + arming-by-selection; delete `isPerformMode` state + action; migrate persisted shape (old saves with `isPerformMode` load cleanly — field ignored).
2. `buildVoiceLayers` + types.
3. App.tsx wiring (events → voices → layers; layers ordered ascending triggerFrame after the track's base layers).
4. Mechanical `isPerformMode` retirement across the 6 App refs + 2 components + CSS + 4 test files.
5. Full suite; **live-runtime step (Gate 18):** launch the app from the SAME worktree you edited; `ps aux | grep -i electron` must show that path (canonical: `~/Development/entropic-v2challenger/`; sync `entropic-v2-uat/` separately if the user runs from it — `feedback_verify-canonical-project-path`); kill + relaunch, not HMR (store-shape change — `feedback_zustand-hmr-needs-restart`); then hold 2 overlapping pads and watch 2 voices composite before claiming ready.

### TEST PLAN
```bash
cd ~/Development/entropic-v2challenger/frontend
npx --no vitest run src/__tests__/components/instruments/buildVoiceLayers.test.ts
npx --no vitest run src/__tests__/stores/performance.test.ts
npx --no vitest run   # full
```
Named new tests:
- `buildVoiceLayers.test.ts`: "one composite layer per active voice with distinct voice_id" · "per-voice opacity follows ADSR envelope value at frameIndex" · "layers ordered ascending triggerFrame so newest composites on top" · "voice cap 4: five triggers yield four layers, oldest stolen" · "unsourced sampler (empty clipId) yields zero layers"
- `performance.test.ts` additions: "pad trigger appends a TriggerEvent to the owning track's event log" · "pads are armed when a performance track is selected (no modal flag)" · "panicAll clears all tracks' active voices" · "trigger with non-finite frameIndex is dropped at the store boundary (negative)"
- Full-chain integration (named, mock IPC): `buildVoiceLayers.test.ts` "full chain: pad keydown → store TriggerEvent → evaluateVoices → composite payload carries one voice_id-bearing layer per active voice (asserts the exact layer dicts handed to the render IPC)"

### ACCEPTANCE GATES
- `git grep -c "isPerformMode" frontend/src/` → 0.
- Determinism: same event log + same frame → identical layer arrays (test asserts deep-equal across two evaluations).
- Full vitest green; no `performance.now()` in any replay path.

### ROLLBACK
Revert the merge commit. Persistence is additive (`trackEvents` optional on load); pre-packet saves still load. Note `feedback_zustand-hmr-needs-restart`: store-shape change → kill + relaunch when testing live.

### EVIDENCE for PR body
- vitest output; before/after grep counts for `isPerformMode` (6+N → 0); short screen capture of 2 overlapping pad voices compositing (per `feedback_computer-use-as-acceptance-gate`).

---

## P5a.4 — Deterministic backend export replay of performance voices · **RISK:HIGH**

- **ID:** P5a.4 · **branch:** `feat/p5a4-export-voice-replay` · **base:** `origin/main` · **depends-on:** P5a.2, P5a.3, **P5a.4a (composite-export design decision merged — amended 2026-06-11)** · **Est:** ~4h (hard split at P5a.4b if exceeded) · **Model:** Opus/Fable (RISK:HIGH)
- **Goal:** Exports replay the voice FSM backend-side from the serialized event list, so rendered output is byte-identical across runs and survives edit-after-capture — INSTRUMENTS.md §10 P1-2 condition (3).

> **Scope honesty:** `ExportManager` is single-input today (`start(input_path, chain, …)`) — there is
> NO composite export path on origin/main. This packet adds the **minimum** composite-replay export:
> per-frame layer lists computed backend-side from `(events, instruments, frameIndex)` via a small
> Python mirror of `evaluateVoices`. If during work this exceeds ~4h, ship the Python FSM mirror +
> replay correctness tests alone and file the encoder integration as P5a.4b — do not half-integrate.
> **Design authority (amended 2026-06-11):** the composite-render approach (reuse vs re-render),
> memory strategy, and determinism contract are DECIDED in `docs/decisions/composite-export-design.md`
> (P5a.4a's deliverable). Implementation MUST follow its `## Recommendation`; to diverge, amend that
> doc in the same PR with a DEC note explaining why.

### PRECONDITIONS (mismatch → STOP)
```bash
cd ~/Development/entropic-v2challenger
git grep -n "def start" backend/src/engine/export.py
# EXPECT: signature (input_path, output_path, chain, project_seed, settings, text_layers) — no layers/events params yet
git grep -n "voice:" backend/src/zmq_server.py
# EXPECT: ≥1 hit (P5a.2's voice keying landed)
git grep -rn "def evaluateVoices\|def evaluate_voices" backend/src/
# EXPECT: 0 hits (this packet adds the Python mirror)
git ls-tree origin/main docs/decisions/composite-export-design.md
# MUST be non-empty (P5a.4a merged) — EMPTY → STOP, the design decision this packet implements does not exist
grep -q "^## Recommendation" docs/decisions/composite-export-design.md || { echo "STOP: decision doc has no Recommendation"; exit 1; }
```

### Scope (verified paths)
- [ ] NEW `backend/src/engine/voice_replay.py` — `evaluate_voices(events: list[dict], frame_index: int, opts) -> list[dict]`: line-for-line port of `voiceFSM.ts` semantics (steal/choke/age/ADSR from `(frameIndex, eventIndex)`; same voiceId derivation). Docstring cross-references `frontend/src/renderer/components/instruments/voiceFSM.ts` and states: **the two implementations must be mutated together** (add a lint-greppable marker `# MIRROR: voiceFSM.ts`).
- [ ] `backend/src/engine/export.py` — `start(...)` accepts optional `performance: {events, instruments, assets}` payload; when present `_run_export` builds per-frame layer dicts via `evaluate_voices` + `render_composite` (with per-voice `layer_states` threading, keyed `voice:{voiceId}` — same keying as P5a.2) and encodes the composited frames.
- [ ] `backend/src/zmq_server.py` `_handle_export_start` (~:1359) — pass-through + validation of the new payload (`validate_voice_layers` per frame budget; event-list size cap `MAX_CAPTURE_EVENTS = 10_000` added to `security.py` — ~48 B/event ≈ 480 KB JSON worst case, comfortably one ZMQ message; over-cap = REJECT the export with a clear error, never truncate).
- [ ] `backend/src/project/schema.py` — `validate()` gains event-list rules: every event has finite int `frameIndex ≥ 0`, int `eventIndex ≥ 0`, `note 0-127`, `velocity 0-127`, known `kind`; referenced `instrumentId` exists (referential integrity on FILE LOAD, §10 P1-2).
- [ ] `frontend/src/renderer/stores/export.ts` — include the performance payload in `export_start` for projects with performance tracks.
- [ ] NEW `backend/tests/test_voice_replay.py`, additions to the export tests (`git grep -l "export_start" backend/tests/`).

### DO-NOT-TOUCH
- Live preview path (`_handle_render_composite`) — already correct from P5a.2; export must REUSE `render_composite`, not fork it.
- `voiceFSM.ts` logic (if the port reveals a frontend bug, STOP and file it — don't silently diverge).

### Implementation steps
1. Port FSM → `voice_replay.py` + golden-vector test: commit a JSON fixture of (events, frameIndex) → expected voices generated FROM the vitest suite (write a tiny vitest that dumps the fixture; check the fixture in) so TS and Python are pinned to identical vectors.
2. Export payload validation (schema + security caps).
3. `_run_export` composite branch with per-voice state threading.
4. Byte-identity harness: export the same project twice → `shasum -a 256` equal; edit-after-capture case (mutate a pad's modRoutes post-capture → export unchanged, because events carry no modRoutes); malformed-event fuzz (NaN/negative/string fields → export rejected, no crash).

### TEST PLAN
```bash
cd ~/Development/entropic-v2challenger/backend
python -m pytest tests/test_voice_replay.py -x --tb=short
python -m pytest -x -n auto --tb=short
cd ../frontend && npx --no vitest run src/__tests__/components/instruments/voiceFSM.test.ts
```
Named new tests:
- `test_voice_replay.py`: "python replay matches TS golden vectors exactly" · "export twice produces byte-identical files (sha256)" · "edit-after-capture: changing pad modRoutes after capture does not change export output" · "malformed event list rejected at export start (fuzz: NaN frameIndex, velocity 999, unknown kind)" · "oldest-steal at cap reproduces identically across replays" · "stateful effect per-voice state threads across exported frames" · "event list of 10,001 events rejected at export start (MAX_CAPTURE_EVENTS, negative)"
- schema: "project load rejects event referencing unknown instrumentId"

### ACCEPTANCE GATES
- Byte-identical double-export gate green (EXPORT path — never assert against preview, global determinism rule).
- Golden-vector fixture committed and green on BOTH suites.
- 30fps vs 60fps time-aligned export case from INSTRUMENTS-BUILD-PLAN B2 OUT-gates: same events at both fps → triggers land on the same timeline seconds.

### ROLLBACK
Revert; `performance` export payload is optional — old clients export unchanged. Schema validation additions are reject-only on NEW fields (old projects have no event lists → no load regression).

### EVIDENCE for PR body
- sha256 pairs from the double-export run; pytest + vitest outputs; fixture diff stats.

---

## P5a.4a — Composite-export design spike (docs-only; the missing foundation under P5a.4) · appended 2026-06-11

- **ID:** P5a.4a · **branch:** `docs/p5a4a-composite-export-design` · **base:** `origin/main` · **depends-on:** none (read-only spike; runs in parallel with P5a.1–P5a.3; gates P5a.4) · **Est:** ~3h · **Model:** Opus/Fable (not RISK:HIGH itself, but it is the design authority a RISK:HIGH packet implements — use the stronger model)
- **Goal:** P5a.4 is RISK:HIGH precisely because `backend/src/engine/export.py` is **single-input only** (VERIFIED on main: `ExportManager.start(input_path, output_path, chain, project_seed, settings, text_layers)` at :169; `_run_export` :311; `_export_gif` :532; `_export_image_sequence` :590; `_mux_audio` :647 — every consumer assumes ONE source clip) and NO composite export exists. This spike produces the decision record P5a.4 implements, so the ~4h implementation packet doesn't improvise architecture under time pressure.
- **Deliverable:** ONE new file — `docs/decisions/composite-export-design.md` (first non-q7 record in `docs/decisions/`; the q7 DEC pattern is the precedent).

### PRECONDITIONS (mismatch → STOP)
```bash
cd ~/Development/entropic-v2challenger
git grep -n "def start" backend/src/engine/export.py
# EXPECT single-input signature (input_path, output_path, chain, project_seed, settings, text_layers)
# — if a layers/events/composite param already exists, the void this spike fills has closed → STOP, re-scope
git ls-tree origin/main docs/decisions/composite-export-design.md
# MUST be EMPTY (doc not already written) — else STOP
git grep -n "def render_composite" backend/src/engine/compositor.py
# EXPECT hit at ~:82 (render_composite(layers, resolution, project_seed, layer_states)) — the preview entry the doc must address reusing
```

### Scope (verified read-only inputs; ZERO source edits — docs-only packet)
- [ ] READ: `backend/src/engine/export.py` (whole), `backend/src/engine/compositor.py` (`render_composite` :82), `backend/src/engine/determinism.py`, `backend/src/engine/cache.py`, `backend/src/zmq_server.py` `_get_composite_states`/`_save_composite_states`/`_handle_render_composite` (:669/:698/:707), `backend/src/safety/pressure/budget.py` (`SESSION_BUDGET_BYTES` anchor).
- [ ] WRITE: `docs/decisions/composite-export-design.md` with EXACTLY these grep-checkable sections:
  - `## Context` — single-input ground truth with `file:line` refs (verified against origin/main, not from memory)
  - `## Options` — **≥3 enumerated options as `### O1`/`### O2`/`### O3`…** each with pros/cons/risk. Must include at minimum: per-frame `render_composite` reuse inside `_run_export`; headless re-render through the preview composite handler; two-pass bake-then-composite. More options allowed.
  - `## Recommendation` — exactly ONE option, with justification and an explicit statement that it fits P5a.4's ~4h budget (or names the P5a.4b split)
  - `## Render-path reuse vs re-render` — explicit stance on reusing `render_composite` vs forking it (P5a.4's DO-NOT-TOUCH mandates REUSE — this section either upholds that or formally overturns it with reasons)
  - `## Memory strategy` — peak-RSS model for N layers × resolution (worst case `MAX_COMPOSITE_LAYERS = 50`, `security.py:48`); streaming vs buffer-all; relation to SG-8's `SESSION_BUDGET_BYTES` and ROADMAP G14's memory-budget addendum
  - `## Determinism contract` — byte-identity across runs; per-voice state threading keyed `voice:{voiceId}` (P5a.2); seed handling; what is excluded from the hash gate (B7 `interp:'flow'` rule is the precedent)
  - `## Test obligations` — the named tests P5a.4 must ship to honor this design

### DO-NOT-TOUCH
- ALL source code (`backend/**`, `frontend/**`) — a single non-docs diff line fails review.
- P5a.4's packet text (its amendment already points here).

### TEST PLAN (docs are grep-tested; run from repo root)
```bash
cd ~/Development/entropic-v2challenger
for h in "## Context" "## Options" "## Recommendation" "## Render-path reuse vs re-render" "## Memory strategy" "## Determinism contract" "## Test obligations"; do
  grep -q "^${h}" docs/decisions/composite-export-design.md || { echo "STOP: missing section: $h"; exit 1; }
done; echo "sections OK"
test "$(grep -c '^### O[0-9]' docs/decisions/composite-export-design.md)" -ge 3 || { echo "STOP: fewer than 3 enumerated options"; exit 1; }
test "$(grep -c '^## Recommendation' docs/decisions/composite-export-design.md)" -eq 1 || { echo "STOP: exactly one Recommendation required"; exit 1; }
# Negative self-test (proves the gate CAN fail — run once before trusting any green result):
empty=$(mktemp); if grep -q "^## Context" "$empty"; then echo "BROKEN GATE: matched on empty file"; exit 1; else echo "negative self-test OK (gate fails on empty doc)"; fi; rm "$empty"
```

### ACCEPTANCE GATES
- All 7 required sections present (grep loop exits 0); ≥3 `### O<n>` options; exactly one `## Recommendation`.
- Every code claim in `## Context` carries a `file:line` ref reproducible via `git grep`/`git show` against origin/main.
- Recommendation is implementable inside P5a.4's ~4h budget, or the doc itself names the P5a.4b split.

### ROLLBACK
Revert — single doc file, zero code coupling.

### EVIDENCE for PR body
- The three TEST PLAN command outputs (sections OK / option count / recommendation count); the `git grep "def start"` precondition output proving the single-input void still existed when written.

---

# ── B3: Full sampler (4 packets) ──

## P5a.5 — Loop engine: in/out points, direction, ping-pong + loop crossfade

- **ID:** P5a.5 · **branch:** `feat/p5a5-sampler-loop` · **base:** `origin/main` · **depends-on:** P5a.3 (voice layers; loop math itself only needs B1 files — if #167/P5a.3 unmerged, STOP) · **Est:** ~4h · **Model:** Sonnet
- **Goal:** Sampler gains `endFrame`, `loop {enabled, in, out, dir: fwd|rev|pingpong}`, and a seam crossfade (frame-blend across the loop point), all pure in `computeSamplerVoice`.

### PRECONDITIONS (mismatch → STOP)
```bash
cd ~/Development/entropic-v2challenger
git grep -n "startFrame" frontend/src/renderer/components/instruments/types.ts
# EXPECT: SamplerInstrumentV1 with startFrame/speed/opacity/blendMode and NO loop/endFrame fields
git grep -n "footageFrameIndex\|frameIndex" frontend/src/renderer/components/instruments/computeSamplerVoice.ts
# EXPECT: linear start + round(speed*playhead) math, no loop folding
git grep -n "buildVoiceLayers" frontend/src/renderer/components/instruments/buildSamplerLayer.ts
# EXPECT: ≥1 hit (P5a.3 landed)
```

### Scope (verified paths)
- [ ] `frontend/src/renderer/components/instruments/types.ts` — `SamplerInstrumentV1` v2 fields: `endFrame?: number`, `loop?: {enabled: boolean; in: number; out: number; dir: 'fwd' | 'rev' | 'pingpong'; crossfadeFrames: number}` (all optional → old persisted samplers load unchanged).
- [ ] `frontend/src/renderer/components/instruments/computeSamplerVoice.ts` — fold `footagePos` into `[loop.in, loop.out]` per dir (modulo for fwd/rev, triangle-wave for pingpong); when within `crossfadeFrames` of the seam emit a second blend layer: return type extends to `{primary, seamBlend?: {layer, weight}}` OR the layer dict gains `seam_blend: {frame_index, weight}` — pick the representation that keeps `render_composite` untouched (two layers with complementary opacity is the zero-backend-change route; use it).
- [ ] `frontend/src/renderer/components/instruments/SamplerDevice.tsx` — loop on/off, in/out number inputs, dir select, crossfade frames input (mirror existing start/speed input patterns + clamping).
- [ ] `frontend/src/renderer/project-persistence.ts` — round-trip the new optional fields (extend the #167 track-keyed sampler sanitization: clamp `loop.in/out` to `[0, frameCount-1]`, `in < out` enforced on load).
- [ ] Tests: extend `computeSamplerVoice.test.ts`, `sampler-device.test.tsx`, persistence test.

### DO-NOT-TOUCH
- `backend/**` — crossfade-as-two-layers means zero backend change; if you think you need a backend change, STOP and re-read the representation decision.
- `voiceFSM.ts` (loop is playback math, not lifecycle).

### Implementation steps
1. Types + pure math + exhaustive unit tests (fwd wrap, rev wrap, pingpong reflection, degenerate `in==out`, crossfade weight curve sums to 1).
2. Two-layer seam blend in `buildVoiceLayers` (seam layer carries `voice_id: voiceId + ':seam'` — within the same voice budget? NO: seam layers are exempt from the 4-voice count but NOT from `MAX_COMPOSITE_LAYERS`; document this in the test).
3. UI + persistence + clamps; **live-runtime check (Gate 18):** scrub across the loop seam in the running app launched from the edited worktree (`ps aux | grep -i electron` path check) before claiming ready.

### TEST PLAN
```bash
cd ~/Development/entropic-v2challenger/frontend
npx --no vitest run src/__tests__/components/instruments/computeSamplerVoice.test.ts
npx --no vitest run
```
Named new tests: "loop fwd wraps footage position back to loop in point" · "loop rev plays out→in and wraps" · "pingpong reflects direction at both loop boundaries without double-counting the endpoint frame" · "crossfade emits seam layer whose weight ramps 0→1 across crossfadeFrames and complements primary (weights sum to 1 ± 1e-6 at every seam frame)" · "loop in==out degenerates to freeze frame, no NaN" · "loop bounds outside clip clamp to [0,frameCount-1] on load" · "sampler without loop field behaves exactly as before (regression)" · "1-frame clip (frameCount=1): loop + crossfade degrade to frame 0, no NaN, no divide-by-zero (negative)" · "full chain: loop params set via SamplerDevice → store → buildVoiceLayers layer dict's frame_index folds into [in,out] (mock IPC, asserts the payload)"

### ACCEPTANCE GATES
- Per-param visual-diff principle (BUG-PREVENTION P2): each new param has at least one test where changing ONLY that param changes the computed layer output (kills dead params).
- Old-save load regression test green.

### ROLLBACK
Revert; optional fields mean old code ignores them and old saves never had them.

### EVIDENCE for PR body
- vitest output; a 2-frame table (frameIndex → primary/seam frame_index+weights) pasted from a test run demonstrating the seam.

---

## P5a.6 — Scrub-as-mod-destination + position/speed glide

- **ID:** P5a.6 · **branch:** `feat/p5a6-scrub-mod-glide` · **base:** `origin/main` · **depends-on:** P5a.5 · **Est:** ~3.5h · **Model:** Sonnet
- **Goal:** Sampler playhead position becomes a modulation *destination* (drivable by MIDI CC/LFO/velocity) and retriggers glide (portamento) position/speed instead of jumping.

### PRECONDITIONS (mismatch → STOP)
```bash
cd ~/Development/entropic-v2challenger
git grep -n "export function applyCCModulations" frontend/src/renderer/components/performance/applyCCModulations.ts
# EXPECT: 1 hit — pure chain-override precedent
git grep -n "scrub" frontend/src/renderer/components/instruments/
# EXPECT: 0 hits
git grep -n "loop" frontend/src/renderer/components/instruments/types.ts
# EXPECT: loop fields present (P5a.5 landed)
```

### Scope (verified paths)
- [ ] `frontend/src/renderer/components/instruments/types.ts` — `scrub?: {position: number /*0..1 normalized over [start,end]*/; amount: number /*0..1 blend between transport-driven and scrub-driven position*/}`, `glide?: {positionFrames: number; speedFrames: number}`.
- [ ] NEW `frontend/src/renderer/components/instruments/applySamplerModulations.ts` — pure, mirrors `applyCCModulations` shape: `(inst, modSources: Record<string, number>) → inst'` with finite-guard + clamp on every written param (`clampFinite` from `shared/numeric.ts`); destinations: `scrub.position`, `speed`, `opacity`.
- [ ] `frontend/src/renderer/components/instruments/computeSamplerVoice.ts` — position resolution order: transport pos → loop fold → scrub blend; glide = exponential approach with per-frame step derived from `glide.*Frames` computed deterministically from `(triggerFrame, frameIndex)` — NO incremental hidden state (must replay identically from events).
- [ ] `frontend/src/renderer/App.tsx` — call `applySamplerModulations` in the render effect with the existing `midi.ccValues` sources (same site that calls `applyCCModulations`, App.tsx ~:111).
- [ ] `SamplerDevice.tsx` — scrub position/amount + glide controls.
- [ ] Tests: NEW `applySamplerModulations.test.ts` + `computeSamplerVoice.test.ts` additions.

### DO-NOT-TOUCH
- `applyCCModulations.ts` itself (precedent, not a refactor target)
- `backend/**`, `voiceFSM.ts`

### Implementation steps
1. Pure modulation fn + tests (unknown destination ignored; NaN source dropped; out-of-range clamped).
2. Deterministic glide math (closed-form, function of elapsed frames since trigger) + tests.
3. Wire + UI; **live-runtime check (Gate 18):** sweep a CC source in the running app launched from the edited worktree and watch the playhead scrub before claiming ready.

### TEST PLAN
```bash
cd ~/Development/entropic-v2challenger/frontend
npx --no vitest run src/__tests__/components/instruments/applySamplerModulations.test.ts
npx --no vitest run src/__tests__/components/instruments/computeSamplerVoice.test.ts
npx --no vitest run
```
Named new tests: "CC source drives scrub position across the start..end range" · "scrub amount 0 leaves transport-driven playback untouched" · "NaN mod source is ignored, position unchanged" · "glide approaches new position over positionFrames, closed-form (no per-frame accumulator)" · "retrigger with glide does not jump footage position discontinuously" · "modulated speed stays clamped to [-8, 8]"

### ACCEPTANCE GATES
- Glide determinism: voice evaluated at frame N directly equals voice evaluated by stepping 0..N (closed-form proof test).
- Every modulated write passes through `clampFinite` (grep gate: no bare `Number(` / unguarded assignment in `applySamplerModulations.ts`).

### ROLLBACK
Revert; all fields optional, no wire/schema change.

### EVIDENCE for PR body
- vitest output; the closed-form-vs-stepped equality test highlighted.

---

## P5a.7 — Per-channel RGB offset (C-axis) + axis-binding field (T/Y/X)

- **ID:** P5a.7 · **branch:** `feat/p5a7-channel-offset-axis` · **base:** `origin/main` · **depends-on:** P5a.3 (voice layers carry chains); parallel-safe with P5a.5/P5a.6 except shared `types.ts` (rebase order: after whichever lands first) · **Est:** ~3.5h · **Model:** Sonnet
- **Goal:** Sampler gets a per-channel RGB temporal offset rendered via the existing `channelshift` effect on the per-voice chain, plus the `timeAxis: 't'|'y'|'x'` field (lowercase canon, INSTRUMENTS.md P1-A) — stored + validated now, `'y'/'x'` rendering deferred to B9.

### PRECONDITIONS (mismatch → STOP)
```bash
cd ~/Development/entropic-v2challenger
ls backend/src/effects/fx/channelshift.py
# EXPECT: exists
git grep -n "chain: never\[\]\|chain: \[\]" frontend/src/renderer/components/instruments/types.ts frontend/src/renderer/components/instruments/computeSamplerVoice.ts
# EXPECT: voice layer chain currently hard-empty
git grep -rn "timeAxis" frontend/src/
# EXPECT: 0 hits
```
Also read `backend/src/effects/fx/channelshift.py` param names BEFORE coding — if it shifts channels **spatially** (x/y px) rather than **temporally** (frames), the C-axis offset instead becomes 3 layers of the same clip at `frame_index ± offset` with channel-isolation blend — decide per what the effect actually does, cite the file in a code comment (Research Gate).

### Scope (verified paths)
- [ ] `frontend/src/renderer/components/instruments/types.ts` — `perChannelOffset?: [number, number, number]` (frames, clamp [-30, 30] each), `timeAxis?: 't' | 'y' | 'x'` (default `'t'`); `SamplerVoiceLayer.chain` widens from `never[]` to `EffectInstance[]`.
- [ ] `frontend/src/renderer/components/instruments/buildSamplerLayer.ts` — when `perChannelOffset` non-zero, attach the channel-offset representation (chain effect or tri-layer, per the precondition decision).
- [ ] `SamplerDevice.tsx` — 3 offset inputs + axis select (`y`/`x` options visibly marked "wired in B9", but the FIELD persists — DO NOT hide it from persistence).
- [ ] `frontend/src/renderer/project-persistence.ts` — round-trip + clamp both fields; reject non-lowercase axis values on load (coerce to `'t'`).
- [ ] `backend/src/project/schema.py` — if instrument blobs are validated there post-P5a.4, add `timeAxis ∈ {t,y,x}` + offset finite/range rules.
- [ ] Tests: `buildSamplerLayer.test.ts` + persistence additions.

### DO-NOT-TOUCH
- `backend/src/effects/fx/channelshift.py` (consume, don't modify)
- `voiceFSM.ts`, `compositor.py`

### Implementation steps
1. Read `channelshift.py`; decide representation; comment the citation.
2. Types + layer construction + clamps.
3. UI + persistence + schema; **live-runtime check (Gate 18):** nudge each channel offset in the running app launched from the edited worktree and see the RGB split before claiming ready.

### TEST PLAN
```bash
cd ~/Development/entropic-v2challenger/frontend
npx --no vitest run src/__tests__/components/instruments/buildSamplerLayer.test.ts
npx --no vitest run
cd ../backend && python -m pytest -x -n auto --tb=short   # only if schema.py touched
```
Named new tests: "nonzero perChannelOffset attaches channel offset to the voice layer; zero offset leaves chain empty (regression)" · "perChannelOffset clamps to [-30,30] per channel and drops NaN" · "timeAxis persists through save/load round-trip" · "uppercase or unknown axis value coerces to 't' on load" · "timeAxis y/x stores but does not alter rendered frame_index (deferred-to-B9 guard)"

### ACCEPTANCE GATES
- Per-param visual-diff: offset change → layer output change (test).
- Lowercase-axis canon enforced at load (P1-A).

### ROLLBACK
Revert; optional fields.

### EVIDENCE for PR body
- vitest output; the channelshift.py citation comment quoted; representation decision rationale (2 sentences).

---

## P5a.8 — Melodic mode (note → startFrame / speed) + trigger modes on the sampler

- **ID:** P5a.8 · **branch:** `feat/p5a8-melodic-trigger-modes` · **base:** `origin/main` · **depends-on:** P5a.3 · **Est:** ~4h · **Model:** Sonnet
- **Goal:** A performance-track sampler plays chromatically — incoming note number maps to `startFrame` offset (default, "chromatic scrub", resolved decision §6.2) or `speed` (per-instrument option) — and gate/one-shot/toggle trigger modes drive the voice FSM.

### PRECONDITIONS (mismatch → STOP)
```bash
cd ~/Development/entropic-v2challenger
git grep -n "note: number" frontend/src/renderer/components/instruments/voiceFSM.ts
# EXPECT: TriggerEvent carries note (P5a.1)
git grep -n "PadMode" frontend/src/shared/types.ts
# EXPECT: pad mode union exists (gate/one-shot/toggle family)
git grep -rn "noteMap\|melodic" frontend/src/renderer/components/instruments/
# EXPECT: 0 hits
```

### Scope (verified paths)
- [ ] `frontend/src/renderer/components/instruments/types.ts` — `noteMap?: {mode: 'startFrame' | 'speed'; rootNote: number /*0-127, default 60*/; framesPerSemitone: number /*startFrame mode*/}`; `triggerMode?: 'gate' | 'oneShot' | 'toggle'` (default `'gate'`).
- [ ] `frontend/src/renderer/components/instruments/voiceFSM.ts` (or `buildVoiceLayers`) — per-voice `startFrame' = startFrame + (note - rootNote) * framesPerSemitone` (clamped) in startFrame mode; `speed' = speed * 2^((note-rootNote)/12)` (clamped [-8,8]) in speed mode; one-shot voices auto-release at clip/loop end; toggle handled at event-emission (reuse `handlePadTrigger`'s toggle logic — `padActions.ts`).
- [ ] `frontend/src/renderer/stores/midi.ts` — incoming MIDI notes on a selected performance track emit `TriggerEvent`s with the real note number (today notes only map to pads).
- [ ] `SamplerDevice.tsx` — noteMap mode/root/scale controls + trigger-mode select.
- [ ] Persistence round-trip.
- [ ] Tests: `voiceFSM.test.ts` + NEW `melodic-mapping.test.ts`.

### DO-NOT-TOUCH
- `backend/**`; pad-grid MIDI mapping (existing pad flow keeps working — melodic input is additive for performance tracks).

### Implementation steps
1. Pure mapping math + tests (both modes, clamping, root edge cases note 0/127).
2. FSM trigger-mode handling (gate releases on key-up; one-shot ignores key-up, releases at end; toggle flips).
3. MIDI wiring + UI + persistence; **live-runtime check (Gate 18):** play a chord on a connected/virtual MIDI keyboard against the running app launched from the edited worktree before claiming ready.

### TEST PLAN
```bash
cd ~/Development/entropic-v2challenger/frontend
npx --no vitest run src/__tests__/components/instruments/melodic-mapping.test.ts
npx --no vitest run src/__tests__/components/instruments/voiceFSM.test.ts
npx --no vitest run
```
Named new tests: "note above root offsets startFrame by framesPerSemitone per semitone" · "note-to-speed mode scales speed by equal-temperament ratio and clamps at ±8" · "melodic offset clamps to clip bounds at extreme notes (0, 127)" · "one-shot voice ignores release event and auto-releases at clip end" · "gate voice releases on key-up" · "toggle trigger alternates voice on/off per press" · "two simultaneous notes produce two voices with distinct startFrames (chord)" · "out-of-range note (-1, 128) and NaN velocity dropped at the MIDI boundary (negative)" · "full chain: MIDI noteOn → midi store → TriggerEvent on the selected performance track → buildVoiceLayers emits a layer whose frame_index reflects the melodic offset (mock IPC)"

### ACCEPTANCE GATES
- Chord test proves polyphony × melodic interaction (2 notes, 2 voices, distinct frames, within cap).
- Determinism: melodic voices replay identically (extends the P5a.1 purity test).

### ROLLBACK
Revert; optional fields, additive MIDI path.

### EVIDENCE for PR body
- vitest output; table note→(startFrame, speed) for C4±12 from a test run.

---

# ── B4: Sample Rack (4 packets) ──

## P5a.9 — RackNode leaf + track-bound Sample Rack host

- **ID:** P5a.9 · **branch:** `feat/p5a9-rack-host` · **base:** `origin/main` · **depends-on:** P5a.3 (track-bound instruments + armed pads), P5a.8 (trigger modes reused per pad) · **Est:** ~4h · **Model:** Sonnet
- **Goal:** A performance track can host a Sample Rack: pad grid where each pad holds a `RackNode` leaf (`{instrument, chain, sends}`), replacing the single global `DrumRack` for that track.

### PRECONDITIONS (mismatch → STOP)
```bash
cd ~/Development/entropic-v2challenger
git grep -n "drumRack" frontend/src/renderer/stores/performance.ts | head -3
# EXPECT: single global drumRack (not track-keyed)
git grep -rn "RackNode" frontend/src/
# EXPECT: 0 hits
git grep -n "interface Pad" frontend/src/shared/types.ts
# EXPECT: Pad with modRoutes (NOT mappings), chokeGroup, envelope
gh pr view 167 --repo nissimdirect/entropic-v2challenger --json state -q .state
# EXPECT: MERGED
```

### Scope (verified paths)
- [ ] `frontend/src/shared/types.ts` — `RackNodeLeaf {kind: 'leaf'; instrument: SamplerInstrumentV1; chain: EffectInstance[]; sends: Send[]}`; `Send {returnId: string; amount: number}`; `SampleRack {pads: Pad[]; nodes: Record<padId, RackNodeLeaf>; returns: ReturnBus[]; macros: Macro[]; chokeGroups handled via existing Pad.chokeGroup}` (returns/macros TYPES land here, BEHAVIOR lands P5a.10/P5a.11 — fields default empty).
- [ ] `frontend/src/renderer/stores/instruments.ts` — track instrument union: `Record<trackId, SamplerInstrumentV1 | SampleRack>` with `addRack(trackId)`; type guard helpers. (This EXTENDS #167's store — keep its action names/signatures intact.)
- [ ] `frontend/src/renderer/components/instruments/InstrumentsBrowser.tsx` — enable the "Drum Rack" entry (#167 ships it disabled) → drag payload `{kind:'instruments', id:'rack'}`.
- [ ] NEW `frontend/src/renderer/components/instruments/RackDevice.tsx` — device-row editor: pad grid (REUSE `PadGrid.tsx` rendering, parameterized by rack) + selected-pad detail (instrument params via `SamplerDevice` internals, chain placeholder).
- [ ] `frontend/src/renderer/App.tsx` render effect — rack tracks: each pad's active voices → `buildVoiceLayers` per leaf, all layers concatenated (summing/sends are P5a.10).
- [ ] Persistence: track-keyed rack round-trip (extend #167 pattern).
- [ ] Tests: NEW `__tests__/stores/rack-host.test.ts`, NEW `__tests__/components/instruments/rack-device.test.tsx`.

### DO-NOT-TOUCH
- Global `drumRack` in `performance.ts` and its pad flow (legacy pads keep working until B5 migration; this packet ADDS the track-bound rack alongside)
- `backend/**`
- `loadDrumRack` (recursion is P5a.13)

### Implementation steps
1. Types + store union + guards (+ store tests first).
2. Browser enablement + drop handler (mirror #167's sampler drop exactly).
3. RackDevice UI reusing PadGrid; pad trigger routes through the SAME `TriggerEvent` path with `instrumentId = padId`-scoped ids.
4. Render wiring + persistence; **live-runtime check (Gate 18):** drop a rack and trigger 2 pads in the running app launched from the edited worktree before claiming ready.

### TEST PLAN
```bash
cd ~/Development/entropic-v2challenger/frontend
npx --no vitest run src/__tests__/stores/rack-host.test.ts
npx --no vitest run src/__tests__/components/instruments/rack-device.test.tsx
npx --no vitest run
```
Named new tests: "dragging Drum Rack onto a performance track instantiates an empty SampleRack" · "a track holds either a sampler or a rack, never both" · "pad with a leaf sampler triggers voices attributed to that pad's instrumentId" · "two pads triggered together yield layers from both leaves within the global voice cap" · "rack persists and rehydrates with pads, leaves and empty returns/macros" · "removing the track removes its rack (no orphan)" · "legacy global drumRack still triggers (regression)" · "dropping a rack onto a non-performance track is rejected with zero store mutation (negative)" · "full chain: rack drop → store → pad trigger → composite payload contains that pad's voice layer (mock IPC)"

### ACCEPTANCE GATES
- Wiring Check (Gate 14): every RackDevice callback proven by a test (pad select, param edit, trigger).
- Store union introduces zero `any` (kieran-typescript bar): grep gate `git grep -n ": any" frontend/src/renderer/stores/instruments.ts` → 0.

### ROLLBACK
Revert; rack is a new union arm — saves without racks unaffected. Persisted racks from this packet are lost on revert (acceptable pre-release; note in PR body).

### EVIDENCE for PR body
- vitest output; screenshot of rack in the device row with 2 pads sounding.

---

## P5a.10 — Ableton-style channels: per-pad chain + sends/returns, summed rack output

- **ID:** P5a.10 · **branch:** `feat/p5a10-rack-sends-returns` · **base:** `origin/main` · **depends-on:** P5a.9 · **RISK:HIGH** · **Est:** ~4h · **Model:** Opus/Fable (RISK:HIGH)
- **Goal:** Each pad is a channel (own effect chain), pads send to shared return busses (return = chain applied to a composite of its senders), and everything sums to ONE rack output layer-set on the track.

### PRECONDITIONS (mismatch → STOP)
```bash
cd ~/Development/entropic-v2challenger
git grep -n "RackNodeLeaf" frontend/src/shared/types.ts
# EXPECT: leaf with chain + sends (P5a.9)
git grep -n "layer_type.*video\|chain" frontend/src/renderer/components/instruments/types.ts | head -3
# EXPECT: SamplerVoiceLayer.chain is EffectInstance[] (P5a.7 widened it; if still never[], widen here)
git grep -n "MAX_CHAIN_DEPTH" backend/src/security.py
# EXPECT: = 10 — per-layer chains are already depth-validated server-side
```

### Scope (verified paths)
- [ ] `frontend/src/renderer/components/instruments/buildVoiceLayers.ts` (or successor) — pad voices carry the pad's `chain` on their layer dicts (backend `_handle_render_composite` already applies per-layer chains + validates depth — zero backend change for channels).
- [ ] Returns: NEW `frontend/src/renderer/components/instruments/buildRackLayers.ts` — pure: `(rack, voicesByPad, assets, frame) → layers[]`; for each `ReturnBus` with ≥1 nonzero send, emit ADDITIONAL layers = sender voices' layers re-emitted with the return's chain and `opacity *= send.amount`, `voice_id = voiceId + ':ret:' + returnId`. (Send = re-render through the return chain; true single-pass bus mixing needs a backend tree — that is B5's traversal, NOT here. Document this approximation in the module docstring.)
- [ ] Per-pad mixer fields on the leaf: `opacity`, `blendMode`, `mute`, `solo` — applied in `buildRackLayers`.
- [ ] Fan-out caps (quantified, enforced at BOTH layers): `MAX_SENDS_PER_PAD = 4` and `MAX_RETURNS_PER_RACK = 4` — constants in `backend/src/security.py`, rejected at file load in `backend/src/project/schema.py` (same P1-5 enforcement point P5a.11 uses), mirror-clamped with toast in the frontend store. Worst-case layer math (state it in the test): 4 voices + 4 seam layers + (4 voices × 4 returns = 16) return layers = 24 ≤ `MAX_COMPOSITE_LAYERS` (50).
- [ ] Layer-budget guard: total emitted layers (voices + seams + returns) ≤ `MAX_COMPOSITE_LAYERS` — clamp by dropping return layers first, toast once (`stores/toast.ts` source-keyed dedup).
- [ ] `RackDevice.tsx` — per-pad chain editor (reuse the track effect-chain UI pattern — find via `git grep -n "effectChain" frontend/src/renderer/components/ | head`), sends knobs, return strip, M/S.
- [ ] Tests: NEW `__tests__/components/instruments/buildRackLayers.test.ts` + RackDevice additions.

### DO-NOT-TOUCH
- `backend/**` (the existing per-layer chain path is the whole point)
- `voiceFSM.ts`

### Implementation steps
1. `buildRackLayers` pure + tests FIRST (this is the load-bearing logic).
2. Mixer fields + fan-out caps + budget guard + toast.
3. UI editors; **live-runtime check (Gate 18):** two pads + one return visibly compositing in the running app launched from the edited worktree before claiming ready.

### TEST PLAN
```bash
cd ~/Development/entropic-v2challenger/frontend
npx --no vitest run src/__tests__/components/instruments/buildRackLayers.test.ts
npx --no vitest run
```
Named new tests: "pad chain rides on that pad's voice layers only" · "send amount 0 emits no return layer" · "two pads sending to one return each get a return layer with the return chain" · "return layer opacity scales by send amount" · "muted pad emits no layers; soloed pad silences siblings" · "layer budget: return layers dropped first when exceeding MAX_COMPOSITE_LAYERS, with one deduped toast" · "send/return determinism: same inputs → identical layer array" · "fifth send on one pad refused (MAX_SENDS_PER_PAD=4, negative)" · "fifth return bus refused (MAX_RETURNS_PER_RACK=4, negative)" · "project file exceeding either fan-out cap rejected at load (backend, negative)"

### ACCEPTANCE GATES
- Budget test proves the frontend NEVER sends > `MAX_COMPOSITE_LAYERS` (the backend would reject the whole render — user-visible black frame; this is the RISK:HIGH edge).
- Solo/mute symmetry test (enable+disable returns to baseline output).

### ROLLBACK
Revert; sends/returns are additive fields defaulting to silent/empty.

### EVIDENCE for PR body
- vitest output; layer-count table for a 4-pad + 2-return worst case proving budget compliance.

---

## P5a.11 — 8 macros + fan-out caps + rack choke groups

- **ID:** P5a.11 · **branch:** `feat/p5a11-rack-macros-choke` · **base:** `origin/main` · **depends-on:** P5a.10 · **Est:** ~4h · **Model:** Sonnet
- **Goal:** Each rack gets 8 macro knobs fanning out to one-or-many param destinations (capped server-side), and choke groups force-idle sibling pads atomically.

### PRECONDITIONS (mismatch → STOP)
```bash
cd ~/Development/entropic-v2challenger
git grep -n "MAX_MODROUTES_PER_MACRO\|MAX_MACRO_EDGES_TOTAL" backend/src/security.py
# EXPECT: 0 hits (this packet adds both)
git grep -n "applyCCModulations" frontend/src/renderer/App.tsx
# EXPECT: import :55 + call ~:111 (the one-to-many precedent to mirror)
git grep -n "chokeGroup" frontend/src/shared/types.ts
# EXPECT: Pad.chokeGroup: number | null
git grep -n "applyChoke" frontend/src/renderer/components/instruments/voiceFSM.ts
# EXPECT: 1 export (P5a.1)
```

### Scope (verified paths)
- [ ] `frontend/src/shared/types.ts` — `Macro {id, label, value: number /*0..1*/, routes: MacroRoute[]}`; `MacroRoute {padId, target: 'instrument' | 'chain', paramPath, min, max, curve?: 'linear' | 'exp' | 'log' /*default 'linear'; applied to the 0..1 macro value BEFORE min/max scaling*/}`.
- [ ] NEW `frontend/src/renderer/components/instruments/applyMacros.ts` — pure, clones-not-mutates (the `applyCCModulations` pattern: finite-guard, min/max scale); applied in `buildRackLayers` before chain attachment.
- [ ] `backend/src/security.py` — `MAX_MODROUTES_PER_MACRO = 16`, `MAX_MACRO_EDGES_TOTAL = 256` (macro-route edge cap; the mod-routing edge cap `MAX_MOD_EDGES_TOTAL` is P5b.21's, a different constant); `backend/src/project/schema.py` — reject racks exceeding caps on FILE LOAD (the §10 P1-5 enforcement point; macros never cross IPC individually, so load-time is the trust boundary).
- [ ] Frontend mirror-clamp: `addMacroRoute` refuses past-cap with toast (UX convention; backend is the boundary).
- [ ] Choke: pad trigger with `chokeGroup` n emits a choke event → `applyChoke` idles sibling voices in the same rack + group (atomically, same frame).
- [ ] `RackDevice.tsx` — 8 macro knobs + a learn/assign flow (click macro → click param), choke-group selector per pad (exists on `PadEditor` — reuse: `git grep -ln "chokeGroup" frontend/src/renderer/components/performance/`).
- [ ] Tests: NEW `applyMacros.test.ts`, `voiceFSM.test.ts` choke-in-rack additions, backend schema cap tests.

### DO-NOT-TOUCH
- `applyCCModulations.ts`; MIDI CC flow (macros are a separate modulation layer; CC→macro mapping is future).

### Implementation steps
1. security constants + schema validation + pytest.
2. `applyMacros` pure + vitest.
3. Choke wiring through the FSM event stream.
4. UI; **live-runtime check (Gate 18):** one macro knob sweep visibly modulating two destinations in the running app launched from the edited worktree before claiming ready.

### TEST PLAN
```bash
cd ~/Development/entropic-v2challenger/frontend
npx --no vitest run src/__tests__/components/instruments/applyMacros.test.ts
npx --no vitest run
cd ../backend && python -m pytest -x -n auto --tb=short
```
Named new tests: "one macro drives many destinations scaled to each route's min/max" · "macro route past MAX_MODROUTES_PER_MACRO refused with toast" · "project file exceeding MAX_MACRO_EDGES_TOTAL rejected at load (backend)" · "macro write is clone-not-mutate (input chain unmutated)" · "trigger in choke group idles same-group sibling voices in the same frame" · "choke across different groups does not interact" · "pad delete removes its macro routes and choke membership (cleanup symmetry)" · "macro-curve value-range: for EACH curve (linear/exp/log), value 0 maps EXACTLY to route min, 1 EXACTLY to max, and every sampled value in between (0.1 steps) stays within [min,max]" · "inverted route (min > max) maps monotonically decreasing and stays within [max,min]" · "macro value outside [0,1] is clamped BEFORE the curve applies (negative)" · "NaN macro value leaves every destination at its unmodulated value (negative)" · "unknown curve string coerces to 'linear' on load (negative)"

### ACCEPTANCE GATES
- Caps enforced in `schema.py` (backend test), not only UI.
- Pad-delete cleanup symmetry test (B4 OUT-gate: "pad delete cleans voice + MIDI + undo symmetrically").

### ROLLBACK
Revert; macros default empty, schema rules only reject NEW over-cap content.

### EVIDENCE for PR body
- vitest + pytest outputs; grep of the two new constants in security.py.

---

## P5a.12 — Slicing (transient/grid/manual) → slice-to-rack round trip

- **ID:** P5a.12 · **branch:** `feat/p5a12-slice-to-rack` · **base:** `origin/main` · **depends-on:** P5a.9 (rack to emit into); P5a.8 (per-pad startFrame mapping) · **Est:** ~4h · **Model:** Sonnet
- **Goal:** Slice a sampler's source (scene-change "transient", fixed grid, or manual markers) and emit a Sample Rack with one pad per slice, each leaf a sampler windowed `[sliceStart, sliceEnd)`.

### PRECONDITIONS (mismatch → STOP)
```bash
cd ~/Development/entropic-v2challenger
git grep -rln "scene" backend/src/video/ backend/src/engine/ | head -5
# RECORD result: if a scene/cut-detection helper exists, REUSE it for transient mode; if 0 hits, transient mode = new backend cmd (see step 1)
git grep -n "addRack" frontend/src/renderer/stores/instruments.ts
# EXPECT: 1 hit (P5a.9)
git grep -rn "slice" frontend/src/renderer/components/instruments/
# EXPECT: 0 hits
```

### Scope (verified paths)
- [ ] Backend NEW cmd `detect_slices` in `backend/src/zmq_server.py` (+ impl in `backend/src/video/` or reused scene-detect per precondition): `{asset_path, mode: 'transient', threshold} → {slice_frames: int[]}`; frame-diff threshold detector is sufficient (mean abs luma diff > threshold; threshold clamped finite to (0, 1], default 0.3); cap result count to 64; `validate_upload` the path (SEC-5 mirror).
- [ ] Frontend NEW `frontend/src/renderer/components/instruments/computeSlices.ts` — pure for grid/manual modes: `grid(frameCount, divisions) → frames[]`, `manual(markers) → frames[]`; transient calls the backend cmd.
- [ ] `sliceToRack(trackId, sliceFrames)` store action: builds a `SampleRack`, pad i = leaf sampler `{clipId, startFrame: slice[i], endFrame: slice[i+1]-1, triggerMode: 'oneShot'}`, ≤16 pads per rack page (Ableton 4x4 parity — `DrumRack.grid: '4x4'` precedent); surplus slices: cap at 16, toast the surplus count.
- [ ] `SamplerDevice.tsx` — "Slice" section: mode select, threshold/divisions input, preview slice count, "Slice to Rack" button (replaces the track's sampler with the rack after confirm).
- [ ] Tests: NEW `computeSlices.test.ts`, store round-trip test, backend `tests/test_detect_slices.py`.

### DO-NOT-TOUCH
- Export path; `compositor.py`; existing rack internals beyond the documented `addRack`/store API.

### Implementation steps
1. Backend detector + pytest (incl. path validation + count cap).
2. Pure slice math + vitest.
3. Store action + confirm-replace flow + UI; **live-runtime check (Gate 18):** slice a real clip and trigger 3 pads in the running app launched from the edited worktree before claiming ready.

### TEST PLAN
```bash
cd ~/Development/entropic-v2challenger/backend
python -m pytest tests/test_detect_slices.py -x --tb=short
cd ../frontend
npx --no vitest run src/__tests__/components/instruments/computeSlices.test.ts
npx --no vitest run
```
Named new tests: "grid mode yields exactly N equal slices covering the clip" · "manual markers pass through sorted and deduped" · "slice count equals detected transient count (synthetic 3-cut fixture)" · "slice to rack creates one pad per slice with contiguous start/end windows" · "17+ slices clamp to 16 pads with a toast naming the surplus" · "slice-to-rack round trip: triggering pad k renders the frame at slice k's start" · "detect_slices rejects traversal path before decode (backend)" · "slicing a 1-frame clip yields exactly one slice [0]; grid divisions > frameCount clamp to frameCount slices, no empty window (negative)" · "threshold NaN / 0 / -1 / 2 rejected-or-clamped to (0,1] before decode (backend, negative)"

### ACCEPTANCE GATES
- Round-trip gate (B4 OUT-gate): pad k's first rendered frame == slice k start (integration test through `buildVoiceLayers`).
- Backend detector capped + path-validated before decode.

### ROLLBACK
Revert; `detect_slices` is a new cmd (no caller after revert = dead but harmless; remove in revert anyway), store action additive.

### EVIDENCE for PR body
- pytest + vitest outputs; slice-frame table for the synthetic fixture.

---

# ── B5: Grouping / composite tree (3 packets) ──

## P5a.13 — RackNode branch schema + depth caps + recursive pad reconciliation

- **ID:** P5a.13 · **branch:** `feat/p5a13-rack-branch-schema` · **base:** `origin/main` · **depends-on:** P5a.11 · **Est:** ~4h · **Model:** Sonnet
- **Goal:** `RackNode` becomes recursive (`branch = {children, chain, composite:{opacity,mode}, chokeGroups, voiceCap, macros}`), with `MAX_BRANCH_DEPTH` enforced at load + IPC, and rack-loading reconciliation recursing into branch children (fixes the flat `rack.pads.map` orphan bug, §10 P2-2).

### PRECONDITIONS (mismatch → STOP)
```bash
cd ~/Development/entropic-v2challenger
git grep -n "rack.pads.map" frontend/src/renderer/stores/performance.ts
# EXPECT: 1 hit ~:320 (flat reconciliation — the bug this fixes)
git grep -n "MAX_BRANCH_DEPTH" backend/src/security.py
# EXPECT: 0 hits
git grep -n "RackNodeLeaf" frontend/src/shared/types.ts
# EXPECT: present (P5a.9)
```

### Scope (verified paths)
- [ ] `frontend/src/shared/types.ts` — `RackNode = RackNodeLeaf | RackNodeBranch`; `RackNodeBranch {kind: 'branch'; children: RackNode[]; chain: EffectInstance[]; composite: {opacity: number; mode: BlendMode}; chokeGroups: number[]; voiceCap: number; macros: Macro[]}`; a pad may hold a branch (`SampleRack.nodes: Record<padId, RackNode>`).
- [ ] NEW `frontend/src/renderer/components/instruments/rackTree.ts` — pure helpers: `walkRack(node, visit)` (post-order), `rackDepth(node)`, `collectPads(node)` (recursive pad enumeration), `validateRack(node) → string[]` (depth ≤ cap, voiceCap ≥ 1, finite composite opacity).
- [ ] `backend/src/security.py` — `MAX_BRANCH_DEPTH = 4` and `MAX_RACK_NODES_TOTAL = 64` (both caps quantified: nesting ≤ 4 deep, ≤ 64 total nodes per rack); `backend/src/project/schema.py` — recursive rack validation on load (depth, node count, caps, finite numerics, known kinds; reuse `_walk_structure`'s depth-guard idiom at :90 — the validator itself MUST be depth-guarded so a hostile file can never drive it into `RecursionError`).
- [ ] `frontend/src/renderer/stores/performance.ts` `loadDrumRack` (and the rack-store equivalent from P5a.9) — reconciliation uses `collectPads` so nested pads keep MIDI notes + undo invalidation correct (today flat `rack.pads.map` orphans nested pads).
- [ ] Persistence round-trip for nested racks.
- [ ] Tests: NEW `__tests__/components/instruments/rackTree.test.ts`, backend schema tests, store reconciliation tests.

### DO-NOT-TOUCH
- Render path (`buildRackLayers` stays leaf-only until P5a.14 — branches render NOTHING yet; `validateRack` passes but the App render skips branch nodes with a console.warn, tested)
- `zmq_server.py` (hierarchical state keys are P5a.15)

### Implementation steps
1. Types + pure tree helpers + vitest.
2. Backend schema recursion + caps + pytest.
3. Reconciliation rewrite + tests proving nested pad MIDI/undo survival.

### TEST PLAN
```bash
cd ~/Development/entropic-v2challenger/frontend
npx --no vitest run src/__tests__/components/instruments/rackTree.test.ts
npx --no vitest run
cd ../backend && python -m pytest -x -n auto --tb=short
```
Named new tests: "walkRack visits children before parents (post-order)" · "rackDepth counts nesting and validateRack rejects depth > MAX_BRANCH_DEPTH" · "collectPads enumerates pads inside nested branches" · "loading a nested rack reconciles MIDI notes for nested pads (no orphans)" · "loading a nested rack clears undo exactly once" · "project file with depth-5 rack rejected at load (backend)" · "branch node renders nothing pre-P5a.14 (guard, with warn)" · "depth-bomb: a 64-deep nested rack file is rejected at load in <100ms with a clear error — no RecursionError, no stack overflow (negative, BOTH layers)" · "node-count bomb: rack with 65 total nodes rejected (MAX_RACK_NODES_TOTAL=64, negative)"

### ACCEPTANCE GATES
- Depth cap enforced in BOTH `schema.py` (load) and `validateRack` (frontend) — tests at both layers.
- Nested-pad reconciliation test fails on the old `rack.pads.map` code (verify by temporarily reverting the fix — note the run in the PR body).

### ROLLBACK
Revert; branch is a new union arm; saves with branches are lost on revert (pre-release acceptable, note it).

### EVIDENCE for PR body
- vitest + pytest outputs; the red-then-green reconciliation run.

---

## P5a.14 — Post-order render traversal: branch → composite → branch chain → one layer up · **RISK:HIGH**

- **ID:** P5a.14 · **branch:** `feat/p5a14-rack-render-traversal` · **base:** `origin/main` · **depends-on:** P5a.13 · **Est:** ~4h · **Model:** Opus/Fable (RISK:HIGH)
- **Goal:** Branches render: children's layers composite into one frame (`render_composite`), the branch chain applies to that frame, and ONE layer goes upward — recursively, depth-capped, within the voice budget.

> **Architecture (decide-before-code, comment the citation):** keep the sidecar stateless — the
> frontend FLATTENS the tree into a single ordered layer list per frame using **nested composite
> commands**: a NEW backend layer type `{layer_type: 'subcomposite', layers: [...], chain, opacity,
> blend_mode}` handled recursively inside `_handle_render_composite` (one IPC round-trip, recursion
> server-side, depth re-validated server-side). This mirrors INSTRUMENTS.md §5 "recursion is a
> small isolated backend add". Do NOT issue N sequential render IPCs per frame (latency) and do
> NOT add persistent tree state to the sidecar.

### PRECONDITIONS (mismatch → STOP)
```bash
cd ~/Development/entropic-v2challenger
git grep -n "walkRack" frontend/src/renderer/components/instruments/rackTree.ts
# EXPECT: post-order helper exists (P5a.13)
git grep -n "subcomposite" backend/src/zmq_server.py backend/src/engine/compositor.py
# EXPECT: 0 hits
git grep -n "layer_type" backend/src/zmq_server.py | head -3
# EXPECT: 'video'/'text' dispatch inside _handle_render_composite (~:730-760)
git grep -n "MAX_BRANCH_DEPTH" backend/src/security.py
# EXPECT: 1 hit (P5a.13)
```

### Scope (verified paths)
- [ ] `backend/src/engine/compositor.py` — `render_composite` accepts a layer whose dict carries pre-rendered `frame` (it already does — layers arrive decoded) → NO change here; recursion lives in the handler.
- [ ] `backend/src/zmq_server.py` `_handle_render_composite` — extract the layer-decode loop into `_decode_layer(layer_info, depth)`; `layer_type == 'subcomposite'` recurses: decode child layers (depth+1, reject > `MAX_BRANCH_DEPTH`), `render_composite` them, apply the branch chain via the existing per-layer chain path, return the composited frame as this layer's `frame`. Voice budget: count voice-bearing layers across the WHOLE tree (`validate_voice_layers` runs on the flattened count).
- [ ] `frontend/src/renderer/components/instruments/buildRackLayers.ts` — branch nodes emit one `subcomposite` layer built by post-order `walkRack`; branch `voiceCap` trims that subtree's voices oldest-first BEFORE emission; branch `composite.{opacity,mode}` on the subcomposite layer.
- [ ] Tests: NEW `backend/tests/test_subcomposite_render.py`; `buildRackLayers.test.ts` branch additions.

### DO-NOT-TOUCH
- State keying (`layer_id`) semantics — P5a.15 owns hierarchical keys; this packet keeps current ids (KNOWN aliasing limitation, documented in code comment + PR body)
- `export.py` (subcomposite-in-export rides P5a.4's path automatically once both merged — add one integration test if both are in)

### Implementation steps
1. Backend `_decode_layer` extraction (pure refactor, all existing tests green BEFORE adding recursion — commit separately).
2. Recursion + depth/budget enforcement + pytest.
3. Frontend subcomposite emission + branch voiceCap trim + vitest.

### TEST PLAN
```bash
cd ~/Development/entropic-v2challenger/backend
python -m pytest tests/test_subcomposite_render.py -x --tb=short
python -m pytest -x -n auto --tb=short
cd ../frontend && npx --no vitest run src/__tests__/components/instruments/buildRackLayers.test.ts
```
Named new tests: "subcomposite layer composites its children then applies the branch chain (pixel assertion vs manual two-step: byte-equal uint8 output — same ops in the same order; any nonzero diff fails)" · "nested branch (depth 3) renders equivalently to manual bottom-up composition" · "depth beyond MAX_BRANCH_DEPTH rejected server-side before decode" · "depth-bomb: 64-deep nested subcomposite IPC payload rejected pre-decode in <100ms, no RecursionError (negative)" · "flattened voice count across tree enforced against MAX_TOTAL_VOICES_PER_RENDER" · "branch voiceCap trims subtree voices oldest-first (frontend)" · "decode-loop refactor: all pre-existing composite tests unchanged (regression commit)" · "empty branch emits a transparent layer, not an error"

### ACCEPTANCE GATES
- Nested-vs-manual pixel-equality test is the correctness oracle (B5 OUT-gate "nested-branch composite correctness").
- Refactor commit shows full backend suite green with zero behavior change before recursion lands.

### ROLLBACK
Two commits (refactor, recursion) → revert recursion alone if needed. `subcomposite` is a new layer_type — no existing client sends it.

### EVIDENCE for PR body
- pytest outputs for both commits; the pixel-equality assertion snippet.

---

## P5a.15 — Hierarchical state keys (path-from-root) + sibling-reorder isolation · **RISK:HIGH**

- **ID:** P5a.15 · **branch:** `feat/p5a15-hierarchical-state-keys` · **base:** `origin/main` · **depends-on:** P5a.14 (and P5a.2's diff-based cache) · **Est:** ~4h · **Model:** Opus/Fable (RISK:HIGH)
- **Goal:** Per-layer effect state inside nested racks is keyed by path-from-root, so stateful effects (datamosh etc.) in sibling subtrees never alias when siblings reorder — INSTRUMENTS.md §10 P2-2.

### PRECONDITIONS (mismatch → STOP)
```bash
cd ~/Development/entropic-v2challenger
git grep -n "subcomposite" backend/src/zmq_server.py | head -3
# EXPECT: recursion handler present (P5a.14)
git grep -n 'voice:' backend/src/zmq_server.py | head -3
# EXPECT: voice keying present (P5a.2)
git grep -n "layer_signature" backend/src/zmq_server.py | head -3
# EXPECT: tuple-of-layer_ids signature + diff-based _get_composite_states
```

### Scope (verified paths)
- [ ] `backend/src/zmq_server.py` — `_decode_layer` threads a `path` argument (e.g. `root/2/sub/0`); inside a subcomposite, child `layer_id`s are prefixed: `{path}/{voice:...|asset:...}`; the subcomposite's own branch-chain state keys as `{path}/branch`. State threading for child layers inside a recursion uses the SAME top-level `_composite_states` dict (flat dict, hierarchical keys) so `_get_composite_states` diffing keeps working unchanged. Path segments are validated server-side at the trust boundary: each `nodeId` matches `^[A-Za-z0-9_-]{1,64}$`, total path length ≤ 512 chars, segment count ≤ `MAX_BRANCH_DEPTH` + 1 — forged/malformed paths rejected before decode (mirrors P5a.2's voice_id regex discipline).
- [ ] `frontend/src/renderer/components/instruments/buildRackLayers.ts` — emit a stable `node_id` per RackNode (persisted uuid on the node, NOT array index) that the backend uses as the path segment — array indices alias on reorder, which is the exact bug; add `nodeId: string` to `RackNodeBranch`/leaf in `shared/types.ts` + persistence + reconciliation (P5a.13's `collectPads` carries it).
- [ ] Tests: NEW `backend/tests/test_hierarchical_state_keys.py`; frontend nodeId persistence tests.

### DO-NOT-TOUCH
- `compositor.py` (keys are produced in the handler; compositor just honors `layer_id`)
- Flat (non-rack) render paths — their `asset:`/`voice:` keys must remain byte-identical (regression gate)

### Implementation steps
1. `nodeId` on rack nodes + persistence/reconciliation + vitest.
2. Path threading through `_decode_layer` recursion + pytest.
3. The aliasing oracle: two sibling branches, each containing the same clip + datamosh; reorder siblings between frames → each subtree's state follows its nodeId, outputs differ from the aliased (pre-fix) behavior.

### TEST PLAN
```bash
cd ~/Development/entropic-v2challenger/backend
python -m pytest tests/test_hierarchical_state_keys.py -x --tb=short
python -m pytest -x -n auto --tb=short
cd ../frontend && npx --no vitest run
```
Named new tests: "sibling branches with identical content keep independent stateful-effect state" · "reordering siblings does not swap or reset their effect state (state follows nodeId)" · "same clip in two subtrees never shares datamosh state (aliasing oracle)" · "flat non-rack renders produce identical layer_ids to pre-packet (regression fixture)" · "removing one branch drops only its subtree's state entries (cleanup symmetry)" · "nodeId persists through save/load and survives rack reconciliation" · "forged path (traversal chars / 4KB string / 65-char nodeId segment / 6-segment path) rejected before decode (negative)"

### ACCEPTANCE GATES
- Aliasing oracle red on pre-fix keying, green after (run both, paste both).
- Flat-path regression fixture proves zero change for non-rack projects.
- If P5a.4 is merged: one export determinism run with a nested rack (byte-identical double export).

### ROLLBACK
Revert; `nodeId` is additive in persistence; backend falls back to non-prefixed keys for layers without paths.

### EVIDENCE for PR body
- pytest outputs incl. the red/green oracle runs; `git grep -n "asset:" backend/src/zmq_server.py` before/after showing the flat path untouched.

---

# Discrepancies found while verifying sources (read before executing ANY packet)

1. **STALE in INSTRUMENTS-BUILD-PLAN.md / INSTRUMENTS.md:** `MAX_COMPOSITE_LAYERS` ALREADY exists (`security.py:48`, INJ-3) and negative `frame_index` is ALREADY rejected with a tail clamp in `_handle_render_composite` — the docs' "today: no cap / bare int()" claims predate PR #161-era hardening. Packets above assume the shipped state.
2. **`Pad.mappings → modRoutes` rename ALREADY shipped** (`shared/types.ts:344`) — listed in the build plan as a pending PR-B injection; do not re-do.
3. **`Date.now()` preview seeds ALREADY replaced** by the project-store seed (HT-4, `App.tsx:154` comment) — the build plan's "App.tsx:840,857" references are gone. The export-path-only determinism rule still stands.
4. **`padActions.ts` lives at `frontend/src/renderer/components/performance/padActions.ts`** (docs cite stale line numbers); it still embeds `performance.now()` + `modRoutes` in capture events — P1-2 is live and fixed in P5a.1.
5. **`export.py` is at `backend/src/engine/export.py`** (docs say `export.py:310`; `_run_export` is :311 — close) and is **single-input only**: no composite/multi-layer export exists on origin/main. B2's "backend export replay" is therefore a bigger lift than the plan's framing — P5a.4 is RISK:HIGH with an explicit split-point (P5a.4b) if it exceeds 4h.
6. **zmq_server line drift:** docs cite :690-692/:728/:763-765/:782; actual on d821ae8: cache reset ~:694-696, frame_index parse ~:737 (with INJ-3 guard), `asset:` keying ~:793. Preconditions use greps, not line numbers, for this reason.
7. **PR #167 (B2-lite) is OPEN, not merged** — it already delivers: track-keyed instruments store, InstrumentsBrowser (deletes InstrumentsPanel), performance-track creation/rendering, drag-sampler-to-track, drag-video-to-sampler, track-keyed persistence. P5a.3+ hard-gate on its merge; P5a.1/P5a.2 deliberately avoid its files so they can run now.
8. **`types.ts:60` for `Track.type`** (docs) → actually `shared/types.ts:57-79` on current main.
9. **No transient/onset detector exists for video** (`onset` hits are audio-side: `modulation/audio_follower.py`) — P5a.12's transient slicing requires a new `detect_slices` backend cmd, not a reuse.

---

# Thickness scorecard (rubric pass 2026-06-11)

Rubric: **R1** anchors grep-verified in preconditions · **R2** full contract incl. Est + Model line · **R3** named tests + exact commands (+ live-runtime step for UI packets) · **R4** every gate quantified (ms/counts/bytes) · **R5** ≥1 negative test · **R6** named full-chain integration test (n/a for docs-only) · **R7** depends-on resolve to defined IDs/gates. Cells are before→after.

| Packet | R1 | R2 | R3 | R4 | R5 | R6 | R7 |
|---|---|---|---|---|---|---|---|
| P5a.1 | ✅→✅ | ❌→✅ (Est/Model added; FSM table + steal tie-break pinned) | ✅→✅ | ⚠️→✅ (100-replay determinism quantified) | ✅→✅ (illegal-transition negatives added) | n/a (pure module; chain lands P5a.3) | ✅→✅ |
| P5a.2 | ✅→✅ | ❌→✅ | ✅→✅ | ✅→✅ | ✅→✅ (steal-under-load growth test added) | n/a (backend lib; chain lands P5a.3) | ✅→✅ |
| P5a.3 | ✅→✅ | ❌→✅ | ⚠️→✅ (Gate-18 live-runtime step formalized) | ✅→✅ | ⚠️→✅ (NaN-frameIndex store negative added) | ❌→✅ (named full-chain pad→store→payload test) | ✅→✅ |
| P5a.4 | ✅→✅ | ❌→✅ | ✅→✅ | ⚠️→✅ (MAX_CAPTURE_EVENTS=10,000 quantified) | ✅→✅ (+over-cap event-list negative) | ✅→✅ (export byte-identity IS the chain test) | ✅→✅ |
| P5a.4a | ✅→✅ | ❌→✅ | ✅→✅ | ✅→✅ | ❌→✅ (negative self-test of the grep gate) | n/a (docs-only) | ✅→✅ |
| P5a.5 | ✅→✅ | ❌→✅ | ⚠️→✅ (live-runtime step added) | ⚠️→✅ (seam weights sum 1±1e-6) | ✅→✅ (+1-frame-clip negative) | ❌→✅ (UI→store→payload chain test) | ✅→✅ |
| P5a.6 | ✅→✅ | ❌→✅ | ⚠️→✅ (live-runtime step added) | ✅→✅ | ✅→✅ | n/a (math lands inside P5a.5's chain) | ✅→✅ |
| P5a.7 | ✅→✅ | ❌→✅ | ⚠️→✅ (live-runtime step added) | ✅→✅ ([-30,30] caps) | ✅→✅ | n/a (layer construction covered by P5a.3 chain) | ✅→✅ |
| P5a.8 | ✅→✅ | ❌→✅ | ⚠️→✅ (live-runtime step added) | ✅→✅ | ⚠️→✅ (+out-of-range note/velocity negative) | ❌→✅ (MIDI→store→payload chain test) | ✅→✅ |
| P5a.9 | ✅→✅ | ❌→✅ | ⚠️→✅ (live-runtime step added) | ✅→✅ | ⚠️→✅ (+rack-on-wrong-track negative) | ❌→✅ (drop→store→trigger→payload chain test) | ✅→✅ |
| P5a.10 | ✅→✅ | ❌→✅ | ⚠️→✅ (live-runtime step added) | ⚠️→✅ (MAX_SENDS_PER_PAD=4, MAX_RETURNS_PER_RACK=4, worst-case 24≤50 math) | ✅→✅ (+fan-out cap negatives) | ✅→✅ (budget/determinism layer-array tests) | ✅→✅ |
| P5a.11 | ✅→✅ | ❌→✅ | ⚠️→✅ (live-runtime step added) | ✅→✅ (16/256 caps already quantified) | ✅→✅ (+curve value-range + NaN negatives) | n/a (macros stay frontend-pure; load-time is the boundary, tested) | ✅→✅ |
| P5a.12 | ✅→✅ | ❌→✅ | ⚠️→✅ (live-runtime step added) | ⚠️→✅ (threshold (0,1] default 0.3; 64/16 caps) | ✅→✅ (+1-frame-clip slice negative — the rubric's named case) | ✅→✅ (round-trip pad-k gate already full-chain) | ✅→✅ |
| P5a.13 | ✅→✅ | ❌→✅ | ✅→✅ | ⚠️→✅ (+MAX_RACK_NODES_TOTAL=64; depth-bomb <100ms) | ✅→✅ (+depth-bomb + node-bomb negatives) | n/a (render chain is P5a.14) | ✅→✅ |
| P5a.14 | ✅→✅ | ❌→✅ | ✅→✅ | ⚠️→✅ (pixel oracle pinned to byte-equal; depth-bomb <100ms) | ✅→✅ (+IPC depth-bomb negative) | ✅→✅ (nested-vs-manual pixel oracle IS the chain test) | ✅→✅ |
| P5a.15 | ✅→✅ | ❌→✅ | ✅→✅ | ⚠️→✅ (nodeId regex ^[A-Za-z0-9_-]{1,64}$, path ≤512 chars, ≤depth+1 segments) | ✅→✅ (+forged-path negative) | ✅→✅ (aliasing oracle IS the chain test) | ✅→✅ |
