# Capability: effect-chain (ownership & mutation)

> Delta introduced by change 01. Establishes per-track ownership of effect chains at the
> store/model layer. UI, freeze, IPC, and persistence behaviors are specified by later changes.

## ADDED Requirements

### Requirement: Effect chains are owned per track
The effect chain SHALL be a property of each `Track` (`Track.effectChain`). The store layer SHALL
treat each track's chain as independent state. There SHALL be no single shared chain at the model
layer once a track id is supplied to a mutation.

#### Scenario: Adding an effect targets one track
- **GIVEN** a project with tracks `V1` and `V2`, both with empty chains
- **WHEN** `addEffect('V1', effect)` is called
- **THEN** `V1.effectChain` contains `effect`
- **AND** `V2.effectChain` remains empty

#### Scenario: Mutations on one track do not affect another
- **GIVEN** `V1` has `[Pixel Sort]` and `V2` has `[Datamosh]`
- **WHEN** any of `removeEffect`, `reorderEffect`, `updateParam`, `setMix`, `toggleEffect` is invoked
  with `trackId = 'V1'`
- **THEN** only `V1.effectChain` (or its members) change
- **AND** `V2.effectChain` is byte-for-byte unchanged

#### Scenario: Per-track chain length limit
- **GIVEN** `V1.effectChain` already has `MAX_EFFECTS_PER_CHAIN` (10) effects
- **WHEN** `addEffect('V1', extra)` is called
- **THEN** the effect is NOT added and a warning toast is shown
- **AND** `V2` (with a shorter chain) can still accept new effects independently

### Requirement: Chain mutation actions accept a track id
Every chain-mutating project-store action (`addEffect`, `removeEffect`, `reorderEffect`,
`updateParam`, `setMix`, `toggleEffect`, and the A/B actions `activateAB`/`toggleAB`/
`copyToInactiveAB`/`deactivateAB`) SHALL take `trackId` as its first argument and operate on that
track's chain. An unknown `trackId` SHALL be a safe no-op (no throw, no global mutation).

#### Scenario: Unknown track id is a no-op
- **GIVEN** no track with id `'ghost'` exists
- **WHEN** `addEffect('ghost', effect)` is called
- **THEN** no track's chain changes and no error is thrown

### Requirement: Cross-store undo remains atomic per mutation
`removeEffect(trackId, id)` SHALL continue to clean up dependent operator mappings, automation lanes,
midi CC mappings, and device groups, and SHALL undo all of that together with the chain mutation as a
single undo step.

#### Scenario: Undo of remove restores chain and dependents
- **GIVEN** `V1` has an effect with an operator mapping and an automation lane targeting it
- **WHEN** `removeEffect('V1', id)` is called, then undo is triggered
- **THEN** the effect is restored at its prior index in `V1.effectChain`
- **AND** the operator mapping, automation lane, midi CC, and any device group are restored

### Requirement: Active effect chain is derived from the selected track
A selector SHALL return the effect chain of the currently selected track
(`timeline.selectedTrackId`), or an empty array when no track is selected. The empty-selection case
SHALL return a stable array reference (no render churn).

#### Scenario: Active chain follows selection
- **GIVEN** `V1=[Pixel Sort]`, `V2=[Datamosh]`
- **WHEN** `selectedTrackId` is `'V1'`
- **THEN** `getActiveEffectChain()` returns `V1`'s chain
- **WHEN** selection changes to `'V2'`
- **THEN** `getActiveEffectChain()` returns `V2`'s chain

## MODIFIED Requirements

### Requirement: Global project effect chain (transitional)
The project store's global `effectChain` field SHALL remain declared as a transitional refactor
scaffold but SHALL NOT be written by the migrated mutation actions after this change. It SHALL be
removed entirely in change 05 (persistence clean break). No mirror-write between the global field and
per-track chains is permitted.

#### Scenario: Migrated actions do not write the global field
- **GIVEN** the global `effectChain` is empty
- **WHEN** `addEffect('V1', effect)` is called
- **THEN** the global `effectChain` remains empty
- **AND** `V1.effectChain` contains the effect
