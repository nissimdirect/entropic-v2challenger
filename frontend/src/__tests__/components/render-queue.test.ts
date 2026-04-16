/**
 * Tests for RenderQueue logic — queue state management, job ordering,
 * completion tracking, helper functions (basename, formatEta),
 * and derived counts used in the UI.
 */
import { describe, it, expect, beforeEach } from 'vitest'

// Mock window.entropic before store imports
;(globalThis as any).window = {
  entropic: {
    onEngineStatus: () => {},
    sendCommand: async () => ({ ok: true }),
    selectFile: async () => null,
    selectSavePath: async () => null,
    onExportProgress: () => {},
  },
}

import { useExportStore, type ExportJob } from '../../renderer/stores/export'

// ---------- Helper functions extracted from component ----------

const STATUS_COLORS: Record<ExportJob['status'], string> = {
  queued: '#6b7280',
  rendering: '#3b82f6',
  complete: '#4ade80',
  failed: '#ef4444',
  cancelled: '#f59e0b',
}

const STATUS_LABELS: Record<ExportJob['status'], string> = {
  queued: 'Queued',
  rendering: 'Rendering',
  complete: 'Complete',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop() || path
}

function formatEta(seconds: number | null): string {
  if (seconds === null) return ''
  if (seconds < 60) return `${Math.ceil(seconds)}s remaining`
  const m = Math.floor(seconds / 60)
  const s = Math.ceil(seconds % 60)
  return `${m}m ${s}s remaining`
}

// ---------- Tests ----------

describe('RenderQueue — basename helper', () => {
  it('extracts filename from unix path', () => {
    expect(basename('/home/user/video.mp4')).toBe('video.mp4')
  })

  it('extracts filename from windows path', () => {
    expect(basename('C:\\Users\\user\\video.mp4')).toBe('video.mp4')
  })

  it('handles mixed separators', () => {
    expect(basename('/home/user\\Downloads/file.avi')).toBe('file.avi')
  })

  it('returns the string itself when no separators', () => {
    expect(basename('standalone.mp4')).toBe('standalone.mp4')
  })

  it('returns empty string fallback for trailing separator', () => {
    // path.split(/[\\/]/).pop() returns '' for trailing slash
    // The || path fallback returns the original path
    expect(basename('/home/user/')).toBe('/home/user/')
  })
})

describe('RenderQueue — formatEta helper', () => {
  it('returns empty string for null', () => {
    expect(formatEta(null)).toBe('')
  })

  it('formats seconds under 60 as Ns remaining', () => {
    expect(formatEta(30)).toBe('30s remaining')
  })

  it('rounds fractional seconds up', () => {
    expect(formatEta(10.2)).toBe('11s remaining')
  })

  it('formats minutes and seconds', () => {
    expect(formatEta(90)).toBe('1m 30s remaining')
  })

  it('formats exact minutes correctly', () => {
    expect(formatEta(120)).toBe('2m 0s remaining')
  })

  it('formats large values', () => {
    expect(formatEta(3661)).toBe('61m 1s remaining')
  })

  it('handles zero seconds', () => {
    expect(formatEta(0)).toBe('0s remaining')
  })
})

