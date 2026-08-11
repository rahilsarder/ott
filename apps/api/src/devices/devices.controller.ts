import { Body, Controller, Get, HttpCode, Post, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import {
  deviceApproveSchema,
  deviceDenySchema,
  devicePollSchema,
  type AccessTokenPayload,
  type DeviceApproveInput,
  type DeviceDenyInput,
  type DevicePollInput,
  type DevicePollResponse,
  type DeviceStartResponse,
  type DeviceVerifyResponse,
} from '@ott/shared';
import { CurrentUser, Public } from '../auth/auth.decorators';
import { setRefreshCookie } from '../auth/refresh-cookie.util';
import { zodPipe } from '../common/zod-validation.pipe';
import type { Env } from '../config/env';
import { DevicesService } from './devices.service';

@Controller('devices')
export class DevicesController {
  constructor(
    private readonly devices: DevicesService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(200)
  @Post('start')
  start(): Promise<DeviceStartResponse> {
    return this.devices.start();
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('verify')
  verify(@Query('code') code = ''): Promise<DeviceVerifyResponse> {
    return this.devices.verify(code);
  }

  /**
   * A browser poller (the web QR-login page) picks up the session via the
   * cookie set here, exactly like `login`. A TV client has no cookie jar to
   * rely on, so the raw refreshToken also goes in the JSON body — the
   * backend doesn't need to know which kind of client is polling.
   */
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(200)
  @Post('poll')
  async poll(
    @Body(zodPipe(devicePollSchema)) body: DevicePollInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DevicePollResponse> {
    const result = await this.devices.poll(body.deviceCode);
    if (result.status === 'approved') {
      setRefreshCookie(res, result.refreshToken, this.config);
    }
    return result;
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(204)
  @Post('approve')
  async approve(
    @Body(zodPipe(deviceApproveSchema)) body: DeviceApproveInput,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<void> {
    await this.devices.approve(body.userCode, user.sub);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(204)
  @Post('deny')
  async deny(@Body(zodPipe(deviceDenySchema)) body: DeviceDenyInput): Promise<void> {
    await this.devices.deny(body.userCode);
  }
}
