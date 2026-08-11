import type { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { Env } from '../config/env';

export const REFRESH_COOKIE = 'ott_rt';

function cookieOptions(config: ConfigService<Env, true>, maxAgeMs: number) {
  const isProd = config.get('NODE_ENV', { infer: true }) === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeMs,
    domain: config.get('COOKIE_DOMAIN', { infer: true }),
  };
}

export function setRefreshCookie(res: Response, token: string, config: ConfigService<Env, true>): void {
  const ttl = config.get('REFRESH_TOKEN_TTL_SEC', { infer: true });
  res.cookie(REFRESH_COOKIE, token, cookieOptions(config, ttl * 1000));
}

export function clearRefreshCookie(res: Response, config: ConfigService<Env, true>): void {
  res.clearCookie(REFRESH_COOKIE, cookieOptions(config, 0));
}
