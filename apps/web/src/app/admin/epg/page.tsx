'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Banner, Button, Card, Field, inputClass } from '@/components/admin/ui';
import { cn } from '@/lib/format';

interface AdminChannel {
  id: string;
  name: string;
}

export default function EpgAdmin() {
  const [channelId, setChannelId] = useState('');
  const [xmltvChannelId, setXmltvChannelId] = useState('');
  const [xmltv, setXmltv] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: channels } = useQuery({
    queryKey: ['admin', 'channels'],
    queryFn: () => api<AdminChannel[]>('/admin/channels'),
  });

  const importEpg = useMutation({
    mutationFn: () =>
      api<{ imported: number }>('/admin/epg/import', {
        method: 'POST',
        body: {
          channelId,
          xmltv,
          ...(xmltvChannelId.trim() ? { xmltvChannelId: xmltvChannelId.trim() } : {}),
        },
      }),
    onSuccess: (res) => {
      setError(null);
      setResult(`Imported ${res.imported} programmes.`);
      setXmltv('');
    },
    onError: (err) => {
      setResult(null);
      setError(err instanceof ApiError ? err.message : 'Import failed');
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-[-0.015em]">EPG import</h1>

      <Card className="space-y-4">
        <p className="text-sm text-ash">
          Paste an XMLTV document to load a channel&apos;s schedule. Importing the same window twice replaces it rather
          than duplicating, so re-running a feed is safe.
        </p>

        {error && <Banner tone="error">{error}</Banner>}
        {result && <Banner tone="success">{result}</Banner>}

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Channel">
            <select className={inputClass} value={channelId} onChange={(e) => setChannelId(e.target.value)}>
              <option value="">Select a channel…</option>
              {channels?.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.name}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="XMLTV channel id (optional)"
            hint="Set this when the feed contains several channels, to pick one out."
          >
            <input
              className={inputClass}
              value={xmltvChannelId}
              onChange={(e) => setXmltvChannelId(e.target.value)}
              placeholder="e.g. bbc1.uk"
            />
          </Field>
        </div>

        <Field label="XMLTV document">
          <textarea
            className={cn(inputClass, 'min-h-64 resize-y font-mono text-xs')}
            value={xmltv}
            onChange={(e) => setXmltv(e.target.value)}
            placeholder={'<tv>\n  <programme start="20240115203000 +0000" stop="20240115213000 +0000" channel="bbc1.uk">\n    <title>News at Eight</title>\n    <desc>The day\'s headlines.</desc>\n  </programme>\n</tv>'}
          />
        </Field>

        <Button onClick={() => importEpg.mutate()} disabled={!channelId || !xmltv.trim() || importEpg.isPending}>
          {importEpg.isPending ? 'Importing…' : 'Import schedule'}
        </Button>
      </Card>
    </div>
  );
}
