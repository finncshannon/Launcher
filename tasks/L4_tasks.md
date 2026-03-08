# Session L4 — Install + Update Flow [Core]

**Priority:** High
**Type:** Mixed (Electron Main Process + Frontend Components + Store Updates)
**Depends On:** L3 (GitHub Release Checker — provides `fetchLatestRelease()`, `ReleaseInfo`, `ReleaseAsset`)
**Spec Reference:** `specs/DETAILED_SPEC.md` → Sections 1.4 (DownloadProgress, InstallResult, InstallOptions), 2.1 (IPC: app:install, app:cancel-install, app:uninstall, app:verify-installation, dialog:select-directory), 2.2 (download:progress push event), 4 (NSIS Silent Install), 5 (Download Manager), 7.2–7.5 (Edge cases: installer fails, broken install, download interrupted)

---

## SCOPE SUMMARY

Build the complete download and installation pipeline: download release assets from GitHub with real-time progress tracking, run NSIS installers silently, update local config on success, and wire up the Install/Update/Uninstall buttons in the UI with a progress component. This is the core value proposition of the Launcher — one-click app installation with a smooth, Epic Games–level progress experience. Also add startup verification of installed apps (detect broken installs where the exe was deleted).

---

## TASKS

### Task 1: Add Install Types to Electron
**Description:** Add the download and install types to the shared Electron type definitions.

**Subtasks:**
- [ ] 1.1 — In `electron/types.ts`, add:
  ```typescript
  /** Progress data emitted during download */
  export interface DownloadProgress {
    appId: string;
    status: 'downloading' | 'installing' | 'complete' | 'failed' | 'cancelled';
    bytesDownloaded: number;
    totalBytes: number;       // From Content-Length header, 0 if unknown
    speedBps: number;         // Rolling 3-second average, bytes per second
    etaSeconds: number;       // Estimated time remaining
    error?: string;           // Set when status is 'failed'
  }

  /** Result returned after install attempt */
  export interface InstallResult {
    success: boolean;
    appId: string;
    version: string;
    installPath: string;
    executablePath: string;
    error?: string;
  }

  /** Options passed to the install handler */
  export interface InstallOptions {
    appId: string;
    installDir: string;       // Parent directory — app installs into {installDir}/{appId}/
  }
  ```

---

### Task 2: Download Manager
**Description:** Create the download module that fetches files from GitHub with progress reporting, speed calculation, ETA, and cancellation via AbortController.

**Subtasks:**
- [ ] 2.1 — Create `electron/downloader.ts`:
  ```typescript
  import { net, app } from 'electron';
  import * as fs from 'fs';
  import * as path from 'path';

  // --- Active downloads (for cancellation) ---
  const activeDownloads = new Map<string, AbortController>();

  // --- Temp directory ---
  function getTempDir(): string {
    const dir = path.join(app.getPath('temp'), 'shannon-launcher');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }
  ```

- [ ] 2.2 — Implement the progress throttle and speed calculation helper:
  ```typescript
  interface ProgressState {
    bytesDownloaded: number;
    totalBytes: number;
    speedBps: number;
    etaSeconds: number;
    lastEmitTime: number;
    speedSamples: { bytes: number; time: number }[];
  }

  function createProgressState(totalBytes: number): ProgressState {
    return {
      bytesDownloaded: 0,
      totalBytes,
      speedBps: 0,
      etaSeconds: 0,
      lastEmitTime: 0,
      speedSamples: [],
    };
  }

  function updateProgress(state: ProgressState, newBytes: number): boolean {
    state.bytesDownloaded += newBytes;
    const now = Date.now();

    // Add speed sample
    state.speedSamples.push({ bytes: newBytes, time: now });

    // Keep only last 3 seconds of samples for rolling average
    const cutoff = now - 3000;
    state.speedSamples = state.speedSamples.filter((s) => s.time > cutoff);

    // Calculate rolling speed
    if (state.speedSamples.length > 1) {
      const totalSampleBytes = state.speedSamples.reduce((sum, s) => sum + s.bytes, 0);
      const timeSpanMs = now - state.speedSamples[0]!.time;
      state.speedBps = timeSpanMs > 0 ? (totalSampleBytes / timeSpanMs) * 1000 : 0;
    }

    // Calculate ETA
    if (state.speedBps > 0 && state.totalBytes > 0) {
      const remaining = state.totalBytes - state.bytesDownloaded;
      state.etaSeconds = remaining / state.speedBps;
    }

    // Throttle: emit at most every 250ms
    if (now - state.lastEmitTime < 250) {
      return false; // Don't emit yet
    }
    state.lastEmitTime = now;
    return true; // Emit now
  }
  ```
  The rolling 3-second window for speed calculation prevents wild fluctuations. The 250ms throttle keeps the UI smooth without flooding the IPC channel.

