/**
 * P4.0 xyflow-gate perf harness - THROWAWAY SPIKE
 *
 * Two selectable implementations of the same 32-path animated scene:
 *   1. xyflow impl   - @xyflow/react canvas, 16 nodes / 32 edges, each edge is
 *                      a custom SVG <path> rendered via BaseEdge. rAF animates
 *                      container transform only. Path d strings NEVER recomputed.
 *   2. bare-SVG ctrl - identical paths in plain <svg>, same rAF transform.
 *
 * 64-path stress-variant toggle on both impls (informational headroom).
 *
 * API source: https://reactflow.dev/learn/customization/custom-edges
 * @xyflow/react v12.11.0:
 *   - ReactFlow component props: nodes, edges, edgeTypes, fitView, proOptions
 *   - EdgeProps: { id, sourceX, sourceY, targetX, targetY }
 *   - getStraightPath({ sourceX, sourceY, targetX, targetY }) -> [edgePath]
 *   - BaseEdge: renders SVG path element, accepts id, path, style
 *   - ReactFlowProvider: required context wrapper
 *
 * Measurement methodology:
 *   - Drive animation via requestAnimationFrame
 *   - Measure delta = performance.now() between successive rAF callbacks
 *   - Warm-up: discard first 120 frames (~2s at 60fps)
 *   - Record: 600 frames (~10s at 60fps)
 *   - p50 = sorted[floor(0.50 * n)], p95 = sorted[floor(0.95 * n)]
 *   - Dropped = frames where delta > 17ms (>1 missed vsync at 60fps)
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';

// @xyflow/react v12.11.0
// API ref: https://reactflow.dev/learn/customization/custom-edges
import {
  ReactFlow,
  Background,
  ReactFlowProvider,
  getStraightPath,
  BaseEdge,
} from '@xyflow/react';
import type { Node, Edge, EdgeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// ─── Scene geometry ───────────────────────────────────────────────────────────

const COLS = 4;
const ROWS = 4;
const NODE_W = 80;
const NODE_H = 40;
const H_GAP = 120;
const V_GAP = 80;

function buildNodes(): Node[] {
  const nodes: Node[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      nodes.push({
        id: `n-${r}-${c}`,
        position: { x: c * (NODE_W + H_GAP), y: r * (NODE_H + V_GAP) },
        data: { label: `${r},${c}` },
        style: { width: NODE_W, height: NODE_H, fontSize: 9 },
      });
    }
  }
  return nodes;
}

function buildEdges(count: 32 | 64): Edge[] {
  const edges: Edge[] = [];
  // horizontal: 4 rows × 3 gaps = 12
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS - 1; c++)
      edges.push({ id: `eh-${r}-${c}`, source: `n-${r}-${c}`, target: `n-${r}-${c + 1}`, type: 'animPath' });
  // vertical: 3 rows × 4 cols = 12
  for (let r = 0; r < ROWS - 1; r++)
    for (let c = 0; c < COLS; c++)
      edges.push({ id: `ev-${r}-${c}`, source: `n-${r}-${c}`, target: `n-${r + 1}-${c}`, type: 'animPath' });
  // diagonals top-left→bottom-right: 3×3 = 9 (total 33)
  for (let r = 0; r < ROWS - 1; r++)
    for (let c = 0; c < COLS - 1; c++)
      edges.push({ id: `ed-${r}-${c}`, source: `n-${r}-${c}`, target: `n-${r + 1}-${c + 1}`, type: 'animPath' });
  if (count === 64) {
    // anti-diagonals: 3×3 = 9 (total 42)
    for (let r = 0; r < ROWS - 1; r++)
      for (let c = 1; c < COLS; c++)
        edges.push({ id: `ead-${r}-${c}`, source: `n-${r}-${c}`, target: `n-${r + 1}-${c - 1}`, type: 'animPath' });
    // fill to 64 with long-span edges
    let i = 0;
    while (edges.length < 64) {
      edges.push({ id: `ex-${i}`, source: `n-${i % ROWS}-0`, target: `n-${(i + 1) % ROWS}-${COLS - 1}`, type: 'animPath' });
      i++;
    }
  }
  return edges.slice(0, count);
}

// ─── Custom xyflow edge ───────────────────────────────────────────────────────
// Pattern from: https://reactflow.dev/learn/customization/custom-edges
// EdgeProps receives { id, sourceX, sourceY, targetX, targetY }
// getStraightPath computes SVG path string; BaseEdge renders the <path> element.

function AnimPathEdge({ id, sourceX, sourceY, targetX, targetY }: EdgeProps) {
  const [edgePath] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  return <BaseEdge id={id} path={edgePath} style={{ stroke: '#4ade80', strokeWidth: 1.5 }} />;
}

const edgeTypes = { animPath: AnimPathEdge };

// ─── Measurement ─────────────────────────────────────────────────────────────

const WARMUP_FRAMES = 120;   // ~2s at 60fps — discard
const MEASURE_FRAMES = 600;  // ~10s at 60fps — record

interface PerfResult {
  impl: string;
  variant: '32' | '64';
  p50: number;
  p95: number;
  max: number;
  droppedFrames: number; // rAF callback delta > 17ms
  sampleCount: number;
}

/**
 * Percentile: sort ascending, index = floor(p * n), clamped to [0, n-1].
 * p50 = sorted[floor(0.50 * n)], p95 = sorted[floor(0.95 * n)].
 */
