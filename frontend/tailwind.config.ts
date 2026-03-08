import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg-primary': '#0D0D0D',
        'bg-secondary': '#141414',
        'bg-tertiary': '#1A1A1A',
        'bg-elevated': '#1E1E1E',
        'border-default': '#2A2A2A',
        'border-hover': '#3A3A3A',
        'text-primary': '#F5F5F5',
        'text-secondary': '#A0A0A0',
        'text-muted': '#666666',
        'accent-primary': '#3B82F6',
        'accent-hover': '#2563EB',
        'accent-success': '#22C55E',
        'accent-warning': '#F59E0B',
        'accent-danger': '#EF4444',
        'accent-info': '#6366F1',
      },
    },
  },
  plugins: [],
};

export default config;
