# Capability: render-composite (per-layer chains) — delta from change 04

## ADDED Requirements

### Requirement: render_composite applies each layer's own chain
`render_composite` SHALL apply each layer's `chain` independently to that layer before compositing.
Two layers with distinct chains SHALL produce a composite that reflects both distinct chains, not a
single shared chain applied to all layers.

#### Scenario: Distinct per-layer chains produce distinct layer outputs
- **GIVEN** a composite of layer A (chain=[color_invert]) and layer B (chain=[a different visible effect])
- **WHEN** `render_composite` renders the frame
- **THEN** the output differs from rendering both layers with chain=[color_invert]
- **AND** layer A's region reflects color_invert while layer B's reflects its own effect

#### Scenario: Empty layer chain is passthrough
- **GIVEN** a layer with `chain=[]`
- **WHEN** `render_composite` renders it
- **THEN** that layer's source frame is composited unmodified

#### Scenario: Same effect, different params per layer
- **GIVEN** layer A and layer B both use effect X with DIFFERENT param values
- **WHEN** `render_composite` renders the frame
- **THEN** each layer reflects its own param values (params are not shared across layers)
