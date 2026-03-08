# Session L6 — Settings + Polish + Packaging [Final]

**Priority:** Normal
**Type:** Mixed (Frontend Components + Electron Config + Build Tooling + QA)
**Depends On:** L5 (Launch + App Management — all core functionality complete)
**Spec Reference:** `specs/DETAILED_SPEC.md` → Sections 8.2 (Color Palette), 8.5 (Animations), 11 (Electron-Builder Config), 12 (File Structure). `specs/LAUNCHER_SPEC.md` → Session L6 scope, Developer Workflow.

---

## SCOPE SUMMARY

This is the final session. Build the Settings page with persistent preferences, the first-run Welcome overlay, finalize the packaging pipeline (electron-builder NSIS installer + GitHub Releases publish), harden window state for multi-monitor edge cases, and apply a full UI polish pass: custom scrollbar, focus states, transition audit, error message audit, and empty states. After L6, the Launcher is shippable — a user can download the installer, run it, see the welcome screen, browse the library, install an app, launch it, change settings, and receive updates.

---

## TASKS

### Task 1: Toggle Switch Component
**Description:** Create a reusable toggle switch component used throughout the Settings page. Building this first so Settings can reference it.

**Subtasks:**
- [ ] 1.1 — Create `frontend/src/components/Toggle.tsx`:
  ```tsx
  interface ToggleProps {
    checked: boolean;
    onChange: (value: boolean) => void;
    label: string;
    description?: string;
  }

  export default function Toggle({ checked, onChange, label, description }: ToggleProps) {
    return (
      <div className="flex items-center justify-between py-3">
        <div className="pr-4">
          <p className="text-[#F5F5F5] text-sm font-medium">{label}</p>
          {description && (
            <p className="text-[#A0A0A0] text-xs mt-0.5 leading-relaxed">{description}</p>
          )}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={() => onChange(!checked)}
          className={`
            relative w-10 h-6 rounded-full transition-colors duration-150 shrink-0
            ${checked ? 'bg-[#3B82F6]' : 'bg-[#1A1A1A]'}
          `}
        >
          <span
            className={`
              absolute top-1 w-4 h-4 rounded-full bg-white transition-transform duration-150
              ${checked ? 'translate-x-5' : 'translate-x-1'}
            `}
          />
        </button>
      </div>
    );
  }
  ```
  Key details: `role="switch"` and `aria-checked` for accessibility. The knob is a 16×16 circle that slides from `translate-x-1` (off, left) to `translate-x-5` (on, right) within the 40×24 track. Transition: 150ms for both color and position. `shrink-0` prevents the toggle from being compressed by flex layout when the description text is long.

---

### Task 2: Settings Page
**Description:** Build the full Settings UI with two sections: General (preferences) and About (version + update).

