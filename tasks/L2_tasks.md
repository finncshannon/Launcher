# Session L2 — Library UI + App Cards [Frontend]

**Priority:** High
**Type:** Frontend Only
**Depends On:** L1 (Electron Shell + Config System)
**Spec Reference:** `specs/DETAILED_SPEC.md` → Sections 1.1–1.2 (AppEntry, InstalledApp, AppState, AppStatus), 8.2 (Color Palette), 8.3 (Layout), 8.4 (Status Badges), 8.5 (Animations), 8.6 (Loading States), 8.8 (Empty States), 10 (Zustand Store Design)

---

## SCOPE SUMMARY

Build the complete Library UI: a Zustand store that merges registry and config data, a sidebar with navigation, an app card grid with status badges, and an app detail panel that slides in when a card is selected. This session produces the visual product — after L2, the Launcher looks and feels like a real application. All data comes from the registry and config established in L1. No network calls yet — update detection and install/launch functionality come in L3–L5.

---

## TASKS

### Task 1: Frontend Type Definitions
**Description:** Create the frontend-side TypeScript types that mirror the Electron types but also include runtime-only types (AppState, AppStatus, DownloadProgress) used by the store and components.

**Subtasks:**
- [ ] 1.1 — Create `frontend/src/types/index.ts`:
  ```typescript
  /** Static app definition from registry */
  export interface AppEntry {
    id: string;
    name: string;
    description: string;
    longDescription: string;
    github: { owner: string; repo: string };
    icon: string;
    installSize: string;
    tags: string[];
    executableName: string;
    minimumLauncherVersion?: string;
  }

  /** Per-app install record from config */
  export interface InstalledApp {
    version: string;
    installPath: string;
    installedAt: string;
    lastLaunched: string | null;
    executablePath: string;
  }

  /** User settings from config */
  export interface LauncherSettings {
    defaultInstallDir: string;
    checkUpdatesOnLaunch: boolean;
    minimizeToTrayOnAppLaunch: boolean;
    minimizeToTrayOnClose: boolean;
  }

  /** Root config */
  export interface LauncherConfig {
    configVersion: number;
    installedApps: Record<string, InstalledApp>;
    settings: LauncherSettings;
    firstRunComplete: boolean;
  }

  /** GitHub release info (populated in L3) */
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

  /** Download progress (populated in L4) */
  export interface DownloadProgress {
    appId: string;
    status: 'downloading' | 'installing' | 'complete' | 'failed' | 'cancelled';
    bytesDownloaded: number;
    totalBytes: number;
    speedBps: number;
    etaSeconds: number;
    error?: string;
  }

  /** App status enum */
  export type AppStatus =
    | 'not-installed'
    | 'installing'
    | 'installed'
    | 'update-available'
    | 'updating'
    | 'launching'
    | 'broken';

  /** Combined runtime state per app */
  export interface AppState {
    entry: AppEntry;
    installed: InstalledApp | null;
    latestRelease: ReleaseInfo | null;
    status: AppStatus;
    downloadProgress: DownloadProgress | null;
  }
  ```
  This file is the single source of truth for frontend types. Components import from `../types` or `@/types`. ReleaseInfo and DownloadProgress are defined now but won't be populated until L3/L4.

---

### Task 2: Zustand App Store
**Description:** Create the central state store that manages all application state. Follows the Finance App's `uiStore.ts` pattern — single `create<>()` call with state + actions.

