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

Common contract: all branches cut from `origin/main` of `nissimdirect/entropic-v2challenger`. Test baseline: `cd frontend && npx --no vitest run` must stay at the current pass rate (1,814/1,818 per ROADMAP §0; re-snapshot in preconditions). **Design source of truth: `docs/roadmap/DESIGN-SPEC.md` v1.1 "Live Signal"** (canonical per its own header — supersedes Pop Chaos v1.0, UX-SPEC purple, and the incumbent Tailwind green). All CSS proposed obeys anti-slop AND the spec: no blacklist fonts, neutrals carry the hue-285 cold cast (`#0B0B10`…`#282834` ladder — no pure gray), shadows only on floating layers (DESIGN-SPEC §4), chroma budget ≤1 saturated element per region at rest (§1).

**Anchor re-verification (2026-06-11, `origin/main` @ `d821ae8`):** all file:line anchors in the packets below were re-checked via `git grep`/`git show` against `origin/main`. Numbers that drifted since the §1 working-tree audit — use THESE in preconditions: **895 hex literals across 19 stylesheets** (was 866/17 — `instruments.css`, `floating-panel.css`, `common-tooltip.css` landed since), `#4ade80` ×128, `#1a1a1a` ×56, global.css 326 hexes, 88 `.tsx` components, `var(--` total still 9 (global 6 + timeline 3), `outline: none` still ×31, `:focus-visible` ×7. New since audit: `dialogs/UnsavedChangesDialog.tsx` (4th file in dialogs/) and `SpeedDialog.tsx:59` now handles Escape. §1/§2 narrative retains the audit-day numbers; packet preconditions below are the ground truth.

---

### PUX.1 — Design-token foundation: implement "Live Signal" (DESIGN-SPEC v1.1) + hex-ratchet CI
- **ID:** PUX.1 · **branch:** `ux/pux-1-design-tokens` · **base:** `origin/main` · **depends-on:** `docs/roadmap/DESIGN-SPEC.md` readable (NOT yet on `origin/main` — verified absent at d821ae8; read it from `origin/docs/consolidated-roadmap-2026-06-11` until the docs PR merges). FIRST packet — everything else consumes it.
- **Model:** Sonnet. **No USER-TOUCH remains:** the palette decision is LOCKED by DESIGN-SPEC v1.1 §0-§2 (ACID/MOD/RED/AMBER; Pop Chaos v1.0, UX-SPEC purple `#a855f7`, and incumbent Tailwind green are all retired by that spec). Do not re-litigate it.
- **Goal:** Create `frontend/src/renderer/styles/tokens.css` implementing **Live Signal** (DESIGN-SPEC §2/§3/§4/§5) as a three-tier system (Tier 1 `--cx-*` primitives → Tier 2 semantic → Tier 3 component), import it first in `global.css`, migrate the **top-20 hexes (830 of 895 instances = 93%, verified distribution below)**, and land the **hex-ratchet CI gate**. NOT a full 895-hex migration; the ~65-instance tail burns down under the ratchet.
- **Token set (transcribe EXACTLY from DESIGN-SPEC §2 — do not invent or "improve" values):**
  - **Surface ladder:** `--cx-surface-0 #0B0B10` (preview surround/void) · `--cx-surface-1 #121218` (app bg) · `--cx-surface-2 #18181F` (panels/timeline bed) · `--cx-surface-3 #20202A` (devices/cards/inputs) · `--cx-surface-4 #282834` (hover/overlays/menus) · `--cx-line-1 #2E2E3A` · `--cx-line-2 #3C3C4C`. Elevation = lightness, not shadows.
  - **Text:** `--cx-text-1 #E7E7EC` · `--cx-text-2 #9A9AA6` · `--cx-text-3 #80808E` (hint/placeholder — 4.8:1 on surface-1, AA) · `--cx-text-disabled #62626E` (**disabled states ONLY, never hints** — the §9 split; old `#62626E`-as-hint was a 3.1:1 FAIL).
  - **Accents** (core/hover/pressed/wash/on-color, all five per family): **ACID** `#C8F321` / `#D9FF4D` / `#A4C916` / `rgba(200,243,33,.10)` / on `#0B0B10` · **MOD** `#8F7DFF` / `#A693FF` / `#7361D6` / `rgba(143,125,255,.12)` / on `#0B0B10` · **RED** text/icon `#E5484D`, **fill `#C13B40`** (white-on-fill 5.3:1 AA; never white text on `#E5484D` — 3.9:1 FAIL), hover `#F2555A`/`#D24449`, pressed `#B53A3E`, wash `rgba(229,72,77,.12)` · **AMBER** `#D9A23C` / `#E8B453` / `#B28430` / `rgba(217,162,60,.12)` / on `#0B0B10`. Success = ACID (no separate green). No magenta, no cyan, no second green.
  - **Category ticks** (3px left-tick only, never fill/text): glitch `#D06A6A` · distortion `#9A8BE8` · color `#5FB8C4` · temporal `#D4A865` · modulation `#AFCB52` · texture `#8E8E9A` · enhance `#C9C9D2` · destruction `#C77DC0`.
  - **Type tokens** (§3): `--cx-text-body: 12.5px`/wt 450 · `--cx-text-label: 12px`/wt 550 · `--cx-text-data: 11px` mono `tabular-nums` · **floor 11px** (clamps the verified 23 instances of 7-9px). `--cx-font-ui`/`--cx-font-mono` alias the CURRENT stacks this packet; the IBM Plex swap is a separate follow-up packet (font asset bundling is out of 4h scope) — leave `/* TODO(plex-swap) */`.
  - **Motion** (§5): `--cx-ease: cubic-bezier(0.2, 0, 0, 1)` · `--cx-dur-feedback: 120ms` · `--cx-dur-entry: 180ms` · `--cx-dur-exit: 140ms` (caps the verified 0.3s outliers). **Radii** (§4): `--cx-radius-control: 2px` / `--cx-radius-card: 4px` / `--cx-radius-dialog: 6px`. **Density** (§8, declared now, consumed by PR-A): `--cx-row-h: 24px` · `--cx-panel-header: 28px` · `--cx-device-param-h: 18px`.
