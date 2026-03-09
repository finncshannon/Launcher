# CUSTOMIZE_LOG.md — Fulcrum Launcher Handoff Document

**Last updated:** 2026-03-08
**Session type:** `/customize` live customization mode

---

## Project Overview

**Fulcrum** is a personal desktop software launcher built with Electron. It manages the installation, updating, launching, and uninstalling of apps distributed via GitHub Releases. Think of it as a personal Steam-like hub for Finn's custom apps.

### Tech Stack

| Layer | Technology | Details |
|-------|-----------|---------|
| Desktop shell | Electron 33 | Main process in TypeScript, `frame: false` custom chrome |
| Frontend | React 18 + TypeScript | Vite dev server on port 5173, HMR for live reload |
| Styling | Tailwind CSS 3.4 | Dark theme, Bloomberg/terminal aesthetic |
| State | Zustand 4.4 | Single store at `frontend/src/stores/appStore.ts` |
| Packaging | electron-builder 26 | NSIS installer, publishes to GitHub Releases |
| Distribution | GitHub Releases API | Each managed app has its own GitHub repo with `.exe` assets |

### Current State

- **Working:** Yes — launches cleanly, installs/uninstalls apps, checks for updates, right-click context menus, downloads view, custom title bar
- **Version:** 1.0.0 (pre-release, not yet widely distributed)
- **Known crash:** "Object has been destroyed" error on clean install on new devices — **fixed this session** (see Change History)

---

## Change History

All changes below were made in a single `/customize` session on 2026-03-08, listed chronologically.

### 1. App Card Redesign — Game Tile Layout
**Files:** `frontend/src/components/AppCard.tsx`, `frontend/src/components/Library.tsx`
**What:** Redesigned app cards from horizontal list items to square game-tile widgets. Large square icon takes the full top area, app name and status badge sit below.
**Why:** User wanted a game-launcher aesthetic with the icon dominating the card.
- `AppCard.tsx`: Changed from horizontal flex to vertical flex, added `aspect-square` icon container
- `Library.tsx`: Updated grid to `150px` min column width, updated skeleton cards to match

### 2. Square Corners on Cards
**Files:** `frontend/src/components/AppCard.tsx`
**What:** Changed `rounded-xl` to `rounded-none` on the card button.
**Why:** User preferred sharp corners over rounded.

### 3. Rename: Shannon Launcher -> Fulcrum
**Files:** Multiple (full rebrand)
| File | Change |
|------|--------|
| `electron/main.ts` | `app.name = 'Fulcrum'`, startup log |
| `electron/tray.ts` | Tooltip `'Fulcrum'` |
| `electron/config.ts` | Default install dir `'FulcrumApps'` (was `'ShannonApps'`) |
| `electron/downloader.ts` | Temp dir `'fulcrum'`, user-agent `'Fulcrum'` |
| `electron/github.ts` | User-agent `'Fulcrum'` |
| `electron/electron-builder.yml` | `appId: com.fulcrum.desktop`, `productName: Fulcrum`, `shortcutName: Fulcrum` |
| `electron/package.json` | `name: 'fulcrum-electron'` |
| `frontend/package.json` | `name: 'fulcrum-frontend'` |
| `frontend/index.html` | `<title>Fulcrum</title>` |
| `frontend/src/components/Sidebar.tsx` | Logo text `"Fulcrum"` |
| `package.json` (root) | `name: 'fulcrum'` |

**Note:** `electron/package.json` description still says "Shannon Launcher" — minor, should be updated.

### 4. Right-Click Context Menu on App Cards
**Files:** `frontend/src/components/AppCard.tsx`
**What:** Added `ContextMenu` component rendered as a fixed-position overlay on right-click. Menu items: Launch (if installed), Details, Check for Update, Uninstall (if installed, with confirm dialog).
**Why:** User wanted quick actions without opening the detail panel.
- Uses `useRef` + `useEffect` for click-outside and Escape key dismissal
- Uninstall shows `window.confirm()` before proceeding

### 5. Install Progress: Zebra Bar + Full Download View
**Files:** `frontend/src/components/AppDetail.tsx`, `frontend/src/components/InstallProgress.tsx`, `frontend/src/components/Downloads.tsx`, `frontend/src/index.css`, `frontend/src/stores/appStore.ts`, `frontend/src/App.tsx`, `frontend/src/components/Sidebar.tsx`
**What:**
- Added zebra-striped progress bar (CSS animation) at top of `AppDetail` during install
- Created `FullInstallView` component with SVG progress ring (140px), 3-column stats grid (Downloaded, Speed, ETA), cancel button
- Created `Downloads.tsx` view with active download cards, recent history, empty state
- Added Downloads nav item in Sidebar with active download badge count
- Added `'downloads'` to `activeView` type in store

**Why:** User wanted visible install progress — both inline in the detail view and in a dedicated Downloads tab.

**Key fix:** `onAppStatusChanged` in appStore only handled `'update-available'`, ignoring `'installing'`/`'updating'`/`'installed'`/`'not-installed'`. Added handling for all status types.

