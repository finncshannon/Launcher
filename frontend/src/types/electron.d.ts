export {};

declare global {
  interface Window {
    electronAPI: {
      getConfig: () => Promise<import('./index').LauncherConfig>;
      updateSettings: (settings: Partial<import('./index').LauncherSettings>) => Promise<import('./index').LauncherConfig>;
      setFirstRunComplete: () => Promise<void>;
      getRegistry: () => Promise<import('./index').AppEntry[]>;
      getVersion: () => Promise<string>;
      checkAllReleases: () => Promise<Record<string, import('./index').ReleaseInfo | null>>;
      checkOneRelease: (appId: string) => Promise<import('./index').ReleaseInfo | null>;
      checkLauncherUpdate: () => Promise<{ available: boolean; version?: string; downloadUrl?: string }>;
      onLauncherUpdateAvailable: (callback: (data: {
        currentVersion: string;
        latestVersion: string;
        downloadUrl: string;
      }) => void) => () => void;
      installApp: (options: import('./index').InstallOptions) => Promise<import('./index').InstallResult>;
      cancelInstall: (appId: string) => Promise<void>;
      uninstallApp: (appId: string) => Promise<{ success: boolean; error?: string }>;
      verifyInstallation: (appId: string) => Promise<boolean>;
      selectDirectory: (defaultPath: string) => Promise<string | null>;
      onDownloadProgress: (callback: (data: import('./index').DownloadProgress) => void) => () => void;
      launchApp: (appId: string) => Promise<{ success: boolean; error?: string }>;
      openFolder: (appId: string) => Promise<void>;
      openExternal: (url: string) => Promise<void>;
      onAppStatusChanged: (callback: (data: {
        appId: string;
        status?: string;
        release?: import('./index').ReleaseInfo;
      }) => void) => () => void;
    };
  }
}
