# PRD — Field-Solver Substrate (the sim keystone)

> **Immutable stakeholder input** (exact quotes):
> - "i like all of them lets build" (the proposals incl. the field-solver keystone)
> - (context) "one build, many living systems"
>
> _Type:_ effect / infrastructure · _Status:_ 🟢 drafted · **_Gate:_ ✅ CLEARED — `PRD-field-solver-spike.md` returned GO (0.74 ms/frame, deterministic, 2026-07-03)** · _Depends on:_ MLX/Metal path (P6 field codegen exists)
> _Skill owners:_ /cto (architecture/perf) + /mad-scientist (sim techniques)

## 1. Problem / why
Creatrix has bespoke CPU/scipy solvers (reaction-diffusion, cellular-automata) but **no general iterative field-solver substrate, and no GPU one** — the "GPU" path is a CPU-render-twice-then-lerp trick (`field_codegen.py` says so). That single missing facility blocks an entire class of emergent, motion-native systems (physarum, fluid, Lenia, wave, boids) and forces every sim to be hand-rolled. Build the substrate once → it hosts them all and GPU-upgrades RD/CA.

## 2. What it does (scope)
- A **persistent GPU (MLX/Metal) ping-pong field** (N float textures) + a **per-step update kernel** + **feedback** (state_out → state_in).
- Reusable stages: **advect** (semi-Lagrangian sample-back), **diffuse/decay**, **deposit** (agent→field), **reduce** (field→scalar). Sims are "substrate + a kernel".
- First tenants: **physarum** (agent slime) and **curl-noise fluid** (own PRDs / this one's smoke tests).
- **Out of scope:** the individual finished sims beyond the two tenants; true Navier-Stokes pressure-projection is a follow-on stage, not v1.

## 3. Composable parts 🔒→🟡
- Extends the existing MLX/Metal usage (`field_codegen.py`, spectral DCT) into a *general* compute path (the current one is pointwise-lerp only — this is the genuinely new engine surface).
- Reuses `remap_frame`/advection math; `field_source.py` cache for the state textures.
- Agent state = positions/velocities in a texture (the standard GPU-particle substrate).

## 4. The three surfaces
- **Preset:** the finished sims (physarum/fluid presets) are the front door.
- **Suggested:** sim fields suggest "route out ▸" (A6 — sim field as modulation source).
- **Full:** per-stage params (advect strength, diffuse σ, decay, deposit rate) + seed.

## 5. Design / architecture 🌱
- Ping-pong: two texture sets swapped per frame; kernel reads prev, writes next.
- Determinism: seeded RNG → mark sim sources as "seeded-deterministic"; render-mode uses a fixed seed for parity (the two-mode live/render determinism from the vision doc).
- **This is the highest-risk new surface** → `/review` ultra at its checkpoint; explicit PERF-MODEL field-solver class + budget guard (SG-8 memory-pressure precedent).
- Safety: GPU resource lifetime (SG-1 Metal/MLX contract already exists) — reuse it.

## 6. Acceptance criteria (oracle)
- [ ] Substrate hosts physarum AND curl-fluid from the same engine (both render).
- [ ] GPU RD matches CPU-scipy RD within tolerance (upgrade-parity test).
- [ ] Seeded determinism: same seed → identical sequence; render-mode parity.
- [ ] Perf: within the declared field-solver budget at target res; memory-pressure guard fires before OOM.
- [ ] GPU resource released (no orphan — the GPU-orphan-hardening follow-up applies).

## 7. Risks / open 🌱
- Biggest new engine surface in the whole package → most scrutiny, its own perf model.
- MLX general-compute maturity on the dev Mac — spike the ping-pong kernel first (measurement PR) before committing tenants.
- Determinism across GPU drivers — pin to the render-mode fixed-seed path.
- 🌱 Which stages are v1 vs later (pressure-projection, spatial-binning for boids) — sequence inside the substrate.

## 8. Ancillary wins
One engine → physarum, fluid, Lenia, wave, boids; GPU-upgrades existing RD/CA for free; every sim field becomes a modulation source (A6); the substrate is the single highest-leverage build in the study (three independent verified sources pointed at it).
