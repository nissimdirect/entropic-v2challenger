# SPEC-4 — Demo Trilogy (Tier 1 Onboarding Ritual)
*Written 2026-06-03 · ships alongside SPEC-2 in Tier 1*

> Three demo `.entropic` projects shipped with the app. Each reveals one wavetable-axes primitive in <30 seconds of viewing. Together they form the first-launch onboarding ritual + the marketing surface (Y-is-Time is the tweetable one). Demos are content + thin docs; no new code beyond SPEC-2's `domain` field evaluation.

---

## 1. Decision recap

Per the 2026-06-02 Round 1 decisions: ship the trilogy, not a single demo. Each demo teaches one primitive. Together they bootstrap the artist's mental model for the paradigm.

| # | Demo | Primitive taught | Cost |
|---|---|---|---|
| **D-Y** | **Y-is-Time** | `domain='y'` on automation lane — audio-onset envelope painted vertically on a still | XS |
| **D-PB** | **Painted-Blur** | Per-pixel parameter field (preview of C3 capability via simplest implementation) | S |
| **D-LFO** | **Audio-LFO-Stripes** | Audio-rate LFO + `domain='y'` → visible spatial banding that throbs with music | XS |

**Total cost:** ~1 sprint, mostly content authoring + one render-path tweak for D-PB.

---

## 2. Demo 1 — Y-is-Time

### 2.1 Concept

Single high-contrast still image. One audio track (short instrumental loop, ~10s). One automation lane on `hue_shift` with `domain='y'`, curve shape = audio-onset envelope. Hit play: image's hue shifts vertically, frozen as if the audio's recent onset history is painted top-to-bottom.

The "wait, what?" moment: user expects audio to drive change *over time*, sees it drive change *across space* instead.

### 2.2 Assets

| File | Source / spec | Size |
|---|---|---|
| `demos/y-is-time/source.jpg` | Single still — high-contrast architectural shot or geometric pattern. License-clean (CC0 or commissioned). ~1080p. | ~500KB |
| `demos/y-is-time/audio.wav` | 10-second instrumental loop with clear onset pattern (kick + snare or simple synth pulse). License-clean. | ~2MB |
| `demos/y-is-time/project.entropic` | Project file: 1 video track (still), 1 audio track (loop), 1 automation lane on `hue_shift` with `domain='y'`, points sampled from audio onset envelope | <10KB |

### 2.3 Project file structure (illustrative)

```json
{
  "version": "3.0.0",
  "name": "Y-is-Time (demo)",
  "tracks": [
    {
      "id": "v1", "type": "video", "name": "still",
      "clips": [{"assetPath": "demos/y-is-time/source.jpg", "startFrame": 0, "duration": 300}],
      "effectChain": [
        {"id": "hue1", "type": "hue_shift", "params": {"shift": 0}}
      ]
    },
    {
      "id": "a1", "type": "audio", "name": "loop",
      "clips": [{"assetPath": "demos/y-is-time/audio.wav", "startFrame": 0}]
    }
  ],
  "lanes": [
    {
      "id": "L1",
      "trackId": "v1",
      "effectId": "hue1",
      "paramPath": "shift",
      "mode": "smooth",
      "domain": "y",
      "direction": 1,
      "binding_rule": "broadcast",
      "color": "#8ce4d4",
      "points": [
        {"t": 0.0, "value": 0},
        {"t": 0.1, "value": 180},
        {"t": 0.15, "value": 90},
        {"t": 0.3, "value": -90}
        // ...sampled from audio onset env
      ]
    }
  ],
  "bpm": 120,
  "transport": {"loop": true, "loopStart": 0, "loopEnd": 300}
}
```

### 2.4 Acceptance criteria

- [ ] Demo loads with zero validation errors against SPEC-2 schema
- [ ] On play: hue varies visibly down the frame (row 0 distinctly different from row last)
- [ ] As `t` advances, the vertical hue pattern shifts (new audio onset → new pattern row position)
- [ ] User can grab any keyframe and see live response — proves the lane is editable, not baked
- [ ] Toggling lane on/off (mute) restores original image
- [ ] **First-launch behavior:** this demo loads automatically on first run + plays once on a soft loop until user clicks anywhere

### 2.5 What the user sees in 30 seconds

1. App opens → this demo is loaded + playing
2. Image's vertical hue throbs in sync with the music
3. A label appears: "Each row = a moment in time. The audio is painted vertically."
4. User clicks → demo pauses, the lane shows in the timeline ready to edit
5. User drags any keyframe → the hue pattern updates live

---

## 3. Demo 2 — Painted-Blur

### 3.1 Concept

Single source video clip (a short loop). One effect: `blur` with `radius` set to a 2D grayscale field instead of a scalar. User paints the field with the mouse in-app (top-left corner). Output: frame is blurred per-pixel by the painted intensity — paint a dark mask over the foreground, foreground stays sharp while background blurs.

