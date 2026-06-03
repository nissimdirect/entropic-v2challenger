# Capability: track-lifecycle (cross-store integrity)

> Delta from change 1.5. Track create/delete/duplicate must keep cross-store dependents
> (automation lanes, operator mappings, midi CC, device groups) consistent with per-track chains.

## ADDED Requirements

### Requirement: Deleting a track cleans all cross-store dependents
`removeTrack` SHALL remove, for the deleted track: its automation lanes in `useAutomationStore`
(both effect-prefixed lanes and the whole `lanes[trackId]` bucket), operator mappings targeting the
track's effects, midi CC mappings targeting them, and references in device groups (deleting a group
that falls below 2 members). No orphaned reference to a deleted track's effects SHALL remain.

#### Scenario: Delete prunes dependents
- **GIVEN** track V1 has an effect E with an automation lane, an operator mapping, a CC mapping, and a 2-member device group including E
- **WHEN** `removeTrack('V1')` is called
- **THEN** `useAutomationStore.lanes['V1']` is undefined
- **AND** no operator mapping targets E, no CC mapping targets E
- **AND** the device group is deleted (fell below 2 members)

#### Scenario: Delete cleanup is one undo step
- **GIVEN** the state above
- **WHEN** `removeTrack('V1')` then undo
- **THEN** V1 is restored AND its lanes, operator mapping, CC mapping, and device group are all restored together

#### Scenario: Deleting an empty-chain track is a safe no-op for cleanup
- **GIVEN** track V2 with an empty effect chain and no lanes
- **WHEN** `removeTrack('V2')`
- **THEN** no error is thrown and other tracks' dependents are untouched

### Requirement: Duplicating a track carries its automation, re-keyed
`duplicateTrack` SHALL copy the source track's canonical automation
(`useAutomationStore.lanes[sourceId]`) to the new track id, with fresh lane ids and paramPaths
rewritten so leading effect-id prefixes point at the duplicate's NEW effect ids.

#### Scenario: Duplicate carries re-keyed automation
- **GIVEN** track V1 with effect E (id `fx-X`) and a store lane with paramPath `fx-X.threshold`
- **WHEN** `duplicateTrack('V1')`
- **THEN** `useAutomationStore.lanes[newTrackId]` exists with one lane
- **AND** that lane's paramPath references the duplicate's new effect id (not `fx-X`)
- **AND** the lane has a fresh id

#### Scenario: Duplicate creates no dangling references
- **GIVEN** the state above
- **WHEN** `duplicateTrack('V1')`
- **THEN** every paramPath in the duplicate's lanes references an effect id that exists on the duplicate
- **AND** no operator/CC mapping references the duplicate's new effect ids (deliberately unmapped, not dangling)

#### Scenario: Duplicating a track with no automation does not crash
- **GIVEN** track V3 with effects but zero automation lanes
- **WHEN** `duplicateTrack('V3')`
- **THEN** the duplicate is created with no lanes and no error

## MODIFIED Requirements

### Requirement: Cross-store effect cleanup is shared
The per-effect cross-store cleanup previously inline in `removeEffect` SHALL be provided by a shared
`pruneEffectDependents(effectIds, opts)` used by both `removeEffect` and `removeTrack`. The refactor
SHALL be behavior-preserving for `removeEffect` (existing cross-store-integration tests pass unchanged).

#### Scenario: removeEffect behavior unchanged after extraction
- **GIVEN** the existing removeEffect cross-store cleanup test suite
- **WHEN** removeEffect delegates to `pruneEffectDependents`
- **THEN** all existing cross-store-integration tests pass without modification
