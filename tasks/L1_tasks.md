# Session L1 — Electron Shell + Config System [Foundation]

**Priority:** High
**Type:** Full Stack (Electron + React + Build Config)
**Depends On:** None
**Spec Reference:** `specs/DETAILED_SPEC.md` → Sections 1 (Types), 2 (IPC), 6 (Config), 8.1–8.2 (Window/Colors), 11 (Builder Config), 12 (File Structure)

---

## SCOPE SUMMARY

Initialize the entire Shannon Launcher project from scratch — no existing code. Create the monorepo workspace (Electron + React + TypeScript + Tailwind), the Electron main process with window creation and lifecycle, a config system for reading/writing JSON to `%APPDATA%`, a hardcoded app registry with Finance App as the first entry, an IPC bridge between main and renderer, and a basic dark-themed shell window that proves the bridge works. This session creates the skeleton that every subsequent session builds on.

---

## TASKS

### Task 1: Project Initialization
**Description:** Create the monorepo workspace structure with Electron main process and React frontend as separate packages, matching the Finance App's workspace pattern at `C:\Claude Access Point\StockValuation\Finance App\package.json`.

**Subtasks:**
- [ ] 1.1 — Create root `package.json` at `C:\Claude Access Point\Launcher\package.json`:
  ```json
  {
    "name": "shannon-launcher",
    "version": "1.0.0",
    "private": true,
    "description": "Personal software hub for installing, updating, and launching apps.",
    "workspaces": ["electron", "frontend"],
    "scripts": {
      "dev:frontend": "cd frontend && npm run dev",
      "dev:electron": "cd electron && npm run dev",
      "build:frontend": "cd frontend && npm run build",
      "build:electron": "cd electron && npm run build",
      "build": "npm run build:frontend && npm run build:electron",
      "package": "npm run build:frontend && npm run build:electron && cd electron && npx electron-builder --config electron-builder.yml --win",
      "release": "npm run build:frontend && npm run build:electron && cd electron && npx electron-builder --config electron-builder.yml --win --publish always"
    },
    "engines": { "node": ">=18.0.0" }
  }
  ```
- [ ] 1.2 — Create `electron/package.json`:
  ```json
  {
    "name": "shannon-launcher-electron",
    "version": "1.0.0",
    "private": true,
    "main": "dist/main.js",
    "scripts": {
      "dev": "tsc && electron .",
      "build": "tsc"
    },
    "dependencies": {
      "electron-updater": "^6.1.0"
    },
    "devDependencies": {
      "electron": "^28.0.0",
      "electron-builder": "^24.0.0",
      "typescript": "^5.3.0",
      "@types/node": "^20.0.0"
    }
  }
  ```
- [ ] 1.3 — Create `frontend/package.json`:
  ```json
  {
    "name": "shannon-launcher-frontend",
    "version": "1.0.0",
    "private": true,
    "scripts": {
      "dev": "vite",
      "build": "tsc && vite build",
      "preview": "vite preview"
    },
    "dependencies": {
      "react": "^18.2.0",
      "react-dom": "^18.2.0",
      "zustand": "^4.4.0"
    },
    "devDependencies": {
      "typescript": "^5.3.0",
      "@types/react": "^18.2.0",
      "@types/react-dom": "^18.2.0",
      "vite": "^5.0.0",
      "@vitejs/plugin-react": "^4.2.0",
      "tailwindcss": "^3.4.0",
      "postcss": "^8.4.0",
      "autoprefixer": "^10.4.0"
    }
  }
  ```