**Subtasks:**
- [ ] 2.1 — Create `frontend/src/components/Settings.tsx`:
  ```tsx
  import { useState } from 'react';
  import { useAppStore } from '../stores/appStore';
  import Toggle from './Toggle';
  import { showToast } from './Toast';

  export default function Settings() {
    const {
      config, launcherVersion, launcherUpdateAvailable,
    } = useAppStore();

    if (!config) return null;

    const { settings } = config;

    async function updateSetting<K extends keyof typeof settings>(
      key: K,
      value: typeof settings[K],
    ) {
      await window.electronAPI.updateSettings({ [key]: value });
      useAppStore.getState().refreshConfig();
    }

    async function handleBrowseInstallDir() {
      const selected = await window.electronAPI.selectDirectory(settings.defaultInstallDir);
      if (selected) {
        await updateSetting('defaultInstallDir', selected);
        showToast('success', 'Default install directory updated');
      }
    }

    async function handleCheckUpdate() {
      const result = await window.electronAPI.checkLauncherUpdate();
      if (result.available) {
        useAppStore.getState().setLauncherUpdate({
          version: result.version!,
          downloadUrl: result.downloadUrl!,
        });
        showToast('info', `Update available: v${result.version}`);
      } else {
        showToast('info', 'You\'re on the latest version');
      }
    }

    return (
      <div className="h-full overflow-y-auto p-8">
        <div className="max-w-[600px] mx-auto">
          <h1 className="text-[#F5F5F5] text-2xl font-bold mb-8">Settings</h1>

          {/* --- General Section --- */}
          <section className="mb-10">
            <h2 className="text-[#A0A0A0] text-xs font-semibold uppercase tracking-wider mb-4">
              General
            </h2>

            {/* Default Install Directory */}
            <div className="py-3">
              <p className="text-[#F5F5F5] text-sm font-medium mb-1">Default install directory</p>
              <p className="text-[#A0A0A0] text-xs mb-2">
                New apps will be installed in a subfolder of this directory.
              </p>
              <div className="flex gap-2">
                <div className="flex-1 px-3 py-2 rounded-lg bg-[#1A1A1A] border border-[#2A2A2A] text-[#A0A0A0] text-xs truncate">
                  {settings.defaultInstallDir}
                </div>
                <button
                  onClick={handleBrowseInstallDir}
                  className="px-4 py-2 rounded-lg bg-[#1A1A1A] border border-[#2A2A2A] text-[#F5F5F5] text-xs hover:bg-[#2A2A2A] transition-colors duration-150"
                >
                  Browse
                </button>
              </div>
            </div>

            <div className="border-t border-[#2A2A2A] my-2" />

            <Toggle
              label="Check for updates on launch"
              description="Automatically check for app updates when the Launcher starts."
              checked={settings.checkUpdatesOnLaunch}
              onChange={(v) => updateSetting('checkUpdatesOnLaunch', v)}
            />

            <div className="border-t border-[#2A2A2A] my-2" />

            <Toggle
              label="Minimize to tray when launching an app"
              description="Hide the Launcher to the system tray after launching an app."
              checked={settings.minimizeToTrayOnAppLaunch}
              onChange={(v) => updateSetting('minimizeToTrayOnAppLaunch', v)}
            />

            <div className="border-t border-[#2A2A2A] my-2" />

            <Toggle
              label="Minimize to tray on close"
              description="Clicking the X button hides to tray instead of quitting. Right-click the tray icon to quit."
              checked={settings.minimizeToTrayOnClose}
              onChange={(v) => updateSetting('minimizeToTrayOnClose', v)}
            />
          </section>

          {/* --- About Section --- */}
          <section>
            <h2 className="text-[#A0A0A0] text-xs font-semibold uppercase tracking-wider mb-4">
              About
            </h2>

            <div className="py-3 flex items-center justify-between">
              <div>
                <p className="text-[#F5F5F5] text-sm font-medium">Shannon Launcher</p>
                <p className="text-[#666666] text-xs mt-0.5">Version {launcherVersion}</p>
              </div>
              <button
                onClick={handleCheckUpdate}
                className="px-4 py-2 rounded-lg bg-[#1A1A1A] border border-[#2A2A2A] text-[#F5F5F5] text-xs hover:bg-[#2A2A2A] transition-colors duration-150"
              >
                Check for Update
              </button>
            </div>

            {launcherUpdateAvailable && (
              <div className="mt-2 px-3 py-2 rounded-lg bg-[#6366F1]/10 border border-[#6366F1]/20">
                <p className="text-[#6366F1] text-xs">
                  v{launcherUpdateAvailable.version} available —{' '}
                  <button
                    onClick={() => window.electronAPI.openExternal(launcherUpdateAvailable!.downloadUrl)}
                    className="underline hover:text-[#818CF8]"
                  >
                    Download
                  </button>
                </p>
              </div>
            )}

            <div className="border-t border-[#2A2A2A] my-4" />

            <button
              onClick={() => window.electronAPI.openExternal('https://github.com/OWNER_TBD/shannon-launcher')}
              className="text-[#A0A0A0] text-xs hover:text-[#F5F5F5] transition-colors"
            >
              View on GitHub →
            </button>
          </section>
        </div>
      </div>
    );
  }
  ```
  Max-width 600px centered via `mx-auto` keeps the settings from stretching on wide screens. Each setting change calls `updateSettings()` via IPC immediately — no "Save" button needed. The `refreshConfig()` call re-reads config from disk to ensure the store is in sync.

- [ ] 2.2 — Wire Settings into `App.tsx`. Replace the placeholder:
  ```tsx
  {activeView === 'settings' && <Settings />}
  ```
  Import `Settings` from `./components/Settings`.

---

### Task 3: First-Run Welcome Screen
**Description:** Show a welcome overlay the very first time the Launcher opens. Introduces the product with a staggered fade-in animation.

