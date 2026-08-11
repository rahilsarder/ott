import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  browseQuerySchema,
  catalogQuerySchema,
  type BrowseQuery,
  type BrowseResponse,
  type CatalogQuery,
  type Genre,
  type Paginated,
  type PersonDetail,
  type TitleCard,
  type TitleDetail,
} from '@ott/shared';
import { OptionalProfileId, Public } from '../auth/auth.decorators';
import { zodPipe } from '../common/zod-validation.pipe';
import { BrowseService } from './browse.service';
import { CatalogService } from './catalog.service';

@Public()
@Controller('catalog')
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly browseService: BrowseService,
  ) {}

  @Get('genres')
  genres(): Promise<Genre[]> {
    return this.catalog.genres();
  }

  /** Legacy offset-paged list. Kept while the old screens still call it. */
  @Get('titles')
  titles(@Query(zodPipe(catalogQuerySchema)) query: CatalogQuery): Promise<Paginated<TitleCard>> {
    return this.catalog.browse(query);
  }

  @Get('browse')
  browse(@Query(zodPipe(browseQuerySchema)) query: BrowseQuery): Promise<BrowseResponse> {
    return this.browseService.browse(query);
  }

  @Get('titles/:slug')
  detail(@Param('slug') slug: string, @OptionalProfileId() profileId: string | null): Promise<TitleDetail> {
    return this.catalog.detail(slug, profileId);
  }

  @Get('people/:id')
  person(@Param('id') id: string): Promise<PersonDetail> {
    return this.catalog.person(id);
  }
}