- [ ] 2.3 — Implement `downloadAsset()`:
  ```typescript
  export async function downloadAsset(
    appId: string,
    url: string,
    fileName: string,
    onProgress: (progress: {
      bytesDownloaded: number;
      totalBytes: number;
      speedBps: number;
      etaSeconds: number;
    }) => void,
  ): Promise<string> {
    // Set up cancellation
    const controller = new AbortController();
    activeDownloads.set(appId, controller);

    const tempDir = getTempDir();
    const tmpPath = path.join(tempDir, `${appId}-${fileName}.tmp`);
    const finalPath = path.join(tempDir, `${appId}-${fileName}`);

    // Clean up any previous partial download
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);

    try {
      console.log(`[download] Starting download: ${url}`);
      console.log(`[download] Temp file: ${tmpPath}`);

      const response = await net.fetch(url, {
        headers: { 'User-Agent': `ShannonLauncher/${app.getVersion()}` },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentLength = response.headers.get('content-length');
      const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
      const progressState = createProgressState(totalBytes);

      const fileStream = fs.createWriteStream(tmpPath);

      // Read the response body as a stream
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Response body is not readable');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (controller.signal.aborted) {
          reader.cancel();
          fileStream.destroy();
          throw new Error('Cancelled');
        }

        fileStream.write(Buffer.from(value));
        const shouldEmit = updateProgress(progressState, value.byteLength);
        if (shouldEmit) {
          onProgress({
            bytesDownloaded: progressState.bytesDownloaded,
            totalBytes: progressState.totalBytes,
            speedBps: progressState.speedBps,
            etaSeconds: progressState.etaSeconds,
          });
        }
      }

      // Wait for file stream to finish writing
      await new Promise<void>((resolve, reject) => {
        fileStream.end(() => resolve());
        fileStream.on('error', reject);
      });

      // Rename .tmp to final
      fs.renameSync(tmpPath, finalPath);
      console.log(`[download] Complete: ${finalPath} (${progressState.bytesDownloaded} bytes)`);

      return finalPath;
    } catch (error: any) {
      // Clean up temp file on failure
      try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch {}

      if (error.message === 'Cancelled' || error.name === 'AbortError') {
        console.log(`[download] Cancelled: ${appId}`);
        throw new Error('Cancelled');
      }

      console.error(`[download] Failed: ${error.message}`);
      throw error;
    } finally {
      activeDownloads.delete(appId);
    }
  }
  ```

- [ ] 2.4 — Implement `cancelDownload()`:
  ```typescript
  export function cancelDownload(appId: string): void {
    const controller = activeDownloads.get(appId);
    if (controller) {
      console.log(`[download] Cancelling download for ${appId}`);
      controller.abort();
    }
  }
  ```

- [ ] 2.5 — Implement `cleanupStaleDownloads()`:
  ```typescript
  export function cleanupStaleDownloads(): void {
    const tempDir = path.join(app.getPath('temp'), 'shannon-launcher');
    if (!fs.existsSync(tempDir)) return;

    const files = fs.readdirSync(tempDir);
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    let cleaned = 0;

    for (const file of files) {
      if (file.endsWith('.tmp')) {
        const filePath = path.join(tempDir, file);
        try {
          const stat = fs.statSync(filePath);
          if (stat.mtimeMs < oneHourAgo) {
            fs.unlinkSync(filePath);
            cleaned++;
          }
        } catch { /* ignore */ }
      }
    }

    if (cleaned > 0) {
      console.log(`[download] Cleaned up ${cleaned} stale temp files`);
    }
  }
  ```

**Implementation Notes:**
- `net.fetch()` follows redirects automatically. GitHub Releases uses 302 redirects to CDN — this is handled transparently.
- The `response.body.getReader()` pattern gives us streaming access to the download body. Each `read()` returns a chunk we write to disk and count for progress.
- The `finally` block always removes the download from `activeDownloads`, preventing memory leaks.
- `cleanupStaleDownloads()` is called once on startup (Task 6). It deletes `.tmp` files older than 1 hour — these are leftovers from interrupted downloads.

---

### Task 3: Installer Runner
**Description:** Create the module that executes NSIS installers silently and verifies the result.

**Subtasks:**
- [ ] 3.1 — Create `electron/installer.ts`:
  ```typescript
  import { execFile } from 'child_process';
  import * as fs from 'fs';
  import * as path from 'path';
  import { AppEntry, InstallResult } from './types';

  const INSTALL_TIMEOUT_MS = 120_000; // 2 minutes
  ```

- [ ] 3.2 — Implement `runInstaller()`:
  ```typescript
  function runInstaller(installerPath: string, installDir: string): Promise<{ exitCode: number }> {
    return new Promise((resolve, reject) => {
      console.log(`[installer] Running: "${installerPath}" /S /D=${installDir}`);

      // Ensure install directory exists
      if (!fs.existsSync(installDir)) {
        fs.mkdirSync(installDir, { recursive: true });
      }

      const proc = execFile(
        installerPath,
        ['/S', `/D=${installDir}`],
        {
          windowsHide: true,
          timeout: INSTALL_TIMEOUT_MS,
        },
        (error, _stdout, stderr) => {
          if (error && (error as any).killed) {
            console.error('[installer] Timed out after', INSTALL_TIMEOUT_MS, 'ms');
            reject(new Error('Installation timed out after 2 minutes'));
            return;
          }
          if (stderr) {
            console.warn('[installer] stderr:', stderr);
          }
          const exitCode = (error as any)?.code ?? proc.exitCode ?? 0;
          console.log(`[installer] Exit code: ${exitCode}`);
          resolve({ exitCode });
        }
      );
    });
  }
  ```
  Key: `/S` = silent, `/D=path` = install directory. `/D` MUST be the last argument and the path MUST NOT be quoted. NSIS will trigger a UAC prompt automatically if the installer requires admin — we don't need to handle elevation ourselves.

