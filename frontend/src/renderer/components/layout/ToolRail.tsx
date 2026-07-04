import { useEffect } from 'react'
import { useLayoutStore } from '../../stores/layout'
import ToolIcon from '../../assets/tool-icons'
import {
  TOOL_ENTRIES,
  MASK_TOOL_ENTRIES,
  TOOL_ICON,
  selectCursorTool,
  type CursorTool,
} from '../effects/EffectBrowser'
import { shortcutRegistry } from '../../utils/shortcuts'
import { prettyShortcut } from '../../utils/pretty-shortcut'
// tool-rail.css is imported centrally in App.tsx, matching this codebase's
// convention (creatrix-layout.css, global.css) — no per-component CSS imports.

/**
 * L-block (GH issue 422): Photoshop-style left tool rail.
 * Reference mockup: docs/roadmap/layout-session/challengers/challenger-b3-arrangement.html
 * `.rail` element — 4 groups (TRNS/EDIT/MASK/MISC), 14 tools, acid-wash active state.
 *
 * Reuses TOOL_ENTRIES + MASK_TOOL_ENTRIES + TOOL_ICON + selectCursorTool from
 * EffectBrowser.tsx (the [tool] tab's canonical lists + selection logic)
 * rather than redefining them, so the rail and the browser tab can never
 * drift out of sync — both read/write the same
 * useLayoutStore.cursorTool/setCursorTool.
 *
 * Mounted by App.tsx only under FF.F_CREATRIX_LAYOUT (left of the preview canvas).
 */

// Groups mirror the mockup's TRNS/EDIT/MASK/MISC split. 'select' (Transform)
// is its own group; razor/slip/slide/ripple-delete are EDIT; all 6 mask tools
// are MASK; marker/loop-in/loop-out are MISC. 1 + 4 + 6 + 3 = 14 tools.
const RAIL_GROUPS: Array<{ label: string; ids: CursorTool[] }> = [
  { label: 'TRNS', ids: ['select'] },
  { label: 'EDIT', ids: ['razor', 'slip', 'slide', 'ripple-delete'] },
  { label: 'MASK', ids: MASK_TOOL_ENTRIES.map((e) => e.id) },
  { label: 'MISC', ids: ['marker', 'loop-in', 'loop-out'] },
]

const ALL_ENTRIES = [...TOOL_ENTRIES, ...MASK_TOOL_ENTRIES]
const LABEL_BY_ID = new Map(ALL_ENTRIES.map((e) => [e.id, e.label]))

// Maps a CursorTool to the shortcutRegistry action that sets it. Only tools
// with an ACTUALLY-REGISTERED keyboard handler get an entry here (verified
// against the `shortcutRegistry.register('tool_*', ...)` calls in App.tsx) —
// 'slip'/'slide' are deliberately omitted: default-shortcuts.ts lists
// tool_slip/tool_slide, but App.tsx never registers a handler for them yet
// ("slip/slide are intentionally NOT wired here" — later packet), so showing
// a hotkey badge for them would advertise a key press that does nothing.
// 'tool_marquee'/'tool_lasso' each toggle between two CursorTool values
// (App.tsx MK.5), so both entries below share one action/key.
const HOTKEY_ACTION: Partial<Record<CursorTool, string>> = {
  select: 'tool_select',
  razor: 'tool_razor',
  'ripple-delete': 'tool_ripple_delete',
  marker: 'tool_marker',
  'mask-marquee-rect': 'tool_marquee',
  'mask-marquee-ellipse': 'tool_marquee',
  'mask-lasso-freehand': 'tool_lasso',
  'mask-lasso-polygon': 'tool_lasso',
}

/**
 * Reads the LIVE effective key (default or user-remapped via ShortcutEditor.tsx)
 * from shortcutRegistry — the same `prettyShortcut(shortcutRegistry.getEffectiveKey(...))`
 * idiom used at every other hotkey-badge call site in this codebase (Clip.tsx,
 * DeviceChain.tsx). A static DEFAULT_SHORTCUTS lookup would go stale the moment
 * a user remaps a tool shortcut in Preferences → Keyboard Shortcuts.
 */
function hotkeyFor(id: CursorTool): string | undefined {
  const action = HOTKEY_ACTION[id]
  if (!action) return undefined
  return prettyShortcut(shortcutRegistry.getEffectiveKey(action))
}

export default function ToolRail() {
  const cursorTool = useLayoutStore((s) => s.cursorTool)
  const setCursorTool = useLayoutStore((s) => s.setCursorTool)

  // Expose cursor tool on body for statusbar chip reads (mirrors EffectBrowser's
  // identical effect). ToolRail is mounted unconditionally under the flag while
  // EffectBrowser only mounts while the sidebar [tool] tab is active, so this
  // rail is the reliable writer whenever a user is on a different sidebar tab.
  // Both effects writing the same value when both are mounted is idempotent.
  useEffect(() => {
    document.body.setAttribute('data-cursor-tool', cursorTool)
    return () => {
      document.body.removeAttribute('data-cursor-tool')
    }
  }, [cursorTool])

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
                onClick={() => selectCursorTool(id, setCursorTool)}
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
