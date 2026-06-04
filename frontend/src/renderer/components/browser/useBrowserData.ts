/**
 * Assembles the real 5-tab browser entries from the stores (PR-A).
 *
 * fx  → live effect registry (backend list_effects)
 * op  → the operator types that exist today (PR-C expands these to ~14)
 * composite → the BlendMode set
 * tool → the tool-shelf actions
 * instruments → RACKS (Drum Rack · Sampler · Wavetable); Sampler is B1's mount.
 */
import { useMemo } from 'react'

import { useEffectsStore } from '../../stores/effects'
import type { BlendMode, OperatorType } from '../../../shared/types'
import type { BrowserEntry, TabKey } from './types'

const OP_LABELS: Record<OperatorType, string> = {
  lfo: 'LFO',
  envelope: 'Envelope',
  video_analyzer: 'Video Analyzer',
  audio_follower: 'Audio Follower',
  step_sequencer: 'Step Sequencer',
  fusion: 'Fusion',
}

const COMPOSITE_MODES: BlendMode[] = [
  'normal',
  'add',
  'multiply',
  'screen',
  'overlay',
  'difference',
  'exclusion',
  'darken',
  'lighten',
]

const TOOL_ACTIONS: { id: string; label: string }[] = [
  { id: 'select', label: 'Select' },
  { id: 'razor', label: 'Razor' },
  { id: 'slip', label: 'Slip' },
  { id: 'slide', label: 'Slide' },
  { id: 'ripple-delete', label: 'Ripple Delete' },
  { id: 'marker', label: 'Marker' },
  { id: 'loop-in-out', label: 'Loop In/Out' },
  { id: 'range-select', label: 'Range Select' },
  { id: 'loop-toggle', label: 'Loop Toggle' },
  { id: 'quantize-toggle', label: 'Quantize Toggle' },
  { id: 'grid-up', label: 'Grid Up' },
  { id: 'grid-down', label: 'Grid Down' },
  { id: 'popout-preview', label: 'Pop-out Preview' },
]

const INSTRUMENT_RACKS: { id: string; label: string }[] = [
  { id: 'instr.drum-rack', label: 'Drum Rack' },
  { id: 'instr.sampler', label: 'Sampler' },
  { id: 'instr.wavetable', label: 'Wavetable' },
]

/**
 * @param hasBaseClip B1: the Sampler entry is disabled (with tooltip) until a
 *   base video clip exists on the timeline, since B1 composites OVER it.
 */
export function useBrowserData(hasBaseClip: boolean): Record<TabKey, BrowserEntry[]> {
  const registry = useEffectsStore((s) => s.registry)

  return useMemo(() => {
    const fx: BrowserEntry[] = registry.map((e) => ({
      id: `builtin:${e.id}`,
      label: e.name,
      kind: 'fx',
    }))

    const op: BrowserEntry[] = (Object.keys(OP_LABELS) as OperatorType[]).map((t) => ({
      id: `builtin:op.${t}`,
      label: OP_LABELS[t],
      kind: 'op',
    }))

    const composite: BrowserEntry[] = COMPOSITE_MODES.map((m) => ({
      id: `builtin:composite.${m}`,
      label: m,
      kind: 'composite',
    }))

    const tool: BrowserEntry[] = TOOL_ACTIONS.map((a) => ({
      id: `builtin:tool.${a.id}`,
      label: a.label,
      kind: 'tool',
    }))

    const instruments: BrowserEntry[] = INSTRUMENT_RACKS.map((r) => {
      const isSampler = r.id === 'instr.sampler'
      return {
        id: `builtin:${r.id}`,
        label: r.label,
        kind: 'instruments',
        disabled: isSampler && !hasBaseClip,
        disabledReason:
          isSampler && !hasBaseClip
            ? 'Add a video clip to the timeline first — the Sampler composites over it.'
            : undefined,
      }
    })

    return { fx, op, composite, tool, instruments }
  }, [registry, hasBaseClip])
}
