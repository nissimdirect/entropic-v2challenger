# LEARNING-PATH — Electron + design-systems fluency for the owner

> Framework F1 (2026-07-30), pillar P6. Purpose: you (nissim) able to watch, review, and
> eventually change the Creatrix frontend. Each step names a REAL file to open — read code
> with the concept fresh. Pace: one step per session-ish; order matters. Companion rituals:
> every UI PR carries a WALKTHROUGH written for you + before/after screenshots, and one
> 30-minute guided session per month where YOU drive (OD-5 verdict).

## Step 1 — What an Electron app is
Three processes: **main** (a Node.js program that owns windows and talks to the OS),
**renderer** (a Chromium web page where ALL the visible UI lives), **preload** (a small
trusted bridge — the renderer can only touch the OS through what preload explicitly exposes).
Open: `frontend/src/main/index.ts` (find `createWindow` — that's your app window being
born, 1280×800) · `frontend/src/preload/index.ts` (every `name:` line = one capability the
UI is allowed to use; this list is now snapshot-guarded).
Check yourself: why is `readFile` in preload instead of the renderer just reading files?

## Step 2 — Components and props
A React component is a function: props in, markup out. The whole UI is a tree of these.
Open: `frontend/src/renderer/components/common/Knob.tsx` (small, real) — find what props it
takes and what it renders. Then glance at `App.tsx`'s size (4,561 lines) to see why the
framework wants it decomposed.
Check: in DevTools (app running, Cmd+Option+I), find a knob in the Elements panel.

## Step 3 — State and stores (Zustand)
UI state lives in shared "stores"; components subscribe and re-render when data changes.
Open: `frontend/src/renderer/stores/toast.ts` (the smallest real store) — find the state
shape and the actions that change it. Creatrix has 26 stores; `stores/timeline.ts` is the
big one (3,095 lines).
Check: trace one flow — clicking a track's S (solo) button → which store field changes?
(grep `isSoloed` in `stores/timeline.ts`.)

## Step 4 — Tokens and BEM (the design system)
Open: `frontend/src/renderer/styles/tokens.css` — the three-tier system in its header
comment; find `--cx-acid` (your green). Then `styles/global.css` — see `var(--cx-*)`
everywhere. BEM: `.device-card__header--collapsed` = block, element, modifier(state).
Check: run `bash frontend/scripts/ui-ratchets.sh` and read the six counters — you now
understand every one of them.

## Step 5 — How a change becomes law
Read `docs/frontend/RATIFIED-FOUNDATIONS.md` (your own verdicts) → `COMPONENT-SPEC.md`
(the contract) → `FRONTEND-SDLC.md` §2 (the cadence). This is the paper trail of decisions
you already made — nothing in it should surprise you.

## Step 6 — Reading a PR (your review lane)
A PR = a named set of file changes + description + CI results. Your 5-item checklist, no
code-reading required:
1. Screenshots match the mock/intent?
2. States listed for new components (COMPONENT-SPEC §1)?
3. TRACEABILITY section filled (what surface, what entry point)?
4. CI green (the gates you now understand are in there)?
5. WALKTHROUGH present and comprehensible to you?
If any answer is no — say so; that's a real review.
Check: open a merged framework PR (#451 or #452) on GitHub and run the checklist on it.

## Step 7 — Making a change (guided, in the monthly session)
Pick a hex from the `tsx_hex` ratchet list, replace it with the right semantic token, watch
the counter click down, ship it through the pipeline with me. Your first frontend PR is a
ratchet payment — small, safe, and it makes the codebase measurably better.

## Glossary (one-liners)
**HMR/hot reload** — save a file, the running app updates without restart (why L1 costs
seconds). **IPC** — messages between renderer and main/backend. **Sidecar** — the Python
process doing video math; the UI talks to it over ZMQ. **Ratchet** — a violation counter
that can only go down. **Baseline** — the committed reference screenshot a surface is
diffed against. **Worktree** — a second checkout of the same repo so parallel work doesn't
collide.
