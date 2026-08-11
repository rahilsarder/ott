'use client';

import { Suspense } from 'react';
import { AuthGate } from '@/components/AuthGate';
import { BrowseView } from '@/projection/BrowseView';

export default function SeriesPage() {
  return (
    <AuthGate>
      <Suspense fallback={null}>
        <BrowseView lockedType="SERIES" title="series" basePath="/series" />
      </Suspense>
    </AuthGate>
  );
}