- [ ] 3.3 — Implement `installApp()`:
  ```typescript
  export async function installApp(
    entry: AppEntry,
    installerPath: string,
    installDir: string,
  ): Promise<InstallResult> {
    const appInstallDir = path.join(installDir, entry.id);

    try {
      const { exitCode } = await runInstaller(installerPath, appInstallDir);

      if (exitCode !== 0) {
        return {
          success: false,
          appId: entry.id,
          version: '',
          installPath: appInstallDir,
          executablePath: '',
          error: `Installer exited with code ${exitCode}. The user may have declined the UAC prompt, or the installer encountered an error.`,
        };
      }

      // Verify the executable exists
      const executablePath = path.join(appInstallDir, entry.executableName);
      if (!fs.existsSync(executablePath)) {
        console.error(`[installer] Executable not found at: ${executablePath}`);
        return {
          success: false,
          appId: entry.id,
          version: '',
          installPath: appInstallDir,
          executablePath,
          error: `Installation completed but "${entry.executableName}" was not found at the expected location. The installer may use a different directory structure.`,
        };
      }

      console.log(`[installer] Verified executable at: ${executablePath}`);
      return {
        success: true,
        appId: entry.id,
        version: '', // Caller fills this from ReleaseInfo
        installPath: appInstallDir,
        executablePath,
      };
    } finally {
      // Clean up the downloaded installer .exe
      try {
        if (fs.existsSync(installerPath)) {
          fs.unlinkSync(installerPath);
          console.log(`[installer] Cleaned up installer: ${installerPath}`);
        }
      } catch { /* non-critical */ }
    }
  }
  ```
  The `finally` block deletes the downloaded installer after use. We don't need it anymore — the installed app is now on disk.

- [ ] 3.4 — Implement `uninstallApp()`:
  ```typescript
  export function uninstallApp(appId: string, installPath: string): { success: boolean; error?: string } {
    try {
      if (fs.existsSync(installPath)) {
        fs.rmSync(installPath, { recursive: true, force: true });
        console.log(`[installer] Uninstalled: ${installPath}`);
      } else {
        console.log(`[installer] Install path already gone: ${installPath}`);
      }
      return { success: true };
    } catch (error: any) {
      console.error(`[installer] Uninstall failed:`, error.message);
      return {
        success: false,
        error: `Failed to remove app files: ${error.message}. The app may be running — close it and try again.`,
      };
    }
  }
  ```
  `fs.rmSync` with `force: true` won't throw if files don't exist. The main failure case is the app still running (file locks on Windows).

- [ ] 3.5 — Implement `verifyInstallation()`:
  ```typescript
  export function verifyInstallation(executablePath: string): boolean {
    return fs.existsSync(executablePath);
  }
  ```

---

### Task 4: Install Orchestrator (IPC Handlers)
**Description:** Wire the download → install → config update pipeline through IPC handlers. This is the main orchestration layer that coordinates downloader, installer, config, and renderer notifications.

**Subtasks:**
- [ ] 4.1 — Add imports at top of `electron/ipc.ts`:
  ```typescript
  import { dialog, BrowserWindow } from 'electron';
  import { downloadAsset, cancelDownload, cleanupStaleDownloads } from './downloader';
  import { installApp, uninstallApp, verifyInstallation } from './installer';
  import { fetchLatestRelease } from './github';
  import { DownloadProgress, InstallOptions } from './types';
  ```

- [ ] 4.2 — The `setupIPC()` function needs access to `mainWindow` for sending push events. Change the signature to accept it:
  ```typescript
  export function setupIPC(getMainWindow: () => BrowserWindow | null): void {
  ```
  Update the call in `main.ts`:
  ```typescript
  setupIPC(() => mainWindow);
  ```
  This avoids a circular dependency — `ipc.ts` doesn't import `mainWindow` directly, it receives a getter.

- [ ] 4.3 — Add `app:install` handler:
  ```typescript
  ipcMain.handle('app:install', async (_event, options: InstallOptions) => {
    const mainWindow = getMainWindow();
    const entry = APP_REGISTRY.find((e) => e.id === options.appId);
    if (!entry) return { success: false, appId: options.appId, version: '', installPath: '', executablePath: '', error: 'App not found in registry' };

    // 1. Fetch latest release
    const release = await fetchLatestRelease(entry);
    if (!release?.installerAsset) {
      return { success: false, appId: options.appId, version: '', installPath: '', executablePath: '', error: 'No installer available for this app. The developer may not have published a release yet.' };
    }

    // 2. Notify renderer: installing
    mainWindow?.webContents.send('app:status-changed', { appId: options.appId, status: 'installing' });

    try {
      // 3. Download with progress
      const installerPath = await downloadAsset(
        options.appId,
        release.installerAsset.downloadUrl,
        release.installerAsset.name,
        (progress) => {
          const dp: DownloadProgress = {
            appId: options.appId,
            status: 'downloading',
            bytesDownloaded: progress.bytesDownloaded,
            totalBytes: progress.totalBytes,
            speedBps: progress.speedBps,
            etaSeconds: progress.etaSeconds,
          };
          mainWindow?.webContents.send('download:progress', dp);
        },
      );

      // 4. Notify: installing phase
      mainWindow?.webContents.send('download:progress', {
        appId: options.appId,
        status: 'installing',
        bytesDownloaded: release.installerAsset.size,
        totalBytes: release.installerAsset.size,
        speedBps: 0,
        etaSeconds: 0,
      } as DownloadProgress);

      // 5. Run installer
      const result = await installApp(entry, installerPath, options.installDir);
      result.version = release.version;

      if (result.success) {
        // 6. Update config
        const config = readConfig();
        config.installedApps[entry.id] = {
          version: release.version,
          installPath: result.installPath,
          installedAt: new Date().toISOString(),
          lastLaunched: null,
          executablePath: result.executablePath,
        };
        writeConfig(config);

        // 7. Notify: installed
        mainWindow?.webContents.send('app:status-changed', { appId: options.appId, status: 'installed' });
        mainWindow?.webContents.send('download:progress', {
          appId: options.appId, status: 'complete',
          bytesDownloaded: release.installerAsset.size,
          totalBytes: release.installerAsset.size,
          speedBps: 0, etaSeconds: 0,
        } as DownloadProgress);

        console.log(`[install] Successfully installed ${entry.name} v${release.version} at ${result.installPath}`);
      } else {
        // Install failed
        mainWindow?.webContents.send('app:status-changed', { appId: options.appId, status: 'not-installed' });
        mainWindow?.webContents.send('download:progress', {
          appId: options.appId, status: 'failed',
          bytesDownloaded: 0, totalBytes: 0, speedBps: 0, etaSeconds: 0,
          error: result.error,
        } as DownloadProgress);
      }

      return result;
    } catch (error: any) {
      const isCancelled = error.message === 'Cancelled';
      mainWindow?.webContents.send('app:status-changed', {
        appId: options.appId,
        status: isCancelled ? 'not-installed' : 'not-installed',
      });
      mainWindow?.webContents.send('download:progress', {
        appId: options.appId,
        status: isCancelled ? 'cancelled' : 'failed',
        bytesDownloaded: 0, totalBytes: 0, speedBps: 0, etaSeconds: 0,
        error: isCancelled ? undefined : error.message,
      } as DownloadProgress);

      return {
        success: false, appId: options.appId, version: '',
        installPath: '', executablePath: '',
        error: isCancelled ? 'Installation cancelled' : error.message,
      };
    }
  });
  ```

