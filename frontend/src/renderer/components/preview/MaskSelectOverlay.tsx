/**
 * MaskSelectOverlay — Preview canvas marquee for MK.4 + lasso modes for MK.5.
 *
 * MK.13 additions:
 *   - Marching-ants SVG layer on committed selections (animated stroke-dashoffset,
 *     MOD-violet #8F7DFF, ≤256-vertex RDP-decimated outline, pointer-events:none).
 *     // Pattern: SVG z-order last = topmost layer (feedback_svg-zorder-hooks.md)
 *   - prefers-reduced-motion: animation disabled (dashoffset stays static)
 *   - Polygon outlines capped at ≤256 vertices (RDP-decimated, same as MK.5 freehand path)
 *   - Rect/ellipse ants: approximated as a 64-point polyline (well under the 256 cap)
 *
 * Interaction model (rect/ellipse — MK.4, unchanged):
 *   pointerdown  → anchor the drag origin; setPointerCapture so mouseup outside still fires
 *   pointermove  → update marqueeInProgress (DOM-space rect); suppress synthetic click flag
 *   pointerup ≥4px → commit → addMatteNode with frame-coord params
 *   pointerup <4px → deselect (click-off), suppress if isDragging was set (drag-end-suppresses-click)
 *   Escape (keydown while dragging) → cancel without committing a node
 *
 * Interaction model (lasso-freehand — MK.5 NEW):
 *   pointerdown  → begin path; sample pointer at ≥4px movement deltas
 *   pointermove  → append sampled points; render live SVG polyline
 *   pointerup    → RDP-simplify to ≤256 vertices; commit polygon MatteNode
 *                  drag-end-suppresses-click: pointerup after drag must NOT clear selection
 *
 * Interaction model (lasso-polygon — MK.5 NEW):
 *   left-click   → place vertex (single click only; double-click handled separately)
 *   double-click → close polygon + commit MatteNode (≥3 vertices required)
 *   Enter (keydown) → close + commit (same as double-click)
 *   Escape (keydown) → cancel mid-placement (no node committed)
 *   ≤2 vertices at close attempt → reject (no node committed)
 *
 * Letterbox coordinate mapping reuses BoundingBoxOverlay.tsx:53–66 pattern via
 * computeCanvasLayout + the domToFrameCoords helper below.
 * // letterbox mapping from BoundingBoxOverlay.tsx:53 (computeCanvasLayout + ResizeObserver)
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { rdpSimplify, samplePath } from '../../utils/rdp-simplify'
import type { Point2D } from '../../utils/rdp-simplify'
import { computeCanvasLayout } from '../../utils/transform-coords'
import type { CanvasLayout } from '../../utils/transform-coords'
import { useTimelineStore } from '../../stores/timeline'
import { useToastStore } from '../../stores/toast'
import { randomUUID } from '../../utils'
import type { MatteNode, MatteNodeKind, MatteOp } from '../../../shared/types'

// MK.13: Marching-ants constants (MOD-violet per DESIGN-SPEC).
const ANTS_COLOR = '#8F7DFF'
const ANTS_DASH = '6 3'
const ANTS_ANIMATION_DURATION = '0.5s'

/**
 * MK.13: Check prefers-reduced-motion at render time.
 * Returns true if animation should be disabled.
 */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * MK.13: Convert a committed rect (DOM-space) to an approximated polyline
 * capped at ≤256 vertices. Uses 4 corners for a rect (well under cap).
 * Returns points in SVG-space (same coordinate frame as the SVG element).
 *
 * Ants bound: rect = 4 points, ellipse approximated at ELLIPSE_POLY_STEPS points.
 * Both are well under the 256-vertex cap. The cap is only relevant for polygon mattes.
 */
const ELLIPSE_POLY_STEPS = 64  // ≤256 — each point represents one step around the ellipse

function rectToPolyline(r: { x: number; y: number; w: number; h: number }): Point2D[] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
    { x: r.x, y: r.y },  // close
  ]
}

function ellipseToPolyline(
  cx: number, cy: number, rx: number, ry: number,
): Point2D[] {
  const pts: Point2D[] = []
  for (let i = 0; i <= ELLIPSE_POLY_STEPS; i++) {
    const angle = (i / ELLIPSE_POLY_STEPS) * 2 * Math.PI
    pts.push({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) })
  }
  return pts
}

/**
 * MK.13: Render the marching-ants animated SVG outline for a committed selection.
 * pointer-events:none — never steals events from the canvas (feedback_svg-zorder-hooks.md).
 * reduced-motion: stroke-dashoffset animation disabled when prefers-reduced-motion is set.
 *
 * The ants polyline is capped at ≤256 vertices (RDP-decimated for polygon mattes;
 * rect=5pts, ellipse=64pts — both under the cap by construction).
 */
interface MarchingAntsProps {
  /** SVG-space points for the outline polyline (already ≤256 vertices). */
  points: Point2D[]
  /** Whether this is a closed shape (polygon/ellipse/rect) — closed = use <polygon>-style repeat. */
  closed?: boolean
}

