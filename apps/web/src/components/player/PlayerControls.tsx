'use client';

import { useState } from 'react';
import type { PlaybackSession } from '@ott/shared';
import type { HlsQuality } from '@/lib/use-hls-player';
import type { SubtitleOption } from '@/lib/use-subtitle-tracks';
import { cn, formatClock } from '@/lib/format';
import { LiveDot } from '@/projection/ui';
import {
  ArrowLeftIcon,
  BackTenIcon,
  ForwardTenIcon,
  FullscreenExitIcon,
  FullscreenIcon,
  MuteIcon,
  PauseIcon,
  PlayIcon,
  SettingsIcon,
  SpeedIcon,
  SubtitlesIcon,
  VolumeIcon,
} from '@/components/icons';

const PLAYBACK_RATES = [1, 1.25, 1.5, 1.75, 2];

interface Props {
  session: PlaybackSession;
  visible: boolean;
  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  playbackRate: number;
  fullscreen: boolean;
  qualities: HlsQuality[];
  currentQuality: number;
  subtitleOptions: SubtitleOption[];
  activeSubtitle: number | null;
  onTogglePlay: () => void;
  onSeek: (value: number) => void;
  onSeekBy: (delta: number) => void;
  onVolume: (value: number) => void;
  onToggleMute: () => void;
  onPlaybackRate: (rate: number) => void;
  onToggleFullscreen: () => void;
  onQuality: (index: number) => void;
  onSubtitleSelect: (index: number | null) => void;
  onBack: () => void;
}

