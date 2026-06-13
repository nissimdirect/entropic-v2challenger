/**
 * B4-editor — Sample Rack device tile for a Performance track.
 *
 * The Sample Rack RENDER pipeline (B4.1 channel summing, B4.2 macros, B4-export
 * parity) shipped HEADLESS — no UI created, triggered, or edited a rack. This is
 * the MINIMAL user-facing surface that makes a rack reachable:
 *   - a PAD GRID: one clickable cell per rack pad → triggers the pad's voice
 *   - a SELECTED-PAD EDITOR: source / opacity / blend / mute / solo
 *   - an "Add pad" button
 *
 * Store-driven (mirrors SamplerDevice exactly): reads `racks[trackId]`, returns
 * null when absent, writes via setRackPadSource / updateRackPad / triggerRackPad.
 * No drag interactions (click-to-trigger only — later B4 slice).
 *
 * PAD TRIGGER PATTERN: mirrors performance/PadCell.tsx
 * (`onMouseDown={() => onTrigger(pad.id)}`) — the proven pad-trigger gesture in
 * this codebase. The triggered frame is `useProjectStore.currentFrame`, the SAME
 * frame `requestRenderFrame(currentFrame)` evaluates voices against in App.tsx,
 * so a click immediately drives the render (anti-dead-flag: the button is wired
 * end-to-end UI → triggerRackPad → composite-key event → buildRackLayers).
 *
 * We do NOT touch the B2-lite drumRack / PadGrid / PadEditor — RackNode is the
 * successor (USER DECISION); this is a NEW minimal editor.
 */
import { useState } from 'react'
import { useInstrumentsStore } from '../../stores/instruments'
import { useProjectStore } from '../../stores/project'
import { usePerformanceStore } from '../../stores/performance'
import { useToastStore } from '../../stores/toast'
import { clampFinite } from '../../../shared/numeric'
import {
  RACK_PAD_OPACITY_MIN,
  RACK_PAD_OPACITY_MAX,
  RACK_CHOKE_GROUP_MIN,
  RACK_CHOKE_GROUP_MAX,
  MAX_MACROS_PER_RACK,
} from './types'
import type { BlendMode } from '../../../shared/types'

const BLEND_MODES: BlendMode[] = [
  'normal', 'add', 'multiply', 'screen', 'overlay',
  'difference', 'exclusion', 'darken', 'lighten',
]

/** Macro-able pad params — MUST match RACK_MACRO_PARAM_BOUNDS / the resolver. */
const MACRO_PARAMS = ['scrub', 'speed', 'opacity'] as const
type MacroParam = (typeof MACRO_PARAMS)[number]

