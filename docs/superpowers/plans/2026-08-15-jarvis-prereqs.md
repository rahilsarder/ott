# Jarvis Prerequisites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an API-key auth path to `apps/api` and a non-interactive mode to `ops/deploy.sh`, so a future external service (Jarvis) can authenticate content writes and drive deployment without a human at a terminal.

**Architecture:** API keys are opaque, high-entropy secrets (matching the existing refresh-token pattern) sent via an `X-Api-Key` header, checked in the same global `JwtAuthGuard` that already handles JWTs — an API key authenticates as a synthesized ADMIN-role principal, so every existing `@Roles('ADMIN')` endpoint works unchanged. `deploy.sh` gains a `--non-interactive` flag that reads the same values from environment variables instead of prompting, failing fast if any required one is missing.

**Tech Stack:** NestJS, Prisma/Postgres, vitest (matches `apps/api`'s existing stack — see `apps/api/test/flussonic.service.spec.ts` for the established unit-test style: plain class instantiation with stubbed dependencies, no NestJS TestingModule, no real DB in tests).

## Global Constraints

- Reuse `hashOpaqueToken()` from `apps/api/src/common/crypto.util.ts` for hashing — do not add a second hashing scheme.
- Match the existing token-generation pattern: `randomBytes(N).toString('base64url')` (see `apps/api/src/auth/token.service.ts:63`).
- `AuthModule` is `@Global()` — new providers registered there are available everywhere without re-importing.
- `AdminController` already has `@Roles('ADMIN')` at the class level (`apps/api/src/admin/admin.controller.ts:84`) — new endpoints on it don't need it repeated.
- Tests go in `apps/api/test/*.spec.ts`, run via `pnpm --filter @ott/api test`.

---

## File structure for this plan

- Modify: `apps/api/prisma/schema.prisma` — new `ApiKey` model
- Create: `apps/api/src/auth/api-key.service.ts` — create/verify/list/revoke
- Create: `apps/api/test/api-key.service.spec.ts`
- Modify: `apps/api/src/auth/jwt-auth.guard.ts` — accept `X-Api-Key`
- Create: `apps/api/test/jwt-auth.guard.spec.ts`
- Modify: `apps/api/src/auth/auth.module.ts` — register `ApiKeyService`
- Modify: `packages/shared/src/admin.ts` — `apiKeyCreateSchema`
- Modify: `apps/api/src/admin/admin.controller.ts` — 3 new endpoints
- Modify: `apps/api/src/admin/admin.service.ts` — 3 new methods
- Modify: `ops/deploy.sh` — `--non-interactive` flag

---

### Task 1: `ApiKey` Prisma model + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

**Interfaces:**
- Produces: `ApiKey` table with columns `id, label, keyHash (unique), createdAt, lastUsedAt, revokedAt` — every later task in this plan depends on this existing.

- [ ] **Step 1: Add the model**

Add this model to `apps/api/prisma/schema.prisma` (anywhere alongside the other top-level models, e.g. near `RefreshToken`):

```prisma
model ApiKey {
  id         String    @id @default(cuid())
  label      String
  keyHash    String    @unique
  createdAt  DateTime  @default(now())
  lastUsedAt DateTime?
  revokedAt  DateTime?
}
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm --filter @ott/api exec prisma migrate dev --name add_api_key`

Expected: a new directory under `apps/api/prisma/migrations/` containing a `migration.sql` that creates the `ApiKey` table with a unique index on `keyHash`, and the command exits with "Your database is now in sync with your schema."

- [ ] **Step 3: Verify the client regenerated**

Run: `pnpm --filter @ott/api exec tsc -p tsconfig.json --noEmit`

Expected: no errors — this confirms `@prisma/client`'s generated types now include `ApiKey`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "Add ApiKey model"
```

---

### Task 2: `ApiKeyService`

**Files:**
- Create: `apps/api/src/auth/api-key.service.ts`
- Test: `apps/api/test/api-key.service.spec.ts`

**Interfaces:**
- Consumes: `hashOpaqueToken(token: string): string` from `apps/api/src/common/crypto.util.ts`; `PrismaService` (Prisma's generated `apiKey` model methods: `create`, `findUnique`, `update`, `findMany`).
- Produces: `class ApiKeyService { create(label: string): Promise<{id, label, key}>; verify(rawKey: string): Promise<{id: string} | null>; list(): Promise<{id, label, createdAt, lastUsedAt, revokedAt}[]>; revoke(id: string): Promise<void> }` — consumed by Task 3 (guard) and Task 4 (admin endpoints).

- [ ] **Step 1: Write the failing tests**

Create `apps/api/test/api-key.service.spec.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { ApiKeyService } from '../src/auth/api-key.service';

function makeService() {
  const rows = new Map<
    string,
    { id: string; label: string; keyHash: string; createdAt: Date; lastUsedAt: Date | null; revokedAt: Date | null }
  >();
  let nextId = 1;

  const prisma = {
    apiKey: {
      create: vi.fn(async ({ data }: { data: { label: string; keyHash: string } }) => {
        const id = `key_${nextId++}`;
        const row = { id, label: data.label, keyHash: data.keyHash, createdAt: new Date(), lastUsedAt: null, revokedAt: null };
        rows.set(id, row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: { where: { keyHash: string } }) => {
        return [...rows.values()].find((r) => r.keyHash === where.keyHash) ?? null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<{ lastUsedAt: Date; revokedAt: Date }> }) => {
        const row = rows.get(where.id)!;
        Object.assign(row, data);
        return row;
      }),
      findMany: vi.fn(async () => [...rows.values()]),
    },
  };

  return { service: new ApiKeyService(prisma as never) };
}

describe('ApiKeyService', () => {
  it('verify() accepts a freshly created key', async () => {
    const { service } = makeService();
    const created = await service.create('jarvis');

    const result = await service.verify(created.key);

    expect(result).toEqual({ id: created.id });
  });

  it('verify() rejects an unknown key', async () => {
    const { service } = makeService();
    expect(await service.verify('not-a-real-key')).toBeNull();
  });

  it('verify() rejects a revoked key', async () => {
    const { service } = makeService();
    const created = await service.create('jarvis');
    await service.revoke(created.id);

    expect(await service.verify(created.key)).toBeNull();
  });

  it('create() never returns the same raw key twice', async () => {
    const { service } = makeService();
    const a = await service.create('one');
    const b = await service.create('two');
    expect(a.key).not.toEqual(b.key);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @ott/api exec vitest run test/api-key.service.spec.ts`
Expected: FAIL — `Cannot find module '../src/auth/api-key.service'`

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/auth/api-key.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { hashOpaqueToken } from '../common/crypto.util';
import { PrismaService } from '../common/prisma.service';

export interface CreatedApiKey {
  id: string;
  label: string;
  /** Raw secret — returned only here, never stored or retrievable again. */
  key: string;
}

export interface ApiKeyRecord {
  id: string;
  label: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

@Injectable()
export class ApiKeyService {
  constructor(private readonly prisma: PrismaService) {}

  async create(label: string): Promise<CreatedApiKey> {
    const key = randomBytes(32).toString('base64url');
    const row = await this.prisma.apiKey.create({ data: { label, keyHash: hashOpaqueToken(key) } });
    return { id: row.id, label: row.label, key };
  }

  async list(): Promise<ApiKeyRecord[]> {
    return this.prisma.apiKey.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, label: true, createdAt: true, lastUsedAt: true, revokedAt: true },
    });
  }

  async revoke(id: string): Promise<void> {
    await this.prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  }

  /** Null if unknown or revoked. Updates lastUsedAt on success. */
  async verify(rawKey: string): Promise<{ id: string } | null> {
    const row = await this.prisma.apiKey.findUnique({ where: { keyHash: hashOpaqueToken(rawKey) } });
    if (!row || row.revokedAt) return null;
    await this.prisma.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
    return { id: row.id };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @ott/api exec vitest run test/api-key.service.spec.ts`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/auth/api-key.service.ts apps/api/test/api-key.service.spec.ts
git commit -m "Add ApiKeyService"
```

---

### Task 3: `JwtAuthGuard` accepts `X-Api-Key`

**Files:**
- Modify: `apps/api/src/auth/jwt-auth.guard.ts`
- Test: `apps/api/test/jwt-auth.guard.spec.ts`
- Modify: `apps/api/src/auth/auth.module.ts`

**Interfaces:**
- Consumes: `ApiKeyService.verify(rawKey: string): Promise<{id: string} | null>` (Task 2).
- Produces: any request carrying a valid `X-Api-Key` header is authenticated as `{sub: 'apikey:<id>', email: 'api-key', role: 'ADMIN', jti: <id>}` — matches `AccessTokenPayload`'s shape, so `@Roles('ADMIN')` and `@CurrentUser()` work unchanged for API-key callers.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/test/jwt-auth.guard.spec.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @ott/api exec vitest run test/jwt-auth.guard.spec.ts`
Expected: FAIL — constructor arity mismatch (`JwtAuthGuard` doesn't accept an `apiKeys` argument yet)

- [ ] **Step 3: Update the guard**

Replace the contents of `apps/api/src/auth/jwt-auth.guard.ts`:

```typescript
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

    const request = context.switchToHttp().getRequest<RequestWithUser>();

    const apiKeyHeader = request.headers['x-api-key'];
    if (typeof apiKeyHeader === 'string') {
      const verified = await this.apiKeys.verify(apiKeyHeader);
      if (!verified) throw new UnauthorizedException('Invalid or revoked API key');
      // Synthesized to match AccessTokenPayload — API keys are full-admin
      // scoped in v1, so existing @Roles('ADMIN') checks pass unchanged.
      request.user = { sub: `apikey:${verified.id}`, email: 'api-key', role: 'ADMIN', jti: verified.id };
      return this.checkRoles(context, request.user.role);
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

    return this.checkRoles(context, request.user.role);
  }

  private checkRoles(context: ExecutionContext, role: UserRole): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
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
```

- [ ] **Step 4: Register `ApiKeyService` in `AuthModule`**

Replace the contents of `apps/api/src/auth/auth.module.ts`:

```typescript
import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ApiKeyService } from './api-key.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';

@Global()
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, TokenService, ApiKeyService],
  exports: [TokenService, AuthService, ApiKeyService],
})
export class AuthModule {}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @ott/api exec vitest run test/jwt-auth.guard.spec.ts`
Expected: 3 passed

- [ ] **Step 6: Run the full test suite and typecheck**

Run: `pnpm --filter @ott/api test && pnpm --filter @ott/api exec tsc -p tsconfig.json --noEmit`
Expected: all existing tests still pass (confirms `JwtAuthGuard`'s new constructor arity doesn't break app bootstrap — Nest resolves it via DI, not the tests, so this step is really about nothing else silently broke), no type errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/auth/jwt-auth.guard.ts apps/api/src/auth/auth.module.ts apps/api/test/jwt-auth.guard.spec.ts
git commit -m "JwtAuthGuard: accept X-Api-Key as an alternate admin credential"
```

---

### Task 4: Admin API-key management endpoints

**Files:**
- Modify: `packages/shared/src/admin.ts`
- Modify: `apps/api/src/admin/admin.service.ts`
- Modify: `apps/api/src/admin/admin.controller.ts`

**Interfaces:**
- Consumes: `ApiKeyService` (Task 2), already available via `AdminModule`'s import of the (global) `AuthModule` exports.
- Produces: `POST /admin/api-keys` → `{id, label, key}`; `GET /admin/api-keys` → `ApiKeyRecord[]`; `DELETE /admin/api-keys/:id` → 204. This is how an admin (or Jarvis, once, via a JWT login) mints the key it then uses for all subsequent `X-Api-Key` calls.

- [ ] **Step 1: Add the shared schema**

Add to `packages/shared/src/admin.ts` (after the existing `adminTitleListQuerySchema` block):

```typescript
export const apiKeyCreateSchema = z.object({
  label: z.string().min(1).max(100),
});
export type ApiKeyCreateInput = z.infer<typeof apiKeyCreateSchema>;
```

- [ ] **Step 2: Add service methods**

In `apps/api/src/admin/admin.service.ts`, add `ApiKeyService` to the constructor and add three methods. Update the imports and constructor:

```typescript
import { ApiKeyService } from '../auth/api-key.service';
```

```typescript
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly apiKeys: ApiKeyService,
  ) {}
```

Add these methods to the `AdminService` class:

```typescript
  createApiKey(label: string) {
    return this.apiKeys.create(label);
  }

  listApiKeys() {
    return this.apiKeys.list();
  }

  async revokeApiKey(id: string): Promise<void> {
    await this.apiKeys.revoke(id);
  }
```

- [ ] **Step 3: Add controller endpoints**

In `apps/api/src/admin/admin.controller.ts`, add `apiKeyCreateSchema` and `type ApiKeyCreateInput` to the existing `@ott/shared` import block, then add these endpoints (near the other simple CRUD-style endpoints, e.g. after the `genres` ones):

```typescript
  @Post('api-keys')
  createApiKey(@Body(zodPipe(apiKeyCreateSchema)) body: ApiKeyCreateInput) {
    return this.admin.createApiKey(body.label);
  }

  @Get('api-keys')
  listApiKeys() {
    return this.admin.listApiKeys();
  }

  @HttpCode(204)
  @Delete('api-keys/:id')
  revokeApiKey(@Param('id') id: string) {
    return this.admin.revokeApiKey(id);
  }
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @ott/shared build && pnpm --filter @ott/api exec tsc -p tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual end-to-end verification**

This exercises the whole path built in this plan — no controller-level test harness exists in this codebase yet (see `apps/api/test/*.spec.ts` — all pure unit tests), so this is a documented manual check rather than an automated one, matching how admin endpoints have been verified elsewhere in this project.

Start the API locally (`pnpm --filter @ott/api dev`), log in as the seeded admin to get an access token, then:

```bash
# 1. Create a key (using a real admin JWT as $TOKEN)
curl -s -X POST http://localhost:4000/api/admin/api-keys \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"label":"test-key"}'
# Expect: {"id":"...","label":"test-key","key":"<a long random string>"}

# 2. Use the returned key on an existing admin endpoint, no JWT involved
curl -s http://localhost:4000/api/admin/titles?perPage=1 -H "X-Api-Key: <key from step 1>"
# Expect: 200, a valid paginated titles response

# 3. Revoke it
curl -s -X DELETE http://localhost:4000/api/admin/api-keys/<id from step 1> -H "Authorization: Bearer $TOKEN"
# Expect: 204

# 4. Same key, now revoked
curl -s -i http://localhost:4000/api/admin/titles?perPage=1 -H "X-Api-Key: <key from step 1>"
# Expect: 401 {"message":"Invalid or revoked API key",...}
```

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/admin.ts apps/api/src/admin/admin.service.ts apps/api/src/admin/admin.controller.ts
git commit -m "Add admin API-key management endpoints"
```

---

### Task 5: `deploy.sh` non-interactive mode

**Files:**
- Modify: `ops/deploy.sh`

**Interfaces:**
- Produces: `ops/deploy.sh <ssh-target> --non-interactive` reads `DEPLOY_PROTOCOL`, `DEPLOY_HOST_NAME`, `DEPLOY_CERTBOT_EMAIL` (only if `DEPLOY_PROTOCOL=https`), `DEPLOY_BRAND_NAME`, `DEPLOY_ADMIN_EMAIL`, `DEPLOY_FLUSSONIC_BASE_URL`, `DEPLOY_FLUSSONIC_SECURELINK_KEY` from the environment instead of prompting, exiting with a clear error naming the first missing required one instead of hanging on a `read`. This is the exact interface Jarvis's provisioning task will call.

- [ ] **Step 1: Add non-interactive flag parsing**

In `ops/deploy.sh`, find the argument-parsing loop (`for arg in "$@"; do ... done`, currently handling `--to-http` / `--to-http-finish`). Add a case for `--non-interactive`:

```bash
MODE="deploy"
NON_INTERACTIVE=false
TARGET=""
for arg in "$@"; do
  case "$arg" in
    --to-http) MODE="to-http" ;;
    --to-http-finish) MODE="to-http-finish" ;;
    --non-interactive) NON_INTERACTIVE=true ;;
    *) TARGET="$arg" ;;
  esac
done
```

- [ ] **Step 2: Add a helper that resolves a value from env in non-interactive mode, or prompts otherwise**

Add this function near the other helper functions (`current_web_origin`, `strip_scheme`):

```bash
# In non-interactive mode, reads $2 from the environment (erroring if unset
# and $3 is "required"). Otherwise prompts with $1 and falls back to $2
# already being pre-set as a default, matching the existing read -rp calls.
resolve_value() {
  local prompt="$1" env_var="$2" required="${3:-}"
  if [[ "$NON_INTERACTIVE" == true ]]; then
    local value="${!env_var:-}"
    if [[ -z "$value" && "$required" == "required" ]]; then
      echo "Error: $env_var must be set when using --non-interactive" >&2
      exit 1
    fi
    echo "$value"
  else
    read -rp "$prompt" value
    echo "$value"
  fi
}
```

- [ ] **Step 3: Replace the interactive prompts block with calls to the helper**

Find this block in the first-time-setup section:

```bash
echo "Protocol — choose http if this box only has a private IP / no domain pointed at it:"
select proto in "http  (private IP, no TLS)" "https (public domain, TLS via certbot)"; do
  case $REPLY in
    1) PROTOCOL=http; break ;;
    2) PROTOCOL=https; break ;;
    *) echo "Pick 1 or 2." ;;
  esac
