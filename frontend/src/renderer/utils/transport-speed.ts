/**
 * Transport speed state machine for J/K/L NLE-style transport.
 *
 * L = forward: 1x → 2x → 4x → 8x (each press doubles speed)
 * J = reverse: -1x → -2x → -4x → -8x
 * K = stop (speed = 0)
 * K held + L = frame-by-frame forward (speed = 0, step +1)
 * K held + J = frame-by-frame reverse (speed = 0, step -1)
 *
 * Speed resets to 0 when direction changes (L then J = stop → -1x).
 */

export type TransportDirection = 'forward' | 'reverse' | 'stopped'

const SPEED_LEVELS = [1, 2, 4, 8] as const
const MAX_SPEED_INDEX = SPEED_LEVELS.length - 1

interface TransportSpeedState {
  direction: TransportDirection
  speedIndex: number  // index into SPEED_LEVELS (0-3)
}

let state: TransportSpeedState = { direction: 'stopped', speedIndex: 0 }

/** Get the current playback speed multiplier. Negative = reverse. 0 = stopped. */
export function getTransportSpeed(): number {
  if (state.direction === 'stopped') return 0
  const speed = SPEED_LEVELS[state.speedIndex]
  return state.direction === 'reverse' ? -speed : speed
}

/** Get the current direction. */
export function getTransportDirection(): TransportDirection {
  return state.direction
}

/** Get the current speed level (1x, 2x, 4x, 8x). */
export function getTransportSpeedLevel(): number {
  return state.direction === 'stopped' ? 0 : SPEED_LEVELS[state.speedIndex]
}

/** Handle L key press — forward, escalating speed. */
export function transportForward(): number {
  if (state.direction === 'forward') {
    // Already forwarding — escalate speed
    state.speedIndex = Math.min(state.speedIndex + 1, MAX_SPEED_INDEX)
  } else {
    // Was stopped or reversing — start forward at 1x
    state.direction = 'forward'
    state.speedIndex = 0
  }
  return getTransportSpeed()
}

/** Handle J key press — reverse, escalating speed. */
export function transportReverse(): number {
  if (state.direction === 'reverse') {
    // Already reversing — escalate speed
    state.speedIndex = Math.min(state.speedIndex + 1, MAX_SPEED_INDEX)
  } else {
    // Was stopped or forwarding — start reverse at 1x
    state.direction = 'reverse'
    state.speedIndex = 0
  }
  return getTransportSpeed()
}

/** Handle K key press — stop. */
export function transportStop(): number {
  state.direction = 'stopped'
  state.speedIndex = 0
  return 0
}

/** Reset transport speed to initial state. */
export function resetTransportSpeed(): void {
  state = { direction: 'stopped', speedIndex: 0 }
}
