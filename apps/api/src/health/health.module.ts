import { Controller, Get, Module, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../auth/auth.decorators';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis.service';

@Public()
@Controller()
class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Liveness: the process is up. A load balancer uses this to decide restarts. */
  @Get('healthz')
  live() {
    return { status: 'ok', uptime: Math.round(process.uptime()), pid: process.pid };
  }

  /** Readiness: dependencies answer, so this instance can serve traffic. */
  @Get('readyz')
  async ready() {
    const [db, cache] = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.redis.ping(),
    ]);

    const checks = {
      database: db.status === 'fulfilled',
      redis: cache.status === 'fulfilled' && cache.value === true,
    };

    if (!checks.database || !checks.redis) {
      throw new ServiceUnavailableException({ status: 'degraded', checks });
    }
    return { status: 'ok', checks };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
