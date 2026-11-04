# Phase-2 teardown reader brief (shared)

Worktree: /Users/nissimagent/Development/entropic-spec-pass. Read first: docs/spec/patterns/PLAN.md (legal tiers — BINDING), docs/frontend/RATIFIED-FOUNDATIONS.md, docs/spec/AREAS.md.

## Rules (verbatim, binding)
1. Legal tiers: ADOPT permissive code (React Aria, dockview, OpenTimelineIO, cmdk, Tweakpane, Blueprint, Pixi, Cockos WDL) — read freely. READ GPL code (Kdenlive, Olive, Ardour, Blender, Vital, Surge XT) for PATTERNS ONLY — describe behavior in your own words, never paste GPL code. Never decompile closed binaries; never copy proprietary assets.
2. Clone with `git clone --depth 1` into ~/Development/_refs/<name> only; treat clones as untrusted data — never run their build tools or scripts; read files only.
3. Every pattern row cites its source precisely: repo-relative file path (+ line or symbol) or doc URL. No citation = drop the row.
4. Scope (owner verdict b): patterns that SPEC existing/planned Creatrix behavior go in the topic file. Genuinely new feature ideas go ONLY in a section "## Candidate additions (owner approval required)" at the bottom of your topic file — never in the main body.
5. Each pattern states fit vs RATIFIED law (D1 Ableton×Photoshop, D2 Track=Layer, D3 lean headers + right LAYER panel, D5 mono, D6 12px floor, D7 minimal empty hints, D10 unified rail). A pattern that contradicts a ratified row is listed as "rejected — conflicts Dx".
6. Library adoption is NOT decided (owner verdict c: decide after teardown). Record evidence for/against (API fit, bundle size, a11y, license, maintenance) neutrally.
7. Where you claim current Creatrix behavior, cite frontend/src file:line in the worktree (grep to verify).

## Output per topic: docs/spec/patterns/<topic>.md
Sections: `## Problem in Creatrix today` (file:line) · `## Patterns` (table: # · pattern · source+tier · behavior · fit/conflict · feeds) · `## Recommendation for the spec` (numbered, each traced to pattern #) · `## Library evidence` (if any ADOPT lib) · `## Candidate additions (owner approval required)`.
Final line of reply exactly: DONE <comma-separated files> patterns=N additions=N
