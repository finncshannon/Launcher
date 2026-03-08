import { net, app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { DownloadProgress } from './types';

const activeDownloads = new Map<string, AbortController>();

function getTempDir(): string {
  const dir = path.join(app.getPath('temp'), 'fulcrum');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export async function downloadAsset(
  appId: string,
  url: string,
  fileName: string,
  onProgress: (progress: DownloadProgress) => void,
): Promise<string> {
  const controller = new AbortController();
  activeDownloads.set(appId, controller);

  const tempDir = getTempDir();
  const tmpPath = path.join(tempDir, `${appId}-${fileName}.tmp`);
  const finalPath = path.join(tempDir, `${appId}-${fileName}`);

  // Clean previous files for this appId
  try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  try { if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath); } catch { /* ignore */ }

  let fileStream: fs.WriteStream | null = null;

  try {
    console.log(`[download] Starting download for ${appId}: ${fileName}`);

    const response = await net.fetch(url, {
      headers: { 'User-Agent': `Fulcrum/${app.getVersion()}` },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentLength = response.headers.get('Content-Length');
    const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

    if (!response.body) {
      throw new Error('Response body is null');
    }

    fileStream = fs.createWriteStream(tmpPath);
    const reader = response.body.getReader();

    let bytesDownloaded = 0;
    const samples: { bytes: number; time: number }[] = [];
    let lastEmitTime = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = Buffer.from(value);
      fileStream.write(chunk);
      bytesDownloaded += chunk.length;

      const now = Date.now();
      samples.push({ bytes: chunk.length, time: now });

      // Rolling 3-second window
      const cutoff = now - 3000;
      while (samples.length > 0 && samples[0].time < cutoff) {
        samples.shift();
      }

      // 250ms throttle
      if (now - lastEmitTime >= 250) {
        lastEmitTime = now;

        let speedBps = 0;
        if (samples.length > 1) {
          const totalSampleBytes = samples.reduce((sum, s) => sum + s.bytes, 0);
          const timeSpan = (samples[samples.length - 1].time - samples[0].time) / 1000;
          if (timeSpan > 0) speedBps = totalSampleBytes / timeSpan;
        }

        const etaSeconds = speedBps > 0 && totalBytes > 0
          ? (totalBytes - bytesDownloaded) / speedBps
          : 0;

        onProgress({
          appId,
          status: 'downloading',
          bytesDownloaded,
          totalBytes,
          speedBps,
          etaSeconds,
        });
      }
    }

    // Wait for stream to finish
    await new Promise<void>((resolve, reject) => {
      fileStream!.end(() => {
        fileStream = null;
        resolve();
      });
      fileStream!.on('error', reject);
    });

    // Rename .tmp to final
    fs.renameSync(tmpPath, finalPath);
    console.log(`[download] Complete for ${appId}: ${bytesDownloaded} bytes`);
    return finalPath;
  } catch (err: any) {
    // Close stream if open
    if (fileStream) {
      try { fileStream.close(); } catch { /* ignore */ }
    }

    // Clean up .tmp
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch { /* ignore */ }

    if (err.name === 'AbortError' || err.message === 'Cancelled') {
      console.log(`[download] Cancelled for ${appId}`);
      throw new Error('Cancelled');
    }

    console.error(`[download] Failed for ${appId}:`, err.message);
    throw err;
  } finally {
    activeDownloads.delete(appId);
  }
}

export function cancelDownload(appId: string): void {
  const controller = activeDownloads.get(appId);
  if (controller) {
    controller.abort();
    console.log(`[download] Cancel requested for ${appId}`);
  }
}

export function cleanupStaleDownloads(): void {
  const tempDir = path.join(app.getPath('temp'), 'fulcrum');
  if (!fs.existsSync(tempDir)) return;

  const oneHourAgo = Date.now() - 60 * 60 * 1000;

  try {
    const files = fs.readdirSync(tempDir);
    let cleaned = 0;
    for (const file of files) {
      if (file.endsWith('.tmp')) {
        const filePath = path.join(tempDir, file);
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs < oneHourAgo) {
          fs.unlinkSync(filePath);
          cleaned++;
        }
      }
    }
    if (cleaned > 0) {
      console.log(`[download] Cleaned ${cleaned} stale temp file(s)`);
    }
  } catch (err: any) {
    console.warn('[download] Cleanup failed:', err.message);
  }
}