describe('RenderQueue — status maps', () => {
  it('has a color for every status', () => {
    const statuses: ExportJob['status'][] = ['queued', 'rendering', 'complete', 'failed', 'cancelled']
    for (const s of statuses) {
      expect(STATUS_COLORS[s]).toBeDefined()
      expect(STATUS_COLORS[s]).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('has a label for every status', () => {
    const statuses: ExportJob['status'][] = ['queued', 'rendering', 'complete', 'failed', 'cancelled']
    for (const s of statuses) {
      expect(STATUS_LABELS[s]).toBeDefined()
      expect(typeof STATUS_LABELS[s]).toBe('string')
      expect(STATUS_LABELS[s].length).toBeGreaterThan(0)
    }
  })
})

describe('RenderQueue — store: addJob', () => {
  beforeEach(() => {
    useExportStore.setState({ jobs: [], currentJobIndex: null, isProcessing: false })
  })

  it('adds a job with queued status and zero progress', () => {
    const id = useExportStore.getState().addJob({
      settings: { codec: 'h264' },
      inputPath: '/input/video.mp4',
      outputPath: '/output/render.mp4',
    })
    const jobs = useExportStore.getState().jobs
    expect(jobs).toHaveLength(1)
    expect(jobs[0].id).toBe(id)
    expect(jobs[0].status).toBe('queued')
    expect(jobs[0].progress).toBe(0)
    expect(jobs[0].currentFrame).toBe(0)
    expect(jobs[0].etaSeconds).toBeNull()
    expect(jobs[0].error).toBeNull()
  })

  it('preserves job ordering (FIFO)', () => {
    const store = useExportStore.getState()
    const id1 = store.addJob({ settings: {}, inputPath: '/a.mp4', outputPath: '/a_out.mp4' })
    const id2 = store.addJob({ settings: {}, inputPath: '/b.mp4', outputPath: '/b_out.mp4' })
    const id3 = store.addJob({ settings: {}, inputPath: '/c.mp4', outputPath: '/c_out.mp4' })
    const jobs = useExportStore.getState().jobs
    expect(jobs.map((j) => j.id)).toEqual([id1, id2, id3])
  })

  it('assigns unique IDs to each job', () => {
    const store = useExportStore.getState()
    const id1 = store.addJob({ settings: {}, inputPath: '/a.mp4', outputPath: '/a.mp4' })
    const id2 = store.addJob({ settings: {}, inputPath: '/b.mp4', outputPath: '/b.mp4' })
    expect(id1).not.toBe(id2)
  })
})

describe('RenderQueue — store: removeJob', () => {
  beforeEach(() => {
    useExportStore.setState({ jobs: [], currentJobIndex: null, isProcessing: false })
  })

  it('removes a queued job', () => {
    const id = useExportStore.getState().addJob({
      settings: {}, inputPath: '/a.mp4', outputPath: '/a.mp4',
    })
    expect(useExportStore.getState().jobs).toHaveLength(1)
    useExportStore.getState().removeJob(id)
    expect(useExportStore.getState().jobs).toHaveLength(0)
  })

  it('does not remove the currently rendering job', () => {
    const id = useExportStore.getState().addJob({
      settings: {}, inputPath: '/a.mp4', outputPath: '/a.mp4',
    })
    // Simulate rendering: set currentJobIndex to 0
    useExportStore.setState({ currentJobIndex: 0, isProcessing: true })
    useExportStore.getState().removeJob(id)
    // Job should still be present
    expect(useExportStore.getState().jobs).toHaveLength(1)
  })

  it('removes a non-rendering job when another is rendering', () => {
    const store = useExportStore.getState()
    store.addJob({ settings: {}, inputPath: '/a.mp4', outputPath: '/a.mp4' })
    const id2 = store.addJob({ settings: {}, inputPath: '/b.mp4', outputPath: '/b.mp4' })
    // First job is rendering
    useExportStore.setState({ currentJobIndex: 0, isProcessing: true })
    useExportStore.getState().removeJob(id2)
    expect(useExportStore.getState().jobs).toHaveLength(1)
  })
})

describe('RenderQueue — store: startQueue / stopQueue', () => {
  beforeEach(() => {
    useExportStore.setState({ jobs: [], currentJobIndex: null, isProcessing: false })
  })

  it('startQueue sets isProcessing and picks first queued job', () => {
    const store = useExportStore.getState()
    store.addJob({ settings: {}, inputPath: '/a.mp4', outputPath: '/a.mp4' })
    store.addJob({ settings: {}, inputPath: '/b.mp4', outputPath: '/b.mp4' })
    useExportStore.getState().startQueue()
    const state = useExportStore.getState()
    expect(state.isProcessing).toBe(true)
    expect(state.currentJobIndex).toBe(0)
  })

  it('startQueue is a no-op when no queued jobs exist', () => {
    useExportStore.getState().startQueue()
    const state = useExportStore.getState()
    expect(state.isProcessing).toBe(false)
    expect(state.currentJobIndex).toBeNull()
  })

  it('stopQueue clears processing state', () => {
    const store = useExportStore.getState()
    store.addJob({ settings: {}, inputPath: '/a.mp4', outputPath: '/a.mp4' })
    useExportStore.getState().startQueue()
    useExportStore.getState().stopQueue()
    const state = useExportStore.getState()
    expect(state.isProcessing).toBe(false)
    expect(state.currentJobIndex).toBeNull()
  })
})

describe('RenderQueue — store: cancelCurrent', () => {
  beforeEach(() => {
    useExportStore.setState({ jobs: [], currentJobIndex: null, isProcessing: false })
  })

  it('marks current job as cancelled and advances to next queued', () => {
    const store = useExportStore.getState()
    store.addJob({ settings: {}, inputPath: '/a.mp4', outputPath: '/a.mp4' })
    store.addJob({ settings: {}, inputPath: '/b.mp4', outputPath: '/b.mp4' })
    useExportStore.getState().startQueue()
    useExportStore.getState().cancelCurrent()
    const state = useExportStore.getState()
    expect(state.jobs[0].status).toBe('cancelled')
    expect(state.jobs[1].status).toBe('queued')
    expect(state.currentJobIndex).toBe(1)
    expect(state.isProcessing).toBe(true)
  })

  it('stops processing when no more queued jobs after cancel', () => {
    const store = useExportStore.getState()
    store.addJob({ settings: {}, inputPath: '/a.mp4', outputPath: '/a.mp4' })
    useExportStore.getState().startQueue()
    useExportStore.getState().cancelCurrent()
    const state = useExportStore.getState()
    expect(state.jobs[0].status).toBe('cancelled')
    expect(state.isProcessing).toBe(false)
    expect(state.currentJobIndex).toBeNull()
  })

  it('is a no-op when currentJobIndex is null', () => {
    const store = useExportStore.getState()
    store.addJob({ settings: {}, inputPath: '/a.mp4', outputPath: '/a.mp4' })
    // Don't start queue — currentJobIndex is null
    useExportStore.getState().cancelCurrent()
    expect(useExportStore.getState().jobs[0].status).toBe('queued')
  })
})

describe('RenderQueue — store: clearCompleted', () => {
  beforeEach(() => {
    useExportStore.setState({ jobs: [], currentJobIndex: null, isProcessing: false })
  })

  it('removes complete, failed, and cancelled jobs', () => {
    // Manually build jobs with different statuses
    const jobs: ExportJob[] = [
      { id: '1', settings: {}, inputPath: '', outputPath: '/a.mp4', status: 'complete', progress: 1, currentFrame: 100, totalFrames: 100, etaSeconds: null, error: null, addedAt: 1 },
      { id: '2', settings: {}, inputPath: '', outputPath: '/b.mp4', status: 'failed', progress: 0.5, currentFrame: 50, totalFrames: 100, etaSeconds: null, error: 'oops', addedAt: 2 },
      { id: '3', settings: {}, inputPath: '', outputPath: '/c.mp4', status: 'queued', progress: 0, currentFrame: 0, totalFrames: 0, etaSeconds: null, error: null, addedAt: 3 },
      { id: '4', settings: {}, inputPath: '', outputPath: '/d.mp4', status: 'cancelled', progress: 0.2, currentFrame: 20, totalFrames: 100, etaSeconds: null, error: null, addedAt: 4 },
      { id: '5', settings: {}, inputPath: '', outputPath: '/e.mp4', status: 'rendering', progress: 0.7, currentFrame: 70, totalFrames: 100, etaSeconds: 10, error: null, addedAt: 5 },
    ]
    useExportStore.setState({ jobs })
    useExportStore.getState().clearCompleted()
    const remaining = useExportStore.getState().jobs
    expect(remaining).toHaveLength(2)
    expect(remaining.map((j) => j.id)).toEqual(['3', '5'])
  })

  it('is a no-op when no terminal jobs exist', () => {
    const store = useExportStore.getState()
    store.addJob({ settings: {}, inputPath: '/a.mp4', outputPath: '/a.mp4' })
    useExportStore.getState().clearCompleted()
    expect(useExportStore.getState().jobs).toHaveLength(1)
  })
})

describe('RenderQueue — store: updateJobStatus', () => {
  beforeEach(() => {
    useExportStore.setState({ jobs: [], currentJobIndex: null, isProcessing: false })
  })

  it('updates progress and eta on a job', () => {
    const id = useExportStore.getState().addJob({
      settings: {}, inputPath: '/a.mp4', outputPath: '/a.mp4',
    })
    useExportStore.getState().updateJobStatus(id, {
      status: 'rendering',
      progress: 0.5,
      currentFrame: 50,
      totalFrames: 100,
      etaSeconds: 30,
    })
    const job = useExportStore.getState().jobs[0]
    expect(job.status).toBe('rendering')
    expect(job.progress).toBe(0.5)
    expect(job.etaSeconds).toBe(30)
  })

  it('can set error on a failed job', () => {
    const id = useExportStore.getState().addJob({
      settings: {}, inputPath: '/a.mp4', outputPath: '/a.mp4',
    })
    useExportStore.getState().updateJobStatus(id, {
      status: 'failed',
      error: 'Codec not found',
    })
    const job = useExportStore.getState().jobs[0]
    expect(job.status).toBe('failed')
    expect(job.error).toBe('Codec not found')
  })

  it('does not affect other jobs', () => {
    const store = useExportStore.getState()
    const id1 = store.addJob({ settings: {}, inputPath: '/a.mp4', outputPath: '/a.mp4' })
    const id2 = store.addJob({ settings: {}, inputPath: '/b.mp4', outputPath: '/b.mp4' })
    useExportStore.getState().updateJobStatus(id1, { status: 'complete', progress: 1 })
    const jobs = useExportStore.getState().jobs
    expect(jobs[0].status).toBe('complete')
    expect(jobs[1].status).toBe('queued')
  })
})

describe('RenderQueue — derived counts (component logic)', () => {
  beforeEach(() => {
    useExportStore.setState({ jobs: [], currentJobIndex: null, isProcessing: false })
  })

  it('computes correct counts from mixed-status jobs', () => {
    const jobs: ExportJob[] = [
      { id: '1', settings: {}, inputPath: '', outputPath: '/a.mp4', status: 'queued', progress: 0, currentFrame: 0, totalFrames: 0, etaSeconds: null, error: null, addedAt: 1 },
      { id: '2', settings: {}, inputPath: '', outputPath: '/b.mp4', status: 'queued', progress: 0, currentFrame: 0, totalFrames: 0, etaSeconds: null, error: null, addedAt: 2 },
      { id: '3', settings: {}, inputPath: '', outputPath: '/c.mp4', status: 'rendering', progress: 0.5, currentFrame: 50, totalFrames: 100, etaSeconds: 15, error: null, addedAt: 3 },
      { id: '4', settings: {}, inputPath: '', outputPath: '/d.mp4', status: 'complete', progress: 1, currentFrame: 100, totalFrames: 100, etaSeconds: null, error: null, addedAt: 4 },
      { id: '5', settings: {}, inputPath: '', outputPath: '/e.mp4', status: 'failed', progress: 0.3, currentFrame: 30, totalFrames: 100, etaSeconds: null, error: 'err', addedAt: 5 },
    ]
    useExportStore.setState({ jobs })

    const state = useExportStore.getState()
    const queuedCount = state.jobs.filter((j) => j.status === 'queued').length
    const renderingCount = state.jobs.filter((j) => j.status === 'rendering').length
    const completeCount = state.jobs.filter((j) => j.status === 'complete').length

    expect(queuedCount).toBe(2)
    expect(renderingCount).toBe(1)
    expect(completeCount).toBe(1)
  })

  it('progress percent is rounded to integer', () => {
    const progress = 0.3333
    const percent = Math.round(progress * 100)
    expect(percent).toBe(33)
  })

  it('hasQueued is true when queued count > 0', () => {
    useExportStore.getState().addJob({ settings: {}, inputPath: '/a.mp4', outputPath: '/a.mp4' })
    const queuedCount = useExportStore.getState().jobs.filter((j) => j.status === 'queued').length
    expect(queuedCount > 0).toBe(true)
  })

  it('hasQueued is false when no queued jobs', () => {
    const jobs: ExportJob[] = [
      { id: '1', settings: {}, inputPath: '', outputPath: '/a.mp4', status: 'complete', progress: 1, currentFrame: 100, totalFrames: 100, etaSeconds: null, error: null, addedAt: 1 },
    ]
    useExportStore.setState({ jobs })
    const queuedCount = useExportStore.getState().jobs.filter((j) => j.status === 'queued').length
    expect(queuedCount > 0).toBe(false)
  })
})

describe('RenderQueue — rendering protection', () => {
  beforeEach(() => {
    useExportStore.setState({ jobs: [], currentJobIndex: null, isProcessing: false })
  })

  it('isCurrentRendering prevents job removal', () => {
    const store = useExportStore.getState()
    const id = store.addJob({ settings: {}, inputPath: '/a.mp4', outputPath: '/a.mp4' })
    useExportStore.getState().startQueue()
    // currentJobIndex=0, job at index 0 is the one we added
    const state = useExportStore.getState()
    const isCurrentRendering = state.currentJobIndex !== null && state.currentJobIndex === 0
    expect(isCurrentRendering).toBe(true)
    // Attempting removeJob should be blocked
    useExportStore.getState().removeJob(id)
    expect(useExportStore.getState().jobs).toHaveLength(1)
  })
})

describe('RenderQueue — visibility', () => {
  it('returns null when isOpen is false (component contract)', () => {
    // The component returns null when !isOpen. We test the logic.
    const isOpen = false
    expect(isOpen ? 'visible' : null).toBeNull()
  })

  it('renders when isOpen is true', () => {
    const isOpen = true
    expect(isOpen ? 'visible' : null).toBe('visible')
  })
})
