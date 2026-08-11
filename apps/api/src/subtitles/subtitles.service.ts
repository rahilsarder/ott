import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { languageLabel, type BulkSubtitleResult, type SubtitleTrack } from '@ott/shared';
import type { Subtitle } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { StorageService } from '../storage/storage.service';
import { convertSubtitleToVtt } from './subtitle-convert';

const MAX_SUBTITLE_BYTES = 2 * 1024 * 1024;

@Injectable()
export class SubtitlesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async listForTitle(titleId: string): Promise<SubtitleTrack[]> {
    const rows = await this.prisma.subtitle.findMany({ where: { titleId }, orderBy: { createdAt: 'asc' } });
    return rows.map(toTrack);
  }

  /**
   * One file for one target — a movie (`episodeId` omitted) or a single
   * episode. Upserts on (title, episode, language) so re-uploading the same
   * language replaces the previous file rather than duplicating it.
   */
  async upload(params: {
    titleId: string;
    episodeId: string | null;
    language: string;
    label?: string;
    file: Express.Multer.File;
  }): Promise<SubtitleTrack> {
    const { titleId, episodeId, language, file } = params;

    if (episodeId) {
      const episode = await this.prisma.episode.findFirst({ where: { id: episodeId, titleId } });
      if (!episode) throw new NotFoundException('Episode not found on this title');
    } else {
      const title = await this.prisma.title.findUnique({ where: { id: titleId } });
      if (!title) throw new NotFoundException('Title not found');
    }

    const vttUrl = await this.convertAndStore(file);
    const label = params.label?.trim() || languageLabel(language);
    const episodeKey = episodeId ?? '';

    // Read what was there before the upsert so the file it pointed at can be
    // cleaned up afterward — the upsert itself only returns the new row.
    const previous = await this.prisma.subtitle.findUnique({
      where: { titleId_episodeKey_language: { titleId, episodeKey, language } },
      select: { vttUrl: true },
    });

    const row = await this.prisma.subtitle.upsert({
      where: { titleId_episodeKey_language: { titleId, episodeKey, language } },
      create: { titleId, episodeId, episodeKey, language, label, vttUrl },
      update: { label, vttUrl },
    });

    if (previous && previous.vttUrl !== vttUrl) {
      await this.storage.deleteByUrl(previous.vttUrl);
    }

    return toTrack(row);
  }

  /**
   * Every file gets its own attempt, so one mismatched episode never sinks the
   * rest of a season's import — the admin sees exactly which rows to redo.
   */
  async bulkUpload(
    titleId: string,
    language: string,
    items: { episodeId: string; file: Express.Multer.File }[],
  ): Promise<BulkSubtitleResult[]> {
    const results: BulkSubtitleResult[] = [];
    for (const item of items) {
      try {
        const subtitle = await this.upload({ titleId, episodeId: item.episodeId, language, file: item.file });
        results.push({ episodeId: item.episodeId, ok: true, subtitle });
      } catch (err) {
        results.push({
          episodeId: item.episodeId,
          ok: false,
          error: err instanceof Error ? err.message : 'Upload failed',
        });
      }
    }
    return results;
  }

  async remove(id: string): Promise<void> {
    const row = await this.prisma.subtitle.delete({ where: { id } });
    await this.storage.deleteByUrl(row.vttUrl);
  }

  /** The tracks the player attaches as native `<track>` elements. */
  async forSession(titleId: string, episodeId: string | null): Promise<{ label: string; language: string; url: string }[]> {
    const rows = await this.prisma.subtitle.findMany({
      where: { titleId, episodeKey: episodeId ?? '' },
      orderBy: { language: 'asc' },
    });
    return rows.map((r) => ({ label: r.label, language: r.language, url: r.vttUrl }));
  }

  private async convertAndStore(file: Express.Multer.File): Promise<string> {
    if (!file) throw new BadRequestException('No file uploaded');
    if (file.size > MAX_SUBTITLE_BYTES) throw new BadRequestException('Subtitle file must be 2 MB or smaller');

    let vtt: string;
    try {
      vtt = convertSubtitleToVtt(file.buffer, file.originalname);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Could not read that subtitle file');
    }
    return this.storage.saveSubtitle(vtt);
  }
}

function toTrack(row: Subtitle): SubtitleTrack {
  return {
    id: row.id,
    titleId: row.titleId,
    episodeId: row.episodeId,
    language: row.language,
    label: row.label,
    vttUrl: row.vttUrl,
    createdAt: row.createdAt.toISOString(),
  };
}
