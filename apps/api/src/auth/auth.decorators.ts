import { BadRequestException, SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AccessTokenPayload, UserRole } from '@ott/shared';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';

/** Opts an endpoint out of JwtAuthGuard, which is applied globally. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

export interface RequestWithUser extends Request {
  user?: AccessTokenPayload;
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AccessTokenPayload => {
  const request = ctx.switchToHttp().getRequest<RequestWithUser>();
  if (!request.user) throw new Error('CurrentUser used on an unauthenticated route');
  return request.user;
});

/**
 * The profile id carried by the access token. Personalised data is always keyed
 * off this rather than a request parameter, so a client cannot read another
 * profile's history by guessing an id.
 */
export const CurrentProfileId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<RequestWithUser>();
  const pid = request.user?.pid;
  if (!pid) throw new BadRequestException('Select a profile first');
  return pid;
});

/** Same as CurrentProfileId but yields null on public routes browsed anonymously. */
export const OptionalProfileId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string | null => {
  const request = ctx.switchToHttp().getRequest<RequestWithUser>();
  return request.user?.pid ?? null;
});
