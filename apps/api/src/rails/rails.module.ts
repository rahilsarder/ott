import { Module } from '@nestjs/common';
import { ChannelsModule } from '../channels/channels.module';
import { ProgressModule } from '../progress/progress.module';
import { RailsController } from './rails.controller';
import { RailsService } from './rails.service';

@Module({
  imports: [ProgressModule, ChannelsModule],
  controllers: [RailsController],
  providers: [RailsService],
})
export class RailsModule {}