- [ ] 1.4 — Create `electron/tsconfig.json`:
  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "module": "NodeNext",
      "moduleResolution": "NodeNext",
      "outDir": "dist",
      "rootDir": ".",
      "strict": true,
      "esModuleInterop": true,
      "skipLibCheck": true,
      "forceConsistentCasingInFileNames": true,
      "resolveJsonModule": true,
      "declaration": true,
      "declarationMap": true,
      "sourceMap": true
    },
    "include": ["*.ts"],
    "exclude": ["dist", "node_modules"]
  }
  ```
- [ ] 1.5 — Create `frontend/tsconfig.json` for React (target ES2022, JSX `react-jsx`, strict, include `src`)
- [ ] 1.6 — Create `frontend/vite.config.ts`:
  ```typescript
  import { defineConfig } from 'vite';
  import react from '@vitejs/plugin-react';

  export default defineConfig({
    plugins: [react()],
    base: './',  // Required for file:// loading in production Electron
    build: {
      outDir: 'dist',
    },
  });
  ```
- [ ] 1.7 — Create `frontend/tailwind.config.ts` with content paths pointing to `./src/**/*.{ts,tsx}` and extended theme colors matching the design system:
  ```
  bg-primary: '#0D0D0D', bg-secondary: '#141414', bg-tertiary: '#1A1A1A',
  bg-elevated: '#1E1E1E', border-default: '#2A2A2A', border-hover: '#3A3A3A',
  text-primary: '#F5F5F5', text-secondary: '#A0A0A0', text-muted: '#666666',
  accent-primary: '#3B82F6', accent-hover: '#2563EB', accent-success: '#22C55E',
  accent-warning: '#F59E0B', accent-danger: '#EF4444', accent-info: '#6366F1'
  ```
- [ ] 1.8 — Create `frontend/postcss.config.js` with `tailwindcss` and `autoprefixer` plugins
- [ ] 1.9 — Create `frontend/index.html` — minimal HTML with `<div id="root">`, charset utf-8, viewport meta, title "Shannon Launcher"
- [ ] 1.10 — Create directory structure: `assets/icons/`, `assets/images/`, `resources/`, `scripts/`
- [ ] 1.11 — Run `npm install` from root to install all workspace dependencies. Verify no errors.
- [ ] 1.12 — Verify `npm run build` compiles both electron and frontend without TypeScript errors.

**Implementation Notes:**
- The `base: './'` in vite config is critical — without it, Electron will fail to load assets in production when using `file://` protocol.
- The workspace structure means running `npm install` at root installs both `electron/` and `frontend/` dependencies.
- `electron-updater` is included as a dependency even though full auto-update is deferred to L6 — it avoids a dependency-change rebuild later.

---

### Task 2: Electron Main Process
**Description:** Create `main.ts` with window creation, lifecycle management, single-instance lock, window state persistence, and dev/prod loading. Follow the Finance App's `C:\Claude Access Point\StockValuation\Finance App\electron\main.ts` patterns but strip all Python/backend logic.

**Subtasks:**
- [ ] 2.1 — Create `electron/main.ts` starting with imports and constants:
  ```typescript
  import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
  import * as path from 'path';
  import * as fs from 'fs';
  import { setupIPC } from './ipc';

  const DEV_SERVER_URL = 'http://localhost:5173';
  let mainWindow: BrowserWindow | null = null;
  ```

- [ ] 2.2 — Add single-instance lock at module scope (before `app.whenReady()`):
  ```typescript
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
  } else {
    app.on('second-instance', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });
  }
  ```
  This prevents multiple Launcher windows. If a user double-clicks the shortcut while Launcher is already open, the existing window focuses instead.

- [ ] 2.3 — Implement window state persistence. Add interfaces and functions:
  ```typescript
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

  function loadWindowState(): WindowState {
    const defaults: WindowState = { width: 1000, height: 700, isMaximized: false };
    try {
      const statePath = getWindowStatePath();
      if (fs.existsSync(statePath)) {
        const data = fs.readFileSync(statePath, 'utf-8');
        const saved = JSON.parse(data) as Partial<WindowState>;
        return { ...defaults, ...saved };
      }
    } catch { /* fall through */ }
    return defaults;
  }

  function saveWindowState(): void {
    if (!mainWindow) return;
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
    } catch { /* non-critical */ }
  }
  ```
  This mirrors the Finance App's `loadWindowState`/`saveWindowState` pattern exactly.

- [ ] 2.4 — Implement `createWindow()`:
  ```typescript
  function createWindow(): void {
    const state = loadWindowState();
    mainWindow = new BrowserWindow({
      width: state.width,
      height: state.height,
      x: state.x,
      y: state.y,
      minWidth: 800,
      minHeight: 550,
      backgroundColor: '#0D0D0D',
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    if (state.isMaximized) mainWindow.maximize();
    mainWindow.once('ready-to-show', () => { mainWindow?.show(); });
    mainWindow.on('close', () => { saveWindowState(); });
  }
  ```
  Key details: `minWidth: 800, minHeight: 550` (not 600 — smaller min to allow more flexibility). `backgroundColor` matches `bg-primary`. `preload` path uses `__dirname` which resolves to `electron/dist/` at runtime. `sandbox: true` for security.

