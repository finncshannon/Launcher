# Shannon Software Launcher — Project Spec
## A standalone app hub for installing, updating, and launching your apps

**Date:** March 7, 2026
**Author:** PM4 (for Finn Shannon)
**Location:** `C:\Claude Access Point\Launcher`
**Stack:** Electron + React + TypeScript + Tailwind
**Distribution:** GitHub Releases (NSIS installer for Windows)

---

## Vision

A standalone desktop application — separate from any individual app — that serves as the single entry point for all software you create. Users download the Launcher once. From there, they can browse your app library, install apps with one click, receive and apply updates, and launch apps. Think Epic Games Launcher, but for your personal software portfolio.

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────┐
│           Shannon Launcher              │
│  ┌───────────┐  ┌────────────────────┐  │
│  │  Library   │  │   App Detail       │  │
│  │  ─────────│  │   ────────────     │  │
│  │  Finance ● │  │   Finance App     │  │
│  │  App B   ○ │  │   v2.0.0          │  │
│  │  App C   ○ │  │   [Update 2.1.0]  │  │
│  │           │  │   [Launch]         │  │
│  └───────────┘  └────────────────────┘  │
└─────────────────────────────────────────┘
         │                    │
         │  GitHub Releases   │  Local filesystem
         │  API (check ver)   │  (install/launch)
         ▼                    ▼
