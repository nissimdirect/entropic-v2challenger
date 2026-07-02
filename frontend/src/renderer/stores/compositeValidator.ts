/**
 * P2.2a (slice 3c) — terminal-only Composite validator.
 *
 * Compositing (`opacity` + blend `mode`) is no longer a Track field; it is a single
 * TERMINAL `CompositeEffect` (effectId === 'composite') at the END of a track's
 * effect chain. This module is the single source of truth for the placement rules:
 *
 *   R1  at most ONE composite per chain;
 *   R2  the composite MUST be the last chain entry (mid-chain composite rejected);
 *   R3  audio tracks NEVER carry a composite (rejected up front in both
 *       addEffect and reorderEffect — audio has no visual compositing);
 *   R4  a composite MUST NOT live inside a DeviceGroup (groups are sub-chains;
 *       the terminal composite is a whole-track concept).
 *
 * The chain-shape rules (R1, R2, R4) run at TRANSACTION COMMIT, not per mutation,
 * so a multi-step edit may pass through intermediate invalid states (e.g. a drag
 * that inserts then reorders) and only the committed final chain is judged. R3 is
 * an up-front guard because an audio track may never receive a composite at all.
 */
import type { EffectInstance, Track } from '../../shared/types'
import { COMPOSITE_EFFECT_ID, isCompositeEffect } from '../../shared/types'

/** Group metadata shape (mirrors useProjectStore.deviceGroups entries). */
export interface DeviceGroupMeta {
  name: string
  effectIds: string[]
  mix: number
  isEnabled: boolean
}

/**
 * Validate the terminal-composite placement rules for a single track's chain.
 * Returns an error string (the first violation found) or `null` when valid.
 *
 * `deviceGroups` is the global group map; only groups whose effectIds intersect
 * this chain are relevant (R4).
 */
export function validateCompositeChain(
  track: Pick<Track, 'type' | 'effectChain'>,
  deviceGroups: Record<string, DeviceGroupMeta> = {},
): string | null {
  const chain = track.effectChain
  const composites = chain.filter(isCompositeEffect)

  // R3: audio tracks never carry a composite.
  if (track.type === 'audio' && composites.length > 0) {
    return 'Composite effect is not allowed on audio tracks'
  }

  if (composites.length === 0) return null

  // R1: at most one composite per chain.
  if (composites.length > 1) {
    return 'A track chain may contain at most one composite effect'
  }

  // R2: the composite must be the terminal (last) chain entry.
  const lastIsComposite = isCompositeEffect(chain[chain.length - 1])
  if (!lastIsComposite) {
    return 'Composite effect must be the last effect in the chain'
  }

  // R4: the composite must not be a member of any device group.
  const compositeIds = new Set(composites.map((c) => c.id))
  for (const group of Object.values(deviceGroups)) {
    for (const id of group.effectIds) {
      if (compositeIds.has(id)) {
        return 'Composite effect cannot be placed inside a device group'
      }
    }
  }

  return null
}

/**
 * Up-front guard (R3): is adding/placing a composite onto this track type allowed?
 * Returns the rejection reason, or null when allowed. Used by addEffect and
 * reorderEffect to reject before mutating an audio-track chain.
 */
export function rejectCompositeOnAudio(
  trackType: Track['type'],
  effect: Pick<EffectInstance, 'effectId'>,
): string | null {
  if (effect.effectId === COMPOSITE_EFFECT_ID && trackType === 'audio') {
    return 'Composite effect is not allowed on audio tracks'
  }
  return null
}
