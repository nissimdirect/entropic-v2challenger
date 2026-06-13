/**
 * MaskStackPanel — MK.7 editing surface for a clip's mask stack.
 *
 * Renders each MatteNode as a card (surface-3, lowercase mono labels per
 * DESIGN-SPEC §8) with:
 *   - per-node invert toggle
 *   - feather slider  [0, 100] px  — clamped at the UI boundary
 *   - grow/shrink slider  [-50, 50] px  — clamped at the UI boundary
 *   - boolean op selector (add / subtract / intersect)
 *   - node reorder (up / down)
 *   - delete
 *   - enable / disable toggle
 *
 * Mounts beside the device chain (clip-selected surface — minimal; MK.13 polishes).
 * DOES NOT modify global.css grid rows (feedback_test-layout-changes.md).
 */

import React, { useCallback, useId } from 'react'
import type { MatteNode, MatteOp } from '../../../shared/types'
import { useTimelineStore } from '../../stores/timeline'

// ---------------------------------------------------------------------------
// Clamp helpers — enforce trust boundary before emitting store writes
// ---------------------------------------------------------------------------

/** Clamp feather to [0, 100]. */
function clampFeather(v: number): number {
  return Math.max(0, Math.min(100, v))
}

/** Clamp growShrink to [-50, 50]. */
function clampGrowShrink(v: number): number {
  return Math.max(-50, Math.min(50, v))
}

// ---------------------------------------------------------------------------
// NodeCard — one row per MatteNode
// ---------------------------------------------------------------------------

interface NodeCardProps {
  clipId: string
  node: MatteNode
  index: number
  totalCount: number
}