function MarchingAnts({ points, closed = true }: MarchingAntsProps) {
  const reduced = prefersReducedMotion()
  // Unique animation ID per instance to avoid clashing with other overlays.
  const animId = useMemo(() => `ants-anim-${Math.random().toString(36).slice(2, 6)}`, [])
  const ptStr = points.map((p) => `${p.x},${p.y}`).join(' ')

  if (points.length < 2) return null

  return (
    <>
      {!reduced && (
        <defs>
          <style>{`
            @keyframes ${animId} {
              from { stroke-dashoffset: 0; }
              to   { stroke-dashoffset: -18; }
            }
          `}</style>
        </defs>
      )}
      <polyline
        className="masking__ants-outline"
        points={ptStr}
        fill={closed ? 'none' : 'none'}
        stroke={ANTS_COLOR}
        strokeWidth={1}
        strokeDasharray={ANTS_DASH}
        strokeDashoffset={0}
        strokeLinecap="round"
        style={{
          pointerEvents: 'none',
          animation: reduced ? 'none' : `${animId} ${ANTS_ANIMATION_DURATION} linear infinite`,
        }}
        data-testid="masking-ants-polyline"
        data-vertex-count={points.length}
      />
    </>
  )
}

const DRAG_THRESHOLD_PX = 4

interface Props {
  containerRef: React.RefObject<HTMLElement | null>
  canvasWidth: number
  canvasHeight: number
  clipId: string | null
  /** MK.6: asset path for wand IPC call. Required for wand mode. */
  assetPath?: string | null
  /** MK.6: current frame index for wand IPC call. */
  frameIndex?: number
}

/**
 * Convert a DOM-space point inside the container into frame-normalized coords.
 * Frame coords: x ∈ [0, 1] from left edge, y ∈ [0, 1] from top edge.
 *
 * Exact-coords test:
 *   1920×1080 frame in 800×450 canvas with 25px letterbox on each side (top + bottom).
 *   displayScale = min(800/1920, 450/1080) = min(0.4167, 0.4167) = 0.4167
 *   canvasDisplayWidth = 1920 * 0.4167 = 800px (fills width)
 *   canvasDisplayHeight = 1080 * 0.4167 = 450px (fills height)
 *   canvasOffsetX = (800 - 800) / 2 = 0
 *   canvasOffsetY = (500 - 450) / 2 = 25px   ← the 25px letterbox
 *   A click at domX=400, domY=250 (container-relative):
 *     relX = 400 - 0 = 400   relY = 250 - 25 = 225
 *     fx = 400 / 800 = 0.5   fy = 225 / 450 = 0.5   → center pixel, correct.
 */
function domToFrameCoords(
  domX: number,
  domY: number,
  layout: CanvasLayout,
  containerRect: DOMRect,
): { fx: number; fy: number } {
  // Position relative to container top-left
  const relX = domX - containerRect.left - layout.canvasOffsetX
  const relY = domY - containerRect.top - layout.canvasOffsetY
  // Normalize to [0,1] over the canvas display area
  const fx = relX / layout.canvasDisplayWidth
  const fy = relY / layout.canvasDisplayHeight
  return { fx, fy }
}

