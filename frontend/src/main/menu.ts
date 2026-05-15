import { Menu, BrowserWindow } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'

const isMac = process.platform === 'darwin'

/**
 * Send a menu action to the renderer via the multiplexed 'menu:action' channel.
 * Guards against destroyed window (quit race condition).
 */
function sendAction(win: BrowserWindow, action: string): void {
  if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
    win.webContents.send('menu:action', action)
  }
}

/**
 * Build and set the application menu.
 * Renderer owns all keyboard dispatch — menu items show shortcut labels
 * but do NOT use the accelerator field for renderer-state actions.
 * OS actions (Quit, Hide, Cut/Copy/Paste) use Electron roles.
 */
export function buildMenu(mainWindow: BrowserWindow): void {
  const fileMenu: MenuItemConstructorOptions = {
    label: 'File',
    submenu: [
      { label: 'New Project\tCmdOrCtrl+N', click: () => sendAction(mainWindow, 'new-project') },
      { label: 'Open Project...\tCmdOrCtrl+O', click: () => sendAction(mainWindow, 'open-project') },
      { type: 'separator' },
      { label: 'Import Media...\tCmdOrCtrl+I', click: () => sendAction(mainWindow, 'import-media') },
      { label: 'Add Text Track\tCmdOrCtrl+T', click: () => sendAction(mainWindow, 'add-text-track') },
      { type: 'separator' },
      { label: 'Save\tCmdOrCtrl+S', click: () => sendAction(mainWindow, 'save') },
      { label: 'Save As...\tCmdOrCtrl+Shift+S', click: () => sendAction(mainWindow, 'save-as') },
      { type: 'separator' },
      { label: 'Export...\tCmdOrCtrl+E', click: () => sendAction(mainWindow, 'export') },
    ],
  }

  const editMenu: MenuItemConstructorOptions = {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      // F-0514-18: surface the existing HistoryPanel (was orphaned in Phase 13C
      // when EffectRack→DeviceChain refactor removed its sidebar mount).
      { label: 'Undo History', click: () => sendAction(mainWindow, 'show-history') },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      ...(isMac ? [{ role: 'pasteAndMatchStyle' as const }] : []),
      { role: 'delete' },
    ],
  }

  const selectMenu: MenuItemConstructorOptions = {
    label: 'Select',
    submenu: [
      { label: 'Select All Clips\tCmdOrCtrl+A', click: () => sendAction(mainWindow, 'select-all-clips') },
      { label: 'Deselect All', click: () => sendAction(mainWindow, 'deselect-all') },
      { label: 'Invert Selection', click: () => sendAction(mainWindow, 'invert-selection') },
      { type: 'separator' },
      { label: 'Select Clips on Track', click: () => sendAction(mainWindow, 'select-by-track') },
    ],
  }

  const clipMenu: MenuItemConstructorOptions = {
    label: 'Clip',
    submenu: [
      { label: 'Split at Playhead\tCmdOrCtrl+K', click: () => sendAction(mainWindow, 'split-at-playhead') },
      { type: 'separator' },
      { label: 'Speed/Duration...', click: () => sendAction(mainWindow, 'clip-speed') },
      { label: 'Reverse', click: () => sendAction(mainWindow, 'clip-reverse') },
      { type: 'separator' },
      { label: 'Enable/Disable', click: () => sendAction(mainWindow, 'clip-toggle-enabled') },
    ],
  }

  const timelineMenu: MenuItemConstructorOptions = {
    label: 'Timeline',
    submenu: [
      { label: 'Add Video Track', click: () => sendAction(mainWindow, 'add-video-track') },
      { label: 'Add Text Track\tCmdOrCtrl+T', click: () => sendAction(mainWindow, 'add-text-track') },
      { type: 'separator' },
      { label: 'Delete Selected Track', click: () => sendAction(mainWindow, 'delete-selected-track') },
      { type: 'separator' },
      { label: 'Move Track Up', click: () => sendAction(mainWindow, 'move-track-up') },
      { label: 'Move Track Down', click: () => sendAction(mainWindow, 'move-track-down') },
    ],
  }

  const adjustmentsMenu: MenuItemConstructorOptions = {
    label: 'Adjustments',
    submenu: [
      { label: 'Curves', click: () => sendAction(mainWindow, 'add-effect:util.curves') },
      { label: 'Levels', click: () => sendAction(mainWindow, 'add-effect:util.levels') },
      { label: 'Auto Levels', click: () => sendAction(mainWindow, 'add-effect:util.auto_levels') },
      { type: 'separator' },
      { label: 'HSL Adjust', click: () => sendAction(mainWindow, 'add-effect:util.hsl_adjust') },
      { label: 'Color Balance', click: () => sendAction(mainWindow, 'add-effect:util.color_balance') },
      { label: 'Color Temperature', click: () => sendAction(mainWindow, 'add-effect:fx.color_temperature') },
      { type: 'separator' },
      { label: 'Brightness / Exposure', click: () => sendAction(mainWindow, 'add-effect:fx.brightness_exposure') },
      { label: 'Contrast Crush', click: () => sendAction(mainWindow, 'add-effect:fx.contrast_crush') },
      { label: 'Saturation Warp', click: () => sendAction(mainWindow, 'add-effect:fx.saturation_warp') },
      { type: 'separator' },
      { label: 'Color Invert', click: () => sendAction(mainWindow, 'add-effect:fx.color_invert') },
      { label: 'Color Filter', click: () => sendAction(mainWindow, 'add-effect:fx.color_filter') },
      { label: 'Posterize', click: () => sendAction(mainWindow, 'add-effect:fx.posterize') },
      { label: 'Duotone', click: () => sendAction(mainWindow, 'add-effect:fx.duotone') },
      { label: 'False Color', click: () => sendAction(mainWindow, 'add-effect:fx.false_color') },
      { type: 'separator' },
      { label: 'Cyanotype', click: () => sendAction(mainWindow, 'add-effect:fx.cyanotype') },
      { label: 'Infrared', click: () => sendAction(mainWindow, 'add-effect:fx.infrared') },
      { label: 'Tape Saturation', click: () => sendAction(mainWindow, 'add-effect:fx.tape_saturation') },
    ],
  }

  const viewMenu: MenuItemConstructorOptions = {
    label: 'View',
    submenu: [
      { label: 'Toggle Sidebar\tCmdOrCtrl+B', click: () => sendAction(mainWindow, 'toggle-sidebar') },
      { label: 'Toggle Focus Mode\tF', click: () => sendAction(mainWindow, 'toggle-focus') },
      { label: 'Toggle Automation\tA', click: () => sendAction(mainWindow, 'toggle-automation') },
      { type: 'separator' },
      { label: 'Zoom In\tCmdOrCtrl+=', click: () => sendAction(mainWindow, 'zoom-in') },
      { label: 'Zoom Out\tCmdOrCtrl+-', click: () => sendAction(mainWindow, 'zoom-out') },
      { label: 'Zoom to Fit\tCmdOrCtrl+0', click: () => sendAction(mainWindow, 'zoom-fit') },
      { type: 'separator' },
      { label: 'Toggle Quantize\tCmdOrCtrl+U', click: () => sendAction(mainWindow, 'toggle-quantize') },
    ],
  }

  const helpMenu: MenuItemConstructorOptions = {
    label: 'Help',
    submenu: [
      { label: 'Keyboard Shortcuts', click: () => sendAction(mainWindow, 'show-shortcuts') },
      { label: 'Send Feedback\tCmdOrCtrl+Shift+F', click: () => sendAction(mainWindow, 'show-feedback') },
      { label: 'Generate Support Bundle\tCmdOrCtrl+Shift+D', click: () => sendAction(mainWindow, 'support-bundle') },
    ],
  }

  const appMenu: MenuItemConstructorOptions = {
    label: 'Entropic',
    submenu: [
      { role: 'about', label: 'About Entropic' },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide', label: 'Hide Entropic' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit', label: 'Quit Entropic' },
    ],
  }

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [appMenu] : []),
    fileMenu,
    editMenu,
    selectMenu,
    clipMenu,
    timelineMenu,
    adjustmentsMenu,
    viewMenu,
    ...(isMac ? [{ role: 'windowMenu' as const }] : []),
    helpMenu,
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
