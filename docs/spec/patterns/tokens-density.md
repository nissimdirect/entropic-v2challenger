# Teardown: design tokens and control density

Feeds: systems/tokens · D5 (mono-only) · D6 (type scale, 12px floor) · D11 (translucency = state) · A06 device chain, A05 LAYER panel, A20 prefs.
Refs read: Blueprint (Apache-2.0), Tweakpane (MIT), Vital (GPL, patterns only), Surge XT (GPL, patterns only), Cockos WDL (readable permissive).
Legal: GPL sources (Vital, Surge) were read for structure and behavior only. Nothing is copied. Color hex values from their skins are not reproduced.

## Problem in Creatrix today

1. **The token file is complete but thinly consumed.** `frontend/src/renderer/styles/tokens.css` is a three-tier system (header lines 1-12): Tier 1 primitives, Tier 2 semantic aliases (`--cx-action*`, `--cx-selection*`, `--cx-danger-*`, `--cx-warn*`, `--cx-bg-*`) and Tier 3 per-surface aliases. Counting `var(--...)` uses across `frontend/src/renderer`:
   - `--cx-device-param-h` is used 2 times.
   - `--cx-row-h` is used 1 time.
   - `--cx-panel-header` is used 1 time.
   - `--cx-control-h` is used 6 times.
   - `--cx-space-8` is used 6 times.
   - The density tokens (`tokens.css` "Density (DESIGN-SPEC §8)", `--cx-row-h: 24px; --cx-panel-header: 28px; --cx-device-param-h: 18px`) exist but surfaces mostly ignore them.
2. **The D6 12px floor is not yet met.** `frontend/.ui-ratchet-ceilings` records `css_font_below_floor=225`. A count of `font-size: Npx` in `renderer/styles/*.css` shows 120 at 11px, 68 at 10px, 20 at 9px and 8 at 8px (compare 68 at 12px, 21 at 13px). The floor is law (D6) but the ratchet is still ahead of the code.
3. **Hex and inline style escape the token layer in TSX.** The same ceilings file records `tsx_hex=178` and `tsx_inline_style=134`. Example: `DeviceChain.tsx:516` uses `'#ef4444' : '#666'` for the depth counter.
4. **Heights are not on one grid.** The control height is 22px (`--cx-control-h`), param row 18, row 24, panel header 28, spacing steps 2/4/6/8/12/16/24. 22 and 18 are not multiples of 4 and 6 is not a multiple of 4. There is no stated base unit.
5. **One density only.** There is no compact/comfortable variant, and no UI scale. Native page zoom is deliberately disabled (`frontend/src/main/index.ts:273`, "Cmd+scroll controls timeline zoom instead"). Users cannot enlarge the UI for legibility (the D7 contrast and D6 "a bit bigger than min" concern).
6. **Type tiers are four fixed sizes.** `--cx-text-heading/body/label/data` = 16/14/13/12 with weights 650/450/600/450 (`tokens.css`, D6 SCALE B+1). Density currently has no way to trade type for space since the floor prevents it.
7. **Elevation is lightness, not shadow.** `tokens.css` "Surface ladder": `--cx-surface-0..4`. Overlays use `--cx-overlay-*` scrims. This is a ratified direction (DESIGN-SPEC §2), not an accident.
8. **Knob interaction constants are file-local.** Drag sensitivities and wheel steps are constants inside the component (`components/common/Knob.tsx:41-48`). Knob visual geometry was not audited for token use.

## Patterns