- [ ] 4.4 — Add `app:cancel-install` handler:
  ```typescript
  ipcMain.handle('app:cancel-install', (_event, appId: string) => {
    cancelDownload(appId);
  });
  ```

- [ ] 4.5 — Add `app:uninstall` handler:
  ```typescript
  ipcMain.handle('app:uninstall', (_event, appId: string) => {
    const config = readConfig();
    const installed = config.installedApps[appId];
    if (!installed) return { success: true }; // Already not installed

    const result = uninstallApp(appId, installed.installPath);
    if (result.success) {
      delete config.installedApps[appId];
      writeConfig(config);
      const mainWindow = getMainWindow();
      mainWindow?.webContents.send('app:status-changed', { appId, status: 'not-installed' });
    }
    return result;
  });
  ```

- [ ] 4.6 — Add `dialog:select-directory` handler:
  ```typescript
  ipcMain.handle('dialog:select-directory', async (_event, defaultPath: string) => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      defaultPath,
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Install Directory',
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
  ```

- [ ] 4.7 — Add `app:verify-installation` handler:
  ```typescript
  ipcMain.handle('app:verify-installation', (_event, appId: string) => {
    const config = readConfig();
    const installed = config.installedApps[appId];
    if (!installed) return false;
    return verifyInstallation(installed.executablePath);
  });
  ```

- [ ] 4.8 — Call `cleanupStaleDownloads()` in `electron/main.ts` inside `app.whenReady()`, before `setupIPC()`:
  ```typescript
  app.whenReady().then(async () => {
    cleanupStaleDownloads(); // Clean up from previous interrupted downloads
    setupIPC(() => mainWindow);
    createWindow();
    await loadApp();
    // ... existing startup checks
  });
  ```

---

### Task 5: Update Preload
**Description:** Expose the new install/uninstall IPC channels to the renderer.

**Subtasks:**
- [ ] 5.1 — Add to `electron/preload.ts`:
  ```typescript
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

  // Events
  onDownloadProgress: (callback: (data: any) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('download:progress', handler);
    return () => ipcRenderer.removeListener('download:progress', handler);
  },
  ```

- [ ] 5.2 — Update `frontend/src/types/electron.d.ts`:
  ```typescript
  installApp: (options: import('./index').InstallOptions) => Promise<import('./index').InstallResult>;
  cancelInstall: (appId: string) => Promise<void>;
  uninstallApp: (appId: string) => Promise<{ success: boolean; error?: string }>;
  verifyInstallation: (appId: string) => Promise<boolean>;
  selectDirectory: (defaultPath: string) => Promise<string | null>;
  onDownloadProgress: (callback: (data: import('./index').DownloadProgress) => void) => () => void;
  ```

- [ ] 5.3 — Add `InstallOptions` and `InstallResult` to `frontend/src/types/index.ts` (if not already present from L2 — these were defined but may need the `export`):
  ```typescript
  export interface InstallOptions {
    appId: string;
    installDir: string;
  }

  export interface InstallResult {
    success: boolean;
    appId: string;
    version: string;
    installPath: string;
    executablePath: string;
    error?: string;
  }
  ```

---

### Task 6: Install Progress Component
**Description:** Build the progress bar UI shown in the detail panel during downloads and installs.

