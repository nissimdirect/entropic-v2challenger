# Teardown: empty, loading and error states

Feeds: systems/states · D7 · A01 shell, A03 browser/presets, A05 LAYER panel, A06 device chain, A12 preview, A16 export.
Refs read: Blueprint (Apache-2.0, `~/Development/_refs/blueprint`), dockview watermark (MIT). PLAN.md also lists React Aria, Olive and Kdenlive empty bins for this topic. They were not in this reader's brief and are **not covered**.
Legal: all ADOPT tier, read freely. No GPL code read.

## Problem in Creatrix today

1. **Empty state is solved by a skin-only primitive.** `frontend/src/renderer/components/common/EmptyState.tsx` takes exactly `hint`, `testId` and an optional `className`. It renders one `<p>` and has no buttons (header comment, lines 1-14, cites D7 + OD-4). Styling is `styles/empty-state.css`: `--cx-text-body` 14px, `--cx-text-3` (4.8:1 AA per `tokens.css`), `max-width:280px`, centered.
2. **Adoption is partial.** Callers are `OperatorRack.tsx:201`, `HistoryPanel.tsx:38`, `PresetBrowser`, `RenderQueue`, `MIDISettings`, `EffectBrowser`, `PreviewCanvas.tsx:190-195`, `InspectorTrack.tsx:227` and `DeviceChain.tsx:493-497`. The component header calls itself "zero adoption in this packet", with an F3 sweep to follow.
3. **Hint copy is inconsistent in grammar and in instructions.** Examples:
   - "Drag a clip here, or ⌘I to import." (`PreviewCanvas.tsx:192`)
   - "No effects yet — browse the EFFECTS tab to add one." (`DeviceChain.tsx:496`)
   - "No operators — click + Add to create one" (`OperatorRack.tsx:201`)
   - "No actions yet" (`HistoryPanel.tsx:38`)
   - The copy uses mixed dash styles, mixed "to X" phrasing, and one hint names a keyboard shortcut. Two of them name a click target. There is no copy rule.
4. **Loading is bespoke.** `PreviewCanvas.tsx:197-201` renders a raw `div.preview-canvas__spinner` plus the text "Loading...". There is no `role="progressbar"` or `role="status"`. `PreviewState = 'empty' | 'loading' | 'ready' | 'error'` (`:6`) exists only for the preview. No other surface has a loading state vocabulary.
5. **Error is bespoke, and it uses a button.** `PreviewCanvas.tsx:203-211` shows `renderError ?? 'Render failed'` plus a "Retry" `<button>`. D7 bans CTAs on **empty** states only. The spec has to say explicitly whether error states may carry an action.
6. **Error surfaces are split four ways, with no shared taxonomy.**
   - Root `ErrorBoundary` wraps the whole app once (`App.tsx:4539-4541`; `components/layout/ErrorBoundary.tsx`, "Something went wrong").
   - Toasts for transient errors (`components/common/Toast.tsx:24-25` uses `role="alert"`, `aria-live` assertive for errors; rules in the project CLAUDE.md Toast Conventions).
   - Inline banners (`RoutingCanvas.tsx:463`, `role="alert"`).
   - Per-card error (`DeviceCard.tsx:298`, `device-card--error`).
7. **Hard-coded colors in a state surface.** `DeviceChain.tsx:516` uses `'#ef4444' : '#666'` inline for the chain-depth counter. `#666` on the panel surface is below AA and `#ef4444` is not a token. This is the kind of drift a state spec has to rule out.
8. **No skeleton or in-between state.** Lists (presets, effects, history) go from nothing to full content. There is no placeholder for slow IPC.

## Patterns

