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
import { useUndoStore } from './undo'

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

    useUndoStore.getState().execute({
      forward,
      inverse,
      description: `Add ${newOp.label} operator`,
      timestamp: Date.now(),
    })
  },

  removeOperator: (id) => {
    const oldOps = get().operators
    const index = oldOps.findIndex((o) => o.id === id)
    if (index === -1) return
    const removed = oldOps[index]

    const forward = () => {
      set({ operators: get().operators.filter((o) => o.id !== id) })
    }
    const inverse = () => {
      const ops = [...get().operators]
      ops.splice(index, 0, removed)
      set({ operators: ops })
    }

    useUndoStore.getState().execute({
      forward,
      inverse,
      description: `Remove ${removed.label} operator`,
      timestamp: Date.now(),
    })
  },

  updateOperator: (id, updates) => {
    const ops = get().operators
    const index = ops.findIndex((o) => o.id === id)
    if (index === -1) return
    const oldOp = ops[index]
    const newOp = { ...oldOp, ...updates }

    const forward = () => {
      const current = [...get().operators]
      current[index] = newOp
      set({ operators: current })
    }
    const inverse = () => {
      const current = [...get().operators]
      current[index] = oldOp
      set({ operators: current })
    }

    useUndoStore.getState().execute({
      forward,
      inverse,
      description: `Update ${oldOp.label}`,
      timestamp: Date.now(),
    })
  },

  setOperatorEnabled: (id, enabled) => {
    const ops = get().operators
    const index = ops.findIndex((o) => o.id === id)
    if (index === -1) return
    const oldEnabled = ops[index].isEnabled

    const forward = () => {
      const current = [...get().operators]
      current[index] = { ...current[index], isEnabled: enabled }
      set({ operators: current })
    }
    const inverse = () => {
      const current = [...get().operators]
      current[index] = { ...current[index], isEnabled: oldEnabled }
      set({ operators: current })
    }

    useUndoStore.getState().execute({
      forward,
      inverse,
      description: `${enabled ? 'Enable' : 'Disable'} ${ops[index].label}`,
      timestamp: Date.now(),
    })
  },

  addMapping: (operatorId, mapping) => {
    const ops = get().operators
    const index = ops.findIndex((o) => o.id === operatorId)
    if (index === -1) return
    const oldMappings = [...ops[index].mappings]

    const forward = () => {
      const current = [...get().operators]
      current[index] = {
        ...current[index],
        mappings: [...current[index].mappings, mapping],
      }
      set({ operators: current })
    }
    const inverse = () => {
      const current = [...get().operators]
      current[index] = { ...current[index], mappings: oldMappings }
      set({ operators: current })
    }

    useUndoStore.getState().execute({
      forward,
      inverse,
      description: `Add mapping to ${ops[index].label}`,
      timestamp: Date.now(),
    })
  },

  removeMapping: (operatorId, mappingIndex) => {
    const ops = get().operators
    const opIndex = ops.findIndex((o) => o.id === operatorId)
    if (opIndex === -1) return
    const oldMappings = [...ops[opIndex].mappings]
    if (mappingIndex < 0 || mappingIndex >= oldMappings.length) return

    const forward = () => {
      const current = [...get().operators]
      const newMappings = current[opIndex].mappings.filter((_, i) => i !== mappingIndex)
      current[opIndex] = { ...current[opIndex], mappings: newMappings }
      set({ operators: current })
    }
    const inverse = () => {
      const current = [...get().operators]
      current[opIndex] = { ...current[opIndex], mappings: oldMappings }
      set({ operators: current })
    }

    useUndoStore.getState().execute({
      forward,
      inverse,
      description: `Remove mapping from ${ops[opIndex].label}`,
      timestamp: Date.now(),
    })
  },

  updateMapping: (operatorId, mappingIndex, updates) => {
    const ops = get().operators
    const opIndex = ops.findIndex((o) => o.id === operatorId)
    if (opIndex === -1) return
    const oldMappings = [...ops[opIndex].mappings]
    if (mappingIndex < 0 || mappingIndex >= oldMappings.length) return
    const newMapping = { ...oldMappings[mappingIndex], ...updates }
    const newMappings = [...oldMappings]
    newMappings[mappingIndex] = newMapping

    const forward = () => {
      const current = [...get().operators]
      current[opIndex] = { ...current[opIndex], mappings: newMappings }
      set({ operators: current })
    }
    const inverse = () => {
      const current = [...get().operators]
      current[opIndex] = { ...current[opIndex], mappings: oldMappings }
      set({ operators: current })
    }

    useUndoStore.getState().execute({
      forward,
      inverse,
      description: `Update mapping on ${ops[opIndex].label}`,
      timestamp: Date.now(),
    })
  },

  reorderOperators: (fromIndex, toIndex) => {
    const ops = [...get().operators]
    if (fromIndex < 0 || fromIndex >= ops.length) return
    if (toIndex < 0 || toIndex >= ops.length) return
    if (fromIndex === toIndex) return

    const forward = () => {
      const current = [...get().operators]
      const [moved] = current.splice(fromIndex, 1)
      current.splice(toIndex, 0, moved)
      set({ operators: current })
    }
    const inverse = () => {
      const current = [...get().operators]
      const [moved] = current.splice(toIndex, 1)
      current.splice(fromIndex, 0, moved)
      set({ operators: current })
    }

    useUndoStore.getState().execute({
      forward,
      inverse,
      description: 'Reorder operators',
      timestamp: Date.now(),
    })
  },

  resetOperators: () => {
    set({ operators: [] })
  },

  loadOperators: (operators) => {
    set({ operators: [...operators] })
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
