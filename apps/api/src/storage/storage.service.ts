import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import sharp from 'sharp';
import type { Env } from '../config/env';

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

export type ImageKind = 'poster' | 'backdrop' | 'still' | 'logo' | 'avatar';

/** Target widths per artwork slot. Height follows the source aspect ratio. */
const TARGET_WIDTH: Record<ImageKind, number> = {
  poster: 500,
  backdrop: 1920,
  still: 640,
  logo: 600,
  avatar: 320,
};

/**
 * Single seam for artwork persistence. Local disk today; flipping
 * STORAGE_DRIVER to `s3` swaps the backend without touching callers, which is
 * what makes a second app server possible later.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  async saveImage(file: Express.Multer.File, kind: ImageKind): Promise<string> {
    if (!file) throw new BadRequestException('No file uploaded');
    if (file.size > MAX_UPLOAD_BYTES) throw new BadRequestException('Image must be 8 MB or smaller');
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException('Image must be JPEG, PNG, WebP or AVIF');
    }

    // Re-encoding through sharp also strips any payload hidden in a file that
    // merely claims to be an image.
    const processed = await sharp(file.buffer)
      .rotate()
      .resize({ width: TARGET_WIDTH[kind], withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();

    const key = `${kind}/${randomUUID()}.webp`;
    return this.writeLocal(key, processed);
  }

  /** Stores a converted WebVTT subtitle track. Text, not image — no sharp pass. */
  async saveSubtitle(vtt: string): Promise<string> {
    const key = `subtitles/${randomUUID()}.vtt`;
    return this.writeLocal(key, vtt);
  }

  /**
   * Best-effort cleanup for a URL this service previously issued — used when a
   * new upload replaces an old one (re-uploading a subtitle in the same
   * language, re-uploading an image) so the superseded file doesn't sit on
   * disk forever. Silently does nothing on a driver that isn't local, or a URL
   * this service didn't issue.
   */
  async deleteByUrl(url: string): Promise<void> {
    if (this.config.get('STORAGE_DRIVER', { infer: true }) !== 'local') return;

    const base = this.config.get('PUBLIC_ASSET_BASE_URL', { infer: true }).replace(/\/+$/, '');
    if (!url.startsWith(`${base}/`)) return;

    const key = url.slice(base.length + 1);
    const baseDir = resolve(this.config.get('LOCAL_UPLOAD_DIR', { infer: true }));
    await rm(join(baseDir, key), { force: true });
  }

  private async writeLocal(key: string, data: Buffer | string): Promise<string> {
    const driver = this.config.get('STORAGE_DRIVER', { infer: true });
    if (driver === 's3') {
      throw new BadRequestException(
        'STORAGE_DRIVER=s3 is declared but the S3 driver is not wired yet — see ops/deploy.md',
      );
    }

    const baseDir = resolve(this.config.get('LOCAL_UPLOAD_DIR', { infer: true }));
    const target = join(baseDir, key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, data);
    this.logger.log(`Stored ${key} (${Buffer.byteLength(data)} bytes)`);

    const base = this.config.get('PUBLIC_ASSET_BASE_URL', { infer: true }).replace(/\/+$/, '');
    return `${base}/${key}`;
  }
}
