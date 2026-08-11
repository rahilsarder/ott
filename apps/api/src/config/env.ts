import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  API_PREFIX: z.string().default('api'),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_SEC: z.coerce.number().int().default(900),
  REFRESH_TOKEN_TTL_SEC: z.coerce.number().int().default(60 * 60 * 24 * 30),

  /** Origin of the Flussonic server, e.g. https://stream.example.com. No trailing slash. */
  FLUSSONIC_BASE_URL: z.string().url(),
  /**
   * Flussonic's "Securelink auth key", copied verbatim from the stream's Auth
   * tab — including any `?no_check_ip=true` suffix, which is parsed out rather
   * than treated as key material.
   */
  FLUSSONIC_SECURELINK_KEY: z.string().default(''),
  /**
   * Where a token is attached. Flussonic setups commonly enforce auth on live
   * only; sending a token to an endpoint not configured for it is ignored at
   * best and rejected at worst.
   */
  FLUSSONIC_TOKEN_SCOPE: z.enum(['live', 'all', 'none']).default('live'),
  /** Comma-separated IPs allowed to call the Flussonic auth callback. */
  FLUSSONIC_AUTH_IP_ALLOWLIST: z.string().default(''),
  PLAYBACK_TOKEN_TTL_SEC: z.coerce.number().int().default(60 * 60 * 4),
  LIVE_TOKEN_TTL_SEC: z.coerce.number().int().default(60 * 60 * 8),
  /**
   * Flussonic ties a token to the viewer IP by default. Disable when clients sit
   * behind rotating NAT/CGNAT, which would otherwise break mid-session.
   */
  FLUSSONIC_BIND_IP: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),

  /**
   * TMDB credential. Accepts either a v4 read access token (a JWT, sent as a
   * bearer header) or a v3 API key (sent as a query parameter). Empty disables
   * the import feature rather than breaking the app.
   */
  TMDB_API_KEY: z.string().default(''),
  TMDB_LANGUAGE: z.string().default('en-US'),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  LOCAL_UPLOAD_DIR: z.string().default('./uploads'),
  PUBLIC_ASSET_BASE_URL: z.string().default('http://localhost:4000/uploads'),
  S3_BUCKET: z.string().default(''),
  S3_REGION: z.string().default(''),
  S3_ENDPOINT: z.string().default(''),
  S3_ACCESS_KEY_ID: z.string().default(''),
  S3_SECRET_ACCESS_KEY: z.string().default(''),

  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  COOKIE_DOMAIN: z.string().optional(),

  /**
   * Google OAuth client id, used to verify "Sign in with Google" id tokens
   * server-side (audience check only — no client secret needed for this
   * flow). Empty disables Google sign-in rather than breaking the app.
   */
  GOOGLE_CLIENT_ID: z.string().default(''),

  THROTTLE_TTL_SEC: z.coerce.number().int().default(60),
  THROTTLE_LIMIT: z.coerce.number().int().default(300),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
