import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { OAuth2Client } from 'google-auth-library';
import type { AuthResponse, AuthUser, LoginInput, RegisterInput, UserRole } from '@ott/shared';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma.service';
import type { Env } from '../config/env';
import { TokenService } from './token.service';

const ARGON_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async register(input: RegisterInput): Promise<{ auth: AuthResponse; refreshToken: string }> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictException('An account with that email already exists');

    const passwordHash = await argon2.hash(input.password, ARGON_OPTIONS);

    // First account to register owns the instance — there is no other way to
    // bootstrap an admin without shipping default credentials.
    const isFirstUser = (await this.prisma.user.count()) === 0;

    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash,
        role: isFirstUser ? 'ADMIN' : 'USER',
        profiles: { create: { name: input.name.slice(0, 24), avatarKey: 'red' } },
      },
    });

    return this.buildSession(user);
  }

  async login(input: LoginInput): Promise<{ auth: AuthResponse; refreshToken: string }> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user || !user.passwordHash) {
      // Spend comparable time so response latency does not reveal account existence
      // (or that this email is Google-only and has no password to check).
      await argon2.hash(input.password, ARGON_OPTIONS);
      throw new UnauthorizedException('Incorrect email or password');
    }

    const valid = await argon2.verify(user.passwordHash, input.password);
    if (!valid) throw new UnauthorizedException('Incorrect email or password');

    return this.buildSession(user);
  }

  /**
   * Verifies a Google-issued id token (from Google Identity Services on the
   * frontend) and finds-or-creates the matching account. Links onto an
   * existing password account with the same email rather than creating a
   * duplicate one.
   */
  async loginWithGoogle(idToken: string): Promise<{ auth: AuthResponse; refreshToken: string }> {
    const clientId = this.config.get('GOOGLE_CLIENT_ID', { infer: true });
    if (!clientId) throw new UnauthorizedException('Google sign-in is not configured');

    const client = new OAuth2Client(clientId);
    let payload;
    try {
      const ticket = await client.verifyIdToken({ idToken, audience: clientId });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Invalid Google credential');
    }
    if (!payload?.email || !payload.email_verified) {
      throw new UnauthorizedException('Invalid Google credential');
    }

    // Refreshed on every Google sign-in (not just the first), so a changed Google
    // photo shows up here without the user having to do anything.
    const avatarUrl = payload.picture ?? null;

    let user = await this.prisma.user.findUnique({ where: { googleId: payload.sub } });
    if (user) {
      user = await this.prisma.user.update({ where: { id: user.id }, data: { avatarUrl } });
    } else {
      const existing = await this.prisma.user.findUnique({ where: { email: payload.email } });
      user = existing
        ? await this.prisma.user.update({ where: { id: existing.id }, data: { googleId: payload.sub, avatarUrl } })
        : await this.prisma.user.create({
            data: {
              email: payload.email,
              name: payload.name ?? payload.email.split('@')[0],
              googleId: payload.sub,
              avatarUrl,
              role: (await this.prisma.user.count()) === 0 ? 'ADMIN' : 'USER',
              profiles: { create: { name: (payload.name ?? payload.email).slice(0, 24), avatarKey: 'red' } },
            },
          });
    }

    return this.buildSession(user);
  }

  /** Issues a fresh session for an already-identified user — used once a device pairing request is approved. */
  async issueSessionForUser(userId: string): Promise<{ auth: AuthResponse; refreshToken: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Account no longer exists');
    return this.buildSession(user);
  }

  async refresh(refreshToken: string): Promise<{ auth: AuthResponse; refreshToken: string }> {
    const rotated = await this.tokens.rotateRefreshToken(refreshToken);
    if (!rotated) throw new UnauthorizedException('Session expired, please sign in again');

    const user = await this.prisma.user.findUnique({ where: { id: rotated.userId } });
    if (!user) throw new UnauthorizedException('Account no longer exists');

    const accessToken = await this.tokens.signAccessToken(user);
    return {
      auth: {
        accessToken,
        expiresIn: this.config.get('ACCESS_TOKEN_TTL_SEC', { infer: true }),
        user: toAuthUser(user),
      },
      refreshToken: rotated.next.token,
    };
  }

  async logout(refreshToken: string | undefined, accessJti: string | undefined): Promise<void> {
    if (refreshToken) await this.tokens.revokeRefreshToken(refreshToken);
    if (accessJti) await this.tokens.denyAccessToken(accessJti);
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Account no longer exists');
    return toAuthUser(user);
  }

  private async buildSession(user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    avatarUrl: string | null;
  }): Promise<{ auth: AuthResponse; refreshToken: string }> {
    const accessToken = await this.tokens.signAccessToken(user);
    const refresh = await this.tokens.issueRefreshToken(user.id);
    return {
      auth: {
        accessToken,
        expiresIn: this.config.get('ACCESS_TOKEN_TTL_SEC', { infer: true }),
        user: toAuthUser(user),
      },
      refreshToken: refresh.token,
    };
  }
}

function toAuthUser(user: {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl: string | null;
}): AuthUser {
  return { id: user.id, email: user.email, name: user.name, role: user.role, avatarUrl: user.avatarUrl };
}
