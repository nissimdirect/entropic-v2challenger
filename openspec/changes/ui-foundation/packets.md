# Packets — ui-foundation

> ## RATIFIED AMENDMENTS (2026-07-30 — read before dispatching ANY packet)
> Source: `docs/frontend/RATIFIED-FOUNDATIONS.md` (user F-1 ratification 2026-07-29/30).
> 1. **PK.A type values = SCALE B+1**: heading 16/650 · body 14/450 · label 13/600 ·
>    data 12/450; **floor 12px** (not 11). Mapping for every stale number in this file and
>    design-spec.md: data 11→12 · label 12→13 · body 12.5/13→14 · heading 14/15→16.
>    The `css_font_below_floor` ratchet ceiling MUST be clicked down in PK.A's PR.
> 2. **PK.C re-scoped by D8**: curve ops (Flatten/Ramp/Shape/Simplify/Clear) LEAVE the
>    strip entirely → lane-contextual actions (see amended PK.C below). OD-6's 3-cluster
>    design is superseded — the strip keeps Mode + Record only.
> 3. **REAL-DIMENSIONS re-check**: `ui-foundation-frame.html` was authored at 1600px vs
>    the app's 1280×800 default — PK.B and PK.C executors must re-verify width-sensitive
>    judgments (rail collisions, strip wrapping) at 1280×800 before implementation.
> 4. Every packet is additionally bound by `docs/frontend/FRONTEND-SDLC.md` (cadence L1:
>    screenshot every visual edit into the ledger) and the PR template's TRACEABILITY section.

**Emitted:** 2026-07-10 by `/packetize`. **Plan:** `plan.md` (same dir — packets POINT to its
file:line-anchored normative sections; do not re-derive). **Spec:** `design-spec.md` (quantified
values contract; **supersedes `plan.md`'s prose wherever the two conflict** — flagged per-packet
below, the sharpest case is Packet D's CTA language). **Decisions:** proposal.md T1 Verdicts —
OD-2/3(dims)/4/5/6/7 LOCKED, OD-1 (type-scale values) and OD-3 (icon choices) VISUAL-PENDING and
**out of scope for every packet below** (they resolve at the separate mock-review touchpoint against
`docs/mockups/ui-foundation-frame.html`, which already exists — confirmed on disk with its §2 A/B
toggle and §3 icon-audit sections built; no packet here re-opens that file). **Route:** `/eng` Phase
3 (7 packets, small-loop cadence — not marathon-scale).

**Branching rule (every packet):** cut from `origin/main`; PR-only; squash; no `.github/workflows/**`
edits.
**Merge gate (every packet, STRICT FULL-TIER per proposal.md Definition of done + this repo's
standing campaign merge-autonomy rules):** full backend pytest + full frontend vitest green
(`cd frontend && npx --no vitest run` — MUST use `--no`) → `hex-ratchet.sh` ≤ `.hex-ceiling` →
`Skill(review)` via Skill tool (ship-gate hook) → verify-for-real (launch the DEV app, screenshot the
touched surface, live-runtime path check per Gate 18) → the packet's own **UAT unit** (below,
mandatory, executed BEFORE the ledger ✅) → full CI green (smoke + e2e where any packet touches a
path with existing e2e coverage — spot-check via `grep -rl` for the touched class names in
`frontend/tests/e2e/` before assuming none exists).

**UAT unit rule (inline into every packet, verbatim from the 2026-07-09 packetize-skill update):**
"every packet carries a MANDATORY UAT unit — the `uat.md` row ids it closes + per-row method
(OS-pointer harness for drag/draw — CU cannot observe those; CU or screenshot+PIL for visual;
command oracle for backend-only) — executed immediately after implementation, evidence in the same
ledger update, NO ledger ✅ without it." This change's packets are CSS/typography/positional fixes,
not drag interactions — no packet below requires the OS-pointer harness itself, but `uat.md`'s header
states the amendment verbatim since a future packet in this repo could need it, and Packet B/C/D/F/G
rows explicitly confirm "not a drag interaction" so the method choice (CU/screenshot) isn't a silent
skip of the harness requirement.

