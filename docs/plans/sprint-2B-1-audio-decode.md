---
title: Sprint 2B-1 Audio Decode
status: active
type: sprint
phase: 2B
---

# Sprint 2B-1: Audio Decode (PyAV → PCM)

## Scope
PyAV-based audio stream extraction from video containers. Raw PCM output for downstream playback.

## Branch: `sprint/2B-1-audio-decode`

## Build Checklist
- [x] Add `audio_decode` command handler to `zmq_server.py`
- [x] Extract audio stream metadata (sample rate, channels, codec) in `video/ingest.py`
- [x] Decode audio to raw PCM float32 numpy array
- [x] Handle containers with no audio stream gracefully
- [x] Write tests: `backend/tests/test_audio/test_decode.py`

## Test Plan
- Command to run smoke: `pytest -m smoke`
- Command to run full: `pytest`
- New tests:
  - [x] Decode MP4 with AAC audio → PCM array with correct sample rate
  - [x] Decode MOV with AAC audio → same (covered by MP4/AAC — same PyAV path)
  - [x] Video-only file → error response, no crash
  - [x] Seek to timestamp → correct audio offset
  - [x] Edge: zero-duration audio stream

## UAT (Human)
- [ ] Import MP4 with audio → backend extracts without error
- [ ] Import video-only file → graceful "no audio" response

## NOT in Scope
- Waveform display (Sprint 2B-2)
- PortAudio playback (Sprint 2B-3)
- A/V sync (Sprint 2B-4)
- Any UI changes

## Smoke Baseline at Sprint Start
- Before: 105 smoke, 462 total (0.85s)
- After: 108 smoke, 476 total (all passing)
