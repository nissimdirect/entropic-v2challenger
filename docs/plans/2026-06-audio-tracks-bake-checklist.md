# Audio-Tracks 1-Week Bake Checklist

**Status:** kit ready — bake not yet started
**Bake clock start date:** _________________ (USER: fill this in on day 1 of the bake)
**Bake clock target end date:** start + 7 distinct usage days
**Flag:** `EXPERIMENTAL_AUDIO_TRACKS=true` (set by `scripts/launch-bake.sh`)
**Bake log:** `~/.creatrix/audio-bake-log.jsonl` (one JSONL line per audio session)
**Machine gate:** `python scripts/check_bake_gate.py --log ~/.creatrix/audio-bake-log.jsonl`

> This bake is the PR-4 gate for the audio-tracks stack (#30–#35): *"merge +
> 1-week user-facing bake + zero audio regression reports."* The gate is
> **machine-checkable, not vibes** — the JSONL log + `check_bake_gate.py` are
> the arbiter. This checklist captures **human-observable** regressions the
> machine gate cannot see (visual desync, wrong levels, UI glitches).

## How to run the bake

1. `bash scripts/launch-bake.sh` (launches with the flag on).
2. Use the app for real audio/video work across **at least 7 distinct days**,
   accumulating **at least 2 hours** of total playback.
3. After each session check progress:
   `python scripts/check_bake_gate.py --log ~/.creatrix/audio-bake-log.jsonl`
   — on day one it correctly exits **1** with `under 7 days`.
4. The bake PASSES when the script prints `BAKE GATE: PASS` and exits 0.
5. Log any human-observed regression in the **Findings Log** below. Any
   unresolved FAIL row blocks PD.2 (default-on) regardless of the machine gate.

## Functional checklist (mark each pass/fail)

| # | Check | Pass/Fail | Notes |
|---|-------|-----------|-------|
| 1 | Import a video **with** an audio stream — audio track appears | ☐ PASS ☐ FAIL | |
| 2 | Import a standalone audio file (wav/mp3) — lands on an audio track | ☐ PASS ☐ FAIL | |
| 3 | Multi-track playback: 2+ audio tracks play simultaneously, mixed | ☐ PASS ☐ FAIL | |
| 4 | Per-track **gain** changes are audible and correct | ☐ PASS ☐ FAIL | |
| 5 | **Mute** silences only the muted track | ☐ PASS ☐ FAIL | |
| 6 | **Solo** plays only the soloed track(s) | ☐ PASS ☐ FAIL | |
| 7 | A/V **sync** holds during plain playback (no drift over 60s+) | ☐ PASS ☐ FAIL | |
| 8 | A/V sync holds **under temporal effects** (speed/echo/time-warp) | ☐ PASS ☐ FAIL | |
| 9 | **Export with audio**: rendered file has correct, in-sync audio | ☐ PASS ☐ FAIL | |
| 10 | **Seek / scrub** while playing — audio follows playhead, no stutter | ☐ PASS ☐ FAIL | |
| 11 | Long session (≥10 min continuous) — no audible glitches/dropouts | ☐ PASS ☐ FAIL | |
| 12 | **Crash watch**: `ls ~/.creatrix/crash_reports/` — zero NEW crash dumps during the bake | ☐ PASS ☐ FAIL | |
| 13 | Bake log is growing: `tail ~/.creatrix/audio-bake-log.jsonl` shows `flag_on:true`, `callback_errors:0` lines | ☐ PASS ☐ FAIL | |

> Cross-check (failure-mode guard): item 12 (crash count) and item 13
> (`callback_errors`) must agree — the machine gate FAILS on any nonzero
> `callback_errors`, and any new crash dump is a hard FAIL here.

## Findings Log (human-observed regressions)

> One row per observation. Resolve or escalate before PD.2.

| Date | Session | Observation | Severity (info/warn/blocker) | Status |
|------|---------|-------------|------------------------------|--------|
| _stub — record findings here_ | | | | |

## Done definition

- [ ] `check_bake_gate.py` exits **0** (`BAKE GATE: PASS`).
- [ ] Zero unresolved **blocker** rows in the Findings Log.
- [ ] Zero new dumps in `~/.creatrix/crash_reports/` during the bake window.
- [ ] All 13 functional checks marked PASS.

When all four hold, PD.2 (flag default-ON) is unblocked.
