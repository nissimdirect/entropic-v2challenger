/**
 * SVG overlay rendered inside TrackLane — draws automation line/curves + nodes.
 * Click on line = add node. Respects zoom/scrollX coordinate system.
 * Trigger lanes render as square-wave colored blocks instead of smooth curves.
 *
 * AA.4 — Breakpoint marquee-select + group-move:
 * - Pointerdown/move/up on the SVG background draws a rubber-band rect and,
 *   on release, calls `selectPointsInRect` — same pointer-capture + zero-area-
 *   is-a-click + Escape-cancels idiom as the timeline's clip marquee
 *   (MarqueeOverlay.tsx), adapted to a 2D (time × value) box instead of a
 *   1D time range. A `.auto-node` target guard skips starting a marquee when
 *   the pointerdown lands on an existing node (its own drag handler owns
 *   that gesture — see AutomationNode.tsx's group-drag addition).
 * - Selected nodes read the active selection from the store and get
 *   `isSelected`/`onSelect`/`onMoveSelection` wired in; dragging a node that's
 *   part of a >1-point selection moves the whole selection, quantized to the
 *   SAME grid toggle (Cmd+U / useLayoutStore.quantizeEnabled) as clip editing.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AutomationLane as LaneType, AutomationPoint } from '../../../shared/types'
import { useAutomationStore } from '../../stores/automation'
import { useLayoutStore } from '../../stores/layout'
import { useProjectStore } from '../../stores/project'
import { isTriggerLane, isModulationLane, MODULATION_LANE_COLOR } from '../../utils/automation-evaluate'
import {
  AUTOMATION_SHAPES,
  defaultShapePointCount,
  type AutomationShapeKind,
} from '../../utils/automation-shapes'
import AutomationNode from './AutomationNode'
import AutomationTransformBox from './AutomationTransformBox'
import CurveSegment from './CurveSegment'
import ContextMenu from '../timeline/ContextMenu'
import type { MenuItem } from '../timeline/ContextMenu'

interface MarqueeRect {
  left: number
  top: number
  width: number
  height: number
}

/** Shared empty-selection sentinel — avoids allocating a new Set every render. */
const EMPTY_SELECTION: ReadonlySet<number> = new Set()

interface AutomationLaneProps {
  lane: LaneType
  trackId: string
  zoom: number
  scrollX: number
  height: number
}

const LANE_PADDING = 4

/**
 * Renders trigger lane points as rectangular colored blocks.
 * Value 1 = colored block, value 0 = gap.
 */
function TriggerBlocks({
  points,
  color,
  timeToX,
  height,
}: {
  points: AutomationPoint[]
  color: string
  timeToX: (t: number) => number
  height: number
}) {
  const blocks: React.ReactElement[] = []
  const blockY = LANE_PADDING
  const blockHeight = height - LANE_PADDING * 2

  for (let i = 0; i < points.length; i++) {
    const pt = points[i]
    if (pt.value < 0.5) continue // gap, not a block

    // Find the end of this block (next point with value < 0.5, or end of points)
    const startX = timeToX(pt.time)
    let endX: number
    if (i + 1 < points.length) {
      endX = timeToX(points[i + 1].time)
    } else {
      // Last point is active — extend a small default width
      endX = startX + 20
    }

    const width = Math.max(2, endX - startX)
    blocks.push(
      <rect
        key={`trig-${i}`}
        x={startX}
        y={blockY}
        width={width}
        height={blockHeight}
        fill={color}
        opacity={0.5}
        rx={2}
        className="auto-trigger-block"
      />,
    )
  }

  return <>{blocks}</>
}

