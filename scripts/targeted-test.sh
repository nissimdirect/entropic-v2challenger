#!/bin/bash
# targeted-test.sh — Run tests relevant to the edited file.
# Called by Claude Code PostToolUse hook. Reads file path from stdin JSON.
#
# Hook sends JSON on stdin: { "tool_input": { "file_path": "..." }, ... }

INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [ -z "$FILE" ]; then
  exit 0
fi

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT" || exit 1

# Map source file → relevant test directory/file
case "$FILE" in
  */backend/src/effects/*)
    echo "[targeted-test] Effect changed → running effect tests"
    cd backend && python3 -m pytest tests/test_all_effects.py -x --timeout=30 -q 2>&1 | tail -5
    ;;
  */backend/src/engine/*)
    echo "[targeted-test] Engine changed → running engine tests"
    cd backend && python3 -m pytest tests/test_engine/ -x --timeout=30 -q 2>&1 | tail -5
    ;;
  */backend/src/video/*)
    echo "[targeted-test] Video I/O changed → running video tests"
    cd backend && python3 -m pytest tests/test_video/ -x --timeout=30 -q 2>&1 | tail -5
    ;;
  */backend/src/audio/*)
    echo "[targeted-test] Audio changed → running audio tests"
    cd backend && python3 -m pytest tests/test_audio/ -x --timeout=30 -q 2>&1 | tail -5
    ;;
  */backend/src/zmq_server*)
    echo "[targeted-test] ZMQ changed → running ZMQ + IPC tests"
    cd backend && python3 -m pytest tests/test_zmq_server.py tests/test_zmq_commands.py tests/test_ipc_contracts.py -x --timeout=30 -q 2>&1 | tail -5
    ;;
  */frontend/src/renderer/stores/*)
    echo "[targeted-test] Store changed → running store tests"
    cd frontend && npx vitest run src/__tests__/stores/ --reporter=dot 2>&1 | tail -5
    ;;
  */frontend/src/renderer/components/*)
    echo "[targeted-test] Component changed → running component tests"
    cd frontend && npx vitest run src/__tests__/components/ --reporter=dot 2>&1 | tail -5
    ;;
  */frontend/src/shared/*)
    echo "[targeted-test] Shared types changed → running all frontend tests"
    cd frontend && npx vitest run --reporter=dot 2>&1 | tail -5
    ;;
  *)
    # No mapping — skip silently
    ;;
esac
