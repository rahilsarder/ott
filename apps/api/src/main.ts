import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import cookieParser from 'cookie-parser';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppModule } from './app.module';
import type { Env } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService<Env, true>);

  // nginx terminates TLS and forwards X-Forwarded-For; without this every client
  // IP would read as 127.0.0.1 and Flussonic tokens would bind to the wrong host.
  app.set('trust proxy', 1);

  app.setGlobalPrefix(config.get('API_PREFIX', { infer: true }), {
    exclude: ['healthz', 'readyz'],
  });
  app.use(cookieParser());

  app.enableCors({
    origin: config.get('WEB_ORIGIN', { infer: true }).split(',').map((o) => o.trim()),
    credentials: true,
  });

  if (config.get('STORAGE_DRIVER', { infer: true }) === 'local') {
    const uploadDir = resolve(config.get('LOCAL_UPLOAD_DIR', { infer: true }));
    mkdirSync(uploadDir, { recursive: true });
    // In production nginx serves this path directly; this keeps `pnpm dev` self-contained.
    app.useStaticAssets(uploadDir, { prefix: '/uploads/', maxAge: '7d', immutable: true });
  }

  app.enableShutdownHooks();

  const port = config.get('PORT', { infer: true });
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