- [ ] 2.5 — Implement `loadApp()`:
  ```typescript
  async function loadApp(): Promise<void> {
    if (!mainWindow) return;
    const isDev = !app.isPackaged;
    if (isDev) {
      mainWindow.loadURL(DEV_SERVER_URL);
    } else {
      mainWindow.loadFile(
        path.join(process.resourcesPath, 'frontend', 'dist', 'index.html')
      );
    }
  }
  ```
  In dev mode, loads from Vite's dev server. In production (packaged), loads from the bundled `frontend/dist/` in resources.

- [ ] 2.6 — Implement `app.whenReady()` lifecycle and shutdown handlers:
  ```typescript
  app.whenReady().then(async () => {
    setupIPC();
    createWindow();
    await loadApp();
  });

  app.on('window-all-closed', () => {
    saveWindowState();
    app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
  ```

**Implementation Notes:**
- The Finance App's `main.ts` has 280+ lines due to Python spawning, health checks, and layout detection. The Launcher's `main.ts` should be ~120–150 lines — much simpler because there's no backend process to manage.
- `process.resourcesPath` is an Electron-provided path that resolves differently in dev vs packaged mode. In dev, it doesn't exist, which is why we check `app.isPackaged`.

---

### Task 3: Preload Script & Context Bridge
**Description:** Create the preload script that exposes a typed `electronAPI` object to the renderer process via `contextBridge`. This follows the Finance App's `C:\Claude Access Point\StockValuation\Finance App\electron\preload.ts` pattern.

**Subtasks:**
- [ ] 3.1 — Create `electron/preload.ts`:
  ```typescript
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

    // Events (Main → Renderer)
    onLauncherUpdateAvailable: (callback: (data: any) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
      ipcRenderer.on('launcher:update-available', handler);
      return () => ipcRenderer.removeListener('launcher:update-available', handler);
    },
  });
  ```
  Every method follows the pattern: `invoke` for request/response, `on` for push events with a cleanup function returned for unsubscribing.

- [ ] 3.2 — Create `frontend/src/types/electron.d.ts` to give TypeScript visibility into the bridge:
  ```typescript
  export {};

  declare global {
    interface Window {
      electronAPI: {
        getConfig: () => Promise<import('./index').LauncherConfig>;
        updateSettings: (settings: Partial<import('./index').LauncherSettings>) => Promise<import('./index').LauncherConfig>;
        setFirstRunComplete: () => Promise<void>;
        getRegistry: () => Promise<import('./index').AppEntry[]>;
        getVersion: () => Promise<string>;
        onLauncherUpdateAvailable: (callback: (data: { currentVersion: string; latestVersion: string; downloadUrl: string }) => void) => () => void;
      };
    }
  }
  ```
  This file will be expanded in L2–L5 as new IPC channels are added. The `export {}` at top makes it a module, required for `declare global` to work.

**Implementation Notes:**
- The Finance App's preload has 3 methods (getBackendUrl, getLayoutMode, isBackendReady). The Launcher's preload starts with 6 methods and will grow to ~15 by L5.
- The return type of `onLauncherUpdateAvailable` is `() => void` — a cleanup function. React components call this in their `useEffect` cleanup to avoid memory leaks.

---

### Task 4: Shared Type Definitions
**Description:** Create the canonical TypeScript type definitions in the Electron process. These are imported by all other Electron modules (config, registry, IPC handlers).

**Subtasks:**
- [ ] 4.1 — Create `electron/types.ts` with every interface needed for L1:
  ```typescript
  /** Static app definition — hardcoded in registry.ts */
  export interface AppEntry {
    id: string;
    name: string;
    description: string;
    longDescription: string;
    github: {
      owner: string;
      repo: string;
    };
    icon: string;
    installSize: string;
    tags: string[];
    executableName: string;
    minimumLauncherVersion?: string;
  }

  /** Per-app install record stored in config.json */
  export interface InstalledApp {
    version: string;
    installPath: string;
    installedAt: string;
    lastLaunched: string | null;
    executablePath: string;
  }

  /** User-facing settings */
  export interface LauncherSettings {
    defaultInstallDir: string;
    checkUpdatesOnLaunch: boolean;
    minimizeToTrayOnAppLaunch: boolean;
    minimizeToTrayOnClose: boolean;
  }

  /** Root config object persisted to disk */
  export interface LauncherConfig {
    configVersion: number;
    installedApps: Record<string, InstalledApp>;
    settings: LauncherSettings;
    firstRunComplete: boolean;
  }

  /** Default config — used on first launch and corruption recovery */
  export const DEFAULT_CONFIG: LauncherConfig = {
    configVersion: 1,
    installedApps: {},
    settings: {
      defaultInstallDir: '',  // Resolved at runtime
      checkUpdatesOnLaunch: true,
      minimizeToTrayOnAppLaunch: false,
      minimizeToTrayOnClose: false,
    },
    firstRunComplete: false,
  };
  ```
  Note: `defaultInstallDir` is empty string in the default — it gets resolved to `%LOCALAPPDATA%\ShannonApps` at runtime in `config.ts`. This avoids hardcoding platform-specific paths in the type definition.

