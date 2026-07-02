---
title: Sprint 2B-2 Waveform
status: completed
type: sprint
phase: 2B
---

# Sprint 2B-2: Waveform Generation (PCM → Peaks)

## Scope
Server-side waveform peak computation from decoded audio. Returns downsampled peak arrays for UI rendering. No UI changes — frontend waveform component is Sprint 2B-3 or later.

## Branch: `sprint/2B-2-waveform`

## Build Checklist
- [x] Add `audio/waveform.py` — compute min/max peaks from PCM at configurable resolution
- [x] Add `waveform` ZMQ command handler to `zmq_server.py`
- [x] Cache waveform data per-file (avoid re-decoding on scrub)
- [x] Write tests: `backend/tests/test_audio/test_waveform.py`

## Test Plan
- Command to run smoke: `pytest -m smoke`
- Command to run full: `pytest`
- New tests:
  - [x] Generate peaks from stereo PCM → correct shape (num_bins, channels, 2)
  - [x] Generate peaks from mono PCM → correct shape
  - [x] Peaks bounded within [-1, 1]
  - [x] Different resolutions produce different bin counts
  - [x] ZMQ waveform command returns peaks for file with audio
  - [x] ZMQ waveform command returns error for video-only file
  - [x] Cache hit: second request is faster than first

## UAT
- [x] Run waveform on sample.mp4 (84s stereo) → peaks array returned (800 bins, 2ch, 86ms)
- [x] Run waveform on synth_testcard_clip.mp4 (5s mono) → peaks returned (800 bins, 1ch)
- [x] Video-only file → clean error ("No audio stream found")

## NOT in Scope
- Frontend waveform rendering (later sprint)
- PortAudio playback (Sprint 2B-3)
- A/V sync (Sprint 2B-4)

## Smoke Baseline at Sprint Start
108 smoke tests passing in 0.63s (inherited from 2B-1 merge)

## Smoke at Sprint End
111 smoke tests passing in 1.39s (+3 waveform tests)
