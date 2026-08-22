'use client';

import { Suspense } from 'react';
import { BrowseView } from '@/projection/BrowseView';

export default function MoviesPage() {
  return (
    <Suspense fallback={null}>
      <BrowseView lockedType="MOVIE" title="movies" basePath="/movies" />
    </Suspense>
  );
}
