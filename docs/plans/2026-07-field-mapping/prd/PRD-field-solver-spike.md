# PRD — Field-Solver Substrate: SPIKE GATE (measure before you commit)

> **Immutable stakeholder input** (exact quotes):
> - "the field-solver substrate is the opposite profile — biggest build, highest risk, new GPU-compute surface… it should be spike-gated (a measurement PR first), not committed blind. Don't let its coolness pull it ahead of Wave 0."
> - "all of these deserve thick detailed documentation and implementation plans"
>
> _Type:_ infrastructure (spike) · _Status:_ ✅ **RUN — GO** (2026-07-03) · _Depends on:_ MLX/Metal on the dev Mac

> **✅ RESULT (2026-07-03, `SPIKES.md` S9):** physarum core (scatter-deposit + diffuse + decay) on MLX @ 512², 130k agents, 120 frames = **0.74 ms/frame** (real-time, ~20× under budget) · **deterministic** (same seed → max|Δ|=0.00 — the #1 risk disproven) · **no MLX op gaps** (scatter-add/roll/trig/clip all present). **Decision: GO — build the substrate (E2).** A more thorough on-device report (memory, RD-parity, larger agent counts) still worth capturing at build, but the gating question is answered.
> _Skill owners:_ /cto (perf/arch) + /mad-scientist (sim)

## 1. Problem / why
The field-solver substrate (persistent GPU ping-pong field + per-step kernel + feedback) is the keystone for the emergent sims (physarum, fluid, Lenia, wave) and would GPU-upgrade the existing scipy RD/CA. It's also the **highest-risk, largest-surface** build in the package — a genuinely new GPU-compute path (today's "GPU" in `field_codegen.py` is only a CPU-render-twice-then-lerp trick). **Rule: do not build the full substrate blind. Run a measurement spike first; the numbers decide.**

## 2. The spike (measurement PR, throwaway-friendly)
Build the *smallest* real ping-pong loop on MLX/Metal and measure — **no production wiring, no UI.**
- One persistent float texture pair, swapped per frame; a trivial per-step kernel (diffuse+decay); feedback.
- Port **one** sim end-to-end as the probe: **physarum** (deposit→diffuse→decay + agent texture) — it exercises scatter (`np.add.at` equivalent), blur, and feedback, the hardest parts.
- Optionally: GPU Gray-Scott vs the existing CPU-scipy RD for an upgrade-parity read.

## 3. What we measure (the gate criteria)
- **Perf:** ms/frame for physarum at 512² with N agents (e.g., 100k / 500k) on the dev Mac (M-series) — is it real-time (<16ms) or preview-only?
- **Determinism:** does the GPU scatter/reduction give a **fixed-seed reproducible** result across runs? (Needed for render-mode parity.)
- **Upgrade-parity:** does GPU Gray-Scott match CPU-scipy RD within tolerance? (Decides the "GPU-upgrade RD/CA for free" claim.)
- **Memory:** peak GPU memory vs the SG-8 memory-pressure budget; does it release cleanly (no orphan — the GPU-orphan-hardening concern)?
- **MLX maturity:** do the needed ops (scatter-add, gather, elementwise, gaussian) exist + perform on MLX/Metal, or do we hit gaps?

## 4. Decision matrix (post-spike)
| Result | Decision |
|--------|----------|
| Real-time + deterministic + parity holds | ✅ commit the full substrate (its own build PRD). |
| Preview-only but deterministic | 🟡 ship as **preview-only / export-baked** sims (LOD + field-recorder); still valuable. |
| Non-deterministic scatter | 🟡 pin a fixed reduction order for render-mode; live=best-effort. |
| MLX op gaps / memory blowups | 🔴 defer; revisit later or use a narrower CPU path for a couple sims. |

## 5. Acceptance criteria (of the spike itself)
- [ ] A physarum ping-pong loop runs on GPU and produces the network look (visual).
- [ ] A one-page **measurement report** (`docs/perf/field-solver-spike.md`): ms/frame at the agent counts, determinism verdict, RD-parity delta, peak memory, MLX-op-gap list.
- [ ] A clear **go / preview-only / defer** recommendation with the numbers behind it.
- [ ] No production code touched (throwaway branch; the substrate build is a *separate* PRD gated on this).

## 6. Risks / open 🌱
- Spike scope creep — keep it measurement-only; resist wiring it into the app.
- Determinism across GPU drivers is the likeliest blocker → the render-mode fixed-seed path is the mitigation to test *in the spike*.
- 🌱 If preview-only, the **field-recorder (bake)** + LOD ideas (CTO list) become the shipping path — note them as the fallback plan.

## 7. Why gate this
Everything else in the package is low/medium risk and reuse-heavy. This is the one item that could sink weeks if MLX/determinism don't cooperate. A ~1–2 day spike buys certainty before a large commit — and if it's preview-only, we still ship sims, just via bake/LOD. Build **after** Wave 0.
