# Entropic v2 — Automated UAT Plan

> **Purpose:** Every `/eng` phase MUST run these tests via Playwright `_electron` API BEFORE handoff to user.
> **Tool:** Playwright `_electron` + `electron-playwright-helpers` + pytest (sidecar)
> **Evidence:** Screenshots saved to `test-results/phase-{N}/` per run.
> **Rule:** User should NEVER receive an untested build.

---

## Staged Testing Philosophy (Lenny)

This plan is a **living reference spec**. NOT everything runs from day one.

| Era | Stage | Test Count | What Runs |
|-----|-------|------------|-----------|
| **Era 1: Building** (now) | Pre-launch, no users | 50-70 | Contracts, happy paths, smoke |
| **Era 2: Beta** (first users) | Bug-driven growth | 100-130 | + first-time flow, crash recovery, user-reported regressions |
| **Era 3: Post-Launch** (stable) | Full coverage | 200+ | + golden refs, visual regression, full chaos, platform-specific |

**Rule:** Only build tests for phases that are BUILT. The spec below defines what to test — don't write the code until the feature exists.

---

## Tiered Regression (Not "Run Everything Every Time")

| Tier | When | Runtime | What |
|------|------|---------|------|
| **Smoke** | Every build | < 30s | App launches, sidecar connects, 1 effect applies, 1 export completes |
| **Phase** | Before handoff | 2-5 min | Current phase tests + smoke |
| **Full** | Before version tags / releases only | 15-30 min | All phases + chaos + performance |

**Fail-fast rule:** Regression runs in phase order. If any prior-phase test fails, STOP. Fix before running current phase.

---

## Testing Architecture

| Layer | Tool | What It Catches |
|-------|------|-----------------|
| React Unit | Vitest | Component logic, state management, prop contracts |
| Electron E2E | Playwright `_electron` | UI interactions, buttons, menus, keyboard, drag, file import |
| Visual Regression | `toHaveScreenshot()` | Layout/panel changes, theme breaks, element positioning |
| Effect Output | Screenshot comparison (canvas-only clip) | Broken effects, dead params, render pipeline failures |
| IPC/Sidecar | pytest + pyzmq | ZMQ protocol, watchdog, mmap transport, effect contracts |
| IPC Contracts | JSON Schema validation | Protocol drift between frontend and backend |
| Cross-Process | Playwright + pytest | Full roundtrip: Frontend -> ZMQ -> Python -> mmap -> Frontend |
| Audio | FFmpeg volumedetect + waveform compare | Audio presence, sync, export correctness |
| Performance | Chromium tracing + `page.metrics()` | Memory leaks, frame drops, CPU spikes |
| UX Contracts | Automated DOM/CSS checks | Signifiers, labels, feedback timing, accessibility |
| Chaos/Human Error | Scripted edge cases | Double-clicks, rapid undo, large files, bad input, wrong order |

### What CANNOT Be Automated (Human UAT)
- Visual quality judgment ("does this effect look right?")
- Audio quality perception ("does this sound good?")
- Creative tool "feel" (knob responsiveness, timeline scrubbing satisfaction)
- Subjective animation smoothness
- First-time user orientation (requires fresh eyes — see Human UAT Protocol)

### Key Technical Notes
- Playwright `_electron` is experimental — pin Electron version AND `electron-playwright-helpers` version together
- File dialogs: stub with `electron-playwright-helpers` (`stubDialog()`) — add Phase 0A validation that stubDialog() works
- Canvas content: use `locator.screenshot()` (canvas element only, NOT full page) with `maxDiffPixelRatio: 0.01`
- Hide cursors/playheads/timestamps via `data-testid` attributes + `stylePath` CSS (stable contract, not class names)
- Launch timeout: `60000ms` minimum, `90000ms` for first-launch tests (Nuitka code signing delay)
- Console routing: `window.on('console', ...)` mandatory
- macOS runner required for CI (Electron needs Quartz display)
- Kill background Electron processes before each test run
- Expose `window.__lastFrameTimestamp` from renderer — wait for frame-ready before screenshots
- Add `retries: 1` in Playwright config for Electron flakiness

---

## Test File Structure

```
frontend/tests/
  unit/                              # React component unit tests (Vitest)
    knob.test.ts
    timeline.test.ts
    effect-rack.test.ts
    pad-view.test.ts
    modulation-matrix.test.ts
    library-browser.test.ts
  e2e/
    fixtures/
      electron-app.fixture.ts        # Shared launch/window/console setup
      test-helpers.ts                 # Common actions (import video, apply effect, etc.)
    phase-0a/
      app-launch.spec.ts
      watchdog.spec.ts
      stub-dialog-validation.spec.ts  # Validates stubDialog() works before other phases depend on it
    phase-0b/
      frame-transport.spec.ts
      effect-container.spec.ts
      determinism.spec.ts
    phase-1/
      import-video.spec.ts
      effects-preview.spec.ts
      export.spec.ts
      first-time-flow.spec.ts        # Cold start to first export (< 2 min click path)
    phase-2a/
      parameter-ux.spec.ts
      knob-interaction.spec.ts
    phase-2b/
      audio-playback.spec.ts
      av-sync.spec.ts
    phase-3/
      color-suite.spec.ts
      histogram.spec.ts
    phase-4/
      timeline.spec.ts
      clip-manipulation.spec.ts
      undo-redo.spec.ts
    phase-5/
      perform-mode.spec.ts
      keyboard-triggers.spec.ts
      choke-groups.spec.ts
    phase-6/
      modulation.spec.ts
      sidechain.spec.ts
      effect-rack.spec.ts
      freeze.spec.ts
    phase-7/
      automation.spec.ts
      recording-modes.spec.ts
      ghost-handle.spec.ts
    phase-8/
      physics-effects.spec.ts
      dynamic-resolution.spec.ts
    phase-9/
      drum-rack.spec.ts
      midi-learn.spec.ts
      retro-capture.spec.ts
    phase-10/
      freeze-flatten.spec.ts
      presets.spec.ts
      library-browser.spec.ts
      schema-migration.spec.ts       # Tests old-version.glitch migration
    phase-11/
      export-codecs.spec.ts
      full-e2e.spec.ts
      accessibility.spec.ts
      auto-update.spec.ts            # Update check, download sim, version reporting
      crash-recovery.spec.ts
    regression/
      chaos.spec.ts
      performance.spec.ts
      ux-contracts.spec.ts           # Automated UX checks (Don Norman)
    smoke.spec.ts                    # 30-second smoke: launch, connect, effect, export

backend/tests/
  test_zmq_server.py
  test_zmq_shutdown.py               # Graceful SHUTDOWN command handling
  test_mmap.py
  test_effect_container.py
  test_determinism.py
  test_nuitka_smoke.py
  test_ipc_schema.py                 # JSON Schema validation for all IPC messages
  test_all_effects.py                # @pytest.mark.parametrize over all 126 effects
  test_parameter_sweep.py            # Per-param impact sweep

tests/integration/
  full-roundtrip.spec.ts
  watchdog-recovery.spec.ts
  concurrent-ops.spec.ts
  ipc-contracts/
    message-schema.spec.ts           # Both sides validate against shared schema
    version-mismatch.spec.ts         # Stale Nuitka binary vs updated frontend
    backpressure.spec.ts             # Frontend sends faster than backend processes
    degradation.spec.ts              # Slow sidecar, partial mmap writes
    error-propagation.spec.ts        # Python exception -> Electron error display
```

