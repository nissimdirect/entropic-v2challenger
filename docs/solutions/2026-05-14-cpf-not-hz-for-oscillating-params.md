---
title: Cycles-Per-Frame, Not Hz, for Frame-Index-Driven LFOs
date: 2026-05-14
tags: [effects, determinism, lfo, modulation, architecture, accessibility]
problem: Oscillating-param effect using Hz produces different output for same project rendered at 24fps vs 60fps
severity: high
---

# Problem

When adding a built-in oscillator to an effect (e.g. `osc_rate` modulating `image_balance` on a per-frame basis), the intuitive UI label is **Hz** — "how many times per second should this oscillate?" That intuition is wrong for Entropic.

The effect's `apply()` signature receives `frame_index: int` but **not** `fps`. To compute phase from Hz you need `phase = 2π * rate_hz * (frame_index / fps)`. With no `fps` available, you have to assume a value (typically 30).

**This silently breaks the seeded-determinism architectural lock** (v2 Challenger Spec #3: "no stateful RNG in effects; output deterministic from `Hash(ProjectID + EffectID + FrameIndex + Seed)`"). The same project rendered against a 24fps source vs a 60fps source produces different phase at the same `frame_index`, so the oscillator is in a different position, so the threshold lands in a different place, so the output frame differs.

For a glitch DAW where users share `.glitch` project files across devices and source clips, "the same project renders differently on my machine" is a brand-damaging support nightmare.

# Root Cause

Hz is a **wall-clock** unit. The effect pipeline operates on **frame indices**, not wall clock. Mixing the two requires an `fps` constant the effect ABI does not provide. Hardcoding an assumption (e.g. `fps = 30`) turns the determinism property into a function of `(frame_index, seed, fps_of_source)` — three inputs where the architecture promises two.

The seeded-determinism lock exists so that:
- Re-renders are bit-identical
- Project files travel across machines/sources without behavior drift
- Cache-key construction is sound (cache by `(project, effect, frame_index, seed)` — no `fps` term)

Hz violates all three when source fps varies.

# Solution

**Define `osc_rate` in cycles-per-frame (cpf), not Hz.**

```python
phase = 2.0 * np.pi * rate_cpf * frame_index
```

This is fps-independent: same `frame_index` always produces the same `phase`. The determinism property is preserved.

**UI friendliness:** users don't think in cpf, so expose a friendlier knob:

```python
PARAMS = {
    "osc_rate": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,              # ← 0-1 user knob
        "default": 0.0,
        "curve": "exponential",
        "label": "Osc Rate",
    },
}

# Internally:
_MAX_OSC_RATE_CPF = 0.15
rate_cpf = osc_rate_knob * _MAX_OSC_RATE_CPF
phase = 2.0 * np.pi * rate_cpf * frame_index
```

**Hard-cap `_MAX_OSC_RATE_CPF` at 0.15** (= 4.5 Hz @ 30fps) for **photosensitive-seizure compliance**. The medical photosensitive-seizure trigger threshold begins around 3 Hz; staying below it is mandatory for publicly distributed apps with accessibility commitments.

**Defense in depth:** clamp `osc_rate` at the schema level AND inside `apply()` (trust boundary, in case a crafted project file bypasses schema validation):

```python
osc_rate = max(0.0, min(1.0, float(params.get("osc_rate", 0.0))))
```

# Prevention

- **For any future oscillating-param effect:** repeat the cpf pattern. Never use Hz. Never compute `phase = ... / fps` inside an effect.
- **Add a determinism test** that pins `frame_index` and `seed`, applies the effect with `osc_rate > 0`, and asserts the output is byte-identical across two calls (proves no fps dependency, no wall-clock leak, no RNG state leak):
  ```python
  def test_oscillation_is_frame_index_deterministic():
      params = {"osc_rate": 0.5, "osc_depth": 10.0}
      out_a = _apply(frame, params, frame_index=42, seed=7)
      out_b = _apply(frame, params, frame_index=42, seed=7)
      assert np.array_equal(out_a, out_b)
  ```
- **Gate the noise re-seed on (rate > 0 AND depth > 0).** If only rate is gated, setting rate but leaving depth at default 0 produces frozen balance but *boiling* tear-noise — an off-axis flicker the user can't disable. This was caught during the visual-UAT phase of the torn_edges build; see PR for the fix.
- **Document the cpf upper-bound in the effect module:** name it (`_MAX_OSC_RATE_CPF`) and comment why (seizure compliance). Future maintainers must not "uncap" without a parallel accessibility review.

# Related

- `entropic.md` v2 Challenger Spec: "Seeded determinism — `Hash(ProjectID + EffectID + FrameIndex + Seed)`"
- This decision came out of the CTO + Red Team passes during the `fx.torn_edges` build. Both passes flagged Hz as a determinism violation.
- See `feedback_numeric-trust-boundary.md` for the param-clamping discipline.
- The first build of `torn_edges` used Hz with `fps=30` assumption; the determinism break would only have shown up in a 24/25/60fps regression test, which doesn't exist in the suite. Caught at architecture review, not at test time — reinforces the value of CTO/Red-Team passes BEFORE write.