export function PlayerControls(props: Props) {
  const {
    session,
    visible,
    playing,
    currentTime,
    duration,
    volume,
    muted,
    playbackRate,
    fullscreen,
    qualities,
    currentQuality,
    subtitleOptions,
    activeSubtitle,
  } = props;

  const [openMenu, setOpenMenu] = useState<'quality' | 'subtitles' | 'speed' | null>(null);
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    /*
     * The root spans the whole player but must never receive pointer events:
     * it sits above the video and the error overlay, and would otherwise
     * swallow every click aimed at them. Only the two bars are interactive.
     */
    <div
      className={cn(
        'pointer-events-none absolute inset-0 z-20 flex flex-col justify-between transition-opacity duration-300',
        visible ? 'opacity-100' : 'opacity-0',
      )}
    >
      <header className={cn('flex items-start gap-4 p-5 md:p-7', visible && 'pointer-events-auto')}>
        <button
          onClick={props.onBack}
          aria-label="Back"
          className="focus-brass chamfer-sm bg-night/50 p-2.5 backdrop-blur transition hover:bg-night/80"
        >
          <ArrowLeftIcon className="h-6 w-6" />
        </button>
        <div className="min-w-0 pt-1">
          <h1 className="truncate text-lg font-semibold text-bone drop-shadow md:text-2xl">{session.title}</h1>
          {session.subtitle && <p className="truncate text-sm text-ash">{session.subtitle}</p>}
        </div>
        {session.isLive && (
          <span className="label-mono ml-auto flex shrink-0 items-center gap-1.5 bg-night/60 px-2.5 py-1.5 text-brass-hot backdrop-blur">
            <LiveDot />
            Live
          </span>
        )}
      </header>

      <div
        className={cn(
          'bg-gradient-to-t from-night/95 via-night/55 to-transparent px-5 pt-16 pb-5 md:px-8 md:pb-7',
          visible && 'pointer-events-auto',
        )}
      >
        {!session.isLive && (
          <div className="group relative mb-3">
            <div className="h-1 w-full overflow-hidden rounded-full bg-bone/20">
              <div className="h-full rounded-full bg-brass" style={{ width: `${progress}%` }} />
            </div>
            <input
              type="range"
              className="scrubber absolute inset-x-0 -top-1.5 h-4 w-full opacity-0 transition-opacity group-hover:opacity-100"
              min={0}
              max={duration || 0}
              step={0.5}
              value={currentTime}
              onChange={(e) => props.onSeek(Number(e.target.value))}
              onPointerUp={(e) => e.currentTarget.blur()}
              aria-label="Seek"
            />
          </div>
        )}

        <div className="flex min-w-0 items-center gap-1.5 sm:gap-3 md:gap-5">
          <ControlButton onClick={props.onTogglePlay} label={playing ? 'Pause' : 'Play'}>
            {playing ? <PauseIcon className="h-6 w-6 md:h-7 md:w-7" /> : <PlayIcon className="h-6 w-6 md:h-7 md:w-7" />}
          </ControlButton>

          {!session.isLive && (
            <>
              <ControlButton onClick={() => props.onSeekBy(-10)} label="Back 10 seconds">
                <BackTenIcon className="h-5 w-5 md:h-6 md:w-6" />
              </ControlButton>
              <ControlButton onClick={() => props.onSeekBy(10)} label="Forward 10 seconds">
                <ForwardTenIcon className="h-5 w-5 md:h-6 md:w-6" />
              </ControlButton>
            </>
          )}

          {/* Volume slider needs hover to reveal and is fiddly on a touchscreen anyway — hardware
              volume buttons already control it there, so only the mute toggle shows below sm. */}
          <div className="group/vol flex items-center gap-2">
            <ControlButton onClick={props.onToggleMute} label={muted ? 'Unmute' : 'Mute'}>
              {muted || volume === 0 ? (
                <MuteIcon className="h-5 w-5 md:h-6 md:w-6" />
              ) : (
                <VolumeIcon className="h-5 w-5 md:h-6 md:w-6" />
              )}
            </ControlButton>
            <input
              type="range"
              className="scrubber hidden h-1 w-0 rounded-full bg-bone/25 opacity-0 transition-all duration-200 sm:block group-hover/vol:w-24 group-hover/vol:opacity-100 focus:w-24 focus:opacity-100"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => props.onVolume(Number(e.target.value))}
              onPointerUp={(e) => e.currentTarget.blur()}
              aria-label="Volume"
            />
          </div>

          <span className="label-mono shrink-0 tabular-nums text-ash">
            {session.isLive ? 'Live' : `${formatClock(currentTime)} / ${formatClock(duration)}`}
          </span>

          <div className="ml-auto flex shrink-0 items-center gap-1.5 md:gap-3">
            {subtitleOptions.length > 0 && (
              <div className="relative">
                <ControlButton
                  onClick={() => setOpenMenu((m) => (m === 'subtitles' ? null : 'subtitles'))}
                  label="Subtitles"
                >
                  <SubtitlesIcon className={cn('h-5 w-5 md:h-6 md:w-6', activeSubtitle !== null && 'text-brass-hot')} />
                </ControlButton>
                {openMenu === 'subtitles' && (
                  <div className="chamfer-sm absolute right-0 bottom-12 w-44 overflow-hidden border border-hairline bg-night/97 py-1 text-sm backdrop-blur">
                    <MenuOption
                      label="Off"
                      active={activeSubtitle === null}
                      onClick={() => {
                        props.onSubtitleSelect(null);
                        setOpenMenu(null);
                      }}
                    />
                    {subtitleOptions.map((t) => (
                      <MenuOption
                        key={t.index}
                        label={t.label}
                        active={activeSubtitle === t.index}
                        onClick={() => {
                          props.onSubtitleSelect(t.index);
                          setOpenMenu(null);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {qualities.length > 1 && (
              <div className="relative">
                <ControlButton onClick={() => setOpenMenu((m) => (m === 'quality' ? null : 'quality'))} label="Quality">
                  <SettingsIcon className="h-5 w-5 md:h-6 md:w-6" />
                </ControlButton>
                {openMenu === 'quality' && (
                  <div className="chamfer-sm absolute right-0 bottom-12 w-40 overflow-hidden border border-hairline bg-night/97 py-1 text-sm backdrop-blur">
                    <MenuOption
                      label="Auto"
                      active={currentQuality === -1}
                      onClick={() => {
                        props.onQuality(-1);
                        setOpenMenu(null);
                      }}
                    />
                    {qualities.map((q) => (
                      <MenuOption
                        key={q.index}
                        label={`${q.height}p`}
                        active={currentQuality === q.index}
                        onClick={() => {
                          props.onQuality(q.index);
                          setOpenMenu(null);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="relative">
              <ControlButton onClick={() => setOpenMenu((m) => (m === 'speed' ? null : 'speed'))} label="Playback speed">
                <SpeedIcon className={cn('h-5 w-5 md:h-6 md:w-6', playbackRate !== 1 && 'text-brass-hot')} />
              </ControlButton>
              {openMenu === 'speed' && (
                <div className="chamfer-sm absolute right-0 bottom-12 w-32 overflow-hidden border border-hairline bg-night/97 py-1 text-sm backdrop-blur">
                  {PLAYBACK_RATES.map((rate) => (
                    <MenuOption
                      key={rate}
                      label={`${rate}x`}
                      active={playbackRate === rate}
                      onClick={() => {
                        props.onPlaybackRate(rate);
                        setOpenMenu(null);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            <ControlButton onClick={props.onToggleFullscreen} label="Fullscreen">
              {fullscreen ? (
                <FullscreenExitIcon className="h-5 w-5 md:h-6 md:w-6" />
              ) : (
                <FullscreenIcon className="h-5 w-5 md:h-6 md:w-6" />
              )}
            </ControlButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function ControlButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="focus-brass rounded-full p-1.5 text-bone/90 transition hover:scale-110 hover:text-brass-hot"
    >
      {children}
    </button>
  );
}

function MenuOption({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between px-4 py-2 text-left text-ash transition hover:bg-brass/10 hover:text-bone',
        active && 'font-semibold text-brass-hot',
      )}
    >
      {label}
      {active && <span aria-hidden>✓</span>}
    </button>
  );
}
