import { z } from 'zod';
import { CurrencyEnum } from './user_settings.schema';

export const walletSchema = z.object({
  _id: z.string(),
  _rev: z.string().optional(),
  type: z.literal('wallet'),
  userId: z.string(),
  name: z.string().min(1, 'Wallet name is required').max(50, 'Wallet name is too long'),
  currency: CurrencyEnum,
  initialBalance: z.number().default(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createWalletSchema = walletSchema.pick({
  name: true,
  currency: true,
  initialBalance: true,
});

export const updateWalletSchema = walletSchema.pick({
  name: true,
  currency: true,
  initialBalance: true,
}).partial();

export type Wallet = z.infer<typeof walletSchema>;
export type CreateWallet = z.infer<typeof createWalletSchema>;
export type UpdateWallet = z.infer<typeof updateWalletSchema>;
