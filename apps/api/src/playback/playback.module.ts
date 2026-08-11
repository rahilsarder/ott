import { Module } from '@nestjs/common';
import { SubtitlesModule } from '../subtitles/subtitles.module';
import { FlussonicService } from './flussonic.service';
import { PlaybackController } from './playback.controller';
import { PlaybackService } from './playback.service';

@Module({
  imports: [SubtitlesModule],
  controllers: [PlaybackController],
  providers: [PlaybackService, FlussonicService],
  exports: [FlussonicService, PlaybackService],
})
export class PlaybackModule {}