---

## Test Data Requirements

```
test-fixtures/
  videos/
    valid-short.mp4          # 5s, 1080p, H.264, with audio
    sync-marker.mp4          # White flash + 1kHz beep at t=0 and t=2s (A/V sync test)
    valid-4k.mp4             # 5s, 4K, H.264 (large file test) — Git LFS
    valid-no-audio.mp4       # 5s, 1080p, no audio track
    valid-vfr.mp4            # Variable frame rate
    valid-long.mp4           # 120s (2 min, loop region testing) — Git LFS
    valid-prores.mov         # ProRes codec — Git LFS
    corrupt-header.mp4       # Corrupted file header
    corrupt-truncated.mp4    # Truncated mid-stream
    zero-bytes.mp4           # 0-byte file
    not-video.mp4            # Text file renamed to .mp4
    unicode-名前.mp4          # Unicode filename
    not-a-video.psd          # Wrong file type (Photoshop, common creative user mistake)
  audio/
    baseline-export.wav      # Gold standard for audio comparison
  projects/
    valid-project.glitch     # Valid save file
    corrupt-project.glitch   # Hand-corrupted JSON
    old-version.glitch       # Schema migration test (v1 format)
  golden/                    # Generated on first run, updated with --update-snapshots
    effect-pixelsort.png
    effect-datamosh.png
    ...per effect...

  # HOSTING: Large files (4K, ProRes, long) via Git LFS.
  # Golden images platform-specific (macOS baseline).
  # Update goldens: npx playwright test --update-snapshots
```

---

## Phase-by-Phase Test Suites

### Phase 0A: Skeleton
**What's built:** Electron+React+Vite, Python sidecar, ZMQ heartbeat, shared memory frame writer, React canvas renderer.

#### Automated Tests (Claude runs before handoff)

| # | Test | Action | Verify | Category |
|---|------|--------|--------|----------|
| 1 | App launches | `electron.launch()` | Window appears, no crash | Happy path |
| 2 | Canvas renders | Wait for canvas element | Canvas has non-zero dimensions, receives frames | Happy path |
| 3 | Random color frames | Screenshot canvas 3x at 500ms intervals | Screenshots differ (frames changing) | Happy path |
| 4 | System health meters | Check top toolbar | CPU/GPU/RAM/Disk/Frame Time elements present | Happy path |
| 5 | Kill Python sidecar | `app.evaluate()` to kill child process | Toast notification appears within 5s | Error handling |
| 6 | Python auto-respawn | After kill, wait 10s | Canvas resumes rendering, toast clears | Recovery |
| 7 | Rapid kill cycles | Kill Python 5x in 10s | App doesn't crash, final respawn succeeds | Chaos |
| 8 | ZMQ port conflict | Start second instance on same port | Graceful error message, not silent failure | Edge case |
| 9 | App close/reopen | Close app, relaunch | Clean startup, no orphan processes | Lifecycle |
| 10 | stubDialog validation | Call stubDialog() | Returns expected value, confirms helper works | Infrastructure |
| 11 | Empty state guidance | Launch with no project | Onboarding text or CTA visible, not blank canvas | UX contract |
| 12 | Offline launch | Launch with network disabled | All local features work, no network error dialog | Edge case |

#### Sidecar Tests (pytest)
- ZMQ PING/PONG at 1Hz
- ZMQ SHUTDOWN command → cleanup → exit code 0
- Shared memory allocation and write
- Nuitka binary launches and responds identically to source
- IPC message format validates against JSON schema

---

### Phase 0B: Pipeline Validation
**What's built:** Shared memory ring buffer, PyAV codec test, Effect Container interface, taxonomy registry, determinism validation.

#### Automated Tests

| # | Test | Action | Verify | Category |
|---|------|--------|--------|----------|
| 1 | Frame transport | Send test frame via mmap | Frame arrives in renderer, pixel values match | Happy path |
| 2 | PyAV decode | Load test video via PyAV | Frame count, dimensions, duration correct | Happy path |
| 3 | Effect Container | Apply identity effect | Output frame == input frame | Contract |
| 4 | Effect visible change | Apply pixelsort | Output frame differs from input (diff > 0.01) | Contract |
| 5 | Determinism | Apply same effect twice, same seed | Byte-identical output | Contract |
| 6 | Determinism across restart | Apply, restart sidecar, apply again | Same output (seeded RNG, no persistent state) | Contract |
| 7 | Taxonomy registry | Query all categories | 13 categories returned, counts match | Happy path |
| 8 | Large frame (4K) | Send 3840x2160 RGBA via mmap | No crash, latency < 33ms | Performance |
| 9 | Ring buffer overflow | Write more frames than buffer capacity | Oldest frames overwritten, no crash | Edge case |
| 10 | Malformed IPC message | Send garbage JSON via ZMQ | Error response, no crash, no hang | Error handling |
| 11 | Partial mmap write | Kill sidecar mid-frame-write | Frontend detects incomplete frame, doesn't render garbage | Error handling |

---

### Phase 1: Core Pipeline
**What's built:** Upload -> effects -> preview -> export. First batch of pure-function effects.

#### Automated Tests