---

### Task 5: Config System
**Description:** Create the config module that reads/writes `config.json` in the Electron `userData` directory with atomic writes, corruption recovery, and migration support.

**Subtasks:**
- [ ] 5.1 — Create `electron/config.ts`:
  ```typescript
  import { app } from 'electron';
  import * as path from 'path';
  import * as fs from 'fs';
  import { LauncherConfig, LauncherSettings, DEFAULT_CONFIG } from './types';
  ```

- [ ] 5.2 — Implement `getConfigPath()`:
  ```typescript
  export function getConfigPath(): string {
    return path.join(app.getPath('userData'), 'config.json');
  }
  ```
  Electron's `userData` path for `productName: "Shannon Launcher"` resolves to `%APPDATA%\Shannon Launcher\`. The space is fine — it's a standard Windows path.

- [ ] 5.3 — Implement `getDefaultInstallDir()`:
  ```typescript
  function getDefaultInstallDir(): string {
    return path.join(
      process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local'),
      'ShannonApps'
    );
  }
  ```
  Uses `%LOCALAPPDATA%` (e.g., `C:\Users\Finn\AppData\Local\ShannonApps`). Falls back to constructing the path manually if the env var is missing.

- [ ] 5.4 — Implement `writeConfig()` with atomic writes:
  ```typescript
  export function writeConfig(config: LauncherConfig): void {
    const configPath = getConfigPath();
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmpPath = configPath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2), 'utf-8');
    fs.renameSync(tmpPath, configPath);
  }
  ```
  The write-to-tmp-then-rename pattern ensures the config file is never in a half-written state. If the process crashes during `writeFileSync`, the `.tmp` file is corrupt but the real `config.json` is untouched. `renameSync` is atomic on Windows when source and dest are on the same volume.

- [ ] 5.5 — Implement `migrateConfig()`:
  ```typescript
  function migrateConfig(raw: any): LauncherConfig {
    if (!raw.configVersion) raw.configVersion = 1;
    if (!raw.installedApps) raw.installedApps = {};
    if (!raw.settings) raw.settings = { ...DEFAULT_CONFIG.settings };
    if (!raw.settings.defaultInstallDir) {
      raw.settings.defaultInstallDir = getDefaultInstallDir();
    }
    if (raw.settings.checkUpdatesOnLaunch === undefined) raw.settings.checkUpdatesOnLaunch = true;
    if (raw.settings.minimizeToTrayOnAppLaunch === undefined) raw.settings.minimizeToTrayOnAppLaunch = false;
    if (raw.settings.minimizeToTrayOnClose === undefined) raw.settings.minimizeToTrayOnClose = false;
    if (raw.firstRunComplete === undefined) raw.firstRunComplete = false;
    return raw as LauncherConfig;
  }
  ```
  This defensively fills any missing fields. When config format changes in future versions, add version-specific transforms here (e.g., `if (raw.configVersion < 2) { ... migrate ... raw.configVersion = 2; }`).

- [ ] 5.6 — Implement `readConfig()`:
  ```typescript
  export function readConfig(): LauncherConfig {
    const configPath = getConfigPath();
    if (!fs.existsSync(configPath)) {
      const defaults: LauncherConfig = {
        ...DEFAULT_CONFIG,
        settings: {
          ...DEFAULT_CONFIG.settings,
          defaultInstallDir: getDefaultInstallDir(),
        },
      };
      writeConfig(defaults);
      return defaults;
    }
    try {
      const data = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(data);
      return migrateConfig(parsed);
    } catch (error) {
      console.error('[config] Failed to parse config.json, backing up and resetting:', error);
      try {
        fs.copyFileSync(configPath, configPath + '.backup');
      } catch { /* backup failed, continue anyway */ }
      const defaults: LauncherConfig = {
        ...DEFAULT_CONFIG,
        settings: {
          ...DEFAULT_CONFIG.settings,
          defaultInstallDir: getDefaultInstallDir(),
        },
      };
      writeConfig(defaults);
      return defaults;
    }
  }
  ```
  On corruption: backup the broken file to `.backup`, then reset to defaults. The user loses their config but doesn't get a crash loop.

