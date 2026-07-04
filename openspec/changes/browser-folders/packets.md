# Packets — browser-folders

**Emitted:** 2026-07-04 by /packetize. **Plan:** `plan.md` (same dir — packets POINT to its line/section
anchors; do not re-derive). **Proposal:** `proposal.md` — OD-1..OD-8, **T1 Verdicts LOCKED
2026-07-03** ("Accept all 33 defaults") — do not re-open any OD. **Route:** /eng Phase 3M.

**Branching rule (every packet):** cut from `origin/main` only, never from a local checkout that may
be owned by a parallel session — check `~/.claude/.locks/` and `git stash list` for
`parallel-session-*` markers before creating a worktree/branch; if found, do not touch that
session's branch or stash. PR-only; squash; no `.github/workflows/**` edits.

**Merge gate (every packet, STRICT FULL-TIER):** full backend pytest + full vitest green (vitest on
main checkout or CI — worktree executors cannot run vitest) → `Skill(review)` via Skill tool
(ship-gate hook) → full CI green. User-facing packets (P3, P6, P7, P9) additionally require
`Skill(uat)` before merge. HIGH-risk packets (P8) additionally require `Skill(qa-redteam)` before
merge.

**Cross-change constraints baked into Depends below:**
- P6 (PRESETS folder) depends on `wave0-prerouted-presets` **PK.2** (embeddable `PresetBrowser`) —
  proposal Non-goals + plan.md §1 PresetBrowser.tsx row are explicit that this change **consumes**,
  not rebuilds, that primitive.
- No packet in this change touches `frontend/src/renderer/stores/operators.ts` or
  `backend/src/modulation/routing.py` — the "rebase after wave0 merges" rule for those two files is
  **not triggered** by browser-folders (checked against plan.md §1's full file table; recorded here
  so it isn't silently missed).
- No packet in this change adds a new numeric param — the "every new numeric param ships
  curve+unit metadata" rule is **not triggered** (favorites is boolean; USER LIBRARY persists
  existing param shapes verbatim, it does not mint new params).
- `fx-afterimage`/`fx-backspin` DEPENDENT_PARAMS registry dedupe rule is **not applicable** — this
  change touches no effect files.
- P1 (delete UserFolder CRUD, OD-2) races `wave0-prerouted-presets` PK.2, whose own scope note says
  it may also delete this same `browser.ts:11-14,25,31-35,106-145` dead code "if trivially
  separable." Whichever change's packet dispatches second must treat the deletion as
  already-satisfied, not re-apply it.

### P1 — Delete dead `UserFolder` CRUD (OD-2) + reconcile disclosure state (plan.md §3)
- **Scope:** delete `UserFolder` type + `addFolder`/`removeFolder`/`renameFolder`/`addToFolder`/
  `removeFromFolder` (`browser.ts:11-14,25,31-35,106-145`, per OD-2 LOCKED default). Build the
  migration util from plan.md §3: reconcile `entropic-browser`'s `collapsedCategories: string[]`
  (absence=expanded) against `entropic-effect-browser-expanded`'s `Set<string>` (absence-on-first-run
  = all expanded) into one new key (executor names it, e.g. `creatrix-browser-tree-expanded`) keyed
  by full folder path (`"EFFECTS/codec_archaeology"`, `"OPERATORS"`, etc.), per the tie-break rule
  (prefer key 2 when both present). **Non-scope:** `favorites`/`toggleFavorite`/`isFavorite`
  (OD-3, kept — see P7); `hoveredEffectId` (untouched, live consumer `HelpPanel.tsx:5`); do NOT
  delete the old keys (`entropic-browser`, `entropic-effect-browser-expanded`) — house convention is
  read-once-never-delete (plan.md §3), confirmed no example of active localStorage key deletion
  exists anywhere in the codebase.
- **Files:** `frontend/src/renderer/stores/browser.ts` (delete CRUD only — not `activeTab`, that's
  P9); new migration util (e.g. `frontend/src/renderer/stores/browser-migration.ts`).
- **Depends:** none (dispatchable now). **Blocks:** P9 (which deletes the remaining `browser.ts`
  surface — must land after P1 to avoid two packets editing overlapping line ranges).
- **Risk:** LOW.
- **Hard oracle:** `grep -rn "addFolder\|removeFolder\|renameFolder\|addToFolder\|removeFromFolder\|userFolders" frontend/src`
  returns zero hits outside test fixtures (run once BEFORE the packet to confirm the zero-caller
  claim from OD-2 still holds — anti-dead-flag: if this grep finds a real caller, STOP, the OD-2
  premise has changed); returns zero hits period after deletion. New migration unit test passes for
  all 5 documented combinations (both-agree, both-conflict, only-key-1, only-key-2, neither-present).
