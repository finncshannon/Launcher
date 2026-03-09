import { app, BrowserWindow, screen } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { setupIPC } from './ipc';
import { readConfig, writeConfig } from './config';
import { APP_REGISTRY } from './registry';
import { checkForAppUpdates, checkForLauncherUpdate } from './updater';
import { cleanupStaleDownloads } from './downloader';
import { createTray, destroyTray } from './tray';

process.on('uncaughtException', (error) => {
  console.error('[main] Uncaught exception:', error);
});
process.on('unhandledRejection', (reason) => {
  console.error('[main] Unhandled rejection:', reason);
});

// --- Configuration ---
app.name = 'Fulcrum';
const DEV_SERVER_URL = 'http://localhost:5173';
let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

// --- Single-Instance Lock ---
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// --- Window State Persistence ---
interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

function getWindowStatePath(): string {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function isPositionVisible(x: number, y: number): boolean {
  const displays = screen.getAllDisplays();
  return displays.some((display) => {
    const { x: dx, y: dy, width, height } = display.bounds;
    return x >= dx - 50 && x < dx + width + 50 && y >= dy - 50 && y < dy + height + 50;
  });
}

function loadWindowState(): WindowState {
  const defaults: WindowState = {
    width: 1000,
    height: 700,
    isMaximized: false,
  };

  try {
    const statePath = getWindowStatePath();
    if (fs.existsSync(statePath)) {
      const data = fs.readFileSync(statePath, 'utf-8');
      const saved = JSON.parse(data) as Partial<WindowState>;
      const state = { ...defaults, ...saved };

      if (state.x !== undefined && state.y !== undefined) {
        if (!isPositionVisible(state.x, state.y)) {
          console.log('[startup] Saved window position is off-screen, centering');
          delete state.x;
          delete state.y;
        }
      }

      console.log('[startup] Window state restored');
      return state;
    }
  } catch {
    try { fs.unlinkSync(getWindowStatePath()); } catch {}
    console.warn('[startup] Corrupted window-state.json, using defaults');
  }

  return defaults;
}

function saveWindowState(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const state: WindowState = {
    isMaximized: mainWindow.isMaximized(),
    width: 1000,
    height: 700,
  };

  if (!mainWindow.isMaximized()) {
    const bounds = mainWindow.getBounds();
    state.x = bounds.x;
    state.y = bounds.y;
    state.width = bounds.width;
    state.height = bounds.height;
  }

  try {
    fs.writeFileSync(getWindowStatePath(), JSON.stringify(state, null, 2));
    console.log('[startup] Window state saved');
  } catch {
    console.warn('[startup] Failed to save window state');
  }
}

// --- Window Creation ---
function createWindow(): void {
  const state = loadWindowState();

  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.ico')
    : path.join(__dirname, '..', 'resources', 'icon.ico');

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 800,
    minHeight: 550,
    backgroundColor: '#0D0D0D',
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (state.isMaximized) {
    mainWindow.maximize();
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      const config = readConfig();
      if (config.settings.minimizeToTrayOnClose) {
        event.preventDefault();
        mainWindow?.hide();
        console.log('[main] Minimized to tray on close');
        return;
      }
    }
    saveWindowState();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Keyboard shortcuts (window-scoped)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown') {
      if (input.control && input.key.toLowerCase() === 'q') {
        app.quit();
      }
      if (app.isPackaged && input.control && input.key.toLowerCase() === 'r') {
        event.preventDefault();
      }
    }
  });

  console.log('[startup] Window created');
}

// --- App Loading ---
async function loadApp(): Promise<void> {
  if (!mainWindow) return;

  const isDev = !app.isPackaged;

  if (isDev) {
    console.log(`[startup] Loading dev server at ${DEV_SERVER_URL}`);
    mainWindow.loadURL(DEV_SERVER_URL);
  } else {
    const indexPath = path.join(process.resourcesPath, 'frontend', 'dist', 'index.html');
    console.log(`[startup] Loading production build from ${indexPath}`);
    mainWindow.loadFile(indexPath);
  }
}

// --- App Lifecycle ---
app.on('before-quit', () => {
  isQuitting = true;
  destroyTray();
});

