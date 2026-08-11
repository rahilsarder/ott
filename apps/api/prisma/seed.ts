import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const GENRES = [
  { slug: 'action', name: 'Action' },
  { slug: 'drama', name: 'Drama' },
  { slug: 'comedy', name: 'Comedy' },
  { slug: 'documentary', name: 'Documentary' },
  { slug: 'sci-fi', name: 'Sci-Fi' },
  { slug: 'thriller', name: 'Thriller' },
];

/**
 * Sample catalog. `streamPath` values point at whatever streams exist on the
 * configured Flussonic server — replace them in the admin UI once real content
 * is published. Artwork uses picsum.photos so the UI has something to render
 * before any images are uploaded.
 */
const TITLES = [
  { slug: 'northern-lights', name: 'Northern Lights', year: 2024, genres: ['drama'], rating: 'TV_14' as const },
  { slug: 'deep-current', name: 'Deep Current', year: 2023, genres: ['thriller', 'drama'], rating: 'R' as const },
  { slug: 'orbital', name: 'Orbital', year: 2025, genres: ['sci-fi', 'action'], rating: 'PG_13' as const },
  { slug: 'the-long-road', name: 'The Long Road', year: 2022, genres: ['drama'], rating: 'PG' as const },
  { slug: 'city-of-glass', name: 'City of Glass', year: 2024, genres: ['thriller'], rating: 'TV_MA' as const },
  { slug: 'wild-coast', name: 'Wild Coast', year: 2023, genres: ['documentary'], rating: 'TV_G' as const },
  { slug: 'second-take', name: 'Second Take', year: 2025, genres: ['comedy'], rating: 'TV_PG' as const },
  { slug: 'iron-season', name: 'Iron Season', year: 2024, genres: ['action'], rating: 'TV_14' as const },
];

const SERIES = [
  {
    slug: 'the-signal',
    name: 'The Signal',
    year: 2024,
    genres: ['sci-fi', 'thriller'],
    rating: 'TV_MA' as const,
    seasons: [
      { number: 1, episodes: ['Carrier Wave', 'Static', 'Handshake', 'Downlink'] },
      { number: 2, episodes: ['Uplink', 'Interference'] },
    ],
  },
  {
    slug: 'kitchen-table',
    name: 'Kitchen Table',
    year: 2023,
    genres: ['comedy', 'drama'],
    rating: 'TV_PG' as const,
    seasons: [{ number: 1, episodes: ['Sunday', 'Monday', 'Tuesday'] }],
  },
];

const CHANNELS = [
  { slug: 'news-24', name: 'News 24', category: 'News', streamPath: 'news24', sortOrder: 1 },
  { slug: 'sports-one', name: 'Sports One', category: 'Sports', streamPath: 'sports1', sortOrder: 2 },
  { slug: 'cine-max', name: 'CineMax', category: 'Movies', streamPath: 'cinemax', sortOrder: 3 },
  { slug: 'kids-zone', name: 'Kids Zone', category: 'Kids', streamPath: 'kidszone', sortOrder: 4 },
];

const img = (seed: string, w: number, h: number) => `https://picsum.photos/seed/${seed}/${w}/${h}`;

async function main(): Promise<void> {
  console.log('Seeding…');

  const genres = new Map<string, string>();
  for (const g of GENRES) {
    const row = await prisma.genre.upsert({ where: { slug: g.slug }, create: g, update: { name: g.name } });
    genres.set(g.slug, row.id);
  }

  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@ott.local';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'changeme123';
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  const admin = await prisma.user.upsert({
    where: { email },
    create: { email, name: 'Admin', passwordHash, role: 'ADMIN' },
    update: { role: 'ADMIN' },
  });

  if ((await prisma.profile.count({ where: { userId: admin.id } })) === 0) {
    await prisma.profile.createMany({
      data: [
        { userId: admin.id, name: 'Admin', avatarKey: 'red' },
        { userId: admin.id, name: 'Kids', avatarKey: 'yellow', isKids: true },
      ],
    });
  }

  for (const [index, t] of TITLES.entries()) {
    await prisma.title.upsert({
      where: { slug: t.slug },
      update: {},
      create: {
        type: 'MOVIE',
        slug: t.slug,
        name: t.name,
        synopsis: `${t.name} — sample catalog entry created by the seed script. Replace this synopsis from the admin UI.`,
        year: t.year,
        rating: t.rating,
        durationSec: 5400 + index * 180,
        posterUrl: img(`${t.slug}-p`, 500, 750),
        backdropUrl: img(`${t.slug}-b`, 1920, 1080),
        streamPath: process.env.SEED_VOD_STREAM ?? 'vod/sample.mp4',
        isPublished: true,
        publishedAt: new Date(Date.now() - index * 86_400_000),
        genres: { create: t.genres.map((slug) => ({ genreId: genres.get(slug)! })) },
      },
    });
  }

  for (const s of SERIES) {
    const existing = await prisma.title.findUnique({ where: { slug: s.slug } });
    if (existing) continue;

    const title = await prisma.title.create({
      data: {
        type: 'SERIES',
        slug: s.slug,
        name: s.name,
        synopsis: `${s.name} — sample series created by the seed script.`,
        year: s.year,
        rating: s.rating,
        posterUrl: img(`${s.slug}-p`, 500, 750),
        backdropUrl: img(`${s.slug}-b`, 1920, 1080),
        isPublished: true,
        publishedAt: new Date(),
        genres: { create: s.genres.map((slug) => ({ genreId: genres.get(slug)! })) },
      },
    });

    for (const season of s.seasons) {
      const seasonRow = await prisma.season.create({
        data: { titleId: title.id, number: season.number, name: `Season ${season.number}` },
      });
      for (const [i, name] of season.episodes.entries()) {
        await prisma.episode.create({
          data: {
            titleId: title.id,
            seasonId: seasonRow.id,
            number: i + 1,
            name,
            synopsis: `${name} — sample episode.`,
            stillUrl: img(`${s.slug}-${season.number}-${i}`, 640, 360),
            durationSec: 2700,
            streamPath: process.env.SEED_VOD_STREAM ?? 'vod/sample.mp4',
          },
        });
      }
    }
  }

  for (const c of CHANNELS) {
    await prisma.channel.upsert({
      where: { slug: c.slug },
      update: {},
      create: {
        ...c,
        description: `${c.name} sample channel. Point streamPath at a real Flussonic stream from the admin UI.`,
        logoUrl: img(`${c.slug}-logo`, 300, 300),
        isPublished: true,
      },
    });
  }

  // A day of half-hour EPG slots so the guide and Live rail have something to show.
  const newsChannel = await prisma.channel.findUnique({ where: { slug: 'news-24' } });
  if (newsChannel && (await prisma.programme.count({ where: { channelId: newsChannel.id } })) === 0) {
    const slotStart = new Date();
    slotStart.setMinutes(slotStart.getMinutes() < 30 ? 0 : 30, 0, 0);
    await prisma.programme.createMany({
      data: Array.from({ length: 48 }, (_, i) => {
        const startsAt = new Date(slotStart.getTime() + i * 1800_000);
        return {
          channelId: newsChannel.id,
          title: i % 2 === 0 ? 'News Hour' : 'World Report',
          description: 'Rolling coverage from around the world.',
          startsAt,
          endsAt: new Date(startsAt.getTime() + 1800_000),
        };
      }),
      skipDuplicates: true,
    });
  }

  console.log(`Seeded. Admin login: ${email} / ${password}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
