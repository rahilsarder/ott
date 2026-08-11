import { z } from 'zod';
import { PlayableKind } from './enums';

export const playbackRequestSchema = z.object({
  kind: PlayableKind,
  id: z.string().min(1),
});
export type PlaybackRequest = z.infer<typeof playbackRequestSchema>;

export interface PlaybackTrack {
  label: string;
  language: string;
  url: string;
}

export interface PlaybackSession {
  kind: PlayableKind;
  id: string;
  /** Fully-formed, token-signed HLS manifest URL pointing at Flussonic. */
  manifestUrl: string;
  isLive: boolean;
  /** Unix ms after which manifestUrl stops working and must be re-minted. */
  expiresAt: number;
  startPositionSec: number;
  durationSec: number | null;
  title: string;
  subtitle: string | null;
  backdropUrl: string | null;
  subtitles: PlaybackTrack[];
  /** Present for series episodes so the player can auto-advance. */
  nextEpisodeId: string | null;
}
