import { Controller, Get } from '@nestjs/common';
import type { HomeResponse } from '@ott/shared';
import { OptionalProfileId, Public } from '../auth/auth.decorators';
import { RailsService } from './rails.service';

@Public()
@Controller('home')
export class RailsController {
  constructor(private readonly rails: RailsService) {}

  @Get()
  home(@OptionalProfileId() profileId: string | null): Promise<HomeResponse> {
    return this.rails.home(profileId);
  }
}
