'use client';

import { useCallback, useEffect, useState } from 'react';

export interface SubtitleOption {
  index: number;
  label: string;
  language: string;
}

/**
 * Reads straight off `video.textTracks` rather than tracking two separate
 * lists for our own uploaded `<track>` elements and hls.js's embedded HLS
 * subtitle renditions. hls.js appends the embedded ones to the same
 * `textTracks` collection and watches for native `mode` changes to stay in
 * sync, so driving everything through one list is not a simplification for
 * our own sake — it is the interface hls.js is actually built around.
 */
export function useSubtitleTracks(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const [options, setOptions] = useState<SubtitleOption[]>([]);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const sync = () => {
      const list: SubtitleOption[] = [];
      let current: number | null = null;

      for (let i = 0; i < video.textTracks.length; i++) {
        const track = video.textTracks[i];
        if (track.kind !== 'subtitles' && track.kind !== 'captions') continue;
        list.push({ index: i, label: track.label || track.language || `Track ${i + 1}`, language: track.language });
        if (track.mode === 'showing') current = i;
      }

      setOptions(list);
      setActive(current);
    };

    sync();
    video.textTracks.addEventListener('addtrack', sync);
    video.textTracks.addEventListener('removetrack', sync);
    video.textTracks.addEventListener('change', sync);
    return () => {
      video.textTracks.removeEventListener('addtrack', sync);
      video.textTracks.removeEventListener('removetrack', sync);
      video.textTracks.removeEventListener('change', sync);
    };
  }, [videoRef]);

  const select = useCallback(
    (index: number | null) => {
      const video = videoRef.current;
      if (!video) return;
      for (let i = 0; i < video.textTracks.length; i++) {
        video.textTracks[i].mode = i === index ? 'showing' : 'disabled';
      }
      setActive(index);
    },
    [videoRef],
  );

  return { options, active, select };
}