- **PRECONDITIONS (mismatch → STOP and re-baseline in PR body, do not improvise):**
  - `git show origin/docs/consolidated-roadmap-2026-06-11:docs/roadmap/DESIGN-SPEC.md | head -3` → header contains `"Live Signal"` (or `test -f docs/roadmap/DESIGN-SPEC.md` if the docs PR has merged)
  - `grep -c "var(--" frontend/src/renderer/styles/global.css` → 6 · same on `timeline.css` → 3 · all other 17 stylesheets → 0 (verified d821ae8; if ≫, someone started tokens — reconcile first)
  - `grep -n ":root" frontend/src/renderer/styles/global.css` → single hit at line 7 (8 layout vars at :7-16, verified)
  - `git grep -ohE '#[0-9a-fA-F]{3,8}' origin/main -- 'frontend/src/renderer/styles' | wc -l` → **895** (verified d821ae8; if drifted, the NEW number is the ratchet baseline — record it)
  - `git log --oneline origin/main -1` → record SHA in PR body
- **Scope (verified paths):** `frontend/src/renderer/styles/tokens.css` (new) · all 19 files under `frontend/src/renderer/styles/` (scripted migration) · `frontend/src/renderer/components/common/Toast.tsx` (LEVEL_COLORS at :5-10 → `toast--{level}` CSS classes) · `frontend/scripts/hex-ratchet.sh` (new) + `frontend/.hex-ceiling` (new) + merge-gate workflow step · `frontend/src/__tests__/hex-ratchet.test.ts` (new) · `docs/UX-SPEC.md:17` (amend: accent line now points at DESIGN-SPEC + tokens.css as source of truth)
- **DO-NOT-TOUCH:** component TSX other than Toast.tsx (SVG strokes like `Knob.tsx:215 stroke="#444"` stay for now — counted in a TSX follow-up, NOT in this ratchet) · any layout rules (grid-template, heights — PR-A territory) · `backend/**` · the 8 existing layout vars (keep names, relocate into tokens.css unchanged) · `style-guide.html` (reference artifact, not app code)
- **Steps:**
  1. Tier 1: transcribe the token set above into `tokens.css` (one block per §2 table, hex values byte-identical to DESIGN-SPEC).
  2. Tier 2 semantic (DESIGN-SPEC §7 naming): `--cx-action` (→ACID) · `--cx-action-hover` · `--cx-selection` (→MOD) · `--cx-danger-text` / `--cx-danger-fill` (→RED text/fill — keep the split!) · `--cx-warn` (→AMBER) · `--cx-meter` (→ACID) · `--cx-bg-app` / `--cx-bg-panel` / `--cx-bg-raised` / `--cx-bg-hover` (→surface ladder) · `--cx-focus-ring` (→ACID). Semantic may only alias Tier-1, never a literal.
  3. Tier 3: component aliases only where a surface needs an override (e.g. `--cx-clip-border`, `--cx-knob-arc`); live in the per-surface CSS files, must alias Tier 2.
  4. Scripted migration of the **verified top-20 distribution** (sums to 830/895): `#4ade80` ×128 → `--cx-action` where it means life/activity (play, meters, mod rings), `--cx-selection` or `--cx-text-2` where decorative (per-selector judgment, DESIGN-SPEC §7 map) · `#444` ×114 → `--cx-line-2`/`--cx-surface-4` by role · `#333` ×103 → `--cx-surface-3` · `#888` ×76 → `--cx-text-2` (labels) or `--cx-text-3` (hints) · `#e0e0e0` ×63 → `--cx-text-1` · `#1a1a1a` ×56 → `--cx-surface-1` (app bg) / `--cx-surface-2` (panel beds) by role · `#fff` ×40 → `--cx-text-1` or on-color · `#ef4444` ×37 → `--cx-danger-text` vs `--cx-danger-fill` per the §9 fill rule · `#aaa` ×37 → `--cx-text-2` · `#666`+`#555` ×64 → `--cx-text-3`/`--cx-text-disabled`/`--cx-line-2` by role · `#2a2a2a` ×29 → `--cx-surface-2/3` · `#ccc` ×25 → `--cx-text-1` · `#222` ×11 → `--cx-surface-2` · `#f59e0b` ×10 → `--cx-warn` · `#22c55e` ×10 → `--cx-action` (success=ACID) · purple/blue family `#9B7BB5`×9 `#3b82f6`×8 `#6366f1`×5 `#818cf8`×4 (+`#a855f7`×2) → `--cx-selection`. Python one-off; hand-review diff for false positives.
  5. Replace `Toast.tsx:5-10` LEVEL_COLORS with `toast--{level}` classes mapping to DESIGN-SPEC §6 toast row (info MOD tick · success ACID tick · warn AMBER · error RED · text `--cx-text-1`).
  6. **Hex-ratchet CI (quantified):** `frontend/scripts/hex-ratchet.sh` counts `grep -rohE '#[0-9a-fA-F]{3,8}' src/renderer/styles --include='*.css' --exclude=tokens.css | wc -l` and fails (exit 1) if count > `$(cat frontend/.hex-ceiling)`. Rules: (a) baseline 895 → PUX.1 sets `.hex-ceiling` to the exact post-migration count (**expected ≤ 100**); (b) every subsequent PR touching `styles/` must keep count ≤ ceiling — new hardcoded hex with no headroom = red CI; (c) any PR that lowers the count MUST lower `.hex-ceiling` to the new count in the same PR (the ratchet clicks, monotonic to 0; tokens.css is the only legal hex home). Wire as a merge-gate workflow step.
  7. Amend `docs/UX-SPEC.md:17` (verified: "Accent color … electric purple `#a855f7`") → "superseded by docs/roadmap/DESIGN-SPEC.md; tokens.css is the source of truth."
