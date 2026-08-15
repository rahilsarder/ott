import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';

function makeContext(headers: Record<string, string>, isPublic = false) {
  const request = { headers, user: undefined as unknown } as { headers: Record<string, string>; user: unknown };
  const reflector = { getAllAndOverride: vi.fn((key: string) => (key === 'isPublic' ? isPublic : undefined)) };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
  return { context, request, reflector: reflector as unknown as Reflector };
}

describe('JwtAuthGuard — API key path', () => {
  it('authenticates as ADMIN when x-api-key is valid', async () => {
    const tokens = { verifyAccessToken: vi.fn() };
    const apiKeys = { verify: vi.fn().mockResolvedValue({ id: 'key_1' }) };
    const { context, request, reflector } = makeContext({ 'x-api-key': 'valid-key' });
    const guard = new JwtAuthGuard(tokens as never, apiKeys as never, reflector);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect((request.user as { role: string }).role).toBe('ADMIN');
    expect(tokens.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('rejects an invalid x-api-key without falling back to JWT', async () => {
    const tokens = { verifyAccessToken: vi.fn() };
    const apiKeys = { verify: vi.fn().mockResolvedValue(null) };
    const { context, reflector } = makeContext({ 'x-api-key': 'bad-key' });
    const guard = new JwtAuthGuard(tokens as never, apiKeys as never, reflector);

    await expect(guard.canActivate(context)).rejects.toThrow('Invalid or revoked API key');
  });

  it('falls through to JWT handling when no x-api-key header is present', async () => {
    const tokens = {
      verifyAccessToken: vi.fn().mockResolvedValue({ sub: 'u1', email: 'a@b.com', role: 'ADMIN', jti: 'j1' }),
    };
    const apiKeys = { verify: vi.fn() };
    const { context, reflector } = makeContext({ authorization: 'Bearer sometoken' });
    const guard = new JwtAuthGuard(tokens as never, apiKeys as never, reflector);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(apiKeys.verify).not.toHaveBeenCalled();
  });
});
