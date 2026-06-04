import React, { useCallback, useState } from 'react'
import ResizeHandle from './ResizeHandle'

export interface CreatrixLayoutProps {
  /** Browser column (left). */
  left: React.ReactNode
  preview: React.ReactNode
  deviceChain: React.ReactNode
  inspector: React.ReactNode
}

// localStorage keys (PLAN §3.2 — persisted layout dims).
const LS_LEFT_W = 'creatrix.layout.leftW'
const LS_INSPECTOR_H = 'creatrix.layout.inspectorH'
const LS_DEVICE_CHAIN_H = 'creatrix.layout.deviceChainH'

// Defaults.
const DEFAULT_LEFT_W = 260
const DEFAULT_INSPECTOR_H = 150
const DEFAULT_DEVICE_CHAIN_H = 180

// Clamps. left 180–600px, inspector 100px–50vh, device-chain 120–600px.
const LEFT_W_MIN = 180
const LEFT_W_MAX = 600
const INSPECTOR_H_MIN = 100
const DEVICE_CHAIN_H_MIN = 120
const DEVICE_CHAIN_H_MAX = 600

function inspectorHMax(): number {
  // 50vh; guard for non-DOM env.
  const vh = typeof window !== 'undefined' && Number.isFinite(window.innerHeight)
    ? window.innerHeight
    : 800
  return vh * 0.5
}

const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v))

/** Read a persisted numeric dim, falling back to `def`, clamped to [min,max]. Guards NaN. */
function readPersisted(key: string, def: number, min: number, max: number): number {
  let raw: string | null = null
  try {
    raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null
  } catch {
    raw = null
  }
  if (raw === null) return def
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return def
  return clamp(parsed, min, max)
}

function writePersisted(key: string, value: number): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, String(value))
    }
  } catch {
    // Persistence is best-effort; ignore quota/availability errors.
  }
}

/**
 * Creatrix layout SHELL (PLAN §3.2–§3.4).
 *
 * CSS grid with four regions: left (browser), preview, device-chain, inspector.
 * Resizable dims (left column width, inspector height, device-chain height) are held in
 * component state, exposed to the CSS via custom properties on the root, persisted to
 * localStorage (read on mount, written on drag end), and clamped to sane bounds.
 *
 * This component writes NO CSS — only class names and custom-property values. The grid
 * template, the 6px visible / 16px hit-zone handles, and pop-out collapse styling are
 * owned by the CSS another agent writes.
 */
export default function CreatrixLayout({
  left,
  preview,
  deviceChain,
  inspector,
}: CreatrixLayoutProps) {
  // Lazy init from localStorage so the very first render already reflects persisted dims.
  const [leftW, setLeftW] = useState(() =>
    readPersisted(LS_LEFT_W, DEFAULT_LEFT_W, LEFT_W_MIN, LEFT_W_MAX)
  )
  const [inspectorH, setInspectorH] = useState(() =>
    readPersisted(LS_INSPECTOR_H, DEFAULT_INSPECTOR_H, INSPECTOR_H_MIN, inspectorHMax())
  )
  const [deviceChainH, setDeviceChainH] = useState(() =>
    readPersisted(LS_DEVICE_CHAIN_H, DEFAULT_DEVICE_CHAIN_H, DEVICE_CHAIN_H_MIN, DEVICE_CHAIN_H_MAX)
  )

  // Left column: handle on right edge, dragging right grows width.
  const onLeftDelta = useCallback((delta: number) => {
    if (!Number.isFinite(delta)) return
    setLeftW((w) => clamp(w + delta, LEFT_W_MIN, LEFT_W_MAX))
  }, [])

  // Inspector: handle on top edge (inspector sits at bottom of left col), dragging UP grows height.
  const onInspectorDelta = useCallback((delta: number) => {
    if (!Number.isFinite(delta)) return
    setInspectorH((h) => clamp(h - delta, INSPECTOR_H_MIN, inspectorHMax()))
  }, [])

  // Device chain: handle on top edge (chain sits at bottom of right col), dragging UP grows height.
  const onDeviceChainDelta = useCallback((delta: number) => {
    if (!Number.isFinite(delta)) return
    setDeviceChainH((h) => clamp(h - delta, DEVICE_CHAIN_H_MIN, DEVICE_CHAIN_H_MAX))
  }, [])

  // Persist on drag end (avoid thrashing localStorage on every move).
  const persistLeftW = useCallback(() => {
    setLeftW((w) => {
      writePersisted(LS_LEFT_W, w)
      return w
    })
  }, [])
  const persistInspectorH = useCallback(() => {
    setInspectorH((h) => {
      writePersisted(LS_INSPECTOR_H, h)
      return h
    })
  }, [])
  const persistDeviceChainH = useCallback(() => {
    setDeviceChainH((h) => {
      writePersisted(LS_DEVICE_CHAIN_H, h)
      return h
    })
  }, [])

  const rootStyle: React.CSSProperties = {
    ['--left-col-w' as any]: `${leftW}px`,
    ['--inspector-h' as any]: `${inspectorH}px`,
    ['--device-chain-h' as any]: `${deviceChainH}px`,
  }

  return (
    <div className="creatrix-layout" style={rootStyle}>
      <div className="creatrix-layout__left">{left}</div>

      {/* Left-col right edge: resize width. */}
      <ResizeHandle
        orientation="col"
        ariaLabel="Resize browser column width"
        onDelta={onLeftDelta}
        onDragEnd={persistLeftW}
      />

      <div className="creatrix-layout__preview">{preview}</div>

      {/* Device-chain top edge: resize device-chain height. */}
      <ResizeHandle
        orientation="row"
        ariaLabel="Resize device chain height"
        onDelta={onDeviceChainDelta}
        onDragEnd={persistDeviceChainH}
      />

      <div className="creatrix-layout__device-chain">{deviceChain}</div>

      {/* Inspector top edge: resize inspector height. */}
      <ResizeHandle
        orientation="row"
        ariaLabel="Resize inspector height"
        onDelta={onInspectorDelta}
        onDragEnd={persistInspectorH}
      />

      <div className="creatrix-layout__inspector">{inspector}</div>
    </div>
  )
}
