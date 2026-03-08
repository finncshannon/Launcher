import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { LauncherConfig, LauncherSettings, DEFAULT_CONFIG } from './types';

export function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'config.json');
}

function getDefaultInstallDir(): string {
  return path.join(
    process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local'),
    'FulcrumApps'
  );
}

function migrateConfig(raw: any): LauncherConfig {
  if (!raw.configVersion) raw.configVersion = 1;
  if (!raw.installedApps) raw.installedApps = {};
  if (!raw.settings) raw.settings = { ...DEFAULT_CONFIG.settings };
  if (!raw.settings.defaultInstallDir) {
    raw.settings.defaultInstallDir = getDefaultInstallDir();
  }
  if (raw.settings.checkUpdatesOnLaunch === undefined) raw.settings.checkUpdatesOnLaunch = true;
  if (raw.settings.minimizeToTrayOnAppLaunch === undefined) raw.settings.minimizeToTrayOnAppLaunch = false;
  if (raw.settings.minimizeToTrayOnClose === undefined) raw.settings.minimizeToTrayOnClose = false;
  if (raw.firstRunComplete === undefined) raw.firstRunComplete = false;
  return raw as LauncherConfig;
}

export function writeConfig(config: LauncherConfig): void {
  const configPath = getConfigPath();
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = configPath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2), 'utf-8');
  fs.renameSync(tmpPath, configPath);
  console.log('[config] Config written successfully');
}

export function readConfig(): LauncherConfig {
  const configPath = getConfigPath();

  if (!fs.existsSync(configPath)) {
    console.log('[config] No config file found, creating defaults');
    const config = { ...DEFAULT_CONFIG, settings: { ...DEFAULT_CONFIG.settings } };
    config.settings.defaultInstallDir = getDefaultInstallDir();
    writeConfig(config);
    return config;
  }

  try {
    const data = fs.readFileSync(configPath, 'utf-8');
    const raw = JSON.parse(data);
    const config = migrateConfig(raw);
    console.log('[config] Config loaded successfully');
    return config;
  } catch (err) {
    console.error('[config] Failed to parse config, backing up and resetting:', err);

    // Backup corrupt file
    const backupPath = configPath + '.backup';
    try {
      fs.copyFileSync(configPath, backupPath);
      console.log(`[config] Corrupt config backed up to ${backupPath}`);
    } catch {
      console.error('[config] Failed to create backup');
    }

    // Reset to defaults
    const config = { ...DEFAULT_CONFIG, settings: { ...DEFAULT_CONFIG.settings } };
    config.settings.defaultInstallDir = getDefaultInstallDir();
    writeConfig(config);
    return config;
  }
}

export function updateSettings(partial: Partial<LauncherSettings>): LauncherConfig {
  const config = readConfig();
  config.settings = { ...config.settings, ...partial };
  writeConfig(config);
  console.log('[config] Settings updated');
  return config;
}