export default function AutomationLane({ lane, trackId, zoom, scrollX, height }: AutomationLaneProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const trigger = isTriggerLane(lane)
  // AA.2 — modulation lanes always render in the fixed MODULATION_LANE_COLOR
  // (Ableton blue-vs-red convention) regardless of their stored `lane.color`,
  // so they're visually distinct from the absolute lane they superimpose
  // onto even when both happen to share a palette slot.
  const renderColor = isModulationLane(lane) ? MODULATION_LANE_COLOR : lane.color

  // AA.4 — marquee-select drag state (kept even when the lane is hidden below
  // to preserve this component's existing hook-call order across renders).
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null)
  const marqueeDraggingRef = useRef(false)
  const marqueeStartRef = useRef({ x: 0, y: 0 })
  const selection = useAutomationStore((s) => s.selectedPoints)

  // D8/PK.C — lane right-click context menu (Option A, user verdict
  // 2026-07-30): Simplify/Clear/Shape moved here from the automation strip,
  // targeting THIS lane explicitly (no armed-lane inference). Flatten/Ramp
  // are temporarily omitted from both the strip and this menu pending a
  // STOP resolution (flagged to the packet owner): their store actions
  // (flattenSelectedPoints/rampSelectedPoints) read only the global point
  // selection and have no laneId parameter to target explicitly.
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const [shapePopoverOpen, setShapePopoverOpen] = useState(false)
  const [shapePopoverPos, setShapePopoverPos] = useState({ x: 0, y: 0 })
  const [shapeKind, setShapeKind] = useState<AutomationShapeKind>('sine')
  const [shapeCycles, setShapeCycles] = useState(4)
  const [shapeAmplitude, setShapeAmplitude] = useState(1)

  if (!lane.isVisible) return null

  const usableHeight = height - LANE_PADDING * 2

  const timeToX = useCallback(
    (time: number) => time * zoom - scrollX,
    [zoom, scrollX],
  )

  const valueToY = useCallback(
    (value: number) => LANE_PADDING + usableHeight * (1 - value),
    [usableHeight],
  )

  const xToTime = useCallback(
    (x: number) => (x + scrollX) / zoom,
    [zoom, scrollX],
  )

  const yToValue = useCallback(
    (y: number) => 1 - (y - LANE_PADDING) / usableHeight,
    [usableHeight],
  )

  const handleUpdate = useCallback(
    (pointIndex: number, updates: Partial<AutomationPoint>) => {
      useAutomationStore.getState().updatePoint(trackId, lane.id, pointIndex, updates)
    },
    [trackId, lane.id],
  )

  const handleRemove = useCallback(
    (pointIndex: number) => {
      useAutomationStore.getState().removePoint(trackId, lane.id, pointIndex)
    },
    [trackId, lane.id],
  )

  // AA.4 — click-to-select (shift = additive union).
  const handleSelectNode = useCallback(
    (index: number, additive: boolean) => {
      useAutomationStore.getState().selectPoint(trackId, lane.id, index, additive)
    },
    [trackId, lane.id],
  )

  // AA.4 — group-drag: apply the SAME quantize grid toggle as clip editing
  // (Cmd+U — useLayoutStore.quantizeEnabled/quantizeDivision, gridInterval
  // math shared with Clip.tsx's snapPosition()).
  const handleMoveSelection = useCallback(
    (deltaTime: number, deltaValue: number) => {
      const { quantizeEnabled, quantizeDivision } = useLayoutStore.getState()
      const { bpm } = useProjectStore.getState()
      useAutomationStore.getState().moveSelectedPoints(deltaTime, deltaValue, {
        enabled: quantizeEnabled,
        bpm,
        division: quantizeDivision,
      })
    },
    [],
  )

  // D8/PK.C — right-click opens the CURVE section context menu, targeting
  // this exact lane (mirrors Track.tsx/Clip.tsx's handleContextMenu pattern
  // — the canonical lane/track-level context-menu wiring in this codebase).
  const handleLaneContextMenu = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setCtxMenu({ x: e.clientX, y: e.clientY })
  }, [])

  // AA.3a relocated — bake the configured shape into THIS lane as ONE undo
  // step. Same quantize-grid honoring as the original toolbar picker
  // (Cmd+U / useLayoutStore.quantizeEnabled).
  const handleInsertLaneShape = useCallback(() => {
    const { quantizeEnabled, quantizeDivision } = useLayoutStore.getState()
    const { bpm } = useProjectStore.getState()
    useAutomationStore.getState().insertShapeIntoLane(trackId, lane.id, shapeKind, {
      cycles: shapeCycles,
      amplitude: shapeAmplitude,
      count: defaultShapePointCount(shapeCycles),
      quantize: { enabled: quantizeEnabled, bpm, division: quantizeDivision },
    })
    setShapePopoverOpen(false)
  }, [trackId, lane.id, shapeKind, shapeCycles, shapeAmplitude])

  // D8/PK.C — CURVE section: Simplify/Clear act immediately on THIS lane
  // (simplifyLane/clearLane already take an explicit laneId — clean
  // functional-parity relocation, same tolerance the toolbar used). Shape…
  // opens a small config popover anchored at the click point instead of the
  // old toolbar's "pick a target lane" list, since the lane is already fixed
  // by the right-click. Flatten/Ramp intentionally absent — see the state
  // comment above this component's ctxMenu declaration.
  const getLaneCurveMenuItems = useCallback((): MenuItem[] => {
    const items: MenuItem[] = []
    if (!trigger) {
      items.push({
        label: 'Shape…',
        action: () => {
          if (ctxMenu) setShapePopoverPos({ x: ctxMenu.x, y: ctxMenu.y })
          setShapePopoverOpen(true)
        },
        testId: 'lane-context-curve-shape',
      })
    }
    items.push(
      {
        label: 'Simplify',
        action: () => useAutomationStore.getState().simplifyLane(trackId, lane.id, 0.01),
        disabled: lane.points.length <= 2,
        testId: 'lane-context-curve-simplify',
      },
      {
        label: 'Clear',
        action: () => useAutomationStore.getState().clearLane(trackId, lane.id),
        disabled: lane.points.length === 0,
        testId: 'lane-context-curve-clear',
      },
    )
    return items
  }, [trackId, lane.id, lane.points.length, trigger, ctxMenu])

  // AA.4 — marquee-select: pointerdown/move/up rubber-bands a 2D (time ×
  // value) box over the lane background. Mirrors MarqueeOverlay.tsx's
  // pointer-capture + zero-area-is-a-click + Escape-cancels idiom.
  const handleLanePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (e.button !== 0) return
      // Let an existing node own its own drag gesture (AutomationNode.tsx) —
      // don't also start a marquee underneath it. AA.4b: same guard for the
      // transform box's own handles (AutomationTransformBox.tsx).
      if ((e.target as Element).closest?.('.auto-node')) return
      if ((e.target as Element).closest?.('.auto-transform-box__handle')) return
      if (!svgRef.current) return

      marqueeDraggingRef.current = true
      marqueeStartRef.current = { x: e.clientX, y: e.clientY }
      ;(e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId)

      const rect = svgRef.current.getBoundingClientRect()
      setMarqueeRect({ left: e.clientX - rect.left, top: e.clientY - rect.top, width: 0, height: 0 })
    },
    [],
  )

  const handleLanePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!marqueeDraggingRef.current || !svgRef.current) return
      const rect = svgRef.current.getBoundingClientRect()
      const x0 = marqueeStartRef.current.x - rect.left
      const y0 = marqueeStartRef.current.y - rect.top
      const x1 = e.clientX - rect.left
      const y1 = e.clientY - rect.top

      setMarqueeRect({
        left: Math.min(x0, x1),
        top: Math.min(y0, y1),
        width: Math.abs(x1 - x0),
        height: Math.abs(y1 - y0),
      })
    },
    [],
  )

  const handleLanePointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!marqueeDraggingRef.current || !svgRef.current) return
      marqueeDraggingRef.current = false
      setMarqueeRect(null)

      // Recompute the final rect directly from the pointerup event (not the
      // `marqueeRect` state, which would be stale inside this memoized
      // callback) — same pattern as MarqueeOverlay.tsx's commitSelection().
      const rect = svgRef.current.getBoundingClientRect()
      const x0 = marqueeStartRef.current.x - rect.left
      const y0 = marqueeStartRef.current.y - rect.top
      const x1 = e.clientX - rect.left
      const y1 = e.clientY - rect.top
      const width = Math.abs(x1 - x0)
      const height = Math.abs(y1 - y0)

      // Zero-area release (a plain click, not a drag): don't touch selection
      // and let the natural click event fall through to handleSvgClick
      // (add-point-on-click), unchanged from before AA.4.
      if (width < 2 && height < 2) return

      const t0 = xToTime(Math.min(x0, x1))
      const t1 = xToTime(Math.max(x0, x1))
      const v0 = yToValue(Math.min(y0, y1))
      const v1 = yToValue(Math.max(y0, y1))
      useAutomationStore.getState().selectPointsInRect(trackId, lane.id, t0, t1, v0, v1, e.shiftKey)

      // Suppress the synthetic click that follows this pointerup so it
      // doesn't also fire handleSvgClick and add a spurious point — pattern
      // from feedback_drag-end-suppresses-click.md (used by MarqueeOverlay.tsx).
      window.addEventListener('click', (ev) => ev.stopPropagation(), { capture: true, once: true })
    },
    [trackId, lane.id, xToTime, yToValue],
  )

  const handleLanePointerCancel = useCallback(() => {
    marqueeDraggingRef.current = false
    setMarqueeRect(null)
  }, [])

  // Escape mid-drag cancels the marquee without changing selection.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && marqueeDraggingRef.current) {
        marqueeDraggingRef.current = false
        setMarqueeRect(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const handleSvgClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current) return
      const rect = svgRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const time = xToTime(x)

      if (trigger) {
        // For trigger lanes, click toggles between 0 and 1 at the clicked time
        const value = 1.0
        useAutomationStore.getState().addPoint(trackId, lane.id, time, value)
      } else {
        const value = Math.max(0, Math.min(1, yToValue(y)))
        useAutomationStore.getState().addPoint(trackId, lane.id, time, value)
      }
    },
    [trackId, lane.id, xToTime, yToValue, trigger],
  )

  const points = lane.points

  const isThisLaneSelected = selection?.trackId === trackId && selection?.laneId === lane.id
  const selectedIndexSet = isThisLaneSelected ? new Set(selection!.indices) : EMPTY_SELECTION
  const selectionSize = isThisLaneSelected ? selection!.indices.length : 0

  return (
    <>
    <svg
      ref={svgRef}
      className={`auto-lane${trigger ? ' auto-lane--trigger' : ''}${isModulationLane(lane) ? ' auto-lane--modulation' : ''}`}
      width="100%"
      height={height}
      onClick={handleSvgClick}
      onPointerDown={handleLanePointerDown}
      onPointerMove={handleLanePointerMove}
      onPointerUp={handleLanePointerUp}
      onPointerCancel={handleLanePointerCancel}
      onContextMenu={handleLaneContextMenu}
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'all' }}
      data-testid={trigger ? 'trigger-lane' : 'automation-lane'}
    >
      {trigger ? (
        /* Trigger lanes: colored rectangular blocks */
        <TriggerBlocks
          points={points}
          color={renderColor}
          timeToX={timeToX}
          height={height}
        />
      ) : (
        <>
          {/* Curve segments */}
          {points.map((pt, i) => {
            if (i >= points.length - 1) return null
            return (
              <CurveSegment
                key={`seg-${i}`}
                from={pt}
                to={points[i + 1]}
                color={renderColor}
                opacity={1}
                timeToX={timeToX}
                valueToY={valueToY}
              />
            )
          })}
        </>
      )}
      {/* Nodes (shown for both types) */}
      {points.map((pt, i) => (
        <AutomationNode
          key={`node-${i}`}
          point={pt}
          index={i}
          color={renderColor}
          timeToX={timeToX}
          valueToY={valueToY}
          xToTime={xToTime}
          yToValue={yToValue}
          onUpdate={handleUpdate}
          onRemove={handleRemove}
          isSelected={selectedIndexSet.has(i)}
          selectionSize={selectionSize}
          onSelect={handleSelectNode}
          onMoveSelection={handleMoveSelection}
        />
      ))}
      {/* AA.4b — transform box (scale/skew/flatten/ramp) over the active
          breakpoint selection. Not rendered for trigger lanes (square-wave
          0/1 blocks — no meaningful value axis to scale/skew). */}
      {!trigger && (
        <AutomationTransformBox
          trackId={trackId}
          laneId={lane.id}
          timeToX={timeToX}
          valueToY={valueToY}
          xToTime={xToTime}
          yToValue={yToValue}
          height={height}
        />
      )}
      {/* AA.4 — marquee-select rubber-band rect (visual only; pointerEvents
          none so it never intercepts the pointer handlers above). */}
      {marqueeRect && (marqueeRect.width > 1 || marqueeRect.height > 1) && (
        <rect
          className="auto-lane__marquee-rect"
          x={marqueeRect.left}
          y={marqueeRect.top}
          width={marqueeRect.width}
          height={marqueeRect.height}
          fill="rgba(74, 222, 128, 0.08)"
          stroke="#4ade80"
          strokeWidth={1}
          pointerEvents="none"
        />
      )}
    </svg>
    {ctxMenu && (
      <ContextMenu
        x={ctxMenu.x}
        y={ctxMenu.y}
        items={getLaneCurveMenuItems()}
        onClose={() => setCtxMenu(null)}
      />
    )}
    {shapePopoverOpen && (
      <div
        className="lane-shape-popover"
        data-testid="lane-shape-popover"
        style={{ left: `${shapePopoverPos.x}px`, top: `${shapePopoverPos.y}px` }}
      >
        <div className="lane-shape-popover__title">Insert Shape</div>
        <label>
          Shape:{' '}
          <select
            data-testid="lane-shape-kind-select"
            value={shapeKind}
            onChange={(e) => setShapeKind(e.target.value as AutomationShapeKind)}
          >
            {AUTOMATION_SHAPES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
        <label title="Number of periods across the target range (ignored by Ramp Up/Down; used as the number of hold-steps for Random).">
          Cycles:{' '}
          <input
            data-testid="lane-shape-cycles-input"
            type="number"
            min={0.25}
            step={0.25}
            value={shapeCycles}
            onChange={(e) => setShapeCycles(Number(e.target.value))}
          />
        </label>
        <label title="0 = flat line at the lane midpoint, 1 = full swing across the lane's value range.">
          Amplitude:{' '}
          <input
            data-testid="lane-shape-amplitude-input"
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={shapeAmplitude}
            onChange={(e) => setShapeAmplitude(Number(e.target.value))}
          />
        </label>
        <div className="lane-shape-popover__actions">
          <button
            className="lane-shape-popover__insert-btn"
            data-testid="lane-shape-insert-btn"
            onClick={handleInsertLaneShape}
          >
            Insert
          </button>
          <button
            className="lane-shape-popover__cancel-btn"
            data-testid="lane-shape-cancel-btn"
            onClick={() => setShapePopoverOpen(false)}
          >
            Cancel
          </button>
        </div>
      </div>
    )}
    </>
  )
}
