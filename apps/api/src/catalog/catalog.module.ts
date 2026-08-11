import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { BrowseService } from './browse.service';
import { CatalogService } from './catalog.service';

@Module({
  controllers: [CatalogController],
  providers: [CatalogService, BrowseService],
  exports: [CatalogService, BrowseService],
})
export class CatalogModule {}
