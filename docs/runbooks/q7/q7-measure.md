# Runbook: Q7 real benchmark on your Mac

Produces the actual Tier 5 GO/NO-GO measurement from real DINOv2 (PR #6 lit) + stub CLIP/CLAP (lit in Session 2 PR #9). Requires Apple silicon for valid results.

## Prerequisites

- macOS arm64 (M1/M2/M3 Apple silicon). Intel Mac is documented unsupported per **DEC-Q7-014**.
- Python 3.12+
- ~500 MB free disk (model weights cache at `~/.entropic/models/q7/`)
- ~10 GB free RAM
- Network for first-run weight downloads from HuggingFace

## One-time install

```bash
cd ~/Development/entropic-v2challenger
pip install -r backend/scripts/q7_benchmark/requirements-q7-measure.txt
```

This installs torch, transformers, huggingface_hub, mlx, laion-clap, matplotlib, psutil. ~2 GB. Takes 1-3 minutes on a fast connection.

## Run the benchmark

```bash
make q7-measure
```

Or for finer control:

```bash
cd backend/scripts
python3 -m q7_benchmark.runner \
  --measure \
  --n-iterations 100 \
  --saturation-threads 4 \
  --saturation-window 5.0 \
  --under-load-duration 30 \
  --canonical-sparsity 8 \
  --out ~/q7-report.json
```

## First-run timing

- DINOv2 weight download: ~30 s on fast connection (22 MB)
- DINOv2 cold-load: ~2-4 s (model deserialization)
- 100 iterations × 3 backbones: ~5-15 s on M2 Max (DINOv2 only — CLIP/CLAP errors with BACKEND_NOT_LIT in PR #6)
- Queue saturation (4 threads × 5 s): 5 s
- Under-load measurement: 30 s
- **Total wall time: ~50-70 s on first run, ~25 s on subsequent runs**

## Render the markdown report

```bash
cd backend/scripts
python3 -c "
import json
from pathlib import Path
from q7_benchmark.markdown_report import render_to_file, RenderOptions
from q7_benchmark.charts import render_all_charts

report = json.loads(Path('$HOME/q7-report.json').read_text())
charts_dir = Path('$HOME/q7-charts')
chart_paths = render_all_charts(report, charts_dir)
opts = RenderOptions(include_charts=True, chart_paths=chart_paths)
render_to_file(report, Path('$HOME/q7-report.md'), opts)
print('Wrote ~/q7-report.md + ~/q7-charts/*.png')
"
```

Open `~/q7-report.md` in your editor or markdown viewer. The verdict is at the top.

## Interpreting the verdict

### TIER_5_GO

Canonical (1:8) p95 < 50 ms. **Proceed with Session 2 PR #9** (L worker skeleton) and downstream Tier 5 features (C5 Latent-Trajectory, C6 Frame-as-Self-Wavetable, C8 Feedback-Through-L, D4 Latent Granulator).

### TIER_5_CONDITIONAL

Canonical p95 between 50 ms and 100 ms. **Re-run after:**
1. Killing all heavy apps (Logic Pro, Chrome with many tabs, Docker)
2. Letting your Mac cool down for 5+ minutes (thermal throttling can inflate latency)
3. Cold-booting macOS (clears caches that may be pressuring memory)

If second run also CONDITIONAL → that's your real number. Either accept and proceed cautiously, or treat as NO_GO.

### TIER_5_NO_GO

Canonical p95 ≥ 100 ms. **Defer L-axis to v1.1** per Vision §11. Ship Tiers 0-4 without L-axis features. Re-evaluate Q7 when:
- MLX quantization (4-bit / 8-bit) lands and benefits DINOv2
- HuggingFace ships a smaller DINOv2 variant
- Apple ships M5+ with substantially more Metal compute

## Advisory flags

The verdict can also surface flags that don't block GO but warrant attention:

- **HIGH_VARIANCE** — stddev > p50 in at least one head. Tier 5 may produce occasional visible hitches.
- **DEGRADES_UNDER_LOAD** — jitter increased >2x under simulated 10-effect render-chain load. SG-8 will mitigate at runtime but expect Tier 5 to be the first thing degraded under sustained load.

## Sharing the result with a follow-up session

After running, the JSON report fully captures the measurement. Paste this back when continuing in a fresh session:

```bash
cat ~/q7-report.json
```

The next session reads the JSON, verifies the verdict, and continues the build.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `ModuleNotFoundError: torch` | Heavy deps not installed | Re-run install command above |
| First run hangs at "Downloading DINOv2" | Network blocked / slow HF | Check connectivity; retry; or set `HF_ENDPOINT=https://hf-mirror.com` |
| Verdict NO_GO on M1 Pro 16GB | Memory pressure from other apps | Quit Chrome/Docker/Logic; re-run |
| Cold-load > 10 s | First run only — model deserialization | Subsequent runs use cached model; no fix needed |
| `BACKEND_NOT_LIT` for CLIP / CLAP | Expected in PR #6 — only DINOv2 lit | CLIP / CLAP encode lit up in Session 2 PR #9 |
| Intel Mac shows `intel_advisory: true` | DEC-Q7-014 | Tier 5 unsupported on Intel; results advisory |

## Related

- Plan: [../../plans/q7/PR-07-report-runbook-verdict-plan.md](../../plans/q7/PR-07-report-runbook-verdict-plan.md)
- Master roadmap: [../../plans/q7/README.md](../../plans/q7/README.md)
- Decisions: DEC-Q7-007 (jitter threshold), DEC-Q7-009 (canonical sparsity), DEC-Q7-014 (Intel Mac)
- Smoke runbook: [./q7-smoke.md](./q7-smoke.md)
