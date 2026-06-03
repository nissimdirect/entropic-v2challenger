# Capability: effect-chain (UI + render binding) — delta from change 02

## ADDED Requirements

### Requirement: The device chain UI binds to the active track
The device-chain editing surface SHALL display and mutate the ACTIVE track's chain, where the active
track is the selected track if valid, else the first video track, else none. With no active track the
surface SHALL show an empty state and mutations SHALL be safe no-ops.

#### Scenario: Display follows active track
- **GIVEN** V1=[Pixel Sort], V2=[Datamosh]
- **WHEN** V1 is the active track
- **THEN** the device chain shows V1's chain
- **WHEN** selection changes to V2
- **THEN** the device chain shows V2's chain

#### Scenario: No explicit selection resolves to first video track
- **GIVEN** tracks exist, `selectedTrackId` is null, V1 is the first video track
- **WHEN** the device chain renders and the user adds an effect
- **THEN** the effect is added to V1

#### Scenario: Audio/text-only project has no active video track
- **GIVEN** only audio/text tracks exist
- **WHEN** the device chain renders
- **THEN** it shows the empty state and add is a safe no-op

#### Scenario: Adding a track makes it active when none was selected
- **GIVEN** `selectedTrackId` is null
- **WHEN** `addTrack(...)` is called
- **THEN** the new track becomes the selected/active track

### Requirement: Render sources each track's own modulated chain
The render pipeline SHALL render each active video track using that track's `effectChain`, with pad
and CC modulation applied per track. No live render path SHALL fall back to a global effect chain.

#### Scenario: Two tracks render their own chains
- **GIVEN** V1=[Pixel Sort], V2=[Datamosh], both active at the playhead
- **WHEN** a composite frame is rendered
- **THEN** V1's layer applies Pixel Sort and V2's layer applies Datamosh (no cross-bleed, no global fallback)

#### Scenario: Editing one track does not change another's render
- **GIVEN** the two-track state above
- **WHEN** an effect is added to V1
- **THEN** V2's rendered layer is unchanged

#### Scenario: Per-track modulation
- **GIVEN** a CC mapping targets an effect on V1
- **WHEN** a frame renders
- **THEN** the modulation is applied to V1's chain only (V2's matching-less chain is untouched)

## MODIFIED Requirements

### Requirement: Effect grouping is track-scoped
`groupEffects(trackId, effectIds)` SHALL validate the effect ids against the given track's chain, not
a global chain.

#### Scenario: Group within the active track
- **GIVEN** V1 has effects A,B selected for grouping
- **WHEN** `groupEffects('V1', [A,B])` is called
- **THEN** the group is created from V1's chain members
- **AND** ids not present in V1's chain are rejected