- **TEST PLAN (named tests + exact commands):**
  - `cd frontend && npx --no vitest run` → 1,814/1,818 baseline maintained (re-snapshot in preconditions)
  - NEW `frontend/src/__tests__/hex-ratchet.test.ts`: `it('fails when a stylesheet adds a hardcoded hex above the ceiling')` (fixture dir + injected `#123456` → script exits 1 — **the negative test**) · `it('passes when styles hex count equals the ceiling')` · `it('excludes tokens.css from the count')`
  - `bash frontend/scripts/hex-ratchet.sh` → exit 0 on the branch; then `echo 'a{color:#123456}' >> src/renderer/styles/toast.css && bash scripts/hex-ratchet.sh; echo $?` → 1, then `git checkout -- src/renderer/styles/toast.css` (live negative proof, paste output in PR)
  - `grep -rE '#1a1a1a|#4ade80|#a855f7' frontend/src/renderer/styles --include='*.css' | grep -v tokens.css | wc -l` → 0
  - `npx playwright test` smoke
  - **Live-runtime step (Gate 18):** `cd frontend && npm start`, confirm via `ps aux | grep -i electron` the running binary path matches this worktree; screenshot timeline / browser / ExportDialog / toast. **The visual diff is INTENTIONAL** (green→ACID, red→RED-fill, grays→ladder): validate each shot against the DESIGN-SPEC §6 per-surface table + `style-guide.html`, not against pre-branch pixels.
- **ACCEPTANCE GATES (quantified):** tokens.css exists with 3 documented tiers and `grep -c -- '--cx-' tokens.css` ≥ 55 · `grep -roh 'var(--' frontend/src/renderer/styles --include='*.css' | wc -l` ≥ 400 (from 9) · styles hex count ≤ 100 and `.hex-ceiling` == measured count · zero `#1a1a1a`/`#4ade80`/`#a855f7` literals outside tokens.css · ratchet negative test green · vitest ≥ baseline · no layout rule diffs (`git diff` contains no `grid-template|height:|width:` changes except var substitutions) · §6-table conformance noted per screenshot.
- **ROLLBACK:** revert single PR; tokens.css/ratchet are additive, migrations are find-replace — `git revert <sha>` is clean. Ratchet ceiling file reverts with it.
- **FAILURE MODES:** (a) alpha hexes (`#0008`, 8-digit) missed by a 6-digit-only regex — regex MUST cover `{3,8}`; map alpha cases to the wash tokens or leave counted · (b) `#fff` as on-color text vs body text — classify per selector, don't blanket-replace · (c) `#444` inside TSX SVG strokes — out of scope, do NOT let the script touch TSX · (d) ratchet counting tokens.css itself → infinite red; `--exclude=tokens.css` is load-bearing · (e) surface remap changes perceived dialog elevation — the §6 screenshot conformance check is the catch.
- **EVIDENCE:** before/after hex counts per file in PR body (19 rows) · ratchet negative-test output · screenshot set with §6 conformance notes.
- **Effort:** ~4h.

---

### PUX.2 — Dialog accessibility: Escape, focus trap, ARIA-modal
- **ID:** PUX.2 · **branch:** `ux/pux-2-dialog-a11y` · **base:** `origin/main` · **depends-on:** none (parallel-safe with PUX.1)
- **Model:** Sonnet
- **Goal:** One shared `useModalBehavior(ref, onClose)` hook (Escape-to-close, focus trap, initial focus, return-focus-on-close) + `role="dialog" aria-modal="true" aria-labelledby` applied to all **9** true modals (roster below — verified by `git ls-tree -r origin/main … | grep -i dialog` at d821ae8).
- **THE ROSTER (9 true modals — the executor edits exactly these):**
  | # | Component (path under `frontend/src/renderer/components/`) | Current state |
  |---|---|---|
  | 1 | `dialogs/CrashRecoveryDialog.tsx` | no Escape/trap/ARIA; **Escape maps to "Dismiss"** (the safe, non-data-loss path) |
  | 2 | `dialogs/FeedbackDialog.tsx` | no Escape/trap/ARIA |
  | 3 | `dialogs/TelemetryConsentDialog.tsx` | no Escape/trap/ARIA (existing spec: `consent-dialog.test.tsx`) |
  | 4 | `dialogs/UnsavedChangesDialog.tsx` | **NEW since the audit** — no Escape/trap/ARIA; Escape = "Cancel" (safe path) |
  | 5 | `export/ExportDialog.tsx` | no Escape/trap/ARIA |
  | 6 | `library/PresetSaveDialog.tsx` | no Escape/trap/ARIA |
  | 7 | `layout/Preferences.tsx` | no Escape/trap/ARIA; hosts ShortcutEditor — see failure mode (a) |
  | 8 | `layout/AboutDialog.tsx` | no Escape/trap/ARIA |
  | 9 | `timeline/SpeedDialog.tsx` | **Escape already wired at :59** (input-level, with `stopPropagation` at :61 — preserve); still needs trap + ARIA + return-focus |

  **Excluded, with reasons (do not touch):** `upload/FileDialog.tsx` (a `<button>` invoking the native OS picker — not a DOM modal, verified) · `layout/ShortcutEditor.tsx` (key-capture overlay; its Escape-cancels-capture at :28 is intentional) · `export/ExportProgress.tsx`, `export/RenderQueue.tsx`, `layout/UpdateBanner` (non-modal surfaces) · `performance/MIDILearnOverlay.tsx` (capture overlay, same class as ShortcutEditor).
