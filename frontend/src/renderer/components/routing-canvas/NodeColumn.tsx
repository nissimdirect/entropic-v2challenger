/**
 * P6.10 (I2) — Routing Canvas source / destination column.
 *
 * One column of selectable items (sources on the left, destinations on the
 * right). Bright = currently routed; dim = available. A search box scopes the
 * visible items (substring, case-insensitive). Items are the drag affordances
 * for the drag-to-connect gesture:
 *   - a SOURCE item is draggable (it starts a connection),
 *   - a DESTINATION item is a drop target (it completes a connection).
 *
 * Drag affordance pattern (Research Gate, rule 15): we use native HTML5
 * drag-and-drop (draggable + onDragStart/onDrop) rather than xyflow's
 * node-handle connect — the same pattern the existing param-probe drag uses
 * (ParamPanel.PARAM_PROBE_DRAG_TYPE, consumed in InspectorTrack). xyflow owns
 * only the read-only edge VISUALIZATION in the centre column; creation is a
 * column→column DnD so we never make the canvas a second source of truth.
 */

import { useMemo } from 'react'

/** The MIME type carried by a source-item drag. */
export const ROUTING_SOURCE_DRAG_TYPE = 'application/x-creatrix-routing-source'

/** One item in a column. */
export interface ColumnItem {
  /** Stable id (node id for sources, "<effectId>:<paramKey>" for destinations). */
  id: string
  label: string
  /** Optional group heading this item belongs to. */
  group: string
  /** True when this item participates in at least one edge. */
  routed: boolean
  /**
   * For source items only: the kind. Lane sources are read-only (the canvas
   * cannot create lane→param edges — that is a B4-full feature), so they are
   * NOT draggable. Operator sources ARE draggable.
   */
  kind?: 'operator' | 'lane'
  /** For destination items only: the effectId + paramKey to build a mapping. */
  effectId?: string
  paramKey?: string
}

/** Payload serialized into the drag dataTransfer for a source item. */
export interface RoutingSourceDragPayload {
  /** The operator id (the connection's source). */
  operatorId: string
  label: string
}

interface NodeColumnProps {
  side: 'source' | 'destination'
  title: string
  items: ColumnItem[]
  search: string
  onSearchChange: (value: string) => void
  /** Disable all interaction (empty-graph / over-limit states). */
  disabled?: boolean
  /** Destination drop handler — fires with the dropped source payload + dest item. */
  onDropOnDestination?: (source: RoutingSourceDragPayload, dest: ColumnItem) => void
  /**
   * Item-select handler. Clicking a routed item selects its edge for the edge
   * inspector — an accessible alternative to clicking the thin SVG edge line
   * (agent-native parity: keyboard/AT users + agents can select an edge too).
   */
  onSelectItem?: (item: ColumnItem) => void
}

function matches(item: ColumnItem, needle: string): boolean {
  if (!needle) return true
  const n = needle.toLowerCase()
  return (
    item.label.toLowerCase().includes(n) || item.group.toLowerCase().includes(n)
  )
}

export default function NodeColumn({
  side,
  title,
  items,
  search,
  onSearchChange,
  disabled = false,
  onDropOnDestination,
  onSelectItem,
}: NodeColumnProps) {
  // Group filtered items by their group heading, preserving first-seen order.
  const grouped = useMemo(() => {
    const order: string[] = []
    const byGroup = new Map<string, ColumnItem[]>()
    for (const item of items) {
      if (!matches(item, search)) continue
      if (!byGroup.has(item.group)) {
        byGroup.set(item.group, [])
        order.push(item.group)
      }
      byGroup.get(item.group)!.push(item)
    }
    return order.map((g) => ({ group: g, items: byGroup.get(g)! }))
  }, [items, search])

  const isSource = side === 'source'
  const placeholder = isSource
    ? 'filter sources…'
    : 'filter destinations…'

  return (
    <div
      className={`routing-column routing-column--${side}`}
      data-side={side}
      data-routed-count={items.filter((i) => i.routed).length}
    >
      <div className="routing-column__header">{title}</div>
      <div className="routing-column__search">
        <input
          type="text"
          className="routing-column__search-input"
          placeholder={placeholder}
          value={search}
          disabled={disabled}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label={`Filter ${side}s`}
        />
      </div>
      <div className="routing-column__list">
        {grouped.length === 0 && (
          <div className="routing-column__empty">
            {disabled ? 'no routings yet' : 'no matches'}
          </div>
        )}
        {grouped.map(({ group, items: groupItems }) => (
          <div className="routing-column__group" key={group}>
            <div className="routing-column__group-label">{group}</div>
            {groupItems.map((item) => {
              const draggable = isSource && !disabled && item.kind === 'operator'
              const dropProps =
                !isSource && !disabled
                  ? {
                      onDragOver: (e: React.DragEvent) => {
                        if (e.dataTransfer.types.includes(ROUTING_SOURCE_DRAG_TYPE)) {
                          e.preventDefault()
                          e.dataTransfer.dropEffect = 'link'
                        }
                      },
                      onDrop: (e: React.DragEvent) => {
                        const raw = e.dataTransfer.getData(ROUTING_SOURCE_DRAG_TYPE)
                        if (!raw) return
                        e.preventDefault()
                        try {
                          const payload = JSON.parse(raw) as RoutingSourceDragPayload
                          onDropOnDestination?.(payload, item)
                        } catch {
                          /* malformed drag payload — ignore */
                        }
                      },
                    }
                  : {}
              const selectable = !disabled && item.routed && !!onSelectItem
              return (
                <div
                  key={item.id}
                  className={[
                    'routing-item',
                    `routing-item--${side}`,
                    item.routed ? 'routing-item--routed' : 'routing-item--available',
                    draggable ? 'routing-item--draggable' : '',
                    selectable ? 'routing-item--selectable' : '',
                    item.kind === 'lane' ? 'routing-item--lane' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  data-routed={item.routed}
                  data-item-id={item.id}
                  draggable={draggable}
                  onClick={selectable ? () => onSelectItem?.(item) : undefined}
                  onDragStart={
                    draggable
                      ? (e) => {
                          const payload: RoutingSourceDragPayload = {
                            operatorId: item.id.startsWith('op:')
                              ? item.id.slice('op:'.length)
                              : item.id,
                            label: item.label,
                          }
                          e.dataTransfer.setData(
                            ROUTING_SOURCE_DRAG_TYPE,
                            JSON.stringify(payload),
                          )
                          e.dataTransfer.effectAllowed = 'link'
                        }
                      : undefined
                  }
                  {...dropProps}
                >
                  <span className="routing-item__dot" />
                  <span className="routing-item__label">{item.label}</span>
                  {item.routed && <span className="routing-item__badge">●</span>}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
