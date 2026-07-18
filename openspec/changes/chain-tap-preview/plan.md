# Plan — chain-tap-preview

## §1 Context menu
DeviceCard right-click menu gains "Preview to here" (all device types; instruments/racks
also get it on the device header). Action: `openMonitor({trackId, deviceId, stage:'post'})`
→ registry opens a MonitorPanel bound to a chain-prefix tap at that device's CURRENT index
(id-anchored, OD-1a: index recomputed on chain change via store subscription).

## §2 Labeling + lifecycle
Panel title: `<track> · <effect name> k/N · post`. Chain edit → index label updates; device
deleted → empty state ("tap target removed") + close. Tap panels participate in the
monitors LRU exactly as any live monitor (OD-2).

## §3 Tests
Vitest: menu present on every device card fixture; open→panel bound to correct device;
reorder keeps device binding (id-anchored) + label re-indexes; delete → empty state.
Pytest: none new (tap_render covered in device-monitors-v1).
E2E: right-click → panel appears with live frames; reorder chain → label updates.
CU: visual pass on labels/empty state.

## §4 File surface
MODIFIED: DeviceCard (menu item), `panels/MonitorPanel.tsx` (tap-binding + label),
`stores/layout.ts` (tap descriptor in panel state). No backend edits. No
operators.ts/routing.py (wave0 N/A).
