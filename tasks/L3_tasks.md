# Session L3 — GitHub Release Checker + Update Detection [Backend]

**Priority:** High
**Type:** Mixed (Electron Main Process + Frontend Store/UI Updates)
**Depends On:** L1 (Config + Registry + IPC), L2 (Zustand Store + AppCard + AppDetail + Sidebar)
**Spec Reference:** `specs/DETAILED_SPEC.md` → Sections 1.3 (ReleaseInfo, ReleaseAsset, ReleaseCacheEntry), 2.1–2.2 (IPC channels: releases:check-all, releases:check-one, launcher:check-update, app:status-changed, launcher:update-available), 3 (GitHub Releases API), 7.1 (Edge case: GitHub unreachable), 8.4 (Update Available badge), 9 (Self-Update Flow)

---

## SCOPE SUMMARY

Build the GitHub Releases API integration in the Electron main process: fetch the latest release for each registered app, compare installed versions against latest, cache results to avoid API spam, and push update availability to the renderer. On startup, the Launcher silently checks for updates in the background and shows amber "Update Available" badges on app cards that have newer versions. Also check for Launcher self-updates and show a persistent banner. Handle offline gracefully — no errors surfaced to users, just subtle "couldn't check" text.

---

## TASKS

### Task 1: Add Release Types to Electron
**Description:** Add the GitHub release types to the shared Electron type definitions.

**Subtasks:**
- [ ] 1.1 — In `electron/types.ts`, add the following exports:
  ```typescript
  /** Parsed from GitHub Releases API response */
  export interface ReleaseInfo {
    tagName: string;
    version: string;
    name: string;
    body: string;
    publishedAt: string;
    installerAsset: ReleaseAsset | null;
  }

  export interface ReleaseAsset {
    name: string;
    downloadUrl: string;
    size: number;
  }

  /** Cache entry for rate limiting */
  export interface ReleaseCacheEntry {
    release: ReleaseInfo;
    fetchedAt: number;
  }
  ```

- [ ] 1.2 — Also add the Launcher's own GitHub repo config constant:
  ```typescript
  export const LAUNCHER_GITHUB = {
    owner: 'OWNER_TBD',
    repo: 'shannon-launcher',
  };
  ```

