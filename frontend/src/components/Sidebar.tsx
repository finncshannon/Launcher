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
}

function NavItem({ icon, label, active, onClick }: NavItemProps) {
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
      {label}
    </button>
  );
}

export default function Sidebar() {
  const { activeView, setActiveView, launcherVersion, updateCheckInProgress, apps, initialized, launcherUpdateAvailable } = useAppStore();

  const allReleasesNull = initialized && !updateCheckInProgress &&
    apps.length > 0 && apps.every(a => a.latestRelease === null);

  return (
    <div className="w-[200px] h-full bg-[#141414] border-r border-[#2A2A2A] flex flex-col shrink-0">
      <div className="px-4 pt-5 pb-6">
        <div className="text-lg font-bold text-[#F5F5F5]">Fulcrum</div>
      </div>

      <nav className="flex-1 flex flex-col gap-0.5">
        <NavItem
          icon={<GridIcon />}
          label="Library"
          active={activeView === 'library'}
          onClick={() => setActiveView('library')}
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
