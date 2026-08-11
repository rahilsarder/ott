/**
 * Collapses a title or query to a comparable form.
 *
 * "Spider-Man: Brand New Day", "spider man" and "spiderman" all reduce to
 * `spidermanbrandnewday`, so punctuation and spacing stop mattering — which is
 * how people actually type a title into a search box.
 *
 * Two deliberate choices:
 *
 * - Combining marks are stripped only from U+0300–U+036F. That block covers
 *   Latin, Greek and Cyrillic accents, so "Pokémon" matches "pokemon". Indic
 *   vowel signs live in their own script blocks and are left untouched —
 *   removing those would destroy the word rather than normalise it.
 * - Everything that is not a letter or a number goes, matched with the Unicode
 *   property escapes rather than `[a-z0-9]`, so Bengali, Malayalam and Japanese
 *   survive instead of being erased.
 *
 * The same function runs when a row is written and when a query arrives, so the
 * two forms can never drift apart.
 */
export function normalizeSearch(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

/** Shortest query worth running. Below this everything matches everything. */
export const MIN_SEARCH_LENGTH = 2;
