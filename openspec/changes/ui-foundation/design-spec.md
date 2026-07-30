# Design Spec — ui-foundation

**Status:** DOCS-ONLY. Quantified companion to `proposal.md` (Open Decisions + T1 Verdicts) and
`plan.md` (Packets A–G, file:line ground-truth). This document is the single source every packet's
implementation and every mock's rendering must match value-for-value. **Every size/spacing/color in
this spec is a named `--cx-*` token — zero magic numbers.** Where a token does not yet exist in
`frontend/src/renderer/styles/tokens.css` or a component CSS file, this spec defines it; Packet A (or
the packet noted per section) is responsible for landing it in code.

Read first: `proposal.md` (Why + Open Decisions + T1 Verdicts), `plan.md` (Packets A–G + file:line
citations), `frontend/src/renderer/styles/tokens.css` (current Tier-1/2 tokens),
`frontend/src/renderer/styles/tool-rail.css` (current rail CSS), `docs/mockups/INDEX.md` (mock
registry — this change's mock is `docs/mockups/ui-foundation-frame.html`, not yet built).

**Token tier model (unchanged, from `tokens.css:1-13`):** Tier 1 (`--cx-*` primitives, hex/px values
ONLY here) → Tier 2 (semantic aliases, never a literal) → Tier 3 (component tokens, live in
per-surface CSS files, alias Tier 1/2). New tokens below are tagged with their tier.

---

## 1. Type scale — dual candidate, A/B (OD-1, VISUAL-PENDING)

> **VERDICT LOCKED 2026-07-10: SCALE B (15/13/12/11) is the shipping scale.** Candidate A is the rejected alternate; every token value below that differs between candidates resolves to the B column.


T1 verdict: user has no prior on type sizing → **decide visually**. The mock MUST render both
candidate scales behind a toggle; this table is the values contract for that toggle, not a final
pick. **Candidate A ships as the default in `tokens.css` today** (it is the proposal.md OD-1
recommended default); Candidate B exists ONLY as a mock-time comparison overlay, never lands in
`tokens.css` unless the user picks it at mock review.

### Candidate A — provisional default (11 / 12 / 12.5 / 14)

| Tier | Token (Tier 1) | Size | Weight token (Tier 1) | Weight | Color token | Usage | Where applied |
|---|---|---|---|---|---|---|---|
| Data / micro | `--cx-text-data` (exists) | 11px (floor) | `--cx-weight-data` (**new**) | 450 | `--cx-text-3` | hotkey badges, timecodes, meta counts | `.tool-rail__hotkey`, `.tool-rail__group-label`, `.master-track-header__badge` |
| Label | `--cx-text-label` (exists) | 12px | `--cx-weight-label` (**new** — plan.md Packet A #2) | 600 | `--cx-text-2` (inactive) / `--cx-text-1` (active/selected) | control labels, tab labels, group labels | `.effect-browser__tabs` labels, `.auto-toolbar` button labels, `.app__transport-*` labels |
| Body | `--cx-text-body` (exists) | 12.5px | `--cx-weight-body` (**new**) | 450 | `--cx-text-2` | hint/help text, panel copy, empty-state hint line | `.master-track-lane__label`, `.device-chain__empty`, `.preview-canvas__placeholder`, `.auto-toolbar__hint`/`__armed` |
| Heading | `--cx-text-heading` (**new** — plan.md Packet A #1) | 14px | `--cx-weight-heading` (**new** — plan.md Packet A #1) | 650 | `--cx-text-1` | panel/section titles | `.device-chain__header` (18–24px identity tier, boot/logo only, stays separate and unchanged) |

### Candidate B — alternate (11 / 12 / 13 / 15)

| Tier | Mock-only override token | Size | Weight | Notes |
|---|---|---|---|---|
| Data / micro | `--cx-text-data` | 11px | 450 | identical to Candidate A — floor never moves between candidates |
| Label | `--cx-text-label` | 12px | 600 | identical to Candidate A |
| Body | `--cx-text-body-alt` (**mock-only**, not in `tokens.css`) | 13px | 450 | +0.5px over Candidate A |
| Heading | `--cx-text-heading-alt` (**mock-only**, not in `tokens.css`) | 15px | 650 | +1px over Candidate A |

**Mock contract:** the frame mock scopes Candidate B via `[data-type-scale="b"]` on a wrapping
container, overriding `--cx-text-body` and `--cx-text-heading` locally (CSS custom-property
shadowing — no component code fork). Toggle switches the root `data-type-scale` attribute between
`"a"` (default) and `"b"`; every text-tier consumer must read the token, never a literal, so the
toggle alone is sufficient to re-render both candidates live. Data/label tiers do NOT vary between
candidates — only body/heading are in question, since data is pinned to the accessibility floor and
label is a locked design decision (weight-600 separation), leaving body/heading as the only tiers
where "how loud is chrome text" is genuinely undecided.

**Implementation note (beyond plan.md's literal text):** plan.md Packet A explicitly adds
`--cx-weight-label` and `--cx-weight-heading` only (its normative contract items 1–2). This spec
additionally names `--cx-weight-data` (450) and `--cx-weight-body` (450) to close the "zero magic
numbers" gap for the other two tiers — `tokens.css:101,103`'s existing comments already state these
weights ("weight 450", "weight 550→approximated") without a token backing them. Packet A should land
all four weight tokens together, not just the two plan.md calls out by name, so the histogram guard
(§9) has something to check every tier against.

---

## 2. Rail dimensions — locked (OD-3 dims LOCKED; icon choices VISUAL-PENDING, separate deliverable)

Dims below are **LOCKED** per T1 — not part of the A/B visual pick. Icon *choices* (which of the 14
Block glyphs render for which tool, and whether any glyph should be reworked) are **out of scope for
this spec** — that is the mock's separate "ICON SEMANTIC AUDIT" deliverable (proposal.md OD-3), which
extracts all 14 `tool-icons.tsx` glyphs verbatim with a keep/rework checkbox per icon. This section
only fixes the geometry every icon renders inside.

| Property | Token | Tier | Old value | New (locked) value | File |
|---|---|---|---|---|---|
| Rail width | `--tool-rail-w` (**new**) | 3 | `44px` (hardcoded) | `44px` (unchanged) | `tool-rail.css:24` |
| Tool button size | `--tool-rail-btn-w` / `--tool-rail-btn-h` (**new**) | 3 | `32px` / `30px` (hardcoded) | `32px` / `30px` (unchanged) | `tool-rail.css:53-54` |
| Icon glyph size | `ToolIcon size` prop | — | `18` (`ToolRail.tsx:114`) | `16` | `ToolRail.tsx:114` |
| Hotkey badge type | `--cx-text-data` | 1 | `7px` hardcoded (`tool-rail.css:93`) | `11px` (floor, via token) | `tool-rail.css:93` |
| Hotkey badge position | `--tool-rail-badge-inset` (**new**) | 3 | `right: 2px; bottom: 1px` (`tool-rail.css:91-92`) | `top: 2px; right: 2px` | `tool-rail.css:90-92` |
| Group-label type | `--cx-text-data` | 1 | `8px` hardcoded (`tool-rail.css:46`) | `11px` (floor, via token) | `tool-rail.css:46` |
| Intra-group tool gap | `--cx-space-4` (§3) | 1/2 | `3px` (`tool-rail.css:23,36`) | `4px` | `.tool-rail`, `.tool-rail__group` |
| Inter-group margin/padding | `--cx-space-8` (§3) | 1/2 | `4px` (`tool-rail.css:40-41`) | `8px` | `.tool-rail__group + .tool-rail__group` |

**Escalation fallback (contingent, only if badge still collides with any of the 14 icons at these
values — spot-checked per-icon in Packet B's regression suite):**

| Property | Token | Escalated value |
|---|---|---|
| Rail width | `--tool-rail-w` | `48px` |
| Tool button size | `--tool-rail-btn-w` / `--tool-rail-btn-h` | `36px` / `32px` |

Do not shrink the badge below the `--cx-text-data` 11px floor to resolve a collision — escalate rail
width instead (proposal.md OD-3 fallback clause).

**Grounded surprise (plan.md, load-bearing for framing):** the icon glyph itself was never
undersized — 18px was already above the DESIGN-SPEC's own 16px reference (`DESIGN-SPEC.md:263`,
"Ableton-chunky, legible at 16px"). The fix is corner-collision relief (badge floor + reposition), not
icon growth; OD-3 shrinks the icon 18→16 specifically to free clearance for the now-larger badge.

**Rail inventory (context for the mock's separate icon audit, not re-specified here):** 14 tool
slots across 4 groups (`ToolRail.tsx:33-38`) — TRNS (1: select) · EDIT (4: razor, slip, slide,
ripple-delete) · MASK (6: mask-marquee-rect, mask-marquee-ellipse, mask-lasso-freehand,
mask-lasso-polygon, mask-wand, mask-key-picker) · MISC (3: marker, loop-in, loop-out). Only 11 of the
14 have a `TOOL_ICON` mapping (`EffectBrowser.tsx:155-167`) to one of the 14 `tool-icons.tsx` glyphs;
the 3 MISC tools (marker, loop-in, loop-out) currently render a 2-letter text fallback
(`ToolRail.tsx:116`), not an SVG icon — and 3 glyphs that exist in `tool-icons.tsx` (`text`, `hand`,
`zoom`) are not wired to any current rail tool. This inventory gap is a mock/audit-time finding, not
a dimension fix — flagged here only so the audit deliverable doesn't have to re-derive it.

---

## 3. Spacing rhythm tokens (new — Tier 1, `tokens.css`)

No spacing scale exists in `tokens.css` today (confirmed by grep — only layout constants and density
tokens `--cx-row-h`/`--cx-panel-header`/`--cx-device-param-h` exist; no `--cx-space-*`/`--cx-gap-*`
token of any kind). This change is the first packet to need a shared spacing rhythm (rail gaps,
automation cluster gaps, overlay-bar padding, empty-state gaps) — rather than each packet inventing
its own literal, this spec adds one small scale, named by its own pixel value for zero ambiguity
(matches the existing self-documenting convention of `--cx-row-h: 24px` etc.):

| Token | Value | Replaces (this change's literals) |
|---|---|---|
| `--cx-space-2` | 2px | hotkey badge inset, hairline insets |
| `--cx-space-4` | 4px | rail intra-group gap (was 3px, OD-3), overlay-bar padding (OD-5) |
| `--cx-space-6` | 6px | (reserved — no literal in this change snaps here after §3's audit; see note) |
| `--cx-space-8` | 8px | rail inter-group margin (OD-3), automation cluster gap (existing, `automation.css:33-40` already `gap:8px` — now token-backed instead of raw) |
| `--cx-space-12` | 12px | panel/card padding (existing usages, e.g. `.effect-search { padding: 8px 12px }`) |
| `--cx-space-16` | 16px | transport-bar gap (`global.css:40`, existing `gap: 16px`) |
| `--cx-space-24` | 24px | — reserved, matches `--cx-row-h`/hit-target floor for cross-reference only |

**Note on `.effect-search`'s existing `gap: 6px` (Packet F, `EffectBrowser.tsx`/`global.css:522`):**
plan.md's Packet F contract specifies a literal `6px` flex gap between the search input and the new
clear button. This spec keeps `--cx-space-6` reserved specifically for that value rather than
snapping it to `--cx-space-4` or `--cx-space-8`, since 6px is a real, deliberate visual choice
(halfway between the 4/8 rhythm, matching the small icon-chip's own 20px footprint) — not a value to
eliminate. If a future packet needs another 6px gap, reuse this token; do not add a second one.

**Governance:** this scale is additive only for this change's packets (A/B/C/D/E/F/G) — it does not
retroactively migrate the rest of `styles/*.css`'s existing raw spacing literals. That is future
cleanup, out of scope here (mirrors OD-1's non-goal: "NOT every component rewrite").

---

## 4. Empty-state anatomy — minimal-hint variant (OD-4 OVERRIDE, supersedes plan.md Packet D's CTA)

**T1 override supersedes the proposal.md OD-4 default and plan.md Packet D's normative contract.**
Proposal.md OD-4 recommended heading + body + CTA button (matching Timeline's richer existing
pattern); plan.md Packet D's contract was written to that recommendation. T1 (2026-07-09) overrode
this to **minimal hint text ONLY, properly styled, NO CTA buttons** — quieter than the drafter
default. **Packet D's implementation must follow this spec, not its own normative-contract prose for
the CTA button** (the button-wiring language in plan.md §Packet D / §Test Plan / §UAT journeys is
superseded by this section wherever it describes a CTA).

**Scope of the override:** applies to the two states OD-4 proposed *elevating* to a CTA — Preview and
Device-chain. **Timeline is unaffected** — it already ships a real, functional empty-state branch
(hint + `Cmd+I` badge + `+ Add Track`/`+ MIDI Track` buttons, `Timeline.tsx:178-201`) that predates
this change and was never proposed for a CTA *addition*; Packet D's own contract already scoped
Timeline to "typography-token pass only, zero DOM change" and that stays true — its buttons are not
new, so OD-4's "no NEW CTA" override does not touch them.

### Anatomy (Preview + Device-chain empty states)

| Element | Spec |
|---|---|
| Container | `.{surface}__empty-state` — `display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--cx-space-4);` positioned via the surface's existing centering (Preview: absolute-centered in `.preview-canvas`; Device-chain: centered under the existing header) |
| Type tier | single line, `var(--cx-text-body)` (12.5px/450 — Candidate A; tracks §1's A/B pick) |
| Color | `var(--cx-text-3)` (hint/placeholder tier — `tokens.css:45`, already the semantically-correct "quiet" text color, distinct from `--cx-text-2` used for active labels) |
| Max-width | `280px`, `text-align: center` — caps line length so the hint reads as a short aside, not a paragraph |
| CTA | **NONE.** No button, no icon, no clickable affordance. Text may reference an existing shortcut inline (e.g. "Drag a clip here, or ⌘I to import") as plain text, not as an interactive element |
| Copy (unchanged from OD-4's proposed strings, minus the button) | Preview: "Drag a clip here, or ⌘I to import." · Device chain: keep existing header, hint becomes "No effects yet — browse the EFFECTS tab to add one." (references the tab by name since there is no click target to focus it for the user) |

**Files:** `frontend/src/renderer/components/preview/PreviewCanvas.tsx` +
`frontend/src/renderer/styles/global.css` (`.preview-canvas__placeholder`, unsplit — OD-4 override
means no heading/body DOM split is needed either, since there is no CTA to visually separate from;
a single body-tier text node suffices, simpler than plan.md Packet D's originally-planned 3-node
split). `frontend/src/renderer/components/device-chain/DeviceChain.tsx` +
`frontend/src/renderer/styles/device-chain.css` (`.device-chain__empty`, hint text only, header
unchanged). The stray `border-top: 1px solid var(--cx-selection)` on `.device-chain` (Tier 2 alias of
`--cx-mod`, `device-chain.css:5` — confirmed permanent/unconditional today) — Packet D's fix stands
regardless of the OD-4 override: scope it to `chain.length > 0` (§8 for full citation, this fix is
independent of the empty-state copy question).

---

## 5. Overlay-bar spec (OD-5 — preview chip anchoring)

New Tier-3 component class in `global.css`, replacing two independent `position: absolute` chips
with one anchored flex container:

```css
.preview-canvas__overlay-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--cx-space-4);   /* was: two separate top:4px/left|right:4px offsets */
  pointer-events: none;         /* bar itself never blocks canvas interaction */
}

.preview-canvas__overlay-bar > * {
  pointer-events: auto;         /* children re-enable individually */
}
```

| Slot | Child | Current (pre-fix) | New |
|---|---|---|---|
| Start (left) | `.preview-canvas__fps` (DEV-only readout) | independent `position: absolute; top: 4px; left: 4px` (`global.css:1216-1230`) | flex child, start slot, no independent `position` |
| End (right) | `.preview-canvas__popout-btn` | independent `position: absolute; top: 4px; right: 4px` (`global.css:1201-1214`) | flex child, end slot, no independent `position` |

Visual position is unchanged (both chips still read top-left / top-right of the preview panel) — the
fix is structural: one anchored parent instead of two independently-positioned siblings, closing the
"unanchored floating chips" defect at the DOM level, not just re-tuning two offsets relative to each
other. **File:** `frontend/src/renderer/components/preview/PreviewCanvas.tsx` (wraps the two chips in
the new bar div; `PreviewCanvas.tsx:174-198` is today's flat-sibling render site) +
`frontend/src/renderer/styles/global.css` (new rule block).

---

## 6. Automation 3-cluster spec (OD-6)

Three named grouping containers replace 9 flat sibling buttons
(`AutomationToolbar.tsx:410-538`) inside the existing `.auto-toolbar` row (`Mode` cluster,
`.auto-toolbar__modes`, already exists and is unchanged):

| Cluster | Class | Buttons | Divider |
|---|---|---|---|
| Mode (existing, unchanged) | `.auto-toolbar__modes` | R / L / T / D | — (first cluster, no leading divider) |
| Record | `.auto-toolbar__record` (**new**) | Overdub (`:428`), +Lane (`:443`), +Trigger (`:454`), +Mod (`:469`) | `border-left: 1px solid var(--cx-line-1)` |
| Curve ops | `.auto-toolbar__curve-ops` (**new**) | Flatten (`:485`), Ramp (`:494`), Shape (`:507`), Simplify (`:518`), Clear (`:528`) | `border-left: 1px solid var(--cx-line-1)` |

Divider reuses `.tool-rail__group`'s existing separator convention (`border` on the line-1 token) —
same token, adapted from `border-top` (rail is vertical) to `border-left` (automation strip is
horizontal). No new divider color/pattern is introduced.

**Row behavior:**

```css
.auto-toolbar {
  display: flex;
  gap: var(--cx-space-8);   /* existing gap:8px, now token-backed (was raw px) */
  flex-wrap: wrap;          /* new — was unset, causing off-viewport overflow */
}

.auto-toolbar__hint,
.auto-toolbar__armed {
  /* was: margin-left: auto (guarantees overflow once the row fills) */
  margin-left: 0;
}

.auto-toolbar__hint,
.auto-toolbar__armed {
  flex-basis: 100%;   /* only takes effect once the row has wrapped — own line, not squeezed */
}
```

**Type:** button labels → `var(--cx-text-label)` (12px/600); hint/armed text →
`var(--cx-text-body)` (12.5px/450 — Candidate A). Sequenced after Packet A (consumes its tokens).

**Files:** `frontend/src/renderer/components/automation/AutomationToolbar.tsx` (wraps the 9 buttons
into the 2 new containers) + `frontend/src/renderer/styles/automation.css`
(`.auto-toolbar:33-40`, `.auto-toolbar__armed`/`.auto-toolbar__hint:108-121`).

---

## 7. `--cx-control-h` spec (OD-7 — transport control height)

New Tier-1 primitive in `tokens.css`, alongside the existing density tokens
(`--cx-row-h: 24px`, `--cx-panel-header: 28px`, `--cx-device-param-h: 18px`):

```css
--cx-control-h: 22px;   /* between --cx-device-param-h (18px) and --cx-row-h (24px) */
```

Applied uniformly via `height` (not padding alone — padding-only sizing is why the 3 controls
disagree today, since native chrome differs per element type):

| Selector | Current (no explicit height) | New |
|---|---|---|
| `.app__transport-btn` | `padding: 2px 8px; font-size: 12px;` (`global.css:54-65`) | + `height: var(--cx-control-h); box-sizing: border-box;` |
| `.app__transport-bpm input` | `padding: 1px 4px; font-size: 11px;` (`global.css:92-101`) | + `height: var(--cx-control-h); box-sizing: border-box;` |
| `.app__transport-select` | `padding: 1px 4px; font-size: 11px;` (`global.css:109-117`) | + `height: var(--cx-control-h); box-sizing: border-box;` |

All three live inside the fixed `.app__transport-bar` (`global.css:34-47`, `height: 32px`,
`position: fixed`) — single mount site, confirmed no duplicate transport surface exists elsewhere
(`Timeline.tsx:372` comment confirms the old timeline-local transport bar was removed).

**Sequencing escape hatch (plan.md Packet G):** if Packet G lands before Packet A, hardcode `22px`
with a `// TODO: route through --cx-control-h once Packet A lands` comment rather than blocking G on
A.

---

## 8. Bug-fix specs (file:line, the 4 symptom fixes)

### 8a. Clipped master-bus/automation panel label — height drift (symptom 1, Packet E)

| Fact | Value |
|---|---|
| `TRACK_HEIGHT` constant | `MasterTrack.tsx:200` — `const TRACK_HEIGHT = 60` |
| CSS lane height | `timeline.css:1354-1355` — `.master-track-lane { height: 76px; }` |
| Drift | 60 vs 76 — automation overlay geometry and the visible lane background disagree by 16px |
| Label rule (no truncation handling) | `timeline.css:1369-1375` — `.master-track-lane__label` sets only `font-family`/`font-size: 10px`/`letter-spacing`/`color`; no `white-space`, `text-overflow`, or `max-width` |
| Label DOM | `MasterTrack.tsx:221-223` — `<span className="master-track-lane__label">Master bus — effects &amp; automation only, no clips</span>` (permanent — Master track is undeletable) |

**Fix:**

```css
.master-track-lane__label {
  font-size: var(--cx-text-body);   /* was: 10px hardcoded — below the 11px floor */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
```

Resolve `TRACK_HEIGHT = 60` vs. CSS `76px` at execution time: either bump the constant to `76` to
match, or (if `60` is intentionally a different internal automation-overlay geometry) rename it away
from `TRACK_HEIGHT` and comment the intentional divergence — do not leave a same-named constant
silently disagreeing with the CSS it's meant to describe.

### 8b. `×` search-clear chip — zero CSS (symptom 4, Packet F)

| Fact | Value |
|---|---|
| Button DOM | `EffectBrowser.tsx:493` — `<button className="effect-search__clear" aria-label="Clear search">` |
| Matching CSS rules | **zero** — grepped `styles/*.css` for `effect-search__clear`, no selector exists; renders as raw OS button chrome |
| Parent container | `global.css:522-524` — `.effect-search { padding: 8px 12px; }`, no `display`/`flex` pairing for input+button |

**Fix:**

```css
.effect-search {
  display: flex;
  align-items: center;
  gap: var(--cx-space-6);
}

.effect-search__clear {
  width: 20px;
  height: 20px;
  background: var(--cx-surface-3);
  border: 1px solid var(--cx-line-1);
  border-radius: var(--cx-radius-control);
  color: var(--cx-text-2);
}

.effect-search__clear:hover {
  background: var(--cx-surface-4);
  color: var(--cx-text-1);
}
```

Dimensions match `.preview-canvas__popout-btn`'s existing icon-chip convention (reused, not
invented). Also: `global.css:579` `.effect-browser__tabs` (ends `padding: 0 6px 6px; margin-bottom:
2px;`) collides visually with `global.css:774` `.effect-browser__actions` (starts `padding: 0 12px
8px;`, no top padding) — add `padding-top: var(--cx-space-8)` to `.effect-browser__actions` so the
"+ Add Text Track" row reads as separated, not fused to the tab strip above it.

### 8c. Unanchored preview overlay chips (symptom 6, Packet G) — spec in §5

| Fact | Value |
|---|---|
| Render site | `PreviewCanvas.tsx:174-198` — popout-btn, canvas, fps chip, placeholder rendered as independent flat siblings |
| FPS chip | `global.css:1216-1230` — `position: absolute; top: 4px; left: 4px` |
| Popout button | `global.css:1201-1214` — `position: absolute; top: 4px; right: 4px` |

Full fix spec: §5 (`.preview-canvas__overlay-bar`). No component/class literally named "zoom pill"
exists in the codebase (grepped clean) — the two confirmed live candidates above are the actual
"unanchored floating chips" finding; `PreviewControls.tsx:52-85`'s lasso-mode icon buttons are
already in-flow (bottom control bar) and are NOT part of this fix.

### 8d. Transport control height misalignment (symptom 8, Packet G) — spec in §7

| Fact | Value |
|---|---|
| Transport bar (single mount site) | `global.css:34-47` — `.app__transport-bar { height: 32px; position: fixed; }`; confirmed single surface via `App.tsx:3674-3712`, no duplicate elsewhere |
| Button | `global.css:54-65` — no explicit `height` |
| BPM input | `global.css:92-101` — no explicit `height` |
| Quantize select | `global.css:109-117` — no explicit `height` |

Full fix spec: §7 (`--cx-control-h: 22px`).

---

## 9. Enforcement

### 9a. CI type-histogram guard (new — permanent, not a one-off diagnostic)

Mirrors the diagnostic method that found this change's symptoms, turned into a standing CI gate
(does not exist today — confirmed no prior histogram script in `frontend/scripts/`):

```bash
# frontend/scripts/type-histogram-guard.sh (new)
grep -ohE 'font-size:\s*[0-9.]+px' frontend/src/renderer/styles/*.css \
  | grep -oE '[0-9.]+' \
  | awk '$1 < 11 { fail=1; print } END { exit fail }'
```

- **Pass condition:** zero `font-size` declarations below `11px` (the `--cx-text-data` floor) across
  `frontend/src/renderer/styles/*.css`.
- **Scope:** repo-wide floor check (not just the 8 touched surfaces) — once Packet A ships the
  4-tier scale, no NEW sub-floor value should ever land, in this change's files or any other. This is
  stricter than plan.md's per-packet oracle (which only checked the 8 touched files); the CI gate
  should check everywhere since the floor is a global law (`DESIGN-SPEC.md:67`, "Floor: 11px. Nothing
  smaller, ever."), not a per-surface one.
- **Wire-up:** add as a step in the same CI job that runs `hex-ratchet.sh` (§9b) — both are
  token-governance gates over the same file glob, keep them adjacent.

### 9b. hex-ratchet (existing — unchanged mechanism, this change must not raise the ceiling)

`frontend/scripts/hex-ratchet.sh` (existing) counts raw hex literals in
`frontend/src/renderer/styles/*.css` excluding `tokens.css`; fails if count exceeds
`frontend/.hex-ceiling` (currently `9`). Every token this spec introduces (§1 weight tokens, §2 rail
component tokens, §3 spacing scale, §7 `--cx-control-h`) is a **primitive or semantic addition**,
never a new raw hex in a component file — this change should have zero hex-ratchet impact by
construction. If any packet's implementation finds it needs a literal hex not covered by an existing
token, it must add the color to `tokens.css` (Tier 1) and reference it, not hardcode it in the
component file — the ratchet gate will catch the violation either way.

### 9c. Calibration

- **Vitest per-touched-component snapshot** (plan.md Test Plan, Packet A): asserts no raw
  `font-size`/`font-weight` px literal remains in the touched selectors, only `var(--cx-text-*)` /
  `var(--cx-weight-*)`.
- **Tool-rail regression suite** (new file, `frontend/src/__tests__/tool-rail.test.tsx` — no prior
  file exists, confirmed by grep): icon `size` prop `=== 16`; hotkey badge resolves
  `--cx-text-data` and does not overlap the icon's bounding box for all 14 rail slots; group-label
  resolves `--cx-text-data`; `F_CREATRIX_LAYOUT` off → `.cx-preview-row` still `display: contents`
  (flag-off path regression guard, unrelated to this change's sizing).
- **Screenshot/pixel diff:** corroborating evidence only, never the sole pass/fail signal (mirrors
  wave0's "screenshot is human spot-check ONLY" convention) — the vitest suites above are the
  falsifiable oracle.
- **Mid-roadmap design review checkpoint** (T1, OD-5/6/7): these three sections (§5, §6, §7) are
  ACCEPTED PROVISIONALLY, not fully locked — a future checkpoint revisits them alongside OD-2. This
  spec's values are the current implementation target; do not treat §5–§7 as immune from revision at
  that checkpoint.

---

## Cross-reference index

| Section | Open Decision | Status | Packet(s) |
|---|---|---|---|
| §1 | OD-1 (type scale) | VISUAL-PENDING (dual A/B) | A |
| §2 | OD-3 (rail dims) | LOCKED (dims only; icons VISUAL-PENDING, separate mock deliverable) | B |
| §3 | — (new infra, not an OD) | — | A, B, C, D, E, F, G (shared) |
| §4 | OD-4 (empty states) | LOCKED (override: minimal hint, no CTA) | D |
| §5 | OD-5 (overlay bar) | LOCKED provisionally (mid-roadmap checkpoint) | G |
| §6 | OD-6 (automation clusters) | LOCKED provisionally (mid-roadmap checkpoint) | C |
| §7 | OD-7 (control height) | LOCKED provisionally (mid-roadmap checkpoint) | G |
| §8a | symptom 1 (clipped label) | LOCKED | E |
| §8b | symptom 4 (search chip) | LOCKED | F |
| §8c | symptom 6 (chip anchoring) | LOCKED (= §5) | G |
| §8d | symptom 8 (transport height) | LOCKED (= §7) | G |
| §9 | Definition of done — enforcement | LOCKED | all |
