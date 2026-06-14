/**
 * P6.10 (I2) — Routing Canvas overlay barrel.
 */
export { default as RoutingCanvas } from './RoutingCanvas'
export { default as NodeColumn, ROUTING_SOURCE_DRAG_TYPE } from './NodeColumn'
export { default as EdgeInspector } from './EdgeInspector'
export type { ColumnItem, RoutingSourceDragPayload } from './NodeColumn'
export {
  CANVAS_MAX_EDGES,
  buildRoutingGraphPayload,
  enumerateDestinations,
  fetchRoutingGraph,
  validateEdgeUpdate,
} from './routing-graph-ipc'
export type {
  RoutingGraph,
  RoutingNode,
  RoutingEdge,
  RoutingNodeKind,
  DestinationParam,
} from './routing-graph-ipc'
