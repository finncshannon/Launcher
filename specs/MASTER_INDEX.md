# Shannon Launcher — Master Index

**Project:** Shannon Software Launcher
**Stack:** Electron + React + TypeScript + Tailwind + Zustand
**Distribution:** NSIS installer via GitHub Releases
**Platform:** Windows (macOS deferred)
**Location:** `C:\Claude Access Point\Launcher`

---

## Build Order

Sessions must be built sequentially. Each depends on the previous.

| Session | Title | Depends On | ClickUp Task ID | Status |
|---------|-------|------------|-----------------|--------|
| **L1** | Electron Shell + Config System | None | `86e088k1m` | To Do |
| **L2** | Library UI + App Cards | L1 | `86e088k27` | To Do |
| **L3** | GitHub Release Checker + Update Detection | L1 | `86e088k2v` | To Do |
| **L4** | Install + Update Flow | L3 | `86e088k3g` | To Do |
| **L5** | Launch + App Management | L4 | `86e088k42` | To Do |
| **L6** | Settings + Polish + Packaging | L5 | `86e088k4g` | To Do |

**Note:** L2 and L3 both depend only on L1 and could theoretically be built in parallel. However, L3 modifies files created in L2 (appStore, AppCard, AppDetail), so sequential build is recommended to avoid merge conflicts.

---

## Spec Documents

| Document | Location | Contents |
|----------|----------|----------|
| Original Spec | `specs/LAUNCHER_SPEC.md` | Vision, architecture, session outlines, file structure |
| Detailed Spec | `specs/DETAILED_SPEC.md` | TypeScript interfaces, IPC channels, GitHub API details, NSIS install, download manager, config system, edge cases, UI/UX specs, self-update flow, Zustand store design, electron-builder config |
| Master Index | `specs/MASTER_INDEX.md` | This file |

## Task Files

| File | Location | Session |
|------|----------|---------|
| L1 Tasks | `tasks/L1_tasks.md` | Electron Shell + Config System |
| L2 Tasks | `tasks/L2_tasks.md` | Library UI + App Cards |
| L3 Tasks | `tasks/L3_tasks.md` | GitHub Release Checker |
| L4 Tasks | `tasks/L4_tasks.md` | Install + Update Flow |
| L5 Tasks | `tasks/L5_tasks.md` | Launch + App Management |
| L6 Tasks | `tasks/L6_tasks.md` | Settings + Polish + Packaging |

---

## Cross-Cutting Rules

### 1. Code Patterns

- **IPC:** All renderer-main communication goes through the context bridge (`preload.ts`). Never use `nodeIntegration`. The preload exposes `window.electronAPI` with typed methods.
- **State management:** Single Zustand store (`appStore.ts`). All app state lives here. Components read from store, dispatch actions.
- **Config writes:** Always use atomic write (write to `.tmp`, then rename). Always validate/migrate on read.
- **Error handling:** Every IPC handler wraps in try/catch. Errors returned as `{ success: false, error: string }`, never thrown across the IPC bridge. Frontend shows toast for user-facing errors.
- **Type sharing:** Canonical types in `electron/types.ts`. Frontend mirrors them in `frontend/src/types/index.ts`. Keep in sync manually.

### 2. Design Tokens

| Token | Value | Usage |
|-------|-------|-------|
| bg-primary | `#0D0D0D` | Window background |
| bg-secondary | `#141414` | Sidebar, cards |
| bg-tertiary | `#1A1A1A` | Hover, inputs |
| bg-elevated | `#1E1E1E` | Panels, modals |
| border-default | `#2A2A2A` | Borders, dividers |
| text-primary | `#F5F5F5` | Main text |
| text-secondary | `#A0A0A0` | Descriptions |
| accent-primary | `#3B82F6` | Primary actions |
| accent-success | `#22C55E` | Installed |
| accent-warning | `#F59E0B` | Updates |
| accent-danger | `#EF4444` | Errors, uninstall |
| accent-info | `#6366F1` | Progress, installing |

### 3. Animation Standards

| Type | Duration | Easing |
|------|----------|--------|
| Micro (hover, badge) | 150ms | ease-out |
| Panel (slide in/out) | 200ms | ease-out in, ease-in out |
| Overlay (welcome, modal) | 300ms | ease-out |
| Progress bar | 250ms | linear |

### 4. Naming Conventions

- **IPC channels:** `{domain}:{action}` (e.g., `config:get`, `app:install`)
- **Files:** kebab-case for non-components, PascalCase for React components
- **App IDs:** kebab-case, unique (e.g., `finance-app`)
- **Config keys:** camelCase

### 5. Placeholders

| Placeholder | Location | Replace With |
|-------------|----------|-------------|
| `OWNER_TBD` | `registry.ts`, `electron-builder.yml`, `updater.ts` | Your GitHub username |
| `finance-app.png` | `assets/icons/` | Real Finance App icon (64x64 PNG) |
| `icon.ico` | `resources/` | Real Launcher icon (multi-size ICO) |

---

## Pipeline Workflow

```
For each session (L1-L6):
  1. PM Agent reads tasks/{LN}_tasks.md
  2. PM Agent feeds BUILDER PROMPT to Claude Code
  3. Claude Code implements in C:\Claude Access Point\Launcher
  4. PM Agent verifies ACCEPTANCE CRITERIA
  5. If pass -> mark ClickUp task complete -> next session
     If fail -> PM sends targeted fix prompt -> re-verify
```

### PM Agent Verification Checklist (per session)

1. All acceptance criteria pass
2. `npm run build` succeeds
3. App launches and functions as described
4. No TypeScript errors
5. No console errors in renderer or main process
6. UI matches design spec (colors, spacing, animations)

---

## Architecture Overview

```
Shannon Launcher
  Main Process (electron/)        Renderer Process (frontend/)
    main.ts        <--- IPC --->    App.tsx
    config.ts                         Sidebar
    registry.ts                       Library
    github.ts                           AppCard
    downloader.ts                       AppDetail
    installer.ts                          InstallProgress
    launcher.ts                       Settings
    tray.ts                           Welcome
    ipc.ts                            UpdateBanner
    preload.ts     <--- IPC --->      Toast
    types.ts                        stores/appStore.ts
        |                               |
        v                               v
    config.json                     Zustand (in-memory)
    (%APPDATA%)
        |
        v
    GitHub Releases API    Local filesystem (install dirs)
```

---

## Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Backend | None | Pure Electron — simpler, no server dependency |
| App registry | Hardcoded | Adding apps is rare; avoids server dependency |
| Distribution | GitHub Releases | Free, reliable, built-in CDN |
| Installer | NSIS | Same as Finance App |
| State management | Zustand | Lightweight, TypeScript-friendly |
| CSS | Tailwind | Fast, consistent design tokens |
| Download engine | electron.net | Respects system proxy |
| Self-update | Manual download | Auto-replace is fragile on Windows |
| Window frame | Standard Windows | Native feel |
| Auth | None (public repos) | No auth needed |