done

if [[ "$PROTOCOL" == https ]]; then
  read -rp "Domain name (must already point at this box' public IP): " HOST_NAME
  read -rp "Email for certbot renewal notices: " CERTBOT_EMAIL
else
  read -rp "IP address or hostname of this box: " HOST_NAME
fi

read -rp "Brand name (site title / login screen wordmark) [Streamly]: " BRAND_NAME
BRAND_NAME="${BRAND_NAME:-Streamly}"

read -rp "Admin login email [admin@ott.local]: " SEED_ADMIN_EMAIL
SEED_ADMIN_EMAIL="${SEED_ADMIN_EMAIL:-admin@ott.local}"

read -rp "Flussonic base URL (e.g. http://cdn.example.com:8082): " FLUSSONIC_BASE_URL
while [[ -z "$FLUSSONIC_BASE_URL" ]]; do
  read -rp "  required — Flussonic base URL: " FLUSSONIC_BASE_URL
done

read -rp "Flussonic securelink key (blank = unsigned, no auth): " FLUSSONIC_SECURELINK_KEY

CATALOG_DUMP="ops/data/catalog-seed.dump"
LOAD_CATALOG=false
if [[ -f "$CATALOG_DUMP" ]]; then
  read -rp "Load the migrated catalog dump (15k+ titles) instead of demo seed data? [Y/n]: " ans
  [[ "${ans:-Y}" =~ ^[Yy] ]] && LOAD_CATALOG=true
