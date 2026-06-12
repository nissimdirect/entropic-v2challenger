#!/usr/bin/env bash
# launch-bake.sh — Launch Creatrix with the audio-tracks experiment enabled,
# for the 1-week user bake (PD.1). Sets EXPERIMENTAL_AUDIO_TRACKS=true so the
# multi-track audio path (MixerPlayer) is active, and the bake-session logger
# appends one JSONL line per session to ~/.creatrix/audio-bake-log.jsonl.
#
# Check progress any time with:
#   python scripts/check_bake_gate.py --log ~/.creatrix/audio-bake-log.jsonl
#
# The gate PASSES once there are >=7 distinct days, >=2h cumulative playback,
# and zero callback errors across flag-on sessions.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

export EXPERIMENTAL_AUDIO_TRACKS=true

echo "Launching Creatrix (audio-tracks bake build) — EXPERIMENTAL_AUDIO_TRACKS=true"
echo "Bake log: ~/.creatrix/audio-bake-log.jsonl"

cd "$PROJECT_ROOT/frontend" && npm start