**Key fix:** `FullInstallView` crashed when `downloadProgress` was null (status changed before first progress event). Made `progress` prop nullable with safe defaults.

### 6. Uninstall: File Lock Handling
**Files:** `electron/installer.ts`
**What:** Added robust uninstall with retry logic for Windows file locks:
1. `killProcessesInDirectory()` — uses WMIC to find and kill processes running from the install dir
2. `forceRemoveDir()` — recursive delete with rename-then-delete for locked files
3. `rd /s /q` fallback via cmd.exe
4. 3-attempt retry loop catching `EBUSY`, `EPERM`, `ENOTEMPTY`

**Why:** Windows Defender/SmartScreen scans `.asar` files after install, causing EBUSY locks when trying to uninstall immediately.

### 7. Custom Title Bar (frameless window)
**Files:** `electron/main.ts`, `electron/preload.ts`, `electron/ipc.ts`, `frontend/src/components/TitleBar.tsx`, `frontend/src/types/electron.d.ts`, `frontend/src/App.tsx`
**What:**
- Set `frame: false`, `titleBarStyle: 'hidden'` on BrowserWindow
- Added IPC handlers: `window:minimize`, `window:maximize`, `window:close`
- Exposed via preload: `windowMinimize()`, `windowMaximize()`, `windowClose()`
- Created `TitleBar.tsx` with `-webkit-app-region: drag` and custom window control buttons
- Bloomberg/Apple Stocks inspired styling: thick SVG strokes, white on hover, red hover for close

**Why:** User wanted to remove the native File/Edit/View menu bar and have a clean custom title bar.

### 8. App Branding: Finance App -> Spectre
**Files:** `electron/registry.ts`, `frontend/src/assets/finance-app.png`
**What:** Changed display name from "Finance App" to "Spectre" in registry. Added 512x512 app icon as `finance-app.png` (matches the app ID used in glob lookup).
**Why:** User rebranded the finance app. Note: `executableName` stays `'Finance App.exe'` as that's what the NSIS installer produces.

### 9. Fulcrum Logo + Taskbar Icon
**Files:** `resources/icon.ico`, `frontend/src/assets/logo.png`, `electron/main.ts`, `electron/tray.ts`, `frontend/src/components/Sidebar.tsx`
**What:**
- User provided `icon.ico` in `resources/`
- Converted to `logo.png` (256x256) for sidebar display
- `main.ts` and `tray.ts` both reference `resources/icon.ico` for window/tray icon
- Sidebar shows logo image + "Fulcrum" text

**Why:** User wanted custom branding throughout.

### 10. FallbackIcon: Dynamic Icon Loading
**Files:** `frontend/src/components/FallbackIcon.tsx`
**What:** Uses `import.meta.glob('../assets/*.png', { eager: true, as: 'url' })` to load app icons at build time. Looks up by app ID (e.g., `finance-app.png`). Falls back to colored letter avatar if no icon found or image fails to load. Uses `object-fill` for full coverage.
**Why:** Needed a way to show custom app icons without hardcoding paths.

### 11. Fix: "Object has been destroyed" crash
**Files:** `electron/main.ts`
**What:**
- Added `mainWindow.isDestroyed()` guard in `saveWindowState()` (line 92)
- Added `mainWindow.on('closed', () => { mainWindow = null; })` event handler

**Why:** On new device installs, the `window-all-closed` event called `saveWindowState()` after the BrowserWindow was already destroyed. The `mainWindow` variable still held a stale reference, so `mainWindow.isMaximized()` threw "object has been destroyed".

---

## Current Known Issues

### Confirmed Bugs
1. **Taskbar icon shows Electron default in dev mode** — Windows uses the icon embedded in `electron.exe`, not the `icon` BrowserWindow property, for taskbar grouping. Will self-resolve when packaged with electron-builder (icon gets embedded into `Fulcrum.exe`).

2. **`electron/package.json` description still says "Shannon Launcher"** — minor branding miss, should be updated to "Electron main process for Fulcrum".

### Potential Issues
3. **Config reads are very frequent** — logs show `[config] Config loaded successfully` dozens of times per session. `readConfig()` reads from disk every time. Consider caching with a dirty flag if this becomes a performance issue.

4. **Orphan Electron processes in dev mode** — Repeated dev restarts can leave orphan `electron.exe` processes. Always run `taskkill //F //IM electron.exe` before relaunching in dev.

5. **Uninstall may fail on fresh installs** — Windows Defender scans `.asar` files immediately after NSIS install completes, causing EBUSY. The retry logic handles this, but the user may see a brief delay. The user-facing error message suggests waiting and trying again.

---

## Architecture Notes

