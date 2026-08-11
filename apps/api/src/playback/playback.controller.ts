import { Controller, ForbiddenException, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { PlayableKind, type PlaybackSession } from '@ott/shared';
import { CurrentProfileId, Public } from '../auth/auth.decorators';
import { FlussonicService } from './flussonic.service';
import { PlaybackService } from './playback.service';

@Controller('playback')
export class PlaybackController {
  constructor(
    private readonly playback: PlaybackService,
    private readonly flussonic: FlussonicService,
  ) {}

  @HttpCode(200)
  @Post(':kind/:id')
  async create(
    @Param('kind') kind: string,
    @Param('id') id: string,
    @CurrentProfileId() profileId: string,
    @Req() req: Request,
  ): Promise<PlaybackSession> {
    const parsedKind = PlayableKind.parse(kind);
    return this.playback.createSession(parsedKind, id, profileId, clientIpOf(req));
  }

  /**
   * Called by Flussonic itself on every session start when `auth` is pointed at
   * this URL. Answering 200/403 here is what actually enforces access — the
   * signed token alone only proves the URL came from us.
   */
  @Public()
  @Get('flussonic-auth')
  async flussonicAuth(
    @Query('token') token: string,
    @Query('name') streamName: string,
    @Query('ip') viewerIp: string,
    @Req() req: Request,
  ): Promise<{ status: 'ok' }> {
    if (!this.flussonic.isCallerAllowed(clientIpOf(req))) {
      throw new ForbiddenException('Caller not allowed');
    }
    if (!token || !streamName) throw new ForbiddenException('Missing token');
    if (!this.flussonic.verifyToken(token, streamName, viewerIp ?? clientIpOf(req))) {
      throw new ForbiddenException('Invalid token');
    }
    return { status: 'ok' };
  }
}

function clientIpOf(req: Request): string {
  // `trust proxy` is enabled in main.ts, so req.ip already reflects X-Forwarded-For.
  return req.ip ?? req.socket.remoteAddress ?? '0.0.0.0';
}