function pct(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(Math.floor(p * sorted.length), sorted.length - 1)];
}

function usePerfMeasurer(implName: string, variant: '32' | '64') {
  const [result, setResult] = useState<PerfResult | null>(null);
  const [running, setRunning] = useState(false);
  const rafRef = useRef<number>(0);
  const st = useRef({
    frameCount: 0,
    prevTs: null as number | null,
    samples: [] as number[],
  });

  const start = useCallback(() => {
    setResult(null);
    setRunning(true);
    Object.assign(st.current, { frameCount: 0, prevTs: null, samples: [] });

    function tick(ts: number) {
      const { prevTs, frameCount, samples } = st.current;
      if (prevTs !== null) {
        const delta = ts - prevTs;
        if (frameCount >= WARMUP_FRAMES) samples.push(delta);
        st.current.frameCount = frameCount + 1;
        if (frameCount + 1 >= WARMUP_FRAMES + MEASURE_FRAMES) {
          const sorted = [...samples].sort((a, b) => a - b);
          const res: PerfResult = {
            impl: implName,
            variant,
            p50: +pct(sorted, 0.50).toFixed(2),
            p95: +pct(sorted, 0.95).toFixed(2),
            max: +(sorted[sorted.length - 1] ?? 0).toFixed(2),
            droppedFrames: sorted.filter(d => d > 17).length,
            sampleCount: sorted.length,
          };
          setResult(res);
          setRunning(false);
          console.log('[P4.0 perf result]', JSON.stringify(res, null, 2));
          return;
        }
      }
      st.current.prevTs = ts;
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
  }, [implName, variant]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);
  return { result, running, start };
}

// ─── xyflow scene ─────────────────────────────────────────────────────────────

function XyflowScene({ variant }: { variant: '32' | '64' }) {
  const nodes = useMemo(buildNodes, []);
  const edges = useMemo(() => buildEdges(variant === '32' ? 32 : 64), [variant]);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const t0 = useRef(performance.now());

  // Animate container transform ONLY — path d strings NEVER recomputed per frame
  useEffect(() => {
    const animate = () => {
      const e = (performance.now() - t0.current) / 1000;
      if (containerRef.current)
        containerRef.current.style.transform =
          `translate(${Math.sin(e * 0.3) * 4}px, ${Math.cos(e * 0.2) * 3}px)`;
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          edgeTypes={edgeTypes}
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          preventScrolling={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}

// ─── Bare-SVG scene ───────────────────────────────────────────────────────────

function BareSvgScene({ variant }: { variant: '32' | '64' }) {
  const pathCount = variant === '32' ? 32 : 64;
  const groupRef = useRef<SVGGElement>(null);
  const rafRef = useRef<number>(0);
  const t0 = useRef(performance.now());

  // Pre-compute static path strings ONCE — NEVER recomputed during animation
  const paths = useMemo(() => {
    const W = 600;
    const H = 400;
    return Array.from({ length: pathCount }, (_, i) => ({
      d: `M ${(i * 37 + 10) % (W - 20)} ${(i * 53 + 10) % (H - 20)} ` +
         `L ${((i + 7) * 41 + 30) % (W - 20)} ${((i + 3) * 59 + 30) % (H - 20)}`,
      key: `p${i}`,
    }));
  }, [pathCount]);

  useEffect(() => {
    const animate = () => {
      const e = (performance.now() - t0.current) / 1000;
      groupRef.current?.setAttribute(
        'transform',
        `translate(${Math.sin(e * 0.3) * 4},${Math.cos(e * 0.2) * 3})`
      );
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <svg width="100%" height="100%" viewBox="0 0 600 400" style={{ display: 'block' }}>
      <g ref={groupRef}>
        {paths.map(({ d, key }) => (
          <path key={key} d={d} stroke="#4ade80" strokeWidth="1.5" fill="none" />
        ))}
      </g>
    </svg>
  );
}

// ─── Result table ─────────────────────────────────────────────────────────────

const TH: React.CSSProperties = {
  border: '1px solid #444', padding: '4px 8px', textAlign: 'left',
  fontSize: 12, background: '#2a2a2a',
};
const TD: React.CSSProperties = { border: '1px solid #333', padding: '4px 8px', fontSize: 12 };

function ResultTable({ r }: { r: PerfResult }) {
  const p50ok = r.p50 < 5.0;
  const p95ok = r.p95 < 8.0;
  const dropok = r.droppedFrames <= 6;
  const verdict = p50ok && p95ok && dropok ? 'PASS' : 'FAIL';
  const fails = [!p50ok && 'p50', !p95ok && 'p95', !dropok && 'dropped']
    .filter(Boolean).join(', ');

  return (
    <div style={{ marginTop: 12, fontFamily: 'monospace' }}>
      <div style={{ fontWeight: 'bold', marginBottom: 6, fontSize: 13 }}>
        Result — {r.impl} / {r.sampleCount} samples
      </div>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={TH}>Metric</th>
            <th style={TH}>Value</th>
            <th style={TH}>PASS threshold</th>
            <th style={TH}>Status</th>
          </tr>
        </thead>
        <tbody>
          {([
            { label: 'p50 frame time', val: `${r.p50} ms`, thresh: '< 5.0 ms', ok: p50ok as boolean | null },
            { label: 'p95 frame time', val: `${r.p95} ms`, thresh: '< 8.0 ms', ok: p95ok as boolean | null },
            { label: `Dropped / ${r.sampleCount}`, val: String(r.droppedFrames), thresh: '<= 6 (1%)', ok: dropok as boolean | null },
            { label: 'max frame time (info)', val: `${r.max} ms`, thresh: '—', ok: null as boolean | null },
          ] as const).map(({ label, val, thresh, ok }) => (
            <tr key={label}>
              <td style={TD}>{label}</td>
              <td style={TD}>{val}</td>
              <td style={TD}>{thresh}</td>
              <td style={{
                ...TD,
                color: ok === null ? '#888' : ok ? '#4ade80' : '#ef4444',
                fontWeight: 'bold',
              }}>
                {ok === null ? '—' : ok ? 'PASS' : 'FAIL'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{
        marginTop: 8, padding: '6px 12px', fontWeight: 'bold', fontSize: 15,
        background: verdict === 'PASS' ? '#14532d' : '#7f1d1d',
        color: verdict === 'PASS' ? '#4ade80' : '#ef4444',
        borderRadius: 4, display: 'inline-block',
      }}>
        GATE VERDICT: {verdict}
        {verdict === 'FAIL' ? ` (failing: ${fails})` : ' — all 3 criteria passed'}
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

type Impl = 'xyflow' | 'bare-svg';
type Variant = '32' | '64';

function App() {
  const [impl, setImpl] = useState<Impl>('xyflow');
  const [variant, setVariant] = useState<Variant>('32');
  const { result, running, start } = usePerfMeasurer(`${impl}/${variant}-path`, variant);

  const btnStyle = (active: boolean, disabled: boolean): React.CSSProperties => ({
    padding: '4px 10px',
    border: '1px solid #444',
    borderRadius: 4,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
    fontSize: 12,
    marginRight: 6,
    background: active ? '#4ade80' : '#2a2a2a',
    color: active ? '#000' : '#e0e0e0',
  });

  return (
    <div style={{
      background: '#1a1a1a', color: '#e0e0e0', minHeight: '100vh',
      fontFamily: 'JetBrains Mono, monospace', padding: 16, boxSizing: 'border-box',
    }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 16, color: '#4ade80' }}>
        P4.0 xyflow-gate perf harness
      </h2>
      <p style={{ margin: '0 0 12px', fontSize: 11, color: '#888' }}>
        Warm-up {WARMUP_FRAMES} frames (discarded), then record {MEASURE_FRAMES} frames.
        p50/p95 = sorted rAF deltas at index floor(pct*n). Dropped = delta &gt; 17ms.
      </p>

      <div style={{ display: 'flex', gap: 16, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <span style={{ fontSize: 12, marginRight: 6 }}>Impl:</span>
          {(['xyflow', 'bare-svg'] as Impl[]).map(v => (
            <button key={v} onClick={() => setImpl(v)} disabled={running} style={btnStyle(impl === v, running)}>
              {v}
            </button>
          ))}
        </div>
        <div>
          <span style={{ fontSize: 12, marginRight: 6 }}>Variant:</span>
          {(['32', '64'] as Variant[]).map(v => (
            <button key={v} onClick={() => setVariant(v as Variant)} disabled={running} style={btnStyle(variant === v, running)}>
              {v}-path
            </button>
          ))}
        </div>
        <button
          onClick={start}
          disabled={running}
          style={{
            padding: '5px 16px',
            background: running ? '#555' : '#22c55e',
            color: '#000',
            border: 'none',
            borderRadius: 4,
            cursor: running ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            fontWeight: 'bold',
            fontSize: 13,
          }}
        >
          {running ? 'Measuring...' : 'Start measurement'}
        </button>
      </div>

      <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>
        Active: <strong style={{ color: '#e0e0e0' }}>{impl}</strong>
        {' / '}
        <strong style={{ color: '#e0e0e0' }}>{variant}-path</strong>
        {running && (
          <span style={{ color: '#facc15', marginLeft: 12 }}>
            Running — discarding first {WARMUP_FRAMES} frames then recording {MEASURE_FRAMES}...
          </span>
        )}
      </div>

      <div style={{
        width: '100%', height: 380, border: '1px solid #333', borderRadius: 4,
        overflow: 'hidden', background: '#111', marginBottom: 12,
      }}>
        {impl === 'xyflow'
          ? <XyflowScene key={`xy-${variant}`} variant={variant} />
          : <BareSvgScene key={`svg-${variant}`} variant={variant} />}
      </div>

      {result && <ResultTable r={result} />}

      <div style={{ marginTop: 16, fontSize: 10, color: '#555' }}>
        JSON also logged via <code>[P4.0 perf result]</code> in DevTools console.
        Run each impl x variant 3x. Enter worst-run numbers into docs/perf/p4-xyflow-gate-result.md.
      </div>
    </div>
  );
}

// ─── Mount ────────────────────────────────────────────────────────────────────

const root = document.getElementById('root');
if (!root) throw new Error('#root element not found');
ReactDOM.createRoot(root).render(<App />);
