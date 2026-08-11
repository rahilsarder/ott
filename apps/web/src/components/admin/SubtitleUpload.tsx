'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SUBTITLE_LANGUAGES, languageLabel, type SubtitleTrack } from '@ott/shared';
import { ApiError, api, uploadForm } from '@/lib/api';
import { cn } from '@/lib/format';
import { TrashIcon } from '@/components/icons';
import { Field, inputClass } from './ui';

/**
 * One target's subtitle state — a movie (`episodeId` null) or a single
 * episode. All instances on the same title page share one query key, so
 * opening the form for episode 3 does not re-fetch what episode 1 already
 * loaded.
 */
export function SubtitleUpload({
  titleId,
  episodeId,
  label = 'Subtitles',
}: {
  titleId: string;
  episodeId: string | null;
  label?: string;
}) {
  const client = useQueryClient();
  const [language, setLanguage] = useState<string>('bn');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['admin', 'subtitles', titleId],
    queryFn: () => api<SubtitleTrack[]>(`/admin/titles/${titleId}/subtitles`),
  });

  const tracks = (data ?? []).filter((t) => t.episodeId === episodeId);
  const invalidate = () => void client.invalidateQueries({ queryKey: ['admin', 'subtitles', titleId] });

  const remove = useMutation({
    mutationFn: (id: string) => api<void>(`/admin/subtitles/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('titleId', titleId);
      if (episodeId) form.append('episodeId', episodeId);
      form.append('language', language);
      await uploadForm(`/admin/subtitles`, form);
      invalidate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Field label={label} hint="SRT, ASS/SSA or WebVTT — converted to WebVTT automatically. One file per language.">
      <div className="space-y-2">
        {tracks.length > 0 && (
          <ul className="space-y-1">
            {tracks.map((t) => (
              <li key={t.id} className="flex items-center gap-2 bg-black/30 px-2.5 py-1.5 text-xs">
                <span className="font-medium">{t.label}</span>
                <span className="text-ash-dim">{t.language}</span>
                <button
                  type="button"
                  onClick={() => remove.mutate(t.id)}
                  aria-label={`Remove ${t.label} subtitle`}
                  className="focus-brass ml-auto text-ash-dim transition hover:text-signal-bad"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-2">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className={cn(inputClass, 'w-36')}
          >
            {SUBTITLE_LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {languageLabel(code)}
              </option>
            ))}
          </select>
          <label className="chamfer-sm label-mono focus-brass cursor-pointer bg-bone/10 px-3 py-1.5 text-bone transition hover:bg-bone/20">
            {busy ? 'Uploading…' : 'Upload file'}
            <input
              type="file"
              accept=".srt,.ass,.ssa,.vtt"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
                e.target.value = '';
              }}
            />
          </label>
        </div>
        {error && <p className="text-xs text-signal-bad">{error}</p>}
      </div>
    </Field>
  );
}
