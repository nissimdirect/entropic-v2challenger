/**
 * H1 (2026-07-02 master-tuneup WS5): statusbar chip for the focused-mapping
 * context — the anti-dead-flag VISIBLE consumer for utils/focusContext.ts.
 * The hardware-bank system (H2+) will key bank assignments off the same
 * `contextKey` shown here; this chip is how a user confirms "this is what my
 * next hardware-bank assignment will target" before touching a knob.
 * Hidden entirely when nothing is focused (kind === 'none').
 *
 * Styled like App.tsx's `CursorToolChip` (App.tsx:156-182) — a plain <span>
 * in the statusbar right cluster, `--cx-*` tokens only, no raw hex.
 */
import { useTimelineStore } from '../../stores/timeline'
import { useProjectStore } from '../../stores/project'
import { useEffectsStore } from '../../stores/effects'
import { useInstrumentsStore, resolveRackNode } from '../../stores/instruments'
import { useMappingContext } from '../../utils/focusContext'

export default function MappingContextChip() {
  const ctx = useMappingContext()
  const tracks = useTimelineStore((s) => s.tracks)
  const registry = useEffectsStore((s) => s.registry)
  const assets = useProjectStore((s) => s.assets)
  const racks = useInstrumentsStore((s) => s.racks)

  if (ctx.kind === 'none') return null

  let label: string
  switch (ctx.kind) {
    case 'track': {
      const track = tracks.find((t) => t.id === ctx.trackId)
      label = `track · ${track?.name ?? ctx.trackId}`
      break
    }
    case 'clip': {
      const track = tracks.find((t) => t.id === ctx.trackId)
      const clip = track?.clips.find((c) => c.id === ctx.clipId)
      const fileName = clip ? assets[clip.assetId]?.path.split('/').pop() : undefined
      label = `clip · ${clip?.name ?? fileName ?? ctx.clipId}`
      break
    }
    case 'effect': {
      const track = tracks.find((t) => t.id === ctx.trackId)
      const effect = track?.effectChain.find((e) => e.id === ctx.effectId)
      const def = effect ? registry.find((r) => r.id === effect.effectId) : undefined
      label = `effect · ${def?.name ?? effect?.effectId ?? ctx.effectId}`
      break
    }
    case 'rack-pad': {
      const track = tracks.find((t) => t.id === ctx.trackId)
      const rack = racks[ctx.trackId]
      const node = rack ? resolveRackNode(rack, ctx.branchPath) : null
      const idx = node ? node.pads.findIndex((p) => p.id === ctx.padId) : -1
      const padLabel = idx === -1 ? ctx.padId : `Pad ${idx + 1}`
      label = track ? `pad ${padLabel} · ${track.name}` : `pad ${padLabel}`
      break
    }
  }

  return (
    <span
      className="status-bar__mapping-context-chip"
      title="Focused mapping context — where hardware-bank assignments will target"
      data-testid="statusbar-mapping-context-chip"
      data-context-kind={ctx.kind}
    >
      ◎ {label}
    </span>
  )
}
