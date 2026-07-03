# Feature-Flag Audit + CU-UAT Handoff — 2026-07-03

**For the CU-UAT session.** Source of truth: `frontend/src/shared/feature-flags.ts` (audited 2026-07-03).
Every flag below must be verified in its DEFAULT state AND regression-tested on flip. Toggling is
runtime (devtools console + reload) — no rebuild needed.

## Two flag polarities (READ FIRST — the flip direction differs)
- **Bugfix flags (`F_0512_*`) — DEFAULT ON** (fix active). `isFixEnabled('f-0512-N')`.
  DISABLE (revert to OLD buggy behavior) at runtime:
  `localStorage.setItem('entropic-disable-f-0512-N','1'); location.reload()`
- **Feature flags (`F_CREATRIX_LAYOUT`) — DEFAULT OFF** (feature hidden). `isEnabled('creatrix-layout')`.
  ENABLE at runtime: `localStorage.setItem('entropic-enable-creatrix-layout','1'); location.reload()`
  ⚠️ **This default is being flipped to ON in wave-1 (task #20).** After that PR merges, the CU baseline
  IS the Creatrix layout — re-audit both states then.

## Regression protocol (per flag — "regression test every flag flip")
For EACH flag: (1) verify the DEFAULT-state behavior on the live app (screenshot). (2) FLIP it (disable a
bugfix / enable a feature), reload, verify the OTHER state renders without crash and behaves as described.
(3) FLIP BACK, confirm no residue (stale DOM, wrong state). A flag that can't cleanly round-trip is a bug.
Kill+relaunch (not HMR) for any flag that changes store shape or the app shell (F_CREATRIX_LAYOUT).

## FEATURE FLAG (default OFF → being flipped ON)
| Flag | Gates | Default | CU test (BOTH states) |
|---|---|---|---|
| `F_CREATRIX_LAYOUT` | Creatrix CSS-grid app shell (cx-left-col/cx-right-col), **LayerPanel**, 4 resize handles (App.tsx ~3402/3496/3562/3622/3656/3686; stores/layout.ts:66 grid vars) | **OFF** (→ ON in #20) | OFF = legacy sidebar layout. ON = grid shell + LayerPanel mounts, `app--creatrix` class, all 4 resize handles drag, no console errors. **Biggest regression surface — full pass in BOTH states.** Requires kill+relaunch. |

## BUGFIX FLAGS (default ON — flip OFF reverts to the OLD bug; confirm the fix still holds)
### P0
| Flag | Fix (ON) → bug (OFF) | CU surface |
|---|---|---|
| `F_0512_14_SPACE_TRANSPORT` | Space play/pause coordinates audio+timer+resets transport direction | Press Space repeatedly; audio+playhead stay in sync; direction resets |
| `F_0512_29_RELOAD_REBIND` | Project reload triggers a render once activeAssetPath rebinds | Reload a project → preview renders (not blank) |
### P1
| Flag | Fix | CU surface |
|---|---|---|
| `F_0512_6_UNDO_RERENDER` | requestRenderFrame reads chain from store not stale closure | Undo an effect change → preview updates |
| `F_0512_19_TRACKS_RERENDER` | render useEffect subscribes to `tracks` | Add/remove track → preview re-renders |
| `F_0512_17_STATUS_BAR_CANVAS` | status bar reads canvasResolution not last frame width | Status bar shows true canvas res |
| `F_0512_2_CMD_I_HINT` | empty-state hint reads `[Cmd]+[I]` | Empty timeline hint text |
| `F_0512_30_CARD_WIDTH` | device-card 160-280px (4-knob fits one row) | Effect device cards; **CSS-disable via body attr** |
| `F_0512_32_RENAME_FOCUS` | rename input focuses after context menu unmounts | Right-click rename → input focused |
### P2
| Flag | Fix | CU surface |
|---|---|---|
| `F_0512_1_WELCOME_MODAL` | New Project clears autosave+crashReports+gate on welcomeDismissed | New Project flow |
| `F_0512_3_TITLE_BAR` | title bar "Creatrix" while WelcomeScreen up | Launch title (matches Stage A) |
| `F_0512_7_EXPORT_DOUBLE_EXT` | save-path strips macOS double extension | Export filename has one extension |
| `F_0512_23_DERIVED_FILTER` | save-path filter derived from defaultName ext | Export dialog filter |
| `F_0512_22_ERROR_FORMAT` | export error = `<Type>: <msg>` | Trigger an export error |
| `F_0512_8_CLIP_THUMBS` | clip thumbnails distribute evenly across width | Clip filmstrip; **CSS-disable**; ⚠️ interacts with task #19 (zoom-responsive thumbs) — coordinate |
| `F_0512_16_ESCAPE_LOOP` | 2nd Stop/Esc clears unintended loop region | Set loop → Esc twice → cleared |
| `F_0512_21_OPACITY_LABELS` | "Clip opacity" vs "Track opacity (multiplies)" | Opacity slider labels |
| `F_0512_25_ZOOM_PERSIST` | timeline zoom persists in .glitch | Zoom → save → reload → zoom kept |
| `F_0512_34_ARM_HINT` | automation toolbar tooltips + no-track-armed hint | Automation toolbar (R/L/T/D) |
| `F_0512_36_TRANSFORM_HEIGHT` | transform panel max-height so effect search visible | Params panel scroll; **CSS-disable** |
| `F_0512_37_SHORTCUTS_TAB` | Help→Keyboard Shortcuts opens Prefs Shortcuts tab | Help menu |
| `F_0512_12_PREVIEW_ASPECT` | preview canvas locks CSS size to bitmap; BBox contain-fit aligns | Preview aspect + bounding-box overlay alignment |

## CSS-disable flags (revert visually via `body[data-disable-*]`, no remount)
`F_0512_8`, `F_0512_30`, `F_0512_36` — `applyCssDisableFlags()` sets a body attr; CSS reverts. Toggle and
watch the DOM attribute + visual state both flip.

## Coordination notes for the CU session
- Task #19 (zoom-responsive clip thumbnails) touches the SAME area as `F_0512_8_CLIP_THUMBS` — test them
  together; the new zoom behavior must not break the even-distribution fix.
- Task #20 flips `F_CREATRIX_LAYOUT` default ON — once merged, redo the layout pass with ON as baseline.
- Any NEW feature landing this session (master-out bus #18, AA.4 automation select/move) may add flags —
  re-grep `feature-flags.ts` at session start; this audit is a 2026-07-03 snapshot.
- **No hidden flags found outside `feature-flags.ts`** as of this audit (grep `isEnabled`/`isFixEnabled`).
