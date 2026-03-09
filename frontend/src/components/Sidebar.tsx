import { useAppStore } from '@/stores/appStore';
import { cn } from '@/lib/utils';

function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1.5" y="1.5" width="5" height="5" rx="1" />
      <rect x="9.5" y="1.5" width="5" height="5" rx="1" />
      <rect x="1.5" y="9.5" width="5" height="5" rx="1" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2v8M8 10l-3-3M8 10l3-3" />
      <path d="M3 12v1.5h10V12" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06" />
    </svg>
  );
}

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
}

function NavItem({ icon, label, active, onClick, badge }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 py-2.5 text-sm transition-colors duration-150',
        active
          ? 'bg-[#1A1A1A] text-[#F5F5F5] border-l-[3px] border-[#3B82F6] pl-[9px] pr-3'
          : 'text-[#A0A0A0] hover:bg-[#1A1A1A] hover:text-[#F5F5F5] pl-3 pr-3',
      )}
    >
      {icon}
      <span className="flex-1 text-left">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#3B82F6] text-white text-[10px] font-bold flex items-center justify-center">
          {badge}
        </span>
      )}
    </button>
  );
}

export default function Sidebar() {
  const { activeView, setActiveView, launcherVersion, updateCheckInProgress, apps, initialized, launcherUpdateAvailable } = useAppStore();

  const allReleasesNull = initialized && !updateCheckInProgress &&
    apps.length > 0 && apps.every(a => a.latestRelease === null);

  const activeDownloadCount = apps.filter(
    (a) => a.status === 'installing' || a.status === 'updating'
  ).length;

  return (
    <div className="w-[200px] h-full bg-[#141414] border-r border-[#2A2A2A] flex flex-col shrink-0">
      <div className="px-4 pt-4 pb-5 flex items-center gap-2.5">
        <img
          src={new URL('../assets/logo.png', import.meta.url).href}
          alt="Fulcrum"
          className="h-7 w-7 object-contain"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <span className="text-lg font-bold text-[#F5F5F5]">Fulcrum</span>
      </div>

      <nav className="flex-1 flex flex-col gap-0.5">
        <NavItem
          icon={<GridIcon />}
          label="Library"
          active={activeView === 'library'}
          onClick={() => setActiveView('library')}
        />
        <NavItem
          icon={<DownloadIcon />}
          label="Downloads"
          active={activeView === 'downloads'}
          onClick={() => setActiveView('downloads')}
          badge={activeDownloadCount}
        />
        <NavItem
          icon={<GearIcon />}
          label="Settings"
          active={activeView === 'settings'}
          onClick={() => setActiveView('settings')}
        />
      </nav>

      <div className="px-4 py-3 border-t border-[#2A2A2A]">
        {updateCheckInProgress && (
          <p className="text-[10px] text-[#A0A0A0] mb-1 animate-pulse">Checking for updates...</p>
        )}
        {allReleasesNull && (
          <p className="text-[10px] text-[#666666] mb-1">Couldn't check for updates</p>
        )}
        {launcherUpdateAvailable ? (
          <p className="text-[10px] text-[#F59E0B]">v{launcherVersion} &bull; Update available</p>
        ) : launcherVersion ? (
          <p className="text-[10px] text-[#666666]">v{launcherVersion}</p>
        ) : null}
      </div>
    </div>
  );
}