┌─────────────┐    ┌──────────────────┐
│  GitHub     │    │  C:\Users\...\   │
│  Releases   │    │  AppData\Local\  │
│  (per app)  │    │  ShannonApps\    │
│             │    │  ├── finance-app\ │
│             │    │  └── app-b\      │
└─────────────┘    └──────────────────┘
```

### App Registry (Hardcoded)

The Launcher knows about your apps via a hardcoded registry in the source code. When you create a new app, you add it to the registry and push a Launcher update. The registry contains:

```typescript
interface AppEntry {
  id: string;                    // "finance-app"
  name: string;                  // "Finance App"
  description: string;           // "Professional equity valuation..."
  version: string;               // Latest known version at build time
  github: {
    owner: string;               // Your GitHub username
    repo: string;                // "finance-app"
  };
  icon: string;                  // Path to icon in launcher assets
  installSize: string;           // "~150 MB"
  tags: string[];                // ["finance", "valuation", "desktop"]
}
```

### Data Flow

1. **Install flow:** User clicks Install → Launcher fetches latest release from GitHub Releases API → downloads the installer .exe → runs it silently with the user's chosen install directory → marks as installed in local config
2. **Update flow:** On Launcher startup, checks each installed app's GitHub Releases for newer version → shows update badge → user clicks Update → downloads new installer → runs it (overwrites previous install) → updates local config version
3. **Launch flow:** User clicks Launch → Launcher spawns the app's .exe from its install directory → Launcher stays open (or minimizes to tray)
4. **Developer push flow:** You run `npm run release` in your app repo → electron-builder publishes to GitHub Releases → next time any user opens the Launcher, it sees the new version

### Local Config

Stored in `%APPDATA%/ShannonLauncher/config.json`:

```json
{
  "installedApps": {
    "finance-app": {
      "version": "2.0.0",
      "installPath": "C:\\Users\\Finn\\AppData\\Local\\ShannonApps\\finance-app",
      "installedAt": "2026-03-07T20:00:00Z",
      "lastLaunched": "2026-03-07T21:30:00Z"
    }
  },
  "settings": {
    "defaultInstallDir": "C:\\Users\\Finn\\AppData\\Local\\ShannonApps",
    "checkUpdatesOnLaunch": true,
    "minimizeToTrayOnLaunch": false
  }
}
```

---

## Sessions

### Session L1 — Electron Shell + Config System [Foundation]
**Priority:** High | **Depends on:** None

**What you're building:**
- Initialize Electron + React + TypeScript project at `C:\Claude Access Point\Launcher`
- Main process: window creation, IPC handlers, app lifecycle
- Config system: read/write `config.json` in `%APPDATA%/ShannonLauncher/`
- App registry: hardcoded `APP_REGISTRY` array with Finance App as first entry
- IPC bridge: expose `getInstalledApps()`, `getAppRegistry()`, `getConfig()`, `updateConfig()` to renderer
- Basic window: dark theme shell, 1000×700 minimum size

**Files to create:**
- `electron/main.ts` — main process
- `electron/preload.ts` — context bridge
- `electron/config.ts` — config read/write
- `electron/registry.ts` — hardcoded app registry
- `frontend/src/App.tsx` — shell layout
- `package.json`, `tsconfig.json`, `electron-builder.yml`

**Acceptance criteria:**
- App launches with dark window
- Config file created on first launch
- Registry returns Finance App entry
- IPC bridge works for config read/write

---

### Session L2 — Library UI + App Cards [Frontend]
**Priority:** High | **Depends on:** L1

**What you're building:**
- Sidebar navigation: Library (main view), Settings
- Library grid view: app cards showing icon, name, description, status badge
- Status badges: "Not Installed" (gray), "Installed" (green), "Update Available" (amber), "Installing..." (blue pulse)
- App detail panel: click a card → right panel shows full description, version, install size, Install/Update/Launch buttons
- Responsive layout: cards reflow at different window widths

**Files to create:**
- `frontend/src/components/Sidebar.tsx`
- `frontend/src/components/Library.tsx`
- `frontend/src/components/AppCard.tsx`
- `frontend/src/components/AppDetail.tsx`
- `frontend/src/stores/appStore.ts` (Zustand)

**Acceptance criteria:**
- Library shows all registry apps as cards
- Cards show correct status based on local config
- Clicking a card opens detail panel
- Install/Update/Launch buttons visible based on status
- Dark theme, clean design

---

### Session L3 — GitHub Release Checker + Update Detection [Backend]
**Priority:** High | **Depends on:** L1

**What you're building:**
- GitHub Releases API integration: fetch latest release for each registered app
- Version comparison: semver check (current installed vs latest release)
- Update check on Launcher startup (non-blocking, background)
- Update badge on app cards when newer version detected
- Rate limiting: cache release info for 5 minutes to avoid API spam
- Handle offline gracefully (show last known state)

**Files to create/modify:**
- `electron/github.ts` — GitHub API client
- `electron/updater.ts` — version checker, update detection
- `electron/main.ts` — startup update check
- `frontend/src/stores/appStore.ts` — update state

**Acceptance criteria:**
- On startup, checks GitHub Releases for each installed app
- Correctly detects when a newer version exists
- Shows "Update Available (v2.1.0)" badge on app card
- Works offline (shows installed version, no update check)
- API responses cached for 5 minutes

---

### Session L4 — Install + Update Flow [Core]
**Priority:** High | **Depends on:** L3

**What you're building:**
- Download manager: download release asset (.exe installer) from GitHub with progress tracking
- Install flow: download → run NSIS installer silently (`/S /D=path`) → update config
- Update flow: same as install but overwrites existing installation
- Install directory picker: default `%LOCALAPPDATA%\ShannonApps\{app-id}`, user can change
- Progress UI: download progress bar with speed and ETA
- Error handling: download failures, corrupt files, permission errors
- Cancel support: abort in-progress downloads

**Files to create/modify:**
- `electron/downloader.ts` — download with progress
- `electron/installer.ts` — run NSIS installer silently
- `frontend/src/components/InstallProgress.tsx` — progress bar UI
- `frontend/src/components/AppDetail.tsx` — wire up Install/Update buttons
- `electron/config.ts` — update installed app record

**Acceptance criteria:**
- Click Install → directory picker → download with progress → silent install → status updates to "Installed"
- Click Update → download with progress → silent install (overwrite) → version updates
- Progress bar shows download percentage, speed, ETA
- Cancel button stops download
- Config updated with install path and version
- Error messages for failures

---

### Session L5 — Launch + App Management [Core]
**Priority:** Normal | **Depends on:** L4

**What you're building:**
- Launch: spawn app .exe from install path, optionally minimize Launcher to tray
- Uninstall: run app's uninstaller or delete install directory, clean up config
- Open install folder: shell.openPath to the install directory
- Tray icon: minimize to system tray, right-click menu (Show, Quit)
- Last launched tracking: update config timestamp on launch
- Verify installation: check if app .exe still exists before showing "Installed"

**Files to create/modify:**
- `electron/launcher.ts` — spawn app processes
- `electron/tray.ts` — system tray integration
- `frontend/src/components/AppDetail.tsx` — Launch, Uninstall, Open Folder buttons
- `electron/config.ts` — last launched timestamp

**Acceptance criteria:**
- Click Launch → app opens, Launcher stays running
- Minimize to tray option works
- Uninstall removes app and cleans config
- "Open Install Folder" opens in Explorer
- Detects broken installations (exe missing)

---

### Session L6 — Settings + Polish + Packaging [Final]
**Priority:** Normal | **Depends on:** L5

**What you're building:**
- Settings page: default install directory, check updates on launch toggle, minimize to tray toggle, about section (Launcher version)
- First-run experience: welcome screen on first launch, explain what the Launcher does
- Packaging: electron-builder config for NSIS installer, GitHub Releases publish
- Auto-update for the Launcher itself (same pattern — check GitHub for Launcher updates)
- Window state persistence (position, size)
- Keyboard shortcuts: Ctrl+Q quit, Escape close detail panel

**Files to create/modify:**
- `frontend/src/components/Settings.tsx`
- `frontend/src/components/Welcome.tsx`
- `electron/electron-builder.yml` — NSIS + GitHub publish
- `scripts/release.bat` — build + publish script
- `electron/main.ts` — self-update check, window state

**Acceptance criteria:**
- Settings page works, persists to config
- First-run welcome screen shown once
- `npm run release` builds and publishes Launcher installer
- Launcher checks for its own updates on startup
- Clean installer: user downloads, runs, gets desktop shortcut, opens Launcher

---

## Developer Workflow (Your Side)

### Adding a New App to the Launcher

1. Edit `electron/registry.ts` — add a new entry to `APP_REGISTRY`
2. Add the app's icon to `assets/icons/`
3. Push a Launcher update (so users get the new registry)

### Pushing an App Update

1. In your app repo (e.g., Finance App), bump the version in `package.json`
2. Run `npm run release` — this builds and publishes to GitHub Releases
3. Done. The Launcher will detect it automatically on next startup.

### Pushing a Launcher Update

1. Bump the version in the Launcher's `package.json`
2. Run `npm run release` from the Launcher project
3. Existing Launcher installs will detect the update on next startup

---

## Tech Decisions

- **Electron + React + TypeScript**: Same stack as Finance App, you already know it
- **Tailwind CSS**: Faster styling for this simpler UI (no CSS modules needed)
- **Zustand**: Same state management as Finance App
- **No backend/Python**: The Launcher is pure Electron — no server, no database, just config files and GitHub API calls
- **NSIS installer**: Same as Finance App, users already understand the install flow
- **GitHub Releases**: Free hosting, API for version checking, handles file downloads

---

## File Structure

```
C:\Claude Access Point\Launcher\
├── electron/
│   ├── main.ts              — Electron main process
│   ├── preload.ts           — Context bridge
│   ├── config.ts            — Local config read/write
│   ├── registry.ts          — Hardcoded app registry
│   ├── github.ts            — GitHub Releases API client
│   ├── updater.ts           — Version checker
│   ├── downloader.ts        — Download with progress
│   ├── installer.ts         — Silent NSIS install
│   ├── launcher.ts          — Spawn app processes
│   ├── tray.ts              — System tray
│   ├── electron-builder.yml — Build config
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Library.tsx
│   │   │   ├── AppCard.tsx
│   │   │   ├── AppDetail.tsx
│   │   │   ├── InstallProgress.tsx
│   │   │   ├── Settings.tsx
│   │   │   └── Welcome.tsx
│   │   └── stores/
│   │       └── appStore.ts
│   ├── index.html
│   └── tailwind.config.js
├── assets/
│   └── icons/               — App icons
├── scripts/
│   └── release.bat
├── package.json
└── README.md
```

---

## Reference: Finance App Packaging (Phase 14A)

The Finance App already has a working Electron + NSIS + GitHub Releases setup. The Launcher should follow the same patterns. Key reference files:

- `C:\Claude Access Point\StockValuation\Finance App\electron\main.ts` — Electron main process with embedded Python resolution, health checks, window management
- `C:\Claude Access Point\StockValuation\Finance App\electron\electron-builder.yml` — NSIS + extraResources + GitHub publish config
- `C:\Claude Access Point\StockValuation\Finance App\package.json` — build/release scripts
- `C:\Claude Access Point\StockValuation\Finance App\scripts\bundle-python.js` — example of a pre-build script

The Launcher is simpler than Finance App (no Python backend, no database) but uses the same Electron shell, NSIS installer, and GitHub Releases distribution pattern.
