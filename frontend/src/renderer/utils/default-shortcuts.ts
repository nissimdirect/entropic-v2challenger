// Default keyboard shortcut bindings for Entropic v2
// Perform mode pad triggers are NOT included here — they use e.code
// and are handled separately in the perform mode system.

import { ShortcutBinding } from './shortcuts'

export const DEFAULT_SHORTCUTS: ShortcutBinding[] = [
  // --- Transport ---
  { action: 'play_pause',       keys: 'space',          category: 'transport', label: 'Play / Pause',        context: 'normal' },

  // --- Edit ---
  { action: 'undo',             keys: 'meta+z',         category: 'edit',      label: 'Undo',                context: 'normal' },
  { action: 'redo',             keys: 'meta+shift+z',   category: 'edit',      label: 'Redo',                context: 'normal' },

  // --- Timeline ---
  { action: 'split_clip',       keys: 'meta+shift+k',   category: 'timeline',  label: 'Split Clip',          context: 'normal' },
  { action: 'add_marker',       keys: 'meta+m',         category: 'timeline',  label: 'Add Marker',          context: 'normal' },
  { action: 'loop_in',          keys: 'i',              category: 'timeline',  label: 'Set Loop In',         context: 'normal' },
  { action: 'loop_out',         keys: 'o',              category: 'timeline',  label: 'Set Loop Out',        context: 'normal' },

  // --- View ---
  { action: 'toggle_automation', keys: 'a',             category: 'view',      label: 'Toggle Automation',   context: 'normal' },
  { action: 'toggle_sidebar',   keys: 'meta+b',         category: 'view',      label: 'Toggle Sidebar',      context: 'normal' },
  { action: 'toggle_focus',     keys: 'f',              category: 'view',      label: 'Toggle Focus Mode',   context: 'normal' },
  { action: 'zoom_in',          keys: 'meta+=',         category: 'view',      label: 'Zoom In',             context: 'normal' },
  { action: 'zoom_out',         keys: 'meta+-',         category: 'view',      label: 'Zoom Out',            context: 'normal' },
  { action: 'zoom_fit',         keys: 'meta+0',         category: 'view',      label: 'Zoom to Fit',         context: 'normal' },

  // --- Project ---
  { action: 'save',             keys: 'meta+s',         category: 'project',   label: 'Save Project',        context: 'normal' },
  { action: 'open',             keys: 'meta+o',         category: 'project',   label: 'Open Project',        context: 'normal' },
  { action: 'new_project',      keys: 'meta+n',         category: 'project',   label: 'New Project',         context: 'normal' },
  { action: 'export',           keys: 'meta+e',         category: 'project',   label: 'Export',              context: 'normal' },
  { action: 'toggle_perform',   keys: 'p',              category: 'project',   label: 'Toggle Perform Mode', context: 'normal' },
]
