import { create } from 'zustand';
import type {
  AppState, AppStatus, LauncherConfig, DownloadProgress, ReleaseInfo,
} from '@/types';

interface AppStoreState {
  apps: AppState[];
  selectedAppId: string | null;
  config: LauncherConfig | null;
  launcherVersion: string;
  launcherUpdateAvailable: { version: string; downloadUrl: string } | null;
  activeView: 'library' | 'settings';
  updateCheckInProgress: boolean;
  isFirstRun: boolean;
  initialized: boolean;

  initialize: () => Promise<void>;
  setSelectedApp: (appId: string | null) => void;
  setActiveView: (view: 'library' | 'settings') => void;
  updateAppStatus: (appId: string, status: AppStatus) => void;
  updateDownloadProgress: (progress: DownloadProgress) => void;
  updateAppRelease: (appId: string, release: ReleaseInfo) => void;
  setLauncherUpdate: (update: { version: string; downloadUrl: string } | null) => void;
  setUpdateCheckInProgress: (inProgress: boolean) => void;
  markFirstRunComplete: () => Promise<void>;
  refreshConfig: () => Promise<void>;
}

export const useAppStore = create<AppStoreState>((set, get) => ({
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

      const apps: AppState[] = registry.map((entry) => {
        const installed = config.installedApps[entry.id] || null;
        return {
          entry,
          installed,
          latestRelease: null,
          status: installed ? 'installed' as const : 'not-installed' as const,
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

      // Startup verification — detect broken installs
      for (const appState of apps) {
        if (appState.installed) {
          const valid = await window.electronAPI.verifyInstallation(appState.entry.id);
          if (!valid) {
            console.warn(`[store] Broken installation: ${appState.entry.id}`);
            setTimeout(() => get().updateAppStatus(appState.entry.id, 'broken'), 0);
          }
        }
      }

      // Subscribe to push events from main process
      window.electronAPI.onAppStatusChanged((data) => {
        if (data.release) {
          get().updateAppRelease(data.appId, data.release);
        }
        if (data.status === 'update-available') {
          const currentApp = get().apps.find(a => a.entry.id === data.appId);
          if (currentApp?.installed) {
            get().updateAppStatus(data.appId, 'update-available');
          }
        }
      });

      window.electronAPI.onLauncherUpdateAvailable((data) => {
        get().setLauncherUpdate({ version: data.latestVersion, downloadUrl: data.downloadUrl });
      });

      window.electronAPI.onDownloadProgress((progress) => {
        get().updateDownloadProgress(progress);
        if (progress.status === 'complete') {
          setTimeout(() => get().refreshConfig(), 500);
        }
      });

      // Renderer-side release check (redundancy for timing)
      set({ updateCheckInProgress: true });
      window.electronAPI.checkAllReleases().then((releaseMap) => {
        for (const [appId, release] of Object.entries(releaseMap)) {
          if (release) {
            get().updateAppRelease(appId, release);
          }
        }
        set({ updateCheckInProgress: false });
      }).catch(() => {
        set({ updateCheckInProgress: false });
      });
    } catch (err) {
      console.error('[store] Failed to initialize:', err);
      set({ initialized: true });
    }
  },

  setSelectedApp: (appId) => set({ selectedAppId: appId }),

  setActiveView: (view) => set({ activeView: view, selectedAppId: null }),

  updateAppStatus: (appId, status) => set((state) => ({
    apps: state.apps.map((app) =>
      app.entry.id === appId ? { ...app, status } : app
    ),
  })),

  updateDownloadProgress: (progress) => {
    set((state) => ({
      apps: state.apps.map((app) =>
        app.entry.id === progress.appId ? { ...app, downloadProgress: progress } : app
      ),
    }));
    if (['complete', 'failed', 'cancelled'].includes(progress.status)) {
      setTimeout(() => {
        set((s) => ({
          apps: s.apps.map((app) =>
            app.entry.id === progress.appId ? { ...app, downloadProgress: null } : app
          ),
        }));
      }, 2000);
    }
  },

  updateAppRelease: (appId, release) => set((state) => ({
    apps: state.apps.map((app) => {
      if (app.entry.id !== appId) return app;
      const hasUpdate = app.installed && release.version !== app.installed.version;
      return {
        ...app,
        latestRelease: release,
        status: hasUpdate ? 'update-available' as const : app.status,
      };
    }),
  })),

  setLauncherUpdate: (update) => set({ launcherUpdateAvailable: update }),

  setUpdateCheckInProgress: (inProgress) => set({ updateCheckInProgress: inProgress }),

  markFirstRunComplete: async () => {
    try {
      await window.electronAPI.setFirstRunComplete();
      set({ isFirstRun: false });
    } catch (err) {
      console.error('[store] Failed to mark first run complete:', err);
    }
  },

  refreshConfig: async () => {
    try {
      const config = await window.electronAPI.getConfig();
      set((state) => ({
        config,
        apps: state.apps.map((app) => {
          const installed = config.installedApps[app.entry.id] || null;
          const status = installed
            ? (app.status === 'update-available' ? 'update-available' : 'installed')
            : 'not-installed';
          return { ...app, installed, status: status as AppStatus };
        }),
      }));
    } catch (err) {
      console.error('[store] Failed to refresh config:', err);
    }
  },
}));
