/** Static app definition — hardcoded in registry.ts */
export interface AppEntry {
  id: string;
  name: string;
  description: string;
  longDescription: string;
  github: {
    owner: string;
    repo: string;
  };
  icon: string;
  installSize: string;
  tags: string[];
  executableName: string;
  minimumLauncherVersion?: string;
}

/** Per-app install record stored in config.json */
export interface InstalledApp {
  version: string;
  installPath: string;
  installedAt: string;
  lastLaunched: string | null;
  executablePath: string;
}

/** User-facing settings */
export interface LauncherSettings {
  defaultInstallDir: string;
  checkUpdatesOnLaunch: boolean;
  minimizeToTrayOnAppLaunch: boolean;
  minimizeToTrayOnClose: boolean;
}

/** Root config object persisted to disk */
export interface LauncherConfig {
  configVersion: number;
  installedApps: Record<string, InstalledApp>;
  settings: LauncherSettings;
  firstRunComplete: boolean;
}

/** Parsed from GitHub Releases API response */
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

/** Cache entry for rate limiting */
export interface ReleaseCacheEntry {
  release: ReleaseInfo;
  fetchedAt: number;
}

/** Launcher's own GitHub repo */
export const LAUNCHER_GITHUB = {
  owner: 'finncshannon',
  repo: 'Launcher',
};

export interface DownloadProgress {
  appId: string;
  status: 'downloading' | 'installing' | 'complete' | 'failed' | 'cancelled';
  bytesDownloaded: number;
  totalBytes: number;
  speedBps: number;
  etaSeconds: number;
  error?: string;
}

export interface InstallResult {
  success: boolean;
  appId: string;
  version: string;
  installPath: string;
  executablePath: string;
  error?: string;
}

export interface InstallOptions {
  appId: string;
  installDir: string;
}

/** Default config — used on first launch and corruption recovery */
export const DEFAULT_CONFIG: LauncherConfig = {
  configVersion: 1,
  installedApps: {},
  settings: {
    defaultInstallDir: '',
    checkUpdatesOnLaunch: true,
    minimizeToTrayOnAppLaunch: false,
    minimizeToTrayOnClose: false,
  },
  firstRunComplete: false,
};