**Subtasks:**
- [ ] 3.1 — Create `frontend/src/components/Welcome.tsx`:
  ```tsx
  import { useState, useEffect } from 'react';
  import { useAppStore } from '../stores/appStore';

  export default function Welcome() {
    const { isFirstRun, markFirstRunComplete } = useAppStore();
    const [visible, setVisible] = useState(false);
    const [phase, setPhase] = useState(0); // 0=hidden, 1=logo, 2=title, 3=desc, 4=button

    useEffect(() => {
      if (!isFirstRun) return;
      // Stagger the entrance
      setVisible(true);
      const timers = [
        setTimeout(() => setPhase(1), 100),  // Logo
        setTimeout(() => setPhase(2), 200),  // Title
        setTimeout(() => setPhase(3), 300),  // Description
        setTimeout(() => setPhase(4), 400),  // Button
      ];
      return () => timers.forEach(clearTimeout);
    }, [isFirstRun]);

    if (!isFirstRun) return null;

    async function handleGetStarted() {
      setVisible(false);
      // Wait for fade-out animation
      setTimeout(() => {
        markFirstRunComplete();
      }, 300);
    }

    return (
      <div className={`
        fixed inset-0 z-50 flex items-center justify-center bg-[#0D0D0D]/90 backdrop-blur-sm
        transition-opacity duration-300
        ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}
      `}>
        <div className="max-w-lg w-full mx-4 bg-[#1E1E1E] rounded-2xl p-10 border border-[#2A2A2A] shadow-2xl text-center">
          {/* Logo */}
          <div className={`
            transition-all duration-300
            ${phase >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}
          `}>
            <div className="w-20 h-20 rounded-2xl bg-[#3B82F6] flex items-center justify-center mx-auto mb-6">
              <span className="text-white text-3xl font-bold">S</span>
            </div>
          </div>

          {/* Title */}
          <h1 className={`
            text-[#F5F5F5] text-2xl font-bold mb-3
            transition-all duration-300
            ${phase >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}
          `}>
            Welcome to Shannon Launcher
          </h1>

          {/* Description */}
          <p className={`
            text-[#A0A0A0] text-sm leading-relaxed mb-8 max-w-sm mx-auto
            transition-all duration-300
            ${phase >= 3 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}
          `}>
            Your personal software hub. Browse, install, and keep your apps up to date — all in one place.
          </p>

          {/* Button */}
          <div className={`
            transition-all duration-300
            ${phase >= 4 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}
          `}>
            <button
              onClick={handleGetStarted}
              className="w-full py-3 rounded-xl bg-[#3B82F6] hover:bg-[#2563EB] text-white font-semibold text-sm transition-colors duration-150"
            >
              Get Started
            </button>
          </div>
        </div>
      </div>
    );
  }
  ```
  The staggered entrance uses 4 phases at 100ms intervals (logo → title → description → button), each with `translate-y-3 → translate-y-0` and `opacity-0 → opacity-1`. The "S" logo is a placeholder — replace with a real logo before release. On "Get Started," the overlay fades out (300ms) before calling `markFirstRunComplete()`, which sets `firstRunComplete: true` in config via IPC. The overlay never appears again.

- [ ] 3.2 — Add `Welcome` to `App.tsx`. Render it as the last element (highest z-index):
  ```tsx
  return (
    <div className="flex h-screen bg-[#0D0D0D] text-[#F5F5F5] overflow-hidden select-none">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        <UpdateBanner />
        <div className="flex-1 overflow-hidden">
          {activeView === 'library' && <Library />}
          {activeView === 'settings' && <Settings />}
        </div>
      </main>
      <ToastContainer />
      <Welcome />
    </div>
  );
  ```
  `Welcome` is rendered outside the main layout so it overlays everything. It self-hides via `isFirstRun` state.

**Implementation Notes:**
- `backdrop-blur-sm` adds a subtle blur behind the overlay. This is a CSS backdrop-filter property — supported in all modern Chromium (which Electron uses).
- `markFirstRunComplete()` in the store calls `window.electronAPI.setFirstRunComplete()` → IPC → sets `firstRunComplete: true` in config.json → writes to disk. This was wired in L1/L2.

---

### Task 4: Window State Multi-Monitor Hardening
**Description:** When restoring window position on startup, verify the saved position is still visible on current displays. Handle the case where a user undocks a monitor.

**Subtasks:**
- [ ] 4.1 — In `electron/main.ts`, update `loadWindowState()` to validate position against current displays:
  ```typescript
  import { screen } from 'electron';

  function isPositionVisible(x: number, y: number): boolean {
    const displays = screen.getAllDisplays();
    return displays.some((display) => {
      const { x: dx, y: dy, width, height } = display.bounds;
      // Check if the point is within any display bounds (with 50px margin)
      return x >= dx - 50 && x < dx + width + 50 && y >= dy - 50 && y < dy + height + 50;
    });
  }

  function loadWindowState(): WindowState {
    const defaults: WindowState = { width: 1000, height: 700, isMaximized: false };
    try {
      const statePath = getWindowStatePath();
      if (fs.existsSync(statePath)) {
        const data = fs.readFileSync(statePath, 'utf-8');
        const saved = JSON.parse(data) as Partial<WindowState>;
        const state = { ...defaults, ...saved };

        // Validate position is on a visible display
        if (state.x !== undefined && state.y !== undefined) {
          if (!isPositionVisible(state.x, state.y)) {
            console.log('[main] Saved window position is off-screen, resetting to center');
            delete state.x;
            delete state.y;
          }
        }

        return state;
      }
    } catch {
      // Corrupted window state — delete and use defaults
      try { fs.unlinkSync(getWindowStatePath()); } catch {}
    }
    return defaults;
  }
  ```
  The 50px margin is forgiving — it allows the window to be partially off-screen (user might have moved it to the edge). If x/y are completely off all displays (monitor disconnected), the position is deleted and Electron will center the window on the primary display.

- [ ] 4.2 — Handle corrupted `window-state.json` — the `try/catch` with `JSON.parse` already exists from L1, but add explicit cleanup:
  ```typescript
  } catch {
    try { fs.unlinkSync(getWindowStatePath()); } catch {}
    console.warn('[main] Corrupted window-state.json deleted, using defaults');
  }
  ```

**Implementation Notes:**
- `screen.getAllDisplays()` returns an array of display objects with `bounds { x, y, width, height }`. On a single-monitor setup, there's one display. On multi-monitor, each display has its own bounds coordinate space.
- The `screen` module must be imported AFTER `app.whenReady()` resolves (Electron requirement). However, since `loadWindowState()` is called inside `createWindow()` which is inside `whenReady()`, this is already satisfied.

---

### Task 5: UI Polish Pass
**Description:** Systematic audit and polish of every visual element for enterprise-level quality.

**Subtasks:**
- [ ] 5.1 — **Custom scrollbar** — Add to `frontend/src/index.css`:
  ```css
  /* Custom scrollbar for dark theme */
  ::-webkit-scrollbar {
    width: 6px;
  }
  ::-webkit-scrollbar-track {
    background: #1A1A1A;
  }
  ::-webkit-scrollbar-thumb {
    background: #3A3A3A;
    border-radius: 3px;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: #4A4A4A;
  }
  ```
  Thin (6px), dark track, slightly lighter thumb. Rounded. Hover brightens the thumb. This applies to the Library card grid scroll and the Settings page scroll.

- [ ] 5.2 — **Focus states** — Add global focus-visible styles to `index.css`:
  ```css
  /* Keyboard focus indicator (only shows on keyboard nav, not mouse clicks) */
  *:focus-visible {
    outline: 2px solid #3B82F6;
    outline-offset: 2px;
    border-radius: 4px;
  }

  /* Remove default outline for mouse users */
  *:focus:not(:focus-visible) {
    outline: none;
  }
  ```
  `:focus-visible` is the modern approach — it only shows the focus ring when the user navigates via keyboard (Tab key), not when they click with a mouse. This is better UX than always showing outlines.

- [ ] 5.3 — **Transition consistency audit** — Verify all interactive elements use consistent timings:
  - Micro interactions (hover, badge color): 150ms ease-out
  - Panel animations (detail slide): 200ms ease-out
  - Overlay animations (welcome fade): 300ms ease-out
  - Progress bar: 250ms linear

  Search the codebase for `transition` and `duration` classes. Fix any that don't match these specs. Common issues:
  - Missing `transition-colors` on buttons (click would change color instantly)
  - Inconsistent `duration-200` vs `duration-150`

- [ ] 5.4 — **Loading states audit** — Verify:
  - Skeleton cards appear on startup (L2 implementation)
  - "Checking for updates..." indicator works in sidebar (L3)
  - InstallProgress shows during downloads (L4)
  - "Launching..." spinner shows during launch (L5)

- [ ] 5.5 — **Error message audit** — Review every `showToast('error', ...)` call and every `error` field in results. Every error message should be actionable:
  - ✅ "Download failed. Check your internet connection and try again."
  - ✅ "Installation failed. Try running the installer manually."
  - ✅ "Could not launch app. The executable may have been moved or deleted."
  - ❌ "Error occurred" (not actionable — fix these)
  - ❌ "Unknown error" (add context — fix these)

- [ ] 5.6 — **Empty state when no app selected** — When the Library is showing and no card is selected, the card grid takes the full width. Verify this looks good. If the grid has only 1 app card and lots of empty space, consider adding a subtle instruction text:
  ```tsx
  {apps.length > 0 && !selectedAppId && (
    <p className="text-[#666666] text-xs mt-6 text-center">
      Select an app to view details
    </p>
  )}
  ```

- [ ] 5.7 — **Sidebar version with update indicator** — In `Sidebar.tsx`, when a Launcher update is available, change the version display:
  ```tsx
  const { launcherVersion, launcherUpdateAvailable } = useAppStore();

  // In footer:
  {launcherUpdateAvailable ? (
    <p className="text-[#F59E0B] text-[10px]">
      v{launcherVersion} • Update available
    </p>
  ) : (
    <p className="text-[#666666] text-[10px]">v{launcherVersion}</p>
  )}
  ```
  The version text turns amber when an update is available, serving as a persistent but subtle reminder.

- [ ] 5.8 — **Tooltip on truncated card names** — Verify `AppCard.tsx` has `title={entry.name}` on the h3 element. This was specified in L2 but verify it's present. The native browser tooltip appears when the name is truncated by `truncate` class.

---

### Task 6: Packaging Pipeline
**Description:** Finalize the build and release scripts. Verify the packaged app works end-to-end.

**Subtasks:**
- [ ] 6.1 — Verify `electron/electron-builder.yml` matches the spec. Confirm these fields:
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

- [ ] 6.2 — Verify root `package.json` scripts are correct:
  ```json
  "package": "npm run build:frontend && npm run build:electron && cd electron && npx electron-builder --config electron-builder.yml --win",
  "release": "npm run build:frontend && npm run build:electron && cd electron && npx electron-builder --config electron-builder.yml --win --publish always"
  ```

- [ ] 6.3 — Verify version is synchronized: `package.json` (root), `electron/package.json`, and `frontend/package.json` should all have `"version": "1.0.0"`.

- [ ] 6.4 — Create `scripts/release.bat`:
  ```bat
  @echo off
  echo ============================================
  echo   Shannon Launcher — Release Build
  echo ============================================
  echo.
  cd /d "%~dp0.."
  echo [1/3] Building frontend...
  call npm run build:frontend
  if errorlevel 1 (echo Frontend build failed! & pause & exit /b 1)
  echo.
  echo [2/3] Building electron...
  call npm run build:electron
  if errorlevel 1 (echo Electron build failed! & pause & exit /b 1)
  echo.
  echo [3/3] Packaging and publishing...
  cd electron
  call npx electron-builder --config electron-builder.yml --win --publish always
  if errorlevel 1 (echo Packaging failed! & pause & exit /b 1)
  echo.
  echo ============================================
  echo   Release complete!
  echo ============================================
  pause
  ```
  Each step checks for errors (`errorlevel 1`) and stops with a message. `cd /d "%~dp0.."` ensures it runs from the project root regardless of where the script is called from.

- [ ] 6.5 — Test the full build pipeline:
  - Run `npm run build` — verify no errors
  - Run `npm run package` — verify an installer `.exe` is created in `electron/release/`
  - Run the installer on the dev machine — verify it creates desktop + start menu shortcuts
  - Open the installed Launcher — verify it loads from bundled files (not dev server), shows the Welcome screen, and all features work

**Implementation Notes:**
- `npm run package` builds everything and creates the NSIS installer but does NOT publish to GitHub. `npm run release` builds AND publishes. Use `package` for local testing, `release` for distribution.
- The installer will be named something like `Shannon-Launcher-Setup-1.0.0.exe` based on `productName` and version.
- `signAndEditExecutable: false` means the exe is unsigned. Windows SmartScreen will show a warning on first run. Code signing can be added later with a certificate.

---

### Task 7: App Icons
**Description:** Ensure icon files are present and properly referenced.

**Subtasks:**
- [ ] 7.1 — Verify `resources/icon.ico` exists. It should be a multi-resolution `.ico` file containing at least 16×16, 32×32, 48×48, and 256×256 sizes. For development, a placeholder is acceptable — generate one from a 256×256 PNG using an online ICO converter or a simple script. Flag: **Replace with real branding icon before first public release.**

- [ ] 7.2 — Verify `assets/icons/finance-app.png` exists (64×64 placeholder from L1). Ensure the frontend can load it. In the current architecture, app icons use the `FallbackIcon` component (first-letter colored circle). Real icon loading from files would require serving the `assets/` directory — defer this to a future enhancement. The fallback icon is the production solution for now.

- [ ] 7.3 — Verify tray icon renders at correct sizes. The Windows system tray uses 16×16 or 32×32 depending on DPI. The `.ico` file should contain both sizes. Test by looking at the tray icon — it should be crisp, not blurry.

---

### Task 8: README
**Description:** Create project documentation for developer reference.

**Subtasks:**
- [ ] 8.1 — Create `README.md` at the project root:
  ```markdown
  # Shannon Launcher

  Personal software hub for installing, updating, and launching your apps.

  ## Quick Start

  ```bash
  # Install dependencies
  npm install

  # Start development
  npm run dev:frontend   # Terminal 1: Vite dev server (port 5173)
  npm run dev:electron   # Terminal 2: Electron app
  ```

  ## Building

  ```bash
  npm run build          # Build frontend + electron
  npm run package        # Build + create NSIS installer (local only)
  npm run release        # Build + create installer + publish to GitHub Releases
  ```

  Or use the release script:
  ```bash
  scripts\release.bat
  ```

  ## Adding a New App

  1. Edit `electron/registry.ts` — add a new `AppEntry` to the `APP_REGISTRY` array
  2. Add the app's icon to `assets/icons/` (optional — fallback icon works)
  3. Bump the Launcher version in `package.json`, `electron/package.json`, `frontend/package.json`
  4. Run `npm run release` to publish the updated Launcher

  ## Pushing an App Update

  No Launcher changes needed — just publish a new GitHub Release in the app's repo.
  The Launcher detects new versions automatically on startup.

  ## Architecture

  - **Electron main process** (`electron/`) — window management, config (JSON file),
    GitHub API client, download manager, NSIS installer runner, app launcher, system tray
  - **React frontend** (`frontend/`) — Library UI, app cards, settings, Zustand state management
  - **No backend** — pure client-side Electron app with local JSON config
  - **Distribution** — NSIS installer via GitHub Releases

  ## Project Structure

  ```
  Launcher/
  ├── electron/           # Electron main process
  │   ├── main.ts         # Window, lifecycle, startup
  │   ├── preload.ts      # IPC context bridge
  │   ├── config.ts       # JSON config read/write
  │   ├── registry.ts     # Hardcoded app registry
  │   ├── github.ts       # GitHub Releases API client
  │   ├── updater.ts      # Version checker
  │   ├── downloader.ts   # Download with progress
  │   ├── installer.ts    # NSIS silent install
  │   ├── launcher.ts     # Spawn app processes
  │   ├── tray.ts         # System tray
  │   └── ipc.ts          # IPC handler registration
  ├── frontend/           # React frontend
  │   └── src/
  │       ├── components/ # UI components
  │       ├── stores/     # Zustand state
  │       ├── types/      # TypeScript definitions
  │       └── lib/        # Utilities
  ├── assets/             # App icons
  ├── resources/          # Launcher icon (for NSIS)
  └── scripts/            # Build scripts
  ```

  ## Placeholders

  Replace before first public release:
  - `OWNER_TBD` → Your GitHub username (in `registry.ts`, `electron-builder.yml`, `updater.ts`)
  - `resources/icon.ico` → Real launcher icon
  - `assets/icons/finance-app.png` → Real app icon (optional)
  ```

---

## ACCEPTANCE CRITERIA

- [ ] AC-1: Settings page displays with two sections: "General" (install directory + 3 toggles) and "About" (version + check for update button + GitHub link). Max-width 600px, centered.
- [ ] AC-2: Each toggle switch animates smoothly (150ms) between on/off states. Toggling immediately saves to `config.json` (verify by reading the file).
- [ ] AC-3: "Browse" button for install directory opens a native Windows directory picker. Selected directory saves to config and shows in the display field.
- [ ] AC-4: "Check for Update" button in About section triggers a manual update check. Shows toast: "Update available: vX.Y.Z" or "You're on the latest version."
- [ ] AC-5: First launch shows the Welcome overlay with staggered fade-in animation (logo → title → description → button at 100ms intervals). Background has subtle blur.
- [ ] AC-6: Clicking "Get Started" fades out the overlay (300ms) and it never appears again. `config.json` has `firstRunComplete: true`.
- [ ] AC-7: `npm run package` produces a working NSIS installer in `electron/release/`. The installer file is named `Shannon-Launcher-Setup-1.0.0.exe` (or similar).
- [ ] AC-8: Running the installer creates desktop and start menu shortcuts named "Shannon Launcher."
- [ ] AC-9: The installed (packaged) Launcher opens correctly — loads from bundled files (not dev server), shows version, all features work.
- [ ] AC-10: Window state correctly restores even after a monitor is disconnected. If saved position is off-screen, window centers on primary display.
- [ ] AC-11: Custom thin scrollbar (6px, dark themed) is visible when the Library card grid or Settings page needs scrolling.
- [ ] AC-12: All interactive elements (buttons, toggles, cards) have visible keyboard focus rings when navigating with Tab key. No focus rings appear on mouse click.
- [ ] AC-13: Sidebar version text shows amber "v1.0.0 • Update available" when a Launcher update exists.
- [ ] AC-14: `README.md` exists at project root with development, building, release, adding apps, and architecture sections.
- [ ] AC-15: `scripts/release.bat` exists and includes error checking for each build step.
- [ ] AC-16: All three `package.json` files (root, electron, frontend) have version `"1.0.0"`.
- [ ] AC-17: **Full end-to-end flow works**: First launch → Welcome screen → Get Started → Library with Finance App card → Click card → Detail panel → Install (if GitHub release exists) → Launch → Settings → Change toggle → Close + reopen → Settings persisted, Welcome doesn't reappear.
- [ ] AC-18: No TypeScript errors. No console errors. No visual regressions from L1–L5.

---

## FILES TOUCHED

**New files:**
- `frontend/src/components/Toggle.tsx` — reusable toggle switch (~30 lines)
- `frontend/src/components/Settings.tsx` — settings page with General + About (~130 lines)
- `frontend/src/components/Welcome.tsx` — first-run overlay with staggered animation (~80 lines)
- `scripts/release.bat` — build + publish script (~25 lines)
- `README.md` — project documentation (~80 lines)

**Modified files:**
- `frontend/src/App.tsx` — add Settings and Welcome components
- `frontend/src/index.css` — add custom scrollbar styles, focus-visible styles
- `frontend/src/components/Sidebar.tsx` — version text with update indicator (amber)
- `frontend/src/components/Library.tsx` — optional "Select an app" empty state text
- `electron/main.ts` — import `screen`, update loadWindowState with display bounds check, handle corrupted window-state.json
- `electron/electron-builder.yml` — verify final config (may be no changes if L1 was correct)
- `package.json` (root) — verify scripts and version

---

## BUILDER PROMPT

> **Session L6 — Settings + Polish + Packaging [FINAL]**
>
> You are building the FINAL session of the Shannon Launcher. L1–L5 are complete — the Launcher is fully functional: browse library, install/update/uninstall apps, launch apps, system tray, keyboard shortcuts, update detection. Now add Settings, Welcome screen, packaging, and final polish.
>
> **Working directory:** `C:\Claude Access Point\Launcher`
>
> **What you're building:** Settings page, first-run Welcome overlay, packaging pipeline (NSIS installer), window state hardening, and UI polish (scrollbar, focus states, transitions, error messages).
>
> **Existing code (from L1–L5):**
>
> *Electron:*
> - Complete main process: window (with state persistence), config (read/write/migrate), registry, GitHub API client (with cache), update checker, downloader (with progress), installer (NSIS silent), launcher (spawn detached), tray (icon + menu), IPC handlers for all channels
> - `electron/main.ts` has: `let mainWindow`, `let isQuitting`, single-instance lock, window state load/save, createWindow, loadApp, setupIPC, tray creation, startup update checks, Ctrl+Q/Ctrl+R shortcuts
> - `electron/preload.ts` has all electronAPI methods: config, registry, releases, install/cancel/uninstall, verify, selectDirectory, launch, openFolder, openExternal, onDownloadProgress, onAppStatusChanged, onLauncherUpdateAvailable
>
> *Frontend:*
> - Complete UI: Sidebar (nav + version footer), Library (card grid + detail panel), AppCard (with StatusBadge, all statuses), AppDetail (functional Install/Update/Uninstall/Launch/OpenFolder/Cancel/Repair/Remove), InstallProgress (progress bar + stats + cancel), UpdateBanner (launcher self-update), Toast (imperative API), FallbackIcon
> - Zustand store: apps[], config, selectedAppId, activeView, launcherVersion, launcherUpdateAvailable, updateCheckInProgress, isFirstRun, initialized. All actions wired.
> - Types: full set in frontend/src/types/index.ts and electron.d.ts
> - Utilities: formatBytes, formatSpeed, formatEta, formatDate, cn
> - index.css: Tailwind directives, body styles, slideIn keyframe/class
>
> **Task 1: Toggle Component** (`frontend/src/components/Toggle.tsx`)
> Reusable: label, description, checked, onChange. 40×24px track (bg-[#1A1A1A] off, bg-[#3B82F6] on), 16×16 white knob (translate-x-1 off, translate-x-5 on), 150ms transition. `role="switch"` + `aria-checked` for accessibility. `shrink-0` on button.
>
> **Task 2: Settings Page** (`frontend/src/components/Settings.tsx`)
> Max-width 600px, mx-auto, overflow-y-auto. Two sections with uppercase tracking-wider section headers in text-[#A0A0A0]:
> - **General**: Default install dir (display field + Browse button → selectDirectory IPC), Check for updates toggle, Minimize to tray on launch toggle, Minimize to tray on close toggle. Dividers between items.
> - **About**: "Shannon Launcher" name + version. "Check for Update" button → checkLauncherUpdate IPC → toast result. If update available: styled banner with download link. "View on GitHub →" link.
> Each toggle calls `updateSettings({ key: value })` → IPC → `refreshConfig()`. No save button.
> Wire into App.tsx: `{activeView === 'settings' && <Settings />}`
>
> **Task 3: Welcome Screen** (`frontend/src/components/Welcome.tsx`)
> Full-screen overlay: fixed inset-0 z-50, bg-[#0D0D0D]/90 backdrop-blur-sm. Centered card: max-w-lg, bg-[#1E1E1E], rounded-2xl, p-10, border, shadow-2xl. Content: blue "S" logo square (20×20 rounded-2xl bg-[#3B82F6]), "Welcome to Shannon Launcher" title, description text, "Get Started" button (full-width, blue). Staggered entrance: 4 phases at 100ms intervals, each `opacity-0 translate-y-3 → opacity-100 translate-y-0`, transition 300ms. "Get Started" → fade-out overlay (300ms) → `markFirstRunComplete()`. Render in App.tsx after ToastContainer (highest z-index). Only shows when `isFirstRun === true`.
>
> **Task 4: Window State Hardening** (`electron/main.ts`)
> Import `screen` from electron. Add `isPositionVisible(x, y)`: check if point is within any `screen.getAllDisplays()` bounds (with 50px margin). In `loadWindowState()`: if saved x/y fail visibility check → delete x/y (Electron auto-centers). Handle corrupted window-state.json: try parse, catch → delete file + use defaults.
>
> **Task 5: UI Polish** (`frontend/src/index.css` + component audits)
> - Custom scrollbar: `::-webkit-scrollbar` width 6px, track #1A1A1A, thumb #3A3A3A (hover #4A4A4A), rounded
> - Focus states: `*:focus-visible { outline: 2px solid #3B82F6; outline-offset: 2px; }`, `*:focus:not(:focus-visible) { outline: none; }`
> - Transition audit: verify all components use consistent durations (150ms micro, 200ms panel, 300ms overlay, 250ms progress)
> - Error message audit: every toast/error must be actionable
> - Sidebar version: amber text when launcherUpdateAvailable exists
> - Library: optional "Select an app to view details" text when no card selected
> - Verify truncated name tooltips (title attr on card h3)
>
> **Task 6: Packaging**
> - Verify electron-builder.yml (appId, productName, extraResources, publish, nsis config)
> - Verify package.json scripts (package, release)
> - Sync version "1.0.0" across all 3 package.json files
> - Create `scripts/release.bat` with error checking per step
> - Test: `npm run build` succeeds. `npm run package` creates installer in electron/release/. Installer installs correctly. Packaged app works.
>
> **Task 7: Icons** — Verify resources/icon.ico and assets/icons/finance-app.png exist. Verify tray icon renders correctly.
>
> **Task 8: README.md** — Quick Start, Building, Adding Apps, Pushing Updates, Architecture, Project Structure, Placeholders.
>
> **Acceptance criteria:**
> 1. Settings: 2 sections, 4 controls, all persist immediately to config.json
> 2. Toggle: smooth 150ms animation, accessible (role=switch)
> 3. Browse: native directory picker, saves to config
> 4. Check for Update: manual trigger, toast result
> 5. Welcome: staggered fade-in (100ms intervals), "Get Started" → fade-out → never again
> 6. config.json firstRunComplete=true after welcome dismissed
> 7. npm run package → working NSIS installer in electron/release/
> 8. Installer creates desktop + start menu shortcuts
> 9. Packaged app loads from bundled files, all features work
> 10. Window restores correctly after monitor disconnected
> 11. Custom scrollbar visible (6px, dark)
> 12. Focus rings on Tab navigation, not on mouse click
> 13. Sidebar version amber when update available
> 14. README + release.bat exist
> 15. All package.json files version "1.0.0"
> 16. Full E2E: welcome → library → install → launch → settings → persist → reopen
> 17. No TypeScript errors, no console errors, no visual regressions
>
> **Technical constraints:**
> - Tailwind utility classes only — no CSS modules
> - `screen.getAllDisplays()` only works after `app.whenReady()` (already satisfied by call sequence)
> - `backdrop-blur-sm` for welcome overlay blur (Chromium supports this)
> - Toggle: `role="switch"` + `aria-checked` for screen readers
> - Settings changes save immediately via `updateSettings()` IPC → no Save button
> - Welcome stagger: `setTimeout` chain with phases 1–4 at 100ms intervals
> - Packaging: `npm run package` for local test, `npm run release` for publish
> - `signAndEditExecutable: false` — unsigned exe, SmartScreen warning expected
> - release.bat: `cd /d "%~dp0.."` ensures correct working directory
> - Version sync: root + electron + frontend package.json all "1.0.0"
