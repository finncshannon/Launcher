import { useEffect } from 'react';
import { useAppStore } from '@/stores/appStore';
import { formatDate } from '@/lib/utils';
import type { AppState } from '@/types';
import FallbackIcon from './FallbackIcon';
import InstallProgress from './InstallProgress';
import { showToast } from './Toast';

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

function ActionButtons({ app }: { app: AppState }) {
  const { status, latestRelease, downloadProgress, entry, installed } = app;
  const { config, refreshConfig } = useAppStore();

  const handleInstall = async () => {
    const defaultDir = config?.settings.defaultInstallDir || '';
    const selectedDir = await window.electronAPI.selectDirectory(defaultDir);
    if (!selectedDir) return;

    const result = await window.electronAPI.installApp({ appId: entry.id, installDir: selectedDir });
    if (result.success) {
      showToast('success', `${entry.name} installed successfully`);
      refreshConfig();
    } else if (result.error !== 'Cancelled') {
      showToast('error', result.error || 'Installation failed');
    }
  };

  const handleUpdate = async () => {
    if (!installed) return;
    // Use parent directory of existing install path
    const parentDir = installed.installPath.split(/[\\/]/).slice(0, -1).join('/') || installed.installPath;
    const result = await window.electronAPI.installApp({ appId: entry.id, installDir: parentDir });
    if (result.success) {
      showToast('success', `${entry.name} updated to v${result.version}`);
      refreshConfig();
    } else if (result.error !== 'Cancelled') {
      showToast('error', result.error || 'Update failed');
    }
  };

  const handleUninstall = async () => {
    const confirmed = window.confirm(`Uninstall ${entry.name}? This will delete all app files from disk.`);
    if (!confirmed) return;

    const result = await window.electronAPI.uninstallApp(entry.id);
    if (result.success) {
      showToast('info', `${entry.name} uninstalled`);
      refreshConfig();
    } else {
      showToast('error', result.error || 'Uninstall failed');
    }
  };

  const handleCancel = () => {
    window.electronAPI.cancelInstall(entry.id);
  };

  const handleRemove = async () => {
    const result = await window.electronAPI.uninstallApp(entry.id);
    if (result.success) {
      showToast('info', `${entry.name} removed`);
      refreshConfig();
    } else {
      showToast('error', result.error || 'Remove failed');
    }
  };

  const handleLaunch = async () => {
    useAppStore.getState().updateAppStatus(entry.id, 'launching');
    const result = await window.electronAPI.launchApp(entry.id);
    if (result.success) {
      setTimeout(() => {
        useAppStore.getState().updateAppStatus(entry.id, 'installed');
        useAppStore.getState().refreshConfig();
      }, 1500);
    } else {
      useAppStore.getState().updateAppStatus(entry.id, 'installed');
      showToast('error', result.error || 'Failed to launch app');
    }
  };

  // Show progress during install/update
  if ((status === 'installing' || status === 'updating') && downloadProgress) {
    return <InstallProgress progress={downloadProgress} onCancel={handleCancel} />;
  }

  if (status === 'not-installed') {
    return (
      <button
        onClick={handleInstall}
        className="w-full py-2.5 rounded-lg bg-[#3B82F6] text-white text-sm font-medium hover:bg-[#2563EB] transition-colors"
      >
        Install
      </button>
    );
  }

  if (status === 'broken') {
    return (
      <div className="flex flex-col gap-2">
        <button
          onClick={handleInstall}
          className="w-full py-2.5 rounded-lg bg-[#3B82F6] text-white text-sm font-medium hover:bg-[#2563EB] transition-colors"
        >
          Repair
        </button>
        <button
          onClick={handleRemove}
          className="w-full py-2 rounded-lg bg-transparent text-[#EF4444] text-sm font-medium hover:text-[#F87171] transition-colors"
        >
          Remove
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleLaunch}
        disabled={status === 'launching'}
        className="w-full py-2.5 rounded-lg bg-[#3B82F6] hover:bg-[#2563EB] text-white font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {status === 'launching' ? (
          <span className="flex items-center justify-center gap-2">
            <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Launching...
          </span>
        ) : 'Launch'}
      </button>
      {status === 'update-available' && (
        <button
          onClick={handleUpdate}
          className="w-full py-2 rounded-lg bg-[#F59E0B]/10 text-[#F59E0B] text-sm font-medium hover:bg-[#F59E0B]/20 transition-colors"
        >
          Update to v{latestRelease?.version || '?'}
        </button>
      )}
      <div className="flex gap-2">
        <button
          onClick={() => window.electronAPI.openFolder(entry.id)}
          className="flex-1 py-2 rounded-lg bg-[#1A1A1A] text-[#A0A0A0] text-xs font-medium hover:bg-[#2A2A2A] hover:text-[#F5F5F5] transition-colors"
        >
          Open Folder
        </button>
        <button
          onClick={handleUninstall}
          className="flex-1 py-2 rounded-lg bg-transparent text-[#EF4444] text-xs font-medium hover:text-[#F87171] transition-colors"
        >
          Uninstall
        </button>
      </div>
    </div>
  );
}

export default function AppDetail() {
  const { apps, selectedAppId, setSelectedApp } = useAppStore();
  const app = apps.find((a) => a.entry.id === selectedAppId);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelectedApp(null);
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [setSelectedApp]);

  if (!app) return null;

  const { entry, installed } = app;

  return (
    <div className="w-[480px] h-full bg-[#1E1E1E] border-l border-[#2A2A2A] flex flex-col shrink-0 animate-slideIn overflow-y-auto">
      <div className="p-6">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-24 h-24 bg-[#1A1A1A] rounded-2xl overflow-hidden shrink-0">
              <FallbackIcon name={entry.name} appId={entry.id} size="lg" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#F5F5F5]">{entry.name}</h2>
              {installed && (
                <p className="text-xs text-[#A0A0A0] mt-1">v{installed.version}</p>
              )}
              {installed?.lastLaunched && (
                <p className="text-xs text-[#666666] mt-0.5">
                  Last launched {formatDate(installed.lastLaunched)}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={() => setSelectedApp(null)}
            className="p-1.5 rounded-md text-[#666666] hover:text-[#F5F5F5] hover:bg-[#2A2A2A] transition-colors"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-4">
          {entry.tags.map((tag) => (
            <span key={tag} className="px-2 py-0.5 rounded-full bg-[#1A1A1A] text-[#A0A0A0] text-[10px] font-medium">
              {tag}
            </span>
          ))}
          <span className="px-2 py-0.5 rounded-full bg-[#1A1A1A] text-[#A0A0A0] text-[10px] font-medium">
            {entry.installSize}
          </span>
        </div>

        {app.status === 'not-installed' && app.latestRelease && (
          <p className="text-[#666666] text-xs mb-4">
            Latest: v{app.latestRelease.version} &bull; Released {formatDate(app.latestRelease.publishedAt)}
          </p>
        )}

        <p className="text-sm text-[#A0A0A0] leading-relaxed mb-6">
          {entry.longDescription}
        </p>

        {app.status === 'update-available' && app.latestRelease && (
          <div className="rounded-lg bg-[#141414] border border-[#2A2A2A] p-4 mb-6">
            <h3 className="text-[#F5F5F5] text-sm font-semibold mb-2">
              What's new in v{app.latestRelease.version}
            </h3>
            <p className="text-[#A0A0A0] text-xs leading-relaxed whitespace-pre-line">
              {app.latestRelease.body || 'No release notes available.'}
            </p>
          </div>
        )}

        <ActionButtons app={app} />
      </div>
    </div>
  );
}
