import { formatBytes, formatSpeed, formatEta } from '@/lib/utils';
import type { DownloadProgress } from '@/types';

/* ── Compact inline progress (used in action buttons area) ── */

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

      {status === 'downloading' && totalBytes > 0 && (
        <div className="flex justify-between text-[10px] text-[#A0A0A0] tabular-nums mb-2">
          <span>{formatBytes(bytesDownloaded)} / {formatBytes(totalBytes)}</span>
          <span>{formatSpeed(speedBps)} &mdash; {formatEta(etaSeconds)}</span>
        </div>
      )}

      {status === 'failed' && error && (
        <p className="text-[#EF4444] text-xs mt-1">{error}</p>
      )}

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

/* ── Full-panel hero progress view (shown in AppDetail during install) ── */

const RING_SIZE = 140;
const STROKE = 8;
const RADIUS = (RING_SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface FullInstallViewProps {
  appName: string;
  progress: DownloadProgress | null;
  onCancel: () => void;
}

export function FullInstallView({ appName, progress, onCancel }: FullInstallViewProps) {
  const status = progress?.status ?? 'downloading';
  const bytesDownloaded = progress?.bytesDownloaded ?? 0;
  const totalBytes = progress?.totalBytes ?? 0;
  const speedBps = progress?.speedBps ?? 0;
  const etaSeconds = progress?.etaSeconds ?? 0;
  const error = progress?.error;
  const pct = totalBytes > 0 ? (bytesDownloaded / totalBytes) * 100 : 0;
  const pctDisplay = Math.round(pct);
  const isDownloading = status === 'downloading';
  const isInstalling = status === 'installing';
  const isComplete = status === 'complete';
  const isFailed = status === 'failed';
  const isCancelled = status === 'cancelled';
  const isActive = isDownloading || isInstalling;

  const dashOffset = CIRCUMFERENCE - (CIRCUMFERENCE * (isInstalling ? 100 : pct)) / 100;

  return (
    <div className="flex flex-col items-center justify-center py-8 gap-6">
      {/* Progress ring */}
      <div className="relative">
        <svg width={RING_SIZE} height={RING_SIZE} className="-rotate-90">
          {/* Track */}
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="#1A1A1A"
            strokeWidth={STROKE}
          />
          {/* Progress arc */}
          {isActive && (
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke={isInstalling ? '#6366F1' : '#3B82F6'}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              className={`transition-[stroke-dashoffset] duration-300 ease-linear ${isInstalling ? 'animate-pulse' : ''}`}
            />
          )}
          {/* Complete ring */}
          {isComplete && (
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke="#22C55E"
              strokeWidth={STROKE}
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={0}
            />
          )}
          {/* Failed ring */}
          {isFailed && (
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke="#EF4444"
              strokeWidth={STROKE}
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
            />
          )}
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {isDownloading && totalBytes > 0 && (
            <span className="text-3xl font-bold text-[#F5F5F5] tabular-nums">{pctDisplay}%</span>
          )}
          {isDownloading && totalBytes === 0 && (
            <span className="inline-block w-5 h-5 border-2 border-[#2A2A2A] border-t-[#3B82F6] rounded-full animate-spin" />
          )}
          {isInstalling && (
            <span className="inline-block w-5 h-5 border-2 border-[#2A2A2A] border-t-[#6366F1] rounded-full animate-spin" />
          )}
          {isComplete && (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 13l4 4L19 7" />
            </svg>
          )}
          {isFailed && (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          )}
          {isCancelled && (
            <span className="text-sm text-[#A0A0A0]">--</span>
          )}
        </div>
      </div>

      {/* Status label */}
      <div className="text-center">
        <p className="text-lg font-semibold text-[#F5F5F5] mb-1">
          {isDownloading && `Downloading ${appName}`}
          {isInstalling && `Installing ${appName}`}
          {isComplete && 'Installation Complete'}
          {isFailed && 'Installation Failed'}
          {isCancelled && 'Cancelled'}
        </p>
        <p className="text-xs text-[#666666]">
          {isDownloading && 'Please wait while the app downloads...'}
          {isInstalling && 'Running installer — this may take a few minutes...'}
          {isComplete && 'You can now launch the app.'}
          {isFailed && (error || 'Something went wrong.')}
          {isCancelled && 'The download was cancelled.'}
        </p>
      </div>

      {/* Stats grid */}
      {isDownloading && totalBytes > 0 && (
        <div className="grid grid-cols-3 gap-4 w-full max-w-[340px]">
          <div className="bg-[#141414] rounded-lg p-3 text-center border border-[#2A2A2A]">
            <p className="text-[10px] text-[#666666] uppercase tracking-wider mb-1">Downloaded</p>
            <p className="text-sm font-semibold text-[#F5F5F5] tabular-nums">{formatBytes(bytesDownloaded)}</p>
            <p className="text-[10px] text-[#666666] tabular-nums">of {formatBytes(totalBytes)}</p>
          </div>
          <div className="bg-[#141414] rounded-lg p-3 text-center border border-[#2A2A2A]">
            <p className="text-[10px] text-[#666666] uppercase tracking-wider mb-1">Speed</p>
            <p className="text-sm font-semibold text-[#F5F5F5] tabular-nums">{formatSpeed(speedBps)}</p>
          </div>
          <div className="bg-[#141414] rounded-lg p-3 text-center border border-[#2A2A2A]">
            <p className="text-[10px] text-[#666666] uppercase tracking-wider mb-1">ETA</p>
            <p className="text-sm font-semibold text-[#F5F5F5] tabular-nums">{formatEta(etaSeconds)}</p>
          </div>
        </div>
      )}

      {/* Progress bar (full width) */}
      {isActive && (
        <div className="w-full max-w-[340px]">
          <div className="h-1.5 rounded-full bg-[#1A1A1A] overflow-hidden">
            {totalBytes === 0 && isDownloading ? (
              <div className="h-full bg-[#3B82F6] opacity-50 animate-pulse rounded-full w-full" />
            ) : (
              <div
                className={`h-full rounded-full transition-[width] duration-300 ease-linear ${isInstalling ? 'bg-[#6366F1] animate-pulse' : 'bg-[#3B82F6]'}`}
                style={{ width: `${isInstalling ? 100 : pct}%` }}
              />
            )}
          </div>
        </div>
      )}

      {/* Cancel button */}
      {isActive && (
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg bg-[#1A1A1A] border border-[#2A2A2A] text-sm text-[#EF4444] hover:bg-[#2A2A2A] hover:text-[#F87171] transition-colors"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
