# Shannon Launcher

Personal software hub for installing, updating, and launching apps. Built with Electron + React + TypeScript + Tailwind + Zustand.

## Quick Start

```bash
npm install
```

**Development (two terminals):**

```bash
npm run dev:frontend   # Vite dev server on :5173
npm run dev:electron   # Compiles + launches Electron
```

## Building

```bash
npm run build          # Build frontend + electron
npm run package        # Build + create NSIS installer
npm run release        # Build + publish to GitHub Releases
```

Or use the release script:

```bash
scripts\release.bat
```

Installer output: `electron/release/`

## Adding a New App

1. Edit `electron/registry.ts` — add an `AppEntry` with GitHub owner/repo, executable name, tags
2. Add an icon to `frontend/public/icons/{app-id}.png` (or rely on `FallbackIcon`)
3. Bump version in all 3 `package.json` files
4. Publish a GitHub Release with an NSIS `.exe` installer attached

## Pushing an App Update

Just publish a new GitHub Release on the app's repo. The Launcher detects updates automatically via the GitHub Releases API.

## Architecture

```
Electron Main Process          React Frontend
┌─────────────────────┐       ┌──────────────────────┐
│ main.ts (lifecycle)  │       │ App.tsx               │
│ ipc.ts (handlers)    │◄─────►│ Sidebar / Library     │
│ config.ts (persist)  │  IPC  │ AppCard / AppDetail   │
│ launcher.ts (spawn)  │       │ Settings / Welcome    │
│ tray.ts (system tray)│       │ UpdateBanner / Toast   │
│ downloader.ts        │       │ appStore.ts (Zustand)  │
│ installer.ts         │       └──────────────────────┘
│ github.ts / updater  │
└─────────────────────┘
```

No backend server. GitHub Releases API is the only external dependency.

## Project Structure

```
Launcher/
├── electron/                 # Main process
│   ├── main.ts               # App lifecycle, window, tray, shortcuts
│   ├── preload.ts            # Context bridge (electronAPI)
│   ├── ipc.ts                # IPC handlers
│   ├── config.ts             # Config read/write (atomic)
│   ├── registry.ts           # App registry
│   ├── types.ts              # Shared types
│   ├── github.ts             # GitHub Releases API
│   ├── updater.ts            # Update checker
│   ├── downloader.ts         # Download manager with progress
│   ├── installer.ts          # NSIS silent install/uninstall
│   ├── launcher.ts           # App spawning (detached)
│   ├── tray.ts               # System tray
│   └── electron-builder.yml  # Packaging config
├── frontend/                 # Renderer process
│   └── src/
│       ├── App.tsx
│       ├── stores/appStore.ts
│       ├── components/       # UI components
│       ├── types/            # TypeScript types + electron.d.ts
│       └── lib/utils.ts
├── resources/
│   └── icon.ico              # App + tray icon
├── scripts/
│   └── release.bat           # Build + package script
└── package.json              # Workspace root
```

## Placeholders

- `resources/icon.ico` — replace with your final app icon
- GitHub owner is set to `finncshannon` across registry, types, electron-builder, and Settings
