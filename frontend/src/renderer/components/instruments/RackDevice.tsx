/**
 * B4-editor / B5.2 — Sample Rack device tile for a Performance track.
 *
 * The Sample Rack RENDER pipeline (B4.1 channel summing, B4.2 macros, B4-export
 * parity, B5.1 nested-rack render/export) shipped HEADLESS. This is the
 * user-facing surface that makes a rack — including NESTED branches — reachable:
 *   - a PAD GRID for the CURRENT rack level (top rack OR a branch)
 *   - a BREADCRUMB to drill in/out of branches (B5.2)
 *   - a "Group" action per pad → convertPadToBranch (B5.2)
 *   - a SELECTED-PAD EDITOR: source / opacity / blend / mute / solo / choke
 *   - an "Add pad" button (scoped to the current level)
 *
 * B5.2 NAV: `rackEditPath` (project store) is the array of branch pad ids the
 * user is currently inside. EMPTY → the top rack, byte-identical to B4 (the pad
 * grid, selection, editor, and pad-chain targeting behave EXACTLY as before).
 * A non-empty path resolves a nested RackNode (resolveRackNode) and renders THAT
 * level. All pad CRUD routes through the path-aware store actions (…At), and the
 * selected-pad lift (selectedRackPad) carries the current branchPath so the
 * bottom DeviceChain edits the RIGHT pad's insert chain at any depth.
 *
 * STALE-PATH SAFETY: when the active track changes, or the branch pad the user
 * is inside is deleted, the path is RESET to a valid level (no dangling path →
 * no crash) — mirrors the selectedRackPad stale-guard discipline (B4-pad-chain).
 */
