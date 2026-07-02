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
| `--cx-text-3` | `#80808E` | hint/placeholder text (4.8:1 on s-1 — AA) |
| `--cx-text-disabled` | `#62626E` | disabled states ONLY (WCAG-exempt; never hints) |

### Accents
| Family | Core | Hover | Pressed | Wash (10–12% α) | On-color text |
|---|---|---|---|---|---|
| ACID | `#C8F321` | `#D9FF4D` | `#A4C916` | `rgba(200,243,33,.10)` | `#0B0B10` |
| MOD | `#8F7DFF` | `#A693FF` | `#7361D6` | `rgba(143,125,255,.12)` | `#0B0B10` |
| RED | `#E5484D` (text/icons) · **fill `#C13B40`** | `#F2555A` / `#D24449` | `#B53A3E` | `rgba(229,72,77,.12)` | `#FFFFFF` (5.3:1 on fill — AA; never 12px white on #E5484D, 3.9:1 FAIL) |
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

## 8. Competitive bar — Ableton density × Teenage Engineering precision

**From Ableton (information density, calm flatness):**
- **Every pixel is data.** Density metrics become tokens: `--cx-row-h: 24px` (track/browser rows), `--cx-panel-header: 28px`, `--cx-device-param-h: 18px`. Device params render as **flat slider-bars with inline label + value** (the Live device idiom) — knobs are reserved for macro/performance contexts.
- **Slider interaction standard:** drag anywhere on the bar, ⇧-drag = fine (10×), double-click = default, click-value = type-in. These are spec, not suggestions.
- **User-assignable clip/track colors** — the ONE sanctioned decorative color channel (Ableton's move). 8-swatch equal-luminance muted palette (≈oklch 0.65 0.09): terracotta `#C07A6A` · ochre `#B99655` · olive `#97A659` · sage `#6FA98A` · teal `#5FA8A8` · slate `#6E93BE` · lavender `#9B86C9` · mauve `#B878A8`. Equal luminance keeps the timeline calm; ties to missing-functions item #8 (clip rename + color).
- **Theme discipline:** dark-only today, but every color flows through tokens so a light theme is a token swap, never a code change.

**From Teenage Engineering (industrial precision, playful exactness):**
- **The TE knob:** 270° travel, hairline tick, and a **colored cap-dot** that announces assignment (acid = macro-mapped, violet = modulated, none = free). Physical-metaphor honesty: a knob with a dot looks ownable.
- **Schematic iconography:** 1.5px-stroke geometric line icons, no filled glyphs; the I2 routing canvas adopts exploded-diagram language (nodes as outlined modules, wires as 1px polylines).
- **Dot-grid texture** (`radial-gradient` dots at ~4% alpha, 8px pitch) on empty states and drop zones — tactile industrial surface instead of blank void.
- **Lowercase mono device voice:** device and param labels render lowercase mono (`pixel_sort`, `rate`, `depth`) — matching the codebase's underscore convention; dialogs/menus stay sentence-case Plex Sans. Two voices, now with two cases, each earned.
- **Boot line:** one typed mono line on launch (`creatrix v3.0.0 — 214 effects loaded`) as the TE-style identity beat; respects reduced-motion.

## 9. Accessibility audit (2026-06-11, computed WCAG 2.1 AA)

| Pair | Ratio | Verdict |
|---|---|---|
| text-1 on surface-1 | 15.1:1 | AAA |
| text-2 on surface-2 / surface-4 | 6.4 / 5.2 | AA |
| text-3 hint `#80808E` on surface-1 | 4.8:1 | AA (was `#62626E` @ 3.1 — FIXED, old value demoted to disabled-only) |
| ACID text/icons on surfaces | 14.5:1 | AAA |
| MOD text on surface-2 | 5.5:1 | AA |
| RED text `#E5484D` on surface-2 | 4.53:1 | AA |
| White on RED **fill** `#C13B40` | 5.3:1 | AA (was white-on-`#E5484D` @ 3.9 — FIXED via fill token) |
| AMBER text on surface-2 | 7.7:1 | AA |
| Focus ring (non-text ≥3:1) | 14.5:1 | pass |
| Meters under CVD | luminance-coded (0.76/0.41/0.22) + position-primary | pass |
| Selection | border + wash (never color-alone) | pass |
| Type floor | 11px everywhere (style-guide 10.5px labels FIXED) | pass |

Caveats: computed, not assistive-tech-tested — live screen-reader/keyboard pass remains PUX.6's gate. Dialog Escape/focus-trap/aria-modal ships in PUX.2; this spec defines the targets.

## 10. Masking & selection components (2026-06-12 addendum)

Skins the behavior in `MASKING-INTERACTIONS.md` (q/g/w/c tools, mask chips, mask-edit mode, J1–J5); data model in `SELECTION-MASKING-SPEC.md`. All §1–§5 laws apply unchanged: chroma budget, glow-is-a-verb, two voices, 11px floor. Live samples: [`style-guide.html`](./style-guide.html) §masking.

### 10.1 Tool palette chips (browser `tool` tab)

| State | Treatment |
|---|---|
| Rest | 24px row (`--cx-row-h`), `surface-2`, lowercase mono label `text-2`, glyph stroke `currentColor` |
| Hover | `surface-4` (browser convention §6) |
| Active | **ACID text on acid-wash** — never a filled chip; glyph inherits ACID |
| Focus | 2px acid outline, offset 1px (§4) |

**Glyphs — 1.5px-stroke schematic line icons (§8 TE language), 16×16 grid, round caps, no fills:**
- `marquee` — a 11×9 rectangle drawn as dashes (2px dash / 2px gap): the icon *is* the selection it makes.
- `lasso` — one closed freehand loop whose tail crosses itself at lower-left and exits ~3px: the rope.
- `wand` — a 45° baton from lower-left, tipped with a four-point sparkle (two crossed 4px strokes); the only diagonal-axis glyph in the set.
- `key` — an eyedropper at 45°: 6px barrel, hollow teardrop tip pointing lower-left; the glyph's tip matches the cursor hotspot.

### 10.2 Mode banner — the Norman mode problem, answered

Selection tools are modal (`MASKING-INTERACTIONS.md` §1) and they capture preview pointer events — a forgotten mode is the classic Norman mode error. The statusbar chip is necessary but peripheral; the banner is the unmissable indicator, **docked to the preview's top edge, inside the panel but outside the canvas letterbox** — chrome never overlaps footage (§1 color-truth rule).

| Property | Spec |
|---|---|
| Geometry | height **20px** (hard cap 22px), full preview-panel width; `surface-2`, `line-1` bottom hairline |
| Appears | ≤**120ms** (`--cx-t-fb`) after tool activation; opacity + 4px translate; exit 140ms; reduced-motion instant |
| Shown when | `cursorMode ≠ select` OR a selection exists OR mask-edit mode; hidden otherwise (zero resting cost) |
| ① MOD tick | 6px MOD dot, present only while a selection exists — the "you have ants" tell, visible even when ants are hidden (`Cmd+Shift+H`) or suppressed during playback |
| ② Tool name | `tool: marquee (ellipse)` / `mask edit: mask_1` — 11px mono `text-1` |
| ③ Key hints | 11px mono `text-3`, context-swapped: rest = `⇧ add · ⌥ subtract · ⌫ delete inside · ⌥⌫ outside`; mid-gesture = `⇧ constrain · ⌥ center · space move`; mask-edit = `b brush · e eraser · [ ] size · v view` |
| ④ Esc affordance | right-aligned keycap chip (1px `line-2`, 2px radius), clickable + focusable, **names the next Escape level** (`esc deselect` → `esc exit tool`) — makes the §9 stack legible one pop at a time |
| Chroma | the MOD dot is the banner's only saturated element (budget §1 holds); a11y: mirrors to `aria-live="polite"` |

### 10.3 Mask chips (device chain + mask-stack row)

In-chain chips fit the 24px density grid: **24×16 matte thumbnail** (1px `line-2` border), lowercase mono name. The 64×36 thumbnail size in `MASKING-INTERACTIONS.md` §5–6 is the **inspector/mask-stack-row size only** — in-chain uses 24×16 (density §8 wins inside the rack).

| State | Treatment |
|---|---|
| Enabled | `surface-3` chip, thumbnail + name `text-1` |
| Disabled | name AMBER (bypass convention §6), thumbnail 45% opacity |
| Edit mode | 2px MOD inset + mod-wash background |
| Routed (`maskRef` on ≥1 device) | 3px MOD corner tick, top-right |
| Lane-modulated | standard mod-ring (ACID 25% α, ≤8px — the only glow, §4) |
| Drag affordance | 2×3 grip-dot column (≈5px) painted at rest at the chip's left edge — handles visible at rest (§4); drag ghost gets the float shadow |

### 10.4 Per-device mask slot (inspector)

One `mask` row at 18px param height: label lowercase mono `text-2` · dropdown (`none / mask_1 / figure / …` — `surface-3`, 1px `line-1`, value mono `text-1`) · `invert` toggle (≥24×24 effective hit). **Mod-ring on the row only when the routed matte is procedural AND lane-modulated** — static mattes never ring. The dropdown is the keyboard routing path (`MASKING-INTERACTIONS.md` §12); drag-assign is the pointer shortcut, never the only path. While a mask chip is being dragged, **every valid drop target shows the dot-grid drop treatment** (§8) persistently — not hover-only — so routing is discoverable mid-drag.

### 10.5 Key inspector panel

| Element | Spec |
|---|---|
| Header | `key — per-frame` 11px mono `text-2` (states the procedural truth in chrome) |
| Eyedropper button | quiet-button anatomy + the `key` glyph; engaged = ACID text on wash |
| Picked-color swatch | 16×16, 1px `line-2`, 2px radius; double-click → hex type-in (mono). The swatch shows **user content** — chroma-budget-exempt the way clip colors are (§8): data, not decoration |
| `tolerance` / `softness` / `spill` | flat slider-bars per §8 Ableton idiom (drag anywhere · ⇧ fine · double-click default · click value = type-in), 18px rows, ACID fill; mod-ring when a lane modulates them (keys are lanes day one) |
| View-mode control | segmented `composite \| matte \| rubylith`, lowercase mono, active = ACID text on wash, 24px tall; mirrors `v`-cycling; current mode echoes in the mode banner and statusbar |

### 10.6 Mask-edit mode treatment

- **Rubylith = 50% `#C13B40` (red-fill) wash over the masked-out area.** §1 reserves RED for destructive *chrome*; rubylith tints *content* — the same chrome/content separation that exempts effect palettes (§7). Film-industry rubylith has been red for seventy years; `red-fill` (not `#E5484D`) keeps chroma low enough not to vibrate over moving footage.
- **Chrome de-emphasis:** timeline + browser sit under a `surface-0` 35% scrim (visual only — click-away still lands and exits, `MASKING-INTERACTIONS.md` §5); inspector + preview stay full. Entry 180ms; reduced-motion instant.
- **Brush cursor:** circle outline at brush radius — 1px MOD over 1px `#0B0B10` ink (same dual-stroke contract as ants) + 2px center dot; while `[`/`]` is held, a size readout chip (`24 px`, 11px mono) rides 16px below the cursor.

### 10.7 Generation progress (RVM figure matte, MK.12)

- The `generate figure matte` button is replaced **in place** by a progress row — no dialog, no overlay; transport stays live (offline-job rationale, `SELECTION-MASKING-SPEC.md` GT-10).
- **Determinate bar** (flat-slider anatomy, AMBER fill — long-running is the suspend family), label `figure matte… 42% · frame 126/300` 11px mono, `cancel` ghost button. First ≤1s before frame counts arrive: bar at 0 with a slow amber-wash pulse, then determinate.
- **Completion:** row swaps out; the two new chips `figure` + `background` enter at **180ms** (`--cx-t-in`, fade + 4px rise, one MOD-wash pulse each — the eye follows the artifact). Reduced-motion: instant.
- **Cancel:** button restored, partial cache discarded, info toast. **Failure:** RED toast + `retry`.

### 10.8 Marching ants — final spec

| Property | Value |
|---|---|
| Stroke | dual: 1px `#0B0B10` ink underlay + 1px dashed `--cx-mod` (dash 4 / gap 4) — guaranteed contrast over any footage |
| Animation | `stroke-dashoffset`, **500ms cycle**, linear, compositor-only; ≤256 vertices (RDP) |
| Secondary affordance | outside-region dim to 65% |
| Playback | ants + dim hide; matte/rubylith view modes persist (`MASKING-INTERACTIONS.md` §10) |
| Reduced motion | no animation — **static dual stroke at 50% opacity**; the 65% dim carries the affordance |

### 10.9 Empty & error states

| State | Treatment |
|---|---|
| Zero-coverage key (<0.1% of frame) | AMBER toast `key matches 0.0% of frame — widen tolerance?` + action link `show matte` (one-click jump to matte view — the auto-suggest) |
| Delete with empty selection | info toast (MOD tick) `nothing selected to delete` |
| Delete-inside / delete-outside | every delete op toasts **which op ran + coverage**: `deleted outside selection — 69% of frame · ⌘Z` — undo visibility is part of the op; 0% coverage at the current frame → AMBER variant (the op happened, just not visibly *here*) |
| Missing matte sidecar / AI cache | chip label AMBER + hover `matte data missing — regenerate` |

### 10.10 Accessibility rows (extends §9)

| Behavior | Verdict / reasoning |
|---|---|
| Focus order | tool chips in `tool`-tab DOM order → preview canvas → inspector; mask chips Tab-sequenced in stack order; banner `esc` chip focusable; nothing focus-trapped outside dialogs |
| Rubylith contrast | **cannot be guaranteed — it overlays unknown footage.** Therefore rubylith is never the only channel: matte view (black/white, guaranteed contrast) is one `v` away, the boundary keeps its 1px ink underlay in every view, and the banner + statusbar announce the active view |
| Mode announcement | banner + statusbar chips mirror to `aria-live="polite"`; view/tool changes are announced, not color-only |
| Keyboard-only operation | full path table in `MASKING-INTERACTIONS.md` §12 — every operation reachable; brush strokes pointer-only v1 (flagged gap, MK.13 a11y row) |
| Chip text contrast | ACID-on-wash 14.5:1 AAA; AMBER disabled-chip labels 7.7:1 AA; banner `text-3` hints 4.8:1 AA |

---

# Creatrix Design Language v1.2 — "Live Signal + Layer Model" (2026-07-02)

**Status:** DRAFT extending v1.1 (all v1.1 tokens/laws above stay canonical). Adds the object
model, the B3 layout grammar, and locked iconography. **Visual source of truth:** the backed-up
prototypes in [`layout-session/challengers/`](./layout-session/challengers/) — open
`challenger-b3-arrangement.html` (signed-off layout), `design-system.html` (full DS draft),
`icon-directions.html` (icon families). These HTML files were built in an untracked scratch dir
and copied here 2026-07-02 so the design survives in-repo.

## §0. Object model — the naming law

**Track = Layer.** The arrangement view IS the layer stack; there is no separate "layers panel."
- Row order = **z-order** (top row renders in front). Drag a row to restack.
- A track carries: visibility (eye), a compact **blend·opacity** readout, mute/solo, and a twirl
  that nests its effect chain + automation lanes *inside* the track (After Effects model).
- "Layer order" belongs to the arrangement, not to any single layer — it is never duplicated in
  an inspector.

## §5. Iconography — BLOCK (locked 2026-07-02)

The 14-tool left rail uses the **Block** family (user decision, "definitely block is best"):
heavy `stroke-width: 2.7`, `stroke-linecap: square`, `stroke-linejoin: miter`, solid fills on
blades/handles/stars. Ableton-chunky, legible at 16px.
- 24×24 grid, 2px safe-zone · **currentColor only** (state color comes from the button, never the
  icon) · keyboard badge bottom-right in `--cx-text-3` · group order TRNS / EDIT / MASK / MISC with
  hairline separators · active = ACID wash + outline (never a filled ACID block behind an icon).
- Path source: `icon-directions.html` `ICONS` map; React impl ships in L0 (`tool-icons.tsx`).
- 14 tools: transform · text · razor · slip · slide · ripple-delete · marquee · ellipse · lasso ·
  polygon-lasso · wand · key-picker · hand · zoom.

## §6. New components (anatomy)

**Track header (lean, ~214px):** twirl · eye · color-chip · name · **blend·opacity bchip** (a
glanceable read; click focuses the LAYER panel) · M/S. The deep controls are NOT in the header.

**LAYER panel (right dock, above EFFECTS):** the selected track's inspector — blend-mode grid,
opacity + fill, blending options (luma range / matte / knockout), transform. Reflects selection;
never lists order. Coexists with the effect-level PROPERTIES panel (LAYER = the track; PROPERTIES
= the selected effect within it).

## §8. Layout grammar — B3 (signed off 2026-07-02)

Left tool-rail (Block icons) · center canvas/preview (hero) · right dock (LAYER · EFFECTS ·
HISTORY · PROPERTIES) · bottom arrangement = the layer stack. Ships behind `F_CREATRIX_LAYOUT`.
Build phases: PRD `docs/plans/2026-07-02-b3-layout-redesign-prd.md` (L0–L5).

## §10. Remaining
- Full markdown transcription of `design-system.html` §1–§9 (this section is the load-bearing
  subset + the locked decisions; the HTML remains the exhaustive visual reference).
- Opacity-draggable-in-header (deferred; revisit after L3).
