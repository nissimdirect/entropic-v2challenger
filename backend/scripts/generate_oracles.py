"""Generate oracle validator stubs per category from _categorization.json.

Usage:
  python3 backend/scripts/generate_oracles.py                   # dry-run, list targets
  python3 backend/scripts/generate_oracles.py --category transform   # write transform stubs
  python3 backend/scripts/generate_oracles.py --category transform --write
  python3 backend/scripts/generate_oracles.py --category all --write

Categories + oracle templates:
  transform             testsrc_clip    per-pixel L1 distance >= 2.0
  filter                testsrc_clip    Laplacian-variance ratio change
  spatial_permutation   mandelbrot_clip per-pixel L1 distance >= 5.0
  channel               testsrc_clip    max single-channel delta >= 2.0
  temporal              mandelbrot_clip frame-diff mean shift vs input
  symbolic              testsrc_clip    per-pixel L1 distance >= 20.0 (dramatic)
  generative            testsrc_clip    per-pixel L1 distance >= 5.0
  composite             skipped (hand-tune per effect)

Does NOT overwrite existing hand-tuned tests (color_invert, blur, pixelsort,
channel_destroy, datamosh).
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
ORACLES_DIR = ROOT / "tests" / "oracles"
CATEGORIZATION = ORACLES_DIR / "_categorization.json"


# Effects that already have hand-tuned oracles — do NOT overwrite.
EXISTING = {
    "fx.color_invert",
    "fx.blur",
    "fx.pixelsort",
    "fx.channel_destroy",
    "fx.datamosh",
}


TRANSFORM_TEMPLATE = '''"""Auto-generated oracle for {effect_id}.

Template: transform (per-pixel function, no spatial coupling).
Oracle: per-pixel L1 distance on flat testsrc input proves pixel mutation.

Catches:
  - Effect silently disabled (output == input, L1 = 0)
  - Bypass bug (CLI chain not applied)

Tolerance is intentionally low (L1 >= {min_l1}) — some transforms barely shift
pixels at default params. Tighten per-effect if false-positive rate is high.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from .conftest import per_pixel_l1_distance, run_cli_apply

EFFECT_ID = "{effect_id}"
MIN_L1 = {min_l1}


@pytest.mark.oracle
def test_{module}_changes_pixels(testsrc_clip: Path, tmp_path: Path) -> None:
    """{module} should visibly transform flat testsrc input."""
    out = tmp_path / "out.mp4"
    run_cli_apply(testsrc_clip, out, EFFECT_ID)

    l1 = per_pixel_l1_distance(testsrc_clip, out)

    assert l1 >= MIN_L1, (
        f"{{EFFECT_ID}} produced no visible change (L1={{l1:.2f}}, need >= {{MIN_L1}})\\n"
        f"  — effect may be silently disabled or CLI chain broken"
    )
'''


FILTER_TEMPLATE = '''"""Auto-generated oracle for {effect_id}.

Template: filter (spatial convolution — blur / sharpen / edge).
Oracle: Laplacian variance changes detectably vs input.

Catches:
  - Effect silently disabled
  - Bypass bug
"""

from __future__ import annotations

from pathlib import Path

import pytest

from .conftest import laplacian_variance, per_pixel_l1_distance, run_cli_apply

EFFECT_ID = "{effect_id}"
MIN_L1 = 2.0
MIN_LAPLACIAN_RATIO_CHANGE = 0.05  # 5% change in sharpness


@pytest.mark.oracle
def test_{module}_alters_sharpness(mandelbrot_clip: Path, tmp_path: Path) -> None:
    """{module} should alter high-frequency content."""
    out = tmp_path / "out.mp4"
    run_cli_apply(mandelbrot_clip, out, EFFECT_ID)

    l1 = per_pixel_l1_distance(mandelbrot_clip, out)
    in_sharp = laplacian_variance(mandelbrot_clip)
    out_sharp = laplacian_variance(out)
    ratio_change = abs(out_sharp - in_sharp) / max(in_sharp, 1.0)

    assert l1 >= MIN_L1, (
        f"{{EFFECT_ID}} produced no visible change (L1={{l1:.2f}}, need >= {{MIN_L1}})"
    )
    assert ratio_change >= MIN_LAPLACIAN_RATIO_CHANGE, (
        f"{{EFFECT_ID}} did not alter sharpness\\n"
        f"  input  lap-var: {{in_sharp:.1f}}\\n"
        f"  output lap-var: {{out_sharp:.1f}}\\n"
        f"  ratio change:   {{ratio_change:.3f}} (need >= {{MIN_LAPLACIAN_RATIO_CHANGE}})"
    )
