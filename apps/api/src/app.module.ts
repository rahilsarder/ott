import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { CatalogModule } from './catalog/catalog.module';
import { ChannelsModule } from './channels/channels.module';
import { CoreModule } from './common/core.module';
import { validateEnv, type Env } from './config/env';
import { DevicesModule } from './devices/devices.module';
import { HealthModule } from './health/health.module';
import { PlaybackModule } from './playback/playback.module';
import { ProfilesModule } from './profiles/profiles.module';
import { ProgressModule } from './progress/progress.module';
import { RailsModule } from './rails/rails.module';
import { SearchModule } from './search/search.module';
import { TmdbModule } from './tmdb/tmdb.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv, cache: true }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        pinoHttp: {
          level: config.get('NODE_ENV', { infer: true }) === 'production' ? 'info' : 'debug',
          transport:
            config.get('NODE_ENV', { infer: true }) === 'production'
              ? undefined
              : { target: 'pino-pretty', options: { singleLine: true, translateTime: 'HH:MM:ss' } },
          autoLogging: { ignore: (req) => req.url === '/api/healthz' || req.url === '/api/readyz' },
          redact: ['req.headers.authorization', 'req.headers.cookie'],
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        throttlers: [
          {
            ttl: config.get('THROTTLE_TTL_SEC', { infer: true }) * 1000,
            limit: config.get('THROTTLE_LIMIT', { infer: true }),
          },
        ],
      }),
    }),
    CoreModule,
    StorageModule,
    AuthModule,
    ProfilesModule,
    DevicesModule,
    CatalogModule,
    ChannelsModule,
    PlaybackModule,
    ProgressModule,
    RailsModule,
    SearchModule,
    TmdbModule,
    AdminModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
