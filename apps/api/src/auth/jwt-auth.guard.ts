import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@ott/shared';
import { IS_PUBLIC_KEY, ROLES_KEY, type RequestWithUser } from './auth.decorators';
import { TokenService } from './token.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = extractBearer(request.headers.authorization);

    if (!token) {
      if (isPublic) return true;
      throw new UnauthorizedException('Missing access token');
    }

    try {
      request.user = await this.tokens.verifyAccessToken(token);
    } catch {
      // A public route with a stale token still renders, just anonymously.
      if (isPublic) return true;
      throw new UnauthorizedException('Invalid or expired access token');
    }

    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (roles?.length && !roles.includes(request.user.role)) {
      throw new ForbiddenException('Insufficient role');
    }

    return true;
  }
}

function extractBearer(header?: string): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value : null;
}
