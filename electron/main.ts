import { app, BrowserWindow, screen } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { setupIPC } from './ipc';
import { readConfig } from './config';
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