app.whenReady().then(async () => {
  console.log('[startup] Fulcrum starting...');
  cleanupStaleDownloads();
  setupIPC(() => mainWindow);

  // Verify installed apps (repairs broken records from failed exe detection)
  const startupConfig = readConfig();
  console.log(`[startup] Config path: ${path.join(app.getPath('userData'), 'config.json')}`);
  console.log(`[startup] defaultInstallDir: ${startupConfig.settings.defaultInstallDir}`);
  console.log(`[startup] installedApps keys: ${JSON.stringify(Object.keys(startupConfig.installedApps))}`);

  for (const entry of APP_REGISTRY) {
    const installed = startupConfig.installedApps[entry.id];
    console.log(`[startup] Checking ${entry.id}: installed=${!!installed}, executableName=${entry.executableName}`);

    if (installed) {
      console.log(`[startup]   installPath: ${installed.installPath}`);
      console.log(`[startup]   executablePath: ${installed.executablePath}`);
      console.log(`[startup]   installPath exists: ${fs.existsSync(installed.installPath)}`);
      console.log(`[startup]   executablePath exists: ${fs.existsSync(installed.executablePath)}`);
    }

    if (installed && !fs.existsSync(installed.executablePath)) {
      // Case 1: In config but exe path is wrong — try to find the real exe
      let searchDir = installed.installPath;
      let searchDirExists = fs.existsSync(searchDir);

      // Case 1b: installPath itself doesn't exist — fall back to default install dir
      if (!searchDirExists) {
        const fallbackDir = path.join(startupConfig.settings.defaultInstallDir, entry.id);
        console.log(`[startup]   installPath gone, checking fallback: ${fallbackDir}`);
        if (fs.existsSync(fallbackDir)) {
          searchDir = fallbackDir;
          searchDirExists = true;
        }
      }

      if (searchDirExists) {
        const files = fs.readdirSync(searchDir);
        const exeFiles = files.filter(f => f.endsWith('.exe') && !f.startsWith('Uninstall'));
        console.log(`[startup]   Found exe files in ${searchDir}: ${JSON.stringify(exeFiles)}`);
        if (exeFiles.length > 0) {
          const repairConfig = readConfig();
          repairConfig.installedApps[entry.id].installPath = searchDir;
          repairConfig.installedApps[entry.id].executablePath = path.join(searchDir, exeFiles[0]);
          writeConfig(repairConfig);
          console.log(`[startup] Repaired install record for ${entry.id}: ${exeFiles[0]} at ${searchDir}`);
        }
      } else {
        // installPath AND fallback both gone — remove stale config entry
        console.log(`[startup]   No install directory found, removing stale config entry for ${entry.id}`);
        const repairConfig = readConfig();
        delete repairConfig.installedApps[entry.id];
        writeConfig(repairConfig);
      }
    } else if (!installed) {
      // Case 2: Not in config at all — check if app is actually installed on disk
      const installDir = path.join(startupConfig.settings.defaultInstallDir, entry.id);
      console.log(`[startup]   Not in config, checking default dir: ${installDir}`);
      console.log(`[startup]   Default dir exists: ${fs.existsSync(installDir)}`);
      if (fs.existsSync(installDir)) {
        const files = fs.readdirSync(installDir);
        const exeFiles = files.filter(f => f.endsWith('.exe') && !f.startsWith('Uninstall'));
        console.log(`[startup]   Found exe files: ${JSON.stringify(exeFiles)}`);
        if (exeFiles.length > 0) {
          // Try to determine version from the app's package.json
          let version = 'unknown';
          const appPkgPath = path.join(installDir, 'resources', 'app', 'package.json');
          try {
            if (fs.existsSync(appPkgPath)) {
              const appPkg = JSON.parse(fs.readFileSync(appPkgPath, 'utf-8'));
              if (appPkg.version) {
                version = appPkg.version;
                console.log(`[startup]   Detected version from package.json: ${version}`);
              }
            }
          } catch {
            console.log(`[startup]   Could not read version from package.json`);
          }

          const repairConfig = readConfig();
          repairConfig.installedApps[entry.id] = {
            version,
            installPath: installDir,
            installedAt: new Date().toISOString(),
            lastLaunched: null,
            executablePath: path.join(installDir, exeFiles[0]),
          };
          writeConfig(repairConfig);
          console.log(`[startup] Discovered installed app ${entry.id} v${version} at ${installDir} \u2014 exe: ${exeFiles[0]}`);
        }
      }
    }
  }

  createWindow();

  if (mainWindow) {
    createTray(mainWindow);
  }

  await loadApp();
  console.log('[startup] Initialization complete');

  // Non-blocking update checks
  const config = readConfig();
  if (config.settings.checkUpdatesOnLaunch) {
    checkForAppUpdates().then((results) => {
      for (const r of results) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('app:status-changed', {
            appId: r.appId,
            status: r.updateAvailable ? 'update-available' : undefined,
            release: r.release,
          });
        }
      }
      console.log(`[startup] Update check complete: ${results.length} apps checked, ${results.filter(r => r.updateAvailable).length} updates available`);
    }).catch((err) => {
      console.warn('[startup] App update check failed:', err.message);
    });

    checkForLauncherUpdate().then((result) => {
      if (result.available && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('launcher:update-available', {
          currentVersion: app.getVersion(),
          latestVersion: result.version,
          downloadUrl: result.downloadUrl,
        });
        console.log(`[startup] Launcher update available: v${result.version}`);
      }
    }).catch((err) => {
      console.warn('[startup] Launcher update check failed:', err.message);
    });
  }
});

app.on('window-all-closed', () => {
  const config = readConfig();
  if (!config.settings.minimizeToTrayOnClose) {
    saveWindowState();
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
