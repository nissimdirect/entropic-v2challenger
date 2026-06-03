# Runbook: Q7 Demo Trilogy

Renders the three Tier-1 demos that reveal the paradigm:

1. **Y-is-Time** — each row is a moment in time; audio painted vertically
2. **Painted-Blur** — spatial mask modulation
3. **Audio-LFO-Stripes** — audio-rate LFO visualization

Per SPEC-4 (the demo trilogy spec). These demos are the onboarding for the L-axis paradigm — users learn what the modulation model means by seeing it act on real video.

## Prerequisites

- macOS arm64 (Apple silicon recommended; Intel works but slow)
- Source assets (you provide):
  - `y-is-time`: 1920×1080 high-contrast still image + 10s instrumental audio with clear onsets
  - `painted-blur`: ~30s video clip (talking head or single subject works well)
  - `audio-lfo-stripes`: any video + audio with strong rhythmic energy
- Q7 backend already running (see `q7-smoke.md` for setup)

## Inspect demos

```bash
cd backend
python3 -c "
import sys; sys.path.insert(0, 'scripts')
from demo_trilogy.runner import list_demos
for spec in list_demos():
    print(f'Demo {spec.demo_order}: {spec.name}')
    print(f'  Primitive: {spec.primitive}')
    print(f'  Duration: {spec.duration_frames} frames ({spec.duration_frames/30:.1f}s @ 30fps)')
    print(f'  View time: {spec.viewing_time_seconds}s')
    print(f'  BPM: {spec.bpm}')
    print(f'  Description: {spec.description}')
    print()
"
```

## Render one demo

```bash
cd backend

# Y-is-Time (still + audio)
python3 -c "
import sys; sys.path.insert(0, 'scripts')
from demo_trilogy.runner import build_cli_invocation
from pathlib import Path

cmd = build_cli_invocation(
    'y-is-time',
    Path('~/Pictures/source.jpg').expanduser(),
    Path('~/Desktop/q7-demo-y-is-time.mp4').expanduser(),
)
print('CLI cmd:', cmd)

import subprocess
result = subprocess.run(cmd, check=True)
"
```

For the other demos, swap the first arg + the source asset path. The entropic CLI runs the v3 project from the `.entropic.json` config alongside your source.

## Render all three

```bash
cd backend
for demo in y-is-time painted-blur audio-lfo-stripes; do
  python3 -c "
import sys; sys.path.insert(0, 'scripts')
from demo_trilogy.runner import build_cli_invocation
from pathlib import Path
import subprocess

cmd = build_cli_invocation(
    '$demo',
    Path('~/Pictures/source-$demo.mp4').expanduser(),
    Path('~/Desktop/q7-demo-$demo.mp4').expanduser(),
)
subprocess.run(cmd, check=True)
print('Rendered: ~/Desktop/q7-demo-$demo.mp4')
"
done
```

## Validate the demos

After rendering:

- **Y-is-Time:** open the mp4. As audio plays, you should see horizontal color stripes shifting in sync with onsets. Each row of the frame is a moment in audio time.
- **Painted-Blur:** depth of field appears to change based on a spatial mask. Try moving the camera or changing the subject — the mask should follow as expected.
- **Audio-LFO-Stripes:** vertical stripes should pulse with the LFO's amplitude. The LFO rate should match the BPM-implied frequency.

## What the demos prove

- **Y-is-Time:** `domain='y'` axis-binding ships and renders correctly via the renderer site pinned in DEC-Q7-015 (`automation-evaluate.ts:evaluateAutomation` extended path)
- **Painted-Blur:** B4-lite schema's `binding_rule='broadcast'` works for masks
- **Audio-LFO-Stripes:** cross-modal audio→video routing works via PR #9 L worker

## What if rendering fails

| Symptom | Likely cause | Fix |
|---|---|---|
| `ModuleNotFoundError: demo_trilogy` | PYTHONPATH not set | Add `cd backend && PYTHONPATH=scripts python3 ...` |
| `demo config missing` | Stub files not copied into backend/scripts | This PR should ship them; re-clone if missing |
| Engine reports `domain='y' not implemented` | PR-B renderer extension hasn't landed | Demos are READY; engine ships in Creatrix PR-B or follow-up |
| Render produces black frames | Source asset issue (wrong dimensions, bad codec) | Check source asset; ensure 1920×1080 for stills |

## Anchored to

- Plan: `docs/plans/q7/PR-12-demo-trilogy-plan.md`
- Spec: `~/.claude/plans/entropic-spec-4-demo-trilogy.md`
- DEC-Q7-009 canonical sparsity (these demos at 1:8)
- DEC-Q7-015 renderer site pin (where `domain='y'` lights up)
