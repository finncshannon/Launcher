import { formatBytes, formatSpeed, formatEta } from '@/lib/utils';
import type { DownloadProgress } from '@/types';

function Spinner() {
  return (
    <span className="inline-block w-3 h-3 border-2 border-[#2A2A2A] border-t-[#6366F1] rounded-full animate-spin" />
  );
}

interface InstallProgressProps {
  progress: DownloadProgress;
  onCancel: () => void;
}

export default function InstallProgress({ progress, onCancel }: InstallProgressProps) {
  const { status, bytesDownloaded, totalBytes, speedBps, etaSeconds, error } = progress;
  const pct = totalBytes > 0 ? Math.round((bytesDownloaded / totalBytes) * 100) : 0;
  const indeterminate = totalBytes === 0 && status === 'downloading';

  return (
    <div className="w-full">
      {/* Status + percentage */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm text-[#F5F5F5]">
          {status === 'downloading' && 'Downloading...'}
          {status === 'installing' && (
            <><Spinner /> Installing...</>
          )}
          {status === 'complete' && (
            <span className="text-[#22C55E]">&#x2713; Installed</span>
          )}
          {status === 'failed' && (
            <span className="text-[#EF4444]">Installation failed</span>
          )}
          {status === 'cancelled' && (
            <span className="text-[#A0A0A0]">Cancelled</span>
          )}
        </div>
        {status === 'downloading' && totalBytes > 0 && (
          <span className="text-2xl font-bold text-[#3B82F6] tabular-nums">{pct}%</span>
        )}
      </div>

      {/* Progress bar */}
      {(status === 'downloading' || status === 'installing') && (
        <div className="h-2 rounded-full bg-[#1A1A1A] mb-2 overflow-hidden">
          {indeterminate ? (
            <div className="h-full bg-[#6366F1] opacity-50 animate-pulse rounded-full w-full" />
          ) : (
            <div
              className="h-full bg-[#6366F1] rounded-full transition-[width] duration-[250ms] ease-linear"
              style={{ width: `${status === 'installing' ? 100 : pct}%` }}
            />
          )}
        </div>
      )}

      {/* Stats */}
      {status === 'downloading' && totalBytes > 0 && (
        <div className="flex justify-between text-[10px] text-[#A0A0A0] tabular-nums mb-2">
          <span>{formatBytes(bytesDownloaded)} / {formatBytes(totalBytes)}</span>
          <span>{formatSpeed(speedBps)} &mdash; {formatEta(etaSeconds)}</span>
        </div>
      )}

      {/* Error */}
      {status === 'failed' && error && (
        <p className="text-[#EF4444] text-xs mt-1">{error}</p>
      )}

      {/* Cancel */}
      {(status === 'downloading' || status === 'installing') && (
        <button
          onClick={onCancel}
          className="text-[#EF4444] text-xs hover:text-[#F87171] transition-colors mt-1"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