fi
```

Replace it with:

```bash
if [[ "$NON_INTERACTIVE" == true ]]; then
  PROTOCOL="$(resolve_value "" DEPLOY_PROTOCOL required)"
  HOST_NAME="$(resolve_value "" DEPLOY_HOST_NAME required)"
  [[ "$PROTOCOL" == https ]] && CERTBOT_EMAIL="$(resolve_value "" DEPLOY_CERTBOT_EMAIL required)"
  BRAND_NAME="$(resolve_value "" DEPLOY_BRAND_NAME)"
  BRAND_NAME="${BRAND_NAME:-Streamly}"
  SEED_ADMIN_EMAIL="$(resolve_value "" DEPLOY_ADMIN_EMAIL)"
  SEED_ADMIN_EMAIL="${SEED_ADMIN_EMAIL:-admin@ott.local}"
  FLUSSONIC_BASE_URL="$(resolve_value "" DEPLOY_FLUSSONIC_BASE_URL required)"
  FLUSSONIC_SECURELINK_KEY="$(resolve_value "" DEPLOY_FLUSSONIC_SECURELINK_KEY)"
else
  echo "Protocol — choose http if this box only has a private IP / no domain pointed at it:"
  select proto in "http  (private IP, no TLS)" "https (public domain, TLS via certbot)"; do
    case $REPLY in
      1) PROTOCOL=http; break ;;
      2) PROTOCOL=https; break ;;
      *) echo "Pick 1 or 2." ;;
    esac
  done

  if [[ "$PROTOCOL" == https ]]; then
    read -rp "Domain name (must already point at this box' public IP): " HOST_NAME
    read -rp "Email for certbot renewal notices: " CERTBOT_EMAIL
  else
    read -rp "IP address or hostname of this box: " HOST_NAME
  fi

  read -rp "Brand name (site title / login screen wordmark) [Streamly]: " BRAND_NAME
  BRAND_NAME="${BRAND_NAME:-Streamly}"

  read -rp "Admin login email [admin@ott.local]: " SEED_ADMIN_EMAIL
  SEED_ADMIN_EMAIL="${SEED_ADMIN_EMAIL:-admin@ott.local}"

  read -rp "Flussonic base URL (e.g. http://cdn.example.com:8082): " FLUSSONIC_BASE_URL
  while [[ -z "$FLUSSONIC_BASE_URL" ]]; do
    read -rp "  required — Flussonic base URL: " FLUSSONIC_BASE_URL
  done

  read -rp "Flussonic securelink key (blank = unsigned, no auth): " FLUSSONIC_SECURELINK_KEY