- [ ] 5.7 — Implement `updateSettings()`:
  ```typescript
  export function updateSettings(partial: Partial<LauncherSettings>): LauncherConfig {
    const config = readConfig();
    config.settings = { ...config.settings, ...partial };
    writeConfig(config);
    return config;
  }
  ```

**Implementation Notes:**
- `readConfig()` is called synchronously — it's fast (tiny JSON file) and simplifies the IPC handler pattern. Async would add complexity for no measurable benefit.
- The `.backup` file is a debugging aid. If a user reports config loss, they can send the `.backup` for diagnosis.

---

### Task 6: App Registry
**Description:** Create the hardcoded app registry with Finance App as the first and initially only entry.

**Subtasks:**
- [ ] 6.1 — Create `electron/registry.ts`:
  ```typescript
  import { AppEntry } from './types';

  export const APP_REGISTRY: AppEntry[] = [
    {
      id: 'finance-app',
      name: 'Finance App',
      description: 'Professional-grade equity valuation and portfolio management.',
      longDescription: 'A comprehensive desktop application for DCF modeling, stock screening, portfolio tracking, and company research. Built for analysts and individual investors who need institutional-quality tools.',
      github: {
        owner: 'OWNER_TBD',
        repo: 'finance-app',
      },
      icon: 'finance-app.png',
      installSize: '~150 MB',
      tags: ['finance', 'valuation', 'desktop'],
      executableName: 'Finance App.exe',
    },
  ];
  ```
  `OWNER_TBD` is a placeholder — replaced with the real GitHub username before first release. The `executableName` must match exactly what NSIS produces after install (the `productName` from electron-builder config + `.exe`).

---

### Task 7: IPC Handler Registration
**Description:** Create the centralized IPC handler module. All `ipcMain.handle()` calls live here, imported from their respective modules.

**Subtasks:**
- [ ] 7.1 — Create `electron/ipc.ts`:
  ```typescript
  import { ipcMain, app } from 'electron';
  import { readConfig, writeConfig, updateSettings } from './config';
  import { APP_REGISTRY } from './registry';

  export function setupIPC(): void {
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
  }
  ```
  Channel naming convention: `{domain}:{action}`. Config channels are `config:*`, registry is `registry:*`, etc. This module will grow in L3–L5 as install, launch, and update handlers are added.

- [ ] 7.2 — In `electron/main.ts`, import and call `setupIPC()` as the first line of `app.whenReady()`:
  ```typescript
  import { setupIPC } from './ipc';
  // ...
  app.whenReady().then(async () => {
    setupIPC();  // Must be before createWindow so handlers are ready when renderer loads
    createWindow();
    await loadApp();
  });
  ```

**Implementation Notes:**
- `setupIPC()` is called before `createWindow()` so that IPC handlers are registered before the renderer process starts sending requests. If called after, there's a race condition where the renderer could invoke a channel that hasn't been registered yet.

---

### Task 8: Basic Frontend Shell
**Description:** Create the minimal React app with dark theme, confirming the Electron ↔ React IPC bridge works end-to-end.

**Subtasks:**
- [ ] 8.1 — Create `frontend/src/main.tsx`:
  ```typescript
  import React from 'react';
  import ReactDOM from 'react-dom/client';
  import App from './App';
  import './index.css';

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  ```

- [ ] 8.2 — Create `frontend/src/App.tsx`:
  ```tsx
  import { useState, useEffect } from 'react';

  export default function App() {
    const [version, setVersion] = useState('');
    const [config, setConfig] = useState<any>(null);
    const [registry, setRegistry] = useState<any[]>([]);

    useEffect(() => {
      window.electronAPI.getVersion().then(setVersion);
      window.electronAPI.getConfig().then(setConfig);
      window.electronAPI.getRegistry().then(setRegistry);
    }, []);

    return (
      <div className="min-h-screen bg-[#0D0D0D] text-[#F5F5F5] p-8 font-sans">
        <h1 className="text-2xl font-bold mb-6">Shannon Launcher</h1>
        <div className="space-y-2 text-sm">
          <p className="text-[#A0A0A0]">
            Version: <span className="text-[#F5F5F5]">{version || '...'}</span>
          </p>
          <p className="text-[#A0A0A0]">
            Apps in registry: <span className="text-[#F5F5F5]">{registry.length}</span>
          </p>
          <p className="text-[#A0A0A0]">
            Config loaded: <span className="text-[#F5F5F5]">{config ? 'Yes' : 'Loading...'}</span>
          </p>
          {config && (
            <p className="text-[#A0A0A0]">
              Install dir: <span className="text-[#666666] text-xs">{config.settings?.defaultInstallDir}</span>
            </p>
          )}
        </div>
      </div>
    );
  }
  ```
  This is a diagnostic shell — it will be replaced entirely in L2. Its only purpose is to prove that all 3 IPC channels work (getVersion, getConfig, getRegistry).

