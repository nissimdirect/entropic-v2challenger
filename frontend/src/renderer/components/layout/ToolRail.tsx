import { useCallback } from 'react'
import { useLayoutStore } from '../../stores/layout'
import { useTimelineStore } from '../../stores/timeline'
import ToolIcon from '../../assets/tool-icons'
import {
  TOOL_ENTRIES,
  MASK_TOOL_ENTRIES,
  TOOL_ICON,
  isTextInputActive,
  type CursorTool,
} from '../effects/EffectBrowser'
import { DEFAULT_SHORTCUTS } from '../../utils/default-shortcuts'
import { prettyShortcut } from '../../utils/pretty-shortcut'
// tool-rail.css is imported centrally in App.tsx, matching this codebase's
// convention (creatrix-layout.css, global.css) — no per-component CSS imports.

/**
 * L-block (GH issue 422): Photoshop-style left tool rail.
 * Reference mockup: docs/roadmap/layout-session/challengers/challenger-b3-arrangement.html
 * `.rail` element — 4 groups (TRNS/EDIT/MASK/MISC), 14 tools, acid-wash active state.
 *
 * Reuses TOOL_ENTRIES + MASK_TOOL_ENTRIES + TOOL_ICON from EffectBrowser.tsx
 * (the [tool] tab's canonical lists) rather than redefining the tool set, so
 * the rail and the browser tab can never drift out of sync — both read the
 * same useLayoutStore.cursorTool/setCursorTool.
 *
 * Mounted by App.tsx only under FF.F_CREATRIX_LAYOUT (left of the preview canvas).
 */

// Groups mirror the mockup's TRNS/EDIT/MASK/MISC split. 'select' (Transform)
// is its own group; razor/slip/slide/ripple-delete are EDIT; all 6 mask tools
// are MASK; marker/loop-in/loop-out (no keyboard-wired cursor-tool hotkey of
// their own — see HOTKEY_ACTION below) are MISC. 1 + 4 + 6 + 3 = 14 tools.
const RAIL_GROUPS: Array<{ label: string; ids: CursorTool[] }> = [
  { label: 'TRNS', ids: ['select'] },
  { label: 'EDIT', ids: ['razor', 'slip', 'slide', 'ripple-delete'] },
  { label: 'MASK', ids: MASK_TOOL_ENTRIES.map((e) => e.id) },
  { label: 'MISC', ids: ['marker', 'loop-in', 'loop-out'] },
]

const ALL_ENTRIES = [...TOOL_ENTRIES, ...MASK_TOOL_ENTRIES]
const LABEL_BY_ID = new Map(ALL_ENTRIES.map((e) => [e.id, e.label]))

// Maps a CursorTool to the shortcutRegistry action that sets it, so the rail's
// hotkey badge is read from DEFAULT_SHORTCUTS (single source of truth) instead
// of a second hardcoded key table. 'tool_marquee'/'tool_lasso' each toggle
// between two CursorTool values (App.tsx MK.5), so both entries share one key.
// wand/key-picker/loop-in/loop-out have no dedicated cursor-tool hotkey today
// — omitted here rather than inventing one.
const HOTKEY_ACTION: Partial<Record<CursorTool, string>> = {
  select: 'tool_select',
  razor: 'tool_razor',
  slip: 'tool_slip',
  slide: 'tool_slide',
  'ripple-delete': 'tool_ripple_delete',
  marker: 'tool_marker',
  'mask-marquee-rect': 'tool_marquee',
  'mask-marquee-ellipse': 'tool_marquee',
  'mask-lasso-freehand': 'tool_lasso',
  'mask-lasso-polygon': 'tool_lasso',
}

function hotkeyFor(id: CursorTool): string | undefined {
  const action = HOTKEY_ACTION[id]
  if (!action) return undefined
  const binding = DEFAULT_SHORTCUTS.find((s) => s.action === action)
  return prettyShortcut(binding?.keys)
}

export default function ToolRail() {
  const cursorTool = useLayoutStore((s) => s.cursorTool)
  const setCursorTool = useLayoutStore((s) => s.setCursorTool)

  // Verbatim copy of EffectBrowser's handleToolSelect body (isTextInputActive
  // guard + mask-tool → previewToolMode wiring) so clicking a rail button has
  // IDENTICAL side effects to clicking the matching [tool] tab button.
  const handleSelect = useCallback(
    (tool: CursorTool) => {
      if (isTextInputActive()) return
      setCursorTool(tool)
      const maskEntry = MASK_TOOL_ENTRIES.find((e) => e.id === tool)
      useTimelineStore.getState().setPreviewToolMode(maskEntry ? maskEntry.previewMode : null)
    },
    [setCursorTool],
  )

  return (
    <div className="tool-rail" data-testid="tool-rail">
      {RAIL_GROUPS.map((group) => (
        <div className="tool-rail__group" key={group.label} data-testid={`tool-rail-group-${group.label}`}>
          <div className="tool-rail__group-label">{group.label}</div>
          {group.ids.map((id) => {
            const label = LABEL_BY_ID.get(id) ?? id
            const icon = TOOL_ICON[id]
            const hotkey = hotkeyFor(id)
            const isActive = cursorTool === id
            return (
              <button
                key={id}
                type="button"
                className={`tool-rail__tool${isActive ? ' tool-rail__tool--active' : ''}`}
                onClick={() => handleSelect(id)}
                title={hotkey ? `${label} (${hotkey})` : label}
                aria-label={label}
                aria-pressed={isActive}
                data-testid={`tool-rail-item-${id}`}
              >
                {icon ? (
                  <ToolIcon name={icon} size={18} />
                ) : (
                  <span className="tool-rail__fallback-label">{label.slice(0, 2).toUpperCase()}</span>
                )}
                {hotkey && <span className="tool-rail__hotkey">{hotkey}</span>}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