**Subtasks:**
- [ ] 2.1 — Create `frontend/src/stores/appStore.ts`:
  ```typescript
  import { create } from 'zustand';
  import type {
    AppState, AppStatus, AppEntry, InstalledApp,
    LauncherConfig, DownloadProgress, ReleaseInfo,
  } from '../types';

  interface AppStoreState {
    // Data
    apps: AppState[];
    selectedAppId: string | null;
    config: LauncherConfig | null;
    launcherVersion: string;
    launcherUpdateAvailable: { version: string; downloadUrl: string } | null;

    // UI state
    activeView: 'library' | 'settings';
    updateCheckInProgress: boolean;
    isFirstRun: boolean;
    initialized: boolean;

    // Actions
    initialize: () => Promise<void>;
    setSelectedApp: (appId: string | null) => void;
    setActiveView: (view: 'library' | 'settings') => void;
    updateAppStatus: (appId: string, status: AppStatus) => void;
    updateDownloadProgress: (progress: DownloadProgress) => void;
    updateAppRelease: (appId: string, release: ReleaseInfo | null) => void;
    setLauncherUpdate: (update: { version: string; downloadUrl: string } | null) => void;
    setUpdateCheckInProgress: (inProgress: boolean) => void;
    markFirstRunComplete: () => Promise<void>;
    refreshConfig: () => Promise<void>;
  }

  export const useAppStore = create<AppStoreState>((set, get) => ({
    // Initial state
    apps: [],
    selectedAppId: null,
    config: null,
    launcherVersion: '',
    launcherUpdateAvailable: null,
    activeView: 'library',
    updateCheckInProgress: false,
    isFirstRun: false,
    initialized: false,

    initialize: async () => {
      try {
        const [config, registry, version] = await Promise.all([
          window.electronAPI.getConfig(),
          window.electronAPI.getRegistry(),
          window.electronAPI.getVersion(),
        ]);

        // Merge registry with installed app data from config
        const apps: AppState[] = registry.map((entry: AppEntry) => {
          const installed = config.installedApps[entry.id] || null;
          return {
            entry,
            installed,
            latestRelease: null,  // Populated in L3
            status: installed ? 'installed' as AppStatus : 'not-installed' as AppStatus,
            downloadProgress: null,
          };
        });

        set({
          apps,
          config,
          launcherVersion: version,
          isFirstRun: !config.firstRunComplete,
          initialized: true,
        });
      } catch (error) {
        console.error('[store] Failed to initialize:', error);
        set({ initialized: true }); // Still mark initialized to avoid infinite loading
      }
    },

    setSelectedApp: (appId) => set({ selectedAppId: appId }),
    setActiveView: (view) => set({ activeView: view, selectedAppId: null }),

    updateAppStatus: (appId, status) =>
      set((state) => ({
        apps: state.apps.map((app) =>
          app.entry.id === appId ? { ...app, status } : app
        ),
      })),

    updateDownloadProgress: (progress) =>
      set((state) => ({
        apps: state.apps.map((app) =>
          app.entry.id === progress.appId ? { ...app, downloadProgress: progress } : app
        ),
      })),

    updateAppRelease: (appId, release) =>
      set((state) => ({
        apps: state.apps.map((app) =>
          app.entry.id === appId ? { ...app, latestRelease: release } : app
        ),
      })),

    setLauncherUpdate: (update) => set({ launcherUpdateAvailable: update }),
    setUpdateCheckInProgress: (inProgress) => set({ updateCheckInProgress: inProgress }),

    markFirstRunComplete: async () => {
      await window.electronAPI.setFirstRunComplete();
      set({ isFirstRun: false });
    },

    refreshConfig: async () => {
      const config = await window.electronAPI.getConfig();
      set((state) => ({
        config,
        apps: state.apps.map((app) => {
          const installed = config.installedApps[app.entry.id] || null;
          return {
            ...app,
            installed,
            status: installed
              ? (app.status === 'update-available' ? 'update-available' : 'installed')
              : 'not-installed',
          };
        }),
      }));
    },
  }));
  ```

**Implementation Notes:**
- `initialize()` uses `Promise.all` for parallel IPC calls — all 3 calls are independent and fast.
- The `apps` array is the joined result of registry (static) + config (dynamic). L3 will add `latestRelease` data.
- `setActiveView` also clears `selectedAppId` — switching to Settings should close any open detail panel.
- `refreshConfig` preserves `update-available` status when reloading config (don't downgrade to `installed` if we already know there's an update).

---

### Task 3: Utility Functions
**Description:** Shared formatting functions used across multiple components.