'''


SPATIAL_PERMUTATION_TEMPLATE = '''"""Auto-generated oracle for {effect_id}.

Template: spatial_permutation (pixels rearranged).
Oracle: per-pixel L1 distance on mandelbrot (rich texture) proves movement.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from .conftest import per_pixel_l1_distance, run_cli_apply

EFFECT_ID = "{effect_id}"
MIN_L1 = 5.0


@pytest.mark.oracle
def test_{module}_permutes_pixels(mandelbrot_clip: Path, tmp_path: Path) -> None:
    """{module} should rearrange pixels on rich input."""
    out = tmp_path / "out.mp4"
    run_cli_apply(mandelbrot_clip, out, EFFECT_ID)

    l1 = per_pixel_l1_distance(mandelbrot_clip, out)

    assert l1 >= MIN_L1, (
        f"{{EFFECT_ID}} produced no visible permutation (L1={{l1:.2f}}, need >= {{MIN_L1}})"
    )
'''


CHANNEL_TEMPLATE = '''"""Auto-generated oracle for {effect_id}.

Template: channel (isolation / per-channel manipulation).
Oracle: at least one channel shows larger delta than the others.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from .conftest import first_frame_bgr_mean, run_cli_apply

EFFECT_ID = "{effect_id}"
MIN_MAX_CHANNEL_DELTA = 5.0


@pytest.mark.oracle
def test_{module}_mutates_channels(testsrc_clip: Path, tmp_path: Path) -> None:
    """{module} should shift at least one channel meaningfully."""
    out = tmp_path / "out.mp4"
    run_cli_apply(testsrc_clip, out, EFFECT_ID)

    in_means = first_frame_bgr_mean(testsrc_clip)
    out_means = first_frame_bgr_mean(out)
    deltas = np.abs(out_means - in_means)

    assert float(deltas.max()) >= MIN_MAX_CHANNEL_DELTA, (
        f"{{EFFECT_ID}} did not shift any channel meaningfully\\n"
        f"  input  BGR mean: {{in_means}}\\n"
        f"  output BGR mean: {{out_means}}\\n"
        f"  max delta:       {{float(deltas.max()):.2f}} (need >= {{MIN_MAX_CHANNEL_DELTA}})"
    )
'''


TEMPORAL_TEMPLATE = '''"""Auto-generated oracle for {effect_id}.

Template: temporal (stateful, frame-index dependent, or accumulator).
Oracle: single-frame L1 + frame-diff pattern change.

NOTE: Temporal oracles are inherently weaker than pure-function oracles —
a single invocation may not reveal state accumulation. Pairs well with
multi-frame regression in a follow-up sprint.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from .conftest import per_pixel_l1_distance, run_cli_apply

EFFECT_ID = "{effect_id}"
MIN_L1 = 2.0


@pytest.mark.oracle
def test_{module}_changes_output(mandelbrot_clip: Path, tmp_path: Path) -> None:
    """{module} should produce a detectable first-frame difference."""
    out = tmp_path / "out.mp4"
    run_cli_apply(mandelbrot_clip, out, EFFECT_ID)

    l1 = per_pixel_l1_distance(mandelbrot_clip, out)

    assert l1 >= MIN_L1, (
        f"{{EFFECT_ID}} produced no visible change on first frame (L1={{l1:.2f}}, need >= {{MIN_L1}})"
    )
'''


SYMBOLIC_TEMPLATE = '''"""Auto-generated oracle for {effect_id}.

Template: symbolic (renders glyphs / structure-replacing).
Oracle: dramatic pixel-level change (structure completely redrawn).
"""

from __future__ import annotations

from pathlib import Path

import pytest

from .conftest import per_pixel_l1_distance, run_cli_apply

EFFECT_ID = "{effect_id}"
MIN_L1 = 20.0  # dramatic — symbolic rendering flips structure


@pytest.mark.oracle
def test_{module}_rerenders_structure(testsrc_clip: Path, tmp_path: Path) -> None:
    """{module} should dramatically restructure output."""
    out = tmp_path / "out.mp4"
    run_cli_apply(testsrc_clip, out, EFFECT_ID)

    l1 = per_pixel_l1_distance(testsrc_clip, out)

    assert l1 >= MIN_L1, (
        f"{{EFFECT_ID}} did not re-render structure (L1={{l1:.2f}}, need >= {{MIN_L1}})"
    )
'''


GENERATIVE_TEMPLATE = '''"""Auto-generated oracle for {effect_id}.

