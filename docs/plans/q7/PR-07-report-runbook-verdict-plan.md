# PR #7 — Report Writer + Runbook + Verdict Commit

The closing PR of Session 1. Adds the markdown report writer + matplotlib charts, the runbook for user execution, the Intel-Mac decision, and prepares the verdict commit for memory + ACTIVE-TASKS.

**Stacked on PR #124** (SG-8 + DINOv2 lit). Rebases to main once #117..#124 merge.

## Scope

### What to test
- [ ] `markdown_report.render_markdown` produces valid markdown with verdict, latency table, sparsity table, queue, memory, recommendation
- [ ] `render_to_file` writes to disk
- [ ] All three backbones surface in the rendered output
- [ ] All four sparsities surface
- [ ] Verdict state-specific recommendations (GO / CONDITIONAL / NO_GO)
- [ ] Advisory flag rendering (HIGH_VARIANCE, DEGRADES_UNDER_LOAD)
- [ ] Cross-references to DEC-Q7-007 / 009 / 014
- [ ] Optional chart embedding (when chart_paths provided)
- [ ] Raw JSON appendix (when requested)
- [ ] `charts.py` lazy-imports matplotlib — smoke env without matplotlib raises clean RuntimeError
- [ ] When matplotlib IS installed: PNG charts render correctly + are reasonable size

### Edge cases
- [ ] Empty report measurement → degrades gracefully
- [ ] Verdict in CONDITIONAL state → recommends re-run
- [ ] Verdict in NO_GO state → recommends defer to v1.1
- [ ] Flags surface in verdict banner

### How to verify
- `pytest tests/test_q7_benchmark/test_markdown_report.py tests/test_q7_benchmark/test_charts.py -m smoke -q`
- Manual: `make q7-smoke` then render markdown from /tmp/q7-report.json
- Manual end-to-end: `make q7-measure` then chart + render (Apple silicon required)

## Checkboxed items

### A. Decision docs
- [ ] **DEC-Q7-014** Intel Mac unsupported (one paragraph; no Intel-specific code paths)

### B. Files to add
- [ ] `backend/scripts/q7_benchmark/markdown_report.py` — markdown renderer + RenderOptions
- [ ] `backend/scripts/q7_benchmark/charts.py` — matplotlib lazy-import + render_latency_by_backbone + render_jitter_by_sparsity + render_all_charts
- [ ] `backend/tests/test_q7_benchmark/test_markdown_report.py` — 14 smoke tests
- [ ] `backend/tests/test_q7_benchmark/test_charts.py` — 4 smoke tests (skip-if-no-matplotlib)
- [ ] `docs/runbooks/q7/q7-measure.md` — user execution runbook

### C. Files to modify
- [ ] `Makefile` — add `q7-render-md` target (optional; runbook documents manual command)

### D. Session-close artifacts (not in PR; landed in memory + ACTIVE-TASKS)
- [ ] Update `~/.claude/projects/-Users-nissimagent/memory/entropic-synth-paradigm.md` with verdict commit
- [ ] Update `~/Documents/Obsidian/ACTIVE-TASKS.md` Creatrix Vision spec pass section
- [ ] Write session handoff at `~/Documents/Obsidian/handoffs/HANDOFF-2026-06-03-q7-session1-close.md`

### E. PR open + merge
- [ ] `gh pr create --base feat/q7-sg8-dinov2 --draft --title "[q7] PR #7: markdown report + charts + runbook + DEC-Q7-014"`
- [ ] CI green
- [ ] User merge nod (parallel-session sweep)
- [ ] Squash merge

## Effort estimate

- DEC-Q7-014 + PR-07 plan: 30 min
- markdown_report.py + charts.py: 1 h
- Tests: 1 h
- Runbook: 30 min
- Verdict commit text + session-close: 30 min
- PR open + CI: 30 min
- **Total: ~4 h**

## Verdict commit format (lands in memory file)

```markdown
## Q7 Verdict (Session 1 close, 2026-06-03)

**Tier 5 status: <STATE>** (canonical p95 = <X> ms on <hardware>)

- Real measurement: `~/q7-report.json` (mode=measure, backend=<backend>)
- Markdown report: `~/q7-report.md`
- Advisory flags: <list or none>

**Next session:** Session 2 PR #9 (L worker skeleton) — CONDITIONAL on TIER_5_GO above.
If TIER_5_CONDITIONAL: re-run after cold boot + thermal cool-down.
If TIER_5_NO_GO: defer L-axis to v1.1 per Vision §11; ship Tiers 0-4 without.
```

(Final verdict text is composed after user runs `make q7-measure` on their actual Mac. PR #7 ships the infrastructure that produces it.)
