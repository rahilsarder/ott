import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  createProfileSchema,
  updateProfileSchema,
  type AccessTokenPayload,
  type AuthResponse,
  type CreateProfileInput,
  type Profile,
  type UpdateProfileInput,
} from '@ott/shared';
import { ConfigService } from '@nestjs/config';
import { zodPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from '../auth/auth.decorators';
import { TokenService } from '../auth/token.service';
import { AuthService } from '../auth/auth.service';
import type { Env } from '../config/env';
import { ProfilesService } from './profiles.service';

@Controller('profiles')
export class ProfilesController {
  constructor(
    private readonly profiles: ProfilesService,
    private readonly tokens: TokenService,
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload): Promise<Profile[]> {
    return this.profiles.list(user.sub);
  }

  @Post()
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body(zodPipe(createProfileSchema)) body: CreateProfileInput,
  ): Promise<Profile> {
    return this.profiles.create(user.sub, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body(zodPipe(updateProfileSchema)) body: UpdateProfileInput,
  ): Promise<Profile> {
    return this.profiles.update(user.sub, id, body);
  }

  @HttpCode(204)
  @Delete(':id')
  remove(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string): Promise<void> {
    return this.profiles.remove(user.sub, id);
  }

  /**
   * Exchanges the account-level token for one scoped to a profile. Every
   * personalised endpoint reads the profile from the token, never from a
   * client-supplied id, so one account cannot read another profile's history.
   */
  @HttpCode(200)
  @Post(':id/select')
  async select(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string): Promise<AuthResponse> {
    await this.profiles.assertOwned(user.sub, id);
    const account = await this.auth.me(user.sub);
    const accessToken = await this.tokens.signAccessToken(account, id);
    return {
      accessToken,
      expiresIn: this.config.get('ACCESS_TOKEN_TTL_SEC', { infer: true }),
      user: account,
    };
  }
}
