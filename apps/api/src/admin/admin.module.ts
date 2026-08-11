import { Module } from '@nestjs/common';
import { PlaybackModule } from '../playback/playback.module';
import { SubtitlesModule } from '../subtitles/subtitles.module';
import { TmdbModule } from '../tmdb/tmdb.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [PlaybackModule, TmdbModule, SubtitlesModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
