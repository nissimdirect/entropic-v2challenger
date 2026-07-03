# PRD — <Element Name>

> **Immutable stakeholder input** (exact quotes — do not paraphrase):
> - "<verbatim user quote that motivated this>"
>
> _Type:_ utility | destination | effect | framework | composition · _Status:_ 🌱/🟡/🟢 · _Depends on:_ …
> _Skill owners (≥2):_ /cto + /… (e.g. /cdo for UI, /mad-scientist for experimental, /audio-production for audio, /uat for acceptance)

## 1. Problem / why
What's missing today; why this element. One paragraph, from the user's side of the screen.

## 2. What it does (scope)
- In scope: …
- **Out of scope** (explicit): …

## 3. Composable parts
The reusable atoms this ships or reuses (so we don't rebuild). Reference existing code.

## 4. The three surfaces (guide → under-the-hood)
- **Preset/composition:** the one-click cool outcome.
- **Suggested routing:** what the UI proposes.
- **Full control:** the exposed knobs (ModulationMatrix / params).

## 5. Design / architecture
Grounded in current code (name files/types). Mark 🔒 grounded vs 🌱 open.

## 6. Acceptance criteria (the oracle)
- [ ] A hard, checkable test (command / schema / pixel-diff), not "looks done".
- [ ] Determinism / parity where applicable.

## 7. Risks & open questions 🌱
Ideation welcome — alternatives, trade-offs, things to decide later.

## 8. Ancillary wins
What else this unlocks for free.
