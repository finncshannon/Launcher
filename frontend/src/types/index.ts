/** Static app definition — mirrors electron/types.ts */
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

/** Per-app install record */
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

/** Root config object */
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

/** App status */
export type AppStatus =
  | 'not-installed'
  | 'installing'
  | 'installed'
  | 'update-available'
  | 'updating'
  | 'launching'
  | 'broken';

export interface InstallOptions {
  appId: string;
  installDir: string;
}

export interface InstallResult {
  success: boolean;
  appId: string;
  version: string;
  installPath: string;
  executablePath: string;
  error?: string;
}

/** Combined runtime state per app */
export interface AppState {
  entry: AppEntry;
  installed: InstalledApp | null;
  latestRelease: ReleaseInfo | null;
  status: AppStatus;
  downloadProgress: DownloadProgress | null;
}
