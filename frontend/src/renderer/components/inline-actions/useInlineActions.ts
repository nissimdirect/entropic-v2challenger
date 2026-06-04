/**
 * Hook bridging the I3 menu to the backend inspector.inline_actions registry.
 *
 * Tier-1 stub: returns a static set of actions matching the backend categories.
 * Tier-3 wires this to the ZMQ backend (PR #143 inline_actions.py) via an
 * IPC call that returns the per-paramId registered action set.
 */

import { useMemo } from 'react'

import type { InlineAction } from './InlineActionMenu'

interface UseInlineActionsResult {
  actions: InlineAction[]
  loading: boolean
}

/**
 * Returns the actions registered for a param. Stub implementation pending
 * IPC wiring (Tier 3). Today: a deterministic set per Vision §6 I3 categories
 * (recent / browse / tools) that the menu can render and tests can assert on.
 */
export function useInlineActions(
  paramId: string,
  onMap?: (sourceId: string) => void,
  onProbe?: () => void,
  onDelete?: () => void,
): UseInlineActionsResult {
  const actions = useMemo<InlineAction[]>(
    () => [
      {
        id: `${paramId}:map-lfo1`,
        label: 'Map to LFO 1',
        category: 'recent',
        onSelect: () => onMap?.('lfo1'),
      },
      {
        id: `${paramId}:map-audio-env`,
        label: 'Map to Audio Envelope',
        category: 'recent',
        onSelect: () => onMap?.('audio-env'),
      },
      {
        id: `${paramId}:browse-modulators`,
        label: 'Browse Modulators…',
        category: 'browse',
        onSelect: () => onMap?.('__browse__'),
      },
      {
        id: `${paramId}:browse-macros`,
        label: 'Browse Macros…',
        category: 'browse',
        onSelect: () => onMap?.('__browse_macros__'),
      },
      {
        id: `${paramId}:probe`,
        label: 'Probe (no map)',
        category: 'tools',
        shortcut: '⌥',
        onSelect: () => onProbe?.(),
      },
      {
        id: `${paramId}:delete`,
        label: 'Delete Mapping',
        category: 'tools',
        shortcut: '✕',
        onSelect: () => onDelete?.(),
      },
    ],
    [paramId, onMap, onProbe, onDelete],
  )

  return { actions, loading: false }
}
