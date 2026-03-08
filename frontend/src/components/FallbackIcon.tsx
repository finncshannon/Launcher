import { cn } from '@/lib/utils';

interface FallbackIconProps {
  name: string;
  appId: string;
  size?: 'sm' | 'lg';
}

export default function FallbackIcon({ name, appId, size = 'sm' }: FallbackIconProps) {
  const hue = Array.from(appId).reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
  const letter = name.charAt(0).toUpperCase();
  return (
    <div
      className={cn(
        'w-full h-full flex items-center justify-center text-white font-bold',
        size === 'lg' ? 'text-5xl' : 'text-2xl rounded-xl',
      )}
      style={{ backgroundColor: `hsl(${hue}, 50%, 30%)` }}
    >
      {letter}
    </div>
  );
}
