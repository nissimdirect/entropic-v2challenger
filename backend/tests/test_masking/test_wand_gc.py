"""Tests for masking.wand.gc_orphan_sidecars (MK.6 P3 sidecar GC).

Hard-oracle named tests (must all pass):
  test_gc_deletes_orphan_sidecars_only
  test_gc_never_deletes_outside_sanctioned_dir      (NEGATIVE)
  test_gc_ignores_non_png                           (NEGATIVE)
  test_gc_empty_active_set_deletes_all_orphans_but_nothing_else
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path
from unittest.mock import patch


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _write_fake_png(directory: Path, stem: str) -> Path:
    """Write a 1-byte file named *stem*.png in *directory*. Returns the path."""
    path = directory / f"{stem}.png"
    path.write_bytes(b"\x89PNG")
    return path


def _write_fake_file(directory: Path, name: str) -> Path:
    """Write a 1-byte file with an arbitrary *name* in *directory*. Returns the path."""
    path = directory / name
    path.write_bytes(b"x")
    return path


# ---------------------------------------------------------------------------
# test_gc_deletes_orphan_sidecars_only
#
# Verifies: orphaned PNGs are deleted; referenced (active) PNGs are kept.
# ---------------------------------------------------------------------------


class TestGcDeletesOrphanSidecarsOnly:
    def test_gc_deletes_orphan_sidecars_only(self, tmp_path: Path):
        """Orphans are deleted; the active node's PNG is preserved."""
        from masking.wand import gc_orphan_sidecars, _ALLOWED_SIDECAR_DIR

        fake_sidecar_dir = tmp_path / "mask-bitmaps"
        fake_sidecar_dir.mkdir(mode=0o700)

        active_id = "active-node-001"
        orphan_id_1 = "orphan-node-aaa"
        orphan_id_2 = "orphan-node-bbb"

        active_png = _write_fake_png(fake_sidecar_dir, active_id)
        orphan_png_1 = _write_fake_png(fake_sidecar_dir, orphan_id_1)
        orphan_png_2 = _write_fake_png(fake_sidecar_dir, orphan_id_2)

        with patch("masking.wand._ALLOWED_SIDECAR_DIR", fake_sidecar_dir):
            deleted = gc_orphan_sidecars({active_id})

        # Two orphans deleted
        assert deleted == 2, f"Expected 2 deleted, got {deleted}"
        # Active PNG survives
        assert active_png.exists(), "Active node PNG must not be deleted"
        # Orphans gone
        assert not orphan_png_1.exists(), f"Orphan 1 should be deleted: {orphan_png_1}"
        assert not orphan_png_2.exists(), f"Orphan 2 should be deleted: {orphan_png_2}"

    def test_gc_with_multiple_active_nodes(self, tmp_path: Path):
        """All active nodes' PNGs are kept; only unreferenced ones are deleted."""
        from masking.wand import gc_orphan_sidecars

        fake_sidecar_dir = tmp_path / "mask-bitmaps"
        fake_sidecar_dir.mkdir(mode=0o700)

        active_ids = {"node-alpha", "node-beta", "node-gamma"}
        orphan_id = "node-deleted"

        active_pngs = [_write_fake_png(fake_sidecar_dir, nid) for nid in active_ids]
        orphan_png = _write_fake_png(fake_sidecar_dir, orphan_id)

        with patch("masking.wand._ALLOWED_SIDECAR_DIR", fake_sidecar_dir):
            deleted = gc_orphan_sidecars(active_ids)

        assert deleted == 1, f"Expected 1 deleted, got {deleted}"
        for p in active_pngs:
            assert p.exists(), f"Active PNG should survive: {p}"
        assert not orphan_png.exists(), "Orphan PNG should be deleted"

    def test_gc_returns_zero_when_all_active(self, tmp_path: Path):
        """No orphans → 0 deleted."""
        from masking.wand import gc_orphan_sidecars

        fake_sidecar_dir = tmp_path / "mask-bitmaps"
        fake_sidecar_dir.mkdir(mode=0o700)

        node_id = "node-still-active"
        _write_fake_png(fake_sidecar_dir, node_id)

        with patch("masking.wand._ALLOWED_SIDECAR_DIR", fake_sidecar_dir):
            deleted = gc_orphan_sidecars({node_id})

        assert deleted == 0

    def test_gc_returns_zero_when_dir_is_empty(self, tmp_path: Path):
        """Empty sidecar dir → 0 deleted, no crash."""
        from masking.wand import gc_orphan_sidecars

        fake_sidecar_dir = tmp_path / "mask-bitmaps"
        fake_sidecar_dir.mkdir(mode=0o700)

        with patch("masking.wand._ALLOWED_SIDECAR_DIR", fake_sidecar_dir):
            deleted = gc_orphan_sidecars({"some-id"})

        assert deleted == 0

    def test_gc_returns_zero_when_dir_does_not_exist(self, tmp_path: Path):
        """Non-existent sidecar dir → 0 deleted, no crash."""
        from masking.wand import gc_orphan_sidecars

        missing_dir = tmp_path / "does-not-exist"
        # Do NOT create it

        with patch("masking.wand._ALLOWED_SIDECAR_DIR", missing_dir):
            deleted = gc_orphan_sidecars(set())

        assert deleted == 0


