# Change — ui-foundation

**Status:** T1 decisions PENDING — 7 Open Decisions below, each with a recommended default. This
proposal is written so a user "go" on the defaults (or targeted overrides) is sufficient to move
straight to `/packetize`; no further design spelunking is required.
**PRIORITY:** user-blocking usability fix ("i legit cant use anything like this," live-screenshot
CDO audit, 2026-07-09). **Build order: immediately after `wave0-prerouted-presets` Packet 00 (CI
green), before every feature packet in Lane 2** (`openspec/PLANNING-QUEUE.md` Addendum, item 10 —
this change supersedes that queue row's prior build-order slot).
**Source of truth (read-order):** the CDO 8-symptom diagnosis (verbatim in the task that produced
this proposal, reproduced per-packet below with file:line) → `docs/plans/2026-07-02-b3-layout-redesign-prd.md`
(SIGNED-OFF, banked — this change builds ON its layout, does not reopen it) → `docs/roadmap/DESIGN-SPEC.md`
(canonical token source, §2 color / §3 typography / §8 density) → `docs/UAT-RESULTS-2026-07-03.md`
Stage E (adjacent sidebar-strain findings, non-regression targets) → `openspec/PLANNING-QUEUE.md`
Lane 3 item 10 (LOCKED DESIGN PRINCIPLE + LOCKED MOCK RULE, both binding on this change, see below).

## Why

A live-screenshot CDO audit found the Creatrix frame — the shell every one of the 9 approved
feature changes (Lane 1 + Lane 2 in `PLANNING-QUEUE.md`) mounts into — has eight concrete,
file-cited usability defects: clipped text, an ungrouped 13-button strip with off-viewport help
text, a tool rail that exists (#433) but is cramped past legibility, a browser column with an
unstyled orphan control and two colliding blocks, ~75% undifferentiated empty space with no
guidance, unanchored floating chips, one flat type size everywhere despite three tokens existing
on paper, and misaligned transport controls. The user's own words: *"i legit cant use anything
like this."*

Shipping any of the 9 in-flight feature changes onto this frame compounds the problem — new panels
inherit the same untyped, ungrouped, unfloored CSS. This change fixes the frame first. It is scoped
to be small and mechanical: every fix traces to a specific file:line finding from this session's
ground-truth mapper (cited per packet in `plan.md`), spot-checked 3/3 against the live tree before
this proposal was written (`ToolRail.tsx:114`, `tool-rail.css:52-95`, `MasterTrack.tsx:200` vs.
`timeline.css:1355` all confirmed exactly as reported).

**Two binding constraints inherited from `PLANNING-QUEUE.md` Lane 3 item 10 (do not re-litigate):**

1. **LOCKED DESIGN PRINCIPLE (user-aligned, learning #245):** hierarchy lives INSIDE the mono/
   terminal identity — weight/size/color tiers of JetBrains Mono, no soft UI font. This
   supersedes `DESIGN-SPEC.md` §3's unshipped two-voice Plex Sans/Plex Mono plan for THIS change:
   the type-scale packet (below) adds size/weight/color tiers to the existing mono stack, it does
   not attempt the Plex swap. The Plex swap (if ever done) is a separate future change.
2. **LOCKED MOCK RULE (user, 2026-07-09):** REAL-INVENTORY-ONLY. Any mock or spec asset this
   change's build session produces (`docs/mockups/ui-foundation-frame.html`,
   `docs/roadmap/design-spec.md` addendum) must use components that exist in code or a locked plan,
   and icons must be the actual extracted assets (`tool-icons.tsx`'s 14 Block glyphs verbatim,
   decision-㊺ rail glyphs, the history op-class set) — no invented widgets, no redrawn
   approximations. This proposal/plan pair does not itself produce those assets (docs-only scope
   for this pass, see plan.md); the rule is recorded here because it binds the packet that does.

## What changes

Cumulative, ships as one frame-level pass:

1. **Type-scale + Schoger hierarchy tokens.** New/extended `--cx-text-*` tier definitions in
   `tokens.css` (size + weight + color per tier, mono-only per the locked principle), raising the
   effective floor to the DESIGN-SPEC's own already-declared 11px everywhere, and applying the
   tiers to the shell surfaces below (headers/labels/values only — not a per-component rewrite).
2. **Tool rail refinement** (not rebuild — `ToolRail.tsx`/#433 stays, its craft is fixed): icon/
   label sizing to the new floor, hotkey-badge repositioning off the icon's safe zone, group-label
   legibility, vertical rhythm between groups.
3. **Automation control-strip grouping.** Cluster the 13 `AutomationToolbar.tsx` buttons by
   function with visible dividers; make the row `flex-wrap`-safe so help/armed text never runs off
   the viewport.
4. **Empty-state designs** for the preview canvas, device chain, and (secondary polish only —
   Timeline already has a real empty-state branch, see plan.md) timeline: guidance text + an
   explicit affordance (icon or CTA), not a bare string.
5. **Five targeted bug fixes**, each independently shippable and file-isolated from the token/type
   work above: (1) clipped master-bus/automation panel label, (4) orphaned unstyled `×` search
   chip + browser category-strip/`+Add Text Track` collision, (6) unanchored preview overlay chips,
   (8) transport-row control-height misalignment.

## Non-goals (explicitly out of scope for this change)

- **New features.** No new tools, effects, or panels — every symptom fixed here already has a live
  component; this is craft, not scope.
- **Browser folder-tree** — owned by `openspec/changes/browser-folders` (Lane 2 item 8); this
  change's browser fix (item 4 above) touches only the search-clear button and the tab/action
  collision, not folders/tags/search architecture.
- **Anything the 9 existing `openspec/changes/*` own** — no re-litigation of LayerTap, System
  Monitor, multiwindow, transforms, afterimage/backspin, or history-panel-delta scope.
- **B3's banked layout** (`docs/plans/2026-07-02-b3-layout-redesign-prd.md`) — lean track headers,
  the right-dock LAYER panel, row-order-as-z-order, are SIGNED OFF and unchanged by this change.
  This change fixes the frame those land inside, not the arrangement model itself.
- **The Plex Sans/Mono two-voice swap** — explicitly superseded for this change by the LOCKED
  DESIGN PRINCIPLE above. `tokens.css`'s `TODO(plex-swap)` comments stay as-is.
- **A draggable/Bezier curve editor, session-view, or any engine/backend change** — this is a pure
  frontend CSS/component craft pass; no `backend/` file is touched by any packet in this change.
- **Full-component design-system migration** — the type-scale packet applies tokens to the 8
  diagnosed surfaces' headers/labels/values only, per the brief's explicit non-goal ("NOT every
  component rewrite").

## Open Decisions

Each has a recommended default; silence = default ships. Flag any override before `/packetize`.

**OD-1 — Type-scale tier values (mono-only, per LOCKED principle).** Recommend a 4-tier scale,
extending the 3 tokens `tokens.css` already declares (mostly unused — 15/395 font-size sites) and
adding one heading tier:
| Tier | Token | Size | Weight | Color | Use |
|---|---|---|---|---|---|
| Data/micro | `--cx-text-data` (exists) | 11px (floor, unchanged) | 450 | `--cx-text-3` | hotkey badges, timecodes, meta counts — currently violated down to 7px in 3 places |
| Label | `--cx-text-label` (exists) | 12px | 550→**600** (bump for real weight separation) | `--cx-text-2` (inactive) / `--cx-text-1` (active/selected) | control labels, tab labels, group labels |
| Body | `--cx-text-body` (exists) | 12.5px | 450 | `--cx-text-2` | hint/help text, panel copy, empty-state secondary line |
| Heading (**NEW**) | `--cx-text-heading` | 14px | 650 | `--cx-text-1` | panel/section titles (DEVICE CHAIN, empty-state primary line), distinct from the existing 18–24px "identity" tier (boot/logo only, unchanged) |
Default: table as shown. Alternate considered and rejected: reuse the 18–24px identity tier for
panel headings — rejected, too loud for in-shell chrome per DESIGN-SPEC §3's own "UPPERCASE allowed
HERE ONLY" carve-out for identity moments.

**OD-2 — Section-header case convention.** Recommend: keep existing UPPERCASE for short group
labels that are already uppercase in code today (`TRNS`/`EDIT`/`MASK`/`MISC`, `DEVICE CHAIN`) —
only fix their size/weight/color via `--cx-text-heading`, don't change case. Sentence-case is
reserved for body/dialog copy per DESIGN-SPEC §3 (unchanged).

**OD-3 — Tool-rail dimensions.** Recommend: keep the 44px rail / 32×30px button footprint (avoids
cascading a width change into `.cx-preview-row`'s flex math elsewhere); fix the collision by (a)
shrinking the icon glyph 18px→**16px** (matches DESIGN-SPEC's own "legible at 16px" spec, frees
corner clearance), (b) raising the hotkey badge to the 11px floor, (c) moving the badge fully
outside the icon's 2px safe-zone (top-right corner instead of bottom-right, since bottom-right is
where the icon's visual weight concentrates for most of the 14 Block glyphs), (d) raising
group-label from 8px to the 11px floor via `--cx-text-data`, (e) widening group gaps 4px→8px for
rhythm. Escalation fallback (only if b–d still collide after implementation): widen rail 44px→48px.

**OD-4 — Empty-state copy + affordance shape.** Recommend matching the richest existing pattern
already in code (Timeline's: hint line + explicit `+ Add Track` button) rather than a bare string:
- Preview (currently a lone absolute-positioned string): heading "No footage loaded" (`--cx-text-heading`)
  + body line "Drag a clip here, or ⌘I to import" (`--cx-text-body`) + explicit "Import Media" button.
- Device chain (currently header + centered hint, no CTA): keep the header, upgrade the hint to
  `--cx-text-body`, add a "Browse Effects" button that focuses the EFFECTS tab.
- Timeline: already has hint + 2 buttons — no content change, apply typography tokens only.

**OD-5 — Preview overlay-chip anchoring.** Recommend replacing the two independent
`position:absolute` chips (FPS readout, pop-out button) with a single pinned
`.preview-canvas__overlay-bar` flex row docked to the panel's top edge (full-width, transparent
background, chips as flex children) — removes the "unanchored" quality directly rather than just
re-positioning two absolute elements relative to each other.

**OD-6 — Automation control-strip grouping shape.** Recommend 3 named clusters with visible
dividers: **Mode** (R/L/T/D, already grouped) | **Record** (Overdub, +Lane, +Trigger, +Mod) |
**Curve ops** (Flatten, Ramp, Shape, Simplify, Clear); add `flex-wrap: wrap` to `.auto-toolbar` and
move the hint/armed text off `margin-left: auto` onto its own row when wrapped (rather than letting
it run off-viewport).

**OD-7 — Transport control height.** Recommend a new `--cx-control-h: 22px` token (between the
existing `--cx-row-h: 24px` and `--cx-device-param-h: 18px`) applied uniformly via `height` (not
just `padding`) to `.app__transport-btn`, `.app__transport-bpm input`, and `.app__transport-select`
— closes the height gap caused by 3 different native-chrome elements (button/number-input/select)
having no shared explicit height today.

## Definition of done

All 8 diagnosed symptoms resolved with **token-only diffs** — no new magic-number px values, every
size/spacing/color change routes through a `--cx-*` token, `hex-ratchet.sh` stays at or below the
current ceiling. Type floor is 11px with zero exceptions in the 8 touched surfaces (verified by the
same `grep -ohE "font-size:\s*[0-9.]+px"` histogram method used to diagnose this, re-run clean).
Vitest component tests pass for every touched component; the tool-rail regression suite (new, no
prior test file existed — confirmed by grep) locks icon/badge/label sizes and the flag-off
(`F_CREATRIX_LAYOUT` off → `.cx-preview-row` `display:contents`) path stays unaffected. A UAT
journey exists and passes per user-facing packet (plan.md). Full CI green (smoke + e2e where
path-applicable) before merge, per this repo's standing campaign merge-autonomy rules.

## T1 Verdicts (LOCKED 2026-07-09)

**ICON TRIAGE v3 (user correction, 2026-07-18 — "are these all intended to be x?" NO):** semantic re-triage shipped: track-visibility → lucide eye/eye-off pair · pop-out toggle → picture-in-picture-2 · toast ×N repeat badge → DELIBERATELY TEXT (it is multiplication, not a button) · add-operator picker toggle → plus (rotates 45° open) · ripple-delete rows → tool-set-governed · true dialog/panel closes → one lucide x. LIBRARY POLICY LOCKED: Lucide primary (ISC) → Tabler deep-catalog fallback (MIT, verified 24×24/stroke-2 compatible) → custom for domain-specific. PK.H triage = 76 pending rows w/ per-row defaults, user vetoes by exception. Wand pick RESOLVED 2026-07-30 (G2 rod+star+dotted-region wake — see WAND RESOLUTION).

**MASTER ICON ASSIGNMENT (2026-07-18, first-principles per user — "real glyphs assigned to EVERYTHING"):** ground truth: only ~20 real SVG icons exist app-wide (14 tool + 4 transport + 2 DUPLICATE 14x14 lasso glyphs in PreviewControls.tsx:63/78 — unify with tool set); all other census entries are letters/unicode. Assignment kit locked (Lucide ISC): x=close · chevrons=disclosure · plus=add · trash-2=delete · link/unlink · magnet=snap(S) · grid-2x2=quantize(Q) · circle-dot=arm/record(R) · volume-x=mute(M) · eye=visibility · pencil=draw · snowflake=freeze. Auto-assigned ~65; **93 PENDING rows = the PK.H worklist** (each: assign or mark deliberately-text). WAND small-size fix candidates W1/W2/W3 published (user flagged Block wand illegible at rail size — supersedes the earlier keep-current lock pending pick). PK.H scope = this master assignment manifest + the 7 meaning-clash unifications + R-collision rename + PreviewControls lasso dedup.

**APP-WIDE ICON CENSUS (2026-07-18, user-requested — 5-agent systematic sweep, 160 icons):** full inventory on the final-glyphs artifact (afd223f3). **7 meaning clashes** to unify: CLOSE rendered as ×/x/✕ across dialogs+panels · EXPAND/COLLAPSE mixes ▶/▼/▾/▸ · DELETE ×/✕/⇧⌦ · REMOVE ×/✕ · ADD five phrasings · MUTE M-styles · PAGE ◀▶ variants. Plus one SEMANTIC collision: glyph R = Read-mode (AutomationToolbar.tsx:37) AND arm-recording (Track.tsx:438). RECOMMENDATION: add **PK.H — icon-unification pass** to ui-foundation (cheap: pick ONE glyph per meaning — ✕ for close, ▸/▾ for disclosure, Lucide link/unlink for future link-chain — and sweep the 160-row census worklist; the R collision gets a rename). Full iconization of text-labels (S/Q/M/R) deferred to the browser-rail icon family program.

**OD-3 FINAL GLYPH MANIFEST (user dictation 2026-07-18 — CLOSED, one confirm pending):** unified line grammar 2.0/round (Lucide-native; our customs redrawn to match). OURS: Razor R2c · Ripple D5 · Slip (fixed-frame+inner-arrows — semantically correct for content-slide) · Mask Polygon · Marker flag · Loop In/Out brackets · Wand Block (locked exception). LUCIDE (ISC, vendored + license line): Select=cursor-arrow (recommended in the transform walk-through — user may revert to bbox with one word) · Text=type · Slide · Mask Rect/Ellipse dashed · Lasso · Hand · Zoom · Key Picker=pipette. FUTURE reserved: Paint=Lucide brush (rail-drawer spec ㊺ + LayerTap paint source). Inventory verified vs code: all 14 wired CursorTools covered + 4 future; util.transform correctly excluded (gizmo, not cursor); browser-rail container family (decision ㊺) = next icon program. Final-set artifact: creatrix-final-glyphs page. PK.B implements this manifest + grouped rail (Convention 1).

**OD-3 RAZOR LOCKED (user, 2026-07-15): R2c — angled classic double-edge blade, wire.** Eyedropper round 5 published (E6-E11, PS-silhouette family: E8 fat-bulb/double-collar, E9 chunky wide-barrel [CDO: most PS-faithful], E10 slim-long, E11 E9+drop) — the ONE remaining glyph pick.

**OD-3 GLYPH PICKS (progressive locks):** Ripple Delete = **D5 LOCKED** (user 2026-07-15: X between timeline brackets, wire). Razor = R2 classic-blade DIRECTION confirmed, variant pending (R2/R2a keyhole/R2b blade-cutting-timeline/R2c angled — artifact round 4). Key Picker = Photoshop-eyedropper silhouette per user ("slightly modify the eyedropper from photoshop") — E6 (wire barrel) vs E7 (loaded tip + drop) pending.

**OD-3 GROUPING LOCKED (user, 2026-07-15): grouped rail = YES, CONVENTION 1** (slot shows the ACTIVE subtool + corner caret, Photoshop behavior; 8 groups: SELECT V · TRIM B · TEXT T · MASK-SHAPE Q · MASK-FREE W · KEY E · NAV H · MARK/LOOP M; group hotkey cycles subtools — Q/W collisions become the cycle mechanic). PK.B scope now includes: flyout press-and-hold machinery + group model + cycle-hotkey dispatch — RESIZE PK.B at dispatch (it grew from "refine dims" to "grouped rail"). Round 3 candidates for the 3 contested glyphs published (R1-R5 / D1-D5 / E1-E5 on artifact 887a8e83); final picks pending.

**OD-3 ROUND-2 VERDICTS (user dictation, 2026-07-15 — LOCKED):** icon direction = **WIRE restyle set-wide** (1.9 stroke, round caps, fills opened) · EXCEPTION: Mask Wand stays the current Block glyph (user pick; CDO consistency flag recorded — Block wand reads louder in a wire set) · Text tool stays. **REJECTED, replacements pending pick (candidates on artifact 887a8e83 Round 2):** Razor ("should look like an actual razor" — R1 straight-razor / R2 classic-blade) · Ripple Delete ("doesn't look like something is getting deleted" — D1 X'd-clip-neighbors-close / D2 X-between-blocks) · Key Picker ("should look like an eyedropper, not a nail" — E1 dropper+drop / E2 filled-bulb dropper). STILL OPEN: grouped-rail yes/no + convention 1/2, and the R/D/E picks. PK.B implementation basis = wire set + picks; tool-icons.tsx gains a wire variant of ICON_BODY (or stroke-prop parameterization — executor's call within the packet).

**OD-3 EXPANDED (user, 2026-07-10: "come up with alts for all icons… consider Photoshop-style grouping with a caret… we should diverge a bit"):** icon-divergence round delivered on the decision sheet (artifact 887a8e83): per-tool alternates (current Block · alt-metaphor Block · wire restyle), NEW glyph candidates for Marker/Loop In/Loop Out, and a GROUPED-RAIL proposal (14+3 slots → 8 groups: SELECT V · TRIM B · TEXT T · MASK-SHAPE Q · MASK-FREE W · KEY E · NAV H · MARK/LOOP M; corner-caret flyouts; hotkey cycles subsume the Q/W collisions) with two group-icon conventions (active-glyph+caret vs fixed-representative+caret). PENDING USER VERDICTS: grouping yes/no · convention 1/2 · per-tool glyph picks. PK.B's scope grows to implement the picks (incl. flyout mechanics if grouping approved — flag: flyout press-and-hold is NEW interaction machinery, size PK.B accordingly at dispatch).

**OD-1 RESOLVED (user, 2026-07-10): SCALE B — heading 15 / body 13 / label 12 / data 11.** Scale A is the rejected alternate. PK.A tokens ship B values; the A/B toggle in the frame mock is now historical record.

T1 VERDICTS (user, 2026-07-09 — LOCKED unless marked):

- **OD-1 type tiers:** user "no idea" → DECIDE VISUALLY. Provisional = 11/12/12.5/14 tiers (data
  450 / label 600 / body 450 / heading 650). The frame mock MUST render BOTH candidate scales
  (11/12/12.5/14 vs 11/12/13/15) behind a visible A/B toggle so the user picks by eye at mock
  review.
- **OD-2 UPPERCASE labels:** ACCEPTED provisionally.
- **OD-3 rail:** dims LOCKED at recommended (44px rail, icon 18→16px, badge to 11px floor +
  top-right, gaps 4→8px). BUT the user challenged the ICONS THEMSELVES ("is it even the right ICON
  THOUGH???") → NEW DELIVERABLE: an ICON SEMANTIC AUDIT section in the mock — all 14 Block glyphs
  EXTRACTED VERBATIM from `frontend/src/renderer/assets/tool-icons.tsx`, each rendered at 16px AND
  32px beside its tool name, hotkey, and one-line function, with a per-icon verdict checkbox row
  (keep / rework) for the user. Icon CHOICES are NOT locked; dims are.
- **OD-4 empty states:** OVERRIDE — minimal hint text ONLY, properly styled, NO CTA buttons
  (quieter than the drafter default).
- **OD-5/6/7** (overlay bar, 3-cluster automation strip, 22px control token): ACCEPTED
  PROVISIONALLY — a MID-ROADMAP DESIGN REVIEW CHECKPOINT revisits OD-2/5/6/7 (recorded here per
  instruction).
- **STANDING** (queue row 10): mono-identity hierarchy (no soft UI fonts) · REAL-INVENTORY-ONLY
  mock rule · UAT-as-micro-unit (every packet carries a MANDATORY UAT unit: uat.md row ids +
  method — OS-pointer harness for drag-class, CU/screenshot+PIL for visual, command oracles for
  backend; executes immediately after implementation, before ledger ✅).

### Open Decisions — status after T1

| Decision | Status |
|---|---|
| OD-1 (type-scale tier values) | VISUAL-PENDING — dual A/B scale in mock, user picks by eye |
| OD-2 (section-header case) | LOCKED (provisional accept) |
| OD-3 (tool-rail dimensions) | LOCKED (dims); icons VISUAL-PENDING — semantic audit deliverable required |
| OD-4 (empty-state copy + affordance) | LOCKED (override: minimal hint text only, no CTA) |
| OD-5 (preview overlay-chip anchoring) | LOCKED (provisional accept; revisit at mid-roadmap checkpoint) |
| OD-6 (automation control-strip grouping) | LOCKED (provisional accept; revisit at mid-roadmap checkpoint) |
| OD-7 (transport control height) | LOCKED (provisional accept; revisit at mid-roadmap checkpoint) |

### Icon program — CONVENTION-GROUNDED MANIFEST v4 (Norman/CDO pass, 2026-07-18)

User directive (/don-norman + /cdo): "decide on the optimal glyph for each… ground in what the
user's affordance is and standards and what they expect." A 15-judge affordance triage ran over
the full 180-icon census (every icon-like element in the app, from Task w21ke11om), each verdict
grounded in a NAMED convention (Ableton/Photoshop/Premiere/Resolve/Pro Tools/OS) or DOET/Nielsen
principle. Published: artifact afd223f3 "CONVENTION-GROUNDED MANIFEST — v4".

**Verdict distribution (180 rows):** 52 KEEP-CURRENT · 76 library (Lucide/Tabler, ISC/MIT,
24×24 stroke-2) · 39 KEEP-TEXT · 13 custom.

**Load-bearing rulings (overturn earlier keyword-era picks):**
- **M / S / Q and R-L-T-D automation modes STAY TEXT** — single-letter track buttons ARE the
  pro-audio convention (Ableton/Logic/Pro Tools headers). Kills the earlier volume-x-for-Mute and
  grid-2x2-for-Quantize proposals. Same for ×N repeat badges and type chips.
- **Snap S → lucide:magnet** — resolves the S(nap)/S(olo) same-glyph-two-meanings collision;
  magnet is the Premiere/Resolve snapping convention.
- **ALL emoji glyphs → vector** (👁 🔒 ⛓️‍💥 ❄ ⚗ 📌 …) — root cause of "icons sometimes don't
  show": emoji render tofu/inconsistently cross-platform; only 20 real SVGs exist app-wide.
- **Freeze ❄:** current uses the SAME glyph for frozen and unfrozen — state-toggle-shows-state
  violation → filled vs outline snowflake pair (custom).
- **Record-arm → filled record dot** (Pro Tools/Logic convention); automation "R" (Read) stays text.
- **Pop-out → lucide:external-link** (OS convention; overturns earlier pip-2 pick).
- **Chain-link family:** link/unlink = aspect-lock only (Photoshop constrain-proportions);
  routing taps get distinct glyphs — no more one-glyph-many-meanings.

**Fable adjudication of the 56 MED/LOW-confidence verdicts:** 54 upheld; 2 overturned —
(1) clip "M{n}" mask-count badge: KEEP-TEXT → custom mask-glyph+count (Rule-2 collision with
Mute-M rendered on the same clip row); (2) rack up-one-level unified on lucide:corner-up-left
(two judges split corner-up-left vs arrow-up; one glyph per meaning).

**Still user-veto-open:** any per-row strike at manifest review. ~~wand small-size fix W1/W2/W3~~
→ RESOLVED, see WAND RESOLUTION below.

**WAND RESOLUTION (user pick "G2", 2026-07-30 — LOCKED, supersedes W1/W2/W3 and the OD-3
Block-wand exception):** 6 iteration rounds (W→C→D→E→F→G series, ~30 candidates) converged on
**rod + star + dotted-region wake**: the wand rod and filled star kept from the current
composition (mass-fixed), with four tapering marching-ants dots arcing under the tip —
"wand hovers over the selection it creates." Verified legible at 18px rail cell and 25px
worst-case beside the lasso (screenshot-gated). Exact 24×24 spec for `tool-icons.tsx` (PK.B/PK.H):
- rod: `M5 19l6.5-6.5` stroke-width 2.4, round cap
- star (filled, no stroke): `M15.5 3.5l1.4 3.6 3.6 1.4-3.6 1.4-1.4 3.6-1.4-3.6-3.6-1.4 3.6-1.4z`
- region dots (filled circles, tapering): (13.3,20.6,r1.2) · (16.7,19.7,r1.05) · (19.4,17.5,r0.95) · (21,14.5,r0.85)
Design rationale: dotted wake = marching-ants selection semantics (what the tool DOES), filled
star + 2.4 rod = small-size mass (why W1/W2/W3 and the old Block wand failed at rail size).

**PK.H (icon unification) implements this manifest.** Sources: Lucide (ISC) + Tabler (MIT)
vendored with license lines; 13 customs drawn on the 24×24/stroke-2 grid; no traced Adobe artwork
(concepts are unprotectable, artwork is not).

### Icon program — v4.1 addendum (user review round, 2026-07-18)

User flagged "up one level" and "modulation routes" as weird; asked for future-glyph guidelines,
a routing visual language check against the design docs, and a cursor inventory. All four on
artifact afd223f3 §ADDENDUM v4.1.

**Re-ruling 1 — up one level (overturns v4):** the triage had 3 judges give 3 arrow variants.
Two meanings, two glyphs: GO-UP-ONE-LEVEL = `lucide:arrow-up` (Explorer/file-manager toolbar
convention) in rack breadcrumb + browser folders; BACK-REFERENCE-TO-ORIGIN = `lucide:corner-up-left`
(LAYER panel "selected track" pointer only).

**Re-ruling 2 — modulation routes:** static glyph set shrinks to four — add = "+ Add route" text ·
unroute/unmap = `lucide:unlink` EVERYWHERE (kills the lucide:x verdicts on sub-LFO removal) ·
routed-state = filled dot · flow = → arrow. Everything else is live data → chip system.

**Routing visual language (from creatrix-layertap-routing-prd.md, banked ①–⑫):** governing rule
"chips configure; wires only visualize." Routing state is dynamic (thumbnails ~10fps, sparklines,
stage dots, ↩1f feedback markers, ⧉n pills, ×n bundles, ◀ n/N ▶ stepper) — its signifier is the
TAP CHIP component, not a manifest glyph. Manifest routing rows marked KEEP-CURRENT stand for
today's UI; superseded when layertap-matte-v1 lands. Static glyphs that DO stay manifest rows:
lane toggles ▦/∿/⧉, stage dot, unlink, node-graph title glyph.

**GLYPH GUIDELINES v1 (11 rules, canonical copy on artifact; design-spec.md §10 in PK.H):**
1 convention-first (name the host app) · 2 one-glyph-one-meaning · 3 text-is-valid-glyph (M/S/Q,
RLTD, ×N) · 4 vector-only on the 24×24/stroke-2 grid, NO emoji · 5 legibility floor 14px, ≈3-stroke
budget, test 14/16/18 · 6 state-toggles-show-state · 7 destroy(trash)≠dismiss(x)≠detach(unlink) ·
8 source order Lucide(ISC)→Tabler(MIT)→custom, registered in assign-kit.json + license line, never
trace Adobe artwork · 9 live-data-gets-a-chip-not-a-glyph · 10 no unregistered icons (manifest row
+ GROUNDS in the same PR) · 11 the-cursor-is-a-glyph-slot (acting tools swap the pointer).

**Cursor inventory (code census):** 14 CursorTool modes + 9 context cursors. FINDING: the 8
timeline tools change click behavior (Clip.tsx:320, TimeRuler.tsx:132) but never swap the pointer —
armed razor looks identical to select (Norman feedback violation). PK.H adds per-tool cursors:
razor/ripple-delete/loop/eyedropper get custom svg cursors from the locked glyph set
(`cursor: url(svg) hotspot, fallback`), slip/slide → ew-resize, marker → crosshair; mask tools
keep crosshair (lasso-freehand cell → crosshair for consistency). Context set unchanged: grab/
grabbing, ns/ew/nwse/nesw/row/col-resize, move, not-allowed, text, wait, pointer.
