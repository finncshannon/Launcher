import { useState } from 'react';
import { useAppStore } from '@/stores/appStore';

export default function UpdateBanner() {
  const { launcherUpdateAvailable, launcherVersion } = useAppStore();
  const [dismissed, setDismissed] = useState(false);

  if (!launcherUpdateAvailable || dismissed) return null;

  return (
    <div className="h-12 bg-[#6366F1] flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-2 text-sm text-white">
        <span>&#x2B06;</span>
        <span className="font-medium">Launcher update available</span>
        <span className="opacity-80">
          v{launcherUpdateAvailable.version} &mdash; You're on v{launcherVersion}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            if (launcherUpdateAvailable?.downloadUrl) {
              window.electronAPI.openExternal(launcherUpdateAvailable.downloadUrl);
            }
          }}
          className="px-3 py-1 rounded bg-white/20 text-white text-xs font-medium hover:bg-white/30 transition-colors"
        >
          Download Update
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="p-1 text-white/60 hover:text-white transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M3 3l8 8M11 3l-8 8" />
          </svg>
        </button>
      </div>
    </div>
  );
}