| # | Pattern | Source + tier | Behavior | Fit / conflict | Feeds |
|---|---|---|---|---|---|
| 1 | One component, slots: icon, title, description, action, children | Blueprint `packages/core/src/components/non-ideal-state/nonIdealState.tsx:30-110` (`NonIdealStateProps`) | A single non-ideal-state primitive renders optional icon, `H4` title, description, `action` and `children`. `layout` is `"vertical"` or `"horizontal"`. | **Partial fit.** The "one primitive for every non-ideal state" idea fits (Creatrix `EmptyState` is already that). The `action` slot is **rejected for empty states: conflicts D7** ("no CTA buttons"). Title+description is heavier than D7's "minimal styled hint text". | systems/states |
| 2 | Icon size as a named enum, muted by default | Blueprint `nonIdealState.tsx:24-28` (`NonIdealStateIconSize` STANDARD/SMALL/EXTRA_SMALL = 3x, 2x, 1x-large of icon unit), `iconMuted = true` | Icon size scales with the container: big in a panel, small in a dense row. | **Not applicable under D7.** D7 specifies hint text only, with no icon. Record as available vocabulary if D7 is ever amended. Do not introduce. | systems/states |
| 3 | Horizontal layout for narrow or short containers | Blueprint `nonIdealState.tsx` (`layout` prop, class `…-${layout}`) | The same state reflows to one row when the container is short. | **Fits.** Creatrix hints already live in short containers (history panel, operator rack). The spec should say hints are single-line and wrap rather than become a vertical stack. | systems/states |
| 4 | Spinner is an ARIA progressbar; determinate or indeterminate | Blueprint `components/spinner/spinner.tsx:41, 91-115` (`MIN_SIZE = 10`, `role: "progressbar"`, `aria-label: "loading"`, `aria-valuenow` only when `value` given; `SPINNER_NO_SPIN` when determinate) | One spinner covers both: no `value` shows the rotating track at 25%, a `value` in 0-1 shows progress and stops spinning. | **Fits.** Fixes Problem 4: Creatrix has no semantics on its spinner and a separate progress UI in export. One primitive, two modes. The min size 10 is also a useful floor next to the D6 12px type floor. | systems/states · A16 |
| 5 | Skeleton = a class applied to the real markup | Blueprint `components/skeleton/_skeleton.scss:1-15`, `skeleton.mdx` ("`.bp-skeleton` renders this element as a skeleton, an outline of its true self") | A loading placeholder reuses the final layout and only masks its content with a pulsing fill. | **Fits** Problem 8, and the real content keeps its size so there is no layout shift. **Check D11:** a pulsing fill is translucency used for a transient state, which D11 allows ("translucency = transient state"). Needs the `prefers-reduced-motion` rule from the motion tokens. | systems/states · A03 |
| 6 | Intent taxonomy: none, primary, success, warning, danger | Blueprint `common/intent.ts:23-27`; `Callout` (`components/callout/callout.tsx:46-63`, `intent` sets background, title and default icon, `compact` option); `Toast` uses the same intent set (`toast/toast.tsx:84`) | One 5-value vocabulary drives banner, toast and callout color and icon. | **Fits.** Creatrix already has the semantic aliases (`--cx-danger-*`, `--cx-warn*`, `--cx-selection*`, `tokens.css` Tier 2). The spec just has to name the mapping once and use it on toast, banner and per-card errors. There is no "success" alias today, which is a gap to resolve against D-rows (not decided here). | systems/states · systems/tokens |
| 7 | Alert semantics baked into the component | Blueprint `toast/toast.tsx:97` (`<span role="alert">` on the message) | The live-region role is part of the component, not left to callers. | **Fits.** Creatrix already does this for `Toast.tsx` and the routing banner, but not for the preview error overlay (Problem 5). | systems/states |
| 8 | Empty-layout watermark | dockview `packages/dockview-core/src/dockview/watermarkService.ts:1-30` (`IWatermarkService.update()` re-evaluates on group add/remove); docs `packages/docs/docs/core/watermark.mdx` (shown "when Dockview has no panels", `noPanelsOverlay`) | The empty state is a function of structural state (no panels), recomputed on events, and rendered by one replaceable component. | **Fits** as the model for "empty state is derived, not stored". Today `PreviewState = 'empty'` is a stored enum (`PreviewCanvas.tsx:6`). The spec should derive empty from the data (no clips, no effects) wherever possible. | systems/states · A01 |
| 9 | Fail-soft restore: placeholder for unknown or failed panels | dockview `dockview/deserializer.ts` (`contentComponent ?? 'unknown'`); `popoutWindow.ts:19-25, 215-225` (reasons `blocked` / `unscriptable` / `closed` and the group returns to the grid) | A failed restore degrades to a visible, named placeholder and a typed failure reason, never an exception that blocks the rest of the layout. | **Fits.** Gives the spec a typed error vocabulary for window/layout restore. The current single root ErrorBoundary would blank the whole app for any panel crash (Problem 6). | systems/states · O17 |
| 10 | Per-region error containment | Blueprint `panel-stack`, `section` (components are independent, no shared boundary) and dockview per-panel rendering (`dockview/dockviewPanel.ts`) | Each panel renders independently, so one panel's failure does not unmount siblings. | **Fits** only if the spec asks for it: React error boundaries per panel region. The mechanism is React's, not either library's. | systems/states |

