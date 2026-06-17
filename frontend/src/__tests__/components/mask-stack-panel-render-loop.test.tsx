/**
 * P0 CRASH REPRO — "Maximum update depth exceeded" when adding an effect to a
 * clip's device chain while a clip (with NO mask stack) is selected.
 *
 * Live repro (UAT, deterministic): New Project → import a video clip → select
 * the clip → add ANY effect to its device chain → renderer throws
 * "Maximum update depth exceeded" → global error boundary → autosaves the broken
 * state → reload re-crashes = inescapable crash loop.
 *
 * ROOT CAUSE (file:line): `MaskStackPanel`'s Zustand selector
 * (components/masking/MaskStackPanel.tsx:225-233) returns `clip.maskStack ?? []`.
 * A clip with no mask stack (the default for a freshly imported clip) makes the
 * selector return a BRAND-NEW `[]` literal on every render. Zustand compares
 * snapshots with `Object.is`; a new array each call is never equal to the prior
 * one, so `useSyncExternalStore` reports the store as "changed" every render →
 * forces a re-render → selector runs again → new `[]` → infinite loop.
 *
 * `MaskStackPanel` mounts in App.tsx whenever a clip is selected (the `{selectedClip
 * && <MaskStackPanel clipId={selectedClip.id} />}` mount). Adding an effect mutates
 * the active track's chain → AppInner re-renders → MaskStackPanel re-renders → loop.
 *
 * ORACLE: on origin/main this test FAILS (React throws "Maximum update depth").
 * After the fix (a stable EMPTY constant for the no-mask-stack case), the panel
 * settles within a bounded number of renders and the test PASSES.
 *
 * Attribution: PRE-EXISTING regression from PR #222 (92f472a, MK.7 mask-stack
 * editing UI, 2026-06-12) — NOT the cohesion PRs #316/#307. The unstable `?? []`
 * selector and the clip-selected mount predicate both predate the cohesion PRs.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { useState } from 'react'

import { useProjectStore } from '../../renderer/stores/project'
import { useTimelineStore } from '../../renderer/stores/timeline'
import { useEffectsStore } from '../../renderer/stores/effects'
import { useEngineStore } from '../../renderer/stores/engine'
import DeviceChain from '../../renderer/components/device-chain/DeviceChain'
import MaskStackPanel from '../../renderer/components/masking/MaskStackPanel'
import type { EffectInfo, Clip } from '../../shared/types'

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
  // NOTE: no `maskStack` field — exactly like a freshly imported video clip.
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
  // Import a clip onto the track and SELECT it (the repro precondition).
  const clip = makeClip('clip-1', V1_TRACK_ID)
  useTimelineStore.getState().addClip(V1_TRACK_ID, clip)
  useTimelineStore.getState().selectClip('clip-1')
}

afterEach(cleanup)

describe('P0 — adding an effect with a clip selected must not loop (Maximum update depth)', () => {
  beforeEach(resetStores)

  // ── Full integration repro ──────────────────────────────────────────────
  // Mirror App.tsx's mount: a selected (maskless) clip mounts MaskStackPanel,
  // and DeviceChain edits that track's chain. Adding an effect re-renders the
  // tree; the unstable selector then drives the infinite render loop.
  it('does not exceed render depth when an effect is added while a clip is selected', () => {
    // happy-dom + React surface the loop as a thrown "Maximum update depth
    // exceeded" error. Capture console.error so the assertion is precise either
    // way (React logs it before throwing).
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    function Harness() {
      // Mirror App: selectedClip drives the MaskStackPanel mount.
      const selectedClipId = useTimelineStore((s) =>
        s.selectedClipIds.length === 1 ? s.selectedClipIds[0] : null,
      )
      // Local state toggled by the button below to force a parent re-render —
      // stands in for AppInner re-rendering when the effect chain changes.
      const [, force] = useState(0)
      return (
        <div>
          <button data-testid="force" onClick={() => force((n) => n + 1)}>
            force
          </button>
          <DeviceChain />
          {selectedClipId && <MaskStackPanel clipId={selectedClipId} />}
        </div>
      )
    }

    const { container, getByTestId, unmount } = render(<Harness />)

    let threw: unknown = null
    try {
      // Add the effect via the DeviceChain drop target (the real add path).
      const root = container.querySelector('[data-testid="device-chain"]') as HTMLElement
      const dt = {
        types: ['application/x-entropic-effect-id'],
        getData: (t: string) => (t === 'application/x-entropic-effect-id' ? 'block_crystallize' : ''),
        setData: () => {},
        dropEffect: 'copy',
        effectAllowed: 'copy',
      } as unknown as DataTransfer
      fireEvent.drop(root, { dataTransfer: dt })
      // Force a parent re-render (as AppInner does on chain change) to exercise
      // the MaskStackPanel re-render path that triggers the loop.
      fireEvent.click(getByTestId('force'))
    } catch (e) {
      threw = e
    }

    const loggedMaxDepth = errorSpy.mock.calls.some((args) =>
      args.some((a) => typeof a === 'string' && /Maximum update depth/i.test(a)),
    )
    const threwMaxDepth =
      threw != null && /Maximum update depth/i.test(String((threw as Error)?.message ?? threw))

    errorSpy.mockRestore()
    unmount()

    expect(loggedMaxDepth || threwMaxDepth).toBe(false)

    // Sanity: the effect actually landed (the add path worked).
    const chain =
      useTimelineStore.getState().tracks.find((t) => t.id === V1_TRACK_ID)?.effectChain ?? []
    expect(chain).toHaveLength(1)
    expect(chain[0].effectId).toBe('block_crystallize')
  })
})
