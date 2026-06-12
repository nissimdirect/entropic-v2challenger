# Demo Trilogy Stubs

Skeleton `.entropic` project files for the three Tier-1 demos defined in `entropic-spec-4-demo-trilogy.md`. Each demo's JSON structure is finalized; only the **asset files** (images, audio, video) need to be sourced + dropped in before these can be opened in Creatrix.

## Files

| File | Purpose | Asset required |
|---|---|---|
| `y-is-time.entropic.json` | Demo 1: still image's hue varies vertically from audio onset envelope | `source.jpg` (high-contrast still) + `audio.wav` (10s instrumental w/ clear onset pattern) |
| `painted-blur.entropic.json` | Demo 2: 2D field as parameter (preview of C3 capability) | `source.mp4` (~5s clip w/ foreground/background separation) + `initial-mask.png` (grayscale field) |
| `audio-lfo-stripes.entropic.json` | Demo 3: 50Hz LFO bound to Y → visible spatial banding throbbing with music | `source.mp4` (plain gradient or solid color) + `audio.wav` (dynamic — quiet/loud/quiet) |

## Asset sourcing checklist

All assets MUST be:
- License-clean (CC0 / Apache / commissioned / our own)
- Sized appropriately (1080p video, ~10s clips)
- Free of identifying real-world content unless explicitly cleared

### Recommended sources
- **Stills:** Unsplash / Pexels (CC0)
- **Audio loops:** Splice (license per term) / freesound.org (CC0 collection) / commission
- **Video clips:** Pexels Video / Mixkit (CC0)

### Sizing targets
- Still images: 1920×1080, JPEG quality 85
- Audio: WAV 44.1kHz 16-bit stereo, < 5MB per file
- Video: H.264 1920×1080 @ 30fps, < 5MB per file

## When to use

1. Creatrix PR-B lands with SPEC-2 B4-lite schema (INJ-5 in PR-INJECTIONS.md)
2. Source the 5 asset files listed above (or commission them)
3. Drop assets into final paths (renamed from `source.jpg` etc. to whatever the schema references)
4. Drop the 3 `.entropic.json` files into `demos/` directory in the app bundle
5. Wire first-launch overlay per SPEC-4 §5
6. Test load + render per SPEC-4 §9 acceptance criteria

## Status

Stubs ready. Asset sourcing pending. First-launch overlay UI work pending Creatrix PR-A landing the necessary UI infrastructure.