export default function MaskSelectOverlay({
  containerRef,
  canvasWidth,
  canvasHeight,
  clipId,
  assetPath = null,
  frameIndex = 0,
}: Props) {
  // // letterbox mapping from BoundingBoxOverlay.tsx:53 (computeCanvasLayout + ResizeObserver)
  const [layout, setLayout] = useState<CanvasLayout | null>(null)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      setLayout(computeCanvasLayout(el, canvasWidth, canvasHeight, canvasWidth, canvasHeight))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [containerRef, canvasWidth, canvasHeight])

  const toolMode = useTimelineStore((s) => s.previewToolMode)
  const marqueeInProgress = useTimelineStore((s) => s.marqueeInProgress)
  const committedMaskSelection = useTimelineStore((s) => s.committedMaskSelection)
  // MK.6: wand + eyedropper state
  const wandTolerance = useTimelineStore((s) => s.wandTolerance)
  const [wandPending, setWandPending] = useState(false)

  // Track drag state (ref, not state — must not re-render during drag)
  const isDragging = useRef(false)
  const dragOrigin = useRef<{ x: number; y: number } | null>(null)
  // Modifier state captured at pointerdown (PS convention: modifier@down sets boolean op)
  const opAtDown = useRef<MatteOp>('add')

  const svgRef = useRef<SVGSVGElement>(null)

  // ── MK.6: wand click handler ──────────────────────────────────────────────
  /**
   * Handles a click in 'wand' tool mode.
   *
   * Converts DOM-space click to frame-pixel coordinates, sends the
   * mask_wand_sample IPC command, and adds the resulting bitmap MatteNode
   * to the clip's mask stack.
   *
   * Trust boundary (frontend side):
   *   - x, y are derived from the DOM event and clamped to valid frame bounds
   *     before sending — the backend validates them again (defence-in-depth).
   *   - frameIndex is the integer frame the preview is currently showing.
   */
  const handleWandClick = useCallback(async (e: React.MouseEvent<SVGSVGElement>) => {
    if (!layout || !clipId || !assetPath || !containerRef.current) return
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()

    const containerRect = containerRef.current.getBoundingClientRect()
    const { fx, fy } = domToFrameCoords(e.clientX, e.clientY, layout, containerRect)

    // Convert normalized [0,1] frame coords → integer pixel coords
    const px = Math.max(0, Math.min(canvasWidth - 1, Math.round(fx * canvasWidth)))
    const py = Math.max(0, Math.min(canvasHeight - 1, Math.round(fy * canvasHeight)))

    const nodeId = randomUUID()
    const tolerance = wandTolerance

    setWandPending(true)
    try {
      const res = await (window as any).entropic?.sendCommand({
        cmd: 'mask_wand_sample',
        path: assetPath,
        clip_id: clipId,
        node_id: nodeId,
        frame_index: frameIndex,
        x: px,
        y: py,
        tolerance,
      })

      if (res?.ok && res.node) {
        const node: MatteNode = {
          id: res.node.id ?? nodeId,
          kind: 'bitmap',
          params: res.node.params ?? {},
          op: 'add',
          invert: false,
          feather: 0,
          growShrink: 0,
          enabled: true,
        }
        useTimelineStore.getState().addMatteNode(clipId, node)
        useTimelineStore.setState({ committedMaskSelection: { nodeId: node.id, clipId } })
      } else if (!res?.ok) {
        useToastStore.getState().addToast({
          level: 'warning',
          message: 'Wand sample failed — try again',
          source: 'wand-sample-failure',
        })
      }
    } catch {
      useToastStore.getState().addToast({
        level: 'warning',
        message: 'Wand sample failed — try again',
        source: 'wand-sample-failure',
      })
    } finally {
      setWandPending(false)
    }
  }, [layout, clipId, assetPath, frameIndex, canvasWidth, canvasHeight, wandTolerance, containerRef])

  // ── MK.6: eyedropper click handler ───────────────────────────────────────
  /**
   * Handles a click in 'eyedropper' tool mode.
   *
   * Converts click to frame coords, reads the pixel color from the frame
   * at the given position, and creates a color_range MatteNode with those params.
   *
   * Color is sampled from the rendered frame via an offscreen canvas read.
   * If canvas readback is unavailable, falls back to (0, 0, 0).
   */
  const handleEyedropperClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!layout || !clipId || !containerRef.current) return
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()

    const containerRect = containerRef.current.getBoundingClientRect()
    const { fx, fy } = domToFrameCoords(e.clientX, e.clientY, layout, containerRect)

    // Sample the picked color (r, g, b) directly from the preview image element;
    // it is consumed locally below to seed the color_range matte node (the real
    // chroma consumer). No separate store field — the node IS the consumer.
    let r = 0, g = 0, b = 0
    try {
      const previewImg = containerRef.current.querySelector('img') as HTMLImageElement | null
      if (previewImg && previewImg.complete) {
        const canvas = document.createElement('canvas')
        canvas.width = previewImg.naturalWidth || canvasWidth
        canvas.height = previewImg.naturalHeight || canvasHeight
        const ctx2d = canvas.getContext('2d')
        if (ctx2d) {
          ctx2d.drawImage(previewImg, 0, 0, canvas.width, canvas.height)
          const px = Math.max(0, Math.min(canvas.width - 1, Math.round(fx * canvas.width)))
          const py = Math.max(0, Math.min(canvas.height - 1, Math.round(fy * canvas.height)))
          const data = ctx2d.getImageData(px, py, 1, 1).data
          r = data[0]; g = data[1]; b = data[2]
        }
      }
    } catch {
      // Canvas readback failed (cross-origin or security) — use (0,0,0)
    }

    // Create a color_range MatteNode with the picked color and current wand tolerance
    const nodeId = randomUUID()
    const node: MatteNode = {
      id: nodeId,
      kind: 'color_range',
      params: {
        r,
        g,
        b,
        tolerance: wandTolerance,
        softness: 10,
      },
      op: 'add',
      invert: false,
      feather: 0,
      growShrink: 0,
      enabled: true,
    }
    useTimelineStore.getState().addMatteNode(clipId, node)
    useTimelineStore.setState({ committedMaskSelection: { nodeId: node.id, clipId } })
  }, [layout, clipId, canvasWidth, canvasHeight, wandTolerance, containerRef])

  // ── MK.5: freehand lasso state ───────────────────────────────────────────
  // Raw pointer points sampled at ≥4px intervals during a freehand drag.
  const freehandPoints = useRef<Point2D[]>([])
  const freehandActive = useRef(false)
  const lastFreehandPoint = useRef<Point2D | null>(null)
  // Rendered in-progress path (DOM-space, for SVG polyline display)
  const [freehandPath, setFreehandPath] = useState<Point2D[]>([])

  // ── MK.5: polygon lasso state ────────────────────────────────────────────
  // Placed vertices (DOM-space, converted to frame coords at commit time).
  const polygonVertices = useRef<Point2D[]>([])
  const [polygonDisplay, setPolygonDisplay] = useState<Point2D[]>([])
  // Suppress the single-click that would fire after a double-click close.
  // Strategy: record timestamp of last double-click; single-click fires within
  // ~300 ms of the dblclick event, so we gate it out.
  const lastDblClickTime = useRef<number>(0)

  // Keyboard Escape handler for mid-drag cancel (rect/ellipse MK.4 + lasso MK.5)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        // Cancel ANY active lasso or marquee
        if (isDragging.current) {
          e.preventDefault()
          e.stopPropagation()
          isDragging.current = false
          dragOrigin.current = null
          useTimelineStore.getState().setMarqueeInProgress(null)
        }
        if (freehandActive.current) {
          e.preventDefault()
          e.stopPropagation()
          freehandActive.current = false
          freehandPoints.current = []
          lastFreehandPoint.current = null
          setFreehandPath([])
        }
        if (polygonVertices.current.length > 0) {
          e.preventDefault()
          e.stopPropagation()
          polygonVertices.current = []
          setPolygonDisplay([])
        }
      } else if (e.code === 'Enter') {
        // Commit polygon on Enter (same as double-click close)
        if (toolMode === 'lasso-polygon' && polygonVertices.current.length >= 3) {
          e.preventDefault()
          e.stopPropagation()
          commitPolygon(polygonVertices.current)
          polygonVertices.current = []
          setPolygonDisplay([])
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [toolMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── MK.5: commitPolygon helper ───────────────────────────────────────────
  /**
   * Convert DOM-space vertices to frame-normalized coords and commit a polygon
   * MatteNode through MK.4's existing addMatteNode pipeline.
   * Requires ≥3 vertices; fewer is a no-op (two-point polygon rejected).
   *
   * Self-intersecting polygons are allowed (even-odd fill rule in backend).
   * The backend polygon rasterizer already ships from MK.1.
   */
  const commitPolygon = useCallback((domPts: ReadonlyArray<Point2D>) => {
    if (domPts.length < 3) return   // two-point polygon rejected
    if (!layout || !containerRef.current || !clipId) return

    const containerRect = containerRef.current.getBoundingClientRect()
    // Convert each DOM-space vertex to frame-normalized [0,1]×[0,1]
    const vertices = domPts.map((pt) => {
      const { fx, fy } = domToFrameCoords(pt.x, pt.y, layout, containerRect)
      return { x: fx, y: fy }
    })

    const node: MatteNode = {
      id: randomUUID(),
      kind: 'polygon',
      // vertices encoded as [[x,y], ...] pairs per MK.1 backend contract.
      // _rasterize_polygon expects params["vertices"] = list of [x_norm, y_norm]
      params: { vertices: vertices.map((v) => [v.x, v.y]) as unknown as number[][] },
      op: opAtDown.current,
      invert: false,
      feather: 0,
      growShrink: 0,
      enabled: true,
    }

    useTimelineStore.getState().addMatteNode(clipId, node)
    useTimelineStore.setState({ committedMaskSelection: { nodeId: node.id, clipId } })
  }, [layout, containerRef, clipId])

  // ── MK.5: freehand pointer handlers ─────────────────────────────────────

  const handleFreehandPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!layout || !clipId) return
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()

    if (e.shiftKey && e.altKey) opAtDown.current = 'intersect'
    else if (e.shiftKey) opAtDown.current = 'add'
    else if (e.altKey) opAtDown.current = 'subtract'
    else opAtDown.current = 'add'

    const pt: Point2D = { x: e.clientX, y: e.clientY }
    freehandPoints.current = [pt]
    lastFreehandPoint.current = pt
    freehandActive.current = true
    setFreehandPath([pt])

    svgRef.current?.setPointerCapture(e.pointerId)
  }, [layout, clipId])

  const handleFreehandPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!freehandActive.current || !lastFreehandPoint.current) return
    const dx = e.clientX - lastFreehandPoint.current.x
    const dy = e.clientY - lastFreehandPoint.current.y
    // Sample at ≥4px movement deltas (failure mode guard from MK.5 spec)
    if (Math.hypot(dx, dy) < 4) return

    const pt: Point2D = { x: e.clientX, y: e.clientY }
    freehandPoints.current.push(pt)
    lastFreehandPoint.current = pt
    // Update display path (creates new array reference to trigger re-render)
    setFreehandPath([...freehandPoints.current])
  }, [])

  const handleFreehandPointerUp = useCallback((_e: React.PointerEvent<SVGSVGElement>) => {
    if (!freehandActive.current) return

    // drag-end-suppresses-click: freehand mouseup must NOT clear the commit
    // We record that a freehand drag completed so the subsequent synthetic
    // click (if any) is ignored.
    freehandActive.current = false
    lastFreehandPoint.current = null

    const raw = freehandPoints.current
    freehandPoints.current = []
    setFreehandPath([])

    if (raw.length < 3) return   // too few points — no node

    // RDP-simplify the sampled path (≤256 vertices, max deviation 2px)
    const simplified = rdpSimplify(samplePath(raw, 4), 2.0)

    if (simplified.length < 3) return   // degenerate after simplification

    // Convert DOM-space coords to container-relative for commitPolygon
    if (!containerRef.current) return
    const containerRect = containerRef.current.getBoundingClientRect()
    // domToFrameCoords already takes clientX/Y → frame coords
    // But commitPolygon expects DOM-space (client) coords
    commitPolygon(simplified)
  }, [commitPolygon, containerRef])

  // ── MK.5: polygon click handlers ─────────────────────────────────────────

  const handlePolygonClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!layout || !clipId) return
    if (e.button !== 0) return

    // Suppress the single-click that immediately follows a double-click
    if (Date.now() - lastDblClickTime.current < 400) return

    e.preventDefault()
    e.stopPropagation()

    if (polygonVertices.current.length === 0) {
      // First vertex — capture modifier for boolean op
      if (e.shiftKey && e.altKey) opAtDown.current = 'intersect'
      else if (e.shiftKey) opAtDown.current = 'add'
      else if (e.altKey) opAtDown.current = 'subtract'
      else opAtDown.current = 'add'
    }

    const pt: Point2D = { x: e.clientX, y: e.clientY }
    polygonVertices.current = [...polygonVertices.current, pt]
    setPolygonDisplay([...polygonVertices.current])
  }, [layout, clipId])

  const handlePolygonDblClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!layout || !clipId) return
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()

    lastDblClickTime.current = Date.now()

    // Need ≥3 vertices to form a valid polygon (two-point polygon rejected)
    if (polygonVertices.current.length < 3) {
      // Reject: cancel silently
      polygonVertices.current = []
      setPolygonDisplay([])
      return
    }

    const verts = polygonVertices.current
    polygonVertices.current = []
    setPolygonDisplay([])
    commitPolygon(verts)
  }, [layout, clipId, commitPolygon])

  const handlePointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!layout || !clipId) return
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()

    // Determine boolean op from modifier state AT pointerdown (MASKING-INTERACTIONS.md §2)
    if (e.shiftKey && e.altKey) opAtDown.current = 'intersect'
    else if (e.shiftKey) opAtDown.current = 'add'
    else if (e.altKey) opAtDown.current = 'subtract'
    else opAtDown.current = 'add'

    isDragging.current = false  // not a drag yet — threshold not met
    dragOrigin.current = { x: e.clientX, y: e.clientY }

    // Capture so pointerup fires even if pointer leaves window
    svgRef.current?.setPointerCapture(e.pointerId)

    useTimelineStore.getState().setMarqueeInProgress({
      x1: e.clientX,
      y1: e.clientY,
      x2: e.clientX,
      y2: e.clientY,
    })
  }, [layout, clipId])

  const handlePointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragOrigin.current || !layout) return
    const dx = e.clientX - dragOrigin.current.x
    const dy = e.clientY - dragOrigin.current.y
    if (!isDragging.current && (Math.abs(dx) >= DRAG_THRESHOLD_PX || Math.abs(dy) >= DRAG_THRESHOLD_PX)) {
      isDragging.current = true
    }
    if (!isDragging.current) return

    useTimelineStore.getState().setMarqueeInProgress({
      x1: dragOrigin.current.x,
      y1: dragOrigin.current.y,
      x2: e.clientX,
      y2: e.clientY,
    })
  }, [layout])

  const handlePointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragOrigin.current || !layout || !clipId) {
      dragOrigin.current = null
      return
    }

    const wasDragging = isDragging.current
    isDragging.current = false
    dragOrigin.current = null

    const store = useTimelineStore.getState()

    if (!wasDragging) {
      // Click (not a drag) — deselect active selection (drag-end-suppresses-click:
      // isDragging was false, so this is a genuine click, PS deselect-on-click-empty)
      store.setMarqueeInProgress(null)
      store.clearMaskSelection()
      return
    }

    // Drag ended — commit to MatteNode
    const rect = store.marqueeInProgress
    store.setMarqueeInProgress(null)
    if (!rect || !containerRef.current) return

    const containerRect = containerRef.current.getBoundingClientRect()
    const p1 = domToFrameCoords(rect.x1, rect.y1, layout, containerRect)
    const p2 = domToFrameCoords(rect.x2, rect.y2, layout, containerRect)

    const fx = Math.min(p1.fx, p2.fx)
    const fy = Math.min(p1.fy, p2.fy)
    const fw = Math.abs(p2.fx - p1.fx)
    const fh = Math.abs(p2.fy - p1.fy)

    // Zero-area drag guard: ensure the committed rect covers at least DRAG_THRESHOLD_PX
    // in display pixels on both axes (fw/fh are normalized [0,1] over the canvas display area).
    // Converts back to display pixels: fw * canvasDisplayWidth.
    if (fw * layout.canvasDisplayWidth < DRAG_THRESHOLD_PX || fh * layout.canvasDisplayHeight < DRAG_THRESHOLD_PX) {
      store.clearMaskSelection()
      return
    }

    const kind: MatteNodeKind = store.previewToolMode === 'marquee-ellipse' ? 'ellipse' : 'rect'

    const node: MatteNode = {
      id: randomUUID(),
      kind,
      params: kind === 'rect'
        ? { x: fx, y: fy, w: fw, h: fh }
        : { cx: fx + fw / 2, cy: fy + fh / 2, rx: fw / 2, ry: fh / 2 },
      op: opAtDown.current,
      invert: false,
      feather: 0,
      growShrink: 0,
      enabled: true,
    }

    store.addMatteNode(clipId, node)
    // Record the committed selection for delete/fill ops (ephemeral UI state — not undoable)
    useTimelineStore.setState({ committedMaskSelection: { nodeId: node.id, clipId } })
  }, [layout, clipId, canvasWidth, canvasHeight, containerRef])

  // If no tool mode active, render nothing (pointerEvents:none shortcut — BoundingBox handles)
  if (!toolMode) return null

  // ── MK.5: Resolve committed POLYGON node → DOM-space vertices ─────────────
  // Shared across the lasso and rect/ellipse render paths. Polygon nodes carry
  // params.vertices ([[x,y],...] normalized pairs), NOT cx/cy/rx/ry — so they
  // must NOT fall into the rect/ellipse committedRect resolution (that produced
  // NaN and an invisible affordance — the MK.5 committed-render bug).
  const resolveCommittedPolygon = (): { x: number; y: number }[] | null => {
    if (!committedMaskSelection || !layout || !containerRef.current) return null
    const tracks = useTimelineStore.getState().tracks
    let foundNode: MatteNode | undefined
    for (const track of tracks) {
      const clip = track.clips.find((c) => c.id === committedMaskSelection.clipId)
      if (clip) {
        foundNode = clip.maskStack?.find((n) => n.id === committedMaskSelection.nodeId)
        break
      }
    }
    if (!foundNode || foundNode.kind !== 'polygon') return null
    const rawVerts = foundNode.params.vertices as unknown
    if (!Array.isArray(rawVerts)) return null
    const pts = rawVerts
      .map((v) => {
        const vx = Array.isArray(v) ? (v[0] as number) : NaN
        const vy = Array.isArray(v) ? (v[1] as number) : NaN
        return {
          x: vx * layout.canvasDisplayWidth + layout.canvasOffsetX,
          y: vy * layout.canvasDisplayHeight + layout.canvasOffsetY,
        }
      })
      .filter((pt) => Number.isFinite(pt.x) && Number.isFinite(pt.y))
    return pts.length >= 3 ? pts : null
  }

  // ── MK.6: Route to wand / eyedropper render path ─────────────────────────
  const isWandMode = toolMode === 'wand'
  const isEyedropperMode = toolMode === 'eyedropper'

  if (isWandMode || isEyedropperMode) {
    return (
      <svg
        className="mask-select-overlay"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          cursor: isWandMode
            ? (wandPending ? 'wait' : 'crosshair')
            : 'cell',
          pointerEvents: 'all',
          userSelect: 'none',
          overflow: 'visible',
        }}
        onClick={isWandMode ? handleWandClick : handleEyedropperClick}
      >
        {/* Wand/eyedropper: no in-progress rubber-band; committed selection affordance shown
            once the node is committed (same dashed-violet style as MK.4/5). */}
      </svg>
    )
  }

  // ── MK.5: Route to lasso render path ─────────────────────────────────────
  const isLassoFreehand = toolMode === 'lasso-freehand'
  const isLassoPolygon = toolMode === 'lasso-polygon'
  const isLassoMode = isLassoFreehand || isLassoPolygon

  if (isLassoMode) {
    const committedPolygonLasso = resolveCommittedPolygon()
    // Helper: convert client coords to SVG-space (SVG covers the container)
    const toSVG = (pt: Point2D): Point2D => {
      if (!containerRef.current) return pt
      const r = containerRef.current.getBoundingClientRect()
      return { x: pt.x - r.left, y: pt.y - r.top }
    }

    // Build points string for polyline/polygon SVG elements
    const svgFreehandPts = freehandPath.map(toSVG)
    const svgPolygonPts = polygonDisplay.map(toSVG)

    const toPointsAttr = (pts: Point2D[]) => pts.map((p) => `${p.x},${p.y}`).join(' ')

    return (
      <svg
        ref={svgRef}
        className="mask-select-overlay"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          cursor: isLassoPolygon ? 'crosshair' : 'cell',
          pointerEvents: 'all',
          userSelect: 'none',
          overflow: 'visible',
        }}
        // Freehand: pointer events for drag
        onPointerDown={isLassoFreehand ? handleFreehandPointerDown : undefined}
        onPointerMove={isLassoFreehand ? handleFreehandPointerMove : undefined}
        onPointerUp={isLassoFreehand ? handleFreehandPointerUp : undefined}
        // Polygon: click events
        onClick={isLassoPolygon ? handlePolygonClick : undefined}
        onDoubleClick={isLassoPolygon ? handlePolygonDblClick : undefined}
      >
        {/* MK.5: Committed polygon affordance — dashed MOD outline + 65% outside-dim.
            Renders AFTER a lasso commits (tool mode is still lasso-*). Follows the
            drawn path via a <polygon>, mirroring the rect/ellipse committed visual. */}
        {committedPolygonLasso && (
          <>
            <defs>
              <mask id="mask-select-committed-cutout-polygon">
                <rect x="0" y="0" width="100%" height="100%" fill="white" />
                <polygon
                  points={committedPolygonLasso.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="black"
                />
              </mask>
            </defs>
            <rect
              x="0" y="0" width="100%" height="100%"
              fill="rgba(0,0,0,0.65)"
              mask="url(#mask-select-committed-cutout-polygon)"
              style={{ pointerEvents: 'none' }}
            />
            <polygon
              points={committedPolygonLasso.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="#8F7DFF"
              strokeWidth={1}
              strokeDasharray="4 2"
              style={{ pointerEvents: 'none' }}
            />
          </>
        )}

        {/* Freehand in-progress path — follows drawn path exactly (not bounding rect) */}
        {isLassoFreehand && svgFreehandPts.length >= 2 && (
          <polyline
            points={toPointsAttr(svgFreehandPts)}
            fill="rgba(143,125,255,0.12)"
            stroke="#8F7DFF"
            strokeWidth={1}
            strokeDasharray="4 2"
            style={{ pointerEvents: 'none' }}
          />
        )}

        {/* Polygon in-progress vertices + edges */}
        {isLassoPolygon && svgPolygonPts.length >= 2 && (
          <polyline
            points={toPointsAttr(svgPolygonPts)}
            fill="none"
            stroke="#8F7DFF"
            strokeWidth={1}
            strokeDasharray="4 2"
            style={{ pointerEvents: 'none' }}
          />
        )}
        {/* Polygon vertex dots */}
        {isLassoPolygon && svgPolygonPts.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={3}
            fill="#8F7DFF"
            style={{ pointerEvents: 'none' }}
          />
        ))}
      </svg>
    )
  }

  // ── MK.4: rect/ellipse paths (byte-identical — DO NOT MODIFY) ─────────────

  // Compute the in-progress visual (DOM-space rect to overlay coords)
  let inProgressRect: { x: number; y: number; w: number; h: number } | null = null
  if (marqueeInProgress && layout && containerRef.current) {
    const containerRect = containerRef.current.getBoundingClientRect()
    const x1 = marqueeInProgress.x1 - containerRect.left
    const y1 = marqueeInProgress.y1 - containerRect.top
    const x2 = marqueeInProgress.x2 - containerRect.left
    const y2 = marqueeInProgress.y2 - containerRect.top
    inProgressRect = {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      w: Math.abs(x2 - x1),
      h: Math.abs(y2 - y1),
    }
  }

  // Committed selection visual — resolve from store
  let committedRect: { x: number; y: number; w: number; h: number; kind: MatteNodeKind } | null = null
  // MK.5: committed polygon (DOM-space vertices). Resolved via the shared helper
  // so a polygon node committed while a rect/ellipse tool is active still renders.
  const committedPolygon = resolveCommittedPolygon()
  if (committedMaskSelection && layout && containerRef.current && !committedPolygon) {
    const tracks = useTimelineStore.getState().tracks
    let foundNode: MatteNode | undefined
    for (const track of tracks) {
      const clip = track.clips.find((c) => c.id === committedMaskSelection.clipId)
      if (clip) {
        foundNode = clip.maskStack?.find((n) => n.id === committedMaskSelection.nodeId)
        break
      }
    }
    if (foundNode && foundNode.kind !== 'polygon') {
      const containerRect = containerRef.current.getBoundingClientRect()
      const p = foundNode.params
      let normX: number, normY: number, normW: number, normH: number
      if (foundNode.kind === 'rect') {
        normX = p.x as number; normY = p.y as number
        normW = p.w as number; normH = p.h as number
      } else {
        // ellipse: cx,cy,rx,ry
        normX = (p.cx as number) - (p.rx as number)
        normY = (p.cy as number) - (p.ry as number)
        normW = (p.rx as number) * 2
        normH = (p.ry as number) * 2
      }
      // Convert normalized frame coords back to DOM-space within SVG
      const domX = normX * layout.canvasDisplayWidth + layout.canvasOffsetX
      const domY = normY * layout.canvasDisplayHeight + layout.canvasOffsetY
      const domW = normW * layout.canvasDisplayWidth
      const domH = normH * layout.canvasDisplayHeight
      committedRect = { x: domX, y: domY, w: domW, h: domH, kind: foundNode.kind }
    }
  }

  const isDrawingEllipse = toolMode === 'marquee-ellipse'

  return (
    <svg
      ref={svgRef}
      className="mask-select-overlay"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        cursor: 'crosshair',
        pointerEvents: 'all',
        userSelect: 'none',
        // Outside-dim: 65% opacity overlay when there is a committed selection
        overflow: 'visible',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Committed selection: dashed MOD-violet outline + 65% outside-dim */}
      {committedRect && (
        <>
          {/* Outside dim: full-canvas dark overlay with selection cut out */}
          {committedRect.kind === 'rect' ? (
            <>
              <defs>
                <mask id="mask-select-committed-cutout">
                  <rect x="0" y="0" width="100%" height="100%" fill="white" />
                  <rect
                    x={committedRect.x}
                    y={committedRect.y}
                    width={committedRect.w}
                    height={committedRect.h}
                    fill="black"
                  />
                </mask>
              </defs>
              <rect
                x="0" y="0" width="100%" height="100%"
                fill="rgba(0,0,0,0.65)"
                mask="url(#mask-select-committed-cutout)"
                style={{ pointerEvents: 'none' }}
              />
              <rect
                x={committedRect.x}
                y={committedRect.y}
                width={committedRect.w}
                height={committedRect.h}
                fill="none"
                stroke="#8F7DFF"
                strokeWidth={1}
                strokeDasharray="4 2"
                style={{ pointerEvents: 'none' }}
              />
              {/* MK.13: marching-ants rect outline (4 pts, well under ≤256 cap) */}
              <MarchingAnts
                points={rectToPolyline({
                  x: committedRect.x, y: committedRect.y,
                  w: committedRect.w, h: committedRect.h,
                })}
              />
            </>
          ) : (
            <>
              <defs>
                <mask id="mask-select-committed-cutout-ellipse">
                  <rect x="0" y="0" width="100%" height="100%" fill="white" />
                  <ellipse
                    cx={committedRect.x + committedRect.w / 2}
                    cy={committedRect.y + committedRect.h / 2}
                    rx={committedRect.w / 2}
                    ry={committedRect.h / 2}
                    fill="black"
                  />
                </mask>
              </defs>
              <rect
                x="0" y="0" width="100%" height="100%"
                fill="rgba(0,0,0,0.65)"
                mask="url(#mask-select-committed-cutout-ellipse)"
                style={{ pointerEvents: 'none' }}
              />
              <ellipse
                cx={committedRect.x + committedRect.w / 2}
                cy={committedRect.y + committedRect.h / 2}
                rx={committedRect.w / 2}
                ry={committedRect.h / 2}
                fill="none"
                stroke="#8F7DFF"
                strokeWidth={1}
                strokeDasharray="4 2"
                style={{ pointerEvents: 'none' }}
              />
              {/* MK.13: marching-ants ellipse outline (ELLIPSE_POLY_STEPS=64 pts ≤256 cap) */}
              <MarchingAnts
                points={ellipseToPolyline(
                  committedRect.x + committedRect.w / 2,
                  committedRect.y + committedRect.h / 2,
                  committedRect.w / 2,
                  committedRect.h / 2,
                )}
              />
            </>
          )}
        </>
      )}

      {/* MK.5: Committed polygon selection — dashed MOD outline + 65% outside-dim.
          Mirrors the rect/ellipse committed affordance but uses a <polygon>. */}
      {committedPolygon && (
        <>
          <defs>
            <mask id="mask-select-committed-cutout-polygon">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              <polygon
                points={committedPolygon.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="black"
              />
            </mask>
          </defs>
          <rect
            x="0" y="0" width="100%" height="100%"
            fill="rgba(0,0,0,0.65)"
            mask="url(#mask-select-committed-cutout-polygon)"
            style={{ pointerEvents: 'none' }}
          />
          <polygon
            points={committedPolygon.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke="#8F7DFF"
            strokeWidth={1}
            strokeDasharray="4 2"
            style={{ pointerEvents: 'none' }}
          />
          {/* MK.13: marching-ants polygon outline — RDP-decimated to ≤256 vertices.
              committedPolygon vertices are already DOM-space points from resolveCommittedPolygon().
              The polygon was committed via MK.5's RDP simplification (≤256 vertices at commit);
              resolveCommittedPolygon maps them back from normalized frame coords, so the
              DOM-space vertex count equals the stored vertex count (same structure). */}
          <MarchingAnts
            points={(() => {
              // RDP-decimate to ≤256 vertices (defensive — MK.5 already caps at commit)
              const capped = committedPolygon.length > 256
                ? rdpSimplify(committedPolygon, 1.0).slice(0, 256)
                : committedPolygon
              return [...capped, capped[0]!]  // close the polygon
            })()}
          />
        </>
      )}

      {/* In-progress drag rubber-band */}
      {inProgressRect && (
        <>
          {isDrawingEllipse ? (
            <ellipse
              cx={inProgressRect.x + inProgressRect.w / 2}
              cy={inProgressRect.y + inProgressRect.h / 2}
              rx={inProgressRect.w / 2}
              ry={inProgressRect.h / 2}
              fill="rgba(143,125,255,0.12)"
              stroke="#8F7DFF"
              strokeWidth={1}
              strokeDasharray="4 2"
              style={{ pointerEvents: 'none' }}
            />
          ) : (
            <rect
              x={inProgressRect.x}
              y={inProgressRect.y}
              width={inProgressRect.w}
              height={inProgressRect.h}
              fill="rgba(143,125,255,0.12)"
              stroke="#8F7DFF"
              strokeWidth={1}
              strokeDasharray="4 2"
              style={{ pointerEvents: 'none' }}
            />
          )}
        </>
      )}
    </svg>
  )
}
