---
title: Hotkey discoverability sprint — close #65
status: completed
session: 2026-05-14
issue: 65
seed_pr: 64
branch: feat/hotkey-discoverability
worktree: ~/Development/entropic-hotkeys-wt
---

# Hotkey discoverability sprint

Close epic #65: every action invokable by keyboard shortcut shows the
shortcut at point of invocation (menus, context menus, palette).

PR #64 shipped the seed (clip context menu, `prettyShortcut()` util,
`MenuItem.shortcut?:` prop). This sprint sweeps the remaining surfaces.

## Architectural finding (informs all tasks)

The shortcut registry (`utils/default-shortcuts.ts`) only binds 35
actions today. Most menu items (Duplicate Track, Group with Previous,
Freeze up to here, etc.) have NO registered shortcut. Wiring
`shortcut: prettyShortcut(getEffectiveKey('<id>'))` on those items
renders nothing today (because `prettyShortcut(undefined) → undefined`
and the ContextMenu does `{item.shortcut && <span>...</span>}`), but
**future-proofs the surface** — the second any of these actions get
bound, the hint appears with zero further work.

This is the right call per the plan's exit criterion ("any action the
user can invoke with a keyboard shortcut shows that shortcut"). We are
NOT adding new shortcut bindings in this sprint — that's a separate UX
decision about which actions deserve keys.

## Tasks

### Code wiring

- [x] **T1 — Track header context menu** (`frontend/src/renderer/components/timeline/Track.tsx`)
      Wire `shortcut: prettyShortcut(shortcutRegistry.getEffectiveKey('<id>'))`
      on every static MenuItem in `getTrackMenuItems()`. Action IDs to
      probe: `duplicate_track`, `rename_track`, `move_track_up`,
      `move_track_down`, `delete_selected_track`. Dynamic "Add Lane:" /
      "Add Trigger:" items remain bare (no per-param shortcuts).
- [x] **T2 — Device Chain context menu** (`frontend/src/renderer/components/device-chain/DeviceChain.tsx`)
      Wire `shortcut` on the two items: "Group with Previous"
      (`group_with_previous`), "Ungroup" (`ungroup`).
- [x] **T3 — Effects rack right-click menu** (`frontend/src/renderer/components/effects/EffectRack.tsx`)
      Replace the bespoke `effect-rack__context-menu` div (lines 152–207)
      with the shared `ContextMenu` component. Map the 4 actions
      (Freeze up to here / Unfreeze / Flatten to video / Save effect
      as preset) into a `MenuItem[]` array with `shortcut` lookups
      (`freeze_up_to`, `unfreeze_effects`, `flatten_to_video`,
      `save_effect_preset`). Delete the bespoke menu CSS hook if
      orphaned. Preserve `useStableListener` dismissal behavior via
      ContextMenu's built-in close handlers.
- [x] **T4 — Top-bar Electron menus audit** (`frontend/src/main/menu.ts`)
      Cross-reference `default-shortcuts.ts` ↔ `menu.ts`. For each
      bound action that has a top-bar entry, verify the label includes
      `\tCmdOrCtrl+...`. Expected to be near-complete already (most
      already match). Document any gaps; fix the obvious ones.

### Audit-only (no code)

- [x] **T5 — Marker right-click** (`frontend/src/renderer/components/timeline/MarkerFlag.tsx`)
      Currently no menu — right-click directly deletes the marker. No
      action ID, no menu surface to attach a shortcut to. **Audit
      conclusion only**: out of scope; convert to a real menu in a
      future PR if the silent-delete UX becomes friction.
- [x] **T6 — Automation node right-click** (`frontend/src/renderer/components/automation/AutomationNode.tsx`)
      Same as T5 — right-click directly removes the node. Audit
      conclusion only.
- [x] **T7 — Preferences → Shortcuts tab** (`frontend/src/renderer/components/layout/ShortcutEditor.tsx`)
      Already uses `shortcutRegistry.getAllBindings()` so it surfaces
      everything in the registry automatically. **Audit conclusion**:
      no gap, no code change.

### Cleanup

- [x] **T8 — Plan file consolidation**
      Delete the un-tracked `docs/plans/2026-05-14-upcoming-ux-items.md`
      from the v2challenger checkout once this sprint ships (item 1 of
      that file is the work being done here; items 2 + 3 already have
      their own future-pickup notes).

## Test Plan

### What to test

