# SPEC-6 — `.dna` Patch Format + No-Regression CI Lint
*Written 2026-06-03 · last of the six spec docs*

> Defines the portable patch format (effect graph + routing + lanes + params) that ships in Tier 6 (E2). Strict no-regression across ALL Entropic versions, forward + backward. Unknown-fields-preserve on read. Versioned budget descriptor (SG-2). CI lint rule enforces forward-compat by construction. Independent of other specs — ships when E2 starts.

---

## 1. Decision recap

Round 1 chose: `.dna` is the portable patch format. Strict no-regression across all versions. Unknown-fields-preserve on read. CI lint rule mandatory.

Per Red Team review: `.dna` budget descriptor (SG-2) MUST be versioned. Per CTO review: schema-additive only — every change has to be forward-compat AND backward-readable.

---

## 2. What `.dna` IS (and IS NOT)

| Is | Is Not |
|---|---|
| Effect graph + chain shape | Source video / audio / image content |
| Modulation routing (operators, edges, depths, axes) | User asset library |
| Automation lanes (all params over T/Y/X/...) | Render outputs |
| Macros + their fan-out | History / undo state |
| Trigger payloads | Per-machine local cache |
| Reference embeddings (optional, for re-application context) | User identity / credentials |
| Resource budget descriptor (SG-2) | Telemetry / usage data |

Drop `.dna` on any project → applies the recipe. Auto-remap on mismatched param names. Versioned. Signed (Ed25519 — optional but recommended for community-shared patches; mandatory for Tier 7 plugin marketplace per SG-9).

---

## 3. Schema

### 3.1 File structure

`.dna` is gzip-compressed JSON (`.dna` extension; content is JSON). Header magic bytes + version + body.

```
+-------------------+------------+----------+-----------+--------------------+
| magic: "ENTR\1DNA"| version:u8 | flags:u8 | reserved  | gzipped JSON body  |
| (8 bytes)         | (1 byte)   | (1 byte) | (6 bytes) | (variable length)  |
+-------------------+------------+----------+-----------+--------------------+
```

