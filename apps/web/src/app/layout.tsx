import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';

const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Streamly';

export const metadata: Metadata = {
  title: {
    default: BRAND_NAME,
    template: `%s · ${BRAND_NAME}`,
  },
  description: 'Live channels and on-demand titles, streamed over HLS.',
};

export const viewport: Viewport = {
  themeColor: '#050505',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
