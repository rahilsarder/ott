'use client';

import { useCallback, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useHlsPlayer } from '@/lib/use-hls-player';
import { Button } from './ui';

/**
 * Plays a stream name straight from Flussonic so an admin can confirm it works
 * before publishing content that points at it — otherwise a typo in the stream
 * name only surfaces when a viewer hits a black screen.
 *
 * `isLive` must match the content: live uses index.m3u8 and carries a token,
 * VOD uses playlist.m3u8 and carries none. Testing the wrong shape would either
 * pass on a URL the player never requests, or fail on a perfectly good path.
 */
export function StreamTester({ streamPath, isLive }: { streamPath: string; isLive: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [manifestUrl, setManifestUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const mint = useCallback(async (): Promise<string | null> => {
    try {
      const res = await api<{ manifestUrl: string }>('/admin/preview', {
        method: 'POST',
        body: { streamPath, isLive },
      });
      return res.manifestUrl;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not build a preview URL');
      return null;
    }
  }, [streamPath, isLive]);

  const player = useHlsPlayer(videoRef, {
    manifestUrl,
    isLive,
    onTokenExpired: mint,
  });

  const test = async () => {
    setLoading(true);
    setError(null);
    const url = await mint();
    setLoading(false);
    if (url) setManifestUrl(url);
  };

  return (
    <div className="chamfer-sm space-y-3 border border-hairline bg-night-3 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="ghost" onClick={() => void test()} disabled={loading}>
          {loading ? 'Signing…' : manifestUrl ? 'Reload preview' : 'Test this stream'}
        </Button>
        <code className="truncate text-xs text-ash-dim">{streamPath}</code>
      </div>

      {(error || player.error) && <p className="text-sm text-signal-bad">{error ?? player.error}</p>}

      {manifestUrl && (
        <>
          <video ref={videoRef} controls autoPlay muted playsInline className="chamfer-sm w-full bg-black" />
          <p className="break-all text-xs text-ash-dim">{manifestUrl}</p>
          {player.buffering && !player.error && <p className="text-xs text-ash-dim">Buffering…</p>}
          {player.ready && !player.error && <p className="text-xs text-signal-ok">Stream is playable.</p>}
        </>
      )}
    </div>
  );
}
