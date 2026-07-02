# Capability: freeze (per-track) — delta from change 03

## ADDED Requirements

### Requirement: Freeze operates on the active track
Freeze, unfreeze, and flatten SHALL target the active track (selected if valid, else first video
track) and build the freeze prefix from that track's chain. With no active track the operations
SHALL be safe no-ops.

#### Scenario: Freeze targets the active track's chain
- **GIVEN** V1 is active with chain [A, B, C]
- **WHEN** the user freezes up to index 1
- **THEN** the freeze prefix is built from V1's effects [A, B] (not a global/stale chain)
- **AND** `frozenPrefixes['V1']` records cutIndex 1

#### Scenario: No active track is a safe no-op
- **GIVEN** no active video track
- **WHEN** freeze/unfreeze/flatten is invoked
- **THEN** nothing is frozen and no error is thrown

### Requirement: Freeze state is isolated per track
Freezing one track SHALL NOT affect another track's freeze state.

#### Scenario: Per-track freeze isolation
- **GIVEN** V1 and V2 both have chains
- **WHEN** V1's prefix is frozen up to index 1
- **THEN** `isFrozen('V1', 0)` and `isFrozen('V1', 1)` are true
- **AND** `isFrozen('V2', 0)` is false and `frozenPrefixes['V2']` is undefined

#### Scenario: Unfreeze clears only the target track
- **GIVEN** V1 is frozen
- **WHEN** `unfreezePrefix('V1')` is called
- **THEN** `isFrozen('V1', 0)` is false
- **AND** any other track's freeze state is untouched
