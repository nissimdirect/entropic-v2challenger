"""Capture frozen golden reference output from the PRE-REFACTOR key effects.

MK.8 back-compat: this script imports the LEGACY effect source (extracted from
origin/main, vendored alongside this file as ``legacy_chroma_key.py`` /
``legacy_luma_key.py``) and runs it once on a deterministic green-screen
fixture, saving the raw uint8 output arrays as ``.npy``.

The golden test asserts the REFACTORED ``fx.chroma_key`` / ``fx.luma_key`` at
spill=0 produce arrays byte-equal to these frozen references — proving the
kernel refactor did not change any keyed output by even 1/255.

Run from the backend dir:
    python tests/test_masking/fixtures/_capture_legacy_golden.py

Idempotent: regenerating produces identical bytes (the fixture + legacy math
are both deterministic).
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent


def make_green_screen_fixture() -> np.ndarray:
    """Deterministic RGBA green-screen frame (subject over green).

    256×256: a green (0,255,0) background with a magenta (255,0,255) subject
    rectangle, plus a graded green region (varying brightness) to exercise the
    softness blur and saturation floor. Fully opaque incoming alpha (255).
    """
    h, w = 256, 256
    frame = np.zeros((h, w, 4), dtype=np.uint8)
    # Pure green background.
    frame[:, :, 1] = 255
    frame[:, :, 3] = 255  # opaque

    # Magenta subject (a centered rectangle).
    frame[64:192, 96:160, 0] = 255
    frame[64:192, 96:160, 1] = 0
    frame[64:192, 96:160, 2] = 255

    # A graded green vertical strip on the left (varying value) to vary
    # saturation/brightness near the key colour — exercises the blur edge.
    grad = np.linspace(60, 255, h).astype(np.uint8)
    frame[:, 0:32, 0] = 0
    frame[:, 0:32, 1] = grad[:, None]
    frame[:, 0:32, 2] = 0

    return frame


def make_luma_fixture() -> np.ndarray:
    """Deterministic RGBA frame with a clear dark/bright split for luma keying."""
    h, w = 256, 256
    frame = np.zeros((h, w, 4), dtype=np.uint8)
    frame[:, :, 3] = 255
    # Left half dark gray (40), right half light gray (210).
    frame[:, : w // 2, :3] = 40
    frame[:, w // 2 :, :3] = 210
    # A mid-gray gradient band across the middle rows to exercise the threshold.
    band = np.linspace(0, 255, w).astype(np.uint8)
    frame[120:136, :, 0] = band[None, :]
    frame[120:136, :, 1] = band[None, :]
    frame[120:136, :, 2] = band[None, :]
    return frame


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


def main() -> None:
    legacy_chroma = _load("legacy_chroma_key", HERE / "legacy_chroma_key.py")
    legacy_luma = _load("legacy_luma_key", HERE / "legacy_luma_key.py")

    kw = dict(frame_index=0, seed=0, resolution=(256, 256))

    # --- chroma: default params (the shipped defaults) -------------------
    cframe = make_green_screen_fixture()
    cparams = {"hue": 120.0, "tolerance": 30.0, "softness": 10.0}
    cout, _ = legacy_chroma.apply(cframe.copy(), cparams, None, **kw)
    np.save(HERE / "golden_chroma_default.npy", cout)
    np.save(HERE / "green_screen_fixture.npy", cframe)

    # --- chroma: softness=0 (sharp edge, no blur) ------------------------
    cparams0 = {"hue": 120.0, "tolerance": 30.0, "softness": 0.0}
    cout0, _ = legacy_chroma.apply(cframe.copy(), cparams0, None, **kw)
    np.save(HERE / "golden_chroma_sharp.npy", cout0)

    # --- luma: dark + bright modes ---------------------------------------
    lframe = make_luma_fixture()
    np.save(HERE / "luma_fixture.npy", lframe)
    ldark, _ = legacy_luma.apply(
        lframe.copy(), {"threshold": 0.3, "mode": "dark", "softness": 10.0}, None, **kw
    )
    np.save(HERE / "golden_luma_dark.npy", ldark)
    lbright, _ = legacy_luma.apply(
        lframe.copy(),
        {"threshold": 0.5, "mode": "bright", "softness": 10.0},
        None,
        **kw,
    )
    np.save(HERE / "golden_luma_bright.npy", lbright)

    print("Captured golden references:")
    for f in sorted(HERE.glob("*.npy")):
        print(f"  {f.name}  shape={np.load(f).shape}")


if __name__ == "__main__":
    main()
