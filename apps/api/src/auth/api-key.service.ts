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
