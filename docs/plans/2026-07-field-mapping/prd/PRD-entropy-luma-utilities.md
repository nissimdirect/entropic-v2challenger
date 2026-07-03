# PRD — Entropy / Luminance Utilities (the "free" field sources)

> **Immutable stakeholder input** (exact quotes):
> - "document all the utilities effects and things weve come up with so far and their composable parts and any ancillary wins"
> - (context) "entropy_map already an effect → free field source"
>
> _Type:_ utility (field producers) · _Status:_ 🟢 drafted · _Depends on:_ Mapping Framework (K1)
> _Skill owners:_ /cto + /mad-scientist

## 1. Problem / why
Two fields are essentially free: **luminance** (trivial) and **entropy** (`entropy_map` already exists as an effect). Exposing them as Utility sources costs almost nothing and adds useful modulation dimensions — "affect busy regions," "brighten drives grain."

## 2. What it does (scope)
- **Luminance:** per-pixel luma as a field source (also the classical-depth fallback input).
- **Entropy:** wrap `entropy_map`'s local information-density as a field source (+ keep its existing output).
- Both triple-use; feed the Field Mixer (e.g., `Tensor − Entropy` = "clean structure").
- **Out of scope:** new algorithms — these are exposures of existing computes.

## 3. Composable parts 🔒
- `entropy_map` (exists) → expose its field via `field_source.py`.
- Luminance = one cvtColor; cached.

## 4. Acceptance criteria (oracle)
- [ ] Both register as field sources; entropy retains its standalone output.
- [ ] `Entropy → grain.density` and `Luma → *` round-trip save/load.
- [ ] `Tensor − Entropy` via Field Mixer produces the expected composite (exact).

## 5. Risks / open 🌱
- Minimal. Entropy is per-block — decide interpolation to per-pixel (bilinear).

## 6. Ancillary wins
Near-zero-cost field sources; entropy becomes a mask ("mosh only busy regions"); pairs with the Field Mixer for compound control.
