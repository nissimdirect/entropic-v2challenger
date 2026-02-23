import { describe, it, expect } from 'vitest'

/**
 * Tests for preview canvas logic — frame display, scrub behavior, preview states.
 */

function frameIndexFromTime(timeSeconds: number, fps: number): number {
  return Math.floor(timeSeconds * fps)
}

function clampFrame(index: number, totalFrames: number): number {
  return Math.max(0, Math.min(index, totalFrames - 1))
}

function scrubToPercent(percent: number, totalFrames: number): number {
  const index = Math.round(percent * (totalFrames - 1))
  return clampFrame(index, totalFrames)
}

describe('PreviewCanvas frame logic', () => {
  it('converts time to frame index', () => {
    expect(frameIndexFromTime(0, 30)).toBe(0)
    expect(frameIndexFromTime(1.0, 30)).toBe(30)
    expect(frameIndexFromTime(0.5, 30)).toBe(15)
  })

  it('clamps frame to valid range', () => {
    expect(clampFrame(-1, 150)).toBe(0)
    expect(clampFrame(0, 150)).toBe(0)
    expect(clampFrame(149, 150)).toBe(149)
    expect(clampFrame(200, 150)).toBe(149)
  })

  it('scrubs to start at 0%', () => {
    expect(scrubToPercent(0, 150)).toBe(0)
  })

  it('scrubs to end at 100%', () => {
    expect(scrubToPercent(1.0, 150)).toBe(149)
  })

  it('scrubs to middle at 50%', () => {
    const frame = scrubToPercent(0.5, 150)
    expect(frame).toBeGreaterThan(60)
    expect(frame).toBeLessThan(90)
  })

  it('handles single frame video', () => {
    expect(scrubToPercent(0, 1)).toBe(0)
    expect(scrubToPercent(1, 1)).toBe(0)
  })
})

/**
 * BUG-3: Preview state machine — tests for the state transitions
 * that determine what the PreviewCanvas displays.
 *
 * States: 'empty' | 'loading' | 'ready' | 'error'
 */

type PreviewState = 'empty' | 'loading' | 'ready' | 'error'

/**
 * Derives preview state from application conditions.
 * Mirrors the logic in App.tsx.
 */
function derivePreviewState(params: {
  hasAssets: boolean
  isIngesting: boolean
  frameDataUrl: string | null
  renderError: string | null
}): PreviewState {
  if (params.isIngesting) return 'loading'
  if (params.renderError) return 'error'
  if (!params.hasAssets) return 'empty'
  if (!params.frameDataUrl) return 'loading'
  return 'ready'
}

/**
 * Determines whether the render should auto-retry with an empty chain.
 * When a render fails and the chain had effects, retry with empty chain
 * to at least show the raw frame.
 */
function shouldRetryWithEmptyChain(renderFailed: boolean, chainLength: number): boolean {
  return renderFailed && chainLength > 0
}

describe('Preview state machine (BUG-3)', () => {
  describe('derivePreviewState', () => {
    it('returns empty when no assets and not ingesting', () => {
      expect(derivePreviewState({
        hasAssets: false,
        isIngesting: false,
        frameDataUrl: null,
        renderError: null,
      })).toBe('empty')
    })

    it('returns loading when ingesting', () => {
      expect(derivePreviewState({
        hasAssets: false,
        isIngesting: true,
        frameDataUrl: null,
        renderError: null,
      })).toBe('loading')
    })

    it('returns loading when has assets but no frame yet', () => {
      expect(derivePreviewState({
        hasAssets: true,
        isIngesting: false,
        frameDataUrl: null,
        renderError: null,
      })).toBe('loading')
    })

    it('returns ready when frame data is available', () => {
      expect(derivePreviewState({
        hasAssets: true,
        isIngesting: false,
        frameDataUrl: 'data:image/jpeg;base64,abc123',
        renderError: null,
      })).toBe('ready')
    })

    it('returns error when render failed', () => {
      expect(derivePreviewState({
        hasAssets: true,
        isIngesting: false,
        frameDataUrl: null,
        renderError: 'effect_chain_error: unsupported effect',
      })).toBe('error')
    })

    it('returns error even if there is stale frame data', () => {
      // renderError takes precedence over existing frame data
      expect(derivePreviewState({
        hasAssets: true,
        isIngesting: false,
        frameDataUrl: 'data:image/jpeg;base64,old',
        renderError: 'render_timeout',
      })).toBe('error')
    })

    it('returns loading when ingesting even if there is a previous error', () => {
      // isIngesting takes precedence over renderError
      expect(derivePreviewState({
        hasAssets: false,
        isIngesting: true,
        frameDataUrl: null,
        renderError: 'previous error',
      })).toBe('loading')
    })
  })

  describe('shouldRetryWithEmptyChain', () => {
    it('retries when render failed with non-empty chain', () => {
      expect(shouldRetryWithEmptyChain(true, 3)).toBe(true)
    })

    it('does not retry when render succeeded', () => {
      expect(shouldRetryWithEmptyChain(false, 3)).toBe(false)
    })

    it('does not retry when chain is already empty', () => {
      expect(shouldRetryWithEmptyChain(true, 0)).toBe(false)
    })

    it('does not retry when render succeeded with empty chain', () => {
      expect(shouldRetryWithEmptyChain(false, 0)).toBe(false)
    })

    it('retries when chain has a single effect', () => {
      expect(shouldRetryWithEmptyChain(true, 1)).toBe(true)
    })
  })

  describe('state transitions: add effect then upload flow (BUG-3 scenario)', () => {
    it('starts in empty state', () => {
      const state = derivePreviewState({
        hasAssets: false,
        isIngesting: false,
        frameDataUrl: null,
        renderError: null,
      })
      expect(state).toBe('empty')
    })

    it('transitions to loading when ingest starts', () => {
      const state = derivePreviewState({
        hasAssets: false,
        isIngesting: true,
        frameDataUrl: null,
        renderError: null,
      })
      expect(state).toBe('loading')
    })

    it('transitions to ready after successful render with empty chain', () => {
      const state = derivePreviewState({
        hasAssets: true,
        isIngesting: false,
        frameDataUrl: 'data:image/jpeg;base64,frame0',
        renderError: null,
      })
      expect(state).toBe('ready')
    })

    it('stays ready after re-render with effect chain succeeds', () => {
      const state = derivePreviewState({
        hasAssets: true,
        isIngesting: false,
        frameDataUrl: 'data:image/jpeg;base64,frame0_with_effects',
        renderError: null,
      })
      expect(state).toBe('ready')
    })
  })
})
