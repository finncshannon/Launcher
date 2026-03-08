# Shannon Launcher — Detailed Technical Specification

**Expands:** `LAUNCHER_SPEC.md`
**Author:** Planner Agent
**Date:** March 7, 2026
**Status:** Implementation-ready

---

## 1. TypeScript Interfaces & Types

### 1.1 App Registry Types

```typescript
/** Static app definition — hardcoded in registry.ts */
interface AppEntry {
  id: string;                    // "finance-app" — kebab-case, unique
  name: string;                  // "Finance App" — display name
  description: string;           // One-liner for card view
  longDescription: string;       // Full description for detail panel (supports markdown)
  github: {
    owner: string;               // GitHub username or org
    repo: string;                // Repository name
  };
  icon: string;                  // Filename in assets/icons/ (e.g., "finance-app.png")
  installSize: string;           // Human-readable estimate "~150 MB"
  tags: string[];                // ["finance", "valuation", "desktop"]
  executableName: string;        // "Finance App.exe" — the exe name after NSIS install
  minimumLauncherVersion?: string; // Semver — if set, Launcher must be >= this to install
}
```

### 1.2 Installed App Types

```typescript
/** Per-app install record stored in config.json */
interface InstalledApp {
  version: string;               // Semver of currently installed version
  installPath: string;           // Absolute path to install directory
  installedAt: string;           // ISO 8601 timestamp
  lastLaunched: string | null;   // ISO 8601 or null if never launched
  executablePath: string;        // Full path to the .exe (installPath + executableName)
}

/** Runtime state combining registry + install + update info */
interface AppState {
  entry: AppEntry;               // From registry
  installed: InstalledApp | null; // From config, null if not installed
  latestRelease: ReleaseInfo | null; // From GitHub API, null if unchecked/offline
  status: AppStatus;
  downloadProgress: DownloadProgress | null; // Non-null only during download
}

type AppStatus =
  | 'not-installed'
  | 'installing'
  | 'installed'
  | 'update-available'
  | 'updating'
  | 'launching'
  | 'broken';                    // exe missing from installPath
```

### 1.3 GitHub Release Types

```typescript
/** Parsed from GitHub Releases API response */
interface ReleaseInfo {
  tagName: string;               // "v2.1.0"
  version: string;               // "2.1.0" (tag stripped of 'v' prefix)
  name: string;                  // Release title
  body: string;                  // Release notes (markdown)
  publishedAt: string;           // ISO 8601
  installerAsset: ReleaseAsset | null; // The .exe asset, null if not found
}

interface ReleaseAsset {
  name: string;                  // "Finance-App-Setup-2.1.0.exe"
  downloadUrl: string;           // Direct download URL
  size: number;                  // Bytes
}

/** Cache entry for rate limiting */
interface ReleaseCacheEntry {
  release: ReleaseInfo;
  fetchedAt: number;             // Date.now() timestamp
}
```

### 1.4 Download & Install Types

```typescript
interface DownloadProgress {
  appId: string;
  status: 'downloading' | 'installing' | 'complete' | 'failed' | 'cancelled';
  bytesDownloaded: number;
  totalBytes: number;            // From Content-Length, 0 if unknown
  speedBps: number;              // Bytes per second (rolling 3-second average)
  etaSeconds: number;            // Estimated time remaining
  error?: string;                // Set when status is 'failed'
}

interface InstallResult {
  success: boolean;
  appId: string;
  version: string;
  installPath: string;
  executablePath: string;
  error?: string;
}

interface InstallOptions {
  appId: string;
  installDir: string;            // Directory to install INTO (not the app subfolder)
}
```

### 1.5 Config Types

```typescript
interface LauncherConfig {
  configVersion: 1;              // For future migrations
  installedApps: Record<string, InstalledApp>; // Keyed by AppEntry.id
  settings: LauncherSettings;
  firstRunComplete: boolean;
}

interface LauncherSettings {
  defaultInstallDir: string;     // Default: %LOCALAPPDATA%\ShannonApps
  checkUpdatesOnLaunch: boolean; // Default: true
  minimizeToTrayOnAppLaunch: boolean; // Default: false
  minimizeToTrayOnClose: boolean; // Default: false
}

/** Default config for first launch */
const DEFAULT_CONFIG: LauncherConfig = {
  configVersion: 1,
  installedApps: {},
  settings: {
    defaultInstallDir: '', // Resolved at runtime to %LOCALAPPDATA%\ShannonApps
    checkUpdatesOnLaunch: true,
    minimizeToTrayOnAppLaunch: false,
    minimizeToTrayOnClose: false,
  },
  firstRunComplete: false,
};
```

### 1.6 IPC Types

