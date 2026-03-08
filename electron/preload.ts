import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Config
  getConfig: (): Promise<any> =>
    ipcRenderer.invoke('config:get'),
  updateSettings: (settings: any): Promise<any> =>
    ipcRenderer.invoke('config:update-settings', settings),
  setFirstRunComplete: (): Promise<void> =>
    ipcRenderer.invoke('config:set-first-run-complete'),

  // Registry
  getRegistry: (): Promise<any[]> =>
    ipcRenderer.invoke('registry:get-all'),

  // Launcher info
  getVersion: (): Promise<string> =>
    ipcRenderer.invoke('launcher:get-version'),

  // Releases
  checkAllReleases: (): Promise<any> =>
    ipcRenderer.invoke('releases:check-all'),
  checkOneRelease: (appId: string): Promise<any> =>
    ipcRenderer.invoke('releases:check-one', appId),
  checkLauncherUpdate: (): Promise<any> =>
    ipcRenderer.invoke('launcher:check-update'),

  // Launch & Management
  launchApp: (appId: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('app:launch', appId),
  openFolder: (appId: string): Promise<void> =>
    ipcRenderer.invoke('app:open-folder', appId),
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke('launcher:open-external', url),

  // Install / Uninstall
  installApp: (options: any): Promise<any> =>
    ipcRenderer.invoke('app:install', options),
  cancelInstall: (appId: string): Promise<void> =>
    ipcRenderer.invoke('app:cancel-install', appId),
  uninstallApp: (appId: string): Promise<any> =>
    ipcRenderer.invoke('app:uninstall', appId),
  verifyInstallation: (appId: string): Promise<boolean> =>
    ipcRenderer.invoke('app:verify-installation', appId),
  selectDirectory: (defaultPath: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:select-directory', defaultPath),

  // Events (Main -> Renderer)
  onDownloadProgress: (callback: (data: any) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('download:progress', handler);
    return () => ipcRenderer.removeListener('download:progress', handler);
  },

  onLauncherUpdateAvailable: (callback: (data: any) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('launcher:update-available', handler);
    return () => ipcRenderer.removeListener('launcher:update-available', handler);
  },

  onAppStatusChanged: (callback: (data: any) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('app:status-changed', handler);
    return () => ipcRenderer.removeListener('app:status-changed', handler);
  },
});
