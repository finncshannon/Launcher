# Session L5 — Launch + App Management [Core]

**Priority:** Normal
**Type:** Mixed (Electron Main Process + Frontend UI Wiring)
**Depends On:** L4 (Install + Update Flow — provides installed apps in config, functional AppDetail buttons)
**Spec Reference:** `specs/DETAILED_SPEC.md` → Sections 2.1 (IPC: app:launch, app:open-folder), 7.3 (Edge case: user deletes app folder), 8.5 (Animations: launch spinner 1.5s), 9 (Self-Update Flow: shell.openExternal for Update Banner)

---

## SCOPE SUMMARY

Build the app launch system (spawn installed executables as detached processes), system tray integration (icon, context menu, minimize-to-tray on close and on app launch), app management features (open install folder, last-launched timestamp tracking), wire the Update Banner's "Download Update" button to open URLs in the default browser, and add keyboard shortcuts. After this session, the Launcher is fully functional for its complete core workflow: browse → install → launch → update → manage.

---

## TASKS

### Task 1: App Launcher Module
**Description:** Create the module that spawns installed app executables as independent, detached processes that outlive the Launcher.

**Subtasks:**
- [ ] 1.1 — Create `electron/launcher.ts`:
  ```typescript
  import { spawn } from 'child_process';
  import { shell } from 'electron';
  import * as fs from 'fs';
  import { readConfig, writeConfig } from './config';

  /**
   * Launch an installed app by spawning its executable as a detached process.
   * The launched app runs independently — closing the Launcher does NOT close the app.
   */
  export function launchApp(appId: string): { success: boolean; error?: string } {
    const config = readConfig();
    const installed = config.installedApps[appId];

    if (!installed) {
      return { success: false, error: 'App is not installed.' };
    }

    if (!fs.existsSync(installed.executablePath)) {
      return {
        success: false,
        error: `Executable not found at "${installed.executablePath}". The app may have been moved or deleted. Try repairing the installation.`,
      };
    }

    try {
      console.log(`[launcher] Launching: ${installed.executablePath}`);

      const child = spawn(installed.executablePath, [], {
        detached: true,     // Run independently of Launcher
        stdio: 'ignore',    // Don't pipe stdout/stderr
        cwd: installed.installPath,  // Set working dir to install path
      });
      child.unref();  // Don't keep Launcher process alive for this child

      // Update last launched timestamp
      config.installedApps[appId].lastLaunched = new Date().toISOString();
      writeConfig(config);

      console.log(`[launcher] Launched ${appId} (PID: ${child.pid})`);
      return { success: true };
    } catch (error: any) {
      console.error(`[launcher] Failed to launch ${appId}:`, error.message);
      return {
        success: false,
        error: `Failed to launch: ${error.message}. Try running the app directly from its install folder.`,
      };
    }
  }
  ```
  Key details: `detached: true` makes the child process a session leader — it survives even if the Launcher exits. `child.unref()` tells Node.js not to keep the Launcher's event loop alive waiting for this child. `stdio: 'ignore'` prevents the child's output from being piped (which would create a reference that keeps the Launcher alive).

- [ ] 1.2 — Implement `openInstallFolder()`:
  ```typescript
  /**
   * Open the app's install directory in Windows Explorer.
   */
  export function openInstallFolder(appId: string): void {
    const config = readConfig();
    const installed = config.installedApps[appId];
    if (!installed) {
      console.warn(`[launcher] Cannot open folder: ${appId} not installed`);
      return;
    }
    if (!fs.existsSync(installed.installPath)) {
      console.warn(`[launcher] Install path does not exist: ${installed.installPath}`);
      // Open the parent directory instead, if it exists
      const parent = require('path').dirname(installed.installPath);
      if (fs.existsSync(parent)) {
        shell.openPath(parent);
      }
      return;
    }
    console.log(`[launcher] Opening folder: ${installed.installPath}`);
    shell.openPath(installed.installPath);
  }
  ```
  `shell.openPath()` is Electron's cross-platform way to open a directory in the system file manager. On Windows, this opens Explorer at the specified path. If the install path is gone (user deleted it), we try to open the parent directory as a fallback.

