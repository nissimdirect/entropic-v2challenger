# UAT — chain-tap-preview

| # | Row | Expected | Method |
|---|---|---|---|
| 1 | Right-click mid-chain effect → Preview to here | Floating monitor opens, live, labeled `track · name k/N · post` | [E2E]+[CU] |
| 2 | Compare tap vs main preview | Tap shows partial chain; main unchanged (downstream effects absent in tap) | [CU] |
| 3 | Reorder chain around tapped device | Tap follows the DEVICE; label re-indexes | [V]+[E2E] |
| 4 | Delete tapped device | Explicit "tap target removed" empty state | [V] |
| 5 | Tap on instrument header | Instrument-output tap (layer-subset form) opens | [CU] |
| 6 | 5 taps open | LRU pause behavior identical to monitors (shared budget) | [V] |
