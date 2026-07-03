# Modulation Sources — canonical spec (shape → affordances → interactions)

**Purpose:** over-document *every* modulation source so there's no uncertainty about **how each works in practice** and **what interaction it affords.** The key realization: a source's **shape** determines its UI and its natural binding rules. A scalar depth wants a focal plane; a spectrum wants an EQ. Treating them all as "a knob that wiggles a value" throws away most of the expressive power.

---

## 1. The shape taxonomy (this drives everything)

| Shape | What it emits per frame | Natural affordances | Example sources |
|-------|-------------------------|---------------------|-----------------|
| **Scalar** | one value | threshold/gate · envelope · curve · depth(amount) | audio.rms · reduced coherence/entropy · LFO |
| **Event / Trigger** | discrete onsets (bool + strength) | ADSR envelope · sensitivity · rate-limit · trigger-count | audio.onset · beat · gate-open |
| **Vector (2-comp)** | magnitude + direction | use-mag / use-dir · magnitude threshold · direction lock/offset | optical flow · tensor θ+coherence |
| **Spectrum / Per-band (F)** | a vector over frequency bands | **EQ interaction** — band select · band-range · per-band fan-out · **frequency-gated threshold** · EQ-curve weighting | spectral bands · chromagram (12) |
| **2D Field (per-pixel)** | a spatial map | `field_dst` (per-pixel) · `reduce`→scalar (mean/max/**region-probe**) · threshold→mask · focal+range (depth) | depth · tensor coherence · entropy · luminance · flow-magnitude |
| **Temporal orbit** | a path over time (1–3 comp) | which-axis · speed · phase | strange-attractor orbit · LFO/kentaro |

**Rule:** the source's shape picks the default binding rule and the editor. Everything below is an instance of this table.

## 2. Cross-cutting affordances (composable modifiers on any edge)

These are the "different interactions" — most are small, several already exist:

- **Threshold / Gate** — emit only when the value crosses a threshold (with hysteresis). *This is the "frequency-gated threshold" for spectrum: pick a band, set a threshold, gate.* Reuse the existing **`gate` operator** (Schmitt hysteresis already implemented) OR a per-edge `threshold`+`hyst`. Affords: "only react when the kick hits," "only warp where it's structured."
- **Envelope (ADSR)** — shape a trigger into a smooth contour. Reuse the existing **`envelope` operator** / `processor.smooth`. Turns onsets into swells.
- **Curve / EQ-shape** — remap value→output nonlinearly (the per-edge `curve` — see PRD-edge-curve-ui; serialized today, not yet applied in the engine).
- **Reduce** — field→scalar via mean/max/peak/**region-probe** (a movable sample box). Lets a 2D field drive a scalar param.
- **Smooth / Lag** — inertial follow (exists: `processor.smooth`).
- **Polarity / Range** — invert, min/max clamp (exists on `OperatorMapping`: `depth`,`min`,`max`).

An edge is therefore: `source(shape) → [gate?] → [envelope?] → [reduce?] → [curve?] → [depth/min/max] → destination(param|field)`. Most modifiers already exist as operators; the new work is exposing them per-edge.

---

## 3. Per-source spec (existing taps + planned utilities)

Legend: **S**=scalar **E**=event **V**=vector **F**=spectrum **2D**=field **O**=orbit · 🟢 exists to tap today · 🔵 planned utility. "Binding" = sensible default rule.

| Source | Shape | Emits | Affordances / interaction it needs | Binding | Tag |
|--------|-------|-------|-------------------------------------|---------|-----|
| `audio.rms` | S | loudness | threshold, envelope, curve, smooth | broadcast/reduce | 🟢 |
| `audio.onset` | E | hit + strength | ADSR, sensitivity, rate-limit | trigger | 🟢 |
| `spectral.bands` | **F** | per-band energy | **EQ editor** — band select, per-band fan-out, freq-gated threshold, EQ-curve | scanOver(over F) / sampleAt(one band) | 🟢 (tap FFT/DCT suite) |
| `chromagram` | **F** | 12 pitch-class energies | pick pitch-class → LUT; key-locked palette | sampleAt / scanOver | 🟢 |
| `video_analyzer.motion` | **S** | motion amount (0–1 proxy delta — *scalar, verified S6*) | magnitude threshold, smooth | broadcast/reduce | 🟢 |
| `strange_attractor.orbit` | **O** | chaotic x/y | axis pick, speed, phase | broadcast | 🟢 (tap effect) |
| `temporal_blend.buffer` | 2D | decaying trail | decay, tap-delay, reduce | field / reduce | 🟢 (tap effect) |
| `entropy_map` | 2D | info density | threshold→mask, reduce, region-probe | painted(mask)/reduce | 🟢 (tap effect) |
| `datamosh.flow` | V/2D | codec motion vectors | mag/dir, threshold | field(coord)/reduce | 🟢 (tap effect) |
| **Depth** | 2D | per-pixel depth | **focal plane + near/far range**, depth-band gate, reduce | field / sampleAt(depth-slice) | 🔵 |
| **Structure Tensor** | V+2D | θ (angle) + coherence (scalar field) | coherence-threshold mask, θ-as-direction, region-probe | scanOver / field / reduce | 🔵 |
| **Optical Flow** | V/2D | magnitude + direction | **motion-gate threshold**, direction lock, mag→scalar | field(coord)/reduce | 🔵 |
| **Field Mixer** | 2D | combined field | op + gains; inherits inputs' affordances | field/reduce | 🔵 |
| **CLIP similarity** | S | semantic match to word/image | threshold ("when it looks like X"), smooth | reduce/broadcast | 🔴 (AI) |

---

## 4. Deep-dives — how the interesting ones work in practice

### 4a. Spectral = an EQ. (Your instinct, spec'd.)
A spectral source is a **band vector** (energy per frequency band; the FFT/DCT suite already works in `low_bin`/`high_bin` space, `band_isolation.py`). It affords a **mini-EQ editor**, not a knob:
- **Band select / range** — drag a band or a `[low,high]` range on a live spectrum; that band's energy is the signal. (`sampleAt` one band, or a range mean.)
- **Frequency-gated threshold** — a threshold line on the selected band: the edge only fires when *that band* exceeds it (reuse the `gate` operator on the band value). "Warp only when there's energy in 2–4 kHz."
- **Per-band fan-out** — map **each band to a different destination** (bass→displace, mids→hue, air→grain). This is the Kentaro-8-LFO idea generalized to 8 *audio/spectral* bands — one source, N routed outputs (`scanOver` over F + a fan). The single richest interaction in the whole system.
- **EQ-curve weighting** — an editable curve over the bands shapes how the spectrum maps to value (loud-air-emphasis, etc.).
- *Practice:* the source editor **is** a spectrum analyzer with draggable band handles + a threshold line — familiar to anyone who's touched an EQ.

### 4b. Depth = a focal plane + range.
Depth is a 2D field but its signature interaction is **cinematographic**: a **focal-plane** control (which depth is "in focus") + **near/far range**. Affords: rack-focus (focal ← audio), depth-band gate (affect only a slice), reduce (subject-distance → scalar). *Practice:* a depth histogram with a movable focal band, exactly like a camera's focus + DoF.

### 4c. Optical flow / motion = magnitude + a motion-gate.
A vector field; the key interaction is a **magnitude threshold** ("react above X motion") + optional **direction lock** (only horizontal motion). Affords motion-gated everything. *Practice:* a threshold slider on a live motion meter + a direction dial.

### 4d. Structure tensor = two sources in one.
Emits **coherence** (scalar field: how structured) and **θ** (angle field: which way). Split them: coherence → amount/mask (with a threshold), θ → direction (for Displace/kaleido). *Practice:* a toggle "use coherence / use orientation" + a coherence threshold.

### 4e. Attractor / orbit = an organic LFO.
A chaotic path over time; pick the axis (x/y), speed, phase. *Practice:* same editor as the LFO, plus an attractor-type dropdown — it's a "weird LFO" source.

### 4f. Entropy = a busy-region gate.
Scalar field of local information; its natural use is a **threshold→mask** ("affect only busy/detailed regions") or reduce→scalar. *Practice:* a threshold on the entropy map preview.

---

## 5. Implications for the UI (the "different interactions" list)
Each shape needs its own **source inspector**, not a generic knob:
- Scalar/orbit → the existing LFO/operator editor (+ threshold, curve).
- Event → the envelope editor (ADSR + sensitivity).
- **Spectrum → a mini-EQ** (band handles + threshold + per-band fan-out).
- 2D field → a field preview + reduce/probe/threshold/focal controls (depth gets the focal band).
- Vector → magnitude/direction toggle + threshold.

Common to all: the per-edge modifier strip (gate · envelope · reduce · curve · depth/min/max) — mostly existing operators exposed inline.

## 6. Build implications
- **Threshold/gate, envelope, smooth already exist** as operators → expose them as per-edge modifiers (mostly wiring).
- **`reduce` + region-probe** and **per-band fan-out** are the two genuinely new interaction builds — both small, both high-leverage (spectral fan-out is the standout).
- The **spectrum editor** is the one net-new UI component worth real design (it doubles as an analyzer). Everything else reuses existing editors.
- See `PRD-signal-tap.md` for exposing the 🟢 taps, and each utility's PRD for the 🔵 sources.