**Implementation Notes:**
- `spawn` with `detached: true` + `child.unref()` is the standard pattern for launching independent processes from Electron. Without `unref()`, the Launcher would stay alive until the launched app exits.
- The `cwd` option sets the working directory for the launched app. Some apps rely on their working directory to find config files or resources.
- The `lastLaunched` timestamp is written to config immediately after spawn. It's updated even if the app crashes 5 seconds later — we're tracking "user clicked Launch," not "app is running successfully."

---

### Task 2: System Tray
**Description:** Add a system tray icon with a context menu for showing the Launcher window and quitting. Support minimize-to-tray behavior.

**Subtasks:**
- [ ] 2.1 — Create `electron/tray.ts`:
  ```typescript
  import { Tray, Menu, nativeImage, app, BrowserWindow } from 'electron';
  import * as path from 'path';

  let tray: Tray | null = null;

  /**
   * Create the system tray icon and context menu.
   * Call this once during app.whenReady().
   */
  export function createTray(mainWindow: BrowserWindow): Tray {
    // Resolve icon path — different in dev vs packaged
    const iconPath = app.isPackaged
      ? path.join(process.resourcesPath, 'icon.ico')
      : path.join(__dirname, '..', 'resources', 'icon.ico');

    // Create tray with icon (fallback to empty image if icon missing)
    let icon: Electron.NativeImage;
    try {
      icon = nativeImage.createFromPath(iconPath);
    } catch {
      console.warn('[tray] Icon not found, using empty image');
      icon = nativeImage.createEmpty();
    }

    tray = new Tray(icon);
    tray.setToolTip('Shannon Launcher');

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show Launcher',
        click: () => {
          mainWindow.show();
          mainWindow.focus();
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          // Force quit — bypass the minimize-to-tray behavior
          app.exit(0);
        },
      },
    ]);

    tray.setContextMenu(contextMenu);

    // Double-click tray icon: show and focus window
    tray.on('double-click', () => {
      mainWindow.show();
      mainWindow.focus();
    });

    console.log('[tray] System tray created');
    return tray;
  }

  /**
   * Destroy the tray icon on app quit.
   */
  export function destroyTray(): void {
    if (tray) {
      tray.destroy();
      tray = null;
    }
  }
  ```
  The "Quit" menu item uses `app.exit(0)` instead of `app.quit()` to bypass the `window.close` event handler that would otherwise minimize to tray instead of quitting. This is intentional — the tray Quit action should always fully quit.

- [ ] 2.2 — Integrate tray with `electron/main.ts`. Add imports and create tray after window creation:
  ```typescript
  import { createTray, destroyTray } from './tray';
  import { readConfig } from './config';

  // In app.whenReady():
  app.whenReady().then(async () => {
    cleanupStaleDownloads();
    setupIPC(() => mainWindow);
    createWindow();

    // Create tray after window exists
    if (mainWindow) {
      createTray(mainWindow);
    }

    await loadApp();
    // ... existing startup checks
  });
  ```

- [ ] 2.3 — Implement minimize-to-tray on window close. Update `createWindow()` in `main.ts` to intercept the close event:
  ```typescript
  mainWindow.on('close', (event) => {
    const config = readConfig();
    if (config.settings.minimizeToTrayOnClose) {
      event.preventDefault();
      mainWindow?.hide();
      console.log('[main] Minimized to tray on close');
    } else {
      saveWindowState();
    }
  });
  ```
  When `minimizeToTrayOnClose` is `true`, clicking the window X button hides the window to the tray instead of quitting. The user can then click the tray icon to restore, or right-click → Quit to actually quit. When the setting is `false` (default), the X button quits normally.

