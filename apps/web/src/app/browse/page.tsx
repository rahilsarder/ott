'use client';

import { Suspense } from 'react';
import { AuthGate } from '@/components/AuthGate';
import { BrowseView } from '@/projection/BrowseView';

/**
 * Type-agnostic on purpose — this is where a genre still spans both movies
 * and series: a Home genre rail's "All →" and a title page's "More like
 * this" both land here. `/movies` and `/series` are the dedicated,
 * single-type destinations linked from the main nav.
 */
export default function BrowsePage() {
  return (
    <AuthGate>
      <Suspense fallback={null}>
        <BrowseView title="titles" basePath="/browse" />
      </Suspense>
    </AuthGate>
  );
}