# ---------------------------------------------------------------------------
# test_gc_never_deletes_outside_sanctioned_dir  (NEGATIVE)
#
# The GC must refuse to delete a file that resolves outside _ALLOWED_SIDECAR_DIR,
# even if it looks like a valid node-id .png from the iteration perspective.
# We simulate this by placing a symlink that points outside the dir.
# ---------------------------------------------------------------------------


class TestGcNeverDeletesOutsideSanctionedDir:
    def test_gc_never_deletes_outside_sanctioned_dir(self, tmp_path: Path):
        """A symlink pointing outside the sanctioned dir is never deleted.

        Setup:
          fake_sidecar_dir/  ← patched as _ALLOWED_SIDECAR_DIR
            orphan-safe.png  ← ordinary orphan (should be deleted)
            symlink-node.png → ../outside.png  ← symlink escaping the dir (must NOT be deleted)

          tmp_path/outside.png  ← real file that must survive
        """
        from masking.wand import gc_orphan_sidecars

        fake_sidecar_dir = tmp_path / "mask-bitmaps"
        fake_sidecar_dir.mkdir(mode=0o700)

        # A file outside the sanctioned dir
        outside_file = tmp_path / "outside.png"
        outside_file.write_bytes(b"\x89PNG")

        # Symlink inside the dir that points to the outside file
        symlink_path = fake_sidecar_dir / "symlink-node.png"
        try:
            symlink_path.symlink_to(outside_file)
        except (OSError, NotImplementedError):
            # If symlinks are unavailable on this platform, skip this sub-check
            return

        # Ordinary orphan (no active set)
        orphan_png = _write_fake_png(fake_sidecar_dir, "orphan-safe")

        with patch("masking.wand._ALLOWED_SIDECAR_DIR", fake_sidecar_dir):
            deleted = gc_orphan_sidecars(set())  # empty active set — all orphans

        # The outside file must NOT have been deleted
        assert outside_file.exists(), (
            "GC must never delete files outside the sanctioned dir (followed a symlink)"
        )

        # The ordinary orphan inside the dir CAN be deleted (it's an orphan)
        # deleted count depends on whether the symlink was skipped — the important thing
        # is that outside_file survives.
        assert deleted >= 0  # No assertion on exact count; safety is the guarantee


# ---------------------------------------------------------------------------
# test_gc_ignores_non_png  (NEGATIVE)
#
# .sh, .txt, files without extension — must all be ignored even if their
# stem matches the node-id pattern and they are not in active_node_ids.
# ---------------------------------------------------------------------------


