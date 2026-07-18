# UAT — device-monitors-v1

> Legend: [V]=vitest · [PT]=pytest · [E2E]=Playwright `_electron` · [CU]=computer-use visual.

| # | Row | Expected | Method |
|---|---|---|---|
| 1 | Open sampler monitor (default ON) | Floating panel, live proxy frames ~10fps, labeled with device | [CU] |
| 2 | Drag monitor by header / resize corner | Moves/resizes; bounds persist across relaunch; off-screen restore clamps | [E2E] |
| 3 | Click-to-front among 3 panels | z cycles within panel tier; dialogs still above; preferences below | [V]+[CU] |
| 4 | Open 5th live monitor | Least-recently-viewed pauses (frozen frame + ▶); resume swaps LRU | [V] |
| 5 | Rack output monitor | Shows rack's summed output, not master | [PT equiv]+[CU] |
| 6 | Per-pad chip → pad monitor | Only that pad's layers render | [PT equiv] |
| 7 | Temporal effect (e.g. datamosh) | Chip visible by default; blanket effect (e.g. blur) chip absent, right-click present | [V registry-driven] |
| 8 | Flip registry monitor_default in fixture | Chip presence follows field (no hardcoded names) | [V] |
| 9 | Chain-prefix tap == truncated chain | tap_render(chain[:k]) byte-equal to full render of truncated chain | [PT] |
| 10 | Tap under load | Main preview cadence unaffected beyond epsilon; taps drop frames (latest-wins) | [PT perf] |
| 11 | Delete monitored device | Panel shows explicit empty state, not stale frame | [V] |
| 12 | Malformed tap requests | Bad index/track/NaN → ok:false, server up | [PT] |
| 13 | Matte/alpha content monitored | Checkerboard composite (backend), never black garbage | [CU] |
| 14 | Undo History + operators overlay | Render exactly as before (floating-panel regression) | [V]+[CU] |
| 15 | Monitor cost visible | Statusbar warn >30% budget (or System Monitor rows if landed) | [V] |
