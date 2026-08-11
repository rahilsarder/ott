import { z } from 'zod';

export const MAX_PROFILES_PER_ACCOUNT = 5;

export const AVATAR_KEYS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'teal', 'pink'] as const;
export const avatarKeySchema = z.enum(AVATAR_KEYS);
export type AvatarKey = z.infer<typeof avatarKeySchema>;

export const createProfileSchema = z.object({
  name: z.string().min(1).max(24).trim(),
  avatarKey: avatarKeySchema.default('red'),
  isKids: z.boolean().default(false),
});
export type CreateProfileInput = z.infer<typeof createProfileSchema>;

export const updateProfileSchema = createProfileSchema.partial();
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export interface Profile {
  id: string;
  name: string;
  avatarKey: AvatarKey;
  isKids: boolean;
  createdAt: string;
}
