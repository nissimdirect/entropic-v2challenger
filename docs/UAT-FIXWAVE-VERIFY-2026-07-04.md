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