**Subtasks:**
- [ ] 6.1 — Create `frontend/src/components/InstallProgress.tsx`:
  ```tsx
  import type { DownloadProgress } from '../types';
  import { formatBytes, formatSpeed, formatEta } from '../lib/utils';

  interface InstallProgressProps {
    progress: DownloadProgress;
    onCancel: () => void;
  }

  export default function InstallProgress({ progress, onCancel }: InstallProgressProps) {
    const { status, bytesDownloaded, totalBytes, speedBps, etaSeconds } = progress;
    const pct = totalBytes > 0 ? Math.round((bytesDownloaded / totalBytes) * 100) : 0;
    const isDownloading = status === 'downloading';
    const isInstalling = status === 'installing';

    return (
      <div className="space-y-3">
        {/* Status Text */}
        <div className="flex items-center justify-between">
          <p className="text-[#F5F5F5] text-sm font-medium">
            {isDownloading && 'Downloading...'}
            {isInstalling && (
              <span className="flex items-center gap-2">
                <Spinner />
                Installing...
              </span>
            )}
            {status === 'complete' && '✓ Installed'}
            {status === 'failed' && 'Installation failed'}
            {status === 'cancelled' && 'Cancelled'}
          </p>
          {isDownloading && (
            <p className="text-[#3B82F6] text-2xl font-bold tabular-nums">
              {pct}%
            </p>
          )}
        </div>

        {/* Progress Bar */}
        {(isDownloading || isInstalling) && (
          <div className="w-full h-2 rounded-full bg-[#1A1A1A] overflow-hidden">
            {isDownloading && totalBytes > 0 ? (
              <div
                className="h-full rounded-full bg-[#6366F1] transition-[width] duration-[250ms] ease-linear"
                style={{ width: `${pct}%` }}
              />
            ) : (
              /* Indeterminate: animated pulse bar */
              <div className="h-full rounded-full bg-[#6366F1] animate-pulse w-full opacity-50" />
            )}
          </div>
        )}

        {/* Stats */}
        {isDownloading && totalBytes > 0 && (
          <div className="flex justify-between text-[10px] text-[#A0A0A0] tabular-nums">
            <span>{formatBytes(bytesDownloaded)} / {formatBytes(totalBytes)}</span>
            <span>{formatSpeed(speedBps)} — {formatEta(etaSeconds)}</span>
          </div>
        )}

        {/* Error Message */}
        {status === 'failed' && progress.error && (
          <p className="text-[#EF4444] text-xs">{progress.error}</p>
        )}

        {/* Cancel Button */}
        {(isDownloading || isInstalling) && (
          <button
            onClick={onCancel}
            className="text-[#EF4444] text-xs hover:text-[#F87171] transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    );
  }

  function Spinner() {
    return (
      <span className="inline-block w-3 h-3 border-2 border-[#2A2A2A] border-t-[#6366F1] rounded-full animate-spin" />
    );
  }
  ```
  The progress bar uses `transition-[width] duration-[250ms] ease-linear` for smooth width changes (matches spec section 8.5). The `tabular-nums` class ensures numbers don't shift as they change (monospace numeric glyphs). The indeterminate state (unknown total) shows a pulsing bar at 50% opacity.

---

### Task 7: Wire Install/Update/Uninstall Buttons in AppDetail
**Description:** Replace the disabled action buttons from L2 with functional implementations.

**Subtasks:**
- [ ] 7.1 — In `frontend/src/components/AppDetail.tsx`, add imports and hook up the store:
  ```tsx
  import { useAppStore } from '../stores/appStore';
  import InstallProgress from './InstallProgress';
  import { showToast } from './Toast';
  ```

- [ ] 7.2 — Implement the Install button handler:
  ```tsx
  async function handleInstall() {
    const config = useAppStore.getState().config;
    const defaultDir = config?.settings.defaultInstallDir || '';

    // Show directory picker
    const selectedDir = await window.electronAPI.selectDirectory(defaultDir);
    if (!selectedDir) return; // User cancelled

    // Start install (the IPC handler manages the entire flow)
    const result = await window.electronAPI.installApp({
      appId: entry.id,
      installDir: selectedDir,
    });

    if (result.success) {
      showToast('success', `${entry.name} installed successfully`);
      useAppStore.getState().refreshConfig();
    } else if (result.error && result.error !== 'Installation cancelled') {
      showToast('error', result.error);
    }
  }
  ```

- [ ] 7.3 — Implement the Update button handler:
  ```tsx
  async function handleUpdate() {
    if (!installed) return;
    // Use the PARENT directory of the current install path
    // e.g., if installed at C:\ShannonApps\finance-app, use C:\ShannonApps
    const parentDir = installed.installPath.replace(/[/\\][^/\\]+$/, '');

    const result = await window.electronAPI.installApp({
      appId: entry.id,
      installDir: parentDir,
    });

    if (result.success) {
      showToast('success', `${entry.name} updated to v${result.version}`);
      useAppStore.getState().refreshConfig();
    } else if (result.error && result.error !== 'Installation cancelled') {
      showToast('error', result.error);
    }
  }
  ```
  Updates don't prompt for a directory — they overwrite the existing install location.

- [ ] 7.4 — Implement the Uninstall button with confirmation:
  ```tsx
  async function handleUninstall() {
    const confirmed = window.confirm(
      `Uninstall ${entry.name}? This will delete all app files from:\n${installed?.installPath}`
    );
    if (!confirmed) return;

    const result = await window.electronAPI.uninstallApp(entry.id);
    if (result.success) {
      showToast('info', `${entry.name} uninstalled`);
      useAppStore.getState().refreshConfig();
    } else if (result.error) {
      showToast('error', result.error);
    }
  }
  ```
  Uses native `window.confirm()` for the confirmation dialog — simple and consistent. A custom styled modal could be added in L6 polish.

- [ ] 7.5 — Implement Cancel handler:
  ```tsx
  function handleCancel() {
    window.electronAPI.cancelInstall(entry.id);
  }
  ```

- [ ] 7.6 — Replace the disabled Install button with the functional version:
  ```tsx
  {status === 'not-installed' && !app.downloadProgress && (
    <button
      onClick={handleInstall}
      className="w-full py-2.5 rounded-lg bg-[#3B82F6] hover:bg-[#2563EB] text-white font-medium text-sm transition-colors duration-150"
    >
      Install
    </button>
  )}
  ```

- [ ] 7.7 — Show `InstallProgress` when download is active:
  ```tsx
  {(status === 'installing' || status === 'updating') && app.downloadProgress && (
    <InstallProgress
      progress={app.downloadProgress}
      onCancel={handleCancel}
    />
  )}
  ```

- [ ] 7.8 — Replace disabled Update button:
  ```tsx
  {status === 'update-available' && !app.downloadProgress && (
    <button
      onClick={handleUpdate}
      className="w-full py-2 rounded-lg bg-[#F59E0B]/10 text-[#F59E0B] font-medium text-sm hover:bg-[#F59E0B]/20 transition-colors duration-150"
    >
      Update to v{latestRelease?.version}
    </button>
  )}
  ```

