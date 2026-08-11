import { createHash } from 'node:crypto';

/** Hashes an opaque high-entropy secret (refresh tokens, device codes) before it's stored, so a DB dump never exposes the raw value. */
export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
