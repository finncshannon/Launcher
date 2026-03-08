import { shell } from 'electron';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { readConfig, writeConfig } from './config';

export function launchApp(appId: string): { success: boolean; error?: string } {
  const config = readConfig();
  const installed = config.installedApps[appId];

  if (!installed) {
    return { success: false, error: 'App is not installed' };
  }

  if (!fs.existsSync(installed.executablePath)) {
    return {
      success: false,
      error: `Executable not found at ${installed.executablePath}. Try repairing the installation.`,
    };
  }

  try {
    const child = spawn(installed.executablePath, [], {
      detached: true,
      stdio: 'ignore',
      cwd: installed.installPath,
    });

    child.unref();

    // Update last launched timestamp
    config.installedApps[appId].lastLaunched = new Date().toISOString();
    writeConfig(config);

    console.log(`[launcher] Launched ${appId} (PID: ${child.pid})`);
    return { success: true };
  } catch (err: any) {
    console.error(`[launcher] Failed to launch ${appId}:`, err.message);
    return { success: false, error: `Failed to launch: ${err.message}` };
  }
}

export function openInstallFolder(appId: string): void {
  const config = readConfig();
  const installed = config.installedApps[appId];

  if (!installed) {
    console.warn(`[launcher] Cannot open folder — ${appId} is not installed`);
    return;
  }

  if (fs.existsSync(installed.installPath)) {
    shell.openPath(installed.installPath);
    console.log(`[launcher] Opened folder: ${installed.installPath}`);
  } else {
    // Fallback to parent directory
    const parentDir = path.dirname(installed.installPath);
    if (fs.existsSync(parentDir)) {
      shell.openPath(parentDir);
      console.log(`[launcher] Install path gone, opened parent: ${parentDir}`);
    } else {
      console.warn(`[launcher] Neither install path nor parent exists for ${appId}`);
    }
  }
}
