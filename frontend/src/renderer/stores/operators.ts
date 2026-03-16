/**
 * Operator store — manages LFO, envelope, step sequencer, audio follower operators.
 * Config lives in Zustand, runtime signal evaluation happens in Python backend.
 */
import { create } from 'zustand'
import type {
  Operator,
  OperatorType,
  OperatorMapping,
  SignalProcessingStep,
} from '../../shared/types'
import { useUndoStore, undoable } from './undo'

function createDefaultOperator(type: OperatorType, id: string): Operator {
  const defaults: Record<OperatorType, Record<string, number | string | boolean>> = {
    lfo: { waveform: 'sine', rate_hz: 1.0, phase_offset: 0.0 },
    envelope: { trigger: false, attack: 10, decay: 5, sustain: 0.7, release: 20 },
    step_sequencer: { steps: '0,0.25,0.5,0.75,1,0.75,0.5,0.25', rate_hz: 1.0 },
    audio_follower: { method: 'rms', sensitivity: 1.4, window: 1024 },
    video_analyzer: { method: 'luminance' },
    fusion: { blend_mode: 'weighted_average', sources: '' },
  }

  const labels: Record<OperatorType, string> = {
    lfo: 'LFO',
    envelope: 'Envelope',
    step_sequencer: 'Step Seq',
    audio_follower: 'Audio',
    video_analyzer: 'Video',
    fusion: 'Fusion',
  }

  return {
    id,
    type,
    label: labels[type] ?? type,
    isEnabled: true,
    parameters: { ...defaults[type] },
    processing: [],
    mappings: [],
  }
}

interface OperatorsState {
  operators: Operator[]

  addOperator: (type: OperatorType) => void
  removeOperator: (id: string) => void
  updateOperator: (id: string, updates: Partial<Operator>) => void
  setOperatorEnabled: (id: string, enabled: boolean) => void
  addMapping: (operatorId: string, mapping: OperatorMapping) => void
  removeMapping: (operatorId: string, index: number) => void
  updateMapping: (operatorId: string, index: number, updates: Partial<OperatorMapping>) => void
  reorderOperators: (fromIndex: number, toIndex: number) => void
  resetOperators: () => void
  loadOperators: (operators: Operator[]) => void
  getSerializedOperators: () => Record<string, unknown>[]
}

let nextOpId = 1

