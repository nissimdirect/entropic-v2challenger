# DEC-Q7-014 — Intel Mac: unsupported

**Status:** Decided 2026-06-03
**Owner:** Q7 PR #7
**Scope:** Should we ship Tier 5 (L-axis features) on Intel Macs, or document them as unsupported?

## Question

Intel Macs (pre-2020 / pre-M1) can run torch on CPU but not MPS. CPU inference for DINOv2 + CLIP + CLAP is 5-15× slower than MPS on Apple silicon. Vision §11 explicitly says "Mac-first commit" and the Vision direction targets Apple silicon. Should we attempt to support Intel anyway?

## Decision

**Intel Macs: Tier 5 features documented as UNSUPPORTED. No PR for Intel-specific code paths.**

When Q7 runs on Intel (detected via `platform.machine() != "arm64"`):
1. Backend detector returns CPU with `validity='degraded'` (per DEC-Q7-004)
2. Report verdict surfaces an Intel-specific note: "Detected Intel Mac; results are advisory only. Tier 5 ships on Apple silicon."
3. Frontend surfaces a one-time toast: "L-axis features (Tier 5) require Apple silicon. Tiers 0-4 work on Intel."
4. `--measure` runs anyway (user can produce a report) but the verdict block is marked `intel_advisory: true`

## Rationale

- **Performance reality** — CPU DINOv2 forward pass is ~150-300ms on Intel i9, vs 5-15ms on M2 Max MPS. The Tier 5 50ms p95 gate is impossible on Intel
- **Vision §11 explicitly Mac-first commit** — Intel was not a v1 goal
- **User base reality** — Apple has shipped only arm64 since 2020; Intel install base shrinks every year
- **Building an alternate path costs ~1-2 weeks** — ONNX runtime, CoreML conversion, or quantized fallback — none cheap, all maintenance burden
- **Tiers 0-4 still work** — Intel users keep effects, color, blending, freeze, automation, performance mode. Just no L-axis modulation

## Considered alternatives

- **Ship CPU-only Tier 5 with quality warnings** — REJECTED. P95 of 200ms+ is "unusable" not "degraded"; surfacing it as "supported with caveats" misleads
- **ONNX runtime fallback** — DEFERRED to v2. Would add support for Intel + Windows + Linux but adds maintenance. Revisit when Intel install base hits a clear threshold
- **CoreML conversion** — DEFERRED. Apple's CoreML works on Intel via CPU but the conversion pipeline is its own engineering project; not cheap

## Side effects

- Backend detector adds `validity` field (already covered in DEC-Q7-004)
- Verdict report adds optional `intel_advisory: bool` field
- Frontend feature flag `F_TIER_5_INTEL_ADVISORY` (default true) — could be disabled by power users
- Documentation: README + runbook explicitly call out Apple-silicon requirement

## Verification

```bash
# On Intel Mac (when reproduced):
python3 -c "import platform; print(platform.machine())"  # → 'x86_64'
make q7-measure
# Report should include:
#   verdict.intel_advisory: true
#   backend.validity: "degraded"
#   note: "Detected Intel Mac; results advisory only."
```

## Cross-references

- DEC-Q7-004 — backend fallback (CPU degrades validity already)
- Vision §11 — Mac-first commit
- Master roadmap §"What's NOT in this spike" — Intel Mac documented unsupported
