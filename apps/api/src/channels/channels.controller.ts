import { Controller, Get, Param, Query } from '@nestjs/common';
import { guideQuerySchema, type Channel, type ChannelGroup, type Guide, type GuideQuery } from '@ott/shared';
import { Public } from '../auth/auth.decorators';
import { zodPipe } from '../common/zod-validation.pipe';
import { ChannelsService } from './channels.service';

@Public()
@Controller('channels')
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}

  @Get()
  list(): Promise<ChannelGroup[]> {
    return this.channels.listGrouped();
  }

  @Get('guide')
  guide(@Query(zodPipe(guideQuerySchema)) query: GuideQuery): Promise<Guide> {
    return this.channels.guide(query);
  }

  @Get(':slug')
  detail(@Param('slug') slug: string): Promise<Channel> {
    return this.channels.bySlug(slug);
  }
}
