# Creatrix Design Language v1 — "Live Signal"

**Author:** Fable (CDO pass), 2026-06-11 · **Status:** canonical — supersedes Pop Chaos v1.0 *and* the UX-SPEC purple *and* the incumbent Tailwind-green for all Creatrix UI. PUX.1–PUX.6 implement THIS spec. Visual reference: [`style-guide.html`](./style-guide.html).

## 0. Why Pop Chaos v1.0 is retired

Six max-chroma neons (#39FF14, #FF00FF, #00FFF7, #FF2D2D, #FFBF00, #7B61FF) on black is a moodboard, not a system: hues at full saturation vibrate on dark surfaces, glows-as-decoration read as costume, all-caps mono everywhere flattens hierarchy into shouting, and 9–10px captions sit below the legibility floor. Fatal for a video tool: saturated chrome around the preview shifts perceived color of the user's footage. The one good instinct — cold undertone in the blacks — survives below, tuned in OKLCH.

## 1. Thesis — *Instrument, not costume*

Creatrix is precision hardware in a dark studio. The UI is matte, quiet, and tactile; **the video is the only loud thing by default.** Color is state semantics, never decoration:

- **ACID** (the user's acid yellow-green) = *life*: primary actions, play, meters, modulation activity. The identity color.
- **MOD VIOLET** = *the cool channel*: selection, routing, inspector probes, automation.
- **RED** = *record / destructive / clip / error only*. Its rarity is what makes it mean something.
- **AMBER** = *suspended states*: bypass, freeze, warnings.
- Everything else is the neutral ladder.

**Chroma budget (hard rule):** at rest, ≤1 saturated element per UI region; only meters and live mod-rings may stay continuously saturated; the preview canvas sits in the darkest neutral band (`surface-0`) for color truth. Max 2 accent families visible per region.

## 2. Tokens — primitives (tier 1)

All values OKLCH-derived (hue 285 cast in the neutrals — CRT undertone, perceptually even), exported as hex.

### Surfaces (elevation = lightness, not shadows)
| Token | Hex | Use |
|---|---|---|
| `--cx-surface-0` | `#0B0B10` | Preview surround, void, app frame |
| `--cx-surface-1` | `#121218` | App background |
| `--cx-surface-2` | `#18181F` | Panels, sidebars, timeline bed |
| `--cx-surface-3` | `#20202A` | Devices, cards, inputs |
| `--cx-surface-4` | `#282834` | Hover, overlays, menus |
| `--cx-line-1` | `#2E2E3A` | Hairline borders |
| `--cx-line-2` | `#3C3C4C` | Strong borders, dividers |

### Text
| Token | Hex | Floor |
|---|---|---|
| `--cx-text-1` | `#E7E7EC` | body+ on surface-1..4 (13.9:1 on s-1) |
| `--cx-text-2` | `#9A9AA6` | labels on s-1..3 (5.6:1) |
| `--cx-text-3` | `#62626E` | disabled/hint only — never load-bearing copy |

### Accents
| Family | Core | Hover | Pressed | Wash (10–12% α) | On-color text |
|---|---|---|---|---|---|
| ACID | `#C8F321` | `#D9FF4D` | `#A4C916` | `rgba(200,243,33,.10)` | `#0B0B10` |
| MOD | `#8F7DFF` | `#A693FF` | `#7361D6` | `rgba(143,125,255,.12)` | `#0B0B10` |
| RED | `#E5484D` | `#F2555A` | `#B53A3E` | `rgba(229,72,77,.12)` | `#FFFFFF` |
| AMBER | `#D9A23C` | `#E8B453` | `#B28430` | `rgba(217,162,60,.12)` | `#0B0B10` |

Success = ACID (no separate green). Info/links/selection = MOD. No magenta, no cyan, no second green — if a new semantic appears, it must displace one of these, not join them.

### Category ticks (device rack)
Devices are NEUTRAL (`surface-3`) with a 3px left tick at restrained chroma (oklch ≈0.70 0.11) — the rack must not rainbow:
glitch `#D06A6A` · distortion `#9A8BE8` · color `#5FB8C4`* · temporal `#D4A865` · modulation `#AFCB52` · texture `#8E8E9A` · enhance `#C9C9D2` · destruction `#C77DC0`.
*Muted cyan exists ONLY as a 3px tick, never as a fill or text color.

## 3. Typography — two voices, not one

| Role | Face | Size/weight | Case |
|---|---|---|---|
| UI labels, body, dialogs, menus | **IBM Plex Sans** | 12.5px/450 body · 12px/550 labels | Sentence case |
| Data: values, timecode, hex, BPM, param readouts | **IBM Plex Mono** | 11–12px/450, `font-variant-numeric: tabular-nums` | as-is |
| Identity moments: logo, empty states, boot | IBM Plex Mono | 18–24px/650, tracking +2% | UPPERCASE allowed HERE ONLY |

Kills the all-caps-mono shout; mono stays where mono earns it (alignment, instrument data). **Floor: 11px.** Nothing smaller, ever. Plex pair is engineering-native, free, variable, and not on the convergence blacklist.

## 4. Shape, depth, focus, hit targets

- Radii: 2px (controls) · 4px (devices/cards) · 6px (dialogs). 1px borders from the line tokens.
- Shadows ONLY on floating layers (menus, dialogs, drag-ghosts), dual-layer: `0 2px 4px rgba(0,0,0,.4), 0 8px 24px rgba(0,0,0,.5)`. Resting surfaces get NO shadows — the ladder is the elevation.
- **Glow is a verb, not a skin:** permitted only as live-signal treatment — record halo (RED), mod-ring activity (ACID at 25% α, ≤8px blur). Nothing else glows.
- Focus: `outline: 2px solid var(--cx-acid); outline-offset: 1px` on every interactive element (Gate 6). Never `outline: none` without replacement.
- Hit targets ≥ 24×24px effective (pointer app); drag handles always VISIBLE at rest (≥6px painted, not hover-revealed) — direct fix for the invisible-trim-handle and r=4px node findings in `packets/ux-audit.md`.

## 5. Motion — mechanical, brief, honest

- Curve `cubic-bezier(0.2, 0, 0, 1)`; feedback 120ms, entries 180ms, exits 140ms; compositor-only (`transform`/`opacity`); `prefers-reduced-motion` honored everywhere.
- **One sanctioned glitch moment:** a single-frame RGB-split flicker (≤120ms total) on render-complete and on destructive-confirm. That's the brand wink — once per interaction, never ambient.

## 6. Per-surface application

| Surface | Treatment |
|---|---|
| Preview | `surface-0` matte surround; transport icons `text-2`, play active ACID; record RED+halo |
| Timeline | bed `surface-2`; clips `surface-3`+`line-1`; selection MOD 2px inset + 12% wash; playhead ACID 1px; markers AMBER |
| Performance track | MOD identity (header tick + arm state), NOT "electric blue" (supersedes B2-lite's color note) |
| Device chain | neutral devices + category tick; bypass AMBER label state; knob value-arc ACID, mod-overlay-arc MOD |
| Browser | `surface-2`, rows hover `surface-4`; active item ACID text on wash — no full-row fills |
| Automation | lane curves MOD; breakpoints ≥8px visible handles; hover +2px |
| Meters | ACID bar → AMBER >-6dB → RED >0dB only |
| Dialogs/menus | `surface-4`+dual shadow; destructive actions RED filled; Escape+focus-trap mandatory (PUX.2) |
| Toasts | info `surface-4`/MOD tick · success ACID tick · warn AMBER · error RED; text `text-1` |

## 7. Governance & migration

- Three tiers: primitives above → semantic (`--cx-action`, `--cx-selection`, `--cx-danger`, `--cx-meter`…) → component (`--cx-knob-arc`, `--cx-clip-border`…). Components may only reference semantic; semantic only primitives. CI hex-ratchet from `packets/ux-audit.md` §4 enforces (866 hexes → ramp down per PR).
- Migration map (PUX.1): `#1a1a1a`→`surface-1/2` by role · `#4ade80`(×125)→ACID where it means *life/activity*, `text-2`/MOD where decorative · UX-SPEC `#a855f7`→MOD · pure grays(×~520)→nearest neutral-ladder step. Pop Chaos `tokens.py` stays for *effect palettes inside the video* (nuclear/phosphor presets are content, not chrome) — chrome and content palettes are now formally separate.
- A11y floors are part of the token definition (pairings in §2 tables); contrast-check is a PUX.6 live-pass gate.