fi

CATALOG_DUMP="ops/data/catalog-seed.dump"
LOAD_CATALOG=false
if [[ -f "$CATALOG_DUMP" ]]; then
  if [[ "$NON_INTERACTIVE" == true ]]; then
    LOAD_CATALOG=true
  else
    read -rp "Load the migrated catalog dump (15k+ titles) instead of demo seed data? [Y/n]: " ans
    [[ "${ans:-Y}" =~ ^[Yy] ]] && LOAD_CATALOG=true
  fi
fi
```

(The catalog-dump prompt defaults to "yes, load it" in non-interactive mode too, when the file's present — matches the interactive default and needs no separate env var.)

- [ ] **Step 4: Also guard the SSH-target prompt at the top of the script**

Find this near the top of the script:

```bash
if [[ -z "$TARGET" ]]; then
  read -rp "SSH target (alias from ~/.ssh/config, or user@host): " TARGET
fi
```

Replace with:

```bash
if [[ -z "$TARGET" ]]; then
  if [[ "$NON_INTERACTIVE" == true ]]; then
    echo "Error: SSH target must be passed as an argument when using --non-interactive" >&2
    exit 1
  fi
  read -rp "SSH target (alias from ~/.ssh/config, or user@host): " TARGET
fi
```

- [ ] **Step 5: Syntax check**

Run: `bash -n ops/deploy.sh`
Expected: no output (success)

- [ ] **Step 6: Update the header comment**

Add a line to the `# Usage:` block at the top of the file documenting the new flag:

