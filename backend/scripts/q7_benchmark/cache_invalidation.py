"""Latent cache invalidation check (DEC-Q7-013).

Pure function: takes a project's cached `latentCacheVersion` dict + the
current `models.toml` revisions, returns the list of backbones whose
versions skew. Caller (frontend project-open code) decides whether to
silent-recompute, lock, or surface.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class BackboneSkew:
    """One backbone's version mismatch between project cache and current."""

    name: str
    project_version: str
    current_version: str

    @property
    def short(self) -> str:
        return (
            f"{self.name}: project={self.project_version[:8]} "
            f"current={self.current_version[:8]}"
        )


def check_skew(
    project_versions: dict[str, str] | None,
    current_versions: dict[str, str],
) -> list[BackboneSkew]:
    """Compare project's cached backbone versions to current registry.

    Returns the list of backbones whose recorded version doesn't match
    the current registry. A backbone present in `current_versions` but
    not in `project_versions` is treated as "no cached version yet" and
    is NOT a skew (it's a first-encode case).

    A backbone present in `project_versions` but not in `current_versions`
    is also NOT a skew — it's "user removed a backbone from the registry;
    project's cache is fine for re-open but won't be updated".
    """
    if not project_versions:
        return []
    skews: list[BackboneSkew] = []
    for name, project_ver in project_versions.items():
        current_ver = current_versions.get(name)
        if current_ver is None:
            continue  # backbone removed from current registry; not a skew
        if project_ver != current_ver:
            skews.append(BackboneSkew(name, project_ver, current_ver))
    return skews


def needs_recompute(
    project_versions: dict[str, str] | None,
    current_versions: dict[str, str],
    *,
    backbone_versions_locked: bool = False,
) -> bool:
    """High-level helper: returns True if the project needs a recompute.

    If `backbone_versions_locked` is True, the project is pinned to its
    own version and any skew triggers a "locked" state (not a recompute).
    Caller surfaces the "unlock to upgrade" UX.
    """
    if backbone_versions_locked:
        return False
    return bool(check_skew(project_versions, current_versions))
