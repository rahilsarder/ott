import { Module } from '@nestjs/common';
import { TmdbImportService } from './tmdb-import.service';
import { TmdbService } from './tmdb.service';

@Module({
  providers: [TmdbService, TmdbImportService],
  exports: [TmdbService, TmdbImportService],
})
export class TmdbModule {}
