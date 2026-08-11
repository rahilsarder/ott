import { Injectable, NotFoundException } from '@nestjs/common';
import type { Channel, ChannelGroup, Guide, GuideQuery, Programme } from '@ott/shared';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class ChannelsService {
  constructor(private readonly prisma: PrismaService) {}

  async listGrouped(): Promise<ChannelGroup[]> {
    const channels = await this.listWithNowNext();
    const groups = new Map<string, Channel[]>();
    for (const channel of channels) {
      const bucket = groups.get(channel.category) ?? [];
      bucket.push(channel);
      groups.set(channel.category, bucket);
    }
    return [...groups.entries()]
      .map(([category, list]) => ({ category, channels: list }))
      .sort((a, b) => a.category.localeCompare(b.category));
  }

  async listWithNowNext(): Promise<Channel[]> {
    const now = new Date();
    const rows = await this.prisma.channel.findMany({
      where: { isPublished: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        // Two programmes from "now" onwards covers both the current and next slot.
        programmes: { where: { endsAt: { gt: now } }, orderBy: { startsAt: 'asc' }, take: 2 },
      },
    });

    return rows.map((row) => {
      const current = row.programmes.find((p) => p.startsAt <= now && p.endsAt > now) ?? null;
      const next = row.programmes.find((p) => p.startsAt > now) ?? null;
      return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: row.description,
        category: row.category,
        logoUrl: row.logoUrl,
        hasDvr: row.hasDvr,
        sortOrder: row.sortOrder,
        now: current ? toProgramme(current) : null,
        next: next ? toProgramme(next) : null,
      };
    });
  }

  async bySlug(slug: string): Promise<Channel> {
    const all = await this.listWithNowNext();
    const found = all.find((c) => c.slug === slug || c.id === slug);
    if (!found) throw new NotFoundException('Channel not found');
    return found;
  }

  async guide(query: GuideQuery): Promise<Guide> {
    const from = query.from ?? new Date();
    const to = new Date(from.getTime() + query.hours * 3600_000);

    const rows = await this.prisma.channel.findMany({
      where: { isPublished: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        programmes: {
          where: { endsAt: { gt: from }, startsAt: { lt: to } },
          orderBy: { startsAt: 'asc' },
        },
      },
    });

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      rows: rows.map((row) => ({
        channel: {
          id: row.id,
          slug: row.slug,
          name: row.name,
          description: row.description,
          category: row.category,
          logoUrl: row.logoUrl,
          hasDvr: row.hasDvr,
          sortOrder: row.sortOrder,
        },
        programmes: row.programmes.map(toProgramme),
      })),
    };
  }
}

function toProgramme(row: {
  id: string;
  title: string;
  description: string;
  startsAt: Date;
  endsAt: Date;
}): Programme {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
  };
}
