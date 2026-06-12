# Entropic — Wavetable Axes Liberation
*Research vision · codified 2026-06-02 · revised 2026-06-03 (review pass) · not a build commitment*

> **Round 1 decisions locked in §7. Round 1 review fixes applied in §6, §8, §9, §10, §11.**

---

## 1. Positioning

Audio synthesis had 4 paradigm shifts in 60 years (subtractive → FM → wavetable → granular/spectral). Each created an artist class + ecosystem. Video DAWs have had **zero** comparable shifts — NLE-with-effects is unchanged since 1989.

**Entropic's opportunity: be the wavetable-synthesis-equivalent for video.** Thesis: video has 6 orthogonal axes; liberating each as a modulation surface yields a higher-dim algebra with no audio analog. The medium for a new artist class — *the video synthesist*.

What owning the category means: vocabulary shift, hardware-as-axis controllers (Novation Launchpad first), `.dna` patches as portable artifacts, plugin SDK for axis-aware instruments, reference-clip-as-input replaces blank-project paralysis.

---

## 2. Destination State (v2.0+)

Drop any reference (clip, still, text, audio, patch). Entropic returns an editable `.dna` patch — effect graph + tensor routing across 6 axes — approximating the reference's look-and-feel. User edits like a synthesist tweaks a preset; Novation Launchpad maps to macro depths + scene triggers. Probes show live signal everywhere; ⌘⇧I opens the Routing Canvas for systemic edits. Render in seconds (spectral effects on post-decode DCT). `.dna` files trade peer-to-peer; they load identically in any Entropic version, present or future.

---

## 3. Core Thesis

| | Audio (today) | Video (proposed) |
|---|---|---|
| Modulation domain | T only | T, Y, X, C, F, L |
| Source dim | 1D-over-time | 0D–6D |
| Destination | Scalar | Scalar OR field |
| Routing | Matrix | Tensor (axis-typed edges + binding rules) |
| Patch unit | (src, dst, depth) | (src, src-axis, dst, dst-axis, binding-rule, depth) |
| Feedback | Audio-rate self-loops | Frame / scanline / latent self-loops |
| Reference→patch | Manual | Genoscope (multi-modal ref → editable patch) |
| Patch portability | DAW projects | `.dna` portable, no-regression across versions |

---

## 4. The Six Axes (decision: 6D, no 7th)

| Axis | Definition | Why it matters |
|---|---|---|
| **T** | Frame index | Only currently-exposed axis. *Structure (scenes/sections) lives inside T as keyframe regions.* |
| **Y** | Vertical pixel pos | Scanline scan; oscilloscope-as-image; CRT scanimate as native primitive |
| **X** | Horizontal pixel pos | Combined with Y: diagonal / spiral / Hilbert bindings (future) |
| **C** | Color channel (RGB/HSL/YCbCr) | Per-channel divergence; chromatic aberration as parametric family |
| **F** | Spatial frequency band (DCT default, FFT/wavelet per-effect opt-in) | Surgical band-isolated effects |
| **L** | Latent embedding (multi-headed: DINOv2 + CLIP + CLAP from day one) | Style-as-automation; cross-modal; perception substrate |

**Binding rules (5 standard):** broadcast · sample-at · scan-over · integrate · painted.
*Hilbert / polar / learned MLPs deferred to research tier.*

**Axis values:** signed real magnitude (±N, including non-unit scaling) at v1. Fractional positions when granulator ships. Complex / higher-manifold parked.

**Trigger payload:** scalar at v1, tensor at Tier 5+.

**The 5 synth ops port cleanly:** Scan, Modulate, Warp, Resynthesize, Bus/Route.

---

## 5. Architecture — Two-Tier

