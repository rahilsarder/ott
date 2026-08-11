import { Injectable } from '@nestjs/common';
import { MIN_SEARCH_LENGTH, normalizeSearch, type Channel, type TitleCard } from '@ott/shared';
import { PrismaService } from '../common/prisma.service';
import { titleCardSelect, toTitleCard } from '../catalog/catalog.mapper';
import { ChannelsService } from '../channels/channels.service';

export interface SearchResults {
  query: string;
  titles: TitleCard[];
  channels: Channel[];
}

/**
 * How close a trigram match has to be before it counts. Low enough to forgive a
 * dropped or transposed letter, high enough that a three-letter query does not
 * drag in the whole catalogue.
 */
const SIMILARITY_FLOOR = 0.25;

const MAX_RESULTS = 40;

interface Ranked {
  id: string;
  rank: number;
  sim: number;
}

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly channels: ChannelsService,
  ) {}

  /**
   * Matching runs on the normalised form of the name, so punctuation and
   * spacing stop mattering — "spiderman", "spider man" and "Spider-Man" all
   * reduce to the same string. Trigram similarity then catches queries that are
   * genuinely misspelled rather than merely punctuated differently.
   *
   * Results are ranked in tiers so an exact prefix always outranks a fuzzy hit:
   * typing "ali" should lead with "Alice in Borderland", not with whatever
   * happens to share three letters.
   */
  async search(rawQuery: string, limit = MAX_RESULTS): Promise<SearchResults> {
    const query = rawQuery.trim();
    const needle = normalizeSearch(query);
    if (needle.length < MIN_SEARCH_LENGTH) return { query, titles: [], channels: [] };

    const [titles, channels] = await Promise.all([
      this.searchTitles(needle, limit),
      this.searchChannels(needle, limit),
    ]);

    return { query, titles, channels };
  }

  private async searchTitles(needle: string, limit: number): Promise<TitleCard[]> {
    const ranked = await this.prisma.$queryRaw<Ranked[]>`
      SELECT id,
             CASE
               WHEN "searchText" LIKE ${needle + '%'} THEN 0
               WHEN "searchText" LIKE ${'%' + needle + '%'} THEN 1
               ELSE 2
             END AS rank,
             similarity("searchText", ${needle}) AS sim
      FROM "Title"
      WHERE "isPublished"
        AND ("searchText" LIKE ${'%' + needle + '%'}
             OR similarity("searchText", ${needle}) > ${SIMILARITY_FLOOR})
      ORDER BY rank ASC, sim DESC, "publishedAt" DESC NULLS LAST
      LIMIT ${limit}
    `;
    if (ranked.length === 0) return [];

    // The ranking query returns ids; the rows come back through the shared
    // select so a search result is shaped exactly like every other card.
    const rows = await this.prisma.title.findMany({
      where: { id: { in: ranked.map((r) => r.id) } },
      select: titleCardSelect,
    });

    const order = new Map(ranked.map((r, index) => [r.id, index]));
    return rows
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
      .map(toTitleCard);
  }

  private async searchChannels(needle: string, limit: number): Promise<Channel[]> {
    const ranked = await this.prisma.$queryRaw<Ranked[]>`
      SELECT id,
             CASE WHEN "searchText" LIKE ${needle + '%'} THEN 0 ELSE 1 END AS rank,
             similarity("searchText", ${needle}) AS sim
      FROM "Channel"
      WHERE "isPublished"
        AND ("searchText" LIKE ${'%' + needle + '%'}
             OR similarity("searchText", ${needle}) > ${SIMILARITY_FLOOR})
      ORDER BY rank ASC, sim DESC
      LIMIT ${limit}
    `;
    if (ranked.length === 0) return [];

    // Channels carry now/next, which only ChannelsService assembles.
    const all = await this.channels.listWithNowNext();
    const order = new Map(ranked.map((r, index) => [r.id, index]));
    return all
      .filter((channel) => order.has(channel.id))
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }
}
