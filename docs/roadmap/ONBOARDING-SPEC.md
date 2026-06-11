# Creatrix Onboarding Spec — The First-Launch Ritual

**Date:** 2026-06-11 · **Status:** canonical copy + flow source for first-launch onboarding.
**Implements:** `specs/entropic-spec-4-demo-trilogy.md` §5 (onboarding ritual) under the
`DESIGN-SPEC.md` ("Live Signal") voice. **Implemented by:** P3.5 (+P3.7) — binding note in §9.
**Assets (verified on disk 2026-06-11):** `~/.entropic/demos/{y-is-time, painted-blur,
audio-lfo-stripes}.mp4` — resolved at runtime from the ONE runtime-dir constant (today
`ENTROPIC_DIR` → `~/.creatrix`, `frontend/src/main/diagnostics-handlers.ts:12`; the on-disk demos
live under `~/.entropic/` until PT.4/PD.10 unifies the split — the resolver, not this spec, owns
that reconciliation. Never hardcode both paths).

**Voice rules (from DESIGN-SPEC §3/§8, applied to every string below):**
- Device/data/identity strings: **IBM Plex Mono, lowercase** (`y_is_time`, `open`, `skip`).
- Dialog/UI prose: **IBM Plex Sans, sentence case** ("Don't show demos on launch").
- UPPERCASE only at identity moments (boot line is mono lowercase by choice — quieter).
- Color: ACID for the one primary action per region; MOD for selection/info; nothing else saturated.
- Motion: entries 180 ms / exits 140 ms / feedback 120 ms, `cubic-bezier(0.2, 0, 0, 1)`;
  `prefers-reduced-motion` honored everywhere (§5).

---

## 1. Flow (concrete, in order)

```
App launch
  │
  ├─ §2 BOOT LINE types on (every launch, ~1.0s; reduced-motion: static)
  │
  ├─ first launch? ──no──→ normal session (drawer reachable from browser, nothing auto-opens)
  │        │yes  (no `creatrix.onboarding.v1.dismissed` key)
  │        ▼
  ├─ §3 DEMOS DRAWER slides open (180ms), 3 demo cards, focus on first card
  │        │
  │        ├─ user clicks a card's [ open ] ──→ §4 demo project loads
  │        │        ▼
  │        │   §6 ANNOTATED TOUR over the loaded demo — 5 callouts max,
  │        │   [ next ] / [ skip tour ] / Esc
  │        │        ▼
  │        │   tour ends → drawer stays reachable; "make your own" beat (§6 C5)
  │        │
  │        ├─ user clicks elsewhere / presses Esc ──→ drawer closes; counts as launch w/o engagement
  │        └─ §7 dismiss-forever control (drawer footer checkbox, always visible)
  │
  └─ 3 launches with zero engagement → §7 one-time "Hide demos?" prompt
```

One screen at a time, never stacked: the tour cannot start while the drawer is animating; the
prompt (§7) never appears in the same launch as the first-run drawer.

---

## 2. Boot line

The TE-style identity beat (DESIGN-SPEC §8). One line, IBM Plex Mono, types on over ≤1.0 s in the
statusbar region (not a splash screen — the app is interactive underneath immediately).

| Key | String (template) |
|---|---|
| `boot.line` | `creatrix v{appVersion} — {effectCount} effects loaded` |

- `{appVersion}` from `package.json` (verified `3.0.0`); `{effectCount}` from the live effect
  registry at boot — **never hardcoded** (the 214 in docs is already stale-prone; ROADMAP G13).
- Reduced motion: the line renders instantly, no type-on.
- No RGB-split flicker here — the sanctioned glitch moment (DESIGN-SPEC §5) stays reserved for
  render-complete and destructive-confirm; the boot is calm.

---

## 3. Demos drawer

Drawer header is a UI label (Plex Sans); demo identities are project names (mono lowercase).

