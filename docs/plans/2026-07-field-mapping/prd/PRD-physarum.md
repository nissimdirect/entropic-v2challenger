# PRD — Physarum / Foraging

> **Immutable stakeholder input** (exact quotes):
> - "ok i like all of them lets build"
> - (A3, greenlit) "emergent systems that forage on your other modules"
>
> _Type:_ effect (field-solver tenant) · _Status:_ 🟢 drafted · _Depends on:_ Field-Solver Substrate
> _Skill owners:_ /cto + /mad-scientist

## 1. Problem / why
Agent-based slime-mold networks are a distinct, motion-native simulation class Creatrix lacks (its physics are Eulerian, not agent-deposit). Novel twist from the research: physarum that **forages on another module's field** (image structure / depth / audio / flow) — cross-modal emergent behavior no VJ tool wires this way. Mocked and validated.

## 2. What it does (scope)
- Agents (positions/headings in a texture) sense 3 forward sensors on a shared trail field, steer toward highest concentration, deposit, then the trail is diffused + decayed. Classic Jones physarum on the substrate.
- **Foraging input (the twist):** the sensor field = trail **+ a routed field** (image luminance/edges, depth, optical flow, or audio spectrum). Seed agents from the source; deposit its colors.
- Params: agent count, sensor angle/distance, step, deposit, decay, diffuse σ, foraging-field weight.
- **Out of scope:** boids (separate tenant); 3D physarum.

## 3. Composable parts 🔒
- Sits on the Field-Solver Substrate (deposit + diffuse + decay + agent-texture stages).
- Foraging field arrives via K1 (any Utility as the food input).

## 4. Acceptance criteria (oracle)
- [ ] Forms transport networks on the substrate (visual + non-triviality metric: network length grows then stabilizes).
- [ ] Foraging: agents concentrate on high-field regions (correlation of trail density with the input field above a threshold).
- [ ] Seeded determinism → identical sequence; render-mode parity.
- [ ] Perf within the field-solver budget at agent-count default.

## 5. Risks / open 🌱
- Agent count vs perf — default tuned to budget; expose with a guard (MAX_AGENTS, security-style cap).
- Determinism of `np.add.at`/scatter on GPU — pin via the render-mode seed + fixed reduction order.
- 🌱 Foraging on audio spectrum = "slime that dances" — a killer demo; sequence after visual-field foraging works.

## 6. Ancillary wins
Proves the substrate; the trail field is itself a modulation source (feedback ecosystems); seed-from-footage = the image dissolving into a living network (on-brand output).