```typescript
/** Type-safe IPC channel map */
interface IpcChannels {
  // Renderer → Main (invoke/handle)
  'config:get': { request: void; response: LauncherConfig };
  'config:update-settings': { request: Partial<LauncherSettings>; response: LauncherConfig };
  'config:set-first-run-complete': { request: void; response: void };
  'registry:get-all': { request: void; response: AppEntry[] };
  'releases:check-all': { request: void; response: Record<string, ReleaseInfo | null> };
  'releases:check-one': { request: string; response: ReleaseInfo | null }; // appId
  'app:install': { request: InstallOptions; response: InstallResult };
  'app:cancel-install': { request: string; response: void }; // appId
  'app:uninstall': { request: string; response: { success: boolean; error?: string } };
  'app:launch': { request: string; response: { success: boolean; error?: string } };
  'app:open-folder': { request: string; response: void }; // appId
  'app:verify-installation': { request: string; response: boolean }; // appId → exe exists?
  'dialog:select-directory': { request: string; response: string | null }; // defaultPath → selected
  'launcher:get-version': { request: void; response: string };
  'launcher:check-update': { request: void; response: { available: boolean; version?: string; downloadUrl?: string } };

  // Main → Renderer (send/on)
  'download:progress': DownloadProgress;
  'app:status-changed': { appId: string; status: AppStatus };
  'launcher:update-available': { currentVersion: string; latestVersion: string; downloadUrl: string };
}
```

---

## 2. IPC Channel Specifications

### 2.1 Renderer → Main (Request/Response via `invoke`/`handle`)

| Channel | Direction | Request | Response | Notes |
|---------|-----------|---------|----------|-------|
| `config:get` | R→M | `void` | `LauncherConfig` | Read full config |
| `config:update-settings` | R→M | `Partial<LauncherSettings>` | `LauncherConfig` | Merge into settings, return updated |
| `config:set-first-run-complete` | R→M | `void` | `void` | Sets `firstRunComplete: true` |
| `registry:get-all` | R→M | `void` | `AppEntry[]` | Returns hardcoded registry |
| `releases:check-all` | R→M | `void` | `Record<string, ReleaseInfo\|null>` | Checks all registry apps |
| `releases:check-one` | R→M | `string` (appId) | `ReleaseInfo\|null` | Single app check |
| `app:install` | R→M | `InstallOptions` | `InstallResult` | Download + silent install |
| `app:cancel-install` | R→M | `string` (appId) | `void` | Abort in-progress download |
| `app:uninstall` | R→M | `string` (appId) | `{success, error?}` | Delete install dir + clean config |
| `app:launch` | R→M | `string` (appId) | `{success, error?}` | Spawn exe, update lastLaunched |
| `app:open-folder` | R→M | `string` (appId) | `void` | `shell.openPath()` |
| `app:verify-installation` | R→M | `string` (appId) | `boolean` | Check exe exists on disk |
| `dialog:select-directory` | R→M | `string` (defaultPath) | `string\|null` | Native directory picker |
| `launcher:get-version` | R→M | `void` | `string` | `app.getVersion()` |
| `launcher:check-update` | R→M | `void` | `{available, version?, downloadUrl?}` | Check GitHub for launcher update |

### 2.2 Main → Renderer (Push via `send`/`on`)

| Channel | Direction | Payload | Notes |
|---------|-----------|---------|-------|
| `download:progress` | M→R | `DownloadProgress` | Emitted every 250ms during download |
| `app:status-changed` | M→R | `{appId, status}` | When install/update completes or fails |
| `launcher:update-available` | M→R | `{currentVersion, latestVersion, downloadUrl}` | On startup if newer Launcher exists |

---

## 3. GitHub Releases API Integration

### 3.1 Endpoint
```
GET https://api.github.com/repos/{owner}/{repo}/releases/latest
Headers:
  User-Agent: ShannonLauncher/{version}
  Accept: application/vnd.github.v3+json
```

No authentication required for public repos. Rate limit: 60 requests/hour per IP (unauthenticated).

### 3.2 Response Parsing

```typescript
function parseRelease(data: GitHubReleaseResponse): ReleaseInfo {
  const version = data.tag_name.replace(/^v/, '');
  const installerAsset = data.assets.find((a: any) =>
    a.name.endsWith('.exe') && a.content_type === 'application/x-executable'
  ) ?? data.assets.find((a: any) =>
    a.name.endsWith('.exe')
  ) ?? null;

  return {
    tagName: data.tag_name,
    version,
    name: data.name || `v${version}`,
    body: data.body || '',
    publishedAt: data.published_at,
    installerAsset: installerAsset ? {
      name: installerAsset.name,
      downloadUrl: installerAsset.browser_download_url,
      size: installerAsset.size,
    } : null,
  };
}
```

### 3.3 Version Comparison

```typescript
function isNewerVersion(current: string, latest: string): boolean {
  const parse = (v: string) => v.split('.').map(Number);
  const [cMaj, cMin, cPat] = parse(current);
  const [lMaj, lMin, lPat] = parse(latest);
  if (lMaj !== cMaj) return lMaj > cMaj;
  if (lMin !== cMin) return lMin > cMin;
  return lPat > cPat;
}
```

### 3.4 Caching Strategy

In-memory cache per app, 5-minute TTL:
```typescript
const releaseCache = new Map<string, ReleaseCacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;
```

### 3.5 Error Handling

