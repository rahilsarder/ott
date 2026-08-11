import { randomBytes, randomInt } from 'node:crypto';

/** Unambiguous alphabet for a code a human reads off a screen and types — no 0/O/1/I/L. */
const USER_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const USER_CODE_LENGTH = 8;

/** The long-lived opaque secret a device polls with. Hashed before storage, like a refresh token. */
export function generateDeviceCode(): string {
  return randomBytes(32).toString('base64url');
}

/** The short code a human types (or that a QR encodes into a link). */
export function generateUserCode(): string {
  let code = '';
  for (let i = 0; i < USER_CODE_LENGTH; i++) {
    code += USER_CODE_ALPHABET[randomInt(USER_CODE_ALPHABET.length)];
  }
  return code;
}
