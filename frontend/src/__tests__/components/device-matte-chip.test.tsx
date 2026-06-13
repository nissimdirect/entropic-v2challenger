/**
 * MK.13 — DeviceCard matte-presence chip tests (completes MK.13 deferral).
 *
 * Gates verified:
 *   - masked device with static matte → sendCommand called → renders <img>
 *   - null/procedural reply → keeps text badge (graceful fallback)
 *   - error reply → keeps text badge
 *   - unmasked device → no chip, no sendCommand call
 *   - no-maskRef device → DeviceCard unchanged (additive/regression gate)
 *   - invert flag → CSS filter: invert(1) on img
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, act, waitFor } from '@testing-library/react'
import DeviceCard from '../../renderer/components/device-chain/DeviceCard'
import type { EffectInstance, EffectInfo, MatteNode } from '../../shared/types'

// --------------------------------------------------------------------------- //
//  Fixtures
// --------------------------------------------------------------------------- //

const EFFECT_INFO: EffectInfo = {
  id: 'fx.invert',
  name: 'Invert',
  category: 'color',
  params: {},
} as unknown as EffectInfo

const RECT_NODE: MatteNode = {
  id: 'rectA',
  kind: 'rect',
  params: { x: 0, y: 0, w: 1, h: 1 },
  op: 'add',
  invert: false,
  feather: 0,
  growShrink: 0,
  enabled: true,
}

const CHROMA_NODE: MatteNode = {
  id: 'chromaA',
  kind: 'chroma_key',
  params: {},
  op: 'add',
  invert: false,
  feather: 0,
  growShrink: 0,
  enabled: true,
}

function makeEffect(overrides: Partial<EffectInstance> = {}): EffectInstance {
  return {
    id: 'e1',
    effectId: 'fx.invert',
    isEnabled: true,
    isFrozen: false,
    parameters: {},
    modulations: {},
    mix: 1.0,
    mask: null,
    ...overrides,
  }
}

function renderCard(props: Partial<React.ComponentProps<typeof DeviceCard>> = {}) {
  return render(
    <DeviceCard
      effect={makeEffect()}
      effectInfo={EFFECT_INFO}
      isSelected={false}
      onSelect={() => {}}
      onToggle={() => {}}
      onRemove={() => {}}
      onUpdateParam={() => {}}
      onSetMix={() => {}}
      {...props}
    />,
  )
}

// --------------------------------------------------------------------------- //
//  Helpers for mocking window.entropic
// --------------------------------------------------------------------------- //

function mockEntropicSendCommand(
  resolveTo: Record<string, unknown>,
): ReturnType<typeof vi.fn> {
  const fn = vi.fn().mockResolvedValue(resolveTo)
  Object.defineProperty(window, 'entropic', {
    value: { sendCommand: fn },
    writable: true,
    configurable: true,
  })
  return fn
}

function clearEntropicMock() {
  // @ts-expect-error — intentional delete for cleanup
  delete window.entropic
}

// --------------------------------------------------------------------------- //
//  Tests
// --------------------------------------------------------------------------- //

describe('MK.13 — DeviceCard matte-presence chip', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    clearEntropicMock()
    cleanup()
  })

  it('unmasked device renders no chip and makes no IPC call', async () => {
    const sendCommand = mockEntropicSendCommand({ ok: true, thumbnail: 'abc' })
    const { queryByTestId } = renderCard({ effect: makeEffect() })

    await act(async () => {})
    expect(queryByTestId('device-matte-chip')).toBeNull()
    expect(sendCommand).not.toHaveBeenCalled()
  })

  it('masked device with static matte → sendCommand called, <img> rendered', async () => {
    const FAKE_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    const sendCommand = mockEntropicSendCommand({
      ok: true,
      thumbnail: FAKE_B64,
      width: 64,
      height: 36,
    })

    const { getByTestId, queryByTestId } = renderCard({
      effect: makeEffect({ maskRef: { nodeId: 'rectA', invert: false } }),
      maskNodes: [RECT_NODE],
      maskClipId: 'clip-abc',
    })

    await waitFor(() => {
      expect(sendCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          cmd: 'mask_thumbnail',
          clip_id: 'clip-abc',
          width: 64,
          height: 36,
        }),
      )
    })

    // After IPC resolves, img should be rendered
    await waitFor(() => {
      const img = queryByTestId('device-matte-chip-img')
      expect(img).toBeTruthy()
    })

    // Text badge should be gone when img is shown
    const chip = getByTestId('device-matte-chip')
    const labels = chip.querySelectorAll('.masking__matte-chip-label')
    expect(labels.length).toBe(0)
  })

  it('procedural/null reply → keeps text badge, no img', async () => {
    mockEntropicSendCommand({ ok: true, thumbnail: null, kind: 'procedural' })

    const { getByTestId, queryByTestId } = renderCard({
      effect: makeEffect({ maskRef: { nodeId: 'chromaA', invert: false } }),
      maskNodes: [CHROMA_NODE],
      maskClipId: 'clip-xyz',
    })

    await act(async () => {})

    // img should NOT be present
    expect(queryByTestId('device-matte-chip-img')).toBeNull()

    // text badge should remain
    const chip = getByTestId('device-matte-chip')
    const label = chip.querySelector('.masking__matte-chip-label')
    expect(label).toBeTruthy()
    expect(label?.textContent).toBe('MSK')
  })

  it('error reply → keeps text badge', async () => {
    mockEntropicSendCommand({ ok: false, error: 'bad node' })

    const { queryByTestId, getByTestId } = renderCard({
      effect: makeEffect({ maskRef: { nodeId: 'rectA', invert: false } }),
      maskNodes: [RECT_NODE],
      maskClipId: 'clip-err',
    })

    await act(async () => {})

    expect(queryByTestId('device-matte-chip-img')).toBeNull()
    const chip = getByTestId('device-matte-chip')
    expect(chip.querySelector('.masking__matte-chip-label')).toBeTruthy()
  })

  it('invert flag → CSS filter invert(1) on img', async () => {
    const FAKE_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    mockEntropicSendCommand({ ok: true, thumbnail: FAKE_B64, width: 64, height: 36 })

    const { queryByTestId } = renderCard({
      effect: makeEffect({ maskRef: { nodeId: 'rectA', invert: true } }),
      maskNodes: [RECT_NODE],
      maskClipId: 'clip-inv',
    })

    await waitFor(() => {
      const img = queryByTestId('device-matte-chip-img') as HTMLImageElement | null
      expect(img).toBeTruthy()
      expect(img!.style.filter).toBe('invert(1)')
    })
  })

  it('node not in maskNodes → no IPC call, text badge kept', async () => {
    const sendCommand = mockEntropicSendCommand({ ok: true, thumbnail: 'abc' })

    const { getByTestId, queryByTestId } = renderCard({
      effect: makeEffect({ maskRef: { nodeId: 'missingNode', invert: false } }),
      maskNodes: [RECT_NODE],  // does not contain 'missingNode'
      maskClipId: 'clip-miss',
    })

    await act(async () => {})

    expect(sendCommand).not.toHaveBeenCalled()
    expect(queryByTestId('device-matte-chip-img')).toBeNull()
    const chip = getByTestId('device-matte-chip')
    expect(chip.querySelector('.masking__matte-chip-label')).toBeTruthy()
  })

  it('no maskClipId → no IPC call, text badge kept (graceful when clip not at playhead)', async () => {
    const sendCommand = mockEntropicSendCommand({ ok: true, thumbnail: 'abc' })

    const { queryByTestId } = renderCard({
      effect: makeEffect({ maskRef: { nodeId: 'rectA', invert: false } }),
      maskNodes: [RECT_NODE],
      maskClipId: undefined,  // no clip at playhead
    })

    await act(async () => {})

    expect(sendCommand).not.toHaveBeenCalled()
    expect(queryByTestId('device-matte-chip-img')).toBeNull()
  })
})