export default function RackDevice({ trackId }: { trackId: string }) {
  const rack = useInstrumentsStore((s) => s.racks[trackId])
  const setRackPadSource = useInstrumentsStore((s) => s.setRackPadSource)
  const updateRackPad = useInstrumentsStore((s) => s.updateRackPad)
  const setRackPadChokeGroup = useInstrumentsStore((s) => s.setRackPadChokeGroup)
  const addRackPad = useInstrumentsStore((s) => s.addRackPad)
  const removeRackPad = useInstrumentsStore((s) => s.removeRackPad)
  const addRackMacro = useInstrumentsStore((s) => s.addRackMacro)
  const updateRackMacro = useInstrumentsStore((s) => s.updateRackMacro)
  const removeRackMacro = useInstrumentsStore((s) => s.removeRackMacro)
  const addMacroRoute = useInstrumentsStore((s) => s.addMacroRoute)
  const removeMacroRoute = useInstrumentsStore((s) => s.removeMacroRoute)
  const triggerRackPad = usePerformanceStore((s) => s.triggerRackPad)
  const clearRackPadEvents = usePerformanceStore((s) => s.clearRackPadEvents)
  const assets = useProjectStore((s) => s.assets)

  const [selectedPadId, setSelectedPadId] = useState<string | null>(null)

  // Mirror SamplerDevice: return null when the track has no rack (mount-safe).
  if (!rack) return null

  const videoAssets = Object.values(assets).filter((a) => a.type === 'video')
  const selectedPad = rack.pads.find((p) => p.id === selectedPadId) ?? null

  // PATTERN: PadCell.tsx onMouseDown → onTrigger(pad.id). The current playhead
  // frame is useProjectStore.currentFrame — the frame the render loop evaluates.
  //
  // B4-choke — the COMPONENT (not the performance store) knows the rack, so it
  // resolves the choke siblings here: every OTHER pad sharing the triggered pad's
  // non-null chokeGroup. Their ids are handed to triggerRackPad, which writes a
  // silencing event into each sibling's composite-key stream (keeps the stores
  // decoupled — performance.ts never imports the instruments store).
  const onPadTrigger = (padId: string) => {
    const frame = useProjectStore.getState().currentFrame
    const pad = rack.pads.find((p) => p.id === padId)
    const group = pad?.chokeGroup ?? null
    const siblings =
      group === null
        ? undefined
        : rack.pads
            .filter((p) => p.id !== padId && p.chokeGroup === group)
            .map((p) => p.id)
    triggerRackPad(trackId, padId, frame, siblings)
  }

  // B4-pad-delete — SYMMETRIC cleanup: pad gone (+ its macro routes pruned) via
  // removeRackPad, AND its composite-key trigger events cleared via
  // clearRackPadEvents. If the deleted pad was selected, clear local selection
  // so the editor falls back (no dangling selectedPadId → no crash).
  const onPadDelete = (padId: string) => {
    removeRackPad(trackId, padId)
    clearRackPadEvents(trackId, padId)
    if (selectedPadId === padId) setSelectedPadId(null)
  }

  const macros = rack.macros ?? []
  const atMacroCap = macros.length >= MAX_MACROS_PER_RACK

  // Add-macro respects MAX_MACROS_PER_RACK (trust boundary): the store returns
  // null at the cap — surface it instead of silently no-opping.
  const onAddMacro = () => {
    const id = addRackMacro(trackId)
    if (id === null) {
      useToastStore.getState().addToast({
        level: 'warning',
        message: `Macro limit reached (max ${MAX_MACROS_PER_RACK} per rack).`,
        source: 'instruments',
      })
    }
  }

  return (
    <div className="sampler-device" data-testid="rack-device">
      <div className="sampler-device__row">
        <span>Pads</span>
        <div className="pad-grid" data-testid="rack-pad-grid">
          {rack.pads.map((pad, i) => (
            <div
              key={pad.id}
              className={`pad-cell${pad.id === selectedPadId ? ' pad-cell--armed' : ''}`}
              data-testid={`rack-pad-${pad.id}`}
              role="button"
              aria-pressed={pad.id === selectedPadId}
              // Mirror PadCell.tsx: onMouseDown triggers; click also selects for editing.
              onMouseDown={() => onPadTrigger(pad.id)}
              onClick={() => setSelectedPadId(pad.id)}
            >
              <span className="pad-cell__label">Pad {i + 1}</span>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="sampler-device__row"
        data-testid="rack-add-pad"
        onClick={() => addRackPad(trackId)}
      >
        + Add pad
      </button>

      {selectedPad && (
        <div data-testid="rack-pad-editor">
          <button
            type="button"
            className="sampler-device__row"
            data-testid={`rack-pad-delete-${selectedPad.id}`}
            onClick={() => onPadDelete(selectedPad.id)}
          >
            Delete pad
          </button>

          <label className="sampler-device__row">
            <span>Source</span>
            <select
              data-testid="rack-pad-source"
              value={selectedPad.instrument.clipId}
              onChange={(e) => setRackPadSource(trackId, selectedPad.id, e.target.value)}
            >
              <option value="">— no source —</option>
              {videoAssets.map((a) => (
                <option key={a.id} value={a.id}>{a.path.split('/').pop() ?? a.id}</option>
              ))}
            </select>
          </label>

          <label className="sampler-device__row">
            <span>Opacity</span>
            <input
              type="number"
              data-testid="rack-pad-opacity"
              value={selectedPad.opacity}
              min={RACK_PAD_OPACITY_MIN}
              max={RACK_PAD_OPACITY_MAX}
              step={0.01}
              onChange={(e) =>
                // Trust boundary: clamp [0,1] + finite (store also clamps — defense in depth).
                updateRackPad(trackId, selectedPad.id, {
                  opacity: clampFinite(
                    Number(e.target.value),
                    RACK_PAD_OPACITY_MIN,
                    RACK_PAD_OPACITY_MAX,
                    1,
                  ),
                })
              }
            />
          </label>

          <label className="sampler-device__row">
            <span>Blend</span>
            <select
              data-testid="rack-pad-blend"
              value={selectedPad.blend}
              onChange={(e) =>
                updateRackPad(trackId, selectedPad.id, { blend: e.target.value as BlendMode })
              }
            >
              {BLEND_MODES.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>

          <label className="sampler-device__row">
            <span>Mute</span>
            <input
              type="checkbox"
              data-testid="rack-pad-mute"
              checked={selectedPad.mute}
              onChange={(e) => updateRackPad(trackId, selectedPad.id, { mute: e.target.checked })}
            />
          </label>

          <label className="sampler-device__row">
            <span>Solo</span>
            <input
              type="checkbox"
              data-testid="rack-pad-solo"
              checked={selectedPad.solo}
              onChange={(e) => updateRackPad(trackId, selectedPad.id, { solo: e.target.checked })}
            />
          </label>

          <label className="sampler-device__row">
            <span>Choke</span>
            <select
              data-testid="rack-pad-choke"
              value={selectedPad.chokeGroup ?? ''}
              onChange={(e) => {
                const v = e.target.value
                // '' = none → null; otherwise an int 1..8 (store re-validates).
                setRackPadChokeGroup(trackId, selectedPad.id, v === '' ? null : Number(v))
              }}
            >
              <option value="">none</option>
              {Array.from(
                { length: RACK_CHOKE_GROUP_MAX - RACK_CHOKE_GROUP_MIN + 1 },
                (_, i) => RACK_CHOKE_GROUP_MIN + i,
              ).map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div data-testid="rack-macros">
        <button
          type="button"
          className="sampler-device__row"
          data-testid="rack-add-macro"
          disabled={atMacroCap}
          onClick={onAddMacro}
        >
          + Add macro{atMacroCap ? ` (max ${MAX_MACROS_PER_RACK})` : ''}
        </button>

        {macros.map((macro) => (
          <MacroRow
            key={macro.id}
            trackId={trackId}
            macro={macro}
            pads={rack.pads}
            onUpdate={updateRackMacro}
            onRemove={removeRackMacro}
            onAddRoute={addMacroRoute}
            onRemoveRoute={removeMacroRoute}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * One macro: name + value slider + remove, plus a route editor (pad/param/depth
 * → addMacroRoute) and the existing-routes list (→ removeMacroRoute by index).
 * The route-builder produces `pad.<padId>.<param>` — the EXACT targetPath the
 * resolver (resolveRackMacros) matches, so a route created here actually drives
 * the render (anti-dead-flag).
 */
function MacroRow({
  trackId,
  macro,
  pads,
  onUpdate,
  onRemove,
  onAddRoute,
  onRemoveRoute,
}: {
  trackId: string
  macro: import('./types').RackMacro
  pads: import('./types').RackPad[]
  onUpdate: (trackId: string, macroId: string, patch: { name?: string; value?: number }) => void
  onRemove: (trackId: string, macroId: string) => void
  onAddRoute: (
    trackId: string,
    macroId: string,
    route: { targetPath: string; depth: number },
  ) => boolean
  onRemoveRoute: (trackId: string, macroId: string, routeIndex: number) => void
}) {
  const [routePadId, setRoutePadId] = useState<string>(pads[0]?.id ?? '')
  const [routeParam, setRouteParam] = useState<MacroParam>('scrub')
  const [routeDepth, setRouteDepth] = useState<string>('1')

  const onAddRouteClick = () => {
    const padId = routePadId || pads[0]?.id
    if (!padId) return
    // Trust boundary: clamp depth to a finite number (allow negative → invert).
    const depth = clampFinite(Number(routeDepth), -1e6, 1e6, 0)
    const targetPath = `pad.${padId}.${routeParam}`
    const ok = onAddRoute(trackId, macro.id, { targetPath, depth })
    if (!ok) {
      // addMacroRoute returned false (per-macro OR total edge cap hit) — never
      // silently drop; surface the cap to the user.
      useToastStore.getState().addToast({
        level: 'warning',
        message: 'Route limit reached for this rack — remove a route to add another.',
        source: 'instruments',
      })
    }
  }

  return (
    <div data-testid={`rack-macro-${macro.id}`} className="sampler-device__row">
      <input
        type="text"
        data-testid="rack-macro-name"
        value={macro.name}
        onChange={(e) => onUpdate(trackId, macro.id, { name: e.target.value })}
      />
      <input
        type="range"
        data-testid="rack-macro-value"
        min={0}
        max={1}
        step={0.01}
        value={macro.value}
        onChange={(e) =>
          // Store clamps [0,1] at render; clamp here too (defense in depth).
          onUpdate(trackId, macro.id, { value: clampFinite(Number(e.target.value), 0, 1, 0) })
        }
      />
      <button
        type="button"
        data-testid="rack-macro-remove"
        onClick={() => onRemove(trackId, macro.id)}
      >
        ✕
      </button>

      <div className="sampler-device__row">
        <select
          data-testid="rack-route-pad"
          value={routePadId}
          onChange={(e) => setRoutePadId(e.target.value)}
        >
          {pads.map((p, i) => (
            <option key={p.id} value={p.id}>Pad {i + 1}</option>
          ))}
        </select>
        <select
          data-testid="rack-route-param"
          value={routeParam}
          onChange={(e) => setRouteParam(e.target.value as MacroParam)}
        >
          {MACRO_PARAMS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <input
          type="number"
          data-testid="rack-route-depth"
          step={0.01}
          value={routeDepth}
          onChange={(e) => setRouteDepth(e.target.value)}
        />
        <button type="button" data-testid="rack-add-route" onClick={onAddRouteClick}>
          + Add route
        </button>
      </div>

      {macro.routes.map((route, i) => (
        <div key={i} data-testid={`rack-route-${i}`} className="sampler-device__row">
          <span>{route.targetPath}</span>
          <span>×{route.depth}</span>
          <button
            type="button"
            data-testid="rack-route-remove"
            onClick={() => onRemoveRoute(trackId, macro.id, i)}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
