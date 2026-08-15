import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

/**
 * Creates just the admin login — no demo genres/titles/channels/EPG. For use
 * when a real catalog dump (ops/data/catalog-seed.dump) is being restored
 * instead of the sample data seed() creates; running both would leave demo
 * titles mixed into a real catalog and collide on the shared genre slugs.
 */
async function main(): Promise<void> {
  console.log('Seeding admin only…');

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

  console.log(`Seeded. Admin login: ${email} / ${password}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
