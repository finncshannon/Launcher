import { execFile, exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { AppEntry, InstallResult } from './types';

/**
 * Kill any processes running from the given directory.
 * This handles cases where an app (e.g. Finance App) leaves behind
 * background processes (Python backend, Electron helpers) that lock files.
 */
function killProcessesInDirectory(dirPath: string): Promise<void> {
  return new Promise((resolve) => {
    const normalizedPath = dirPath.replace(/\//g, '\\').toLowerCase();
    // Use WMIC to find processes with executables inside the install directory
    exec(
      `wmic process where "ExecutablePath like '${normalizedPath.replace(/\\/g, '\\\\\\\\')}%'" get ProcessId /format:list`,
      { windowsHide: true },
      (error, stdout) => {
        if (error || !stdout) {
          resolve();
          return;
        }
        const pids = stdout.match(/ProcessId=(\d+)/g)?.map(m => m.split('=')[1]) || [];
        if (pids.length === 0) {
          console.log('[installer] No locked processes found');
          resolve();
          return;
        }
        console.log(`[installer] Killing ${pids.length} process(es) from install directory: ${pids.join(', ')}`);
        const killCommands = pids.map(pid => `taskkill /F /PID ${pid}`);
        exec(killCommands.join(' & '), { windowsHide: true }, () => {
          // Wait a moment for processes to fully terminate
          setTimeout(resolve, 1000);
        });
      },
    );
  });
}

export function runInstaller(
  installerPath: string,
  installDir: string,
): Promise<{ exitCode: number }> {
  return new Promise((resolve, reject) => {
    console.log(`[installer] Running: ${installerPath} /S /D=${installDir}`);

    execFile(
      installerPath,
      ['/S', `/D=${installDir}`],
      { windowsHide: true, timeout: 600000 },
      (error, _stdout, stderr) => {
        if (error) {
          if ((error as any).killed) {
            reject(new Error('Installer timed out after 10 minutes'));
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

/**
 * Recursively delete a directory, handling Windows file locks by
 * renaming locked files to .tmp before retrying deletion.
 */
async function forceRemoveDir(dirPath: string): Promise<void> {
  if (!fs.existsSync(dirPath)) return;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await forceRemoveDir(fullPath);
    } else {
      try {
        fs.unlinkSync(fullPath);
      } catch {
        // File locked — rename it so the directory can be cleaned up
        const tmpName = fullPath + '.deleting_' + Date.now();
        try {
          fs.renameSync(fullPath, tmpName);
          fs.unlinkSync(tmpName);
        } catch {
          // Still locked — schedule for deletion on reboot via cmd
          console.warn(`[installer] Could not delete ${entry.name}, marking for cleanup`);
        }
      }
    }
  }
  try {
    fs.rmdirSync(dirPath);
  } catch {
    // Ignore — may still have locked remnants
  }
}

export async function uninstallApp(
  appId: string,
  installPath: string,
): Promise<{ success: boolean; error?: string }> {
  const maxAttempts = 3;

  // Kill any processes running from the install directory before attempting deletion
  await killProcessesInDirectory(installPath);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`[installer] Uninstalling ${appId} from ${installPath} (attempt ${attempt})`);

      // First try the simple approach
      fs.rmSync(installPath, { recursive: true, force: true });
      console.log(`[installer] Uninstall complete for ${appId}`);
      return { success: true };
    } catch (err: any) {
      const retryable = err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'ENOTEMPTY';

      if (retryable && attempt === 2) {
        // On second attempt, use force-remove which handles locked files
        console.warn(`[installer] Using force-remove on attempt ${attempt}`);
        await forceRemoveDir(installPath);
        if (!fs.existsSync(installPath)) {
          console.log(`[installer] Uninstall complete for ${appId} (force-remove)`);
          return { success: true };
        }
      }

      if (retryable && attempt < maxAttempts) {
        console.warn(`[installer] ${err.code}, retrying in 3s... (attempt ${attempt})`);
        await killProcessesInDirectory(installPath);
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }

      // Final fallback — try rd /s /q which sometimes handles locks better
      if (retryable) {
        try {
          console.log(`[installer] Fallback: using rd /s /q`);
          await new Promise<void>((resolve, reject) => {
            exec(`rd /s /q "${installPath}"`, { windowsHide: true }, (error) => {
              if (error) reject(error);
              else resolve();
            });
          });
          if (!fs.existsSync(installPath)) {
            console.log(`[installer] Uninstall complete for ${appId} (rd fallback)`);
            return { success: true };
          }
        } catch {
          // rd also failed
        }
      }

      const message = retryable
        ? `Could not delete files — Windows is locking them (likely antivirus scanning). Wait a moment and try again.`
        : `Uninstall failed: ${err.message}`;
      console.error(`[installer] Uninstall failed for ${appId}:`, err.message);
      return { success: false, error: message };
    }
  }

  return { success: false, error: 'Uninstall failed after multiple attempts' };
}

export function verifyInstallation(executablePath: string): boolean {
  return fs.existsSync(executablePath);
}
