/**
 * Entropic v2 — Shared constants.
 */

/** Effect category prefixes matching the taxonomy */
export const CATEGORY = {
  TOOLS: "util",
  EFFECTS: "fx",
  OPERATORS: "mod",
} as const;

/** Shared memory defaults */
export const SHM = {
  HEADER_SIZE: 64,
  RING_SIZE: 4,
  SLOT_SIZE: 4 * 1024 * 1024, // 4MB
} as const;

/** Watchdog timing */
export const WATCHDOG = {
  PING_INTERVAL_MS: 1000,
  TIMEOUT_MS: 2000,
  MAX_MISSES: 3,
} as const;

// --- Performance ---

import type { ADSREnvelope } from './types';

/** Default 4x4 pad key bindings using KeyboardEvent.code (physical position, M2) */
export const DEFAULT_PAD_BINDINGS: readonly string[] = [
  'Digit1', 'Digit2', 'Digit3', 'Digit4', // Row 1
  'KeyQ',   'KeyW',   'KeyE',   'KeyR',    // Row 2
  'KeyA',   'KeyS',   'KeyD',   'KeyF',    // Row 3
  'KeyZ',   'KeyX',   'KeyC',   'KeyV',    // Row 4
] as const;

/** ADSR presets (values in frames at 30fps) */
export const ADSR_PRESETS: Record<string, ADSREnvelope> = {
  pluck:   { attack: 0.3,  decay: 1.5,  sustain: 0.8, release: 6 },
  sustain: { attack: 15,   decay: 6,    sustain: 1.0, release: 60 },
  stab:    { attack: 0.15, decay: 0.3,  sustain: 0,   release: 3 },
  pad:     { attack: 60,   decay: 30,   sustain: 1.0, release: 150 },
} as const;

/** Instant envelope — no ramp, full level */
export const DEFAULT_ADSR: ADSREnvelope = {
  attack: 0,
  decay: 0,
  sustain: 1.0,
  release: 0,
} as const;

/** Keys that cannot be bound to pads */
export const RESERVED_KEYS: ReadonlySet<string> = new Set([
  'Space', 'Escape', 'KeyI', 'KeyO', 'KeyP',
  'Tab', 'Enter', 'Backspace', 'Delete',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'MetaLeft', 'MetaRight', 'ControlLeft', 'ControlRight',
  'AltLeft', 'AltRight', 'ShiftLeft', 'ShiftRight',
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6',
  'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
]);

/** Map KeyboardEvent.code to display label */
export function codeToLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}
