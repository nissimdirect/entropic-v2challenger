# Community & Ecosystem — Entropic v2 Addendum

> Generated: 2026-02-19
> Status: APPROVED CONCEPT — architecture must support from Phase 1
> User directive: "the .recipe spec and making that community driven is a great idea"

---

## .recipe Spec (Community-Driven)

Recipes are shareable effect chain configurations. The architecture MUST support community sharing from the start.

### What a Recipe Contains
```json
{
  "entropic_version": "2.0.0",
  "recipe_version": "1.0.0",
  "name": "VHS Decay",
  "author": "nissim",
  "description": "Analog tape degradation with tracking errors",
  "tags": ["analog", "vhs", "retro", "destruction"],
  "license": "CC-BY-4.0",
  "effects": [
    {
      "id": "fx.vhs",
      "params": { "tracking": 0.7, "noise": 0.3, "color_bleed": 0.5 },
      "mix": 0.8
    },
    {
      "id": "fx.scanlines",
      "params": { "count": 240, "intensity": 0.4 },
      "mix": 0.6
    }
  ],
  "transitions": {
    "enter": { "type": "vhs_tracking", "duration_frames": 15 },
    "exit": { "type": "scanline_reveal", "duration_frames": 10 }
  },
  "tempo_sync": null,
  "thumbnail": "base64_or_url"
}
```

### Architecture Requirements
- Recipes are JSON files (human-readable, version-controllable, diffable)
- Effect IDs use the taxonomy prefix: `fx.*`, `util.*`, `mod.*`, `op.*`
- Parameters reference the effect's declared parameter schema
- Recipes can reference other recipes (nesting/composition)
- Recipes do NOT embed video — they're pure configuration
- Seeded determinism means: recipe + same video + same seed = same output

### Community Sharing Model
- Public recipe gallery (web page, searchable by tags)
- GitHub-based submission (PR to a recipes repo)
- Attribution: every recipe credits its author
- License: default CC-BY-4.0, author can choose
- Remix: fork a recipe, modify, re-share with credit chain

---

## Effect API Spec (Open Standard)

The pure-function effect contract enables community-written effects.

### Effect Contract (from EFFECT-CONTRACT.md)
```python
def apply(frame: np.ndarray, params: dict, state_in: dict | None) -> tuple[np.ndarray, dict | None]:
    """
    Pure function effect.

    Args:
        frame: Input frame as numpy array (H, W, 3) uint8
        params: Effect parameters (validated against schema)
        state_in: Previous frame's state (None for stateless effects)

    Returns:
        (output_frame, state_out): Processed frame + updated state
    """
```

### What Makes This Ecosystem-Ready
- Pure functions = no side effects, safe to run untrusted code in sandbox
- Parameter schema declares types, ranges, defaults
- Effects self-register via taxonomy prefix
- State passing is explicit — no globals, no hidden mutation
- Frame-aware: `params` includes `frame_index`, `total_frames`, `seed`

### Community Effect Submission
- Effects are single Python files with metadata header
- Submission = PR to effects repo
- Review: automated (runs test suite) + human (quality check)
- Attribution preserved in file header

---

## Open Project Format (.entropic)

Project files should be documented, parseable, version-controllable.

### Design Principles
- JSON or YAML (human-readable)
- No embedded binary data (video files referenced by path/hash)
- Diffable (meaningful git diffs between versions)
- Forward-compatible (unknown keys are preserved, not dropped)
- Seeded: project + video + seed = deterministic output

### What This Enables
- Share projects that reproduce exactly
- Version control projects in git
- Build tools around the format (exporters, converters, analyzers)
- Standard-setting: if the format is good, others may adopt it

---

## Outreach Strategy

### Who to Send Entropic To

**Tier 1: Glitch Art Practitioners (most likely to use immediately)**
- Kim Asendorf (invented pixel sorting)
- Rosa Menkman (glitch art theorist)
- Sabato Visconti (glitch photographer)
- Daniel Temkin (glitch art, esoteric programming)
- r/glitch_art community (200K+ members)
- r/datamoshing community

**Tier 2: VJs / Visual Performers**
- Resolume forum community
- TouchDesigner community
- Hydra live coding community
- VJ subreddit, VJ Facebook groups

**Tier 3: Music Producers Who Do Visuals**
- Amon Tobin, Flying Lotus, Iglooghost
- 100 gecs, PC Music artists
- Oneohtrix Point Never, Holly Herndon

**Tier 4: Music Producers With Visual Aesthetic (Don't Do Visuals Yet)**
- Flume, JPEGMAFIA, Arca, Burial
- Boards of Canada, Autechre
- Knxwledge (lo-fi + VHS aesthetic)
- Porter Robinson (visual album)

**Tier 5: High-Profile (Dream List)**
- Beeple, GMUNK, Zach Lieberman
- Deadmau5, Skrillex (tech-savvy, huge visual shows)

### Outreach Approach
- Don't cold pitch. Ship something impressive first.
- Create demo content per phase that's shareable.
- Post in communities (Reddit, forums) with "I built this" framing.
- Offer early access to Tier 1 practitioners — they'll give real feedback.

---

## Demo Content Plan (Build-in-Public)

Every phase that ships = a demo video/GIF showing what's possible.

| Phase | Demo Content |
|-------|-------------|
| Phase 1 (Core Pipeline) | "126 effects in 60 seconds" — rapid fire demo |
| Phase 2B (Audio Sprint) | "Video reacting to a drum loop in real-time" |
| Phase 3 (Color Suite) | Before/after color grading on glitch video |
| Phase 5 (Performance) | "Playing video with a keyboard" — live jam |
| Phase 6 (Operators) | "Audio sidechain controlling pixel sort" |
| Phase 9 (MIDI) | "Playing video with an APC40" — the money shot |

Post each to: Twitter/X, Reddit (r/glitch_art, r/videography), YouTube, Instagram Reels, TikTok.
