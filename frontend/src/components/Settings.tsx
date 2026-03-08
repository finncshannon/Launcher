import { useAppStore } from '@/stores/appStore';
import Toggle from './Toggle';
import { showToast } from './Toast';

export default function Settings() {
  const { config, launcherVersion, launcherUpdateAvailable, setLauncherUpdate, refreshConfig } = useAppStore();
  const settings = config?.settings;

  if (!settings) return null;

  const updateSetting = async (patch: Record<string, any>) => {
    await window.electronAPI.updateSettings(patch);
    await refreshConfig();
  };

  const handleBrowse = async () => {
    const selected = await window.electronAPI.selectDirectory(settings.defaultInstallDir);
    if (selected) {
      await updateSetting({ defaultInstallDir: selected });
      showToast('success', 'Install directory updated');
    }
  };

  const handleCheckUpdate = async () => {
    try {
      const result = await window.electronAPI.checkLauncherUpdate();
      if (result.available) {
        setLauncherUpdate({ version: result.version!, downloadUrl: result.downloadUrl! });
        showToast('info', `Update available: v${result.version}`);
      } else {
        showToast('success', "You're on the latest version");
      }
    } catch {
      showToast('error', 'Failed to check for updates');
    }
  };

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-[600px] mx-auto">
        <h1 className="text-2xl font-bold text-[#F5F5F5] mb-8">Settings</h1>

        {/* General */}
        <h2 className="text-[#A0A0A0] text-xs font-semibold uppercase tracking-wider mb-4">General</h2>

        <div className="flex items-center justify-between py-3">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-[#F5F5F5]">Default install directory</span>
            <span className="text-xs text-[#A0A0A0] mt-0.5 break-all">{settings.defaultInstallDir || 'Not set'}</span>
          </div>
          <button
            onClick={handleBrowse}
            className="px-3 py-1.5 rounded-lg bg-[#1A1A1A] border border-[#2A2A2A] text-sm text-[#A0A0A0] hover:text-[#F5F5F5] hover:bg-[#2A2A2A] transition-colors shrink-0 ml-4"
          >
            Browse
          </button>
        </div>

        <div className="border-t border-[#2A2A2A] my-2" />

        <Toggle
          label="Check for updates on launch"
          checked={settings.checkUpdatesOnLaunch}
          onChange={(v) => updateSetting({ checkUpdatesOnLaunch: v })}
        />

        <div className="border-t border-[#2A2A2A] my-2" />

        <Toggle
          label="Minimize to tray when launching an app"
          checked={settings.minimizeToTrayOnAppLaunch}
          onChange={(v) => updateSetting({ minimizeToTrayOnAppLaunch: v })}
        />

        <div className="border-t border-[#2A2A2A] my-2" />

        <Toggle
          label="Minimize to tray on close"
          description="Clicking the X button hides to tray instead of quitting."
          checked={settings.minimizeToTrayOnClose}
          onChange={(v) => updateSetting({ minimizeToTrayOnClose: v })}
        />

        {/* About */}
        <div className="border-t border-[#2A2A2A] mt-6 mb-6" />
        <h2 className="text-[#A0A0A0] text-xs font-semibold uppercase tracking-wider mb-4">About</h2>

        <div className="flex items-center justify-between py-3">
          <div>
            <p className="text-sm font-medium text-[#F5F5F5]">Fulcrum</p>
            {launcherVersion && (
              <p className="text-xs text-[#A0A0A0] mt-0.5">v{launcherVersion}</p>
            )}
          </div>
          <button
            onClick={handleCheckUpdate}
            className="px-3 py-1.5 rounded-lg bg-[#1A1A1A] border border-[#2A2A2A] text-sm text-[#A0A0A0] hover:text-[#F5F5F5] hover:bg-[#2A2A2A] transition-colors shrink-0 ml-4"
          >
            Check for Update
          </button>
        </div>

        {launcherUpdateAvailable && (
          <div className="mt-3 p-4 rounded-lg bg-[#6366F1]/10 border border-[#6366F1]/20">
            <p className="text-sm text-[#F5F5F5] font-medium mb-2">
              v{launcherUpdateAvailable.version} is available
            </p>
            <button
              onClick={() => window.electronAPI.openExternal(launcherUpdateAvailable.downloadUrl)}
              className="px-3 py-1.5 rounded-lg bg-[#6366F1] text-white text-sm font-medium hover:bg-[#5558E6] transition-colors"
            >
              Download Update
            </button>
          </div>
        )}

        <div className="border-t border-[#2A2A2A] my-4" />

        <button
          onClick={() => window.electronAPI.openExternal('https://github.com/finncshannon/Launcher')}
          className="text-sm text-[#A0A0A0] hover:text-[#F5F5F5] transition-colors"
        >
          View on GitHub &rarr;
        </button>
      </div>
    </div>
  );
}
