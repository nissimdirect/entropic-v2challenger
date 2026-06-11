# Creatrix UX Audit — CDO Industry-15 (Desktop Software / Creative Tools)

**Date:** 2026-06-11 · **Auditor:** CDO lens (Industry-15 rules + anti-slop, `~/.claude/skills/cdo/references/`)
**Codebase:** `~/Development/entropic-v2challenger/` — audited against working tree on `docs/torn-edges-solutions` (3 modified files: `App.tsx`, `DeviceChain.tsx` [uncommitted F-0514-16 freeze work], `stores/freeze.ts`); all evidence cross-checked against `origin/main` where the working tree diverged.
**Design system source of truth:** `~/Development/entropic/docs/POP-CHAOS-DESIGN-SYSTEM.md` (735 lines, v1.0, full token tables) — **exists but is 0% wired into the app.** `~/Development/design-system/tokens.py` (362 lines) also exists. `~/Development/entropic-v2challenger/docs/POP-CHAOS-DESIGN-SYSTEM.md` does **not** exist (no copy in the app repo).
**PR-A boundary:** Findings here deliberately exclude PR-A's planned scope (layout shell + 4 drag handles, 5-tab browser, polymorphic inspector, hover-help, Ableton hotkeys, INJ-4 — `ROADMAP.md` Phase 3). Where a finding touches PR-A territory it is referenced, not duplicated.

---

## §1 Component inventory

90 files under `frontend/src/renderer/components/`, 17 stylesheets under `renderer/styles/` (~5,800 lines CSS). Styling is BEM vanilla CSS + 31 components with inline `style={{}}`.

**Global facts that set every row's baseline:**
- `:root` declares only **8 layout-dimension vars**, zero color/spacing/type tokens (`styles/global.css:7-16`).
- **866 hardcoded hex values** across the 17 stylesheets; `var(--` appears 9 times total (6 in global.css, 3 in timeline.css).
- ARIA attributes in **4 / 90** components (`Toast`, `PadCell`, `VolumeControl`, `RoutingLines`); `tabIndex` in 4 (`Knob`, `Slider`, `AutomationNode`, `PerformancePanel`).
- 31 × `outline: none` vs 17 `:focus`/`:focus-visible` replacement rules — net focus-visibility deficit.

