import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { encodeStreamSegment, normalizeStreamPath } from '@ott/shared';
import type { Env } from '../config/env';

export interface SignedManifest {
  url: string;
  token: string;
  expiresAt: number;
}

/** Flussonic serves live under index.m3u8 and VOD files under playlist.m3u8. */
const LIVE_MANIFEST = 'index.m3u8';
const VOD_MANIFEST = 'playlist.m3u8';

/**
 * Builds Flussonic manifest URLs, signing them with the securelink scheme where
 * the stream is configured to require it.
 *
 * The token format was derived from a known-good token issued by the target
 * server (Flussonic 22.07) and reproduces it exactly:
 *
 *   hash  = sha1(stream + ip + starttime + endtime + key + salt)
 *   token = <hash>-<salt>-<endtime>-<starttime>
 *
 * where `salt` is 16 random bytes as hex, the timestamps are unix seconds, and
 * `stream` is the bare stream name — no leading slash and no manifest filename.
 *
 * `ip` is the viewer's address, or the literal string `no_check_ip` when the
 * securelink key is configured with `?no_check_ip=true`. That suffix lives in
 * Flussonic's own "Securelink auth key" field, so it arrives as part of the key
 * and is parsed out here rather than being signed as if it were key material.
 */
@Injectable()
export class FlussonicService implements OnModuleInit {
  private readonly logger = new Logger(FlussonicService.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  onModuleInit(): void {
    const scope = this.scope;
    if (scope === 'none') {
      this.logger.warn('FLUSSONIC_TOKEN_SCOPE=none — manifest URLs carry no token');
      return;
    }
    if (!this.key) {
      this.logger.warn(
        `FLUSSONIC_TOKEN_SCOPE=${scope} but FLUSSONIC_SECURELINK_KEY is empty — live URLs will be unsigned and Flussonic will reject them`,
      );
      return;
    }
    this.logger.log(
      `Flussonic securelink active (scope: ${scope}, ip check: ${this.skipIpCheck ? 'disabled' : 'enabled'})`,
    );
    this.logger.log(`Live URL shape: ${this.buildUrl('<stream>', '203.0.113.1', true)}`);
    this.logger.log(`VOD  URL shape: ${this.buildUrl('<path>/<file>.mp4', '203.0.113.1', false)}`);
  }

  get baseUrl(): string {
    return this.config.get('FLUSSONIC_BASE_URL', { infer: true }).replace(/\/+$/, '');
  }

  /**
   * The raw field may carry Flussonic options after a `?`, exactly as shown in
   * the admin UI (`Rahil?no_check_ip=true`). Only the part before it is key
   * material; signing the whole string would produce a hash the server can
   * never reproduce.
   */
  private get rawKey(): string {
    return this.config.get('FLUSSONIC_SECURELINK_KEY', { infer: true }).trim();
  }

  private get key(): string {
    const raw = this.rawKey;
    const q = raw.indexOf('?');
    return q === -1 ? raw : raw.slice(0, q);
  }

  private get skipIpCheck(): boolean {
    const q = this.rawKey.indexOf('?');
    if (q !== -1 && new URLSearchParams(this.rawKey.slice(q + 1)).get('no_check_ip') === 'true') return true;
    return !this.config.get('FLUSSONIC_BIND_IP', { infer: true });
  }

  private get scope(): 'live' | 'all' | 'none' {
    return this.config.get('FLUSSONIC_TOKEN_SCOPE', { infer: true });
  }

  private appliesTo(isLive: boolean): boolean {
    const scope = this.scope;
    return Boolean(this.key) && (scope === 'all' || (scope === 'live' && isLive));
  }

  private buildUrl(streamPath: string, clientIp: string, isLive: boolean): string {
    return this.signManifest(streamPath, clientIp, isLive).url;
  }

  signManifest(streamPath: string, clientIp: string, isLive: boolean): SignedManifest {
    const ttl = isLive
      ? this.config.get('LIVE_TOKEN_TTL_SEC', { infer: true })
      : this.config.get('PLAYBACK_TOKEN_TTL_SEC', { infer: true });

    const expiresAt = Date.now() + ttl * 1000;
    const manifest = `${this.baseUrl}/${encodeStreamPath(streamPath)}/${isLive ? LIVE_MANIFEST : VOD_MANIFEST}`;

    if (!this.appliesTo(isLive)) {
      return { url: manifest, token: '', expiresAt };
    }

    const token = this.createToken(streamPath, clientIp, Math.floor(Date.now() / 1000), Math.floor(expiresAt / 1000));
    return { url: `${manifest}?token=${token}`, token, expiresAt };
  }

  private createToken(streamPath: string, clientIp: string, startTime: number, endTime: number): string {
    const salt = randomBytes(16).toString('hex');
    const ip = this.skipIpCheck ? 'no_check_ip' : normaliseIp(clientIp);
    const hash = createHash('sha1')
      .update(`${streamPath}${ip}${startTime}${endTime}${this.key}${salt}`)
      .digest('hex');
    return `${hash}-${salt}-${endTime}-${startTime}`;
  }

  /**
   * Validates a token handed back by Flussonic's auth callback by recomputing
   * the digest from the values the token itself carries.
   */
  verifyToken(token: string, streamPath: string, requestIp: string): boolean {
    if (!this.key) return false;

    const parts = token.split('-');
    if (parts.length !== 4) return false;
    const [hash, salt, endRaw, startRaw] = parts as [string, string, string, string];

    const endTime = Number(endRaw);
    const startTime = Number(startRaw);
    if (!Number.isFinite(endTime) || !Number.isFinite(startTime)) return false;
    if (endTime * 1000 < Date.now()) return false;

    const ip = this.skipIpCheck ? 'no_check_ip' : normaliseIp(requestIp);
    const expected = createHash('sha1')
      .update(`${streamPath}${ip}${startTime}${endTime}${this.key}${salt}`)
      .digest('hex');

    return constantTimeEquals(expected, hash);
  }

  isCallerAllowed(ip: string): boolean {
    const allowlist = this.config
      .get('FLUSSONIC_AUTH_IP_ALLOWLIST', { infer: true })
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    if (allowlist.length === 0) return true;
    return allowlist.includes(normaliseIp(ip));
  }
}

/**
 * Percent-encodes each path segment while leaving `/` separators intact. VOD
 * paths routinely contain spaces, brackets and parentheses — `Pongala (2025)`,
 * `[Hindi-Malayalam]` — which must reach Flussonic encoded.
 *
 * Normalises first so a path that was stored already-encoded is not encoded a
 * second time. Rows saved before that normalisation existed still hold
 * `%20`-style paths, and re-encoding those would send `%2520` and 404.
 */
function encodeStreamPath(streamPath: string): string {
  return normalizeStreamPath(streamPath).split('/').map(encodeStreamSegment).join('/');
}

/** Express reports IPv4 clients as `::ffff:1.2.3.4`; Flussonic sees the bare v4 form. */
function normaliseIp(ip: string): string {
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
