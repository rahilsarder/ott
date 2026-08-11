'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BulkAttachResult } from '@ott/shared';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/format';
import { applyEpisodeNumber, applySeasonEpisode, guessEpisodeNumber, guessSeasonNumber } from '@/lib/guess-episode-number';
import { Banner, Button, inputClass } from './ui';

interface EpisodeOption {
  id: string;
  number: number;
  name: string;
  /** Only meaningful (and only shown) when scope is 'series' — episode numbers repeat across seasons. */
  seasonNumber: number;
}

interface Row {
  streamPath: string;
  episodeId: string;
}

/**
 * Pastes replace the whole draft rather than merge — a directory listing
 * copied fresh each time is the expected workflow, not incremental edits.
 */
function parsePaths(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function BulkStreamAttach({
  titleId,
  episodes,
  scope,
  onDone,
}: {
  titleId: string;
  episodes: EpisodeOption[];
  /** 'season': episode numbers alone identify a row. 'series': season + episode both matter, since episode numbers repeat across seasons. */
  scope: 'season' | 'series';
  onDone: () => void;
}) {
  const client = useQueryClient();
  const [mode, setMode] = useState<'list' | 'template'>('list');
  const [pasted, setPasted] = useState('');
  const [template, setTemplate] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [results, setResults] = useState<BulkAttachResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const buildRows = () => {
    const paths = parsePaths(pasted);
    const next = paths.map((streamPath) => {
      const guessedEpisode = guessEpisodeNumber(streamPath);
      const match =
        scope === 'series'
          ? episodes.find((e) => e.number === guessedEpisode && e.seasonNumber === guessSeasonNumber(streamPath))
          : episodes.find((e) => e.number === guessedEpisode);
      return { streamPath, episodeId: match?.id ?? '' };
    });
    setRows(next);
    setResults(null);
    setError(null);
  };

  /**
   * One real path in, one row per episode out — same review table as pasting
   * every path by hand, just generated instead of typed.
   */
  const generateRows = () => {
    const example = template.trim();
    if (!example) return;

    if (guessEpisodeNumber(example) === null) {
      setError("Couldn't find an episode number in that path — paste each path instead.");
      return;
    }

    let next: Row[];
    if (scope === 'series') {
      const exampleSeason = guessSeasonNumber(example);
      if (exampleSeason === null) {
        setError("Couldn't find a season number in that path — bulk-attach one season at a time instead.");
        return;
      }
      next = episodes.map((ep) => ({
        streamPath: applySeasonEpisode(example, ep.seasonNumber, ep.number) ?? example,
        episodeId: ep.id,
      }));
    } else {
      next = episodes.map((ep) => ({
        streamPath: applyEpisodeNumber(example, ep.number) ?? example,
        episodeId: ep.id,
      }));
    }
    setRows(next);
    setResults(null);
    setError(null);
  };

  const matchedCount = rows.filter((r) => r.episodeId).length;

  const attach = useMutation({
    mutationFn: async () => {
      const targeted = rows.filter((r) => r.episodeId);
      if (!targeted.length) throw new Error('Match at least one path to an episode first');

      return api<BulkAttachResult[]>(`/admin/titles/${titleId}/episodes/bulk-streams`, {
        method: 'PUT',
        body: { items: targeted.map((r) => ({ episodeId: r.episodeId, streamPath: r.streamPath })) },
      });
    },
    onSuccess: (res) => {
      setResults(res);
      setError(null);
      void client.invalidateQueries({ queryKey: ['admin', 'title', titleId] });
      if (res.every((r) => r.ok)) onDone();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : (err as Error).message),
  });

  const scopeWord = scope === 'series' ? 'series' : 'season';
  const episodeLabel = (ep: EpisodeOption) => (scope === 'series' ? `S${ep.seasonNumber}E${ep.number}` : `E${ep.number}`);

  return (
    <div className="chamfer-sm space-y-3 bg-black/40 p-4">
      <div className="flex items-center gap-2">
        <Button variant={mode === 'list' ? 'primary' : 'ghost'} onClick={() => setMode('list')}>
          Paste every path
        </Button>
        <Button variant={mode === 'template' ? 'primary' : 'ghost'} onClick={() => setMode('template')}>
          Generate from one path
        </Button>
      </div>

      {error && <Banner tone="error">{error}</Banner>}

      {mode === 'list' ? (
        <>
          <p className="text-xs text-ash">
            Paste every stream path for this {scopeWord}, one per line — filenames like{' '}
            <code className="bg-bone/10 px-1">S01E03</code>, <code className="bg-bone/10 px-1">1x03</code> or{' '}
            <code className="bg-bone/10 px-1">Episode 3</code> are matched to an episode automatically
            {scope === 'series' ? ' (by season and episode number together, since episode numbers repeat across seasons)' : ''}
            . Fix any row that guessed wrong — or guessed nothing — before attaching.
          </p>

          <textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder={'ftp2/tv-series/Show (2024)/Season 1/Show.S01E01.mp4\nftp2/tv-series/Show (2024)/Season 1/Show.S01E02.mp4'}
            className={cn(inputClass, 'min-h-24 resize-y font-mono text-xs')}
          />

          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={buildRows} disabled={!pasted.trim()}>
              Match paths
            </Button>
            {rows.length > 0 && (
              <span className="text-xs text-ash-dim">
                {matchedCount} of {rows.length} matched
              </span>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-ash">
            Paste the path for <em>one</em> episode — its {scope === 'series' ? 'season and ' : ''}episode number (
            <code className="bg-bone/10 px-1">S01E03</code>, <code className="bg-bone/10 px-1">2x15</code>,{' '}
            <code className="bg-bone/10 px-1">Episode 3</code>) is swapped in for every other episode in this{' '}
            {scopeWord}, everything else in the path — including a{' '}
            <code className="bg-bone/10 px-1">Season N</code> folder — left exactly as typed. Review the generated
            rows below before attaching.
          </p>

          <input
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            placeholder="ftp2/tv-series/Show (2024)/Season 2/Show (2024) - 2x15.mp4"
            className={cn(inputClass, 'font-mono text-xs')}
          />

          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={generateRows} disabled={!template.trim()}>
              Generate for {scopeWord}
            </Button>
            {rows.length > 0 && (
              <span className="text-xs text-ash-dim">
                {matchedCount} of {rows.length} matched
              </span>
            )}
          </div>
        </>
      )}

      {rows.length > 0 && (
        <div className="max-h-64 space-y-1.5 overflow-y-auto">
          {rows.map((row, i) => {
            const result = results?.find((r) => r.episodeId === row.episodeId);
            return (
              <div key={`${row.streamPath}-${i}`} className="flex items-center gap-2 text-xs">
                <code className="min-w-0 flex-1 truncate text-ash">{row.streamPath}</code>
                <select
                  value={row.episodeId}
                  onChange={(e) =>
                    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, episodeId: e.target.value } : r)))
                  }
                  className={cn(inputClass, 'w-56 py-1')}
                >
                  <option value="">— Skip —</option>
                  {episodes.map((ep) => (
                    <option key={ep.id} value={ep.id}>
                      {episodeLabel(ep)} · {ep.name}
                    </option>
                  ))}
                </select>
                {result && (
                  <span className={result.ok ? 'text-signal-ok' : 'text-signal-bad'}>{result.ok ? '✓' : '✕'}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button onClick={() => attach.mutate()} disabled={attach.isPending || matchedCount === 0}>
          {attach.isPending ? 'Attaching…' : `Attach ${matchedCount} stream${matchedCount === 1 ? '' : 's'}`}
        </Button>
      </div>

      {results && results.some((r) => !r.ok) && (
        <ul className="space-y-1 text-xs text-signal-bad">
          {results
            .filter((r) => !r.ok)
            .map((r) => (
              <li key={r.episodeId}>
                {episodes.find((e) => e.id === r.episodeId)?.name ?? r.episodeId}: {r.error}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