| # | Test | Action | Verify | Category |
|---|------|--------|--------|----------|
| 1 | Import valid video | Stub file dialog, click Import | Video loads, thumbnail/preview appears | Happy path |
| 2 | Import via drag-drop | Dispatch drag events with test file | Same result as dialog import | Happy path |
| 3 | Reject invalid file | Stub with `not-video.mp4` | Error toast with descriptive message (contains action verb) | Error handling |
| 4 | Reject zero-byte | Stub with `zero-bytes.mp4` | Error toast | Error handling |
| 5 | Reject corrupt file | Stub with `corrupt-header.mp4` | Error toast with descriptive message | Error handling |
| 6 | Reject wrong type | Stub with `not-a-video.psd` | Clear error explaining expected file types | Error handling |
| 7 | VFR video prompt | Stub with `valid-vfr.mp4` | Transcode prompt appears | Edge case |
| 8 | Apply effect | Select effect from browser, apply | Preview changes visually (canvas screenshot diff > 0.01) | Happy path |
| 9 | Effect chain ordering | Apply 3 effects | Output differs based on order (swap and compare) | Happy path |
| 10 | Export video | Click Export, stub save dialog | Progress modal appears, file created, file is playable | Happy path |
| 11 | Export progress updates | Watch progress modal during export | Percentage updates at least every 2 seconds (no "frozen" feeling) | UX contract |
| 12 | Cancel export | Start export, click Cancel | Export stops, partial file cleaned up | Error handling |
| 13 | Export no content | Click Export with nothing loaded | Disabled button or graceful error (not silent nothing) | Edge case |
| 14 | Large file import | Stub with `valid-4k.mp4` | UI doesn't freeze (main thread responsive during load) | Performance |
| 15 | Unicode filename | Stub with `unicode-名前.mp4` | Loads successfully | Edge case |
| 16 | Double-click Import | Click Import twice rapidly | Only one dialog/import, no duplicate | Chaos |
| 17 | Import during export | Start export, then try importing | Blocked with clear feedback (not silent) | Chaos |
| 18 | First-time flow | Cold start → import → apply 1 effect → export | Complete in < 2 minutes of clicks | Product |
| 19 | Effect before import | Try to apply effect with no video loaded | Clear guidance shown, not silent failure | Sequence |
| 20 | Export before effects | Import video, immediately export (no effects) | Works — exports raw video | Sequence |
| 21 | Effect-then-import recovery | Add effect, THEN import video | Preview shows video WITH effect applied (not "No video loaded") | Sequence |
| 22 | Render error visibility | Trigger render_frame that returns ok:false | User sees visible error, not just console.log | UX contract |
| 23 | Heavy effect playback | Apply wave_distort, play 5s | Video plays (possibly slow) — does NOT freeze or crash engine | Performance |

#### Sidecar Tests (pytest)
- Each effect: visible change from input (diff > 0.01) — `@pytest.mark.parametrize` over all effects
- Each effect: each parameter changes output (sweep test)
- Each effect: seed changes output
- Each effect: boundary values (0.0, 1.0, -1.0) don't crash
- Preview mode: frame_index=0, total_frames=1 matches full render (catches v0.7 bug class)

---

### Phase 2A: Parameter UX
**What's built:** Ghost Handle, sensitivity zones, non-linear scaling, click-to-type on knobs.

#### Automated Tests

| # | Test | Action | Verify | Category |
|---|------|--------|--------|----------|
| 1 | Knob drag | Mouse down on knob, move up | Parameter value increases | Happy path |
| 2 | Knob sensitivity zones | Drag at different speeds | Slow drag = fine control, fast drag = coarse | Happy path |
| 3 | Click-to-type | Click knob value display | Text input appears, type number, press Enter | Happy path |
| 4 | Click-to-type invalid | Type "abc" in knob input | Rejects/clamps, no crash | Error handling |
| 5 | Click-to-type boundary | Type "-999" and "999" | Clamps to valid range | Edge case |
| 6 | Ghost Handle visible | Apply modulation to param | Semi-transparent ring shows real value, distinguishable from base | Visual |
| 7 | Non-linear scaling | Drag knob full range | Screenshot at 10 positions — verify visual change is perceptually even | UX quality |
| 8 | Knob double-click | Double-click knob | Resets to default value (or opens type input) | UX |
| 9 | Multiple knobs rapid | Drag 3 knobs in quick succession | All update correctly, no value bleeding between params | Chaos |
| 10 | Scrollable params visible | Open effect with many params | Scroll indicator/shadow visible at bottom of panel | UX contract |
| 11 | All params reachable | Scroll param panel to bottom | Every parameter is accessible, none hidden without signifier | UX contract |
| 12 | Param labels present | Check every visible parameter | Has a visible text label (not icon-only) | UX contract |
| 13 | Hover states | Mouseover knobs and buttons | Cursor changes to pointer/grab, visual feedback | UX contract |

---

### Phase 2B: Audio Sprint
**What's built:** PyAV decode -> PortAudio -> decoupled A/V clock -> sync validation.

#### Automated Tests

| # | Test | Action | Verify | Category |
|---|------|--------|--------|----------|
| 1 | Audio plays | Import video with audio, press Play | Audio output detected (via app state or export check) | Happy path |
| 2 | A/V sync | Import `sync-marker.mp4`, export 5s clip | White flash frame aligns with 1kHz beep within 1 frame (±42ms) | Happy path |
| 3 | No-audio video | Import `valid-no-audio.mp4` | Plays without error, no audio controls visible/active | Edge case |
| 4 | Audio continues during load | Play video, simulate Python heavy load (via evaluate) | Audio doesn't stutter (app reports no audio underruns) | Contract |
| 5 | Pause/resume | Play, pause at 3s, resume | Audio resumes from correct position | Happy path |
| 6 | Seek while playing | Play, click to seek to 50% | Audio jumps to correct position, no glitch | Happy path |
| 7 | Rapid play/pause | Toggle play 10x in 2 seconds | No crash, final state correct | Chaos |
| 8 | Long playback drift | Export 60s clip from `valid-long.mp4`, compare sync markers at start vs end | Drift < 40ms (1 frame at 24fps) | Performance |
| 9 | Sleep/wake recovery | Simulate system sleep (close lid), wake | ZMQ reconnects, audio resumes or recovers gracefully | Chaos |

---

### Phase 3: Color Suite
**What's built:** Levels, Curves, HSL Adjust, Color Balance, live Histogram.

#### Automated Tests

| # | Test | Action | Verify | Category |
|---|------|--------|--------|----------|
| 1 | Levels tool | Open Levels, adjust black/white points | Preview changes (canvas screenshot diff) | Happy path |
| 2 | Curves tool | Open Curves, add control point, drag | Preview changes | Happy path |
| 3 | HSL adjust | Adjust Hue slider | Color shifts visually (screenshot diff) | Happy path |
| 4 | Color Balance | Adjust shadows/midtones/highlights | Preview changes | Happy path |
| 5 | Live histogram | Apply Levels adjustment | Histogram display updates to reflect changes | Happy path |
| 6 | Curves multi-point | Add 5 control points | All points draggable, curve renders smoothly | Happy path |
| 7 | Curves channel select | Switch R/G/B/Master | Different curves per channel | Happy path |
| 8 | Reset color tool | Apply changes, click Reset | Returns to original | Happy path |
| 9 | Stack color tools | Apply Levels + Curves + HSL | All three compose correctly | Happy path |
| 10 | Extreme values | Push all sliders to max | No crash, no NaN, image may look extreme but renders | Edge case |

---

### Phase 4: Timeline + Tracks
**What's built:** Multi-track, clips, undo with disk overflow, history panel, rulers, transport.

#### Automated Tests