## Recommendation for the spec

1. **(Problem 1, D7, #1)** Keep `EmptyState` as the one empty primitive: hint only, no icon, no title, no action. The spec forbids the Blueprint `action`, `icon` and `title` slots by name and cites D7.
2. **(D7 contrast guarantee, #1)** Each empty-state surface table row names its surface token and the `--cx-text-3` pairing, and has an AA check (4.5:1). `#666` style literals (Problem 7) are ratchet violations.
3. **(Problem 3, #3)** Write a one-paragraph hint copy rule. Suggested shape: sentence case, one line, states what is missing and (optionally) the one verb that fixes it, with no shortcut glyphs inside hints unless the shortcut is the only path. The spec then lists the canonical hint string per surface. Wording is the owner's to approve.
4. **(Problem 4, #4)** Define a loading primitive with ARIA semantics (`role="progressbar"`, label "loading"), two modes (indeterminate, determinate 0-1) and a minimum size. Preview, export queue and browsers all use it.
5. **(#5)** Define the skeleton as a modifier on real markup for list surfaces (presets, effects, history, library) with a reduced-motion variant. List which surfaces get it. Everything else keeps no placeholder.
6. **(Problem 5, #7)** Decide in the spec whether **error** states may carry one action (e.g. Retry). D7 covers empty only. Present it as an explicit owner question. Do not decide here.
7. **(Problem 6, #6, #7)** Name one error taxonomy with four tiers: root boundary (app crash), region boundary (panel crash), inline banner (persistent, recoverable) and toast (transient). Each tier has a trigger rule, an ARIA role, an intent color and a dismissal rule. The existing Toast conventions (2s dedup, 4/6/8s auto-dismiss, max 5) become the toast row.
8. **(#8, #9)** Define panel/window restore failure states and their visible placeholders (unknown panel, blocked window, display gone). This links to docking-workspaces.md recs 2 and 6.
9. **(#8)** State that "empty" is derived from data and not stored as a separate enum. Migrate `PreviewState` accordingly.
10. **(#10)** Require an error boundary per major region (preview, timeline, device chain, right dock). Today only one exists.

## Library evidence

Blueprint (Apache-2.0) is a full React component library with its own dark theme and 4px spacing unit (`packages/core/src/common/_variables.scss:33`). Its non-ideal-state, spinner and skeleton components are small. Adopting the **library** for these three would pull a design system that conflicts with the token system (D5 mono, D6 12px floor, the `--cx-*` ladder). Blueprint's default font stack is system sans (`_variables.scss:44-56`), which conflicts with D5. **For/against, neutral:** the behaviors (#4, #5, #7) are tiny and cheap to re-implement against `tokens.css`. The ARIA details are the valuable part and are cited above. No library dependency is needed to get them.

## Candidate additions (owner approval required)

1. **Skeleton placeholders** for list surfaces (#5). New visual state that exists nowhere today.
2. **Determinate progress in the shared loading primitive** for long operations other than export (#4).
3. **Per-region error boundaries with a "this panel crashed" placeholder** (#9, #10). Today a panel crash takes down the app.
