'use client';

import { Suspense } from 'react';
import { BrowseView } from '@/projection/BrowseView';

export default function SeriesPage() {
  return (
    <Suspense fallback={null}>
      <BrowseView lockedType="SERIES" title="series" basePath="/series" />
    </Suspense>
  );
}