| # | Pattern | Source + tier | Behavior | Fit / conflict | Feeds |
|---|---|---|---|---|---|
| 1 | One base spacing unit; every size is a multiple | Blueprint `packages/core/src/common/_variables.scss:33` (`$pt-spacing: 4px`), `:40-41` (icon 4u / 5u), `:62-64` (font 3.5u = 14px, large 4u, small 3u = 12px), `:76-84` (button/input height 7.5u = 30px, small 6u = 24px, smaller 5u = 20px, large 10u = 40px) | Every dimension is `unit x N`. Changing the base rescales the system consistently. | **Fits D6.** Blueprint's *small* font (12px) equals Creatrix's floor, so the floor is already inside the dense-desktop precedent. Creatrix 22px control and 18px param rows break the 4px multiple. A 2px sub-unit would resolve them (22 = 11x2, 18 = 9x2) or the spec moves them to 20/24. Not decided here. | systems/tokens |
| 2 | Size as a named variant (small / large) plus a separate `compact` class | Blueprint `common/classes.ts:40` (`COMPACT`), `:57` (`SMALL`), `:463-474` (maps `size` prop and legacy `small`/`large` booleans to a class); `html-table/_html-table.scss:66` (`.compact`) | Density is a variant on the component, chosen at the call site, with the legacy boolean props normalized into one class. | **Fits** if density is wanted. Variants may change height and padding only. They never shrink type below the 12px floor (D6). | systems/tokens |
| 3 | Density expressed as 5 CSS variables | Tweakpane `packages/core/lib/sass/common/_defs.scss:34-43` (`container-unit-size`, `container-unit-spacing`, `container-h-padding`, `container-v-padding`, `blade-value-width`) and `:25-32` base/blade vars | A control panel's whole rhythm comes from unit height, unit spacing, horizontal padding, vertical padding and value-column width. The theme demo lets the user vary unit size over 8-32 and spacing over 0-16 (`packages/tweakpane/src/doc/ts/route/catalog.ts:425, 465-470`). | **Fits.** Maps to Creatrix `--cx-device-param-h` (row height), `--cx-space-*` (gap) and a value-column width that does not exist as a token. The spec should add the value-width token to the device row (see devices-params.md #7). | systems/tokens · A06 |
| 4 | Fixed value-column width so rows align | Tweakpane `_defs.scss:29` (`blade-value-width` / `--bld-vw`), `catalog.ts:455-460` (range 100-200) | Label column flexes, the value column has a fixed width, and all rows align vertically. | **Fits** the monospace identity (D5). Mono digits plus a fixed column make aligned numeric readouts cheap. | A06 · A05 |
| 5 | Two-level naming: palette, then semantic ids | Surge `resources/data/skins/dark-mode.surge-skin/skin.xml` (palette colors such as `bggray`, `darkgray`, then semantic ids such as `lfo.waveform.background` that point at the palette names) | Raw colors have neutral names. Semantic ids point at them. Surfaces consume only the semantic ids. | **Already ratified.** It matches Creatrix Tier 1 / Tier 2 / Tier 3. Confirms the architecture. No change. The spec should carry the Surge detail that a semantic id may *only* reference a palette name, which is Creatrix's "Tier 2 may only alias Tier 1" rule. | systems/tokens |
| 6 | Skin = one data file of named geometry and color values | Vital `default.vitalskin` (JSON keys include `Padding`, `Large Padding`, `Widget Margin`, `Knob Arc Thickness`, `Text Component Height`, `Slider Width`, `Modulation Button Width`, `Body Rounding`), loaded via `src/interface/look_and_feel/skin.h:64-123` (`ValueId`, color ids) | Geometry (sizes, margins, thicknesses) and colors live together in one swappable file. Components read named values, never literals. | **Partial fit.** Creatrix already splits color (`tokens.css`) from per-surface CSS. The idea that *geometry* tokens (arc thickness, handle length, handle margin) are tokens too is new to the knob and lane visuals. | systems/tokens · A06 |
| 7 | Per-section skin overrides | Vital `default.vitalskin` key `overrides` (30 named sections, e.g. a compressor or a delay section overrides its own accent colors and one geometry value) | A section can override a handful of values without forking the whole skin. | **Rejected for color: conflicts DESIGN-SPEC §2** (category colors are tick-only, never fill or text: `tokens.css` "Category ticks … tick colors ONLY; never fill/text"). Not a D-row, so flagged for the owner. The structural idea (scoped override of named values) is fine for geometry. | systems/tokens |
| 8 | Global UI scale ratio | Vital `src/interface/editor_sections/synth_section.h:233, 304, 360` (`setSizeRatio`, `getSizeRatio`, `size_ratio_`: derived sizes are `default x ratio`); Surge `src/surge-xt/gui/SurgeGUIEditor.h:324, 336-339` (`zoomFactor = 100` percent, `setZoomFactor`) | One number scales all geometry and type. Users choose a zoom level. | **Fits an unmet need** (Problem 5), but it is a new preference. D6 sets the floor at 12px, so the scale can only go up from 1.0. Under D6, scale < 1 is forbidden. Candidate only. | A20 prefs |
| 9 | Dense desktop type | Blueprint `_variables.scss:62-64` (default 14px, small 12px, large 16px) | A dense desktop kit uses 12/14/16, and 12 is the *small* tier, not a below-floor size. | **Supports D6**: Creatrix 16/14/13/12 is within the Blueprint range. Evidence that 12px data text is not unusually large for dense desktop UI. | systems/tokens |
| 10 | Elevation by shadow in dark theme | Blueprint `_variables.scss:98-99, 121-130` (`$pt-dark-border-shadow-opacity`, `$pt-dark-elevation-shadow-0..`) | Dark theme still expresses depth with doubled-opacity shadows. | **Rejected: conflicts DESIGN-SPEC §2** ("Elevation = lightness, not shadows", `tokens.css` "Surface ladder"). Not a D-row, so flagged. | systems/tokens |
| 11 | Anchor-ratio layout for resizable panes | WDL `WDL/wingui/wndsize.h:22-40` (`WDL_WndSizer::init_item` with left/top/right/bottom anchor ratios 0..1) | Child controls move or stretch by ratios of the parent's new size. | **Fits** the existing percent-based `previewHPct` (`stores/layout.ts`) and is a model for declaring resize behavior per child as data. Low novelty. | systems/docking |
| 12 | Skin config structs per control kind | WDL `WDL/wingui/virtwnd-skin.h:8, 64-90` (`WDL_VirtualWnd_BGCfg`, `WDL_VirtualIconButton_SkinConfig`) and `virtwnd-controls.h:266, 275` (`SetSkinImageInfo`, `SetFGColors`) | Each control kind takes an optional struct of images, colors and margins that overrides defaults. | **Weak fit.** Same idea as Tier 3 component tokens. No new information. Recorded for completeness. | systems/tokens |