- [ ] 7.9 — Replace disabled Uninstall button:
  ```tsx
  <button
    onClick={handleUninstall}
    className="py-2 px-4 rounded-lg text-[#EF4444] text-sm hover:bg-[#EF4444]/10 transition-colors duration-150"
  >
    Uninstall
  </button>
  ```

- [ ] 7.10 — Implement Repair and Remove for broken installs:
  ```tsx
  {status === 'broken' && (
    <div className="flex gap-2">
      <button onClick={handleInstall} className="flex-1 py-2.5 rounded-lg bg-[#3B82F6] hover:bg-[#2563EB] text-white font-medium text-sm transition-colors duration-150">
        Repair
      </button>
      <button onClick={handleRemove} className="py-2.5 px-4 rounded-lg text-[#EF4444] text-sm hover:bg-[#EF4444]/10 transition-colors duration-150">
        Remove
      </button>
    </div>
  )}
  ```
  "Repair" runs the same install flow. "Remove" just cleans the config entry:
  ```tsx
  async function handleRemove() {
    // Just clean config, don't try to delete files (they may already be gone)
    await window.electronAPI.uninstallApp(entry.id);
    useAppStore.getState().refreshConfig();
    showToast('info', `${entry.name} removed from launcher`);
  }
  ```

---

### Task 8: Store Updates for Download Progress
**Description:** Subscribe to download progress events in the Zustand store.

**Subtasks:**
- [ ] 8.1 — In `frontend/src/stores/appStore.ts`, add to `initialize()` after existing event subscriptions:
  ```typescript
  window.electronAPI.onDownloadProgress((progress) => {
    get().updateDownloadProgress(progress);

    // When complete, refresh config to get the new installed app data
    if (progress.status === 'complete') {
      setTimeout(() => get().refreshConfig(), 500); // Small delay for config write to finish
    }
  });
  ```

- [ ] 8.2 — The `updateDownloadProgress` action should also clear the progress when the download is terminal (complete, failed, cancelled). After a short delay, set `downloadProgress` back to `null`:
  ```typescript
  updateDownloadProgress: (progress) =>
    set((state) => {
      const newApps = state.apps.map((app) =>
        app.entry.id === progress.appId ? { ...app, downloadProgress: progress } : app
      );

      // Clear progress after terminal states (with delay for UI to show final state)
      if (['complete', 'failed', 'cancelled'].includes(progress.status)) {
        setTimeout(() => {
          set((s) => ({
            apps: s.apps.map((app) =>
              app.entry.id === progress.appId ? { ...app, downloadProgress: null } : app
            ),
          }));
        }, 2000); // Show final state for 2 seconds before clearing
      }

      return { apps: newApps };
    }),
  ```

---

### Task 9: Startup Verification of Installed Apps
**Description:** On startup, verify all installed apps still have valid executables. Mark broken ones.

**Subtasks:**
- [ ] 9.1 — In `frontend/src/stores/appStore.ts`, add verification logic to `initialize()` after the state is set. After the `set({ apps, config, ... })` call:
  ```typescript
  // Verify installed apps
  for (const app of apps) {
    if (app.installed) {
      const valid = await window.electronAPI.verifyInstallation(app.entry.id);
      if (!valid) {
        console.warn(`[store] Broken installation detected: ${app.entry.id}`);
        // Use get() to call action after set() has completed
        setTimeout(() => get().updateAppStatus(app.entry.id, 'broken'), 0);
      }
    }
  }
  ```

**Implementation Notes:**
- The `setTimeout(..., 0)` ensures the status update happens after the initial `set()` has completed. Without this, the `updateAppStatus` call would try to modify state that hasn't been committed yet.
- Verification happens once on startup. If a user deletes app files while the Launcher is running, it won't be detected until the next restart (or until they try to launch the app, which will fail with an error toast).

---

### Task 10: AppCard Installing Badge with Mini Progress
**Description:** When an app is in `installing` status with active download progress, show a mini progress indication in the card badge.

**Subtasks:**
- [ ] 10.1 — In `frontend/src/components/AppCard.tsx`, update the `StatusBadge` to accept `downloadProgress`:
  ```tsx
  <StatusBadge
    status={status}
    updateVersion={latestRelease?.version}
    downloadProgress={app.downloadProgress}
  />
  ```

- [ ] 10.2 — In the `StatusBadge` component, when status is `installing` and downloadProgress exists, show percentage:
  ```tsx
  if (status === 'installing' && downloadProgress?.status === 'downloading' && downloadProgress.totalBytes > 0) {
    const pct = Math.round((downloadProgress.bytesDownloaded / downloadProgress.totalBytes) * 100);
    return (
      <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-[#6366F1]/10 text-[#6366F1] tabular-nums">
        {pct}%
      </span>
    );
  }
  ```

---

## ACCEPTANCE CRITERIA