| # | Test | Action | Verify | Category |
|---|------|--------|--------|----------|
| 1 | Clip appears | Import video | Clip visual block with thumbnail on timeline | Happy path |
| 2 | Playhead click | Click ruler at 50% | Playhead jumps to correct position | Happy path |
| 3 | Loop in/out | Alt+Click, Shift+Click ruler | Loop region markers appear at correct positions | Happy path |
| 4 | Clip select | Click clip | Selected state (highlight/border), others deselected | Happy path |
| 5 | Multi-select | Shift+Click second clip | Both selected | Happy path |
| 6 | Toggle select | Cmd+Click clips | Add/remove from selection | Happy path |
| 7 | Marquee select | Drag on empty background | Rectangle appears, touching clips selected | Happy path |
| 8 | Move clip | Drag selected clip | Clip moves on timeline, IPC CLIP_UPDATE fires | Happy path |
| 9 | Duplicate clip | Alt+Drag clip | Copy created at drop position | Happy path |
| 10 | New track | Cmd+T | New video track lane appears | Happy path |
| 11 | Undo/redo | Move clip, Cmd+Z | Clip returns to original position | Happy path |
| 12 | Undo feedback | Cmd+Z after move | UI indicates WHAT was undone (toast or status text) | UX contract |
| 13 | Undo chain | Make 10 edits, Cmd+Z x10 | All reverted in order | Happy path |
| 14 | Redo after undo | Cmd+Z then Cmd+Shift+Z | Restored correctly | Happy path |
| 15 | History panel | Open history panel | Shows list of operations in order | Happy path |
| 16 | Snap behavior | Drag clip near another clip edge | Snaps to adjacent edge | UX |
| 17 | Clip past boundary | Drag clip before time 0 | Clamped, not allowed | Edge case |
| 18 | Empty timeline play | Press Play with no clips | No crash, playhead moves, helpful empty state text visible | Edge case |
| 19 | 20+ tracks | Create 20 tracks with clips | UI responsive, scroll works | Performance |
| 20 | Rapid undo spam | Cmd+Z x50 rapidly | No crash, reaches beginning of history cleanly | Chaos |
| 21 | Move during playback | Drag clip while playing | Consistent behavior (either allowed or blocked with feedback) | Chaos |
| 22 | JKL shuttle | Press J/K/L keys | Shuttle backward/stop/forward | Happy path |
| 23 | Zoom in/out | Scroll wheel or zoom controls | Timeline zooms, clips scale, ruler updates | Happy path |
| 24 | Unsaved changes close | Close app with unsaved edits | "Are you sure?" dialog appears | UX contract |
| 25 | Frame boundary seek | Seek to frame 0 and frame `total_frames-1` | Both work correctly, no off-by-one | Edge case |

---

### Phase 5: Basic Performance
**What's built:** Keyboard triggers, choke groups, Drum Rack pad view.

#### Automated Tests

| # | Test | Action | Verify | Category |
|---|------|--------|--------|----------|
| 1 | Create perf track | Cmd+Shift+T | Performance Track appears (Electric Blue) | Happy path |
| 2 | Pad view opens | Select Performance Track | Bottom panel shows Drum Rack/Pad View | Happy path |
| 3 | Key triggers | Press Q/W/E/R keys | Visual feedback on corresponding pads | Happy path |
| 4 | Events captured | Play + tap keys + stop | Events stored in buffer | Happy path |
| 5 | Dump to timeline | Click "Capture MIDI" | Events appear as clip on timeline | Happy path |
| 6 | Buffer limit 60s | Tap keys for 70s, dump | Only last 60s of events present | Contract |
| 7 | Gate mode | Map param to pad, hold key | Param at max while held, min on release | Happy path |
| 8 | Toggle mode | Map param, press key twice | First press = high, second press = low | Happy path |
| 9 | One-Shot mode | Map param, press key | Envelope fires (attack/decay curve) | Happy path |
| 10 | Choke group | Assign 2 pads to same group, press both | Second cuts first | Happy path |
| 11 | Empty buffer dump | Click Capture with no events | Graceful empty result, no crash | Edge case |
| 12 | Rapid key mashing | Press Q/W/E/R/A/S/D/F in rapid sequence (50 events, 2s) | All events captured, no drops, no crash | Chaos |
| 13 | Perf track + playback | Play video while triggering keys | Real-time effect changes visible on canvas | Integration |
| 14 | Multiple perf tracks | Create 3 Performance Tracks | All function independently | Edge case |
| 15 | Perform before video | Create perf track, tap keys before importing video | No crash, events still captured | Sequence |

---

### Phase 6: Operators + Modulation
**What's built:** LFO, sidechain (incl. audio-reactive), DAG routing, auto-freeze, Effect Rack UI.

#### Automated Tests

| # | Test | Action | Verify | Category |
|---|------|--------|--------|----------|
| 1 | Add effect to rack | Click effect in browser | Appears in Effect Rack (horizontal chain) | Happy path |
| 2 | Reorder effects | Drag effect in chain | Output changes based on new order | Happy path |
| 3 | Effect enable/disable | Toggle effect bypass | Preview changes (with = effect applied, without = bypassed) | Happy path |
| 4 | LFO modulator | Add LFO, map to effect param | Knob "dances" — parameter oscillates (verify via multiple screenshots) | Happy path |
| 5 | LFO rate range | Set LFO rate to 0.001Hz and 100Hz | Both work without crash | Edge case |
| 6 | Modulation matrix | Open matrix, assign source->dest | Connection visible, parameter modulated | Happy path |
| 7 | DAG cycle prevention | If A->B exists, try B->A | Dropdown greys out invalid source, prevents cycle | Contract |
| 8 | Freeze prefix chain | Freeze effects 1-2 in a 3-effect chain | Frosted glass overlay on 1-2, effect 3 still live | Happy path |
| 9 | Freeze violation | Try to freeze effect 3 without 1-2 | System enforces prefix-chain rule (rejected with explanation) | Contract |
| 10 | Unfreeze | Unfreeze previously frozen chain | Chain recomputes dynamically | Happy path |
| 11 | Group effects | Select multiple devices, Cmd+G | Group created with Macro panel | Happy path |
| 12 | Auto-freeze trigger | Send `DEBUG_SIMULATE_RAM_PRESSURE` IPC command | Auto-freeze activates, toast appears | Contract |
| 13 | Sidechain audio | Map audio amplitude to effect param | Parameter follows audio volume | Happy path |
| 14 | 6-8 effects performance | Apply 8 effects to one track | Sustained rendering without crash (CPU may be high) | Performance |
| 15 | Freeze during playback | Click freeze while video is playing | Clean transition, no glitch/crash | Chaos |
| 16 | All params extreme | Set every param on an effect to 0.0 then 1.0 | No crash, no NaN | Edge case |
| 17 | Determinism check | Apply effects, export, re-export with same seed | Byte-identical output | Contract |
| 18 | Frozen effect tweak | Freeze track, try to adjust frozen effect's params | Blocked with visual indication (not silent) | UX contract |

---

### Phase 7: Automation
**What's built:** Keyframes, Touch/Latch/Write recording, RDP decimation, Ghost Handle.

#### Automated Tests