- [ ] 2.4 — Implement minimize-to-tray on app launch. This is handled in the IPC `app:launch` handler (Task 3), not in the tray module itself.

- [ ] 2.5 — Clean up tray on app quit. Add to `main.ts`:
  ```typescript
  app.on('before-quit', () => {
    destroyTray();
  });
  ```

- [ ] 2.6 — Update the `window-all-closed` handler to account for tray behavior:
  ```typescript
  app.on('window-all-closed', () => {
    // On Windows, closing all windows should quit unless minimized to tray
    const config = readConfig();
    if (!config.settings.minimizeToTrayOnClose) {
      saveWindowState();
      app.quit();
    }
    // If minimize-to-tray is on, the window is hidden (not closed),
    // so this event only fires on actual quit — safe to quit here
  });
  ```

**Implementation Notes:**
- The tray icon path resolution checks `app.isPackaged` because `__dirname` resolves differently in dev vs packaged mode. In dev, `resources/icon.ico` is relative to the electron directory. In packaged, `process.resourcesPath` is the correct location.
- `app.exit(0)` vs `app.quit()`: `exit()` forces immediate exit with no event handlers. `quit()` fires `before-quit` and `will-quit` events, which is normally correct, but when minimize-to-tray is enabled, `quit()` can get intercepted by our `close` handler. The tray "Quit" must actually quit, so we use `exit()`.
- Actually, a cleaner pattern: set a flag `let isQuitting = false;` and check it in the close handler:
  ```typescript
  let isQuitting = false;

  app.on('before-quit', () => { isQuitting = true; });

  mainWindow.on('close', (event) => {
    if (!isQuitting && readConfig().settings.minimizeToTrayOnClose) {
      event.preventDefault();
      mainWindow?.hide();
    } else {
      saveWindowState();
    }
  });
  ```
  Then the tray "Quit" can use `app.quit()` instead of `app.exit()`, and the `before-quit` handler sets the flag so the close handler lets it through. This is the idiomatic Electron pattern.

---

### Task 3: IPC Handlers for Launch & Management
**Description:** Register IPC handlers for launching apps, opening folders, and opening external URLs.

**Subtasks:**
- [ ] 3.1 — Add imports to `electron/ipc.ts`:
  ```typescript
  import { launchApp, openInstallFolder } from './launcher';
  import { shell } from 'electron';
  ```

- [ ] 3.2 — Add `app:launch` handler inside `setupIPC()`:
  ```typescript
  ipcMain.handle('app:launch', (_event, appId: string) => {
    const result = launchApp(appId);

    if (result.success) {
      // Minimize to tray if setting enabled
      const config = readConfig();
      if (config.settings.minimizeToTrayOnAppLaunch) {
        const mainWindow = getMainWindow();
        mainWindow?.hide();
        console.log('[ipc] Minimized to tray after app launch');
      }
    }

    return result;
  });
  ```
  After a successful launch, if `minimizeToTrayOnAppLaunch` is enabled, the Launcher window hides to the tray. The user launched an app and probably wants it front and center, not the Launcher.

- [ ] 3.3 — Add `app:open-folder` handler:
  ```typescript
  ipcMain.handle('app:open-folder', (_event, appId: string) => {
    openInstallFolder(appId);
  });
  ```

- [ ] 3.4 — Add `launcher:open-external` handler for opening URLs in the default browser:
  ```typescript
  ipcMain.handle('launcher:open-external', (_event, url: string) => {
    // Security: only allow https URLs
    if (url.startsWith('https://')) {
      shell.openExternal(url);
    } else {
      console.warn(`[ipc] Blocked non-HTTPS URL: ${url}`);
    }
  });
  ```
  The HTTPS-only check is a security measure — we don't want to accidentally open `file://` or `javascript:` URLs that could come from crafted GitHub release notes.

---

### Task 4: Update Preload
**Description:** Expose the launch and management IPC channels to the renderer.