| Key | String |
|---|---|
| `drawer.title` | `Demos` |
| `drawer.subtitle` | `Three small projects. Each one teaches one idea.` |
| `drawer.card.y_is_time.title` | `y_is_time` |
| `drawer.card.y_is_time.body` | `The audio is painted vertically — each row is a moment in time.` |
| `drawer.card.painted_blur.title` | `painted_blur` |
| `drawer.card.painted_blur.body` | `Blur isn't one number anymore. Paint where it stays sharp.` |
| `drawer.card.audio_lfo_stripes.title` | `audio_lfo_stripes` |
| `drawer.card.audio_lfo_stripes.body` | `Sound becomes vision — the LFO's rate becomes the stripe count.` |
| `drawer.card.open` | `open` *(mono, the card's one ACID action)* |
| `drawer.card.missing` | `demo file missing — reinstall demos to restore` *(error state, RED text; card stays, app never crashes — P3.5 negative test)* |
| `drawer.footer.dismiss` | `Don't show demos on launch` *(checkbox, Plex Sans)* |

Card anatomy: poster frame from the MP4 (first frame, decoded once, cached) · title (mono) ·
one-line body (Plex Sans, `--cx-text-2`) · `open`. Inline playback: hover starts a muted loop
preview of the MP4; click-anywhere-on-video toggles play. **Reduced motion: no hover autoplay —
poster frame + a standard play button instead (§5).**

Dirty-project guard (spec-4 §5.2): opening a demo while the current project has unsaved changes
preserves the user's work as a draft first — copy:

| Key | String |
|---|---|
| `drawer.draftToast` | `Your project was kept as a draft.` *(toast, info tier)* |

---

## 4. Opening a demo

`open` loads the demo project through the normal project-load path (schema-validated — a demo that
fails validation is a release blocker, spec-4 §2.4, never a silently-skipped card). The demo lands
**paused at frame 0** with the relevant surface visible (the lane for `y_is_time`, the field for
`painted_blur`, the operator for `audio_lfo_stripes`), then the tour (§6) begins. A `reset demo`
action restores the pristine copy (spec-4 §5.2):

| Key | String |
|---|---|
| `demo.reset` | `reset demo` *(mono, in the drawer card's overflow once a demo has been edited)* |
| `demo.resetConfirm` | `Reset this demo to its original state? Your edits to it will be lost.` *(dialog, Plex Sans; confirm button RED filled per DESIGN-SPEC §6 — destructive)* |

---

## 5. Skip + reduced-motion paths

**Skip is always one keypress.** Esc at any onboarding moment does the least-surprising exit:
- During drawer-open animation or while drawer focused → close the drawer.
- During the tour → end the tour (same as `skip tour`); the demo project stays loaded.
- Skipping is never punished: nothing re-opens within the same session.

**`prefers-reduced-motion: reduce` (existing pattern: `global.css:138`):**
- Boot line: static, no type-on (§2).
- Drawer: appears without slide (opacity-only or instant).
- Cards: **no hover autoplay**; poster + play button.
- Tour callouts: no fade/settle animation; instant show/hide; the connector line is static.
- Auto-play of the opened demo (spec-4 first-launch behavior) is **suppressed** — demo loads paused
  with the play control pulsing exactly zero times.

**Keyboard path:** drawer and tour are fully keyboard-operable — cards in tab order, `open` on
Enter, tour advances on Enter/→, ends on Esc. (Rides PUX.2/PUX.4 primitives; focus returns to the
pre-drawer element on close.)

---

## 6. Annotated tour — 5 callouts max

One callout visible at a time; each = title (mono, ≤4 words) + body (Plex Sans, ≤90 chars) +
`next` / `skip tour`. Callout chrome: `surface-4` card, MOD 1px connector to its target, dual-layer
shadow (it floats). **Hard cap 5 — adding a sixth requires deleting one in this file first.**

C1 is per-demo; C2–C5 are shared:

| # | Anchor | Key | Title (mono) | Body (Plex Sans) |
|---|---|---|---|---|
| C1ᵧ | the `domain: y` lane (y_is_time) | `tour.c1.y_is_time` | `the lane` | `This lane runs down the frame, not along the clip. Drag any point — it's live.` |
| C1ₚ | the painted field (painted_blur) | `tour.c1.painted_blur` | `the field` | `This image is the blur amount, per pixel. Dark stays sharp.` |
| C1ₐ | the LFO operator (audio_lfo_stripes) | `tour.c1.audio_lfo_stripes` | `the operator` | `A 50 Hz LFO drawn into space. Loud music packs the stripes tighter.` |
| C2 | preview canvas | `tour.c2.preview` | `preview` | `The result renders here. Scrub anywhere on the timeline.` |
| C3 | device chain | `tour.c3.chain` | `device chain` | `Effects stack left to right. Drag to reorder, double-click to edit.` |
| C4 | browser | `tour.c4.browser` | `browser` | `Everything draggable lives here — effects, operators, instruments.` |
| C5 | (no anchor — centered) | `tour.c5.yours` | `make it yours` | `This project is editable. Break it. New project: Cmd+N.` |
| — | controls | `tour.next` / `tour.skip` | `next` · `skip tour` | *(mono; `next` ACID on the last callout reads `done`)* |

Tour state per demo: `creatrix.onboarding.tourSeen.<demoId>` — a demo's tour runs once; reopening
the demo later does not re-tour (the drawer is the durable surface, not the tour).

---

## 7. Dismiss-forever + the no-engagement prompt

- **Drawer footer checkbox** (`drawer.footer.dismiss`, §3): checking it sets
  `creatrix.onboarding.v1.dismissed = true` immediately — no confirm dialog for opting OUT (the
  ritual must never beg).
- **Settings mirror:** Preferences → `Show demos on launch` (toggle, default on). The checkbox and
  the setting are the same key — flipping either updates both surfaces.
- **No-engagement prompt** (spec-4 §5.3): after **3 launches** with the drawer auto-opened and zero
  engagement (no card opened, no checkbox touched — tracked via
  `creatrix.onboarding.launchCount` / `creatrix.onboarding.engaged`), the NEXT launch replaces the
  auto-open with a one-time toast:

| Key | String |
|---|---|
| `prompt.hideDemos` | `Demos keep opening at launch. Hide them?` *(toast with actions `hide` / `keep` — `hide` sets the dismissed key; `keep` resets launchCount and never asks again: `creatrix.onboarding.promptAnswered = true`)* |

- **Re-entry path after dismissal:** the drawer remains reachable from the browser surface (the
  demos entry P3.5 ships) and via Preferences. Dismiss-forever hides the *ritual*, never the
  *content*.

---

## 8. Telemetry — none

**This feature emits zero telemetry.** No analytics events, no counters leave the machine, nothing
touches the consent plumbing (`diagnostics-handlers.ts` consent file). All onboarding state is
local `localStorage` under the `creatrix.onboarding.*` prefix:

| Key | Type | Meaning |
|---|---|---|
| `creatrix.onboarding.v1.dismissed` | bool | dismiss-forever (§7) |
| `creatrix.onboarding.launchCount` | int | auto-open launches with no engagement |
| `creatrix.onboarding.engaged` | bool | any card opened ever |
| `creatrix.onboarding.promptAnswered` | bool | §7 prompt shown + answered |
| `creatrix.onboarding.tourSeen.<demoId>` | bool | per-demo tour completion |

The `v1` in the dismissed key is deliberate: a future redesigned ritual (v2) may re-introduce
itself ONCE by using a new key — without ever resurrecting against a v1 dismissal silently.

---

## 9. Binding note — P3.5 / P3.7 split

- **P3.5** (`EXECUTION-PLAN.md` Phase 3) implements **§2 boot line · §3 drawer + cards · §4 open +
  reset · §5 skip/reduced-motion · §7 dismiss controls · §8 keys** — and runs the §10 checklist as
  part of its acceptance gates.
- **P3.7** (the split packet P3.5's scope rule names) implements **§6 annotated tour** and the D-PB
  paint affordance (spec-4 §3.4 — `painted_blur`'s "paint it yourself" call-to-action). If P3.5
  finishes under its 4h cap WITH the tour, P3.7 collapses into it and the PR body says so; the
  split exists so the drawer never waits on the tour.
- **This file is the single source of truth for the strings.** Implementations reference the keys
  in §3/§4/§6/§7 verbatim (a string-table module mirroring the keys). Copy changes are PRs to THIS
  file first, code second — same governance as design tokens (DESIGN-SPEC §7).
- Demo PROJECT files (`.entropic` per spec-4 §2.3) are out of scope here — the drawer plays the
  rendered MP4s and opens the project files; authoring those projects is spec-4's inventory.

---

## 10. Acceptance checklist (grep-checkable)

Run from `~/Development/entropic-v2challenger` after P3.5 (and P3.7 where marked). Every line
states its expected result — any mismatch is a bounce.

```bash
# 1. String keys exist exactly once, in one string-table module (no scattered literals):
git grep -rln "drawer.card.y_is_time.title\|tour.c5.yours" frontend/src/renderer/ | wc -l
# EXPECT: 1  (one onboarding strings module)

# 2. No hardcoded demo paths — both runtime dirs banned in onboarding code:
git grep -rn '"~/.entropic\|"~/.creatrix\|\.entropic/demos\|\.creatrix/demos' frontend/src/renderer/components/ frontend/src/renderer/stores/ | grep -i demo
# EXPECT: 0 hits  (path comes from the single runtime-dir constant)

# 3. localStorage keys match §8 exactly:
git grep -rn "creatrix\.onboarding\." frontend/src/renderer/ -h | grep -o "creatrix\.onboarding\.[a-zA-Z0-9.]*" | sort -u
# EXPECT: exactly the 5 keys from §8 (tourSeen as prefix)

# 4. Telemetry = none — onboarding code never touches telemetry/consent surfaces:
git grep -rln "telemetry\|consent\|analytics" frontend/src/renderer/components/demos/ frontend/src/renderer/stores/demos.ts
# EXPECT: 0 hits

# 5. Reduced motion handled (component CSS + autoplay guard):
git grep -rn "prefers-reduced-motion" frontend/src/renderer/styles/ | grep -ci "demo\|onboarding\|drawer"
# EXPECT: ≥1
git grep -rn "matchMedia.*reduced-motion\|prefersReducedMotion" frontend/src/renderer/components/demos/
# EXPECT: ≥1  (the autoplay suppression is JS, not just CSS)

# 6. Boot line is templated, never hardcoded:
git grep -rn "effects loaded" frontend/src/renderer/ | grep -v __tests__
# EXPECT: 1 hit, containing template interpolation (no literal "214")
git grep -rn "214 effects" frontend/src/
# EXPECT: 0 hits

# 7. Esc skip path tested:
git grep -rn 'it(.*Escape' frontend/src/__tests__/components/demos/ frontend/src/__tests__/ | grep -ci "drawer\|tour\|onboarding"
# EXPECT: ≥2  (drawer-close + tour-skip)

# 8. Dismiss-forever round trip + missing-MP4 negative test exist (behavior-keyword grep,
#    feedback_grep-the-test-file-before-claiming-coverage.md):
git grep -rn 'it(' frontend/src/__tests__/ | grep -ci "dismissed\|never opens"
# EXPECT: ≥1
git grep -rn 'it(' frontend/src/__tests__/ | grep -ci "missing demo\|error state"
# EXPECT: ≥1

# 9. Tour cap (P3.7): exactly 5 callout definitions:
git grep -rn "tour\.c[0-9]" frontend/src/renderer/ -h | grep -o "tour\.c[0-9]" | sort -u | wc -l
# EXPECT: 5

# 10. Live-runtime (Gate 18, manual): wipe creatrix.onboarding.* keys → relaunch → boot line,
#     drawer, open y_is_time, Esc paths, dismiss checkbox; screenshot each; name the runtime path.
```
