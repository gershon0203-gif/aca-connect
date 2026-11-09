import { app, BrowserWindow, ipcMain, Notification, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import path from 'node:path'
import fs from 'node:fs'

// The Vite dev server URL in development
const VITE_DEV_SERVER_URL = 'http://localhost:5199'

// Path to the built web assets in production
// In production, __dirname is .../resources/app.asar.unpacked/dist-electron/
// The renderer dist/ is inside app.asar at .../resources/app.asar/dist/
const DIST_PATH = path.join(__dirname, '..', '..', 'app.asar', 'dist')

let mainWindow: BrowserWindow | null = null

// ---------------------------------------------------------------------------
// Automatic updates (electron-updater, GitHub Releases provider)
// ---------------------------------------------------------------------------
// Only active in packaged production builds. In development, autoUpdater is a
// no-op and all IPC update handlers return "not available" so dev work is
// never interrupted by update checks.

function configureAutoUpdater(): void {
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    return
  }

  // Only check stable releases — drafts, prereleases and nightly builds are
  // ignored by electron-updater when the provider is GitHub.
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('checking-for-update', () => {
    console.log('[autoUpdater] Checking for update…')
    mainWindow?.webContents.send('update-checking')
  })

  autoUpdater.on('update-available', (info) => {
    console.log('[autoUpdater] Update available:', info.version)
    mainWindow?.webContents.send('update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes,
      releaseDate: info.releaseDate,
      files: info.files,
    })
  })

  autoUpdater.on('update-not-available', (info) => {
    console.log('[autoUpdater] No update available', info?.version ?? 'n/a')
    mainWindow?.webContents.send('update-not-available')
  })

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('update-download-progress', {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    })
  })

  autoUpdater.on('update-downloaded', (info: any) => {
    console.log('[autoUpdater] Update downloaded:', info.version)
    mainWindow?.webContents.send('update-downloaded', {
      version: info.version,
      releaseNotes: info.releaseNotes,
      releaseDate: info.releaseDate,
      path: info.filePath,
    })
  })

  autoUpdater.on('error', (err) => {
    console.error('[autoUpdater] Error:', err.message)
    mainWindow?.webContents.send('update-error', err.message ?? String(err))
  })
}

function startPeriodicUpdateChecks(): void {
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    return
  }
  // Check for updates every 6 hours while the app is running.
  const INTERVAL_MS = 6 * 60 * 60 * 1000
  setInterval(() => {
    console.log('[autoUpdater] Periodic update check')
    void autoUpdater.checkForUpdates().catch((err) => {
      console.error('[autoUpdater] Periodic check failed:', err.message)
    })
  }, INTERVAL_MS)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    center: true,
    show: false,
    title: 'ACA Connect — Pozhichalur Ministries',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !app.isPackaged,
    },
  })

  // Open DevTools only in development builds.
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Log load failures to a file in userData so we can diagnose blank windows
  const logFile = path.join(app.getPath('userData'), 'renderer-error.log')
  const logError = (message: string) => {
    try {
      fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`)
    } catch {
      // ignore
    }
  }

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    logError(`did-fail-load: code=${errorCode} desc=${errorDescription} url=${validatedURL}`)
    console.error('Renderer failed to load:', errorCode, errorDescription, validatedURL)
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logError(`render-process-gone: reason=${details.reason} exitCode=${details.exitCode}`)
    console.error('Render process gone:', details)
  })

  // In development, load from the Vite dev server
  // In production, load the built index.html from inside app.asar
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
  } else {
    const indexPath = path.join(DIST_PATH, 'index.html')
    // Verify the file exists before attempting to load
    if (fs.existsSync(indexPath)) {
      try {
        mainWindow.loadFile(indexPath)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        logError(`loadFile error: ${msg}`)
        console.error('Failed to load index.html:', err)
        mainWindow?.webContents.openDevTools()
      }
    } else {
      logError(`index.html not found at: ${indexPath}`)
      console.error('index.html not found at:', indexPath)
      mainWindow?.webContents.openDevTools()
    }
  }

  // Open external links in the default browser, not in the app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  createWindow()
  configureAutoUpdater()
  startPeriodicUpdateChecks()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Secure IPC: expose only safe, read-only information to the renderer
ipcMain.handle('app:get-platform', () => {
  return process.platform
})

ipcMain.handle('app:get-version', () => {
  return app.getVersion()
})

ipcMain.handle('app:minimize', () => {
  mainWindow?.minimize()
})

ipcMain.handle('app:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.restore()
  } else {
    mainWindow?.maximize()
  }
})

ipcMain.handle('app:close', () => {
  mainWindow?.close()
})

// Desktop notification support (Windows native notifications)
ipcMain.handle('app:notify', async (_event, { title, body }) => {
  if (!Notification.isSupported()) {
    return { success: false, error: 'Notifications not supported on this platform' }
  }
  const notification = new Notification({
    title,
    body,
  })
  notification.show()
  return { success: true }
})

// Check notification permission
ipcMain.handle('app:notification-permission', () => {
  return Notification.isSupported() ? 'granted' : 'denied'
})

// Open external URL in default browser
ipcMain.handle('app:open-external', async (_event, url: string) => {
  await shell.openExternal(url)
  return { success: true }
})

// ---------------------------------------------------------------------------
// Update IPC handlers
// ---------------------------------------------------------------------------

ipcMain.handle('app:check-for-updates', async () => {
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    return { available: false, reason: 'not-packaged' }
  }
  try {
    await autoUpdater.checkForUpdates()
    return { checked: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { available: false, error: message }
  }
})

ipcMain.handle('app:download-update', async () => {
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    return { success: false, error: 'not-packaged' }
  }
  try {
    await autoUpdater.downloadUpdate()
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
})

ipcMain.handle('app:install-update', async () => {
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    return { success: false, error: 'not-packaged' }
  }
  // autoUpdater.quitAndInstall() closes all windows and installs the update.
  // User consent is obtained in the renderer before this handler is called.
  autoUpdater.quitAndInstall()
  return { success: true }
})
