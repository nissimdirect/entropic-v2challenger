---
title: Sprint 2B-4 A/V Sync Clock
status: completed
type: sprint
phase: 2B
---

# Sprint 2B-4: A/V Sync Clock (Audio Master, Video Slave)

## Scope
Python-side A/V sync clock that makes audio the master clock and video the slave. Queries AudioPlayer for position, computes target video frame index given FPS. Electron polls via ZMQ to know which frame to render. No frontend changes — just the backend clock and IPC.

**Architecture:** Audio callback runs on a real-time thread and never waits for video. If video can't keep up, it holds the previous frame. Audio NEVER skips or stutters. Video queries the clock to know which frame to display.

## Branch: `sprint/2B-4-av-sync`

## Build Checklist
- [x] Add `audio/clock.py` — AVClock class (wraps AudioPlayer, fps, target_frame_index, sync_state)
- [x] Add ZMQ commands to `zmq_server.py` (clock_sync, clock_set_fps)
- [x] Write tests: `backend/tests/test_audio/test_clock.py`
- [x] Write ZMQ integration tests in `test_zmq_commands.py`

## Test Plan
- Command to run smoke: `pytest -m smoke`
- Command to run full: `pytest`
- New tests:
  - [x] AVClock init with AudioPlayer → no crash
  - [x] target_frame_index returns floor(audio_time * fps)
  - [x] target_frame_index at time=0 → frame 0
  - [x] set_fps updates correctly
  - [x] sync_state returns full dict (audio_time_s, target_frame, is_playing, duration_s, fps)
  - [x] Clock with no loaded audio → safe defaults (frame 0, time 0)
  - [x] ZMQ clock_sync round-trip
  - [x] ZMQ clock_set_fps round-trip
  - [x] ZMQ clock_sync after seek → position matches

## UAT
- [x] Load → clock_sync returns frame 0 at time 0 (valid-short.mp4, 5.0s stereo 44100Hz)
- [x] Seek to 1.0s → clock_sync returns target_frame=30 (at 30fps, audio_time_s=1.0000)
- [x] Set fps to 24 → clock_sync returns target_frame=24 (correctly recalculated)

## Smoke at Sprint End
118 smoke tests passing in 2.93s (+3 clock tests)

## NOT in Scope
- Frontend UI (video rendering loop)
- C++ miniaudio addon (Python sounddevice is the engine)
- Audio device selection
- Drift correction (future — needs actual video rendering loop)

## Smoke Baseline at Sprint Start
115 smoke tests passing in 2.45s (inherited from 2B-3 merge)