- [ ] 8.3 — Create `frontend/src/index.css`:
  ```css
  @tailwind base;
  @tailwind components;
  @tailwind utilities;

  body {
    margin: 0;
    padding: 0;
    background-color: #0D0D0D;
    color: #F5F5F5;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
    overflow: hidden;
  }
  ```
  `overflow: hidden` on body prevents the window-level scrollbar — scrolling will be managed per-component in L2.

- [ ] 8.4 — Create a placeholder icon at `assets/icons/finance-app.png` — a 64×64 solid-colored PNG (e.g., dark blue `#3B82F6` square with white "F" letter). This is a dev placeholder; the real icon is added before release.

- [ ] 8.5 — Create a placeholder `resources/icon.ico` — a minimal `.ico` file for the Electron window icon and NSIS installer. Can be generated from a 256×256 PNG. Flag for replacement before actual release.

---

### Task 9: Electron-Builder Configuration
**Description:** Create the electron-builder NSIS config. This won't be used until L6 but needs to be in the project structure now so the `package` and `release` scripts resolve.

**Subtasks:**
- [ ] 9.1 — Create `electron/electron-builder.yml`:
  ```yaml
  appId: com.shannonlauncher.desktop
  productName: Shannon Launcher
  copyright: Copyright 2026

  directories:
    output: release
    buildResources: resources

  files:
    - dist/*.js
    - dist/*.js.map
    - package.json

  extraResources:
    - from: ../frontend/dist
      to: frontend/dist

  publish:
    provider: github
    owner: OWNER_TBD
    repo: shannon-launcher
    releaseType: release

  win:
    target:
      - target: nsis
        arch:
          - x64
    icon: resources/icon.ico
    signAndEditExecutable: false

  nsis:
    oneClick: false
    allowToChangeInstallationDirectory: true
    installerIcon: resources/icon.ico
    uninstallerIcon: resources/icon.ico
    createDesktopShortcut: true
    createStartMenuShortcut: true
    shortcutName: Shannon Launcher
  ```
  `oneClick: false` gives users the "Custom" install option (choose directory). `allowToChangeInstallationDirectory` lets them pick where to install. Both match the Finance App's pattern.

---

## ACCEPTANCE CRITERIA

- [ ] AC-1: Running `npm run dev:frontend` from root starts Vite dev server on `http://localhost:5173`.
- [ ] AC-2: Running `npm run dev:electron` from root (after frontend build) opens an Electron window with dark background (`#0D0D0D`), size ~1000×700.
- [ ] AC-3: The window displays: Launcher version (from `package.json`), registry count (`1`), config loaded status (`Yes`), and default install directory path.
- [ ] AC-4: `config.json` is created at `%APPDATA%\Shannon Launcher\config.json` on first launch. Contents match `DEFAULT_CONFIG` with `defaultInstallDir` resolved to `%LOCALAPPDATA%\ShannonApps`.
- [ ] AC-5: Closing and reopening the app restores the previous window position and size. Test by moving/resizing the window, closing, and relaunching.
- [ ] AC-6: Launching a second instance of the app focuses the existing window instead of opening a new one. The second process quits immediately.
- [ ] AC-7: `npm run build` from root compiles both `electron/` (TypeScript → `electron/dist/`) and `frontend/` (Vite build → `frontend/dist/`) without errors.
- [ ] AC-8: Manually editing `config.json` to contain invalid JSON, then relaunching the app, creates a `.backup` of the corrupt file and resets to defaults. No crash.
- [ ] AC-9: All Electron console logs show `[config]`, `[startup]` prefixes for debuggability.

---

## FILES TOUCHED

