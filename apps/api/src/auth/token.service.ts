import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, randomUUID } from 'node:crypto';
import type { AccessTokenPayload, UserRole } from '@ott/shared';
import { hashOpaqueToken } from '../common/crypto.util';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis.service';
import type { Env } from '../config/env';

const DENYLIST_PREFIX = 'auth:denied:';

export interface IssuedRefreshToken {
  token: string;
  familyId: string;
  expiresAt: Date;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async signAccessToken(user: { id: string; email: string; role: UserRole }, profileId?: string): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      jti: randomUUID(),
      ...(profileId ? { pid: profileId } : {}),
    };
    return this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      expiresIn: this.config.get('ACCESS_TOKEN_TTL_SEC', { infer: true }),
    });
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
      secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
    });
    if (await this.redis.client.exists(DENYLIST_PREFIX + payload.jti)) {
      throw new Error('Token revoked');
    }
    return payload;
  }

  /** Revokes a single access token until it would have expired anyway. */
  async denyAccessToken(jti: string): Promise<void> {
    await this.redis.client.set(
      DENYLIST_PREFIX + jti,
      '1',
      'EX',
      this.config.get('ACCESS_TOKEN_TTL_SEC', { infer: true }),
    );
  }

  async issueRefreshToken(userId: string, familyId?: string): Promise<IssuedRefreshToken> {
    const token = randomBytes(48).toString('base64url');
    const family = familyId ?? randomUUID();
    const ttl = this.config.get('REFRESH_TOKEN_TTL_SEC', { infer: true });
    const expiresAt = new Date(Date.now() + ttl * 1000);

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash: hashOpaqueToken(token), familyId: family, expiresAt },
    });

    return { token, familyId: family, expiresAt };
  }

  /**
   * Rotates a refresh token. Presenting an already-rotated token means it leaked,
   * so the whole family is revoked and the session is forced to re-authenticate.
   */
  async rotateRefreshToken(token: string): Promise<{ userId: string; next: IssuedRefreshToken } | null> {
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hashOpaqueToken(token) } });
    if (!record) return null;

    if (record.revokedAt || record.expiresAt < new Date()) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: record.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return null;
    }

    await this.prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });
    const next = await this.issueRefreshToken(record.userId, record.familyId);
    return { userId: record.userId, next };
  }

  async revokeRefreshToken(token: string): Promise<void> {
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hashOpaqueToken(token) } });
    if (!record) return;
    await this.prisma.refreshToken.updateMany({
      where: { familyId: record.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
