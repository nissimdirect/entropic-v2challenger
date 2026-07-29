# PRE-BUILD UAT — ui-foundation

**Companion to** `docs/UAT-PLAN-2026-07-02-live-cu.md` (runtime protocol applies verbatim: canonical
DEV checkout launch + live-runtime path check, throwaway projects for anything destructive,
screenshot-per-verdict, ✅❌🐛⏸ only) **and** `docs/UAT-CU-ADDENDUM-2026-07-03.md` (row/header style —
this doc mirrors its `# | Check (Setup + Drive) | Method | Oracle | Trap` shape, adding an explicit
**Method** column per the 2026-07-09 packetize-skill mandate).

**METHOD AMENDMENT (2026-07-09, CU-verify session systemic finding, quoted verbatim from
`docs/UAT-CU-ADDENDUM-2026-07-03.md`):** "any row whose Drive involves drag, draw, marquee, or paint
MUST be verified via the Playwright OS-pointer harness (pattern: commit `9170480`, AA.4 marquee
e2e), NOT synthetic computer-use — CU cannot observe OS-pointer interactions and falsely reports
those features broken." **Applied to this change:** every row below was audited against this rule at
write time. None of `ui-foundation`'s 7 packets involve a drag/draw/marquee/paint gesture — the
closest candidates (window resize to trigger `flex-wrap`, discrete click-through of rail/automation
buttons, a single click on the search-clear chip) are pointer-DOWN-UP clicks or window-chrome resize,
not sustained drag gestures, so CU is the correct tier for all of them. Each row's **Method** column
still states this explicitly rather than defaulting silently, so a future amendment expanding the
harness's scope has something concrete to re-audit against.

