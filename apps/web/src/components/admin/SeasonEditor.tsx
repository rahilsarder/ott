'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { upsertEpisodeSchema, type UpsertEpisodeInput } from '@ott/shared';
import { api, ApiError } from '@/lib/api';
import { cn, formatDuration } from '@/lib/format';
import { Banner, Button, Card, Field, ImageUpload, inputClass } from './ui';
import { BulkStreamAttach } from './BulkStreamAttach';
import { BulkSubtitleImport } from './BulkSubtitleImport';
import { StreamTester } from './StreamTester';
import { SubtitleUpload } from './SubtitleUpload';
import { PencilIcon, TrashIcon } from '@/components/icons';

interface AdminEpisode {
  id: string;
  number: number;
  name: string;
  synopsis: string;
  stillUrl: string | null;
  durationSec: number | null;
  streamPath: string;
}
interface AdminSeason {
  id: string;
  number: number;
  name: string;
  episodes: AdminEpisode[];
}
interface AdminTitleDetail {
  id: string;
  seasons: AdminSeason[];
}

/** Which season has a bulk panel open, and which kind. */
interface BulkPanel {
  seasonId: string;
  kind: 'subtitles' | 'streams';
}

export function SeasonEditor({
  titleId,
  initialEpisodeId,
}: {
  titleId: string;
  /** Deep-links straight into one episode's edit form — the Awaiting page uses this. */
  initialEpisodeId?: string | null;
}) {
  const client = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  /** Which episode is open for editing, or `new:<seasonId>` for the add form. */
  const [editing, setEditing] = useState<string | null>(null);
  const [bulkPanel, setBulkPanel] = useState<BulkPanel | null>(null);
  const [seriesBulkOpen, setSeriesBulkOpen] = useState(false);
  const autoOpened = useRef(false);

  const { data: title } = useQuery({
    queryKey: ['admin', 'title', titleId],
    queryFn: () => api<AdminTitleDetail>(`/admin/titles/${titleId}`),
  });

  // Runs once, the first time the deep-linked episode actually shows up in a
  // loaded season — not on every refetch, or re-saving the form would keep
  // snapping it back open.
  useEffect(() => {
    if (autoOpened.current || !initialEpisodeId || !title) return;
    const found = title.seasons.some((s) => s.episodes.some((e) => e.id === initialEpisodeId));
    if (found) {
      setEditing(initialEpisodeId);
      autoOpened.current = true;
    }
  }, [initialEpisodeId, title]);

  const invalidate = () => void client.invalidateQueries({ queryKey: ['admin', 'title', titleId] });

  const addSeason = useMutation({
    mutationFn: () => {
      const next = (title?.seasons.at(-1)?.number ?? 0) + 1;
      return api(`/admin/titles/${titleId}/seasons`, {
        method: 'POST',
        body: { number: next, name: `Season ${next}` },
      });
    },
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not add season'),
  });

  const deleteSeason = useMutation({
    mutationFn: (id: string) => api<void>(`/admin/seasons/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  const missingStreams =
    title?.seasons.flatMap((s) => s.episodes).filter((e) => !e.streamPath).length ?? 0;

  const allEpisodes =
    title?.seasons.flatMap((s) =>
      s.episodes.map((e) => ({ id: e.id, number: e.number, name: e.name, seasonNumber: s.number })),
    ) ?? [];

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-semibold">Seasons &amp; episodes</h2>
        {missingStreams > 0 && (
          /* After a TMDB import every episode arrives without a stream; this is
             the running count of what still needs one. */
          <span className="label-mono bg-signal-warn/15 px-2 py-0.5 text-signal-warn">
            {missingStreams} awaiting a stream
          </span>
        )}
        {title && title.seasons.length > 1 && (
          <Button
            className="ml-auto"
            variant="ghost"
            onClick={() => {
              setSeriesBulkOpen((open) => !open);
              setBulkPanel(null);
            }}
          >
            {seriesBulkOpen ? 'Close bulk attach' : 'Bulk attach for entire series'}
          </Button>
        )}
        <Button
          className={title && title.seasons.length > 1 ? '' : 'ml-auto'}
          variant="ghost"
          onClick={() => addSeason.mutate()}
          disabled={addSeason.isPending}
        >
          Add season
        </Button>
      </div>

      {error && <Banner tone="error">{error}</Banner>}

      {seriesBulkOpen && (
        <BulkStreamAttach
          titleId={titleId}
          episodes={allEpisodes}
          scope="series"
          onDone={() => setSeriesBulkOpen(false)}
        />
      )}

      {!title?.seasons.length && <p className="text-sm text-ash">No seasons yet.</p>}

      {title?.seasons.map((season) => (
        <div key={season.id} className="chamfer-sm space-y-3 border border-hairline bg-night-3 p-4">
          <div className="flex items-center gap-3">
            <h3 className="font-medium">{season.name || `Season ${season.number}`}</h3>
            <span className="text-xs text-ash-dim">
              {season.episodes.length} episode{season.episodes.length === 1 ? '' : 's'}
            </span>
            <button
              onClick={() => {
                if (confirm(`Delete season ${season.number} and its episodes?`)) deleteSeason.mutate(season.id);
              }}
              aria-label={`Delete season ${season.number}`}
              className="focus-brass ml-auto rounded p-1.5 text-ash-dim transition hover:bg-signal-bad/15 hover:text-signal-bad"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>

          <ul className="space-y-1">
            {season.episodes.map((episode) => (
              <li key={episode.id}>
                <div className="flex items-center gap-3 bg-black/30 px-3 py-2 text-sm">
                  <span className="w-6 shrink-0 text-ash-dim">{episode.number}</span>
                  <span className="min-w-0 flex-1 truncate">{episode.name}</span>

                  {episode.streamPath ? (
                    <code className="hidden max-w-56 truncate bg-bone/10 px-1.5 py-0.5 text-xs text-ash sm:block">
                      {episode.streamPath}
                    </code>
                  ) : (
                    <span className="label-mono hidden bg-signal-warn/15 px-1.5 py-0.5 text-signal-warn sm:block">
                      No stream
                    </span>
                  )}

                  <button
                    onClick={() => setEditing(editing === episode.id ? null : episode.id)}
                    aria-label={`Edit episode ${episode.number}`}
                    aria-expanded={editing === episode.id}
                    className={cn(
                      'focus-brass rounded p-1 transition hover:bg-bone/10 hover:text-bone',
                      editing === episode.id ? 'text-bone' : 'text-ash-dim',
                    )}
                  >
                    <PencilIcon className="h-4 w-4" />
                  </button>
                  <DeleteEpisodeButton id={episode.id} onDone={invalidate} />
                </div>

                {editing === episode.id && (
                  <EpisodeForm
                    titleId={titleId}
                    seasonId={season.id}
                    episode={episode}
                    onSaved={() => {
                      setEditing(null);
                      invalidate();
                    }}
                    onCancel={() => setEditing(null)}
                  />
                )}
              </li>
            ))}
          </ul>

          {editing === `new:${season.id}` ? (
            <EpisodeForm
              titleId={titleId}
              seasonId={season.id}
              nextNumber={(season.episodes.at(-1)?.number ?? 0) + 1}
              onSaved={() => {
                setEditing(null);
                invalidate();
              }}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" onClick={() => setEditing(`new:${season.id}`)}>
                Add episode
              </Button>
              {season.episodes.length > 0 && (
                <>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setSeriesBulkOpen(false);
                      setBulkPanel(
                        bulkPanel?.seasonId === season.id && bulkPanel.kind === 'streams'
                          ? null
                          : { seasonId: season.id, kind: 'streams' },
                      );
                    }}
                  >
                    {bulkPanel?.seasonId === season.id && bulkPanel.kind === 'streams'
                      ? 'Close bulk attach'
                      : 'Bulk attach streams'}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setBulkPanel(
                        bulkPanel?.seasonId === season.id && bulkPanel.kind === 'subtitles'
                          ? null
                          : { seasonId: season.id, kind: 'subtitles' },
                      )
                    }
                  >
                    {bulkPanel?.seasonId === season.id && bulkPanel.kind === 'subtitles'
                      ? 'Close bulk import'
                      : 'Bulk import subtitles'}
                  </Button>
                </>
              )}
            </div>
          )}

          {bulkPanel?.seasonId === season.id && bulkPanel.kind === 'streams' && (
            <BulkStreamAttach
              titleId={titleId}
              episodes={season.episodes.map((e) => ({
                id: e.id,
                number: e.number,
                name: e.name,
                seasonNumber: season.number,
              }))}
              scope="season"
              onDone={() => setBulkPanel(null)}
            />
          )}

          {bulkPanel?.seasonId === season.id && bulkPanel.kind === 'subtitles' && (
            <BulkSubtitleImport
              titleId={titleId}
              episodes={season.episodes.map((e) => ({ id: e.id, number: e.number, name: e.name }))}
              onDone={() => setBulkPanel(null)}
            />
          )}
        </div>
      ))}
    </Card>
  );
}

function DeleteEpisodeButton({ id, onDone }: { id: string; onDone: () => void }) {
  const remove = useMutation({
    mutationFn: () => api<void>(`/admin/episodes/${id}`, { method: 'DELETE' }),
    onSuccess: onDone,
  });
  return (
    <button
      onClick={() => {
        if (confirm('Delete this episode?')) remove.mutate();
      }}
      aria-label="Delete episode"
      className="focus-brass rounded p-1 text-ash-dim transition hover:text-signal-bad"
    >
      <TrashIcon className="h-4 w-4" />
    </button>
  );
}

/**
 * Creates or edits one episode. Passing `episode` switches it to edit mode and
 * targets the update endpoint — the path TMDB-imported episodes need, since
 * they arrive with metadata but no stream.
 */
function EpisodeForm({
  titleId,
  seasonId,
  episode,
  nextNumber,
  onSaved,
  onCancel,
}: {
  titleId: string;
  seasonId: string;
  episode?: AdminEpisode;
  nextNumber?: number;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const isEdit = Boolean(episode);

  const [draft, setDraft] = useState<UpsertEpisodeInput>({
    seasonId,
    number: episode?.number ?? nextNumber ?? 1,
    name: episode?.name ?? '',
    synopsis: episode?.synopsis ?? '',
    stillUrl: episode?.stillUrl ?? null,
    durationSec: episode?.durationSec ?? null,
    streamPath: episode?.streamPath ?? '',
  });
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const parsed = upsertEpisodeSchema.safeParse({ ...draft, seasonId });
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);

      return isEdit
        ? api(`/admin/titles/${titleId}/episodes/${episode!.id}`, { method: 'PUT', body: parsed.data })
        : api(`/admin/titles/${titleId}/episodes`, { method: 'POST', body: parsed.data });
    },
    onSuccess: () => {
      setError(null);
      onSaved();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : (err as Error).message),
  });

  const set = <K extends keyof UpsertEpisodeInput>(key: K, value: UpsertEpisodeInput[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="chamfer-sm mt-1 space-y-3 bg-black/40 p-4">
      {error && <Banner tone="error">{error}</Banner>}

      <div className="grid gap-3 md:grid-cols-4">
        <Field label="No.">
          <input
            type="number"
            className={inputClass}
            value={draft.number}
            onChange={(e) => set('number', Number(e.target.value))}
          />
        </Field>
        <div className="md:col-span-3">
          <Field label="Episode name">
            <input className={inputClass} value={draft.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
        </div>

        <div className="md:col-span-3">
          <Field
            label="Flussonic stream name"
            hint="Leave empty until the file exists — the episode stays hidden from playback until then."
          >
            <input
              className={inputClass}
              value={draft.streamPath}
              onChange={(e) => set('streamPath', e.target.value)}
              placeholder="ftp2/series/show/s01e01.mp4"
            />
          </Field>
        </div>
        <Field label="Duration (min)">
          <input
            type="number"
            className={inputClass}
            value={draft.durationSec ? Math.round(draft.durationSec / 60) : ''}
            onChange={(e) => set('durationSec', e.target.value ? Number(e.target.value) * 60 : null)}
          />
        </Field>

        <div className="md:col-span-4">
          <Field label="Synopsis">
            <textarea
              className={cn(inputClass, 'min-h-20 resize-y')}
              value={draft.synopsis}
              onChange={(e) => set('synopsis', e.target.value)}
            />
          </Field>
        </div>

        <div className="md:col-span-4">
          <ImageUpload kind="still" label="Still image" value={draft.stillUrl} onChange={(u) => set('stillUrl', u)} />
        </div>

        {isEdit && (
          <div className="md:col-span-4">
            <SubtitleUpload titleId={titleId} episodeId={episode!.id} label="Subtitles for this episode" />
          </div>
        )}

        {draft.streamPath && (
          <div className="md:col-span-4">
            <StreamTester streamPath={draft.streamPath} isLive={false} />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? 'Saving…' : isEdit ? 'Save episode' : 'Add episode'}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        {isEdit && draft.durationSec ? (
          <span className="text-xs text-ash-dim">{formatDuration(draft.durationSec)}</span>
        ) : null}
      </div>
    </div>
  );
}