**Subtasks:**
- [ ] 4.1 — Add to `electron/preload.ts`:
  ```typescript
  // Launch & Management
  launchApp: (appId: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('app:launch', appId),
  openFolder: (appId: string): Promise<void> =>
    ipcRenderer.invoke('app:open-folder', appId),
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke('launcher:open-external', url),
  ```

- [ ] 4.2 — Update `frontend/src/types/electron.d.ts`:
  ```typescript
  launchApp: (appId: string) => Promise<{ success: boolean; error?: string }>;
  openFolder: (appId: string) => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  ```

---

### Task 5: Wire Launch Button in AppDetail
**Description:** Make the Launch button functional with a brief "Launching..." animation state.

**Subtasks:**
- [ ] 5.1 — In `frontend/src/components/AppDetail.tsx`, implement the launch handler:
  ```tsx
  async function handleLaunch() {
    // Set launching state in store (for visual feedback)
    useAppStore.getState().updateAppStatus(entry.id, 'launching');

    const result = await window.electronAPI.launchApp(entry.id);

    if (result.success) {
      // Show "Launching..." for at least 1.5 seconds for visual feedback
      setTimeout(() => {
        useAppStore.getState().updateAppStatus(entry.id, 'installed');
        useAppStore.getState().refreshConfig(); // Update lastLaunched timestamp
      }, 1500);
    } else {
      // Revert immediately on error
      useAppStore.getState().updateAppStatus(entry.id, 'installed');
      showToast('error', result.error || 'Failed to launch app');
    }
  }
  ```
  The 1.5-second minimum display for "Launching..." prevents a jarring flash (the IPC call returns almost instantly, but the user expects visual feedback that something happened). This matches spec section 8.5.

- [ ] 5.2 — Replace the disabled Launch button with the functional version:
  ```tsx
  {(status === 'installed' || status === 'update-available') && !app.downloadProgress && (
    <>
      <button
        onClick={handleLaunch}
        disabled={status === 'launching'}
        className="w-full py-2.5 rounded-lg bg-[#3B82F6] hover:bg-[#2563EB] text-white font-medium text-sm transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {status === 'launching' ? (
          <span className="flex items-center justify-center gap-2">
            <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Launching...
          </span>
        ) : 'Launch'}
      </button>
      {/* ... Update, Open Folder, Uninstall buttons below */}
    </>
  )}
  ```
  When status is `launching`, the button shows a spinner and "Launching..." text and is disabled to prevent double-clicks.

- [ ] 5.3 — Wire the "Open Folder" button:
  ```tsx
  <button
    onClick={() => window.electronAPI.openFolder(entry.id)}
    className="flex-1 py-2 rounded-lg bg-[#1A1A1A] text-[#A0A0A0] text-sm hover:bg-[#2A2A2A] hover:text-[#F5F5F5] transition-colors duration-150"
  >
    Open Folder
  </button>
  ```

- [ ] 5.4 — Show "Last launched" timestamp in the detail panel header. Update the installed info section:
  ```tsx
  {installed && (
    <div>
      <p className="text-[#A0A0A0] text-sm mt-1">v{installed.version}</p>
      {installed.lastLaunched && (
        <p className="text-[#666666] text-xs mt-0.5">
          Last launched {formatDate(installed.lastLaunched)}
        </p>
      )}
    </div>
  )}
  ```
  This may already be in the L2 implementation — verify it reads from `installed.lastLaunched` and that `refreshConfig()` after launch updates this display.

---

### Task 6: Wire Update Banner "Download Update" Button
**Description:** The Update Banner from L3 has a "Download Update" button that currently logs to console. Wire it to open the download URL in the default browser.

