import { create } from 'zustand'

export interface ExportJob {
  id: string
  settings: Record<string, unknown>
  inputPath: string
  status: 'queued' | 'rendering' | 'complete' | 'failed' | 'cancelled'
  progress: number
  currentFrame: number
  totalFrames: number
  etaSeconds: number | null
  outputPath: string
  error: string | null
  addedAt: number
}

interface ExportState {
  jobs: ExportJob[]
  currentJobIndex: number | null
  isProcessing: boolean

  addJob: (job: Omit<ExportJob, 'id' | 'status' | 'progress' | 'currentFrame' | 'totalFrames' | 'etaSeconds' | 'error' | 'addedAt'>) => string
  removeJob: (id: string) => void
  updateJobStatus: (id: string, updates: Partial<ExportJob>) => void
  startQueue: () => void
  stopQueue: () => void
  cancelCurrent: () => void
  clearCompleted: () => void
}

export const useExportStore = create<ExportState>((set, get) => ({
  jobs: [],
  currentJobIndex: null,
  isProcessing: false,

  addJob: (job) => {
    const id = crypto.randomUUID()
    const newJob: ExportJob = {
      ...job,
      id,
      status: 'queued',
      progress: 0,
      currentFrame: 0,
      totalFrames: 0,
      etaSeconds: null,
      error: null,
      addedAt: Date.now(),
    }
    set((state) => ({ jobs: [...state.jobs, newJob] }))
    return id
  },

  removeJob: (id) => {
    const { jobs, currentJobIndex } = get()
    // Cannot remove the currently rendering job
    if (currentJobIndex !== null && jobs[currentJobIndex]?.id === id) return
    set({ jobs: jobs.filter((j) => j.id !== id) })
  },

  updateJobStatus: (id, updates) => {
    set((state) => ({
      jobs: state.jobs.map((j) => (j.id === id ? { ...j, ...updates } : j)),
    }))
  },

  startQueue: () => {
    const { jobs } = get()
    const firstQueued = jobs.findIndex((j) => j.status === 'queued')
    if (firstQueued === -1) return
    set({ isProcessing: true, currentJobIndex: firstQueued })
  },

  stopQueue: () => {
    set({ isProcessing: false, currentJobIndex: null })
  },

  cancelCurrent: () => {
    const { jobs, currentJobIndex } = get()
    if (currentJobIndex === null) return

    const updated = jobs.map((j, i) =>
      i === currentJobIndex ? { ...j, status: 'cancelled' as const } : j,
    )

    // Find the next queued job after the cancelled one
    const nextQueued = updated.findIndex(
      (j, i) => i > currentJobIndex && j.status === 'queued',
    )

    if (nextQueued === -1) {
      set({ jobs: updated, isProcessing: false, currentJobIndex: null })
    } else {
      set({ jobs: updated, currentJobIndex: nextQueued })
    }
  },

  clearCompleted: () => {
    const terminal = new Set<ExportJob['status']>(['complete', 'failed', 'cancelled'])
    set((state) => ({
      jobs: state.jobs.filter((j) => !terminal.has(j.status)),
    }))
  },
}))
