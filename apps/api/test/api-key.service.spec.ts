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
      // Honors `select` like real Prisma would, so a test asserting a field's
      // absence actually exercises the service's select clause rather than
      // always seeing the full row regardless of what the service asked for.
      findMany: vi.fn(async (args: { select?: Record<string, boolean> } = {}) => {
        const all = [...rows.values()];
        if (!args.select) return all;
        return all.map((row) => {
          const picked: Record<string, unknown> = {};
          for (const key of Object.keys(args.select!)) {
            if (args.select![key]) picked[key] = (row as unknown as Record<string, unknown>)[key];
          }
          return picked;
        });
      }),
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

  it('list() never exposes keyHash', async () => {
    const { service } = makeService();
    await service.create('jarvis');

    const rows = await service.list();

    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty('keyHash');
    expect(rows[0]).toHaveProperty('label', 'jarvis');
  });
});
