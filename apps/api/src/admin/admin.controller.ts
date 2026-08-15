import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { z } from 'zod';
import {
  apiKeyCreateSchema,
  bulkAttachStreamsSchema,
  bulkPublishSchema,
  bulkSubtitleMetaSchema,
  slugSchema,
  streamPathSchema,
  tmdbApplySchema,
  tmdbPreviewQuerySchema,
  tmdbSearchQuerySchema,
  upsertChannelSchema,
  upsertEpisodeSchema,
  upsertSeasonSchema,
  upsertSubtitleMetaSchema,
  upsertTitleSchema,
  type ApiKeyCreateInput,
  type AwaitingStreams,
  type BulkAttachStreamsInput,
  type BulkPublishInput,
  type BulkSubtitleMeta,
  type UpsertChannelInput,
  type UpsertEpisodeInput,
  type TmdbApplyInput,
  type TmdbApplyResult,
  type TmdbPreview,
  type TmdbPreviewQuery,
  type TmdbSearchItem,
  type TmdbSearchQuery,
  type UpsertSeasonInput,
  type UpsertSubtitleMeta,
  type UpsertTitleInput,
} from '@ott/shared';
import { Roles } from '../auth/auth.decorators';
import { zodPipe } from '../common/zod-validation.pipe';
import { FlussonicService } from '../playback/flussonic.service';
import { StorageService, type ImageKind } from '../storage/storage.service';
import { SubtitlesService } from '../subtitles/subtitles.service';
import { TmdbService } from '../tmdb/tmdb.service';
import { TmdbImportService } from '../tmdb/tmdb-import.service';
import { AdminService } from './admin.service';
import { parseXmltv } from './xmltv';

const IMAGE_KINDS: ImageKind[] = ['poster', 'backdrop', 'still', 'logo', 'avatar'];

const genreSchema = z.object({ name: z.string().min(1).max(60).trim(), slug: slugSchema });
const roleSchema = z.object({ role: z.enum(['USER', 'ADMIN']) });
const previewSchema = z.object({
  streamPath: streamPathSchema,
  /**
   * Live and VOD differ in both manifest filename and whether a token is
   * attached, so the preview has to be told which it is — otherwise it tests a
   * URL the player will never actually request.
   */
  isLive: z.boolean(),
});
const attachStreamSchema = z.object({ streamPath: streamPathSchema });
const epgImportSchema = z.object({
  channelId: z.string().min(1),
  xmltv: z.string().min(1).max(5_000_000),
  /** Optional XMLTV `channel` id, when the feed carries more than one channel. */
  xmltvChannelId: z.string().max(200).optional(),
});

