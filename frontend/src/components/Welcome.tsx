import { useState, useEffect } from 'react';
import { useAppStore } from '@/stores/appStore';

export default function Welcome() {
  const { isFirstRun, markFirstRunComplete } = useAppStore();
  const [phase, setPhase] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!isFirstRun) return;
    const t1 = setTimeout(() => setPhase(1), 100);
    const t2 = setTimeout(() => setPhase(2), 200);
    const t3 = setTimeout(() => setPhase(3), 300);
    const t4 = setTimeout(() => setPhase(4), 400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [isFirstRun]);

  if (!isFirstRun) return null;

  const handleDismiss = () => {
    setVisible(false);
    setTimeout(() => markFirstRunComplete(), 300);
  };

  const fadeClass = (step: number) =>
    phase >= step
      ? 'opacity-100 translate-y-0'
      : 'opacity-0 translate-y-3';

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-[#0D0D0D]/90 backdrop-blur-sm transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div className="max-w-lg w-full mx-4 bg-[#1E1E1E] rounded-2xl p-10 border border-[#2A2A2A] shadow-2xl">
        <div className={`flex justify-center mb-6 transition-all duration-300 ${fadeClass(1)}`}>
          <div className="w-20 h-20 rounded-2xl bg-[#3B82F6] flex items-center justify-center">
            <span className="text-white text-3xl font-bold">F</span>
          </div>
        </div>

        <h1 className={`text-2xl font-bold text-[#F5F5F5] text-center mb-3 transition-all duration-300 ${fadeClass(2)}`}>
          Welcome to Fulcrum
        </h1>

        <p className={`text-sm text-[#A0A0A0] text-center mb-8 leading-relaxed transition-all duration-300 ${fadeClass(3)}`}>
          Your personal software hub. Browse your app library, install with one click, receive updates automatically, and launch everything from one place.
        </p>

        <button
          onClick={handleDismiss}
          className={`w-full py-3 rounded-xl bg-[#3B82F6] hover:bg-[#2563EB] text-white font-medium text-sm transition-all duration-300 ${fadeClass(4)}`}
        >
          Get Started
        </button>
      </div>
    </div>
  );
}