| # | Test | Action | Verify | Category |
|---|------|--------|--------|----------|
| 1 | Show automation | Press A key | Automation lane appears under track | Happy path |
| 2 | Add node | Click automation line | New node created at click position | Happy path |
| 3 | Move node | Drag node | Node moves, automation curve updates | Happy path |
| 4 | Fine-tune node | Shift+Drag node | Fine movement (smaller increments) | Happy path |
| 5 | Curve type cycle | Alt+Click node | Cycles linear/log/exp | Happy path |
| 6 | Touch recording | Arm Touch mode, play, move slider | Automation recorded while held; snaps back on release | Happy path |
| 7 | Latch recording | Arm Latch mode, play, move slider | Value holds after release until next change | Happy path |
| 8 | Write recording | Arm Write mode, play | Overwrites all existing automation | Happy path |
| 9 | Write mode warning | Arm Write mode | Prominent visual warning that existing automation will be overwritten | UX contract |
| 10 | Simplify curve | Draw complex automation, click Simplify | Point count reduces, shape preserved | Happy path |
| 11 | Conflict logic | Apply LFO to param, then try automation | Automation lane for that param greyed out with explanation | Contract |
| 12 | Ghost Handle | Automation + modulation active | Semi-transparent ring shows actual computed value | Visual |
| 13 | Signal order | Base + Mod + Automation all active | Evaluation order: Base -> Mod -> Automation -> Clamp | Contract |
| 14 | Hundreds of nodes | Draw 200 automation points | Performance acceptable, no freeze | Performance |
| 15 | Delete nodes | Select nodes, press Delete | Removed cleanly | Happy path |
| 16 | Undo automation | Record automation, Cmd+Z | Recording reverted | Happy path |
| 17 | Automation before play | Draw automation nodes while stopped | Nodes drawn correctly, applied on play | Sequence |
| 18 | Recording mode indicator | Arm any recording mode | Mode indicator visible without scrolling, prominent enough to notice | UX contract |

---

### Phase 8: Physics + Remaining Effects
**What's built:** All remaining effects ported, GPU evaluation, dynamic resolution scaling.

#### Automated Tests

Use `test.describe.parallel` with `test.step()` per effect. Explicit 5s timeout per effect. Shard across CI runners.

| # | Test | Action | Verify | Category |
|---|------|--------|--------|----------|
| 1 | Every effect loads | Iterate all 126 effects via `test.step()`, apply each | Each produces visible change (canvas screenshot diff > 0.01) | Contract |
| 2 | Every effect golden | Compare output to golden reference | Diff < 0.02 from baseline (Era 2+, skip in Era 1) | Regression |
| 3 | Parameter sweep | For each effect, sweep each param (sidecar pytest) | Every param produces visible change | Contract |
| 4 | Preview mode | Test each effect with frame_index=0, total_frames=1 (sidecar pytest) | Matches full render output | Contract |
| 5 | Physics effects group | Test pixel_gravity, vortex, explode, melt | All render without RuntimeWarning | Happy path |
| 6 | Dynamic resolution | During playback with heavy effects | Resolution drops but playback continues | Performance |
| 7 | Stop = full-res | Stop playback | Full resolution render within 10s | Performance |
| 8 | Temporal effects | Test datamosh, feedback, frame_drop | Cache invalidation works correctly | Contract |
| 9 | Seeded determinism | Test 10 random effects: same seed = same output | Byte-identical each time | Contract |
| 10 | Effect at extremes | All params at 0.0 and 1.0 for all effects | No crash, no NaN | Edge case |
| 11 | Default params quality | Apply each effect with defaults | Diff ratio 0.05-0.40 (visible change but not destroyed — "aha moment" proxy) | Product |

---

### Phase 9: Full Perform + MIDI
**What's built:** Drum Rack view, MIDI Learn, Retro-Capture, MIDI-reactive modulation.

#### Automated Tests

| # | Test | Action | Verify | Category |
|---|------|--------|--------|----------|
| 1 | Drum Rack view | Select perf track, open pad view | 4x4 grid visible | Happy path |
| 2 | 8x8 grid toggle | Switch to 8x8 view | Grid changes to 8x8 | Happy path |
| 3 | Drag param to pad | Drag effect param onto pad cell | Mapping created, visual indicator | Happy path |
| 4 | MIDI Learn | Click MIDI Learn, press keyboard key | Key mapped to pad | Happy path |
| 5 | Retro-Capture dump | Perform for 30s, click Capture | Last 30s appears as timeline clip | Happy path |
| 6 | MIDI-reactive mod | Map MIDI velocity to effect param | Parameter responds to key velocity | Happy path |
| 7 | Multiple pad triggers | Press 4 keys simultaneously | All 4 pads trigger, effects composite | Happy path |
| 8 | Choke during perform | Trigger choked pads during playback | Clean cut, no audio/video glitch | Happy path |
| 9 | Pad mode switching | Switch between Gate/Toggle/One-Shot during session | Mode changes immediately | Happy path |

---

### Phase 10: Freeze/Flatten + Library
**What's built:** Prefix-Chain Freeze, presets, taxonomy UI, library browser.

#### Automated Tests

| # | Test | Action | Verify | Category |
|---|------|--------|--------|----------|
| 1 | Save project | Cmd+S, stub save dialog | .glitch file created, valid JSON | Happy path |
| 2 | Reopen project | Close app, reopen project file | All tracks/clips/effects/automation restored exactly | Happy path |
| 3 | Schema migration | Open `old-version.glitch` | Migrated successfully, all data preserved, no silent data loss | Happy path |
| 4 | Save preset | Save effect chain as preset | .glitchpreset file created | Happy path |
| 5 | Load preset | Drag preset to track | Effects applied correctly | Happy path |
| 6 | Library browser | Open library sidebar | 3 tabs (Project/Library/System) functional | Happy path |
| 7 | Star favorite | Click star on preset | Preset floats to top | Happy path |
| 8 | Search library | Type in search box | Results filter correctly | Happy path |
| 9 | Filter by type | Click Glitch/Color/Utility filter | Shows correct subset | Happy path |
| 10 | Drag to empty space | Drag preset to empty area | New track created with effects | Happy path |
| 11 | Drag to existing track | Drag preset to track | Effects appended | Happy path |
| 12 | Corrupt project file | Open hand-corrupted .glitch | Graceful error message (not crash, not silent) | Error handling |
| 13 | Unicode project name | Save with unicode characters in name | Saves and reopens correctly | Edge case |
| 14 | Large project save | 50+ tracks, hundreds of effects | Serialization completes in < 5s | Performance |
| 15 | Auto-folder creation | Fresh launch, save project | ~/Documents/GlitchDAW/ created | Happy path |
| 16 | Missing media | Open project referencing deleted video file | Clear error explaining which file is missing | Error handling |
| 17 | Save during work | Work for 60s making many changes, force-kill, reopen | Autosave recovers recent work (< 30s data loss) | Recovery |

---

### Phase 11: Export + Polish
**What's built:** PyAV codecs (H.264, H.265, ProRes), Pop Chaos design, auto-update, accessibility, crash reporting.