## Recommendation for the spec

1. **(Problem 4, #1)** State the base unit. Present two options for the owner: (a) 4px grid with 20/24 control rows (breaks the current 22/18), or (b) a 2px sub-unit that keeps 22 and 18. The spec lists every existing spacing and height token and which multiple it is.
2. **(Problem 1, #3)** Give each density token (`--cx-row-h`, `--cx-device-param-h`, `--cx-panel-header`, `--cx-control-h`) a *named consumer list* in the spec. The component spec cites them. A token with no consumer is deleted or adopted (kill criterion).
3. **(Problem 2, D6, #9)** The type-floor ratchet target is already law. The spec adds a *migration table* by file: the 225 below-floor declarations, grouped by surface, so the sweep can be ordered. It does not relax the floor.
4. **(#3, #4)** Add a value-column width token for device and LAYER-panel param rows and require tabular figures (the `data` tier already says tabular-nums).
5. **(#2)** If density variants are wanted, define them as height and padding modifiers only (`compact` / default), and forbid type below the floor in any variant.
6. **(#5)** Keep Tier 1 / 2 / 3. Add the rule "surfaces consume only Tier 2/3" as a lint (the existing hex ratchet covers literals; this covers Tier 1 references from components).
7. **(#6)** Record geometry values for the knob (arc thickness, handle length) as tokens, so the Knob (`Knob.tsx`) and the lane/point visuals share them.
8. **(#7, #10)** Record both as rejected with the DESIGN-SPEC section reference. The spec's "do not" list includes per-section accent recolor and shadow elevation.
9. **(Problem 3)** Add a state-surface rule (cross-ref states-empty-loading-error.md): no hex in TSX; state colors come from `--cx-danger-*`, `--cx-warn*`.

## Library evidence

Adopting Blueprint's or Tweakpane's styling layer wholesale is not what this topic needs. Neutral notes:

- **Blueprint** is Apache-2.0 and mature, but its base is a system sans stack (`_variables.scss:44-56`), shadow elevation (#10) and a light/dark pair. All three differ from D5 and DESIGN-SPEC §2. Its sizing scale (#1) is reusable as an idea at zero dependency cost.
- **Tweakpane** is MIT (`package.json`, v4.0.5). It is a compact parameter-pane library with five density variables (#3). Its DOM and plugin model is vanilla TypeScript, not React. Using it directly would mean a wrapper per pane and would not give Creatrix's knob/automation visuals. Its *parameter-binding model* is relevant to devices-params.md, not here.
- **WDL** is a C++ UI toolkit (zlib-style). There is nothing to adopt in a React/Electron stack. Its value is as reference for resize-anchoring and for the slider modifier conventions in devices-params.md.

## Candidate additions (owner approval required)

1. **UI scale preference** (#8): 100% to a maximum, never below 1.0 because of the D6 floor.
2. **Compact/comfortable density toggle** (#2, #3).
3. **Per-section geometry overrides** (#7, geometry only, no color).
