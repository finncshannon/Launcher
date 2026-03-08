import { execFile } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { AppEntry, InstallResult } from './types';

export function runInstaller(
  installerPath: string,
  installDir: string,
): Promise<{ exitCode: number }> {
  return new Promise((resolve, reject) => {
    console.log(`[installer] Running: ${installerPath} /S /D=${installDir}`);

    execFile(
      installerPath,
      ['/S', `/D=${installDir}`],
      { windowsHide: true, timeout: 120000 },
      (error, _stdout, stderr) => {
        if (error) {
          if ((error as any).killed) {
            reject(new Error('Installer timed out after 2 minutes'));
            return;
          }
          // Non-zero exit code — user may have declined UAC
          const exitCode = (error as any).code ?? 1;
          console.warn(`[installer] Exited with code ${exitCode}: ${stderr || error.message}`);
          resolve({ exitCode: typeof exitCode === 'number' ? exitCode : 1 });
          return;
        }
        console.log('[installer] Completed successfully');
        resolve({ exitCode: 0 });
      },
    );
  });
}

export async function installApp(
  entry: AppEntry,
  installerPath: string,
  installDir: string,
): Promise<InstallResult> {
  const appInstallDir = path.join(installDir, entry.id);

  // Create directory if needed
  if (!fs.existsSync(appInstallDir)) {
    fs.mkdirSync(appInstallDir, { recursive: true });
  }

  try {
    const result = await runInstaller(installerPath, appInstallDir);

    if (result.exitCode !== 0) {
      return {
        success: false,
        appId: entry.id,
        version: '',
        installPath: appInstallDir,
        executablePath: '',
        error: `Installer exited with code ${result.exitCode}. The user may have declined the UAC prompt.`,
      };
    }

    // Verify the executable exists after install
    const executablePath = path.join(appInstallDir, entry.executableName);
    if (!fs.existsSync(executablePath)) {
      return {
        success: false,
        appId: entry.id,
        version: '',
        installPath: appInstallDir,
        executablePath,
        error: `Installation completed but executable not found: ${entry.executableName}`,
      };
    }

    console.log(`[installer] Verified executable: ${executablePath}`);
    return {
      success: true,
      appId: entry.id,
      version: '',
      installPath: appInstallDir,
      executablePath,
    };
  } finally {
    // Clean up downloaded installer
    try {
      if (fs.existsSync(installerPath)) {
        fs.unlinkSync(installerPath);
        console.log('[installer] Cleaned up installer file');
      }
    } catch {
      console.warn('[installer] Failed to clean up installer file');
    }
  }
}

export function uninstallApp(
  appId: string,
  installPath: string,
): { success: boolean; error?: string } {
  try {
    console.log(`[installer] Uninstalling ${appId} from ${installPath}`);
    fs.rmSync(installPath, { recursive: true, force: true });
    console.log(`[installer] Uninstall complete for ${appId}`);
    return { success: true };
  } catch (err: any) {
    const message = err.code === 'EBUSY' || err.code === 'EPERM'
      ? `Could not delete files — the app may be running. Close it and try again.`
      : `Uninstall failed: ${err.message}`;
    console.error(`[installer] Uninstall failed for ${appId}:`, err.message);
    return { success: false, error: message };
  }
}

export function verifyInstallation(executablePath: string): boolean {
  return fs.existsSync(executablePath);
}
