import { ipcMain, app, dialog, shell, BrowserWindow } from 'electron';
import { readConfig, writeConfig, updateSettings } from './config';
import { APP_REGISTRY } from './registry';
import { fetchLatestRelease } from './github';
import { checkForAppUpdates, checkForLauncherUpdate } from './updater';
import { downloadAsset, cancelDownload } from './downloader';
import { installApp, uninstallApp, verifyInstallation } from './installer';
import { launchApp, openInstallFolder } from './launcher';
import { InstallOptions, DownloadProgress } from './types';

function safeSend(win: BrowserWindow | null, channel: string, ...args: any[]): void {
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, ...args);
  }
}

export function setupIPC(getMainWindow: () => BrowserWindow | null): void {
  // --- Config ---
  ipcMain.handle('config:get', () => {
    return readConfig();
  });

  ipcMain.handle('config:update-settings', (_event, settings) => {
    return updateSettings(settings);
  });

  ipcMain.handle('config:set-first-run-complete', () => {
    const config = readConfig();
    config.firstRunComplete = true;
    writeConfig(config);
  });

  // --- Registry ---
  ipcMain.handle('registry:get-all', () => {
    return APP_REGISTRY;
  });

  // --- Launcher ---
  ipcMain.handle('launcher:get-version', () => {
    return app.getVersion();
  });

  // --- Releases ---
  ipcMain.handle('releases:check-all', async () => {
    const results = await checkForAppUpdates();
    const releaseMap: Record<string, any> = {};
    for (const r of results) {
      releaseMap[r.appId] = r.release;
    }
    return releaseMap;
  });

  ipcMain.handle('releases:check-one', async (_event, appId: string) => {
    const entry = APP_REGISTRY.find((e) => e.id === appId);
    if (!entry) return null;
    return fetchLatestRelease(entry);
  });

  ipcMain.handle('launcher:check-update', async () => {
    return checkForLauncherUpdate();
  });

  // --- Install / Uninstall ---
  ipcMain.handle('app:install', async (_event, options: InstallOptions) => {
    const entry = APP_REGISTRY.find((e) => e.id === options.appId);
    if (!entry) {
      return { success: false, appId: options.appId, version: '', installPath: '', executablePath: '', error: 'App not found in registry' };
    }

    const win = getMainWindow();

    try {
      // Fetch latest release
      const release = await fetchLatestRelease(entry);
      if (!release || !release.installerAsset) {
        return { success: false, appId: entry.id, version: '', installPath: '', executablePath: '', error: 'No installer available for this app' };
      }

      // Notify status change
      safeSend(win, 'app:status-changed', { appId: entry.id, status: 'installing' });

      // Download with progress
      const installerPath = await downloadAsset(
        entry.id,
        release.installerAsset.downloadUrl,
        release.installerAsset.name,
        (progress: DownloadProgress) => {
          safeSend(win, 'download:progress', progress);
        },
      );

      // Send installing status
      safeSend(win, 'download:progress', {
        appId: entry.id,
        status: 'installing',
        bytesDownloaded: release.installerAsset.size,
        totalBytes: release.installerAsset.size,
        speedBps: 0,
        etaSeconds: 0,
      });

      // Run installer
      const result = await installApp(entry, installerPath, options.installDir);
      result.version = release.version;

      if (result.success) {
        // Update config
        const config = readConfig();
        config.installedApps[entry.id] = {
          version: release.version,
          installPath: result.installPath,
          installedAt: new Date().toISOString(),
          lastLaunched: null,
          executablePath: result.executablePath,
        };
        writeConfig(config);

        safeSend(win, 'app:status-changed', { appId: entry.id, status: 'installed' });
        safeSend(win, 'download:progress', {
          appId: entry.id,
          status: 'complete',
          bytesDownloaded: release.installerAsset.size,
          totalBytes: release.installerAsset.size,
          speedBps: 0,
          etaSeconds: 0,
        });

        console.log(`[install] Successfully installed ${entry.id} v${release.version}`);
      } else {
        safeSend(win, 'app:status-changed', { appId: entry.id, status: 'not-installed' });
        safeSend(win, 'download:progress', {
          appId: entry.id,
          status: 'failed',
          bytesDownloaded: 0,
          totalBytes: 0,
          speedBps: 0,
          etaSeconds: 0,
          error: result.error,
        });
      }

      return result;
    } catch (err: any) {
      if (err.message === 'Cancelled') {
        safeSend(win, 'app:status-changed', { appId: entry.id, status: 'not-installed' });
        safeSend(win, 'download:progress', {
          appId: entry.id,
          status: 'cancelled',
          bytesDownloaded: 0,
          totalBytes: 0,
          speedBps: 0,
          etaSeconds: 0,
        });
        return { success: false, appId: entry.id, version: '', installPath: '', executablePath: '', error: 'Cancelled' };
      }

      safeSend(win, 'app:status-changed', { appId: entry.id, status: 'not-installed' });
      safeSend(win, 'download:progress', {
        appId: entry.id,
        status: 'failed',
        bytesDownloaded: 0,
        totalBytes: 0,
        speedBps: 0,
        etaSeconds: 0,
        error: err.message,
      });

      console.error(`[install] Failed for ${entry.id}:`, err.message);
      return { success: false, appId: entry.id, version: '', installPath: '', executablePath: '', error: err.message };
    }
  });

  ipcMain.handle('app:cancel-install', (_event, appId: string) => {
    cancelDownload(appId);
  });

  ipcMain.handle('app:uninstall', (_event, appId: string) => {
    const config = readConfig();
    const installed = config.installedApps[appId];
    if (!installed) {
      return { success: false, error: 'App is not installed' };
    }

    const result = uninstallApp(appId, installed.installPath);
    if (result.success) {
      delete config.installedApps[appId];
      writeConfig(config);
      const win = getMainWindow();
      safeSend(win, 'app:status-changed', { appId, status: 'not-installed' });
      console.log(`[install] Uninstalled ${appId}`);
    }

    return result;
  });

  // --- Dialog ---
  ipcMain.handle('dialog:select-directory', async (_event, defaultPath: string) => {
    const win = getMainWindow();
    const result = await dialog.showOpenDialog(win!, {
      defaultPath,
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Install Directory',
    });
    return result.canceled ? null : result.filePaths[0] || null;
  });

  // --- Verify ---
  ipcMain.handle('app:verify-installation', (_event, appId: string) => {
    const config = readConfig();
    const installed = config.installedApps[appId];
    if (!installed) return false;
    return verifyInstallation(installed.executablePath);
  });

  // --- Launch & Management ---
  ipcMain.handle('app:launch', (_event, appId: string) => {
    const result = launchApp(appId);
    if (result.success) {
      const config = readConfig();
      if (config.settings.minimizeToTrayOnAppLaunch) {
        getMainWindow()?.hide();
        console.log('[ipc] Minimized to tray after app launch');
      }
    }
    return result;
  });

  ipcMain.handle('app:open-folder', (_event, appId: string) => {
    openInstallFolder(appId);
  });

  ipcMain.handle('launcher:open-external', (_event, url: string) => {
    if (url.startsWith('https://')) {
      shell.openExternal(url);
    } else {
      console.warn(`[ipc] Blocked non-HTTPS URL: ${url}`);
    }
  });

  console.log('[ipc] All handlers registered');
}