The "wait, this is what filters could always be?" moment.

### 3.2 Assets

| File | Source / spec | Size |
|---|---|---|
| `demos/painted-blur/source.mp4` | ~5-second clip with clear foreground/background separation (a person walking, a flower in a field, etc.) | ~3MB |
| `demos/painted-blur/initial-mask.png` | Pre-painted starter field (grayscale; circular gradient on the foreground area) | ~50KB |
| `demos/painted-blur/project.entropic` | Project file: 1 video track, 1 `blur` effect with `radius` set to `{"field": "demos/painted-blur/initial-mask.png"}` | <10KB |

### 3.3 New schema bit (subset of C3)

Per SPEC-2, `domain` on a Lane = which axis the lane curve evaluates over. For per-pixel field-as-parameter (C3 full), we need a DIFFERENT pattern: a param value source that's an IMAGE, not a curve. SPEC-4 demo D-PB introduces it minimally:

```ts
// Effect param can be a scalar OR a field reference
type ParamValue = number | { field: ImageRef }
type ImageRef = { source: 'asset', path: string } | { source: 'paint', canvasId: string }
```

For the demo to ship without full C3 spec, support ONE effect (`blur`) with this pattern. Renderer samples the field at `(y, x)` for each output pixel and uses that as the blur radius for that pixel.

### 3.4 In-app paint affordance

User can paint the field directly in the preview pane:
- Tools: brush (size + opacity), eraser, clear, invert
- Live preview updates per stroke
- Persists to `canvasId` ref in the project file (saved as PNG alongside)

This is a small UI surface (~200 LoC). Reuses any existing canvas-paint infra; if none, ship a minimal `<canvas>` with mouse events.

### 3.5 Acceptance criteria

- [ ] Demo loads with the pre-painted starter field
- [ ] Foreground area (dark mask values) stays sharp; background (light mask values) is blurred
- [ ] User can paint over more of the foreground → that area becomes sharp
- [ ] Paint clears → entire frame uniformly blurred
- [ ] First-launch label: "Blur isn't just one number anymore. Paint where it's sharp."

### 3.6 Renderer change

The `blur` effect's `radius` param accepts either scalar or field. When field: per-output-pixel radius. Cost: ~30 LoC in the blur effect + ~50 LoC for the field-sampling helper. GPU-accelerated path is C3 full territory (Tier 2); demo can ship CPU-only at lower resolution if needed.

---

## 4. Demo 3 — Audio-LFO-Stripes

### 4.1 Concept

Source: solid color or low-detail video. One LFO operator at 50 Hz routed to `hue_shift`. Lane on `hue_shift` has `domain='y'` (SPEC-2). At 50Hz × frame-height of 1080 = stripes whose density depends on LFO rate. LFO rate is modulated by audio RMS (sidechain). When music gets loud, stripes pack tight; quiet = sparse stripes.

The "audio rate becomes spatial frequency" moment. Most paradigm-revealing of the three.

### 4.2 Assets

| File | Source / spec | Size |
|---|---|---|
| `demos/audio-lfo/source.mp4` | Plain dark gradient or solid color clip, ~10s | ~1MB |
| `demos/audio-lfo/audio.wav` | Dynamic instrumental — quiet intro, loud chorus, quiet outro. ~10s | ~2MB |
| `demos/audio-lfo/project.entropic` | 1 video, 1 audio, 1 LFO operator (50 Hz baseline, rate modulated by audio RMS depth ×0.7), 1 lane: hue_shift `domain='y'` | <10KB |

### 4.3 Acceptance criteria

- [ ] Demo loads, frame shows ~50 horizontal hue stripes (assuming 1080p — count ≈ LFO rate × frame_duration_in_seconds where frame_duration ≈ frame_height / unit … actually count = LFO_rate × (frame_height / 60fps) for typical Y-as-T)
  - *Practical:* at 50 Hz LFO + 1080p, expect ~30-60 visible stripes
- [ ] On music quiet section: stripes spread out (lower effective LFO rate)
- [ ] On loud section: stripes compress (higher rate)
- [ ] First-launch label: "Sound becomes vision. The frequency of the LFO becomes the stripe count."

### 4.4 Zero new code

Ships entirely on SPEC-2 schema + existing LFO operator (Creatrix PR-C ships it) + existing sidechain (Creatrix B10 ships audio RMS). LFO editor needs to allow audio-rate range (50 Hz is currently above typical UI cap — bump to 200 Hz cap).

---

## 5. Onboarding ritual integration

### 5.1 First-launch flow

