'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SUBTITLE_LANGUAGES, languageLabel, type BulkSubtitleResult } from '@ott/shared';
import { ApiError, uploadForm } from '@/lib/api';
import { cn } from '@/lib/format';
import { guessEpisodeNumber } from '@/lib/guess-episode-number';
import { Banner, Button, inputClass } from './ui';

interface EpisodeOption {
  id: string;
  number: number;
  name: string;
}

interface Row {
  file: File;
  episodeId: string;
}

export function BulkSubtitleImport({
  titleId,
  episodes,
  onDone,
}: {
  titleId: string;
  episodes: EpisodeOption[];
  onDone: () => void;
}) {
  const client = useQueryClient();
  const [language, setLanguage] = useState('bn');
  const [rows, setRows] = useState<Row[]>([]);
  const [results, setResults] = useState<BulkSubtitleResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pickFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const next = Array.from(files).map((file) => {
      const guessed = guessEpisodeNumber(file.name);
      const match = episodes.find((e) => e.number === guessed);
      return { file, episodeId: match?.id ?? '' };
    });
    setRows(next);
    setResults(null);
    setError(null);
  };

  const matchedCount = rows.filter((r) => r.episodeId).length;

  const importMutation = useMutation({
    mutationFn: async () => {
      const targeted = rows.filter((r) => r.episodeId);
      if (!targeted.length) throw new Error('Match at least one file to an episode first');

      const form = new FormData();
      targeted.forEach((r) => form.append('files', r.file));
      form.append('episodeIds', JSON.stringify(targeted.map((r) => r.episodeId)));
      form.append('language', language);
      return uploadForm<BulkSubtitleResult[]>(`/admin/titles/${titleId}/subtitles/bulk`, form);
    },
    onSuccess: (res) => {
      setResults(res);
      setError(null);
      void client.invalidateQueries({ queryKey: ['admin', 'subtitles', titleId] });
      if (res.every((r) => r.ok)) onDone();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : (err as Error).message),
  });

  return (
    <div className="chamfer-sm space-y-3 bg-black/40 p-4">
      <p className="text-xs text-ash">
        Pick every subtitle file for this season at once — filenames like{' '}
        <code className="bg-bone/10 px-1">S01E03</code>, <code className="bg-bone/10 px-1">1x03</code> or{' '}
        <code className="bg-bone/10 px-1">Episode 3</code> are matched to an episode automatically. Fix any row that
        guessed wrong — or guessed nothing — before importing.
      </p>

      {error && <Banner tone="error">{error}</Banner>}

      <div className="flex items-center gap-2">
        <select value={language} onChange={(e) => setLanguage(e.target.value)} className={cn(inputClass, 'w-36')}>
          {SUBTITLE_LANGUAGES.map((code) => (
            <option key={code} value={code}>
              {languageLabel(code)}
            </option>
          ))}
        </select>
        <label className="chamfer-sm label-mono focus-brass cursor-pointer bg-bone/10 px-3 py-1.5 text-bone transition hover:bg-bone/20">
          Choose files…
          <input
            type="file"
            multiple
            accept=".srt,.ass,.ssa,.vtt"
            className="hidden"
            onChange={(e) => pickFiles(e.target.files)}
          />
        </label>
        {rows.length > 0 && (
          <span className="text-xs text-ash-dim">
            {matchedCount} of {rows.length} matched
          </span>
        )}
      </div>

      {rows.length > 0 && (
        <div className="max-h-64 space-y-1.5 overflow-y-auto">
          {rows.map((row, i) => {
            const result = results?.find((r) => r.episodeId === row.episodeId);
            return (
              <div key={`${row.file.name}-${i}`} className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate text-ash">{row.file.name}</span>
                <select
                  value={row.episodeId}
                  onChange={(e) =>
                    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, episodeId: e.target.value } : r)))
                  }
                  className={cn(inputClass, 'w-48 py-1')}
                >
                  <option value="">— Skip —</option>
                  {episodes.map((ep) => (
                    <option key={ep.id} value={ep.id}>
                      E{ep.number} · {ep.name}
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
        <Button onClick={() => importMutation.mutate()} disabled={importMutation.isPending || matchedCount === 0}>
          {importMutation.isPending ? 'Importing…' : `Import ${matchedCount} subtitle${matchedCount === 1 ? '' : 's'}`}
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
