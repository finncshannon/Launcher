interface ToggleProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
}

export default function Toggle({ checked, onChange, label, description }: ToggleProps) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex flex-col">
        <span className="text-sm font-medium text-[#F5F5F5]">{label}</span>
        {description && (
          <span className="text-xs text-[#A0A0A0] mt-0.5">{description}</span>
        )}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`w-10 h-6 rounded-full shrink-0 ml-4 transition-colors duration-150 ${
          checked ? 'bg-[#3B82F6]' : 'bg-[#1A1A1A]'
        }`}
      >
        <span
          className={`block w-4 h-4 rounded-full bg-white transition-transform duration-150 ${
            checked ? 'translate-x-5' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}
