/**
 * Auto-update module using electron-updater.
 * Checks for updates on launch (non-blocking).
 * Uses GitHub Releases as the update source.
 */
import { BrowserWindow, ipcMain } from 'electron'
import { logger } from './logger'

let autoUpdater: any = null

export function initAutoUpdater(mainWindow: BrowserWindow): void {
  try {
    // Dynamic import — graceful if electron-updater not installed
    const { autoUpdater: au } = require('electron-updater')
    autoUpdater = au
  } catch {
    logger.info('[Updater] electron-updater not available — skipping auto-update')
    return
  }

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info: any) => {
    logger.info('[Updater] Update available', { version: info.version })
    mainWindow.webContents.send('update-available', {
      version: info.version,
      releaseDate: info.releaseDate,
    })
  })

  autoUpdater.on('update-downloaded', (info: any) => {
    logger.info('[Updater] Update downloaded', { version: info.version })
    mainWindow.webContents.send('update-downloaded', {
      version: info.version,
    })
  })

  autoUpdater.on('error', (err: Error) => {
    logger.warn('[Updater] Error', { error: err.message })
    // Silent — don't bother the user
  })

  // IPC handlers for renderer-initiated actions
  ipcMain.handle('updater:download', () => {
    return downloadUpdate()
  })

  ipcMain.handle('updater:install', () => {
    installUpdate()
  })

  // Check for updates after a short delay (don't block startup)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err: Error) => {
      logger.warn('[Updater] Check failed', { error: err.message })
    })
  }, 5000)
}

function downloadUpdate(): void {
  if (autoUpdater) {
    autoUpdater.downloadUpdate().catch((err: Error) => {
      logger.warn('[Updater] Download failed', { error: err.message })
    })
  }
}

function installUpdate(): void {
  if (autoUpdater) {
    autoUpdater.quitAndInstall()
  }
}