### Project Structure
```
Launcher/
  package.json              # Root workspace (npm workspaces: electron, frontend)
  resources/
    icon.ico                # App icon for packaging + tray
  electron/                 # Main process (restart required for changes)
    main.ts                 # App lifecycle, window creation, BrowserWindow config
    ipc.ts                  # All IPC handlers (setupIPC takes getMainWindow callback)
    preload.ts              # contextBridge API exposed as window.electronAPI
    registry.ts             # APP_REGISTRY — static list of managed apps
    config.ts               # Config read/write to userData/config.json
    github.ts               # GitHub Releases API client (with caching)
    downloader.ts           # HTTP download with progress callbacks
    installer.ts            # NSIS /S /D= install, multi-strategy uninstall
    launcher.ts             # child_process.spawn to launch installed apps
    updater.ts              # Update check orchestration
    tray.ts                 # System tray icon + menu
    types.ts                # Shared TypeScript types
    electron-builder.yml    # Packaging config
  frontend/                 # Renderer process (Vite HMR, live reload)
    src/
      App.tsx               # Root layout: TitleBar + Sidebar + main content
      stores/appStore.ts    # Zustand store — single source of truth for UI state
      components/
        TitleBar.tsx         # Custom window chrome (drag region + min/max/close)
        Sidebar.tsx          # Nav: Library, Downloads, Settings + logo + version
        Library.tsx          # Grid of AppCards
        AppCard.tsx          # Game-tile card + right-click ContextMenu
        AppDetail.tsx        # Slide-out detail panel (install/launch/uninstall)
        InstallProgress.tsx  # FullInstallView with SVG ring + stats
        Downloads.tsx        # Active + recent downloads view
        FallbackIcon.tsx     # Dynamic icon loader (glob) with letter fallback
        Settings.tsx         # Settings panel
        Toast.tsx            # Toast notification system
        UpdateBanner.tsx     # Launcher self-update banner
        Welcome.tsx          # First-run onboarding
      assets/
        logo.png             # Fulcrum logo (256x256, converted from icon.ico)
        finance-app.png      # Spectre app icon (512x512)
      types/
        electron.d.ts        # TypeScript declarations for window.electronAPI
```

### Critical Relationships (change X, also change Y)

| If you change... | Also update... |
|-----------------|----------------|
| IPC channel name in `ipc.ts` | `preload.ts` (expose) + `electron.d.ts` (types) + any component calling it |
| `AppEntry` fields in `types.ts` | `registry.ts` entries + any frontend components reading entry fields |
| `APP_REGISTRY` app IDs | Asset filenames in `frontend/src/assets/` (must match app ID for icon lookup) |
| Window control IPC | `preload.ts` + `electron.d.ts` + `TitleBar.tsx` |
| `activeView` options | `appStore.ts` type + `App.tsx` routing + `Sidebar.tsx` nav items |
| App status types | `types.ts` AppStatus + `appStore.ts` onAppStatusChanged + `AppCard.tsx` StatusBadge |

### Dev Workflow
```bash
# Terminal 1: Frontend (hot reload)
cd frontend && npm run dev          # Vite on :5173

# Terminal 2: Electron (manual restart)
cd electron && npx tsc && npx electron dist/main.js

# Restart Electron after backend changes:
taskkill /F /IM electron.exe
cd electron && npx tsc && npx electron dist/main.js

# Package for distribution:
npm run package                     # Outputs to electron/release/
```

### IPC Pattern
All IPC follows: `ipcMain.handle(channel, handler)` in `ipc.ts` -> `ipcRenderer.invoke(channel, ...args)` in `preload.ts` -> `window.electronAPI.methodName()` in components. Push events from main use `webContents.send()` with `safeSend()` wrapper that checks `!win.isDestroyed()`.

---

## UI/Brand Status

### Brand: Fulcrum
- **App name:** Fulcrum (fully applied across all files except `electron/package.json` description)
- **App ID:** `com.fulcrum.desktop` (in electron-builder.yml)
- **Install directory:** `%LOCALAPPDATA%\FulcrumApps\`
- **Temp downloads:** `fulcrum/` in system temp

### Color Scheme
- **Background:** `#0D0D0D` (near-black)
- **Surface:** `#141414` (sidebar, cards)
- **Border:** `#1A1A1A` to `#2A2A2A`
- **Text primary:** `#F5F5F5`
- **Text secondary:** `#A0A0A0`
- **Accent blue:** `#3B82F6` (active states, focus rings, install progress)
- **Success green:** `#22C55E`
- **Warning amber:** `#F59E0B`
- **Error red:** `#EF4444`
- **Install purple:** `#6366F1`

### Typography
- System font stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
- No custom fonts loaded

### Logo
- `resources/icon.ico` — used for window icon, tray, and packaging
- `frontend/src/assets/logo.png` — 256x256 PNG conversion, displayed in sidebar
- Taskbar icon only correct when app is packaged (Electron dev mode limitation)

### Managed Apps
Currently one app in `registry.ts`:
| ID | Display Name | GitHub Repo | Executable |
|----|-------------|-------------|------------|
| `finance-app` | Spectre | `finncshannon/finance-app` | `Finance App.exe` |

To add a new app: add an entry to `APP_REGISTRY` in `registry.ts`, optionally add an icon as `frontend/src/assets/{app-id}.png`.
