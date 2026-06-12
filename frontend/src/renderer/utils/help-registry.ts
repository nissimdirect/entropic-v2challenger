/**
 * Hover-help content registry (P3.4).
 *
 * Maps data-help-id attribute values to plaintext help strings.
 * ALL strings are PLAINTEXT — never rendered via dangerouslySetInnerHTML.
 * XSS guard (qa-redteam M5): consumers must use textContent / React children only.
 *
 * Conventions:
 *  - Keys: kebab-case matching the data-help-id attribute value
 *  - Values: ≤140 chars, plaintext, no HTML, no control chars
 *  - Preset names / user content must be sanitized before storage (64-char cap,
 *    control-char strip) — see sanitizeHelpText()
 */
export type HelpId = string

export interface HelpEntry {
  title: string
  body: string
}

const REGISTRY: Record<string, HelpEntry> = {
  // --- Transport tools ---
  'tool-select': {
    title: 'Select (V)',
    body: 'Default pointer mode. Click clips, tracks, or effects to select them.',
  },
  'tool-razor': {
    title: 'Razor (B)',
    body: 'Split clips at the cursor position. Click on a clip to cut it in two.',
  },
  'tool-slip': {
    title: 'Slip (S)',
    body: 'Slip the clip content without moving the clip bounds in the timeline.',
  },
  'tool-slide': {
    title: 'Slide (D)',
    body: 'Slide a clip and its neighbors together, keeping the total length constant.',
  },
  'tool-ripple-delete': {
    title: 'Ripple Delete (X)',
    body: 'Delete the clip under the cursor and pull subsequent clips to close the gap.',
  },
  'tool-marker': {
    title: 'Marker (Shift+M)',
    body: 'Place a named marker at the cursor. Drag to move; double-click to rename.',
  },
  'tool-range-select': {
    title: 'Range Select (R)',
    body: 'Draw a selection rectangle to select all clips within the range.',
  },

  // --- Loop / quantize ---
  'loop-toggle': {
    title: 'Loop Toggle (Cmd+L)',
    body: 'Enable or disable timeline looping between the Loop In and Loop Out points.',
  },
  'loop-in': {
    title: 'Loop In (I)',
    body: 'Set the loop start point at the current playhead position.',
  },
  'loop-out': {
    title: 'Loop Out (O)',
    body: 'Set the loop end point at the current playhead position.',
  },
  'quantize-toggle': {
    title: 'Quantize (Cmd+U)',
    body: 'Snap clip edges and cut points to the quantize grid division.',
  },
  'grid-up': {
    title: 'Grid Up (])',
    body: 'Halve the quantize grid division (e.g. 1/4 → 1/8). Finer resolution.',
  },
  'grid-down': {
    title: 'Grid Down ([)',
    body: 'Double the quantize grid division (e.g. 1/4 → 1/2). Coarser resolution.',
  },

  // --- Preview ---
  'toggle-popout': {
    title: 'Pop-out Preview (Cmd+Shift+P)',
    body: 'Open or close the detached preview window.',
  },

  // --- Inspector states ---
  'inspector-none': {
    title: 'Project Info',
    body: 'No selection. Click a clip, track, or effect to see its details here.',
  },
  'inspector-track': {
    title: 'Track Info',
    body: 'Shows the selected track name, effect count, and automation lane count.',
  },
  'inspector-clip': {
    title: 'Clip Info',
    body: 'Shows clip name, source file, start time, and duration.',
  },
  'inspector-effect': {
    title: 'Effect Info',
    body: 'Shows the selected effect type and its parameter count.',
  },
  'inspector-operator': {
    title: 'Operator Info',
    body: 'Shows the operator type and its modulation output wiring.',
  },
  'inspector-marker': {
    title: 'Marker Info',
    body: 'Shows the marker name and timeline position.',
  },
}

/** Look up a help entry by data-help-id. Returns undefined when id is unknown. */
export function getHelpEntry(id: HelpId): HelpEntry | undefined {
  return REGISTRY[id]
}

/**
 * Sanitize user-supplied text before storing it as a help body.
 * - Truncates to 64 chars (preset name max).
 * - Strips control characters (U+0000–U+001F except U+0009 TAB, U+000A LF).
 * - Never HTML-encodes — the consumer renders as textContent.
 */
export function sanitizeHelpText(raw: string): string {
  // Strip control chars (keep tab and newline for readability)
  // eslint-disable-next-line no-control-regex
  const stripped = raw.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
  return stripped.slice(0, 64)
}