- [ ] Each wired MenuItem with a bound shortcut renders the `<span class="context-menu__shortcut">` with the formatted glyph
- [ ] Each wired MenuItem WITHOUT a bound shortcut renders NO shortcut span (no empty span, no spurious whitespace)
- [ ] EffectRack refactor preserves all 4 actions: Freeze up to here, Unfreeze, Flatten to video, Save effect as preset
- [ ] EffectRack refactor preserves Freeze/Unfreeze/Flatten visibility logic (only show when `checkFrozen(index)` matches)
- [ ] EffectRack refactor preserves keyboard dismissal (Escape closes) and click-outside dismissal
- [ ] Top-bar menus continue to render with the existing accelerators (no regression — Electron native)
- [ ] All existing context-menu tests still pass (PR #64 baseline)

### Edge cases to verify

- [ ] `getEffectiveKey('nonexistent_action')` → returns empty string → `prettyShortcut('')` → returns `undefined` → no span (verify the chain explicitly)
- [ ] If a user adds an override that re-binds `delete_selected` to a new key, the Track / Effects menus pick up the new glyph on next render (no stale cache)
- [ ] Re-opening a context menu after dismissal shows fresh shortcut values (no closure capture of old keys)
- [ ] Long shortcut strings (e.g. `meta+shift+alt+ctrl+k`) don't overflow the menu width — current `--menu-min-width: 180px` should clamp
- [ ] Disabled MenuItems still render their shortcut span (current ContextMenu logic — verify)
- [ ] Empty-items case in DeviceChain (returns null) is unchanged

### How to verify (reproduction commands)

```bash
# Worktree
cd ~/Development/entropic-hotkeys-wt

# Frontend unit (Vitest — must use --no flag per CLAUDE.md)
cd frontend && npx --no vitest run

# Specific test file
cd frontend && npx --no vitest run src/renderer/components/timeline/ContextMenu.test.tsx

# E2E (Playwright)
cd frontend && npx playwright test --grep "context menu"

# Backend (no backend changes expected but run for regression)
cd backend && python -m pytest -x -n auto --tb=short
```

**What "working" looks like:**
- Existing shortcut-bound items (e.g. "Split at Playhead ⌘K" in clip menu) still display
- After T1: Track header items render WITHOUT shortcut spans today (because actions not bound), and the menu width / spacing is identical to pre-change
- After T3: Effects rack right-click opens the SAME 4 actions, in the same order, with the same visibility logic — only the underlying component changed
- All tests green

**What "broken" looks like:**
- A shortcut span renders for an unbound action (e.g. "Duplicate Track ⌘D" when meta+d is bound to `duplicate_effect`, not `duplicate_track` — would be a false positive)
- EffectRack loses an item, changes order, or breaks Freeze visibility logic
- Click-outside or Escape no longer dismisses the menu after T3 refactor

### Existing test patterns to follow

- Test framework: Vitest (frontend) + Playwright E2E
- Component test example: `frontend/src/renderer/components/timeline/__tests__/ContextMenu.test.tsx` (if exists) — uses RTL + `@testing-library/react`
- Pattern from PR #64: tests assert `getByText('⌘K')` is in the document
- New tests to add:
  1. `Track.test.tsx`: render the track header menu, assert each MenuItem's `shortcut` prop is queried from the registry (mock registry, assert call args)
  2. `DeviceChain.test.tsx`: same pattern, 2 items
  3. `EffectRack.test.tsx`: refactor test — assert the 4 actions render, Freeze visibility logic preserved, Escape dismisses
  4. Snapshot diff on shared ContextMenu rendering: no behavior change

## Acceptance / exit criteria (from #65)

- [x] Every shared-ContextMenu MenuItem in the codebase has `shortcut` wired (mechanical pattern applied)
- [x] EffectRack bespoke menu refactored to use shared component
- [x] Top-bar audit complete with one fixable gap closed (Help → Generate Support Bundle now shows ⌘⇧D)
- [x] All frontend tests green (1620 passed, 4 skipped — no regressions; backend untouched)
- [x] PR opened with `Closes #65` in body
- [x] T5 / T6 / T7 audit conclusions documented in PR description

## Non-goals (explicitly out of scope)

- Adding NEW shortcut bindings (e.g. don't bind `duplicate_track` to a key)
- Converting silent right-click handlers (Marker, Automation node) into menus
- Refactoring the Preferences ShortcutEditor UI
- Touching top-bar menu items that have no shortcut (e.g. Speed/Duration, Reverse)
- Effects panel max-height changes (item 3 of upcoming-ux-items, separate sprint)
- Left-side arrangement layout redesign (item 2, separate sprint)
