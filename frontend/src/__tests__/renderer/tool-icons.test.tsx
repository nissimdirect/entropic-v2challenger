import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import ToolIcon, { TOOL_NAMES, type ToolName } from '../../renderer/assets/tool-icons'

describe('ToolIcon (Block direction, 14 tools)', () => {
  it('has exactly 14 tool names', () => {
    expect(TOOL_NAMES.length).toBe(14)
    expect(new Set(TOOL_NAMES).size).toBe(14)
  })

  it('renders every tool name without error, each producing an <svg>', () => {
    for (const name of TOOL_NAMES) {
      const { container, unmount } = render(<ToolIcon name={name} />)
      expect(container.querySelector('svg')).toBeTruthy()
      unmount()
    }
  })

  it('renders the shared Block stroke attributes on every icon', () => {
    for (const name of TOOL_NAMES) {
      const { container, unmount } = render(<ToolIcon name={name} />)
      const svg = container.querySelector('svg')
      expect(svg).toBeTruthy()
      expect(svg?.getAttribute('stroke-width')).toBe('2.7')
      expect(svg?.getAttribute('stroke-linecap')).toBe('square')
      expect(svg?.getAttribute('stroke-linejoin')).toBe('miter')
      expect(svg?.getAttribute('stroke')).toBe('currentColor')
      expect(svg?.getAttribute('fill')).toBe('none')
      expect(svg?.outerHTML).toContain('stroke-width="2.7"')
      unmount()
    }
  })

  it('respects the size prop', () => {
    const { container } = render(<ToolIcon name="zoom" size={32} />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('32')
    expect(svg?.getAttribute('height')).toBe('32')
  })

  it('never hardcodes a hex color — only currentColor appears as a paint value', () => {
    for (const name of TOOL_NAMES) {
      const { container, unmount } = render(<ToolIcon name={name} />)
      const html = container.innerHTML
      expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}/)
      unmount()
    }
  })

  it('the ToolName union has exactly 14 members (compile-time exhaustiveness check)', () => {
    // If a member is added to or removed from ToolName without updating this
    // switch, the `default` branch's `never` assignment fails to compile —
    // `tsc --noEmit` catches drift between the union and this list.
    function assertExhaustive(name: ToolName): true {
      switch (name) {
        case 'transform':
        case 'text':
        case 'razor':
        case 'slip':
        case 'slide':
        case 'rippledel':
        case 'marqrect':
        case 'marqellipse':
        case 'lasso':
        case 'polylasso':
        case 'wand':
        case 'keypicker':
        case 'hand':
        case 'zoom':
          return true
        default: {
          const _exhaustive: never = name
          return _exhaustive
        }
      }
    }

    for (const name of TOOL_NAMES) {
      expect(assertExhaustive(name)).toBe(true)
    }
  })

  it('rejects a bogus tool name at compile time', () => {
    // @ts-expect-error — 'not-a-real-tool' is not a member of ToolName
    const bogus: ToolName = 'not-a-real-tool'
    expect(bogus).toBeDefined()
  })
})
