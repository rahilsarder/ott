import { z } from 'zod';
import type { AuthUser } from './auth';

export const deviceApproveSchema = z.object({
  userCode: z.string().length(8),
});
export type DeviceApproveInput = z.infer<typeof deviceApproveSchema>;

export const deviceDenySchema = z.object({
  userCode: z.string().length(8),
});
export type DeviceDenyInput = z.infer<typeof deviceDenySchema>;

export const devicePollSchema = z.object({
  deviceCode: z.string().min(20),
});
export type DevicePollInput = z.infer<typeof devicePollSchema>;

export interface DeviceStartResponse {
  userCode: string;
  deviceCode: string;
  verificationUrl: string;
  verificationUrlComplete: string;
  /** Seconds until the pairing request expires. */
  expiresIn: number;
  /** Minimum seconds a poller must wait between polls. */
  interval: number;
}

export interface DeviceVerifyResponse {
  valid: boolean;
}

export type DevicePollResponse =
  | { status: 'pending' }
  | { status: 'slow_down' }
  | { status: 'denied' }
  | { status: 'expired' }
  | { status: 'approved'; accessToken: string; refreshToken: string; expiresIn: number; user: AuthUser };