@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly storage: StorageService,
    private readonly flussonic: FlussonicService,
    private readonly tmdb: TmdbService,
    private readonly tmdbImport: TmdbImportService,
    private readonly subtitles: SubtitlesService,
  ) {}

  /**
   * Signs a manifest for an arbitrary stream name so an admin can confirm a
   * stream actually plays before publishing a channel that points at it.
   */
  @HttpCode(200)
  @Post('preview')
  preview(@Body(zodPipe(previewSchema)) body: z.infer<typeof previewSchema>, @Req() req: Request) {
    const clientIp = req.ip ?? req.socket.remoteAddress ?? '0.0.0.0';
    const signed = this.flussonic.signManifest(body.streamPath, clientIp, body.isLive);
    return { manifestUrl: signed.url, expiresAt: signed.expiresAt };
  }

  @Get('titles')
  listTitles(@Query('q') q?: string) {
    return this.admin.listTitles(q);
  }

  @Get('titles/:id')
  getTitle(@Param('id') id: string) {
    return this.admin.getTitle(id);
  }

  @Post('titles')
  createTitle(@Body(zodPipe(upsertTitleSchema)) body: UpsertTitleInput) {
    return this.admin.createTitle(body);
  }

  @Put('titles/:id')
  updateTitle(@Param('id') id: string, @Body(zodPipe(upsertTitleSchema)) body: UpsertTitleInput) {
    return this.admin.updateTitle(id, body);
  }

  @HttpCode(204)
  @Delete('titles/:id')
  deleteTitle(@Param('id') id: string) {
    return this.admin.deleteTitle(id);
  }

  @Patch('titles/bulk-publish')
  bulkPublishTitles(@Body(zodPipe(bulkPublishSchema)) body: BulkPublishInput) {
    return this.admin.bulkPublishTitles(body.ids, body.isPublished);
  }

  @Patch('titles/:id/stream')
  attachMovieStream(@Param('id') id: string, @Body(zodPipe(attachStreamSchema)) body: z.infer<typeof attachStreamSchema>) {
    return this.admin.attachMovieStream(id, body.streamPath);
  }

  @Get('awaiting-streams')
  awaitingStreams(): Promise<AwaitingStreams> {
    return this.admin.awaitingStreams();
  }

  @Post('titles/:titleId/seasons')
  createSeason(@Param('titleId') titleId: string, @Body(zodPipe(upsertSeasonSchema)) body: UpsertSeasonInput) {
    return this.admin.createSeason(titleId, body);
  }

  @HttpCode(204)
  @Delete('seasons/:id')
  deleteSeason(@Param('id') id: string) {
    return this.admin.deleteSeason(id);
  }

  @Post('titles/:titleId/episodes')
  createEpisode(@Param('titleId') titleId: string, @Body(zodPipe(upsertEpisodeSchema)) body: UpsertEpisodeInput) {
    return this.admin.upsertEpisode(titleId, null, body);
  }

  /**
   * Registered before the `:episodeId` route below — Express/Nest match route
   * patterns in declaration order, so this static path has to come first or
   * "bulk-streams" would be swallowed as an episode id by the dynamic route.
   */
  @Put('titles/:titleId/episodes/bulk-streams')
  bulkAttachStreams(
    @Param('titleId') titleId: string,
    @Body(zodPipe(bulkAttachStreamsSchema)) body: BulkAttachStreamsInput,
  ) {
    return this.admin.bulkAttachStreams(titleId, body.items);
  }

  @Put('titles/:titleId/episodes/:episodeId')
  updateEpisode(
    @Param('titleId') titleId: string,
    @Param('episodeId') episodeId: string,
    @Body(zodPipe(upsertEpisodeSchema)) body: UpsertEpisodeInput,
  ) {
    return this.admin.upsertEpisode(titleId, episodeId, body);
  }

  @HttpCode(204)
  @Delete('episodes/:id')
  deleteEpisode(@Param('id') id: string) {
    return this.admin.deleteEpisode(id);
  }

  @Get('channels')
  listChannels() {
    return this.admin.listChannels();
  }

  @Post('channels')
  createChannel(@Body(zodPipe(upsertChannelSchema)) body: UpsertChannelInput) {
    return this.admin.createChannel(body);
  }

  @Put('channels/:id')
  updateChannel(@Param('id') id: string, @Body(zodPipe(upsertChannelSchema)) body: UpsertChannelInput) {
    return this.admin.updateChannel(id, body);
  }

  @HttpCode(204)
  @Delete('channels/:id')
  deleteChannel(@Param('id') id: string) {
    return this.admin.deleteChannel(id);
  }

  @Patch('channels/bulk-publish')
  bulkPublishChannels(@Body(zodPipe(bulkPublishSchema)) body: BulkPublishInput) {
    return this.admin.bulkPublishChannels(body.ids, body.isPublished);
  }

  @Get('genres')
  listGenres() {
    return this.admin.listGenres();
  }

  @Post('genres')
  createGenre(@Body(zodPipe(genreSchema)) body: z.infer<typeof genreSchema>) {
    return this.admin.createGenre(body.name, body.slug);
  }

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

  @Get('users')
  listUsers() {
    return this.admin.listUsers();
  }

  @Patch('users/:id/role')
  setRole(@Param('id') id: string, @Body(zodPipe(roleSchema)) body: z.infer<typeof roleSchema>) {
    return this.admin.setUserRole(id, body.role);
  }

  @Get('tmdb/status')
  tmdbStatus() {
    return { configured: this.tmdb.isConfigured };
  }

  @Get('tmdb/search')
  tmdbSearch(@Query(zodPipe(tmdbSearchQuerySchema)) query: TmdbSearchQuery): Promise<TmdbSearchItem[]> {
    return this.tmdbImport.search(query.kind, query.q);
  }

  /** Read-only: returns what TMDB has so the admin can review before committing. */
  @Get('tmdb/preview')
  tmdbPreview(@Query(zodPipe(tmdbPreviewQuerySchema)) query: TmdbPreviewQuery): Promise<TmdbPreview> {
    return this.tmdbImport.preview(query.kind, query.tmdbId);
  }

  @HttpCode(200)
  @Post('titles/:id/tmdb')
  async tmdbApply(
    @Param('id') id: string,
    @Body(zodPipe(tmdbApplySchema)) body: TmdbApplyInput,
  ): Promise<TmdbApplyResult> {
    // Re-fetched rather than trusting a client-supplied payload, so the write
    // always reflects TMDB and not whatever the browser posted.
    const preview = await this.tmdbImport.preview(body.kind, body.tmdbId);
    return this.tmdbImport.apply(id, preview, body.fields);
  }

  @Post('epg/import')
  async importEpg(@Body(zodPipe(epgImportSchema)) body: z.infer<typeof epgImportSchema>) {
    const programmes = parseXmltv(body.xmltv, body.xmltvChannelId);
    if (!programmes.length) {
      throw new BadRequestException('No <programme> entries found in that XMLTV payload');
    }
    return this.admin.importProgrammes(body.channelId, programmes);
  }

  @Post('uploads/:kind')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@Param('kind') kind: string, @UploadedFile() file: Express.Multer.File) {
    if (!IMAGE_KINDS.includes(kind as ImageKind)) {
      throw new BadRequestException(`kind must be one of: ${IMAGE_KINDS.join(', ')}`);
    }
    const url = await this.storage.saveImage(file, kind as ImageKind);
    return { url };
  }

  @Get('titles/:id/subtitles')
  listSubtitles(@Param('id') id: string) {
    return this.subtitles.listForTitle(id);
  }

  /** One file for a movie (no episodeId) or a single episode. */
  @Post('subtitles')
  @UseInterceptors(FileInterceptor('file'))
  uploadSubtitle(
    @Body(zodPipe(upsertSubtitleMetaSchema)) body: UpsertSubtitleMeta,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.subtitles.upload({
      titleId: body.titleId,
      episodeId: body.episodeId ?? null,
      language: body.language,
      label: body.label,
      file,
    });
  }

  /**
   * Many files at once, each already matched client-side to an episode — the
   * admin reviews and fixes the matches before anything uploads, so this
   * endpoint just has to trust the alignment between `files` and `episodeIds`.
   */
  @Post('titles/:titleId/subtitles/bulk')
  @UseInterceptors(FilesInterceptor('files'))
  bulkUploadSubtitles(
    @Param('titleId') titleId: string,
    @Body(zodPipe(bulkSubtitleMetaSchema)) body: BulkSubtitleMeta,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files?.length) throw new BadRequestException('No files uploaded');
    if (files.length !== body.episodeIds.length) {
      throw new BadRequestException('files and episodeIds must be the same length');
    }
    const items = files.map((file, i) => ({ episodeId: body.episodeIds[i], file }));
    return this.subtitles.bulkUpload(titleId, body.language, items);
  }

  @HttpCode(204)
  @Delete('subtitles/:id')
  deleteSubtitle(@Param('id') id: string) {
    return this.subtitles.remove(id);
  }
}
