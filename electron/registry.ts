import { AppEntry } from './types';

export const APP_REGISTRY: AppEntry[] = [
  {
    id: 'finance-app',
    name: 'Finance App',
    description: 'Professional-grade equity valuation and portfolio management.',
    longDescription:
      'A comprehensive desktop application for DCF modeling, stock screening, portfolio tracking, and company research. Built for analysts and individual investors who need institutional-quality tools.',
    github: {
      owner: 'finncshannon',
      repo: 'finance-app',
    },
    icon: 'finance-app.png',
    installSize: '~150 MB',
    tags: ['finance', 'valuation', 'desktop'],
    executableName: 'Finance App.exe',
  },
];
