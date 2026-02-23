import { describe, it, expect } from 'vitest'
import { validateCommand, validateResponse, validateProject } from '../validate'

describe('validateCommand', () => {
  it('accepts a valid ping command', () => {
    const result = validateCommand({ cmd: 'ping', id: 'abc-123' })
    expect(result.valid).toBe(true)
    expect(result.errors).toBeUndefined()
  })

  it('accepts a valid ingest command', () => {
    const result = validateCommand({ cmd: 'ingest', id: '1', path: '/tmp/video.mp4' })
    expect(result.valid).toBe(true)
  })

  it('accepts a valid seek command', () => {
    const result = validateCommand({ cmd: 'seek', id: '2', path: '/video.mp4', time: 1.5 })
    expect(result.valid).toBe(true)
  })

  it('accepts a valid render_frame command', () => {
    const result = validateCommand({
      cmd: 'render_frame',
      id: '3',
      path: '/video.mp4',
      frame_index: 10,
      chain: [],
      project_seed: 42,
    })
    expect(result.valid).toBe(true)
  })

  it('accepts a valid export_start command', () => {
    const result = validateCommand({
      cmd: 'export_start',
      id: '4',
      input_path: '/in.mp4',
      output_path: '/out.mp4',
      chain: [],
      project_seed: 0,
    })
    expect(result.valid).toBe(true)
  })

  it('rejects command missing required id field', () => {
    const result = validateCommand({ cmd: 'ping' })
    expect(result.valid).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.errors!.length).toBeGreaterThan(0)
  })

  it('rejects command missing required cmd field', () => {
    const result = validateCommand({ id: '1' })
    expect(result.valid).toBe(false)
  })

  it('rejects ingest command missing path', () => {
    const result = validateCommand({ cmd: 'ingest', id: '1' })
    expect(result.valid).toBe(false)
  })

  it('rejects unknown command type', () => {
    const result = validateCommand({ cmd: 'bogus', id: '1' })
    expect(result.valid).toBe(false)
  })

  it('rejects non-object input', () => {
    expect(validateCommand('string').valid).toBe(false)
    expect(validateCommand(42).valid).toBe(false)
    expect(validateCommand(null).valid).toBe(false)
  })
})

describe('validateResponse', () => {
  it('accepts a valid success response', () => {
    const result = validateResponse({ id: '1', ok: true })
    expect(result.valid).toBe(true)
  })

  it('accepts a success response with extra fields', () => {
    const result = validateResponse({
      id: '1',
      ok: true,
      frame_data: 'base64...',
      width: 1920,
      height: 1080,
    })
    expect(result.valid).toBe(true)
  })

  it('accepts a valid error response', () => {
    const result = validateResponse({ id: '1', ok: false, error: 'something went wrong' })
    expect(result.valid).toBe(true)
  })

  it('accepts a valid ping response', () => {
    const result = validateResponse({
      id: '1',
      status: 'alive',
      uptime_s: 12.3,
      last_frame_ms: 4.5,
    })
    expect(result.valid).toBe(true)
  })

  it('rejects error response missing error field', () => {
    const result = validateResponse({ id: '1', ok: false })
    expect(result.valid).toBe(false)
  })

  it('rejects response missing id', () => {
    const result = validateResponse({ ok: true })
    expect(result.valid).toBe(false)
  })
})

describe('validateProject', () => {
  const validProject = {
    version: '2.0.0',
    id: 'test-id',
    created: 1700000000,
    modified: 1700000000,
    author: 'test',
    settings: {
      resolution: [1920, 1080],
      frameRate: 30,
      audioSampleRate: 48000,
      masterVolume: 1.0,
      seed: 0,
    },
    assets: {},
    timeline: {
      duration: 0,
      tracks: [],
      markers: [],
      loopRegion: null,
    },
  }

  it('accepts a valid project', () => {
    const result = validateProject(validProject)
    expect(result.valid).toBe(true)
  })

  it('accepts a project with loop region', () => {
    const result = validateProject({
      ...validProject,
      timeline: { ...validProject.timeline, loopRegion: { in: 0, out: 5.0 } },
    })
    expect(result.valid).toBe(true)
  })

  it('rejects project missing version', () => {
    const { version: _, ...noVersion } = validProject
    const result = validateProject(noVersion)
    expect(result.valid).toBe(false)
    expect(result.errors!.some((e) => e.includes('version'))).toBe(true)
  })

  it('rejects project missing settings keys', () => {
    const result = validateProject({
      ...validProject,
      settings: { resolution: [1920, 1080] },
    })
    expect(result.valid).toBe(false)
  })

  it('rejects project with invalid resolution', () => {
    const result = validateProject({
      ...validProject,
      settings: { ...validProject.settings, resolution: [0, 1080] },
    })
    expect(result.valid).toBe(false)
  })
})
