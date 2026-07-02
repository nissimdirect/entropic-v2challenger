# Capability: export (per-track chain) — delta from change 04

## ADDED Requirements

### Requirement: Export uses the active track's effect chain
Export SHALL apply the active track's effect chain (not a global chain) to the exported video. With
no active video track, export SHALL abort with a user-facing message rather than export an empty chain.

#### Scenario: Export applies the active track's chain
- **GIVEN** V1 (active) has chain [Block Crystallize] and V2 has chain [Chroma Control]
- **WHEN** the user starts an export
- **THEN** the export request's chain is V1's chain (Block Crystallize)
- **AND** it is NOT the (empty) global effect chain

#### Scenario: Export with no active track aborts cleanly
- **GIVEN** no video track exists
- **WHEN** the user starts an export
- **THEN** a toast prompts to add a video track and the export does not start

### Requirement: Export remains single-video-source (documented limitation)
Export SHALL continue to render a single video source plus text overlays (its pre-existing model).
Multi-track video compositing in export is explicitly out of scope for this change and tracked as a
separate follow-up feature.

#### Scenario: Multi-track project exports the active track's source + chain
- **GIVEN** a project with two video tracks
- **WHEN** the user exports
- **THEN** export processes the active source with the active track's chain (it does not composite
  both video tracks — that parity is a future feature)
