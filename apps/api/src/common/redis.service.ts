import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { Env } from '../config/env';

/**
 * Every piece of cross-request state lives here rather than in process memory,
 * so any number of API instances behave identically behind a load balancer.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(config: ConfigService<Env, true>) {
    this.client = new Redis(config.get('REDIS_URL', { infer: true }), {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async setJson(key: string, value: unknown, ttlSec: number): Promise<void> {
    await this.client.set(key, JSON.stringify(value), 'EX', ttlSec);
  }

  async invalidatePrefix(prefix: string): Promise<void> {
    const stream = this.client.scanStream({ match: `${prefix}*`, count: 200 });
    for await (const keys of stream as AsyncIterable<string[]>) {
      if (keys.length) await this.client.unlink(...keys);
    }
  }

  async ping(): Promise<boolean> {
    return (await this.client.ping()) === 'PONG';
  }
}
