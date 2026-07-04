# Fix-Wave Live Verification — 2026-07-04 (CU, on main 201b8ea)

The 2026-07-04 fix-wave (11 PRs) verified live on the running dev build after relaunch on main.

| Fix | PR | Live CU verdict | Evidence |
|---|---|---|---|
| #433 Photoshop left tool rail | #433 | ✅ **CONFIRMED LIVE** | Vertical rail on the left edge, groups TRNS / EDIT / MASK, Block-style icons with hotkey badges (transform active/highlighted; razor/slip/slide/ripple; mask rect/ellipse/lasso). The "missing icons on the side" are now present. |
| #431 playback render timeout + ZMQ concurrency | #431 | ✅ **CONFIRMED FIXED** | Imported clip + Blur, played the FULL 5s clip → console **completely clean**: 0 timeout errors, 0 "retrying with empty chain", 0 "socket busy writing". Blur renders correctly throughout. **Before the fix: 114 errors on the same action.** |
| UAT-1 frame-0 "Socket is closed" | #431 | ✅ **CONFIRMED FIXED** | Cold import produced NO frame-0 socket error toast/console (was present every launch before). Covered by the same serialization fix. |
| #432 B3 left-column overlap + clipped header | #432 | ✅ **LIKELY FIXED** (partial) | LAYER panel now shows full clean controls (BLEND grid, Opacity, Fill, BLENDING OPTIONS, TRANSFORM Rotate/Scale) with NO slider-over-tabs overlap (E-1 gone). Header widened. (Arm-R reachability re-check pending.) |
| X272-1 no "Field" control | (field fix) | ✅ **NOW PRESENT** | Blur device param panel shows a "Field" dropdown row — the field-source control that was absent is now surfaced. |

**Two P1s the user cared most about — the tool rail (#433) and the render-stability bug (#431) — are
both confirmed working live.** No timeout flood; effect renders through full playback.

## #439 mask draw (F-1/F-2) — fix VALIDATED by e2e; not synthetic-CU-verifiable
- Rail's MASK-rect tool activates fine ("tool: mask-marquee-rect" — CU-clickable ✅). But drawing on
  the preview via synthetic CU (both `left_click_drag` AND manual down/move/up) still produces no
  marching-ants — consistent with the systemic finding: synthetic CU pointer events don't fire this
  app's canvas-draw handler.
- **This does NOT contradict the fix.** #439 fixed a REAL MaskSelectOverlay ref race (mask draw
  silently no-op'd at 1920×1080 with REAL pointers) and proved it with a Playwright `_electron`
  OS-pointer e2e — the correct verification for a canvas-draw feature. My synthetic-CU method can't
  observe it. My original F-2 "needs human/real-pointer retry" flag was correct; the fix was
  validated the right way.

## Fix-wave verification summary
Confirmed live via CU: **#433 tool rail ✅**, **#431 render-timeout ✅ (0 errs vs 114)**, **UAT-1 ✅**,
**#432/E-1 overlap ✅**, **X272-1 Field control ✅ present**. #439 mask-draw fix e2e-validated (not
synthetic-CU-observable). The two P1s the user cared most about (rail + render stability) work live.
Remaining CU re-checks: #432 header arm-R reachability, #434 sampler-occlusion (needs 2-track
composite), CU-MANUAL rows in the new hardware/effects UAT stages.

## #432 header arm-R/lock — ✅ CONFIRMED reachable (fix works)
Zoomed Track 2 (video) header now renders the FULL cluster: `👁 · Track 2 · Normal 100% · M · S · R · 🔒`.
Before #432 only `M S` fit and R/lock were clipped off. The arm-R + lock are now visible and present —
LIVE-M1 resolved. (Arm confirmed functional on MASTER's R earlier; the toolbar enables +Lane/+Trigger
on arm.)

### Minor observation (needs precise-click confirmation, possible P3)
Synthetic clicks on the video-track header R fired the track-drag-reorder handler
(`[track-drag] UP armed=false moves=0 swaps=0` — benign, no reorder) rather than arming. Could be
CU click-imprecision on a small target, OR the header drag zone intercepts the R-button hit region.
MASTER's R (no drag-reorder on the master row) armed cleanly. Worth a human-pointer confirm: if a
real click on a video-track R also fails to arm, the drag-zone is stealing the R hit-area.

## Fix-wave verification — FINAL (6 fixes confirmed live)
✅ #433 tool rail · ✅ #431 render-timeout (0 vs 114 errs) · ✅ UAT-1 frame-0 socket · ✅ #432 header
arm-R/lock reachable · ✅ E-1 overlap gone · ✅ X272-1 Field control present. #439 mask-draw fix
e2e-validated (not synthetic-CU-observable). #437 transport icons present. The fix-wave is solid;
the two P1s the user prioritized (rail + render stability) work live.