#### Automated Tests

| # | Test | Action | Verify | Category |
|---|------|--------|--------|----------|
| 1 | Export H.264 | Export with H.264 codec | Valid .mp4 file, playable | Happy path |
| 2 | Export H.265 | Export with H.265 codec | Valid .mp4 file | Happy path |
| 3 | Export ProRes | Export with ProRes codec | Valid .mov file | Happy path |
| 4 | Export quality tiers | Export at low/medium/high quality | File sizes differ appropriately | Happy path |
| 5 | Full E2E workflow | Import -> add effects -> automate -> save -> close -> reopen -> export | Output matches pre-save preview | Integration |
| 6 | Export progress | Start export | Progress modal with percentage updates at least every 2s | Happy path |
| 7 | Export cancel | Cancel mid-export | Stops cleanly, partial file removed | Error handling |
| 8 | Export near-full disk | Create small ramdisk via `hdiutil`, fill it, run export | Graceful error before disk full | Edge case |
| 9 | Accessibility | Tab through UI elements | Semantic overlays present, focus order logical | A11y |
| 10 | Crash recovery | Force-kill app during edit, reopen | Crash report generated, project recoverable | Recovery |
| 11 | Auto-update check | Trigger update check | Version reported correctly, channel switching works | Happy path |
| 12 | Export for social | Export 9:16 vertical video | Correct aspect ratio, metadata present for platform processing | Product |

---

## UX Contract Tests (Don Norman — Runs Every Phase)

Automated checks that encode UX decisions. Catches the v0.7 hidden-params class of bug.

| # | Test | Verify | Norman Principle |
|---|------|--------|-----------------|
| 1 | Scroll indicators | Scrollable panels have visible scroll bar or shadow/gradient | Signifier |
| 2 | Hover states | Every interactive element has cursor change on hover | Affordance |
| 3 | Disabled states | Disabled buttons have `opacity < 0.5` or greyed visual | Signifier + Constraint |
| 4 | Drag affordances | Draggable elements show `grab` cursor on hover | Affordance |
| 5 | Keyboard shortcut labels | Menu items show their shortcut (e.g., "Undo Cmd+Z") | Signifier |
| 6 | Error toast quality | Every error toast contains an action verb, not just "Error" | Feedback |
| 7 | Feedback timing | Time between user action and UI response < 200ms | Feedback |
| 8 | Parameter labels | Every parameter has visible text label | Discoverability |
| 9 | Mode indicators | Active mode (Touch/Latch/Write/Frozen) visible without scrolling | Signifier |
| 10 | Empty states | Every panel/view with no content shows guidance text | Discoverability |
| 11 | Destructive confirms | Delete Track, Write mode, Freeze All have confirm or undo | Constraint |
| 12 | Dual entry points | Every action has at least 2 access paths (menu + shortcut, or button + shortcut) | Gulf of execution |
| 13 | Effect descriptions | Every effect has a non-empty description in info panel | Conceptual model |
| 14 | Focus management | After modal/dialog close, focus returns to logical element | Mapping |
| 15 | Undo tells you what | After Cmd+Z, status text or toast says what was undone | Feedback |

---

## Chaos Suite (Expanded — Runs Every Phase)

| # | Test | Action | Category |
|---|------|--------|----------|
| 1 | Double-click everything | Double-click every primary button | Timing |
| 2 | Rapid undo/redo | Cmd+Z x100, then Cmd+Shift+Z x100 | State |
| 3 | Actions during render | Click buttons during export/render | State |
| 4 | Import during import | Trigger import while import in progress | Sequence |
| 5 | Empty state operations | Try every action with no video loaded | Boundary |
| 6 | Keyboard chaos | Predefined sequence: all trigger keys + Cmd+Z/Shift+Z + unmapped keys + modifier combos (excluding Cmd+Q) for 10s | Input |
| 7 | Resize window | Resize to minimum viable (400x300), ultrawide (3440x1440), and back | State |
| 8 | Close during save | Force-close during save operation | State |
| 9 | Max everything | All params to max, all effects, all tracks | Boundary |
| 10 | Undo past beginning | Cmd+Z when history is empty | Boundary |
| 11 | Export before import | Click Export with nothing loaded | Sequence |
| 12 | Apply effect before import | Open effect browser, try to apply | Sequence |
| 13 | Undo after save-close-reopen | Make edit, save, close, reopen, Cmd+Z | Sequence |
| 14 | Alt-tab during render | Start export, switch away 5s, switch back | State |
| 15 | Paste everywhere | Cmd+V in timeline, effect browser, search box, canvas | Input |
| 16 | Frame boundaries | Seek to frame 0, frame `total-1`, frame `total` (out of bounds) | Boundary |
| 17 | Two instances same project | Open same .glitch file in 2 Electron instances | State |
| 18 | Effect then import | Add effect to empty chain, THEN upload video | Sequence |
| 19 | Import then recover | After #18, verify video preview shows with effect applied (not stuck on "No video loaded") | State |
| 20 | Slow effect during playback | Apply wave_distort/pixelsort at 1080p, play video | Performance |
| 21 | Slow effect watchdog survival | Apply heavy effect, verify engine is NOT killed by watchdog | State |
| 22 | All effect combos (2-chain) | Apply every pair of effects (N×N), render 1 frame each | Contract |
| 23 | All effect combos (3-chain) | Apply every permutation of 3 effects (N×N×N sample), render 1 frame each | Contract |
| 24 | Effect order determinism | Apply effects A→B→C vs C→B→A, verify outputs differ | Contract |
| 25 | Max chain with all effects | Apply all 10 effects (max chain), render 1 frame | Boundary |

---

## IPC Contract Tests (NEW — Added 2026-02-23 from UAT findings)

> Catches the camelCase↔snake_case mismatch class of bug.

| # | Test | Action | Verify | Category |
|---|------|--------|--------|----------|
| 1 | Effect chain field names | Send EffectInstance JSON from frontend to Python | Python `apply_chain()` receives `effect_id`, `enabled`, `params` (not camelCase) | Contract |
| 2 | Round-trip schema validation | Serialize EffectInstance → JSON → deserialize in Python | All fields present and correctly named | Contract |
| 3 | Error visibility | Send render_frame that returns `ok: false` | UI shows visible error indicator (not just console.log) | UX contract |
| 4 | Render failure recovery | First render fails, second render with valid chain | Preview recovers and shows correct frame | State |

---

## Effect Performance Budget (NEW — Added 2026-02-23 from UAT findings)

> Catches the wave_distort/pixelsort "freezes everything" class of bug.

| # | Test | Action | Verify | Category |
|---|------|--------|--------|----------|
| 1 | Per-effect frame budget | Apply each effect individually to 1080p frame | Processing time < 100ms (hard cap) | Performance |
| 2 | Slow effect tolerance | Apply intentionally slow effect (500ms) | Watchdog pings still answered, engine NOT killed | Architecture |
| 3 | Sequential frame decode | Decode 300 sequential frames (no effect) | Average < 5ms/frame (no seek-per-frame penalty) | Performance |
| 4 | Effect combo performance | Apply 3 heaviest effects together on 1080p | Total < 300ms/frame OR dynamic resolution activates | Performance |

