/**
 * MIDI utility functions.
 */

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Convert MIDI note number to name. Uses octave convention where middle C (60) = "C4".
 */
export function midiNoteToName(note: number): string {
  if (note < 0 || note > 127 || !Number.isInteger(note)) return '?';
  const name = NOTE_NAMES[note % 12];
  const octave = Math.floor(note / 12) - 1;
  return `${name}${octave}`;
}
