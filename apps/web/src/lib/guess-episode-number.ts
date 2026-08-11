/**
 * Ordered from most to least specific. The first pattern that matches wins —
 * used both to guess an episode number from a filename and, via
 * applyEpisodeNumber, to find exactly where in a path that number lives so a
 * different one can be spliced in at the same spot. The first two patterns
 * additionally carry a season number as their first group.
 */
const SEASON_EPISODE_PATTERNS = [
  /[Ss](\d{1,2})[Ee](\d{1,3})/, // S01E03
  /(\d{1,2})[xX](\d{1,3})/, // 1x03
];
const EPISODE_ONLY_PATTERNS = [
  /[Ee]pisode\s*(\d{1,3})/i, // Episode 3
  /[Ee](\d{1,3})(?!\d)/, // E03
  /(\d{1,3})(?=\.\w+$)/, // bare number right before the file extension
  /(\d{1,3})\s*$/, // bare number at the end of a path with no extension
];
const EPISODE_NUMBER_PATTERNS = [...SEASON_EPISODE_PATTERNS, ...EPISODE_ONLY_PATTERNS];

/** A "Season 2" folder segment — independent of whatever the filename itself encodes. */
const SEASON_FOLDER_PATTERN = /\bSeason\s+(\d{1,3})\b/i;

/**
 * Guesses an episode number from a filename or pasted path, so a whole
 * season's files can be matched at once. Used for both bulk subtitle import
 * and bulk stream attach — the guess is always shown and editable before
 * anything is applied, so this only has to be a reasonable first pass, not
 * infallible.
 */
export function guessEpisodeNumber(name: string): number | null {
  for (const pattern of EPISODE_NUMBER_PATTERNS) {
    const match = name.match(pattern);
    if (!match) continue;
    const num = Number(match[match.length - 1]);
    if (Number.isFinite(num)) return num;
  }
  return null;
}

/**
 * Guesses a season number, checking a "Season N" folder segment first (most
 * explicit), then falling back to the season group in an S01E03/1x03-style
 * filename token. Returns null if neither is present — a path with only
 * "Episode 3" or "E03" carries no season signal at all.
 */
export function guessSeasonNumber(path: string): number | null {
  const folderMatch = path.match(SEASON_FOLDER_PATTERN);
  if (folderMatch) return Number(folderMatch[1]);
  for (const pattern of SEASON_EPISODE_PATTERNS) {
    const match = path.match(pattern);
    if (match) return Number(match[1]);
  }
  return null;
}

/**
 * Given one real path and a target episode number, finds the same digits
 * guessEpisodeNumber() would have read the episode number from, and swaps in
 * the new number at that exact spot — same zero-padding width, everything
 * else in the path (including a season folder or season number elsewhere in
 * the string) left untouched. Returns null if no pattern matches at all.
 *
 * This is what lets a whole season's stream paths be generated from a single
 * example path rather than pasted one by one.
 */
export function applyEpisodeNumber(path: string, episodeNumber: number): string | null {
  for (const pattern of EPISODE_NUMBER_PATTERNS) {
    const match = path.match(pattern);
    if (!match || match.index === undefined) continue;
    const numText = match[match.length - 1];
    if (!Number.isFinite(Number(numText))) continue;

    const numStart = match.index + match[0].length - numText.length;
    const numEnd = numStart + numText.length;
    const replacement = String(episodeNumber).padStart(numText.length, '0');
    return path.slice(0, numStart) + replacement + path.slice(numEnd);
  }
  return null;
}

/**
 * Same idea as applyEpisodeNumber, but for a whole series rather than one
 * season: also swaps in a season number, at every place it appears — a
 * "Season N" folder segment and/or the season group inside an S01E03/1x03
 * filename token, which are two independent spots in the string that both
 * need to move together. Returns null if the path has no recognizable
 * episode token at all (a season alone isn't enough to place an episode).
 */
export function applySeasonEpisode(path: string, season: number, episode: number): string | null {
  let result = path;

  const folderMatch = result.match(SEASON_FOLDER_PATTERN);
  if (folderMatch && folderMatch.index !== undefined) {
    const numText = folderMatch[1];
    const start = folderMatch.index + folderMatch[0].length - numText.length;
    const end = start + numText.length;
    result = result.slice(0, start) + String(season).padStart(numText.length, '0') + result.slice(end);
  }

  for (const pattern of SEASON_EPISODE_PATTERNS) {
    const match = result.match(pattern);
    if (!match || match.index === undefined) continue;

    const seasonText = match[1];
    const episodeText = match[2];
    const episodeStart = match.index + match[0].length - episodeText.length;
    const episodeEnd = episodeStart + episodeText.length;
    const seasonStart = match.index;
    const seasonEnd = seasonStart + seasonText.length;

    // Splice the later span (episode) first so the earlier span's (season) indices stay valid.
    result =
      result.slice(0, episodeStart) + String(episode).padStart(episodeText.length, '0') + result.slice(episodeEnd);
    result =
      result.slice(0, seasonStart) + String(season).padStart(seasonText.length, '0') + result.slice(seasonEnd);
    return result;
  }

  for (const pattern of EPISODE_ONLY_PATTERNS) {
    const match = result.match(pattern);
    if (!match || match.index === undefined) continue;
    const episodeText = match[match.length - 1];
    const start = match.index + match[0].length - episodeText.length;
    const end = start + episodeText.length;
    return result.slice(0, start) + String(episode).padStart(episodeText.length, '0') + result.slice(end);
  }

  return null;
}
