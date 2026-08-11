import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

/** `1h 42m` for browse chrome, where exact seconds are noise. */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return '';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

/** `1:02:03` / `4:07` for the player, where every second matters. */
export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

export function formatRating(rating: string | null): string {
  if (!rating) return '';
  return rating.replace(/_/g, '-');
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export const AVATAR_GRADIENTS: Record<string, string> = {
  red: 'from-red-500 to-rose-700',
  blue: 'from-sky-400 to-blue-700',
  green: 'from-emerald-400 to-green-700',
  yellow: 'from-amber-300 to-yellow-600',
  purple: 'from-violet-400 to-purple-700',
  orange: 'from-orange-400 to-orange-700',
  teal: 'from-teal-300 to-teal-700',
  pink: 'from-pink-400 to-fuchsia-700',
};
