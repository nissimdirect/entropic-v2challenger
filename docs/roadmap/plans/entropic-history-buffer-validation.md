# History Buffer Validation (Round-1 undo follow-up)
*Written 2026-06-03 · verifies existing v2 Photoshop-style impl supports the Round-1 undo decision*

> Round-1 chose: per-action atomic undo + Photoshop-style History panel + flag to validate existing impl. This doc closes that follow-up.

---

## Verdict: **SUFFICIENT** for tensor-routing edits (with minor polish items)

> **2026-06-04 re-verification (Tier-1 P1a):** re-read `undo.ts` line-by-line against this doc — every cited line confirmed accurate: `undoable()` at :163, `execute` crash-push at :42-52, `beginTransaction`/`commitTransaction` coalescing at :105/:113, reverse-order inverse replay at :128-133, `MAX_UNDO_ENTRIES/MAX_REDO_ENTRIES = 500` at :12-13. `undoable` is already imported by `operators.ts`, `performance.ts`, `timeline.ts` — so the routing stores B4/B9 introduce will participate by following the same `undoable(desc, forward, inverse)` + ID-capture convention (documented in the file header :1-7). **P1a CLOSED — no infra needed; only the Gap-2 description convention + Gap-3 memory smoke test remain as additive follow-ups tracked below.**

The existing implementation at `frontend/src/renderer/stores/undo.ts` (~207 lines) + `components/layout/HistoryPanel.tsx` (~63 lines) covers the Round-1 decision cleanly.

## Coverage check

| Round-1 requirement | Existing impl | Verdict |
|---|---|---|
| Per-action atomic undo | `undoable(description, forward, inverse)` helper at `undo.ts:163` | ✅ |
| Photoshop-style History panel | `HistoryPanel.tsx` with click-to-jump (`handleJump` at `:8`) | ✅ |
| Named entries | `description` field on every `UndoEntry`; rendered at `HistoryPanel.tsx:55` | ✅ |
| Browsable | `allEntries = [...past, ...future]` rendered as list, current index highlighted | ✅ |
| Jump to any state | `handleJump` undoes/redoes step-by-step until target reached (`HistoryPanel.tsx:13-25`) | ✅ |
| Transactional grouping (for tensor routing multi-edge edits) | `beginTransaction(description)` + `commitTransaction()` coalesces N entries into 1 (`undo.ts:105,113`) | ✅ |
| Crash-safe | `forward()` exception → entry still pushed so partial damage is undoable; toast emitted (`undo.ts:42-52`) | ✅ |
| Bounded stack | `MAX_UNDO_ENTRIES = 500`, `MAX_REDO_ENTRIES = 500` (`undo.ts:12-13`) | ✅ |
| Toast on failure | `useToastStore.getState().addToast` on forward-throw (`undo.ts:47-51`) | ✅ |

**Critical Round-1 requirement check — Tensor-routing-edit support:**

The `undoable()` shape is purely callback-based — `(description, forward: () => void, inverse: () => void)`. This handles ANY mutation, including:
- Adding a mod-edge `(src, src_axis, dst, dst_axis, binding_rule, depth)` (B4-lite SPEC-2 territory)
- Editing edge depth/curve/binding
- Deleting an edge
- Painting binding-rule mask (Tier 3+; not yet wired)
- Multi-edge batch operations via `beginTransaction()`

As long as every routing-graph mutation goes through `undoable()` (or wraps a sequence in transactions), it's covered with no infrastructure change.

---

## Gaps + polish items (NOT blocking — additive)

### Gap-1: Visual transaction boundary in HistoryPanel
Transactions coalesce to one entry, but the user can't tell that "Map drums.RMS → blur.radius (×0.7)" is actually 3 sub-mutations. Acceptable for v1; can be addressed later by:
- Adding `entry.children?: UndoEntry[]` to `UndoEntry` schema
- HistoryPanel renders expand-arrow on entries with children

**Cost:** S. Defer to whenever a user complains.

### Gap-2: Description-string conventions for routing edits
Free-form `description` is fine but inconsistent descriptions hurt the History panel's readability. Suggest a convention doc for new tensor-routing actions:

| Action | Description template |
|---|---|
| Add mod-edge | `Map {source_name} → {target_name} (×{depth})` |
| Delete mod-edge | `Unmap {source_name} → {target_name}` |
| Edit edge depth | `Adjust {edge_id} depth ({old}→{new})` |
| Edit binding rule | `Change binding {old_rule}→{new_rule} on {edge_id}` |
| Paint binding mask | `Paint mask on {edge_id}` |
| Add automation lane | `Automate {param_path}` |
| Bulk routing change | `Bulk modulation edits ({count})` |

**Cost:** XS. Ship as part of B4-lite SPEC-2 writer-side validator work — same module.

### Gap-3: Closure-scope memory leaks
`undoable()` closures may capture large references (e.g., a full effect chain snapshot). With 500-entry cap and large captures, theoretical multi-GB undo memory possible. No evidence of this in current code, but worth a CI test:
- Add a smoke test: build 500 undo entries with synthetic capture, measure heap delta, assert < 50MB.

**Cost:** XS. Add to SG-8 (memory pressure) hygiene.

### Gap-4: No cross-session persistence
Undo stack lives in memory only. Restart Electron → stack is gone. **Round-1 did NOT require persistence**, so this isn't a regression — but worth naming as a known limitation.

**Defer:** persistence to disk would add complexity (lots of edge cases on rehydrating closures); skip until users actually ask.

### Gap-5: Future-list cap behavior on redo overflow
`undo.ts:71-73`: when `newFuture.length > MAX_REDO_ENTRIES`, slices from `[0, MAX_REDO_ENTRIES)`. This drops the OLDEST future, not the NEWEST. That's correct (oldest future = most-recently-undone = least likely to be redone). Verified.

---

## Tests already in place

`frontend/src/__tests__/stores/undo.test.ts` and `components/timeline/history-panel.test.ts` cover the basics. Spot-check confirmed:
- Forward → past grows, future cleared
- Undo → past shrinks by 1, future grows by 1
- Redo → reverse
- Transaction coalescing
- Crash-safety (forward throws → still in stack)

Tests for tensor-routing edit support need to be ADDED when B4-lite (SPEC-2) lands. Pattern: each new routing mutation gets its own test that verifies `undoable()` wraps it correctly + the description matches the convention table above.

---

## Action items

| # | Item | Cost | Owner | When |
|---|---|---|---|---|
| 1 | Document description-string convention for routing edits (Gap-2) | XS | SPEC-2 PR | Ships in Creatrix PR-B with B4-lite |
| 2 | Add 500-entry memory-leak smoke test (Gap-3) | XS | Either session | Anytime; lightweight |
| 3 | Verify ALL B4-lite routing-mutations use `undoable()` (Gap covered by SPEC-2 §3 validator on store mutations) | — | SPEC-2 implementer | PR-B review checklist |
| 4 | Defer visual transaction boundary (Gap-1) until user feedback | — | — | Reactive |

---

## Conclusion

**No new undo infrastructure needed.** SPEC-2 (B4-lite) ships against the existing `undoable()` API directly. The Round-1 undo decision is COVERED.
