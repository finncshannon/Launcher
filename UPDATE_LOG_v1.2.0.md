# Update Log — Fulcrum v1.2.0

**Status:** Packaged — awaiting GitHub Release upload
**Branch:** main
**Started:** 2026-03-09
**Commit:** 6e43563 (pushed to origin/main)

---

## Changes

### 1. Fallback exe scan after install
**Files:** `electron/installer.ts`
**Type:** fix
**Description:** When the expected executable name isn't found after a successful NSIS install, the installer now scans the install directory for `.exe` files (excluding `Uninstall*.exe`). If exactly one is found, it's used as the executable path. This handles exe name mismatches caused by app rebrands where the GitHub Release was built before the rename took effect.

### 2. Repair logic in verify-installation IPC handler
**Files:** `electron/ipc.ts`
**Type:** fix
**Description:** The `app:verify-installation` handler now detects orphaned installs — apps that exist on disk but have no config record (e.g. from a failed exe detection). It scans the default install directory for the app, and if an exe is found, repairs the config with a new install record. Added `path` and `fs` imports to support the directory scanning.

### 3. Startup repair — all three failure cases + debug logging
**Files:** `electron/main.ts`
**Type:** fix
**Description:** Rewrote the startup repair to handle all three cases: (1) config entry exists + wrong exe path → scan installPath then default dir fallback, (2) no config entry + files on disk → discover and create record, (3) config entry exists + installPath gone → scan default dir fallback, or clean up stale entry. Also reads app `package.json` to detect version instead of `'unknown'`. Added comprehensive `[startup]` debug logging throughout so the exact failure point is visible in the console on next launch.

### 4. Case-insensitive exe check in installer
**Files:** `electron/installer.ts`
**Type:** fix
**Description:** After the primary `fs.existsSync` check for the expected executable name, added a case-insensitive directory scan fallback. Windows FS is case-insensitive but `path.join` preserves whatever case the registry specifies — if the actual file differs in casing, it now gets matched. Added debug logging for the exe verification step.

### 5. Frontend verifies ALL apps, not just installed ones
**Files:** `frontend/src/stores/appStore.ts`
**Type:** fix
**Description:** The startup verification loop in `initialize()` now calls `verifyInstallation` for every registry app, not just apps where `appState.installed` is truthy. This ensures the IPC repair path (which discovers apps on disk without config entries) actually fires. If any config repairs occur during verification, triggers `refreshConfig()` to re-read the updated config so the UI reflects the correct state immediately.

### 6. Version detection in IPC verify repair path
**Files:** `electron/ipc.ts`
**Type:** fix
**Description:** When the `app:verify-installation` IPC handler discovers an untracked install and creates a config entry, it now reads the app's `resources/app/package.json` to determine the installed version instead of using `'unknown'`. Added debug logging. Also added install result logging to the `app:install` handler.

---

## Version Bump Checklist
- [x] All `package.json` versions updated
- [x] TypeScript compiles clean
- [x] App runs without errors (smoke test passed — all [startup] logs confirmed)
- [x] Packaged build succeeds (`electron/release-v120/Fulcrum Setup 1.2.0.exe`)
- [x] Git commit + push (6e43563 → origin/main)
- [ ] GitHub Release created (needs `gh` CLI or manual upload)
