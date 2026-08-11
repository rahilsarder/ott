/**
 * Bump when the shape of a rail changes.
 *
 * The cached payload is a rendered response, so a deploy that adds or renames
 * fields keeps serving the old shape until the TTL lapses — which looks exactly
 * like the new code not working. Versioning the key makes a deploy invalidate
 * itself.
 */
const RAILS_VERSION = 'v2';

export const HOME_CACHE_PREFIX = `rails:home:${RAILS_VERSION}:`;
export const HOME_CACHE_TTL_SEC = 300;

export const homeCacheKey = (profileId: string) => `${HOME_CACHE_PREFIX}${profileId}`;