- [ ] AC-1: Clicking "Install" on an uninstalled app opens a native Windows directory picker. After selecting a directory, download starts with a real-time progress bar showing percentage (large number), progress bar (smooth h-2), speed (e.g., "2.4 MB/s"), ETA (e.g., "~1m 30s"), and bytes downloaded/total.
- [ ] AC-2: The progress bar updates smoothly — no jank, no missing updates. Updates arrive every ~250ms.
- [ ] AC-3: After download completes, the status text changes to "Installing..." with a spinner icon. The NSIS installer runs silently in the background.
- [ ] AC-4: After successful install, the card badge changes to "Installed ✓" (green), a success toast appears, and `config.json` is updated with the install path, version, and timestamps.
- [ ] AC-5: The "Cancel" button during download aborts the download immediately. The temp `.tmp` file is deleted. Status reverts to "Available" (not-installed).
- [ ] AC-6: Clicking "Update" on an app with an update available downloads and installs the new version without prompting for a directory (uses existing install location's parent).
- [ ] AC-7: Clicking "Uninstall" shows a native confirm dialog. On confirm, the app directory is deleted and the config entry is removed. Status reverts to "Available".
- [ ] AC-8: If an installed app's executable is missing on startup (manually delete it for testing), the card shows "Needs Repair" badge (red). Detail panel shows "Repair" and "Remove" buttons.
- [ ] AC-9: "Repair" triggers the full install flow (directory picker + download + install). "Remove" just cleans the config entry.
- [ ] AC-10: Download errors show a toast with an actionable message (e.g., "Download failed. Check your internet connection and try again."). The detail panel shows the error text and a "Retry" option (user clicks Install again).
- [ ] AC-11: Stale `.tmp` files older than 1 hour are cleaned up on Launcher startup.
- [ ] AC-12: The `app:install` IPC handler sends `download:progress` events every 250ms and `app:status-changed` events for status transitions.
- [ ] AC-13: The AppCard shows a percentage (e.g., "67%") in the badge area while downloading.
- [ ] AC-14: When `totalBytes` is 0 (Content-Length missing), an indeterminate progress bar is shown (pulsing, no percentage).
- [ ] AC-15: `setupIPC()` now receives a `getMainWindow` getter to avoid circular imports.
- [ ] AC-16: No TypeScript errors. No unhandled promise rejections.

---

## FILES TOUCHED

**New files:**
- `electron/downloader.ts` — Download manager with progress, cancellation, cleanup (~150 lines)
- `electron/installer.ts` — NSIS runner, verify, uninstall (~100 lines)
- `frontend/src/components/InstallProgress.tsx` — Progress bar with stats (~80 lines)

**Modified files:**
- `electron/types.ts` — add DownloadProgress, InstallResult, InstallOptions
- `electron/ipc.ts` — add app:install, app:cancel-install, app:uninstall, dialog:select-directory, app:verify-installation handlers. Change setupIPC signature to accept getMainWindow getter.
- `electron/main.ts` — call cleanupStaleDownloads() on startup, pass `() => mainWindow` to setupIPC
- `electron/preload.ts` — add installApp, cancelInstall, uninstallApp, verifyInstallation, selectDirectory, onDownloadProgress
- `frontend/src/types/electron.d.ts` — add new electronAPI methods
- `frontend/src/types/index.ts` — ensure InstallOptions, InstallResult are exported
- `frontend/src/stores/appStore.ts` — subscribe to onDownloadProgress, auto-clear progress after terminal states, startup verification
- `frontend/src/components/AppDetail.tsx` — replace disabled buttons with functional handlers (install, update, uninstall, repair, remove, cancel). Show InstallProgress when downloading.
- `frontend/src/components/AppCard.tsx` — pass downloadProgress to StatusBadge, show percentage in badge

---

## BUILDER PROMPT

> **Session L4 — Install + Update Flow [Core]**
>
> You are building session L4 of the Shannon Launcher. L1–L3 are complete. You have a working Electron app with Library UI, Zustand store, GitHub Release checking, and update detection. Now build the install/update pipeline — this is the core feature of the Launcher.
>
> **Working directory:** `C:\Claude Access Point\Launcher`
>
> **What you're building:** The complete download → install → config update pipeline. Users click Install, pick a directory, see a progress bar, and the app silently installs. Also: Update (overwrites existing), Uninstall (delete + clean config), startup verification (detect broken installs).
>
> **Existing code (from L1–L3):**
>
> *Electron:*
> - `electron/types.ts` — AppEntry, InstalledApp, LauncherConfig, ReleaseInfo, ReleaseAsset, LAUNCHER_GITHUB
> - `electron/config.ts` — readConfig(), writeConfig(), updateSettings()
> - `electron/registry.ts` — APP_REGISTRY with Finance App (executableName: 'Finance App.exe')
> - `electron/github.ts` — fetchLatestRelease(entry), fetchAllReleases(), isNewerVersion(), clearReleaseCache()
> - `electron/updater.ts` — checkForAppUpdates(), checkForLauncherUpdate()
> - `electron/ipc.ts` — setupIPC() with config, registry, releases, launcher handlers
> - `electron/preload.ts` — electronAPI with config, registry, releases, launcher methods + onAppStatusChanged, onLauncherUpdateAvailable
> - `electron/main.ts` — window, lifecycle, startup update checks (fire-and-forget)
>
> *Frontend:*
> - `frontend/src/types/index.ts` — AppEntry, InstalledApp, LauncherConfig, AppStatus, AppState, ReleaseInfo, DownloadProgress
> - `frontend/src/stores/appStore.ts` — Zustand store with apps[], config, initialize(), updateAppStatus(), updateDownloadProgress(), updateAppRelease(), refreshConfig()
> - `frontend/src/components/AppDetail.tsx` — 480px detail panel with DISABLED action buttons
> - `frontend/src/components/AppCard.tsx` — card with StatusBadge (handles all statuses)
> - `frontend/src/components/Toast.tsx` — showToast() imperative API
> - `frontend/src/lib/utils.ts` — formatBytes, formatSpeed, formatEta, formatDate, cn
>
> **Task 1: Types** — Add to `electron/types.ts`: DownloadProgress, InstallResult, InstallOptions.
>
> **Task 2: Download Manager** (`electron/downloader.ts`)
> - `downloadAsset(appId, url, fileName, onProgress)`: net.fetch with AbortController stored in `activeDownloads` Map. Write to `{temp}/shannon-launcher/{appId}-{file}.tmp`, rename on success. Progress: 250ms throttle, rolling 3-second speed average (keep array of {bytes, time} samples, filter to last 3s), ETA = remaining/speed. On cancel: delete tmp, throw 'Cancelled'. On error: delete tmp, throw. Finally: remove from activeDownloads.
> - `cancelDownload(appId)`: look up AbortController, abort()
> - `cleanupStaleDownloads()`: scan temp dir, delete .tmp files older than 1 hour
> - Stream pattern: `response.body.getReader()` then `while (true) { read() }` loop, write Buffer.from(value) to fs.createWriteStream
>
> **Task 3: Installer** (`electron/installer.ts`)
> - `runInstaller(path, dir)`: `execFile(path, ['/S', '/D=dir'], { windowsHide: true, timeout: 120000 })`. Exit 0 = success.
> - `installApp(entry, installerPath, installDir)`: create dir, runInstaller into `{installDir}/{entry.id}`, verify `{dir}/{executableName}` exists. Delete installer in finally block. Return InstallResult.
> - `uninstallApp(appId, installPath)`: `fs.rmSync(path, { recursive: true, force: true })`. Handle file lock errors.
> - `verifyInstallation(exePath)`: `fs.existsSync(exePath)`
>
> **Task 4: IPC Handlers**
> - Change `setupIPC()` signature to `setupIPC(getMainWindow: () => BrowserWindow | null)`. Update call in main.ts: `setupIPC(() => mainWindow)`.
> - `app:install`: fetch release → download with progress (send `download:progress` events) → install → update config → send `app:status-changed`. Full try/catch with cancel detection.
> - `app:cancel-install`: cancelDownload(appId)
> - `app:uninstall`: uninstall, delete config entry, send status
> - `dialog:select-directory`: dialog.showOpenDialog with openDirectory+createDirectory
> - `app:verify-installation`: check exe exists
> - Call `cleanupStaleDownloads()` in main.ts before setupIPC
>
> **Task 5: Preload** — Add: installApp, cancelInstall, uninstallApp, verifyInstallation, selectDirectory, onDownloadProgress
>
> **Task 6: InstallProgress** (`frontend/src/components/InstallProgress.tsx`)
> - Progress bar: h-2, rounded-full, bg-[#1A1A1A], fill bg-[#6366F1], `transition-[width] duration-[250ms] ease-linear`
> - Large percentage: text-2xl font-bold text-[#3B82F6] tabular-nums
> - Stats: bytes/total left, speed+ETA right, text-[10px] text-[#A0A0A0] tabular-nums
> - Status: "Downloading..." / "Installing..." (with Spinner) / "✓ Installed" / "Installation failed"
> - Cancel button: text-[#EF4444]
> - Indeterminate: animate-pulse full-width bar at 50% opacity when totalBytes=0
> - Spinner: 12px border circle, border-t accent-info, animate-spin
>
> **Task 7: Wire Buttons in AppDetail**
> - Install: selectDirectory → installApp → success toast + refreshConfig. Show InstallProgress when downloading.
> - Update: use parent of installed.installPath → installApp → success toast + refreshConfig. No directory picker.
> - Uninstall: window.confirm → uninstallApp → info toast + refreshConfig.
> - Cancel: cancelInstall(appId)
> - Repair (broken): same as Install flow
> - Remove (broken): uninstallApp to clean config only
> - Buttons shown/hidden based on status and downloadProgress presence
>
> **Task 8: Store** — Subscribe to onDownloadProgress in initialize(). Auto-clear downloadProgress 2s after terminal states. On 'complete', refreshConfig after 500ms delay.
>
> **Task 9: Startup Verification** — In initialize(), after setting apps, verify each installed app's exe exists. Mark broken with setTimeout(updateAppStatus, 0).
>
> **Task 10: AppCard Badge** — Pass downloadProgress to StatusBadge. When installing+downloading, show percentage in badge.
>
> **Acceptance criteria:**
> 1. Install click → directory picker → download with progress (percentage, speed, ETA)
> 2. Progress bar smooth (250ms throttle, CSS transition)
> 3. Download done → "Installing..." + spinner → NSIS runs silently
> 4. Install success → "Installed ✓" badge, success toast, config.json updated
> 5. Cancel → instant abort, cleanup, revert status
> 6. Update → downloads to existing location, no picker
> 7. Uninstall → confirm → delete files + clean config
> 8. Missing exe on startup → "Needs Repair" badge
> 9. Repair = re-install. Remove = clean config only.
> 10. Errors → actionable toast messages
> 11. Stale .tmp cleanup on startup
> 12. IPC sends download:progress every 250ms and app:status-changed on transitions
> 13. Card badge shows percentage during download
> 14. Indeterminate bar when totalBytes unknown
> 15. setupIPC takes getMainWindow getter
> 16. No TypeScript errors, no unhandled rejections
>
> **Technical constraints:**
> - `net.fetch()` for downloads — follows redirects, respects proxy
> - `response.body.getReader()` for streaming with progress
> - AbortController per download, stored in Map by appId
> - NSIS flags: `/S /D=path` — `/D` must be LAST, path NOT quoted
> - `execFile` with `windowsHide: true` and 2-minute timeout
> - Atomic config writes after install (write .tmp → rename)
> - `fs.rmSync(path, { recursive: true, force: true })` for uninstall
> - `setupIPC(getMainWindow)` pattern to avoid circular imports
> - `cleanupStaleDownloads()` called once on startup before IPC setup
> - Progress throttle: 250ms minimum between emissions
> - Speed: rolling 3-second average from sample array
> - All logging: `[download]`, `[installer]`, `[install]` prefixes