**Subtasks:**
- [ ] 6.1 — In `frontend/src/components/UpdateBanner.tsx`, replace the console.log with:
  ```tsx
  <button
    className="text-white text-sm font-medium hover:underline"
    onClick={() => {
      if (launcherUpdateAvailable?.downloadUrl) {
        window.electronAPI.openExternal(launcherUpdateAvailable.downloadUrl);
      }
    }}
  >
    Download Update
  </button>
  ```
  This opens the GitHub Releases page in the user's default browser, where they can download the new Launcher installer.

---

### Task 7: AppCard Launch Animation
**Description:** Add a subtle visual effect on the card when an app is in `launching` status.

**Subtasks:**
- [ ] 7.1 — In `frontend/src/components/AppCard.tsx`, update the `StatusBadge` handling for `launching` status:
  ```tsx
  'launching': {
    text: 'Launching...',
    bg: 'bg-[#3B82F6]/10',
    textColor: 'text-[#3B82F6]',
    pulse: true,  // Reuse the animate-pulse
  },
  ```
  The card badge pulses briefly during the 1.5-second launch state, giving visual feedback in the card grid even when the detail panel isn't open.

- [ ] 7.2 — Also add a subtle glow effect to the card border during launching:
  ```tsx
  // In AppCard's container className:
  status === 'launching' && 'border-[#3B82F6]/50 shadow-[0_0_12px_rgba(59,130,246,0.2)]',
  ```
  This makes the launching card subtly glow blue for the 1.5-second duration.

---

### Task 8: Keyboard Shortcuts
**Description:** Add keyboard shortcuts for common actions.

**Subtasks:**
- [ ] 8.1 — In `electron/main.ts`, register Ctrl+Q to quit:
  ```typescript
  import { globalShortcut } from 'electron';

  // Inside app.whenReady(), after createWindow():
  globalShortcut.register('CommandOrControl+Q', () => {
    app.quit();
  });
  ```
  Note: `globalShortcut` registers system-wide shortcuts. An alternative is to use the `Menu` accelerator system or handle `before-input-event` on the webContents. For a simple quit shortcut, `globalShortcut` is the most reliable.

  **Actually**, `globalShortcut` captures the key even when the app is NOT focused, which is undesirable. Better approach: use `webContents.on('before-input-event')`:
  ```typescript
  // In createWindow(), after mainWindow is created:
  mainWindow.webContents.on('before-input-event', (event, input) => {
    // Ctrl+Q: Quit
    if (input.control && input.key.toLowerCase() === 'q' && input.type === 'keyDown') {
      app.quit();
    }

    // Disable Ctrl+R reload in production
    if (app.isPackaged && input.control && input.key.toLowerCase() === 'r' && input.type === 'keyDown') {
      event.preventDefault();
    }
  });
  ```
  This only fires when the Launcher window is focused. Ctrl+R prevention stops users from accidentally reloading the Electron renderer in production (which would reset all Zustand state).

- [ ] 8.2 — Verify Escape key closes the detail panel. This was implemented in L2 via a `useEffect` with `keydown` listener in `AppDetail.tsx`. Verify it still works after all the L3–L4 modifications.

- [ ] 8.3 — Unregister shortcuts on quit (for `globalShortcut` if used):
  ```typescript
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });
  ```
  If using the `before-input-event` approach instead, this is not needed (the handler dies with the webContents).

**Implementation Notes:**
- The `before-input-event` approach is preferred over `globalShortcut` because it's window-scoped. A Launcher shouldn't capture Ctrl+Q system-wide — that would interfere with other apps.
- Ctrl+R prevention is production-only (`app.isPackaged` check). In dev mode, Ctrl+R is useful for reloading after code changes.

---

### Task 9: Update Main Process isQuitting Flag
**Description:** Implement the `isQuitting` flag pattern for clean tray/close behavior.

**Subtasks:**
- [ ] 9.1 — Add the flag at module scope in `electron/main.ts`:
  ```typescript
  let isQuitting = false;

  app.on('before-quit', () => {
    isQuitting = true;
    destroyTray();
  });
  ```

