import { redirect } from 'next/navigation';

/**
 * The old per-genre route.
 *
 * Home shelves and older links still point here, so rather than keeping a
 * second browse implementation alive it folds into the real one with the genre
 * pre-applied. `movies` and `series` were type filters, not genres — they now
 * have real dedicated pages of their own.
 */
export default async function LegacyGenrePage({ params }: { params: Promise<{ genre: string }> }) {
  const { genre } = await params;

  if (genre === 'movies') redirect('/movies');
  if (genre === 'series') redirect('/series');

  redirect(`/browse?genre=${encodeURIComponent(genre)}`);
}
