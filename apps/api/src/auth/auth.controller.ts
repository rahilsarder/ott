import { Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  googleSignInSchema,
  loginSchema,
  refreshRequestSchema,
  registerSchema,
  type AuthResponse,
  type GoogleSignInInput,
  type LoginInput,
  type RefreshRequestInput,
  type RegisterInput,
} from '@ott/shared';
import { zodPipe } from '../common/zod-validation.pipe';
import type { Env } from '../config/env';
import { AuthService } from './auth.service';
import { CurrentUser, Public, type RequestWithUser } from './auth.decorators';
import { clearRefreshCookie, REFRESH_COOKIE, setRefreshCookie } from './refresh-cookie.util';
import type { AccessTokenPayload } from '@ott/shared';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register')
  async register(
    @Body(zodPipe(registerSchema)) body: RegisterInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const { auth, refreshToken } = await this.auth.register(body);
    setRefreshCookie(res, refreshToken, this.config);
    return auth;
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  async login(
    @Body(zodPipe(loginSchema)) body: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const { auth, refreshToken } = await this.auth.login(body);
    setRefreshCookie(res, refreshToken, this.config);
    return auth;
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('google')
  async google(
    @Body(zodPipe(googleSignInSchema)) body: GoogleSignInInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const { auth, refreshToken } = await this.auth.loginWithGoogle(body.idToken);
    setRefreshCookie(res, refreshToken, this.config);
    return auth;
  }

  @Public()
  @HttpCode(200)
  @Post('refresh')
  async refresh(
    @Body(zodPipe(refreshRequestSchema)) body: RefreshRequestInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const cookieToken = req.cookies?.[REFRESH_COOKIE];
    const token = cookieToken ?? body.refreshToken;
    if (!token) throw new UnauthorizedException('No refresh token');
    const { auth, refreshToken } = await this.auth.refresh(token);
    setRefreshCookie(res, refreshToken, this.config);
    // A native client has no cookie jar to receive the rotated token from —
    // it must go in the body instead, exactly once, the same way it arrived.
    return cookieToken ? auth : { ...auth, refreshToken };
  }

  @Public()
  @HttpCode(204)
  @Post('logout')
  async logout(
    @Body(zodPipe(refreshRequestSchema)) body: RefreshRequestInput,
    @Req() req: RequestWithUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const token = req.cookies?.[REFRESH_COOKIE] ?? body.refreshToken;
    await this.auth.logout(token, req.user?.jti);
    clearRefreshCookie(res, this.config);
  }

  @Get('me')
  async me(@CurrentUser() user: AccessTokenPayload) {
    return this.auth.me(user.sub);
  }
}
