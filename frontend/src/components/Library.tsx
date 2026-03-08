import { useAppStore } from '@/stores/appStore';
import AppCard from './AppCard';
import AppDetail from './AppDetail';

function SkeletonCard() {
  return (
    <div className="flex flex-col rounded-none bg-[#141414] ring-1 ring-[#2A2A2A] overflow-hidden animate-pulse">
      <div className="aspect-square w-full bg-[#1A1A1A]" />
      <div className="px-3 py-2.5">
        <div className="h-4 bg-[#1A1A1A] rounded w-3/4 mb-2" />
        <div className="h-5 bg-[#1A1A1A] rounded-full w-16" />
      </div>
    </div>
  );
}

export default function Library() {
  const { apps, selectedAppId, setSelectedApp, initialized } = useAppStore();

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-y-auto p-6">
        <div
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}
          className="grid gap-4"
        >
          {!initialized ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : (
            apps.map((app) => (
              <AppCard
                key={app.entry.id}
                app={app}
                selected={app.entry.id === selectedAppId}
                onClick={() => setSelectedApp(
                  app.entry.id === selectedAppId ? null : app.entry.id
                )}
              />
            ))
          )}
        </div>
        {apps.length > 0 && !selectedAppId && (
          <p className="text-[#666666] text-xs mt-6 text-center">
            Select an app to view details
          </p>
        )}
      </div>
      {selectedAppId && <AppDetail />}
    </div>
  );
}
