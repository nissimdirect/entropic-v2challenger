# Capability: persistence (per-track chains) — delta from change 05

## ADDED Requirements

### Requirement: Per-track effect chains round-trip through save/load
Saving a project SHALL persist each track's `effectChain`, and loading SHALL restore each track's
chain independently. There SHALL be no global `masterEffectChain` in the saved shape.

#### Scenario: Two-track chains restored independently
- **GIVEN** a project with V1 chain=[effect A] and V2 chain=[effect B]
- **WHEN** the project is saved and reloaded
- **THEN** V1's restored chain is [A] and V2's restored chain is [B]
- **AND** neither track's chain leaked into the other

#### Scenario: Saved shape has no global master chain
- **WHEN** a project is serialized
- **THEN** the output contains per-track `effectChain` under `timeline.tracks[]`
- **AND** the output has no `masterEffectChain` key

#### Scenario: Empty-chain track round-trips as empty
- **GIVEN** a track with no effects
- **WHEN** saved and reloaded
- **THEN** its restored chain is empty (no crash, no phantom effects)

#### Scenario: Malformed saved chain is dropped safely
- **GIVEN** a saved track whose effectChain contains a malformed entry (missing effectId)
- **WHEN** the project is loaded
- **THEN** the malformed entry is dropped and load does not crash

## REMOVED Requirements

### Requirement: Global project effect chain field
**Reason:** strangler-fig transitional scaffold; per-track chains are now the source of truth and
round-trip via `timeline.tracks[].effectChain`.
**Migration:** none (no user base). Old `.glitch` files that stored `masterEffectChain` simply do not
carry a chain into any track on load; the field and its serialize/hydrate are deleted.

#### Scenario: Global effectChain field no longer exists
- **WHEN** the project store is inspected
- **THEN** there is no `effectChain` field on it
- **AND** no code reads a global effect chain (only `track.effectChain` / active-track selectors)
