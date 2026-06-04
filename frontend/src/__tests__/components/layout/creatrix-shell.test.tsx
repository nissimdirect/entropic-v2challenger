/**
 * CreatrixShell — PR-A integration: layout shell + browser + B1 device slot.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import CreatrixShell from '../../../renderer/components/layout/CreatrixShell'
import { useInstrumentsStore } from '../../../renderer/stores/instruments'
import { useEffectsStore } from '../../../renderer/stores/effects'

beforeEach(() => {
  useInstrumentsStore.setState({ instrument: null })
  useEffectsStore.setState({ registry: [], isLoading: false } as never)
})
afterEach(() => cleanup())

describe('CreatrixShell', () => {
  it('renders the 4-region shell + the 5-tab browser', () => {
    render(<CreatrixShell />)
    expect(screen.getByTestId('creatrix-browser')).toBeTruthy()
    expect(screen.getByTestId('browser-tab-instruments')).toBeTruthy()
    expect(screen.getByTestId('creatrix-preview-slot')).toBeTruthy()
    expect(screen.getByTestId('creatrix-inspector-slot')).toBeTruthy()
  })

  it('device-chain slot shows a placeholder when no sampler loaded', () => {
    render(<CreatrixShell />)
    expect(screen.getByTestId('creatrix-devicechain-slot')).toBeTruthy()
  })

  it('device-chain slot shows the Sampler device once a sampler is added', () => {
    useInstrumentsStore.getState().addSampler('clip-1')
    render(<CreatrixShell />)
    expect(screen.getByTestId('sampler-device')).toBeTruthy()
    expect(screen.queryByTestId('creatrix-devicechain-slot')).toBeNull()
  })

  it('shows the instruments tab with a Sampler entry', () => {
    render(<CreatrixShell />)
    // switch to instruments tab
    fireEvent.click(screen.getByTestId('browser-tab-instruments'))
    expect(screen.getByTestId('browser-entry-builtin:instr.sampler')).toBeTruthy()
  })
})
