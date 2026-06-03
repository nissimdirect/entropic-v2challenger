# DEC-Q7-013 — Latent cache invalidation strategy

**Status:** Decided 2026-06-03
**Owner:** Q7 PR #6
**Scope:** When a backbone model version changes (DINOv2 v1 → v2, CLIP revision bump, etc.), what happens to project-level cached latents that were computed against the OLD weights?

## Question

The Vision direction includes per-project latent caches: each project stores the L-axis embeddings for its source frames (so re-opening a project doesn't re-run inference). When the underlying backbone weights change, those cached latents are mathematically incompatible with new code paths reading them. Silent reuse → garbage outputs. Forced recompute → user surprise (sudden multi-minute reload on first open).

How do we handle the version skew?

## Decision

### Project-level metadata: `latentCacheVersion`

Every project stores, alongside its latent cache, a small metadata dict:

```json
{
  "latentCacheVersion": {
    "dinov2": "deadbeefcafe1234",   // 12-char prefix of the model revision SHA used at cache time
    "clip":   "feedbeef1234abcd",
    "clap":   "1234abcddeadbeef"
  },
  "computed_at": "2026-06-15T14:23:00Z",
  "backbone_versions_locked": false  // user-controlled; see "Override" below
}
```

This metadata persists in the `.entropic` (or `.creatrix` after PR-D) project file, alongside the latent tensors themselves.

### Invalidation policy

On project open:

1. Read `latentCacheVersion` for each backbone the project uses
2. Compare against the current `models.toml` revision
3. **If mismatch (any backbone)**:
   - **Default behavior**: silent recompute (the project re-runs encode for the affected frames on first L-axis access); toast surfaces "Updating L cache for version skew — first frame may take 1-3 seconds"
   - **If `backbone_versions_locked: true`**: refuse to use the new revision; keep the old cache; toast surfaces "Project locked to backbone version X; new version Y available — unlock to upgrade"

### Recompute trigger granularity

- Recompute is **per-backbone**, not all-or-nothing
- If only DINOv2 changes, CLIP + CLAP caches stay valid
- Per-frame: only frames that the user accesses get recomputed (lazy, not eager)
- The metadata updates incrementally as recompute completes per backbone

### Override: per-project lock

Power users may want to pin their project to a specific backbone version (e.g., "I built this scene against DINOv2 v1 and I want it to look the same forever, even if we ship v2"). The `backbone_versions_locked: true` flag in metadata enables this:

- New L work on the project uses the locked old revision (still in cache; we don't auto-delete)
- The user can unlock + upgrade via a UI action ("Upgrade to current L backbones — will recompute X frames")
- If the locked revision's weights have been garbage-collected from cache (DEC-Q7-005 §"Refresh procedure" deletes old cache subdirs), the lock becomes "broken" — surface clearly + offer recompute or migration to a sibling backbone version

### When recompute is heavy

If the project has thousands of frames with cached latents and a backbone version bump invalidates all of them, recompute can take minutes. Mitigation:

- Background recompute on a low-priority thread; user can keep editing
- Progress bar in status area: "Updating L cache: 423 / 5,000 frames"
- Recompute is checkpointed every 100 frames so app crash → resume from last checkpoint, not start over
- Optional: user can skip recompute (use stale latents) for "preview" mode + recompute only on render

### Cross-cuts with `.dna` patch format (SPEC-6)

The `.dna` format is the portable patch format (effect graphs + automation), not the per-project latent cache. But `.dna` patches may REFERENCE latent positions in a project's cache. So:

- `.dna` patches store backbone version SHAs in their resource budget descriptor
- On `.dna` import into a project, version-skew check fires (same algorithm)
- Skewed `.dna` → surface "Patch was built against backbone version X; recompute project to align" with one-click recompute action

## Considered alternatives

- **Silent reuse (no version check)** — REJECTED. Garbage outputs without explanation; worst UX
- **Force project recompute on every backbone bump** — REJECTED. Eager recompute is slow + may take longer than the user has time for; lazy per-frame is friendlier
- **Refuse to open the project if version skew detected** — REJECTED. Too aggressive; users would lose work
- **Migrate cached latents via a linear projection** (interpolate from old version space to new) — REJECTED for v1. Interesting research direction (works for some backbone families); not safe for arbitrary version changes; too complex for v1
- **Store ALL backbone versions ever computed (multi-version cache)** — DEFERRED. Storage costs balloon (3× per backbone version stored). Possible v2 feature for power users

## Side effects to track

- New project metadata field `latentCacheVersion` (and `computed_at`, `backbone_versions_locked`) — frontend project-persistence.ts adds these
- New ZMQ event `q7-latent-recompute-progress` (used in PR #11 SG-8 → frontend)
- Cache files: `~/.entropic/models/q7/<name>/<sha[:12]>/` already version-segmented; old caches are not auto-deleted (lets locked projects keep using them)
- Manual cleanup helper: `make q7-purge-old-caches` (PR #7 or later — purges cache dirs not referenced by any open project)

## Verification

After PR #6 merges:

```python
# Mock: simulate version skew
from q7_benchmark.cache_invalidation import check_skew
skew = check_skew(
    project_versions={"dinov2": "deadbeef0000", "clip": "feedbeef0000"},
    current_versions={"dinov2": "deadbeef0000", "clip": "newrevxxxxxx"},
)
print(skew)
# Expected: [BackboneSkew(name='clip', project_version='feedbeef0000', current_version='newrevxxxxxx')]
```

## Cross-references

- DEC-Q7-005 — model SHA pinning (this is the invalidation layer atop)
- DEC-Q7-010 — degrade order (cache invalidation doesn't fire degrade; runs at "project open" lifecycle)
- DEC-Q7-012 — download UX (recompute is similar UX pattern)
- SPEC-6 — `.dna` format references backbone versions via budget descriptor
