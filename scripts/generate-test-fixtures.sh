#!/usr/bin/env bash
# generate-test-fixtures.sh — Generate test video fixtures for Entropic v2
# Idempotent: skips files that already exist.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
FIXTURES="$PROJECT_ROOT/test-fixtures"

VIDEOS="$FIXTURES/videos"
PROJECTS="$FIXTURES/projects"

mkdir -p "$VIDEOS" "$PROJECTS"

# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------
skip_if_exists() {
  if [ -f "$1" ]; then
    echo "  [skip] $1 already exists"
    return 0
  fi
  return 1
}

# ---------------------------------------------------------------------------
# 1. valid-short.mp4 — 5s 1080p H.264 with audio
# ---------------------------------------------------------------------------
echo "=> valid-short.mp4"
if ! skip_if_exists "$VIDEOS/valid-short.mp4"; then
  ffmpeg -y -f lavfi -i testsrc2=size=1920x1080:rate=30:duration=5 \
    -f lavfi -i sine=frequency=440:duration=5 \
    -c:v libx264 -preset ultrafast -c:a aac -shortest \
    "$VIDEOS/valid-short.mp4" 2>/dev/null
  echo "  [created] valid-short.mp4"
fi

# ---------------------------------------------------------------------------
# 2. sync-marker.mp4 — White flash + 1kHz beep at t=0 and t=2s
# ---------------------------------------------------------------------------
echo "=> sync-marker.mp4"
if ! skip_if_exists "$VIDEOS/sync-marker.mp4"; then
  # Video: white flash (50ms) at t=0 and t=2, black otherwise, 3s total
  # Audio: 1kHz sine beep (50ms) at t=0 and t=2, silence otherwise
  ffmpeg -y \
    -f lavfi -i "color=c=black:s=1920x1080:r=30:d=3,drawbox=c=white:t=fill:enable='between(t,0,0.05)+between(t,2,2.05)'" \
    -f lavfi -i "sine=frequency=1000:sample_rate=48000:duration=3,volume=enable='between(t,0,0.05)+between(t,2,2.05)'" \
    -c:v libx264 -preset ultrafast -c:a aac -shortest \
    "$VIDEOS/sync-marker.mp4" 2>/dev/null
  echo "  [created] sync-marker.mp4"
fi

# ---------------------------------------------------------------------------
# 3. valid-no-audio.mp4 — 5s 1080p, no audio
# ---------------------------------------------------------------------------
echo "=> valid-no-audio.mp4"
if ! skip_if_exists "$VIDEOS/valid-no-audio.mp4"; then
  ffmpeg -y -f lavfi -i testsrc2=size=1920x1080:rate=30:duration=5 \
    -c:v libx264 -preset ultrafast -an \
    "$VIDEOS/valid-no-audio.mp4" 2>/dev/null
  echo "  [created] valid-no-audio.mp4"
fi

# ---------------------------------------------------------------------------
# 4. corrupt-header.mp4 — valid-short.mp4 with first 100 bytes overwritten
# ---------------------------------------------------------------------------
echo "=> corrupt-header.mp4"
if ! skip_if_exists "$VIDEOS/corrupt-header.mp4"; then
  # Ensure valid-short.mp4 exists first
  if [ ! -f "$VIDEOS/valid-short.mp4" ]; then
    echo "  [error] valid-short.mp4 missing — cannot create corrupt-header.mp4"
    exit 1
  fi
  cp "$VIDEOS/valid-short.mp4" "$VIDEOS/corrupt-header.mp4"
  dd if=/dev/urandom of="$VIDEOS/corrupt-header.mp4" bs=1 count=100 conv=notrunc 2>/dev/null
  echo "  [created] corrupt-header.mp4"
fi

# ---------------------------------------------------------------------------
# 5. corrupt-truncated.mp4 — valid-short.mp4 truncated to 50%
# ---------------------------------------------------------------------------
echo "=> corrupt-truncated.mp4"
if ! skip_if_exists "$VIDEOS/corrupt-truncated.mp4"; then
  if [ ! -f "$VIDEOS/valid-short.mp4" ]; then
    echo "  [error] valid-short.mp4 missing — cannot create corrupt-truncated.mp4"
    exit 1
  fi
  FULL_SIZE=$(stat -f%z "$VIDEOS/valid-short.mp4" 2>/dev/null || stat -c%s "$VIDEOS/valid-short.mp4")
  HALF_SIZE=$((FULL_SIZE / 2))
  dd if="$VIDEOS/valid-short.mp4" of="$VIDEOS/corrupt-truncated.mp4" bs=1 count="$HALF_SIZE" 2>/dev/null
  echo "  [created] corrupt-truncated.mp4 (${HALF_SIZE} bytes, 50% of ${FULL_SIZE})"
fi

# ---------------------------------------------------------------------------
# 6. zero-bytes.mp4 — Empty file
# ---------------------------------------------------------------------------
echo "=> zero-bytes.mp4"
if ! skip_if_exists "$VIDEOS/zero-bytes.mp4"; then
  touch "$VIDEOS/zero-bytes.mp4"
  echo "  [created] zero-bytes.mp4 (0 bytes)"
fi

# ---------------------------------------------------------------------------
# 7. not-video.mp4 — Text file with .mp4 extension
# ---------------------------------------------------------------------------
echo "=> not-video.mp4"
if ! skip_if_exists "$VIDEOS/not-video.mp4"; then
  echo "this is not a video" > "$VIDEOS/not-video.mp4"
  echo "  [created] not-video.mp4 (text content)"
fi

# ---------------------------------------------------------------------------
# 8. corrupt-project.glitch — Truncated invalid JSON
# ---------------------------------------------------------------------------
echo "=> corrupt-project.glitch"
if ! skip_if_exists "$PROJECTS/corrupt-project.glitch"; then
  printf '{"version": 1, "tracks": [' > "$PROJECTS/corrupt-project.glitch"
  echo "  [created] corrupt-project.glitch (invalid JSON)"
fi

# ---------------------------------------------------------------------------
# 9. old-version.glitch — Valid JSON, old schema version
# ---------------------------------------------------------------------------
echo "=> old-version.glitch"
if ! skip_if_exists "$PROJECTS/old-version.glitch"; then
  printf '{"version": 0, "name": "Test", "tracks": []}' > "$PROJECTS/old-version.glitch"
  echo "  [created] old-version.glitch (version 0)"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "=== Test Fixtures ==="
echo "Videos:"
ls -lh "$VIDEOS/"
echo ""
echo "Projects:"
ls -lh "$PROJECTS/"
echo ""
echo "Done."
