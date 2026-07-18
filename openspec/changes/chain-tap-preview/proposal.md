# Proposal — chain-tap-preview (right-click "Preview to here")

> **Status:** PLANNING (docs-only). Thin cap on `device-monitors-v1` — everything heavy
> (tap_render, MonitorPanel, registry, budget) ships there. Source PRD:
> `~/.claude/plans/creatrix-clip-editor-device-monitors-prd.md`. Depends: device-monitors-v1
> P2+P3 merged. Field-mapping `ARCHITECTURE.md:99` marks "tap point" 🌱 Open — this closes it
> for the preview consumer.

## Locked verdicts (user, 2026-07-18)

- Right-click any device card → **"Preview to here"** opens a FLOATING MONITOR labeled with
  the tap point (track · device k/N · pre/post) — never takes over the main preview.
- Native affordance on instruments/racks; **additive** (context-menu only) on effect
  devices — no per-effect chips beyond what `monitor_default` already grants.

## Open Decisions

### OD-1 · Tap point stability across chain edits
Reorder/insert/delete around a tapped device: **(a RECOMMENDED)** tap follows the DEVICE
(id-anchored; index recomputed; delete → explicit empty state + close affordance) vs (b)
tap pins the INDEX. (a) matches user intent ("what does THIS device output").

### OD-2 · Multiple taps per chain
**Recommended:** allowed, budget-governed by the monitors LRU (a tap IS a live monitor).
No special cap.

## Non-Goals

OS-window promotion (multiwindow Stage B — the panel's pop-out button enables then) ·
tap-as-modulation-source (LayerTap's consumer) · A/B compare layouts (post-MVP with the
budget-policy preferences).

## Grounding

Context-menu precedent: right-click Automate on params (#438, reuses addLane pattern) —
same device-card menu surface. Tap render + panel + empty states: device-monitors-v1 plan
§2-§3. DeviceCard component owns the menu; mask row precedent (MK.3) shows per-device row
affordances scale.
