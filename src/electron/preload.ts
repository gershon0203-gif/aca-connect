import { contextBridge, ipcRenderer } from 'electron'

// Expose a limited, secure API to the renderer process.
// Only whitelisted IPC channels are exposed — nothing sensitive.
contextBridge.exposeInMainWorld('electronAPI', {
  getPlatform: () => ipcRenderer.invoke('app:get-platform'),
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  minimize: () => ipcRenderer.invoke('app:minimize'),
  maximize: () => ipcRenderer.invoke('app:maximize'),
  close: () => ipcRenderer.invoke('app:close'),
  notify: (payload: { title: string; body: string; tag?: string }) =>
    ipcRenderer.invoke('app:notify', payload),
  notificationPermission: () =>
    ipcRenderer.invoke('app:notification-permission'),
  openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url),

  // Automatic update actions (renderer -> main process)
  checkForUpdates: () => ipcRenderer.invoke('app:check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('app:download-update'),
  installUpdate: () => ipcRenderer.invoke('app:install-update'),

  // Subscribe to update events broadcast from the main process
  onUpdateAvailable: (handler: (info: { version: string; releaseNotes?: string }) => void) => {
    const wrapper = (_event: Electron.IpcRendererEvent, info: { version: string; releaseNotes?: string }) => handler(info)
    ipcRenderer.on('update-available', wrapper)
    return () => ipcRenderer.off('update-available', wrapper)
  },
  onUpdateDownloaded: (handler: (info: { version: string }) => void) => {
    const wrapper = (_event: Electron.IpcRendererEvent, info: { version: string }) => handler(info)
    ipcRenderer.on('update-downloaded', wrapper)
    return () => ipcRenderer.off('update-downloaded', wrapper)
  },
  onUpdateError: (handler: (message: string) => void) => {
    const wrapper = (_event: Electron.IpcRendererEvent, message: string) => handler(message)
    ipcRenderer.on('update-error', wrapper)
    return () => ipcRenderer.off('update-error', wrapper)
  },
  onUpdateChecking: (handler: () => void) => {
    const wrapper = () => handler()
    ipcRenderer.on('update-checking', wrapper)
    return () => ipcRenderer.off('update-checking', wrapper)
  },
  onUpdateNotAvailable: (handler: () => void) => {
    const wrapper = () => handler()
    ipcRenderer.on('update-not-available', wrapper)
    return () => ipcRenderer.off('update-not-available', wrapper)
  },
})

declare global {
  interface Window {
    electronAPI: {
      getPlatform: () => Promise<string>
      getVersion: () => Promise<string>
      minimize: () => Promise<void>
      maximize: () => Promise<void>
      close: () => Promise<void>
      notify: (payload: { title: string; body: string; tag?: string }) => Promise<{ success: boolean; error?: string }>
      notificationPermission: () => Promise<string>
      openExternal: (url: string) => Promise<{ success: boolean }>
      checkForUpdates: () => Promise<{ available: boolean; reason?: string; error?: string }>
      downloadUpdate: () => Promise<{ success: boolean; error?: string }>
      installUpdate: () => Promise<{ success: boolean; error?: string }>
      onUpdateAvailable: (handler: (info: { version: string; releaseNotes?: string }) => void) => () => void
      onUpdateDownloaded: (handler: (info: { version: string }) => void) => () => void
      onUpdateError: (handler: (message: string) => void) => () => void
      onUpdateChecking: (handler: () => void) => () => void
      onUpdateNotAvailable: (handler: () => void) => () => void
    }
  }
}