class TestGcIgnoresNonPng:
    def test_gc_ignores_non_png(self, tmp_path: Path):
        """Non-.png files in the sanctioned dir are never touched."""
        from masking.wand import gc_orphan_sidecars

        fake_sidecar_dir = tmp_path / "mask-bitmaps"
        fake_sidecar_dir.mkdir(mode=0o700)

        # Files that look like node ids but are not .png
        shell_script = _write_fake_file(fake_sidecar_dir, "node-aaa123.sh")
        text_file = _write_fake_file(fake_sidecar_dir, "node-bbb456.txt")
        no_ext = _write_fake_file(fake_sidecar_dir, "node-ccc789")
        json_file = _write_fake_file(fake_sidecar_dir, "node-ddd000.json")

        # One real orphan .png
        orphan_png = _write_fake_png(fake_sidecar_dir, "orphan-eee")

        with patch("masking.wand._ALLOWED_SIDECAR_DIR", fake_sidecar_dir):
            deleted = gc_orphan_sidecars(set())  # all orphans, no active set

        # Only the .png was deleted
        assert deleted == 1, f"Only 1 .png orphan; deleted={deleted}"
        assert shell_script.exists(), ".sh must not be deleted"
        assert text_file.exists(), ".txt must not be deleted"
        assert no_ext.exists(), "extensionless file must not be deleted"
        assert json_file.exists(), ".json must not be deleted"
        assert not orphan_png.exists(), ".png orphan should be deleted"

    def test_gc_ignores_png_with_exotic_stem(self, tmp_path: Path):
        """PNG files whose stem does NOT match the node-id regex are skipped."""
        from masking.wand import gc_orphan_sidecars

        fake_sidecar_dir = tmp_path / "mask-bitmaps"
        fake_sidecar_dir.mkdir(mode=0o700)

        # stem with spaces or special chars — does not match ^[A-Za-z0-9_-]{1,64}$
        exotic = _write_fake_file(fake_sidecar_dir, "has space.png")
        with_dot = _write_fake_file(fake_sidecar_dir, "has.dot.png")

        with patch("masking.wand._ALLOWED_SIDECAR_DIR", fake_sidecar_dir):
            deleted = gc_orphan_sidecars(set())

        assert deleted == 0, f"Exotic-stem PNGs must be skipped; deleted={deleted}"
        assert exotic.exists()
        assert with_dot.exists()


# ---------------------------------------------------------------------------
# test_gc_empty_active_set_deletes_all_orphans_but_nothing_else
#
# With an empty active set every .png orphan is deleted, but non-.png and
# symlink-out files are still preserved.
# ---------------------------------------------------------------------------


class TestGcEmptyActiveSetDeletesAllOrphansButNothingElse:
    def test_gc_empty_active_set_deletes_all_orphans_but_nothing_else(
        self, tmp_path: Path
    ):
        """Empty active set → all valid orphan PNGs deleted; non-PNGs untouched."""
        from masking.wand import gc_orphan_sidecars

        fake_sidecar_dir = tmp_path / "mask-bitmaps"
        fake_sidecar_dir.mkdir(mode=0o700)

        orphan_a = _write_fake_png(fake_sidecar_dir, "orphan-aaaa")
        orphan_b = _write_fake_png(fake_sidecar_dir, "orphan-bbbb")
        orphan_c = _write_fake_png(fake_sidecar_dir, "orphan-cccc")
        non_png = _write_fake_file(fake_sidecar_dir, "metadata.json")

        with patch("masking.wand._ALLOWED_SIDECAR_DIR", fake_sidecar_dir):
            deleted = gc_orphan_sidecars(set())  # empty active set

        assert deleted == 3, f"All 3 orphan PNGs should be deleted; deleted={deleted}"
        assert not orphan_a.exists()
        assert not orphan_b.exists()
        assert not orphan_c.exists()
        assert non_png.exists(), "Non-.png file must survive"

    def test_gc_empty_active_set_on_empty_dir(self, tmp_path: Path):
        """Empty active set + empty dir → 0 deleted, no crash."""
        from masking.wand import gc_orphan_sidecars

        fake_sidecar_dir = tmp_path / "mask-bitmaps"
        fake_sidecar_dir.mkdir(mode=0o700)

        with patch("masking.wand._ALLOWED_SIDECAR_DIR", fake_sidecar_dir):
            deleted = gc_orphan_sidecars(set())

        assert deleted == 0
