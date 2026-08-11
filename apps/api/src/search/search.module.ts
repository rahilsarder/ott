import { Controller, Get, Module, Query } from '@nestjs/common';
import { ChannelsModule } from '../channels/channels.module';
import { Public } from '../auth/auth.decorators';
import { SearchService, type SearchResults } from './search.service';

@Public()
@Controller('search')
class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  run(@Query('q') q = ''): Promise<SearchResults> {
    return this.search.search(q);
  }
}

@Module({
  imports: [ChannelsModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
