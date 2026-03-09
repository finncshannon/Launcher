import { app } from 'electron';
import { AppEntry, ReleaseInfo, LAUNCHER_GITHUB } from './types';
import { APP_REGISTRY } from './registry';
import { readConfig } from './config';
import { fetchLatestRelease, isNewerVersion } from './github';

export interface UpdateCheckResult {
  appId: string;
  currentVersion: string | null;
  latestVersion: string;
  updateAvailable: boolean;
  release: ReleaseInfo;
}

export async function checkForAppUpdates(): Promise<UpdateCheckResult[]> {
  const config = readConfig();
  const results: UpdateCheckResult[] = [];

  for (const entry of APP_REGISTRY) {
    const release = await fetchLatestRelease(entry);
    if (!release) continue;

    const installed = config.installedApps[entry.id];
    const currentVersion = installed?.version || null;
    const updateAvailable = !!installed && isNewerVersion(installed.version, release.version);

    results.push({
      appId: entry.id,
      currentVersion,
      latestVersion: release.version,
      updateAvailable,
      release,
    });
  }

  return results;
}

export async function checkForLauncherUpdate(): Promise<{ available: boolean; version?: string; downloadUrl?: string }> {
  const tempEntry: AppEntry = {
    id: 'fulcrum',
    name: 'Fulcrum',
    description: '',
    longDescription: '',
    github: LAUNCHER_GITHUB,
    icon: '',
    installSize: '',
    tags: [],
    executableName: '',
  };

  const release = await fetchLatestRelease(tempEntry);
  if (!release) return { available: false };

  const currentVersion = app.getVersion();
  const available = isNewerVersion(currentVersion, release.version);

  return {
    available,
    version: release.version,
    downloadUrl: `https://github.com/${LAUNCHER_GITHUB.owner}/${LAUNCHER_GITHUB.repo}/releases/latest`,
  };
}