**Subtasks:**
- [ ] 3.1 — Create `frontend/src/lib/utils.ts`:
  ```typescript
  /** Format bytes to human-readable: "45.2 MB", "1.3 GB" */
  export function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const value = bytes / Math.pow(1024, i);
    return `${value.toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
  }

  /** Format download speed: "2.4 MB/s" */
  export function formatSpeed(bps: number): string {
    return `${formatBytes(bps)}/s`;
  }

  /** Format ETA: "2m 30s", "< 1m", "calculating..." */
  export function formatEta(seconds: number): string {
    if (seconds <= 0 || !isFinite(seconds)) return 'calculating...';
    if (seconds < 60) return '< 1m';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }

  /** Format ISO date: "Mar 7, 2026" */
  export function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  }

  /** Conditional class joiner: cn('base', condition && 'active') */
  export function cn(...classes: (string | false | undefined | null)[]): string {
    return classes.filter(Boolean).join(' ');
  }
  ```
  `cn()` is used throughout components for conditional Tailwind classes. It's the same pattern as `classnames` or `clsx` but zero dependencies.

---

### Task 4: Sidebar Component
**Description:** Fixed-width navigation sidebar with branding and nav items.

**Subtasks:**
- [ ] 4.1 — Create `frontend/src/components/Sidebar.tsx`:
  ```tsx
  import { useAppStore } from '../stores/appStore';
  import { cn } from '../lib/utils';

  export default function Sidebar() {
    const { activeView, setActiveView, launcherVersion, updateCheckInProgress } = useAppStore();

    return (
      <aside className="w-[200px] h-full bg-[#141414] border-r border-[#2A2A2A] flex flex-col">
        {/* Branding */}
        <div className="px-5 pt-6 pb-4">
          <h1 className="text-[#F5F5F5] text-lg font-bold tracking-tight">Shannon</h1>
          <p className="text-[#666666] text-xs mt-0.5">Launcher</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 space-y-1">
          <NavItem
            icon={<GridIcon />}
            label="Library"
            active={activeView === 'library'}
            onClick={() => setActiveView('library')}
          />
          <NavItem
            icon={<GearIcon />}
            label="Settings"
            active={activeView === 'settings'}
            onClick={() => setActiveView('settings')}
          />
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[#2A2A2A]">
          {updateCheckInProgress && (
            <p className="text-[#A0A0A0] text-[10px] mb-1">Checking for updates...</p>
          )}
          <p className="text-[#666666] text-[10px]">v{launcherVersion}</p>
        </div>
      </aside>
    );
  }
  ```
- [ ] 4.2 — Implement `NavItem` as an inline component within `Sidebar.tsx`:
  ```tsx
  function NavItem({ icon, label, active, onClick }: {
    icon: React.ReactNode;
    label: string;
    active: boolean;
    onClick: () => void;
  }) {
    return (
      <button
        onClick={onClick}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors duration-150',
          active
            ? 'bg-[#1A1A1A] text-[#F5F5F5] border-l-[3px] border-[#3B82F6] pl-[9px]'
            : 'text-[#A0A0A0] hover:bg-[#1A1A1A] hover:text-[#F5F5F5]'
        )}
      >
        {icon}
        {label}
      </button>
    );
  }
  ```
  The active state uses a 3px left border in `accent-primary` (#3B82F6). `pl-[9px]` compensates for the border so text doesn't shift (normal `px-3` = 12px, minus 3px border = 9px).

- [ ] 4.3 — Implement inline SVG icons — `GridIcon` and `GearIcon` — as simple 16×16 SVGs:
  ```tsx
  function GridIcon() {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }

  function GearIcon() {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 10a2 2 0 100-4 2 2 0 000 4z" stroke="currentColor" strokeWidth="1.5" />
        <path d="M13.5 8a5.5 5.5 0 01-.5 2.3l1.2 1.2-1.4 1.4-1.2-1.2A5.5 5.5 0 018 13.5a5.5 5.5 0 01-2.3-.5L4.5 14.2 3.1 12.8l1.2-1.2A5.5 5.5 0 012.5 8c0-.8.2-1.6.5-2.3L1.8 4.5 3.2 3.1l1.2 1.2A5.5 5.5 0 018 2.5c.8 0 1.6.2 2.3.5l1.2-1.2 1.4 1.4-1.2 1.2c.3.7.5 1.5.5 2.3z" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  ```
  Using inline SVGs avoids a dependency on an icon library. `currentColor` makes them inherit the text color.

**Implementation Notes:**
- No icon library is imported. All icons are inline SVGs. This keeps the bundle lean and avoids version conflicts.
- The sidebar is a flex column with branding, nav (flex-1), and footer. The footer sits at the bottom because of flex layout.

---

### Task 5: App Card Component
**Description:** Individual app card for the library grid, with icon, name, description, and status badge.

**Subtasks:**
- [ ] 5.1 — Create `frontend/src/components/AppCard.tsx`:
  ```tsx
  import { cn } from '../lib/utils';
  import type { AppState } from '../types';

  interface AppCardProps {
    app: AppState;
    selected: boolean;
    onClick: () => void;
  }

  export default function AppCard({ app, selected, onClick }: AppCardProps) {
    const { entry, status, latestRelease } = app;

    return (
      <button
        onClick={onClick}
        className={cn(
          'flex flex-col items-center p-4 rounded-lg bg-[#141414] border transition-all duration-150 cursor-pointer text-left w-full',
          selected
            ? 'border-[#3B82F6] border-2 shadow-[0_0_12px_rgba(59,130,246,0.15)]'
            : 'border-[#2A2A2A] hover:border-[#3A3A3A] hover:scale-[1.02]',
        )}
      >
        {/* Icon */}
        <div className="w-16 h-16 rounded-xl bg-[#1A1A1A] flex items-center justify-center mb-3 overflow-hidden">
          <FallbackIcon name={entry.name} appId={entry.id} />
        </div>

        {/* Name */}
        <h3 className="text-[#F5F5F5] text-sm font-semibold text-center truncate w-full" title={entry.name}>
          {entry.name}
        </h3>

        {/* Description */}
        <p className="text-[#A0A0A0] text-xs text-center mt-1 line-clamp-2 leading-relaxed">
          {entry.description}
        </p>

        {/* Status Badge */}
        <div className="mt-3">
          <StatusBadge status={status} updateVersion={latestRelease?.version} />
        </div>
      </button>
    );
  }
  ```

- [ ] 5.2 — Implement `StatusBadge` inline component:
  ```tsx
  function StatusBadge({ status, updateVersion }: { status: string; updateVersion?: string }) {
    const config: Record<string, { text: string; bg: string; textColor: string; pulse?: boolean }> = {
      'not-installed': { text: 'Available', bg: 'bg-[#1A1A1A]', textColor: 'text-[#A0A0A0]' },
      'installed':     { text: 'Installed ✓', bg: 'bg-[#22C55E]/10', textColor: 'text-[#22C55E]' },
      'update-available': {
        text: `Update ${updateVersion ? `v${updateVersion}` : ''}`,
        bg: 'bg-[#F59E0B]/10', textColor: 'text-[#F59E0B]', pulse: true,
      },
      'installing':    { text: 'Installing...', bg: 'bg-[#6366F1]/10', textColor: 'text-[#6366F1]' },
      'updating':      { text: 'Updating...', bg: 'bg-[#6366F1]/10', textColor: 'text-[#6366F1]' },
      'launching':     { text: 'Launching...', bg: 'bg-[#3B82F6]/10', textColor: 'text-[#3B82F6]' },
      'broken':        { text: 'Needs Repair', bg: 'bg-[#EF4444]/10', textColor: 'text-[#EF4444]' },
    };

    const c = config[status] || config['not-installed']!;
    return (
      <span className={cn(
        'inline-block px-2.5 py-0.5 rounded-full text-[10px] font-medium',
        c.bg, c.textColor,
        c.pulse && 'animate-pulse',
      )}>
        {c.text}
      </span>
    );
  }
  ```
  The pulse animation on `update-available` uses Tailwind's built-in `animate-pulse` class (2s infinite). Badge colors use the accent colors at 10% opacity (`/10` modifier).

- [ ] 5.3 — Implement `FallbackIcon` — a colored circle with first letter when no image is available:
  ```tsx
  function FallbackIcon({ name, appId }: { name: string; appId: string }) {
    // Generate a deterministic hue from the appId
    const hue = Array.from(appId).reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
    const letter = name.charAt(0).toUpperCase();
    return (
      <div
        className="w-full h-full flex items-center justify-center rounded-xl text-white text-2xl font-bold"
        style={{ backgroundColor: `hsl(${hue}, 50%, 30%)` }}
      >
        {letter}
      </div>
    );
  }
  ```
  The hue is derived from the appId hash so each app gets a consistent color. `hsl(X, 50%, 30%)` produces dark, muted colors that fit the dark theme.

**Implementation Notes:**
- Cards are `<button>` elements, not `<div onClick>`, for accessibility (keyboard focusable, screen reader semantics).
- `line-clamp-2` requires Tailwind's line-clamp plugin (built into Tailwind v3.3+).
- `title={entry.name}` on the h3 provides a native tooltip when the name is truncated.

---

### Task 6: Library Component
**Description:** Main content area showing the app card grid, with conditional detail panel.

**Subtasks:**
- [ ] 6.1 — Create `frontend/src/components/Library.tsx`:
  ```tsx
  import { useAppStore } from '../stores/appStore';
  import AppCard from './AppCard';
  import AppDetail from './AppDetail';

  export default function Library() {
    const { apps, selectedAppId, setSelectedApp, initialized } = useAppStore();
    const selectedApp = apps.find((a) => a.entry.id === selectedAppId) || null;

    if (!initialized) {
      return <SkeletonGrid />;
    }

    return (
      <div className="flex h-full overflow-hidden">
        {/* Card Grid */}
        <div className={cn(
          'flex-1 overflow-y-auto p-6',
          selectedApp && 'pr-0', // Remove right padding when detail panel is open
        )}>
          <div className="grid gap-4" style={{
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          }}>
            {apps.map((app) => (
              <AppCard
                key={app.entry.id}
                app={app}
                selected={app.entry.id === selectedAppId}
                onClick={() => setSelectedApp(
                  app.entry.id === selectedAppId ? null : app.entry.id
                )}
              />
            ))}
          </div>
        </div>

        {/* Detail Panel */}
        {selectedApp && (
          <AppDetail
            app={selectedApp}
            onClose={() => setSelectedApp(null)}
          />
        )}
      </div>
    );
  }
  ```

- [ ] 6.2 — Implement `SkeletonGrid` — 3 pulsing placeholder cards shown during initialization:
  ```tsx
  function SkeletonGrid() {
    return (
      <div className="p-6">
        <div className="grid gap-4" style={{
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex flex-col items-center p-4 rounded-lg bg-[#141414] border border-[#2A2A2A] animate-pulse"
            >
              <div className="w-16 h-16 rounded-xl bg-[#1A1A1A] mb-3" />
              <div className="w-24 h-4 rounded bg-[#1A1A1A] mb-2" />
              <div className="w-32 h-3 rounded bg-[#1A1A1A]" />
              <div className="w-16 h-5 rounded-full bg-[#1A1A1A] mt-3" />
            </div>
          ))}
        </div>
      </div>
    );
  }
  ```
  Skeletons match the card dimensions exactly so there's no layout shift when real data loads.

- [ ] 6.3 — Clicking a selected card again deselects it (toggle behavior): `app.entry.id === selectedAppId ? null : app.entry.id`.

**Implementation Notes:**
- The grid uses inline `style` for `gridTemplateColumns` because Tailwind's arbitrary grid utilities are verbose and less readable for `auto-fill minmax`.
- When the detail panel is open, the grid area shrinks. The `flex` layout handles this automatically — detail panel has a fixed width, grid takes the remainder.
- Custom scrollbar styling will be added in L6 (polish pass). For now, the default scrollbar is fine.

---

### Task 7: App Detail Panel
**Description:** Slide-in panel showing full app information and action buttons.

**Subtasks:**
- [ ] 7.1 — Create `frontend/src/components/AppDetail.tsx`:
  ```tsx
  import { useEffect } from 'react';
  import type { AppState } from '../types';
  import { cn, formatDate } from '../lib/utils';

  interface AppDetailProps {
    app: AppState;
    onClose: () => void;
  }

  export default function AppDetail({ app, onClose }: AppDetailProps) {
    const { entry, installed, status, latestRelease } = app;

    // Escape key closes panel
    useEffect(() => {
      const handler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    return (
      <div className="w-[480px] h-full bg-[#1E1E1E] border-l border-[#2A2A2A] flex flex-col overflow-y-auto animate-slideIn">
        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-4">
          <div className="flex items-center gap-4">
            <div className="w-24 h-24 rounded-2xl bg-[#1A1A1A] flex items-center justify-center overflow-hidden">
              <FallbackIcon name={entry.name} appId={entry.id} size="lg" />
            </div>
            <div>
              <h2 className="text-[#F5F5F5] text-xl font-bold">{entry.name}</h2>
              {installed && (
                <p className="text-[#A0A0A0] text-sm mt-1">v{installed.version}</p>
              )}
              {installed?.lastLaunched && (
                <p className="text-[#666666] text-xs mt-0.5">
                  Last launched {formatDate(installed.lastLaunched)}
                </p>
              )}
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="text-[#666666] hover:text-[#F5F5F5] transition-colors p-1"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Tags */}
        <div className="px-6 pb-4 flex flex-wrap gap-2">
          {entry.tags.map((tag) => (
            <span key={tag} className="px-2 py-0.5 rounded bg-[#1A1A1A] text-[#A0A0A0] text-[10px]">
              {tag}
            </span>
          ))}
          <span className="px-2 py-0.5 rounded bg-[#1A1A1A] text-[#666666] text-[10px]">
            {entry.installSize}
          </span>
        </div>

        {/* Description */}
        <div className="px-6 pb-6 flex-1">
          <p className="text-[#A0A0A0] text-sm leading-relaxed">
            {entry.longDescription}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="px-6 py-4 border-t border-[#2A2A2A] space-y-3">
          {status === 'not-installed' && (
            <button className="w-full py-2.5 rounded-lg bg-[#3B82F6] hover:bg-[#2563EB] text-white font-medium text-sm transition-colors duration-150"
              disabled title="Install functionality coming in next update">
              Install
            </button>
          )}

          {(status === 'installed' || status === 'update-available') && (
            <>
              <button className="w-full py-2.5 rounded-lg bg-[#3B82F6] hover:bg-[#2563EB] text-white font-medium text-sm transition-colors duration-150"
                disabled title="Launch functionality coming in next update">
                Launch
              </button>
              {status === 'update-available' && (
                <button className="w-full py-2 rounded-lg bg-[#F59E0B]/10 text-[#F59E0B] font-medium text-sm hover:bg-[#F59E0B]/20 transition-colors duration-150"
                  disabled>
                  Update to v{latestRelease?.version}
                </button>
              )}
              <div className="flex gap-2">
                <button className="flex-1 py-2 rounded-lg bg-[#1A1A1A] text-[#A0A0A0] text-sm hover:bg-[#2A2A2A] hover:text-[#F5F5F5] transition-colors duration-150"
                  disabled>
                  Open Folder
                </button>
                <button className="py-2 px-4 rounded-lg text-[#EF4444] text-sm hover:bg-[#EF4444]/10 transition-colors duration-150"
                  disabled>
                  Uninstall
                </button>
              </div>
            </>
          )}

          {status === 'broken' && (
            <div className="flex gap-2">
              <button className="flex-1 py-2.5 rounded-lg bg-[#3B82F6] hover:bg-[#2563EB] text-white font-medium text-sm transition-colors duration-150"
                disabled>
                Repair
              </button>
              <button className="py-2.5 px-4 rounded-lg text-[#EF4444] text-sm hover:bg-[#EF4444]/10 transition-colors duration-150"
                disabled>
                Remove
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }
  ```
  All action buttons are `disabled` in L2. They get wired to IPC calls in L4 (install/update/uninstall) and L5 (launch/open folder).

- [ ] 7.2 — Add the slide-in animation. In `frontend/src/index.css`, add a custom keyframe:
  ```css
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  .animate-slideIn {
    animation: slideIn 200ms ease-out;
  }
  ```
  This gives the detail panel a smooth entrance from the right edge. Duration: 200ms, easing: ease-out (matches spec section 8.5).

- [ ] 7.3 — Re-use the `FallbackIcon` component from `AppCard.tsx`. Either extract it to a shared file `frontend/src/components/FallbackIcon.tsx`, or duplicate it. Recommended: extract to shared file to avoid duplication.

**Implementation Notes:**
- The panel is 480px fixed width. On narrow windows, it will compress the card grid. This is acceptable — the grid's `auto-fill minmax(220px, 1fr)` will reduce columns gracefully. L6 will add a breakpoint for overlay mode on very narrow windows.
- `overflow-y-auto` on the panel allows scrolling when content exceeds viewport height.
- The close button uses an inline SVG X icon (20×20).

---

### Task 8: Toast Notification System
**Description:** Lightweight toast component for transient messages (success, error, info).

**Subtasks:**
- [ ] 8.1 — Create `frontend/src/components/Toast.tsx`:
  ```tsx
  import { useState, useEffect, useCallback } from 'react';
  import { cn } from '../lib/utils';

  export type ToastType = 'success' | 'error' | 'info';

  interface ToastMessage {
    id: number;
    type: ToastType;
    message: string;
  }

  // Module-level state for imperative API
  let addToastFn: ((type: ToastType, message: string) => void) | null = null;

  export function showToast(type: ToastType, message: string) {
    addToastFn?.(type, message);
  }

  export default function ToastContainer() {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    let nextId = 0;

    const addToast = useCallback((type: ToastType, message: string) => {
      const id = nextId++;
      setToasts((prev) => [...prev, { id, type, message }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    }, []);

    useEffect(() => {
      addToastFn = addToast;
      return () => { addToastFn = null; };
    }, [addToast]);

    const colors: Record<ToastType, string> = {
      success: 'border-[#22C55E] bg-[#22C55E]/10 text-[#22C55E]',
      error: 'border-[#EF4444] bg-[#EF4444]/10 text-[#EF4444]',
      info: 'border-[#3B82F6] bg-[#3B82F6]/10 text-[#3B82F6]',
    };

    return (
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              'px-4 py-3 rounded-lg border text-sm shadow-lg animate-slideIn max-w-sm',
              colors[toast.type],
            )}
          >
            {toast.message}
          </div>
        ))}
      </div>
    );
  }
  ```
  The `showToast()` export is an imperative API — components can call `showToast('error', 'Download failed')` without needing to thread state through props or context. The module-level `addToastFn` reference is set when `ToastContainer` mounts.

- [ ] 8.2 — The toast reuses the `animate-slideIn` keyframe from the detail panel. Toasts auto-dismiss after 4 seconds.

---

### Task 9: Update App.tsx Root Layout
**Description:** Replace the L1 diagnostic shell with the real layout.

**Subtasks:**
- [ ] 9.1 — Rewrite `frontend/src/App.tsx`:
  ```tsx
  import { useEffect } from 'react';
  import { useAppStore } from './stores/appStore';
  import Sidebar from './components/Sidebar';
  import Library from './components/Library';
  import ToastContainer from './components/Toast';

  export default function App() {
    const { initialize, activeView } = useAppStore();

    useEffect(() => {
      initialize();
    }, [initialize]);

    return (
      <div className="flex h-screen bg-[#0D0D0D] text-[#F5F5F5] overflow-hidden select-none">
        <Sidebar />
        <main className="flex-1 overflow-hidden">
          {activeView === 'library' && <Library />}
          {activeView === 'settings' && (
            <div className="flex items-center justify-center h-full">
              <p className="text-[#666666] text-sm">Settings — coming in L6</p>
            </div>
          )}
        </main>
        <ToastContainer />
      </div>
    );
  }
  ```
  `select-none` prevents text selection on the entire app (native app feel). `overflow-hidden` on the root prevents window-level scrollbars — each panel manages its own scrolling.

- [ ] 9.2 — `initialize()` is called once on mount via `useEffect`. It loads config, registry, and version in parallel, then populates the store.

---

## ACCEPTANCE CRITERIA

- [ ] AC-1: Sidebar renders on the left: 200px wide, bg `#141414`, border-right `#2A2A2A`. Shows "Shannon" branding, Library and Settings nav items.
- [ ] AC-2: Library nav item is highlighted by default with a 3px left accent bar in `#3B82F6`.
- [ ] AC-3: Library view shows Finance App as a card with a colored first-letter fallback icon, name "Finance App", description, and "Available" badge (gray).
- [ ] AC-4: Hovering a card applies `scale(1.02)` and border lightens from `#2A2A2A` to `#3A3A3A`. Transition is 150ms ease-out.
- [ ] AC-5: Clicking the Finance App card opens the detail panel (480px wide, bg `#1E1E1E`) sliding in from the right with a 200ms animation.
- [ ] AC-6: Detail panel shows: large icon (96×96 fallback), name, tags as pills, long description, install size, and an "Install" button (disabled in L2).
- [ ] AC-7: Pressing Escape closes the detail panel. Clicking the X button also closes it.
- [ ] AC-8: Clicking a selected card again deselects it and closes the detail panel.
- [ ] AC-9: If Finance App is manually marked as installed in `config.json` (edit the file to add an `installedApps` entry), the card shows "Installed ✓" badge in green, and the detail panel shows Launch, Open Folder, and Uninstall buttons (all disabled).
- [ ] AC-10: Skeleton loading state (3 pulsing placeholder cards) appears briefly on startup before real data loads.
- [ ] AC-11: Clicking "Settings" in sidebar shows a centered placeholder message. The detail panel closes when switching views.
- [ ] AC-12: The app looks dark-themed throughout — `#0D0D0D` main background, `#141414` sidebar and cards, `#1E1E1E` detail panel, `#2A2A2A` borders.
- [ ] AC-13: Toast container renders at bottom-right. Calling `showToast('info', 'test')` from browser console shows a toast that auto-dismisses after 4 seconds.
- [ ] AC-14: Version number appears in the sidebar footer in `#666666` muted text.
- [ ] AC-15: No TypeScript errors. No console errors in the renderer process.

---

## FILES TOUCHED

**New files:**
- `frontend/src/types/index.ts` — all frontend type definitions (~80 lines)
- `frontend/src/stores/appStore.ts` — Zustand store with state + actions (~120 lines)
- `frontend/src/lib/utils.ts` — formatBytes, formatSpeed, formatEta, formatDate, cn (~40 lines)
- `frontend/src/components/Sidebar.tsx` — sidebar with nav items and inline SVG icons (~100 lines)
- `frontend/src/components/AppCard.tsx` — card with icon, name, desc, status badge (~120 lines)
- `frontend/src/components/AppDetail.tsx` — 480px detail panel with action buttons (~140 lines)
- `frontend/src/components/Library.tsx` — card grid + skeleton + detail layout (~60 lines)
- `frontend/src/components/Toast.tsx` — toast notification system (~60 lines)
- `frontend/src/components/FallbackIcon.tsx` — shared fallback icon component (~20 lines, extracted from AppCard)

**Modified files:**
- `frontend/src/App.tsx` — replace diagnostic shell with Sidebar + Library + Toast layout
- `frontend/src/index.css` — add `@keyframes slideIn` and `.animate-slideIn` class

---

## BUILDER PROMPT

> **Session L2 — Library UI + App Cards [Frontend]**
>
> You are building session L2 of the Shannon Launcher. L1 is complete — you have a working Electron + React + Tailwind app with config system, app registry (Finance App), and IPC bridge. Now build the Library UI.
>
> **Working directory:** `C:\Claude Access Point\Launcher`
>
> **What you're building:** The complete visual frontend: sidebar navigation, app card grid with status badges, and a detail panel that slides in when a card is selected. After this session the app looks like a real launcher.
>
> **Existing code (from L1):**
> - `electron/types.ts` — AppEntry, InstalledApp, LauncherConfig, LauncherSettings, DEFAULT_CONFIG
> - `electron/config.ts` — readConfig(), writeConfig(), updateSettings()
> - `electron/registry.ts` — APP_REGISTRY with Finance App entry
> - `electron/ipc.ts` — handlers for config:get, config:update-settings, config:set-first-run-complete, registry:get-all, launcher:get-version
> - `electron/preload.ts` — electronAPI with getConfig, updateSettings, setFirstRunComplete, getRegistry, getVersion, onLauncherUpdateAvailable
> - `frontend/src/types/electron.d.ts` — Window.electronAPI type declarations
> - `frontend/src/App.tsx` — diagnostic shell (you're replacing this entirely)
> - `frontend/src/index.css` — Tailwind directives, body styles
> - `frontend/tailwind.config.ts` — custom color palette (bg-primary through accent-info)
>
> **Task 1: Types** (`frontend/src/types/index.ts`)
> Define all frontend types: AppEntry, InstalledApp, LauncherSettings, LauncherConfig, ReleaseInfo, ReleaseAsset, DownloadProgress, AppStatus (union: 'not-installed'|'installing'|'installed'|'update-available'|'updating'|'launching'|'broken'), AppState (entry + installed + latestRelease + status + downloadProgress). ReleaseInfo/DownloadProgress defined now but populated in L3/L4.
>
> **Task 2: Zustand Store** (`frontend/src/stores/appStore.ts`)
> `create<AppStoreState>()` with:
> - State: apps (AppState[]), selectedAppId (string|null), config (LauncherConfig|null), launcherVersion (string), launcherUpdateAvailable, activeView ('library'|'settings'), updateCheckInProgress, isFirstRun, initialized
> - `initialize()`: parallel Promise.all for getConfig+getRegistry+getVersion. Merge registry with config.installedApps to produce AppState[]. Status: if installed → 'installed', else → 'not-installed'.
> - `setSelectedApp(appId|null)`, `setActiveView(view)` (clears selectedAppId), `updateAppStatus(appId, status)`, `updateDownloadProgress(progress)`, `updateAppRelease(appId, release)`, `setLauncherUpdate()`, `setUpdateCheckInProgress()`, `markFirstRunComplete()` (calls IPC then sets isFirstRun false), `refreshConfig()` (re-reads config, preserves update-available status)
>
> **Task 3: Utilities** (`frontend/src/lib/utils.ts`)
> `formatBytes(bytes)` → "45.2 MB". `formatSpeed(bps)` → "2.4 MB/s". `formatEta(seconds)` → "2m 30s" or "< 1m". `formatDate(iso)` → "Mar 7, 2026". `cn(...classes)` → conditional class joiner (filter Boolean, join space).
>
> **Task 4: Sidebar** (`frontend/src/components/Sidebar.tsx`)
> 200px wide, h-full, bg `#141414`, border-r `#2A2A2A`. Flex column: branding top ("Shannon" bold + "Launcher" muted), nav middle (Library + Settings with inline SVG icons 16×16, active state: 3px left border `#3B82F6` + bg `#1A1A1A`), footer bottom (version in `#666666` 10px, "Checking for updates..." when applicable). NavItem component with hover bg `#1A1A1A`. Active item: `pl-[9px]` to compensate for 3px border.
>
> **Task 5: AppCard** (`frontend/src/components/AppCard.tsx`)
> `<button>` (not div) for accessibility. Flex column, items-center, p-4, rounded-lg, bg `#141414`, border `#2A2A2A`. Hover: `scale-[1.02]`, border `#3A3A3A`, 150ms ease-out. Selected: border `#3B82F6` 2px + subtle glow shadow. Contains: icon 64×64 in `#1A1A1A` container with `FallbackIcon` (colored circle, first letter, hue from appId hash), name (truncated, title attr tooltip), description (2-line clamp), StatusBadge. Badge: pill shape, 10px font, colors: not-installed=gray, installed=green, update-available=amber+pulse, installing=blue, broken=red. Use accent colors at `/10` opacity for badge backgrounds.
>
> **Task 6: Library** (`frontend/src/components/Library.tsx`)
> Flex row: card grid (flex-1, scroll) + detail panel (480px fixed, conditional). Grid: CSS Grid `repeat(auto-fill, minmax(220px, 1fr))`, gap 16px, padding 24px. Skeleton: 3 pulsing cards matching card dimensions. Click card: toggle selection (click selected = deselect).
>
> **Task 7: AppDetail** (`frontend/src/components/AppDetail.tsx`)
> 480px wide, h-full, bg `#1E1E1E`, border-l `#2A2A2A`. Slide-in animation: `@keyframes slideIn { from { translateX(100%); opacity:0 } to { translateX(0); opacity:1 } }`, 200ms ease-out. Escape key closes via useEffect keydown listener. Header: 96×96 icon + name + version + last launched date. Tags as pills. Long description. Install size. Action buttons per status — ALL DISABLED in L2:
> - not-installed: "Install" button (blue, full width)
> - installed: "Launch" (blue) + "Open Folder" (secondary) + "Uninstall" (red text)
> - update-available: "Update to v{x}" (amber) + "Launch" + folder/uninstall
> - broken: "Repair" (blue) + "Remove" (red)
> Close button: X SVG icon top-right.
>
> **Task 8: Toast** (`frontend/src/components/Toast.tsx`)
> Fixed bottom-right z-50. Imperative API: `showToast(type, message)` exported. Module-level ref to addToast function. Auto-dismiss 4s. Types: success (green), error (red), info (blue). Reuse slideIn animation. Max-width sm.
>
> **Task 9: App.tsx**
> Replace diagnostic shell. Flex h-screen: `<Sidebar />` + `<main>` (Library or Settings placeholder) + `<ToastContainer />`. `useEffect(() => initialize())` on mount. `select-none` on root, `overflow-hidden`.
>
> **Index.css additions:**
> Add `@keyframes slideIn` and `.animate-slideIn` class.
>
> **Acceptance criteria:**
> 1. Sidebar: 200px, bg #141414, border #2A2A2A, Library highlighted with blue accent bar
> 2. Library: Finance App card with fallback icon, name, description, "Available" badge
> 3. Card hover: scale 1.02, border lighten, 150ms transition
> 4. Click card → detail panel slides in 200ms from right, 480px wide, bg #1E1E1E
> 5. Detail: icon, name, tags, description, install size, disabled action buttons
> 6. Escape closes panel. X button closes panel. Click selected card deselects.
> 7. Manually editing config.json to add installed app → "Installed ✓" green badge, Launch/Uninstall buttons
> 8. Skeleton loading on startup (3 pulsing cards)
> 9. Settings placeholder. View switch clears selected app.
> 10. Toast works via showToast() imperative API, 4s auto-dismiss
> 11. Version in sidebar footer
> 12. Dark theme throughout, no white flashes, no layout jank
> 13. No TypeScript errors, no console errors
>
> **Technical constraints:**
> - Tailwind utility classes only — no CSS modules, no styled-components
> - Inline SVG icons — no icon library dependency
> - `<button>` for clickable cards (accessibility)
> - `line-clamp-2` for description truncation (Tailwind v3.3+ built-in)
> - Grid uses inline `style` for `gridTemplateColumns` (cleaner than Tailwind arbitrary values)
> - All state in Zustand `appStore` — no React Context, no prop drilling for global state
> - Store `initialize()` called once in App.tsx useEffect
> - Action buttons are DISABLED in L2 — wired in L4/L5
> - `select-none` on root div for native app feel
