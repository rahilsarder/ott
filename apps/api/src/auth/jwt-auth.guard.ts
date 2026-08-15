import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@ott/shared';
import { ApiKeyService } from './api-key.service';
import { IS_PUBLIC_KEY, ROLES_KEY, type RequestWithUser } from './auth.decorators';
import { TokenService } from './token.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly apiKeys: ApiKeyService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);

    const request = context.switchToHttp().getRequest<RequestWithUser>();

    const apiKeyHeader = request.headers['x-api-key'];
    // Only honored on routes that declare @Roles(...) — API keys are v1-scoped
    // to admin-equivalent access (see design spec's Auth model), so a route
    // with no role requirement (e.g. device pairing, profile selection) never
    // even looks at this header, regardless of whether it looks valid.
    if (typeof apiKeyHeader === 'string' && roles?.length) {
      const verified = await this.apiKeys.verify(apiKeyHeader);
      if (!verified) throw new UnauthorizedException('Invalid or revoked API key');
      // Synthesized to match AccessTokenPayload — API keys are full-admin
      // scoped in v1, so existing @Roles('ADMIN') checks pass unchanged.
      request.user = { sub: `apikey:${verified.id}`, email: 'api-key', role: 'ADMIN', jti: verified.id };
      return this.checkRoles(roles, request.user.role);
    }

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

    return this.checkRoles(roles, request.user.role);
  }

  private checkRoles(roles: UserRole[] | undefined, role: UserRole): boolean {
    if (roles?.length && !roles.includes(role)) {
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