**Hard rules inherited (binding on every row below):**
- Screenshot rows compare the live DEV app against the corresponding section of
  `docs/mockups/ui-foundation-frame.html` (confirmed on disk, §1 frame overview / §2 type-scale A/B /
  §3 icon-audit / per-surface sections) as the **before/after reference oracle** — "before" = a
  screenshot of the same surface on `origin/main` pre-packet, "after" = post-packet, both compared
  structurally against the mock's rendering of that surface. A screenshot alone with no mock/pre
  comparison is corroborating evidence only, never sufficient for a ✅ (mirrors wave0's "screenshot is
  human spot-check ONLY" convention).
- Destructive/malformed-input steps run on a **throwaway project**, never a user's real project file
  — not directly applicable to most rows below (pure CSS/positional fixes), noted for completeness.
- Temporal/stateful effects → N/A for this change (no packet touches a stateful effect).
- Every row states its **Method** explicitly: `CMD` (command-oracle, no CU/browser involved), `CU`
  (computer-use screenshot/click, discrete interactions only), `CU+PIL` (screenshot with a
  pixel-level assertion — contrast, computed color, non-overlap), or `OS-POINTER` (Playwright
  harness — reserved for drag/draw/marquee/paint, unused in this doc per the audit above).
- **Flag note (standing, T1):** the `F_CREATRIX_LAYOUT` off → `.cx-preview-row` `display:contents`
  path is a non-regression target for every packet touching `tool-rail.css`/its mount surface, not a
  one-time check — Packet B's row UI-B5 below is the explicit re-verification for this change; any
  future change to `ToolRail.tsx`/`tool-rail.css` should re-run it rather than assuming it still
  holds.

**Runtime target:** `cd frontend && npm start` (DEV Electron on :5173) — NEVER
`~/Desktop/Creatrix.app`. Confirm via DevTools before any verdict (live-runtime rule, Gate 18).

---

## PK.A — Type-scale + Schoger hierarchy tokens

| # | Check (Setup + Drive) | Method | Oracle | Trap |
|---|---|---|---|---|
| UI-A1 (type-histogram command oracle) | Shell, pre-packet: `grep -ohE "font-size:\s*[0-9.]+px" frontend/src/renderer/styles/*.css \| grep -oE '[0-9.]+' \| awk '$1 < 11 { print }'`. Record the pre-packet hit list (36+ sub-floor values expected, per plan.md's own histogram). Repeat post-packet. | CMD | Pre-packet: non-empty list (sub-11px values present, confirms the diagnosed defect). Post-packet: **empty output** — zero `font-size` declarations below 11px anywhere in `frontend/src/renderer/styles/*.css` (design-spec §9a's repo-wide floor, stricter than "8 touched files only"). | Running the grep only post-packet and treating "zero hits" as proof of a fix — without the pre-packet baseline, a grep that was always empty (e.g. wrong glob) would falsely pass. Capture BOTH runs. |
| UI-A2 (hex-ratchet command oracle) | Shell: `frontend/scripts/hex-ratchet.sh` (or documented equivalent) before and after the packet's diff. | CMD | Post-packet count ≤ `frontend/.hex-ceiling` (currently 9); no new raw hex introduced by any of the new tokens (every new color is a semantic token reference, per design-spec §9b). | Accepting "ratchet passed" without diffing the actual count — a ratchet that stayed exactly AT ceiling with a NEW hex added and an OLD one coincidentally removed elsewhere would numerically pass while still violating "this change should have zero hex-ratchet impact by construction." |
| UI-A3 (8-panel legibility) | Launch DEV app. Open each of the 8 touched panels in turn (tool rail, automation strip, master-track lane, effect-browser tabs, preview empty-state, device-chain header/empty, timeline, transport bar) at default zoom. Screenshot each. | CU+PIL | Each screenshot's text reads as legible without squinting and is visually distinguishable by tier (heading vs. label vs. body vs. data) without reading the DOM — compare against `docs/mockups/ui-foundation-frame.html`'s Candidate-A (default) rendering of the same 8 surfaces as the reference. | Judging legibility from a single default-zoom screenshot of ONE panel and generalizing to all 8 — each of the 8 surfaces uses a different tier combination (design-spec §1 table), a pass on one does not imply a pass on another. |
| UI-A4 (label-tier weight distinctness) | Screenshot a control-label element (e.g. `.effect-browser__tabs` tab label, weight 600) next to a body-tier element (e.g. hint text, weight 450) in the same screenshot frame. | CU+PIL | The label element visibly reads bolder than the body element at the same zoom — a real weight-600-vs-450 separation, not two visually-identical grays (this is the specific gap `tokens.css:101-102`'s pre-packet comments admitted: weight was "approximated," never a real token). | Accepting "labels look fine" without a same-frame side-by-side against a body-tier element — weight differences are easy to miss without a direct comparison anchor. |
| UI-A5 (weight-token existence) | Shell: `grep -n "cx-weight-data\|cx-weight-label\|cx-weight-body\|cx-weight-heading" frontend/src/renderer/styles/tokens.css`. | CMD | All 4 tokens present with the design-spec §1 values (450/600/450/650 respectively). | Confirming only `--cx-weight-label`/`--cx-weight-heading` exist (the two `plan.md`'s literal text names) and missing that `--cx-weight-data`/`--cx-weight-body` are ALSO required per design-spec §1's implementation note — grep for all 4 explicitly, not just the two plan.md calls out by name. |
| UI-A6 (Candidate-A value fidelity) | Shell: `grep -A2 "cx-text-heading\|cx-text-label\|cx-text-body\|cx-text-data" frontend/src/renderer/styles/tokens.css`. | CMD | Values match design-spec §1's Candidate A table exactly: data=11px/450, label=12px/600, body=12.5px/450, heading=14px/650. Candidate B values (`--cx-text-body-alt`/`--cx-text-heading-alt`, 13px/15px) are **absent from `tokens.css`** — they are mock-only per design-spec §1, landing them in `tokens.css` would be a scope violation even though OD-1 is still VISUAL-PENDING. | Landing Candidate B tokens "just in case" the user picks it at mock review — design-spec §1 is explicit that Candidate B never lands in `tokens.css` until/unless picked; their presence pre-decision is itself a finding. |
| UI-A7 (vitest snapshot suite) | Shell: `cd frontend && npx --no vitest run` (targeted typography-snapshot tests + full suite). | CMD | Full suite green; the 8 per-surface typography snapshots assert no raw `font-size`/`font-weight` px literal remains in the touched selectors, only `var(--cx-*)`. | Running only the targeted new tests and skipping the full suite — a token rename could silently break an unrelated snapshot elsewhere that references the same selector. |

---

## PK.B — Tool rail refinement

| # | Check (Setup + Drive) | Method | Oracle | Trap |
|---|---|---|---|---|
| UI-B1 (icon size command oracle) | Shell: `cd frontend && npx --no vitest run src/__tests__/tool-rail.test.tsx`. | CMD | Test asserts `<ToolIcon size={16}>` (down from 18) for all 14 rail slots; suite green. | Trusting a visual "icons look smaller" impression instead of the prop-level assertion — a CSS `transform:scale()` hack could visually shrink the icon without actually changing the `size` prop, defeating the intent (icon SVG viewBox would stay 18-unit crisp vs. 16). |
| UI-B2 (badge non-collision, all 14 tools) | Launch DEV app, open the tool rail. Screenshot each of the 14 tools at 2x zoom (hotkey badges are small — normal zoom risks missing a subtle overlap). | CU+PIL | For every tool with a hotkey, the badge (top-right, 11px) does not visually overlap the icon glyph's rendered pixels — compare each against `docs/mockups/ui-foundation-frame.html` §3's per-icon rendering at 16px/32px as the reference geometry. | Screenshotting only 2-3 "representative" tools and extrapolating to all 14 — `plan.md`'s own framing notes the collision risk varies per-icon depending on where each glyph's visual mass concentrates; check all 14, not a sample. |
| UI-B3 (group-label legibility) | Screenshot the 4 group labels (TRNS/EDIT/MASK/MISC) at the rail's actual rendered size (not zoomed). | CU+PIL | All 4 labels legible at a glance at 11px (`--cx-text-data` floor) without squinting or zooming in. | Judging legibility only from a zoomed-in screenshot — the real UX question is whether it reads at ACTUAL rendered size in the live app, not under magnification. |
| UI-B4 (click-through, all 14 tools) | Launch DEV app. Hover then click each of the 14 tools in sequence. Screenshot the active/`--active` state for a sample of 3-4. | CU | Hotkey letters are readable and do not visually fuse into the icon glyph at any of the 14; each click activates the corresponding tool (no click-target regression from the badge-repositioning JSX change); active-state styling renders correctly for the sampled tools. | Confirming clicks work but never zooming in to check the hotkey-vs-glyph fusion question specifically — a click-through pass does not by itself verify legibility, they are two separate claims in this row. |
| UI-B5 (flag note — legacy-layout OFF path retirement check) | Launch DEV app with `F_CREATRIX_LAYOUT` off (env/build flag per project convention — confirm the exact toggle mechanism at execution time). Screenshot the preview row area. Separately, shell: `cd frontend && npx --no vitest run` targeting the flag-off assertion in `tool-rail.test.tsx`. | CU + CMD | Screenshot: the tool rail is absent from layout, `.cx-preview-row` shows no rail-shaped gap or visual artifact (collapsed cleanly via `display:contents`). Command: vitest confirms `.cx-preview-row` computed `display === 'contents'` when the flag is off. Both must agree — a screenshot-only pass could miss a computed-style regression that happens to still look visually collapsed by coincidence. | Skipping this row because "the flag-off path isn't being changed" — Packet B DOES touch `tool-rail.css`'s internals, and the flag-off path shares the same file; the T1 standing item explicitly calls this out as a non-regression target to actively re-verify per touching change, not a one-time historical check. |

---

## PK.C — Automation control-strip grouping

| # | Check (Setup + Drive) | Method | Oracle | Trap |
|---|---|---|---|---|
| UI-C1 (13-buttons/3-clusters command oracle) | Shell: `cd frontend && npx --no vitest run` targeting `AutomationToolbar.test.tsx`. | CMD | All 13 buttons present + clickable; buttons render inside exactly 3 grouping containers (`.auto-toolbar__modes` / `__record` / `__curve-ops`); `.auto-toolbar` computed `flex-wrap === 'wrap'`. | Accepting "13 buttons visible" from a screenshot as proof of correct cluster MEMBERSHIP — a button could visually sit near the right divider while still being a DOM child of the wrong cluster; the test's container-membership assertion is the actual proof, not the screenshot. |
| UI-C2 (wrap at narrow width) | Launch DEV app, open the automation toolbar at normal window width — screenshot. Resize the window narrower (drag the OS window-chrome edge, NOT a canvas drag — window resize is not a drag/draw/marquee/paint gesture on the app's own canvas, CU remains the correct tier) — screenshot again. | CU+PIL | Normal width: 3 visually distinct clusters with dividers, single row. Narrow width: row wraps (does not clip/overflow past the viewport edge) — compare both against `docs/mockups/ui-foundation-frame.html`'s automation-strip section if it models both widths. | Resizing to only ONE narrow width and declaring wrap "confirmed" — test at least 2 distinct narrow widths to confirm the wrap behavior is genuinely responsive, not a coincidental fit at one specific width. |
| UI-C3 (hint/armed text no overflow) | At the narrow width from UI-C2, arm an automation lane (or otherwise trigger the "Armed: <name>" text state) and screenshot. | CU+PIL | "Armed: <name>" text renders fully on its own line (post-wrap `flex-basis:100%`), never clipped or run off-viewport — corroborated by the component test's constrained-container `scrollWidth` assertion (Packet C's hard oracle). | Testing the wrap behavior (UI-C2) and the hint/armed-text overflow behavior (this row) as if they were the same claim — they're two different CSS rules (`flex-wrap` vs. `margin-left:0`/`flex-basis:100%`); both need independent verification. |
| UI-C4 (cluster click-through) | Launch DEV app, click through all 13 automation-strip controls in sequence at normal width. | CU | Each of the 13 controls fires its expected action (no click regression from the JSX wrapper restructure); the 3 clusters read as visually distinct groupings at a glance (dividers visible, spacing reads intentional). | Confirming clicks work in isolation (each button still does its thing) without also confirming the VISUAL grouping claim — a correctly-functioning but visually-unclustered strip would still pass a pure click-through test; check both. |

---

## PK.D — Empty-state designs (preview / device-chain / timeline)

**Note:** rows below test the **OD-4 OVERRIDE** (design-spec §4: minimal hint text ONLY, no CTA) —
NOT `plan.md`'s original heading+body+CTA recommendation, which the T1 verdict superseded. Any row
here that would have tested a CTA click is written as a **negative check** (confirm the button is
absent) instead.

| # | Check (Setup + Drive) | Method | Oracle | Trap |
|---|---|---|---|---|
| UI-D1 (preview empty state — minimal hint only) | Launch DEV app, open a brand-new project (no clips imported). Screenshot the preview panel's empty state. | CU+PIL | A single hint line reads "Drag a clip here, or ⌘I to import." at `--cx-text-body`/`--cx-text-3` color, max-width ~280px, centered. **No button, no icon, no clickable affordance is present** — confirm by attempting to Tab-focus into the empty-state area and finding no focusable element there. | Treating "the old bare string got styled nicer" as sufficient without explicitly checking for absence of a NEW button — `plan.md`'s original contract WOULD have added one; this row exists specifically to catch an executor who builds the plan.md version instead of the design-spec override. |
| UI-D2 (device-chain empty state — minimal hint only) | Same throwaway project, no devices in chain. Screenshot the device-chain panel's empty state. | CU+PIL | Existing header unchanged; hint reads "No effects yet — browse the EFFECTS tab to add one." at `--cx-text-body`. **No "Browse Effects" button present** (same negative check as UI-D1). | Same trap as UI-D1 — the ORIGINAL OD-4 default explicitly proposed a "Browse Effects" CTA here; confirm it was NOT built. |
| UI-D3 (stray border-top scoping) | Screenshot `.device-chain` with an EMPTY chain (border-top should be absent) and again with ≥1 device added (border-top should be present, violet `--cx-selection`/`--cx-mod`). | CU+PIL | Border-top visibly absent when empty, visibly present (violet hairline) when populated — two distinct screenshots required, not one. Corroborated by the vitest computed-style test at both `chain.length` states. | Screenshotting only the empty state and declaring the fix verified — the fix is CONDITIONAL (`chain.length > 0`), so both branches must be shown or the "unconditional" bug could have simply been inverted (always-off) rather than correctly scoped. |
| UI-D4 (Timeline regression — unchanged) | Screenshot Timeline's empty state (no tracks) — the existing hint + `Cmd+I` badge + `+ Add Track`/`+ MIDI Track` buttons. | CU | All existing elements present, unchanged in structure — ONLY typography (font-size/color, from Packet A) may differ from pre-packet; buttons remain clickable and functional. | Assuming "Timeline wasn't in scope so it's automatically fine" without actually screenshotting it — Packet A's typography pass DOES touch Timeline, so a token-swap regression (e.g. wrong tier applied) is possible even though the DOM is untouched. |

---

## PK.E — Fix clipped master-bus/automation panel label (symptom 1)

| # | Check (Setup + Drive) | Method | Oracle | Trap |
|---|---|---|---|---|
| UI-E1 (no mid-word clip, 3 widths) | Launch DEV app, resize the timeline/master-track lane to 3 widths: narrowest practical, medium, full. Screenshot the master-bus label ("Master bus — effects & automation only, no clips") at each. | CU+PIL | At all 3 widths, the label never drops a character mid-word — at narrow widths it either ellipsizes cleanly (`text-overflow:ellipsis`) or wraps cleanly, never truncates mid-glyph. | Testing only the full-width case (where the pre-packet bug was likely invisible anyway) and skipping the narrow width where the clipping was originally diagnosed — the narrowest width IS the reproduction case, must be included. |
| UI-E2 (TRACK_HEIGHT drift command oracle) | Shell: `grep -n "TRACK_HEIGHT" frontend/src/renderer/components/timeline/MasterTrack.tsx` and `grep -n "master-track-lane {" -A3 frontend/src/renderer/styles/timeline.css`. | CMD | The two values are equal (both 76), OR the constant has been renamed away from `TRACK_HEIGHT` with an inline comment explaining the intentional divergence from the CSS height — one of these two outcomes, never a same-named constant silently disagreeing with the CSS. | Accepting "the label doesn't clip anymore" (UI-E1) as implicit proof the drift was also fixed — they are two independent bugs found in the same file/packet; the label fix could ship without ever touching `TRACK_HEIGHT`, leaving the automation-overlay/lane-background disagreement live. Check both explicitly. |

---

## PK.F — Fix browser column chips (symptom 4)

| # | Check (Setup + Drive) | Method | Oracle | Trap |
|---|---|---|---|---|
| UI-F1 (search-clear chip — styled + functional) | Launch DEV app, open the Effects browser, type a search query. Screenshot the clear (`×`) button before typing (should be absent/hidden per existing behavior) and after (present, styled). Click it. | CU | The `×` button renders as a designed control (background/border/radius per `.effect-search__clear`'s new rule — NOT raw OS button chrome) and clears the search input on click, returning the card list to its unfiltered state. | Confirming only the visual styling (button "looks nicer") without actually clicking it to confirm the clear FUNCTION still works — styling-only PRs can accidentally break an existing click handler via a JSX/CSS interaction (e.g. a `pointer-events` rule shadowing the button). |
| UI-F2 (tabs/actions separation) | Screenshot the effect-browser's category-tab strip and the "+ Add Text Track" action row together in one frame, before and after the packet. | CU+PIL | Post-packet: visibly separated blocks (≥8px gap, corroborated by the vitest computed-style ≥8px assertion) — compare against `docs/mockups/ui-foundation-frame.html`'s browser-column section if modeled there. Pre-packet (for contrast): the 2px-gap collision visible in the original diagnosis. | Screenshotting only the post-packet state — without the pre-packet "before" comparison, a reviewer can't distinguish "always looked fine" from "actually fixed a real collision." |

---

## PK.G — Fix preview overlay-chip anchoring + transport row alignment (symptoms 6, 8)

| # | Check (Setup + Drive) | Method | Oracle | Trap |
|---|---|---|---|---|
| UI-G1 (overlay-bar anchoring) | Launch DEV app (DEV build so the FPS readout renders — it's DEV-only per code-ground). Screenshot the preview panel's top edge showing both the FPS chip (left) and pop-out button (right). | CU+PIL | Both chips read as anchored to the panel's top edge, structurally parented to one `.preview-canvas__overlay-bar` (corroborated by the vitest DOM-parentage + no-independent-`position:absolute` assertion) — NOT as two independently-floating elements (the pre-packet "unanchored" quality). Visual position is unchanged from pre-packet (same top-left/top-right slots) — this is a structural fix, not a re-positioning. | Judging this row purely by "the chips are still in the top-left/top-right corners" (true both before AND after the fix, since visual position is deliberately unchanged) — the actual claim under test is STRUCTURAL (one parent vs. two independent absolutes), which requires the command-oracle DOM check, not eyeballing position alone. |
| UI-G2 (transport control height alignment) | Screenshot the top transport bar showing Play/Stop/Loop/S/Q buttons, the BPM number input, and the quantize-division dropdown together in one frame. | CU+PIL | All controls sit at the same visual height with no stagger — corroborated by the vitest computed-`height` equality assertion across the 3 element types (button/input/select). | Screenshotting at a zoom level too low to notice a 1-2px stagger — zoom in on the transport bar specifically; the pre-packet bug was a native-chrome height difference that can be subtle at normal viewing distance. |

---

## Definition of done — end-to-end journey

**Story:** a user opens Creatrix fresh, and every diagnosed symptom from the CDO audit reads as
fixed when walking the frame top-to-bottom in one continuous pass — not seven isolated diffs that
happen to each pass their own packet's oracle.

| Step | Action | Oracle | Trap |
|---|---|---|---|
| 1 | Launch DEV Electron fresh (confirm live-runtime path, Gate 18). New Project, no clips imported yet. | No startup error toast. | Skipping the live-runtime check — confirm DEV build (`:5173`), not `~/Desktop/Creatrix.app`. |
| 2 | Look at the tool rail (PK.B), automation strip (PK.C — arm a lane to see it non-empty), master-track lane label (PK.E), and transport bar (PK.G) together in one full-window screenshot. | Text is legible and tier-differentiated throughout (PK.A's tokens visibly applied across all 4 surfaces at once, not just individually) — compare structurally against `docs/mockups/ui-foundation-frame.html`'s full-frame section. | Verifying each surface in isolation (per-packet UAT rows above) and never taking ONE combined screenshot — the proposal's actual complaint ("i legit cant use anything like this") is about the frame reading coherently AS A WHOLE, which per-surface rows alone can't prove. |
| 3 | Open the Effects browser, type then clear a search query (PK.F); confirm the tab strip and "+ Add Text Track" row read as separated. | Clear button functional + styled; tabs/actions visually separated. | Rushing through the search-clear click without confirming the list actually re-populates. |
| 4 | Resize the app window narrower; observe the automation strip wrap (PK.C) and confirm no other surface (rail, transport, browser) breaks layout at the same narrow width. | Automation strip wraps cleanly; no OTHER surface introduces a NEW overflow/clip as a side effect of the narrower window. | Testing PK.C's wrap in isolation at its own dedicated narrow-width screenshot (UI-C2) but never checking whether the SAME resize breaks something else nearby — a cross-surface regression at a shared breakpoint is exactly what a combined pass catches and an isolated one misses. |
| 5 | Import a clip, then remove it again (or open a truly empty new project) to view the preview and device-chain empty states (PK.D) side by side with the FPS/pop-out overlay bar (PK.G) still visible on the preview panel. | Empty-state hints are minimal (no CTA, per OD-4 override) and the overlay bar remains correctly anchored regardless of preview content state (empty vs. populated). | Assuming the overlay bar and the empty-state hint text can't visually collide since they're "different features" — both render inside/over `.preview-canvas`; confirm the FPS/pop-out chips don't overlap the centered hint text. |
| 6 | Run the full command-oracle sweep: `frontend/scripts/type-histogram-guard.sh`, `hex-ratchet.sh`, `cd frontend && npx --no vitest run`, `cd backend && python -m pytest -x -n auto --tb=short`. | All green. Histogram guard: zero sub-11px hits repo-wide. Hex-ratchet: ≤ ceiling. | Running only the frontend suite and skipping backend pytest — this change claims "no `backend/` file is touched by any packet" (proposal.md non-goals); the backend run is the proof of that claim, not an assumption to skip. |

**GO/NO-GO:** GO only if every packet's UAT rows above (UI-A1..A7, UI-B1..B5, UI-C1..C4, UI-D1..D4,
UI-E1..E2, UI-F1..F2, UI-G1..G2 — 26 rows total) pass on their stated Method/Oracle AND the 6-step
combined journey above passes. A green per-packet sweep with the combined journey's step 4 or 5
(cross-surface interaction) failing is a NO-GO — per the house rule, interactions between surfaces
are where a frame-level change actually breaks, not any single surface in isolation.
