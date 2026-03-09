import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/appStore';
import type { AppState } from '@/types';
import FallbackIcon from './FallbackIcon';
import { showToast } from './Toast';

function StatusBadge({ app }: { app: AppState }) {
  const { status, latestRelease, downloadProgress } = app;

  // Show download percentage during install
  if (status === 'installing' && downloadProgress?.status === 'downloading' && downloadProgress.totalBytes > 0) {
    const pct = Math.round((downloadProgress.bytesDownloaded / downloadProgress.totalBytes) * 100);
    return (
      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-[#6366F1]/10 text-[#6366F1] tabular-nums">
        {pct}%
      </span>
    );
  }

  const styles: Record<string, { bg: string; text: string; label: string; pulse?: boolean }> = {
    'not-installed': { bg: 'bg-[#1A1A1A]', text: 'text-[#A0A0A0]', label: 'Available' },
    'installed': { bg: 'bg-[#22C55E]/10', text: 'text-[#22C55E]', label: 'Installed \u2713' },
    'update-available': {
      bg: 'bg-[#F59E0B]/10', text: 'text-[#F59E0B]',
      label: `Update ${latestRelease?.version ? `v${latestRelease.version}` : ''}`,
      pulse: true,
    },
    'installing': { bg: 'bg-[#6366F1]/10', text: 'text-[#6366F1]', label: 'Installing...' },
    'updating': { bg: 'bg-[#6366F1]/10', text: 'text-[#6366F1]', label: 'Updating...' },
    'launching': { bg: 'bg-[#3B82F6]/10', text: 'text-[#3B82F6]', label: 'Launching...', pulse: true },
    'broken': { bg: 'bg-[#EF4444]/10', text: 'text-[#EF4444]', label: 'Needs Repair' },
  };

  const s = styles[status] || styles['not-installed'];

  return (
    <span className={cn(
      'px-2.5 py-0.5 rounded-full text-[10px] font-medium',
      s.bg, s.text,
      s.pulse && 'animate-pulse',
    )}>
      {s.label}
    </span>
  );
}

interface ContextMenuProps {
  app: AppState;
  x: number;
  y: number;
  onClose: () => void;
}

function ContextMenu({ app, x, y, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const { setSelectedApp, refreshConfig, updateAppStatus } = useAppStore();
  const isInstalled = app.status === 'installed' || app.status === 'update-available' || app.status === 'launching';

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', handleClick);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handleClick);
      window.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const handleLaunch = async () => {
    onClose();
    updateAppStatus(app.entry.id, 'launching');
    const result = await window.electronAPI.launchApp(app.entry.id);
    if (result.success) {
      setTimeout(() => { updateAppStatus(app.entry.id, 'installed'); refreshConfig(); }, 1500);
    } else {
      updateAppStatus(app.entry.id, 'installed');
      showToast('error', result.error || 'Failed to launch');
    }
  };

  const handleDetails = () => {
    onClose();
    setSelectedApp(app.entry.id);
  };

  const handleCheckUpdate = async () => {
    onClose();
    try {
      const release = await window.electronAPI.checkOneRelease(app.entry.id);
      if (release) {
        useAppStore.getState().updateAppRelease(app.entry.id, release);
        showToast('info', `Latest: v${release.version}`);
      } else {
        showToast('success', 'No updates found');
      }
    } catch {
      showToast('error', 'Failed to check for updates');
    }
  };

  const handleUninstall = async () => {
    onClose();
    const confirmed = window.confirm(`Uninstall ${app.entry.name}? This will delete all app files.`);
    if (!confirmed) return;
    const result = await window.electronAPI.uninstallApp(app.entry.id);
    if (result.success) {
      showToast('info', `${app.entry.name} uninstalled`);
      refreshConfig();
    } else {
      showToast('error', result.error || 'Uninstall failed');
    }
  };

  const items: { label: string; onClick: () => void; danger?: boolean }[] = [];

  if (isInstalled) {
    items.push({ label: 'Launch', onClick: handleLaunch });
  }
  items.push({ label: 'Details', onClick: handleDetails });
  items.push({ label: 'Check for Update', onClick: handleCheckUpdate });
  if (isInstalled) {
    items.push({ label: 'Uninstall', onClick: handleUninstall, danger: true });
  }

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[160px] py-1 bg-[#1E1E1E] border border-[#2A2A2A] rounded-lg shadow-xl"
      style={{ left: x, top: y }}
    >
      {items.map((item, i) => (
        <button
          key={i}
          onClick={item.onClick}
          className={cn(
            'w-full text-left px-3 py-2 text-sm transition-colors',
            item.danger
              ? 'text-[#EF4444] hover:bg-[#EF4444]/10'
              : 'text-[#F5F5F5] hover:bg-[#2A2A2A]',
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

interface AppCardProps {
  app: AppState;
  selected: boolean;
  onClick: () => void;
}

export default function AppCard({ app, selected, onClick }: AppCardProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <>
      <button
        onClick={onClick}
        onContextMenu={handleContextMenu}
        className={cn(
          'flex flex-col rounded-none bg-[#141414] transition-all duration-150 ease-out text-left w-full overflow-hidden',
          selected
            ? 'ring-2 ring-[#3B82F6] shadow-[0_0_12px_rgba(59,130,246,0.15)]'
            : app.status === 'launching'
              ? 'ring-1 ring-[#3B82F6]/50 shadow-[0_0_12px_rgba(59,130,246,0.2)]'
              : 'ring-1 ring-[#2A2A2A] hover:ring-[#3A3A3A] hover:scale-[1.02]',
        )}
      >
        {/* Large square icon area */}
        <div className="aspect-square w-full bg-[#1A1A1A] overflow-hidden">
          <FallbackIcon name={app.entry.name} appId={app.entry.id} size="lg" />
        </div>

        {/* Info below the icon */}
        <div className="px-3 py-2.5">
          <h3
            className="text-sm font-semibold text-[#F5F5F5] truncate mb-1"
            title={app.entry.name}
          >
            {app.entry.name}
          </h3>
          <StatusBadge app={app} />
        </div>
      </button>

      {contextMenu && (
        <ContextMenu
          app={app}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}