- **Test plan:** unit — new `frontend/src/__tests__/stores/browser-migration.test.ts` covering the 5
  combinations from plan.md §6 Test Plan; assert output keyed by full folder path, not bare category.
- **STOP:** if the pre-deletion grep finds a real (non-test) caller of any CRUD function, STOP and
  report — do not delete code with a live caller. If `browser.ts` no longer contains the `UserFolder`
  type/CRUD at all (i.e. `wave0-prerouted-presets` PK.2 already deleted it first), treat P1's
  deletion sub-task as already satisfied — do not attempt a redundant edit — and proceed directly to
  building the migration util (the only remaining P1 deliverable), noting in the PR which change
  performed the deletion.
- **Executor brief:** Sonnet. Inline verbatim — Core Rule 1: "Read files before editing — never Edit
  without prior Read." Gate 6 (reproduce): "RUN the failing code first, capture the actual
  error/stack trace... You need the real output" (applies to the pre-deletion grep as the
  "reproduce the zero-caller claim" step). Last line: return PR # + the before/after grep output.

### P2 — Tree data model (no UI) (plan.md §2)
- **Scope:** pure mapping function (new `stores/browser-tree.ts` or extend `browser.ts`) implementing
  the category→subfolder table (plan.md §2): `generator`→GENERATORS, `util`→UTILITIES, `debug`→hidden
  unless present (OD-8), all 26 remaining category strings (incl. `composite`, OD-7)→one EFFECTS
  subfolder each, alphabetical, derived (`Array.from(new Set(...)).sort()`) — **never hand-curated,
  never a hardcoded count**. Also folds in `OPERATOR_GROUPS` (`operator-drag.ts:36-60`) as OPERATORS
  and `RACKS` (`InstrumentsBrowser.tsx:35-54`) as INSTRUMENTS — same data sources, no changes to
  those files. **Non-scope:** any rendering; drag-payload logic; PRESETS/USER LIBRARY (not registry
  categories, handled in P6/P8).
- **Files:** new `frontend/src/renderer/stores/browser-tree.ts` (or equivalent — executor's naming
  call, must not modify `operator-drag.ts` or `InstrumentsBrowser.tsx`).
- **Depends:** none (parallel-safe with P1 — disjoint files). **Blocks:** P3, P4, P5, P6, P7 (all
  consume this data shape).
- **Risk:** LOW.
- **Hard oracle:** unit test with a fixture `EffectInfo[]` covering all 29 known `EFFECT_CATEGORY`
  strings (list in plan.md §2) returns exactly 26 EFFECTS subfolders + GENERATORS(1) + UTILITIES(5)
  when `debug` is absent, and 27 EFFECTS subfolders (incl. `debug`) when present — asserted as an
  exact-count equality, not "at least." `grep -n "28\|29\|26\|27" frontend/src/renderer/stores/browser-tree.ts`
  finds no magic-number branch — the mapping must be structurally data-driven off `list_all()`
  output, never a hardcoded count (OD-8's explicit requirement).
- **Test plan:** unit — new `frontend/src/__tests__/stores/browser-tree.test.ts`: full 29-category
  fixture; debug-present vs debug-absent; composite lands in EFFECTS (not special-cased, OD-7);
  OPERATORS/INSTRUMENTS pass through `OPERATOR_GROUPS`/`RACKS` unchanged.
- **STOP:** if `list_all()`'s live shape (`shared/types.ts:529-539` `EffectInfo`) has drifted from
  `{id,name,category,params,fieldParams}` since plan.md was written, STOP and report before building
  the mapping against a stale shape.
- **Executor brief:** Sonnet. Inline verbatim — Core Rule 1 (read before edit). Gate 5: "wrote or
  modified code → write tests at the RIGHT LAYER: logic/validation → Vitest unit test with mock IPC."
  Last line: PR # + the exact-count assertion output for both debug-present/absent fixtures.

### P3 — Rail + drawer shell (container icons only, no tool zone yet) — **user-facing**
- **Scope:** new `BrowserRail`/`BrowserDrawer` components implementing rail v12 FINAL verbatim
  (plan.md §0: permanent rail, exclusive-accordion per-icon drawer, header row
  `glyph · name · count · «`, **«** is the ONLY close control, container icons carry category color).
  Icon glyph set per plan.md §0 (INSTRUMENTS ⌸, EFFECTS ⌁, GENERATORS ◍, OPERATORS ∿, UTILITIES ⚒,
  PRESETS ▤, USER LIBRARY ⌂ — 16px, 2px stroke, `currentColor` only, extends `tool-icons.tsx`'s
  existing BLOCK-direction convention, does not start a second icon system). ARIA tree contract
  (role="tree"/"treeitem", ↑↓ traverse, ←→ collapse/expand, Enter on leaf triggers existing
  add/drag action). **Non-scope:** MODE/TOOL bottom zone (deferred — folded into P4, see note below);
  folder body contents (P4); mounting as the app's sole sidebar (P9 — this packet's mount is additive/
  dev-visible only, existing switchers stay live until P9).