```
#   ops/deploy.sh [ssh-target] --non-interactive   first-time setup, reading
#                                                   DEPLOY_PROTOCOL, DEPLOY_HOST_NAME,
#                                                   DEPLOY_CERTBOT_EMAIL (if https),
#                                                   DEPLOY_BRAND_NAME, DEPLOY_ADMIN_EMAIL,
#                                                   DEPLOY_FLUSSONIC_BASE_URL,
#                                                   DEPLOY_FLUSSONIC_SECURELINK_KEY from env
#                                                   instead of prompting
```

- [ ] **Step 7: Manual verification against a real box**

Deferred per the standing plan to validate `deploy.sh` against a throwaway box separately — when that happens, the non-interactive path should be exercised specifically:

```bash
DEPLOY_PROTOCOL=http \
DEPLOY_HOST_NAME=<test-box-ip> \
DEPLOY_BRAND_NAME=TestBrand \
DEPLOY_ADMIN_EMAIL=admin@test.local \
DEPLOY_FLUSSONIC_BASE_URL=http://cdn.example.com:8082 \
DEPLOY_FLUSSONIC_SECURELINK_KEY= \
ops/deploy.sh <ssh-target> --non-interactive
```

Expected: completes with no prompts, same final summary output as the interactive path.

- [ ] **Step 8: Commit**

```bash
git add ops/deploy.sh
git commit -m "deploy.sh: add --non-interactive mode"
```

---

### Task 6: Final verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full monorepo typecheck**

Run: `pnpm typecheck`
Expected: no errors across all packages.

- [ ] **Step 2: Full API test suite**

Run: `pnpm --filter @ott/api test`
Expected: all tests pass, including the 7 new ones added in Tasks 2 and 3.

- [ ] **Step 3: Full build**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 4: Confirm the plan's stated interfaces match reality**

Re-read `apps/api/src/auth/api-key.service.ts` and `apps/api/src/auth/jwt-auth.guard.ts` against Section 5 ("Auth model") of `docs/superpowers/specs/2026-08-15-jarvis-design.md` — confirm the `Deployment.contentApiKey` → `X-Api-Key` header contract this plan built is exactly what Jarvis's implementation plan will assume.