| Surface | Components | Token compliance | A11y (Gate 6) | States coverage | Verdict |
|---|---|---|---|---|---|
| **Timeline** | Timeline, Track, Clip, TimeRuler, Playhead, LoopRegion, MarkerFlag, ContextMenu, SpeedDialog, ZoomScroll, TransformPanel, AudioTrack, AudioClipView | 3 vars / 116 hexes (timeline.css) | ContextMenu: Escape ✓ but no `role="menu"`, no arrow-nav, no focus mgmt; 5 `:focus` rules | hover ✓ (20 rules), selected ✓, disabled ✓ (clip--disabled); trim handles invisible until hover | 🟡 |
| **Device chain** | DeviceChain, DeviceCard, ABSwitch | 0 vars / 39 hexes (device-chain.css) | No ARIA; drag-drop target announces nothing | drag-over highlight ✓ (isDragOver), hover ✓ (5), bypass state ✓ | 🟡 |
| **Effect browser + params** | EffectBrowser, EffectCard, EffectRack, EffectSearch, ParamPanel, ParamSlider, ParamToggle, ParamChoice, ParamMix, HelpPanel, FreezeOverlay | 0 dedicated file; lives in global.css (6 vars / 331 hexes) | search `:focus` ✓, action-btn `:focus-visible` ✓; drag source has no keyboard equivalent announced | loading ✓ (`effect-browser--loading`, EffectBrowser.tsx:161), empty ✓ (`__empty`, :191), drag ✓ (EFFECT_DRAG_TYPE, origin/main EffectBrowser.tsx:13,167,208) | 🟡 |
| **Preview** | PreviewCanvas, PreviewControls, BoundingBoxOverlay, SnapGuides, PopOutPreview | global.css hexes | play-btn `:focus-visible` ✓; overlay is pointer-only (Escape handled, BoundingBoxOverlay.tsx:196-210) | Handles now visible w/ per-handle cursors ✓ (BoundingBoxOverlay.tsx:225-231 — post drag-end-suppress-click fix) | 🟢 |
| **Transport** | VolumeControl, Waveform, useWaveform | 0 vars / 14 hexes (transport.css) | VolumeControl has ARIA ✓ (1 of the 4 good citizens) | hover ✓ (3) | 🟢 |
| **Dialogs/modals** | CrashRecoveryDialog, FeedbackDialog, TelemetryConsentDialog, ExportDialog, ExportProgress, RenderQueue, PresetSaveDialog, Preferences, AboutDialog, ShortcutEditor | 0 vars / 41 hexes (export.css) + about.css, library.css | **No Escape-to-close, no focus trap, no `role="dialog"`/`aria-modal` in ANY dialog except ShortcutEditor** (only Escape hit: ShortcutEditor.tsx:28) | disabled ✓ (export.css 1), progress ✓ | 🔴 |
| **Context menus** | timeline/ContextMenu (shared by DeviceChain) | hardcoded `menuW=180`, `menuH=items*28` (ContextMenu.tsx:24-25) | Escape ✓, click-outside ✓; no `role`, no arrow keys, no typeahead, focus never moves into menu | disabled ✓, shortcut hint prop ✓ (issue #65 epic — 1 of 7 surfaces wired) | 🟡 |
| **Operators / ModulationMatrix** | LFOEditor, EnvelopeEditor, AudioFollowerEditor, StepSequencerEditor, VideoAnalyzerEditor, FusionEditor, ModulationMatrix, OperatorRack, RoutingLines | 0 vars / 83 hexes (operators.css — worst file) | RoutingLines has ARIA ✓; ModulationMatrix is a raw `<table>` (ModulationMatrix.tsx:51) with no caption/scope | empty ✓ (`mod-matrix--empty`, operators.css:343), hover ✓ (9), disabled ✓ (2) | 🟡 |
| **Performance / sampler / pads** | PadGrid, PadCell, PadEditor, PerformancePanel, MIDISettings, MIDILearnOverlay (+ B1 sampler UX in flight, PR #167) | 0 vars / 38 hexes (performance.css) | PadCell exemplary: `role="button"`, `aria-pressed`, `aria-label` w/ keybinding (PadCell.tsx:34-36) | hover ✓ (6), active/releasing ✓ | 🟢 |
| **Automation lanes** | AutomationLane, AutomationNode, AutomationDraw, AutomationToolbar, CurveSegment | 0 vars / 33 hexes (automation.css) | AutomationNode keyboard-focusable ✓ but no slider semantics | **node hit target = r 4-6px circle** (AutomationNode.tsx:105) — far below 24px minimum; disabled ✓ (3) | 🟡 |
| **Toasts/notifications** | Toast, Tooltip, ParamTooltip | LEVEL_COLORS hardcoded in TSX (Toast.tsx:5-10) + 13 hexes (toast.css) | `role="log"`, `role="alert"`, `aria-live` tiered by severity ✓ (Toast.tsx:26-33) — best-in-app | dedup count ✓, action ✓, details ✓ | 🟢 |
| **Common controls** | Knob, Slider, NumberInput, ParamLabel | stroke colors hardcoded in SVG (Knob.tsx:215 `stroke="#444"`) | `tabIndex={0}` + `onKeyDown` ✓ (Knob.tsx:201,207; Slider.tsx:118,123) but **no `role="slider"`, no `aria-valuenow/min/max`** — invisible to AT; `:focus-visible` rings ✓ (global.css:1502,1581) | hover/drag/double-click-reset/wheel ✓; Knob SIZE=40px hit ✓ | 🟡 |
| **Library** | PresetBrowser, PresetCard, PresetSaveDialog, MacroKnob | 0 vars / 62 hexes (library.css) | 2 `:focus` rules; PresetCard drag (`application/entropic-preset`, PresetCard.tsx:21) has no keyboard path | hover ✓ (9), disabled ✓ | 🟡 |
| **Layout shell / misc** | WelcomeScreen, HistoryPanel, UpdateBanner, ErrorBoundary, DropZone, FileDialog, IngestProgress, TextPanel, TextOverlay | welcome.css, update-banner.css, error-boundary.css, text.css — 0 vars | text.css 3 `:focus` | ErrorBoundary ✓, drop-zone states ✓, ingest progress ✓ | 🟢 |

**Aggregate verdict: 🟡.** Interaction logic is mature (the May UAT campaign shows in drag-over guards, F-0512-9 propagation fixes, visible bounding-box handles). The systemic debt is (a) zero design-token adoption against a fully-specified design system, (b) dialog keyboard/AT accessibility, (c) sub-minimum hit targets on precision surfaces.

---

## §2 Top 10 highest-impact UX improvements

1. **Zero design-token adoption; 866 hardcoded hexes against a complete, shipped token spec.** `:root` has 8 layout vars and no color/type/spacing tokens (`frontend/src/renderer/styles/global.css:7-16`); Pop Chaos defines ~40 color tokens that nothing imports. Every future reskin/theming/PR-A styling decision compounds this. **Fix:** §4 consolidation (packet PUX.1). **Effort: M** (mechanical, scriptable).

2. **Three-palette identity conflict.** Implementation: Tailwind green `#4ade80` ×125 + `#ef4444` on flat `#1a1a1a` ×54. `docs/UX-SPEC.md` §1.1: accent "electric purple `#a855f7`" — ×2 in CSS. Pop Chaos: Signal Red `#ff2d2d` primary on `#0a0a0b` blue-undertone voids — ×0. The brand the design system argues for (CRT phosphor, warning-light red) is absent from the product; the actual palette reads generic-Tailwind-dark. Anti-slop I15 + Pop Chaos both prohibit pure-neutral gray (`#1a1a1a`, plus ~520 neutral grays: `#444` ×113, `#333` ×102, `#888` ×75, `#555`/`#666` ×62…). **Fix:** decide palette at token-definition time in PUX.1 (recommend Pop Chaos as written; UX-SPEC §1.1 should be amended); semantic aliases make the swap one-line-per-role. **Effort: S** (decision) + absorbed by PUX.1.

3. **No dialog Escape/focus-trap/ARIA-modal anywhere.** 10 modal-ish surfaces; only `ShortcutEditor.tsx:28` handles Escape (and that's to cancel capture, not close). `grep -rn "Escape" components/dialogs components/export components/library components/layout` → 1 hit. No `role="dialog"`, no `aria-modal`, no focus trap, no initial-focus, no return-focus. Industry-15 Gate 6 hard fail; also a power-user speed fail (Escape is muscle memory in every DAW). **Fix:** PUX.2 shared `useModalBehavior` hook. **Effort: M**.

4. **Custom controls invisible to assistive tech.** Knob/Slider are keyboard-operable (`Knob.tsx:201-207`, `Slider.tsx:118-123`) but expose no `role="slider"`, `aria-valuenow/min/max/valuetext`, `aria-orientation`. Every effect parameter in the app flows through these two components — the highest-leverage ARIA fix possible per line of code. PadCell (`PadCell.tsx:34-36`) is the in-repo gold standard to copy. **Fix:** PUX.4. **Effort: S**.

5. **31 × `outline: none` vs 17 focus replacement rules.** At least 14 interactive selectors kill the focus ring and provide nothing back (`global.css:481,886,923,971,1202,1247,1372,1494,1522,1578`, …). Tab-navigation goes invisible mid-flow. Industry-15 rule 12 prescribes the accent focus ring (`box-shadow: 0 0 0 2px var(--color-accent)`). **Fix:** PUX.3 systematic sweep. **Effort: S**.

6. **Automation node hit target is an 8-12px circle.** `AutomationNode.tsx:105` — `r={isDragging ? 6 : 4}`, no invisible hit-area circle behind it. WCAG 2.5.8 minimum is 24×24; precision-drag surfaces (Ableton breakpoints, AE keyframes) ship ~16-20px invisible targets around small glyphs. Misses cause accidental lane-click node *creation* — destructive miss penalty. **Fix:** PUX.5 transparent hit `<circle r={10}>` + pointer-capture. **Effort: S**.

7. **Clip trim handles: 6px wide, invisible at rest.** `timeline.css:686-705` — 6px strip whose only resting signifier is a 1px 30%-alpha border; background appears only on `:hover`. This is the exact signifier-discipline failure class behind the prior invisible-handle complaints and the drag-end-suppresses-click history (`memory/feedback_drag-end-suppress-click.md`: "render visible handles, not cursor-only signifiers"). **Fix:** PUX.5 — widen to 8px, render visible grip bars when clip is selected. **Effort: S**.

8. **ContextMenu has no keyboard model.** `ContextMenu.tsx:30-43` — Escape and click-outside only; no arrow-key traversal, no Home/End, no typeahead, no `role="menu"/menuitem"`, focus never enters the menu (items unreachable by Tab order since focus stays on the trigger surface). I15 rule 8: "80%+ of power-user actions live in context menus." One shared component fixes timeline clips, track headers, AND device chain (it's imported by `DeviceChain.tsx`). Note: *contents* of menus (shortcut hints) belong to issue #65 — out of scope here; this is the container's interaction model. **Fix:** PUX.4. **Effort: S**.

9. **Typography scale is 13 ad-hoc sizes (7px-48px), 23 instances ≤ 9px.** Distribution: 11px ×74, 12px ×64, 10px ×59, 13px ×24, 9px ×15, 14px ×14, 8px ×6, 7px ×2… I15 prescribes 11-13px workspace body with 12-13px base; 7-9px is below legibility floor even for pro density, and the spread guarantees adjacent panels disagree (e.g. operators vs automation labels). **Fix:** type-scale tokens in PUX.1 (`--text-xs: 10px → --text-lg: 14px` + display sizes), clamp everything ≤9px up to 10px. **Effort: S** (within PUX.1).

10. **Motion timing is unsystematic.** Transitions: `0.15s` ×30, `0.2s` ×11, `0.1s` ×4, `150ms` ×3, `0.3s` ×3, `200ms` ×1 — mixed units, no tokens, and 0.3s exceeds the I15 ceiling ("panel open/close 150ms; hover 80ms; no decorative animation"). Also `Toast.tsx:5-10` hardcodes level colors in TSX, bypassing CSS entirely — same class of drift. **Fix:** `--duration-fast/--duration-panel` tokens in PUX.1; cap at 200ms. **Effort: S** (within PUX.1).

**Explicitly NOT duplicated from PR-A** (reference `ROADMAP.md` Phase 3 / Gap G2): effects-panel 35vh height cap (`global.css:1111`, F-0512-36 / upcoming-ux-items #3), left-column width + track↔preview alignment (upcoming-ux-items #2, F-0512-11), browser tabs/inspector states, hover-help system, Ableton-style hotkey pass, hotkey-discoverability epic surfaces (issue #65). PUX packets below are sequenced to land *before* PR-A so PR-A builds on tokens + a11y primitives instead of retrofitting them.

---

## §3 One-shottable packets

Common contract: all branches cut from `origin/main` of `nissimdirect/entropic-v2challenger`. Test baseline: `cd frontend && npx --no vitest run` must stay at the current pass rate (1,814/1,818 per ROADMAP §0; re-snapshot in preconditions). All CSS proposed obeys anti-slop: no blacklist fonts (stack stays JetBrains Mono + system UI), no pure gray (every neutral carries the Pop Chaos blue-violet undertone), no dual-layer decorative shadows (I15 rule 12 shadows only).

---

### PUX.1 — Design-token foundation (three-tier) + palette decision
- **ID:** PUX.1 · **branch:** `ux/pux-1-design-tokens` · **base:** `origin/main` · **depends-on:** none (FIRST — everything else consumes it)
- **Goal:** Create `frontend/src/renderer/styles/tokens.css` implementing Pop Chaos as a three-tier system (Tier 1 primitives → Tier 2 semantic → Tier 3 component), import it first in `global.css`, and migrate the top-20 most-repeated hex values to semantic vars. NOT a full 866-hex migration (that's incremental follow-up); this packet establishes governance + kills the head of the distribution (~620 of 866 instances).
- **PRECONDITIONS (mismatch → STOP):**
  - `grep -c "var(--" frontend/src/renderer/styles/global.css` → expect ~6-10 (if ≫, someone already started tokens; reconcile first)
  - `grep -n ":root" frontend/src/renderer/styles/global.css` → expect single hit near line 7
  - `test -f ~/Development/entropic/docs/POP-CHAOS-DESIGN-SYSTEM.md && echo OK` → OK
  - `git log --oneline origin/main -1` and record SHA in PR body
- **Scope (verified paths):** `frontend/src/renderer/styles/tokens.css` (new), `frontend/src/renderer/styles/global.css`, `frontend/src/renderer/styles/timeline.css`, `frontend/src/renderer/styles/operators.css`, `frontend/src/renderer/styles/library.css`, `frontend/src/renderer/components/common/Toast.tsx` (LEVEL_COLORS → CSS classes), `docs/UX-SPEC.md` §1.1 (amend accent decision)
- **DO-NOT-TOUCH:** component TSX other than Toast.tsx; any layout rules (grid-template, heights — PR-A territory); `backend/**`; the 8 existing layout vars (keep names, relocate into tokens.css unchanged)
- **Steps:**
  1. Tier 1: transcribe Pop Chaos color tables (§2 of the spec) as `--pc-*` primitives; add type scale (`--text-2xs:10px … --text-xl:16px`, display 28/32/48), spacing (4px base: `--space-1..6`), durations (`--duration-hover:80ms`, `--duration-fast:150ms`, `--duration-panel:200ms`), radii (`--radius-sm:2px`, `--radius:4px`, `--radius-panel:6px`).
  2. Tier 2 semantic: `--bg-app`, `--bg-panel`, `--bg-raised`, `--bg-hover`, `--bg-active`, `--text-primary`, `--text-muted`, `--accent`, `--accent-hover`, `--danger`, `--warn`, `--focus-ring`. **Palette decision implemented here:** map `--accent` per user's call (recommend Pop Chaos `--red-core`; current `#4ade80` maps to `--green-phosphor` for "system active" roles only). If user defers, map `--accent: #4ade80` — semantic layer makes the later swap trivial.
  3. Tier 3: component aliases only where a surface needs an override (e.g. `--clip-selected-border`).
  4. Script the migration: `python3` one-off replacing exact-match top-20 hexes (`#1a1a1a`→`var(--bg-app)`, `#444`→`var(--border)` etc.) across the 17 CSS files; hand-review diff for false positives (e.g. `#444` as SVG stroke stays in TSX for now).
  5. Replace `Toast.tsx:5-10` LEVEL_COLORS with `toast--{level}` CSS modifier classes.
  6. Amend `docs/UX-SPEC.md:14-17` to record the accent decision and point at tokens.css as source of truth.
- **TEST PLAN:** `cd frontend && npx --no vitest run` (no regressions vs precondition snapshot) · `npx playwright test` smoke · `grep -rhoE '#1a1a1a|#4ade80(?![0-9a-f])' src/renderer/styles | wc -l` → 0 in styles · visual: launch `npm start`, screenshot timeline/browser/dialogs, compare against pre-branch screenshots — pixel-identical if palette decision deferred, intentional-diff-only otherwise.
- **ACCEPTANCE GATES:** tokens.css exists with 3 documented tiers; `grep -c "var(--" styles/*.css` total ≥ 400; zero `#1a1a1a` literals remain in styles/; vitest green; no layout rule diffs (`git diff` contains no `grid-template|height:|width:` line changes except var substitutions).
- **ROLLBACK:** revert single PR; tokens.css is additive, migrations are find-replace — `git revert <sha>` is clean.
- **EVIDENCE:** before/after `grep -c` counts per file in PR body; screenshot pair per surface.
- **Effort:** ~4h.

---

### PUX.2 — Dialog accessibility: Escape, focus trap, ARIA-modal
- **ID:** PUX.2 · **branch:** `ux/pux-2-dialog-a11y` · **base:** `origin/main` · **depends-on:** none (parallel-safe with PUX.1)
- **Goal:** One shared `useModalBehavior(ref, onClose)` hook (Escape-to-close, focus trap, initial focus, return-focus-on-close) + `role="dialog" aria-modal="true" aria-labelledby` applied to all 8 true modals.
- **PRECONDITIONS (mismatch → STOP):**
  - `grep -rln "Escape" frontend/src/renderer/components/dialogs frontend/src/renderer/components/export frontend/src/renderer/components/library frontend/src/renderer/components/layout` → expect ONLY `layout/ShortcutEditor.tsx` (if more hits, partial fix landed; audit before proceeding)
  - `grep -rn "aria-modal" frontend/src/renderer/components | wc -l` → expect 0
  - `ls frontend/src/renderer/components/dialogs/` → expect exactly `CrashRecoveryDialog.tsx FeedbackDialog.tsx TelemetryConsentDialog.tsx`
- **Scope (verified paths):** new `frontend/src/renderer/hooks/useModalBehavior.ts`; `components/dialogs/{CrashRecoveryDialog,FeedbackDialog,TelemetryConsentDialog}.tsx`; `components/export/ExportDialog.tsx`; `components/library/PresetSaveDialog.tsx`; `components/layout/{Preferences,AboutDialog}.tsx`; `components/timeline/SpeedDialog.tsx`; matching Vitest specs
- **DO-NOT-TOUCH:** dialog visual styling; `ExportProgress`/`RenderQueue`/`UpdateBanner` (non-modal); `ShortcutEditor` capture logic (its Escape semantics are intentional — wrap carefully or exclude); store logic
- **Steps:** build hook (keydown Escape → onClose unless a nested capture is active; trap Tab/Shift-Tab within `ref`; focus first `[autofocus]` or first focusable on mount; restore `document.activeElement` on unmount) → apply per dialog → exempt destructive-confirm dialogs from Escape only where data-loss ambiguity exists (CrashRecovery: Escape = "Dismiss", the safe path).
- **TEST PLAN:** new Vitest specs per dialog: renders with `role="dialog"`; `fireEvent.keyDown(Escape)` calls onClose; Tab from last element wraps to first. `cd frontend && npx --no vitest run`. Manual: open each dialog, Escape closes, focus returns to trigger.
- **ACCEPTANCE GATES:** 8/8 dialogs pass the 3 new spec assertions; zero regressions; `grep -rln "aria-modal" components | wc -l` = 8.
- **ROLLBACK:** revert PR; hook is new file, per-dialog diffs are ≤15 lines each.
- **EVIDENCE:** vitest output; short screen recording of Escape/Tab-wrap on ExportDialog.
- **Effort:** ~3h.

---

### PUX.3 — Focus-visible restoration sweep
- **ID:** PUX.3 · **branch:** `ux/pux-3-focus-visible` · **base:** `origin/main` · **depends-on:** PUX.1 (uses `--focus-ring`; if PUX.1 unmerged, use literal and leave `TODO(PUX.1)`)
- **Goal:** Every `outline: none` either gains a paired `:focus-visible` rule (`box-shadow: 0 0 0 2px var(--focus-ring)` per I15 rule 12) or is deleted.
- **PRECONDITIONS:** `grep -rn "outline: *none" frontend/src/renderer/styles | wc -l` → expect ~31 · `grep -rn "focus-visible" frontend/src/renderer/styles | wc -l` → expect ~7. Mismatch ≫ → partial fix landed, STOP and re-audit.
- **Scope:** `frontend/src/renderer/styles/*.css` only (rule additions; no selector renames)
- **DO-NOT-TOUCH:** TSX files; tab-order/tabIndex (PUX.4); `.knob__svg`/`.hslider__track` (already correct — global.css:1502,1581, use as the pattern)
- **Steps:** enumerate all 31 sites → classify (text input → `:focus` border tint, like `effect-search__input:focus` global.css:484; button/control → `:focus-visible` ring) → add rules adjacent to each `outline: none`.
- **TEST PLAN:** `npx --no vitest run` · manual: Tab through transport → browser → params → timeline; focus visibly tracks at every stop; screenshot 5 focal stops.
- **ACCEPTANCE GATES:** `grep -c` count of `:focus-visible` + `:focus` rules ≥ count of `outline: none`; keyboard walk shows no invisible stop.
- **ROLLBACK:** revert; purely additive CSS.
- **EVIDENCE:** before/after grep counts; focal-stop screenshots.
- **Effort:** ~2h.

---

### PUX.4 — Control & menu semantics (slider ARIA + menu keyboard model)
- **ID:** PUX.4 · **branch:** `ux/pux-4-control-semantics` · **base:** `origin/main` · **depends-on:** none
- **Goal:** (a) `role="slider"` + `aria-valuemin/max/now/valuetext` + `aria-label` on Knob and Slider; (b) ContextMenu gets `role="menu"`/`menuitem`, focus moves to first item on open, ArrowUp/Down/Home/End traversal, Enter activates, focus returns to invoker on close.
- **PRECONDITIONS:** `grep -n 'role="slider"' frontend/src/renderer/components/common/Knob.tsx frontend/src/renderer/components/common/Slider.tsx` → 0 hits · `grep -n 'role="menu"' frontend/src/renderer/components/timeline/ContextMenu.tsx` → 0 hits · `grep -n "tabIndex={0}" frontend/src/renderer/components/common/Knob.tsx` → 1 hit ~line 201
- **Scope (verified):** `components/common/Knob.tsx`, `components/common/Slider.tsx`, `components/timeline/ContextMenu.tsx` (+ its consumers compile-check only: Track/Clip/DeviceChain import it), Vitest specs
- **DO-NOT-TOUCH:** pointer-drag math in Knob/Slider; F-0512-9 stopPropagation logic in ContextMenu.tsx:60-73 (regression-tested bug fix — preserve verbatim); menu item *contents*/shortcut hints (issue #65 scope)
- **Steps:** Knob/Slider — attributes on the existing focusable SVG/track element, `aria-valuetext` from existing display-format fn, update `aria-valuenow` in the same setState path as the visual; ContextMenu — `useRef` roving index, keydown switch, `requestAnimationFrame` initial focus, restore focus in the existing `onClose` cleanup.
- **TEST PLAN:** Vitest: keyboard arrow on Knob changes `aria-valuenow`; ContextMenu ArrowDown moves `document.activeElement`; Enter fires `item.action` exactly once and closes; Escape still closes; disabled items skipped. Full `npx --no vitest run`. Manual: VoiceOver announces "slider, 50 of 100" on a param knob.
- **ACCEPTANCE GATES:** all new specs green; F-0512-9 regression test (playhead does not move after Split-at-Playhead via menu) still green; zero visual diffs.
- **ROLLBACK:** revert; 3 files.
- **EVIDENCE:** vitest output; VoiceOver screen recording (10s).
- **Effort:** ~3.5h.

---

### PUX.5 — Hit targets & drag signifiers (timeline + automation)
- **ID:** PUX.5 · **branch:** `ux/pux-5-hit-targets` · **base:** `origin/main` · **depends-on:** PUX.1 preferred (token colors), not required
- **Goal:** (a) AutomationNode: invisible hit circle `r=10` behind visible `r=4-6` glyph, pointer events on the hit circle; (b) clip trim handles: width 6→8px and a *visible at-rest* grip (2×10px bars) whenever the clip is selected — signifier instead of cursor-only affordance; (c) sweep all <24px interactive targets found in §1 (12-14px icon buttons) to ≥24px hit areas via padding/pseudo-element, visuals unchanged.
- **PRECONDITIONS:** `grep -n "r={isDragging ? 6 : 4}" frontend/src/renderer/components/automation/AutomationNode.tsx` → 1 hit ~line 105 · `grep -n "width: 6px" frontend/src/renderer/styles/timeline.css` → 1 hit ~line 690 · confirm PR #109 (timeline drag-reorder) merge status: `gh pr view 109 --json state` — if merged, re-verify Clip.tsx line numbers before editing
- **Scope (verified):** `components/automation/AutomationNode.tsx`, `styles/timeline.css` (`.clip__trim-handle*` block :686-705), `styles/automation.css`, targeted touch-ups in `styles/operators.css`/`performance.css` for <24px buttons
- **DO-NOT-TOUCH:** `Clip.tsx` drag logic (PR #109 owns drag-reorder; trim-handle guard at Clip.tsx:154-155 must keep matching the className); BoundingBoxOverlay (already fixed); anything PR-A layout
- **Steps:** hit-circle pattern from established libs (per RULE 1.5: react-moveable renders enlarged transparent hit areas around visual handles — cite in code comment) → trim-handle grip bars shown under `.clip--selected` → audit pass with a 24px ruler over §1's small-element list.
- **TEST PLAN:** Vitest: pointer event at (node.x+8, node.y) starts node drag (previously missed). E2E: existing Playwright timeline specs green. Manual chaos pass: rapid trim-drag → release → click clip body — no deselect regression (`memory/feedback_drag-end-suppress-click.md` scenario).
- **ACCEPTANCE GATES:** automation node draggable from 20px ring in test; trim grip visible in selected-clip screenshot; vitest+playwright green.
- **ROLLBACK:** revert; CSS + one TSX.
- **EVIDENCE:** before/after screenshots of selected clip + automation lane; test output.
- **Effort:** ~3h.

---

### PUX.6 — LIVE visual pass protocol (computer-use, run during campaign)
- **ID:** PUX.6 · **branch:** none (no code) — produces `docs/roadmap/packets/ux-visual-pass-results.md` · **base:** n/a · **depends-on:** schedule AFTER PUX.1-5 merge (validates them) and BEFORE PR-A starts (baseline for redesign)
- **Goal:** Ground-truth the static audit with the running app: screenshot every surface, run anti-slop + Gate 6 contrast checks on real pixels, file deltas as 🐛 items.
- **PRECONDITIONS:** `ps aux | grep -i electron | grep -i creatrix` — note the running binary's path and confirm it is the worktree you intend to audit (Live Runtime Check / Gate 18; `entropic-v2-uat` worktree hazard) · `cd ~/Development/entropic-v2challenger/frontend && npm start` boots clean · computer-use access granted for "Electron" at full tier (per `memory/visual-uat-entropic.md`)
- **Protocol steps (≤4h):**
  1. Launch app, import a test clip (fixtures in repo), build a 3-effect chain, add 1 LFO operator, 1 automation lane, open Performance panel.
  2. Screenshot inventory — one per §1 surface row (14 shots) + each dialog (8) + context menus open (3) + drag-in-progress states (trim, node, effect-drag-over-DeviceChain).
  3. **Anti-slop I15 checklist per shot:** no marketing-layout intrusions; workspace stays dark; no consumer-sized type in panels; destructive actions confirm; no pill buttons; panels resizable.
  4. **Gate 6 contrast:** sample (screenshot eyedropper) text/bg pairs on: muted labels (`#888` on `#1a1a1a` ≈ 4.6:1 — borderline at 10px, FAIL under 4.5:1 if any darker pairing exists), disabled states, green-on-dark accents, toast text. Record ratio per pair; flag < 4.5:1 (normal) / < 3:1 (large).
  5. **Signifier walk:** without hovering, can you SEE where to trim, drag, resize, reorder on each surface? Record per surface.
  6. Keyboard-only circuit: Tab/Shift-Tab full loop, operate one knob, open+navigate one context menu (validates PUX.2-4 live).
  7. File results doc: per-surface verdict, contrast table, 🐛 list (binary statuses only — no 🟡, per `feedback_no-yellows-binary-verdicts.md`).
- **TEST PLAN:** the protocol IS the test; deliverable = results doc + 25+ screenshots in `docs/roadmap/packets/visual-pass-shots/`.
- **ACCEPTANCE GATES:** all 14 surfaces shot; ≥10 contrast pairs measured; every PUX.1-5 acceptance gate re-verified on live pixels.
- **ROLLBACK:** n/a (read-only).
- **EVIDENCE:** results doc + screenshot dir.
- **Effort:** ~3-4h.

**Suggested order:** PUX.1 → (PUX.2 ∥ PUX.3 ∥ PUX.4) → PUX.5 → PUX.6 → then PR-A (Phase 3) starts on a tokenized, accessible base.

---

## §4 Design-token consolidation (governance) — justification & model

**Verdict: required.** 866 hardcoded hexes / 9 `var()` usages = 1% token adoption against a fully-written design system. This is the single largest UX-debt item and it taxes every styling change, including all of PR-A.

**Three-tier governance (per Curtis):**

| Tier | Contents | Who may add | Where |
|---|---|---|---|
| **1 — Primitives** | Raw Pop Chaos values: `--pc-red-core: #ff2d2d`, `--pc-bg-darkest: #0a0a0b`, type/spacing/duration/radius scales | Design-system changes only (Pop Chaos doc PR first, tokens.css second) | `tokens.css` top block |
| **2 — Semantic** | Role aliases: `--accent`, `--bg-panel`, `--text-muted`, `--danger`, `--focus-ring` — every component consumes THIS tier | Reviewed PR; must alias a Tier-1 primitive, never a literal | `tokens.css` second block |
| **3 — Component** | Scoped overrides: `--clip-selected-border`, `--pad-active-glow` | Component author, in component CSS file, must alias Tier 2 | per-surface CSS files |

**Enforcement (cheap, mechanical):** add a lint step to CI — `grep -rE '#[0-9a-fA-F]{3,8}' frontend/src/renderer/styles --include='*.css' | grep -v tokens.css` must trend monotonically down; hard-fail on new hex literals in changed lines (diff-aware grep in the merge-gate workflow). Inline `style={{}}` color literals in TSX (31 files) are Phase-2 cleanup, same rule.

**Migration economics:** top-20 hexes cover ~620/866 instances (`#4ade80` ×125, `#444` ×113, `#333` ×102, `#888` ×75, `#e0e0e0` ×61, `#1a1a1a` ×54, …) — PUX.1 captures 72% of the debt in one scripted pass; the tail migrates opportunistically under the CI ratchet.

**Anti-slop compliance of the proposed tokens:** Pop Chaos neutrals all carry the blue-violet undertone (`#0a0a0b`, `#111114`, `#222228` — third channel high) — no pure gray survives migration. Shadows restricted to I15 rule-12 forms (single-purpose elevation + focus ring; no dual-layer decorative). Fonts unchanged (JetBrains Mono + system UI — no blacklist fonts introduced).

---

## Appendix — evidence index

| Claim | Evidence |
|---|---|
| 8 layout-only root vars | `frontend/src/renderer/styles/global.css:7-16` |
| 866 hexes / 9 vars | per-file counts: global 331/6, timeline 116/3, operators 83/0, library 62/0, export 41/0, device-chain 39/0, text 39/0, performance 38/0, automation 33/0, … |
| Dialog Escape gap | grep "Escape" across dialogs/export/library/layout → only `ShortcutEditor.tsx:28` |
| ARIA: 4/90 components | `Toast.tsx:26-33`, `PadCell.tsx:34-36`, `VolumeControl.tsx`, `RoutingLines.tsx` |
| Knob/Slider keyboard-yes ARIA-no | `Knob.tsx:201,207`, `Slider.tsx:118,123`; no `role="slider"` anywhere |
| outline:none ×31 vs focus rules ×17 | global.css:481,886,923,971,1202,1247,1372,1494,1522,1578…; focus list global.css:484-2384, timeline.css:320-911 |
| Automation node r=4 | `AutomationNode.tsx:105` |
| Trim handle 6px hover-only | `timeline.css:686-705` |
| ContextMenu no keyboard model | `ContextMenu.tsx:24-43` (also F-0512-9 fix comment :60-73) |
| Type scatter 7-48px, ≤9px ×23 | font-size histogram across styles/ |
| Palette conflict | `#4ade80` ×125 vs UX-SPEC.md §1.1 `#a855f7` (×2 in CSS) vs Pop Chaos `--red-core` (×0); `#1a1a1a` ×54 |
| Effect drag exists (browser→chain) | origin/main `EffectBrowser.tsx:13,167,208`; `DeviceChain.tsx:60,76` |
| 35vh cap = PR-A scope | `global.css:1111` (F-0512-36); `docs/plans/2026-05-14-upcoming-ux-items.md` #3; ROADMAP Phase 3 |
| BoundingBox handles fixed | `BoundingBoxOverlay.tsx:225-231` (per-handle cursors, visible) |
| Transition scatter | 0.15s ×30, 0.2s ×11, 0.1s ×4, 150ms ×3, 0.3s ×3, 200ms ×1 |
