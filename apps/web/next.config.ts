import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  /*
   * `next build` and `next dev` share .next by default, so building while a dev
   * server is running overwrites its chunks and every route starts 500ing with
   * "Cannot find module ./vendor-chunks/…". Set NEXT_DIST_DIR to build into a
   * scratch directory instead — see the `build:check` script.
   */
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // The player puts controls in both bottom corners, so the floating dev badge
  // sits on top of them and swallows clicks whichever corner it is pinned to.
  devIndicators: false,
  // The shared package ships TypeScript-adjacent CJS; let Next compile it.
  transpilePackages: ['@ott/shared'],
  images: {
    // Artwork comes from the API's own upload host plus whatever CDN admins paste in.
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: 'localhost' },
    ],
  },
};

export default config;
