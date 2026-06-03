"""Matplotlib chart rendering for Q7 reports (PR #7).

Charts are written as PNGs to disk; markdown_report.py references them.
matplotlib is in `requirements-q7-measure.txt` (not smoke); these functions
import lazily so smoke environments aren't affected.
"""

from __future__ import annotations

from pathlib import Path


def _lazy_matplotlib():
    """Import matplotlib only when actually rendering — keeps smoke light."""
    try:
        import matplotlib

        matplotlib.use("Agg")  # headless backend
        import matplotlib.pyplot as plt

        return plt
    except ImportError as exc:
        raise RuntimeError(
            "Chart rendering needs matplotlib. Install via: pip install -r "
            "backend/scripts/q7_benchmark/requirements-q7-measure.txt"
        ) from exc


def render_latency_by_backbone(report: dict, out_path: Path) -> Path:
    """Bar chart: p50 / p95 / p99 per backbone."""
    plt = _lazy_matplotlib()
    heads = report.get("measurement", {}).get("heads", {})
    names = ["dinov2", "clip", "clap"]
    p50 = [heads.get(n, {}).get("encode_latency", {}).get("p50_ms", 0) for n in names]
    p95 = [heads.get(n, {}).get("encode_latency", {}).get("p95_ms", 0) for n in names]
    p99 = [heads.get(n, {}).get("encode_latency", {}).get("p99_ms", 0) for n in names]

    fig, ax = plt.subplots(figsize=(7, 4))
    x = list(range(len(names)))
    w = 0.25
    ax.bar([i - w for i in x], p50, width=w, label="p50")
    ax.bar(x, p95, width=w, label="p95")
    ax.bar([i + w for i in x], p99, width=w, label="p99")
    ax.set_xticks(x)
    ax.set_xticklabels(names)
    ax.set_ylabel("Latency (ms)")
    ax.set_title("Per-backbone encode latency")
    ax.axhline(y=50.0, color="red", linestyle="--", linewidth=0.8, label="50ms gate")
    ax.legend()
    ax.grid(axis="y", alpha=0.3)
    fig.tight_layout()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, dpi=120)
    plt.close(fig)
    return out_path


def render_jitter_by_sparsity(report: dict, out_path: Path) -> Path:
    """Line chart: jitter p95 vs sparsity, with 50ms gate line."""
    plt = _lazy_matplotlib()
    interp = report.get("measurement", {}).get("interpolation", {})
    by_sparsity = interp.get("by_sparsity", {})
    sparsities = [4, 8, 16, 32]
    p50 = [by_sparsity.get(str(s), {}).get("jitter_p50_ms", 0) for s in sparsities]
    p95 = [by_sparsity.get(str(s), {}).get("jitter_p95_ms", 0) for s in sparsities]
    p99 = [by_sparsity.get(str(s), {}).get("jitter_p99_ms", 0) for s in sparsities]
    canonical = interp.get("canonical_sparsity", 8)

    fig, ax = plt.subplots(figsize=(7, 4))
    ax.plot(sparsities, p50, marker="o", label="p50")
    ax.plot(sparsities, p95, marker="s", label="p95", linewidth=2)
    ax.plot(sparsities, p99, marker="^", label="p99", linestyle="--")
    ax.axhline(y=50.0, color="red", linestyle="--", linewidth=0.8, label="50ms gate")
    ax.axvline(
        x=canonical,
        color="green",
        linestyle=":",
        alpha=0.5,
        label=f"canonical 1:{canonical}",
    )
    ax.set_xticks(sparsities)
    ax.set_xticklabels([f"1:{s}" for s in sparsities])
    ax.set_xlabel("Sparsity")
    ax.set_ylabel("Jitter (ms)")
    ax.set_title("Interpolation jitter by sparsity ratio")
    ax.legend()
    ax.grid(True, alpha=0.3)
    fig.tight_layout()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, dpi=120)
    plt.close(fig)
    return out_path


def render_all_charts(report: dict, out_dir: Path) -> dict[str, Path]:
    """Render all standard charts to out_dir/<name>.png. Returns name → path."""
    out_dir.mkdir(parents=True, exist_ok=True)
    return {
        "latency_by_backbone": render_latency_by_backbone(
            report, out_dir / "latency_by_backbone.png"
        ),
        "jitter_by_sparsity": render_jitter_by_sparsity(
            report, out_dir / "jitter_by_sparsity.png"
        ),
    }