function NodeCard({ clipId, node, index, totalCount }: NodeCardProps): React.ReactElement {
  const updateMatteNode = useTimelineStore((s) => s.updateMatteNode)
  const removeMatteNode = useTimelineStore((s) => s.removeMatteNode)
  const reorderMatteNode = useTimelineStore((s) => s.reorderMatteNode)
  const toggleMatteNode = useTimelineStore((s) => s.toggleMatteNode)

  const handleOpChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateMatteNode(clipId, node.id, { op: e.target.value as MatteOp })
    },
    [clipId, node.id, updateMatteNode],
  )

  const handleFeatherChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const clamped = clampFeather(parseFloat(e.target.value))
      updateMatteNode(clipId, node.id, { feather: clamped })
    },
    [clipId, node.id, updateMatteNode],
  )

  const handleGrowShrinkChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const clamped = clampGrowShrink(parseFloat(e.target.value))
      updateMatteNode(clipId, node.id, { growShrink: clamped })
    },
    [clipId, node.id, updateMatteNode],
  )

  const handleInvertToggle = useCallback(() => {
    updateMatteNode(clipId, node.id, { invert: !node.invert })
  }, [clipId, node.id, node.invert, updateMatteNode])

  const handleEnableToggle = useCallback(() => {
    toggleMatteNode(clipId, node.id)
  }, [clipId, node.id, toggleMatteNode])

  const handleMoveUp = useCallback(() => {
    reorderMatteNode(clipId, node.id, 'up')
  }, [clipId, node.id, reorderMatteNode])

  const handleMoveDown = useCallback(() => {
    reorderMatteNode(clipId, node.id, 'down')
  }, [clipId, node.id, reorderMatteNode])

  const handleDelete = useCallback(() => {
    removeMatteNode(clipId, node.id)
  }, [clipId, node.id, removeMatteNode])

  return (
    <div
      className={`mask-stack-panel__node${!node.enabled ? ' mask-stack-panel__node--disabled' : ''}`}
      data-testid={`mask-node-card-${node.id}`}
    >
      {/* Header row: kind label + enable toggle + reorder + delete */}
      <div className="mask-stack-panel__node-header">
        <span className="mask-stack-panel__kind" data-testid={`mask-node-kind-${node.id}`}>
          {node.kind}
        </span>
        <span className="mask-stack-panel__node-id" data-testid={`mask-node-id-${node.id}`}>
          {node.id}
        </span>
        <div className="mask-stack-panel__node-actions">
          <button
            className={`mask-stack-panel__enable-toggle${node.enabled ? ' mask-stack-panel__enable-toggle--on' : ''}`}
            data-testid={`mask-node-enable-${node.id}`}
            onClick={handleEnableToggle}
            title={node.enabled ? 'Disable node' : 'Enable node'}
          >
            {node.enabled ? 'on' : 'off'}
          </button>
          <button
            className="mask-stack-panel__reorder-btn"
            data-testid={`mask-node-up-${node.id}`}
            onClick={handleMoveUp}
            disabled={index === 0}
            aria-label="Move node up"
            title="Move up"
          >
            ↑
          </button>
          <button
            className="mask-stack-panel__reorder-btn"
            data-testid={`mask-node-down-${node.id}`}
            onClick={handleMoveDown}
            disabled={index === totalCount - 1}
            aria-label="Move node down"
            title="Move down"
          >
            ↓
          </button>
          <button
            className="mask-stack-panel__delete-btn"
            data-testid={`mask-node-delete-${node.id}`}
            onClick={handleDelete}
            aria-label="Delete node"
            title="Delete"
          >
            ×
          </button>
        </div>
      </div>

      {/* Boolean op selector */}
      <div className="mask-stack-panel__param-row">
        <span className="mask-stack-panel__label">op</span>
        <select
          className="mask-stack-panel__op-select"
          data-testid={`mask-node-op-${node.id}`}
          value={node.op}
          onChange={handleOpChange}
        >
          <option value="add">add</option>
          <option value="subtract">subtract</option>
          <option value="intersect">intersect</option>
        </select>
      </div>

      {/* Invert toggle */}
      <div className="mask-stack-panel__param-row">
        <span className="mask-stack-panel__label">invert</span>
        <button
          className={`mask-stack-panel__invert-toggle${node.invert ? ' mask-stack-panel__invert-toggle--on' : ''}`}
          data-testid={`mask-node-invert-${node.id}`}
          onClick={handleInvertToggle}
        >
          {node.invert ? 'on' : 'off'}
        </button>
      </div>

      {/* Feather slider [0, 100] */}
      <div className="mask-stack-panel__param-row">
        <span className="mask-stack-panel__label">feather</span>
        <input
          className="mask-stack-panel__slider"
          type="range"
          data-testid={`mask-node-feather-${node.id}`}
          min={0}
          max={100}
          step={1}
          value={clampFeather(node.feather)}
          onChange={handleFeatherChange}
        />
        <span className="mask-stack-panel__value" data-testid={`mask-node-feather-val-${node.id}`}>
          {clampFeather(node.feather)}px
        </span>
      </div>

      {/* Grow/Shrink slider [-50, 50] */}
      <div className="mask-stack-panel__param-row">
        <span className="mask-stack-panel__label">grow/shrink</span>
        <input
          className="mask-stack-panel__slider"
          type="range"
          data-testid={`mask-node-growshrink-${node.id}`}
          min={-50}
          max={50}
          step={1}
          value={clampGrowShrink(node.growShrink)}
          onChange={handleGrowShrinkChange}
        />
        <span className="mask-stack-panel__value" data-testid={`mask-node-growshrink-val-${node.id}`}>
          {clampGrowShrink(node.growShrink)}px
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// MaskStackPanel — the panel surface
// ---------------------------------------------------------------------------

interface MaskStackPanelProps {
  clipId: string
}

export default function MaskStackPanel({ clipId }: MaskStackPanelProps): React.ReactElement {
  const maskStack = useTimelineStore(
    (s) => {
      for (const track of s.tracks) {
        const clip = track.clips.find((c) => c.id === clipId)
        if (clip) return clip.maskStack ?? []
      }
      return []
    },
  )

  // Cap at 8 nodes per MK.1 MAX_PROCEDURAL_MATTES_PER_RENDER / budget spec
  const visibleStack = maskStack.slice(0, 8)

  return (
    <div
      className="mask-stack-panel"
      data-testid="mask-stack-panel"
    >
      <div className="mask-stack-panel__header">
        <span className="mask-stack-panel__title">mask stack</span>
        <span className="mask-stack-panel__count" data-testid="mask-stack-count">
          {visibleStack.length}
        </span>
      </div>

      {visibleStack.length === 0 ? (
        <div className="mask-stack-panel__empty" data-testid="mask-stack-empty">
          no matte nodes
        </div>
      ) : (
        <div className="mask-stack-panel__nodes" data-testid="mask-stack-nodes">
          {visibleStack.map((node, idx) => (
            <NodeCard
              key={node.id}
              clipId={clipId}
              node={node}
              index={idx}
              totalCount={visibleStack.length}
            />
          ))}
        </div>
      )}
    </div>
  )
}
