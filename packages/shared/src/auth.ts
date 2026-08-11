import { z } from 'zod';
import { UserRole } from './enums';

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters');

export const registerSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: passwordSchema,
  name: z.string().min(1).max(60).trim(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const googleSignInSchema = z.object({
  idToken: z.string().min(20),
});
export type GoogleSignInInput = z.infer<typeof googleSignInSchema>;

/**
 * A browser sends no body at all — its refresh token lives only in the httpOnly
 * cookie. A native client (no cookie jar) sends it here instead, the same way it
 * received it: in the body, from an approved device-pairing poll.
 */
export const refreshRequestSchema = z
  .object({
    refreshToken: z.string().min(20).optional(),
  })
  // A browser's fetch() sends no body and no Content-Type at all for this call,
  // which Express leaves as `undefined` rather than `{}` — and z.object() rejects
  // undefined outright. Defaulting normalizes that back to a validate-able `{}`.
  .default({});
export type RefreshRequestInput = z.infer<typeof refreshRequestSchema>;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  /** Google's profile photo URL. Null for password-only accounts. */
  avatarUrl: string | null;
}

export interface AuthResponse {
  accessToken: string;
  expiresIn: number;
  user: AuthUser;
  /**
   * Only present for a native client's refresh call (no cookie, so the
   * rotated token has nowhere else to go). A browser must never see this —
   * it already has the new token via the httpOnly cookie, and exposing it
   * here would undermine the whole reason that cookie is httpOnly.
   */
  refreshToken?: string;
}

/** Decoded access-token payload. `pid` is present only after a profile is selected. */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  pid?: string;
  jti: string;
}