- [ ] 9.2 — Update the `mainWindow.on('close')` handler in `createWindow()`:
  ```typescript
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
  ```
  The `isQuitting` flag ensures that when the app is genuinely quitting (Ctrl+Q, tray Quit, system shutdown), the close handler doesn't intercept it and hide to tray. Only the X button triggers minimize-to-tray.

- [ ] 9.3 — Update the tray "Quit" to use `app.quit()` (not `app.exit()`) since the `isQuitting` flag now handles it cleanly:
  ```typescript
  {
    label: 'Quit',
    click: () => {
      app.quit();
    },
  },
  ```

---

## ACCEPTANCE CRITERIA

- [ ] AC-1: Clicking "Launch" on an installed app spawns the app's executable. The Launcher shows "Launching..." with a spinner for ~1.5 seconds, then reverts to "Installed ✓".
- [ ] AC-2: The launched app runs as a completely independent process. Closing the Launcher does NOT close the launched app. Verify by launching an app, then closing the Launcher — the app should keep running.
- [ ] AC-3: `lastLaunched` timestamp is updated in `config.json` immediately after launch and displays as "Last launched {date}" in the detail panel header.
- [ ] AC-4: "Open Folder" button opens the app's install directory in Windows Explorer. If the directory is missing, opens the parent directory.
- [ ] AC-5: System tray icon appears in the Windows system tray with tooltip "Shannon Launcher". Right-click shows a context menu with "Show Launcher" and "Quit".
- [ ] AC-6: Double-clicking the tray icon shows and focuses the Launcher window.
- [ ] AC-7: When `minimizeToTrayOnClose` is `true` (manually edit config.json): clicking the window X button hides the window to the tray instead of quitting. The tray icon remains. Double-click tray to restore.
- [ ] AC-8: When `minimizeToTrayOnAppLaunch` is `true` (manually edit config.json): after launching an app, the Launcher window hides to the tray automatically.
- [ ] AC-9: Tray "Quit" always fully quits the app, even when minimize-to-tray settings are enabled.
- [ ] AC-10: The Update Banner's "Download Update" button opens the GitHub releases URL in the default browser via `shell.openExternal()`.
- [ ] AC-11: Ctrl+Q quits the application (when Launcher window is focused).
- [ ] AC-12: Ctrl+R is blocked in production (packaged) builds to prevent accidental renderer reload.
- [ ] AC-13: Escape key still closes the detail panel (verify from L2).
- [ ] AC-14: If the app executable is missing when "Launch" is clicked, an error toast appears with a message suggesting repair. Status does NOT change to "broken" (that only happens on startup verification).
- [ ] AC-15: The AppCard shows a brief blue glow and "Launching..." badge with pulse during the 1.5-second launch animation.
- [ ] AC-16: The `launcher:open-external` IPC handler only allows `https://` URLs (security).
- [ ] AC-17: No TypeScript errors. No console errors. No orphaned processes.

---

## FILES TOUCHED

**New files:**
- `electron/launcher.ts` — launchApp(), openInstallFolder() (~60 lines)
- `electron/tray.ts` — createTray(), destroyTray() (~70 lines)

**Modified files:**
- `electron/ipc.ts` — add app:launch, app:open-folder, launcher:open-external handlers. Import launcher module and shell.
- `electron/main.ts` — import tray module, create tray in whenReady, add isQuitting flag, update close handler for minimize-to-tray, add before-quit handler, add before-input-event for Ctrl+Q and Ctrl+R
- `electron/preload.ts` — add launchApp, openFolder, openExternal methods
- `frontend/src/types/electron.d.ts` — add launchApp, openFolder, openExternal types
- `frontend/src/components/AppDetail.tsx` — implement handleLaunch with 1.5s animation, wire Open Folder button, verify lastLaunched display
- `frontend/src/components/AppCard.tsx` — add launching status glow effect, verify launching badge
- `frontend/src/components/UpdateBanner.tsx` — wire Download Update to openExternal
- `frontend/src/stores/appStore.ts` — no new actions needed (updateAppStatus and refreshConfig already exist)