| Tier | Scope | Engine | Role |
|---|---|---|---|
| **Automation** | Universal — every param has a lane | `core/automation.py`, `automation_overrides` IPC | Curve in N-d space |
| **Modulation** | Curated — selectively wired routing | Operator system, `applyCCModulations` (PR #36) | Live signal flow |

Maps to locked signal order: **Base → Modulation → Automation → Clamp**. Both axis-aware.

---

## 6. Mini-PRDs

Cost: S (sprint), M (2-4 sprints), L (1-3 mo), XL (>3 mo), 2XL (multi-quarter / hire). **🚧** = blocks on a Safety Gate (§10). ⏸ = deferred / out of immediate scope.

### A — Headline Instruments

| # | Name | What | Cost | Deps |
|---|---|---|---|---|
| A1 | **Granulator-for-Video** | Grain = (T,Y,X,C,F,L) interval tuple + per-axis envelopes; density/pitch/jitter modulatable per-axis; selection rules (random / latent-similarity / onset-triggered / scene-payload); 200/frame GPU | L | Q7, B4, 🚧SG-1, 🚧SG-3 |
| A2 | **Genoscope** | GA over effect-graph + routing space; pop 64, 100+ gens; multi-modal ref via DINOv2 + CLIP + CLAP + optical-flow + palette + edge-PSD; output editable `.entropic` | 2XL | Q7, B1, A4, 🚧SG-6 |
| A3 | **Frame-Bank Oscillator** | Track type, up to 256 slots (stills/clips/generative); modulatable wavetable-position + Phase X/Y; optical-flow morph; RAM-LRU | M | — |
| A4 | **Spectral Frame Warper** | 6 primitives (shift / comb / smear / formant / parity / inversion) on post-decode DCT (default) or FFT/wavelet (per-effect); recursive (F-modulating-F) | M | — |
| A5 | **Spectral Granulator** | A1 spec — grains = spectral-band slices; multi-basis; identity-preservation curve over density | M | A1, A4 |

### B — Modulation/Automation Infrastructure

| # | Name | What | Cost | Deps |
|---|---|---|---|---|
| B1 | **Universal Automatability** | Every param has lane with `domain` (T/Y/X/C/F/L) + `direction` (signed real) + `binding_rule` (one of 5 standard) + `interp_mode` + `loop_mode`; lane curves themselves modulatable | L | — |
| **B4-lite** | **Routing schema + broadcast-only** *(NEW — Tier 1 subset of B4)* | Mod-edge schema `(src, src_axis, dst, dst_axis, binding_rule, depth)` ships in full; ONLY `broadcast` rule implemented. **Writer-side validator REJECTS non-`broadcast` values on save to prevent schema-vs-implementation drift before B4-full ships.** Forward-compat: future tiers add `sample-at / scan-over / integrate / painted` without schema migration. Unlocks I3 inline-mapping in Tier 1. | S | B1 |
| B2 | **Cross-Modal Mod Matrix** | Whole-audio analysis (RMS, transients, bands, centroid, harmonicity) ↔ video parameter routing both directions; per-edge curve/depth/polarity/lag/S+H | L | B1, 🚧SG-4 |
| B3 | **Modulation-as-Track-Type** | Routing subgraph + scoped LFOs/envelopes/macros as 1st-class track; mute/solo/save; `.modpatch` export with auto-remap; layered | L | B2 |
| B4 | **Cross-Axis Routing Tensor (full)** | Adds the remaining 4 binding rules (sample-at / scan-over / integrate / painted) to B4-lite schema; per-edge inspector; toposort cycle detection (PR #37) | L | B4-lite, B1, B2, 🚧SG-5 |
| ~~B5~~ | ~~Cross-Stem Cross-Modal~~ | ⏸ **Cut** — stem separation not needed. B2 handles whole-audio routing. | — | — |

### C — Wavetable-Axes Paradigm

| # | Name | What | Cost | Deps |
|---|---|---|---|---|
| C1 | **Scanline-as-Time** | Lane `domain='y'` reads curve over Y within one frame | S | B1 |
| C2 | **Frame-as-Parameter-Lane** | Lane accepts image / video ref as 2D field instead of keyframes; field itself modulatable | L | B1, C3, 🚧SG-1 |
| C3 | **Per-Pixel Parameter Fields** | Top-25 effects accept scalar OR 2D field per param; GPU shader codegen (Metal) | L | B1, C2, 🚧SG-1 |
| C4 | **Spectral-Band-Isolated Effects** | Universal wrapper: any effect acts only on F ∈ [a,b]; band modulatable; multi-band variant (5 parallel) | L | A4 |
| C5 | **Latent-Trajectory Modulation** | L-axis as mod destination; ref clips define targets; multi-target simplex; feature-blend (cheap) or re-encode (heavy) | XL | Q7, 🚧SG-3, 🚧SG-4 |
| C6 | **Frame-as-Self-Wavetable** | Mod sources reading rendered frame's pixels / DCT / latent → same-frame effects; 1-frame delay; runaway clamp | XL | B4, 🚧SG-3 |
| C7 | **Audio-LFO-at-Video-Resolution** | LFO editor extended to audio-rate range; aliasing visualization | S | C1 |
| C8 | **Feedback-Through-L** | C6 spec with L; render → encode → mod next frame; per-axis feedback rate | XL | Q7, C6, 🚧SG-3 |
| C9 | **Wavetable-Frames-as-Clips** | A3 extension — slot holds clip; wavetable-pos crossfades clips while T continues | M | A3 |

### D — Cross-Modal Exotica

| # | Name | What | Cost | Deps |
|---|---|---|---|---|
| ~~D1~~ | ~~Pixel-as-Waveform Oscillator~~ | ⏸ **Out of scope** | — | — |
| D2 | **Heterodyning Visuals** | 2D-FFT two sources, element-multiply, iFFT; sum-and-difference spatial frequencies | M | A4 |
| D3 | **Wavetable-as-Mask** | Audio wavetable → 2D mask via topology mapping; modulatable | M | C2 |
| D4 | **Latent Granulator** | A1 spec — grain pool = L-space points; each grain = "project at latent (x,y,z) for 50ms" | XL | Q7, A1, E1, 🚧SG-3 |

### E — Meta / Shipping / Ecosystem

| # | Name | What | Cost | Deps |
|---|---|---|---|---|
| E1 | **Resynthesis-Latent Mode** | Per-project autoencoder trained on ref content; latent codes routable; optional MLP distill for realtime | XL | Q7, 🚧SG-3 |
| E2 | **`.dna` Patch Format** | Effect graph + routing + lanes + params + optional ref embeddings + resource budget (SG-2); no source content; **strict no-regression across all Entropic versions, forward + backward**; **unknown-fields-preserve policy** on read (round-trip on save) | M | A2, 🚧SG-2 |
| ~~E3~~ | ~~Patch Gallery~~ | ⏸ **Out of immediate scope** | — | — |
| ~~E4~~ | ~~Latent Recommendation~~ | ⏸ **Deferred (depends on E3)** | — | — |
| E5 | **Hardware Bridge** | MIDI Learn + bidirectional OSC; **Novation Launchpad as canonical first template** (LP X / LP Mini Mk3 / LP Pro Mk3); arbitrary-CC Learn for everything else; faders/pads map to axis OR param OR macro; echo-timestamp suppression | M | B2 |
| E6 | **Live Performance Mode** | Frame-rate floor; graceful axis-aware degradation (drop F-depth before frames); session presets; panic-recover; multi-output; memory-pressure auto-disable (SG-8) | XL | E5, B1, 🚧SG-8 |
| E7 | **Plugin SDK** | Python + optional GPU shader; plugins declare param schema + axis-caps + basis + render contract; sandboxed subprocess with per-plugin CPU/RAM/disk/IPC quotas; Ed25519-signed | 2XL | B1, 🚧SG-9 |
| E8 | **Vibe-to-Patch Multi-Modal** | Genoscope inputs: clip + still + text + audio + patch + latent point; cross-modal embedding to unified fitness | XL | A2, Q7 |

### I — Inspector + Routing Surfaces

Ship all three. Single routing graph, three surfaces. Prune via founder-dogfood qualitative use.

| # | Name | What | Cost | Deps |
|---|---|---|---|---|
| I1 | **Inspector Track (Surface A)** | First-class track type below timeline. Probes added by drag-from-param. Probes mute/solo like instruments. Always-visible live scopes. **Probes recordable to disk per SG-H1 policy.** | M | B1, B4 |
| I2 | **Routing Canvas (⌘⇧I) (Surface B)** | Modal overlay: 3-column (sources / graph / destinations). Bright = routed, dim = available. Drag source→destination creates edge. Edge inspector (depth / polarity / curve / lag / axis-binding / delete) at bottom. Filter / search both sides. Kills "Map to…" modal entirely. | L | B1, B4-lite (for Tier 2 ship) |
| I3 | **Inline Probe + Action Menu (Surface C)** | Right-click param → action menu (recent · browse categorized · search · tools). Inline scope appears once mapped. Same gesture handles probe-only (⌥-click), map+probe (click), edit (⇧-click), delete (✕). Browsable categories, no smart suggestions. | M | B1, B4-lite |

---

## 7. Decisions Locked (2026-06-02 Round)

**Paradigm**
- 6D, no 7th axis. Structure lives in T.
- Per-effect F basis (DCT default, FFT/wavelet opt-in).
- Multi-headed L from day one: DINOv2 + CLIP + CLAP.
- 5 binding rules: broadcast · sample-at · scan-over · integrate · painted.
- Axis values: signed real first, fractional with granulator, complex parked.
- Trigger payload: scalar v1, tensor at Tier 5+.

**Tier 1 ship**
- Demo trilogy: Y-is-Time + painted-blur + audio-LFO stripes.

**Inspector + Undo**
- Ship I1 + I2 + I3. Prune via dogfood.
- Undo: per-action atomic + Photoshop-style History panel. *Follow-up: validate existing v2 history-buffer impl + flesh out.*

**Determinism**
- Hybrid roadmap → eventually two-mode (live=best-effort, render=deterministic).

**Cut from scope**
- LLM-as-co-editor (G6) · DAW sync (G7) · Eurorack CV (G8) · V→A→V / D1 · E3 Gallery · E4 Recommendation · B5 stem separation · suggestion-rank heuristic · telemetry · generative-no-source mode (deferred)

**Shipping**
- No migration story needed (zero existing projects matter).
- Mac-first commit, Win/Linux only on community pull.
- Pricing deferred — ship free, instrument via dogfood, decide later.
- `.dna`: strict no-regression across all Entropic versions, forward + backward; unknown-fields-preserve on read.

**Hardware**
- Novation Launchpad first template (LP X / LP Mini Mk3 / LP Pro Mk3); arbitrary-CC Learn covers the rest.

---

## 8. Build Sequence (revised after review)

| Tier | Items | Goal | Safety gates |
|---|---|---|---|
| **0 — In flight** | F1–F4 (PR #36) + PR #37 + PR #38 merge | Foundation | — |
| **1 — Schema-Aware Automation** | B1 schema + **B4-lite (broadcast-only routing schema)** + C1 + C7 + scalar trigger payload + signed-axis-direction + demo trilogy + **I3 inline-menu basics** + history-buffer validation | Paradigm becomes felt. One additive PR; I3 ships because B4-lite gives routing primitive | — |
| **2a — Spectral Family** | A4 + C4 | Spectral primitives + band-isolation as separable engineering surface | **SG-1** hard-blocks (codegen contract before any shader work) |
| **2b — Field Params + Canvas** | C2 + C3 (top-25 effects) + **I2 Routing Canvas** | 2D-field params universal; canvas kills "Map to…" modal | **SG-1** confirmed |
| **3 — Cross-Modal Tensor + Hardware** | B2 (whole-audio) + **B4 full (remaining 4 binding rules)** + B3 + E5 Launchpad + **I1 Inspector Track** | Tensor routing as lived experience; hardware workflow | **SG-4** (multi-backbone audio isolation), **SG-5** (dynamic-cycle detection) hard-block |
| **4 — Instruments** | A1 + A3 + C9 + A5 + D2 + D3 + B1 universal coverage finish | Synth identity becomes literal | **SG-3** stub for A1 latent selection |
| **5 — Latent Tier** | Q7 multi-headed backbone + E1 + C5 + C6 + C8 + D4 + E6 live mode | Semantic axis 1st-class; live-grade | **SG-3** + **SG-4** + **SG-8** hard-block; SG-8 design must land with Q7 spike, not late at E6 |
| **6 — Genoscope** | A2 + E2 (`.dna` strict no-regression + unknown-fields-preserve) + E8 vibe-to-patch | Reference → patch ritual; portable `.dna` peer-to-peer | **SG-2** (`.dna` budget), **SG-6** (cancellation), **SG-7** (codec timeout) hard-block |
| **7 — Plugin Ecosystem** | E7 + hardware partnerships beyond Launchpad | 3rd-party velocity | **SG-9** (plugin quotas + signing) hard-blocks |

---

## 9. Known Risks

- **Q7 latency** — Multi-headed L (DINOv2 ~22MB + CLIP ~150MB + CLAP ~300MB) ≈ 500MB resident + 3× inference cost. Sparse encode + interpolation required. Tier 5 conditional on benchmark <50ms jitter across the head pool.
- **Codec-native spectral** — PyAV 16 does not expose H.264/H.265 DCT coefficients. Spectral effects run post-decode, pre-encode.
- **Painted binding unproven** — no shipping precedent. Research direction; not assumed shippable until user-tested.
- **Per-project VAE training (E1)** — "<60s" is optimistic; spike before commit.
- **`.dna` no-regression is a permanent engineering tax.** Every schema change forever must be additive-only. **Mandatory CI lint rule for E2 onward:** any `.dna` schema field added must be optional + reader must round-trip unknown fields verbatim on save. PR auto-fails otherwise.
- **Single-person bias in pruning loop.** Without telemetry, founder usage shapes inspector / instrument / param-default decisions. Plan structured external user-tests at Tier 4 milestone to triangulate.

---

## 10. Operational Safety Contracts (Real Tigers)

Hard preconditions that gate specific tiers. Without each gate's design landed, the corresponding tier risks freezing the user's session, the Mac, or the audio driver.

| Gate | Contract | Gates tier | Effort |
|---|---|---|---|
| **SG-1** | **GPU resource lifetime contract for codegen** — every Metal handle owned by RAII wrapper; mandatory destructor; texture-pool ceiling per-effect; CI test "create + destroy 10k handles, leak == 0" | 2a, 2b (C2, C3, A4) | Medium |
| **SG-2** | **`.dna` resource budget descriptor + enforcement** — every patch carries `budget: {max_grain_count, max_recursion_depth, max_vram_bytes, max_cpu_ms_per_frame, max_chain_length, max_field_resolution}`. Apply-time validator rejects out-of-budget; trust-confirm to bypass. **Versioned per `.dna` no-regression rule; reader must accept unknown future budget keys + preserve them.** | 6 (E2 — ships with the format itself) | Medium |
| **SG-3** | **Latent NaN/Inf sentinel in render pipeline** — every feedback-capable mod path normalizes latents; NaN-detector aborts the offending lane + toast | 5 (C5, C6, C8, D4, E1) | Medium |
| **SG-4** | **Audio-thread process isolation from multi-headed L worker pool** *(upgraded for multi-headed L decision)* — DINOv2 + CLIP + CLAP run in worker pool with shared inference queue; audio render thread keeps realtime priority + pinned scheduling on its own core; backbone scheduling never blocks audio | 3 (B2), 5 (Q7) | Medium-Heavy |
| **SG-5** | **Dynamic-routing cycle detection** — snapshot routing per render-tick OR per-frame cycle detection with hard fallback; covers B4 painted binding when it ships | 3 (B4 full) | Heavy |
| **SG-6** | **Genoscope cooperative cancellation contract** — workers yield cancel-check every N frames; UI Stop propagates with 5s deadline | 6 (A2) | Medium |
| **SG-7** | **Codec/decode timeout on untrusted sources** — PyAV wrapped, 5s/frame default; `.dna` never auto-fetches URLs without confirm | 6 (E2 imports) | Quick |
| **SG-8** | **Memory-pressure auto-disable + multi-headed L budget** — telemetry on unified-memory pressure; thresholds tied to detected RAM (16/32/64GB Macs each have a budget); multi-headed L counts against budget at load time; auto-disable lowest-priority features (D4 → A5 → A1 density → E1 → frame-bank slots). **Design lands with Q7 spike at Tier 5 start, not at E6.** | 5 (Q7 + E6); cross-cutting from 3+ | Medium |
| **SG-9** | **Plugin resource quota + signing** — per-plugin CPU/RAM/disk/FD/IPC quotas; Ed25519-signed default; unsigned = explicit opt-in with red-flag UI | 7 (E7) | Heavy |

**Cross-cutting hygiene:**
- **SG-H1** Disk LRU on `~/.entropic/{models,cache,thumbnails,renders}` **plus live-mode probe recordings** (per-probe ring-buffer; default cap 200MB per session; rotate oldest on session start; surface in settings)
- **SG-H2** FD management: raise ulimit at startup; LRU-close idle handles
- **SG-H3** Hardware MIDI/OSC echo-timestamp suppression (drop incoming within ~50ms of send)

---

## 11. Next Moves

(a) Spike Tier 1 as a PR draft: B1 schema + **B4-lite (broadcast-only routing schema)** + C1 + I3 inline action menu + demo trilogy. file:line re-verified against current `entropic-v2challenger` HEAD.
(b) SG-1 GPU lifetime contract spike — blocks Tier 2a and 2b which are the next most-valuable surfaces after Tier 1.
(c) Validate / flesh out the existing v2 Photoshop-style history-buffer per the undo decision; spec what it must cover for tensor-routing edits.
(d) Q7 multi-headed L benchmark on Apple silicon (DINOv2 + CLIP + CLAP combined latency + sparse-encode jitter + 16GB memory headroom) — gates Tier 5 commit. **SG-8 design lands here, not later.**
(e) `.dna` no-regression spec doc before E2 starts: versioned budget descriptor, forward-compat read rules, backward-compat write rules, unknown-fields-preserve policy, CI lint rule. Separate review pass (CTO + Red Team) on the spec before Tier 6 opens.
(f) **Triangulate the single-person pruning loop**: schedule structured external user-tests at the Tier 4 milestone (when full instrument set ships) to validate inspector usage, instrument priority, and routing-canvas vs inline-menu balance against real-user behavior — counter the founder-bias risk in §9.
