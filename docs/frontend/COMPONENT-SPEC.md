# COMPONENT-SPEC — the Creatrix component contract

> **Status: LAW** (frontend framework F1, 2026-07-30). Short by design — every rule here is
> backed by a script or test, per the governing rule in `CONTRIBUTING.md` §Frontend UI Law:
> *a rule that lives only in a document is a wish.* Two previous component docs rotted
> (`docs/COMPONENT-TEST-MATRIX.md`, `docs/COMPONENT-ACCEPTANCE-CRITERIA.md` — see their
> supersede headers); this one stays small and lets machines carry the enumeration.
> Inventory is GENERATED, never hand-maintained: `frontend/scripts/component-inventory.sh`.

## 1 · The state contract

Every component's states come from ONE enumeration, split by applicability:

| Applies to | States |
|---|---|
| Interactive controls (buttons, chips, knobs, sliders, inputs) | `rest · hover · focus-visible · active · disabled` |
| Containers (panels, lists, previews, monitors) | `empty · loading · error` |

- States are expressed as **BEM modifiers** on the block: `.device-card--disabled`,
  `.monitor-panel--empty`. Never a new naming scheme, never bare `.disabled`.
- Don't ship checkbox states: a container that can't meaningfully be `loading` doesn't
  declare it. Declare what the component can actually render.
- Precedent to copy: `Inspector` (explicit per-state files) and `UnsavedChangesDialog`
  (documented lock-state prop).

## 2 · Selector contract (test-ids)

Every shared primitive ships a stable **`data-testid`** as part of its anatomy. Tests target
test-ids ONLY — never CSS classes (classes change with styling; test-ids are versioned API).
This is the structural fix for the selector rot that killed the old 132-spec Playwright suite.

## 3 · Primitives — adopt, don't reinvent

| Need | Use | Adoption ratchet |
|---|---|---|
| Slider | `components/common/Slider` | `ui-ratchets.sh` `tsx_raw_range` (34 → 0, F3-C2, hard ban) |
| Select | `components/common/Select` | `ui-ratchets.sh` `tsx_native_select` (56 → 0, F3-C3, hard ban) |
| Dialog | `dialog`/`dialog__*` root (`UnsavedChangesDialog` pattern) | conformance guard (below) + F3 sweep (10 dialogs, 7 roots → 1) |
| Empty state | `EmptyState` (F3; RATIFIED D7: minimal hint, WCAG AA contrast) | PK.D UAT contrast oracle |
| Layout shell | `PanelShell / Stack / Row` under `@layer` (F3) | layout-shell declarations stop multiplying |

"Primitive built" means nothing — **"counter went down" is the done signal.**

## 4 · Token governance

Three tiers in `frontend/src/renderer/styles/tokens.css`: primitive → semantic → component.
**Components reference semantic tokens only** (`--cx-text-1`, `--cx-bg-panel`), never
primitives. Colors: no raw hex outside tokens.css (`hex-ratchet.sh` + `ui-ratchets.sh`).
Type: floor 12px; scale = RATIFIED D6 **Scale B+1** (heading 16/650 · body 14/450 ·
label 13/600 · data 12/450), landing as tokens in ui-foundation PK.A. Deprecations use
alias → migrate → delete, never big-bang swaps.

## 5 · Companion guards (the scripts that make this law)

| Rule | Guard | Status |
|---|---|---|
| Colors/type/primitive adoption | `scripts/hex-ratchet.sh` + `scripts/ui-ratchets.sh` (vitest live-tree tests) | **LIVE in CI** |
| New primitives must have tests | `src/__tests__/component-spec-guard.test.ts` (current 7 grandfathered) | **LIVE in CI** |
| New dialogs must use the canonical root | `component-spec-guard.test.ts` (existing 9 non-conforming grandfathered) | **LIVE in CI** |
| Preload capability surface | `src/__tests__/preload-surface-snapshot.test.ts` | **LIVE in CI** |
| Inventory (who exists, who's tested) | `scripts/component-inventory.sh` (informational, run on demand) | LIVE |
| Dialog-root count → 1, primitive test debt → 0 | F3 adoption sweep, one dialog per PR, ledger row each | F3 |

Kill criteria: any guard whose grandfather-list is unchanged after 90 days → investigate;
list at zero → collapse into a hard rule.