---

## BUILDER PROMPT

> **Session L5 — Launch + App Management [Core]**
>
> You are building session L5 of the Shannon Launcher. L1–L4 are complete. You have a working Launcher that can display apps, check for updates, download, install, update, and uninstall. Now add the launch system, tray integration, and management features to complete the core workflow.
>
> **Working directory:** `C:\Claude Access Point\Launcher`
>
> **What you're building:** App launching (spawn detached exe), system tray (icon + menu + minimize-to-tray), management (open folder, last-launched tracking), URL opening (for Update Banner), and keyboard shortcuts.
>
> **Existing code (from L1–L4):**
>
> *Electron:*
> - `electron/types.ts` — AppEntry (with executableName), InstalledApp (with executablePath, lastLaunched), LauncherConfig, LauncherSettings (with minimizeToTrayOnAppLaunch, minimizeToTrayOnClose), plus all download/install types
> - `electron/config.ts` — readConfig(), writeConfig()
> - `electron/registry.ts` — APP_REGISTRY
> - `electron/github.ts` — fetchLatestRelease(), isNewerVersion()
> - `electron/updater.ts` — checkForAppUpdates(), checkForLauncherUpdate()
> - `electron/downloader.ts` — downloadAsset(), cancelDownload(), cleanupStaleDownloads()
> - `electron/installer.ts` — installApp(), uninstallApp(), verifyInstallation()
> - `electron/ipc.ts` — setupIPC(getMainWindow) with all L1–L4 handlers
> - `electron/preload.ts` — electronAPI with all L1–L4 methods + onDownloadProgress, onAppStatusChanged, onLauncherUpdateAvailable
> - `electron/main.ts` — window, lifecycle, startup checks, cleanupStaleDownloads. Has `let mainWindow`, `let isQuitting` does NOT exist yet
>
> *Frontend:*
> - `frontend/src/stores/appStore.ts` — apps[], config, updateAppStatus(), refreshConfig(), all download progress handling
> - `frontend/src/components/AppDetail.tsx` — FUNCTIONAL Install, Update, Uninstall, Cancel buttons (from L4). Launch and Open Folder are NOT yet functional.
> - `frontend/src/components/AppCard.tsx` — StatusBadge handles 'launching' text but no glow effect yet
> - `frontend/src/components/UpdateBanner.tsx` — "Download Update" button logs to console (not yet wired to openExternal)
> - `frontend/src/components/Toast.tsx` — showToast() imperative API
> - `frontend/src/lib/utils.ts` — formatDate(), cn()
>
> **Task 1: Launcher Module** (`electron/launcher.ts`)
> - `launchApp(appId)`: read config, verify exe exists (`fs.existsSync`), `spawn(exe, [], { detached: true, stdio: 'ignore', cwd: installPath })`, `child.unref()`, update `lastLaunched` in config, return `{ success, error? }`. Log PID on success. Error messages should be actionable.
> - `openInstallFolder(appId)`: read config, `shell.openPath(installPath)`. If path gone, try parent directory. Log with `[launcher]` prefix.
>
> **Task 2: System Tray** (`electron/tray.ts`)
> - `createTray(mainWindow)`: resolve icon path (dev vs packaged), `new Tray(icon)`, tooltip "Shannon Launcher", context menu: "Show Launcher" (show+focus) + separator + "Quit" (app.quit()). Double-click: show+focus. Handle missing icon gracefully (nativeImage.createEmpty fallback).
> - `destroyTray()`: destroy if exists.
>
> **Task 3: Tray Integration in main.ts**
> - Add `let isQuitting = false;` at module scope
> - `app.on('before-quit', () => { isQuitting = true; destroyTray(); })`
> - Create tray in whenReady after createWindow: `createTray(mainWindow)`
> - Update `mainWindow.on('close')`: if `!isQuitting && config.settings.minimizeToTrayOnClose` → `event.preventDefault(); mainWindow.hide()`. Else → `saveWindowState()`.
> - Update `window-all-closed`: if not minimize-to-tray → save + quit.
>
> **Task 4: IPC Handlers**
> - `app:launch`: call launchApp(appId). If success AND `config.settings.minimizeToTrayOnAppLaunch` → `getMainWindow()?.hide()`. Return result.
> - `app:open-folder`: call openInstallFolder(appId).
> - `launcher:open-external`: `shell.openExternal(url)` but ONLY if `url.startsWith('https://')`. Log and block non-HTTPS.
>
> **Task 5: Preload** — Add: launchApp, openFolder, openExternal.
>
> **Task 6: AppDetail Launch Button**
> - `handleLaunch()`: set status 'launching' in store → call IPC → if success: `setTimeout(() => set status 'installed' + refreshConfig(), 1500)`. If error: revert to 'installed' immediately + error toast.
> - Button shows spinner + "Launching..." when status is 'launching', disabled during animation.
> - Wire Open Folder button to `window.electronAPI.openFolder(entry.id)`.
> - Verify "Last launched {date}" displays from installed.lastLaunched.
>
> **Task 7: Update Banner** — Replace console.log with `window.electronAPI.openExternal(downloadUrl)`.
>
> **Task 8: AppCard** — Add blue glow on launching status: `border-[#3B82F6]/50 shadow-[0_0_12px_rgba(59,130,246,0.2)]`. Badge already handles 'launching' text+pulse from L2.
>
> **Task 9: Keyboard Shortcuts** — In `createWindow()`, add `mainWindow.webContents.on('before-input-event')`:
> - Ctrl+Q → `app.quit()` (only when focused, not system-wide)
> - Ctrl+R → `event.preventDefault()` only when `app.isPackaged` (production only)
> - Verify Escape still closes detail panel (L2 implementation).
>
> **Acceptance criteria:**
> 1. Launch → spawns exe, shows "Launching..." 1.5s with spinner, reverts to "Installed"
> 2. Launched app survives Launcher close (detached + unref)
> 3. lastLaunched updates in config.json and displays in detail panel
> 4. Open Folder → Explorer at install path (fallback to parent if missing)
> 5. Tray icon appears, right-click: Show Launcher / Quit
> 6. Double-click tray → show + focus window
> 7. minimizeToTrayOnClose=true → X hides to tray, tray Quit still works
> 8. minimizeToTrayOnAppLaunch=true → window hides after launch
> 9. Tray Quit always fully quits (isQuitting flag pattern)
> 10. Update Banner Download opens URL in browser
> 11. Ctrl+Q quits (window-scoped, not global)
> 12. Ctrl+R blocked in production
> 13. Escape closes detail panel
> 14. Missing exe → error toast (doesn't auto-mark broken, that's startup only)
> 15. Card glows blue during 1.5s launch animation
> 16. openExternal only allows https:// URLs
> 17. No TypeScript errors, no orphaned processes
>
> **Technical constraints:**
> - `spawn(exe, [], { detached: true, stdio: 'ignore' })` + `child.unref()` — standard pattern for independent child processes
> - `shell.openPath()` for folders, `shell.openExternal()` for URLs
> - `isQuitting` flag at module scope — set in `before-quit`, checked in `close` handler
> - `before-input-event` on webContents (NOT `globalShortcut`) — window-scoped shortcuts
> - Tray icon path: `process.resourcesPath` in packaged, `__dirname/../resources` in dev
> - `nativeImage.createEmpty()` fallback if icon missing
> - HTTPS-only check on openExternal — security measure
> - 1.5-second minimum launch animation via setTimeout before reverting status
> - All logging: `[launcher]`, `[tray]`, `[main]`, `[ipc]` prefixes
