# Packets — sampler-clip-editor

**Emitted:** 2026-07-18 (orchestrator session, PRD-grounded). **Plan:** `plan.md` (§-anchored
normative sections — packets POINT, don't re-derive). **Proposal:** `proposal.md` — T1
verdicts pre-locked by user 2026-07-18 (8 decisions, PRD §8); ODs 1-4 carry recommended
defaults, confirm OD-1 at mock review before P2 merges.

**Branching rule (every packet):** cut from `origin/main` only (parallel sessions may own
the local checkout). PR-only; squash merge; no `.github/workflows/**` edits.
**Merge gate (every packet, STRICT FULL-TIER):** full backend pytest + full vitest
(`npx --no vitest run`; worktree executors can't run vitest — CI is the frontend gate) →
`Skill(review)` via Skill tool (ship-gate hook) → CI green (e2e/sidecar where
path-applicable). UI packets: screenshot-verify (static-harness pixel method) — the P3.x
"markup with 0 CSS" lesson. Hex-ratchet: `--cx-*` tokens only.

**Cross-change constraints:** `stores/operators.ts`/`modulation/routing.py` untouched
(wave0 rule N/A) · `zmq_server.py` (P4/P5) single-flight with device-monitors-v1 P2 ·
FrameStrip is the shared widget fx-backspin's stop_frame selector consumes — P1's props
contract is NORMATIVE for that reuse (change nothing without checking fx-backspin plan).

---

## P1 · FrameStrip widget + thumbnail range API — depends: none
Scope: `shared/FrameStrip.tsx` per plan §1 (region/loop/grid/scrub props, cached-thumb
hover-scrub, FrameBank marker idiom) + OD-3(a) additive `start_frame/end_frame` params on
`thumbnails` IPC + `generate_thumbnails` (`ingest.py:117`; old callers byte-identical —
regression test). Vitest: region/snap math suite (plan §7). STOP if you find yourself
adding sampler-store imports — the widget is store-free by contract.

## P2 · SamplerDevice integration: region + the dropped B3.1 loop controls — depends: P1
Scope: plan §2 + §3 (layout-store grid state). Closes packet debt from `phase-5a.md:417`.
Parity fence: extend sampler parity tables (region+loop cases); regression: loop-off
behavior byte-identical. MIDI-learn menus on every new control. Gate: OD-1 confirmed at
mock review BEFORE this merges.

## P3 · Grid snap CLIP + BPM modes — depends: P2 (can fold into P2 if executor prefers ONE PR)
Scope: snap engagement (global Cmd+U + local chip), `quantizeFrame` reuse, anchor
semantics. Anti-dead-flag test: with BPM mode on, changing project BPM changes the snapped
result (modulated `effectiveBpm` read, not stale `bpm`).

## P4 · Drag-from-timeline — depends: P1 (not P2/P3)
Scope: plan §4. RISK: interacts with global drag handlers + existing typed drags —
discriminator + BOTH collision regression tests are the acceptance gate. OS-pointer e2e for
the actual drag (CU cannot fire it). `Clip.tsx` draggable must not break existing
trim/move pointer interactions (regression: clip trim still works — e2e).

## P5 · Right-click Crop bake — depends: P2. RISK:HIGH (new backend command, file writes)
Scope: plan §5, OD-2(a). qa-redteam REQUIRED before merge (path validation, traversal,
disk-fill/degenerate ranges, mid-playback contention — UE.6 chaos precedent). Undo =
compound transaction. Single-flight on `zmq_server.py`.

## P6 · T1 thumbnails: Frame-Bank slots + rack pads — depends: P1
Scope: plan §6. Finishes `INSTRUMENTS-BUILD-PLAN.md:258` thumbnails-as-specced. Perf gate:
thumb requests cached/deduped (N pads with same source = 1 request); no request storms on
rack breadcrumb navigation (test with 16-pad rack fixture).

---

**Suggested dispatch:** P1 → {P2+P3 as one PR, P4, P6 in parallel} → P5. All Sonnet except
P5 (Opus + qa-redteam, RISK:HIGH).
