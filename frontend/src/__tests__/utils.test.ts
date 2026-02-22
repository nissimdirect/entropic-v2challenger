import { describe, it, expect } from 'vitest'
import { parseZmqPort } from '../main/utils'

describe('parseZmqPort', () => {
  it('parses port from ZMQ_PORT=N format', () => {
    expect(parseZmqPort('ZMQ_PORT=5555')).toBe(5555)
  })

  it('parses port from multi-line output', () => {
    expect(parseZmqPort('Starting server...\nZMQ_PORT=12345\nReady.')).toBe(
      12345,
    )
  })

  it('returns null when no port found', () => {
    expect(parseZmqPort('some other output')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseZmqPort('')).toBeNull()
  })
})
