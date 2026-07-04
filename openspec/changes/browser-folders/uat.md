# UAT — browser-folders (Pre-Build)

**Companion to** `openspec/changes/browser-folders/packets.md` (packet contracts, hard oracles, risk
tiers — read each packet's own STOP/oracle text before validating its section here) and `plan.md`
(post-reinforcement, §0 rail v12 FINAL contract, §2 category mapping, §3 disclosure migration).
**Runtime protocol inherited verbatim from** `docs/UAT-PLAN-2026-07-02-live-cu.md`: launch from the
canonical checkout (`cd frontend && npm start`), verify the running app's process path matches the
edited tree before any verdict, kill+relaunch (never trust HMR) whenever a packet changes store
shape (P1, P7's persistence, P8), screenshot per verdict, verdicts ✅ ❌ 🐛 ⏸ only.

**Hard rules (apply to every row below):**
- Temporal/stateful effects → verdict only during multi-frame Play, never a single paused frame
  (learning #44).
- Alpha/matte claims → export + PIL pixel assertion, never preview eyeballing (JPEG drops alpha).
  This change carries no alpha-bearing effect work, but any row that touches an exported chain
  containing a matte/preset must still export-and-decode rather than eyeball the preview.
- Destructive/persistence-affecting steps (anything that writes to `~/.creatrix/user-library/`,
  triggers a save/reload cycle, or force-kills the process) run on a **throwaway project only**.
- **Effect-amount-nonzero precheck** before any "render/drag broken" verdict — confirm the
  underlying param/registry entry the row depends on is actually present and non-default before
  concluding a wiring failure.
- **Pre-build convention:** every row that exercises NEW UI (rail, drawer, search bar, favorite
  star, USER LIBRARY) is currently **EXPECTED-ABSENT** — this doc is authored before any packet has
  shipped. Each such row states what today's LIVE UI MAP shows instead, so the row doubles as a
  **build-completion detector**: run it once its packet's PR lands, and a transition from
  EXPECTED-ABSENT to the described Oracle is itself the evidence the packet shipped correctly.
- Every section header below names its packet ID (P1–P9) per packets.md — every row traces to
  exactly one packet.

---

## P1 — Delete dead `UserFolder` CRUD (OD-2) + reconcile disclosure state (backend-only, 3 rows)

No new UI ships in this packet — oracle rows are shell-command/DevTools-console checks, not
click-through journeys.

| # | Check (Setup + Drive) | Oracle | Trap |
|---|---|---|---|
| P1-1 | Setup: none (repo-level check). Drive (Terminal, in the built tree): run `grep -rn "addFolder\|removeFolder\|renameFolder\|addToFolder\|removeFromFolder\|userFolders" frontend/src`. | Command returns zero hits outside test fixtures — paste the (empty, or test-fixture-only) output. Confirms `UserFolder` CRUD (`browser.ts:11-14,25,31-35,106-145`) is deleted. | Grepping only the 5 function names and missing the `UserFolder` type itself, or a renamed/inlined equivalent that keeps the same behavior under a new name — also grep `UserFolder` bare to catch a partial deletion. |
| P1-2 | Drive (Terminal): `cd frontend && npx --no vitest run src/__tests__/stores/browser-migration.test.ts`. | All 5 documented combinations (both-agree, both-conflict, only-key-1, only-key-2, neither-present) pass — paste the test output and confirm exactly 5 cases ran, not fewer. | Rubber-stamping "tests pass" without counting cases — a file that silently dropped 2 of the 5 combinations would still exit green. |
| P1-3 | Setup: before first launch of the new build, seed old-shape localStorage via DevTools console: `localStorage.setItem('entropic-browser', JSON.stringify({collapsedCategories:['color','texture']}))` and `localStorage.setItem('entropic-effect-browser-expanded', JSON.stringify(['color','glitch']))`. Kill+relaunch (store shape changed). Drive: in DevTools console, run `Object.keys(localStorage)` to find the new key, then `JSON.parse(localStorage.getItem(<newKey>))`. | The reconciled key's keys are **full folder paths** (e.g. `"EFFECTS/color"`), not bare category names (`"color"`) — screenshot the console output. Both old keys (`entropic-browser`, `entropic-effect-browser-expanded`) still exist unmodified (read-once-never-delete). | Confirming "a new key exists with correct-looking data" without checking the key SHAPE is full-path, not bare-category — a bug that copies bare names through would silently desync from the hierarchical tree the moment P2/P3 render it. |

---

## P2 — Tree data model (no UI) (backend-only, 2 rows)

| # | Check (Setup + Drive) | Oracle | Trap |
|---|---|---|---|
| P2-1 | Drive (Terminal): `cd frontend && npx --no vitest run src/__tests__/stores/browser-tree.test.ts`. | Fixture covering all 29 `EFFECT_CATEGORY` strings yields **exactly** 26 EFFECTS subfolders + GENERATORS(1) + UTILITIES(5) when `debug` absent, and 27 EFFECTS subfolders when `debug` present — paste the assertion output and confirm it is an exact-count (`===`) check, not `>=`. | Accepting a test that asserts "at least 26" as equivalent to "exactly 26" — a category silently mis-bucketed would still pass a loose assertion. |
| P2-2 | Drive (Terminal): `grep -n "28\|29\|26\|27" frontend/src/renderer/stores/browser-tree.ts`. | Zero matches, OR any matches are inside comments/docstrings referencing this plan (read the matched lines) — no executable branch keyed on a literal category count (OD-8's data-driven requirement). | Treating a grep hit as an automatic fail without reading the line — a doc-comment mentioning "27 subfolders" is fine; an `if (categories.length === 27)` branch is not. Distinguish the two before verdicting. |

---

## P3 — Rail + drawer shell (container icons only, no tool zone yet) — user-facing (6 rows)

Today's LIVE UI MAP shows a left-dock browser with tabs **EFFECTS · PRESETS · INSTRUMENTS** and no
permanent rail. All rows below are EXPECTED-ABSENT until this packet ships.

| # | Check (Setup + Drive) | Oracle | Trap |
|---|---|---|---|
| P3-1 | Setup: launch app fresh (kill+relaunch, P1's migration changed store shape). Drive: look at the left dock for a permanent vertical rail with exactly 7 icons. | EXPECTED-ABSENT until P3 ships. Once shipped: screenshot showing 7 icons — ⌸ INSTRUMENTS, ⌁ EFFECTS, ◍ GENERATORS, ∿ OPERATORS, ⚒ UTILITIES, ▤ PRESETS, ⌂ USER LIBRARY — rendered `currentColor`, 16px/2px-stroke, rail collapsed-hugging by default. | Mistaking the OLD 3-tab bar (EFFECTS/PRESETS/INSTRUMENTS) for the new rail — count icons: the new rail must show 7, not 3 labeled tabs. |
| P3-2 | Drive: click each of the 7 rail icons in turn. | Each click opens a drawer with header row reading literally `glyph · name · count · «` (e.g. "⌁ EFFECTS 26 «"), colored per container-icon convention. No `✕` element exists anywhere in any header (v12 FINAL: "✕ removed as redundant"). Screenshot each header. | Confirming "a drawer opened" without reading the header's exact composition — a header missing the count, or one that kept a stray `✕`, looks fine at a glance but violates the LOCKED contract. |
| P3-3 | Drive: with a drawer open, click the **«** caret. | Drawer closes, rail stays visible and unchanged. Confirm via DevTools Elements panel that the drawer's DOM subtree is actually removed/collapsed — not merely `opacity:0`/`visibility:hidden`. | CSS-hidden-but-still-mounted masquerading as "closed" — the packet's own hard oracle requires "unmounts/collapses, not just visually hidden"; check the Elements tree, not just the screenshot. |
| P3-4 | Drive: open rail icon A's drawer, then click rail icon B while A is still open. | A's drawer disappears (exclusive-accordion) the instant B opens — screenshot both the "A open" and "B clicked, A gone" states side by side. Only one drawer is ever open. | Testing only that B opens and skipping confirmation that A actually closed — a non-exclusive stacking bug would still show "B works" in a single screenshot. |
| P3-5 | Drive: Tab into the rail, use ↑↓ to traverse icons, press Enter on a focused icon. | DevTools Accessibility/Elements inspector shows `role="tree"` on the rail container and `role="treeitem"` on each icon. Arrow keys visibly move a focus ring between icons; Enter opens the focused icon's drawer — screenshot the focus ring mid-traversal and the drawer opening on Enter. | Testing only mouse click-to-open and skipping the keyboard path — the ARIA tree contract is this packet's named hard oracle; a mouse-only pass rubber-stamps an inaccessible component. |
| P3-6 | Drive: with the rail visible, also look for the OLD 3-tab bar (EFFECTS/PRESETS/INSTRUMENTS). | Both coexist — screenshot showing the new rail AND the old tab bar simultaneously present (P3's mount is additive/dev-visible only per its Non-scope; old switchers stay live until P9). | Seeing the new rail and assuming the old bar is already gone — if it's missing at this stage, that's a sequencing violation (P9 hasn't run; flag as a bug, not a pass, since P4-P8's surfaces aren't wired into the tree yet). |

---

## P4 — Wire EFFECTS/GENERATORS/OPERATORS/UTILITIES/INSTRUMENTS bodies + MODE/TOOL zone (4 rows)

| # | Check (Setup + Drive) | Oracle | Trap |
|---|---|---|---|
| P4-1 | Setup: throwaway project with a clip on a track. Drive: open the EFFECTS drawer (P3), expand a subfolder (e.g. "color"), drag an effect row onto the clip's device chain. | Screenshot showing the effect landed in DEVICE CHAIN exactly as the old EFFECTS tab's drag-drop did (drag-payload parity) — precheck the dragged effect's param panel shows a real, non-default control before judging. | Confirming the folder LOOKS right (names/counts match P2) without completing an actual drop — labels can render correctly while the underlying drag handler is silently disconnected; must finish the drop and see it land. |
| P4-2 | Drive: open the OPERATORS and INSTRUMENTS drawers; separately, if the old outer "Instruments" tab (`sidebarTab='instruments'`) is still reachable, open it too. | Terminal: `grep -rn "InstrumentsBrowser" frontend/src/renderer` shows **exactly one** render call-site — paste the grep output. Screenshot confirming RACKS content (sampler/drum-rack/wavetable/granulator) is reachable from the new INSTRUMENTS drawer. | Seeing RACKS content reachable via both an old tab AND the new drawer and calling it "fine, just two paths" — OD-1 explicitly forbids duplicate independently-mounted entry points; two live copies with separate drag state is the exact regression this row exists to catch. |
| P4-3 | Setup: none. Drive: look at the rail's bottom zone for the relocated MODE/TOOL controls (previously EffectBrowser's `[tool]` tab: cursor tool, mask tools). Click a tool icon, then actually draw a marquee (press `q`, drag a rect) to confirm it activates. | Screenshot showing tool icons in the rail's bottom monochrome/radio-select zone, corner-dot present on tools with options, zero-option tools drawerless (click activates, icon fills, rail stays collapsed). After clicking, the marquee tool actually functions (rect commits on the preview). | Verifying the icons render in the new location without confirming they still ACTIVATE the correct cursor mode — a cosmetic-only relocation that dropped the onClick wiring looks identical in a static screenshot; must draw the marquee to prove it. |
| P4-4 | Drive (Terminal): run `browser-op-tab.test.tsx`, `effect-browser-tabs.test.tsx`, `wand-tolerance-control.test.tsx` against the post-P4 tree; separately record the same 3 files' pass/fail counts against pre-P4 `main` if not already recorded. | Paste before/after pass counts — identical shape (same number of passing/failing assertions), not just "both green." | "All green" without a recorded pre-packet baseline — a test file quietly pared down to fewer assertions would still show a green exit code; the anti-dead-flag proof requires the actual counts, not the exit status alone. |

---

## P5 — One search field spanning everything (4 rows)

Today's search box lives inside the EFFECTS tab only (per LIVE UI MAP). All rows EXPECTED-ABSENT
(as a unified field) until P5 ships.

| # | Check (Setup + Drive) | Oracle | Trap |
|---|---|---|---|
| P5-1 | Drive: look above the rail+drawer for one search field spanning the full browser width. | EXPECTED-ABSENT until P5 ships. Once shipped: screenshot showing the field's DOM position is ABOVE the rail/drawer, not nested inside any one drawer's body. | Mistaking the OLD per-tab search box (already present today inside EFFECTS) for the new unified field — check DOM position, not just "an input labeled search exists somewhere." |
| P5-2 | Setup: pre-verify (via `grep -i <term> backend/src/effects -r`, `operator-drag.ts`, `InstrumentsBrowser.tsx`) a query string that matches at least one EFFECTS row, one OPERATORS row, and one INSTRUMENTS row. Drive: type that query into the unified search field. | Screenshot showing all matches in ONE ranked list, grouped under their respective folder headers (EFFECTS / OPERATORS / INSTRUMENTS headers each shown with their matching row nested below), in a single component — not 3 separately-opened drawers. | Confirming matches appear somewhere on screen without checking they're grouped in a SINGLE list — opening 3 independent drawers with highlighted rows looks similar at a glance but is not the unified result list the packet requires. |
| P5-3 | Drive: clear the search field back to empty. | Screenshot showing folders return to their pre-search collapsed/expanded state (per P1's migrated disclosure state) — NOT force-expanded. | Leaving everything expanded after clearing and calling it "harmless" — the packet's test plan explicitly names "empty query (no expansion)" as a checked behavior. |
| P5-4 | Setup: select a track. Drive: type a query, press Enter without clicking any row. | Screenshot of the device chain/track showing the top-ranked result applied — the existing keyboard-drop flow (spec §3) preserved. | Testing only typing+visual-results and skipping the Enter shortcut — a search field that renders correctly but silently drops the Enter handler looks fully functional until this exact keystroke is tried. |

---

## P6 — PRESETS folder (consumes `wave0-prerouted-presets` PK.2) — user-facing (3 rows)

| # | Check (Setup + Drive) | Oracle | Trap |
|---|---|---|---|
| P6-1 | Drive: open the PRESETS drawer (rail icon ▤). | EXPECTED-ABSENT until P6 ships — today PRESETS is a separate top-level tab, not a rail drawer. Once shipped: screenshot showing PRESETS content inside the drawer; explicitly identify WHICH implementation shipped (check `PresetBrowser.tsx` lines 37,39-47,49-65 for presence/absence to distinguish PK.2's full embeddable browser from P6's minimal chrome-strip fallback) and state which in the verdict. | Not distinguishing which of the two implementations landed — the acceptance bar differs (fallback intentionally lacks folders/search-per-PK.2-spec, which is NOT a bug if PK.2 hadn't merged when P6 shipped). |
| P6-2 | Setup: throwaway project. Drive: click-apply a preset from inside the drawer onto the selected clip/track. | `--cx-*` token pixel-check on the resulting chain (screenshot before/after) — confirm it's the SAME `onApplyPreset` callback path as before (`App.tsx:3756-3778`), not a preview-only render. | Seeing SOME visual change and assuming full apply — a broken wiring that only previews without truly committing to the chain looks similar in one screenshot; compare the actual chain state, not just the preview canvas. |
| P6-3 | Drive: drag-apply a preset onto a track's device chain (drag path, not click). | Same resulting-chain pixel-check via the drag path — screenshot. Confirm the drop target accepts BOTH `EFFECT_DRAG_TYPE` and `application/entropic-preset` MIME types (dual-accept, per plan.md §4). | Testing only click-apply (P6-2) and skipping drag — a regression in the drag-specific MIME-accept path is invisible unless drag is exercised separately. |

---

## P7 — Favorites wiring (OD-3) + right-click "Add to Favorites" — user-facing (5 rows)

Today no favorite/star UI exists anywhere in the browser (`toggleFavorite`/`isFavorite` are
zero-caller per OD-3). All rows EXPECTED-ABSENT until P7 ships.

| # | Check (Setup + Drive) | Oracle | Trap |
|---|---|---|---|
| P7-1 | Drive: hover an EFFECTS row (no click). | EXPECTED-ABSENT until P7 ships. Once shipped: screenshot showing a star affordance appearing on hover only. | Testing only click behavior and skipping the hover-reveal requirement — if the star is always visible (not hover-gated), that deviates from the "row-hover star" spec; easy to miss checking only "does clicking work." |
| P7-2 | Drive: click the star on a hovered row. | Star fills; open the Favorites pseudo-folder and confirm the row is listed there. Screenshot both states. | Confirming the star visually fills without opening Favorites to check the item is ACTUALLY in the Set — a purely cosmetic toggle with no store write would look identical for this check alone. |
| P7-3 | Drive: right-click a DIFFERENT row, click "Add to Favorites" in the context menu. | Screenshot of the context menu showing the literal label "Add to Favorites"; Favorites folder now lists 2 items. | Assuming the context-menu path works because the hover-star path (P7-2) worked — this is a separate code path per the packet's own scope; must actually right-click and read the exact label text. |
| P7-4 | Setup: throwaway project not required (favorites is app-global, not project-scoped) but use a scratch session. Drive: toggle one favorite off (3rd operation of add/add/remove per the hard oracle), then kill+relaunch the app fully. | After relaunch, Favorites folder shows exactly 1 item (the one not toggled off) — screenshot post-relaunch. | Testing toggle-off within the same session only, skipping the kill+relaunch — the packet's hard oracle specifically requires reload persistence (localStorage round-trip); an in-memory-only Set passes every in-session check and silently fails to survive relaunch. |
| P7-5 | Drive: open the History/Ledger panel (if present) before and after toggling a favorite. | No new Ledger row appears for the star click/unclick — screenshot Ledger panel before/after showing zero new entries. | Not checking the Ledger at all because "favorites obviously isn't undo-relevant" — OD-4 is an explicit LOCKED decision precisely because a naive implementation might wrap the toggle in the shared `undoable()` helper, silently adding an unwanted row; must actively check, not assume. |

---

## P8 — USER LIBRARY folder shell + save schema design — RISK: HIGH (5 rows)

Today `~/.creatrix/user-library/` does not exist and no USER LIBRARY UI exists anywhere in the app.
All rows EXPECTED-ABSENT until P8 ships. Rows P8-2 through P8-5 are destructive/persistence-affecting
— throwaway project only, per the hard rules.

| # | Check (Setup + Drive) | Oracle | Trap |
|---|---|---|---|
| P8-1 | Drive: open the USER LIBRARY drawer (rail icon ⌂). Terminal: `ls ~/.creatrix/user-library/` beforehand to confirm it doesn't pre-exist from a stale run. | EXPECTED-ABSENT until P8 ships. Once shipped: screenshot of the drawer as the build-completion signal. | Assuming the drawer's existence means the storage layer is wired — an empty placeholder drawer with no real read/write looks identical to a working empty library until a save (P8-2) is attempted. |
| P8-2 | Setup: throwaway project. Drive: drag a device (an existing effect/operator instance) from a chain into the USER LIBRARY drawer. | Terminal: `ls ~/.creatrix/user-library/` shows a new file; `cat` its contents and confirm well-formed, non-truncated JSON/format (not just "a file exists"). | Confirming a file appeared without validating its content — an atomic-write bug leaving a 0-byte or truncated placeholder would still show up in `ls`. |
| P8-3 | Setup: same throwaway project. Drive: quit the app fully (not just the window), relaunch, drag the saved item back OUT of USER LIBRARY onto a track/chain. | The resulting effect instance is byte-identical to the original **modulo a new instance UUID** — diff the two param JSON blobs field-by-field excluding the UUID field; screenshot the applied result next to the original. | Eyeballing "it dropped back in and looks about right" — a subtly lossy save (e.g. a rounded float param) looks visually indistinguishable but fails the packet's explicit byte-identity oracle; do the literal field diff. |
| P8-4 | Setup: throwaway project. Drive: attempt to save into USER LIBRARY with a hostile name containing `../` or an absolute path (e.g. `../../etc/passwd`, `/tmp/evil`) via whatever name-entry surface exists. | Save is rejected or the name is sanitized before reaching disk — Terminal: confirm no file was written outside `~/.creatrix/user-library/` (check the traversal-implied target path is absent), and a toast/error surfaces in the UI. Screenshot the error. | Only testing the happy-path save (P8-2) and never attempting a hostile filename — this is the packet's own named trust-boundary requirement; skipping it is exactly the rubber-stamp risk a HIGH-risk packet exists to prevent. |
| P8-5 | Setup: throwaway project. Drive: start a USER LIBRARY save and force-kill the Electron main process (`kill -9` the PID) as close to mid-write as timing allows; relaunch. | `~/.creatrix/user-library/` contains either the complete pre-kill file or NO file for that save attempt — never a truncated/partial one (`ls -la` + `cat` to confirm valid JSON, no dangling partial content). | Skipping this row as "too hard to time precisely" — a best-effort attempt is still meaningfully more evidence than untested; if the kill consistently lands after the write completes anyway, state that limitation explicitly rather than silently marking it a pass. |

---

## P9 — Delete outer `sidebarTab` + inner `activeTab` (OD-1), the "flip the switch" packet (6 rows)

This is the terminal packet — run only after P1-P8 have all shipped.

| # | Check (Setup + Drive) | Oracle | Trap |
|---|---|---|---|
| P9-1 | Setup: fresh launch after ALL of P1-P8 have merged. Drive: scan the entire sidebar area for any remnant of the old UI. | Screenshot showing NO old 3-button tab bar (EFFECTS/PRESETS/INSTRUMENTS) and NO 5-tab bar (fx/op/composite/tool/instruments) anywhere — only the rail+drawer as the sole sidebar content. | Seeing the new rail present and assuming the old bar is gone without actively scanning for it — since P3-P8 intentionally kept both coexisting, a lazy glance could miss a leftover fragment of the old 5-tab chrome (`EffectBrowser.tsx:487-501`) not fully deleted. |
| P9-2 | Drive: build the OD-1 reachability checklist — for each of the 8 old entry points (`sidebarTab='effects'/'presets'/'instruments'` and `EffectBrowser.activeTab='fx'/'op'/'composite'/'tool'/'instruments'`), confirm it is reachable from exactly ONE place in the new tree. | 8/8 checked off, one screenshot per entry point, zero duplicates and zero gaps. | Spot-checking 2-3 of the 8 and generalizing "looks reachable" to the rest — the packet's own STOP condition treats even ONE missed entry point as a full stop; this checklist must be exhaustive, not sampled. |
| P9-3 | Drive (Terminal): run `grep -rn "sidebarTab\|BrowserTab\|BROWSER_TABS" frontend/src` on pre-P9 `main` first (confirm nonzero), then on the post-P9 build. | Post-P9 grep returns zero hits — paste both the pre (nonzero) and post (zero) outputs. | Running the grep only post-change and calling zero hits a pass — without the pre-change nonzero baseline, a grep that was ALREADY zero (e.g. mistyped pattern) gives a false pass; show both. |
| P9-4 | Drive (Terminal): `grep -rn "InstrumentsBrowser" frontend/src/renderer`. | Exactly one JSX render call-site (`<InstrumentsBrowser`) — paste the output, distinguishing the render usage from any remaining `import` statements. | Counting import statements as "entry points," or vice versa — grep specifically for the JSX render pattern, not any string occurrence of the name. |
| P9-5 | Drive: press Cmd+B, screenshot, press Cmd+B again, screenshot. | First press hides the entire sidebar panel (rail + all drawers) as one unit; second press returns it exactly — screenshot both transitions. | Pressing Cmd+B once and calling it done — a broken 3-way-cycle regression (the superseded reading) only reveals itself on the second or third press; must press it twice minimum. |
| P9-6 | Setup: throwaway project, import a clip onto a track. Drive: open the rail, expand EFFECTS, drag an effect onto the track (full path per plan.md §6's Playwright smoke spec, replicated live). | Screenshot of the resulting device chain showing the dragged effect present. | Treating "rail opens, drawer expands, effect visible in the list" as sufficient without completing the actual drag-and-drop onto a track — this is literally the packet's named E2E smoke spec; must finish the drop. |

---

## Definition of done — end-to-end user story

**Journey: "A user discovers, organizes, and reuses a device through the new browser, and the old
browser is gone."** Run only once every packet (P1-P9) has shipped. This is the single story that
proves the whole change works, not just its parts.

| # | Story beat | Oracle |
|---|---|---|
| DoD-1 | Launch the app fresh (kill+relaunch). The sidebar shows ONLY the permanent 7-icon rail — no trace of the old EFFECTS/PRESETS/INSTRUMENTS tab bar anywhere. | Screenshot: rail with 7 icons, zero old-UI remnants (ties to P9-1). |
| DoD-2 | Type a query in the top-of-browser search field that matches items across EFFECTS, OPERATORS, and INSTRUMENTS. | Single ranked, folder-grouped result list appears (ties to P5-2). |
| DoD-3 | From the search results, drag the EFFECTS match onto a clip in a throwaway project's device chain. | Effect visibly applied in DEVICE CHAIN, param panel shows a real non-default control (ties to P4-1/P4-4). |
| DoD-4 | Hover the newly-added effect's row back in the EFFECTS drawer, click its star to favorite it. | Star fills; Favorites pseudo-folder lists it (ties to P7-2). |
| DoD-5 | Open the PRESETS drawer and click-apply a preset onto a different track. | Chain updates via the real `onApplyPreset` path, screenshot the resulting chain (ties to P6-2). |
| DoD-6 | Drag the favorited effect instance into the USER LIBRARY drawer to save it. | `~/.creatrix/user-library/` gains a new well-formed file (ties to P8-2). |
| DoD-7 | Quit the app fully and relaunch. | Favorite persists (still starred, still in Favorites folder); the saved USER LIBRARY item is still listed in its drawer (ties to P7-4, P8-3's persistence half). |
| DoD-8 | Drag the USER LIBRARY item back out onto a new track. | Resulting effect instance is byte-identical to the original modulo a new instance UUID (ties to P8-3). |
| DoD-9 | Press Cmd+B twice. | Whole sidebar (rail + all drawers) hides then returns as one unit — no 3-way-cycle regression (ties to P9-5). |
| DoD-10 | Attempt to find the old EFFECTS/PRESETS/INSTRUMENTS tab bar or the old 5-tab (`fx/op/composite/tool/instruments`) chrome anywhere in the app one more time, at the end of the session. | Still absent — grep `frontend/src` for `sidebarTab\|BrowserTab\|BROWSER_TABS` returns zero hits (ties to P9-3). |

**Verdict gate:** GO only if all 10 beats pass in the SAME session on the SAME project state (no
resetting between beats) — this is what proves the packets compose into one coherent feature, not
just nine independently-working pieces.