---

## Effect Combination Matrix (NEW — Added 2026-02-23)

> Validates that all effect pairings produce valid output without crashes.

**Strategy:** `@pytest.mark.parametrize` over effect pairs and triples.

```python
# test_effect_combos.py
import itertools
from effects.registry import list_all

effects = [e["id"] for e in list_all()]

# All pairs (N×N = 100 tests for 10 effects)
@pytest.mark.parametrize("a,b", itertools.product(effects, repeat=2))
def test_two_effect_chain(a, b, sample_frame):
    chain = [{"effect_id": a, "params": {}, "enabled": True},
             {"effect_id": b, "params": {}, "enabled": True}]
    output, _ = apply_chain(sample_frame, chain, seed=42, frame_index=0, resolution=(1920,1080))
    assert output.shape == sample_frame.shape
    assert output.dtype == np.uint8

# Sampled triples (N×N×N = 1000 for 10 effects — sample 100)
@pytest.mark.parametrize("a,b,c", random.sample(list(itertools.product(effects, repeat=3)), 100))
def test_three_effect_chain(a, b, c, sample_frame):
    chain = [{"effect_id": e, "params": {}, "enabled": True} for e in [a, b, c]]
    output, _ = apply_chain(sample_frame, chain, seed=42, frame_index=0, resolution=(1920,1080))
    assert output.shape == sample_frame.shape

# Order matters
@pytest.mark.parametrize("a,b", [(a,b) for a,b in itertools.permutations(effects, 2)][:20])
def test_order_matters(a, b, sample_frame):
    chain_ab = [{"effect_id": a, "params": {}, "enabled": True},
                {"effect_id": b, "params": {}, "enabled": True}]
    chain_ba = [{"effect_id": b, "params": {}, "enabled": True},
                {"effect_id": a, "params": {}, "enabled": True}]
    out_ab, _ = apply_chain(sample_frame, chain_ab, seed=42, frame_index=0, resolution=(1920,1080))
    out_ba, _ = apply_chain(sample_frame, chain_ba, seed=42, frame_index=0, resolution=(1920,1080))
    # Most pairs should produce different output when order changes
    # (some commutative pairs like invert+invert are expected to be same)
```

---

## Performance Benchmarks (Validated Per Phase)

| Metric | Target | Tier | Method |
|--------|--------|------|--------|
| Frame processing (lightweight effects) | < 16ms (60fps) | 1080p | Chromium tracing |
| Frame processing (moderate effects) | < 33ms (30fps) | 1080p | Chromium tracing |
| Frame processing (heavy/physics) | < 100ms (10fps, dynamic res) | 1080p | Chromium tracing |
| mmap transport (pointer swap) | < 0.1ms | — | Sidecar pytest |
| Electron cold start | < 5s (M-series), < 8s (Intel) | — | Launch timer |
| A/V sync drift (60s) | < 40ms | — | Waveform analysis with sync-marker.mp4 |
| Memory stability (1000 frames) | RSS growth < 2% | — | Process monitoring |
| Memory soak (60 min) | No OOM, RSS < 2x initial | — | Long-run monitor (Era 2+) |
| RAM cache render (300 frames) | < 60s (lightweight chain) | — | Timer |
| MIDI latency | < 50ms | — | Event timestamp diff |

---

## Evidence Protocol

### Per-Handoff Summary (copy-paste template)

```markdown
## Phase N Handoff — [DATE]
### Test Results
- Smoke: PASS/FAIL (X/X)
- Phase tests: PASS/FAIL (X/X)
- Regression: PASS/FAIL (X/X)
- Flaky (passed on retry): [list or "none"]
### Failures
- [screenshot + console output + sidecar.log excerpt for each]
### Performance
- Frame processing: Xms (target: <16ms lightweight / <33ms moderate)
- Memory growth: X% over 1000 frames (target: <2%)
### Known Issues
- [deferred items, if any]
```

### Evidence Artifacts
1. **Screenshots on failure only** — saved to `test-results/phase-{N}/` with `actual.png`, `expected.png`, `diff.png`
2. **Sidecar logs** — `test-results/phase-{N}/sidecar.log` with synced timestamps
3. **Performance CSV** — appended per run for trend tracking
4. **No video recordings** — too much overhead for a solo dev, screenshots + logs are sufficient

### When Tests Fail
- Open `test-results/phase-{N}/` and compare `actual.png` vs `expected.png` vs `diff.png`
- If new output looks CORRECT (intentional change): run `npx playwright test --update-snapshots`
- If new output looks BROKEN: the code has a bug — fix it
- If test fails once but passes on retry: tag as `@flaky`, investigate if it persists 3+ phases

### How to Run Tests

```bash
# Smoke (30 seconds)
npx playwright test frontend/tests/e2e/smoke.spec.ts

# Current phase only
npx playwright test frontend/tests/e2e/phase-4/

# Phase + regression
npx playwright test frontend/tests/e2e/phase-0a/ frontend/tests/e2e/phase-0b/ frontend/tests/e2e/phase-1/ ...

# Sidecar tests
python -m pytest backend/tests/

# Full regression (releases only)
npx playwright test frontend/tests/e2e/

# Update golden screenshots
npx playwright test --update-snapshots

# View HTML report
npx playwright show-report

# Parallel sharding (CI, Phase 8+)
npx playwright test --shard=1/4
```

---

## CI/CD (GitHub Actions)

```yaml
# .github/workflows/test.yml
name: Entropic v2 Tests
on: [push, pull_request]

jobs:
  sidecar:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
        with:
          lfs: true
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install -r backend/requirements.txt
      - run: python -m pytest backend/tests/ -v --tb=short
      - run: python -m pytest backend/tests/test_nuitka_smoke.py  # binary parity

  electron-e2e:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
        with:
          lfs: true
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npx playwright install
      - run: npx playwright test frontend/tests/e2e/smoke.spec.ts  # smoke first
      - run: npx playwright test frontend/tests/e2e/  # full suite
        env:
          CI: '1'
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: test-results
          path: test-results/
```

---

## Playwright Config

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'frontend/tests/e2e',
  timeout: 60_000,
  retries: 1,  // 1 retry for Electron flakiness
  reporter: [['html', { open: 'never' }]],
  use: {
    trace: 'on-first-retry',
  },
  globalSetup: './frontend/tests/e2e/global-setup.ts',  // kills orphan processes
  projects: [
    { name: 'smoke', testMatch: 'smoke.spec.ts' },
    { name: 'e2e', testMatch: '**/*.spec.ts', testIgnore: 'smoke.spec.ts' },
  ],
});
```

---

## globalSetup (Orphan Cleanup)

```typescript
// frontend/tests/e2e/global-setup.ts
import { execSync } from 'child_process';