**New files:**
- `package.json` — root workspace
- `electron/package.json` — Electron dependencies
- `electron/main.ts` — main process (~120–150 lines)
- `electron/preload.ts` — context bridge (~30 lines)
- `electron/config.ts` — config read/write/migrate (~80 lines)
- `electron/registry.ts` — hardcoded app registry (~25 lines)
- `electron/ipc.ts` — IPC handler registration (~30 lines)
- `electron/types.ts` — shared TypeScript interfaces (~50 lines)
- `electron/tsconfig.json` — TypeScript config
- `electron/electron-builder.yml` — NSIS + GitHub Releases config
- `frontend/package.json` — React dependencies
- `frontend/src/main.tsx` — React entry point
- `frontend/src/App.tsx` — diagnostic shell
- `frontend/src/index.css` — Tailwind directives + global styles
- `frontend/src/types/electron.d.ts` — window.electronAPI type declarations
- `frontend/index.html` — HTML shell
- `frontend/vite.config.ts` — Vite config with `base: './'`
- `frontend/tailwind.config.ts` — Tailwind with custom design tokens
- `frontend/postcss.config.js` — PostCSS plugins
- `frontend/tsconfig.json` — React TypeScript config
- `assets/icons/finance-app.png` — placeholder icon (64×64)
- `resources/icon.ico` — placeholder Launcher icon

**Modified files:** None (new project)

---

## BUILDER PROMPT