```
App opens for the first time
    ↓
Show Y-is-Time demo, auto-playing
    ↓
Soft label fade-in (4s): "Each row = a moment in time."
    ↓
Soft label fade-out
    ↓
Pause demo (waiting for click anywhere)
    ↓
On click: open the Demo Drawer (sidebar) with all 3 demos listed
    ↓
"Try the next one →"  button highlights D-PB
    ↓
Click D-PB: project loads, paint tool armed in preview
    ↓
(same pattern for D-LFO)
    ↓
After all 3 demos seen: Drawer collapses; "Make your own" CTA
```

### 5.2 Demo Drawer (lightweight UI surface)

- New sidebar tab "Demos" (5th or 6th tab depending on Creatrix PR-A's browser layout)
- Each demo: thumbnail + title + 1-line description + Play button
- Click → loads the demo project. User's current project (if dirty) is preserved as a draft.
- "Reset demo" button restores demo to original state if user edited it

### 5.3 Skip / disable

Settings → "Show demos on launch" (default ON). After 3 launches with no engagement, prompt: "Hide demos?" → settings toggle.

---

## 6. File-by-file change inventory

| File | Change | Lines |
|---|---|---|
| `demos/y-is-time/` (new dir) | source.jpg + audio.wav + project.entropic | content |
| `demos/painted-blur/` | source.mp4 + initial-mask.png + project.entropic | content |
| `demos/audio-lfo/` | source.mp4 + audio.wav + project.entropic | content |
| `frontend/src/renderer/components/browser/DemosTab.tsx` (new) | 5th tab in browser (or sidebar tab — coordinate w/ Creatrix PR-A) | ~150 |
| `frontend/src/renderer/components/demos/FirstLaunchOverlay.tsx` (new) | first-launch sequence + labels | ~120 |
| `frontend/src/renderer/stores/demos.ts` (new) | demo state + launch-counter persistence | ~50 |
| `backend/src/effects/fx/blur.py` (modified) | accept `radius` as scalar OR field; sample field at (y,x) per-pixel | ~40 |
| `frontend/src/shared/types.ts` (modified) | `ParamValue = number \| FieldRef` (the subset SPEC-2 referenced) | ~10 |
| `frontend/src/renderer/components/preview/PaintLayer.tsx` (new) | minimal canvas paint for D-PB; brush/eraser/clear | ~200 |
| Tests | demo load tests (3) + paint persistence + first-launch flow E2E | ~300 |

**Total: ~870 lines + ~6MB of demo content assets.**

---

## 7. Marketing surface

Each demo doubles as marketing content. After ship:

- **Y-is-Time** → 5-second clip on Twitter / TikTok / Instagram. Caption: "The image's hue is the music's last 100ms, painted vertically."
- **Painted-Blur** → tutorial format: "Blur isn't a slider anymore. Paint it." Showcase video.
- **Audio-LFO-Stripes** → music-visualizer audience. Caption: "50Hz audio LFO becomes 50 stripes per frame."

All three are shareable, paradigm-revealing in <10s, and self-explanatory without a voice-over.

---

## 8. Risk + rollback

| Risk | Mitigation |
|---|---|
| Demo assets license-encumbered | Sourcing decision: CC0 stock OR commission cheap assets. Document license in README. |
| First-launch overlay annoys returning users | Default ON for first 3 launches; disable button visible; settings persists |
| Y-is-Time visual unclear if user doesn't notice the vertical variation | Label explicitly says "each row = a moment in time" — text scaffolding compensates |
| Painted-Blur paint surface introduces complexity in PR-A scope | Ship paint surface in a follow-up PR; D-PB demo can ship with a static mask only, paint added later |
| Audio-LFO requires audio-rate LFO which Creatrix LFO operator may cap below 50Hz | Bump LFO max rate to 200 Hz in PR-C; if missed, ship D-LFO last (after PR-C lock) |

**Rollback:** remove `demos/` directory + 3 UI surfaces. No data loss; demos are self-contained.

---

## 9. Acceptance criteria for the trilogy ship

- [ ] All 3 demo projects load without error
- [ ] Each demo produces its paradigm-revealing visual on play
- [ ] First-launch overlay appears on fresh install, dismissable
- [ ] Demos Tab/Drawer accessible from main UI
- [ ] Each demo editable (lane keyframes / paint strokes / LFO params)
- [ ] Each demo resettable to original state
- [ ] Demos load on Mac (Apple silicon + Intel both, if intel still in scope)
- [ ] No CPU/RAM regression on idle when demos loaded
- [ ] At least one shareable export per demo (5-second loop clip per demo, ready for social)

---

## 10. Next spec

**SPEC-3 — Safety gate contracts (SG-1, SG-3, SG-5, SG-8).** Largest of remaining specs. Four contracts, each ~1 page. Defines API surface, CI test, enforcement point, owner for each. Required before B6/B7/B8/B9/B10 can build. Bigger doc — expect ~5-6 pages.