export default async function globalSetup() {
  // Kill orphaned Electron and sidecar processes
  try { execSync('pkill -f "entropic" || true'); } catch {}
  try { execSync('pkill -f "python.*sidecar" || true'); } catch {}
  // Clean up stale mmap segments (macOS)
  try { execSync('rm -f /tmp/entropic-mmap-* || true'); } catch {}
  // Wait for ports to release
  await new Promise(r => setTimeout(r, 2000));
}
```

---

## Human UAT Protocol (Minimal — Don Norman)

### Tier 1: "5-Minute Smoke" (every phase handoff)
Do ONE creative workflow: open → import → apply 2 effects → tweak → play → export. If it feels wrong, stop and describe the feeling. That's the bug report.

### Tier 2: "New Feature Touch" (when new feature ships)
Spend 10 minutes ONLY on the new feature. Record your screen (QuickTime). The recording is the evidence.

### Tier 3: "Fresh Eyes" (once per major version)
Get ONE other person to use Entropic for 15 minutes with zero instruction. Watch silently. Every hesitation = discoverability bug.

---

## Mapping to v0.7 Bug Taxonomy

| v0.7 Failure | v2 Test Coverage |
|-------------|-----------------|
| 14 broken effects | Phase 8: every-effect-loads + golden comparison |
| Dead seed parameters | Phase 8: parameter sweep + seed test |
| Hidden scrollable params (MAJOR UX) | UX contract #1 (scroll indicators) + Phase 2A #10-11 |
| Parameter sensitivity (narrow sweet spot) | Phase 2A: non-linear scaling + Phase 8 #11 (default quality) |
| Preview mode mismatch | Phase 8: preview mode test (frame_index=0 vs full render) |
| File upload failures | Phase 1: import tests (valid, invalid, corrupt, zero-byte, wrong type) |
| History order bug | Phase 4: history panel ordering test |
| Mix slider unclear | Phase 2A: knob interaction + UX contract #8 (param labels) |
| "I don't know what this does" | UX contract #13 (effect descriptions present) |
| Dead-end states | UX contract #10 (empty states show guidance) |
| Accidental Write mode | Phase 7 #9 (Write mode warning) + UX contract #9 (mode indicators) |

### v2 Phase 1 UAT Findings (2026-02-23)

| v2 Failure | Root Cause | New Test Coverage |
|------------|-----------|-------------------|
| Effects don't update preview | camelCase↔snake_case field mismatch (effectId vs effect_id) | IPC Contract Tests #1-2 |
| Silent render failures | `ok: false` only logged to console, no UI feedback | IPC Contract Tests #3, Phase 1 #22 |
| "No video loaded" after effect-then-import | First render fails due to field mismatch, frameDataUrl never set | Phase 1 #21, Chaos Suite #18-19 |
| wave_distort freezes video | Python for-loop per row (200-500ms/frame) blocks single-threaded ZMQ, watchdog kills engine | Effect Performance Budget #1-2, Chaos Suite #20-21 |
| FPS instability | seek-per-frame, new ZMQ socket per frame, double JPEG encode, setInterval clock drift | Effect Performance Budget #3 |
| No effect combination testing | Effects only tested individually, never in chains with other effects | Effect Combination Matrix (100 pairs + 100 sampled triples) |

---

### Phase 1 — UX Combination Matrix (Added 2026-02-23)
> Tests cross-feature interactions and state permutations. Addresses gap where BUG-1/BUG-3 class bugs live.
> File: `frontend/tests/e2e/phase-1/ux-combinations.spec.ts`

| # | Test | Combinations Covered | Category |
|---|------|---------------------|----------|
| 1 | Play + add effect live | Playback x Effect add | Cross-feature |
| 2 | Play + toggle effect off | Playback x Effect toggle | Cross-feature |
| 3 | Play + remove effect | Playback x Effect remove | Cross-feature |
| 4 | Play + reorder effects | Playback x Effect reorder | Cross-feature |
| 5 | Play to end + loop wrap | Playback x Frame boundary | Boundary |
| 6 | Effects + replace video | Effect chain x Video replace | Cross-feature |
| 7 | Scrub + replace video | Seek position x Video replace | Cross-feature |
| 8 | Playing + replace video | Playback x Video replace | Cross-feature |
| 9 | Multi-effect independent params | Effect A params x Effect B params | State isolation |
| 10 | Select + remove -> empty panel | Selection x Remove | State transition |
| 11 | Param adjust + toggle cycle | Param persistence x Enable toggle | State preservation |
| 12 | All param types on one effect | Knob + choice + toggle + mix | Param completeness |
| 13 | Select + reorder -> selection tracking | Selection x Reorder | State tracking |
| 14 | Toggle off + remove | Disabled state x Remove | State cleanup |
| 15 | Max chain + remove + re-add | Chain limit x Remove x Add | Boundary lifecycle |
| 16 | Remove middle of chain | Chain integrity x Remove | Gap prevention |
| 17 | Incremental chain building with params | Add x Adjust x Add x Adjust | Composition |
| 18 | Export dialog open/close/reopen | Dialog lifecycle x Default state | State reset |
| 19 | Export cancel + restart | Export cancel x Fresh progress | State reset |
| 20 | Export with 0 vs 2 effects | Export x Effect chain variance | Cross-feature |
| 21 | Export dialog during playback | Export x Playback | Cross-feature |
| 22 | Render error + effect change -> recovery | Error state x Effect modification | Error recovery |
| 23 | Invalid file + valid file sequence | Error state x Successful import | Error recovery |
| 24 | Ingest error + retry with valid file | Error state x Retry | Error recovery |
| 25 | Search + add effect from results | Search filter x Effect add | Cross-feature |
| 26 | Category filter + add + switch to All | Category x Effect add x Category switch | Cross-feature |
| 27 | No-match search + clear + rack unchanged | Search x Rack state preservation | State isolation |
| 28 | Full lifecycle: empty -> import -> effects -> play -> pause -> export -> cancel -> remove -> empty | All states | State machine |
| 29 | Play/pause toggle cycle (5x) | Playback state consistency | State toggle |
| 30 | Incremental chain: add -> preview -> add -> preview -> remove -> preview | Chain x Preview per step | Composition |

---

*Generated: 2026-02-22 | Revised: 2026-02-23*
*Reviews applied: CTO (architecture gaps, benchmarks), Don Norman (UX contracts, human UAT), Lenny (staged approach, tiered regression), Quality (7 blocking fixes, CI/CD, sequence errors)*
*Sources: ELECTRON-TESTING-REFERENCE.md, /test-electron skill, /quality §11, PF-16/17 arsenal, UAT-FINDINGS-2026-02-15.md (116 items), UAT-PLAN.md (425 tests), TESTING-STRATEGY.md, v2 spec docs (17 files), Playwright Electron research*
