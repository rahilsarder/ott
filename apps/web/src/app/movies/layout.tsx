import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Movies' };

export default function MoviesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