- **Magic:** identifies file as `.dna`. Allows file-type detection regardless of extension.
- **Version:** the FORMAT version (not the patch's content version). Currently `0x01`.
- **Flags:** bit 0 = signed (Ed25519 signature follows); bits 1-7 reserved.
- **Reserved:** future use.
- **Body:** gzipped JSON. Schema below.

### 3.2 JSON body schema

```json
{
  "schema_version": "1.0.0",
  "name": "Tarkovsky Mood",
  "description": "Slow drift toward a melancholic palette with grain texture",
  "author": "user-handle (optional)",
  "created": "2026-06-03T20:11:00Z",

  "creatrix_min_version": "3.0.0",
  "creatrix_target_version": "3.2.0",

  "budget": {
    "schema_version": "1.0.0",
    "max_grain_count": 50,
    "max_recursion_depth": 4,
    "max_vram_bytes": 1073741824,
    "max_cpu_ms_per_frame": 12,
    "max_chain_length": 8,
    "max_field_resolution_px": 1080,
    "max_total_edges": 64
  },

  "effect_graph": [
    {
      "id": "e1",
      "type": "blur",
      "params": {
        "radius": { "scalar": 8.0 }
      }
    },
    {
      "id": "e2",
      "type": "hue_shift",
      "params": {
        "shift": { "scalar": 0.0 }
      }
    }
  ],

  "operators": [
    { "id": "lfo1", "type": "lfo", "params": { "rate": 0.5, "shape": "sine" } }
  ],

  "mod_edges": [
    {
      "id": "ME1",
      "source_id": "lfo1",
      "src_axis": "t",
      "target_param_path": "e2.shift",
      "dst_axis": "t",
      "binding_rule": "broadcast",
      "depth": 90.0
    }
  ],

  "lanes": [
    {
      "id": "L1",
      "effect_id": "e1",
      "param_path": "radius",
      "mode": "smooth",
      "domain": "t",
      "direction": 1,
      "binding_rule": "broadcast",
      "points": [ {"t": 0, "value": 8}, {"t": 1, "value": 16} ]
    }
  ],

  "macros": [
    { "id": "macro1", "name": "Intensity", "value": 0.5,
      "targets": [
        { "target_param_path": "e1.radius", "depth": 16 }
      ]
    }
  ],

  "reference_embeddings": {
    "dinov2_v1": [ 0.123, -0.045, ... ],
    "clip_vit_b32_v1": [ ... ]
  }
}
```

### 3.3 Field semantics

| Field | Purpose | Schema-evolution rule |
|---|---|---|
| `schema_version` | Patch content schema version (semver) | Major bump = breaking; never silent |
| `creatrix_min_version` | Earliest app version that can read this patch | Set on author at save-time |
| `creatrix_target_version` | App version the patch was authored against | Informational; tells app what features were available |
| `budget` | SG-2 resource ceiling | Versioned independently; reader must accept unknown future budget keys + preserve them |
| `effect_graph` | Ordered chain | Each effect has `id`, `type`, `params`; effects not registered in current version → flagged at apply |
| `operators` | Modulation sources | Same; unknown operator types flagged but preserved |
| `mod_edges` | Routing tensor | Each edge carries axis metadata (SPEC-2 schema); unknown binding rules rejected per SPEC-2 validator |
| `lanes` | Automation curves | SPEC-2 schema |
| `macros` | One-knob fan-out | One macro → many `target_param_path` |
| `reference_embeddings` | Vector for latent-space recommendation (Tier 6+ E4 future) | Optional; backbone-version-keyed |

---

## 4. Forward + backward compat rules

### 4.1 Forward compat (old reader, new writer)

**Rule:** A `.dna` authored in Entropic v3.5 must load (with possible warnings) in Entropic v3.0.

**Implementation:**

1. **Reader preserves unknown fields verbatim.** If a future version adds `"my_new_field": value` to a `mod_edge`, the v3.0 reader stores it in an `_unknown` shadow map, untouched, and round-trips it on save.
2. **Unknown top-level keys preserved.** Same rule.
3. **Unknown effect types** at apply-time: warn user, skip the effect, preserve in the patch object (so re-export keeps it).
4. **Unknown operator types** at apply-time: same — warn + skip + preserve.
5. **Unknown binding rules:** per SPEC-2 writer-side validator, current versions REJECT unknown rules on author. But on READ, the v3.0 reader passing through a v3.5-authored patch will see future binding rules → policy: warn + treat as `broadcast` for evaluation + preserve original for round-trip.
6. **Budget descriptor with new keys:** reader honors keys it understands; preserves unknown keys verbatim.
7. **Reference embeddings keyed by backbone+version:** v3.0 may not have CLAP loaded — ignores `clap_audio_v1` field but preserves on save.

### 4.2 Backward compat (new reader, old writer)

**Rule:** A `.dna` authored in any prior version must load cleanly in the current version.

**Implementation:**

1. **Defaults applied for missing fields.** Old patch without `binding_rule` → defaults to `broadcast` (per SPEC-2 schema additions). Same for `direction` → 1, `domain` → `t`.
2. **Schema version triggers migration:** when `schema_version` is < current, run mapping table to translate old field names / shapes to new. Migration is NEVER destructive — original fields preserved in `_legacy` shadow.
3. **Deprecated effects** still register in current version with backward-compat aliases.
4. **Migrations are versioned + tested.** Every schema bump has a migration function + tests for old-patch loads.

### 4.3 Round-trip preservation

The unknown-fields-preserve rule means: load `.dna` v3.5 in v3.0 → save → resulting `.dna` is BYTE-IDENTICAL to original (modulo non-content fields like signature). v3.0 didn't understand all the fields, but it preserved them. This is what makes "no regression" possible — a patch isn't lost just because it was edited in an older version.

---

## 5. SG-2 — Resource budget descriptor

### 5.1 Why versioned

Budget keys evolve. Tier 5 adds `max_latent_dim`; Tier 7 adds `max_plugin_subprocess_mb`. Old readers must ignore unknown keys (forward compat) but new readers must enforce them.

### 5.2 Versioned schema

```json
{
  "budget": {
    "schema_version": "1.0.0",
    // v1.0.0 keys:
    "max_grain_count": int,
    "max_recursion_depth": int,
    "max_vram_bytes": int,
    "max_cpu_ms_per_frame": float,
    "max_chain_length": int,
    "max_field_resolution_px": int,
    "max_total_edges": int

    // future versions add fields; readers default missing keys to "no limit"
  }
}
```

### 5.3 Apply-time enforcement

Before applying a `.dna` to a project, validator runs:

```python
def validate_patch_budget(patch: DnaPatch, system: SystemContext) -> ValidationResult:
    """
    Enforce budget against system + patch content.
    Returns: (ok, list_of_violations).
    """
    violations = []

    if patch.effect_graph_length() > patch.budget.max_chain_length:
        violations.append("chain length exceeds budget")

    grain_count = patch.estimated_grain_count()
    if grain_count > patch.budget.max_grain_count:
        violations.append(f"grain count {grain_count} > budget {patch.budget.max_grain_count}")

    total_vram = patch.estimated_vram_bytes(system.detected_ram_gb)
    if total_vram > patch.budget.max_vram_bytes:
        violations.append(f"VRAM estimate {total_vram} > budget")

    # ... etc

    return ValidationResult(ok=(len(violations) == 0), violations=violations)
```

On violation: reject with toast listing violations; offer "Apply anyway with my consent" (bypass) which records consent in a project flag for that patch.

### 5.4 Writer-side budget computation

When user EXPORTS a `.dna`:
- Patch budget auto-computed from current project content
- User can override to be MORE restrictive (e.g., "I want this patch to run on 16GB Macs")
- User CANNOT override to be more permissive than what was needed — prevents footgun

---

## 6. CI lint rule (the no-regression enforcement)

### 6.1 Rule definitions

**Lint-1 — Schema additions are optional.**
Any field added to a TS type that's part of `.dna` content (Lane, ModEdge, Effect, Operator, Macro, Budget) must be `field?: type` (optional). Auto-fail PR otherwise.

**Lint-2 — Unknown-fields preservation.**
Every reader for `.dna` content types must round-trip unknown fields. A code change that removes the `_unknown` map from a reader auto-fails.

**Lint-3 — Enum-value addition tracked.**
Any new value added to `BindingRule`, `Axis`, `InterpolationMode`, `OperatorType`, `BlendMode` must include:
- Migration test for an old `.dna` lacking the new value
- Validator update if the value gates an implementation
- Documentation in the `.dna` format change log

**Lint-4 — Schema version bumps.**
Any change to `dna_schema.json` (the JSON schema definition) requires `schema_version` bump in the same PR. Auto-fail if not.

**Lint-5 — Migration coverage.**
Every schema version bump requires a migration function + a test that loads a sample patch authored at the prior version.

### 6.2 Implementation

`scripts/lint_dna_schema.py` runs as part of CI:

```python
def check_dna_field_optionality(diff):
    """Every new field on a Lane/ModEdge/Effect/Operator/Macro must be optional."""
    pass

def check_unknown_fields_preservation():
    """Every reader for .dna types must preserve unknown fields."""
    pass

def check_enum_addition_has_migration_test(diff):
    """New enum values require migration test."""
    pass

def check_schema_version_bumped(diff):
    """Changes to dna_schema.json require schema_version bump."""
    pass

def check_migration_coverage():
    """Every schema version has a migration function + test."""
    pass
```

Fail any check → fail CI → PR cannot merge.

---

## 7. Auto-remap on apply

When a `.dna` is applied to a project whose state doesn't match exactly:

| Mismatch | Behavior |
|---|---|
| Patch references `e1.radius`, current project has effect with different ID `effect42.radius` | If only one effect of matching type exists → auto-remap; show user the mapping |
| Patch references `track1`, project has different track names | Apply to currently-selected track if compatible type; else prompt user |
| Multiple plausible remap targets | Show remap UI with checkboxes |
| No plausible match | Skip; warn user |

User can preview the remap before commit; can override; can save the patch as a new variant.

---

## 8. Security

| Surface | Risk | Mitigation |
|---|---|---|
| Untrusted `.dna` upload | Malicious patch with infinite-cost chain | SG-2 budget enforcement |
| Untrusted `.dna` references external URL for source | Exfiltration / SSRF | `.dna` MUST NOT auto-fetch URLs without explicit user consent (SG-7 covers this for source decoders) |
| Patch signature | Patch tampering | Optional Ed25519 signature; recommended for marketplace patches (Tier 7) |
| Schema deserialization | DoS via malformed JSON | Cap raw size < 50MB before parse; reuse Creatrix PR-B's `MAX_CHAIN_DEPTH` |
| Patch with NaN values | Crashes downstream effects | Validator rejects non-finite numerics at load |
| Reference embeddings could leak source content | Privacy | Embeddings are lossy; not literal source. Document as such. |

---

## 9. File-by-file inventory

| File | Change | Lines |
|---|---|---|
| `backend/src/dna/format.py` (new) | Magic + version + flags + gzipped JSON read/write | ~150 |
| `backend/src/dna/schema.py` (new) | Pydantic models for all sections | ~300 |
| `backend/src/dna/reader.py` (new) | Read + unknown-field preservation | ~200 |
| `backend/src/dna/writer.py` (new) | Write + round-trip + budget computation | ~200 |
| `backend/src/dna/migrations.py` (new) | Per-schema-version migration funcs + test data | ~200 |
| `backend/src/dna/validators.py` (new) | Apply-time validators (SG-2 budget + axis + size caps) | ~250 |
| `backend/src/dna/signing.py` (new) | Optional Ed25519 sign/verify | ~150 |
| `backend/src/dna/dna_schema.json` (new) | Canonical schema definition | content |
| `frontend/src/renderer/components/dna/PatchImportDialog.tsx` (new) | UI for apply + remap | ~250 |
| `frontend/src/renderer/components/dna/PatchExportDialog.tsx` (new) | UI for export with budget editor | ~200 |
| `scripts/lint_dna_schema.py` (new) | CI lint runner | ~200 |
| `.github/workflows/dna-lint.yml` (new) | Wire lint into CI | ~30 |
| Tests | round-trip ; unknown-field preservation ; cross-version load (old → new) ; SG-2 budget enforcement ; auto-remap ; signing/verifying ; lint rule fixtures | ~600 |

**Total: ~2700 lines.**

---

## 10. Test plan

### 10.1 Round-trip

```python
def test_round_trip_preserves_byte_identity():
    """Author patch v1.0, save → load → save → byte-identical."""
    pass

def test_round_trip_with_unknown_field_preserved():
    """Manually inject an unknown field. Load + save → field preserved."""
    pass
```

### 10.2 Forward compat

```python
def test_v30_reader_loads_v35_authored_patch_with_warnings():
    """A `.dna` with future fields loads, unknown fields preserved, warnings emitted."""
    pass

def test_unknown_binding_rule_treats_as_broadcast_with_warning():
    """v3.0 reader sees `binding_rule: 'painted'` → treats as broadcast + warn."""
    pass
```

### 10.3 Backward compat

```python
def test_v30_patch_loads_in_v35():
    """Migration applies; missing fields default; no data loss."""
    pass

def test_legacy_field_renames_preserved_in_shadow():
    """Old field name maps to new; original preserved in _legacy shadow."""
    pass
```

### 10.4 SG-2 budget

```python
def test_apply_rejected_when_grain_count_exceeds_budget():
    pass

def test_apply_bypassable_with_user_consent():
    pass

def test_writer_auto_computes_minimum_budget():
    """Export from a real project — budget reflects actual usage, not over-permissive."""
    pass
```

### 10.5 Auto-remap

```python
def test_single_plausible_remap_auto_applied_with_notification():
    pass

def test_multi_remap_prompts_user():
    pass

def test_no_match_skips_with_warning():
    pass
```

### 10.6 CI lint

```python
def test_lint_fails_on_required_new_field():
    """Add a required field to Lane — lint must fail."""
    pass

def test_lint_fails_on_enum_value_without_migration_test():
    pass

def test_lint_passes_on_optional_additive_change():
    pass

def test_lint_fails_on_schema_change_without_version_bump():
    pass
```

---

## 11. Acceptance criteria for E2 PR

- [ ] Magic bytes + version header read/write correct
- [ ] Gzipped JSON body parses + serializes correctly
- [ ] All 11 schema sections (name, description, etc.) handled
- [ ] Round-trip preserves byte-identity modulo non-content fields
- [ ] Unknown fields preserved on round-trip
- [ ] Forward compat: future-version patch loads with warnings, doesn't crash
- [ ] Backward compat: old patches load via migration
- [ ] SG-2 budget validator rejects out-of-budget patches with clear toast
- [ ] Auto-remap works for plausible mismatches
- [ ] Optional Ed25519 signing + verification works
- [ ] All 5 CI lint rules implemented and gated
- [ ] CI lint integrated into PR workflow
- [ ] Patch import UI accessible from File menu + drag-drop
- [ ] Patch export UI accessible + lets user set budget
- [ ] All tests green; perf: import <1s, export <1s for typical patches

---

## 12. Coordination + sequencing

- Independent of other specs — ships when Tier 6 (E2) starts
- Coordinate with SPEC-3 SG-2 — version this descriptor in lockstep with budget enforcement
- Coordinate with SPEC-5 — `reference_embeddings` keyed by backbone version
- Creatrix session B10 retro-capture format could share JSON structure; consider alignment

---

## 13. Risks

| Risk | Mitigation |
|---|---|
| Forward-compat strain as schema grows | Lint rule catches additions; deprecation path documented |
| Backward-compat migrations get expensive over time | Cap migration chain length; squash old migrations at major releases (preserve sample patches as fixtures) |
| Patch signing UX friction | Optional; default off for personal patches; required for marketplace |
| Reference embeddings reveal source content (privacy) | Document; embeddings are lossy; user can strip on export |
| Gzip + binary header makes diffing patches harder | Provide a `.dna.json` decoded form for diff tooling |

---

## 14. Done

Last of the six specs. Spec pass complete.

---

## 15. Summary of the full pass

| Spec | Status |
|---|---|
| SPEC-1 Vision ↔ Build crosswalk | ✅ |
| SPEC-2 B4-lite schema injection (INJ-5) | ✅ |
| SPEC-3 Safety gates SG-1/3/5/8 | ✅ |
| SPEC-4 Demo trilogy | ✅ |
| SPEC-5 Multi-headed L backbone + SG-4 | ✅ |
| SPEC-6 `.dna` format + no-regression CI lint | ✅ |

Next cron firing should detect all 6 specs present + run consistency check.