- **Note on tool-zone sequencing:** plan.md's own packet table doesn't assign the `[tool]`-tab-body
  relocation (cursor + mask tools, `EffectBrowser.tsx:98-163,638-714`) to a numbered packet — its §1
  file table only says the move happens "per §2½" without naming which packet. To avoid silently
  dropping it, it is explicitly folded into **P4** (see P4 scope) rather than assumed here.
- **Files:** new `frontend/src/renderer/components/browser/BrowserRail.tsx`,
  `frontend/src/renderer/components/browser/BrowserDrawer.tsx`. Mount point: executor decides the
  least-invasive additive mount (e.g. a dev-visible secondary sidebar slot) — if that requires
  touching `App.tsx` earlier than P9's planned edit, that is allowed (plan.md's file table is the
  primary-touch list, not exhaustive) but must be called out explicitly in the PR body.
- **Depends:** P2 (needs the folder-list shape to render rail icons against, even with placeholder
  drawer bodies). **Blocks:** P4, P6, P8 (all mount into this drawer shell).
- **Risk:** STD (rail v12 is a LOCKED, previously-litigated spec — deviating from it re-opens a
  closed design fight, treat drift from plan.md §0's verbatim contract as a correctness bug, not a
  style choice).
- **Hard oracle:** ARIA tree contract test — ↑↓/←→/Enter keyboard nav exercised, `role="tree"` and
  `role="treeitem"` present. Exclusive-accordion test: opening rail icon B while A is open closes A
  (assert A's drawer unmounts/collapses, not just visually hidden). Header-row test: only the «
  caret closes a drawer — no ✕ element exists in the DOM (regression guard against re-introducing
  the superseded v11 ✕, rail v12 FINAL note: "✕ removed as redundant").
- **Test plan:** component (Vitest + RTL, mock IPC) — new
  `frontend/src/__tests__/components/browser/browser-rail.test.tsx`,
  `browser-drawer.test.tsx` covering ARIA nav, exclusive-accordion, and the no-✕ regression guard.
- **UAT journey (pixel-verify via `--cx-*` tokens, no raw hex):** open the app → rail visible,
  permanent, collapsed-hugging-rail by default → click each of the 7 icons in turn → drawer opens
  with `glyph · name · count · «` header, colored per container-icon convention → click « → drawer
  closes, rail stays → click a second icon while first is open → first closes (exclusive-accordion,
  visually confirmed) → keyboard: Tab into rail, arrow-key traverse icons, Enter opens drawer.
- **STOP:** if implementing exclusive-accordion or ARIA nav requires deviating from rail v12 FINAL's
  verbatim layout (plan.md §0), STOP and report the conflict — do not silently reinterpret a LOCKED
  spec.
- **Executor brief:** Sonnet. Inline verbatim — Gate 15: "Research Gate? building a new interactive
  UI component (overlay, drag handler, canvas interaction, custom control) → BEFORE writing code,
  search for established open-source implementations... Read their source for the specific
  interaction pattern... Evidence of compliance: cite the reference implementation in a code
  comment." Gate 14: "Wiring Check? finished building a new component that mounts in a parent →
  BEFORE shipping, verify: (a) all props passed, (b) callbacks trigger side effects, (c) all
  interactive elements receive events, (d) entry AND exit paths work, (e) legacy data loads without
  crash." Last line: PR # + screenshot paths for the UAT journey above.

### P4 — Wire EFFECTS/GENERATORS/OPERATORS/UTILITIES/INSTRUMENTS bodies + MODE/TOOL zone into drawers
- **Scope:** relocate `EffectBrowser.tsx`'s per-tab body render logic (line 538-719) into P3's drawer
  shell, one folder per category bucket from P2's mapping. `operator-drag.ts`/`InstrumentsBrowser.tsx`
  themselves stay unchanged — only their render call-sites move (currently
  `EffectBrowser.tsx:586-608` for operators, `App.tsx:3753-3754` + `EffectBrowser.tsx:718` for
  instruments — collapse to ONE call site inside the OPERATORS/INSTRUMENTS drawers respectively, per
  OD-1's "no duplicate entry point" requirement). **Also relocates the MODE/TOOL bottom zone**
  (folded in from P3's note above): `CursorTool`/`TOOL_ENTRIES`/`MASK_TOOL_ENTRIES`/`TOOL_ICON`
  (`EffectBrowser.tsx:98-163,638-714`) move into the rail's bottom monochrome/radio-select zone per
  plan.md §0's drawer contract (corner-dot = has-drawer, zero-option tools drawerless). Drag-channel
  exports (`EFFECT_DRAG_TYPE`/`CREATRIX_NONCE_TYPE`/`SESSION_NONCE`/`DragPayload`/`parseDragPayload`,
  line 22-82) **must keep exact export names and shapes** — `operator-drag.ts` and
  `InstrumentsBrowser.tsx` import them by name. **Non-scope:** search field (P5); PRESETS (P6);
  favorites star (P7); deleting the old tab bar chrome itself (P9 — old and new render paths coexist
  until P9 flips the mount).
- **Files:** `frontend/src/renderer/components/effects/EffectBrowser.tsx` (body + tool-zone
  extraction — becomes the source that P3's drawers render, rename-in-place is executor's call);
  new call sites inside `BrowserRail`/`BrowserDrawer`. `operator-drag.ts`, `InstrumentsBrowser.tsx`
  unchanged (read-only imports).
- **Depends:** P2 (data shape), P3 (drawer shell to wire into). **Blocks:** P9 (old tab bar can't be
  deleted until every entry point it exposed is reachable from the tree — this packet is what makes
  that true). Parallel-safe with P5 once P2 lands (disjoint concern: body wiring vs. search).
- **Risk:** STD.
- **Hard oracle:** drag-payload parity regression — rewrite and pass green:
  `frontend/src/__tests__/components/browser-op-tab.test.tsx`,
  `frontend/src/__tests__/components/effects/effect-browser-tabs.test.tsx`,
  `frontend/src/__tests__/components/wand-tolerance-control.test.tsx` against the new tree structure
  (every draggable that dropped correctly before this packet still drops correctly after — this is
  the anti-dead-flag proof: run these 3 files against pre-packet `main` first to record the
  passing baseline, then confirm identical pass/fail shape post-packet, not just "green"). Zero
  duplicate INSTRUMENTS entry point: `grep -rn "InstrumentsBrowser" frontend/src/renderer` shows
  exactly one render call-site.
- **Test plan:** the 3 rewritten regression files above (component layer, mock IPC) plus a new
  assertion that `EFFECT_DRAG_TYPE` etc. export names are byte-identical to pre-packet (import-name
  stability test, since `operator-drag.ts`/`InstrumentsBrowser.tsx` depend on them by name).
- **STOP:** if collapsing the instruments call-site to one location breaks `hasVideoClips`-gated
  behavior (`InstrumentsBrowser.tsx`'s existing gate) in either of its two current mount contexts,
  STOP — the gate's inputs may differ between the old outer-tab and inner-tab mount points and that
  needs a design decision, not a silent pick.
- **Executor brief:** Sonnet. Inline verbatim — Core Rule 1 (read before edit). Gate 13: "Trace
  Path? fixing a UI behavior bug → BEFORE writing any fix, grep for the setter/action name... across
  ALL files in the project. Read every function in the chain... Fix the actual bottleneck — NEVER
  patch only the first layer you see" (applies to collapsing the two INSTRUMENTS mount points into
  one without breaking either's gate logic). Last line: PR # + the 3 regression files' before/after
  pass counts.

### P5 — One search field spanning everything
- **Scope:** new top-of-browser search component, full browser width, above rail+drawer. Reuses
  `EffectBrowser.tsx:358-384`'s scoring function verbatim (proposal §3: "closest existing analog...
  reused, not reinvented"), extended to also score OPERATORS/INSTRUMENTS/PRESETS entries (not just
  registry effects) into one ranked, folder-grouped result list. Typing expands every folder's
  matching rows grouped under folder headers. **Non-scope:** USER LIBRARY search (P8 lands after;
  add USER LIBRARY to the scored set in P8 if the shell exists by then, otherwise a fast-follow —
  call out explicitly in P5's PR if USER LIBRARY isn't in scope yet, do not silently omit it forever).
- **Files:** new search component (e.g. `frontend/src/renderer/components/browser/BrowserSearch.tsx`);
  extends (does not fork) the scoring function from `EffectBrowser.tsx:358-384` — extract to a
  shared util if that avoids duplicating it across two files.
- **Depends:** P2 (folder data shape). Parallel-safe with P4 (disjoint: body-wiring vs. search-UI).
  **Blocks:** none hard, but P9's full-reachability check should include search-triggered discovery.
- **Risk:** STD.
- **Hard oracle:** a query matching one item in ≥3 different folder kinds (e.g. an EFFECTS row, an
  OPERATORS row, an INSTRUMENTS row) returns all of them in one ranked list, grouped under their
  folder headers, in a single component test run — this exact multi-kind-match scenario doesn't
  exist pre-packet (today's search is EffectBrowser-local only) so it fails before P5 lands and
  passes after (anti-dead-flag).
- **Test plan:** component (Vitest + RTL, mock IPC) — new
  `frontend/src/__tests__/components/browser/browser-search.test.tsx`: multi-kind match, empty
  query (no expansion), Enter-drops-top-hit keyboard flow (spec §3 existing behavior preserved).
- **STOP:** if extending the scoring function to non-registry entities (OPERATORS/INSTRUMENTS)
  requires changing its ranking semantics for the existing EFFECTS case, STOP and report — the
  existing EFFECTS search behavior must not regress.
- **Executor brief:** Sonnet. Inline verbatim — Gate 5 (test at the right layer, component tier
  here since it's UI+store interaction). Core Rule 3: "Do what was asked, nothing more — no bonus
  features" (do not add fuzzy-match tuning, ranking weights, or UI polish beyond the spec's
  described behavior). Last line: PR # + the multi-kind-match test output.

### P6 — PRESETS folder (consumes wave0-prerouted-presets PK.2)
- **Scope:** wire whichever embeddable/chrome-removed `PresetBrowser` primitive
  `wave0-prerouted-presets` PK.2 produces into the PRESETS drawer. If PK.2 has not merged when this
  packet dispatches, ship a minimal chrome-strip fallback instead (remove `PresetBrowser.tsx`'s own
  header/search/category-filter wrapper lines 37,39-47,49-65 only) so PRESETS isn't blocked — do NOT
  re-derive PK.2's full folders/search primitive here (proposal Non-goals, explicit). **Non-scope:**
  building folders/tags/packs inside PresetBrowser (that IS PK.2's job); USER LIBRARY (P8).
- **Files:** `frontend/src/renderer/components/library/PresetBrowser.tsx` (wrapper removal only),
  new call-site inside the PRESETS drawer (P3's shell). No changes to `stores/library.ts`.
- **Depends:** P3 (drawer shell to mount into); **`wave0-prerouted-presets` PK.2** (cross-change,
  hard — named explicitly per campaign convention: this change's PRESETS node consumes PK.2's
  embeddable PresetBrowser). **Blocks:** none.
- **Risk:** STD (depends on external-change sequencing, not on this change's own complexity).
- **Hard oracle:** preset drag/apply regression — the existing preset-apply flow
  (`App.tsx:3756-3778`'s `onApplyPreset` callback) still fires correctly when triggered from inside
  the tree (run pre-packet to confirm current behavior, then confirm identical post-packet
  behavior from the new mount point). Drop-target accepts BOTH `EFFECT_DRAG_TYPE` and the
  pre-existing `application/entropic-preset` MIME channel (grep-confirm the exact constant name
  before wiring, per plan.md §4 — it was not in this change's direct-read set).
- **Test plan:** component — preset apply-from-tree regression test (mock IPC); drag-channel dual-
  accept test (both MIME types land correctly, neither is silently dropped).
- **UAT journey:** open PRESETS drawer → browse/search (whatever PK.2 shipped) → click-apply a
  preset → confirm it applies via `--cx-*` token pixel-check on the resulting chain, not raw hex →
  drag-apply a preset onto a track → same result.
- **STOP:** if `wave0-prerouted-presets` PK.2 has not merged AND the minimal chrome-strip fallback
  would visibly regress existing preset search/filter behavior users rely on today, STOP and report
  rather than shipping a degraded PRESETS drawer — surface the sequencing conflict for a human call.
- **Executor brief:** Sonnet. Inline verbatim — Core Rule 1 (read before edit, especially given
  cross-change dependency on code you didn't write). Gate 18 (Live Runtime Check spirit, generalized):
  before declaring "wired," verify which `PresetBrowser.tsx` is actually on disk (PK.2's version or
  pre-PK.2) — state which one your PR built against. Last line: PR # + which `PresetBrowser.tsx`
  version this packet was built against (PK.2-landed or fallback).

### P7 — Favorites wiring (OD-3) + right-click "Add to Favorites" — **user-facing**
- **Scope:** first UI wiring of the already-shaped `browser.ts` `favorites: Set<string>` /
  `toggleFavorite` / `isFavorite` (OD-3 LOCKED default: reuse, don't delete). New row-hover star +
  context-menu "Add to Favorites" entry on EFFECTS/OPERATORS/GENERATORS/UTILITIES/INSTRUMENTS rows.
  A "Favorites" pseudo-folder (flat, v1 per spec §3) lists exactly the favorited item IDs. **No
  History Ledger row** (OD-4 LOCKED default — treated as a UI preference, same class as
  `sidebarCollapsed`). **Non-scope:** multi-select/color-tagged collections (spec §3 explicitly
  "v2", out of scope); a Ledger entry for this action (OD-4 forecloses it — do not add one).
- **Files:** row-hover star + context-menu entry in the row component built by P4 (no changes to
  `browser.ts`'s store shape — the Set/toggle/isFavorite already exist).
- **Depends:** P2 (folder data), P4 (row components to attach the star to). Parallel-safe with P6.
- **Risk:** LOW.
- **Hard oracle:** star click toggles `useBrowserStore.favorites`, persists across reload
  (localStorage round-trip), and the Favorites pseudo-folder's row list exactly matches the
  favorited-ID set (no extras, no omissions) after 3 toggle operations (add, add, remove).
  `grep -rn "undoable(" frontend/src/renderer/components/browser/` (or wherever P7's new star/
  context-menu handler component lives) over the new star/context-menu handler returns zero hits —
  confirms OD-4's "no History Ledger row" default wasn't silently violated.
- **Test plan:** unit — toggle idempotency (toggling twice returns to original state), persistence
  round-trip. Component — star renders on hover, context-menu entry present, Favorites folder
  reflects live Set state.
- **UAT journey (pixel-verify via `--cx-*` tokens):** hover an EFFECTS row → star affordance
  appears → click → star fills, row confirmed in Favorites pseudo-folder → right-click a different
  row → "Add to Favorites" → same result → toggle off → row disappears from Favorites folder.
- **STOP:** if wiring the star reveals `toggleFavorite`'s existing implementation has a bug (e.g.
  doesn't actually persist, contrary to OD-3's "already-shaped" claim), STOP and report the
  discrepancy rather than silently patching the store shape beyond "first UI wiring."
- **Executor brief:** Sonnet. Inline verbatim — OD-4 LOCKED text: "treat browser favorites as a UI
  preference (same class as `sidebarCollapsed`/`isCategoryCollapsed`) — **no** History Ledger row."
  Core Rule 3 (do what was asked, nothing more — no v2 multi-select creep). Last line: PR # + the
  3-toggle-operation test output.

### P8 — USER LIBRARY folder shell + save schema design — **RISK: HIGH**
- **Scope:** new `~/.creatrix/user-library/` read/write layer (confirmed absent on disk today, per
  proposal item 1g), new top-level USER LIBRARY drawer in the rail. Drag-in (saving) is new
  payload-accepting code on the USER LIBRARY drop target; drag-out reuses whichever MIME/`kind` the
  saved entity's ORIGINAL type used (`'fx'`/`'operator'`/`'instruments'` — plan.md §4, not a new
  outbound kind). File-format schema for a saved device/rack/matte/pose/gesture is **not specified
  anywhere in the source docs** (proposal Non-goals, explicit) — this packet OWNS designing that
  schema as a sub-task, it is not assumed. **Non-scope:** full drag-in/drag-out semantics beyond a
  working round-trip for at least one entity kind (device); multi-entity-kind save UI polish.
- **Files:** new Electron main-process IPC handler(s) for `~/.creatrix/user-library/` file I/O; new
  renderer-side store slice; new USER LIBRARY drawer body (mounts into P3's shell).
- **Depends:** P3 (drawer shell). Sequenced after P6/P7 per plan.md §5 ordering (avoids churn on the
  rail shell while other drawers are still stabilizing) — soft dependency, not a hard file conflict.
  **Blocks:** P9 (USER LIBRARY must be reachable from the tree before old switchers are deleted, per
  OD-1's zero-duplicate-entry-point requirement — though USER LIBRARY has no old-UI equivalent, so
  this is more "must exist" than "must migrate").
- **Risk:** **HIGH** — greenfield persistence format + touches Electron main-process file I/O
  (PLAYBOOK's atomic-write convention applies, per plan.md §5's own risk flag) → **Opus-tier
  executor + mandatory `Skill(qa-redteam)` before merge.**
- **Hard oracle:** round-trip test — drag a device into USER LIBRARY, restart the app (or reload the
  store fresh), drag it back out, resulting effect instance is **byte-identical modulo a new
  instance UUID** to the original. Atomic-write proof: kill the process mid-write (simulated) does
  not leave a corrupt/partial file on disk (empty-or-complete invariant). Path-traversal guard: a
  saved-entity name containing `../` or absolute-path characters is rejected/sanitized before it
  reaches the filesystem write call (trust-boundary check — untrusted string from renderer UI
  reaching a real disk write in main process).
- **Test plan:** component (Vitest, mock IPC to a fake filesystem) — round-trip save/load; malformed/
  hostile filename rejection. If any part of the write path is exercised only correctly through a
  real Electron main process (not mockable), add ONE Playwright `_electron` E2E smoke test and
  justify why per Gate 5 (process lifecycle/OS integration).
- **Trust-boundary rule (must verify with a caller grep, not assumed):** the REAL boundary is the
  IPC handler in the Electron main process that receives the save payload from the renderer — that
  is where filename/path sanitization and schema validation must live, not a deserializer that
  nothing calls. Grep the actual `ipcMain.handle(...)` call site before writing the validation and
  cite it in the PR.
- **STOP:** if no existing atomic-write helper exists in the codebase for main-process file I/O
  (check before building one, don't assume PLAYBOOK's rule is already implemented elsewhere), STOP
  and report — building a new atomic-write primitive is a bigger sub-task than this packet's
  schema-design scope implies, and needs an explicit go-ahead. If the schema design can't cover at
  least one full entity kind (device) end-to-end within this packet, STOP and report a narrower v1
  scope rather than shipping a partial/ambiguous format.
- **Executor brief:** Opus-tier (HIGH risk, greenfield persistence + IPC trust boundary). Inline
  verbatim — Gate 12: "Self-Critique? completed a multi-file feature or task → BEFORE committing,
  self-review: (a) Does this feature work end-to-end? (b) Is state management consistent? (c) Are
  trust boundaries validated? (every external input: type + range + finite check) (d) If this
  feature spans multiple layers, verify a test exercises the full integration path. (e) Read
  PLAYBOOK.md (if exists in project root) for project-specific checks." Trust-boundary rule above
  (verify with a caller grep). Last line: PR # + round-trip byte-identity proof + qa-redteam summary
  link.

### P9 — Delete outer `sidebarTab` + inner `activeTab` (OD-1) — the "flip the switch" packet
- **Scope:** per OD-1's LOCKED default ("the new tree/rail replaces both layers in one motion"):
  delete `App.tsx:433`'s `sidebarTab` `useState` + the 3-button tab bar + conditional render block
  (`App.tsx:3725-3779`); delete `browser.ts`'s `BrowserTab`/`BROWSER_TABS`/`activeTab`/`setActiveTab`
  (`browser.ts:8-9,18-20,82-86`); delete `EffectBrowser.tsx`'s remaining 5-tab bar chrome
  (line 487-501) since P4 already relocated every tab's body content. Mount the new tree/rail (P3-P8)
  as the sole sidebar content, replacing the additive/dev-visible mount from P3. **Non-scope:** any
  new feature work — this packet is pure deletion + one mount-point swap. `layout.ts`'s
  `sidebarCollapsed` binary toggle and the `meta+b` shortcut binding are explicitly UNCHANGED (plan.md
  §1 row — rail is permanent per v12 FINAL, Cmd+B still hides/shows the whole sidebar panel, do not
  reintroduce the spec's superseded "3-way cycle" reading).
- **Files:** `App.tsx` (delete `sidebarTab` state + render block, swap mount point),
  `frontend/src/renderer/stores/browser.ts` (delete `BrowserTab` enum surface — single-flights after
  P1's CRUD deletion in the same file), `frontend/src/renderer/components/effects/EffectBrowser.tsx`
  (delete residual tab-bar chrome — single-flights after P4/P5/P7's edits to this file).
- **Depends:** P1 through P8, ALL — this is explicitly the terminal packet; every other packet's
  surface must already be reachable from inside the tree before the old switchers are deleted, per
  plan.md §5's explicit warning ("or the app has a dead period with no sidebar UI at all"). **Blocks:**
  none (terminal).
- **Risk:** STD — touches the mount point every other packet's UI now lives inside; low code-novelty
  but high blast-radius if a reachability gap was missed.
- **Hard oracle:** full click-through UAT — every entry reachable today via
  `sidebarTab='effects'/'presets'/'instruments'` AND via
  `EffectBrowser.activeTab='fx'/'op'/'composite'/'tool'/'instruments'` is reachable from exactly ONE
  place in the new tree. Build this as an explicit checklist derived from plan.md §1's file table
  (one row per old entry point) and check off each one with a screenshot. `grep -rn "sidebarTab\|BrowserTab\|BROWSER_TABS" frontend/src`
  returns zero hits after this packet (anti-dead-flag: confirm nonzero before, to prove the grep is
  actually exercising real code, not already-dead references).
- **Test plan:** E2E (Playwright `_electron`, justified per Gate 5 — this is exactly the "process
  lifecycle/OS integration" tier: real drag-and-drop across real Electron windows isn't reliably
  exercised by jsdom) — the two smoke specs from plan.md §6: (1) launch app, open rail, expand
  EFFECTS, drag an effect onto a track, confirm it lands in the chain; (2) Cmd+B still hides/shows
  the sidebar panel (regression guard against the superseded 3-way-cycle reading).
- **UAT journey (pixel-verify via `--cx-*` tokens, no raw hex):** the OD-1 checklist above, executed
  as a live click-through: open app → confirm NO old 3-button tab bar visible anywhere → open each
  of the 7 rail folders → confirm every device/effect/preset/rack that was reachable pre-change is
  reachable now → confirm exactly one INSTRUMENTS entry point exists (not two) → Cmd+B → sidebar
  panel (rail + all drawers) hides as one unit → Cmd+B again → returns.
- **STOP:** if the click-through checklist finds even one pre-change entry point NOT reachable from
  the new tree, STOP — do not delete the old switcher for that surface; report which packet (P4/P6/
  P7/P8) needs a follow-up fix first. Do not ship a "mostly reachable" tree.
- **Executor brief:** Sonnet. Inline verbatim — Gate 13: "Trace Path? fixing a UI behavior bug →
  BEFORE writing any fix, grep for the setter/action name... across ALL files in the project. Read
  every function in the chain... Fix the actual bottleneck — NEVER patch only the first layer you
  see" (applies directly: `sidebarTab`/`activeTab` are exactly this kind of setter-chain, grep both
  across the whole frontend before deleting). Gate 20 spirit: before declaring this packet (and by
  extension the whole change) done, name the full OD-1 checklist, tally what's reachable, and report
  any gap rather than a bare "done." Last line: PR # + the completed OD-1 reachability checklist with
  a screenshot per row.

## Single-flight map
| File | Packets | Order |
|---|---|---|
| `frontend/src/renderer/stores/browser.ts` | P1 (delete UserFolder CRUD), P9 (delete BrowserTab/activeTab) | P1 → P9 |
| `frontend/src/renderer/stores/browser.ts` (UserFolder CRUD only) | `wave0-prerouted-presets` PK.2 (optional/soft), P1 (authoritative) | whichever lands first wins; the other is a no-op |
| `frontend/src/renderer/components/effects/EffectBrowser.tsx` | P4 (body + tool-zone relocation), P5 (search extraction), P7 (favorites star on rows), P9 (delete residual tab-bar chrome) | P4 → P5 → P7 → P9 |
| `frontend/src/renderer/components/library/PresetBrowser.tsx` | `wave0-prerouted-presets` PK.2 (external), P6 (chrome-strip/consume) | PK.2 → P6 |
| `frontend/src/renderer/App.tsx` | P3 (additive dev-mount, best-effort), P9 (delete `sidebarTab` + swap mount point) | P3 → P9 |
| `frontend/src/renderer/components/browser/BrowserRail.tsx` / `BrowserDrawer.tsx` | P3 (create), P4/P5/P6/P7/P8 (mount bodies into drawers) | P3 → {P4,P5,P6,P7,P8} |

## Coverage check (plan.md → packets)
Dead-code deletion (OD-2) + disclosure-state migration (§3) → **P1**. Tree data model / category
mapping (§2) → **P2**. Rail + drawer shell / ARIA contract (§0, rail v12 FINAL) → **P3**. Body wiring
for EFFECTS/GENERATORS/OPERATORS/UTILITIES/INSTRUMENTS + MODE/TOOL zone (§1 EffectBrowser.tsx row,
explicitly folded in per P3's note since plan.md's packet table didn't number it) → **P4**. One
search field (§ proposal item 3) → **P5**. PRESETS folder / Wave-0 consumption (proposal Non-goals,
§1 PresetBrowser.tsx row) → **P6**. Favorites wiring (OD-3) + no-Ledger-row (OD-4) → **P7**. USER
LIBRARY shell + save schema (proposal item 1g, Non-goals schema-design carve-out) → **P8**. Outer +
inner tab-system deletion (OD-1) → **P9**. Drag-channel extension (§4: GENERATORS/UTILITIES reuse
`kind:'fx'`, PRESETS dual-MIME accept, USER LIBRARY reuses original kind on drag-out) → distributed
across **P4** (channel export stability), **P6** (dual-MIME accept), **P8** (drag-out reuse + drag-in
new accept). `layout.ts`/`default-shortcuts.ts` (no-change rows) → explicitly verified unchanged by
**P9**'s Cmd+B regression test, not a separate packet. OD-7 (composite→EFFECTS subfolder) and OD-8
(debug category, dev-only, data-driven) → both covered by **P2**'s mapping function tests. Nothing
descoped; the one gap surfaced during packetizing (tool-zone relocation's un-numbered plan.md
assignment) is explicitly folded into P4 above, not silently dropped.

## Ledger
| Packet | Status | PR | Oracle evidence |
|--------|--------|----|-----------------|
| P1 | ⬜ | — | — |
| P2 | ⬜ | — | — |
| P3 | ⬜ | — | — |
| P4 | ⬜ | — | — |
| P5 | ⬜ | — | — |
| P6 | ⬜ | — | — |
| P7 | ⬜ | — | — |
| P8 | ⬜ | — | — |
| P9 | ⬜ | — | — |
