/**
 * Client-side mirror of playback progress, keyed by kind+id. The server API
 * (`POST /progress`) is the source of truth for a signed-in profile and syncs
 * across devices, but it's skipped entirely for anonymous viewers (no
 * profile to scope it to) — this is what lets an anonymous viewer resume at
 * all, and gives every viewer an instant local fallback before any network
 * round-trip. Never authoritative over a real server position.
 */

const STORAGE_KEY = 'ott:progress';
/** Caps unbounded growth across a long viewing history — oldest entries drop first. */
const MAX_ENTRIES = 200;

interface LocalProgressEntry {
  positionSec: number;
  durationSec: number;
  updatedAt: number;
}

type Store = Record<string, LocalProgressEntry>;

function storageKey(kind: string, id: string): string {
  return `${kind}:${id}`;
}

function readStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    // Unavailable (private browsing, disabled storage) or corrupt — behave as empty.
    return {};
  }
}

function writeStore(store: Store): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage full or unavailable — progress just won't persist locally this session.
  }
}

export function getLocalProgress(kind: string, id: string): LocalProgressEntry | null {
  return readStore()[storageKey(kind, id)] ?? null;
}

export function saveLocalProgress(kind: string, id: string, positionSec: number, durationSec: number): void {
  const store = readStore();
  store[storageKey(kind, id)] = { positionSec, durationSec, updatedAt: Date.now() };

  const keys = Object.keys(store);
  if (keys.length > MAX_ENTRIES) {
    for (const key of keys.sort((a, b) => store[a].updatedAt - store[b].updatedAt).slice(0, keys.length - MAX_ENTRIES)) {
      delete store[key];
    }
  }

  writeStore(store);
}
