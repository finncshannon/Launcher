import { useAppStore } from '@/stores/appStore';
import { formatBytes, formatSpeed, formatEta } from '@/lib/utils';
import FallbackIcon from './FallbackIcon';

const RING_SIZE = 44;
const STROKE = 4;
const RADIUS = (RING_SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function Downloads() {
  const { apps } = useAppStore();

  const activeDownloads = apps.filter(
    (a) => a.status === 'installing' || a.status === 'updating'
  );
  const recentCompleted = apps.filter(
    (a) => a.downloadProgress && (a.downloadProgress.status === 'complete' || a.downloadProgress.status === 'failed' || a.downloadProgress.status === 'cancelled')
  );

  const hasAny = activeDownloads.length > 0 || recentCompleted.length > 0;

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-[600px] mx-auto">
        <h1 className="text-2xl font-bold text-[#F5F5F5] mb-8">Downloads</h1>

        {!hasAny && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#2A2A2A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-4">
              <path d="M12 3v12M12 15l-4-4M12 15l4-4" />
              <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
            </svg>
            <p className="text-sm text-[#666666]">No active downloads</p>
            <p className="text-xs text-[#444444] mt-1">Install an app from the Library to see progress here</p>
          </div>
        )}

        {/* Active downloads */}
        {activeDownloads.length > 0 && (
          <>
            <h2 className="text-[#A0A0A0] text-xs font-semibold uppercase tracking-wider mb-4">Active</h2>
            <div className="flex flex-col gap-3 mb-8">
              {activeDownloads.map((app) => {
                const p = app.downloadProgress;
                const bytesDown = p?.bytesDownloaded ?? 0;
                const totalB = p?.totalBytes ?? 0;
                const pct = totalB > 0 ? (bytesDown / totalB) * 100 : 0;
                const pctDisplay = Math.round(pct);
                const progressStatus = p?.status ?? 'downloading';
                const isInstalling = progressStatus === 'installing';
                const dashOffset = CIRCUMFERENCE - (CIRCUMFERENCE * (isInstalling ? 100 : pct)) / 100;

                return (
                  <div
                    key={app.entry.id}
                    className="bg-[#141414] border border-[#2A2A2A] rounded-lg p-4"
                  >
                    <div className="flex items-center gap-4 mb-4">
                      {/* Mini ring */}
                      <div className="relative shrink-0">
                        <svg width={RING_SIZE} height={RING_SIZE} className="-rotate-90">
                          <circle cx={RING_SIZE/2} cy={RING_SIZE/2} r={RADIUS} fill="none" stroke="#1A1A1A" strokeWidth={STROKE} />
                          <circle
                            cx={RING_SIZE/2} cy={RING_SIZE/2} r={RADIUS} fill="none"
                            stroke={isInstalling ? '#6366F1' : '#3B82F6'}
                            strokeWidth={STROKE} strokeLinecap="round"
                            strokeDasharray={CIRCUMFERENCE} strokeDashoffset={dashOffset}
                            className={`transition-[stroke-dashoffset] duration-300 ease-linear ${isInstalling ? 'animate-pulse' : ''}`}
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-7 h-7 rounded overflow-hidden">
                            <FallbackIcon name={app.entry.name} appId={app.entry.id} size="sm" />
                          </div>
                        </div>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-semibold text-[#F5F5F5] truncate">{app.entry.name}</p>
                          {progressStatus === 'downloading' && totalB > 0 && (
                            <span className="text-lg font-bold text-[#3B82F6] tabular-nums ml-2">{pctDisplay}%</span>
                          )}
                          {isInstalling && (
                            <span className="text-xs text-[#6366F1] font-medium ml-2">Installing...</span>
                          )}
                        </div>
                        <p className="text-xs text-[#666666]">
                          {progressStatus === 'downloading' ? 'Downloading' : 'Running installer'}
                        </p>
                      </div>
                    </div>

                    {/* Full-width progress bar */}
                    <div className="h-1.5 rounded-full bg-[#1A1A1A] mb-3 overflow-hidden">
                      {totalB === 0 && progressStatus === 'downloading' ? (
                        <div className="h-full bg-[#3B82F6] opacity-50 animate-pulse rounded-full w-full" />
                      ) : (
                        <div
                          className={`h-full rounded-full transition-[width] duration-300 ease-linear ${isInstalling ? 'bg-[#6366F1] animate-pulse' : 'bg-[#3B82F6]'}`}
                          style={{ width: `${isInstalling ? 100 : pct}%` }}
                        />
                      )}
                    </div>

                    {/* Stats row */}
                    {progressStatus === 'downloading' && totalB > 0 && p && (
                      <div className="flex justify-between items-center">
                        <div className="flex gap-4 text-[10px] text-[#A0A0A0] tabular-nums">
                          <span>{formatBytes(bytesDown)} / {formatBytes(totalB)}</span>
                          <span>{formatSpeed(p.speedBps)}</span>
                          <span>{formatEta(p.etaSeconds)}</span>
                        </div>
                        <button
                          onClick={() => window.electronAPI.cancelInstall(app.entry.id)}
                          className="text-[10px] text-[#EF4444] hover:text-[#F87171] transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    )}

                    {isInstalling && (
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-[#A0A0A0]">This may take a few minutes...</span>
                        <button
                          onClick={() => window.electronAPI.cancelInstall(app.entry.id)}
                          className="text-[10px] text-[#EF4444] hover:text-[#F87171] transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Recent */}
        {recentCompleted.length > 0 && (
          <>
            <h2 className="text-[#A0A0A0] text-xs font-semibold uppercase tracking-wider mb-4">Recent</h2>
            <div className="flex flex-col gap-2">
              {recentCompleted.map((app) => {
                const p = app.downloadProgress!;
                return (
                  <div
                    key={app.entry.id}
                    className="flex items-center gap-3 bg-[#141414] border border-[#2A2A2A] rounded-lg px-4 py-3"
                  >
                    <div className="w-8 h-8 rounded overflow-hidden shrink-0">
                      <FallbackIcon name={app.entry.name} appId={app.entry.id} size="sm" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#F5F5F5] truncate">{app.entry.name}</p>
                    </div>
                    {p.status === 'complete' && (
                      <span className="text-xs text-[#22C55E] font-medium">Installed</span>
                    )}
                    {p.status === 'failed' && (
                      <span className="text-xs text-[#EF4444] font-medium">Failed</span>
                    )}
                    {p.status === 'cancelled' && (
                      <span className="text-xs text-[#A0A0A0] font-medium">Cancelled</span>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