import { useState, useEffect, useRef } from 'react'
import { useInstrumentsStore, resolveRackNode } from '../../stores/instruments'
import { useProjectStore } from '../../stores/project'
import { usePerformanceStore } from '../../stores/performance'
import { routeRackTrigger, usePerformanceFreezeStore } from '../../stores/performanceFreeze'
import { useToastStore } from '../../stores/toast'
import { useLayoutStore } from '../../stores/layout'
import { useAudioStore } from '../../stores/audio'
import { clampFinite } from '../../../shared/numeric'
import { quantizeFrame } from '../../utils/launch-quantize'
import {
  RACK_PAD_OPACITY_MIN,
  RACK_PAD_OPACITY_MAX,
  RACK_CHOKE_GROUP_MIN,
  RACK_CHOKE_GROUP_MAX,
  MAX_MACROS_PER_RACK,
  MAX_BRANCH_DEPTH,
} from './types'
import { rackEditPathToBranchPath } from './buildRackLayers'
import type { RackNode } from './types'
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
  const setRackPadSourceAt = useInstrumentsStore((s) => s.setRackPadSourceAt)
  const updateRackPadAt = useInstrumentsStore((s) => s.updateRackPadAt)
  const setRackPadChokeGroupAt = useInstrumentsStore((s) => s.setRackPadChokeGroupAt)
  const addRackPadAt = useInstrumentsStore((s) => s.addRackPadAt)
  const removeRackPadAt = useInstrumentsStore((s) => s.removeRackPadAt)
  const convertPadToBranch = useInstrumentsStore((s) => s.convertPadToBranch)
  const addRackMacro = useInstrumentsStore((s) => s.addRackMacro)
  const updateRackMacro = useInstrumentsStore((s) => s.updateRackMacro)
  const removeRackMacro = useInstrumentsStore((s) => s.removeRackMacro)
  const addMacroRoute = useInstrumentsStore((s) => s.addMacroRoute)
  const removeMacroRoute = useInstrumentsStore((s) => s.removeMacroRoute)
  const triggerRackPad = usePerformanceStore((s) => s.triggerRackPad)
  const clearRackPadEvents = usePerformanceStore((s) => s.clearRackPadEvents)
  const captureRetroBuffer = usePerformanceStore((s) => s.captureRetroBuffer)
  const assets = useProjectStore((s) => s.assets)

  // B10.1b — Ableton-style FREEZE state for THIS track (reactive). FROZEN → the
  // render loop plays the baked clip; the button toggles freeze ↔ unfreeze.
  const freezeFsm = usePerformanceFreezeStore((s) => s.fsm[trackId] ?? 'idle')
  const freezePerformanceTrack = usePerformanceFreezeStore((s) => s.freezePerformanceTrack)
  const unfreezePerformanceTrack = usePerformanceFreezeStore((s) => s.unfreezePerformanceTrack)

  // B5.2 — the branch path the RackDevice is currently editing. EMPTY → top rack
  // (B4 behavior). Reactive so drilling in/out re-renders the right level.
  const rackEditPath = useProjectStore((s) => s.rackEditPath)
  const enterBranch = useProjectStore((s) => s.enterBranch)
  const setRackEditPathDepth = useProjectStore((s) => s.setRackEditPathDepth)
  const resetRackEditPath = useProjectStore((s) => s.resetRackEditPath)

  // B5.2 — STALE-PATH SAFETY: reset the edit path whenever the active track
  // CHANGES (the path's pad ids belong to a DIFFERENT rack). Mirrors the
  // selectedRackPad active-track scoping (B4-pad-chain Tiger fix). We compare
  // against the PREVIOUS trackId (ref) so the reset fires only on a real switch,
  // NOT on first mount (mounting with a pre-set path — e.g. restored UI state —
  // must be preserved). Effect, not render-time set, to avoid setState-in-render.
  const prevTrackId = useRef(trackId)
  useEffect(() => {
    if (prevTrackId.current !== trackId) {
      prevTrackId.current = trackId
      if (useProjectStore.getState().rackEditPath.length > 0) resetRackEditPath()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId])

  // B4-pad-chain UI: pad selection is LIFTED to the project store (B4). B5.2 —
  // it now ALSO carries the current branchPath so the bottom DeviceChain edits
  // the pad at the CURRENT level (nested insert-chain targeting). Empty path →
  // omitted branchPath → byte-identical to B4.
  const selectedRackPad = useProjectStore((s) => s.selectedRackPad)
  const selectedPadId =
    selectedRackPad && selectedRackPad.trackId === trackId ? selectedRackPad.padId : null
  const setSelectedPad = (padId: string) =>
    useProjectStore.getState().setSelectedRackPad(
      trackId,
      padId,
      useProjectStore.getState().rackEditPath,
    )
  const clearSelectedPad = () => useProjectStore.getState().clearSelectedRackPad()

  // B10.2 — launch-quantize: snap the trigger frame to the next division of the
  // edit/slice grid when enabled. Uses the SAME grid division as the timeline
  // quantize (quantizeDivision). OFF by default.
  const launchQuantizeEnabled = useLayoutStore((s) => s.launchQuantizeEnabled)
  const toggleLaunchQuantize = useLayoutStore((s) => s.toggleLaunchQuantize)
  const quantizeDivision = useLayoutStore((s) => s.quantizeDivision)

  // Mirror SamplerDevice: return null when the track has no rack (mount-safe).
  if (!rack) return null

  // B5.2 — resolve the RackNode at the current edit path. A STALE path (a pad in
  // the chain was deleted out from under us) resolves to null → fall back to the
  // top rack AND reset the path (no dangling path → no crash). The reset is done
  // in an effect-free guard: render the top rack THIS frame; the path is corrected
  // by the delete handler / track-switch effect, so we just coalesce here.
  const currentNode: RackNode = resolveRackNode(rack, rackEditPath) ?? rack
  const editPath = resolveRackNode(rack, rackEditPath) ? rackEditPath : []

  const videoAssets = Object.values(assets).filter((a) => a.type === 'video')
  const selectedPad =
    // Only show the editor for a pad that lives at the CURRENT level.
    currentNode.pads.find((p) => p.id === selectedPadId) ?? null

  // PATTERN: PadCell.tsx onMouseDown → onTrigger(pad.id). The current playhead
  // frame is useProjectStore.currentFrame.
  //
  // B4-choke — choke siblings resolved against the CURRENT level's pads. (A
  // branch pad has no leaf voice to trigger; triggering it is a no-op-ish event
  // — render uses its branch. We still trigger for parity with B4 leaf pads.)
  const onPadTrigger = (padId: string) => {
    const rawFrame = useProjectStore.getState().currentFrame
    // B10.2 — launch-quantize: snap to the next division of the edit/slice grid
    // when enabled. When OFF (the default), rawFrame is passed UNCHANGED —
    // byte-identical to pre-B10.2 behavior. Only the trigger frameIndex snaps;
    // footage playback/speed is NOT affected.
    // Formula source: Timeline.tsx line 249 — (60/bpm)*(4/division)*fps
    const frame = launchQuantizeEnabled
      ? quantizeFrame(
          rawFrame,
          quantizeDivision,
          useProjectStore.getState().effectiveBpm,
          useAudioStore.getState().fps,
        )
      : rawFrame
    const pad = currentNode.pads.find((p) => p.id === padId)
    const group = pad?.chokeGroup ?? null
    // B4-choke — siblings resolved against the CURRENT level's pads.
    const siblings =
      group === null
        ? undefined
        : currentNode.pads
            .filter((p) => p.id !== padId && p.chokeGroup === group)
            .map((p) => p.id)
    // B5.3 — convert the UI edit path (pad ids) into the INDEX-based `bN_` branch
    // path the preview render keys events under, so a nested pad FIRES IN PREVIEW.
    // Empty path (top level) → '' → bare key → byte-identical to B4. A stale path
    // resolves to null → fall back to a flat trigger (defensive, no throw).
    const branchPath = rackEditPathToBranchPath(rack, editPath) ?? ''
    // B10.1 — Freeze↔voice FSM: if THIS track is mid-freeze (FREEZING), the
    // trigger is QUEUED by frameIndex (not applied), then drained on resolve.
    // routeRackTrigger returns true iff it enqueued; otherwise apply as today.
    if (routeRackTrigger(trackId, padId, frame, branchPath, group)) return
    triggerRackPad(trackId, padId, frame, siblings, group, branchPath)
  }

  // B4-pad-delete — SYMMETRIC cleanup (path-aware). If the deleted pad is the
  // branch the user is currently INSIDE (i.e. it's the last segment of the edit
  // path), exit that level first (stale-path safety — no dangling path).
  const onPadDelete = (padId: string) => {
    // B5.2 — if we're deleting the branch pad we drilled INTO at this level's
    // parent, this can't happen here (we only delete pads AT the current level).
    // But if a CHILD branch pad currently in our path is deleted, reset to a safe
    // level. The simplest correct guard: if the deleted pad id appears anywhere in
    // the edit path, truncate the path to JUST ABOVE it.
    const inPathIdx = editPath.indexOf(padId)
    if (inPathIdx !== -1) {
      setRackEditPathDepth(inPathIdx)
    }
    removeRackPadAt(trackId, editPath, padId)
    // B5.3 — use the same path-prefixed key that triggerRackPad writes. For a
    // NESTED pad (editPath non-empty) this is `${trackId}:${branchPath}_${padId}`;
    // for a flat pad (editPath empty) branchPath is '' → bare key (byte-identical
    // to pre-B5.3). Stale path → null → fall back to '' (flat, defensive).
    const branchPath = rackEditPathToBranchPath(rack, editPath) ?? ''
    clearRackPadEvents(trackId, padId, branchPath)
    if (selectedPadId === padId) clearSelectedPad()
  }

  // B5.2 — convert a leaf pad into a branch (group). Rejected at MAX_BRANCH_DEPTH
  // (the store enforces depth = editPath.length + 1 > cap → false). Surface the
  // cap with a toast (mirrors the macro-cap UX) instead of silently no-opping.
  const onGroupPad = (padId: string) => {
    const ok = convertPadToBranch(trackId, editPath, padId)
    if (!ok) {
      useToastStore.getState().addToast({
        level: 'warning',
        message: `Max nesting depth reached (${MAX_BRANCH_DEPTH} levels).`,
        source: 'instruments',
      })
    }
  }

  const atMaxDepth = editPath.length >= MAX_BRANCH_DEPTH

  const macros = currentNode.macros ?? []
  const atMacroCap = macros.length >= MAX_MACROS_PER_RACK

  // Macros are edited at the TOP rack only (B4.2 model is per-track). Keep the
  // macro editor visible only at the top level to avoid implying per-branch
  // macros (B5.1 branches use chain + composite, not macros).
  const showMacros = editPath.length === 0

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

  // B5.2 — breadcrumb labels: "Rack" then "Pad N" for each branch segment. The
  // index for each segment is resolved by walking the tree to that depth.
  const crumbs: { label: string; depth: number }[] = [{ label: 'Rack', depth: 0 }]
  {
    let node: RackNode = rack
    for (let i = 0; i < editPath.length; i++) {
      const padId = editPath[i]
      const idx = node.pads.findIndex((p) => p.id === padId)
      crumbs.push({ label: `Pad ${idx === -1 ? '?' : idx + 1}`, depth: i + 1 })
      const next = node.pads[idx]?.branch
      if (!next) break
      node = next
    }
  }

  return (
    <div className="sampler-device" data-testid="rack-device">
      {/* B5.2 — breadcrumb (always rendered; flat rack shows just "Rack"). */}
      <div className="sampler-device__row" data-testid="rack-breadcrumb">
        {crumbs.map((c, i) => (
          <span key={c.depth}>
            {i > 0 && <span> › </span>}
            <button
              type="button"
              data-testid={`rack-breadcrumb-${c.depth}`}
              className="rack-breadcrumb__crumb"
              disabled={c.depth === editPath.length}
              onClick={() => setRackEditPathDepth(c.depth)}
            >
              {c.label}
            </button>
          </span>
        ))}
        {editPath.length > 0 && (
          <button
            type="button"
            data-testid="rack-breadcrumb-up"
            className="rack-breadcrumb__up"
            onClick={() => setRackEditPathDepth(editPath.length - 1)}
          >
            ↑ up
          </button>
        )}
        {/* B10.1b — Ableton-style FREEZE toggle. FROZEN plays the baked clip
            (live voices released); UNFREEZE restores live voices. Disabled
            while a bake is in flight (FREEZING). */}
        <button
          type="button"
          data-testid="rack-freeze-toggle"
          className="rack-breadcrumb__freeze"
          disabled={freezeFsm === 'freezing'}
          aria-pressed={freezeFsm === 'frozen'}
          title={
            freezeFsm === 'frozen'
              ? 'Unfreeze — restore live voices'
              : 'Freeze — bake voices to a clip'
          }
          onClick={() => {
            if (freezeFsm === 'frozen') unfreezePerformanceTrack(trackId)
            else if (freezeFsm === 'idle') void freezePerformanceTrack(trackId)
          }}
        >
          {freezeFsm === 'frozen' ? '❄ Unfreeze' : freezeFsm === 'freezing' ? '… Freezing' : '❄ Freeze'}
        </button>
        {/* B10.2 — launch-quantize toggle: snaps pad triggers to the next
            division of the edit/slice grid. OFF by default. Uses the same
            grid division as the timeline quantize (quantizeDivision). */}
        <button
          type="button"
          data-testid="launch-quantize-toggle"
          className={`rack-breadcrumb__launch-q${launchQuantizeEnabled ? ' rack-breadcrumb__launch-q--active' : ''}`}
          aria-pressed={launchQuantizeEnabled}
          title={
            launchQuantizeEnabled
              ? 'Launch quantize ON — triggers snap to next grid division'
              : 'Launch quantize OFF — triggers fire immediately'
          }
          onClick={toggleLaunchQuantize}
        >
          Q
        </button>
        {/* B10.3 — retro-capture: dump the rolling event buffer onto this
            Performance Track so the last N triggers replay deterministically. */}
        <button
          type="button"
          data-testid="retro-capture"
          className="rack-breadcrumb__retro-capture"
          title="Retro-capture — dump recent triggers onto this Performance Track"
          onClick={() => captureRetroBuffer(trackId)}
        >
          ⏺ Capture
        </button>
      </div>

      <div className="sampler-device__row">
        <span>Pads</span>
        <div className="pad-grid" data-testid="rack-pad-grid">
          {currentNode.pads.map((pad, i) => {
            const isBranch = !!pad.branch
            return (
              <div
                key={pad.id}
                className={
                  `pad-cell` +
                  `${pad.id === selectedPadId ? ' pad-cell--armed' : ''}` +
                  `${isBranch ? ' pad-cell--branch' : ''}`
                }
                data-testid={`rack-pad-${pad.id}`}
                role="button"
                aria-pressed={pad.id === selectedPadId}
                // Mirror PadCell.tsx: onMouseDown triggers; click also selects.
                // B5.2 — double-click a branch pad drills INTO it.
                onMouseDown={() => onPadTrigger(pad.id)}
                onClick={() => setSelectedPad(pad.id)}
                onDoubleClick={() => {
                  if (isBranch) enterBranch(pad.id)
                }}
              >
                <span className="pad-cell__label">
                  Pad {i + 1}
                  {isBranch && <span data-testid={`rack-pad-branch-marker-${pad.id}`}> ▣</span>}
                </span>
                {isBranch ? (
                  <button
                    type="button"
                    data-testid={`rack-pad-enter-${pad.id}`}
                    className="pad-cell__enter"
                    // Stop the cell's onClick (select) / onMouseDown (trigger).
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      enterBranch(pad.id)
                    }}
                  >
                    enter →
                  </button>
                ) : (
                  <button
                    type="button"
                    data-testid={`rack-pad-group-${pad.id}`}
                    className="pad-cell__group"
                    disabled={atMaxDepth}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      onGroupPad(pad.id)
                    }}
                  >
                    group
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <button
        type="button"
        className="sampler-device__row"
        data-testid="rack-add-pad"
        onClick={() => addRackPadAt(trackId, editPath)}
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

          {/* B5.2 — a leaf pad can become a group; a branch pad can be entered. */}
          {selectedPad.branch ? (
            <button
              type="button"
              className="sampler-device__row"
              data-testid={`rack-pad-enter-editor-${selectedPad.id}`}
              onClick={() => enterBranch(selectedPad.id)}
            >
              Enter branch →
            </button>
          ) : (
            <button
              type="button"
              className="sampler-device__row"
              data-testid="rack-add-branch"
              disabled={atMaxDepth}
              onClick={() => onGroupPad(selectedPad.id)}
            >
              Group → branch{atMaxDepth ? ` (max depth ${MAX_BRANCH_DEPTH})` : ''}
            </button>
          )}

          {/* A branch pad's leaf params are inert (B5.1: branch renders, leaf is
              ignored) — only show the leaf editor for a non-branch pad. */}
          {!selectedPad.branch && (
            <>
              <label className="sampler-device__row">
                <span>Source</span>
                <select
                  data-testid="rack-pad-source"
                  value={selectedPad.instrument.clipId}
                  onChange={(e) => setRackPadSourceAt(trackId, editPath, selectedPad.id, e.target.value)}
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
                    updateRackPadAt(trackId, editPath, selectedPad.id, {
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
                    updateRackPadAt(trackId, editPath, selectedPad.id, { blend: e.target.value as BlendMode })
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
                  onChange={(e) => updateRackPadAt(trackId, editPath, selectedPad.id, { mute: e.target.checked })}
                />
              </label>

              <label className="sampler-device__row">
                <span>Solo</span>
                <input
                  type="checkbox"
                  data-testid="rack-pad-solo"
                  checked={selectedPad.solo}
                  onChange={(e) => updateRackPadAt(trackId, editPath, selectedPad.id, { solo: e.target.checked })}
                />
              </label>

              <label className="sampler-device__row">
                <span>Choke</span>
                <select
                  data-testid="rack-pad-choke"
                  value={selectedPad.chokeGroup ?? ''}
                  onChange={(e) => {
                    const v = e.target.value
                    setRackPadChokeGroupAt(trackId, editPath, selectedPad.id, v === '' ? null : Number(v))
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
            </>
          )}
        </div>
      )}

      {showMacros && (
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
              pads={currentNode.pads}
              onUpdate={updateRackMacro}
              onRemove={removeRackMacro}
              onAddRoute={addMacroRoute}
              onRemoveRoute={removeMacroRoute}
            />
          ))}
        </div>
      )}
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