export const useOperatorStore = create<OperatorsState>((set, get) => ({
  operators: [],

  addOperator: (type) => {
    const id = `op-${Date.now()}-${nextOpId++}`
    const newOp = createDefaultOperator(type, id)
    const oldOps = [...get().operators]

    const forward = () => {
      set({ operators: [...get().operators, newOp] })
    }
    const inverse = () => {
      set({ operators: get().operators.filter((o) => o.id !== newOp.id) })
    }

    undoable(`Add ${newOp.label} operator`, forward, inverse)
  },

  removeOperator: (id) => {
    const oldOps = get().operators
    const removedIdx = oldOps.findIndex((o) => o.id === id)
    if (removedIdx === -1) return
    const removed = oldOps[removedIdx]
    // Capture neighboring ID for reinsertion position (survives reorder)
    const prevId = removedIdx > 0 ? oldOps[removedIdx - 1].id : null

    // Snapshot operators for undo (includes fusion source references)
    const savedOps = oldOps.map((op) => ({ ...op, mappings: [...op.mappings] }))

    const forward = () => {
      try {
        // Remove the operator and clean fusion source references
        const cleaned = get().operators
          .filter((o) => o.id !== id)
          .map((o) => {
            if (o.type !== 'fusion') return o
            const sources = String(o.parameters.sources ?? '')
            const cleaned = sources
              .split(',')
              .map((s) => s.trim())
              .filter((s) => s && s !== id)
              .join(',')
            return { ...o, parameters: { ...o.parameters, sources: cleaned } }
          })
        set({ operators: cleaned })
      } catch {
        // Fallback: just remove, don't crash
        set({ operators: get().operators.filter((o) => o.id !== id) })
      }
    }
    const inverse = () => {
      // Restore full snapshot (includes fusion sources)
      set({ operators: savedOps })
    }

    undoable(`Remove ${removed.label} operator`, forward, inverse)
  },

  updateOperator: (id, updates) => {
    const ops = get().operators
    const idx = ops.findIndex((o) => o.id === id)
    if (idx === -1) return
    const oldOp = ops[idx]
    const { id: _ignoreId, ...safeUpdates } = updates as Record<string, unknown>
    const newOp = { ...oldOp, ...safeUpdates, id: oldOp.id }

    const forward = () => {
      set({
        operators: get().operators.map((o) => (o.id === id ? newOp : o)),
      })
    }
    const inverse = () => {
      set({
        operators: get().operators.map((o) => (o.id === id ? oldOp : o)),
      })
    }

    undoable(`Update ${oldOp.label}`, forward, inverse)
  },

  setOperatorEnabled: (id, enabled) => {
    const ops = get().operators
    const op = ops.find((o) => o.id === id)
    if (!op) return
    const oldEnabled = op.isEnabled

    const forward = () => {
      set({
        operators: get().operators.map((o) => (o.id === id ? { ...o, isEnabled: enabled } : o)),
      })
    }
    const inverse = () => {
      set({
        operators: get().operators.map((o) => (o.id === id ? { ...o, isEnabled: oldEnabled } : o)),
      })
    }

    undoable(`${enabled ? 'Enable' : 'Disable'} ${op.label}`, forward, inverse)
  },

  addMapping: (operatorId, mapping) => {
    const op = get().operators.find((o) => o.id === operatorId)
    if (!op) return
    const oldMappings = [...op.mappings]

    const forward = () => {
      set({
        operators: get().operators.map((o) =>
          o.id === operatorId ? { ...o, mappings: [...o.mappings, mapping] } : o,
        ),
      })
    }
    const inverse = () => {
      set({
        operators: get().operators.map((o) =>
          o.id === operatorId ? { ...o, mappings: oldMappings } : o,
        ),
      })
    }

    undoable(`Add mapping to ${op.label}`, forward, inverse)
  },

  removeMapping: (operatorId, mappingIndex) => {
    const op = get().operators.find((o) => o.id === operatorId)
    if (!op) return
    const oldMappings = [...op.mappings]
    if (mappingIndex < 0 || mappingIndex >= oldMappings.length) return

    const forward = () => {
      set({
        operators: get().operators.map((o) =>
          o.id === operatorId
            ? { ...o, mappings: o.mappings.filter((_, i) => i !== mappingIndex) }
            : o,
        ),
      })
    }
    const inverse = () => {
      set({
        operators: get().operators.map((o) =>
          o.id === operatorId ? { ...o, mappings: oldMappings } : o,
        ),
      })
    }

    undoable(`Remove mapping from ${op.label}`, forward, inverse)
  },

  updateMapping: (operatorId, mappingIndex, updates) => {
    const op = get().operators.find((o) => o.id === operatorId)
    if (!op) return
    const oldMappings = [...op.mappings]
    if (mappingIndex < 0 || mappingIndex >= oldMappings.length) return
    const newMapping = { ...oldMappings[mappingIndex], ...updates }
    const newMappings = [...oldMappings]
    newMappings[mappingIndex] = newMapping

    const forward = () => {
      set({
        operators: get().operators.map((o) =>
          o.id === operatorId ? { ...o, mappings: newMappings } : o,
        ),
      })
    }
    const inverse = () => {
      set({
        operators: get().operators.map((o) =>
          o.id === operatorId ? { ...o, mappings: oldMappings } : o,
        ),
      })
    }

    undoable(`Update mapping on ${op.label}`, forward, inverse)
  },

  reorderOperators: (fromIndex, toIndex) => {
    const ops = get().operators
    if (fromIndex < 0 || fromIndex >= ops.length) return
    if (toIndex < 0 || toIndex >= ops.length) return
    if (fromIndex === toIndex) return
    // Capture the full order by ID for undo (immune to subsequent reorders)
    const oldOrder = ops.map((o) => o.id)

    const forward = () => {
      const current = [...get().operators]
      const movedId = oldOrder[fromIndex]
      const movedIdx = current.findIndex((o) => o.id === movedId)
      if (movedIdx === -1) return
      const [moved] = current.splice(movedIdx, 1)
      current.splice(Math.min(toIndex, current.length), 0, moved)
      set({ operators: current })
    }
    const inverse = () => {
      // Restore exact original order
      const current = get().operators
      const restored = oldOrder
        .map((id) => current.find((o) => o.id === id))
        .filter((o): o is Operator => o !== undefined)
      set({ operators: restored })
    }

    undoable('Reorder operators', forward, inverse)
  },

  resetOperators: () => {
    set({ operators: [] })
  },

  loadOperators: (operators) => {
    const valid = operators.filter((op): op is Operator => {
      if (typeof op !== 'object' || op === null) return false
      if (typeof op.id !== 'string' || !op.id) return false
      if (typeof op.type !== 'string') return false
      if (typeof op.isEnabled !== 'boolean') return false
      if (typeof op.parameters !== 'object' || op.parameters === null) return false
      if (!Array.isArray(op.processing)) return false
      if (!Array.isArray(op.mappings)) return false
      return true
    })
    set({ operators: valid })
  },

  getSerializedOperators: () => {
    return get().operators.map((op) => ({
      id: op.id,
      type: op.type,
      is_enabled: op.isEnabled,
      parameters: op.parameters,
      processing: op.processing.map((step) => ({
        type: step.type,
        params: step.params,
      })),
      mappings: op.mappings.map((m) => ({
        target_effect_id: m.targetEffectId,
        target_param_key: m.targetParamKey,
        depth: m.depth,
        min: m.min,
        max: m.max,
        curve: m.curve,
        blend_mode: m.blendMode ?? 'add',
      })),
    }))
  },
}))
