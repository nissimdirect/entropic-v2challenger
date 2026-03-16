/**
 * Cross-store entity relationships.
 * When deleting an entity, clean up all downstream references.
 *
 * Read direction: "Deleting [entity] requires cleanup in [stores]"
 *
 * This is a REFERENCE DOCUMENT enforced by convention.
 * When adding a new entity type with cross-store references, add it here.
 * Sessions 3-7 will wire deletion functions to consult this map.
 */
export const STORE_RELATIONSHIPS = {
  /** Deleting an effect instance */
  effectInstance: {
    automationLanes: 'timeline.tracks[].automationLanes where paramPath starts with effect ID',
    operatorMappings: 'operators[].mappings where targetEffectId === effect ID',
    ccMappings: 'midi.ccMappings where effectId === effect ID',
    padMappings: 'performance.pads[].mappings where effectId === effect ID',
  },
  /** Deleting a track */
  track: {
    clips: 'track.clips (cascade -- contained)',
    automationLanes: 'track.automationLanes (cascade -- contained)',
  },
  /** Deleting an operator */
  operator: {
    fusionSources: 'operators[].parameters.sources where operatorId === operator ID (fusion type)',
  },
  /** Loading a new drum rack */
  drumRack: {
    midiNotes: 'midi.padMidiNotes -- reconcile with new pad IDs',
    padStates: 'performance.padStates -- reset to idle',
  },
} as const

/**
 * Resource limits -- centralized so all stores reference the same constants.
 * Existing projects that exceed limits are clamped on load, not rejected.
 */
export const LIMITS = {
  MAX_TRACKS: 64,
  MAX_CLIPS_PER_TRACK: 500,
  MAX_OPERATORS: 16,
  MAX_MARKERS: 1000,
  MAX_POINTS_PER_LANE: 50_000,
  MAX_COMPOSITOR_LAYERS: 32,
  MAX_EFFECTS_PER_CHAIN: 10,
} as const