**Implementation Notes:**
- These types are used by `github.ts`, `updater.ts`, and also mirrored on the frontend (already defined in L2's `frontend/src/types/index.ts`).

---

### Task 2: GitHub API Client
**Description:** Create the GitHub Releases API client module with in-memory caching, rate limit awareness, and error handling.

**Subtasks:**
- [ ] 2.1 — Create `electron/github.ts`:
  ```typescript
  import { net, app } from 'electron';
  import { AppEntry, ReleaseInfo, ReleaseAsset, ReleaseCacheEntry } from './types';

  // --- Cache ---
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  const REQUEST_TIMEOUT_MS = 5000;
  const releaseCache = new Map<string, ReleaseCacheEntry>();

  // --- Rate limit tracking ---
  let rateLimitResetAt = 0; // Unix timestamp (ms) when rate limit resets
  let rateLimitRemaining = 60; // GitHub's default for unauthenticated
  ```

- [ ] 2.2 — Implement `parseRelease()` to extract structured data from the GitHub API JSON:
  ```typescript
  function parseRelease(data: any): ReleaseInfo {
    const version = (data.tag_name || '').replace(/^v/, '');

    // Find the .exe installer asset
    // Strategy: prefer asset with content_type 'application/x-executable',
    // fall back to any .exe file, skip blockmap files
    const assets: any[] = data.assets || [];
    const installerAsset = assets.find(
      (a) => a.name.endsWith('.exe') && !a.name.includes('blockmap') && a.content_type === 'application/x-executable'
    ) ?? assets.find(
      (a) => a.name.endsWith('.exe') && !a.name.includes('blockmap')
    ) ?? null;

    return {
      tagName: data.tag_name || '',
      version,
      name: data.name || `v${version}`,
      body: data.body || '',
      publishedAt: data.published_at || '',
      installerAsset: installerAsset ? {
        name: installerAsset.name,
        downloadUrl: installerAsset.browser_download_url,
        size: installerAsset.size || 0,
      } : null,
    };
  }
  ```
  The `!a.name.includes('blockmap')` filter is important — electron-builder publishes both the `.exe` installer and a `.exe.blockmap` file for differential updates. We want the installer, not the blockmap.

- [ ] 2.3 — Implement `fetchLatestRelease()`:
  ```typescript
  export async function fetchLatestRelease(entry: AppEntry): Promise<ReleaseInfo | null> {
    // Check cache
    const cached = releaseCache.get(entry.id);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      console.log(`[github] Using cached release for ${entry.id}`);
      return cached.release;
    }

    // Check rate limit
    if (rateLimitRemaining <= 1 && Date.now() < rateLimitResetAt) {
      console.log(`[github] Rate limited, skipping ${entry.id}. Resets at ${new Date(rateLimitResetAt).toISOString()}`);
      return cached?.release ?? null; // Return stale cache if available
    }

    const url = `https://api.github.com/repos/${entry.github.owner}/${entry.github.repo}/releases/latest`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await net.fetch(url, {
        headers: {
          'User-Agent': `ShannonLauncher/${app.getVersion()}`,
          'Accept': 'application/vnd.github.v3+json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Read rate limit headers
      const remaining = response.headers.get('x-ratelimit-remaining');
      const reset = response.headers.get('x-ratelimit-reset');
      if (remaining !== null) {
        rateLimitRemaining = parseInt(remaining, 10);
        console.log(`[github] Rate limit remaining: ${rateLimitRemaining}`);
      }
      if (reset !== null) {
        rateLimitResetAt = parseInt(reset, 10) * 1000; // Convert seconds to ms
      }

      if (response.status === 404) {
        console.log(`[github] No releases found for ${entry.id}`);
        return null;
      }

      if (response.status === 403) {
        console.warn(`[github] Rate limited for ${entry.id}`);
        return cached?.release ?? null;
      }

      if (!response.ok) {
        console.warn(`[github] HTTP ${response.status} for ${entry.id}`);
        return null;
      }

      const data = await response.json();
      const release = parseRelease(data);

      // Cache the result
      releaseCache.set(entry.id, { release, fetchedAt: Date.now() });
      console.log(`[github] Fetched release for ${entry.id}: v${release.version}`);

      return release;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.warn(`[github] Timeout fetching release for ${entry.id}`);
      } else {
        console.warn(`[github] Error fetching release for ${entry.id}:`, error.message);
      }
      return cached?.release ?? null; // Return stale cache if available
    }
  }
  ```

- [ ] 2.4 — Implement `fetchAllReleases()`:
  ```typescript
  export async function fetchAllReleases(registry: AppEntry[]): Promise<Record<string, ReleaseInfo | null>> {
    const results: Record<string, ReleaseInfo | null> = {};
    // Sequential, not parallel — respect rate limits
    for (const entry of registry) {
      results[entry.id] = await fetchLatestRelease(entry);
    }
    return results;
  }
  ```
  Sequential iteration is intentional. With only 60 requests/hour for unauthenticated access and potentially many apps in the future, we don't want to fire them all at once.

- [ ] 2.5 — Implement `clearReleaseCache()`:
  ```typescript
  export function clearReleaseCache(): void {
    releaseCache.clear();
    console.log('[github] Release cache cleared');
  }
  ```

**Implementation Notes:**
- `net.fetch()` is Electron's native fetch implementation. It respects system proxy settings (unlike Node.js `https`), which is important for corporate environments.
- The AbortController timeout pattern: create controller, set a setTimeout to abort, clear the timeout on response. This gives us a hard 5-second timeout without needing a library.
- On any error, we try to return stale cached data rather than `null` — this gives a better UX when network is flaky.
- The `blockmap` filter is a real-world necessity. Without it, a release with both `Finance-App-Setup-2.0.0.exe` and `Finance-App-Setup-2.0.0.exe.blockmap` could match the wrong file.

---

### Task 3: Version Comparison Utility
**Description:** Implement semver comparison without external dependencies.

**Subtasks:**
- [ ] 3.1 — Add to `electron/github.ts` (or a separate utility section within the file):
  ```typescript
  /**
   * Returns true if `latest` is a newer version than `current`.
   * Handles `v` prefix. Compares major.minor.patch numerically.
   * Examples: isNewerVersion('1.0.0', '1.0.1') → true
   *           isNewerVersion('2.0.0', '1.9.9') → false
   */
  export function isNewerVersion(current: string, latest: string): boolean {
    const parse = (v: string): [number, number, number] => {
      const parts = v.replace(/^v/, '').split('.').map(Number);
      return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
    };
    const [cMaj, cMin, cPat] = parse(current);
    const [lMaj, lMin, lPat] = parse(latest);
    if (lMaj !== cMaj) return lMaj > cMaj;
    if (lMin !== cMin) return lMin > cMin;
    return lPat > cPat;
  }
  ```

**Implementation Notes:**
- No dependency on `semver` package. This handles 99% of real-world cases. Pre-release tags (e.g., `1.0.0-beta.1`) are NOT handled — they'll compare incorrectly, but we don't use them in this project.
- The `v` prefix strip is defensive — GitHub tags may or may not include it.

---

### Task 4: Update Checker Module
**Description:** Create the update detection module that orchestrates release checks for all apps and the launcher itself.

**Subtasks:**
- [ ] 4.1 — Create `electron/updater.ts`:
  ```typescript
  import { app } from 'electron';
  import { AppEntry, ReleaseInfo, LAUNCHER_GITHUB } from './types';
  import { fetchLatestRelease, isNewerVersion } from './github';
  import { readConfig } from './config';
  import { APP_REGISTRY } from './registry';

  export interface UpdateCheckResult {
    appId: string;
    currentVersion: string | null;
    latestVersion: string;
    updateAvailable: boolean;
    release: ReleaseInfo;
  }
  ```

- [ ] 4.2 — Implement `checkForAppUpdates()`:
  ```typescript
  export async function checkForAppUpdates(): Promise<UpdateCheckResult[]> {
    const config = readConfig();
    const results: UpdateCheckResult[] = [];

    for (const entry of APP_REGISTRY) {
      const release = await fetchLatestRelease(entry);
      if (!release) continue; // Skip apps where fetch failed

      const installed = config.installedApps[entry.id];
      const updateAvailable = installed
        ? isNewerVersion(installed.version, release.version)
        : false; // Not installed = not "update available" (it's just "available")

      results.push({
        appId: entry.id,
        currentVersion: installed?.version ?? null,
        latestVersion: release.version,
        updateAvailable,
        release,
      });
    }

    return results;
  }
  ```
  Note: `updateAvailable` is only `true` when the app IS installed AND a newer version exists. An uninstalled app with a release is not an "update" — it's just available for install.

- [ ] 4.3 — Implement `checkForLauncherUpdate()`:
  ```typescript
  export async function checkForLauncherUpdate(): Promise<{
    available: boolean;
    version?: string;
    downloadUrl?: string;
  }> {
    const fakeEntry: AppEntry = {
      id: 'shannon-launcher',
      name: 'Shannon Launcher',
      description: '',
      longDescription: '',
      github: LAUNCHER_GITHUB,
      icon: '',
      installSize: '',
      tags: [],
      executableName: '',
    };

    const release = await fetchLatestRelease(fakeEntry);
    if (!release) {
      return { available: false };
    }

    const currentVersion = app.getVersion();
    const available = isNewerVersion(currentVersion, release.version);

    return {
      available,
      version: release.version,
      downloadUrl: `https://github.com/${LAUNCHER_GITHUB.owner}/${LAUNCHER_GITHUB.repo}/releases/latest`,
    };
  }
  ```
  This creates a temporary `AppEntry` to reuse `fetchLatestRelease()`. The download URL points to the GitHub releases page (not the direct asset URL), so the user downloads from a trusted GitHub page.

**Implementation Notes:**
- `checkForAppUpdates()` returns results for ALL registry apps, not just installed ones. This lets the frontend know the latest version even for uninstalled apps (useful for showing "latest: v2.1.0" in the detail panel).
- The update check for the Launcher itself uses the same GitHub API client. The Launcher's own version comes from `app.getVersion()` which reads from `package.json`.

---

### Task 5: IPC Handlers for Release Checking
**Description:** Register IPC handlers for release-related channels and wire up the non-blocking startup check.

**Subtasks:**
- [ ] 5.1 — Add to `electron/ipc.ts` (import new modules at top):
  ```typescript
  import { fetchLatestRelease, fetchAllReleases } from './github';
  import { checkForAppUpdates, checkForLauncherUpdate } from './updater';
  ```

- [ ] 5.2 — Add release-checking handlers inside `setupIPC()`:
  ```typescript
  ipcMain.handle('releases:check-all', async () => {
    const results = await checkForAppUpdates();
    const map: Record<string, any> = {};
    for (const r of results) {
      map[r.appId] = r.release;
    }
    return map;
  });

  ipcMain.handle('releases:check-one', async (_event, appId: string) => {
    const entry = APP_REGISTRY.find((e) => e.id === appId);
    if (!entry) return null;
    return fetchLatestRelease(entry);
  });

  ipcMain.handle('launcher:check-update', async () => {
    return checkForLauncherUpdate();
  });
  ```

- [ ] 5.3 — Add the startup update check in `electron/main.ts`. After `loadApp()` in the `app.whenReady()` block, add a non-blocking fire-and-forget check:
  ```typescript
  app.whenReady().then(async () => {
    setupIPC();
    createWindow();
    await loadApp();

    // Non-blocking update checks after app is loaded
    const config = readConfig();
    if (config.settings.checkUpdatesOnLaunch) {
      // App updates
      checkForAppUpdates().then((results) => {
        for (const r of results) {
          // Send release info to renderer for each app
          mainWindow?.webContents.send('app:status-changed', {
            appId: r.appId,
            status: r.updateAvailable ? 'update-available' : undefined,
            release: r.release,
          });
        }
        console.log(`[startup] Update check complete: ${results.length} apps checked, ${results.filter(r => r.updateAvailable).length} updates available`);
      }).catch((err) => {
        console.warn('[startup] App update check failed:', err.message);
      });

      // Launcher self-update
      checkForLauncherUpdate().then((result) => {
        if (result.available) {
          mainWindow?.webContents.send('launcher:update-available', {
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
  ```
  Both checks are fire-and-forget (`.then()` not `await`). The UI loads instantly; update badges appear seconds later when the GitHub API responds.

- [ ] 5.4 — Import the new modules in `main.ts`:
  ```typescript
  import { readConfig } from './config';
  import { checkForAppUpdates, checkForLauncherUpdate } from './updater';
  ```

**Implementation Notes:**
- The startup checks respect the `checkUpdatesOnLaunch` setting. If disabled, no API calls are made.
- The `app:status-changed` event now sends both `status` and `release` data. The renderer needs both to update the badge text ("Update v2.1.0") and to show release notes.
- These are NOT `await`ed in the startup flow. The window opens immediately. The update data arrives asynchronously.

---

### Task 6: Update Preload & Frontend Types
**Description:** Expose the new IPC channels to the renderer and update the type declarations.

**Subtasks:**
- [ ] 6.1 — Add to `electron/preload.ts` inside the `contextBridge.exposeInMainWorld` object:
  ```typescript
  // Releases
  checkAllReleases: (): Promise<any> =>
    ipcRenderer.invoke('releases:check-all'),
  checkOneRelease: (appId: string): Promise<any> =>
    ipcRenderer.invoke('releases:check-one', appId),
  checkLauncherUpdate: (): Promise<any> =>
    ipcRenderer.invoke('launcher:check-update'),

  // Events (Main → Renderer)
  onAppStatusChanged: (callback: (data: any) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('app:status-changed', handler);
    return () => ipcRenderer.removeListener('app:status-changed', handler);
  },
  ```

- [ ] 6.2 — Update `frontend/src/types/electron.d.ts` — add to the `ElectronAPI` interface:
  ```typescript
  checkAllReleases: () => Promise<Record<string, import('./index').ReleaseInfo | null>>;
  checkOneRelease: (appId: string) => Promise<import('./index').ReleaseInfo | null>;
  checkLauncherUpdate: () => Promise<{ available: boolean; version?: string; downloadUrl?: string }>;
  onAppStatusChanged: (callback: (data: { appId: string; status?: string; release?: import('./index').ReleaseInfo }) => void) => () => void;
  ```

**Implementation Notes:**
- The `onAppStatusChanged` callback receives an object with optional `status` and `release` fields. The status may be undefined if the main process is just sending release info (not a status change).

---

### Task 7: Wire Frontend Store to Update Data
**Description:** Update the Zustand store and app initialization to consume release data and status updates from the main process.

**Subtasks:**
- [ ] 7.1 — Update `frontend/src/stores/appStore.ts` `initialize()` to trigger release checks and subscribe to events. After the existing `Promise.all` and state set, add:
  ```typescript
  // Subscribe to push events from main process
  window.electronAPI.onAppStatusChanged((data) => {
    if (data.release) {
      get().updateAppRelease(data.appId, data.release);
    }
    if (data.status === 'update-available') {
      // Only mark as update-available if app is currently installed
      const app = get().apps.find(a => a.entry.id === data.appId);
      if (app?.installed) {
        get().updateAppStatus(data.appId, 'update-available');
      }
    }
  });

  window.electronAPI.onLauncherUpdateAvailable((data) => {
    get().setLauncherUpdate({ version: data.latestVersion, downloadUrl: data.downloadUrl });
  });

  // Also trigger a manual check from the renderer side
  // (the main process also does this on startup, but this ensures
  // we catch it even if the renderer loaded after the main process fired)
  set({ updateCheckInProgress: true });
  window.electronAPI.checkAllReleases().then((releaseMap) => {
    const currentApps = get().apps;
    const config = get().config;
    for (const [appId, release] of Object.entries(releaseMap)) {
      if (release) {
        get().updateAppRelease(appId, release);
        // Check if update available
        const app = currentApps.find(a => a.entry.id === appId);
        if (app?.installed && release.version) {
          const installed = config?.installedApps[appId];
          if (installed) {
            // Simple comparison: if versions differ and release is newer
            const current = installed.version;
            const latest = release.version;
            if (current !== latest) {
              // Trust that latest from GitHub is newer (GitHub sorts by date)
              get().updateAppStatus(appId, 'update-available');
            }
          }
        }
      }
    }
    set({ updateCheckInProgress: false });
  }).catch(() => {
    set({ updateCheckInProgress: false });
  });
  ```

- [ ] 7.2 — The `updateAppRelease` action (already defined in L2) sets the `latestRelease` field on the matching app. Verify it works correctly — when a release is set, the `AppCard` should have access to `app.latestRelease.version` for the badge text.

**Implementation Notes:**
- There's intentional redundancy: the main process pushes `app:status-changed` events on startup, AND the renderer calls `checkAllReleases()`. This ensures updates are caught regardless of timing. The store handles duplicate calls gracefully (setting the same status twice is a no-op visually).
- Version comparison on the frontend is intentionally simple (`current !== latest`). The full semver check happens on the backend in `updater.ts`. The frontend just needs to know "the versions are different."

---

### Task 8: Update AppCard Badge for Update Status
**Description:** The `StatusBadge` in `AppCard.tsx` already handles `update-available` status from L2 (amber badge with pulse). Verify that when `latestRelease` is populated, the badge shows the version number.

**Subtasks:**
- [ ] 8.1 — In `frontend/src/components/AppCard.tsx`, verify the `StatusBadge` component reads `updateVersion` from `app.latestRelease?.version`:
  ```tsx
  <StatusBadge status={status} updateVersion={latestRelease?.version} />
  ```
  If this is already correct from L2, no changes needed. If the prop wasn't connected, wire it.

- [ ] 8.2 — Verify the badge text for `update-available` renders as `"Update v2.1.0"` (not just `"Update"`). The L2 implementation should handle this via:
  ```typescript
  text: `Update ${updateVersion ? `v${updateVersion}` : ''}`,
  ```

---

### Task 9: Update AppDetail to Show Release Notes
**Description:** When an app has an update available, show the release notes in the detail panel.

**Subtasks:**
- [ ] 9.1 — In `frontend/src/components/AppDetail.tsx`, add a release notes section between the description and action buttons. Show only when `latestRelease` exists and status is `update-available`:
  ```tsx
  {/* Release Notes (when update available) */}
  {status === 'update-available' && latestRelease && (
    <div className="px-6 pb-4">
      <div className="rounded-lg bg-[#141414] border border-[#2A2A2A] p-4">
        <h3 className="text-[#F5F5F5] text-sm font-semibold mb-2">
          What's new in v{latestRelease.version}
        </h3>
        <p className="text-[#A0A0A0] text-xs leading-relaxed whitespace-pre-line">
          {latestRelease.body || 'No release notes available.'}
        </p>
      </div>
    </div>
  )}
  ```
  `whitespace-pre-line` preserves the markdown line breaks from GitHub release notes without full markdown rendering.

- [ ] 9.2 — Also show the latest available version for uninstalled apps:
  ```tsx
  {/* Latest version indicator for not-installed apps */}
  {status === 'not-installed' && latestRelease && (
    <p className="text-[#666666] text-xs px-6 pb-2">
      Latest: v{latestRelease.version} • Released {formatDate(latestRelease.publishedAt)}
    </p>
  )}
  ```

---

### Task 10: Update Banner Component
**Description:** Build the persistent top banner shown when the Launcher itself has an update.

**Subtasks:**
- [ ] 10.1 — Create `frontend/src/components/UpdateBanner.tsx`:
  ```tsx
  import { useState } from 'react';
  import { useAppStore } from '../stores/appStore';

  export default function UpdateBanner() {
    const { launcherUpdateAvailable, launcherVersion } = useAppStore();
    const [dismissed, setDismissed] = useState(false);

    if (!launcherUpdateAvailable || dismissed) return null;

    return (
      <div className="h-12 bg-[#6366F1] flex items-center justify-between px-6 shrink-0">
        <p className="text-white text-sm">
          <span className="font-medium">⬆ Launcher update available</span>
          <span className="text-white/80 ml-2">
            v{launcherUpdateAvailable.version} — You're on v{launcherVersion}
          </span>
        </p>
        <div className="flex items-center gap-3">
          <button
            className="text-white text-sm font-medium hover:underline"
            onClick={() => {
              // Will be wired to shell.openExternal in L5
              console.log('Open:', launcherUpdateAvailable.downloadUrl);
            }}
          >
            Download Update
          </button>
          <button
            className="text-white/60 hover:text-white transition-colors"
            onClick={() => setDismissed(true)}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
    );
  }
  ```
  Height: 48px (`h-12`). Background: `accent-info` (#6366F1). Dismissable for the current session only (state resets on restart). The "Download Update" button is logged to console in L3 — it gets wired to `shell.openExternal` in L5 when the `openExternal` IPC channel is added.

- [ ] 10.2 — Add `UpdateBanner` to `App.tsx`. Insert it between the `<Sidebar />` and the content area, inside the main content column:
  ```tsx
  <main className="flex-1 flex flex-col overflow-hidden">
    <UpdateBanner />
    <div className="flex-1 overflow-hidden">
      {activeView === 'library' && <Library />}
      {activeView === 'settings' && (
        <div className="flex items-center justify-center h-full">
          <p className="text-[#666666] text-sm">Settings — coming in L6</p>
        </div>
      )}
    </div>
  </main>
  ```
  The banner sits above the content, pushing it down. `shrink-0` prevents it from being compressed by flex.

---

### Task 11: Sidebar Update Check Indicator
**Description:** Show a subtle "Checking for updates..." text in the sidebar footer while update checks are in progress.

**Subtasks:**
- [ ] 11.1 — Verify that `Sidebar.tsx` already reads `updateCheckInProgress` from the store (added in L2). If it shows the text, confirm styling. If not, add:
  ```tsx
  {updateCheckInProgress && (
    <p className="text-[#A0A0A0] text-[10px] mb-1 animate-pulse">Checking for updates...</p>
  )}
  ```
  The `animate-pulse` gives it a subtle breathing effect while checking.

- [ ] 11.2 — When checks are complete and all failed (offline), show:
  ```tsx
  {!updateCheckInProgress && offlineMode && (
    <p className="text-[#666666] text-[10px] mb-1">Couldn't check for updates</p>
  )}
  ```
  To detect offline, add a derived value in the store: `offlineMode` is true when `initialized === true` AND all apps have `latestRelease === null` AND `updateCheckInProgress === false`. Add this as a computed getter or a simple check in the component.

---

## ACCEPTANCE CRITERIA

- [ ] AC-1: On startup (with network available), the Launcher checks GitHub Releases for each registered app. Console logs show `[github] Fetched release for finance-app: v{X.Y.Z}`.
- [ ] AC-2: If a GitHub release exists with a higher version than the installed version, the app card shows "Update v{X.Y.Z}" badge in amber (`#F59E0B`) with a subtle pulse animation.
- [ ] AC-3: If the app is NOT installed, the card still shows "Available" (no update badge). The detail panel shows "Latest: v{X.Y.Z} • Released {date}".
- [ ] AC-4: If GitHub is unreachable (test: disconnect network before launch), the app shows its last known state without errors. Sidebar footer shows "Couldn't check for updates" in muted text. No error toasts.
- [ ] AC-5: API responses are cached for 5 minutes. A second `releases:check-all` call within 5 minutes uses the cache. Console shows `[github] Using cached release for finance-app`.
- [ ] AC-6: Rate limit headers are read and logged: `[github] Rate limit remaining: {N}`.
- [ ] AC-7: The detail panel shows release notes (from `release.body`) in a styled card when an update is available. Text preserves line breaks.
- [ ] AC-8: If the Launcher itself has a newer version on GitHub, an indigo banner (48px, #6366F1) appears at the top of the main content area showing current and latest versions with a "Download Update" button (logs to console for now) and a dismiss X.
- [ ] AC-9: "Checking for updates..." text with pulse animation appears in the sidebar footer during the check and disappears when complete.
- [ ] AC-10: The `electron/github.ts` module filters out `.blockmap` files when finding the installer asset.
- [ ] AC-11: The update check respects the `checkUpdatesOnLaunch` config setting. If set to `false` (manually edit config.json), no API calls are made on startup.
- [ ] AC-12: `ReleaseInfo`, `ReleaseAsset`, `ReleaseCacheEntry` types are exported from `electron/types.ts`.
- [ ] AC-13: No TypeScript errors. No unhandled promise rejections in console.

---

## FILES TOUCHED

**New files:**
- `electron/github.ts` — GitHub Releases API client with cache + rate limit (~130 lines)
- `electron/updater.ts` — Update checker for apps + launcher self-update (~70 lines)
- `frontend/src/components/UpdateBanner.tsx` — Launcher self-update banner (~50 lines)

**Modified files:**
- `electron/types.ts` — add ReleaseInfo, ReleaseAsset, ReleaseCacheEntry, LAUNCHER_GITHUB
- `electron/ipc.ts` — add releases:check-all, releases:check-one, launcher:check-update handlers
- `electron/main.ts` — add non-blocking startup update checks after loadApp()
- `electron/preload.ts` — add checkAllReleases, checkOneRelease, checkLauncherUpdate, onAppStatusChanged
- `frontend/src/types/electron.d.ts` — add new electronAPI methods
- `frontend/src/stores/appStore.ts` — subscribe to status events, trigger renderer-side release check
- `frontend/src/components/AppCard.tsx` — verify updateVersion prop wiring (may be no-op if L2 was correct)
- `frontend/src/components/AppDetail.tsx` — add release notes section, latest version for uninstalled apps
- `frontend/src/components/Sidebar.tsx` — verify/add update check indicator and offline state
- `frontend/src/App.tsx` — add UpdateBanner, restructure main content to flex column

---

## BUILDER PROMPT

> **Session L3 — GitHub Release Checker + Update Detection**
>
> You are building session L3 of the Shannon Launcher. L1 (foundation) and L2 (Library UI with cards, detail panel, sidebar, toast, Zustand store) are complete. Now add GitHub Releases integration for update detection.
>
> **Working directory:** `C:\Claude Access Point\Launcher`
>
> **What you're building:** The GitHub Releases API integration that checks each registered app for newer versions, caches results, and pushes update availability to the UI. On startup, badges update silently in the background. Also check if the Launcher itself has updates.
>
> **Existing code (from L1 + L2):**
>
> *Electron (L1):*
> - `electron/types.ts` — AppEntry, InstalledApp, LauncherConfig, LauncherSettings, DEFAULT_CONFIG
> - `electron/config.ts` — readConfig(), writeConfig(), updateSettings()
> - `electron/registry.ts` — APP_REGISTRY with Finance App (github.owner='OWNER_TBD', repo='finance-app')
> - `electron/ipc.ts` — setupIPC() with config:get, config:update-settings, config:set-first-run-complete, registry:get-all, launcher:get-version
> - `electron/preload.ts` — electronAPI with getConfig, updateSettings, setFirstRunComplete, getRegistry, getVersion, onLauncherUpdateAvailable
> - `electron/main.ts` — window creation, single-instance lock, window state persistence, setupIPC() → createWindow() → loadApp()
>
> *Frontend (L2):*
> - `frontend/src/types/index.ts` — AppEntry, InstalledApp, LauncherConfig, AppStatus, AppState, ReleaseInfo, ReleaseAsset, DownloadProgress
> - `frontend/src/stores/appStore.ts` — Zustand store with apps[], selectedAppId, config, activeView, initialize(), updateAppStatus(), updateAppRelease(), setLauncherUpdate(), setUpdateCheckInProgress()
> - `frontend/src/components/AppCard.tsx` — card with StatusBadge (handles update-available amber badge with pulse)
> - `frontend/src/components/AppDetail.tsx` — 480px detail panel with disabled action buttons
> - `frontend/src/components/Sidebar.tsx` — nav sidebar with version footer, reads updateCheckInProgress
> - `frontend/src/components/Library.tsx` — card grid + detail panel layout
> - `frontend/src/components/Toast.tsx` — toast system with showToast() imperative API
> - `frontend/src/App.tsx` — Sidebar + main (Library or Settings placeholder) + ToastContainer
>
> **Task 1: Types** — Add to `electron/types.ts`: ReleaseInfo, ReleaseAsset, ReleaseCacheEntry, LAUNCHER_GITHUB constant.
>
> **Task 2: GitHub Client** (`electron/github.ts`)
> - `parseRelease(data)`: extract tag_name (strip `v`), find .exe asset (filter out blockmap files), build ReleaseInfo
> - `fetchLatestRelease(entry)`: check cache (5min TTL) → check rate limit → `net.fetch(url, { headers, signal })` with 5s AbortController timeout → read `x-ratelimit-remaining`/`x-ratelimit-reset` headers → parse response → cache → return ReleaseInfo or null. On any error: return stale cache or null.
> - `fetchAllReleases(registry)`: sequential iteration (not parallel), returns Record<appId, ReleaseInfo|null>
> - `clearReleaseCache()`: clear the Map
> - `isNewerVersion(current, latest)`: parse major.minor.patch, compare numerically, strip `v` prefix
> - Constants: `CACHE_TTL_MS = 5 * 60 * 1000`, `REQUEST_TIMEOUT_MS = 5000`
> - All logging with `[github]` prefix
>
> **Task 3: Update Checker** (`electron/updater.ts`)
> - `checkForAppUpdates()`: iterate APP_REGISTRY, fetchLatestRelease for each, compare against installed version from config. updateAvailable only true if installed AND newer exists. Returns UpdateCheckResult[].
> - `checkForLauncherUpdate()`: create temporary AppEntry for launcher repo, fetchLatestRelease, compare against app.getVersion(). Returns {available, version?, downloadUrl?}. URL points to GitHub releases page.
>
> **Task 4: IPC Handlers** — Add to `electron/ipc.ts`:
> - `releases:check-all` → checkForAppUpdates(), return as Record<appId, ReleaseInfo|null>
> - `releases:check-one` → find entry in APP_REGISTRY, fetchLatestRelease
> - `launcher:check-update` → checkForLauncherUpdate()
>
> **Task 5: Startup Checks** — In `electron/main.ts`, after loadApp():
> - If `config.settings.checkUpdatesOnLaunch`: fire-and-forget (NOT await):
>   - `checkForAppUpdates().then(results => send app:status-changed for each)`
>   - `checkForLauncherUpdate().then(result => send launcher:update-available if available)`
> - Both wrapped in `.catch()` that logs warning
> - Import readConfig, checkForAppUpdates, checkForLauncherUpdate
>
> **Task 6: Preload** — Add to electronAPI: checkAllReleases, checkOneRelease, checkLauncherUpdate, onAppStatusChanged
>
> **Task 7: Frontend Types** — Update electron.d.ts with new methods
>
> **Task 8: Store Updates** — In appStore initialize():
> - Subscribe to onAppStatusChanged: if data.release, call updateAppRelease; if status='update-available' and app is installed, call updateAppStatus
> - Subscribe to onLauncherUpdateAvailable: call setLauncherUpdate
> - Also call checkAllReleases() from renderer (redundancy for timing), set updateCheckInProgress true/false around it, update release data and statuses
>
> **Task 9: AppDetail Updates** — Add release notes section (bg #141414, border #2A2A2A, whitespace-pre-line) when update-available. Add "Latest: v{X} • Released {date}" for not-installed apps.
>
> **Task 10: UpdateBanner** (`frontend/src/components/UpdateBanner.tsx`)
> - h-12, bg #6366F1, text white. Shows "Launcher update available (vX) — You're on vY". Download Update button (logs to console, wired in L5). Dismiss X (session only). Added to App.tsx above main content.
>
> **Task 11: Sidebar** — Verify "Checking for updates..." with animate-pulse during check. Add "Couldn't check for updates" when offline (all releases null after check completes).
>
> **App.tsx restructure** — Main content area becomes flex column: UpdateBanner (shrink-0) + content (flex-1 overflow-hidden).
>
> **Acceptance criteria:**
> 1. Startup checks GitHub Releases, console shows fetched versions
> 2. Installed app with older version → amber "Update vX.Y.Z" badge with pulse
> 3. Not-installed app → "Available" badge, detail shows "Latest: vX.Y.Z"
> 4. Offline → no errors, "Couldn't check for updates" in sidebar
> 5. Cache: 5min TTL, console shows "Using cached release"
> 6. Rate limit headers logged
> 7. Release notes in detail panel when update available
> 8. Launcher update banner (indigo, 48px) with version info and dismiss
> 9. "Checking for updates..." indicator during check
> 10. Blockmap files filtered out of asset search
> 11. checkUpdatesOnLaunch=false → no API calls
> 12. Types exported from electron/types.ts
> 13. No TypeScript errors, no unhandled rejections
>
> **Technical constraints:**
> - `net.fetch()` (not Node https) — respects system proxy
> - AbortController for 5s timeout
> - Sequential release checks (not parallel) — respect rate limits
> - Return stale cache on error — better UX than null
> - `!a.name.includes('blockmap')` when finding .exe asset
> - Fire-and-forget startup checks — UI loads instantly
> - Respect `checkUpdatesOnLaunch` setting
> - All logging prefixed with `[github]`, `[startup]`
> - `app:status-changed` event carries both status and release data
