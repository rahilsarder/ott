'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  TmdbApplyFields,
  TmdbApplyResult,
  TmdbKind,
  TmdbPreview,
  TmdbSearchItem,
} from '@ott/shared';
import { api, ApiError } from '@/lib/api';
import { cn, formatDuration } from '@/lib/format';
import { TrailerModal } from '@/projection/TrailerModal';
import { Banner, Button, Card, Field, inputClass } from './ui';

const DEFAULT_FIELDS: TmdbApplyFields = {
  metadata: true,
  artwork: true,
  trailer: true,
  genres: true,
  cast: true,
  episodes: true,
};

interface Props {
  titleId?: string;
  /** MOVIE maps to TMDB's movie namespace, SERIES to tv — the ids are separate. */
  titleType: 'MOVIE' | 'SERIES';
  onApplied: () => void;
}

export function TmdbPanel({ titleId, titleType, onApplied }: Props) {
  const client = useQueryClient();
  const kind: TmdbKind = titleType === 'MOVIE' ? 'movie' : 'tv';

  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [tmdbId, setTmdbId] = useState('');
  const [fields, setFields] = useState<TmdbApplyFields>(DEFAULT_FIELDS);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TmdbApplyResult | null>(null);
  const [previewTrailer, setPreviewTrailer] = useState(false);

  const { data: status } = useQuery({
    queryKey: ['admin', 'tmdb', 'status'],
    queryFn: () => api<{ configured: boolean }>('/admin/tmdb/status'),
    staleTime: 5 * 60_000,
  });

  const { data: results, isFetching: searching } = useQuery({
    queryKey: ['admin', 'tmdb', 'search', kind, submitted],
    queryFn: () => api<TmdbSearchItem[]>(`/admin/tmdb/search?kind=${kind}&q=${encodeURIComponent(submitted)}`),
    enabled: submitted.trim().length >= 2 && status?.configured === true,
  });

  const {
    data: preview,
    isFetching: loadingPreview,
    error: previewError,
  } = useQuery({
    queryKey: ['admin', 'tmdb', 'preview', kind, tmdbId],
    queryFn: () => api<TmdbPreview>(`/admin/tmdb/preview?kind=${kind}&tmdbId=${tmdbId}`),
    enabled: /^\d+$/.test(tmdbId) && status?.configured === true,
    retry: false,
  });

  const apply = useMutation({
    mutationFn: () =>
      api<TmdbApplyResult>(`/admin/titles/${titleId}/tmdb`, {
        method: 'POST',
        // No trailer checkbox is shown when TMDB has none for this record, but
        // `fields` still carries whatever DEFAULT_FIELDS set — guard here too,
        // so applying never overwrites an existing trailer with nothing.
        body: { kind, tmdbId: Number(tmdbId), fields: { ...fields, trailer: fields.trailer && Boolean(preview?.trailerYoutubeId) } },
      }),
    onSuccess: (res) => {
      setError(null);
      setResult(res);
      void client.invalidateQueries({ queryKey: ['admin', 'title', titleId] });
      void client.invalidateQueries({ queryKey: ['admin', 'titles'] });
      onApplied();
    },
    onError: (err) => {
      setResult(null);
      setError(err instanceof ApiError ? err.message : 'Import failed');
    },
  });

  if (status && !status.configured) {
    return (
      <Card className="space-y-2">
        <h2 className="font-semibold">TMDB import</h2>
        <p className="text-sm text-ash">
          Set <code className="bg-bone/10 px-1">TMDB_API_KEY</code> in <code>.env</code> and restart the API to
          enable metadata import.
        </p>
      </Card>
    );
  }

  const episodeCount = preview?.seasons.reduce((n, s) => n + s.episodes.length, 0) ?? 0;

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="font-semibold">TMDB import</h2>
        <span className="label-mono bg-bone/10 px-2 py-0.5 text-ash">{kind === 'movie' ? 'Movies' : 'TV'}</span>
      </div>

      {error && <Banner tone="error">{error}</Banner>}
      {previewError && <Banner tone="error">{(previewError as Error).message}</Banner>}
      {result && (
        <>
          <Banner tone="success">
            Applied {result.applied.join(', ')}
            {result.episodesCreated > 0 && ` · ${result.episodesCreated} created`}
            {result.episodesRemoved > 0 && ` · ${result.episodesRemoved} stale placeholders removed`}
          </Banner>
          {result.orphanedEpisodes.length > 0 && (
            <Banner tone="error">
              {result.orphanedEpisodes.length} episode(s) are no longer in TMDB but still have a stream attached, so
              they were kept: {result.orphanedEpisodes.join(', ')}. Delete them below if they do not belong.
            </Banner>
          )}
        </>
      )}

      <div className="grid gap-4 md:grid-cols-[1fr_auto]">
        <Field label="Search TMDB" hint="Or paste a TMDB id directly below.">
          <div className="flex gap-2">
            <input
              className={inputClass}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  setSubmitted(query);
                }
              }}
              placeholder={kind === 'movie' ? 'e.g. Pongala' : 'e.g. Breaking Bad'}
            />
            <Button type="button" variant="ghost" onClick={() => setSubmitted(query)}>
              Search
            </Button>
          </div>
        </Field>

        <Field label="TMDB id">
          <input
            className={cn(inputClass, 'w-32')}
            value={tmdbId}
            onChange={(e) => {
              setTmdbId(e.target.value.trim());
              setResult(null);
            }}
            placeholder="12345"
            inputMode="numeric"
          />
        </Field>
      </div>

      {searching && <p className="text-sm text-ash">Searching TMDB…</p>}

      {results && results.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {results.map((r) => (
            <li key={r.tmdbId}>
              <button
                type="button"
                onClick={() => {
                  setTmdbId(String(r.tmdbId));
                  setResult(null);
                }}
                className={cn(
                  'chamfer-sm focus-brass flex w-full gap-3 p-2 text-left transition hover:bg-bone/5',
                  String(r.tmdbId) === tmdbId && 'bg-brass/10 ring-1 ring-brass/40',
                )}
              >
                <div className="relative h-20 w-14 shrink-0 overflow-hidden bg-night-3">
                  {r.posterUrl && <Image src={r.posterUrl} alt="" fill sizes="56px" className="object-cover" />}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {r.name} {r.year && <span className="text-ash-dim">({r.year})</span>}
                  </p>
                  <p className="label-mono text-ash-dim">TMDB {r.tmdbId}</p>
                  <p className="line-clamp-2 text-xs text-ash">{r.overview}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {loadingPreview && <p className="text-sm text-ash">Loading preview…</p>}

      {preview && (
        <div className="chamfer-sm space-y-4 border border-hairline bg-night-3 p-4">
          <div className="flex gap-4">
            <div className="relative h-36 w-24 shrink-0 overflow-hidden bg-black/40">
              {preview.posterUrl && <Image src={preview.posterUrl} alt="" fill sizes="96px" className="object-cover" />}
            </div>
            <div className="min-w-0 space-y-1">
              <p className="font-semibold">
                {preview.name} {preview.year && <span className="text-ash-dim">({preview.year})</span>}
              </p>
              <p className="text-xs text-ash-dim">
                {[preview.rating?.replace(/_/g, '-'), formatDuration(preview.durationSec), preview.genres.join(', ')]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <p className="line-clamp-3 text-sm text-ash">{preview.synopsis}</p>
              {preview.trailerYoutubeId && (
                <button
                  type="button"
                  onClick={() => setPreviewTrailer(true)}
                  className="focus-brass text-xs font-medium text-ash underline decoration-hairline underline-offset-2 transition hover:text-brass-hot"
                >
                  ▶ Preview trailer
                </button>
              )}
            </div>
          </div>

          {preview.cast.length > 0 && (
            <div>
              <p className="label-mono mb-2 text-ash-dim">Cast ({preview.cast.length})</p>
              <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
                {preview.cast.slice(0, 12).map((p) => (
                  <div key={`${p.tmdbId}-${p.role}`} className="w-16 shrink-0 text-center">
                    <div className="chamfer-sm relative mx-auto h-16 w-16 overflow-hidden bg-black/40">
                      {p.profileUrl && <Image src={p.profileUrl} alt="" fill sizes="64px" className="object-cover" />}
                    </div>
                    <p className="mt-1 truncate text-[10px]">{p.name}</p>
                    <p className="truncate text-[10px] text-ash-dim">{p.role}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {preview.kind === 'tv' && (
            <p className="text-sm text-ash">
              {preview.seasons.length} season{preview.seasons.length === 1 ? '' : 's'} · {episodeCount} episodes.
              Episodes are created without stream paths — attach those below as files arrive.
            </p>
          )}

          <div>
            <p className="label-mono mb-2 text-ash-dim">Apply which parts?</p>
            <div className="flex flex-wrap gap-4 text-sm">
              {(
                [
                  ['metadata', 'Name, synopsis, year, rating'],
                  ['artwork', 'Poster, backdrop, logo'],
                  ...(preview.trailerYoutubeId ? ([['trailer', 'Trailer']] as const) : []),
                  ['genres', 'Genres'],
                  ['cast', 'Cast & crew'],
                  ...(preview.kind === 'tv' ? ([['episodes', 'Seasons & episodes']] as const) : []),
                ] as [keyof TmdbApplyFields, string][]
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={fields[key]}
                    onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.checked }))}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {titleId ? (
            <Button onClick={() => apply.mutate()} disabled={apply.isPending}>
              {apply.isPending ? 'Importing…' : 'Apply to this title'}
            </Button>
          ) : (
            <p className="text-sm text-ash">Save the title first, then import.</p>
          )}
        </div>
      )}

      {previewTrailer && preview?.trailerYoutubeId && (
        <TrailerModal youtubeId={preview.trailerYoutubeId} onClose={() => setPreviewTrailer(false)} />
      )}
    </Card>
  );
}