> **Session L1 — Electron Shell + Config System [Foundation]**
>
> You are initializing the Shannon Launcher project from scratch. There is NO existing code. The working directory is `C:\Claude Access Point\Launcher`.
>
> **What you're building:** A standalone Electron desktop app that serves as a personal software hub — users browse an app library, install apps with one click, receive updates, and launch apps. This session creates the project skeleton: workspace, Electron main process, config system, app registry, IPC bridge, and a dark-themed React shell.
>
> **Reference implementation:** The Finance App at `C:\Claude Access Point\StockValuation\Finance App` uses the same Electron + React + TypeScript stack. Study these files:
> - `electron/main.ts` — window creation, state persistence, lifecycle (ignore all Python/backend code)
> - `electron/preload.ts` — context bridge pattern
> - `package.json` — workspace + script structure
> - `electron/electron-builder.yml` — NSIS + GitHub Releases config
>
> The Launcher is SIMPLER — no Python backend, no database, no API server. Pure Electron + React.
>
> **Task 1: Project Structure**
> Create monorepo at `C:\Claude Access Point\Launcher` with workspaces `["electron", "frontend"]`. Root `package.json` with scripts: `dev:frontend` (cd frontend && npm run dev), `dev:electron` (cd electron && npm run dev), `build:frontend`, `build:electron`, `build` (both), `package` (build + electron-builder --win), `release` (build + electron-builder --win --publish always). Frontend: React 18, Vite 5, Tailwind 3, Zustand 4, TypeScript 5. Electron: latest stable, electron-builder, TypeScript. Run `npm install` from root.
>
> **Task 2: Electron Main Process** (`electron/main.ts`)
> Imports: `app, BrowserWindow, ipcMain` from electron, `path`, `fs`. Constants: `DEV_SERVER_URL = 'http://localhost:5173'`. State: `mainWindow: BrowserWindow | null = null`.
> - Single-instance lock: `app.requestSingleInstanceLock()`. If no lock, `app.quit()`. On `second-instance`, focus existing window.
> - Window state: `loadWindowState()` / `saveWindowState()` using `{userData}/window-state.json`. Interface: `{ x?, y?, width, height, isMaximized }`. Defaults: 1000×700, not maximized. Save on `close` event. Restore maximized state.
> - `createWindow()`: `minWidth: 800, minHeight: 550, backgroundColor: '#0D0D0D', show: false`. WebPreferences: `contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.js')`. Show on `ready-to-show`.
> - `loadApp()`: if `!app.isPackaged` load `DEV_SERVER_URL`, else load `path.join(process.resourcesPath, 'frontend', 'dist', 'index.html')`.
> - Lifecycle: `app.whenReady()` → `setupIPC()` → `createWindow()` → `loadApp()`. `window-all-closed` → `saveWindowState()` + `app.quit()`.
>
> **Task 3: Preload** (`electron/preload.ts`)
> `contextBridge.exposeInMainWorld('electronAPI', { ... })` with:
> - `getConfig: () => ipcRenderer.invoke('config:get')`
> - `updateSettings: (settings) => ipcRenderer.invoke('config:update-settings', settings)`
> - `setFirstRunComplete: () => ipcRenderer.invoke('config:set-first-run-complete')`
> - `getRegistry: () => ipcRenderer.invoke('registry:get-all')`
> - `getVersion: () => ipcRenderer.invoke('launcher:get-version')`
> - `onLauncherUpdateAvailable: (callback) => { ipcRenderer.on('launcher:update-available', handler); return cleanup; }`
>
> **Task 4: Types** (`electron/types.ts`)
> Export interfaces: `AppEntry` (id, name, description, longDescription, github.owner/repo, icon, installSize, tags, executableName, minimumLauncherVersion?), `InstalledApp` (version, installPath, installedAt, lastLaunched, executablePath), `LauncherSettings` (defaultInstallDir, checkUpdatesOnLaunch, minimizeToTrayOnAppLaunch, minimizeToTrayOnClose), `LauncherConfig` (configVersion, installedApps: Record<string, InstalledApp>, settings, firstRunComplete), `DEFAULT_CONFIG` const.
>
> **Task 5: Config** (`electron/config.ts`)
> - `getConfigPath()` → `path.join(app.getPath('userData'), 'config.json')`
> - `readConfig()` → read file, parse, `migrateConfig()`. Missing file → create with defaults (resolve `defaultInstallDir` to `path.join(process.env.LOCALAPPDATA || ..., 'ShannonApps')`). Parse error → backup to `.backup`, reset defaults. Log with `[config]` prefix.
> - `writeConfig(config)` → atomic: write `.tmp`, rename to `.json`. Create directory if missing.
> - `updateSettings(partial)` → read, merge `settings`, write, return updated.
> - `migrateConfig(raw)` → fill missing fields with defaults. Future: version-specific transforms.
>
> **Task 6: Registry** (`electron/registry.ts`)
> `APP_REGISTRY: AppEntry[]` with one entry: Finance App. id=`finance-app`, name=`Finance App`, executableName=`Finance App.exe`, github owner=`OWNER_TBD`, repo=`finance-app`.
>
> **Task 7: IPC** (`electron/ipc.ts`)
> `setupIPC()`: register `ipcMain.handle` for `config:get` (readConfig), `config:update-settings` (updateSettings), `config:set-first-run-complete` (read+set+write), `registry:get-all` (APP_REGISTRY), `launcher:get-version` (app.getVersion()). Called BEFORE `createWindow()` in whenReady.
>
> **Task 8: Frontend**
> - `frontend/src/main.tsx`: React 18 createRoot, render `<App />` in StrictMode.
> - `frontend/src/App.tsx`: useState for version/config/registry. useEffect calls all 3 electronAPI methods. Renders dark div (bg-[#0D0D0D]) showing version, registry count, config status, install dir.
> - `frontend/src/index.css`: `@tailwind base/components/utilities`. Body: margin 0, bg #0D0D0D, font-family system, overflow hidden.
> - `frontend/src/types/electron.d.ts`: declare global Window.electronAPI with typed methods.
> - `frontend/tailwind.config.ts`: extend colors with full design palette (bg-primary #0D0D0D, bg-secondary #141414, bg-tertiary #1A1A1A, bg-elevated #1E1E1E, border-default #2A2A2A, border-hover #3A3A3A, text-primary #F5F5F5, text-secondary #A0A0A0, text-muted #666666, accent-primary #3B82F6, accent-hover #2563EB, accent-success #22C55E, accent-warning #F59E0B, accent-danger #EF4444, accent-info #6366F1).
> - `frontend/vite.config.ts`: react plugin, `base: './'`.
>
> **Task 9: Build Config**
> `electron/electron-builder.yml`: appId `com.shannonlauncher.desktop`, productName `Shannon Launcher`, extraResources `../frontend/dist` → `frontend/dist`, publish github `OWNER_TBD/shannon-launcher`, win target nsis x64, nsis oneClick false, allowToChangeInstallationDirectory true, createDesktopShortcut true, createStartMenuShortcut true, shortcutName `Shannon Launcher`.
>
> **Acceptance criteria:**
> 1. `npm run dev:frontend` starts Vite on 5173
> 2. `npm run dev:electron` opens dark window 1000×700
> 3. Window shows version, registry count (1), config loaded (Yes), install dir path
> 4. config.json created at %APPDATA%\Shannon Launcher\ with correct defaults
> 5. Window state persists across restarts
> 6. Second instance focuses existing window
> 7. `npm run build` compiles both without errors
> 8. Corrupt config.json → backup + reset, no crash
>
> **Technical constraints:**
> - `base: './'` in vite.config.ts — required for Electron file:// loading
> - `setupIPC()` called before `createWindow()` — prevents IPC race condition
> - Atomic config writes — `.tmp` then rename
> - `contextIsolation: true, nodeIntegration: false, sandbox: true` — security best practices
> - preload path: `path.join(__dirname, 'preload.js')` — note `.js` not `.ts` (compiled output)
> - No backend, no Python, no database — pure Electron + React
