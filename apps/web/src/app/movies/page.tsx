'use client';

import { Suspense } from 'react';
import { AuthGate } from '@/components/AuthGate';
import { BrowseView } from '@/projection/BrowseView';

export default function MoviesPage() {
  return (
    <AuthGate>
      <Suspense fallback={null}>
        <BrowseView lockedType="MOVIE" title="movies" basePath="/movies" />
      </Suspense>
    </AuthGate>
  );
}
