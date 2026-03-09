import { useEffect } from 'react';
import { useAppStore } from './stores/appStore';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import Library from './components/Library';
import Settings from './components/Settings';
import Downloads from './components/Downloads';
import UpdateBanner from './components/UpdateBanner';
import ToastContainer from './components/Toast';
import Welcome from './components/Welcome';

export default function App() {
  const { initialize, activeView } = useAppStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <div className="flex flex-col h-screen bg-[#0D0D0D] text-[#F5F5F5] overflow-hidden select-none">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden">
          <UpdateBanner />
          <div className="flex-1 overflow-hidden">
            {activeView === 'library' && <Library />}
            {activeView === 'downloads' && <Downloads />}
            {activeView === 'settings' && <Settings />}
          </div>
        </main>
      </div>
      <ToastContainer />
      <Welcome />
    </div>
  );
}
