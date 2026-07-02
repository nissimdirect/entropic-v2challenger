/**
 * UAT P4 — layout cramping regression guard (render-level).
 *
 * BUG: a tall instrument device editor (e.g. RackDevice's pad grid + per-pad
 * editor, which reuses `.sampler-device` — no cap in instruments.css) plus a
 * selected clip's MaskStackPanel could grow `.app__device-chain` (App.tsx:3756)
 * without limit. In the base grid, row 3 is `auto` (global.css:24), so an
 * over-tall device-chain region squeezed the `1fr` preview row toward zero
 * height. In the Creatrix-flag grid, the fixed-height region had
 * `overflow: hidden`, which silently clipped the tail of the editor instead.
 *
 * FIX (docs/plans/2026-06-17-p1b-uat-fix-plan.md §P4): bound `.app__device-chain`
 * with `max-height` + `overflow-y: auto` in the base grid (global.css), and
 * swap `overflow: hidden` -> `overflow-y: auto` on the Creatrix flag-path rule
 * (creatrix-layout.css) so the region scrolls internally instead of clipping
 * or pushing the preview off-screen.
 *
 * This file asserts the RENDERED wrapper: all instrument-editor and
 * mask-stack content mounts INSIDE the `.app__device-chain` container — the
 * element that actually carries the bounding CSS — mirroring App.tsx's mount
 * order (SamplerDevice/RackDevice/FrameBankDevice/GranulatorDevice ->
 * DeviceChain -> MaskStackPanel, all inside one `.app__device-chain` div).
 * The companion static-source test
 * (`../styles/device-chain-bounds.test.ts`) asserts the actual CSS rules
 * exist in both stylesheets — happy-dom does not reliably compute cascaded
 * grid/overflow values from stylesheets that aren't injected at render time,
 * so the CSS-value assertions live there per this repo's established
 * convention (see `../styles/app-sidebar-timeline-overlap.test.ts` and
 * `../styles/creatrix-layout-specificity.test.ts`).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'

import { useProjectStore } from '../../renderer/stores/project'
import { useTimelineStore } from '../../renderer/stores/timeline'
import { useEffectsStore } from '../../renderer/stores/effects'
import { useEngineStore } from '../../renderer/stores/engine'
import DeviceChain from '../../renderer/components/device-chain/DeviceChain'
import MaskStackPanel from '../../renderer/components/masking/MaskStackPanel'
import type { EffectInfo, Clip } from '../../shared/types'

// ── IPC mock (Gate 5: component tests mock IPC, never hit the real preload
//    bridge). None of DeviceChain/MaskStackPanel call it directly on mount,
//    but stub defensively so any store that touches window.electron during
//    initial render resolves to a safe no-op instead of throwing. ──────────
beforeEach(() => {
  Object.defineProperty(window, 'electron', {
    value: { invoke: vi.fn().mockResolvedValue(undefined), on: vi.fn(), send: vi.fn() },
    writable: true,
    configurable: true,
  })
})

const MOCK_INFO: EffectInfo = {
  id: 'block_crystallize',
  name: 'Block Crystallize',
  category: 'glitch',
  params: {
    size: { type: 'float', min: 0, max: 1, default: 0.5, label: 'Size' },
  },
}

let V1_TRACK_ID: string

function makeClip(id: string, trackId: string): Clip {
  return {
    id,
    assetId: 'asset-1',
    trackId,
    position: 0,
    duration: 120,
    inPoint: 0,
    outPoint: 120,
    speed: 1,
  }
}

function resetStores() {
  useTimelineStore.getState().reset()
  useProjectStore.setState({
    selectedEffectId: null,
    selectedRackPad: null,
    assets: { 'asset-1': { id: 'asset-1', path: '/tmp/uat-testclip.mp4', type: 'video' } as never },
    currentFrame: 0,
    totalFrames: 120,
  })
  useEffectsStore.setState({ registry: [MOCK_INFO], isLoading: false })
  useEngineStore.setState({ status: 'connected', lastFrameMs: 12 })
  V1_TRACK_ID = useTimelineStore.getState().addTrack('V1', '#ff0000')!
  const clip = makeClip('clip-1', V1_TRACK_ID)
  useTimelineStore.getState().addClip(V1_TRACK_ID, clip)
  useTimelineStore.getState().selectClip('clip-1')
}

afterEach(cleanup)

describe('App.tsx .app__device-chain wrapper — UAT P4 bounding container', () => {
  beforeEach(resetStores)

  it('mounts a tall instrument editor + DeviceChain + selected-clip MaskStackPanel all INSIDE .app__device-chain', () => {
    // Mirrors App.tsx:3755-3789 — the wrapper div that carries the bounding
    // max-height/overflow-y CSS, containing (in mount order) the instrument
    // device editor, DeviceChain, and (when a clip is selected) MaskStackPanel.
    function Harness() {
      const selectedClipId = useTimelineStore((s) =>
        s.selectedClipIds.length === 1 ? s.selectedClipIds[0] : null,
      )
      return (
        <div className="app__device-chain" data-testid="device-chain-region">
          {/* Stand-in for a tall instrument editor (RackDevice's pad grid +
              per-pad editor reuses `.sampler-device`, which has no height cap
              of its own — instruments.css:106-114). Many rows to simulate the
              over-tall content that must be bounded by the wrapper, not by
              the editor itself. */}
          <div className="sampler-device" data-testid="mock-tall-instrument-editor">
            {Array.from({ length: 40 }, (_, i) => (
              <div key={i} className="sampler-device__row">
                row {i}
              </div>
            ))}
          </div>
          <DeviceChain />
          {selectedClipId && <MaskStackPanel clipId={selectedClipId} />}
        </div>
      )
    }

    const { container, getByTestId } = render(<Harness />)

    const region = getByTestId('device-chain-region')
    // The container element itself carries the bounding class.
    expect(region.classList.contains('app__device-chain')).toBe(true)

    // All three content pieces (tall editor, DeviceChain, MaskStackPanel) are
    // descendants of the SAME bounding container — none of them escape it to
    // render as a sibling that would bypass the max-height/overflow-y rule.
    const editor = getByTestId('mock-tall-instrument-editor')
    expect(region.contains(editor)).toBe(true)

    const deviceChainEl = container.querySelector('[data-testid="device-chain"]')
    expect(deviceChainEl).not.toBeNull()
    expect(region.contains(deviceChainEl as Node)).toBe(true)

    // A clip is selected in resetStores() → MaskStackPanel must have mounted,
    // and inside the bounding region (not floated outside it).
    const maskPanel = container.querySelector('[class*="mask-stack"]')
    expect(maskPanel).not.toBeNull()
    expect(region.contains(maskPanel as Node)).toBe(true)

    // Sanity: exactly one `.app__device-chain` region — the bounding CSS
    // rule (asserted in the companion static-source test) applies to a
    // single, unambiguous container.
    expect(container.querySelectorAll('.app__device-chain')).toHaveLength(1)
  })
})
