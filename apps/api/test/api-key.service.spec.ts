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
