import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Series' };

export default function SeriesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