- **Network error / timeout:** Return `null`, log warning. UI shows last known state.
- **404:** Repo doesn't exist or no releases. Return `null`.
- **403 (rate limited):** Check `X-RateLimit-Reset` header, cache backoff. Return `null`.
- **No .exe asset:** Return `ReleaseInfo` with `installerAsset: null`.

---

## 4. NSIS Silent Install

### 4.1 Command
```
"{tempDir}/{installer.exe}" /S /D={installPath}
```
- `/S` — Silent mode
- `/D=path` — Must be last flag, no quotes, absolute path

### 4.2 Execution
```typescript
function runInstaller(installerPath: string, installDir: string): Promise<{ exitCode: number }> {
  return new Promise((resolve, reject) => {
    const proc = execFile(installerPath, ['/S', `/D=${installDir}`], {
      windowsHide: true,
      timeout: 120_000,
    }, (error) => {
      if (error && error.killed) reject(new Error('Installation timed out'));
      else resolve({ exitCode: error?.code ?? (proc.exitCode ?? 0) });
    });
  });
}
```

### 4.3 Completion Detection
- NSIS `/S` is synchronous — process exits on completion
- Exit code 0 = success
- Verify `{installDir}/{executableName}` exists after install

### 4.4 UAC Elevation
- Launcher does NOT run as admin
- NSIS triggers UAC automatically if needed
- UAC decline = non-zero exit code = permission error

---

## 5. Download Manager

### 5.1 Architecture
Uses `net.fetch()` for downloads (respects system proxy).

### 5.2 Temp File Strategy
- Download to: `{temp}/shannon-launcher/{appId}-{version}.exe.tmp`
- Success: rename `.tmp` to final name
- Cancel/failure: delete `.tmp`
- Startup: clean stale `.tmp` files

### 5.3 Progress Reporting
- Emit every 250ms (throttled)
- Rolling 3-second average speed
- ETA: `(total - downloaded) / speed`

### 5.4 Cancellation
- AbortController per download
- Abort → cleanup → emit cancelled status

---

## 6. Config System

### 6.1 File Location
`%APPDATA%/ShannonLauncher/config.json`

### 6.2 Read/Write
- Atomic write: `.tmp` → rename
- Corruption: backup → reset to defaults
- First launch: create with defaults, resolve `defaultInstallDir`

### 6.3 Migration
- `configVersion` field for future schema changes
- Validate and fill missing fields on read

---

## 7. Edge Cases

1. **GitHub unreachable** → Show last known state, subtle offline text
2. **Installer fails** → Error toast, offer manual install
3. **User deletes app folder** → Detect on startup, show "Needs Repair"
4. **Conflicting paths** → Prevented by unique app IDs
5. **Download interrupted** → Cleanup temp, reset status, allow retry
6. **Launcher self-update** → Banner with download link, manual reinstall
7. **Two instances** → `requestSingleInstanceLock()`

---

## 8. UI/UX Specifications

### 8.1 Window
- Default: 1000×700, Min: 800×550
- Standard Windows frame, bg `#0D0D0D`

### 8.2 Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| bg-primary | #0D0D0D | Window background |
| bg-secondary | #141414 | Sidebar, cards |
| bg-tertiary | #1A1A1A | Hover, inputs |
| bg-elevated | #1E1E1E | Panels, modals |
| border-default | #2A2A2A | Borders |
| border-hover | #3A3A3A | Hover borders |
| text-primary | #F5F5F5 | Main text |
| text-secondary | #A0A0A0 | Descriptions |
| text-muted | #666666 | Disabled |
| accent-primary | #3B82F6 | Primary actions |
| accent-hover | #2563EB | Button hover |
| accent-success | #22C55E | Installed |
| accent-warning | #F59E0B | Updates |
| accent-danger | #EF4444 | Errors |
| accent-info | #6366F1 | Progress |

### 8.3 Layout
- Sidebar: 200px fixed
- Card grid: CSS Grid, minmax(220px, 1fr), gap 16px, pad 24px
- Detail panel: 480px right panel, slides in
- Cards: ~220×200px, 64×64 icon

### 8.4 Status Badges
- Not Installed → "Available" (gray)
- Installed → "Installed ✓" (green)
- Update Available → "Update v{x.y.z}" (amber, pulse)
- Installing → "Installing..." (blue, progress bar)
- Broken → "Needs Repair" (red)

### 8.5 Animations
- Card hover: 150ms ease-out, scale 1.02
- Panel open: 200ms ease-out slide
- Panel close: 150ms ease-in slide
- Overlay: 300ms fade
- Progress bar: 250ms linear

---

## 9. Self-Update Flow
- Check own repo on startup
- Show persistent banner if update available
- "Download Update" opens GitHub release URL in browser
- User downloads and runs new installer manually

---

## 10. Zustand Store Design
Single `appStore.ts` with all state and actions. See MASTER_INDEX.md for full interface.

---

## 11. Electron-Builder Config
See `electron/electron-builder.yml` — NSIS + GitHub Releases, x64 Windows only.

---

## 12. File Structure
See MASTER_INDEX.md for complete tree.
