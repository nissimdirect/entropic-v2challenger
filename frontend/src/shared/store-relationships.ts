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
  /** Deleting a device group (Phase 14B) */
  deviceGroup: {
    childEffects: 'group.children -- each child triggers effectInstance cleanup above',
    automationLanes: 'timeline.tracks[].automationLanes where paramPath matches any child effect ID',
    operatorMappings: 'operators[].mappings where targetEffectId matches any child effect ID',
    ccMappings: 'midi.ccMappings where effectId matches any child effect ID',
    padMappings: 'performance.pads[].mappings where effectId matches any child effect ID',
  },
  /** Loading a new drum rack */
  drumRack: {
    midiNotes: 'midi.padMidiNotes -- reconcile with new pad IDs',
    padStates: 'performance.padStates -- reset to idle',
  },
} as const

// Resource limits live in shared/limits.ts — import from there.
// Do NOT duplicate LIMITS here.
