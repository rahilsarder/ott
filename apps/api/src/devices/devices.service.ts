import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DevicePollResponse, DeviceStartResponse, DeviceVerifyResponse } from '@ott/shared';
import { AuthService } from '../auth/auth.service';
import { hashOpaqueToken } from '../common/crypto.util';
import { PrismaService } from '../common/prisma.service';
import type { Env } from '../config/env';
import { generateDeviceCode, generateUserCode } from './device-code.util';

const EXPIRY_SEC = 10 * 60;
const POLL_INTERVAL_SEC = 5;

@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly auth: AuthService,
  ) {}

  async start(): Promise<DeviceStartResponse> {
    const deviceCode = generateDeviceCode();
    const userCode = generateUserCode();
    const expiresAt = new Date(Date.now() + EXPIRY_SEC * 1000);

    await this.prisma.deviceAuthRequest.create({
      data: { deviceCodeHash: hashOpaqueToken(deviceCode), userCode, expiresAt },
    });

    const webOrigin = this.config
      .get('WEB_ORIGIN', { infer: true })
      .split(',')[0]
      .trim();

    return {
      deviceCode,
      userCode,
      verificationUrl: `${webOrigin}/link`,
      verificationUrlComplete: `${webOrigin}/link?code=${userCode}`,
      expiresIn: EXPIRY_SEC,
      interval: POLL_INTERVAL_SEC,
    };
  }

  async verify(userCode: string): Promise<DeviceVerifyResponse> {
    const record = await this.prisma.deviceAuthRequest.findUnique({ where: { userCode } });
    return { valid: Boolean(record && record.status === 'PENDING' && record.expiresAt > new Date()) };
  }

  async approve(userCode: string, userId: string): Promise<void> {
    await this.transition(userCode, 'APPROVED', userId);
  }

  async deny(userCode: string): Promise<void> {
    await this.transition(userCode, 'DENIED');
  }

  /** Same rejection either way (missing/expired/already-resolved) — no signal for guessing codes. */
  private async transition(userCode: string, status: 'APPROVED' | 'DENIED', userId?: string): Promise<void> {
    const record = await this.prisma.deviceAuthRequest.findUnique({ where: { userCode } });
    if (!record || record.status !== 'PENDING' || record.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired code');
    }
    await this.prisma.deviceAuthRequest.update({
      where: { id: record.id },
      data: { status, ...(userId ? { userId } : {}) },
    });
  }

  async poll(deviceCode: string): Promise<DevicePollResponse> {
    const record = await this.prisma.deviceAuthRequest.findUnique({
      where: { deviceCodeHash: hashOpaqueToken(deviceCode) },
    });
    if (!record || record.expiresAt < new Date()) return { status: 'expired' };

    const now = new Date();
    const tooSoon = record.lastPolledAt && now.getTime() - record.lastPolledAt.getTime() < POLL_INTERVAL_SEC * 1000;
    await this.prisma.deviceAuthRequest.update({ where: { id: record.id }, data: { lastPolledAt: now } });
    if (tooSoon) return { status: 'slow_down' };

    if (record.status === 'DENIED') return { status: 'denied' };
    if (record.status === 'PENDING') return { status: 'pending' };

    // APPROVED — issue tokens exactly once; a replayed deviceCode reads as expired, not approved-again.
    if (record.consumedAt || !record.userId) return { status: 'expired' };
    await this.prisma.deviceAuthRequest.update({ where: { id: record.id }, data: { consumedAt: now } });

    const { auth, refreshToken } = await this.auth.issueSessionForUser(record.userId);
    return { status: 'approved', accessToken: auth.accessToken, refreshToken, expiresIn: auth.expiresIn, user: auth.user };
  }
}
