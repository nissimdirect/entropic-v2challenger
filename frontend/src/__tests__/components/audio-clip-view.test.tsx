import { describe, it, expect, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

;(globalThis as any).window = {
  entropic: {
    sendCommand: async () => ({ ok: true }),
    onEngineStatus: () => {},
    onExportProgress: () => {},
    selectFile: async () => null,
    selectSavePath: async () => null,
  },
}

import AudioClipView from '../../renderer/components/timeline/AudioClipView'
import { useTimelineStore } from '../../renderer/stores/timeline'
import { useUndoStore } from '../../renderer/stores/undo'
import type { AudioClip } from '../../shared/types'

function makeClip(overrides: Partial<AudioClip> = {}): AudioClip {
  return {
    id: 'clip-1',
    trackId: 'track-1',
    path: '/tmp/kick.wav',
    inSec: 0,
    outSec: 4,
    startSec: 0,
    gainDb: 0,
    fadeInSec: 0,
    fadeOutSec: 0,
    muted: false,
    ...overrides,
  }
}

describe('AudioClipView', () => {
  beforeEach(() => {
    useTimelineStore.getState().reset()
    useUndoStore.getState().clear()
  })

  it('renders with filename visible', () => {
    const clip = makeClip({ path: '/tmp/drums/kick808.wav' })
    const { container } = render(<AudioClipView clip={clip} zoom={100} scrollX={0} isSelected={false} />)
    expect(container.textContent).toContain('kick808.wav')
  })

  it('positions clip by startSec * zoom', () => {
    const clip = makeClip({ startSec: 5 })
    const { container } = render(<AudioClipView clip={clip} zoom={50} scrollX={0} isSelected={false} />)
    const el = container.querySelector('.audio-clip') as HTMLElement
    expect(el.style.left).toBe('250px')  // 5s × 50 px/s
  })

  it('width reflects clip duration', () => {
    const clip = makeClip({ inSec: 1, outSec: 3 })  // 2s duration
    const { container } = render(<AudioClipView clip={clip} zoom={100} scrollX={0} isSelected={false} />)
    const el = container.querySelector('.audio-clip') as HTMLElement
    expect(el.style.width).toBe('200px')
  })

  it('shows MISSING badge when clip.missing', () => {
    const clip = makeClip({ missing: true })
    const { container } = render(<AudioClipView clip={clip} zoom={100} scrollX={0} isSelected={false} />)
    expect(container.textContent).toContain('MISSING')
    expect(container.querySelector('.audio-clip--missing')).toBeTruthy()
  })

  it('shows muted marker when clip.muted', () => {
    const clip = makeClip({ muted: true })
    const { container } = render(<AudioClipView clip={clip} zoom={100} scrollX={0} isSelected={false} />)
    expect(container.querySelector('.audio-clip--muted')).toBeTruthy()
  })

  it('formats gain correctly', () => {
    const neg = render(<AudioClipView clip={makeClip({ gainDb: -6 })} zoom={100} scrollX={0} isSelected={false} />)
    expect(neg.container.textContent).toContain('-6.0 dB')

    const pos = render(<AudioClipView clip={makeClip({ gainDb: 3 })} zoom={100} scrollX={0} isSelected={false} />)
    expect(pos.container.textContent).toContain('+3.0 dB')

    const zero = render(<AudioClipView clip={makeClip({ gainDb: 0 })} zoom={100} scrollX={0} isSelected={false} />)
    expect(zero.container.textContent).toContain('0 dB')
  })

  it('applies selected class when isSelected=true', () => {
    const { container } = render(<AudioClipView clip={makeClip()} zoom={100} scrollX={0} isSelected={true} />)
    expect(container.querySelector('.audio-clip--selected')).toBeTruthy()
  })
})