- **PRECONDITIONS (mismatch → STOP):**
  - `git grep -n "Escape" origin/main -- 'frontend/src/renderer/components/dialogs' 'frontend/src/renderer/components/export' 'frontend/src/renderer/components/library' 'frontend/src/renderer/components/layout' 'frontend/src/renderer/components/timeline/SpeedDialog.tsx'` → expect EXACTLY 2 hits: `layout/ShortcutEditor.tsx:28` and `timeline/SpeedDialog.tsx:59` (verified d821ae8; more hits = partial fix landed, audit before proceeding)
  - `git grep -c "aria-modal" origin/main -- frontend/src/renderer/components` → no output (0 hits, verified)
  - `ls frontend/src/renderer/components/dialogs/` → exactly 4 files: `CrashRecoveryDialog.tsx FeedbackDialog.tsx TelemetryConsentDialog.tsx UnsavedChangesDialog.tsx` (verified)
- **Scope (verified paths):** new `frontend/src/renderer/hooks/useModalBehavior.ts` · the 9 roster files · new `frontend/src/__tests__/components/dialogs/modal-behavior.test.tsx` (repo convention verified: specs live under `frontend/src/__tests__/components/`)
- **DO-NOT-TOUCH:** dialog visual styling · the excluded list above · `SpeedDialog.tsx:59-61` Escape+stopPropagation (wrap, don't replace) · store logic
- **Steps:** build hook (keydown Escape → onClose unless a nested capture is active; trap Tab/Shift-Tab within `ref`; focus first `[autofocus]` or first focusable on mount; restore the saved `document.activeElement` on unmount; if the trigger unmounted, fall back to `document.body` without throwing) → apply per roster row → per-dialog Escape semantics: destructive-ambiguity dialogs (CrashRecovery, UnsavedChanges) map Escape to their SAFE action, never the destructive one.
- **TEST PLAN (named tests + behavior-keyword titles + exact commands):**
  - NEW `frontend/src/__tests__/components/dialogs/modal-behavior.test.tsx`, parameterized over all 9 roster components — **4 assertions each (36 total)**:
    - `it('renders with role="dialog", aria-modal="true", and aria-labelledby resolving to the title element')`
    - `it('closes (or fires the safe action) on Escape keydown')`
    - `it('wraps Tab from the last focusable element back to the first')`
    - `it('returns focus to the trigger element on close')`
  - **Negative tests (≥1 required):** `it('keeps focus inside the dialog after 20 Tab presses — focus never escapes to the background')` (assert `dialog.contains(document.activeElement)` in a loop) · `it('does not close Preferences when Escape cancels an active ShortcutEditor capture')` (nested-capture guard)
  - Existing specs stay green: `crash-recovery.test.tsx`, `consent-dialog.test.tsx` (verified present on origin/main)
  - Command: `cd frontend && npx --no vitest run` (1,814/1,818 baseline + 38 new)
  - **Live-runtime step (Gate 18):** `cd frontend && npm start` from THIS worktree (confirm via `ps aux | grep -i electron`); open each of the 9 dialogs, press Escape, confirm close + focus return; record a 30s clip of ExportDialog Escape/Tab-wrap.
- **ACCEPTANCE GATES (quantified):** 9/9 dialogs × 4 assertions = 36 green + 2 negative tests green · `git grep -l "aria-modal" -- frontend/src/renderer/components | wc -l` = 9 · `git grep -l "useModalBehavior" -- frontend/src/renderer/components | wc -l` = 9 · zero regressions in existing 1,814.
- **ROLLBACK:** revert PR; hook is a new file, per-dialog diffs ≤15 lines each.
- **FAILURE MODES:** (a) nested capture — ShortcutEditor inside Preferences: Escape during capture must cancel capture only (the negative test covers it) · (b) `SpeedDialog` input-level `stopPropagation` swallows the hook's document listener — attach the hook listener on the dialog root, not document, or verify both paths · (c) return-focus crash when the trigger node unmounted (context-menu-launched dialogs) — fallback path required · (d) portal-rendered dialogs: trap must query the portal subtree, not the React parent · (e) `aria-labelledby` pointing at a non-existent id silently fails AT — assert the id resolves in the spec.
- **EVIDENCE:** vitest output (count line) · the 30s ExportDialog recording · grep gate outputs pasted in PR.
- **Effort:** ~3.5h (9 dialogs, was 8).

---

### PUX.3 — Focus-visible restoration sweep
- **ID:** PUX.3 · **branch:** `ux/pux-3-focus-visible` · **base:** `origin/main` · **depends-on:** PUX.1 (uses `--cx-acid`/`--cx-focus-ring`; if PUX.1 unmerged, use literal `#C8F321` and leave `TODO(PUX.1)`)
- **Model:** Sonnet
- **Goal:** Every `outline: none` either gains a paired focus rule — **DESIGN-SPEC §4 style: `outline: 2px solid var(--cx-focus-ring); outline-offset: 1px`** on `:focus-visible` (this supersedes the I15 box-shadow recipe) — or is deleted.
- **PRECONDITIONS (mismatch ≫ → partial fix landed, STOP and re-audit):**
  - `git grep "outline: *none" origin/main -- 'frontend/src/renderer/styles' | wc -l` → **31** (verified d821ae8; per-file: global.css 13 · timeline.css 7 · text.css 5 · library.css 4 · device-chain.css 1 · transport.css 1)
  - `git grep "focus-visible" origin/main -- 'frontend/src/renderer/styles' | wc -l` → **7** (verified)
- **Scope:** `frontend/src/renderer/styles/*.css` (rule additions; no selector renames) · new `frontend/src/__tests__/styles/focus-visible-coverage.test.ts`
- **DO-NOT-TOUCH:** TSX files · tab-order/tabIndex (PUX.4) · `.knob__svg`/`.hslider__track` focus rules (already correct — global.css:1502,1581; use as the pattern, restyled to §4)
- **Steps:** enumerate all 31 sites (the per-file breakdown above is the checklist) → classify (text input → `:focus` border tint, like `effect-search__input:focus` global.css:484; button/control → `:focus-visible` §4 ring) → add rules adjacent to each `outline: none` → restyle the 7 existing focus rules to the §4 outline form (consistency).
- **TEST PLAN (named tests + exact commands):**
  - NEW `frontend/src/__tests__/styles/focus-visible-coverage.test.ts` — parses the 19 stylesheets: `it('every selector with outline:none has a :focus or :focus-visible replacement rule in the same file')` · **negative test:** `it('fails when a fixture stylesheet declares outline:none with no replacement')` (fixture proves the parser catches violations — guards against the test silently passing on a regex bug)
  - `cd frontend && npx --no vitest run`
  - **Live-runtime step (Gate 18):** `npm start` from this worktree (verify binary path); keyboard walk: Tab through transport → browser → params → timeline → dialogs; focus visibly tracks at EVERY stop; screenshot 5 named focal stops (`pux3-stop-{1..5}.png`).
- **ACCEPTANCE GATES (quantified):** replacement-rule count ≥ 31 (one per `outline: none` site) · coverage test green incl. negative fixture · keyboard walk shows 0 invisible stops across ≥ 20 consecutive Tab presses · all 5 focal-stop screenshots show the §4 ring.
- **ROLLBACK:** revert; purely additive CSS + one new test file.
- **FAILURE MODES:** (a) `:focus` (not `:focus-visible`) on pointer-heavy controls makes rings flash on every click — controls get `:focus-visible`, text inputs get `:focus` · (b) `outline-offset` clipped by `overflow: hidden` parents (timeline clips) — spot-check those 7 timeline.css sites live · (c) replacement rule lower in the cascade than a later `outline: none` — keep them adjacent.
- **EVIDENCE:** before/after grep counts (31→31 paired) · focal-stop screenshots · coverage-test output.
- **Effort:** ~2h.

---

### PUX.4 — Control & menu semantics (slider ARIA + menu keyboard model)
- **ID:** PUX.4 · **branch:** `ux/pux-4-control-semantics` · **base:** `origin/main` · **depends-on:** none
- **Model:** Sonnet
- **Goal:** (a) `role="slider"` + `aria-valuemin/max/now/valuetext` + `aria-label` on Knob and Slider; (b) ContextMenu gets `role="menu"`/`menuitem`, focus moves to first item on open, ArrowUp/Down/Home/End traversal, Enter activates, focus returns to invoker on close.
- **PRECONDITIONS (all verified d821ae8):** `git grep -n 'role="slider"' origin/main -- frontend/src/renderer/components/common/Knob.tsx frontend/src/renderer/components/common/Slider.tsx` → 0 hits · `git grep -n 'role="menu"' origin/main -- frontend/src/renderer/components/timeline/ContextMenu.tsx` → 0 hits · `tabIndex={0}` at **Knob.tsx:201** + `onKeyDown` at :207, `tabIndex={0}` at **Slider.tsx:118** + `onKeyDown` at :123 (all four verified) · ContextMenu hardcoded `menuW=180`/`menuH=items*28` at **ContextMenu.tsx:24-25**, Escape handler at :32 (verified)
- **Scope (verified):** `components/common/Knob.tsx`, `components/common/Slider.tsx`, `components/timeline/ContextMenu.tsx` (+ its consumers compile-check only: Track/Clip/DeviceChain import it) · extend `frontend/src/__tests__/components/common/knob.test.ts` (exists, verified) · new `frontend/src/__tests__/components/context-menu-keyboard.test.tsx`
- **DO-NOT-TOUCH:** pointer-drag math in Knob/Slider · F-0512-9 stopPropagation logic in ContextMenu (regression spec `context-menu-propagation.test.tsx` exists on origin/main with titles `'does not bubble item-click events to elements underneath'` / `'does not bubble pointerdown either'` — preserve the code it pins verbatim) · menu item *contents*/shortcut hints (issue #65 scope)
- **Steps:** Knob/Slider — attributes on the existing focusable SVG/track element (Knob.tsx:195-210 / Slider.tsx:115-124), `aria-valuetext` from existing display-format fn, update `aria-valuenow` in the same setState path as the visual; ContextMenu — `useRef` roving index, keydown switch, `requestAnimationFrame` initial focus, restore focus in the existing `onClose` cleanup.
- **TEST PLAN (named tests + behavior-keyword titles + exact commands):**
  - Extend `knob.test.ts` (existing describes: 'value clamping', 'keyboard adjustment'): `it('exposes role="slider" with aria-valuemin/max matching props')` · `it('updates aria-valuenow when an arrow key changes the value')` · `it('formats aria-valuetext with the display formatter')` (×2: same trio asserted for Slider)
  - NEW `context-menu-keyboard.test.tsx`: `it('moves focus to the first menu item on open')` · `it('ArrowDown advances the roving focus and wraps from last to first')` · `it('Home and End jump to first and last items')` · `it('Enter activates the focused item exactly once and closes the menu')` · `it('returns focus to the invoking element on close')` · **negative tests:** `it('skips disabled items during arrow traversal and does not fire their action on Enter')` · `it('does not activate any item when Escape closes the menu')`
  - Command: `cd frontend && npx --no vitest run` (existing `context-menu-propagation.test.tsx` 4 assertions must stay green)
  - **Live-runtime step (Gate 18):** `npm start` from this worktree; VoiceOver announces "slider, 50 of 100" on a param knob; arrow-navigate a clip context menu end-to-end.
- **ACCEPTANCE GATES (quantified):** 6 new Knob/Slider assertions + 7 new ContextMenu assertions green · F-0512-9 regression specs (4 assertions) still green · zero visual diffs (`git diff` touches no CSS) · VoiceOver clip recorded.
- **ROLLBACK:** revert; 3 source files + 2 test files.
- **FAILURE MODES:** (a) adding `role="menuitem"` + tabIndex to items changes the Tab order of the page behind the menu — roving tabIndex (-1 on non-focused items) is mandatory · (b) `aria-valuenow` updated outside the setState path drifts from the visual under rapid wheel events · (c) focus-on-open `requestAnimationFrame` racing the click-outside `pointerdown` listener (ContextMenu.tsx:35-36) closes the menu instantly — the existing-listener order is the F-0512-9-adjacent trap; the negative Escape test plus the propagation specs pin it.
- **EVIDENCE:** vitest output · VoiceOver screen recording (10s) · grep showing role attributes present.
- **Effort:** ~3.5h.

---

### PUX.5 — Hit targets & drag signifiers (timeline + automation)
- **ID:** PUX.5 · **branch:** `ux/pux-5-hit-targets` · **base:** `origin/main` · **depends-on:** PUX.1 preferred (token colors), not required
- **Model:** Sonnet
- **Goal:** every interactive target ≥ **24×24px effective** (DESIGN-SPEC §4 floor), every drag handle **visible at rest with ≥8px painted** signifier (§6 automation row: breakpoints ≥8px visible, hover +2px) — visuals otherwise unchanged. Full quantified roster below; no target left unmeasured.
- **THE TARGET ROSTER (every <24px interactive element, verified file:line @ d821ae8):**
  | # | Element | File:line | Current (painted / effective) | Target (painted / effective) | Mechanism |
  |---|---|---|---|---|---|
  | 1 | AutomationNode breakpoint | `AutomationNode.tsx:105` (`r={isDragging ? 6 : 4}`) | 8-12px / 8-12px | **8px glyph (r=4, hover r=5 per §6) / 24px** | transparent hit `<circle r={12}>` behind glyph, pointer events on it |
  | 2 | Clip trim handles | `timeline.css:686-705` (`width: 6px`, hover-only bg) | 6px, invisible at rest / 6px | **8px painted grip (2×10px bars) visible under `.clip--selected` / 8px wide × full clip height** | widen to 8px + at-rest grip bars |
  | 3 | Device bypass toggle `.device-card__toggle` | `device-chain.css:194-195` | 22×14 / 22×14 | 22×14 painted / **≥24×24** | `::before` padding hit-extender |
  | 4 | Track header buttons `.track-header__btn` | `timeline.css:537-538` | 20×20 / 20×20 | 20×20 painted / **24×24** | padding + negative margin |
  | 5 | Track opacity slider thumb | `timeline.css:585-586` (10×10 webkit thumb) | 10×10 / 10×10 | 12×12 painted / **input track height ≥24** | input height + thumb bump |
  | 6 | Zoom-scroll slider thumb | `timeline.css:411-412` (10×10) | 10×10 / 10×10 | 12×12 painted / **track ≥24** | same |
  | 7 | Macro-knob slider thumb | `library.css:393-394` (10×10) | 10×10 / 10×10 | 12×12 painted / **track ≥24** | same |
  | 8 | Track blend dropdown `.track-header__blend` | `timeline.css:603` (height 20) | h20 / h20 | h20 painted / **h24** | padding |

  **Measured and excluded:** `.operator-card__type-badge` 18×18 (`operators.css:112-113`) — display-only badge, not interactive · Knob 40×40 (already ≥24) · BoundingBoxOverlay handles (already fixed, `BoundingBoxOverlay.tsx:225-231`).
- **PRECONDITIONS:** `git grep -n "r={isDragging ? 6 : 4}" origin/main -- frontend/src/renderer/components/automation/AutomationNode.tsx` → 1 hit at :105 (verified) · `git grep -n "width: 6px" origin/main -- frontend/src/renderer/styles/timeline.css` → 1 hit in the `.clip__trim-handle` block at ~:690 (verified ~:686-699) · spot-check rows 3-8 line numbers with `git grep` (all verified d821ae8) · confirm PR #109 (timeline drag-reorder, **still OPEN** as of 2026-06-11) merge status: `gh pr view 109 --json state` — if merged, re-verify Clip.tsx + timeline.css line numbers before editing
- **Scope (verified):** `components/automation/AutomationNode.tsx` · `styles/timeline.css` · `styles/automation.css` · `styles/device-chain.css` · `styles/library.css` · extend `frontend/src/__tests__/components/automation-node.test.tsx` (exists, verified)
- **DO-NOT-TOUCH:** `Clip.tsx` drag logic (PR #109 owns drag-reorder; trim-handle guard at Clip.tsx:154-155 must keep matching the className) · BoundingBoxOverlay (already fixed) · anything PR-A layout · the excluded list above
- **Steps:** hit-circle pattern from established libs (per RULE 1.5: react-moveable renders enlarged transparent hit areas around visual handles — cite in code comment) → trim-handle grip bars shown under `.clip--selected` → rows 3-8 mechanically (pseudo-element/padding, painted size near-unchanged) → re-measure all 8 rows with devtools box model, paste the 8 measurements in the PR.
- **TEST PLAN (named tests + behavior-keyword titles + exact commands):**
  - Extend `automation-node.test.tsx`: `it('starts a drag from a pointerdown 10px from the node center (inside the 24px ring)')` · **negative tests:** `it('does not start a drag from a pointerdown 14px from the node center (outside the ring)')` · `it('does not create a new node when a lane click lands inside an existing node hit ring')` (the destructive-miss scenario from §2.6)
  - E2E: existing Playwright timeline specs green — `cd frontend && npx playwright test`
  - Command: `cd frontend && npx --no vitest run`
  - **Live-runtime step (Gate 18):** `npm start` from this worktree; chaos pass: rapid trim-drag → release → click clip body — no deselect regression (`memory/feedback_drag-end-suppress-click.md` scenario); drag an automation node grabbing it visibly off-center.
- **ACCEPTANCE GATES (quantified):** all 8 roster rows measure ≥24px effective in devtools (8 measurements in PR) · trim grip visible in a selected-clip screenshot at rest (no hover) · node draggable from 10px off-center in test, NOT from 14px · 3 new assertions green · vitest + playwright green.
- **ROLLBACK:** revert; 4 CSS files + 1 TSX + 1 test file.
- **FAILURE MODES:** (a) enlarged node hit rings overlap on dense automation curves — rings must not exceed r=12, and z-order must favor the nearest node · (b) hit-extender pseudo-elements intercept clicks meant for neighbors in 2px-gap `.track-header__controls` (`timeline.css:530-533`) — cap extension to available gap · (c) widening trim handles 6→8px shrinks the clip-body click zone on tiny clips — keep body-click functional on clips ≥24px wide · (d) webkit slider thumb sizing differs from the firefox pseudo — Electron is Chromium-only, note it and skip `-moz-`.
- **EVIDENCE:** before/after screenshots (selected clip at rest + automation lane) · the 8 box-model measurements · test output.
- **Effort:** ~3h.

---

### PUX.6 — LIVE visual pass protocol (computer-use, repeatable per release)
- **ID:** PUX.6 · **branch:** none (no code) — produces `docs/roadmap/packets/ux-visual-pass-results-<YYYYMMDD>.md` (dated: the protocol is **repeatable**; each run is a new results file diffed against the previous) · **base:** n/a · **depends-on:** schedule AFTER PUX.1-5 merge (validates them) and BEFORE PR-A starts (baseline for redesign)
- **Model:** Sonnet (computer-use session)
- **Goal:** Ground-truth the static audit with the running app: walk the 5 core flows, screenshot every surface, run anti-slop + DESIGN-SPEC §9 contrast checks on real pixels, file deltas as 🐛 items.
- **Scope:** results doc + `docs/roadmap/packets/visual-pass-shots/<YYYYMMDD>/` only. **DO-NOT-TOUCH:** zero source edits during the pass (`feedback_stock-take-not-fix.md` — enumerate + queue only; fixes become new packets/issues).
- **PRECONDITIONS:** `ps aux | grep -i electron` — note the running binary's full path and confirm it is the worktree you intend to audit; **record that path in the results doc header** (Live Runtime Check / Gate 18; `entropic-v2-uat` worktree hazard) · `cd ~/Development/entropic-v2challenger/frontend && npm start` boots clean · computer-use access granted for "Electron" at full tier (per `memory/visual-uat-entropic.md`) · PUX.1-5 merge SHAs recorded in the doc header.
- **THE 5 CORE FLOWS (enumerated — each is screenshot-instrumented end to end):**
  1. **F1 Import→Timeline:** Cmd+I → pick repo fixture clip → clip lands on track → select clip (trim grips visible at rest = PUX.5 live check) → trim 1s off the head.
  2. **F2 Effect chain:** browser search → drag 3 effects onto DeviceChain (drag-over state shot mid-flight) → tweak one Knob + one Slider (focus ring + ARIA = PUX.3/4 live check) → bypass one device (AMBER state per §6).
  3. **F3 Modulation:** add 1 LFO operator → route to a param via ModulationMatrix → confirm mod activity reads as the only saturated element in the region (§1 chroma budget).
  4. **F4 Automation:** create a lane → draw 3 nodes → drag the middle node grabbing it ~10px off-center (PUX.5 ring live check) → undo.
  5. **F5 Export:** ExportDialog (Escape closes + reopens, focus returns = PUX.2 live check) → render a 2s clip → ExportProgress → render-complete moment (the §5 sanctioned glitch wink, if landed).
- **Screenshot naming convention (mandatory):** `visual-pass-shots/<YYYYMMDD>/<NN>-<surface>-<state>.png` — `NN` = 2-digit sequence, `surface` ∈ the §1 row names (kebab-case), `state` ∈ {rest, hover, selected, drag, open, focus}. Examples: `03-timeline-clip-selected.png`, `17-export-dialog-open.png`, `24-automation-node-drag.png`. Flow shots prefix `f1`-`f5`: `f2-04-device-chain-drag.png`. Re-runs diff by filename.
- **Protocol steps (≤4h):**
  1. Run flows F1-F5 above, shooting per the convention.
  2. Static inventory — one shot per §1 surface row (14) + each of the **9** PUX.2 roster dialogs + 3 context menus open + 3 drag-in-progress states (trim, node, effect-over-chain).
  3. **Anti-slop I15 checklist per shot:** workspace stays dark; no consumer-sized type in panels; destructive actions confirm; no pill buttons; panels resizable; ≤1 saturated element per region at rest (§1 chroma budget).
  4. **Contrast spot-check — the DESIGN-SPEC §9 list, eyedropper-measured (tolerance ±0.3 for screenshot rounding; any normal-text pair <4.5:1 = 🐛):**
     | Pair | Expected (spec) |
     |---|---|
     | `text-1 #E7E7EC` on `surface-1` | ≥15:1 |
     | `text-2 #9A9AA6` on `surface-2` / `surface-4` | ≥6.4 / ≥5.2 |
     | `text-3 #80808E` (hints) on `surface-1` | ≥4.8 |
     | ACID `#C8F321` text/icons on surfaces | ≥14.5 |
     | MOD `#8F7DFF` text on `surface-2` | ≥5.5 |
     | RED text `#E5484D` on `surface-2` | ≥4.53 |
     | White on RED **fill** `#C13B40` (filled destructive buttons) | ≥5.3 |
     | AMBER `#D9A23C` on `surface-2` | ≥7.7 |
     | Focus ring vs adjacent surface (non-text) | ≥3:1 |
     **Calibration check (the protocol's negative test):** eyedrop one disabled label (`text-disabled #62626E` on `surface-1` ≈ 3.1:1) and confirm the procedure FLAGS it — if the method can't reproduce a known failure, the measurements are untrustworthy; also confirm no `#62626E` appears as a *hint* (the §9 split).
  5. **Signifier walk:** without hovering, can you SEE where to trim, drag, resize, reorder on each surface? Record per surface (PUX.5 validation).
  6. Keyboard-only circuit: Tab/Shift-Tab full loop (0 invisible stops = PUX.3), operate one knob (PUX.4), open+navigate one context menu by arrows (PUX.4), Escape out of two dialogs (PUX.2).
  7. File results doc: runtime path header, per-surface verdict, contrast table (9 pairs + calibration row), 🐛 list (binary statuses only — ✅/❌/🐛/⏸, no 🟡, per `feedback_no-yellows-binary-verdicts.md`).
- **TEST PLAN:** the protocol IS the test; deliverable = dated results doc + ≥34 screenshots (14 surfaces + 9 dialogs + 3 menus + 3 drags + ≥5 flow shots) in the dated shots dir.
- **ACCEPTANCE GATES (quantified):** all 14 surfaces + 9 dialogs shot · all 9 §9 contrast pairs measured + the calibration row flagged · all 5 flows completed with per-flow verdict · every PUX.1-5 acceptance gate re-verified on live pixels (5-row table in the doc) · 0 filenames off-convention.
- **ROLLBACK:** n/a (read-only).
- **FAILURE MODES:** (a) auditing the wrong worktree's binary — the Gate 18 precondition is the catch; the results-doc header MUST name the path · (b) eyedropper on anti-aliased text inflates ratios — sample glyph cores, 3 samples per pair, take the median · (c) screenshot color-profile drift on wide-gamut displays — capture on sRGB profile or note the profile in the header.
- **EVIDENCE:** results doc + screenshot dir + contrast table.
- **Effort:** ~3-4h per run.

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

---

## Packet thickness scorecard (pass of 2026-06-11, anchors @ `origin/main` d821ae8)

Rubric: (1) anchors git-verified · (2) full 11-field contract + model tier · (3) named tests, behavior-keyword titles, exact commands, live-runtime step for UI packets · (4) gates quantified · (5) failure modes + ≥1 negative test · (6) full-chain integration · (7) depends-on resolves.

| Packet | 1 Anchors | 2 Contract | 3 Tests | 4 Gates | 5 Neg/fail | 6 Integration | 7 Deps | Notes |
|---|---|---|---|---|---|---|---|---|
| PUX.1 | ✅ (hex dist, :root:7, var counts, UX-SPEC:17 all re-verified) | ✅ | ✅ hex-ratchet.test.ts + live CI red proof + Gate 18 step | ✅ (895→≤100, ≥55 tokens, ≥400 vars) | ✅ injected-hex CI failure | ✅ token→CSS→live screenshot vs §6 table | ✅ DESIGN-SPEC on `origin/docs/consolidated-roadmap-2026-06-11` (⚠️ not on main yet) | Palette decision LOCKED by DESIGN-SPEC — USER-TOUCH removed |
| PUX.2 | ✅ (roster 9 modals incl. NEW UnsavedChangesDialog; Escape grep now 2 hits) | ✅ | ✅ modal-behavior.test.tsx, 36+2 named assertions, Gate 18 step | ✅ (9×4 assertions, grep=9) | ✅ focus-escape + nested-capture negatives | ✅ trigger→dialog→Escape→focus-return live | ✅ none | Audit said 8 modals/3 dialog files — both stale, corrected |
| PUX.3 | ✅ (31 outline:none per-file breakdown, 7 focus-visible) | ✅ | ✅ focus-visible-coverage.test.ts + 5 named shots + Gate 18 walk | ✅ (31→31 paired, 0 invisible stops/20 Tabs) | ✅ fixture-violation negative | ✅ CSS→live keyboard walk | ✅ PUX.1 (literal fallback documented) | Focus style updated I15 box-shadow → DESIGN-SPEC §4 outline |
| PUX.4 | ✅ (Knob:201/207, Slider:118/123, ContextMenu:24-25/:32, F-0512-9 spec titles quoted) | ✅ | ✅ 13 named assertions across 2 spec files + VoiceOver | ✅ (13 new + 4 pinned regression) | ✅ disabled-item + Escape-no-activate negatives | ✅ keydown→ARIA→VoiceOver announce | ✅ none | |
| PUX.5 | ✅ (8-row target roster, every file:line re-verified; PR #109 OPEN) | ✅ | ✅ 3 named assertions + playwright + Gate 18 chaos pass | ✅ (8 box-model measurements, 24px floor, ring in/out radii) | ✅ outside-ring + no-stray-node negatives | ✅ pointer→hit ring→drag→store | ✅ PUX.1 soft | Targets quantified per DESIGN-SPEC §4/§6 (24px effective, ≥8px painted) |
| PUX.6 | ✅ (runtime-path precondition; §9 pairs from spec) | ✅ (Scope/DNT added) | ✅ protocol = test; naming convention; 5 flows enumerated | ✅ (≥34 shots, 9 pairs, 5 flows, 0 off-convention names) | ✅ calibration row (known-bad 3.1:1 must flag) | ✅ re-verifies PUX.1-5 on live pixels | ✅ after PUX.1-5, before PR-A | Now explicitly repeatable (dated artifacts) |

**Known unfixables / external blockers:** (a) `DESIGN-SPEC.md` is not on `origin/main` yet — PUX.1's read-from-docs-branch fallback covers it until the docs-consolidation PR merges; (b) §1/§2 audit narrative keeps audit-day numbers (866/17, 90 components) by design — packet preconditions carry the d821ae8 ground truth; (c) the IBM Plex font swap (DESIGN-SPEC §3) is out of every PUX packet's 4h budget — needs its own follow-up packet.

---

## PUX.7 (stub — JIT-expand per EXECUTION-PLAN §1 contract)
IBM Plex Sans + Plex Mono font bundling and swap (DESIGN-SPEC §3) — exceeds the 4h budget of any existing PUX packet, so it ships as its own packet. Scope: bundle WOFF2 (2 weights each, subsetted), `@font-face` in tokens.css, replace JetBrains Mono references, `font-display: swap`, license files vendored (OFL — verify). Depends-on: PUX.1. Model: Sonnet.