**Landmine resolution (plan.md §Landmine, superseded by design-spec §4):** plan.md flagged Packet
A and D both touching `.preview-canvas__placeholder`/`.device-chain__empty`. Design-spec §4's OD-4
OVERRIDE (minimal hint, NO CTA — supersedes plan.md's heading+body+CTA split) simplifies this: D no
longer adds new DOM nodes to those two selectors, only edits copy/color on the existing single text
node plus the `chain.length > 0` border-top scoping — so the "3-node split" landmine plan.md warned
about does not materialize. The line-level overlap survives in a smaller form (both packets touch
`font-size`/`color` on the same 2 selectors), so the **sequencing resolution is (a) from plan.md's
menu: A lands first (token swap on all 8 surfaces including these 2), D rebases and only edits copy
text + the border-top rule on top of A's tokenized CSS** — stated here so neither packet's executor
re-derives it differently.

---

### PK.A — Type-scale + Schoger hierarchy tokens — **TOKEN VALUES = SCALE B+1 (heading 16/650 · body 14/450 · label 13/600 · data 12/450, floor 12px), RATIFIED 2026-07-29 — supersedes the 2026-07-10 Scale B lock**
- **Scope:** land `plan.md` Packet A's normative contract (`plan.md:64-84`) using design-spec's
  exact values (design-spec §1 Candidate A table, §3 spacing scale, §7 `--cx-control-h`): add
  `--cx-text-heading` (14px/650), `--cx-weight-label` (600), `--cx-weight-heading` (650),
  `--cx-weight-data` (450), `--cx-weight-body` (450) — all four weight tokens per design-spec §1's
  "implementation note" (plan.md's literal text only named two; spec adds the other two so the
  histogram guard in §9a has something to check every tier against), `--cx-control-h` (22px), and
  the `--cx-space-*` scale (§3: 2/4/6/8/12/16/24px) to `tokens.css`. Apply the tiers to the 8
  diagnosed surfaces' EXISTING typography rules only, per `plan.md:72-82` item 3's selector list.
  Do NOT split `.preview-canvas__placeholder`/`.device-chain__empty` into new DOM nodes (that's
  D's — landmine resolution above); this packet only tokenizes their existing `font-size`/`color`.
- **Non-scope:** `--cx-font-ui`/`--cx-font-mono`/`TODO(plex-swap)` (out of scope, LOCKED DESIGN
  PRINCIPLE); Candidate B (`--cx-text-body-alt`/`--cx-text-heading-alt`) — mock-only, never lands in
  `tokens.css` per design-spec §1 (OD-1 is still VISUAL-PENDING); any DOM/layout restructuring in the
  8 surfaces (B/C/D/E/F/G's job).
- **Files:** `frontend/src/renderer/styles/tokens.css` (new tokens); typography-only line edits in
  `tool-rail.css` (group-label, hotkey badge font-size only — dims/position are Packet B's job),
  `automation.css` (button labels, hint/armed text), `timeline.css`
  (`.master-track-lane__label` font-size only — truncation CSS is Packet E's job),
  `global.css` (`.effect-browser__tabs`, `.preview-canvas__placeholder`,
  `.app__transport-*` label sizes only — height is Packet G's job), `device-chain.css`
  (`.device-chain__header`, `.device-chain__empty` font-size/color only — copy/border-top is
  Packet D's job).
- **Depends:** none (dispatchable now). **Blocks:** PK.B, PK.C, PK.D (all consume its tokens).
- **Risk:** MED.
- **Hard oracle:** `grep -ohE "font-size:\s*[0-9.]+px" frontend/src/renderer/styles/*.css | sort -n |
  uniq -c` shows zero values <11px in the touched files (repo-wide per design-spec §9a, stricter than
  the per-file check) · `frontend/scripts/type-histogram-guard.sh` (new, design-spec §9a) passes ·
  `hex-ratchet.sh` count ≤ current `.hex-ceiling` (no new raw hex — every color routes through a
  token) · vitest snapshot per touched component's typography classlist asserts no raw
  `font-size`/`font-weight` px literal remains, only `var(--cx-*)`.
- **Test plan:** unit — new `frontend/scripts/type-histogram-guard.sh` + a vitest wrapper test
  that runs it as a permanent CI guard (does not exist today, confirmed by grep); component — 8
  typography-classlist snapshots (one per touched surface), asserting token-only diffs.
- **UAT unit (MANDATORY):** closes `uat.md` rows **UI-A1 through UI-A7**. Methods: UI-A1
  (type-histogram command oracle, no CU) · UI-A2 (hex-ratchet command oracle, no CU) · UI-A3
  (screenshot+PIL — 8-panel legibility, no drag involved) · UI-A4 (screenshot — label-tier weight
  distinctness, no drag) · UI-A5 (command oracle — grep for the 4 new weight tokens) · UI-A6
  (command oracle — diff `tokens.css` values against design-spec §1 Candidate A table) · UI-A7
  (command oracle — `npx --no vitest run` snapshot suite). Runs immediately after implementation,
  before ledger ✅; evidence (command output + screenshots) lands in the same ledger update.
- **STOP semantics:** if a touched surface's existing rule sets `font-size` via a shorthand
  (`font: ...`) rather than a discrete property, STOP and report — the histogram grep won't catch it
  and a silent sub-floor size could survive; do not guess the shorthand's parse. If any of the 8
  surfaces has drifted from `plan.md`'s cited line numbers (parallel session risk), STOP and re-verify
  against the live tree before editing (Gate 10 continuation-check applies).
- **Executor brief:** Sonnet-tier; template `~/.claude/templates/subagent-brief.md`; inline verbatim:
  the UAT unit rule (above), Gate 6 (reproduce/verify — run the histogram grep BEFORE and AFTER, not
  just after), Rule Admission Law's "deterministically checkable → code" spirit (the histogram guard
  IS the enforcement, not a one-off diagnostic). Last line: return PR # + histogram/hex-ratchet output
  + the 7 UAT row verdicts.

---

### PK.B — Tool rail refinement
- **Scope:** `plan.md:99-134` normative contract using design-spec §2's locked dims table: icon
  `size={16}` (was 18); hotkey badge → `--cx-text-data` (11px), reposition `top:2px;right:2px`;
  group-label → `--cx-text-data`; intra-group gap `3px→4px`; inter-group margin `4px→8px`. New
  regression suite `tool-rail.test.tsx` (no prior file exists, confirmed by grep both sessions).
  Escalation fallback (§2, only if badge still collides after implementation): widen rail
  `44px→48px`, button `32×30→36×32` — do not shrink the badge below the 11px floor to resolve a
  collision.
- **Non-scope:** icon glyph CHOICES (which of the 14 `tool-icons.tsx` glyphs render for which tool)
  — VISUAL-PENDING, resolved at the separate mock-review touchpoint, not this packet; the
  `F_CREATRIX_LAYOUT` mount condition itself (only its internal sizing is touched).
- **Files:** `frontend/src/renderer/components/layout/ToolRail.tsx` (icon size prop, badge JSX
  position); `frontend/src/renderer/styles/tool-rail.css` (`.tool-rail__tool`,
  `.tool-rail__hotkey`, `.tool-rail__group-label`, `.tool-rail__group` gap/padding); **new**
  `frontend/src/__tests__/tool-rail.test.tsx`.
- **Depends:** PK.A (consumes `--cx-text-data`/spacing tokens). **Blocks:** none.
- **Risk:** LOW.
- **Hard oracle:** vitest asserts icon `size===16`; hotkey badge resolves `--cx-text-data` and its
  computed position does not overlap the icon's bounding box for all 14 rail slots (JSDOM
  `getBoundingClientRect`, or a documented screenshot diff if JSDOM geometry is unavailable);
  group-label resolves `--cx-text-data`; `F_CREATRIX_LAYOUT` off → `.cx-preview-row` still resolves
  `display:contents` (flag-off path unaffected — regression guard).
- **Test plan:** component — new `tool-rail.test.tsx` (icon size, badge size/position per-tool,
  group-label size, flag-off regression, `data-testid="tool-rail-item-<id>"` selector stability
  per plan.md's Test Plan section).
- **UAT unit (MANDATORY):** closes `uat.md` rows **UI-B1 through UI-B5**. Methods: UI-B1 (command
  oracle — vitest icon-size assertion) · UI-B2 (screenshot+PIL — all 14 tools' badge non-collision,
  no drag) · UI-B3 (screenshot — group-label legibility, no drag) · UI-B4 (CU click-through — hover
  + click all 14 tools is discrete clicking, not a drag/draw gesture, so CU is the correct tier, NOT
  the OS-pointer harness) · UI-B5 **(flag note — legacy-layout OFF path retirement check)**: CU
  screenshot with `F_CREATRIX_LAYOUT` off confirming `.cx-preview-row` still collapses via
  `display:contents` and the rail is absent from layout, PLUS a command-oracle vitest assertion of
  the same computed style — this row exists specifically because this change's LOCKED MOCK RULE and
  T1 UAT-as-micro-unit standing item both call out the flag-off path as a non-regression target that
  must be actively re-checked, not assumed stable, every time `tool-rail.css` changes.
- **STOP semantics:** if the badge still visually collides with any of the 14 icons after applying
  the locked (non-escalated) values, apply the §2 escalation fallback rather than shrinking the badge
  — do not silently pick a third value not in the spec. If a rail-referencing E2E spec is found at
  execution time (re-grep `frontend/tests/e2e/` — none found this session but a Lane-2 packet may have
  added one since), STOP and report before changing `data-testid` values.
- **Executor brief:** Sonnet-tier; template `~/.claude/templates/subagent-brief.md`; inline verbatim:
  the UAT unit rule, OD-3's "resist the instinct to grow the icon further" framing (`plan.md:119-123`
  — the 18px glyph was already above spec, the fix is corner-collision relief not icon growth), Gate
  14 (Wiring Check — verify all 14 tools still receive click events after the JSX badge-position
  change). Last line: PR # + per-tool collision-check table + the 5 UAT row verdicts.

---

### PK.B2 — Grouped rail, Convention 1 — **NEW PACKET (2026-07-30): carries the 2026-07-15 "RESIZE PK.B" that never propagated into this file (caught by the PK.B executor's STOP)**
- **Scope — the LOCKED grouping verdict (proposal.md OD-3 GROUPING, user 2026-07-15) with the
  interaction contract now made explicit:**
  - **Group model — AMENDED 2026-07-30 (executor STOP #2, REAL-INVENTORY ruling): SIX
    groups** — SELECT V (select) · TRIM B (razor/slip/slide/ripple-delete) · MASK-SHAPE Q
    (marquee rect/ellipse) · MASK-FREE W (lasso freehand/polygon) · KEY E (wand/key-picker) ·
    **MARK/LOOP Shift+M** (marker/loop-in/loop-out — bare `m` stays `add_marker` per
    F-0516-8; Shift+M matches the existing tool_marker convention and its registration is
    absorbed into the group-cycle dispatch). TEXT and NAV are DESCOPED: their glyphs exist
    but no text/hand/zoom CursorTool does — rendering them violated REAL-INVENTORY-ONLY
    (the 8-group count came from the invalid 1600px mock's imagined 14+3 toolset). NO
    placeholder slots; those groups arrive with the future packets that ship the actual
    tools. Each slot renders its group's ACTIVE subtool glyph; groups with >1 subtool add
    a corner caret (bottom-right, ~4px triangle, `--cx-text-3`).
  - **Activation:** click slot → activate its current subtool. Group hotkey tap → if the
    group isn't active, activate its current subtool; if already active, CYCLE to the next
    subtool (locked verdict — this subsumes the old Q/W key collisions).
  - **Flyout (Photoshop convention):** press-and-hold ≥300ms OR right-click on a slot opens
    the flyout beside the rail — subtools listed with glyph + name + hotkey; release-over-item
    or click selects; Esc / click-outside / blur dismisses. Only one flyout open at a time.
  - **Keyboard/ARIA:** slot = `button` with `aria-haspopup="menu"`; flyout `role="menu"`,
    items `role="menuitemradio"` with `aria-checked` on the active subtool; ArrowUp/Down
    navigate, Enter selects, Esc closes, focus returns to the slot.
  - **Test-ids (selector contract):** `tool-rail-group-<key>`, `tool-rail-flyout`,
    `tool-rail-flyout-item-<toolId>`.
  - Existing tokens only; states per COMPONENT-SPEC enum; wand glyph unchanged (user pick open).
- **Non-scope:** glyph redraws (PK.H owns the manifest sweep); rail dims (PK.B); any new tools.
- **Depends:** PK.B (dims land first — serialize on tool-rail files). **Blocks:** PK.H.
- **Risk:** MED (new interaction machinery + hotkey dispatch rewiring).
- **Hard oracle (amended):** vitest — 6 groups render with correct slots/carets; NO text/nav
  placeholder slots exist (asserted absence = the REAL-INVENTORY negative check); group-hotkey cycle
  order deterministic and wraps; flyout opens on hold AND right-click, dismisses on Esc and
  outside-click; menuitemradio aria-checked tracks active subtool; every one of the 14 tools
  reachable (no tool orphaned by grouping); full suite green; ratchets PASS; build passes.
- **STOP semantics:** if hold-to-open conflicts with an existing mousedown drag behavior on
  the rail, or a group hotkey collides with a non-rail binding in default-shortcuts, STOP
  and report — do not rewire shortcuts silently.
- **UAT unit (MANDATORY):** orchestrator visual pass at 1280×800 — flyout legibility, caret
  visibility at 16px, one screenshot per group open; plus CU click-through of all 8 groups.

### PK.H1 — Tool-glyph wire set + G2 wand + locked picks + per-tool cursors — **NEW PACKET (2026-07-30; PK.H was referenced but never authored — same gap class as PK.B2)**
- **Scope:** implement the LOCKED glyph verdicts on the 14 rail tools (proposal.md T1):
  (i) **wire restyle set-wide** (OD-3 ROUND-2: 1.9 stroke, round caps, opened fills) across
  `tool-icons.tsx`; (ii) **WAND = G2** (WAND RESOLUTION, proposal.md — rod+star+dotted-region
  wake, exact path data given there; supersedes the old Block-wand exception); (iii) locked
  picks: Razor R2c (angled classic blade, wire) · Ripple Delete D5 (X between timeline
  brackets) · Slip (fixed-frame+inner-arrows) · Marker flag · Loop In/Out brackets · Lucide
  swaps where locked (Select=cursor-arrow, Text=type [glyph stays for future], Slide, Mask
  Rect/Ellipse dashed, Lasso, Hand/Zoom [glyphs stay unwired], Key Picker=pipette) — Lucide
  path data VENDORED into tool-icons.tsx with an ISC license comment, NOT an npm dependency;
  (iv) **per-tool cursors** (v4.1 addendum): razor/ripple-delete/loop/key-picker get custom
  svg cursors from the locked set (`cursor: url(svg) hotspot, fallback`), slip/slide →
  ew-resize, marker → crosshair, mask tools → crosshair; wire into the tool-switch path.
- **Non-scope:** app-wide non-tool icons (PK.H2); rail structure/flyout (done, PK.B2);
  any glyph not covered by a LOCKED verdict (keep current art, list in PR body).
- **Files:** `frontend/src/renderer/assets/tool-icons.tsx` (the redraw); the cursor-apply
  site (grep where CursorTool → canvas/preview className or style cursor); `tool-rail.css`
  only if a stroke-width var is cleaner than per-path attrs; new/extended icon tests.
- **Depends:** PK.B2 (merged). **Blocks:** PK.H2 (shared icon-module conventions).
- **Risk:** MED (visual identity change; snapshot churn expected and legitimate).
- **Hard oracle:** vitest — every one of the 14 tools has a glyph (no empty path); G2 wand
  path present (grep its distinguishing path fragment); vendored-Lucide license comment
  present; cursor mapping test (each tool id → expected cursor value); full suite green;
  ratchets PASS; build passes. Existing tool-icon snapshots UPDATED with per-glyph
  justification lines in the PR body (this packet's whole point is changing them).
- **STOP semantics:** if a locked pick's spec (path data / description) is ambiguous or
  missing for a specific tool, STOP and name the tool — never freehand a glyph.
- **UAT unit (MANDATORY):** orchestrator visual pass at 1280×800 — full rail zoom at 16px
  (legibility of the wire set), wand G2 read at rail size, cursor check per tool over the
  preview (CU hover + screenshot).

### PK.H2 — App-wide icon unification sweep (manifest v4.1) — **NEW PACKET (2026-07-30)**
- **Scope:** the CONVENTION-GROUNDED MANIFEST v4 + v4.1 addendum (proposal.md): (i) ALL
  emoji glyphs → vector (👁 🔒 ❄ ⚗ 📌 etc. — root cause of "icons sometimes don't show");
  (ii) the 7 meaning-clash unifications (one glyph per meaning: close=✕ everywhere via one
  shared component, disclosure=▸/▾ pair, delete=trash-2 vs dismiss=x vs detach=unlink,
  add=plus, mute stays TEXT M, page ◀▶ pair); (iii) load-bearing rulings: M/S/Q + R-L-T-D
  automation modes STAY TEXT · Snap S → magnet · record-arm → filled dot · pop-out →
  external-link · freeze → filled/outline snowflake pair · aspect-lock = link/unlink ·
  up-one-level = arrow-up vs back-reference = corner-up-left · mask-count badge → custom
  glyph+count; (iv) **R-collision rename** (automation Read-mode R vs record-arm R —
  record-arm becomes the filled dot, resolving it); (v) vendored assign-kit: new
  `frontend/src/renderer/assets/icon-kit.tsx` (Lucide ISC + Tabler MIT path data + license
  lines + the 13 customs on the 24×24/stroke-2 grid); (vi) GLYPH GUIDELINES v1 (11 rules)
  appended to `docs/roadmap/DESIGN-SPEC.md` §10 area.
- **Non-scope:** the 39 KEEP-TEXT rows (they stay text BY RULING — do not iconize);
  KEEP-CURRENT rows; tool glyphs (PK.H1); routing chips (layertap's tap-chip system owns
  routing state per v4.1 — only the four static routing glyphs apply).
- **Files:** new `assets/icon-kit.tsx`; the component files holding the ~65 auto-assigned +
  clash rows (census on artifact afd223f3 — enumerate by grepping the emoji/unicode chars);
  DESIGN-SPEC.md §10 append. LARGE file count is expected; keep each swap mechanical.
- **Depends:** PK.H1. **Blocks:** ui-foundation exit baselines.
- **Risk:** MED-HIGH (breadth). Ship as ONE PR but commit per unification family so revert
  is targeted.
- **Hard oracle:** vitest — zero emoji glyphs remain in renderer TSX (grep-based test over
  the census emoji set, committed as a permanent guard); one-close-glyph test (every dialog
  close button renders the shared close icon component); icon-kit license comments present;
  full suite green; ratchets PASS (tsx_inline_style ceiling may CLICK DOWN, never up);
  build passes.
- **STOP semantics:** any row where the manifest verdict conflicts with live code reality
  (component gone, meaning changed) → skip the row, list it in the PR body's "manifest
  drift" table — STOP only if >10 rows drift (contract rot signal).
- **UAT unit (MANDATORY):** orchestrator visual pass — dialogs/panels/track-headers
  screenshot sweep; freeze/record/mute state-pair checks live.

### PK.C — Automation strip: Mode+Record clusters; curve ops move to the lane — **RE-SCOPED by RATIFIED D8 (2026-07-30)**
- **User verdict (D8):** *"curve ops i think are not actual buttons i think its more like in the
  lane."* Flatten/Ramp/Shape/Simplify/Clear LEAVE the strip — they act on a specific lane, so
  they live AT the lane (also kills the global-button "which lane?" ambiguity).
- **Scope (amended):** (i) strip keeps `.auto-toolbar__modes` (R/L/T/D, unchanged) + new
  `.auto-toolbar__record` cluster (Overdub, +Lane, +Trigger, +Mod) with the horizontal divider
  convention; `flex-wrap: wrap` on `.auto-toolbar`; `__hint`/`__armed` reflow onto
  `flex-basis:100%` when wrapped; `--cx-text-label` (13/600) labels, `--cx-text-body` (14/450)
  hint text. (ii) Curve ops become **lane-contextual actions**: PRE-IMPLEMENTATION step — render
  a small mock at REAL 1280×800 comparing the two candidate affordances (lane right-click
  context-menu section vs on-lane hover mini-toolbar), pick with the user by eye (one message);
  then implement the pick, targeting the CLICKED lane explicitly (no armed-lane inference).
- **Non-scope:** any new curve-op algorithms — functional parity only, relocated entry points;
  R/L/T/D modes unchanged.
- **Files:** `frontend/src/renderer/components/automation/AutomationToolbar.tsx` (wrap 9 buttons
  into 2 new `<div>`s); `frontend/src/renderer/styles/automation.css` (`.auto-toolbar` flex-wrap,
  new divider rules, `.auto-toolbar__armed`/`.auto-toolbar__hint` reflow).
- **Depends:** PK.A (consumes tokens). **Blocks:** none.
- **Risk:** LOW.
- **Hard oracle (amended for D8, then re-amended by the STOP adjudication ruling below):** vitest
  — the strip renders exactly 8 buttons in exactly 2 grouping containers (Mode/Record) and
  contains NONE of Flatten/Ramp/Shape/Simplify/Clear. "5-op lane parity" reads as: Simplify/Clear/
  Shape fire with the clicked lane's explicit ids (3 parity tests, unchanged handlers relocated
  wholesale — `simplifyLane`/`clearLane`/`insertShapeIntoLane` already take an explicit laneId).
  Flatten/Ramp assert BOTH branches instead of a plain "fires with laneId" parity test, because
  their store actions (`flattenSelectedPoints`/`rampSelectedPoints`) have no laneId parameter and
  only read the global point-selection state — ruling: standard menu grammar (Photoshop/Premiere
  disable inapplicable items), pure relocation, zero new algorithms: (1) disabled when the clicked
  lane has no qualifying same-lane selection (Flatten needs ≥1 selected point, Ramp needs ≥2, and
  `selectedPoints.trackId`/`laneId` must match the clicked lane — a selection on a DIFFERENT lane
  also disables), carrying the disabled BEM state + `aria-disabled`; (2) enabled and fires the
  EXISTING handler unchanged when a qualifying same-lane selection exists (4 tests total for the
  two ops' two branches). `.auto-toolbar` computed style has `flex-wrap: wrap`; at a
  constrained-width container, hint/armed text does not overflow `scrollWidth`.
- **Test plan:** component — strip membership + curve-ops-absent assertion, per-op lane-context
  parity (5 ops × handler fires with correct laneId), flex-wrap computed style, narrow-container
  overflow assertion (new or extended `AutomationToolbar.test.tsx` + lane-context test).
- **UAT unit (MANDATORY):** closes `uat.md` rows **UI-C1 through UI-C4**. Methods: UI-C1 (command
  oracle — vitest 13-buttons/3-clusters assertion) · UI-C2 (screenshot — window resize to trigger
  wrap; resizing a window is not a drag/draw gesture on the canvas, CU is correct tier) · UI-C3
  (screenshot+PIL — hint/armed text never cut off at narrow width, corroborated by the component
  test's `scrollWidth` assertion) · UI-C4 (CU click-through — confirm the 3 clusters read as visually
  distinct, click each of the 13 controls to confirm no click regression from the new wrapper divs).
- **STOP semantics:** if wrapping the 9 buttons in new `<div>`s breaks an existing `data-testid` or
  ref used elsewhere (e.g. a keyboard-shortcut handler keyed to DOM position), STOP and report before
  reworking the handler — do not silently change the shortcut wiring as a side effect of the JSX
  restructure.
- **Executor brief:** Sonnet-tier; template `~/.claude/templates/subagent-brief.md`; inline verbatim:
  the UAT unit rule, Gate 14 (Wiring Check — all 13 buttons' `onClick` still fire after the wrapper
  restructure, entry AND exit paths for wrap/unwrap). Last line: PR # + cluster-membership table +
  the 4 UAT row verdicts.

---

### PK.D — Empty-state designs (preview / device-chain / timeline)
- **Scope:** design-spec §4's **OD-4 OVERRIDE governs, not `plan.md`'s Packet D contract** — this
  packet ships **minimal hint text ONLY, properly styled, NO CTA buttons** (quieter than the drafter
  default `plan.md:195-206` recommended; that heading+body+CTA language is superseded). Preview:
  single body-tier line "Drag a clip here, or ⌘I to import." (`--cx-text-body`, `--cx-text-3` color,
  max-width 280px, centered — design-spec §4 anatomy table). Device chain: keep the existing header,
  upgrade `.device-chain__empty`'s hint to "No effects yet — browse the EFFECTS tab to add one."
  (`--cx-text-body`) — text references the tab by name since there is no click target. Fix the
  stray unconditional `border-top: 1px solid var(--cx-selection)` on `.device-chain` (`device-chain.css:5`)
  to fire only when `chain.length > 0`. Timeline: typography-token pass only (Packet A already
  applies it) — zero DOM change, its existing `+ Add Track`/`+ MIDI Track` buttons are untouched and
  are NOT part of this override (design-spec §4's "Scope of the override" paragraph — Timeline
  predates this change and was never proposed for a CTA *addition*).
- **Non-scope:** any NEW button/CTA on Preview or Device-chain (explicitly removed by the T1
  override — do not implement `plan.md`'s original 3-node heading+body+button split); Timeline DOM
  restructuring of any kind.
- **Files:** `frontend/src/renderer/components/preview/PreviewCanvas.tsx` + `global.css`
  (`.preview-canvas__placeholder` — copy + color only, single text node, unsplit per design-spec §4);
  `frontend/src/renderer/components/device-chain/DeviceChain.tsx` + `device-chain.css`
  (`.device-chain__empty` hint copy; `.device-chain` border-top scoping); `Timeline.tsx` untouched by
  this packet (Packet A's typography pass covers it).
- **Depends:** PK.A (sequencing per Landmine resolution above — A tokenizes these 2 selectors' base
  typography first, D rebases its copy/border-top edits on top). **Blocks:** none.
- **Risk:** LOW.
- **Hard oracle:** vitest — preview empty-state renders exactly one hint text node (no button, no
  heading element) matching the design-spec §4 copy string; device-chain empty-state renders header
  (unchanged) + one hint text node (no button) matching its copy string; `.device-chain`'s
  `border-top` computed style is `none`/absent when `chain.length === 0` and present when
  `chain.length > 0` (both branches asserted — regression guard against the "unconditional" bug
  recurring); Timeline's empty-state DOM node count/structure is byte-identical to pre-packet
  (regression guard — this packet must NOT touch it).
- **Test plan:** component — preview/device-chain empty-state snapshot (no button assertion is the
  explicit negative check — a `queryByRole('button')` returning null in the empty-state container is
  the falsifiable proof the override was honored, not just "text present"); border-top computed-style
  test at both chain lengths; Timeline DOM-diff regression test.
- **UAT unit (MANDATORY):** closes `uat.md` rows **UI-D1 through UI-D4**. Methods: UI-D1 (screenshot
  — preview empty state shows the hint line only, explicitly confirms NO button is present, no
  drag involved) · UI-D2 (screenshot — device-chain empty state hint text + explicit no-button
  confirmation) · UI-D3 (screenshot, both states — border-top absent when empty / present when
  populated, command-oracle-corroborated by the vitest computed-style test) · UI-D4 (screenshot —
  Timeline's existing `+ Add Track`/`+ MIDI Track` buttons still present and unchanged, regression
  check only). **Note:** `plan.md`'s own UAT-journey prose for Packet D ("click each CTA and confirm
  it does the stated thing") is STALE against the OD-4 override — `uat.md`'s D rows are written to
  the override, not to that stale plan.md language; do not resurrect the CTA-click check.
- **STOP semantics:** if `PreviewCanvas.tsx`'s existing DOM already has a heading/body/CTA split
  present from a parallel session (contradicting the code-ground this packet was scoped against),
  STOP and re-verify against the live tree before deciding whether to strip it back to the
  OD-4-mandated single line or report the conflict.
- **Executor brief:** Sonnet-tier; template `~/.claude/templates/subagent-brief.md`; inline verbatim:
  the UAT unit rule, the OD-4 OVERRIDE text (design-spec §4, "supersedes plan.md Packet D's normative
  contract" — quote it so the executor doesn't build the richer CTA version plan.md describes), Gate
  14 (Wiring Check — confirm no dangling `onClick` reference survives the button removal from
  plan.md's originally-intended design). Last line: PR # + the negative `queryByRole('button')` proof
  + the 4 UAT row verdicts.

---

### PK.E — Fix clipped master-bus/automation panel label (symptom 1)
- **Scope:** `plan.md:209-245` / design-spec §8a. Add `white-space:nowrap; overflow:hidden;
  text-overflow:ellipsis; max-width:100%;` to `.master-track-lane__label` (default to the ellipsis
  strategy per design-spec unless a sibling wrap-pattern is found at execution time — grep one and
  match it, don't invent a new truncation convention) + `font-size: var(--cx-text-body)` (was
  hardcoded 10px, below floor). Resolve `TRACK_HEIGHT = 60` (`MasterTrack.tsx:200`) vs. CSS `76px`
  (`timeline.css:1355`) drift: bump the constant to `76` to match, OR (if `60` is intentionally a
  different internal automation-overlay geometry) rename it away from `TRACK_HEIGHT` and comment the
  divergence — check at execution time whether other code reads `TRACK_HEIGHT` expecting 60 before
  picking.
- **Non-scope:** any other `MasterTrack.tsx`/`timeline.css` surface not cited above.
- **Files:** `frontend/src/renderer/components/timeline/MasterTrack.tsx` (`TRACK_HEIGHT` const);
  `frontend/src/renderer/styles/timeline.css` (`.master-track-lane`, `.master-track-lane__label`).
- **Depends:** none (parallel to everything — disjoint files, no token dependency per plan.md's DAG;
  can still consume `--cx-text-body` from PK.A if merged first, but does not block on it — hardcode
  `12.5px` with a `// TODO: route through --cx-text-body once PK.A lands` comment if E lands first).
  **Blocks:** none.
- **Risk:** LOW.
- **Hard oracle:** vitest — `.master-track-lane__label` computed style has `white-space:nowrap` +
  `overflow:hidden` + `text-overflow:ellipsis` (or the documented wrap alternative); the full label
  string never has a mid-word character silently dropped at 3 tested lane widths (narrow/medium/full);
  `MasterTrackLane`'s local `TRACK_HEIGHT` constant equals `timeline.css`'s `.master-track-lane`
  `height` value (drift regression guard).
- **Test plan:** component — 3-width truncation test, `TRACK_HEIGHT`-vs-CSS drift assertion (new,
  no prior test file existed for this comparison — confirmed by grep).
- **UAT unit (MANDATORY):** closes `uat.md` rows **UI-E1, UI-E2**. Methods: UI-E1 (screenshot+PIL —
  master-bus label at 3 lane widths, no mid-word clip visible, no drag involved) · UI-E2 (command
  oracle — grep both `TRACK_HEIGHT` and the CSS `height` value, assert equal, or assert the rename +
  comment exists if intentionally divergent).
- **STOP semantics:** if other code reads `TRACK_HEIGHT` expecting `60` (grep all call sites before
  changing it), STOP and pick the rename-with-comment path instead of silently bumping the constant
  and breaking that caller.
- **Executor brief:** Sonnet-tier; template `~/.claude/templates/subagent-brief.md`; inline verbatim:
  the UAT unit rule, Gate 13 (Trace Path — grep every `TRACK_HEIGHT` call site across the project
  before deciding bump-vs-rename; this is exactly the "X doesn't work" UI-bug chain-tracing case the
  gate targets). Last line: PR # + 3-width screenshot set + the 2 UAT row verdicts.

---

### PK.F — Fix browser column chips (symptom 4)
- **Scope:** `plan.md:249-280` / design-spec §8b. `.effect-search__clear` new rule block
  (`background: var(--cx-surface-3); border: 1px solid var(--cx-line-1); border-radius:
  var(--cx-radius-control); color: var(--cx-text-2); width/height: 20px` — matches
  `.preview-canvas__popout-btn`'s existing icon-chip convention, reused not invented) + `:hover`
  state. `.effect-search` gets `display:flex; align-items:center; gap: var(--cx-space-6)`. Add
  `padding-top: var(--cx-space-8)` to `.effect-browser__actions` so the "+ Add Text Track" row
  reads separated from the tab strip above it.
- **Non-scope:** any JSX restructuring of `EffectBrowser.tsx` (not needed per plan.md's own file
  note); the 5-tab category strip's own internals (only its bottom spacing relative to `__actions`).
- **Files:** `frontend/src/renderer/components/effects/EffectBrowser.tsx` (no JSX change expected —
  verify at execution time); `frontend/src/renderer/styles/global.css` (new
  `.effect-search__clear` rule block; `.effect-browser__tabs`/`.effect-browser__actions` spacing).
- **Depends:** none (parallel to everything). **Blocks:** none.
- **Risk:** LOW.
- **Hard oracle:** vitest — `.effect-search__clear` resolves a non-empty computed
  `background`/`border`/`padding` (currently zero CSS rules match it, raw OS chrome) and sits inside
  `.effect-search`'s flex flow (not floating); `.effect-browser__tabs` and `.effect-browser__actions`
  have ≥8px computed vertical separation (currently 2px margin, no top padding on actions).
- **Test plan:** component — computed-style assertions above; a click test confirming the clear
  button still clears the search input's value (functional regression guard — the button existed
  pre-packet with default OS behavior, must not lose its click handler while gaining CSS).
- **UAT unit (MANDATORY):** closes `uat.md` rows **UI-F1, UI-F2**. Methods: UI-F1 (CU click — type a
  search query, click the clear button, confirm it looks designed AND clears on click; a single
  click is not a drag/draw gesture, CU is correct tier) · UI-F2 (screenshot+PIL — tabs/actions read
  as visually separate blocks, corroborated by the component test's ≥8px computed-gap assertion).
- **STOP semantics:** if `.effect-search__clear`'s click handler is found to be missing entirely
  (not just unstyled) at execution time, STOP — that is a functional bug outside this packet's
  styling-only scope, file it separately rather than silently adding a handler.
- **Executor brief:** Sonnet-tier; template `~/.claude/templates/subagent-brief.md`; inline verbatim:
  the UAT unit rule, "reuse don't invent" note (match `.preview-canvas__popout-btn`'s existing
  dimensions). Last line: PR # + before/after screenshot pair + the 2 UAT row verdicts.

---

### PK.G — Fix preview overlay-chip anchoring + transport row alignment (symptoms 6, 8)
- **Scope:** `plan.md:284-329` / design-spec §5 + §7. Wrap `.preview-canvas__fps` +
  `.preview-canvas__popout-btn` in new `.preview-canvas__overlay-bar` (`position:absolute; top:0;
  left:0; right:0; display:flex; justify-content:space-between; align-items:center;
  padding: var(--cx-space-4); pointer-events:none;` with children re-enabling `pointer-events:auto`
  individually). Add `height: var(--cx-control-h); box-sizing:border-box;` to
  `.app__transport-btn`, `.app__transport-bpm input`, `.app__transport-select` uniformly (per
  design-spec §7 — overrides native-chrome height differences rather than papering over them).
- **Non-scope:** `PreviewControls.tsx`'s lasso-mode icon buttons (already in-flow, confirmed NOT
  part of this fix per plan.md's code-ground); any transport-bar functional change (styling only).
- **Files:** `frontend/src/renderer/components/preview/PreviewCanvas.tsx` (wrap the two chips);
  `frontend/src/renderer/styles/global.css` (`.preview-canvas__overlay-bar` new rule;
  `.app__transport-btn`/`-bpm input`/`-select` height); `App.tsx` — no structural change, height is
  CSS-only per plan.md's own file note.
- **Depends:** none for the overlay-bar half (§5, parallel to everything); soft-depends on PK.A for
  `--cx-control-h` (§7 sequencing escape hatch: if G lands before A, hardcode `22px` with a
  `// TODO: route through --cx-control-h once PK.A lands` comment, then a 1-line follow-up swaps it —
  do not block G on A). **Blocks:** none.
- **Risk:** LOW.
- **Hard oracle:** vitest — FPS chip + pop-out button both render as children of
  `.preview-canvas__overlay-bar`, no independent `position:absolute` on either (regression guard
  against reverting to unanchored chips); `.app__transport-btn`, `.app__transport-bpm input`,
  `.app__transport-select` all resolve the SAME computed `height`.
- **Test plan:** component — DOM-parentage assertion for the overlay bar's 2 children; computed
  `height` equality assertion across the 3 transport controls.
- **UAT unit (MANDATORY):** closes `uat.md` rows **UI-G1, UI-G2**. Methods: UI-G1 (screenshot — FPS
  readout + pop-out button read as anchored to the preview panel's top edge, not floating
  independently, no drag involved; corroborated by the vitest DOM-parentage assertion) · UI-G2
  (screenshot — BPM input, S/Q buttons, quantize-division dropdown all sit at the same height with no
  visual stagger, corroborated by the vitest computed-height assertion).
- **STOP semantics:** if `pointer-events:none` on the overlay bar is found to also block the canvas's
  own existing click/drag handlers underneath (not just the two chips), STOP — that is a functional
  regression beyond this packet's "anchoring, not behavior" scope; do not silently narrow the canvas's
  interaction area to work around it.
- **Executor brief:** Sonnet-tier; template `~/.claude/templates/subagent-brief.md`; inline verbatim:
  the UAT unit rule, the `pointer-events` re-enable pattern (children must individually restore
  `auto` or both chips become unclickable — an easy silent regression). Last line: PR # + overlay-bar
  DOM snapshot + transport-height table + the 2 UAT row verdicts.

---

## Single-flight map

| File | Packets | Order |
|---|---|---|
| `tokens.css` | PK.A only | — (sole owner) |
| `tool-rail.css` | PK.A (typography only), PK.B (dims/position) | A → B |
| `automation.css` | PK.A (typography only), PK.C (grouping/wrap) | A → C |
| `timeline.css` | PK.A (typography only), PK.E (truncation/height) | A → E (soft — E can hardcode and TODO if it lands first) |
| `global.css` | PK.A (typography only), PK.D (preview placeholder copy), PK.F (search-clear/tabs), PK.G (overlay-bar/transport height) | A → {D, G}; F is a disjoint selector region, no ordering constraint beyond A's general typography pass |
| `device-chain.css` | PK.A (typography only), PK.D (hint copy + border-top) | A → D |
| `PreviewCanvas.tsx` | PK.D (copy only), PK.G (overlay-bar wrap) | disjoint concerns (copy vs. DOM wrap of different elements) — parallel-safe, no shared line ranges expected; re-verify at execution time |

**Rebase rule (cross-lane):** any Lane-2 feature packet (`browser-folders`, `fx-afterimage`,
`fx-backspin`, `system-monitor-v1`, `multiwindow-stage-a`, `layertap-matte-v1`,
`history-panel-delta`, `util-transform`) touching `tool-rail.css`, `automation.css`, `global.css`,
`device-chain.css`, or `timeline.css` rebases onto this change's merged diff — this change is the
priority frame fix (`plan.md:28-32`, `proposal.md` build-order slot).

## Coverage check (plan + spec → packets)

Every `proposal.md`/`plan.md`/`design-spec.md` item maps to a packet: OD-1 type-scale tokens →
PK.A (Candidate A only; A/B visual pick stays out of packet scope, resolved at mock review) · OD-2
UPPERCASE convention → no code change needed (already uppercase in code, PK.A only fixes
size/weight/color per proposal.md, confirmed no packet needs a case change) · OD-3 rail dims → PK.B
(icon choices explicitly out of scope, VISUAL-PENDING) · OD-4 empty states → PK.D (per the OVERRIDE,
not the original CTA recommendation) · OD-5 overlay bar → PK.G · OD-6 automation clusters → PK.C ·
OD-7 control height → PK.G · symptom 1 (clipped label) → PK.E · symptom 4 (search chip) → PK.F ·
symptom 6 (unanchored chips) → PK.G (= OD-5) · symptom 8 (transport misalignment) → PK.G (= OD-7) ·
design-spec §3 spacing scale + §9a CI histogram guard + §9b hex-ratchet → PK.A (infra land site) ·
design-spec §9c mid-roadmap design review checkpoint (OD-2/5/6/7 revisit) → explicitly NOT a packet
(future checkpoint, out of scope for this build). Nothing descoped.

## Ledger

> **Ledger back-filled 2026-07-31 (tiger 12: this file showed ⬜ while the queue showed COMPLETE —
> two artifacts, one truth).** PR numbers below match `openspec/PLANNING-QUEUE.md` row 10's
> `✅ COMPLETE (2026-07-30)` entry — this table was never updated as each packet merged; the queue
> was. Backfilled from the queue's per-packet PR list, not re-derived.

| Packet | Status | PR | Oracle evidence |
|--------|--------|----|-----------------|
| PK.A | ✅ | #457 | Merged per PLANNING-QUEUE row 10 (Scale B+1 type tokens) |
| PK.B | ✅ | #460 | Merged per PLANNING-QUEUE row 10 (rail dims) |
| PK.B2 | ✅ | #464 | Merged per PLANNING-QUEUE row 10 (grouped rail, 6 groups, D4a) |
| PK.C | ✅ | #474 | Merged per PLANNING-QUEUE row 10 (strip Mode+Record; curve ops → lane menu, D8/A) |
| PK.D | ✅ | #461 | Merged per PLANNING-QUEUE row 10 (minimal-hint empty states) |
| PK.E | ✅ | #458 | Merged per PLANNING-QUEUE row 10 (4 frame bugs, shared PR w/ F, G) |
| PK.F | ✅ | #458 | Merged per PLANNING-QUEUE row 10 (4 frame bugs, shared PR w/ E, G) |
| PK.G | ✅ | #458 | Merged per PLANNING-QUEUE row 10 (4 frame bugs, shared PR w/ E, F) |
| PK.H1 | ✅ | #466 | Merged per PLANNING-QUEUE row 10 (wire glyphs + G2 wand + cursors) |
| PK.H2 | ✅ | #475 | Merged per PLANNING-QUEUE row 10 (emoji→vector 16→0, one-close-glyph, R-collision resolved) |
