import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  heartbeatSchema,
  watchlistSchema,
  type ContinueItem,
  type HeartbeatInput,
  type TitleCard,
  type WatchlistInput,
} from '@ott/shared';
import { CurrentProfileId } from '../auth/auth.decorators';
import { zodPipe } from '../common/zod-validation.pipe';
import { ProgressService } from './progress.service';

@Controller()
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  @HttpCode(204)
  @Post('progress')
  heartbeat(
    @CurrentProfileId() profileId: string,
    @Body(zodPipe(heartbeatSchema)) body: HeartbeatInput,
  ): Promise<void> {
    return this.progress.heartbeat(profileId, body);
  }

  @Get('progress/continue')
  continueWatching(@CurrentProfileId() profileId: string): Promise<ContinueItem[]> {
    return this.progress.continueWatching(profileId);
  }

  @Get('watchlist')
  watchlist(@CurrentProfileId() profileId: string): Promise<TitleCard[]> {
    return this.progress.watchlist(profileId);
  }

  @HttpCode(204)
  @Post('watchlist')
  add(
    @CurrentProfileId() profileId: string,
    @Body(zodPipe(watchlistSchema)) body: WatchlistInput,
  ): Promise<void> {
    return this.progress.addToWatchlist(profileId, body.titleId);
  }

  @HttpCode(204)
  @Delete('watchlist/:titleId')
  remove(@CurrentProfileId() profileId: string, @Param('titleId') titleId: string): Promise<void> {
    return this.progress.removeFromWatchlist(profileId, titleId);
  }
}
