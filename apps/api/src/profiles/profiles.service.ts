import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  MAX_PROFILES_PER_ACCOUNT,
  type AvatarKey,
  type CreateProfileInput,
  type Profile,
  type UpdateProfileInput,
} from '@ott/shared';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<Profile[]> {
    const rows = await this.prisma.profile.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
    return rows.map(toProfile);
  }

  async create(userId: string, input: CreateProfileInput): Promise<Profile> {
    const count = await this.prisma.profile.count({ where: { userId } });
    if (count >= MAX_PROFILES_PER_ACCOUNT) {
      throw new BadRequestException(`An account can have at most ${MAX_PROFILES_PER_ACCOUNT} profiles`);
    }
    const existing = await this.prisma.profile.findFirst({ where: { userId, name: input.name } });
    if (existing) throw new BadRequestException('A profile with that name already exists');

    const row = await this.prisma.profile.create({ data: { ...input, userId } });
    return toProfile(row);
  }

  async update(userId: string, profileId: string, input: UpdateProfileInput): Promise<Profile> {
    await this.assertOwned(userId, profileId);
    const row = await this.prisma.profile.update({ where: { id: profileId }, data: input });
    return toProfile(row);
  }

  async remove(userId: string, profileId: string): Promise<void> {
    await this.assertOwned(userId, profileId);
    const count = await this.prisma.profile.count({ where: { userId } });
    if (count <= 1) throw new BadRequestException('An account must keep at least one profile');
    await this.prisma.profile.delete({ where: { id: profileId } });
  }

  /** Throws unless the profile exists and belongs to the user. Every profile-scoped route calls this. */
  async assertOwned(userId: string, profileId: string): Promise<void> {
    const row = await this.prisma.profile.findFirst({ where: { id: profileId, userId }, select: { id: true } });
    if (!row) throw new NotFoundException('Profile not found');
  }
}

function toProfile(row: {
  id: string;
  name: string;
  avatarKey: string;
  isKids: boolean;
  createdAt: Date;
}): Profile {
  return {
    id: row.id,
    name: row.name,
    avatarKey: row.avatarKey as AvatarKey,
    isKids: row.isKids,
    createdAt: row.createdAt.toISOString(),
  };
}
