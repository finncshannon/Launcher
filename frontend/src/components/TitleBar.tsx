export default function TitleBar() {
  return (
    <div
      className="h-9 bg-[#0D0D0D] flex items-center justify-between shrink-0 select-none border-b border-[#1A1A1A]"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Left — empty drag area */}
      <div />

      {/* Right — window controls */}
      <div
        className="flex items-center gap-1 pr-2 h-full"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* Minimize */}
        <button
          onClick={() => window.electronAPI.windowMinimize()}
          className="w-8 h-6 flex items-center justify-center rounded text-[#999999] hover:text-white hover:bg-[#1A1A1A] transition-colors"
        >
          <svg width="12" height="2" viewBox="0 0 12 2">
            <rect y="0.5" width="12" height="1.5" rx="0.75" fill="currentColor" />
          </svg>
        </button>

        {/* Maximize */}
        <button
          onClick={() => window.electronAPI.windowMaximize()}
          className="w-8 h-6 flex items-center justify-center rounded text-[#999999] hover:text-white hover:bg-[#1A1A1A] transition-colors"
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="0.75" y="0.75" width="9.5" height="9.5" rx="1.5" />
          </svg>
        </button>

        {/* Close */}
        <button
          onClick={() => window.electronAPI.windowClose()}
          className="w-8 h-6 flex items-center justify-center rounded text-[#999999] hover:text-white hover:bg-[#EF4444]/80 transition-colors"
        >
          <svg width="11" height="11" viewBox="0 0 11 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M1.5 1.5l8 8M9.5 1.5l-8 8" />
          </svg>
        </button>
      </div>
    </div>
  );
}
