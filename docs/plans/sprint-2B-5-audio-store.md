---
title: Sprint 2B-5 Frontend Audio Store + IPC Types
status: completed
type: sprint
phase: 2B
---

# Sprint 2B-5: Frontend Audio Store + IPC Types

## Scope
TypeScript data layer for audio: IPC command types matching all Python-side audio/clock ZMQ commands, Zustand audio store with actions that call sendCommand, vitest tests. No UI components — just the data layer.

Since audio playback runs in Python (sounddevice), the frontend doesn't need a native C++ addon. It sends ZMQ commands via the existing `sendCommand` bridge.

## Branch: `sprint/2B-5-audio-store`

## Build Checklist
- [x] Update `ipc-types.ts` — add audio/clock command types and response interfaces
- [x] Create `stores/audio.ts` — Zustand audio store (load, play, pause, seek, volume, mute, clock sync)
- [x] Write tests: `__tests__/stores/audio.test.ts`

## Test Plan
- Command to run: `cd frontend && npx vitest run`
- New tests:
  - [x] Audio store initializes with defaults (not loaded, not playing, volume=1)
  - [x] loadAudio sends audio_load command and updates state
  - [x] play/pause toggle isPlaying
  - [x] setVolume clamps to [0, 1]
  - [x] toggleMute preserves volume value
  - [x] seek sends audio_seek and updates currentTime
  - [x] syncClock updates currentTime and targetFrame from clock_sync response
  - [x] setFps sends clock_set_fps command

## UAT
- [x] `npx vitest run` — all existing + new tests pass (173 tests, 12 files, 952ms)
- [x] TypeScript compiles without errors (`npx tsc --noEmit`)

## Vitest Baseline at Sprint Start
159 tests passing in 840ms (11 files)