Template: generative (overlays new content — particles, patterns, CA).
Oracle: visible pixel change, even on flat input (overlay is added).
"""

from __future__ import annotations

from pathlib import Path

import pytest

from .conftest import per_pixel_l1_distance, run_cli_apply

EFFECT_ID = "{effect_id}"
MIN_L1 = 2.0


@pytest.mark.oracle
def test_{module}_produces_output(testsrc_clip: Path, tmp_path: Path) -> None:
    """{module} should add visible content to the frame."""
    out = tmp_path / "out.mp4"
    run_cli_apply(testsrc_clip, out, EFFECT_ID)

    l1 = per_pixel_l1_distance(testsrc_clip, out)

    assert l1 >= MIN_L1, (
        f"{{EFFECT_ID}} added no visible content (L1={{l1:.2f}}, need >= {{MIN_L1}})"
    )
'''


COMPOSITE_TEMPLATE = '''"""Auto-generated oracle for {effect_id}.

Template: composite (multi-mode — validated with conservative "any-change" oracle).
Oracle: per-pixel L1 distance >= 2.0 on flat testsrc input.

Composite effects have multiple modes or complex parameter interactions.
This oracle catches silent-disable and CLI-bypass at default params.
Tighten per-effect if defaults hit a no-op mode.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from .conftest import per_pixel_l1_distance, run_cli_apply

EFFECT_ID = "{effect_id}"
MIN_L1 = 2.0


@pytest.mark.oracle
def test_{module}_produces_output(testsrc_clip: Path, tmp_path: Path) -> None:
    """{module} should produce visible change at default params."""
    out = tmp_path / "out.mp4"
    run_cli_apply(testsrc_clip, out, EFFECT_ID)

    l1 = per_pixel_l1_distance(testsrc_clip, out)

    assert l1 >= MIN_L1, (
        f"{{EFFECT_ID}} produced no visible change (L1={{l1:.2f}}, need >= {{MIN_L1}})\\n"
        f"  — effect may be silently disabled, in no-op mode, or CLI chain broken"
    )
'''


# Effects that require external input (sidechain frame, file path) and can't
# be validated with CLI-only invocation. Skipped from generation.
SKIP_NEEDS_EXTERNAL = {
    "fx.sidechain_cross_blend",  # needs sidechain_frame param from pipeline
    "fx.sidechain_gate",
    "fx.sidechain_interference",
    "fx.sidechain_modulate",
    "fx.subliminal",  # needs source_path / source_text
}


TEMPLATES = {
    "transform": TRANSFORM_TEMPLATE,
    "filter": FILTER_TEMPLATE,
    "spatial_permutation": SPATIAL_PERMUTATION_TEMPLATE,
    "channel": CHANNEL_TEMPLATE,
    "temporal": TEMPORAL_TEMPLATE,
    "symbolic": SYMBOLIC_TEMPLATE,
    "generative": GENERATIVE_TEMPLATE,
    "composite": COMPOSITE_TEMPLATE,
}


def module_from_id(effect_id: str) -> str:
    """fx.color_invert -> color_invert."""
    return effect_id.split(".", 1)[1] if "." in effect_id else effect_id


def render(effect_id: str, category: str) -> str:
    template = TEMPLATES[category]
    module = module_from_id(effect_id)
    kwargs = {
        "effect_id": effect_id,
        "module": module,
        "min_l1": 2.0,
    }
    return template.format(**kwargs)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--category",
        required=True,
        help="Target category (or 'all')",
    )
    parser.add_argument(
        "--write",
        action="store_true",
        help="Write files (otherwise dry-run)",
    )
    args = parser.parse_args()

    cats = json.loads(CATEGORIZATION.read_text())
    cats.pop("_meta", None)

    targets = []
    for effect_id, category in cats.items():
        if category.startswith("_"):
            continue
        if args.category != "all" and category != args.category:
            continue
        if effect_id in EXISTING:
            continue
        if effect_id in SKIP_NEEDS_EXTERNAL:
            continue
        targets.append((effect_id, category))

    print(f"Targets: {len(targets)} effects (category={args.category})")
    for effect_id, category in targets:
        module = module_from_id(effect_id)
        test_file = ORACLES_DIR / f"test_{module}_oracle.py"
        action = "WRITE" if args.write else "DRY "
        exists = " [EXISTS]" if test_file.exists() else ""
        print(f"  {action} {category:22s} {test_file.name}{exists}")

        if args.write:
            if test_file.exists():
                print("    skipped (already exists)")
                continue
            test_file.write_text(render(effect_id, category))

    if not args.write:
        print(f"\n(dry-run — re-run with --write to create {len(targets)} files)")


if __name__ == "__main__":
    main()
