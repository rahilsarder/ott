'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { extractYoutubeId, upsertTitleSchema, type Genre, type UpsertTitleInput } from '@ott/shared';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/format';
import { Banner, Button, Card, Field, ImageUpload, inputClass } from './ui';
import { StreamTester } from './StreamTester';
import { SeasonEditor } from './SeasonEditor';
import { SubtitleUpload } from './SubtitleUpload';
import { TmdbPanel } from './TmdbPanel';
import { TrailerModal } from '@/projection/TrailerModal';

const RATINGS = ['G', 'PG', 'PG_13', 'R', 'NC_17', 'TV_Y', 'TV_G', 'TV_PG', 'TV_14', 'TV_MA'] as const;

export const BLANK_TITLE: UpsertTitleInput = {
  type: 'MOVIE',
  slug: '',
  name: '',
  synopsis: '',
  year: null,
  rating: null,
  durationSec: null,
  posterUrl: null,
  backdropUrl: null,
  logoUrl: null,
  trailerYoutubeId: null,
  streamPath: null,
  creditsLeadSec: null,
  genreIds: [],
  isPublished: false,
};

interface Props {
  titleId?: string;
  initial: UpsertTitleInput;
}

export function TitleEditor({ titleId, initial }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const client = useQueryClient();
  const [draft, setDraft] = useState<UpsertTitleInput>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [previewTrailer, setPreviewTrailer] = useState(false);

  const { data: genres } = useQuery({
    queryKey: ['admin', 'genres'],
    queryFn: () => api<Genre[]>('/admin/genres'),
  });

  const save = useMutation({
    mutationFn: async () => {
      const parsed = upsertTitleSchema.safeParse(draft);
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);

      return titleId
        ? api<{ id: string }>(`/admin/titles/${titleId}`, { method: 'PUT', body: parsed.data })
        : api<{ id: string }>('/admin/titles', { method: 'POST', body: parsed.data });
    },
    onSuccess: (result) => {
      setError(null);
      setSaved(true);
      void client.invalidateQueries({ queryKey: ['admin', 'titles'] });
      // A new title needs its id in the URL before seasons can be attached.
      if (!titleId) router.replace(`/admin/titles/${result.id}`);
    },
    onError: (err) => {
      setSaved(false);
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    },
  });

  const set = <K extends keyof UpsertTitleInput>(key: K, value: UpsertTitleInput[K]) => {
    setSaved(false);
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const toggleGenre = (id: string) =>
    set('genreIds', draft.genreIds.includes(id) ? draft.genreIds.filter((g) => g !== id) : [...draft.genreIds, id]);

  // Extracted client-side too, purely for the preview button — the schema
  // does the same extraction (and the real validation) again on save.
  const trailerCandidate = draft.trailerYoutubeId ? extractYoutubeId(draft.trailerYoutubeId) : null;
  const trailerId = trailerCandidate && /^[a-zA-Z0-9_-]{11}$/.test(trailerCandidate) ? trailerCandidate : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-[-0.015em]">
          {titleId ? draft.name || 'Edit title' : 'New title'}
        </h1>
        <Button className="ml-auto" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="ghost" onClick={() => router.push('/admin/titles')}>
          Back
        </Button>
      </div>

      {error && <Banner tone="error">{error}</Banner>}
      {saved && !error && <Banner tone="success">Saved.</Banner>}

      <TmdbPanel
        titleId={titleId}
        titleType={draft.type}
        onApplied={() => router.refresh()}
      />

      <Card className="grid gap-4 md:grid-cols-2">
        <Field label="Type">
          <select
            className={inputClass}
            value={draft.type}
            onChange={(e) => set('type', e.target.value as UpsertTitleInput['type'])}
          >
            <option value="MOVIE">Movie</option>
            <option value="SERIES">Series</option>
          </select>
        </Field>

        <Field label="Name">
          <input
            className={inputClass}
            value={draft.name}
            onChange={(e) => {
              set('name', e.target.value);
              if (!titleId) set('slug', slugify(e.target.value));
            }}
          />
        </Field>

        <Field label="Slug" hint="Appears in the title's URL.">
          <input className={inputClass} value={draft.slug} onChange={(e) => set('slug', e.target.value)} />
        </Field>

        <Field label="Year">
          <input
            type="number"
            className={inputClass}
            value={draft.year ?? ''}
            onChange={(e) => set('year', e.target.value ? Number(e.target.value) : null)}
          />
        </Field>

        <Field label="Maturity rating">
          <select
            className={inputClass}
            value={draft.rating ?? ''}
            onChange={(e) => set('rating', (e.target.value || null) as UpsertTitleInput['rating'])}
          >
            <option value="">None</option>
            {RATINGS.map((r) => (
              <option key={r} value={r}>
                {r.replace(/_/g, '-')}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Duration (minutes)" hint="Movies only. Episodes carry their own duration.">
          <input
            type="number"
            className={inputClass}
            value={draft.durationSec ? Math.round(draft.durationSec / 60) : ''}
            onChange={(e) => set('durationSec', e.target.value ? Number(e.target.value) * 60 : null)}
          />
        </Field>

        {draft.type === 'SERIES' && (
          <Field
            label="Credits lead time (seconds)"
            hint="How early to offer &ldquo;Play next episode&rdquo;, counted back from each episode's own end. Credits length is usually consistent across a show even though episode lengths aren't, so this is one value for the whole series. Leave blank to use the player's default (60s)."
          >
            <input
              type="number"
              min={0}
              max={600}
              className={inputClass}
              value={draft.creditsLeadSec ?? ''}
              onChange={(e) => set('creditsLeadSec', e.target.value ? Number(e.target.value) : null)}
              placeholder="60"
            />
          </Field>
        )}

        <div className="md:col-span-2">
          <Field label="Synopsis">
            <textarea
              className={cn(inputClass, 'min-h-28 resize-y')}
              value={draft.synopsis}
              onChange={(e) => set('synopsis', e.target.value)}
            />
          </Field>
        </div>

        <div className="md:col-span-2">
          <Field
            label="Trailer"
            hint="A YouTube link (any format) or a bare video id. Most trailers only exist on YouTube, so this embeds rather than streaming a Flussonic asset."
          >
            <div className="flex items-center gap-3">
              <input
                className={inputClass}
                value={draft.trailerYoutubeId ?? ''}
                onChange={(e) => set('trailerYoutubeId', e.target.value || null)}
                placeholder="https://www.youtube.com/watch?v=… or dQw4w9WgXcQ"
              />
              {trailerId && (
                <Button type="button" variant="ghost" onClick={() => setPreviewTrailer(true)}>
                  Preview
                </Button>
              )}
            </div>
          </Field>
        </div>

        <div className="md:col-span-2">
          <Field label="Genres">
            <div className="flex flex-wrap gap-2">
              {genres?.map((genre) => (
                <button
                  key={genre.id}
                  type="button"
                  onClick={() => toggleGenre(genre.id)}
                  className={cn(
                    'chamfer-sm focus-brass label-mono px-3 py-1.5 transition',
                    draft.genreIds.includes(genre.id)
                      ? 'bg-brass text-[#17110a]'
                      : 'border border-hairline text-ash hover:border-brass hover:text-brass-hot',
                  )}
                >
                  {genre.name}
                </button>
              ))}
              {!genres?.length && <p className="text-xs text-ash-dim">No genres defined yet.</p>}
            </div>
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input type="checkbox" checked={draft.isPublished} onChange={(e) => set('isPublished', e.target.checked)} />
          Published (visible to viewers)
        </label>
      </Card>

      <Card className="grid gap-4 md:grid-cols-3">
        <ImageUpload kind="poster" label="Poster (2:3)" value={draft.posterUrl} onChange={(u) => set('posterUrl', u)} />
        <ImageUpload
          kind="backdrop"
          label="Backdrop (16:9)"
          value={draft.backdropUrl}
          onChange={(u) => set('backdropUrl', u)}
        />
        <ImageUpload kind="logo" label="Title logo" value={draft.logoUrl} onChange={(u) => set('logoUrl', u)} />
      </Card>

      {draft.type === 'MOVIE' && (
        <Card className="space-y-4">
          <Field
            label="Flussonic stream name"
            hint="The VOD path as configured on Flussonic — e.g. vod/movie.mp4. Not a full URL."
          >
            <input
              className={inputClass}
              value={draft.streamPath ?? ''}
              onChange={(e) => set('streamPath', e.target.value || null)}
              placeholder="vod/movie.mp4"
            />
          </Field>
          {draft.streamPath && <StreamTester streamPath={draft.streamPath} isLive={false} />}
          {titleId && <SubtitleUpload titleId={titleId} episodeId={null} />}
        </Card>
      )}

      {draft.type === 'SERIES' &&
        (titleId ? (
          <SeasonEditor titleId={titleId} initialEpisodeId={searchParams.get('episode')} />
        ) : (
          <Card>
            <p className="text-sm text-ash">Save the title first, then add seasons and episodes.</p>
          </Card>
        ))}

      {previewTrailer && trailerId && (
        <TrailerModal youtubeId={trailerId} onClose={() => setPreviewTrailer(false)} />
      )}
    </div>
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
