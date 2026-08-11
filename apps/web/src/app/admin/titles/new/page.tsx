'use client';

import { Suspense } from 'react';
import { BLANK_TITLE, TitleEditor } from '@/components/admin/TitleEditor';

export default function NewTitlePage() {
  return (
    <Suspense fallback={null}>
      <TitleEditor initial={BLANK_TITLE} />
    </Suspense>
  );
}
