# Demo Trilogy — RENDERED (Tier-1 P0d, 2026-06-04)

Real MP4 artifacts produced by `render_demos.py` driving the genuine
`modulation.lane_reader.sample_lane` primitive (PR #147) over real frames.
This is the standalone proof renderer — it bypasses the not-yet-built engine
`.entropic` v3 render path (INJ-5 renderer integration, lands in PR-B) by
applying the lane-as-axis evaluation directly to decoded frames.

## Output (`~/.entropic/demos/`)
| File | Primitive proven | How |
|---|---|---|
| `y-is-time.mp4` | C1 Scanline-as-Time | hue ramp read with `domain=Y` → curve scans down rows |
| `audio-lfo-stripes.mp4` | C7 audio-LFO-at-video-rate | sine read with `domain=Y, direction=14` → spatial banding, phases over T |
| `painted-blur.mp4` | C3 per-pixel field (preview) | blur strength field read with `domain=Y` → vertical blur gradient |

## Reproduce
```bash
cd backend
python3 -m scripts.demo_trilogy.render_demos \
  --source <video.mp4> --out ~/.entropic/demos --max-frames 180
```
Source used: `TERMINAL_COMPLETE_PACK/.../wave1/1a_beat_datamosh_08.mp4` (swappable;
richer full-frame footage shows the per-row modulation more dramatically).

## Honest status
- ✅ Real renderer, real primitive, valid MP4s (180 frames, 6s each).
- ⚠️ This is NOT the in-app engine render path — that's INJ-5/PR-B work. This
  proves the primitive end-to-end on real pixels ahead of that integration.
